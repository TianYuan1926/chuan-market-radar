import type { JournalEvent } from "@/lib/analysis/types";
import type { DailyMoverReview, DailyMoverSnapshot } from "./daily-movers";
import type { ScanArchiveSummary, ScanReplayFrame, ScanReplaySignal } from "./types";

export type DailyMoverCorrelationStatus =
  | "caught_with_journal"
  | "caught_unreviewed"
  | "missed_with_evidence"
  | "not_learnable"
  | "unlinked";

export type DailyMoverLinkedSignal = {
  id: string;
  scanId: string;
  symbol: string;
  state: ScanReplaySignal["state"];
  confidence: number;
  strategyStatus: ScanReplaySignal["strategyStatus"];
  generatedAt: string;
};

export type DailyMoverCorrelationLink = {
  moverId: string;
  symbol: string;
  direction: DailyMoverReview["direction"];
  radarStatus: DailyMoverReview["radarReview"]["status"];
  learnability: DailyMoverReview["attribution"]["learnability"];
  status: DailyMoverCorrelationStatus;
  matchedScanIds: string[];
  matchedSignalIds: string[];
  journalEventIds: string[];
  linkedSignals: DailyMoverLinkedSignal[];
  journalActions: NonNullable<JournalEvent["action"]>[];
  improvementTags: string[];
  calibrationCandidate: boolean;
  suggestedNextStep: string;
};

export type DailyMoverSnapshotCorrelationSummary = {
  caught: number;
  missed: number;
  notLearnable: number;
  scanLinked: number;
  journalLinked: number;
  calibrationCandidates: number;
};

export type DailyMoverSnapshotCorrelation = {
  snapshotId: string;
  observedAt: string;
  summary: DailyMoverSnapshotCorrelationSummary;
  links: DailyMoverCorrelationLink[];
};

export type BuildDailyMoverSnapshotCorrelationInput = {
  journalEvents: JournalEvent[];
  replayFrames: ScanReplayFrame[];
  scanArchives: ScanArchiveSummary[];
  snapshot: DailyMoverSnapshot;
};

function baseSymbol(symbol: string) {
  return symbol
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(USDT|USDC|USD|PERP)$/u, "");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function matchesSymbol(left: string, right: string) {
  return baseSymbol(left) === baseSymbol(right);
}

function matchingSignals(review: DailyMoverReview, replayFrames: ScanReplayFrame[]) {
  const matchedIds = new Set(review.radarReview.matchedSignalIds);

  return replayFrames.flatMap((frame) => (
    frame.signals
      .filter((signal) => matchedIds.has(signal.id) || matchesSymbol(signal.symbol, review.symbol))
      .map((signal): DailyMoverLinkedSignal => ({
        id: signal.id,
        scanId: frame.id,
        symbol: signal.symbol,
        state: signal.state,
        confidence: signal.confidence,
        strategyStatus: signal.strategyStatus,
        generatedAt: frame.generatedAt,
      }))
  ));
}

function matchingScanSummaryIds(review: DailyMoverReview, scanArchives: ScanArchiveSummary[]) {
  return scanArchives
    .filter((archive) => archive.topSymbols.some((symbol) => matchesSymbol(symbol, review.symbol)))
    .map((archive) => archive.id);
}

function matchingJournalEvents(review: DailyMoverReview, journalEvents: JournalEvent[]) {
  const matchedIds = new Set(review.radarReview.matchedSignalIds);

  return journalEvents.filter((event) => (
    matchesSymbol(event.symbol, review.symbol)
    || (event.signalId ? matchedIds.has(event.signalId) : false)
  ));
}

function correlationStatus(
  review: DailyMoverReview,
  matchedScanIds: string[],
  journalEventIds: string[],
): DailyMoverCorrelationStatus {
  if (review.radarReview.status === "not_learnable" || review.attribution.learnability === "not_learnable") {
    return "not_learnable";
  }

  if (matchedScanIds.length > 0 && journalEventIds.length > 0) {
    return "caught_with_journal";
  }

  if (matchedScanIds.length > 0) {
    return "caught_unreviewed";
  }

  if (review.radarReview.status === "missed" && review.radarReview.improvementTags.length > 0) {
    return "missed_with_evidence";
  }

  return "unlinked";
}

function suggestedNextStep(status: DailyMoverCorrelationStatus) {
  return {
    caught_unreviewed: "补一条复盘日记，验证前兆是否真实有效。",
    caught_with_journal: "纳入命中样本，继续复核日记 outcome。",
    missed_with_evidence: "纳入规则校准候选，检查覆盖率、成交量和 OI 权重。",
    not_learnable: "保留为反例，不调高规则权重。",
    unlinked: "先检查扫描覆盖和样本质量。",
  }[status];
}

function summarizeLinks(links: DailyMoverCorrelationLink[]): DailyMoverSnapshotCorrelationSummary {
  return {
    caught: links.filter((link) => link.radarStatus === "caught").length,
    missed: links.filter((link) => link.radarStatus === "missed").length,
    notLearnable: links.filter((link) => link.radarStatus === "not_learnable").length,
    scanLinked: links.filter((link) => link.matchedScanIds.length > 0).length,
    journalLinked: links.filter((link) => link.journalEventIds.length > 0).length,
    calibrationCandidates: links.filter((link) => link.calibrationCandidate).length,
  };
}

export function buildDailyMoverSnapshotCorrelation({
  journalEvents,
  replayFrames,
  scanArchives,
  snapshot,
}: BuildDailyMoverSnapshotCorrelationInput): DailyMoverSnapshotCorrelation {
  const links = snapshot.reviews.map((review): DailyMoverCorrelationLink => {
    const linkedSignals = matchingSignals(review, replayFrames);
    const journalMatches = matchingJournalEvents(review, journalEvents);
    const matchedScanIds = unique([
      ...linkedSignals.map((signal) => signal.scanId),
      ...matchingScanSummaryIds(review, scanArchives),
    ]);
    const matchedSignalIds = unique([
      ...review.radarReview.matchedSignalIds,
      ...linkedSignals.map((signal) => signal.id),
    ]);
    const journalEventIds = unique(journalMatches.map((event) => event.id));
    const status = correlationStatus(review, matchedScanIds, journalEventIds);
    const calibrationCandidate = status === "missed_with_evidence"
      && review.attribution.learnability !== "not_learnable";

    return {
      moverId: review.id,
      symbol: review.symbol,
      direction: review.direction,
      radarStatus: review.radarReview.status,
      learnability: review.attribution.learnability,
      status,
      matchedScanIds,
      matchedSignalIds,
      journalEventIds,
      linkedSignals,
      journalActions: unique(journalMatches.map((event) => event.action).filter((action): action is NonNullable<JournalEvent["action"]> => Boolean(action))),
      improvementTags: review.radarReview.improvementTags,
      calibrationCandidate,
      suggestedNextStep: suggestedNextStep(status),
    };
  });

  return {
    snapshotId: snapshot.id,
    observedAt: snapshot.observedAt,
    summary: summarizeLinks(links),
    links,
  };
}
