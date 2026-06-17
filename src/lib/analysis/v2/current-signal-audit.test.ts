import assert from "node:assert/strict";
import test from "node:test";
import type {
  EvidencePoint,
  MarketSignal,
} from "../types";
import {
  buildSignalStrategyV2Audit,
} from "./current-signal-audit";

function evidence(label: string, value: string, polarity: EvidencePoint["polarity"] = "supportive"): EvidencePoint {
  return {
    label,
    layer: label.includes("资金") || label.includes("OI") ? "derivatives" : "structure_location",
    polarity,
    value,
  };
}

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    confidence: 76,
    direction: "long",
    evidence: [
      evidence("区间压缩", "低波动收敛"),
      evidence("资金费率", "中性"),
      evidence("相对强度", "BTC 横盘时个币走强"),
    ],
    exchange: "BINANCE",
    id: "ENAUSDT-15m",
    regime: "risk_on",
    risk: "medium",
    state: "waiting_confirmation",
    strategy: {
      bias: "long",
      entry: "突破后等待回踩确认",
      invalidation: "跌回区间",
      positionHint: "轻仓观察",
      riskReward: 3.4,
      status: "waiting",
      targets: ["前高", "延伸目标"],
    },
    summary: "压缩后接近临界区",
    symbol: "ENAUSDT",
    timeframe: "15m",
    updatedAt: "2026-06-17T08:00:00.000Z",
    ...overrides,
  };
}

test("buildSignalStrategyV2Audit converts current signal evidence into read-only v2 output", () => {
  const audit = buildSignalStrategyV2Audit(signal());

  assert.equal(audit.canMutateLiveRanking, false);
  assert.equal(audit.report.decision, audit.decision);
  assert.equal(audit.report.stage, audit.stage);
  assert.ok(audit.report.evidenceTrace.supportEvidenceIds.length > 0);
  assert.ok(audit.scores.preMove > 0);
  assert.equal(audit.ignoredExternalInputs, 0);
});

test("buildSignalStrategyV2Audit preserves no-chase and invalidation as risk gates", () => {
  const audit = buildSignalStrategyV2Audit(signal({
    evidence: [
      evidence("突破失败跌回区间", "收盘重新回到箱体内", "blocking"),
      evidence("OI 暴涨但价格滞涨", "杠杆拥挤", "blocking"),
    ],
    risk: "high",
    state: "invalidated",
    strategy: {
      bias: "long",
      entry: "不执行",
      invalidation: "已失效",
      noChase: true,
      positionHint: "禁止追单",
      riskReward: 1.2,
      status: "blocked",
      targets: ["无"],
    },
  }));

  assert.equal(audit.decision, "INVALIDATED");
  assert.ok(audit.riskGate.blockedBy.includes("structure_invalidated"));
  assert.ok(audit.riskGate.blockedBy.includes("reward_risk_below_minimum"));
  assert.match(audit.report.sections.risk, /失效|风险门控/u);
});
