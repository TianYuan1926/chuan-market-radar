import assert from "node:assert/strict";
import test from "node:test";

import type { JournalEvent } from "../analysis/types";
import type {
  DailyMover,
  DailyMoverReview,
  DailyMoverSnapshot,
} from "../market/daily-movers";
import type { ScanArchiveSummary, ScanReplayFrame } from "../market/types";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import {
  buildDailyMoverBacktestCandidates,
  buildDailyMoverBacktestValidations,
  buildDailyMoverCalibrationFeedback,
  buildDailyMoverStrategyDrafts,
  getDailyMoverReadArchive,
  normalizeDailyMoverReadLimit,
} from "./daily-mover-readonly";

function mover(
  symbol: string,
  direction: DailyMover["direction"],
  rank: number,
  observedAt: string,
  priceChangePercent: number,
): DailyMover {
  return {
    id: `${symbol.toLowerCase()}-${direction}-${rank}`,
    symbol,
    exchange: "BINANCE",
    direction,
    rank,
    observedAt,
    priceChangePercent,
    volume24hUsd: 120_000_000,
    openInterestChangePercent: 22,
    fundingRate: 0.0006,
  };
}

function review(
  item: DailyMover,
  status: DailyMoverReview["radarReview"]["status"],
  learnability: DailyMoverReview["attribution"]["learnability"],
): DailyMoverReview {
  return {
    id: item.id,
    symbol: item.symbol,
    direction: item.direction,
    observedAt: item.observedAt,
    allowedUse: "research_only",
    guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
    attribution: {
      evidenceStrength: learnability === "learnable" ? "strong" : "medium",
      learnability,
      primaryDrivers: ["volume_expansion", "open_interest_expansion"],
    },
    radarReview: {
      status,
      matchedSignalIds: status === "caught" ? [`sig-${item.symbol.toLowerCase()}`] : [],
      improvementTags: status === "missed" ? ["review_volume_oi_weight"] : [],
    },
  };
}

function snapshot(
  id: string,
  observedAt: string,
  gainerSymbol: string,
  loserSymbol: string,
): DailyMoverSnapshot {
  const gainer = mover(gainerSymbol, "gainer", 1, observedAt, 34.2);
  const loser = mover(loserSymbol, "loser", 1, observedAt, -21.8);

  return {
    id,
    source: "coinglass",
    observedAt,
    gainers: [gainer],
    losers: [loser],
    reviews: [
      review(gainer, "caught", "learnable"),
      review(loser, "missed", "watchlist"),
    ],
  };
}

function snapshotFromReviews(
  id: string,
  observedAt: string,
  reviews: DailyMoverReview[],
): DailyMoverSnapshot {
  return {
    id,
    source: "coinglass",
    observedAt,
    gainers: reviews
      .filter((item) => item.direction === "gainer")
      .map((item, index) => mover(item.symbol, item.direction, index + 1, item.observedAt, 18.6)),
    losers: reviews
      .filter((item) => item.direction === "loser")
      .map((item, index) => mover(item.symbol, item.direction, index + 1, item.observedAt, -14.2)),
    reviews,
  };
}

function reviewWithTags(
  symbol: string,
  direction: DailyMover["direction"],
  status: DailyMoverReview["radarReview"]["status"],
  learnability: DailyMoverReview["attribution"]["learnability"],
  improvementTags: string[],
): DailyMoverReview {
  const item = mover(symbol, direction, 1, "2026-06-15T00:17:00.000Z", direction === "gainer" ? 18.6 : -14.2);

  return {
    ...review(item, status, learnability),
    radarReview: {
      ...review(item, status, learnability).radarReview,
      improvementTags,
    },
  };
}

function scanSummary(id: string, generatedAt: string, topSymbols: string[]): ScanArchiveSummary {
  return {
    id,
    source: "coinglass",
    status: "ready",
    generatedAt,
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: topSymbols.length,
    topSymbols,
    notes: ["test scan archive"],
  };
}

function replayFrame(id: string, generatedAt: string): ScanReplayFrame {
  return {
    id,
    source: "coinglass",
    status: "ready",
    generatedAt,
    nextScanAt: "2026-06-15T00:30:00.000Z",
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 1,
    signals: [
      {
        id: "sig-enausdt",
        symbol: "ENAUSDT",
        direction: "long",
        state: "near_trigger",
        timeframe: "15m",
        confidence: 82,
        risk: "low",
        riskReward: 3.8,
        strategyStatus: "waiting",
        updatedAt: generatedAt,
        summary: "放量、OI 和结构压缩同时出现。",
      },
    ],
  };
}

function journalEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id: "journal-ena-track",
    signalId: "sig-enausdt",
    symbol: "ENAUSDT",
    title: "加入跟踪队列",
    result: "watching",
    note: "记录观察，不提前交易。",
    rankDelta: 0,
    createdAt: "2026-06-15T00:22:00.000Z",
    action: "track",
    reviewStatus: "tracking",
    timeframe: "15m",
    direction: "long",
    strategyStatus: "waiting",
    riskReward: 3.8,
    trigger: "放量突破后回踩确认",
    invalidation: "跌回压缩区",
    thesis: "接近触发，但需要确认。",
    plannedReviewAt: "2026-06-15T01:52:00.000Z",
    lessons: ["still_tracking"],
    outcomeStatus: "pending",
    triggerHit: false,
    invalidationHit: false,
    firstTargetHit: false,
    ...overrides,
  };
}

test("getDailyMoverReadArchive exposes the latest research-only snapshot and bounded summaries", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-14",
    "2026-06-14T00:17:00.000Z",
    "SOLUSDT",
    "AVAXUSDT",
  ));
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));

  const result = await getDailyMoverReadArchive({ repository, limit: 1 });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);

  if (!result.body.ok) {
    assert.fail("expected a successful daily mover archive response");
  }

  assert.equal(result.body.allowedUse, "research_only");
  assert.match(result.body.guardrail, /不用于追涨杀跌/);
  assert.equal(result.body.retention.storage, "memory");
  assert.equal(result.body.retention.scope, "chuan-public");
  assert.equal(result.body.retention.limit, 1);
  assert.equal(result.body.latestSnapshot?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.selectedSnapshot?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.snapshots.length, 1);
  assert.equal(result.body.snapshots[0]?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.snapshots[0]?.topGainers[0]?.symbol, "ENAUSDT");
  assert.equal(result.body.snapshots[0]?.topLosers[0]?.symbol, "SUIUSDT");
  assert.equal(result.body.snapshots[0]?.attribution.learnable, 1);
  assert.equal(result.body.snapshots[0]?.attribution.watchlist, 1);
  assert.equal(result.body.snapshots[0]?.radarReview.caught, 1);
  assert.equal(result.body.snapshots[0]?.radarReview.missed, 1);
});

test("getDailyMoverReadArchive selects a requested historical snapshot by id", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-14",
    "2026-06-14T00:17:00.000Z",
    "SOLUSDT",
    "AVAXUSDT",
  ));
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));

  const result = await getDailyMoverReadArchive({
    id: "daily-movers-coinglass-2026-06-14",
    limit: "5",
    repository,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);

  if (!result.body.ok) {
    assert.fail("expected a successful daily mover archive response");
  }

  assert.equal(result.body.latestSnapshot?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.selectedSnapshot?.id, "daily-movers-coinglass-2026-06-14");
  assert.deepEqual(result.body.snapshots.map((item: { id: string }) => item.id), [
    "daily-movers-coinglass-2026-06-15",
    "daily-movers-coinglass-2026-06-14",
  ]);
});

test("getDailyMoverReadArchive links selected mover samples to scan archives and journal events", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));
  await repository.addScanArchive(
    scanSummary("scan-2026-06-15T00-15", "2026-06-15T00:15:00.000Z", ["ENAUSDT"]),
    replayFrame("scan-2026-06-15T00-15", "2026-06-15T00:15:00.000Z"),
  );
  await repository.addJournalEvent(journalEvent());

  const result = await getDailyMoverReadArchive({ repository, limit: 1 });
  const body = result.body as typeof result.body & {
    selectedCorrelation?: {
      summary: {
        calibrationCandidates: number;
        caught: number;
        journalLinked: number;
        missed: number;
      };
      links: Array<{
        calibrationCandidate: boolean;
        journalEventIds: string[];
        matchedScanIds: string[];
        status: string;
        symbol: string;
      }>;
    } | null;
  };

  assert.equal(result.status, 200);
  assert.equal(body.selectedCorrelation?.summary.caught, 1);
  assert.equal(body.selectedCorrelation?.summary.missed, 1);
  assert.equal(body.selectedCorrelation?.summary.journalLinked, 1);
  assert.equal(body.selectedCorrelation?.summary.calibrationCandidates, 1);

  const enaLink = body.selectedCorrelation?.links.find((link) => link.symbol === "ENAUSDT");
  const suiLink = body.selectedCorrelation?.links.find((link) => link.symbol === "SUIUSDT");

  assert.equal(enaLink?.status, "caught_with_journal");
  assert.deepEqual(enaLink?.matchedScanIds, ["scan-2026-06-15T00-15"]);
  assert.deepEqual(enaLink?.journalEventIds, ["journal-ena-track"]);
  assert.equal(suiLink?.status, "missed_with_evidence");
  assert.equal(suiLink?.calibrationCandidate, true);
});

test("getDailyMoverReadArchive exposes selected mover details and calibration suggestions", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));
  await repository.addScanArchive(
    scanSummary("scan-2026-06-15T00-15", "2026-06-15T00:15:00.000Z", ["ENAUSDT"]),
    replayFrame("scan-2026-06-15T00-15", "2026-06-15T00:15:00.000Z"),
  );

  const result = await getDailyMoverReadArchive({ repository, limit: 1 });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);

  if (!result.body.ok) {
    assert.fail("expected a successful daily mover archive response");
  }

  assert.equal(result.body.selectedDetails.length, 2);

  const missedDetail = result.body.selectedDetails.find((detail) => detail.symbol === "SUIUSDT");

  assert.equal(missedDetail?.correlationStatus, "missed_with_evidence");
  assert.equal(missedDetail?.whyMissed, "雷达没有在选中样本窗口内留下匹配扫描，但样本存在可学习驱动。");
  assert.equal(missedDetail?.nextReviewAction, "纳入规则校准候选，检查覆盖率、成交量和 OI 权重。");
  assert.deepEqual(missedDetail?.improvementTags, ["review_volume_oi_weight"]);
  assert.equal(missedDetail?.allowedUse, "research_only");

  assert.equal(result.body.calibrationSuggestions.length, 1);
  assert.equal(result.body.calibrationSuggestions[0]?.tag, "review_volume_oi_weight");
  assert.equal(result.body.calibrationSuggestions[0]?.sampleCount, 1);
  assert.deepEqual(result.body.calibrationSuggestions[0]?.symbols, ["SUIUSDT"]);
  assert.equal(result.body.calibrationSuggestions[0]?.allowedUse, "research_only");
  assert.match(result.body.calibrationSuggestions[0]?.recommendation ?? "", /候选建议/);
  assert.match(result.body.calibrationSuggestions[0]?.guardrail ?? "", /不能自动改权重/);
});

test("buildDailyMoverCalibrationFeedback groups calibration reviews without automatic weight changes", () => {
  const feedback = buildDailyMoverCalibrationFeedback([
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: "2026-06-15T00:22:00.000Z",
      id: "calibration-pending",
      outcomeStatus: "pending",
      reviewStatus: "tracking",
      sampleSymbols: ["SUIUSDT"],
      source: "daily_mover_calibration",
      sourceId: "daily-movers-coinglass-2026-06-15",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: "2026-06-16T00:22:00.000Z",
      id: "calibration-validated",
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: ["TIAUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_short_side_detection",
      createdAt: "2026-06-17T00:22:00.000Z",
      id: "calibration-rejected",
      outcomeStatus: "loss",
      result: "loss",
      reviewStatus: "closed",
      sampleSymbols: ["ARBUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "track",
      calibrationTag: "review_volume_oi_weight",
      id: "normal-signal-journal",
      outcomeStatus: "partial_win",
      result: "win",
    }),
  ]);

  assert.equal(feedback.length, 2);

  const volumeOi = feedback.find((item) => item.tag === "review_volume_oi_weight");
  const shortSide = feedback.find((item) => item.tag === "review_short_side_detection");

  assert.equal(volumeOi?.label, "成交量/OI 权重复核");
  assert.equal(volumeOi?.total, 2);
  assert.equal(volumeOi?.pending, 1);
  assert.equal(volumeOi?.validated, 1);
  assert.equal(volumeOi?.rejected, 0);
  assert.equal(volumeOi?.expired, 0);
  assert.deepEqual(volumeOi?.symbols, ["TIAUSDT", "SUIUSDT"]);
  assert.equal(volumeOi?.allowedUse, "research_only");
  assert.equal(volumeOi?.canAutoAdjustWeights, false);
  assert.match(volumeOi?.guardrail ?? "", /不能自动改权重/);
  assert.match(volumeOi?.nextStep ?? "", /继续积累样本/);

  assert.equal(shortSide?.total, 1);
  assert.equal(shortSide?.rejected, 1);
  assert.equal(shortSide?.pending, 0);
});

test("buildDailyMoverBacktestCandidates gates calibration feedback before manual backtest", () => {
  const feedback = buildDailyMoverCalibrationFeedback([
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: "2026-06-15T00:22:00.000Z",
      id: "volume-validated-1",
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: ["SUIUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: "2026-06-16T00:22:00.000Z",
      id: "volume-validated-2",
      outcomeStatus: "saved",
      result: "saved",
      reviewStatus: "closed",
      sampleSymbols: ["TIAUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: "2026-06-17T00:22:00.000Z",
      id: "volume-validated-3",
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: ["ENAUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_short_side_detection",
      createdAt: "2026-06-18T00:22:00.000Z",
      id: "short-pending",
      outcomeStatus: "pending",
      reviewStatus: "tracking",
      sampleSymbols: ["ARBUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_universe_coverage",
      createdAt: "2026-06-19T00:22:00.000Z",
      id: "coverage-rejected-1",
      outcomeStatus: "loss",
      result: "loss",
      reviewStatus: "closed",
      sampleSymbols: ["WLDUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_universe_coverage",
      createdAt: "2026-06-20T00:22:00.000Z",
      id: "coverage-rejected-2",
      outcomeStatus: "loss",
      result: "loss",
      reviewStatus: "closed",
      sampleSymbols: ["OPUSDT"],
      source: "daily_mover_calibration",
    }),
  ]);

  const candidates = buildDailyMoverBacktestCandidates(feedback);

  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((candidate) => candidate.readiness), ["ready", "collecting", "blocked"]);

  const ready = candidates.find((candidate) => candidate.tag === "review_volume_oi_weight");
  const collecting = candidates.find((candidate) => candidate.tag === "review_short_side_detection");
  const blocked = candidates.find((candidate) => candidate.tag === "review_universe_coverage");

  assert.equal(ready?.label, "成交量/OI 权重复核");
  assert.equal(ready?.sampleCount, 3);
  assert.equal(ready?.validated, 3);
  assert.equal(ready?.rejected, 0);
  assert.equal(ready?.pending, 0);
  assert.equal(ready?.readinessScore, 100);
  assert.match(ready?.evidenceSummary ?? "", /3 有效/);
  assert.match(ready?.nextStep ?? "", /人工回测/);
  assert.match(ready?.nextStep ?? "", /不能自动改权重/);
  assert.equal(ready?.allowedUse, "research_only");
  assert.equal(ready?.canAutoAdjustWeights, false);

  assert.equal(collecting?.readiness, "collecting");
  assert.match(collecting?.nextStep ?? "", /继续积累样本/);
  assert.equal(collecting?.canAutoAdjustWeights, false);

  assert.equal(blocked?.readiness, "blocked");
  assert.match(blocked?.nextStep ?? "", /反证/);
  assert.equal(blocked?.canAutoAdjustWeights, false);
});

test("buildDailyMoverBacktestValidations validates candidates against stored historical samples only", () => {
  const feedback = buildDailyMoverCalibrationFeedback([
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      id: "validation-ready-1",
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: ["SUIUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      id: "validation-ready-2",
      outcomeStatus: "saved",
      result: "saved",
      reviewStatus: "closed",
      sampleSymbols: ["TIAUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      id: "validation-ready-3",
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: ["ENAUSDT"],
      source: "daily_mover_calibration",
    }),
  ]);
  const candidates = buildDailyMoverBacktestCandidates(feedback);
  const validations = buildDailyMoverBacktestValidations(candidates, [
    snapshotFromReviews("daily-movers-validation-1", "2026-06-15T00:17:00.000Z", [
      reviewWithTags("ENAUSDT", "gainer", "caught", "learnable", []),
      reviewWithTags("SUIUSDT", "loser", "missed", "watchlist", ["review_volume_oi_weight"]),
    ]),
    snapshotFromReviews("daily-movers-validation-2", "2026-06-16T00:17:00.000Z", [
      reviewWithTags("TIAUSDT", "gainer", "caught", "learnable", []),
      reviewWithTags("OPUSDT", "loser", "not_learnable", "not_learnable", ["review_volume_oi_weight"]),
    ]),
  ]);

  assert.equal(validations.length, 1);

  const validation = validations[0];

  assert.equal(validation?.tag, "review_volume_oi_weight");
  assert.equal(validation?.mode, "historical_sample_validation");
  assert.equal(validation?.candidateReadiness, "ready");
  assert.equal(validation?.journalSampleCount, 3);
  assert.equal(validation?.validatedJournalSamples, 3);
  assert.equal(validation?.rejectedJournalSamples, 0);
  assert.equal(validation?.pendingJournalSamples, 0);
  assert.equal(validation?.historicalSampleCount, 4);
  assert.equal(validation?.caughtSamples, 2);
  assert.equal(validation?.missedSamples, 1);
  assert.equal(validation?.notLearnableSamples, 1);
  assert.equal(validation?.validationRatePercent, 100);
  assert.equal(validation?.caughtRatePercent, 50);
  assert.equal(validation?.verdict, "review_ready");
  assert.match(validation?.evidenceSummary ?? "", /历史样本 4/);
  assert.match(validation?.limitation ?? "", /不是完整 K 线回测/);
  assert.match(validation?.nextStep ?? "", /策略版本草案/);
  assert.equal(validation?.allowedUse, "research_only");
  assert.equal(validation?.canAutoAdjustWeights, false);
});

test("buildDailyMoverStrategyDrafts creates manual confirmation drafts without automatic weight changes", () => {
  const feedback = buildDailyMoverCalibrationFeedback([
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      id: "strategy-draft-ready-1",
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: ["SUIUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      id: "strategy-draft-ready-2",
      outcomeStatus: "saved",
      result: "saved",
      reviewStatus: "closed",
      sampleSymbols: ["TIAUSDT"],
      source: "daily_mover_calibration",
    }),
    journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      id: "strategy-draft-ready-3",
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: ["ENAUSDT"],
      source: "daily_mover_calibration",
    }),
  ]);
  const candidates = buildDailyMoverBacktestCandidates(feedback);
  const validations = buildDailyMoverBacktestValidations(candidates, [
    snapshotFromReviews("daily-movers-strategy-draft-1", "2026-06-15T00:17:00.000Z", [
      reviewWithTags("ENAUSDT", "gainer", "caught", "learnable", []),
      reviewWithTags("SUIUSDT", "loser", "missed", "watchlist", ["review_volume_oi_weight"]),
    ]),
  ]);
  const drafts = buildDailyMoverStrategyDrafts(validations);

  assert.equal(drafts.length, 1);

  const draft = drafts[0];

  assert.equal(draft?.tag, "review_volume_oi_weight");
  assert.equal(draft?.sourceMode, "historical_sample_validation");
  assert.equal(draft?.validationVerdict, "review_ready");
  assert.equal(draft?.status, "manual_review_required");
  assert.equal(draft?.manualConfirmation, "required");
  assert.match(draft?.versionLabel ?? "", /draft/);
  assert.match(draft?.evidenceSummary ?? "", /历史样本/);
  assert.match(draft?.limitation ?? "", /不是完整 K 线回测/);
  assert.match(draft?.nextStep ?? "", /人工确认/);
  assert.equal(draft?.allowedUse, "research_only");
  assert.equal(draft?.canAutoAdjustWeights, false);
});

test("getDailyMoverReadArchive exposes calibration feedback from journal events", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));
  await repository.addJournalEvent(journalEvent({
    action: "calibration_review",
    calibrationTag: "review_volume_oi_weight",
    id: "calibration-review-volume-oi",
    outcomeStatus: "pending",
    reviewStatus: "tracking",
    sampleSymbols: ["SUIUSDT"],
    source: "daily_mover_calibration",
  }));

  const result = await getDailyMoverReadArchive({ repository, limit: 1 });

  assert.equal(result.status, 200);
  assert.equal(result.body.calibrationFeedback.length, 1);
  assert.equal(result.body.calibrationFeedback[0]?.tag, "review_volume_oi_weight");
  assert.equal(result.body.calibrationFeedback[0]?.total, 1);
  assert.equal(result.body.calibrationFeedback[0]?.pending, 1);
  assert.equal(result.body.calibrationFeedback[0]?.canAutoAdjustWeights, false);
});

test("getDailyMoverReadArchive exposes readonly backtest candidates from calibration feedback", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));

  for (const [index, symbol] of ["SUIUSDT", "TIAUSDT", "ENAUSDT"].entries()) {
    await repository.addJournalEvent(journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: `2026-06-${15 + index}T00:22:00.000Z`,
      id: `calibration-ready-${index + 1}`,
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: [symbol],
      source: "daily_mover_calibration",
    }));
  }

  const result = await getDailyMoverReadArchive({ repository, limit: 1 });

  assert.equal(result.status, 200);
  assert.equal(result.body.backtestCandidates.length, 1);
  assert.equal(result.body.backtestCandidates[0]?.tag, "review_volume_oi_weight");
  assert.equal(result.body.backtestCandidates[0]?.readiness, "ready");
  assert.equal(result.body.backtestCandidates[0]?.allowedUse, "research_only");
  assert.equal(result.body.backtestCandidates[0]?.canAutoAdjustWeights, false);
  assert.match(result.body.backtestCandidates[0]?.nextStep ?? "", /人工回测/);
});

test("getDailyMoverReadArchive exposes readonly historical validation results", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshotFromReviews(
    "daily-movers-validation-api-1",
    "2026-06-15T00:17:00.000Z",
    [
      reviewWithTags("ENAUSDT", "gainer", "caught", "learnable", []),
      reviewWithTags("SUIUSDT", "loser", "missed", "watchlist", ["review_volume_oi_weight"]),
    ],
  ));

  for (const [index, symbol] of ["SUIUSDT", "TIAUSDT", "ENAUSDT"].entries()) {
    await repository.addJournalEvent(journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: `2026-06-${15 + index}T00:22:00.000Z`,
      id: `validation-api-ready-${index + 1}`,
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: [symbol],
      source: "daily_mover_calibration",
    }));
  }

  const result = await getDailyMoverReadArchive({ repository, limit: 3 });

  assert.equal(result.status, 200);
  assert.equal(result.body.backtestValidations.length, 1);
  assert.equal(result.body.backtestValidations[0]?.tag, "review_volume_oi_weight");
  assert.equal(result.body.backtestValidations[0]?.mode, "historical_sample_validation");
  assert.equal(result.body.backtestValidations[0]?.allowedUse, "research_only");
  assert.equal(result.body.backtestValidations[0]?.canAutoAdjustWeights, false);
  assert.match(result.body.backtestValidations[0]?.limitation ?? "", /不是完整 K 线回测/);
});

test("getDailyMoverReadArchive exposes readonly strategy drafts from historical validation", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshotFromReviews(
    "daily-movers-strategy-api-1",
    "2026-06-15T00:17:00.000Z",
    [
      reviewWithTags("ENAUSDT", "gainer", "caught", "learnable", []),
      reviewWithTags("SUIUSDT", "loser", "missed", "watchlist", ["review_volume_oi_weight"]),
    ],
  ));

  for (const [index, symbol] of ["SUIUSDT", "TIAUSDT", "ENAUSDT"].entries()) {
    await repository.addJournalEvent(journalEvent({
      action: "calibration_review",
      calibrationTag: "review_volume_oi_weight",
      createdAt: `2026-06-${15 + index}T00:22:00.000Z`,
      id: `strategy-api-ready-${index + 1}`,
      outcomeStatus: "partial_win",
      result: "win",
      reviewStatus: "closed",
      sampleSymbols: [symbol],
      source: "daily_mover_calibration",
    }));
  }

  const result = await getDailyMoverReadArchive({ repository, limit: 3 });

  assert.equal(result.status, 200);
  assert.equal(result.body.strategyDrafts.length, 1);
  assert.equal(result.body.strategyDrafts[0]?.tag, "review_volume_oi_weight");
  assert.equal(result.body.strategyDrafts[0]?.sourceMode, "historical_sample_validation");
  assert.equal(result.body.strategyDrafts[0]?.status, "manual_review_required");
  assert.equal(result.body.strategyDrafts[0]?.manualConfirmation, "required");
  assert.equal(result.body.strategyDrafts[0]?.allowedUse, "research_only");
  assert.equal(result.body.strategyDrafts[0]?.canAutoAdjustWeights, false);
  assert.match(result.body.strategyDrafts[0]?.nextStep ?? "", /人工确认/);
});

test("getDailyMoverReadArchive degrades to an empty archive when daily mover tables are not migrated yet", async () => {
  const repository = createMemoryPersistenceRepository({
    scope: "public-neon",
  });
  const missingTableError = Object.assign(
    new Error('relation "daily_mover_snapshots" does not exist'),
    { code: "42P01" },
  );
  const repositoryWithoutDailyMoverTables = {
    ...repository,
    mode: "database" as const,
    async getDailyMoverSnapshot() {
      throw missingTableError;
    },
    async listDailyMoverSnapshots() {
      throw missingTableError;
    },
  };

  const result = await getDailyMoverReadArchive({
    repository: repositoryWithoutDailyMoverTables,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.latestSnapshot, null);
  assert.equal(result.body.selectedSnapshot, null);
  assert.equal(result.body.selectedCorrelation, null);
  assert.deepEqual(result.body.snapshots, []);
  assert.equal(result.body.retention.storage, "database");
  assert.equal(result.body.retention.returned, 0);
});

test("getDailyMoverReadArchive returns 404 for a missing requested snapshot without hiding recent samples", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));

  const result = await getDailyMoverReadArchive({
    id: "missing-snapshot",
    repository,
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error, "daily_mover_snapshot_not_found");
  assert.equal(result.body.snapshots[0]?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.selectedSnapshot, null);
});

test("normalizeDailyMoverReadLimit defaults and clamps public read volume", () => {
  assert.equal(normalizeDailyMoverReadLimit(undefined), 14);
  assert.equal(normalizeDailyMoverReadLimit("abc"), 14);
  assert.equal(normalizeDailyMoverReadLimit("0"), 1);
  assert.equal(normalizeDailyMoverReadLimit(100), 30);
  assert.equal(normalizeDailyMoverReadLimit("9"), 9);
});
