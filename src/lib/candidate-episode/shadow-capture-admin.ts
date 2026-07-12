import { isCronRequestAuthorized } from "../api/cron-auth";
import { appCandidateShadowCaptureComposition } from "./app-shadow-capture-composition";
import type { CandidateShadowCaptureComposition } from "./shadow-capture-composition";
import { ShadowCaptureHardStopError } from "./shadow-capture-consumer";

type ShadowCaptureAdminEnv = Record<string, string | undefined>;

function batchLimit(env: ShadowCaptureAdminEnv) {
  const parsed = Number(env.CANDIDATE_SHADOW_BATCH_LIMIT ?? 50);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 50;
}

export async function runAdminCandidateShadowCapture({
  authorization,
  composition = appCandidateShadowCaptureComposition,
  env = process.env,
  signal,
}: {
  authorization?: string | null;
  composition?: CandidateShadowCaptureComposition;
  env?: ShadowCaptureAdminEnv;
  signal?: AbortSignal;
} = {}) {
  if (!env.CRON_SECRET?.trim()) {
    return {
      body: { ok: false, error: "runtime_secret_missing" } as const,
      status: 503,
    };
  }
  if (!isCronRequestAuthorized(authorization ?? null, env, { requireSecret: true })) {
    return {
      body: { ok: false, error: "unauthorized" } as const,
      status: 401,
    };
  }

  try {
    const result = await composition.runBatch({ limit: batchLimit(env), signal });
    const monitor = await composition.monitor().catch(() => null);
    return {
      body: {
        ok: true,
        mode: result.runtime.mode,
        runtime: result.runtime,
        batch: result.batch,
        metricCounts: result.metrics.reduce<Record<string, number>>((counts, metric) => {
          counts[metric.name] = (counts[metric.name] ?? 0) + metric.value;
          return counts;
        }, {}),
        monitor,
      } as const,
      status: 200,
    };
  } catch (error) {
    if (error instanceof ShadowCaptureHardStopError) {
      return {
        body: {
          ok: false,
          error: "shadow_capture_hard_stop",
          failureClass: error.failureClass,
        } as const,
        status: 503,
      };
    }
    return {
      body: { ok: false, error: "shadow_capture_runtime_failed" } as const,
      status: 503,
    };
  }
}
