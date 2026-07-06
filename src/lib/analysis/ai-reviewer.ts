import type {
  AiReviewBoundary,
  AiReviewSections,
  AiSignalReview,
  MarketSignal,
} from "./types";

export type AiReviewSnapshotMetadata = {
  id?: string;
  source?: string;
  status?: string;
  generatedAt?: string;
  cadenceMinutes?: number;
  scannedCount?: number;
  anomalyCount?: number;
  candidateCount?: number;
  riskGate?: "on" | "off";
  notes?: string[];
  coverage?: {
    coveragePercent?: number;
    eligible?: number;
    pending?: number;
    scanned?: number;
    total?: number;
  };
};

export type AiReviewContext = {
  metadata: AiReviewSnapshotMetadata;
};

export type AiReviewEnv = Record<string, string | undefined>;
export type AiReviewFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type AiReviewBoundaryInput = Partial<{
  costStatus: AiReviewBoundary["cost"]["status"];
  maxPromptChars: number;
  maxSignalsPerSnapshot: number;
  model: string;
  promptChars: number;
  provider: string;
  reason: string;
}>;

export type ReviewSignalWithAiOptions = {
  signal: MarketSignal;
  context?: AiReviewContext;
  env?: AiReviewEnv;
  fetcher?: AiReviewFetch;
  now?: () => Date;
};

const ruleProvider = "rule-engine";
const ruleModel = "deterministic-counter-review-v1";
const disabledReason = "external AI disabled by product decision";

const disabledSections: AiReviewSections = {
  fact: "外部 AI 复核已取消。",
  reasoning: "当前仅使用规则引擎、结构化证据和复盘样本边界。",
  judgment: "不接入模型，不把 AI 作为最终裁决。",
  strategy: "继续按规则策略、触发条件、风控门禁和失效条件处理。",
  failurePath: "规则证据不足、结构失效或结构盈亏比不足时，必须降级观察或失效。",
  uncertainty: "规则反证不能替代长期回测样本和人工复盘。",
};

function aiReviewBoundary({
  costStatus = "disabled",
  maxPromptChars = 0,
  maxSignalsPerSnapshot = Number.MAX_SAFE_INTEGER,
  model = ruleModel,
  promptChars = 0,
  provider = ruleProvider,
  reason = disabledReason,
}: AiReviewBoundaryInput = {}): AiReviewBoundary {
  return {
    allowedUse: "counter_evidence_review_only",
    canAutoExecute: false,
    canCreateTradeSignal: false,
    canMutateLiveRanking: false,
    canOverrideDecision: false,
    cost: {
      maxPromptChars,
      maxSignalsPerSnapshot,
      model,
      promptChars,
      provider,
      reason,
      status: costStatus,
    },
    replayCalibration: {
      allowedUse: "manual_replay_calibration_only",
      canAutoAdjustWeights: false,
      requiresOutcomeSample: true,
      tag: "rule_counter_evidence_review",
    },
    summary: "外部 AI 已取消；当前只做代码规则反证复核和不确定性说明，不能覆盖规则引擎、不能改排序、不能生成交易计划。",
  };
}

function evidenceIdFor(signal: MarketSignal, index: number) {
  return `${signal.id}:evidence:${index}`;
}

export function disabledAiReview(reason: string, boundaryInput: AiReviewBoundaryInput = {}): AiSignalReview {
  return {
    status: "disabled",
    boundary: aiReviewBoundary({
      costStatus: "disabled",
      reason,
      ...boundaryInput,
    }),
    reason,
    counterEvidence: [`规则反证未执行：${reason}`],
    sections: disabledSections,
  };
}

function pushUnique(items: string[], value: string | undefined) {
  const normalized = value?.trim();

  if (normalized && !items.includes(normalized)) {
    items.push(normalized);
  }
}

function ruleCounterEvidence(signal: MarketSignal) {
  const evidence: string[] = [];

  for (const item of signal.evidence) {
    if (item.polarity === "conflicting" || item.polarity === "blocking") {
      pushUnique(evidence, `${item.label}：${item.value}`);
    }
  }

  for (const item of signal.strategy.counterEvidence ?? []) {
    pushUnique(evidence, item);
  }

  for (const item of signal.strategy.riskControls ?? []) {
    pushUnique(evidence, `风控：${item}`);
  }

  if (signal.strategy.noChase) {
    pushUnique(evidence, "禁止追单：当前位置已经不适合直接追入。");
  }

  if (signal.strategy.riskReward > 0 && signal.strategy.riskReward < 3) {
    pushUnique(evidence, `结构盈亏比不足：当前 ${signal.strategy.riskReward.toFixed(2)}:1，低于 3:1 下限。`);
  }

  if (signal.risk === "blocked" || signal.risk === "high") {
    pushUnique(evidence, `风险等级偏高：${signal.risk}。`);
  }

  if (signal.state === "invalidated") {
    pushUnique(evidence, "结构已失效：不得继续按原信号处理。");
  }

  return evidence.slice(0, 8);
}

function ruleReviewSections(signal: MarketSignal, counterEvidence: string[]): AiReviewSections {
  const hasCounter = counterEvidence.length > 0;

  return {
    fact: hasCounter
      ? `规则反证发现 ${counterEvidence.length} 条风险或反向证据。`
      : "规则反证未发现明确硬伤。",
    reasoning: "复核只使用当前观察对象的结构化证据、策略反证、风控项、结构盈亏比和成熟度，不读取外部模型。",
    judgment: hasCounter
      ? "需要继续按风控门禁和触发条件等待，不能因为单一信号直接行动。"
      : "可维持原规则引擎判断，但仍不能绕过结构盈亏比、关键位和失效条件。",
    strategy: signal.strategy.status === "actionable"
      ? "只有触发条件、止损、目标和失效条件同时满足时，交易计划才可进入人工复核。"
      : "当前优先观察或等待确认，不生成额外方向。",
    failurePath: signal.strategy.invalidation || "若关键结构失效、结构盈亏比降低或风险门禁触发，则观察失效。",
    uncertainty: "规则反证不能替代回测样本和人工复盘；异常案例仍需进入复盘进化系统。",
  };
}

export async function reviewSignalWithRules({
  signal,
  now = () => new Date(),
}: ReviewSignalWithAiOptions): Promise<AiSignalReview> {
  const evidenceIds = signal.evidence.map((_, index) => evidenceIdFor(signal, index));
  const counterEvidence = ruleCounterEvidence(signal);

  return {
    status: "reviewed",
    boundary: aiReviewBoundary({
      costStatus: "within_budget",
      reason: disabledReason,
    }),
    counterEvidence,
    sections: ruleReviewSections(signal, counterEvidence),
    provider: ruleProvider,
    model: ruleModel,
    reviewedAt: now().toISOString(),
    confidenceAdjustment: counterEvidence.length > 0 ? -5 : 0,
    evidenceIds,
    referencedEvidenceIds: evidenceIds,
    signalId: signal.id,
  };
}

export async function reviewSignalWithAi(options: ReviewSignalWithAiOptions): Promise<AiSignalReview> {
  return reviewSignalWithRules(options);
}
