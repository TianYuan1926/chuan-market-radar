import {
  disabledAiReview,
  reviewSignalWithAi,
  type AiReviewEnv,
  type AiReviewFetch,
} from "../analysis/ai-reviewer";
import { siteConfig } from "../config/site";
import { appPersistenceRepository } from "../persistence/app-repository";
import type { PersistenceRepository } from "../persistence/persistence-store";
import {
  getConfiguredMarketProvider,
  type GetConfiguredMarketProviderOptions,
  type ProviderEnv,
} from "./provider-registry";
import { createReplayFrame, summarizeScanSnapshot } from "./scan-archive";
import { buildScanArchiveBundle } from "./scan-archive-bundle";
import { MemoryScanCache, runScheduledScan } from "./scan-runtime";
import type { MarketDataProvider, MarketRadarSnapshot, ScanArchiveBundle } from "./types";
import { buildUniversePriorityHintsFromRepository } from "./universe-priority-hints";

const scanCache = new MemoryScanCache();
const archiveMaxEntries = 24;

type AiReviewSnapshotOptions = {
  env?: AiReviewEnv;
  fetcher?: AiReviewFetch;
  maxSignals?: number;
  now?: () => Date;
};

type RepositoryAwareMarketProviderOptions = {
  env?: ProviderEnv;
  providerFactory?: (
    env?: ProviderEnv,
    options?: GetConfiguredMarketProviderOptions,
  ) => MarketDataProvider;
  repository?: PersistenceRepository;
};

function archiveBundle(replayId?: string): Promise<ScanArchiveBundle> {
  return buildScanArchiveBundle(appPersistenceRepository, replayId, {
    listLimit: 8,
    maxEntries: archiveMaxEntries,
  });
}

function envFromProcess(): AiReviewEnv {
  return {
    AI_REVIEW_ENABLED: process.env.AI_REVIEW_ENABLED,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_REVIEW_MAX_PROMPT_CHARS: process.env.AI_REVIEW_MAX_PROMPT_CHARS,
    AI_REVIEW_MAX_SIGNALS: process.env.AI_REVIEW_MAX_SIGNALS,
  };
}

function priorityHintNote(summary: Awaited<ReturnType<typeof buildUniversePriorityHintsFromRepository>>["summary"]) {
  return `repository priority hints: ${summary.hintsBuilt} built from ${summary.repositoryMode ?? "unknown"} ` +
    `(archives ${summary.archivesRead}, journal ${summary.journalEventsRead}, movers ${summary.dailyMoverSnapshotsRead})`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown repository priority hint error";
}

export async function buildRepositoryAwareMarketProvider({
  env = process.env,
  providerFactory = getConfiguredMarketProvider,
  repository = appPersistenceRepository,
}: RepositoryAwareMarketProviderOptions = {}): Promise<MarketDataProvider> {
  try {
    const report = await buildUniversePriorityHintsFromRepository(repository);

    return providerFactory(env, {
      universePriorityHintNotes: [priorityHintNote(report.summary)],
      universePriorityHints: report.hints,
    });
  } catch (error) {
    return providerFactory(env, {
      universePriorityHintNotes: [`repository priority hints: unavailable (${errorMessage(error)})`],
      universePriorityHints: [],
    });
  }
}

function reviewLimit(env: AiReviewEnv, explicit?: number) {
  const parsed = Number(explicit ?? env.AI_REVIEW_MAX_SIGNALS ?? 3);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(8, Math.floor(parsed));
}

export async function enrichSnapshotWithAiReviews(
  snapshot: MarketRadarSnapshot,
  options: AiReviewSnapshotOptions = {},
): Promise<MarketRadarSnapshot> {
  if (snapshot.signals.length === 0) {
    return snapshot;
  }

  const env = options.env ?? envFromProcess();
  const enabled = env.AI_REVIEW_ENABLED === "true" && Boolean(env.AI_API_KEY);
  const maxSignals = enabled ? reviewLimit(env, options.maxSignals) : snapshot.signals.length;
  const context = { metadata: snapshot.metadata };
  const signals = await Promise.all(
    snapshot.signals.map(async (signal, index) => {
      if (enabled && index >= maxSignals) {
        return {
          ...signal,
          aiReview: disabledAiReview("AI_REVIEW_MAX_SIGNALS budget guard"),
        };
      }

      return {
        ...signal,
        aiReview: await reviewSignalWithAi({
          signal,
          context,
          env,
          fetcher: options.fetcher,
          now: options.now,
        }),
      };
    }),
  );

  return {
    ...snapshot,
    signals,
  };
}

async function withArchive(snapshot: MarketRadarSnapshot): Promise<MarketRadarSnapshot> {
  const enriched = await enrichSnapshotWithAiReviews(snapshot);

  await appPersistenceRepository.addScanArchive(
    summarizeScanSnapshot(enriched),
    createReplayFrame(enriched),
  );

  return {
    ...enriched,
    archive: await archiveBundle(enriched.metadata.id),
  };
}

export async function getMarketRadarSnapshot(
  provider?: MarketDataProvider,
): Promise<MarketRadarSnapshot> {
  const resolvedProvider = provider ?? await buildRepositoryAwareMarketProvider();
  const result = await runScheduledScan({
    provider: resolvedProvider,
    cache: scanCache,
    now: new Date(),
    cadenceMinutes: siteConfig.scanIntervalMinutes,
  });

  if (!result.snapshot) {
    throw new Error(result.error ?? "market radar snapshot unavailable");
  }

  return withArchive(result.snapshot);
}

export async function refreshMarketRadarSnapshot(
  provider?: MarketDataProvider,
) {
  const resolvedProvider = provider ?? await buildRepositoryAwareMarketProvider();
  const result = await runScheduledScan({
    provider: resolvedProvider,
    cache: scanCache,
    now: new Date(),
    cadenceMinutes: siteConfig.scanIntervalMinutes,
    forceRefresh: true,
  });

  return {
    ...result,
    snapshot: result.snapshot ? await withArchive(result.snapshot) : null,
  };
}

export async function getScanArchive(replayId?: string) {
  const entries = await appPersistenceRepository.listScanArchives(1);

  if (entries.length === 0) {
    await getMarketRadarSnapshot();
  }

  return archiveBundle(replayId);
}
