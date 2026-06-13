import type {
  ContractInstrument,
  DerivativeSnapshot,
  ExchangeId,
  MarketHeatCell,
  MarketTicker,
} from "@/lib/market/types";

export type CoinGlassInstrumentRow = {
  instrument_id?: string;
  instrumentId?: string;
  base_asset?: string;
  baseAsset?: string;
  quote_asset?: string;
  quoteAsset?: string;
  settlement_currency?: string;
  settlementCurrency?: string;
  max_leverage?: number;
  maxLeverage?: number;
};

export type CoinGlassMarketRow = {
  instrument_id?: string;
  instrumentId?: string;
  exchange_name?: string;
  exchangeName?: string;
  symbol?: string;
  current_price?: number;
  currentPrice?: number;
  price_change_percent_24h?: number;
  priceChangePercent24h?: number;
  volume_usd?: number;
  volumeUsd?: number;
  volume_usd_change_percent_24h?: number;
  volumeUsdChangePercent24h?: number;
  open_interest_usd?: number;
  openInterestUsd?: number;
  open_interest_change_percent_24h?: number;
  openInterestChangePercent24h?: number;
  funding_rate?: number;
  fundingRate?: number;
  long_liquidation_usd_24h?: number;
  longLiquidationUsd24h?: number;
  short_liquidation_usd_24h?: number;
  shortLiquidationUsd24h?: number;
};

function firstString(...values: (string | undefined)[]) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

function firstNumber(...values: (number | undefined)[]) {
  return values.find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
}

function normalizeSymbol(value: string) {
  return value.replace("/", "").replace("-", "").replace("_", "").toUpperCase();
}

function isDatedDelivery(instrumentId: string) {
  return /_\d{6}$/.test(instrumentId);
}

export function normalizeCoinGlassExchange(exchangeName: string): ExchangeId {
  const normalized = exchangeName.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (normalized === "binance") {
    return "BINANCE";
  }

  if (normalized === "okx") {
    return "OKX";
  }

  if (normalized === "bybit") {
    return "BYBIT";
  }

  if (normalized === "coinbase") {
    return "COINBASE";
  }

  return "UNKNOWN";
}

export function marketSymbolFromCoinGlass(row: CoinGlassMarketRow) {
  const symbol = firstString(row.symbol, row.instrument_id, row.instrumentId);

  return normalizeSymbol(symbol);
}

export function mapCoinGlassInstrument(
  exchangeName: string,
  row: CoinGlassInstrumentRow,
  updatedAt: string,
): ContractInstrument | null {
  const instrumentId = firstString(row.instrument_id, row.instrumentId);
  const baseAsset = firstString(row.base_asset, row.baseAsset).toUpperCase();
  const quoteAsset = firstString(row.quote_asset, row.quoteAsset).toUpperCase();
  const maxLeverage = firstNumber(row.max_leverage, row.maxLeverage);

  if (!instrumentId || !baseAsset || quoteAsset !== "USDT" || isDatedDelivery(instrumentId)) {
    return null;
  }

  const exchange = normalizeCoinGlassExchange(exchangeName);
  const symbol = normalizeSymbol(instrumentId);
  const tags = ["coinglass", exchangeName];

  if (maxLeverage > 0) {
    tags.push(`lev:${maxLeverage}`);
  }

  return {
    id: `${exchange}:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset,
    exchange,
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags,
    lastSeenAt: updatedAt,
  };
}

export function mapCoinGlassMarketInstrument(
  row: CoinGlassMarketRow,
  updatedAt: string,
): ContractInstrument | null {
  const symbol = marketSymbolFromCoinGlass(row);
  const exchangeName = firstString(row.exchange_name, row.exchangeName);
  const exchange = normalizeCoinGlassExchange(exchangeName);
  const baseAsset = symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;

  if (!symbol.endsWith("USDT")) {
    return null;
  }

  return {
    id: `${exchange}:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange,
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: firstNumber(row.volume_usd, row.volumeUsd),
    openInterestUsd: firstNumber(row.open_interest_usd, row.openInterestUsd),
    tags: ["coinglass", exchangeName || "unknown"],
    lastSeenAt: updatedAt,
  };
}

export function mapCoinGlassTicker(row: CoinGlassMarketRow, updatedAt: string): MarketTicker {
  const price = firstNumber(row.current_price, row.currentPrice);

  return {
    symbol: marketSymbolFromCoinGlass(row),
    exchange: normalizeCoinGlassExchange(firstString(row.exchange_name, row.exchangeName)),
    price,
    changePercent24h: firstNumber(row.price_change_percent_24h, row.priceChangePercent24h),
    volume24hUsd: firstNumber(row.volume_usd, row.volumeUsd),
    high24h: price,
    low24h: price,
    updatedAt,
  };
}

export function mapCoinGlassDerivativeSnapshot(
  row: CoinGlassMarketRow,
  updatedAt: string,
): DerivativeSnapshot {
  const fundingRate = firstNumber(row.funding_rate, row.fundingRate);
  const longLiquidation = firstNumber(row.long_liquidation_usd_24h, row.longLiquidationUsd24h);
  const shortLiquidation = firstNumber(row.short_liquidation_usd_24h, row.shortLiquidationUsd24h);

  return {
    symbol: marketSymbolFromCoinGlass(row),
    exchange: normalizeCoinGlassExchange(firstString(row.exchange_name, row.exchangeName)),
    source: "coinglass",
    openInterestUsd: firstNumber(row.open_interest_usd, row.openInterestUsd),
    openInterestChangePercent: firstNumber(
      row.open_interest_change_percent_24h,
      row.openInterestChangePercent24h,
    ),
    fundingRate,
    fundingRateZScore: Number((fundingRate * 1000).toFixed(2)),
    liquidationUsd24h: longLiquidation + shortLiquidation,
    updatedAt,
  };
}

export function mapCoinGlassHeatCell(row: CoinGlassMarketRow): MarketHeatCell {
  const changePercent = firstNumber(row.price_change_percent_24h, row.priceChangePercent24h);
  const oiChange = Math.abs(firstNumber(
    row.open_interest_change_percent_24h,
    row.openInterestChangePercent24h,
  ));
  const liquidation = firstNumber(row.long_liquidation_usd_24h, row.longLiquidationUsd24h) +
    firstNumber(row.short_liquidation_usd_24h, row.shortLiquidationUsd24h);
  const anomalyScore = Math.min(99, Math.round(Math.abs(changePercent) * 8 + oiChange * 4 + liquidation / 500_000));

  return {
    symbol: marketSymbolFromCoinGlass(row).replace("USDT", ""),
    tone: changePercent < -1.5 ? "down" : anomalyScore >= 65 ? "up" : anomalyScore >= 45 ? "watch" : "sleep",
    changePercent,
    anomalyScore,
  };
}
