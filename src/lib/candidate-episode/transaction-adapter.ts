export type TransactionIsolation =
  | "read committed"
  | "repeatable read"
  | "serializable";

export type TransactionOptions = {
  deferrable?: boolean;
  idleInTransactionTimeoutMs?: number;
  isolation?: TransactionIsolation;
  lockTimeoutMs?: number;
  maxRetries?: 0 | 1 | 2;
  readOnly?: boolean;
  signal?: AbortSignal;
  statementTimeoutMs?: number;
};

export type QueryResult<T> = {
  rows: T[];
};

export type PostgresTransactionConnection = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  release(error?: Error | boolean): void;
};

export type PostgresTransactionPool = {
  connect(): Promise<PostgresTransactionConnection>;
};

export type TransactionContext = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  withSavepoint<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
};

export type PostgresTransactionAdapter = {
  withTransaction<T>(
    options: TransactionOptions,
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T>;
};

export type PostgresTransactionAdapterOptions = {
  role?: string;
};

const retryableTransactionCodes = new Set(["40001", "40P01"]);

function abortError() {
  return new DOMException("WP-G0.2 transaction aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError();
  }
}

function positiveTimeout(value: number | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Transaction timeout must be a positive integer");
  }

  return value;
}

function transactionModeSql(options: TransactionOptions) {
  const isolation = (options.isolation ?? "read committed").toUpperCase();
  const access = options.readOnly ? "READ ONLY" : "READ WRITE";
  const deferrable = options.deferrable ? " DEFERRABLE" : "";

  if (options.deferrable && (isolation !== "SERIALIZABLE" || !options.readOnly)) {
    throw new Error("DEFERRABLE requires a SERIALIZABLE READ ONLY transaction");
  }

  return `SET TRANSACTION ISOLATION LEVEL ${isolation} ${access}${deferrable}`;
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function transactionRoleSql(role: string | undefined) {
  if (role === undefined) return null;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) {
    throw new Error("Invalid PostgreSQL transaction role");
  }
  return `SET LOCAL ROLE "${role}"`;
}

function transactionContext(
  client: PostgresTransactionConnection,
  signal?: AbortSignal,
): TransactionContext {
  let savepoint = 0;
  const context: TransactionContext = {
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      throwIfAborted(signal);
      return client.query<T>(sql, params);
    },
    async withSavepoint<T>(work: (tx: TransactionContext) => Promise<T>) {
      throwIfAborted(signal);
      savepoint += 1;
      const name = `candidate_sp_${savepoint}`;
      await client.query(`SAVEPOINT ${name}`);

      try {
        const result = await work(context);
        throwIfAborted(signal);
        await client.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await client.query(`RELEASE SAVEPOINT ${name}`);
        throw error;
      }
    },
  };

  return context;
}

async function runAttempt<T>(
  pool: PostgresTransactionPool,
  options: TransactionOptions,
  roleSql: string | null,
  work: (tx: TransactionContext) => Promise<T>,
) {
  throwIfAborted(options.signal);
  const client = await pool.connect();
  let releaseError: Error | undefined;

  try {
    throwIfAborted(options.signal);
    await client.query("BEGIN");
    await client.query(transactionModeSql(options));
    if (roleSql) await client.query(roleSql);
    await client.query("SELECT set_config('lock_timeout', $1, true)", [
      `${positiveTimeout(options.lockTimeoutMs, 1_000)}ms`,
    ]);
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      `${positiveTimeout(options.statementTimeoutMs, 30_000)}ms`,
    ]);
    await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [
      `${positiveTimeout(options.idleInTransactionTimeoutMs, 30_000)}ms`,
    ]);
    const result = await work(transactionContext(client, options.signal));
    throwIfAborted(options.signal);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      releaseError = rollbackError instanceof Error ? rollbackError : new Error("rollback failed");
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

export function createPostgresTransactionAdapter(
  pool: PostgresTransactionPool,
  options: PostgresTransactionAdapterOptions = {},
): PostgresTransactionAdapter {
  const roleSql = transactionRoleSql(options.role);
  return {
    async withTransaction<T>(
      options: TransactionOptions,
      work: (tx: TransactionContext) => Promise<T>,
    ) {
      const maxRetries = options.maxRetries ?? 0;

      for (let attempt = 0; ; attempt += 1) {
        try {
          return await runAttempt(pool, options, roleSql, work);
        } catch (error) {
          if (attempt >= maxRetries || !retryableTransactionCodes.has(errorCode(error) ?? "")) {
            throw error;
          }
        }
      }
    },
  };
}

export async function withInstrumentLock<T>(
  tx: Pick<TransactionContext, "query">,
  scope: string,
  canonicalInstrumentId: string,
  work: () => Promise<T>,
) {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `${scope.length}:${scope}|${canonicalInstrumentId}`,
  ]);
  return work();
}
