import { createPublicExchangeOhlcvProvider } from "../market/ohlcv/public-exchange-provider";
import type { OhlcvProvider } from "../market/ohlcv/types";
import type { PersistenceEnv, PersistenceRepository } from "../persistence/persistence-store";
import {
  runOutcomeExecutor,
  type OutcomeExecutorResult,
  type RunOutcomeExecutorOptions,
} from "./outcome-executor";

export type AdminOutcomeExecutorError =
  | "outcome_executor_failed"
  | "outcome_executor_secret_missing"
  | "unauthorized";

export type AdminOutcomeExecutorResponse = {
  body: AdminOutcomeExecutorResponseBody;
  status: number;
};

export type AdminOutcomeExecutorResponseBody =
  | {
      ok: true;
      outcomeExecutor: OutcomeExecutorResult;
      scope: string;
      storage: PersistenceRepository["mode"];
    }
  | {
      ok: false;
      detail: string;
      error: AdminOutcomeExecutorError;
    };

export type RunAdminOutcomeExecutorOptions = {
  authorization?: string | null;
  env?: PersistenceEnv;
  executor?: (options: RunOutcomeExecutorOptions) => Promise<OutcomeExecutorResult>;
  ohlcvProvider?: OhlcvProvider;
  repository: PersistenceRepository;
};

function expectedAuthorization(env: PersistenceEnv) {
  const secret = env.CRON_SECRET?.trim();

  return secret ? `Bearer ${secret}` : null;
}

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function errorResponse(
  status: number,
  body: Extract<AdminOutcomeExecutorResponseBody, { ok: false }>,
): AdminOutcomeExecutorResponse {
  return {
    body,
    status,
  };
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown outcome executor error";
}

export async function runAdminOutcomeExecutor({
  authorization,
  env = {},
  executor = runOutcomeExecutor,
  ohlcvProvider = createPublicExchangeOhlcvProvider(),
  repository,
}: RunAdminOutcomeExecutorOptions): Promise<AdminOutcomeExecutorResponse> {
  const expected = expectedAuthorization(env);

  if (!expected) {
    return errorResponse(503, {
      ok: false,
      detail: "Set CRON_SECRET before enabling the outcome executor endpoint.",
      error: "outcome_executor_secret_missing",
    });
  }

  if (authorization !== expected) {
    return errorResponse(401, {
      ok: false,
      detail: "The outcome executor request must include the correct Bearer token.",
      error: "unauthorized",
    });
  }

  try {
    const outcomeExecutor = await executor({
      limit: numberFromEnv(env.OUTCOME_EXECUTOR_EVENT_LIMIT, 80),
      ohlcvProvider,
      repository,
    });

    return {
      body: {
        ok: true,
        outcomeExecutor,
        scope: repository.scope,
        storage: repository.mode,
      },
      status: 200,
    };
  } catch (error) {
    return errorResponse(500, {
      ok: false,
      detail: failureMessage(error),
      error: "outcome_executor_failed",
    });
  }
}
