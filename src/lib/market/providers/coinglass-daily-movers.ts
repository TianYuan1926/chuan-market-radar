import {
  buildDailyMoverReview,
  type DailyMover,
  type DailyMoverSnapshot,
  type PreMoveWindow,
  type RadarSignalSnapshot,
} from "../daily-movers";
import type { ExchangeId } from "../types";
import {
  type CoinGlassMarketRow,
  marketSymbolFromCoinGlass,
  normalizeCoinGlassExchange,
} from "./coinglass-mapper";

export type CoinGlassDailyMoverSnapshotInput = {
  rows: CoinGlassMarketRow[];
  observedAt: string;
  limitPerSide?: number;
  radarSignals?: RadarSignalSnapshot[];
};

const defaultLimitPerSide = 10;

const exchangePriority: Record<ExchangeId, number> = {
  BINANCE: 4,
  OKX: 3,
  BYBIT: 2,
  COINBASE: 1,
  UNKNOWN: 0,
};

function firstString(...values: (string | undefined)[]) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
}

function firstNumber(...values: (number | undefined)[]) {
  return values.find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
}

function dayKey(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10) || "unknown-day";
  }

  return parsed.toISOString().slice(0, 10);
}

function moverBaseSymbol(symbol: string) {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

function rowExchange(row: CoinGlassMarketRow) {
  return normalizeCoinGlassExchange(firstString(row.exchange_name, row.exchangeName));
}

function priceChange(row: CoinGlassMarketRow) {
  return firstNumber(row.price_change_percent_24h, row.priceChangePercent24h);
}

function volumeUsd(row: CoinGlassMarketRow) {
  return firstNumber(row.volume_usd, row.volumeUsd);
}

function openInterestUsd(row: CoinGlassMarketRow) {
  return firstNumber(row.open_interest_usd, row.openInterestUsd);
}

function openInterestChange(row: CoinGlassMarketRow) {
  return firstNumber(
    row.open_interest_change_percent_24h,
    row.openInterestChangePercent24h,
  );
}

function volumeChange(row: CoinGlassMarketRow) {
  return firstNumber(
    row.volume_usd_change_percent_24h,
    row.volumeUsdChangePercent24h,
  );
}

function fundingRate(row: CoinGlassMarketRow) {
  return firstNumber(row.funding_rate, row.fundingRate);
}

function liquidationUsd(row: CoinGlassMarketRow) {
  return firstNumber(row.long_liquidation_usd_24h, row.longLiquidationUsd24h) +
    firstNumber(row.short_liquidation_usd_24h, row.shortLiquidationUsd24h);
}

function isSupportedMoverRow(row: CoinGlassMarketRow) {
  const symbol = marketSymbolFromCoinGlass(row);
  const change = priceChange(row);

  return symbol.endsWith("USDT") &&
    rowExchange(row) !== "UNKNOWN" &&
    volumeUsd(row) > 0 &&
    change !== 0;
}

function primaryRowScore(row: CoinGlassMarketRow) {
  return volumeUsd(row) +
    openInterestUsd(row) * 0.1 +
    exchangePriority[rowExchange(row)] * 1_000_000_000;
}

function selectPrimaryRows(rows: CoinGlassMarketRow[]) {
  const bySymbol = new Map<string, CoinGlassMarketRow>();

  for (const row of rows.filter(isSupportedMoverRow)) {
    const symbol = marketSymbolFromCoinGlass(row);
    const current = bySymbol.get(symbol);

    if (!current || primaryRowScore(row) > primaryRowScore(current)) {
      bySymbol.set(symbol, row);
    }
  }

  return [...bySymbol.values()];
}

function rowToMover(
  row: CoinGlassMarketRow,
  observedAt: string,
  direction: DailyMover["direction"],
  rank: number,
): DailyMover {
  const symbol = marketSymbolFromCoinGlass(row);

  return {
    id: `mover-${moverBaseSymbol(symbol).toLowerCase()}-${dayKey(observedAt)}`,
    symbol,
    exchange: rowExchange(row),
    direction,
    rank,
    observedAt,
    priceChangePercent: priceChange(row),
    volume24hUsd: volumeUsd(row),
    openInterestChangePercent: openInterestChange(row),
    fundingRate: fundingRate(row),
    liquidationUsd24h: liquidationUsd(row),
  };
}

function startedAtFor24hWindow(observedAt: string) {
  const parsed = new Date(observedAt);

  if (Number.isNaN(parsed.getTime())) {
    return observedAt;
  }

  return new Date(parsed.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

function radarSignalIdsBeforeObservedAt(
  radarSignals: RadarSignalSnapshot[],
  symbol: string,
  observedAt: string,
) {
  const observedTime = new Date(observedAt).getTime();

  return radarSignals
    .filter((signal) => {
      const updatedTime = new Date(signal.updatedAt).getTime();
      const isBeforeObservedAt = Number.isNaN(observedTime) ||
        (!Number.isNaN(updatedTime) && updatedTime <= observedTime);

      return signal.symbol === symbol && isBeforeObservedAt;
    })
    .map((signal) => signal.id);
}

function preMoveWindowFromRow(
  row: CoinGlassMarketRow,
  mover: DailyMover,
  radarSignals: RadarSignalSnapshot[],
): PreMoveWindow {
  return {
    window: "24h",
    startedAt: startedAtFor24hWindow(mover.observedAt),
    endedAt: mover.observedAt,
    priceChangePercent: mover.priceChangePercent,
    volumeChangePercent: volumeChange(row),
    openInterestChangePercent: mover.openInterestChangePercent,
    fundingRate: mover.fundingRate,
    radarSignalIds: radarSignalIdsBeforeObservedAt(
      radarSignals,
      mover.symbol,
      mover.observedAt,
    ),
  };
}

function rankMovers(
  rows: CoinGlassMarketRow[],
  observedAt: string,
  direction: DailyMover["direction"],
  limit: number,
) {
  const sortedRows = [...rows]
    .filter((row) => direction === "gainer" ? priceChange(row) > 0 : priceChange(row) < 0)
    .sort((left, right) => direction === "gainer"
      ? priceChange(right) - priceChange(left)
      : priceChange(left) - priceChange(right))
    .slice(0, limit);

  return sortedRows.map((row, index) => ({
    row,
    mover: rowToMover(row, observedAt, direction, index + 1),
  }));
}

export function buildCoinGlassDailyMoverSnapshot({
  rows,
  observedAt,
  limitPerSide = defaultLimitPerSide,
  radarSignals = [],
}: CoinGlassDailyMoverSnapshotInput): DailyMoverSnapshot {
  const primaryRows = selectPrimaryRows(rows);
  const gainers = rankMovers(primaryRows, observedAt, "gainer", limitPerSide);
  const losers = rankMovers(primaryRows, observedAt, "loser", limitPerSide);
  const moverEntries = [...gainers, ...losers];

  return {
    id: `daily-movers-coinglass-${dayKey(observedAt)}`,
    source: "coinglass",
    observedAt,
    gainers: gainers.map((entry) => entry.mover),
    losers: losers.map((entry) => entry.mover),
    reviews: moverEntries.map((entry) => buildDailyMoverReview({
      mover: entry.mover,
      preMoveWindows: [preMoveWindowFromRow(entry.row, entry.mover, radarSignals)],
      radarSignals,
    })),
  };
}
