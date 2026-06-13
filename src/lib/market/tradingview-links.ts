import type { Timeframe } from "@/lib/analysis/types";

type TradingViewSymbolInput = {
  exchange?: string;
  symbol?: string;
};

type TradingViewUrlInput = TradingViewSymbolInput & {
  baseUrl: string;
  timeframe: Timeframe;
};

const intervalMap: Record<Timeframe, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "D",
  "1w": "W",
};

export function toTradingViewInterval(timeframe: Timeframe) {
  return intervalMap[timeframe];
}

export function toTradingViewSymbol({ exchange, symbol }: TradingViewSymbolInput) {
  const normalizedExchange = (exchange || "BINANCE").toUpperCase();
  const normalizedSymbol = (symbol || "BTCUSDT").toUpperCase().replace("/", "");

  return `${normalizedExchange}:${normalizedSymbol}.P`;
}

export function buildTradingViewUrl({
  baseUrl,
  exchange,
  symbol,
  timeframe,
}: TradingViewUrlInput) {
  const params = new URLSearchParams({
    symbol: toTradingViewSymbol({ exchange, symbol }),
    interval: toTradingViewInterval(timeframe),
  });

  return `${baseUrl}?${params.toString()}`;
}
