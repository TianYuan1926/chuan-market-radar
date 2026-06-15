import type {
  DailyMover,
  DailyMoverReview,
  DailyMoverSnapshot,
} from "../market/daily-movers";
import {
  buildDailyMoverSnapshotCorrelation,
  type DailyMoverCorrelationLink,
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

export type DailyMoverSelectedDetail = {
  id: string;
  symbol: string;
  direction: DailyMoverReview["direction"];
  observedAt: string;
  radarStatus: DailyMoverReview["radarReview"]["status"];
  learnability: DailyMoverReview["attribution"]["learnability"];
  evidenceStrength: DailyMoverReview["attribution"]["evidenceStrength"];
  primaryDrivers: DailyMoverReview["attribution"]["primaryDrivers"];
  improvementTags: string[];
  correlationStatus: DailyMoverCorrelationLink["status"];
  matchedScanIds: string[];
  matchedSignalIds: string[];
  journalEventIds: string[];
  linkedSignalCount: number;
  whyMissed: string;
  nextReviewAction: string;
  allowedUse: "research_only";
};

export type DailyMoverCalibrationSuggestion = {
  id: string;
  tag: string;
  label: string;
  sampleCount: number;
  symbols: string[];
  evidenceCount: number;
  recommendation: string;
  guardrail: string;
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
  calibrationSuggestions: DailyMoverCalibrationSuggestion[];
  selectedSnapshot: DailyMoverSnapshot | null;
  selectedCorrelation: DailyMoverSnapshotCorrelation | null;
  selectedDetails: DailyMoverSelectedDetail[];
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
const optionalDailyMoverTableNames = [
  "daily_mover_snapshots",
  "daily_mover_assets",
  "mover_attribution_reviews",
  "radar_miss_reviews",
];

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

function detailReason(status: DailyMoverCorrelationLink["status"]) {
  return {
    caught_unreviewed: "雷达提前留下匹配扫描，但还缺少复盘日记验证。",
    caught_with_journal: "雷达提前留下匹配扫描，且后续已有复盘日记。",
    missed_with_evidence: "雷达没有在选中样本窗口内留下匹配扫描，但样本存在可学习驱动。",
    not_learnable: "样本被标记为不可学习，不能用来调高规则权重。",
    unlinked: "样本还没有足够扫描或日记关联，先检查覆盖率和数据质量。",
  }[status];
}

function calibrationLabel(tag: string) {
  return {
    review_short_side_detection: "空头检测复核",
    review_universe_coverage: "扫描覆盖复核",
    review_volume_oi_weight: "成交量/OI 权重复核",
  }[tag] ?? "规则复核";
}

function calibrationRecommendation(tag: string) {
  return {
    review_short_side_detection: "候选建议：复核下跌样本的方向识别，不用单个样本直接提高下跌方向权重。",
    review_universe_coverage: "候选建议：复核币种池覆盖和轮询优先级，先确认是否漏扫再考虑规则调整。",
    review_volume_oi_weight: "候选建议：复核成交量/OI 权重是否低估了提前扩张，必须用更多样本验证后再调整。",
  }[tag] ?? "候选建议：进入人工复盘和后续回测，不自动修改当前策略权重。";
}

function buildSelectedDetails(
  snapshot: DailyMoverSnapshot | null,
  correlation: DailyMoverSnapshotCorrelation | null,
): DailyMoverSelectedDetail[] {
  if (!snapshot) {
    return [];
  }

  const linksById = new Map((correlation?.links ?? []).map((link) => [link.moverId, link]));

  return snapshot.reviews.map((review) => {
    const link = linksById.get(review.id);
    const correlationStatus = link?.status ?? "unlinked";

    return {
      id: review.id,
      symbol: review.symbol,
      direction: review.direction,
      observedAt: review.observedAt,
      radarStatus: review.radarReview.status,
      learnability: review.attribution.learnability,
      evidenceStrength: review.attribution.evidenceStrength,
      primaryDrivers: review.attribution.primaryDrivers,
      improvementTags: review.radarReview.improvementTags,
      correlationStatus,
      matchedScanIds: link?.matchedScanIds ?? [],
      matchedSignalIds: link?.matchedSignalIds ?? review.radarReview.matchedSignalIds,
      journalEventIds: link?.journalEventIds ?? [],
      linkedSignalCount: link?.linkedSignals.length ?? 0,
      whyMissed: detailReason(correlationStatus),
      nextReviewAction: link?.suggestedNextStep ?? "先检查扫描覆盖和样本质量。",
      allowedUse: "research_only",
    };
  });
}

function buildCalibrationSuggestions(
  correlation: DailyMoverSnapshotCorrelation | null,
): DailyMoverCalibrationSuggestion[] {
  if (!correlation) {
    return [];
  }

  const grouped = new Map<string, {
    evidenceCount: number;
    sampleCount: number;
    symbols: string[];
  }>();

  for (const link of correlation.links) {
    if (!link.calibrationCandidate) {
      continue;
    }

    const tags = link.improvementTags.length > 0
      ? link.improvementTags
      : ["review_universe_coverage"];

    for (const tag of tags) {
      const current = grouped.get(tag) ?? {
        evidenceCount: 0,
        sampleCount: 0,
        symbols: [],
      };

      current.evidenceCount += link.matchedScanIds.length + link.matchedSignalIds.length + link.journalEventIds.length;
      current.sampleCount += 1;
      current.symbols = [...new Set([...current.symbols, link.symbol])];
      grouped.set(tag, current);
    }
  }

  return [...grouped.entries()]
    .map(([tag, item]) => ({
      id: `calibration-${tag}`,
      tag,
      label: calibrationLabel(tag),
      sampleCount: item.sampleCount,
      symbols: item.symbols,
      evidenceCount: item.evidenceCount,
      recommendation: calibrationRecommendation(tag),
      guardrail: "候选建议不能自动改权重，只能进入人工复盘和后续回测。",
      allowedUse: "research_only" as const,
    }))
    .sort((first, second) => (
      second.sampleCount - first.sampleCount
      || first.label.localeCompare(second.label, "zh-CN")
    ));
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

function isMissingOptionalDailyMoverTable(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  const message = error instanceof Error ? error.message : "";

  return code === "42P01"
    && optionalDailyMoverTableNames.some((tableName) => message.includes(tableName));
}

async function listDailyMoverSnapshotsForPublicRead(
  repository: PersistenceRepository,
  limit: number,
) {
  try {
    return await repository.listDailyMoverSnapshots(limit);
  } catch (error) {
    if (isMissingOptionalDailyMoverTable(error)) {
      return [];
    }

    throw error;
  }
}

async function getDailyMoverSnapshotForPublicRead(
  repository: PersistenceRepository,
  id?: string,
) {
  try {
    return await repository.getDailyMoverSnapshot(id);
  } catch (error) {
    if (isMissingOptionalDailyMoverTable(error)) {
      return null;
    }

    throw error;
  }
}

export async function getDailyMoverReadArchive({
  id,
  limit,
  repository,
}: GetDailyMoverReadArchiveOptions): Promise<DailyMoverReadArchiveResult> {
  const normalizedLimit = normalizeDailyMoverReadLimit(limit);
  const [snapshots, scanArchives, journalEvents] = await Promise.all([
    listDailyMoverSnapshotsForPublicRead(repository, normalizedLimit),
    repository.listScanArchives(correlationScanArchiveLimit),
    repository.listJournalEvents(correlationJournalLimit),
  ]);
  const latestSnapshot = snapshots[0] ?? await getDailyMoverSnapshotForPublicRead(repository);
  const selectedSnapshot = id
    ? await getDailyMoverSnapshotForPublicRead(repository, id)
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
  const selectedCorrelation = selectedSnapshot
    ? buildDailyMoverSnapshotCorrelation({
        journalEvents,
        replayFrames,
        scanArchives,
        snapshot: selectedSnapshot,
      })
    : null;
  const base = {
    allowedUse: "research_only" as const,
    calibrationSuggestions: buildCalibrationSuggestions(selectedCorrelation),
    guardrail: dailyMoverGuardrail,
    latestSnapshot,
    selectedSnapshot,
    selectedCorrelation,
    selectedDetails: buildSelectedDetails(selectedSnapshot, selectedCorrelation),
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
