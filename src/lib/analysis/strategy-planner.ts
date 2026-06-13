import type {
  EvidencePoint,
  RiskGrade,
  SignalDirection,
  SignalState,
  StrategyPlan,
} from "./types";

export type StrategyPlanningInput = {
  symbol: string;
  direction: SignalDirection;
  state: SignalState;
  risk: RiskGrade;
  riskReward: number;
  triggerHint?: string;
  invalidationHint?: string;
  targets: string[];
  distanceToInvalidationPercent: number;
  projectedMovePercent: number;
  evidence: EvidencePoint[];
};

function formattedRiskReward(value: number) {
  return `${value.toFixed(2)}R`;
}

function isBlocked(input: StrategyPlanningInput) {
  return input.state === "insufficient_data" || input.state === "no_trade" || input.risk === "blocked";
}

function isObservationOnly(input: StrategyPlanningInput) {
  return input.state === "abnormal_watch" || input.risk === "high" || input.riskReward < 1.6;
}

function counterEvidence(input: StrategyPlanningInput) {
  return input.evidence
    .filter((item) => item.polarity === "blocking" || item.polarity === "conflicting")
    .map((item) => `${item.label}: ${item.value}`);
}

function defaultTargets(input: StrategyPlanningInput) {
  return input.targets.length ? input.targets : ["下一流动性区", "大周期供需边界"];
}

export function generateStrategyPlan(input: StrategyPlanningInput): StrategyPlan {
  const targets = defaultTargets(input);
  const counters = counterEvidence(input);

  if (isBlocked(input)) {
    return {
      bias: "neutral",
      entry: "不参与，等待数据补齐",
      invalidation: input.invalidationHint ?? "数据质量恢复前不允许输出执行计划",
      targets,
      riskReward: input.riskReward,
      positionHint: "阻断状态，只记录，不生成交易计划。",
      status: "blocked",
      entryZone: "无执行计划",
      stopLoss: "无执行计划",
      takeProfitPlan: "无执行计划",
      noChase: true,
      confirmation: ["数据质量恢复", "关键行情和衍生品字段补齐"],
      counterEvidence: counters,
      riskControls: ["禁止追单", "禁止把低质量数据包装成机会"],
    };
  }

  if (isObservationOnly(input)) {
    return {
      bias: "neutral",
      entry: input.triggerHint ?? "不参与，等待靠近关键边界或方向确认",
      invalidation: input.invalidationHint ?? "继续停留在低赔率区域",
      targets,
      riskReward: input.riskReward,
      positionHint: "只观察，不参与；没有低风险位置就不强行开工。",
      status: "observe_only",
      entryZone: "无入场区，等待靠近关键边界",
      stopLoss: "无执行计划",
      takeProfitPlan: `观察目标：${targets.join(" / ")}`,
      noChase: true,
      confirmation: ["价格靠近关键边界", "触发位和失效位重新变近", "量价方向完成二次确认"],
      counterEvidence: counters,
      riskControls: ["禁止中部位置追单", "禁止用 OI 单独当作入场理由"],
    };
  }

  const status = input.state === "near_trigger" ? "actionable" : "waiting";
  const entry = input.triggerHint ?? "等待放量确认后回踩不破";
  const invalidation = input.invalidationHint ?? "回到触发结构内部并收线失效";

  return {
    bias: input.direction,
    entry,
    invalidation,
    targets,
    riskReward: input.riskReward,
    positionHint:
      status === "actionable"
        ? "候选可执行，但必须等待触发和失效同时清楚。"
        : "等待确认，不提前入场，不猜方向。",
    status,
    entryZone: `只考虑触发后回踩确认区：${entry}`,
    stopLoss: `${invalidation}；预估失效距离 ${input.distanceToInvalidationPercent.toFixed(1)}%`,
    takeProfitPlan: `${formattedRiskReward(input.riskReward)} 计划：${targets.join(" / ")}`,
    noChase: true,
    confirmation: ["放量不是冲高一根线", "回踩不破触发位", "失效条件足够近且可执行"],
    counterEvidence: counters,
    riskControls: [
      "禁止突破瞬间追单",
      "止损距离变远则自动降级",
      "若反证增加，先降级观察",
    ],
  };
}
