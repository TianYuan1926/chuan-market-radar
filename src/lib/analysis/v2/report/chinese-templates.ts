import type {
  MarketStage,
  StrategyDecision,
} from "../strategy/market-state-machine";
import type {
  RiskGateBlocker,
} from "../strategy/risk-gate";

export const marketStageZh: Record<MarketStage, string> = {
  IDLE: "数据不足或无有效结构",
  COMPRESSION: "压缩观察",
  ACCUMULATION: "疑似吸筹",
  PRE_BREAKOUT: "突破前临界",
  BREAKOUT_CONFIRM: "突破确认",
  TREND_ACCELERATION: "趋势推进",
  EXHAUSTION_RISK: "衰竭风险",
  INVALIDATED: "结构失效",
  CONFLICT: "证据冲突",
};

export const strategyDecisionZh: Record<StrategyDecision, string> = {
  NO_SETUP: "无有效机会",
  WATCH_ONLY: "只观察",
  PREPARE_LONG: "准备多头计划",
  WAIT_BREAKOUT: "等待突破",
  WAIT_PULLBACK: "等待回踩",
  BREAKOUT_CONFIRM_LONG: "突破确认多头",
  AVOID_CHASE: "禁止追高",
  TREND_HOLD: "趋势仓管理",
  TAKE_PROFIT_MANAGE: "分批止盈管理",
  EXIT_RISK: "退出风险",
  CONFLICT: "冲突等待",
  INVALIDATED: "失效",
};

export const riskGateZh: Record<RiskGateBlocker, string> = {
  reward_risk_below_minimum: "盈亏比不足 3:1",
  risk_score_high: "RiskScore 过高",
  structure_invalidated: "结构失效",
  high_weight_conflict: "高权重证据冲突",
  stale_data: "数据过期或缺失",
};
