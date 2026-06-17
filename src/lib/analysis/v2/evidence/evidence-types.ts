export type EvidenceFamily =
  | "PRICE_STRUCTURE"
  | "LOCATION_RR"
  | "VOLUME_VOLATILITY"
  | "DERIVATIVES"
  | "RELATIVE_STRENGTH"
  | "MARKET_REGIME"
  | "TECHNICAL_INDICATOR";

export type EvidenceDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "RISK" | "CONFLICT";

export type EvidenceTimeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

export type EvidenceFreshness = "fresh" | "stale" | "missing" | "partial";

export type EvidenceSource =
  | "market_structure"
  | "level_detector"
  | "range_compression"
  | "breakout_quality"
  | "pullback_quality"
  | "fakeout_risk"
  | "trend_integrity"
  | "location_rr"
  | "indicator_interpreter"
  | "oi_interpreter"
  | "funding_interpreter"
  | "long_short_interpreter"
  | "taker_flow_interpreter"
  | "market_context";

export type EvidenceItem = {
  id: string;
  symbol: string;
  timeframe: EvidenceTimeframe;
  family: EvidenceFamily;
  source: EvidenceSource;
  label: string;
  direction: EvidenceDirection;
  strength: number;
  confidence: number;
  weightHint: number;
  dataFreshness: EvidenceFreshness;
  fact: string;
  reasoning: string;
  invalidates?: string[];
  conflictsWith?: string[];
  relatedLevel?: number;
  relatedRange?: {
    high: number;
    low: number;
  };
  createdAt: string;
};
