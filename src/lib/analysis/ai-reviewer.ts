import type {
  AiReviewBoundary,
  AiReviewSections,
  AiSignalReview,
  EvidencePoint,
  MarketSignal,
  StrategyPlan,
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

export type AiReviewEnv = Partial<{
  AI_REVIEW_ENABLED: string;
  AI_PROVIDER: string;
  AI_API_KEY: string;
  AI_BASE_URL: string;
  AI_MODEL: string;
  AI_REVIEW_MAX_PROMPT_CHARS: string;
  AI_REVIEW_MAX_SIGNALS: string;
}>;

export type AiReviewPromptPayload = {
  signal: Pick<
    MarketSignal,
    | "confidence"
    | "direction"
    | "exchange"
    | "id"
    | "regime"
    | "risk"
    | "state"
    | "summary"
    | "symbol"
    | "timeframe"
    | "updatedAt"
  > & {
    strategy: Pick<
      StrategyPlan,
      | "bias"
      | "entry"
      | "invalidation"
      | "targets"
      | "riskReward"
      | "positionHint"
      | "status"
      | "noChase"
      | "confirmation"
      | "counterEvidence"
      | "riskControls"
    >;
  };
  evidence: EvidencePoint[];
  snapshot: AiReviewSnapshotMetadata;
};

export type AiReviewPrompt = {
  system: string;
  user: string;
  payload: AiReviewPromptPayload;
  payloadJson: string;
};

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
  context: AiReviewContext;
  env?: AiReviewEnv;
  fetcher?: AiReviewFetch;
  now?: () => Date;
};

const disabledSections: AiReviewSections = {
  fact: "AI 复核未启用。",
  reasoning: "当前仅使用规则引擎和结构化证据。",
  judgment: "不把 AI 作为最终裁决。",
  strategy: "继续按规则策略和触发条件处理。",
  failurePath: "AI 不可用时不能补充额外失败路径。",
  uncertainty: "缺少模型反证复核。",
};

const fallbackSections: AiReviewSections = {
  fact: "AI 复核失败。",
  reasoning: "模型请求或解析失败，系统已回落到规则引擎。",
  judgment: "不使用失败的模型输出。",
  strategy: "继续按规则策略和反证清单执行。",
  failurePath: "若规则证据被破坏，则按原失效条件处理。",
  uncertainty: "本轮缺少可审计 AI 复核。",
};

const defaultMaxPromptChars = 12_000;
const defaultMaxSignalsPerSnapshot = 3;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function maxPromptCharsFrom(env: AiReviewEnv) {
  return positiveInteger(env.AI_REVIEW_MAX_PROMPT_CHARS, defaultMaxPromptChars);
}

function maxSignalsFrom(env: AiReviewEnv) {
  return Math.min(8, positiveInteger(env.AI_REVIEW_MAX_SIGNALS, defaultMaxSignalsPerSnapshot));
}

function aiReviewBoundary({
  costStatus = "disabled",
  maxPromptChars = defaultMaxPromptChars,
  maxSignalsPerSnapshot = defaultMaxSignalsPerSnapshot,
  model,
  promptChars,
  provider,
  reason,
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
      tag: "ai_counter_evidence_review",
    },
    summary: "AI 只做反证复核和不确定性说明，不能覆盖规则引擎、不能改排序、不能生成交易信号。",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const joined = value.filter((item): item is string => typeof item === "string").join("；");

    return joined || fallback;
  }

  return fallback;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    );
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boundedConfidenceAdjustment(value: unknown) {
  const numeric = numberValue(value);

  if (numeric === undefined) {
    return undefined;
  }

  return Math.max(-25, Math.min(25, Math.round(numeric)));
}

function cleanJsonText(text: string) {
  const withoutFence = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return withoutFence;
  }

  return withoutFence.slice(firstBrace, lastBrace + 1);
}

function sanitizeStrategy(strategy: StrategyPlan) {
  return {
    bias: strategy.bias,
    entry: strategy.entry,
    invalidation: strategy.invalidation,
    targets: strategy.targets,
    riskReward: strategy.riskReward,
    positionHint: strategy.positionHint,
    status: strategy.status,
    noChase: strategy.noChase,
    confirmation: strategy.confirmation,
    counterEvidence: strategy.counterEvidence,
    riskControls: strategy.riskControls,
  };
}

function sanitizeSignal(signal: MarketSignal): AiReviewPromptPayload["signal"] {
  return {
    id: signal.id,
    symbol: signal.symbol,
    exchange: signal.exchange,
    direction: signal.direction,
    state: signal.state,
    timeframe: signal.timeframe,
    regime: signal.regime,
    confidence: signal.confidence,
    risk: signal.risk,
    updatedAt: signal.updatedAt,
    summary: signal.summary,
    strategy: sanitizeStrategy(signal.strategy),
  };
}

function sanitizeEvidence(evidence: EvidencePoint[]) {
  return evidence.map((item) => ({
    label: item.label,
    value: item.value,
    layer: item.layer,
    polarity: item.polarity,
  }));
}

function sanitizeSnapshotMetadata(metadata: AiReviewSnapshotMetadata = {}): AiReviewSnapshotMetadata {
  return {
    id: metadata.id,
    source: metadata.source,
    status: metadata.status,
    generatedAt: metadata.generatedAt,
    cadenceMinutes: metadata.cadenceMinutes,
    scannedCount: metadata.scannedCount,
    anomalyCount: metadata.anomalyCount,
    candidateCount: metadata.candidateCount,
    riskGate: metadata.riskGate,
    notes: metadata.notes,
    coverage: metadata.coverage
      ? {
          coveragePercent: metadata.coverage.coveragePercent,
          eligible: metadata.coverage.eligible,
          pending: metadata.coverage.pending,
          scanned: metadata.coverage.scanned,
          total: metadata.coverage.total,
        }
      : undefined,
  };
}

export function buildAiReviewPrompt(signal: MarketSignal, context: AiReviewContext): AiReviewPrompt {
  const payload: AiReviewPromptPayload = {
    signal: sanitizeSignal(signal),
    evidence: sanitizeEvidence(signal.evidence),
    snapshot: sanitizeSnapshotMetadata(context.metadata),
  };
  const payloadJson = JSON.stringify(payload, null, 2);
	  const system = [
	    "你是川 Market Radar 的 AI 反证复核层，必须先找反证，再给结论。",
	    "你只能使用用户 payload 中的结构化 JSON，不得编造新闻、链上数据、盘口数据或未接入的数据源。",
	    "你的作用是复核和解释，不是最终裁决；规则引擎和用户纪律仍然优先。",
	    "你不得新增买卖方向、不得改变信号置信度、不得覆盖 Risk Gate 或失效条件。",
	    "返回 JSON，不要返回 Markdown。",
	  ].join("\n");
  const user = [
    "Review this market signal with counter-evidence first.",
    "Return JSON keys: counterEvidence, fact, reasoning, judgment, strategy, failurePath, uncertainty, confidenceAdjustment.",
    "Payload:",
    payloadJson,
  ].join("\n\n");

  return {
    system,
    user,
    payload,
    payloadJson,
  };
}

export function disabledAiReview(reason: string, boundaryInput: AiReviewBoundaryInput = {}): AiSignalReview {
  return {
    status: "disabled",
    boundary: aiReviewBoundary({
      costStatus: reason.includes("API_KEY") ? "missing_key" : "disabled",
      reason,
      ...boundaryInput,
    }),
    reason,
    counterEvidence: [`AI 复核未启用：${reason}`],
    sections: disabledSections,
  };
}

function fallbackAiReview(
  reason: string,
  provider?: string,
  model?: string,
  boundaryInput: AiReviewBoundaryInput = {},
): AiSignalReview {
  return {
    status: "fallback",
    boundary: aiReviewBoundary({
      costStatus: "fallback",
      model,
      provider,
      reason,
      ...boundaryInput,
    }),
    reason,
    provider,
    model,
    counterEvidence: ["AI 复核失败，当前只采用规则引擎反证和风险控制。"],
    sections: fallbackSections,
  };
}

export function parseAiReviewResponse(
  text: string,
  meta: Pick<AiSignalReview, "provider" | "model" | "reviewedAt"> & {
    boundary?: AiReviewBoundary;
  } = {},
): AiSignalReview {
  try {
    const parsed = asRecord(JSON.parse(cleanJsonText(text)));

    return {
      status: "reviewed",
      boundary: meta.boundary ?? aiReviewBoundary({
        costStatus: "within_budget",
        model: meta.model,
        provider: meta.provider,
      }),
      provider: meta.provider,
      model: meta.model,
      reviewedAt: meta.reviewedAt,
      counterEvidence: stringArray(parsed.counterEvidence),
      sections: {
        fact: textValue(parsed.fact, "模型未提供事实层。"),
        reasoning: textValue(parsed.reasoning, "模型未提供推理层。"),
        judgment: textValue(parsed.judgment, "模型未提供判断层。"),
        strategy: textValue(parsed.strategy, "模型未提供策略层。"),
        failurePath: textValue(parsed.failurePath, "模型未提供失败路径。"),
        uncertainty: textValue(parsed.uncertainty, "模型未提供不确定性。"),
      },
      confidenceAdjustment: boundedConfidenceAdjustment(parsed.confidenceAdjustment),
    };
  } catch (error) {
    return fallbackAiReview(error instanceof Error ? error.message : "AI response parse failed", meta.provider, meta.model, {
      ...meta.boundary?.cost,
      costStatus: "fallback",
    });
  }
}

function modelContent(responsePayload: unknown) {
  const payload = asRecord(responsePayload);
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const content = message.content;

  if (typeof content === "string") {
    return content;
  }

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  return undefined;
}

export async function reviewSignalWithAi({
  signal,
  context,
  env = {},
  fetcher = fetch,
  now = () => new Date(),
}: ReviewSignalWithAiOptions): Promise<AiSignalReview> {
  const provider = env.AI_PROVIDER ?? "openai-compatible";
  const model = env.AI_MODEL ?? "gpt-4.1-mini";
  const baseUrl = env.AI_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
  const maxPromptChars = maxPromptCharsFrom(env);
  const maxSignalsPerSnapshot = maxSignalsFrom(env);

  if (env.AI_REVIEW_ENABLED !== "true") {
    return disabledAiReview("AI_REVIEW_ENABLED is not true", {
      maxPromptChars,
      maxSignalsPerSnapshot,
      model,
      provider,
    });
  }

  if (!env.AI_API_KEY) {
    return disabledAiReview("AI_API_KEY is missing", {
      maxPromptChars,
      maxSignalsPerSnapshot,
      model,
      provider,
    });
  }

  const prompt = buildAiReviewPrompt(signal, context);
  const promptChars = prompt.user.length + prompt.system.length;

  if (promptChars > maxPromptChars) {
    return disabledAiReview("AI review prompt exceeds budget guard", {
      costStatus: "over_budget",
      maxPromptChars,
      maxSignalsPerSnapshot,
      model,
      promptChars,
      provider,
    });
  }
  const boundary = aiReviewBoundary({
    costStatus: "within_budget",
    maxPromptChars,
    maxSignalsPerSnapshot,
    model,
    promptChars,
    provider,
  });

  try {
    const response = await fetcher(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return fallbackAiReview(`model request failed with ${response.status}`, provider, model, {
        ...boundary.cost,
        costStatus: "fallback",
      });
    }

    const content = modelContent(await response.json());

    if (!content) {
      return fallbackAiReview("model response did not include message content", provider, model, {
        ...boundary.cost,
        costStatus: "fallback",
      });
    }

    return parseAiReviewResponse(content, {
      boundary,
      provider,
      model,
      reviewedAt: now().toISOString(),
    });
  } catch (error) {
    return fallbackAiReview(error instanceof Error ? error.message : "model request failed", provider, model, {
      ...boundary.cost,
      costStatus: "fallback",
    });
  }
}
