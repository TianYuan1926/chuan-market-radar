import type { JournalEvent } from "@/lib/analysis/types";

export type V3PatternReviewBucketStatus =
  | "collecting"
  | "mixed"
  | "promising_context"
  | "risk_context";

export type V3PatternReviewStatsStatus =
  | "collecting"
  | "empty"
  | "review_ready";

export type V3PatternReviewBucket = {
  closedSamples: number;
  expiredSamples: number;
  label: string;
  pendingSamples: number;
  rejectedSamples: number;
  sampleCount: number;
  status: V3PatternReviewBucketStatus;
  tag: string;
  validationRatePercent: number;
  validatedSamples: number;
};

export type V3PatternReviewStatsReport = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  closedSamples: number;
  guardrail: string;
  mode: "v3_pattern_trade_review_stats_mvp";
  nextStep: string;
  patternBuckets: V3PatternReviewBucket[];
  pendingSamples: number;
  sampleCount: number;
  status: V3PatternReviewStatsStatus;
  topPattern: V3PatternReviewBucket | null;
  tradePlanBuckets: V3PatternReviewBucket[];
};

type OutcomeBucket = "expired" | "pending" | "rejected" | "validated";
type TagKind = "pattern" | "trade";

const minimumClosedSamplesForReview = 5;

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function outcomeBucket(event: JournalEvent): OutcomeBucket {
  if (event.outcomeStatus === "expired") {
    return "expired";
  }

  if (event.outcomeStatus === "loss" || event.result === "loss") {
    return "rejected";
  }

  if (
    event.outcomeStatus === "partial_win" ||
    event.outcomeStatus === "saved" ||
    event.result === "win" ||
    event.result === "saved"
  ) {
    return "validated";
  }

  return "pending";
}

function extractTags(event: JournalEvent, kind: TagKind) {
  const prefix = kind === "pattern" ? "v3_pattern_" : "v3_trade_";

  return [...new Set((event.lessons ?? [])
    .filter((lesson) => lesson.startsWith(prefix))
    .map((lesson) => lesson.slice(prefix.length))
    .filter((tag) => tag.length > 0 && tag !== "context"))];
}

function labelFor(kind: TagKind, tag: string) {
  const patternLabels: Record<string, string> = {
    DOUBLE_BOTTOM: "双底",
    DOUBLE_TOP: "双顶",
  };
  const tradeLabels: Record<string, string> = {
    BLOCKED: "计划阻断",
    READY_LONG: "多头就绪",
    READY_SHORT: "空头就绪",
    WAIT_PULLBACK: "等待回踩",
    WAIT_RETEST: "等待反抽",
    WATCH_ONLY: "只观察",
  };

  return (kind === "pattern" ? patternLabels[tag] : tradeLabels[tag]) ?? tag.replaceAll("_", " ");
}

function bucketStatus({
  closedSamples,
  rejectedSamples,
  validationRatePercent,
  validatedSamples,
}: {
  closedSamples: number;
  rejectedSamples: number;
  validationRatePercent: number;
  validatedSamples: number;
}): V3PatternReviewBucketStatus {
  if (closedSamples < minimumClosedSamplesForReview) {
    return "collecting";
  }

  if (rejectedSamples >= validatedSamples && rejectedSamples >= 2) {
    return "risk_context";
  }

  if (validationRatePercent >= 60 && validatedSamples >= rejectedSamples) {
    return "promising_context";
  }

  return "mixed";
}

function buildBuckets(events: JournalEvent[], kind: TagKind) {
  const buckets = new Map<string, JournalEvent[]>();

  for (const event of events) {
    for (const tag of extractTags(event, kind)) {
      buckets.set(tag, [...(buckets.get(tag) ?? []), event]);
    }
  }

  return [...buckets.entries()]
    .map(([tag, taggedEvents]): V3PatternReviewBucket => {
      const counts = taggedEvents.reduce<Record<OutcomeBucket, number>>((current, event) => {
        current[outcomeBucket(event)] += 1;

        return current;
      }, {
        expired: 0,
        pending: 0,
        rejected: 0,
        validated: 0,
      });
      const closedSamples = counts.expired + counts.rejected + counts.validated;
      const validationRatePercent = percent(counts.validated, closedSamples);

      return {
        closedSamples,
        expiredSamples: counts.expired,
        label: labelFor(kind, tag),
        pendingSamples: counts.pending,
        rejectedSamples: counts.rejected,
        sampleCount: taggedEvents.length,
        status: bucketStatus({
          closedSamples,
          rejectedSamples: counts.rejected,
          validatedSamples: counts.validated,
          validationRatePercent,
        }),
        tag,
        validationRatePercent,
        validatedSamples: counts.validated,
      };
    })
    .sort((left, right) =>
      right.sampleCount - left.sampleCount ||
      right.validationRatePercent - left.validationRatePercent ||
      left.tag.localeCompare(right.tag)
    );
}

function reportStatus(sampleCount: number, closedSamples: number): V3PatternReviewStatsStatus {
  if (sampleCount === 0) {
    return "empty";
  }

  if (closedSamples < minimumClosedSamplesForReview) {
    return "collecting";
  }

  return "review_ready";
}

function nextStepFor(status: V3PatternReviewStatsStatus) {
  if (status === "empty") {
    return "等待带有 v3 pattern/trade 标签的复盘样本进入日记。";
  }

  if (status === "collecting") {
    return "继续收集已关闭样本，再判断形态或计划状态是否有稳定统计价值。";
  }

  return "进入人工校准复核，只能形成只读结论或人工调整候选，不能自动改权重。";
}

export function buildV3PatternReviewStats(events: JournalEvent[]): V3PatternReviewStatsReport {
  const taggedEvents = events.filter((event) =>
    extractTags(event, "pattern").length > 0 || extractTags(event, "trade").length > 0
  );
  const sampleCount = taggedEvents.length;
  const closedSamples = taggedEvents.filter((event) => {
    const bucket = outcomeBucket(event);

    return bucket === "expired" || bucket === "rejected" || bucket === "validated";
  }).length;
  const pendingSamples = sampleCount - closedSamples;
  const status = reportStatus(sampleCount, closedSamples);
  const patternBuckets = buildBuckets(taggedEvents, "pattern");
  const tradePlanBuckets = buildBuckets(taggedEvents, "trade");

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    closedSamples,
    guardrail: "v3 形态和交易计划复盘统计只能用于人工归因，不能自动改权重，不能改变实时排序，不能直接生成交易信号。",
    mode: "v3_pattern_trade_review_stats_mvp",
    nextStep: nextStepFor(status),
    patternBuckets,
    pendingSamples,
    sampleCount,
    status,
    topPattern: patternBuckets[0] ?? null,
    tradePlanBuckets,
  };
}
