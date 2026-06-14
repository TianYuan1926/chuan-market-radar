import { parseBaseAssets } from "./provider-registry";
import {
  runCoinGlassDailyMoverIngest,
  type CoinGlassDailyMoverIngestOptions,
  type DailyMoverIngestResult,
} from "./daily-mover-ingest";
import type { PersistenceEnv, PersistenceRepository } from "../persistence/persistence-store";

export type AdminDailyMoverIngestError =
  | "coinglass_unavailable"
  | "daily_mover_ingest_failed"
  | "daily_mover_secret_missing"
  | "unauthorized";

export type AdminDailyMoverIngestResponse = {
  body: AdminDailyMoverIngestResponseBody;
  status: number;
};

export type AdminDailyMoverIngestResponseBody =
  | {
      ok: true;
      ingest: {
        notes: string[];
        rawRowCount: number;
        requestedAssets: string[];
        scope: string;
        snapshotId: string;
        storage: DailyMoverIngestResult["storage"];
      };
    }
  | {
      ok: false;
      detail: string;
      error: AdminDailyMoverIngestError;
    };

export type RunAdminDailyMoverIngestOptions = {
  authorization?: string | null;
  env?: PersistenceEnv;
  ingest?: (options: CoinGlassDailyMoverIngestOptions) => Promise<DailyMoverIngestResult>;
  repository: PersistenceRepository;
};

const defaultMaxAssets = 8;
const defaultLimitPerSide = 10;

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
  body: Extract<AdminDailyMoverIngestResponseBody, { ok: false }>,
): AdminDailyMoverIngestResponse {
  return {
    body,
    status,
  };
}

function ingestFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown daily mover ingest error";
}

export async function runAdminDailyMoverIngest({
  authorization,
  env = {},
  ingest = runCoinGlassDailyMoverIngest,
  repository,
}: RunAdminDailyMoverIngestOptions): Promise<AdminDailyMoverIngestResponse> {
  const expected = expectedAuthorization(env);

  if (!expected) {
    return errorResponse(503, {
      ok: false,
      detail: "Set CRON_SECRET before enabling the daily mover ingest endpoint.",
      error: "daily_mover_secret_missing",
    });
  }

  if (authorization !== expected) {
    return errorResponse(401, {
      ok: false,
      detail: "The daily mover ingest request must include the correct Bearer token.",
      error: "unauthorized",
    });
  }

  const apiKey = env.COINGLASS_API_KEY?.trim();

  if (!apiKey) {
    return errorResponse(503, {
      ok: false,
      detail: "Set COINGLASS_API_KEY before running daily mover ingest.",
      error: "coinglass_unavailable",
    });
  }

  try {
    const result = await ingest({
      apiKey,
      baseAssets: parseBaseAssets(env.COINGLASS_BASE_ASSETS),
      limitPerSide: numberFromEnv(
        env.COINGLASS_DAILY_MOVER_LIMIT_PER_SIDE,
        defaultLimitPerSide,
      ),
      maxAssets: numberFromEnv(
        env.COINGLASS_DAILY_MOVER_MAX_ASSETS,
        defaultMaxAssets,
      ),
      repository,
    });

    return {
      body: {
        ok: true,
        ingest: {
          notes: result.notes,
          rawRowCount: result.rawRowCount,
          requestedAssets: result.requestedAssets,
          scope: result.scope,
          snapshotId: result.snapshot.id,
          storage: result.storage,
        },
      },
      status: 200,
    };
  } catch (error) {
    return errorResponse(500, {
      ok: false,
      detail: ingestFailureMessage(error),
      error: "daily_mover_ingest_failed",
    });
  }
}
