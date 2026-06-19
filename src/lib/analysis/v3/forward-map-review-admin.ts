import { createPublicExchangeOhlcvProvider } from "../../market/ohlcv/public-exchange-provider";
import type { OhlcvProvider } from "../../market/ohlcv/types";
import { isCronRequestAuthorized } from "../../api/cron-auth";
import type { PersistenceEnv, PersistenceRepository } from "../../persistence/persistence-store";
import {
  runForwardMapReviewExecutor,
  type ForwardMapReviewExecutorResult,
  type RunForwardMapReviewExecutorOptions,
} from "./forward-map-review-executor";

export type AdminForwardMapReviewError =
  | "forward_map_review_failed"
  | "forward_map_review_secret_missing"
  | "unauthorized";

export type AdminForwardMapReviewResponse = {
  body: AdminForwardMapReviewResponseBody;
  status: number;
};

export type AdminForwardMapReviewResponseBody =
  | {
      ok: true;
      forwardMapReview: ForwardMapReviewExecutorResult;
      scope: string;
      storage: PersistenceRepository["mode"];
    }
  | {
      ok: false;
      detail: string;
      error: AdminForwardMapReviewError;
    };

export type RunAdminForwardMapReviewExecutorOptions = {
  authorization?: string | null;
  env?: PersistenceEnv;
  executor?: (options: RunForwardMapReviewExecutorOptions) => Promise<ForwardMapReviewExecutorResult>;
  ohlcvProvider?: OhlcvProvider;
  repository: PersistenceRepository;
};

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function errorResponse(
  status: number,
  body: Extract<AdminForwardMapReviewResponseBody, { ok: false }>,
): AdminForwardMapReviewResponse {
  return {
    body,
    status,
  };
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown v3 forward map review executor error";
}

export async function runAdminForwardMapReviewExecutor({
  authorization,
  env = {},
  executor = runForwardMapReviewExecutor,
  ohlcvProvider = createPublicExchangeOhlcvProvider(),
  repository,
}: RunAdminForwardMapReviewExecutorOptions): Promise<AdminForwardMapReviewResponse> {
  if (!env.CRON_SECRET?.trim()) {
    return errorResponse(503, {
      ok: false,
      detail: "Set CRON_SECRET before enabling the v3 Forward Map review endpoint.",
      error: "forward_map_review_secret_missing",
    });
  }

  if (!isCronRequestAuthorized(authorization ?? null, env, { requireSecret: true })) {
    return errorResponse(401, {
      ok: false,
      detail: "The v3 Forward Map review request must include the correct Bearer token.",
      error: "unauthorized",
    });
  }

  try {
    const forwardMapReview = await executor({
      limit: numberFromEnv(env.V3_FORWARD_MAP_REVIEW_LIMIT, 80),
      ohlcvProvider,
      repository,
    });

    return {
      body: {
        ok: true,
        forwardMapReview,
        scope: repository.scope,
        storage: repository.mode,
      },
      status: 200,
    };
  } catch (error) {
    return errorResponse(500, {
      ok: false,
      detail: failureMessage(error),
      error: "forward_map_review_failed",
    });
  }
}
