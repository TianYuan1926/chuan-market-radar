#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import pg from "./pg-client.mjs";
import {
  AUTHORIZED_SOURCE_COMMIT,
  MIGRATION_LOGIN_ROLE,
  MIGRATION_OWNER_ROLE,
  PRODUCTION_WORKTREE,
  RunnerPolicyError,
  assertOutsideProductionWorktree,
  assertSecureFile,
  auditRecord,
  findRepositoryRoot,
  gitSnapshot,
  hashIdentity,
  loadAndValidateArtifact,
  loadWorktreeGuardSnapshot,
  redact,
  splitRoleBootstrapMigration,
  splitSchemaOwnerTransition,
  validateConfirmation,
  validateRequest,
  validateRoleIdentity,
} from "./runner-core.mjs";

const supportedCommands = new Set([
  "plan",
  "preflight",
  "dry-run",
  "execute",
  "verify",
  "status",
  "resume",
  "abort-before-execute",
]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      throw new RunnerPolicyError("argument_invalid", value);
    }
    const key = value.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }

  return { command, options };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(redact(value), null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

function statePath(stateDirectory, request) {
  return join(stateDirectory, `${request.migrationReleaseId}.json`);
}

async function readConnectionString(filePath) {
  if (!filePath) {
    throw new RunnerPolicyError("connection_file_missing");
  }
  await assertSecureFile(filePath);
  const connectionString = (await readFile(filePath, "utf8")).trim();
  if (!connectionString) {
    throw new RunnerPolicyError("connection_file_empty");
  }
  return connectionString;
}

async function withClient(filePath, applicationName, operation) {
  const connectionString = await readConnectionString(filePath);
  const client = new pg.Client({
    application_name: applicationName,
    connectionString,
  });

  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function readIdentity(client) {
  const result = await client.query(
    `SELECT current_user AS role_name,
      rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
      rolreplication, rolbypassrls, rolinherit
     FROM pg_roles
     WHERE rolname = current_user`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new RunnerPolicyError("current_identity_missing");
  }

  return {
    roleHash: hashIdentity(row.role_name),
    rolbypassrls: row.rolbypassrls,
    rolcanlogin: row.rolcanlogin,
    rolcreatedb: row.rolcreatedb,
    rolcreaterole: row.rolcreaterole,
    rolinherit: row.rolinherit,
    rolreplication: row.rolreplication,
    rolsuper: row.rolsuper,
  };
}

async function readDatabaseBoundary(client) {
  const result = await client.query(
    `SELECT
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'candidate_authority') AS candidate_schema_present,
      COALESCE((SELECT count(*)::int FROM candidate_authority.schema_migrations), 0) AS migration_rows`,
  ).catch(async (error) => {
    if (error?.code !== "42P01" && error?.code !== "3F000") {
      throw error;
    }
    const fallback = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'candidate_authority') AS candidate_schema_present",
    );
    return { rows: [{ ...fallback.rows[0], migration_rows: 0 }] };
  });

  return {
    candidateSchemaPresent: result.rows[0]?.candidate_schema_present === true,
    migrationRegistryRows: Number(result.rows[0]?.migration_rows ?? 0),
  };
}

async function verifyOwnerMembership(client) {
  const result = await client.query(
    "SELECT pg_has_role(current_user, $1, 'MEMBER') AS owner_member",
    [MIGRATION_OWNER_ROLE],
  );
  return result.rows[0]?.owner_member === true;
}

async function verifyIdentities(options) {
  const verification = {};

  if (options["application-connection-file"]) {
    verification.application = await withClient(
      options["application-connection-file"],
      "market-radar-identity-verify-application",
      async (client) => {
        const identity = await readIdentity(client);
        validateRoleIdentity(identity, "application");
        return { ...identity, runnerUseRejected: true };
      },
    );
  }

  if (options["migration-connection-file"]) {
    verification.migration = await withClient(
      options["migration-connection-file"],
      "market-radar-identity-verify-migration",
      async (client) => {
        const identity = await readIdentity(client);
        validateRoleIdentity(identity, "migration");
        return {
          ...identity,
          ownerMembership: await verifyOwnerMembership(client),
          ...(await readDatabaseBoundary(client)),
        };
      },
    );
  }

  if (options["break-glass-connection-file"]) {
    verification.breakGlass = await withClient(
      options["break-glass-connection-file"],
      "market-radar-identity-verify-break-glass",
      async (client) => {
        const identity = await readIdentity(client);
        validateRoleIdentity(identity, "break_glass");
        return identity;
      },
    );
  }

  return verification;
}

function catalogFingerprintSql() {
  return `SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', table_schema,
        'table', table_name,
        'ordinal', ordinal_position,
        'column', column_name,
        'type', data_type,
        'nullable', is_nullable,
        'default', column_default
      ) ORDER BY table_schema, table_name, ordinal_position
    ),
    '[]'::jsonb
  ) AS catalog
  FROM information_schema.columns
  WHERE table_schema = 'candidate_authority'`;
}

async function fingerprint(client) {
  const result = await client.query(catalogFingerprintSql());
  return hashIdentity(JSON.stringify(result.rows[0]?.catalog ?? []));
}

async function ledgerRow(client, version) {
  const exists = await client.query(
    "SELECT to_regclass('candidate_authority.schema_migrations') IS NOT NULL AS exists",
  );
  if (!exists.rows[0]?.exists) {
    return null;
  }
  const result = await client.query(
    `SELECT version, checksum, status
     FROM candidate_authority.schema_migrations
     WHERE version = $1`,
    [version],
  );
  return result.rows[0] ?? null;
}

async function schemaOwnedByMigrationOwner(client) {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT 1
      FROM pg_namespace n
      JOIN pg_roles r ON r.oid = n.nspowner
      WHERE n.nspname = 'candidate_authority' AND r.rolname = $1
    ) AS owned`,
    [MIGRATION_OWNER_ROLE],
  );
  return result.rows[0]?.owned === true;
}

async function executeRoleBootstrap({ artifact, breakGlassFile, request }) {
  const roleFile = artifact.files.find((file) => file.filename.startsWith("007_"));
  const { roleBootstrapSql } = splitRoleBootstrapMigration(roleFile.sql);

  return withClient(
    breakGlassFile,
    "market-radar-wp-g0-2-role-bootstrap",
    async (client) => {
      const identity = await readIdentity(client);
      validateRoleIdentity(identity, "break_glass");
      await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('lock_timeout', $1, true)", [request.lockTimeout]);
        await client.query("SELECT set_config('statement_timeout', $1, true)", [request.statementTimeout]);
        await client.query(roleBootstrapSql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }

      return {
        executed: true,
        roleBootstrapChecksum: artifact.roleBootstrap.roleBootstrapChecksum,
      };
    },
  );
}

async function insertLedger(client, {
  appliedByRole,
  checksum,
  durationMs,
  fromFingerprint,
  request,
  toFingerprint,
  version,
}) {
  await client.query(
    `INSERT INTO candidate_authority.schema_migrations (
      version, checksum, from_schema_fingerprint, to_schema_fingerprint,
      release_id, approval_ref, applied_at, applied_by_role, duration_ms, status
    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, 'applied')`,
    [
      version,
      checksum,
      fromFingerprint,
      toFingerprint,
      request.migrationReleaseId,
      request.approvalRef,
      appliedByRole,
      durationMs,
    ],
  );
}

async function executeSchemaMigrations({ artifact, migrationFile, request }) {
  return withClient(
    migrationFile,
    "market-radar-wp-g0-2-schema-migration",
    async (client) => {
      const identity = await readIdentity(client);
      validateRoleIdentity(identity, "migration");
      if (!(await verifyOwnerMembership(client))) {
        throw new RunnerPolicyError("migration_owner_membership_missing");
      }

      await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
        `wp-g0.2-candidate-migrations:${request.manifestHash}`,
      ]);

      const applied = [];
      const skipped = [];
      let ownerTransitionApplied = await schemaOwnedByMigrationOwner(client);

      try {
        for (const file of artifact.files) {
          if (ownerTransitionApplied) {
            await client.query(`SET ROLE ${MIGRATION_OWNER_ROLE}`);
          }
          const version = file.filename.replace(/\.sql$/, "");
          const existing = await ledgerRow(client, version);
          if (existing) {
            if (existing.checksum !== file.checksum || existing.status !== "applied") {
              throw new RunnerPolicyError("migration_registry_conflict", version);
            }
            skipped.push(version);
            continue;
          }

          const startedAt = Date.now();
          const fromFingerprint = await fingerprint(client);
          const roleSplit = file.filename.startsWith("007_")
            ? splitRoleBootstrapMigration(file.sql)
            : null;

          await client.query("BEGIN");
          try {
            await client.query("SELECT set_config('lock_timeout', $1, true)", [request.lockTimeout]);
            await client.query("SELECT set_config('statement_timeout', $1, true)", [request.statementTimeout]);
            await client.query("SELECT set_config('idle_in_transaction_session_timeout', '60s', true)");
            if (roleSplit) {
              const ownerTransition = splitSchemaOwnerTransition(roleSplit.schemaMigrationSql);
              await client.query(ownerTransition.beforeOwnerSql);
              const toFingerprint = await fingerprint(client);
              const role = await client.query("SELECT current_user AS role_name");
              await insertLedger(client, {
                appliedByRole: role.rows[0]?.role_name ?? MIGRATION_LOGIN_ROLE,
                checksum: file.checksum,
                durationMs: Math.max(0, Date.now() - startedAt),
                fromFingerprint,
                request,
                toFingerprint,
                version,
              });
              await client.query(ownerTransition.schemaOwnerSql);
              await client.query(`SET LOCAL ROLE ${MIGRATION_OWNER_ROLE}`);
              await client.query(
                `GRANT USAGE, CREATE ON SCHEMA candidate_authority TO ${MIGRATION_LOGIN_ROLE}`,
              );
              await client.query("RESET ROLE");
              await client.query(ownerTransition.ownerRoleSql);
              await client.query(`SET LOCAL ROLE ${MIGRATION_OWNER_ROLE}`);
            } else {
              await client.query(file.sql);
              if (ownerTransitionApplied) {
                await client.query(`SET LOCAL ROLE ${MIGRATION_OWNER_ROLE}`);
              }
              const toFingerprint = await fingerprint(client);
              const role = await client.query("SELECT current_user AS role_name");
              await insertLedger(client, {
                appliedByRole: role.rows[0]?.role_name ?? MIGRATION_LOGIN_ROLE,
                checksum: file.checksum,
                durationMs: Math.max(0, Date.now() - startedAt),
                fromFingerprint,
                request,
                toFingerprint,
                version,
              });
            }
            if (roleSplit) {
              await client.query(
                `REVOKE USAGE, CREATE ON SCHEMA candidate_authority FROM ${MIGRATION_LOGIN_ROLE}`,
              );
            }
            await client.query("COMMIT");
            applied.push(version);
            if (file.filename.startsWith("007_")) {
              ownerTransitionApplied = true;
            }
          } catch (error) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw error;
          } finally {
            await client.query("RESET ROLE").catch(() => undefined);
          }
        }
      } finally {
        await client.query("RESET ROLE").catch(() => undefined);
        await client
          .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
            `wp-g0.2-candidate-migrations:${request.manifestHash}`,
          ])
          .catch(() => undefined);
      }

      return { applied, skipped };
    },
  );
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!supportedCommands.has(command)) {
    throw new RunnerPolicyError("command_unsupported");
  }
  if (!options.request || !options["state-dir"]) {
    throw new RunnerPolicyError("request_or_state_dir_missing");
  }

  const request = validateRequest(await readJson(resolve(options.request)));
  const stateDirectory = resolve(options["state-dir"]);
  await mkdir(stateDirectory, { mode: 0o700, recursive: true });
  await assertOutsideProductionWorktree({
    cwd: options.cwd ? resolve(options.cwd) : process.cwd(),
    productionWorktree: options.worktree ?? PRODUCTION_WORKTREE,
  });

  const currentStatePath = statePath(stateDirectory, request);
  if (command === "status") {
    const state = await readJson(currentStatePath);
    process.stdout.write(`${JSON.stringify(redact(state))}\n`);
    return;
  }

  if (command === "resume") {
    const state = await readJson(currentStatePath);
    if (state.executeStarted || state.status === "complete") {
      throw new RunnerPolicyError("resume_requires_manual_audit");
    }
    const record = auditRecord({ command, request, result: { resumable: true }, status: "pass" });
    await writeJsonAtomic(currentStatePath, record);
    process.stdout.write(`${JSON.stringify(record)}\n`);
    return;
  }

  if (command === "abort-before-execute") {
    let existing = {};
    try {
      existing = await readJson(currentStatePath);
    } catch {
      // An absent state is still safe to mark aborted.
    }
    if (existing.executeStarted) {
      throw new RunnerPolicyError("abort_after_execute_forbidden");
    }
    const record = auditRecord({ command, request, result: { aborted: true }, status: "pass" });
    await writeJsonAtomic(currentStatePath, record);
    process.stdout.write(`${JSON.stringify(record)}\n`);
    return;
  }

  const artifactRoot = options["artifact-root"]
    ? resolve(options["artifact-root"])
    : await findRepositoryRoot(import.meta.dirname);
  const artifact = await loadAndValidateArtifact(artifactRoot);
  const worktree = options.worktree ?? PRODUCTION_WORKTREE;
  let worktreeSnapshot = null;

  if (request.targetClass === "production" && options["worktree-guard-file"]) {
    worktreeSnapshot = await loadWorktreeGuardSnapshot(
      resolve(options["worktree-guard-file"]),
      { expectedHead: request.applicationRelease, expectedWorktree: worktree },
    );
  } else {
    try {
      worktreeSnapshot = await gitSnapshot(worktree);
    } catch (error) {
      if (request.targetClass === "production") {
        throw error;
      }
    }
  }
  if (request.targetClass === "production" && !worktreeSnapshot?.clean) {
    throw new RunnerPolicyError("production_worktree_not_clean");
  }

  const baseResult = {
    artifactHash: artifact.artifactHash,
    migrationFileCount: artifact.migrationFileCount,
    productionWorktree: worktreeSnapshot,
    roleBootstrapChecksum: artifact.roleBootstrap.roleBootstrapChecksum,
    migrationLoginSqlChecksum: artifact.roleBootstrap.migrationLoginSqlChecksum,
    ownerRoleSqlChecksum: artifact.roleBootstrap.ownerRoleSqlChecksum,
    schemaRemainderChecksum: artifact.roleBootstrap.schemaRemainderChecksum,
    sourceCommit: AUTHORIZED_SOURCE_COMMIT,
  };

  let result = baseResult;

  if (command === "preflight" || command === "dry-run" || command === "verify") {
    const identities = await verifyIdentities(options);
    if (identities.migration && !identities.migration.ownerMembership) {
      throw new RunnerPolicyError("migration_owner_membership_missing");
    }
    result = {
      ...baseResult,
      candidateMigrationExecuted: false,
      identities,
      schemaChanged: false,
    };
  }

  if (command === "execute") {
    await validateConfirmation({
      confirmationFile: options["confirmation-file"],
      request,
    });
    if (!request.roleBootstrapEnabled && !request.schemaMigrationEnabled) {
      throw new RunnerPolicyError("execute_phase_not_enabled");
    }

    const executeStartedRecord = auditRecord({
      command,
      request,
      result: { executeStarted: true },
      status: "in_progress",
    });
    await writeJsonAtomic(currentStatePath, { ...executeStartedRecord, executeStarted: true });

    const roleBootstrap = request.roleBootstrapEnabled
      ? await executeRoleBootstrap({
          artifact,
          breakGlassFile: options["break-glass-connection-file"],
          request,
        })
      : { executed: false };
    const schemaMigration = request.schemaMigrationEnabled
      ? await executeSchemaMigrations({
          artifact,
          migrationFile: options["migration-connection-file"],
          request,
        })
      : { applied: [], skipped: [] };

    result = { ...baseResult, roleBootstrap, schemaMigration };
  }

  const record = auditRecord({ command, request, result, status: "pass" });
  await writeJsonAtomic(currentStatePath, {
    ...record,
    executeStarted: command === "execute",
    status: command === "execute" ? "complete" : "pass",
  });
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

main().catch((error) => {
  const reason = error instanceof RunnerPolicyError ? error.reason : "runner_internal_error";
  const code = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : null;
  const errorType = typeof error?.name === "string" ? error.name : "unknown";
  const location = typeof error?.stack === "string"
    ? error.stack.split("\n").find((line) => line.includes("migration-runner.mjs"))?.trim() ?? null
    : null;
  const detail = typeof error?.message === "string"
    ? String(redact(error.message)).slice(0, 200)
    : null;
  const safeError = {
    command: basename(process.argv[2] ?? "unknown"),
    code,
    detail,
    errorType,
    location,
    reason,
    status: "fail",
  };
  process.stderr.write(`${JSON.stringify(safeError)}\n`);
  process.exitCode = 1;
});
