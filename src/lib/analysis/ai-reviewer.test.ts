import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "./types";
import {
  disabledAiReview,
  reviewSignalWithAi,
  reviewSignalWithRules,
} from "./ai-reviewer";

const baseSignal: MarketSignal = {
  id: "ena-rule-review",
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
    counterEvidence: ["高周期仍未完全站稳。"],
    noChase: true,
  },
};

test("disabledAiReview exposes a visible rule boundary without requiring AI config", () => {
  const review = disabledAiReview("RULE_REVIEW_MATURITY_GATE");

  assert.equal(review.status, "disabled");
  assert.equal(review.boundary.canOverrideDecision, false);
  assert.equal(review.boundary.canCreateTradeSignal, false);
  assert.equal(review.boundary.canAutoExecute, false);
  assert.equal(review.boundary.cost.provider, "rule-engine");
  assert.equal(review.boundary.cost.model, "deterministic-counter-review-v1");
  assert.match(review.sections.fact, /外部 AI 复核已取消/);
  assert.match(review.counterEvidence[0] ?? "", /规则反证未执行/);
});

test("reviewSignalWithRules reviews mature signals using deterministic counter-evidence", async () => {
  const review = await reviewSignalWithRules({
    signal: baseSignal,
    now: () => new Date("2026-06-14T12:01:00.000Z"),
  });

  assert.equal(review.status, "reviewed");
  assert.equal(review.provider, "rule-engine");
  assert.equal(review.model, "deterministic-counter-review-v1");
  assert.equal(review.reviewedAt, "2026-06-14T12:01:00.000Z");
  assert.equal(review.boundary.cost.status, "within_budget");
  assert.equal(review.boundary.canMutateLiveRanking, false);
  assert.deepEqual(review.evidenceIds, [
    "ena-rule-review:evidence:0",
    "ena-rule-review:evidence:1",
  ]);
  assert.ok(review.counterEvidence.some((item) => item.includes("BTC/ETH 环境逆风")));
  assert.ok(review.counterEvidence.some((item) => item.includes("禁止追单")));
  assert.equal(review.confidenceAdjustment, -5);
});

test("reviewSignalWithAi remains as compatibility alias but never calls external fetch", async () => {
  let called = false;
  const review = await reviewSignalWithAi({
    signal: baseSignal,
    env: {
      AI_REVIEW_ENABLED: "true",
      AI_API_KEY: "test-key",
      AI_BASE_URL: "https://ai.example.test/v1/chat/completions",
      AI_MODEL: "review-model",
    },
    fetcher: async () => {
      called = true;

      return new Response("{}");
    },
  });

  assert.equal(called, false);
  assert.equal(review.status, "reviewed");
  assert.equal(review.provider, "rule-engine");
  assert.equal(review.boundary.cost.reason, "external AI disabled by product decision");
  assert.doesNotMatch(JSON.stringify(review), /test-key|ai\.example|review-model/);
});

test("rule review blocks weak RR through counter-evidence instead of model output", async () => {
  const review = await reviewSignalWithRules({
    signal: {
      ...baseSignal,
      risk: "high",
      strategy: {
        ...baseSignal.strategy,
        noChase: false,
        riskReward: 1.8,
      },
    },
  });

  assert.equal(review.status, "reviewed");
  assert.ok(review.counterEvidence.some((item) => item.includes("结构盈亏比不足")));
  assert.ok(review.counterEvidence.some((item) => item.includes("风险等级偏高")));
  assert.match(review.sections.judgment, /风控门禁|触发条件/);
});
