import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "./types";
import {
  buildAiReviewPrompt,
  disabledAiReview,
  parseAiReviewResponse,
  reviewSignalWithAi,
} from "./ai-reviewer";

const baseSignal: MarketSignal = {
  id: "ena-ai-review",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  direction: "long",
  state: "near_trigger",
  timeframe: "15m",
  regime: "mixed",
  confidence: 76,
  risk: "medium",
  updatedAt: "2026-06-14T12:00:00.000+08:00",
  summary: "放量接近箱体上沿，但仍需要回踩确认。",
  evidence: [
    {
      label: "Volume Ratio 1.92",
      value: "量能放大但未极端。",
      layer: "price_volume",
      polarity: "supportive",
    },
    {
      label: "BTC/ETH 环境逆风",
      value: "大盘锚点不支持直接追多。",
      layer: "market_regime",
      polarity: "conflicting",
    },
  ],
  strategy: {
    bias: "long",
    entry: "回踩箱体上沿不破再考虑",
    invalidation: "跌回箱体内部",
    targets: ["前高流动性区"],
    riskReward: 3.1,
    positionHint: "等待确认，禁止追单",
  },
};

const baseContext = {
  metadata: {
    id: "scan-ai-review",
    source: "coinglass" as const,
    status: "ready" as const,
    generatedAt: "2026-06-14T12:00:00.000+08:00",
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 3,
    candidateCount: 2,
    riskGate: "on" as const,
    notes: ["coverage 12/48"],
  },
};

test("buildAiReviewPrompt sends only structured signal evidence and snapshot metadata", () => {
  const unsafeSignal = {
    ...baseSignal,
    secretExchangeToken: "super-secret-token",
  } as MarketSignal & { secretExchangeToken: string };
  const unsafeContext = {
    ...baseContext,
    apiKey: "leaky-key",
    journalEvents: [{ note: "private journal" }],
    derivatives: [{ fundingRate: 0.02 }],
  };

  const prompt = buildAiReviewPrompt(unsafeSignal, unsafeContext);

  assert.match(prompt.system, /先找反证/);
  assert.match(prompt.user, /counter-evidence first/i);
  assert.deepEqual(Object.keys(prompt.payload).sort(), ["evidence", "signal", "snapshot"].sort());
  assert.deepEqual(Object.keys(prompt.payload.signal).sort(), [
    "confidence",
    "direction",
    "exchange",
    "id",
    "regime",
    "risk",
    "state",
    "strategy",
    "summary",
    "symbol",
    "timeframe",
    "updatedAt",
  ].sort());
  assert.doesNotMatch(prompt.user, /super-secret-token|leaky-key|private journal|fundingRate/);
});

test("disabledAiReview and missing AI_API_KEY return a visible disabled boundary", async () => {
  const disabled = disabledAiReview("AI_API_KEY is missing");
  const review = await reviewSignalWithAi({
    signal: baseSignal,
    context: baseContext,
    env: { AI_REVIEW_ENABLED: "true" },
    fetcher: async () => new Response("{}"),
  });

  assert.equal(disabled.status, "disabled");
  assert.equal(review.status, "disabled");
  assert.match(review.reason ?? "", /AI_API_KEY/);
  assert.equal(review.sections.fact, "AI 复核未启用。");
});

test("reviewSignalWithAi falls back when an OpenAI-compatible model request fails", async () => {
  const review = await reviewSignalWithAi({
    signal: baseSignal,
    context: baseContext,
    env: {
      AI_REVIEW_ENABLED: "true",
      AI_API_KEY: "test-key",
      AI_BASE_URL: "https://ai.example.test/v1/chat/completions",
      AI_MODEL: "review-model",
    },
    fetcher: async () => {
      throw new Error("model offline");
    },
  });

  assert.equal(review.status, "fallback");
  assert.match(review.reason ?? "", /model offline/);
  assert.ok(review.counterEvidence.some((item: string) => item.includes("规则引擎")));
});

test("parseAiReviewResponse normalizes fact reasoning judgment strategy failure path and uncertainty", () => {
  const review = parseAiReviewResponse(JSON.stringify({
    counterEvidence: ["BTC 没有同步走强", "突破后未回踩确认"],
    fact: "ENA 放量接近箱体上沿。",
    reasoning: "量能支持观察，但大盘和触发条件不足。",
    judgment: "等待确认，不追。",
    strategy: "只在回踩不破后进入候选。",
    failurePath: "跌回箱体内部则失效。",
    uncertainty: "缺少更高周期确认。",
    confidenceAdjustment: -8,
  }));

  assert.equal(review.status, "reviewed");
  assert.deepEqual(review.counterEvidence, ["BTC 没有同步走强", "突破后未回踩确认"]);
  assert.equal(review.sections.fact, "ENA 放量接近箱体上沿。");
  assert.equal(review.sections.reasoning, "量能支持观察，但大盘和触发条件不足。");
  assert.equal(review.sections.judgment, "等待确认，不追。");
  assert.equal(review.sections.strategy, "只在回踩不破后进入候选。");
  assert.equal(review.sections.failurePath, "跌回箱体内部则失效。");
  assert.equal(review.sections.uncertainty, "缺少更高周期确认。");
  assert.equal(review.confidenceAdjustment, -8);
});

test("reviewSignalWithAi uses OpenAI-compatible chat completions without exposing the API key", async () => {
  let requestUrl = "";
  let requestBody = "";
  let authHeader = "";
  const modelAnswer = JSON.stringify({
    counterEvidence: ["资金费率拥挤度需要继续确认"],
    fact: "候选信号包含量能和结构证据。",
    reasoning: "支持证据存在，但反证要求等待触发。",
    judgment: "观察，不直接触发。",
    strategy: "等待回踩确认。",
    failurePath: "跌回突破位则失效。",
    uncertainty: "高周期确认不足。",
  });

  const review = await reviewSignalWithAi({
    signal: baseSignal,
    context: baseContext,
    env: {
      AI_REVIEW_ENABLED: "true",
      AI_API_KEY: "test-key",
      AI_BASE_URL: "https://ai.example.test/v1/chat/completions",
      AI_MODEL: "review-model",
    },
    fetcher: async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = input.toString();
      requestBody = init?.body?.toString() ?? "";
      authHeader = new Headers(init?.headers).get("authorization") ?? "";

      return new Response(JSON.stringify({
        choices: [{ message: { content: modelAnswer } }],
      }));
    },
  });

  assert.equal(requestUrl, "https://ai.example.test/v1/chat/completions");
  assert.equal(authHeader, "Bearer test-key");
  assert.match(requestBody, /review-model/);
  assert.match(requestBody, /counter-evidence first/i);
  assert.doesNotMatch(JSON.stringify(review), /test-key/);
  assert.equal(review.status, "reviewed");
  assert.equal(review.sections.failurePath, "跌回突破位则失效。");
});
