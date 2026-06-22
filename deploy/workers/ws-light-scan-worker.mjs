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

  return Boolean(baseAsset) && !nonCryptoUnderlyingDenylist.has(baseAsset);
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

function candidateReasons({ absChange, state, volumeZScore }) {
  const reasons = ["websocket_sliding_window"];

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

function updateWindow({ current, event, startMs, volumeUsd }) {
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

function rolloverWindow({ currentWindow, history, maxBaselineWindows }) {
  if (!currentWindow) {
    return history;
  }

  return [...history, currentWindow].slice(-maxBaselineWindows);
}

function buildCandidate({ state, window, z }) {
  const openPrice = window.openPrice > 0 ? window.openPrice : state.lastPrice;
  const changePercent = openPrice > 0 ? ((window.closePrice - openPrice) / openPrice) * 100 : 0;
  const absChange = Math.abs(changePercent);
  const volatilityPercent = window.closePrice > 0
    ? ((window.highPrice - window.lowPrice) / window.closePrice) * 100
    : 0;
  const stateValue = candidateState({ absChange, volumeZScore: z });
  const score = Math.round(
    Math.max(0, z) * 18 +
    Math.min(30, absChange * 4) +
    logVolumeScore(window.volumeUsd) +
    (stateValue === "PRE_TREND" ? 10 : 0),
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
    reasons: candidateReasons({ absChange, state: stateValue, volumeZScore: z }),
    score,
    state: stateValue,
    symbol: state.symbol,
    volume24hUsd: round(window.volumeUsd),
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
        startMs,
        volumeUsd: delta,
      });

      states.set(key, {
        currentWindow,
        exchange,
        history,
        lastEventAt: new Date(eventTime).toISOString(),
        lastPrice: price,
        lastQuoteVolume24hUsd: finiteNumber(event.quoteVolume24hUsd),
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
          const candidate = buildCandidate({ state, window, z });

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
        price,
        quoteVolume24hUsd: finiteNumber(row?.q),
        symbol,
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
        price,
        quoteVolume24hUsd: finiteNumber(row?.volCcy24h) * price,
        symbol,
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
        price,
        quoteVolume24hUsd: finiteNumber(row?.turnover24h),
        symbol,
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
    .map((row) => String(row?.instId ?? "").toUpperCase())
    .filter((instId) => instId.endsWith("-USDT-SWAP"))
    .slice(0, limit);
}

async function discoverBybitSymbols({ fetcher = fetch, limit = 500 } = {}) {
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
      const status = String(row?.status ?? "").toLowerCase();

      if (isUsdtPerpLikeSymbol(symbol) && (!status || status === "trading")) {
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
  const sources = [];

  if (exchanges.includes("BINANCE")) {
    sources.push({
      exchange: "BINANCE",
      parser: parseBinanceTickerMessage,
      subscribeMessages: [],
      url: process.env.BINANCE_WS_TICKER_URL ?? "wss://fstream.binance.com/ws/!ticker@arr",
    });
  }

  if (exchanges.includes("OKX")) {
    try {
      const instIds = await discoverOkxSymbols({ limit: symbolLimit });
      const subscribeMessages = buildSubscriptionChunks(
        instIds.map((instId) => ({ channel: "tickers", instId })),
        subscribeChunkSize,
      ).map((args) => JSON.stringify({ op: "subscribe", args }));

      sources.push({
        exchange: "OKX",
        parser: parseOkxTickerMessage,
        subscribeMessages,
        url: process.env.OKX_WS_PUBLIC_URL ?? "wss://ws.okx.com:8443/ws/v5/public",
      });
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
        exchange: "BYBIT",
        parser: parseBybitTickerMessage,
        subscribeMessages,
        url: process.env.BYBIT_WS_PUBLIC_URL ?? "wss://stream.bybit.com/v5/public/linear",
      });
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
      subscriptions: source.subscribeMessages.length,
      url: source.url,
    });

    socket = new WebSocket(source.url);

    socket.addEventListener("open", () => {
      log("source-open", { exchange: source.exchange });

      for (const message of source.subscribeMessages) {
        socket.send(message);
      }
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string" && source.exchange === "OKX" && event.data === "ping") {
        socket.send("pong");
        return;
      }

      const events = source.parser(event.data);

      for (const tickerEvent of events) {
        accumulator.ingest(tickerEvent);
      }
    });

    socket.addEventListener("close", (event) => {
      log("source-closed", {
        code: event.code,
        exchange: source.exchange,
        reason: event.reason,
      });
      setTimeout(connect, reconnectMs);
    });

    socket.addEventListener("error", () => {
      log("source-error", { exchange: source.exchange });
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
