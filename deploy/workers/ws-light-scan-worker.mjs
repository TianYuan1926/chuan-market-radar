import { fileURLToPath } from "node:url";
import { createClient } from "redis";

const defaultWindowMs = 15 * 60 * 1000;
const defaultMaxBaselineWindows = 12;
const defaultMaxPriorityCandidates = 48;
const defaultMinCandidateVolumeUsd = 250_000;
const defaultZScoreThreshold = 2;
const defaultSnapshotKey = "chuan:ws-light-scan:snapshot";
const appInternalUrl = String(process.env.APP_INTERNAL_URL ?? "http://web:3000").replace(/\/+$/, "");
const cronSecret = process.env.CRON_SECRET ?? "";
const nonCryptoUnderlyingDenylist = new Set([
  "AAPL",
  "AAOI",
  "AMD",
  "AMZN",
  "ARM",
  "AVGO",
  "BABA",
  "BIDU",
  "BRK",
  "CIEN",
  "CL",
  "COIN",
  "CRCL",
  "CSCO",
  "DIA",
  "DIS",
  "DRAM",
  "EWJ",
  "EWY",
  "FXI",
  "GOOG",
  "GOOGL",
  "HOOD",
  "HYUNDAI",
  "IBM",
  "INTC",
  "ISRG",
  "IWM",
  "JD",
  "KLAC",
  "KWEB",
  "LRCX",
  "META",
  "MRVL",
  "MSTR",
  "MSFT",
  "MU",
  "NATGAS",
  "NBIS",
  "NFLX",
  "NOK",
  "NOKIA",
  "NVO",
  "NVDA",
  "PDD",
  "PLTR",
  "POET",
  "QCOM",
  "QQQ",
  "RIVN",
  "RKLB",
  "SAMSUNG",
  "SKHYNIX",
  "SNDK",
  "SOXL",
  "SPCX",
  "SPY",
  "TCEHY",
  "TSLA",
  "TSM",
  "USO",
  "WDC",
  "XAG",
  "XAU",
  "XOM",
]);

function finiteNumber(value) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveNumberFromEnv(key, fallback) {
  const parsed = Number(process.env[key] ?? fallback);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumberFromEnv(key, fallback) {
  const parsed = Number(process.env[key] ?? fallback);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanFromEnv(key, fallback = true) {
  const value = String(process.env[key] ?? "").trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return !["0", "false", "no", "off", "disabled"].includes(value);
}

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function normalizedSymbol(value) {
  return String(value ?? "").trim().toUpperCase().replace("/", "").replace("-", "");
}

function baseFromSymbol(symbol) {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

function normalizeBaseAssetForClass(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-_/]/g, "")
    .replace(/(USDT|USDC|USD|PERP|SWAP)\.?P?$/u, "");
}

function isCryptoFuturesUnderlying(value) {
  const baseAsset = normalizeBaseAssetForClass(value);

  return Boolean(baseAsset) &&
    /^[A-Z0-9]{1,30}$/u.test(baseAsset) &&
    !nonCryptoUnderlyingDenylist.has(baseAsset);
}

function isUsdtPerpLikeSymbol(symbol) {
  return symbol.endsWith("USDT") &&
    !symbol.includes("_") &&
    symbol.length > 4 &&
    isCryptoFuturesUnderlying(symbol);
}

function payloadToString(raw) {
  if (typeof raw === "string") {
    return raw;
  }

  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }

  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8");
  }

  return raw;
}

function safeJsonParse(raw) {
  const value = payloadToString(raw);

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function eventTimeFromMs(value) {
  const ms = finiteNumber(value);

  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString();
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function windowStartMs(timeMs, windowMs) {
  return Math.floor(timeMs / windowMs) * windowMs;
}

function mean(values) {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));

  return Math.sqrt(variance);
}

function zScore(current, baseline) {
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

function logVolumeScore(volumeUsd) {
  return Math.min(28, Math.max(0, Math.log10(Math.max(1, volumeUsd)) * 2.5));
}

function candidateState({ absChange, volumeZScore }) {
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

function overextensionRisk({ absChange, closeNearExtreme }) {
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
  flowImbalance,
  overextension,
  state,
  volatilityPercent,
  volumeUsd,
  volumeZScore,
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
  const penalty = overextension === "high"
    ? 45
    : overextension === "medium"
      ? 18
      : 0;

  return Math.round(Math.max(0, Math.min(100, compression + lowDisplacement + volume + liquidity + pressure - penalty)));
}

function candidateRankingScore({
  absChange,
  earlyScore,
  microstructure,
  risk,
  state,
  volumeUsd,
  volumeZScore,
}) {
  const earlyPriority = Math.min(46, earlyScore * 0.58);
  const volumeAcceleration = Math.min(26, Math.max(0, volumeZScore) * 11);
  const liquidity = Math.min(18, logVolumeScore(volumeUsd) * 0.65);
  const flowQuality = Math.min(12, Math.abs(microstructure.tradeFlowImbalance) * 18);
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

function opportunityPhase({ absChange, earlyScore, overextension, state }) {
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

function candidateReasons({ absChange, earlyScore, flowImbalance, overextension, state, volumeZScore }) {
  const reasons = ["websocket_sliding_window"];

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

  return reasons;
}

function stateKey(exchange, symbol) {
  return `${exchange}:${symbol}`;
}

function volumeDelta({ event, state }) {
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

function pressureBuckets({ price, previousPrice, takerSide, volumeUsd }) {
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

function updateWindow({ current, event, previousPrice, startMs, volumeUsd }) {
  const flowSource = event.flowSource === "trade" ? "trade" : "ticker";
  const pressure = pressureBuckets({
    price: event.price,
    previousPrice,
    takerSide: event.takerSide,
    volumeUsd,
  });

  if (!current) {
    const tradeVolumeUsd = flowSource === "trade" ? volumeUsd : 0;
    const tickerInferredVolumeUsd = flowSource === "ticker" ? volumeUsd : 0;

    return {
      buyPressureUsd: pressure.buyPressureUsd,
      closePrice: event.price,
      flatPressureUsd: pressure.flatPressureUsd,
      highPrice: event.price,
      lowPrice: event.price,
      openPrice: event.price,
      sellPressureUsd: pressure.sellPressureUsd,
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

  return {
    ...current,
    buyPressureUsd: current.buyPressureUsd + pressure.buyPressureUsd,
    closePrice: event.price,
    flatPressureUsd: current.flatPressureUsd + pressure.flatPressureUsd,
    highPrice: Math.max(current.highPrice, event.price),
    lowPrice: Math.min(current.lowPrice, event.price),
    sellPressureUsd: current.sellPressureUsd + pressure.sellPressureUsd,
    tickerInferredVolumeUsd,
    tradeBuyPressureUsd,
    tradeFlatPressureUsd,
    tradeSellPressureUsd,
    tradeVolumeUsd,
    volumeUsd: tradeVolumeUsd > 0 ? tradeVolumeUsd : tickerInferredVolumeUsd,
  };
}

function rolloverWindow({ currentWindow, history, maxBaselineWindows }) {
  if (!currentWindow) {
    return history;
  }

  return [...history, currentWindow].slice(-maxBaselineWindows);
}

function microstructureFromWindow(window) {
  const hasTradeFlow = window.tradeVolumeUsd > 0;
  const buyPressureUsd = round(hasTradeFlow ? window.tradeBuyPressureUsd : window.buyPressureUsd, 0);
  const sellPressureUsd = round(hasTradeFlow ? window.tradeSellPressureUsd : window.sellPressureUsd, 0);
  const volumeUsd = Math.max(1, hasTradeFlow ? window.tradeVolumeUsd : window.volumeUsd);
  const cvdProxyUsd = buyPressureUsd - sellPressureUsd;
  const tradeFlowImbalance = round(cvdProxyUsd / volumeUsd, 4);
  const pressureSide = tradeFlowImbalance > 0.15
    ? "buy"
    : tradeFlowImbalance < -0.15
      ? "sell"
      : "neutral";

  return {
    buyPressureUsd,
    cvdProxyUsd: round(cvdProxyUsd, 0),
    pressureSide,
    proxyQuality: hasTradeFlow ? "taker_trade_proxy" : "rolling_price_volume_proxy",
    sellPressureUsd,
    tradeFlowImbalance,
  };
}

function buildCandidate({ state, window, windowMs, z }) {
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
  const stateValue = candidateState({ absChange, volumeZScore: z });
  const microstructure = microstructureFromWindow(window);
  const risk = overextensionRisk({ absChange, closeNearExtreme });
  const earlyScore = earlyOpportunityScore({
    absChange,
    flowImbalance: microstructure.tradeFlowImbalance,
    overextension: risk,
    state: stateValue,
    volatilityPercent,
    volumeUsd: window.volumeUsd,
    volumeZScore: z,
  });
  const phase = opportunityPhase({
    absChange,
    earlyScore,
    overextension: risk,
    state: stateValue,
  });
  const score = candidateRankingScore({
    absChange,
    earlyScore,
    microstructure,
    risk,
    state: stateValue,
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
      earlyScore,
      flowImbalance: microstructure.tradeFlowImbalance,
      overextension: risk,
      state: stateValue,
      volumeZScore: z,
    }),
    score,
    state: stateValue,
    symbol: state.symbol,
    volume24hUsd: round(window.volumeUsd),
    volumeSource: "rolling_window",
    volumeWindowMs: windowMs,
    volumeWindowUsd: round(window.volumeUsd),
    volatilityPercent: round(volatilityPercent),
  };
}

function instrumentFromState(state) {
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

function tickerFromState(state) {
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

function mergeCandidatesBySymbol(candidates, maxPriorityCandidates) {
  const bySymbol = new Map();

  for (const candidate of candidates) {
    const existing = bySymbol.get(candidate.symbol);

    if (!existing || candidate.score > existing.score) {
      bySymbol.set(candidate.symbol, candidate);
      continue;
    }

    if (existing) {
      existing.reasons = [...new Set([...existing.reasons, ...candidate.reasons, "cross_exchange_websocket"])];
      existing.volume24hUsd = Math.max(existing.volume24hUsd, candidate.volume24hUsd);
    }
  }

  return [...bySymbol.values()]
    .sort((left, right) => right.score - left.score || right.volume24hUsd - left.volume24hUsd)
    .slice(0, maxPriorityCandidates);
}

function diagnostics({ candidateCount, generatedAt, notes, priorityCandidates, status, universeCount }) {
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

export function createLightScanAccumulator({
  maxBaselineWindows = defaultMaxBaselineWindows,
  maxPriorityCandidates = defaultMaxPriorityCandidates,
  minCandidateVolumeUsd = defaultMinCandidateVolumeUsd,
  now = () => new Date(),
  windowMs = defaultWindowMs,
  zScoreThreshold = defaultZScoreThreshold,
} = {}) {
  const states = new Map();

  return {
    ingest(event) {
      const symbol = normalizedSymbol(event.symbol);
      const price = finiteNumber(event.price);
      const eventTime = new Date(event.eventTime).getTime();
      const exchange = String(event.exchange ?? "").toUpperCase();

      if (!exchange || !isUsdtPerpLikeSymbol(symbol) || price <= 0 || Number.isNaN(eventTime)) {
        return;
      }

      const key = stateKey(exchange, symbol);
      const startMs = windowStartMs(eventTime, windowMs);
      const previous = states.get(key);
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
        previousPrice: previous?.lastPrice,
        startMs,
        volumeUsd: delta,
      });

      states.set(key, {
        currentWindow,
        exchange,
        history,
        lastEventAt: new Date(eventTime).toISOString(),
        lastPrice: price,
        lastQuoteVolume24hUsd: finiteNumber(event.quoteVolume24hUsd) || previous?.lastQuoteVolume24hUsd,
        symbol,
      });
    },
    snapshot() {
      const allStates = [...states.values()];
      const rawCandidates = allStates
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
        .filter(Boolean);
      const priorityCandidates = mergeCandidatesBySymbol(rawCandidates, maxPriorityCandidates);
      const generatedAt = now().toISOString();
      const status = allStates.length > 0 ? "ready" : "failed";

      return {
        diagnostics: diagnostics({
          candidateCount: priorityCandidates.length,
          generatedAt,
          notes: [
            `websocket light scan worker window ${Math.round(windowMs / 60000)}m`,
            `volume z-score threshold ${zScoreThreshold}`,
            "trade flow and CVD proxy prefer public taker trade streams and fall back to rolling price/volume direction; discovery only",
            "snapshot is scheduling input; CoinGlass deep scan and Evidence gate still required",
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

export function parseBinanceTickerMessage(raw) {
  const payload = safeJsonParse(raw);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  return rows
    .map((row) => {
      const symbol = normalizedSymbol(row?.s);
      const price = finiteNumber(row?.c);

      if (!isUsdtPerpLikeSymbol(symbol) || price <= 0) {
        return null;
      }

      return {
        eventTime: eventTimeFromMs(row?.E),
        exchange: "BINANCE",
        flowSource: "ticker",
        price,
        quoteVolume24hUsd: finiteNumber(row?.q),
        symbol,
      };
    })
    .filter(Boolean);
}

export function parseBinanceAggTradeMessage(raw) {
  const payload = safeJsonParse(raw);
  const rows = Array.isArray(payload)
    ? payload
    : payload?.data
      ? [payload.data]
      : payload?.e === "aggTrade"
        ? [payload]
        : [];

  return rows
    .map((row) => {
      const symbol = normalizedSymbol(row?.s);
      const price = finiteNumber(row?.p);
      const quantity = finiteNumber(row?.q);
      const quoteVolumeDeltaUsd = price * quantity;

      if (!isUsdtPerpLikeSymbol(symbol) || price <= 0 || quoteVolumeDeltaUsd <= 0) {
        return null;
      }

      return {
        eventTime: eventTimeFromMs(row?.E ?? row?.T),
        exchange: "BINANCE",
        flowSource: "trade",
        price,
        quoteVolumeDeltaUsd,
        symbol,
        takerSide: row?.m === true ? "sell" : "buy",
      };
    })
    .filter(Boolean);
}

function okxSymbolFromInstId(instId) {
  const value = String(instId ?? "").trim().toUpperCase();

  if (!value.endsWith("-USDT-SWAP")) {
    return "";
  }

  return `${value.slice(0, -"-USDT-SWAP".length).replace(/-/g, "")}USDT`;
}

function isOkxCryptoSwapRow(row) {
  const instCategory = String(row?.instCategory ?? "").trim();
  const ruleType = String(row?.ruleType ?? "").trim().toLowerCase();

  return instCategory === "1" && ruleType !== "pre_market";
}

function isBybitCryptoLinearRow(row) {
  const symbolType = String(row?.symbolType ?? "").trim().toLowerCase();
  const contractType = String(row?.contractType ?? "").trim().toLowerCase();
  const status = String(row?.status ?? "").trim().toLowerCase();

  return (!contractType || contractType === "linearperpetual") &&
    (!status || status === "trading") &&
    symbolType !== "stock" &&
    symbolType !== "commodity";
}

export function parseOkxTickerMessage(raw) {
  const payloadText = payloadToString(raw);

  if (payloadText === "ping" || payloadText === "pong") {
    return [];
  }

  const payload = safeJsonParse(payloadText);
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  return rows
    .map((row) => {
      if (!isOkxCryptoSwapRow(row)) {
        return null;
      }

      const symbol = okxSymbolFromInstId(row?.instId);
      const price = finiteNumber(row?.last);

      if (!isUsdtPerpLikeSymbol(symbol) || price <= 0) {
        return null;
      }

      return {
        eventTime: eventTimeFromMs(row?.ts),
        exchange: "OKX",
        flowSource: "ticker",
        price,
        quoteVolume24hUsd: finiteNumber(row?.volCcy24h) * price,
        symbol,
      };
    })
    .filter(Boolean);
}

export function parseOkxTradeMessage(raw) {
  const payloadText = payloadToString(raw);

  if (payloadText === "ping" || payloadText === "pong") {
    return [];
  }

  const payload = safeJsonParse(payloadText);
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  return rows
    .map((row) => {
      const symbol = okxSymbolFromInstId(row?.instId);
      const price = finiteNumber(row?.px);
      const size = finiteNumber(row?.sz);
      const side = String(row?.side ?? "").trim().toLowerCase();
      const quoteVolumeDeltaUsd = price * size;

      if (!isUsdtPerpLikeSymbol(symbol) || price <= 0 || quoteVolumeDeltaUsd <= 0) {
        return null;
      }

      return {
        eventTime: eventTimeFromMs(row?.ts),
        exchange: "OKX",
        flowSource: "trade",
        price,
        quoteVolumeDeltaUsd,
        symbol,
        takerSide: side === "buy" ? "buy" : side === "sell" ? "sell" : "unknown",
      };
    })
    .filter(Boolean);
}

export function parseBybitTickerMessage(raw) {
  const payload = safeJsonParse(raw);
  const rows = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];

  return rows
    .map((row) => {
      const symbol = normalizedSymbol(row?.symbol ?? String(payload?.topic ?? "").replace(/^tickers\./, ""));
      const price = finiteNumber(row?.lastPrice);

      if (!isUsdtPerpLikeSymbol(symbol) || price <= 0) {
        return null;
      }

      return {
        eventTime: eventTimeFromMs(row?.ts ?? payload?.ts),
        exchange: "BYBIT",
        flowSource: "ticker",
        price,
        quoteVolume24hUsd: finiteNumber(row?.turnover24h),
        symbol,
      };
    })
    .filter(Boolean);
}

export function parseBybitPublicTradeMessage(raw) {
  const payload = safeJsonParse(raw);
  const rows = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];

  return rows
    .map((row) => {
      const symbol = normalizedSymbol(row?.s ?? row?.symbol ?? String(payload?.topic ?? "").replace(/^publicTrade\./, ""));
      const price = finiteNumber(row?.p ?? row?.price);
      const size = finiteNumber(row?.v ?? row?.size);
      const side = String(row?.S ?? row?.side ?? "").trim().toLowerCase();
      const quoteVolumeDeltaUsd = price * size;

      if (!isUsdtPerpLikeSymbol(symbol) || price <= 0 || quoteVolumeDeltaUsd <= 0) {
        return null;
      }

      return {
        eventTime: eventTimeFromMs(row?.T ?? row?.ts ?? payload?.ts),
        exchange: "BYBIT",
        flowSource: "trade",
        price,
        quoteVolumeDeltaUsd,
        symbol,
        takerSide: side === "buy" ? "buy" : side === "sell" ? "sell" : "unknown",
      };
    })
    .filter(Boolean);
}

export function buildSubscriptionChunks(items, chunkSize) {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function filterTickerEventsByAllowedSymbols(events, allowedSymbols) {
  if (!allowedSymbols || allowedSymbols.size === 0) {
    return events;
  }

  return events.filter((event) => allowedSymbols.has(event.symbol));
}

export async function discoverBinanceSymbols({ fetcher = fetch, limit = 500 } = {}) {
  const response = await fetcher(process.env.BINANCE_EXCHANGE_INFO_URL ?? "https://fapi.binance.com/fapi/v1/exchangeInfo");

  if (!response.ok) {
    throw new Error(`Binance exchangeInfo returned ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.symbols) ? payload.symbols : [];

  return rows
    .map((row) => {
      const symbol = normalizedSymbol(row?.symbol);
      const baseAsset = normalizedSymbol(row?.baseAsset);
      const quoteAsset = normalizedSymbol(row?.quoteAsset);
      const contractType = normalizedSymbol(row?.contractType);
      const status = normalizedSymbol(row?.status);
      const underlyingType = normalizedSymbol(row?.underlyingType);

      if (
        !symbol ||
        !baseAsset ||
        quoteAsset !== "USDT" ||
        status !== "TRADING" ||
        contractType !== "PERPETUAL" ||
        underlyingType !== "COIN" ||
        symbol !== `${baseAsset}USDT` ||
        !isUsdtPerpLikeSymbol(symbol)
      ) {
        return null;
      }

      return symbol;
    })
    .filter(Boolean)
    .slice(0, limit);
}

export async function discoverOkxSymbols({ fetcher = fetch, limit = 500 } = {}) {
  const url = new URL(process.env.OKX_INSTRUMENTS_URL ?? "https://www.okx.com/api/v5/public/instruments");
  url.searchParams.set("instType", "SWAP");
  const response = await fetcher(url);

  if (!response.ok) {
    throw new Error(`OKX instruments returned ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  return rows
    .filter((row) => isOkxCryptoSwapRow(row))
    .map((row) => {
      const instId = String(row?.instId ?? "").toUpperCase();
      const symbol = okxSymbolFromInstId(instId);

      if (!isUsdtPerpLikeSymbol(symbol)) {
        return null;
      }

      return instId;
    })
    .filter(Boolean)
    .slice(0, limit);
}

export async function discoverBybitSymbols({ fetcher = fetch, limit = 500 } = {}) {
  const symbols = [];
  let cursor = "";

  while (symbols.length < limit) {
    const url = new URL(process.env.BYBIT_INSTRUMENTS_URL ?? "https://api.bybit.com/v5/market/instruments-info");
    url.searchParams.set("category", "linear");
    url.searchParams.set("limit", "1000");

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetcher(url);

    if (!response.ok) {
      throw new Error(`Bybit instruments returned ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];

    for (const row of rows) {
      const symbol = normalizedSymbol(row?.symbol);

      if (!isBybitCryptoLinearRow(row)) {
        continue;
      }

      if (isUsdtPerpLikeSymbol(symbol)) {
        symbols.push(symbol);
      }
    }

    cursor = String(payload?.result?.nextPageCursor ?? "");

    if (!cursor || rows.length === 0) {
      break;
    }
  }

  return symbols.slice(0, limit);
}

async function buildSources() {
  const exchanges = splitCsv(process.env.WS_LIGHT_SCAN_EXCHANGES ?? "BINANCE,OKX,BYBIT");
  const symbolLimit = positiveNumberFromEnv("WS_LIGHT_SCAN_SYMBOL_LIMIT_PER_EXCHANGE", 500);
  const subscribeChunkSize = positiveNumberFromEnv("WS_LIGHT_SCAN_SUBSCRIBE_CHUNK_SIZE", 40);
  const tradeStreamsEnabled = booleanFromEnv("WS_LIGHT_SCAN_TRADE_STREAMS_ENABLED", true);
  const sources = [];

  if (exchanges.includes("BINANCE")) {
    try {
      const symbols = await discoverBinanceSymbols({ limit: symbolLimit });
      sources.push({
        allowedSymbols: new Set(symbols),
        exchange: "BINANCE",
        kind: "ticker",
        parser: parseBinanceTickerMessage,
        subscribeMessages: [],
        url: process.env.BINANCE_WS_TICKER_URL ?? "wss://fstream.binance.com/ws/!ticker@arr",
      });

      if (tradeStreamsEnabled) {
        const subscribeMessages = buildSubscriptionChunks(
          symbols.map((symbol) => `${symbol.toLowerCase()}@aggTrade`),
          subscribeChunkSize,
        ).map((params, index) => JSON.stringify({ id: index + 1, method: "SUBSCRIBE", params }));

        sources.push({
          allowedSymbols: new Set(symbols),
          exchange: "BINANCE",
          kind: "trades",
          parser: parseBinanceAggTradeMessage,
          subscribeMessages,
          url: process.env.BINANCE_WS_TRADE_URL ?? "wss://fstream.binance.com/ws",
        });
      }
    } catch (error) {
      log("source-discovery-failed", { exchange: "BINANCE", error: errorMessage(error) });
    }
  }

  if (exchanges.includes("OKX")) {
    try {
      const instIds = await discoverOkxSymbols({ limit: symbolLimit });
      const subscribeMessages = buildSubscriptionChunks(
        instIds.map((instId) => ({ channel: "tickers", instId })),
        subscribeChunkSize,
      ).map((args) => JSON.stringify({ op: "subscribe", args }));

      sources.push({
        allowedSymbols: new Set(instIds.map(okxSymbolFromInstId).filter(Boolean)),
        exchange: "OKX",
        kind: "ticker",
        parser: parseOkxTickerMessage,
        subscribeMessages,
        url: process.env.OKX_WS_PUBLIC_URL ?? "wss://ws.okx.com:8443/ws/v5/public",
      });

      if (tradeStreamsEnabled) {
        const tradeSubscribeMessages = buildSubscriptionChunks(
          instIds.map((instId) => ({ channel: "trades", instId })),
          subscribeChunkSize,
        ).map((args) => JSON.stringify({ op: "subscribe", args }));

        sources.push({
          allowedSymbols: new Set(instIds.map(okxSymbolFromInstId).filter(Boolean)),
          exchange: "OKX",
          kind: "trades",
          parser: parseOkxTradeMessage,
          subscribeMessages: tradeSubscribeMessages,
          url: process.env.OKX_WS_PUBLIC_URL ?? "wss://ws.okx.com:8443/ws/v5/public",
        });
      }
    } catch (error) {
      log("source-discovery-failed", { exchange: "OKX", error: errorMessage(error) });
    }
  }

  if (exchanges.includes("BYBIT")) {
    try {
      const symbols = await discoverBybitSymbols({ limit: symbolLimit });
      const subscribeMessages = buildSubscriptionChunks(
        symbols.map((symbol) => `tickers.${symbol}`),
        subscribeChunkSize,
      ).map((args) => JSON.stringify({ op: "subscribe", args }));

      sources.push({
        allowedSymbols: new Set(symbols),
        exchange: "BYBIT",
        kind: "ticker",
        parser: parseBybitTickerMessage,
        subscribeMessages,
        url: process.env.BYBIT_WS_PUBLIC_URL ?? "wss://stream.bybit.com/v5/public/linear",
      });

      if (tradeStreamsEnabled) {
        const tradeSubscribeMessages = buildSubscriptionChunks(
          symbols.map((symbol) => `publicTrade.${symbol}`),
          subscribeChunkSize,
        ).map((args) => JSON.stringify({ op: "subscribe", args }));

        sources.push({
          allowedSymbols: new Set(symbols),
          exchange: "BYBIT",
          kind: "trades",
          parser: parseBybitPublicTradeMessage,
          subscribeMessages: tradeSubscribeMessages,
          url: process.env.BYBIT_WS_PUBLIC_URL ?? "wss://stream.bybit.com/v5/public/linear",
        });
      }
    } catch (error) {
      log("source-discovery-failed", { exchange: "BYBIT", error: errorMessage(error) });
    }
  }

  return sources;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}

function log(message, fields = {}) {
  process.stdout.write(JSON.stringify({
    at: new Date().toISOString(),
    message,
    worker: "ws-light-scan",
    ...fields,
  }) + "\n");
}

async function postHeartbeat({
  detail,
  elapsedMs,
  status,
  task,
}) {
  if (!cronSecret.trim()) {
    return;
  }

  try {
    await fetch(`${appInternalUrl}/api/admin/runtime/heartbeat`, {
      body: JSON.stringify({
        detail,
        elapsedMs,
        status,
        task,
        worker: "ws-light-scan",
      }),
      headers: {
        authorization: `Bearer ${cronSecret}`,
        "cache-control": "no-store",
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error) {
    log("heartbeat-error", {
      error: errorMessage(error),
      task,
    });
  }
}

function writeSnapshotLoop({ accumulator, client, intervalMs, key, ttlSeconds }) {
  return setInterval(async () => {
    const startedAt = Date.now();

    try {
      const snapshot = accumulator.snapshot();
      await client.set(key, JSON.stringify(snapshot), { EX: ttlSeconds });
      await postHeartbeat({
        detail: `candidates=${snapshot.diagnostics.candidateCount}, universe=${snapshot.diagnostics.universeCount}`,
        elapsedMs: Date.now() - startedAt,
        status: "ok",
        task: "websocket-light-snapshot",
      });
      log("snapshot-written", {
        candidateCount: snapshot.diagnostics.candidateCount,
        key,
        universeCount: snapshot.diagnostics.universeCount,
      });
    } catch (error) {
      await postHeartbeat({
        detail: errorMessage(error),
        status: "error",
        task: "websocket-light-snapshot",
      });
      log("snapshot-write-failed", { error: errorMessage(error), key });
    }
  }, intervalMs);
}

function connectSource({ accumulator, reconnectMs, source }) {
  let socket = null;

  const connect = () => {
    log("source-connecting", {
      exchange: source.exchange,
      kind: source.kind ?? "unknown",
      subscriptions: source.subscribeMessages.length,
      url: source.url,
    });

    socket = new WebSocket(source.url);

    socket.addEventListener("open", () => {
      log("source-open", { exchange: source.exchange, kind: source.kind ?? "unknown" });

      for (const message of source.subscribeMessages) {
        socket.send(message);
      }
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string" && source.exchange === "OKX" && event.data === "ping") {
        socket.send("pong");
        return;
      }

      const events = filterTickerEventsByAllowedSymbols(source.parser(event.data), source.allowedSymbols);

      for (const tickerEvent of events) {
        accumulator.ingest(tickerEvent);
      }
    });

    socket.addEventListener("close", (event) => {
      log("source-closed", {
        code: event.code,
        exchange: source.exchange,
        kind: source.kind ?? "unknown",
        reason: event.reason,
      });
      setTimeout(connect, reconnectMs);
    });

    socket.addEventListener("error", () => {
      log("source-error", { exchange: source.exchange, kind: source.kind ?? "unknown" });
    });
  };

  connect();

  return () => {
    if (socket) {
      socket.close();
    }
  };
}

export async function runWorker() {
  if (!booleanFromEnv("WS_LIGHT_SCAN_WORKER_ENABLED", true)) {
    log("worker-disabled");
    return;
  }

  if (typeof WebSocket === "undefined") {
    throw new Error("global WebSocket is unavailable; use Node.js 22 or newer");
  }

  const redisUrl = process.env.REDIS_URL ?? "redis://redis:6379";
  const snapshotKey = process.env.WS_LIGHT_SCAN_REDIS_KEY ?? defaultSnapshotKey;
  const snapshotIntervalMs = positiveNumberFromEnv("WS_LIGHT_SCAN_SNAPSHOT_INTERVAL_SECONDS", 15) * 1000;
  const ttlSeconds = positiveNumberFromEnv("WS_LIGHT_SCAN_SNAPSHOT_TTL_SECONDS", 20 * 60);
  const reconnectMs = positiveNumberFromEnv("WS_LIGHT_SCAN_RECONNECT_SECONDS", 10) * 1000;
  const accumulator = createLightScanAccumulator({
    maxPriorityCandidates: positiveNumberFromEnv("WS_LIGHT_SCAN_MAX_PRIORITY_CANDIDATES", defaultMaxPriorityCandidates),
    minCandidateVolumeUsd: nonNegativeNumberFromEnv("WS_LIGHT_SCAN_MIN_CANDIDATE_VOLUME_USD", defaultMinCandidateVolumeUsd),
    windowMs: positiveNumberFromEnv("WS_LIGHT_SCAN_WINDOW_MS", defaultWindowMs),
    zScoreThreshold: nonNegativeNumberFromEnv("WS_LIGHT_SCAN_ZSCORE_THRESHOLD", defaultZScoreThreshold),
  });
  const client = createClient({ url: redisUrl });

  client.on("error", (error) => {
    log("redis-error", { error: errorMessage(error) });
  });

  await client.connect();
  log("redis-ready", { snapshotKey });
  await postHeartbeat({
    detail: `redis-ready key=${snapshotKey}`,
    status: "starting",
    task: "boot",
  });

  const sources = await buildSources();

  if (sources.length === 0) {
    await postHeartbeat({
      detail: "no WebSocket light scan sources enabled",
      status: "error",
      task: "boot",
    });
    throw new Error("no WebSocket light scan sources enabled");
  }

  const interval = writeSnapshotLoop({
    accumulator,
    client,
    intervalMs: snapshotIntervalMs,
    key: snapshotKey,
    ttlSeconds,
  });
  const disconnectors = sources.map((source) => connectSource({ accumulator, reconnectMs, source }));

  process.on("SIGTERM", async () => {
    clearInterval(interval);
    disconnectors.forEach((disconnect) => disconnect());
    await client.quit();
    process.exit(0);
  });

  while (true) {
    await sleep(60_000);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runWorker().catch((error) => {
    log("worker-failed", { error: errorMessage(error) });
    process.exit(1);
  });
}
