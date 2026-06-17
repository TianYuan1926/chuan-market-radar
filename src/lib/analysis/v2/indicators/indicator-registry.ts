export type IndicatorName = "RSI" | "MACD" | "BOLLINGER" | "ATR" | "EMA" | "VWAP" | "ADX" | "VOLUME_OBV_CVD";

export type IndicatorRegistryEntry = {
  name: IndicatorName;
  sourceGroup: "momentum" | "trend" | "volatility" | "flow";
  canDirectlyCreateTradeSignal: false;
};

export const indicatorRegistry: IndicatorRegistryEntry[] = [
  { name: "RSI", sourceGroup: "momentum", canDirectlyCreateTradeSignal: false },
  { name: "MACD", sourceGroup: "momentum", canDirectlyCreateTradeSignal: false },
  { name: "BOLLINGER", sourceGroup: "volatility", canDirectlyCreateTradeSignal: false },
  { name: "ATR", sourceGroup: "volatility", canDirectlyCreateTradeSignal: false },
  { name: "EMA", sourceGroup: "trend", canDirectlyCreateTradeSignal: false },
  { name: "VWAP", sourceGroup: "trend", canDirectlyCreateTradeSignal: false },
  { name: "ADX", sourceGroup: "trend", canDirectlyCreateTradeSignal: false },
  { name: "VOLUME_OBV_CVD", sourceGroup: "flow", canDirectlyCreateTradeSignal: false },
];
