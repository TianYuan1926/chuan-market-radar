import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { buildAltcoinMacroAnchorInputFromSnapshots } from "./macro-snapshot";
import { buildScanAssetStatesFromCoverage } from "./scan-asset-state";
import { applySignalMaturityToSnapshot, classifySignalMaturity } from "./signal-maturity";
import { createReplayFrame, summarizeScanSnapshot } from "./scan-archive";
import { buildScanArchiveBundle } from "./scan-archive-bundle";
import { createScanCoordinatorFromEnv } from "./scan-coordinator";
import { calculateNextScanAt, MemoryScanCache, runScheduledScan, type ScanCoordinator } from "./scan-runtime";
import type { MarketDataProvider, MarketRadarSnapshot, ScanArchiveBundle } from "./types";
import { buildUniversePriorityHintsFromRepository } from "./universe-priority-hints";

const scanCache = new MemoryScanCache();
const scanCoordinator = createScanCoordinatorFromEnv(process.env);
const archiveMaxEntries = 24;
const devSnapshotPath = join(process.cwd(), ".next", "cache", "chuan-market-radar", "latest-snapshot.json");

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

type SnapshotArchiveOptions = {
  allowRefresh?: boolean;
  coordinator?: ScanCoordinator | null;
  persistArchive?: boolean;
  repository?: PersistenceRepository;
  trigger?: NonNullable<MarketRadarSnapshot["metadata"]["runtime"]>["trigger"];
};

function readonlySnapshotTimeoutMs() {
  const parsed = Number(process.env.READONLY_SNAPSHOT_READ_TIMEOUT_MS);

  if (!Number.isFinite(parsed)) {
    return 1_500;
  }

  return Math.max(300, Math.min(10_000, Math.floor(parsed)));
}

async function withReadonlySnapshotTimeout<T>(
  label: string,
  read: () => Promise<T>,
): Promise<T> {
  const timeoutMs = readonlySnapshotTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      read(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} read timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function archiveBundle(
  replayId?: string,
  repository: PersistenceRepository = appPersistenceRepository,
): Promise<ScanArchiveBundle> {
  try {
    return await withReadonlySnapshotTimeout(
      "scan archive bundle",
      () => buildScanArchiveBundle(repository, replayId, {
        listLimit: 8,
        maxEntries: archiveMaxEntries,
      }),
    );
  } catch {
    return {
      entries: [],
      comparison: null,
      retention: {
        storage: repository.mode,
        durable: repository.mode === "database",
        maxEntries: archiveMaxEntries,
      },
    };
  }
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
    `(archives ${summary.archivesRead}, journal ${summary.journalEventsRead}, movers ${summary.dailyMoverSnapshotsRead}, ` +
    `asset states ${summary.assetStatesRead}, trend reviews ${summary.sourceCounts.trendRadarReviews})`;
}

async function macroAnchorOptions(repository: PersistenceRepository): Promise<Pick<
  GetConfiguredMarketProviderOptions,
  "altcoinMacro" | "universePriorityHintNotes"
>> {
  try {
    const snapshots = await repository.listMacroMarketSnapshots(96);
    const altcoinMacro = buildAltcoinMacroAnchorInputFromSnapshots(snapshots);

    if (!altcoinMacro) {
      return {
        universePriorityHintNotes: ["macro anchors: unavailable"],
      };
    }

    return {
      altcoinMacro,
      universePriorityHintNotes: [
        `macro anchors: ${altcoinMacro.source} BTC.D ${altcoinMacro.btcDominancePercent}, TOTAL2 24h ${altcoinMacro.total2ChangePercent24h ?? "waiting"}, TOTAL3 24h ${altcoinMacro.total3ChangePercent24h ?? "waiting"}`,
      ],
    };
  } catch (error) {
    return {
      universePriorityHintNotes: [`macro anchors: unavailable (${errorMessage(error)})`],
    };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown repository priority hint error";
}

function shouldUseDevSnapshotFile(repository: PersistenceRepository) {
  const lifecycle = process.env.npm_lifecycle_event ?? "";

  return process.env.NODE_ENV !== "production" &&
    !lifecycle.startsWith("test") &&
    repository.mode === "memory";
}

async function readDevSnapshotFile(repository: PersistenceRepository): Promise<MarketRadarSnapshot | null> {
  if (!shouldUseDevSnapshotFile(repository)) {
    return null;
  }

  try {
    return JSON.parse(await readFile(devSnapshotPath, "utf8")) as MarketRadarSnapshot;
  } catch {
    return null;
  }
}

async function writeDevSnapshotFile(snapshot: MarketRadarSnapshot, repository: PersistenceRepository) {
  if (!shouldUseDevSnapshotFile(repository)) {
    return;
  }

  try {
    await mkdir(dirname(devSnapshotPath), { recursive: true });
    await writeFile(devSnapshotPath, JSON.stringify(snapshot), "utf8");
  } catch {
    // Local preview cache is best-effort only; database/memory cache remains authoritative.
  }
}

function emptyInstrumentPool(): MarketRadarSnapshot["instrumentPool"] {
  return {
    instruments: [],
    rejected: [],
    summary: {
      accepted: 0,
      duplicatesRemoved: 0,
      marketTypes: ["perpetual"],
      minVolume24hUsd: 5_000_000,
      quoteAssets: ["USDT"],
      rejected: 0,
      total: 0,
    },
  };
}

function unavailableSnapshot({
  error,
  repository,
  trigger,
}: {
  error: unknown;
  repository: PersistenceRepository;
  trigger: NonNullable<MarketRadarSnapshot["metadata"]["runtime"]>["trigger"];
}): MarketRadarSnapshot {
  const now = new Date();
  const cadenceMinutes = siteConfig.scanIntervalMinutes;
  const generatedAt = now.toISOString();

  return {
    metadata: {
      anomalyCount: 0,
      cadenceMinutes,
      candidateCount: 0,
      generatedAt,
      id: `scan-unavailable-${now.getTime()}`,
      isRealtime: false,
      mode: "scheduled",
      nextScanAt: calculateNextScanAt(now, cadenceMinutes),
      notes: [
        `scan runtime: provider unavailable (${errorMessage(error)})`,
        "read endpoint: degraded placeholder returned so the app remains reachable",
      ],
      riskGate: "on",
      runtime: {
        cacheStatus: "failed",
        persistedArchive: false,
        repositoryMode: repository.mode,
        trigger,
      },
      scannedCount: 0,
      source: "composite",
      staleAfterMinutes: cadenceMinutes * 2,
      status: "failed",
    },
    derivatives: [],
    heatmap: [],
    instrumentPool: emptyInstrumentPool(),
    instruments: [],
    journalEvents: [],
    signals: [],
    tickers: [],
  };
}

function cachedSnapshotForNoRefreshRead({
  cachedSnapshot,
  note = "scan runtime: no-refresh read served cached snapshot",
  repository,
  trigger,
}: {
  cachedSnapshot: MarketRadarSnapshot;
  note?: string;
  repository: PersistenceRepository;
  trigger: NonNullable<MarketRadarSnapshot["metadata"]["runtime"]>["trigger"];
}): MarketRadarSnapshot {
  return {
    ...cachedSnapshot,
    metadata: {
      ...cachedSnapshot.metadata,
      runtime: {
        ...cachedSnapshot.metadata.runtime,
        cacheStatus: "served_cache",
        persistedArchive: cachedSnapshot.metadata.runtime?.persistedArchive ?? false,
        repositoryMode: repository.mode,
        trigger,
      },
      notes: [
        ...cachedSnapshot.metadata.notes,
        note,
      ],
    },
  };
}

export async function buildRepositoryAwareMarketProvider({
  env = process.env,
  providerFactory = getConfiguredMarketProvider,
  repository = appPersistenceRepository,
}: RepositoryAwareMarketProviderOptions = {}): Promise<MarketDataProvider> {
  try {
    const report = await buildUniversePriorityHintsFromRepository(repository);
    const macroOptions = await macroAnchorOptions(repository);

    return providerFactory(env, {
      altcoinMacro: macroOptions.altcoinMacro,
      universePriorityHintNotes: [
        priorityHintNote(report.summary),
        ...(macroOptions.universePriorityHintNotes ?? []),
      ],
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

function promptLimit(env: AiReviewEnv) {
  const parsed = Number(env.AI_REVIEW_MAX_PROMPT_CHARS ?? 12_000);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 12_000;
  }

  return Math.floor(parsed);
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
      const maturity = classifySignalMaturity(signal);

      if (maturity.canRequestAiReview === false) {
        return {
          ...signal,
          maturity,
          aiReview: disabledAiReview("SIGNAL_MATURITY_GATE: AI only reviews EVIDENCE_SIGNAL or TRADE_PLAN_READY", {
            maxPromptChars: promptLimit(env),
            maxSignalsPerSnapshot: maxSignals,
            model: env.AI_MODEL ?? "gpt-4.1-mini",
            provider: env.AI_PROVIDER ?? "openai-compatible",
          }),
        };
      }

      if (enabled && index >= maxSignals) {
        return {
          ...signal,
          maturity,
          aiReview: disabledAiReview("AI_REVIEW_MAX_SIGNALS budget guard", {
            maxPromptChars: promptLimit(env),
            maxSignalsPerSnapshot: maxSignals,
            model: env.AI_MODEL ?? "gpt-4.1-mini",
            provider: env.AI_PROVIDER ?? "openai-compatible",
          }),
        };
      }

      return {
        ...signal,
        maturity,
        aiReview: await reviewSignalWithAi({
          signal: {
            ...signal,
            maturity,
          },
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

async function withArchive(
  snapshot: MarketRadarSnapshot,
  {
    persistArchive = false,
    repository = appPersistenceRepository,
  }: SnapshotArchiveOptions = {},
): Promise<MarketRadarSnapshot> {
  const matured = applySignalMaturityToSnapshot(snapshot);
  const enriched = await enrichSnapshotWithAiReviews(matured);

  if (persistArchive) {
    const replayFrame = createReplayFrame(enriched);

    await repository.addScanArchive(
      summarizeScanSnapshot(enriched),
      replayFrame,
      enriched,
    );
    await writeDevSnapshotFile(enriched, repository);

    if (enriched.metadata.coverage) {
      const previousStates = await repository.listScanAssetStates(1_000);

      await repository.upsertScanAssetStates(
        buildScanAssetStatesFromCoverage({
          coverage: enriched.metadata.coverage,
          generatedAt: enriched.metadata.generatedAt,
          previousStates,
        }),
      );
    }
  }

  return {
    ...enriched,
    metadata: {
      ...enriched.metadata,
      runtime: {
        ...enriched.metadata.runtime,
        trigger: enriched.metadata.runtime?.trigger ?? "unknown",
        persistedArchive: persistArchive,
        repositoryMode: repository.mode,
      },
    },
    archive: await archiveBundle(enriched.metadata.id, repository),
  };
}

export async function getMarketRadarSnapshot(
  provider?: MarketDataProvider,
  options: SnapshotArchiveOptions = {},
): Promise<MarketRadarSnapshot> {
  const repository = options.repository ?? appPersistenceRepository;

  if (options.allowRefresh === false) {
    const cachedSnapshot = scanCache.get();

    if (!cachedSnapshot) {
      const persistedSnapshot = await withReadonlySnapshotTimeout(
        "latest scan snapshot",
        () => repository.getScanSnapshot(),
      ) ?? await readDevSnapshotFile(repository);

      if (!persistedSnapshot) {
        throw new Error("no-refresh read requested and no cached snapshot available");
      }

      scanCache.set(persistedSnapshot);

      return withArchive(
        cachedSnapshotForNoRefreshRead({
          cachedSnapshot: persistedSnapshot,
          note: "scan runtime: no-refresh read restored latest persisted scan snapshot",
          repository,
          trigger: options.trigger ?? "internal",
        }),
        {
          persistArchive: false,
          repository,
        },
      );
    }

    return withArchive(
      cachedSnapshotForNoRefreshRead({
        cachedSnapshot,
        repository,
        trigger: options.trigger ?? "internal",
      }),
      {
        persistArchive: false,
        repository,
      },
    );
  }

  const resolvedProvider = provider ?? await buildRepositoryAwareMarketProvider({ repository });
  const coordinator = options.coordinator === undefined
    ? provider ? undefined : scanCoordinator
    : options.coordinator ?? undefined;
  const result = await runScheduledScan({
    provider: resolvedProvider,
    cache: scanCache,
    now: new Date(),
    cadenceMinutes: siteConfig.scanIntervalMinutes,
    coordinator,
    trigger: options.trigger ?? "internal",
  });

  if (!result.snapshot) {
    throw new Error(result.error ?? "market radar snapshot unavailable");
  }

  return withArchive(result.snapshot, {
    persistArchive: options.persistArchive,
    repository,
  });
}

export async function getReadableMarketRadarSnapshot(
  provider?: MarketDataProvider,
  options: SnapshotArchiveOptions = {},
): Promise<MarketRadarSnapshot> {
  const repository = options.repository ?? appPersistenceRepository;

  try {
    return await getMarketRadarSnapshot(provider, options);
  } catch (error) {
    return withArchive(
      unavailableSnapshot({
        error,
        repository,
        trigger: options.trigger ?? "internal",
      }),
      {
        persistArchive: false,
        repository,
      },
    );
  }
}

export async function refreshMarketRadarSnapshot(
  provider?: MarketDataProvider,
  options: SnapshotArchiveOptions = {},
) {
  const repository = options.repository ?? appPersistenceRepository;
  const resolvedProvider = provider ?? await buildRepositoryAwareMarketProvider({ repository });
  const coordinator = options.coordinator === undefined
    ? provider ? undefined : scanCoordinator
    : options.coordinator ?? undefined;
  const result = await runScheduledScan({
    provider: resolvedProvider,
    cache: scanCache,
    now: new Date(),
    cadenceMinutes: siteConfig.scanIntervalMinutes,
    coordinator,
    forceRefresh: true,
    trigger: options.trigger ?? "cron_post",
  });

  return {
    ...result,
    snapshot: result.snapshot ? await withArchive(result.snapshot, {
      persistArchive: true,
      repository,
    }) : null,
  };
}

export async function getScanArchive(replayId?: string) {
  return archiveBundle(replayId);
}
