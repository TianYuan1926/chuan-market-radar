import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "@/lib/analysis/types";
import {
  buildJournalEntryFromDailyMoverCalibration,
  buildJournalEntryFromDailyMoverStrategyConfirmation,
  buildJournalEntryFromStrategyWeightChangeExecution,
  buildJournalEntryFromSignal,
  mergeJournalEntry,
  plannedReviewAt,
} from "./journal-entry";

const baseSignal: MarketSignal = {
  id: "ena-near-trigger",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  direction: "long",
  state: "near_trigger",
  timeframe: "15m",
  regime: "mixed",
  confidence: 80,
  risk: "low",
  updatedAt: "2026-06-12T10:15:00+08:00",
  summary: "接近触发，但必须等回踩确认。",
  evidence: [
    {
      label: "位置",
      value: "箱体上沿",
      layer: "structure_location",
      polarity: "supportive",
    },
  ],
  strategy: {
    bias: "long",
    entry: "15m 放量突破后回踩不破",
    invalidation: "跌回箱体内部",
    targets: ["前高流动性区"],
    riskReward: 4,
    status: "actionable",
    positionHint: "候选可执行，但必须等待触发和失效同时清楚。",
    entryZone: "回踩确认区",
    stopLoss: "跌回箱体内部",
    takeProfitPlan: "4.00R 计划",
    noChase: true,
  },
};

test("plannedReviewAt maps the selected timeframe to a practical follow-up window", () => {
  assert.equal(
    plannedReviewAt("2026-06-12T10:15:00+08:00", "15m"),
    "2026-06-12T11:45:00.000+08:00",
  );
  assert.equal(
    plannedReviewAt("2026-06-12T10:15:00+08:00", "1h"),
    "2026-06-12T14:15:00.000+08:00",
  );
  assert.equal(
    plannedReviewAt("bad-date", "4h"),
    "bad-date",
  );
});

test("buildJournalEntryFromSignal preserves the full decision context", () => {
  const entry = buildJournalEntryFromSignal(baseSignal, "track", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });

  assert.equal(entry.id, "journal-ena-near-trigger-track");
  assert.equal(entry.signalId, "ena-near-trigger");
  assert.equal(entry.symbol, "ENAUSDT");
  assert.equal(entry.action, "track");
  assert.equal(entry.result, "watching");
  assert.equal(entry.reviewStatus, "tracking");
  assert.equal(entry.timeframe, "15m");
  assert.equal(entry.direction, "long");
  assert.equal(entry.strategyStatus, "actionable");
  assert.equal(entry.riskReward, 4);
  assert.equal(entry.trigger, "15m 放量突破后回踩不破");
  assert.equal(entry.invalidation, "跌回箱体内部");
  assert.equal(entry.firstTarget, "前高流动性区");
  assert.equal(entry.plannedReviewAt, "2026-06-12T11:45:00.000+08:00");
  assert.match(entry.note, /候选可执行/);
  assert.match(entry.thesis, /接近触发/);
});

test("buildJournalEntryFromSignal attaches lifecycle checkpoints to tracked signals", () => {
  const entry = buildJournalEntryFromSignal(baseSignal, "paper_trade", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });

  assert.equal(entry.outcomeStatus, "pending");
  assert.equal(entry.triggerHit, false);
  assert.equal(entry.invalidationHit, false);
  assert.equal(entry.firstTargetHit, false);
  assert.deepEqual(entry.reviewCheckpoints?.map((checkpoint) => checkpoint.id), ["1h", "4h", "24h"]);
  assert.equal(entry.reviewCheckpoints?.[0]?.reviewAt, "2026-06-12T03:15:00.000Z");
  assert.deepEqual(entry.lessons, ["still_tracking"]);
});

test("buildJournalEntryFromSignal attaches readonly v3 pattern and trade-plan tags for later review", () => {
  const signal: MarketSignal = {
    ...baseSignal,
    strategyV3: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 107.2,
      forwardLevels: [],
      guardrails: ["test"],
      keyLevels: [],
      patternLibrary: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        dominantPattern: {
          allowedUse: "research_only",
          bias: "BULLISH_CONTEXT",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          confidence: 78,
          evidence: ["双底上下文"],
          hasTradeSignal: false,
          invalidationHint: "跌破双底失效",
          timeframe: "15m",
          type: "DOUBLE_BOTTOM",
        },
        hasTradeSignal: false,
        maxWeightPercent: 10,
        patterns: [],
        summary: "形态辅助",
      },
      primaryTimeframe: "15m",
      source: "existing_ohlcv_key_level_mvp",
      sourceTimeframes: ["15m"],
      summary: "v3 summary",
      symbol: "ENAUSDT",
      tradePlan: {
        allowedUse: "research_only",
        blockedBy: [],
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        confirmationChecklist: ["Risk Gate 已通过"],
        direction: "long",
        entryZone: "只读计划草案",
        hasAutoExecution: false,
        invalidation: "结构失效",
        isPlanEligible: true,
        manualReviewRequired: true,
        positionSizing: "小仓试错",
        rewardRisk: 4,
        status: "READY_LONG",
        structuralStop: 100,
        summary: "v3 只读多头计划草案",
        takeProfitPlan: "第一目标",
        targets: [130],
      },
    },
  };
  const entry = buildJournalEntryFromSignal(signal, "paper_trade", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });

  assert.ok(entry.lessons.includes("v3_trade_READY_LONG"));
  assert.ok(entry.lessons.includes("v3_pattern_DOUBLE_BOTTOM"));
  assert.ok(entry.lessons.includes("v3_pattern_context"));
});

test("buildJournalEntryFromDailyMoverCalibration queues a neutral rule review", () => {
  const entry = buildJournalEntryFromDailyMoverCalibration({
    guardrail: "候选建议不能自动改权重，只能进入人工复盘和后续回测。",
    label: "成交量/OI 权重复核",
    observedAt: "2026-06-12T10:00:00+08:00",
    recommendation: "复核成交量/OI 权重是否低估了提前扩张。",
    sampleCount: 2,
    snapshotId: "daily-2026-06-12",
    symbols: ["SUIUSDT", "TIAUSDT"],
    tag: "review_volume_oi_weight",
  }, {
    createdAt: "2026-06-12T10:15:00+08:00",
  });

  assert.equal(entry.id, "journal-daily-2026-06-12-review-volume-oi-weight-calibration");
  assert.equal(entry.symbol, "SUIUSDT");
  assert.equal(entry.action, "calibration_review");
  assert.equal(entry.allowedUse, "research_only");
  assert.equal(entry.canAutoAdjustWeights, false);
  assert.equal(entry.result, "watching");
  assert.equal(entry.rankDelta, 0);
  assert.equal(entry.reviewStatus, "tracking");
  assert.equal(entry.outcomeStatus, "pending");
  assert.equal(entry.plannedReviewAt, "2026-06-13T10:00:00.000+08:00");
  assert.match(entry.title, /规则校准复盘/);
  assert.match(entry.note, /2 个样本/);
  assert.match(entry.note, /不能自动改权重/);
  assert.match(entry.thesis, /成交量\/OI/);
  assert.deepEqual(entry.lessons?.slice(0, 2), ["daily_mover_calibration", "review_volume_oi_weight"]);
});

test("buildJournalEntryFromDailyMoverStrategyConfirmation records a neutral manual version confirmation", () => {
  const entry = buildJournalEntryFromDailyMoverStrategyConfirmation({
    allowedUse: "research_only",
    draftId: "strategy-review_volume_oi_weight",
    evidenceSummary: "历史样本 4 / 日记验证 3 / 抓到 2 / 漏判 1",
    label: "成交量/OI 权重复核",
    limitation: "只基于已存每日异动快照和校准日记，不是完整 K 线回测。",
    nextStep: "进入策略版本草案；必须人工确认样本边界后才能记录版本，不能自动改权重。",
    tag: "review_volume_oi_weight",
    validationVerdict: "review_ready",
    versionLabel: "draft-volume-oi-weight-v1",
  }, {
    createdAt: "2026-06-12T10:30:00+08:00",
  });

  assert.equal(entry.id, "journal-draft-volume-oi-weight-v1-strategy-confirmation");
  assert.equal(entry.symbol, "STRATEGY");
  assert.equal(entry.action, "strategy_confirmation");
  assert.equal(entry.result, "watching");
  assert.equal(entry.rankDelta, 0);
  assert.equal(entry.reviewStatus, "closed");
  assert.equal(entry.source, "strategy_version_confirmation");
  assert.equal(entry.sourceId, "strategy-review_volume_oi_weight");
  assert.equal(entry.strategyDraftId, "strategy-review_volume_oi_weight");
  assert.equal(entry.strategyTag, "review_volume_oi_weight");
  assert.equal(entry.strategyVersionLabel, "draft-volume-oi-weight-v1");
  assert.equal(entry.strategyValidationVerdict, "review_ready");
  assert.equal(entry.allowedUse, "research_only");
  assert.equal(entry.canAutoAdjustWeights, false);
  assert.match(entry.title, /策略版本人工确认/);
  assert.match(entry.note, /不能自动改权重/);
  assert.match(entry.thesis ?? "", /历史样本 4/);
  assert.deepEqual(entry.lessons?.slice(0, 2), ["strategy_confirmation", "review_volume_oi_weight"]);
});

test("buildJournalEntryFromStrategyWeightChangeExecution records a neutral manual execution ledger entry", () => {
  const entry = buildJournalEntryFromStrategyWeightChangeExecution({
    approvalStatus: "approved",
    approvedAt: "2026-06-16T09:00:00+08:00",
    approvedBy: "chuan",
    direction: "increase",
    label: "成交量/OI 权重复核",
    rollbackTrigger: "后续 10 个样本反证率超过 45%",
    rollbackWindowDays: 14,
    tag: "review_volume_oi_weight",
    versionLabel: "manual-volume-oi-weight-v1",
  }, {
    createdAt: "2026-06-16T09:05:00+08:00",
  });

  assert.equal(entry.id, "journal-manual-volume-oi-weight-v1-strategy-weight-execution");
  assert.equal(entry.symbol, "STRATEGY");
  assert.equal(entry.action, "strategy_weight_change_execution");
  assert.equal(entry.source, "strategy_weight_change_execution");
  assert.equal(entry.sourceId, "review_volume_oi_weight");
  assert.equal(entry.result, "watching");
  assert.equal(entry.rankDelta, 0);
  assert.equal(entry.reviewStatus, "closed");
  assert.equal(entry.allowedUse, "research_only");
  assert.equal(entry.canAutoAdjustWeights, false);
  assert.equal(entry.strategyWeightChange?.canExecuteWeightChange, false);
  assert.equal(entry.strategyWeightChange?.approvalStatus, "approved");
  assert.equal(entry.strategyWeightChange?.approvedBy, "chuan");
  assert.equal(entry.strategyWeightChange?.tag, "review_volume_oi_weight");
  assert.equal(entry.strategyWeightChange?.versionLabel, "manual-volume-oi-weight-v1");
  assert.equal(entry.strategyWeightChange?.rollbackWindowDays, 14);
  assert.match(entry.title, /权重变更人工记录/);
  assert.match(entry.note, /只记录审批账本/);
  assert.match(entry.invalidation ?? "", /不能自动写入规则权重/);
  assert.deepEqual(entry.lessons?.slice(0, 2), ["strategy_weight_change_execution", "review_volume_oi_weight"]);
});

test("skip decisions are saved as positive discipline instead of failed trades", () => {
  const entry = buildJournalEntryFromSignal(baseSignal, "skip", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });

  assert.equal(entry.result, "saved");
  assert.equal(entry.reviewStatus, "closed");
  assert.equal(entry.rankDelta, 1);
  assert.match(entry.title, /拒绝追单/);
});

test("mergeJournalEntry keeps the newest copy for the same journal id", () => {
  const first = buildJournalEntryFromSignal(baseSignal, "track", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });
  const second = {
    ...first,
    note: "用户更新后的观察备注",
    createdAt: "2026-06-12T10:24:00+08:00",
  };
  const merged = mergeJournalEntry([first], second);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.note, "用户更新后的观察备注");
  assert.equal(merged[0]?.createdAt, "2026-06-12T10:24:00+08:00");
});
