import type {
  ExchangeId,
  ContractInstrument,
  MarketTicker,
  ScanLightScanAnomalyFrame,
  ScanLightScanCandidate,
  ScanLightScanDiagnostics,
} from "./types";
import type { PublicLightScanProvider, PublicLightScanResult } from "./providers/public-light-scan";
import { isCryptoFuturesUnderlying } from "./asset-class-filter";

export type WebSocketTickerEvent = {
  bestAskPrice?: number;
  bestAskQuantity?: number;
  bestBidPrice?: number;
  bestBidQuantity?: number;
  bookSource?: "book_ticker" | "ticker_bbo";
  eventTime: string;
  exchange: ExchangeId;
  flowSource?: "book" | "ticker" | "trade";
  price: number;
  quoteVolume24hUsd?: number;
  quoteVolumeDeltaUsd?: number;
  symbol: string;
  takerSide?: "buy" | "sell" | "unknown";
};

export type WebSocketLightScanWindow = {
  bookAskUsd: number;
  bookBidUsd: number;
  bookImbalance: number;
  bookPressureSide: "buy" | "neutral" | "sell";
  bookProxyQuality: "" | "book_ticker_proxy" | "ticker_bbo_proxy";
  buyPressureUsd: number;
  closePrice: number;
  flatPressureUsd: number;
  highPrice: number;
  largeBuyTradeUsd: number;
  largeSellTradeUsd: number;
  largeTakerTradeCount: number;
  largeTakerTradeSide: "buy" | "neutral" | "sell";
  largeTakerTradeUsd: number;
  lowPrice: number;
  openPrice: number;
  sellPressureUsd: number;
  spreadBps: number;
  startMs: number;
  tickerInferredVolumeUsd: number;
  tradeBuyPressureUsd: number;
  tradeFlatPressureUsd: number;
  tradeSellPressureUsd: number;
  tradeVolumeUsd: number;
  volumeUsd: number;
};

export type WebSocketLightScanSymbolState = {
  currentWindow: WebSocketLightScanWindow | null;
  exchange: ExchangeId;
  history: WebSocketLightScanWindow[];
  lastEventAt: string;
  lastPrice: number;
  lastQuoteVolume24hUsd?: number;
  symbol: string;
};

export type WebSocketLightScanSnapshot = PublicLightScanResult & {
  mode: "websocket_sliding_window";
  windowMs: number;
};

export type WebSocketLightScanStore = {
  readSnapshot: () => Promise<WebSocketLightScanSnapshot | null>;
  writeSnapshot: (snapshot: WebSocketLightScanSnapshot) => Promise<void>;
};

export type WebSocketLightScanAccumulator = {
  ingest: (event: WebSocketTickerEvent) => void;
  snapshot: () => WebSocketLightScanSnapshot;
};

export type WebSocketLightScanAccumulatorOptions = {
  largeTakerTradeUsd?: number;
  maxBaselineWindows?: number;
  maxPriorityCandidates?: number;
  minCandidateVolumeUsd?: number;
  now?: () => Date;
  windowMs?: number;
  zScoreThreshold?: number;
};

export type WebSocketLightScanProviderOptions = {
  now?: () => Date;
  staleAfterMs?: number;
  store: WebSocketLightScanStore;
};

const defaultWindowMs = 15 * 60 * 1000;
const defaultMaxBaselineWindows = 12;
const defaultMaxPriorityCandidates = 48;
const defaultMinCandidateVolumeUsd = 250_000;
const defaultZScoreThreshold = 2;
const defaultLargeTakerTradeUsd = 100_000;

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedSymbol(value: string) {
  return value.trim().toUpperCase().replace("/", "").replace("-", "");
}

function baseFromSymbol(symbol: string) {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

function isUsdtPerpLikeSymbol(symbol: string) {
  return symbol.endsWith("USDT") &&
    !symbol.includes("_") &&
    symbol.length > 4 &&
    isCryptoFuturesUnderlying(symbol);
}

function windowStartMs(timeMs: number, windowMs: number) {
  return Math.floor(timeMs / windowMs) * windowMs;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function logVolumeScore(volumeUsd: number) {
  return Math.min(28, Math.max(0, Math.log10(Math.max(1, volumeUsd)) * 2.5));
}

function mean(values: number[]) {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));

  return Math.sqrt(variance);
}

function zScore(current: number, baseline: number[]) {
  if (baseline.length === 0) {
    return 0;
  }

  const avg = mean(baseline);
  const std = standardDeviation(baseline);

  if (std > 0) {
    return (current - avg) / std;
  }

  if (current <= avg) {
    return 0;
  }

  return (current - avg) / Math.max(avg, 1);
}

function volumeDelta({
  event,
  state,
}: {
  event: WebSocketTickerEvent;
  state?: WebSocketLightScanSymbolState;
}) {
  const explicitDelta = finiteNumber(event.quoteVolumeDeltaUsd);

  if (explicitDelta > 0) {
    return explicitDelta;
  }

  const current24h = finiteNumber(event.quoteVolume24hUsd);
  const previous24h = finiteNumber(state?.lastQuoteVolume24hUsd);

  if (current24h > 0 && previous24h > 0 && current24h >= previous24h) {
    return current24h - previous24h;
  }

  return 0;
}

function pressureBuckets({
  price,
  previousPrice,
  takerSide,
  volumeUsd,
}: {
  price: number;
  previousPrice: number | undefined;
  takerSide?: WebSocketTickerEvent["takerSide"];
  volumeUsd: number;
}) {
  if (volumeUsd <= 0 || !previousPrice || previousPrice <= 0) {
    if (takerSide === "buy") {
      return {
        buyPressureUsd: volumeUsd,
        flatPressureUsd: 0,
        sellPressureUsd: 0,
      };
    }

    if (takerSide === "sell") {
      return {
        buyPressureUsd: 0,
        flatPressureUsd: 0,
        sellPressureUsd: volumeUsd,
      };
    }

    return {
      buyPressureUsd: 0,
      flatPressureUsd: Math.max(0, volumeUsd),
      sellPressureUsd: 0,
    };
  }

  if (takerSide === "buy") {
    return {
      buyPressureUsd: volumeUsd,
      flatPressureUsd: 0,
      sellPressureUsd: 0,
    };
  }

  if (takerSide === "sell") {
    return {
      buyPressureUsd: 0,
      flatPressureUsd: 0,
      sellPressureUsd: volumeUsd,
    };
  }

  if (price > previousPrice) {
    return {
      buyPressureUsd: volumeUsd,
      flatPressureUsd: 0,
      sellPressureUsd: 0,
    };
  }

  if (price < previousPrice) {
    return {
      buyPressureUsd: 0,
      flatPressureUsd: 0,
      sellPressureUsd: volumeUsd,
    };
  }

  return {
    buyPressureUsd: 0,
    flatPressureUsd: volumeUsd,
    sellPressureUsd: 0,
  };
}

function sideFromImbalance(value: number, threshold = 0.15): "buy" | "neutral" | "sell" {
  if (value > threshold) return "buy";
  if (value < -threshold) return "sell";
  return "neutral";
}

function bookSnapshotFromEvent(event: WebSocketTickerEvent) {
  const bidPrice = finiteNumber(event.bestBidPrice);
  const bidQuantity = finiteNumber(event.bestBidQuantity);
  const askPrice = finiteNumber(event.bestAskPrice);
  const askQuantity = finiteNumber(event.bestAskQuantity);
  const hasTwoSidedBook = bidPrice > 0 && askPrice > 0 && askPrice >= bidPrice;
  const bookBidUsd = bidPrice * Math.max(0, bidQuantity);
  const bookAskUsd = askPrice * Math.max(0, askQuantity);
  const depthUsd = bookBidUsd + bookAskUsd;
  const midPrice = hasTwoSidedBook ? (bidPrice + askPrice) / 2 : 0;
  const spreadBps = hasTwoSidedBook && midPrice > 0 ? ((askPrice - bidPrice) / midPrice) * 10_000 : 0;
  const bookImbalance = depthUsd > 0 ? (bookBidUsd - bookAskUsd) / depthUsd : 0;
  const bookProxyQuality: WebSocketLightScanWindow["bookProxyQuality"] =
    depthUsd > 0 || spreadBps > 0
      ? event.bookSource === "ticker_bbo" ? "ticker_bbo_proxy" : "book_ticker_proxy"
      : "";

  return {
    bookAskUsd,
    bookBidUsd,
    bookImbalance: round(bookImbalance, 4),
    bookPressureSide: sideFromImbalance(bookImbalance),
    bookProxyQuality,
    spreadBps: round(spreadBps, 2),
  };
}

function largeTradeFromEvent({
  event,
  largeTakerTradeUsd,
  volumeUsd,
}: {
  event: WebSocketTickerEvent;
  largeTakerTradeUsd: number;
  volumeUsd: number;
}) {
  if (event.flowSource !== "trade" || volumeUsd < largeTakerTradeUsd) {
    return {
      count: 0,
      side: "neutral" as const,
      usd: 0,
    };
  }

  return {
    count: 1,
    side: event.takerSide === "buy" ? "buy" as const : event.takerSide === "sell" ? "sell" as const : "neutral" as const,
    usd: volumeUsd,
  };
}

function updateWindow({
  current,
  event,
  largeTakerTradeUsd,
  previousPrice,
  startMs,
  volumeUsd,
}: {
  current: WebSocketLightScanWindow | null;
  event: WebSocketTickerEvent;
  largeTakerTradeUsd: number;
  previousPrice?: number;
  startMs: number;
  volumeUsd: number;
}): WebSocketLightScanWindow {
  const flowSource = event.flowSource === "trade" ? "trade" : "ticker";
  const pressure = pressureBuckets({
    price: event.price,
    previousPrice,
    takerSide: event.takerSide,
    volumeUsd,
  });
  const book = bookSnapshotFromEvent(event);
  const largeTrade = largeTradeFromEvent({ event, largeTakerTradeUsd, volumeUsd });

  if (!current) {
    const tradeVolumeUsd = flowSource === "trade" ? volumeUsd : 0;
    const tickerInferredVolumeUsd = flowSource === "ticker" ? volumeUsd : 0;

    return {
      bookAskUsd: book.bookAskUsd,
      bookBidUsd: book.bookBidUsd,
      bookImbalance: book.bookImbalance,
      bookPressureSide: book.bookPressureSide,
      bookProxyQuality: book.bookProxyQuality,
      buyPressureUsd: pressure.buyPressureUsd,
      closePrice: event.price,
      flatPressureUsd: pressure.flatPressureUsd,
      highPrice: event.price,
      largeBuyTradeUsd: largeTrade.side === "buy" ? largeTrade.usd : 0,
      largeSellTradeUsd: largeTrade.side === "sell" ? largeTrade.usd : 0,
      largeTakerTradeCount: largeTrade.count,
      largeTakerTradeSide: largeTrade.side,
      largeTakerTradeUsd: largeTrade.usd,
      lowPrice: event.price,
      openPrice: event.price,
      sellPressureUsd: pressure.sellPressureUsd,
      spreadBps: book.spreadBps,
      startMs,
      tickerInferredVolumeUsd,
      tradeBuyPressureUsd: flowSource === "trade" ? pressure.buyPressureUsd : 0,
      tradeFlatPressureUsd: flowSource === "trade" ? pressure.flatPressureUsd : 0,
      tradeSellPressureUsd: flowSource === "trade" ? pressure.sellPressureUsd : 0,
      tradeVolumeUsd,
      volumeUsd: tradeVolumeUsd > 0 ? tradeVolumeUsd : tickerInferredVolumeUsd,
    };
  }

  const tickerInferredVolumeUsd = current.tickerInferredVolumeUsd + (flowSource === "ticker" ? volumeUsd : 0);
  const tradeBuyPressureUsd = current.tradeBuyPressureUsd + (flowSource === "trade" ? pressure.buyPressureUsd : 0);
  const tradeFlatPressureUsd = current.tradeFlatPressureUsd + (flowSource === "trade" ? pressure.flatPressureUsd : 0);
  const tradeSellPressureUsd = current.tradeSellPressureUsd + (flowSource === "trade" ? pressure.sellPressureUsd : 0);
  const tradeVolumeUsd = current.tradeVolumeUsd + (flowSource === "trade" ? volumeUsd : 0);
  const hasBookUpdate = Boolean(book.bookProxyQuality);
  const largeTakerTradeUsdValue = Math.max(current.largeTakerTradeUsd, largeTrade.usd);
  const largeTakerTradeSide = largeTrade.usd > current.largeTakerTradeUsd
    ? largeTrade.side
    : current.largeTakerTradeSide;

  return {
    ...current,
    bookAskUsd: hasBookUpdate ? book.bookAskUsd : current.bookAskUsd,
    bookBidUsd: hasBookUpdate ? book.bookBidUsd : current.bookBidUsd,
    bookImbalance: hasBookUpdate ? book.bookImbalance : current.bookImbalance,
    bookPressureSide: hasBookUpdate ? book.bookPressureSide : current.bookPressureSide,
    bookProxyQuality: hasBookUpdate ? book.bookProxyQuality : current.bookProxyQuality,
    buyPressureUsd: current.buyPressureUsd + pressure.buyPressureUsd,
    closePrice: event.price,
    flatPressureUsd: current.flatPressureUsd + pressure.flatPressureUsd,
    highPrice: Math.max(current.highPrice, event.price),
    largeBuyTradeUsd: current.largeBuyTradeUsd + (largeTrade.side === "buy" ? largeTrade.usd : 0),
    largeSellTradeUsd: current.largeSellTradeUsd + (largeTrade.side === "sell" ? largeTrade.usd : 0),
    largeTakerTradeCount: current.largeTakerTradeCount + largeTrade.count,
    largeTakerTradeSide,
    largeTakerTradeUsd: largeTakerTradeUsdValue,
    lowPrice: Math.min(current.lowPrice, event.price),
    sellPressureUsd: current.sellPressureUsd + pressure.sellPressureUsd,
    spreadBps: hasBookUpdate ? book.spreadBps : current.spreadBps,
    tickerInferredVolumeUsd,
    tradeBuyPressureUsd,
    tradeFlatPressureUsd,
    tradeSellPressureUsd,
    tradeVolumeUsd,
    volumeUsd: tradeVolumeUsd > 0 ? tradeVolumeUsd : tickerInferredVolumeUsd,
  };
}

function rolloverWindow({
  currentWindow,
  history,
  maxBaselineWindows,
}: {
  currentWindow: WebSocketLightScanWindow | null;
  history: WebSocketLightScanWindow[];
  maxBaselineWindows: number;
}) {
  if (!currentWindow) {
    return history;
  }

  return [...history, currentWindow].slice(-maxBaselineWindows);
}

function stateFromCandidate({
  absChange,
  volumeZScore,
}: {
  absChange: number;
  volumeZScore: number;
}): ScanLightScanCandidate["state"] {
  if (volumeZScore >= 2 && absChange >= 2) {
    return "HOT";
  }

  if (volumeZScore >= 1.5 && absChange < 2) {
    return "PRE_TREND";
  }

  if (volumeZScore >= 1 || absChange >= 1.2) {
    return "WARM";
  }

  return "COLD";
}

function overextensionRisk({
  absChange,
  closeNearExtreme,
}: {
  absChange: number;
  closeNearExtreme: boolean;
}): NonNullable<ScanLightScanCandidate["overextensionRisk"]> {
  if (absChange >= 6 && closeNearExtreme) {
    return "high";
  }

  if (absChange >= 4 || (absChange >= 3 && closeNearExtreme)) {
    return "medium";
  }

  return "low";
}

function earlyOpportunityScore({
  absChange,
  bookImbalance = 0,
  flowImbalance,
  largeTakerTradeCount = 0,
  overextension,
  state,
  volatilityPercent,
  volumeUsd,
  volumeZScore,
}: {
  absChange: number;
  bookImbalance?: number;
  flowImbalance: number;
  largeTakerTradeCount?: number;
  overextension: NonNullable<ScanLightScanCandidate["overextensionRisk"]>;
  state: ScanLightScanCandidate["state"];
  volatilityPercent: number;
  volumeUsd: number;
  volumeZScore: number;
}) {
  const compression = state === "PRE_TREND"
    ? 38
    : volatilityPercent <= 2.5 && absChange <= 2
      ? 18
      : 0;
  const lowDisplacement = absChange <= 2 ? Math.max(0, 18 - absChange * 5) : 0;
  const volume = Math.min(24, Math.max(0, volumeZScore) * 10);
  const liquidity = Math.min(12, logVolumeScore(volumeUsd) / 2);
  const pressure = Math.min(8, Math.abs(flowImbalance) * 16);
  const bookPressure = Math.min(6, Math.abs(bookImbalance) * 12);
  const largeTradePulse = largeTakerTradeCount > 0 ? 4 : 0;
  const penalty = overextension === "high"
    ? 45
    : overextension === "medium"
      ? 18
      : 0;

  return Math.round(Math.max(0, Math.min(100, compression + lowDisplacement + volume + liquidity + pressure + bookPressure + largeTradePulse - penalty)));
}

function candidateRankingScore({
  absChange,
  earlyScore,
  microstructure,
  risk,
  state,
  volumeUsd,
  volumeZScore,
}: {
  absChange: number;
  earlyScore: number;
  microstructure: NonNullable<ScanLightScanCandidate["microstructure"]>;
  risk: NonNullable<ScanLightScanCandidate["overextensionRisk"]>;
  state: ScanLightScanCandidate["state"];
  volumeUsd: number;
  volumeZScore: number;
}) {
  const earlyPriority = Math.min(46, earlyScore * 0.58);
  const volumeAcceleration = Math.min(26, Math.max(0, volumeZScore) * 11);
  const liquidity = Math.min(18, logVolumeScore(volumeUsd) * 0.65);
  const flowQuality = Math.min(12, Math.abs(microstructure.tradeFlowImbalance) * 18);
  const bookQuality = Math.min(10, Math.abs(microstructure.bookImbalance ?? 0) * 18);
  const largeTradeQuality = Math.min(
    8,
    (microstructure.largeTakerTradeCount ?? 0) > 0
      ? 4 + Math.log10(Math.max(1, microstructure.largeTakerTradeUsd ?? 0))
      : 0,
  );
  const displacement = absChange <= 2
    ? 12
    : absChange <= 4
      ? 6
      : -Math.min(22, (absChange - 4) * 5);
  const stateBonus = state === "PRE_TREND"
    ? 18
    : state === "HOT" && risk === "low"
      ? 8
      : 0;
  const overextensionPenalty = risk === "high"
    ? 72
    : risk === "medium"
      ? 28
      : 0;
  const raw = Math.round(
    earlyPriority +
    volumeAcceleration +
    liquidity +
    flowQuality +
    bookQuality +
    largeTradeQuality +
    displacement +
    stateBonus -
    overextensionPenalty,
  );

  if (risk === "high") {
    return Math.max(0, Math.min(42, raw));
  }

  if (risk === "medium") {
    return Math.max(0, Math.min(68, raw));
  }

  return Math.max(0, raw);
}

function opportunityPhase({
  absChange,
  earlyScore,
  overextension,
  state,
}: {
  absChange: number;
  earlyScore: number;
  overextension: NonNullable<ScanLightScanCandidate["overextensionRisk"]>;
  state: ScanLightScanCandidate["state"];
}): NonNullable<ScanLightScanCandidate["opportunityPhase"]> {
  if (overextension === "high") {
    return "late_move";
  }

  if (state === "PRE_TREND" || earlyScore >= 60) {
    return "early_setup";
  }

  if (state === "HOT" && absChange <= 4) {
    return "breakout_watch";
  }

  return "neutral_watch";
}

function candidateReasons({
  absChange,
  bookImbalance,
  earlyScore,
  flowImbalance,
  largeTakerTradeSide,
  largeTakerTradeUsd,
  overextension,
  spreadBps,
  state,
  volumeZScore,
}: {
  absChange: number;
  bookImbalance: number;
  earlyScore: number;
  flowImbalance: number;
  largeTakerTradeSide: "buy" | "neutral" | "sell";
  largeTakerTradeUsd: number;
  overextension: NonNullable<ScanLightScanCandidate["overextensionRisk"]>;
  spreadBps: number;
  state: ScanLightScanCandidate["state"];
  volumeZScore: number;
}) {
  const reasons: string[] = ["websocket_sliding_window"];

  if (volumeZScore >= 2) {
    reasons.push("volume_zscore_spike");
  }

  if (state === "PRE_TREND") {
    reasons.push("compression_volume_accumulation");
  }

  if (earlyScore >= 60) {
    reasons.push("early_opportunity_watch");
  }

  if (absChange >= 2) {
    reasons.push("price_impulse");
  }

  if (overextension === "high") {
    reasons.push("intrawindow_overextended_capped");
  }

  if (Math.abs(flowImbalance) >= 0.25) {
    reasons.push("trade_flow_proxy_imbalance");
  }

  if (flowImbalance >= 0.25) {
    reasons.push("cvd_proxy_positive");
  }

  if (flowImbalance <= -0.25) {
    reasons.push("cvd_proxy_negative");
  }

  if (Math.abs(bookImbalance) >= 0.2) {
    reasons.push("orderbook_pressure_proxy");
  }

  if (bookImbalance >= 0.2) {
    reasons.push("orderbook_buy_pressure");
  }

  if (bookImbalance <= -0.2) {
    reasons.push("orderbook_sell_pressure");
  }

  if (spreadBps >= 10) {
    reasons.push("spread_widening_watch");
  }

  if (largeTakerTradeUsd > 0) {
    reasons.push("large_taker_trade_proxy");
  }

  if (largeTakerTradeSide === "buy") {
    reasons.push("large_taker_buy_trade");
  }

  if (largeTakerTradeSide === "sell") {
    reasons.push("large_taker_sell_trade");
  }

  return reasons;
}

function microstructureFromWindow(window: WebSocketLightScanWindow): NonNullable<ScanLightScanCandidate["microstructure"]> {
  const hasTradeFlow = window.tradeVolumeUsd > 0;
  const buyPressureUsd = round(hasTradeFlow ? window.tradeBuyPressureUsd : window.buyPressureUsd, 0);
  const sellPressureUsd = round(hasTradeFlow ? window.tradeSellPressureUsd : window.sellPressureUsd, 0);
  const volumeUsd = Math.max(1, hasTradeFlow ? window.tradeVolumeUsd : window.volumeUsd);
  const cvdProxyUsd = buyPressureUsd - sellPressureUsd;
  const tradeFlowImbalance = round(cvdProxyUsd / volumeUsd, 4);
  const pressureSide: NonNullable<ScanLightScanCandidate["microstructure"]>["pressureSide"] =
    tradeFlowImbalance > 0.15 ? "buy" :
    tradeFlowImbalance < -0.15 ? "sell" :
    "neutral";

  return {
    bookAskUsd: round(window.bookAskUsd, 0),
    bookBidUsd: round(window.bookBidUsd, 0),
    bookImbalance: round(window.bookImbalance, 4),
    bookPressureSide: window.bookPressureSide,
    bookProxyQuality: window.bookProxyQuality || undefined,
    buyPressureUsd,
    cvdProxyUsd: round(cvdProxyUsd, 0),
    largeBuyTradeUsd: round(window.largeBuyTradeUsd, 0),
    largeSellTradeUsd: round(window.largeSellTradeUsd, 0),
    largeTakerTradeCount: window.largeTakerTradeCount,
    largeTakerTradeSide: window.largeTakerTradeSide,
    largeTakerTradeUsd: round(window.largeTakerTradeUsd, 0),
    pressureSide,
    proxyQuality: hasTradeFlow ? "taker_trade_proxy" : "rolling_price_volume_proxy",
    sellPressureUsd,
    spreadBps: round(window.spreadBps, 2),
    tradeFlowImbalance,
  };
}

function buildCandidate({
  state,
  window,
  windowMs,
  z,
}: {
  state: WebSocketLightScanSymbolState;
  window: WebSocketLightScanWindow;
  windowMs: number;
  z: number;
}): ScanLightScanCandidate {
  const openPrice = window.openPrice > 0 ? window.openPrice : state.lastPrice;
  const changePercent = openPrice > 0 ? ((window.closePrice - openPrice) / openPrice) * 100 : 0;
  const absChange = Math.abs(changePercent);
  const volatilityPercent = window.closePrice > 0
    ? ((window.highPrice - window.lowPrice) / window.closePrice) * 100
    : 0;
  const distanceHigh = window.highPrice > 0
    ? ((window.highPrice - window.closePrice) / window.highPrice) * 100
    : 100;
  const distanceLow = window.lowPrice > 0
    ? ((window.closePrice - window.lowPrice) / window.lowPrice) * 100
    : 100;
  const closeNearExtreme = distanceHigh <= 1 || distanceLow <= 1;
  const candidateStateValue = stateFromCandidate({ absChange, volumeZScore: z });
  const microstructure = microstructureFromWindow(window);
  const risk = overextensionRisk({ absChange, closeNearExtreme });
  const earlyScore = earlyOpportunityScore({
    absChange,
    bookImbalance: microstructure.bookImbalance ?? 0,
    flowImbalance: microstructure.tradeFlowImbalance,
    largeTakerTradeCount: microstructure.largeTakerTradeCount ?? 0,
    overextension: risk,
    state: candidateStateValue,
    volatilityPercent,
    volumeUsd: window.volumeUsd,
    volumeZScore: z,
  });
  const phase = opportunityPhase({
    absChange,
    earlyScore,
    overextension: risk,
    state: candidateStateValue,
  });
  const score = candidateRankingScore({
    absChange,
    earlyScore,
    microstructure,
    risk,
    state: candidateStateValue,
    volumeUsd: window.volumeUsd,
    volumeZScore: z,
  });

  return {
    baseAsset: baseFromSymbol(state.symbol),
    changePercent24h: round(changePercent),
    distanceFromHighPercent: round(distanceHigh),
    distanceFromLowPercent: round(distanceLow),
    earlyOpportunityScore: earlyScore,
    microstructure,
    opportunityPhase: phase,
    overextensionRisk: risk,
    price: round(window.closePrice, 8),
    reasons: candidateReasons({
      absChange,
      bookImbalance: microstructure.bookImbalance ?? 0,
      earlyScore,
      flowImbalance: microstructure.tradeFlowImbalance,
      largeTakerTradeSide: microstructure.largeTakerTradeSide ?? "neutral",
      largeTakerTradeUsd: microstructure.largeTakerTradeUsd ?? 0,
      overextension: risk,
      spreadBps: microstructure.spreadBps ?? 0,
      state: candidateStateValue,
      volumeZScore: z,
    }),
    score,
    state: candidateStateValue,
    symbol: state.symbol,
    volume24hUsd: round(window.volumeUsd),
    volumeSource: "rolling_window",
    volumeWindowMs: windowMs,
    volumeWindowUsd: round(window.volumeUsd),
    volatilityPercent: round(volatilityPercent),
  };
}

function instrumentFromState(state: WebSocketLightScanSymbolState): ContractInstrument {
  return {
    id: `${state.exchange}-WS-LIGHT:${state.symbol}`,
    symbol: state.symbol,
    baseAsset: baseFromSymbol(state.symbol),
    quoteAsset: "USDT",
    exchange: state.exchange,
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: round(state.currentWindow?.volumeUsd ?? 0),
    tags: ["websocket-light-scan", "quote:USDT", "market:perpetual"],
    lastSeenAt: state.lastEventAt,
  };
}

function tickerFromState(state: WebSocketLightScanSymbolState): MarketTicker {
  const window = state.currentWindow;
  const openPrice = window?.openPrice && window.openPrice > 0 ? window.openPrice : state.lastPrice;

  return {
    symbol: state.symbol,
    exchange: state.exchange,
    price: state.lastPrice,
    changePercent24h: round(openPrice > 0 ? ((state.lastPrice - openPrice) / openPrice) * 100 : 0),
    volume24hUsd: round(window?.volumeUsd ?? 0),
    high24h: window?.highPrice ?? state.lastPrice,
    low24h: window?.lowPrice ?? state.lastPrice,
    updatedAt: state.lastEventAt,
  };
}

function diagnostics({
  candidateCount,
  generatedAt,
  notes,
  priorityCandidates,
  status,
  universeCount,
}: {
  candidateCount: number;
  generatedAt: string;
  notes: string[];
  priorityCandidates: ScanLightScanCandidate[];
  status: ScanLightScanDiagnostics["status"];
  universeCount: number;
}): ScanLightScanDiagnostics {
  return {
    acceptedCount: universeCount,
    candidateCount,
    generatedAt,
    notes,
    requestCount: 0,
    source: "websocket-light-scan",
    status,
    topCandidates: priorityCandidates.slice(0, 12),
    universeCount,
  };
}

function anomalyFrameFromCandidate(candidate: ScanLightScanCandidate, generatedAt: string): ScanLightScanAnomalyFrame {
  return {
    bookImbalance: candidate.microstructure?.bookImbalance ?? null,
    bookPressureSide: candidate.microstructure?.bookPressureSide ?? null,
    changePercent: candidate.changePercent24h,
    cvdProxyUsd: candidate.microstructure?.cvdProxyUsd ?? null,
    generatedAt,
    largeTakerTradeSide: candidate.microstructure?.largeTakerTradeSide ?? null,
    largeTakerTradeUsd: candidate.microstructure?.largeTakerTradeUsd ?? null,
    opportunityPhase: candidate.opportunityPhase ?? null,
    overextensionRisk: candidate.overextensionRisk ?? null,
    pressureSide: candidate.microstructure?.pressureSide ?? null,
    price: candidate.price ?? null,
    reasonCodes: candidate.reasons,
    score: candidate.score,
    spreadBps: candidate.microstructure?.spreadBps ?? null,
    symbol: candidate.symbol,
    volumeWindowUsd: candidate.volumeWindowUsd ?? null,
  };
}

function sanitizeWebSocketLightScanSnapshot(snapshot: WebSocketLightScanSnapshot): WebSocketLightScanSnapshot {
  const isAllowedSymbol = (symbol: string) => isUsdtPerpLikeSymbol(normalizedSymbol(symbol));
  const priorityCandidates = snapshot.priorityCandidates.filter((candidate) => isAllowedSymbol(candidate.symbol));
  const anomalyFrames = snapshot.anomalyFrames?.filter((frame) => isAllowedSymbol(frame.symbol));
  const instruments = snapshot.instruments.filter((instrument) =>
    isAllowedSymbol(instrument.symbol) && isCryptoFuturesUnderlying(instrument.baseAsset)
  );
  const tickers = snapshot.tickers.filter((ticker) => isAllowedSymbol(ticker.symbol));

  return {
    ...snapshot,
    diagnostics: {
      ...snapshot.diagnostics,
      acceptedCount: instruments.length,
      candidateCount: priorityCandidates.length,
      topCandidates: priorityCandidates.slice(0, 12),
      universeCount: instruments.length,
    },
    anomalyFrames,
    instruments,
    priorityCandidates,
    tickers,
  };
}

export function createWebSocketLightScanAccumulator({
  largeTakerTradeUsd = defaultLargeTakerTradeUsd,
  maxBaselineWindows = defaultMaxBaselineWindows,
  maxPriorityCandidates = defaultMaxPriorityCandidates,
  minCandidateVolumeUsd = defaultMinCandidateVolumeUsd,
  now = () => new Date(),
  windowMs = defaultWindowMs,
  zScoreThreshold = defaultZScoreThreshold,
}: WebSocketLightScanAccumulatorOptions = {}): WebSocketLightScanAccumulator {
  const states = new Map<string, WebSocketLightScanSymbolState>();

  return {
    ingest(event) {
      const symbol = normalizedSymbol(event.symbol);
      const price = finiteNumber(event.price);
      const eventTime = new Date(event.eventTime).getTime();

      if (!isUsdtPerpLikeSymbol(symbol) || price <= 0 || Number.isNaN(eventTime)) {
        return;
      }

      const startMs = windowStartMs(eventTime, windowMs);
      const previous = states.get(symbol);
      const delta = volumeDelta({ event, state: previous });
      const isSameWindow = previous?.currentWindow?.startMs === startMs;
      const history = isSameWindow
        ? previous.history
        : rolloverWindow({
            currentWindow: previous?.currentWindow ?? null,
            history: previous?.history ?? [],
            maxBaselineWindows,
          });
      const currentWindow = updateWindow({
        current: isSameWindow ? previous.currentWindow : null,
        event: { ...event, price, symbol },
        largeTakerTradeUsd,
        previousPrice: previous?.lastPrice,
        startMs,
        volumeUsd: delta,
      });

      states.set(symbol, {
        currentWindow,
        exchange: event.exchange,
        history,
        lastEventAt: new Date(eventTime).toISOString(),
        lastPrice: price,
        lastQuoteVolume24hUsd: event.quoteVolume24hUsd ?? previous?.lastQuoteVolume24hUsd,
        symbol,
      });
    },
    snapshot() {
      const priorityCandidates = [...states.values()]
        .map((state) => {
          const window = state.currentWindow;

          if (!window) {
            return null;
          }

          const z = zScore(window.volumeUsd, state.history.map((item) => item.volumeUsd));
          const candidate = buildCandidate({ state, window, windowMs, z });

          if (window.volumeUsd < minCandidateVolumeUsd && z < zScoreThreshold) {
            return null;
          }

          if (candidate.state === "COLD" || z < zScoreThreshold) {
            return null;
          }

          return candidate;
        })
        .filter((candidate): candidate is ScanLightScanCandidate => Boolean(candidate))
        .sort((left, right) => right.score - left.score)
        .slice(0, maxPriorityCandidates);
      const allStates = [...states.values()];
      const generatedAt = now().toISOString();
      const status = allStates.length > 0 ? "ready" : "failed";

      return {
        anomalyFrames: priorityCandidates.slice(0, 24).map((candidate) => anomalyFrameFromCandidate(candidate, generatedAt)),
        diagnostics: diagnostics({
          candidateCount: priorityCandidates.length,
          generatedAt,
          notes: [
            `websocket light scan window ${Math.round(windowMs / 60000)}m`,
            `volume z-score threshold ${zScoreThreshold}`,
            "trade flow and CVD proxy prefer public taker trade streams and fall back to rolling price/volume direction; discovery only",
            "book pressure and large taker trade proxy are discovery evidence only and cannot create trade plans",
            "snapshot is scheduling input; deep scan and evidence gate still required",
          ],
          priorityCandidates,
          status,
          universeCount: allStates.length,
        }),
        instruments: allStates.map(instrumentFromState),
        mode: "websocket_sliding_window",
        priorityCandidates,
        tickers: allStates.map(tickerFromState),
        windowMs,
      };
    },
  };
}

export function createMemoryWebSocketLightScanStore(initial?: WebSocketLightScanSnapshot): WebSocketLightScanStore {
  let value = initial ?? null;

  return {
    async readSnapshot() {
      return value;
    },
    async writeSnapshot(snapshot) {
      value = snapshot;
    },
  };
}

export function createRedisWebSocketLightScanStore({
  client,
  key = "chuan:ws-light-scan:snapshot",
}: {
  client: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options?: { EX?: number }) => Promise<unknown>;
  };
  key?: string;
}): WebSocketLightScanStore {
  return {
    async readSnapshot() {
      const raw = await client.get(key);

      return raw ? JSON.parse(raw) as WebSocketLightScanSnapshot : null;
    },
    async writeSnapshot(snapshot) {
      await client.set(key, JSON.stringify(snapshot), { EX: 60 * 20 });
    },
  };
}

export function staleWebSocketLightScanResult(now: Date): PublicLightScanResult {
  const generatedAt = now.toISOString();

  return {
    diagnostics: diagnostics({
      candidateCount: 0,
      generatedAt,
      notes: ["websocket light scan snapshot missing or stale"],
      priorityCandidates: [],
      status: "failed",
      universeCount: 0,
    }),
    instruments: [],
    priorityCandidates: [],
    tickers: [],
  };
}

export function createWebSocketLightScanProvider({
  now = () => new Date(),
  staleAfterMs = 3 * 60 * 1000,
  store,
}: WebSocketLightScanProviderOptions): PublicLightScanProvider {
  return {
    id: "websocket-light-scan",
    label: "WebSocket Light Scan",
    async scan() {
      const snapshot = await store.readSnapshot();
      const currentTime = now();

      if (!snapshot) {
        return staleWebSocketLightScanResult(currentTime);
      }

      const generatedAt = new Date(snapshot.diagnostics.generatedAt).getTime();

      if (Number.isNaN(generatedAt) || currentTime.getTime() - generatedAt > staleAfterMs) {
        return staleWebSocketLightScanResult(currentTime);
      }

      return sanitizeWebSocketLightScanSnapshot(snapshot);
    },
  };
}
