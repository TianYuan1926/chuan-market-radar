import type { JournalEvent, StrategyWeightChangeExecutionRecord } from "@/lib/analysis/types";

export type StrategyWeightShadowStatus =
  | "blocked"
  | "collecting"
  | "rollback_watch"
  | "shadow_ready";

export type StrategyWeightShadowDirection = StrategyWeightChangeExecutionRecord["direction"];

export type StrategyWeightShadowWeight = {
  label: string;
  tag: string;
  weight: number;
};

export type StrategyWeightShadowDiff = {
  baseWeight: number;
  canAffectLiveSignals: false;
  delta: number;
  direction: StrategyWeightShadowDirection;
  label: string;
  latestRecordAt: string;
  latestRecordId: string;
  shadowWeight: number;
  tag: string;
  versionLabel: string;
};

export type StrategyWeightShadowReport = {
  allowedUse: "research_only";
  approvedRecordCount: number;
  baseWeights: StrategyWeightShadowWeight[];
  canAffectLiveSignals: false;
  canAutoAdjustWeights: false;
  diffs: StrategyWeightShadowDiff[];
  guardrail: string;
  ignoredRecordCount: number;
  mode: "strategy_weight_shadow_readonly_mvp";
  nextStep: string;
  shadowWeights: StrategyWeightShadowWeight[];
  status: StrategyWeightShadowStatus;
};

const baseWeight = 100;

const labelsByTag: Record<string, string> = {
  review_funding_pressure: "资金费率复核",
  review_short_side_detection: "空头识别复核",
  review_universe_coverage: "币池覆盖复核",
  review_volume_oi_weight: "成交量/OI 权重复核",
};

const directionOrder: Record<StrategyWeightShadowDirection, number> = {
  quarantine: 0,
  decrease: 1,
  increase: 2,
};

function labelFor(tag: string) {
  return labelsByTag[tag] ?? tag.replace(/^review_/, "").replace(/_/g, " ");
}

function sortableTime(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function isStrategyWeightExecutionEvent(event: JournalEvent): event is JournalEvent & {
  strategyWeightChange: StrategyWeightChangeExecutionRecord;
} {
  return event.action === "strategy_weight_change_execution" &&
    event.source === "strategy_weight_change_execution" &&
    event.allowedUse === "research_only" &&
    event.canAutoAdjustWeights === false &&
    event.strategyWeightChange?.canExecuteWeightChange === false &&
    Boolean(event.strategyWeightChange.tag);
}

function latestApprovedRecords(events: JournalEvent[]) {
  const executionEvents = events
    .filter(isStrategyWeightExecutionEvent)
    .sort((left, right) => sortableTime(right.createdAt) - sortableTime(left.createdAt));
  const recordsByTag = new Map<string, JournalEvent & {
    strategyWeightChange: StrategyWeightChangeExecutionRecord;
  }>();

  for (const event of executionEvents) {
    const change = event.strategyWeightChange;

    if (recordsByTag.has(change.tag) || change.approvalStatus !== "approved") {
      continue;
    }

    recordsByTag.set(change.tag, event);
  }

  return {
    approvedRecords: [...recordsByTag.values()],
    executionRecordCount: executionEvents.length,
  };
}

function shadowWeightFor(direction: StrategyWeightShadowDirection) {
  if (direction === "increase") {
    return 110;
  }

  if (direction === "decrease") {
    return 90;
  }

  return 0;
}

function statusFor(diffs: StrategyWeightShadowDiff[]): StrategyWeightShadowStatus {
  if (diffs.length === 0) {
    return "collecting";
  }

  if (diffs.some((diff) => diff.direction === "quarantine")) {
    return "blocked";
  }

  if (diffs.some((diff) => diff.direction === "decrease")) {
    return "rollback_watch";
  }

  return "shadow_ready";
}

function nextStep(status: StrategyWeightShadowStatus) {
  if (status === "blocked") {
    return "影子权重包含隔离候选，只能保留为观察和失败路径复核，不能进入真实权重。";
  }

  if (status === "rollback_watch") {
    return "影子权重包含降权候选，先进入回滚观察，用后续 outcome 样本验证。";
  }

  if (status === "shadow_ready") {
    return "影子权重已可观察，但仍不影响真实扫描判断，下一步等待影子表现验证。";
  }

  return "继续积累人工执行记录，暂不形成影子权重差异。";
}

export function buildStrategyWeightShadowReport(events: JournalEvent[]): StrategyWeightShadowReport {
  const { approvedRecords, executionRecordCount } = latestApprovedRecords(events);
  const diffs = approvedRecords
    .map<StrategyWeightShadowDiff>((event) => {
      const change = event.strategyWeightChange;
      const shadowWeight = shadowWeightFor(change.direction);

      return {
        baseWeight,
        canAffectLiveSignals: false,
        delta: shadowWeight - baseWeight,
        direction: change.direction,
        label: labelFor(change.tag),
        latestRecordAt: event.createdAt,
        latestRecordId: event.id,
        shadowWeight,
        tag: change.tag,
        versionLabel: change.versionLabel,
      };
    })
    .sort((left, right) => (
      directionOrder[left.direction] - directionOrder[right.direction] ||
      left.label.localeCompare(right.label, "zh-CN")
    ));
  const status = statusFor(diffs);

  return {
    allowedUse: "research_only",
    approvedRecordCount: approvedRecords.length,
    baseWeights: diffs.map((diff) => ({
      label: diff.label,
      tag: diff.tag,
      weight: diff.baseWeight,
    })),
    canAffectLiveSignals: false,
    canAutoAdjustWeights: false,
    diffs,
    guardrail: "影子策略权重只读展示人工审批后的假设差异，不影响真实扫描、真实评分或真实策略权重。",
    ignoredRecordCount: executionRecordCount - approvedRecords.length,
    mode: "strategy_weight_shadow_readonly_mvp",
    nextStep: nextStep(status),
    shadowWeights: diffs.map((diff) => ({
      label: diff.label,
      tag: diff.tag,
      weight: diff.shadowWeight,
    })),
    status,
  };
}
