import type { AnalysisLayer, SignalState, Timeframe } from "./types";

export const supportedTimeframes: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
];

export const signalStateLabels: Record<SignalState, string> = {
  no_trade: "不参与",
  insufficient_data: "数据不足",
  abnormal_watch: "反常观察",
  normal_watch: "普通观察",
  waiting_confirmation: "等待确认",
  near_trigger: "接近触发",
  triggered: "已触发",
  invalidated: "已失效",
  reviewed: "复盘完成",
};

export const analysisLayerLabels: Record<AnalysisLayer, string> = {
  data_quality: "数据质量",
  market_regime: "市场环境",
  structure_location: "结构位置",
  price_volume: "量价行为",
  derivatives: "合约衍生品",
  indicators: "技术指标",
  risk_reward: "赔率风控",
  flexibility: "灵活性校验",
  ai_review: "规则反证复核",
  lifecycle_review: "生命周期复盘",
};
