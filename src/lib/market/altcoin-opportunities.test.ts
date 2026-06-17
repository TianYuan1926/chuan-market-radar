import assert from "node:assert/strict";
import test from "node:test";
import type { EvidencePoint, MarketSignal } from "../analysis/types";
import { buildAltcoinOpportunityBoard } from "./altcoin-opportunities";

function evidence(label: string, value: string, polarity: EvidencePoint["polarity"] = "supportive"): EvidencePoint {
  return {
    label,
    layer: label.includes("资金") || label.includes("OI") ? "derivatives" : "price_volume",
    polarity,
    value,
  };
}

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    confidence: 70,
    direction: "long",
    evidence: [
      evidence("OI 变化", "+18%"),
      evidence("资金费率", "中性偏低"),
      evidence("成交量", "2.4x"),
      evidence("BTC/ETH 环境", "顺风"),
    ],
    exchange: "BINANCE",
    id: overrides.id ?? `${overrides.symbol ?? "ENAUSDT"}-15m`,
    regime: "risk_on",
    risk: "medium",
    state: "waiting_confirmation",
    strategy: {
      bias: overrides.direction ?? "long",
      entry: "回踩确认后再看",
      invalidation: "跌回启动位",
      positionHint: "轻仓观察",
      riskReward: 2.6,
      status: "waiting",
      targets: ["第一目标"],
    },
    summary: "结构升温但等待确认",
    symbol: "ENAUSDT",
    timeframe: "15m",
    updatedAt: "2026-06-17T08:00:00.000Z",
    ...overrides,
  };
}

test("buildAltcoinOpportunityBoard groups actionable altcoin opportunities without creating chase signals", () => {
  const board = buildAltcoinOpportunityBoard({
    dailyMoverDetails: [
      {
        allowedUse: "research_only",
        correlationStatus: "missed_with_evidence",
        direction: "gainer",
        evidenceStrength: "strong",
        linkedSignalCount: 0,
        primaryDrivers: ["volume_expansion", "open_interest_expansion"],
        symbol: "NEWUSDT",
        whyMissed: "涨前有放量和 OI 抬升，但扫描池当时未覆盖。",
      },
      {
        allowedUse: "research_only",
        correlationStatus: "caught_unreviewed",
        direction: "gainer",
        evidenceStrength: "medium",
        linkedSignalCount: 1,
        primaryDrivers: ["volume_expansion"],
        symbol: "ENAUSDT",
        whyMissed: "每日异动命中当前观察样本。",
      },
    ],
    journalEvents: [
      {
        createdAt: "2026-06-17T08:30:00.000Z",
        id: "journal-ena",
        note: "跟踪 ENA",
        rankDelta: 2,
        result: "watching",
        symbol: "ENAUSDT",
        title: "ENA 跟踪",
      },
    ],
    scanStatus: "ready",
    signals: [
      signal({ confidence: 78, direction: "long", state: "waiting_confirmation", symbol: "ENAUSDT" }),
      signal({ confidence: 76, direction: "short", state: "abnormal_watch", symbol: "TIAUSDT" }),
      signal({ confidence: 83, direction: "long", state: "near_trigger", symbol: "SUIUSDT" }),
      signal({
        confidence: 89,
        risk: "high",
        state: "triggered",
        strategy: {
          bias: "long",
          entry: "已经远离触发位",
          invalidation: "跌回突破位",
          noChase: true,
          positionHint: "禁止追单",
          riskReward: 1.1,
          status: "observe_only",
          targets: ["等回踩"],
        },
        symbol: "PEPEUSDT",
      }),
      signal({ confidence: 41, risk: "blocked", state: "insufficient_data", symbol: "THINUSDT" }),
    ],
  });

  assert.deepEqual(board.groups.long_warming.items.map((item) => item.symbol), ["ENAUSDT"]);
  assert.deepEqual(board.groups.short_warming.items.map((item) => item.symbol), ["TIAUSDT"]);
  assert.deepEqual(board.groups.near_trigger.items.map((item) => item.symbol), ["SUIUSDT"]);
  assert.deepEqual(board.groups.no_chase.items.map((item) => item.symbol), ["PEPEUSDT"]);
  assert.deepEqual(board.groups.new_long_tail.items.map((item) => item.symbol), ["NEWUSDT"]);
  assert.deepEqual(board.groups.data_watch.items.map((item) => item.symbol), ["THINUSDT"]);
  assert.equal(board.groups.no_chase.items[0]?.noFomoLabel, "禁止追单");
  assert.equal(board.groups.new_long_tail.items[0]?.allowedUse, "research_only");
  assert.match(board.groups.long_warming.items[0]?.dailyMoverContext ?? "", /复盘上下文/);
  assert.ok(board.groups.long_warming.items[0]?.evidenceBadges.some((badge) => badge.label === "OI"));
  assert.ok(board.groups.long_warming.items[0]?.evidenceBadges.some((badge) => badge.label === "资金"));
  assert.ok(board.groups.long_warming.items[0]?.evidenceBadges.some((badge) => badge.label === "量能"));
  assert.equal(board.summary.requestPolicy, "no_extra_requests");
});

test("buildAltcoinOpportunityBoard marks stale scans as watch-only", () => {
  const board = buildAltcoinOpportunityBoard({
    dailyMoverDetails: [],
    journalEvents: [],
    scanStatus: "stale",
    signals: [
      signal({ confidence: 84, direction: "long", state: "near_trigger", symbol: "ONDOUSDT" }),
    ],
  });

  assert.deepEqual(board.groups.near_trigger.items.map((item) => item.symbol), []);
  assert.deepEqual(board.groups.data_watch.items.map((item) => item.symbol), ["ONDOUSDT"]);
  assert.match(board.groups.data_watch.items[0]?.staleLabel ?? "", /数据延迟/);
});
