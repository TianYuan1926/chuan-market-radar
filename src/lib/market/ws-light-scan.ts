import type { ExchangeId, ContractInstrument, MarketTicker, ScanLightScanCandidate, ScanLightScanDiagnostics } from "./types";
import type { PublicLightScanProvider, PublicLightScanResult } from "./providers/public-light-scan";
import { isCryptoFuturesUnderlying } from "./asset-class-filter";

export type WebSocketTickerEvent = {
  eventTime: string;
  exchange: ExchangeId;
  price: number;
  quoteVolume24hUsd?: number;
  quoteVolumeDeltaUsd?: number;
  symbol: string;
};

export type WebSocketLightScanWindow = {
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  startMs: number;
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

function updateWindow({
  current,
  event,
  startMs,
  volumeUsd,
}: {
  current: WebSocketLightScanWindow | null;
  event: WebSocketTickerEvent;
  startMs: number;
  volumeUsd: number;
}): WebSocketLightScanWindow {
  if (!current) {
    return {
      closePrice: event.price,
      highPrice: event.price,
      lowPrice: event.price,
      openPrice: event.price,
      startMs,
      volumeUsd,
    };
  }

  return {
    ...current,
    closePrice: event.price,
    highPrice: Math.max(current.highPrice, event.price),
    lowPrice: Math.min(current.lowPrice, event.price),
    volumeUsd: current.volumeUsd + volumeUsd,
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

function candidateReasons({
  absChange,
  state,
  volumeZScore,
}: {
  absChange: number;
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

  if (absChange >= 2) {
    reasons.push("price_impulse");
  }

  return reasons;
}

function buildCandidate({
  state,
  window,
  z,
}: {
  state: WebSocketLightScanSymbolState;
  window: WebSocketLightScanWindow;
  z: number;
}): ScanLightScanCandidate {
  const openPrice = window.openPrice > 0 ? window.openPrice : state.lastPrice;
  const changePercent = openPrice > 0 ? ((window.closePrice - openPrice) / openPrice) * 100 : 0;
  const absChange = Math.abs(changePercent);
  const volatilityPercent = window.closePrice > 0
    ? ((window.highPrice - window.lowPrice) / window.closePrice) * 100
    : 0;
  const candidateStateValue = stateFromCandidate({ absChange, volumeZScore: z });
  const score = Math.round(
    Math.max(0, z) * 18 +
    Math.min(30, absChange * 4) +
    logVolumeScore(window.volumeUsd) +
    (candidateStateValue === "PRE_TREND" ? 10 : 0),
  );

  return {
    baseAsset: baseFromSymbol(state.symbol),
    changePercent24h: round(changePercent),
    distanceFromHighPercent: window.highPrice > 0
      ? round(((window.highPrice - window.closePrice) / window.highPrice) * 100)
      : 100,
    distanceFromLowPercent: window.lowPrice > 0
      ? round(((window.closePrice - window.lowPrice) / window.lowPrice) * 100)
      : 100,
    price: round(window.closePrice, 8),
    reasons: candidateReasons({ absChange, state: candidateStateValue, volumeZScore: z }),
    score,
    state: candidateStateValue,
    symbol: state.symbol,
    volume24hUsd: round(window.volumeUsd),
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

function sanitizeWebSocketLightScanSnapshot(snapshot: WebSocketLightScanSnapshot): WebSocketLightScanSnapshot {
  const isAllowedSymbol = (symbol: string) => isUsdtPerpLikeSymbol(normalizedSymbol(symbol));
  const priorityCandidates = snapshot.priorityCandidates.filter((candidate) => isAllowedSymbol(candidate.symbol));
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
    instruments,
    priorityCandidates,
    tickers,
  };
}

export function createWebSocketLightScanAccumulator({
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
        startMs,
        volumeUsd: delta,
      });

      states.set(symbol, {
        currentWindow,
        exchange: event.exchange,
        history,
        lastEventAt: new Date(eventTime).toISOString(),
        lastPrice: price,
        lastQuoteVolume24hUsd: event.quoteVolume24hUsd,
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
          const candidate = buildCandidate({ state, window, z });

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
        diagnostics: diagnostics({
          candidateCount: priorityCandidates.length,
          generatedAt,
          notes: [
            `websocket light scan window ${Math.round(windowMs / 60000)}m`,
            `volume z-score threshold ${zScoreThreshold}`,
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
