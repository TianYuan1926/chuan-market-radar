import {
  buildDailyMoverBacktestCandidates,
  buildDailyMoverCalibrationFeedback,
} from "../api/daily-mover-readonly";
import { isCronRequestAuthorized } from "../api/cron-auth";
import { createPublicExchangeOhlcvProvider } from "./ohlcv/public-exchange-provider";
import type { OhlcvProvider } from "./ohlcv/types";
import type { PersistenceEnv, PersistenceRepository } from "../persistence/persistence-store";
import {
  buildDailyMoverKlineBacktestPlan,
  type DailyMoverKlineBacktestPlan,
} from "./daily-mover-kline-backtest";
import {
  runDailyMoverKlineCacheFill,
  type DailyMoverKlineCacheFillResult,
  type RunDailyMoverKlineCacheFillOptions,
} from "./daily-mover-kline-cache-fill";

export type AdminDailyMoverKlineCacheFillError =
  | "kline_cache_fill_failed"
  | "kline_cache_secret_missing"
  | "unauthorized";

export type AdminDailyMoverKlineCacheFillResponse = {
  body: AdminDailyMoverKlineCacheFillResponseBody;
  status: number;
};

export type AdminDailyMoverKlineCacheFillResponseBody =
  | {
      ok: true;
      fill: DailyMoverKlineCacheFillResult;
      plan: {
        estimatedRequestCount: number;
        status: DailyMoverKlineBacktestPlan["status"];
      };
      scope: string;
      storage: PersistenceRepository["mode"];
    }
  | {
      ok: false;
      detail: string;
      error: AdminDailyMoverKlineCacheFillError;
    };

export type BuildDailyMoverKlineBacktestPlanFromRepositoryOptions = {
  dailyRequestBudget?: number;
  maxSymbolsPerRun?: number;
  repository: PersistenceRepository;
};

export type RunAdminDailyMoverKlineCacheFillOptions = {
  authorization?: string | null;
  buildPlan?: (options: BuildDailyMoverKlineBacktestPlanFromRepositoryOptions) => Promise<DailyMoverKlineBacktestPlan>;
  env?: PersistenceEnv;
  fill?: (options: RunDailyMoverKlineCacheFillOptions) => Promise<DailyMoverKlineCacheFillResult>;
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
  body: Extract<AdminDailyMoverKlineCacheFillResponseBody, { ok: false }>,
): AdminDailyMoverKlineCacheFillResponse {
  return {
    body,
    status,
  };
}

function fillFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown kline cache fill error";
}

export async function buildDailyMoverKlineBacktestPlanFromRepository({
  dailyRequestBudget,
  maxSymbolsPerRun,
  repository,
}: BuildDailyMoverKlineBacktestPlanFromRepositoryOptions): Promise<DailyMoverKlineBacktestPlan> {
  const [journalEvents, snapshots] = await Promise.all([
    repository.listJournalEvents(80),
    repository.listDailyMoverSnapshots(30),
  ]);
  const calibrationFeedback = buildDailyMoverCalibrationFeedback(journalEvents);
  const backtestCandidates = buildDailyMoverBacktestCandidates(calibrationFeedback);

  return buildDailyMoverKlineBacktestPlan({
    candidates: backtestCandidates,
    dailyRequestBudget,
    maxSymbolsPerRun,
    snapshots,
  });
}

export async function runAdminDailyMoverKlineCacheFill({
  authorization,
  buildPlan = buildDailyMoverKlineBacktestPlanFromRepository,
  env = {},
  fill = runDailyMoverKlineCacheFill,
  ohlcvProvider = createPublicExchangeOhlcvProvider(),
  repository,
}: RunAdminDailyMoverKlineCacheFillOptions): Promise<AdminDailyMoverKlineCacheFillResponse> {
  if (!env.CRON_SECRET?.trim()) {
    return errorResponse(503, {
      ok: false,
      detail: "Set CRON_SECRET before enabling the K line cache fill endpoint.",
      error: "kline_cache_secret_missing",
    });
  }

  if (!isCronRequestAuthorized(authorization ?? null, env, { requireSecret: true })) {
    return errorResponse(401, {
      ok: false,
      detail: "The K line cache fill request must include the correct Bearer token.",
      error: "unauthorized",
    });
  }

  try {
    const plan = await buildPlan({
      dailyRequestBudget: numberFromEnv(env.KLINE_BACKTEST_DAILY_REQUEST_BUDGET, 12),
      maxSymbolsPerRun: numberFromEnv(env.KLINE_BACKTEST_MAX_SYMBOLS_PER_RUN, 2),
      repository,
    });
    const fillResult = await fill({
      ohlcvProvider,
      plan,
      repository,
    });

    return {
      body: {
        ok: true,
        fill: fillResult,
        plan: {
          estimatedRequestCount: plan.estimatedRequestCount,
          status: plan.status,
        },
        scope: repository.scope,
        storage: repository.mode,
      },
      status: 200,
    };
  } catch (error) {
    return errorResponse(500, {
      ok: false,
      detail: fillFailureMessage(error),
      error: "kline_cache_fill_failed",
    });
  }
}
