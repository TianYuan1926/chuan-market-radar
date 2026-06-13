import assert from "node:assert/strict";
import test from "node:test";
import { generateStrategyPlan, type StrategyPlanningInput } from "./strategy-planner";

const baseInput: StrategyPlanningInput = {
  symbol: "ENAUSDT",
  direction: "long",
  state: "near_trigger",
  risk: "low",
  riskReward: 4,
  triggerHint: "15m 放量突破后，回踩箱体上沿不破再考虑",
  invalidationHint: "跌回箱体并收在突破位下方",
  targets: ["前高流动性区", "4H 供给下沿"],
  distanceToInvalidationPercent: 1.2,
  projectedMovePercent: 4.8,
  evidence: [
    {
      label: "Volume Ratio 1.92",
      value: "成交量开始放大。",
      layer: "price_volume",
      polarity: "supportive",
    },
    {
      label: "市场环境反向",
      value: "大环境与方向倾向不完全一致。",
      layer: "market_regime",
      polarity: "conflicting",
    },
  ],
};

test("generateStrategyPlan creates a gated actionable plan for near-trigger signals", () => {
  const plan = generateStrategyPlan(baseInput);

  assert.equal(plan.status, "actionable");
  assert.equal(plan.bias, "long");
  assert.equal(plan.noChase, true);
  assert.match(plan.entryZone ?? "", /回踩/);
  assert.match(plan.stopLoss ?? "", /1.2%|跌回箱体/);
  assert.match(plan.takeProfitPlan ?? "", /4.00R|前高流动性区/);
  assert.ok(plan.confirmation?.some((item: string) => item.includes("放量")));
  assert.ok(plan.counterEvidence?.some((item: string) => item.includes("市场环境反向")));
});

test("generateStrategyPlan keeps observation signals out of execution mode", () => {
  const plan = generateStrategyPlan({
    ...baseInput,
    symbol: "TIAUSDT",
    direction: "neutral",
    state: "abnormal_watch",
    risk: "high",
    riskReward: 1.12,
    triggerHint: "不参与，等待靠近箱体边界或方向确认",
    invalidationHint: "继续停留箱体中部且量能衰减",
    targets: ["上沿突破观察", "下沿跌破观察"],
    distanceToInvalidationPercent: 3.4,
    projectedMovePercent: 3.8,
    evidence: [
      {
        label: "结构位置",
        value: "价格处在区间中部。",
        layer: "structure_location",
        polarity: "blocking",
      },
    ],
  });

  assert.equal(plan.status, "observe_only");
  assert.equal(plan.bias, "neutral");
  assert.equal(plan.noChase, true);
  assert.match(plan.entry, /不参与/);
  assert.match(plan.positionHint, /只观察/);
  assert.ok(plan.confirmation?.some((item: string) => item.includes("关键边界")));
  assert.ok(plan.counterEvidence?.some((item: string) => item.includes("结构位置")));
});

test("generateStrategyPlan blocks insufficient-data signals before execution fields", () => {
  const plan = generateStrategyPlan({
    ...baseInput,
    symbol: "BADUSDT",
    direction: "neutral",
    state: "insufficient_data",
    risk: "blocked",
    riskReward: 0,
    evidence: [
      {
        label: "数据质量不足",
        value: "关键字段缺失。",
        layer: "data_quality",
        polarity: "blocking",
      },
    ],
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.bias, "neutral");
  assert.equal(plan.entry, "不参与，等待数据补齐");
  assert.equal(plan.stopLoss, "无执行计划");
  assert.ok(plan.counterEvidence?.some((item: string) => item.includes("数据质量不足")));
});
