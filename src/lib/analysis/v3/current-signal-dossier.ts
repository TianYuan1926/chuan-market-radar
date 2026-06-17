import type {
  MarketSignal,
  Timeframe,
} from "../types";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import {
  buildForwardLevelMap,
} from "./forward-level-map";
import {
  buildKeyLevels,
} from "./key-level-engine";
import {
  buildStrategyV3TrendContext,
} from "./trend-context";
import {
  buildV3TradePlan,
} from "./trade-plan";
import type {
  KeyLevel,
  StrategyV3Dossier,
  TrendTimeframe,
} from "./types";

type SupportedTrendTimeframe = Extract<TrendTimeframe, Timeframe>;

export type BuildSignalTrendRadarV3DossierInput = {
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  currentPrice?: number;
  signal: MarketSignal;
};

const supportedTimeframes: SupportedTrendTimeframe[] = ["5m", "15m", "1h", "4h", "1d", "1w"];

function isTrendTimeframe(value: Timeframe): value is SupportedTrendTimeframe {
  return supportedTimeframes.includes(value as SupportedTrendTimeframe);
}

function latestClose(candles?: Candle[]) {
  const latest = candles?.at(-1);

  return latest?.close;
}

function currentPriceFor(input: BuildSignalTrendRadarV3DossierInput, sourceTimeframes: SupportedTrendTimeframe[]) {
  if (typeof input.currentPrice === "number" && Number.isFinite(input.currentPrice) && input.currentPrice > 0) {
    return input.currentPrice;
  }

  if (isTrendTimeframe(input.signal.timeframe)) {
    const signalTimeframeClose = latestClose(input.candlesByTimeframe[input.signal.timeframe]);

    if (typeof signalTimeframeClose === "number" && Number.isFinite(signalTimeframeClose) && signalTimeframeClose > 0) {
      return signalTimeframeClose;
    }
  }

  for (const timeframe of sourceTimeframes) {
    const close = latestClose(input.candlesByTimeframe[timeframe]);

    if (typeof close === "number" && Number.isFinite(close) && close > 0) {
      return close;
    }
  }

  return null;
}

function uniqueLevels(levels: KeyLevel[]) {
  const seen = new Set<string>();

  return levels.filter((level) => {
    const key = `${level.symbol}:${level.timeframe}:${level.direction}:${Math.round(level.midPrice * 10000)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function primaryTimeframe(signal: MarketSignal, sourceTimeframes: SupportedTrendTimeframe[]): TrendTimeframe {
  if (isTrendTimeframe(signal.timeframe) && sourceTimeframes.includes(signal.timeframe)) {
    return signal.timeframe;
  }

  return sourceTimeframes.includes("15m")
    ? "15m"
    : sourceTimeframes[0];
}

export function buildSignalTrendRadarV3Dossier(
  input: BuildSignalTrendRadarV3DossierInput,
): StrategyV3Dossier | null {
  const sourceTimeframes = supportedTimeframes.filter((timeframe) =>
    (input.candlesByTimeframe[timeframe]?.length ?? 0) >= 3
  );

  if (sourceTimeframes.length === 0) {
    return null;
  }

  const currentPrice = currentPriceFor(input, sourceTimeframes);

  if (currentPrice === null) {
    return null;
  }

  const keyLevels = uniqueLevels(sourceTimeframes.flatMap((timeframe) =>
    buildKeyLevels({
      candles: input.candlesByTimeframe[timeframe] ?? [],
      currentPrice,
      symbol: input.signal.symbol,
      timeframe,
    })
  ))
    .sort((first, second) => second.keyScore - first.keyScore || second.confluenceScore - first.confluenceScore)
    .slice(0, 12);
  const forwardLevels = buildForwardLevelMap({
    currentPrice,
    levels: keyLevels,
    symbol: input.signal.symbol,
  }).slice(0, 8);

  if (keyLevels.length === 0 && forwardLevels.length === 0) {
    return null;
  }

  const primary = primaryTimeframe(input.signal, sourceTimeframes);
  const trendContext = buildStrategyV3TrendContext({
    candlesByTimeframe: input.candlesByTimeframe,
    currentPrice,
    keyLevels,
    signal: input.signal,
    sourceTimeframes,
    symbol: input.signal.symbol,
  });
  const tradePlan = buildV3TradePlan({
    currentPrice,
    signal: input.signal,
    trendContext,
  });

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice,
    forwardLevels,
    guardrails: [
      "v3 关键位地图只读展示，不改变 live ranking。",
      "Forward Map 只来自本轮已有 OHLCV，不新增 CoinGlass 请求。",
      "触发、失效和目标仍必须经过 Risk Gate 与人工复盘确认。",
    ],
    keyLevels,
    primaryTimeframe: primary,
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes,
    summary: `${input.signal.symbol} v3 关键位地图已从 ${sourceTimeframes.join("/")} OHLCV 构建，保留 ${keyLevels.length} 个关键位与 ${forwardLevels.length} 个前方位；${trendContext.summary}`,
    symbol: input.signal.symbol,
    tradePlan,
    trendContext,
  };
}
