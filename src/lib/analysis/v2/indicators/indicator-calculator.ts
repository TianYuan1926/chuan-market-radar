import type { Candle } from "../../../market/ohlcv/types";
import {
  bollinger,
  macd,
  rsi,
} from "../../technical-indicators";

export type IndicatorSnapshot = {
  rsi?: number;
  macdHistogram?: number;
  macdCross?: "bullish" | "bearish";
  bollingerWidthPercentile?: number;
};

function lastValue<T>(values: Array<T | null | undefined>): T | undefined {
  return values.findLast((value): value is T => value !== null && value !== undefined);
}

export function calculateIndicatorSnapshot(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((candle) => candle.close);
  const rsiValue = lastValue(rsi(closes, 14));
  const macdValues = macd(closes);
  const latestMacd = macdValues.at(-1);
  const previousMacd = macdValues.at(-2);
  const bollingerValues = bollinger(closes, 20, 2).filter((value): value is NonNullable<typeof value> => value !== null);
  const latestBollinger = bollingerValues.at(-1);
  const minWidth = bollingerValues.length > 0 ? Math.min(...bollingerValues.map((value) => value.width)) : null;
  const maxWidth = bollingerValues.length > 0 ? Math.max(...bollingerValues.map((value) => value.width)) : null;
  const bollingerWidthPercentile =
    latestBollinger && minWidth !== null && maxWidth !== null && maxWidth > minWidth
      ? ((latestBollinger.width - minWidth) / (maxWidth - minWidth)) * 100
      : undefined;
  const macdCross =
    latestMacd && previousMacd && previousMacd.histogram <= 0 && latestMacd.histogram > 0
      ? "bullish"
      : latestMacd && previousMacd && previousMacd.histogram >= 0 && latestMacd.histogram < 0
        ? "bearish"
        : undefined;

  return {
    rsi: rsiValue,
    macdHistogram: latestMacd?.histogram,
    macdCross,
    bollingerWidthPercentile,
  };
}
