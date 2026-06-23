import type { Timeframe } from "@/lib/analysis/types";

type TradingViewSymbolInput = {
  exchange?: string;
  symbol?: string;
};

type TradingViewUrlInput = TradingViewSymbolInput & {
  baseUrl: string;
  timeframe: Timeframe;
};

type TradingViewWidgetUrlInput = {
  baseUrl?: string;
  interval?: string | null;
  locale?: string;
  symbol?: string | null;
  theme?: "dark" | "light";
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

export function buildTradingViewWidgetEmbedUrl({
  baseUrl = "https://www.tradingview.com/widgetembed/",
  interval,
  locale = "zh_CN",
  symbol,
  theme = "dark",
}: TradingViewWidgetUrlInput) {
  const params = new URLSearchParams({
    allow_symbol_change: "0",
    calendar: "0",
    hide_side_toolbar: "0",
    interval: interval || "240",
    locale,
    save_image: "0",
    style: "1",
    symbol: symbol || toTradingViewSymbol({ exchange: "BINANCE", symbol: "BTCUSDT" }),
    theme,
    timezone: "Asia/Shanghai",
    withdateranges: "1",
  });

  return `${baseUrl}?${params.toString()}`;
}
