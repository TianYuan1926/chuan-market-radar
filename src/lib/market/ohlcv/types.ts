import type { Timeframe } from "../../analysis/types";

export type Candle = {
  openTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: string;
};

export type OhlcvInterval = Timeframe;

export type OhlcvRequest = {
  symbol: string;
  interval: OhlcvInterval;
  limit?: number;
};

export type OhlcvFailureReason =
  | "upstream_error"
  | "invalid_response"
  | "network_error";

export type OhlcvProviderSuccess = {
  ok: true;
  source: string;
  symbol: string;
  interval: OhlcvInterval;
  candles: Candle[];
};

export type OhlcvProviderFailure = {
  ok: false;
  source: string;
  symbol: string;
  interval: OhlcvInterval;
  reason: OhlcvFailureReason;
  error: string;
  status?: number;
};

export type OhlcvProviderResult = OhlcvProviderSuccess | OhlcvProviderFailure;

export type OhlcvProvider = {
  id: string;
  label: string;
  fetchCandles: (request: OhlcvRequest) => Promise<OhlcvProviderResult>;
};
