import type {
  DailyMover,
  DailyMoverReview,
  DailyMoverSnapshot,
} from "../market/daily-movers";
import {
  buildDailyMoverSnapshotCorrelation,
  type DailyMoverSnapshotCorrelation,
} from "../market/daily-mover-correlations";
import type { ScanReplayFrame } from "../market/types";
import type { PersistenceMode, PersistenceRepository } from "../persistence/persistence-store";

export type DailyMoverReadLimitInput = string | number | null | undefined;

export type DailyMoverPreview = {
  id: string;
  symbol: string;
  exchange: DailyMover["exchange"];
  direction: DailyMover["direction"];
  rank: number;
  observedAt: string;
  priceChangePercent: number;
  volume24hUsd: number;
};

export type DailyMoverReviewCounts = Record<DailyMoverReview["radarReview"]["status"], number>;

export type DailyMoverAttributionCounts = Record<DailyMoverReview["attribution"]["learnability"], number>;

export type DailyMoverSnapshotSummary = {
  id: string;
  source: DailyMoverSnapshot["source"];
  observedAt: string;
  gainerCount: number;
  loserCount: number;
  reviewCount: number;
  topGainers: DailyMoverPreview[];
  topLosers: DailyMoverPreview[];
  attribution: DailyMoverAttributionCounts;
  radarReview: DailyMoverReviewCounts;
  allowedUse: "research_only";
};

export type DailyMoverRetention = {
  storage: PersistenceMode;
  scope: string;
  limit: number;
  returned: number;
};

export type DailyMoverCorrelationRetention = {
  scanArchiveLimit: number;
  scanArchivesReturned: number;
  replayFramesReturned: number;
  journalLimit: number;
  journalEventsReturned: number;
};

export type DailyMoverReadArchiveBase = {
  allowedUse: "research_only";
  guardrail: string;
  latestSnapshot: DailyMoverSnapshot | null;
  selectedSnapshot: DailyMoverSnapshot | null;
  selectedCorrelation: DailyMoverSnapshotCorrelation | null;
  snapshots: DailyMoverSnapshotSummary[];
  correlationRetention: DailyMoverCorrelationRetention;
  retention: DailyMoverRetention;
};

export type DailyMoverReadArchiveSuccess = DailyMoverReadArchiveBase & {
  ok: true;
};

export type DailyMoverReadArchiveFailure = DailyMoverReadArchiveBase & {
  ok: false;
  error: "daily_mover_snapshot_not_found";
};

export type DailyMoverReadArchiveResult = {
  status: 200 | 404;
  body: DailyMoverReadArchiveSuccess | DailyMoverReadArchiveFailure;
};

export type GetDailyMoverReadArchiveOptions = {
  repository: PersistenceRepository;
  id?: string | null;
  limit?: DailyMoverReadLimitInput;
};

const defaultReadLimit = 14;
const maxReadLimit = 30;
const moverPreviewLimit = 5;
const correlationScanArchiveLimit = 12;
const correlationJournalLimit = 80;
const dailyMoverGuardrail = "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。";

export function normalizeDailyMoverReadLimit(value: DailyMoverReadLimitInput) {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(value ?? "", 10);
  const fallback = Number.isFinite(parsed) ? parsed : defaultReadLimit;

  return Math.min(maxReadLimit, Math.max(1, Math.trunc(fallback)));
}

function previewMover(mover: DailyMover): DailyMoverPreview {
  return {
    id: mover.id,
    symbol: mover.symbol,
    exchange: mover.exchange,
    direction: mover.direction,
    rank: mover.rank,
    observedAt: mover.observedAt,
    priceChangePercent: mover.priceChangePercent,
    volume24hUsd: mover.volume24hUsd,
  };
}

function emptyAttributionCounts(): DailyMoverAttributionCounts {
  return {
    learnable: 0,
    watchlist: 0,
    not_learnable: 0,
  };
}

function emptyRadarReviewCounts(): DailyMoverReviewCounts {
  return {
    caught: 0,
    missed: 0,
    not_learnable: 0,
  };
}

function countAttribution(reviews: DailyMoverReview[]) {
  const counts = emptyAttributionCounts();

  for (const review of reviews) {
    counts[review.attribution.learnability] += 1;
  }

  return counts;
}

function countRadarReview(reviews: DailyMoverReview[]) {
  const counts = emptyRadarReviewCounts();

  for (const review of reviews) {
    counts[review.radarReview.status] += 1;
  }

  return counts;
}

export function summarizeDailyMoverSnapshot(snapshot: DailyMoverSnapshot): DailyMoverSnapshotSummary {
  return {
    id: snapshot.id,
    source: snapshot.source,
    observedAt: snapshot.observedAt,
    gainerCount: snapshot.gainers.length,
    loserCount: snapshot.losers.length,
    reviewCount: snapshot.reviews.length,
    topGainers: snapshot.gainers.slice(0, moverPreviewLimit).map(previewMover),
    topLosers: snapshot.losers.slice(0, moverPreviewLimit).map(previewMover),
    attribution: countAttribution(snapshot.reviews),
    radarReview: countRadarReview(snapshot.reviews),
    allowedUse: "research_only",
  };
}

export async function getDailyMoverReadArchive({
  id,
  limit,
  repository,
}: GetDailyMoverReadArchiveOptions): Promise<DailyMoverReadArchiveResult> {
  const normalizedLimit = normalizeDailyMoverReadLimit(limit);
  const [snapshots, scanArchives, journalEvents] = await Promise.all([
    repository.listDailyMoverSnapshots(normalizedLimit),
    repository.listScanArchives(correlationScanArchiveLimit),
    repository.listJournalEvents(correlationJournalLimit),
  ]);
  const latestSnapshot = snapshots[0] ?? await repository.getDailyMoverSnapshot();
  const selectedSnapshot = id
    ? await repository.getDailyMoverSnapshot(id)
    : latestSnapshot;
  const replayFrames = (await Promise.all(
    scanArchives.map((archive) => repository.getScanReplayFrame(archive.id)),
  )).filter((frame): frame is ScanReplayFrame => Boolean(frame));
  const retention = {
    storage: repository.mode,
    scope: repository.scope,
    limit: normalizedLimit,
    returned: snapshots.length,
  };
  const correlationRetention = {
    scanArchiveLimit: correlationScanArchiveLimit,
    scanArchivesReturned: scanArchives.length,
    replayFramesReturned: replayFrames.length,
    journalLimit: correlationJournalLimit,
    journalEventsReturned: journalEvents.length,
  };
  const base = {
    allowedUse: "research_only" as const,
    guardrail: dailyMoverGuardrail,
    latestSnapshot,
    selectedSnapshot,
    selectedCorrelation: selectedSnapshot
      ? buildDailyMoverSnapshotCorrelation({
          journalEvents,
          replayFrames,
          scanArchives,
          snapshot: selectedSnapshot,
        })
      : null,
    snapshots: snapshots.map(summarizeDailyMoverSnapshot),
    correlationRetention,
    retention,
  };

  if (id && !selectedSnapshot) {
    return {
      status: 404,
      body: {
        ...base,
        ok: false,
        error: "daily_mover_snapshot_not_found",
      },
    };
  }

  return {
    status: 200,
    body: {
      ...base,
      ok: true,
    },
  };
}
