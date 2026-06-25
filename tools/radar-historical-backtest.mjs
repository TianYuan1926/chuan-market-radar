#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  buildHistoricalBacktestMarkdown,
  normalizeCandles,
  rowsToCsv,
  runHistoricalReplay,
  selectionsToCsvRows,
} from "./radar-historical-backtest-core.mjs";

const BINANCE_EXCHANGE_INFO_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const BINANCE_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";
const BYBIT_INSTRUMENTS_URL = "https://api.bybit.com/v5/market/instruments-info";
const BYBIT_KLINES_URL = "https://api.bybit.com/v5/market/kline";

const INTERVAL_MS = Object.freeze({
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
});

function usage() {
  console.log(`Usage: npm run backtest:historical -- [options]

Professional historical replay backtest for Chuan Market Radar.
It is read-only. It does not mutate the database, strategy weights, or trading state.

Options:
  --symbols BTCUSDT,ETHUSDT,SOLUSDT  Fixed symbol list
  --symbols-file ./symbols.txt        One symbol per line
  --days 30                           Historical window, default 30
  --interval 15m                      Public futures kline interval, default 15m
  --max-symbols 120                   Max discovered symbols when --symbols is omitted
  --top-n 20                          Candidates per replay point
  --horizon-hours 24                  Future validation window
  --move-threshold-pct 10             MFE threshold counted as hit
  --step-candles 4                    Replay every N candles
  --request-delay-ms 80               Delay between upstream requests
  --out reports/historical-backtest   Output root

Examples:
  npm run backtest:historical -- --symbols SOLUSDT,ENAUSDT,ONDOUSDT --days 14
  npm run backtest:historical -- --days 30 --max-symbols 200 --top-n 24
`);
}

function parseArgs(argv) {
  const args = {
    days: 30,
    interval: "15m",
    maxSymbols: 120,
    moveThresholdPct: 10,
    out: "reports/historical-backtest",
    requestDelayMs: 80,
    stepCandles: 4,
    topN: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const value = argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = value;
    index += 1;
  }

  return {
    days: positiveNumber(args.days, 30),
    help: args.help === true,
    horizonHours: positiveNumber(args["horizon-hours"], 24),
    interval: String(args.interval ?? "15m"),
    maxSymbols: Math.max(1, Math.round(positiveNumber(args["max-symbols"], args.maxSymbols))),
    moveThresholdPct: positiveNumber(args["move-threshold-pct"], 10),
    out: String(args.out ?? "reports/historical-backtest"),
    requestDelayMs: Math.max(0, Math.round(positiveNumber(args["request-delay-ms"], args.requestDelayMs))),
    stepCandles: Math.max(1, Math.round(positiveNumber(args["step-candles"], args.stepCandles))),
    symbols: typeof args.symbols === "string" ? splitSymbols(args.symbols) : [],
    symbolsFile: typeof args["symbols-file"] === "string" ? args["symbols-file"] : "",
    topN: Math.max(1, Math.round(positiveNumber(args["top-n"], args.topN))),
  };
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitSymbols(value) {
  return value
    .split(",")
    .map((symbol) => normalizeSymbol(symbol))
    .filter(Boolean);
}

function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-");
}

function intervalMs(interval) {
  const resolved = INTERVAL_MS[interval];

  if (!resolved) {
    throw new Error(`Unsupported interval ${interval}. Supported: ${Object.keys(INTERVAL_MS).join(", ")}`);
  }

  return resolved;
}

async function loadSymbolsFromFile(file) {
  if (!file) {
    return [];
  }

  const text = await readFile(file, "utf8");

  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, ""))
    .map(normalizeSymbol)
    .filter(Boolean);
}

async function discoverBinanceUsdtPerpetualSymbols({ maxSymbols }) {
  const response = await fetch(BINANCE_EXCHANGE_INFO_URL, {
    headers: {
      "user-agent": "chuan-radar-historical-backtest/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Binance exchangeInfo returned ${response.status}`);
  }

  const payload = await response.json();
  const symbols = Array.isArray(payload?.symbols) ? payload.symbols : [];

  return symbols
    .filter((item) => item?.contractType === "PERPETUAL")
    .filter((item) => item?.quoteAsset === "USDT")
    .filter((item) => item?.status === "TRADING")
    .map((item) => normalizeSymbol(item.symbol))
    .filter(Boolean)
    .sort()
    .slice(0, maxSymbols);
}

async function discoverBybitUsdtLinearSymbols({ maxSymbols }) {
  const allSymbols = [];
  let cursor = "";

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      category: "linear",
      limit: "1000",
      status: "Trading",
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(`${BYBIT_INSTRUMENTS_URL}?${params.toString()}`, {
      headers: {
        "user-agent": "chuan-radar-historical-backtest/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Bybit instruments-info returned ${response.status}`);
    }

    const payload = await response.json();
    const list = Array.isArray(payload?.result?.list) ? payload.result.list : [];

    for (const item of list) {
      const symbol = normalizeSymbol(item?.symbol);

      if (symbol.endsWith("USDT") && item?.quoteCoin === "USDT" && item?.status === "Trading") {
        allSymbols.push(symbol);
      }
    }

    cursor = typeof payload?.result?.nextPageCursor === "string" ? payload.result.nextPageCursor : "";

    if (!cursor) {
      break;
    }
  }

  return [...new Set(allSymbols)].sort().slice(0, maxSymbols);
}

async function resolveSymbols(args) {
  const fileSymbols = await loadSymbolsFromFile(args.symbolsFile);
  const fixedSymbols = [...new Set([...args.symbols, ...fileSymbols])];

  if (fixedSymbols.length > 0) {
    return fixedSymbols.slice(0, args.maxSymbols);
  }

  try {
    return await discoverBinanceUsdtPerpetualSymbols({ maxSymbols: args.maxSymbols });
  } catch (error) {
    console.warn(`Binance symbol discovery unavailable, falling back to Bybit: ${error instanceof Error ? error.message : error}`);

    return discoverBybitUsdtLinearSymbols({ maxSymbols: args.maxSymbols });
  }
}

function normalizeBinanceKline(row) {
  if (!Array.isArray(row) || row.length < 7) {
    return null;
  }

  return {
    close: Number(row[4]),
    closeTime: new Date(Number(row[6])).toISOString(),
    high: Number(row[2]),
    low: Number(row[3]),
    open: Number(row[1]),
    openTime: new Date(Number(row[0])).toISOString(),
    volume: Number(row[5]),
  };
}

function normalizeBybitKline(row, interval) {
  if (!Array.isArray(row) || row.length < 6) {
    return null;
  }

  const openTimestamp = Number(row[0]);

  if (!Number.isFinite(openTimestamp)) {
    return null;
  }

  return {
    close: Number(row[4]),
    closeTime: new Date(openTimestamp + intervalMs(interval) - 1).toISOString(),
    high: Number(row[2]),
    low: Number(row[3]),
    open: Number(row[1]),
    openTime: new Date(openTimestamp).toISOString(),
    volume: Number(row[5]),
  };
}

async function fetchBinanceKlines({ days, interval, requestDelayMs, symbol }) {
  const candles = [];
  const stepMs = intervalMs(interval);
  const now = Date.now();
  const endTime = now - stepMs;
  let cursor = endTime - days * 24 * 60 * 60_000;
  let page = 0;

  while (cursor < endTime) {
    const params = new URLSearchParams({
      endTime: String(endTime),
      interval,
      limit: "1500",
      startTime: String(cursor),
      symbol,
    });
    const response = await fetch(`${BINANCE_KLINES_URL}?${params.toString()}`, {
      headers: {
        "user-agent": "chuan-radar-historical-backtest/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`${symbol} klines returned ${response.status}`);
    }

    const rows = await response.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }

    const normalized = rows.map(normalizeBinanceKline).filter(Boolean);
    candles.push(...normalized);
    const lastOpen = Number(rows[rows.length - 1]?.[0]);

    if (!Number.isFinite(lastOpen) || lastOpen <= cursor) {
      break;
    }

    cursor = lastOpen + stepMs;
    page += 1;

    if (page > 100) {
      break;
    }

    if (requestDelayMs > 0) {
      await delay(requestDelayMs);
    }
  }

  return normalizeCandles(candles);
}

function bybitInterval(interval) {
  const map = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "4h": "240",
    "1d": "D",
  };
  const resolved = map[interval];

  if (!resolved) {
    throw new Error(`Unsupported Bybit interval ${interval}`);
  }

  return resolved;
}

async function fetchBybitKlines({ days, interval, requestDelayMs, symbol }) {
  const candles = [];
  const stepMs = intervalMs(interval);
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60_000;
  let cursorEnd = now - stepMs;
  let page = 0;

  while (cursorEnd > startTime) {
    const params = new URLSearchParams({
      category: "linear",
      end: String(cursorEnd),
      interval: bybitInterval(interval),
      limit: "1000",
      start: String(startTime),
      symbol,
    });
    const response = await fetch(`${BYBIT_KLINES_URL}?${params.toString()}`, {
      headers: {
        "user-agent": "chuan-radar-historical-backtest/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`${symbol} Bybit klines returned ${response.status}`);
    }

    const payload = await response.json();

    if (Number(payload?.retCode ?? 0) !== 0) {
      throw new Error(`${symbol} Bybit klines returned retCode ${payload?.retCode}`);
    }

    const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];

    if (rows.length === 0) {
      break;
    }

    const normalized = rows.map((row) => normalizeBybitKline(row, interval)).filter(Boolean);
    candles.push(...normalized);
    const earliest = Math.min(...rows.map((row) => Number(row?.[0])).filter(Number.isFinite));

    if (!Number.isFinite(earliest) || earliest >= cursorEnd) {
      break;
    }

    cursorEnd = earliest - stepMs;
    page += 1;

    if (page > 100 || cursorEnd <= startTime) {
      break;
    }

    if (requestDelayMs > 0) {
      await delay(requestDelayMs);
    }
  }

  return normalizeCandles(candles);
}

async function fetchCascadeKlines(args, symbol) {
  const attempts = [
    ["binance-public-futures", fetchBinanceKlines],
    ["bybit-public-linear", fetchBybitKlines],
  ];
  const errors = [];

  for (const [source, fetcher] of attempts) {
    try {
      const candles = await fetcher({
        days: args.days,
        interval: args.interval,
        requestDelayMs: args.requestDelayMs,
        symbol,
      });

      if (candles.length > 0) {
        return { candles, source };
      }

      errors.push(`${source}: empty`);
    } catch (error) {
      errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join("; "));
}

async function fetchAllCandles({ args, symbols }) {
  const candlesBySymbol = new Map();
  const failures = [];
  const sourceBySymbol = {};

  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index];

    process.stdout.write(`[${index + 1}/${symbols.length}] ${symbol} historical klines\r`);

    try {
      const { candles, source } = await fetchCascadeKlines(args, symbol);

      if (candles.length > 0) {
        candlesBySymbol.set(symbol, candles);
        sourceBySymbol[symbol] = source;
      } else {
        failures.push({ error: "empty kline response", symbol });
      }
    } catch (error) {
      failures.push({
        error: error instanceof Error ? error.message : "unknown kline error",
        symbol,
      });
    }
  }

  process.stdout.write("\n");

  return { candlesBySymbol, failures, sourceBySymbol };
}

async function writeReports({ args, failures, result, sourceBySymbol, symbols }) {
  const reportDir = path.join(process.cwd(), args.out, timestampSlug());
  await mkdir(reportDir, { recursive: true });
  const sourceCounts = Object.values(sourceBySymbol).reduce((counts, source) => {
    counts[source] = (counts[source] ?? 0) + 1;

    return counts;
  }, {});
  const markdown = buildHistoricalBacktestMarkdown(result, {
    days: args.days,
    interval: args.interval,
    source: Object.entries(sourceCounts).map(([source, count]) => `${source}:${count}`).join(", ") || "public-futures-cascade",
  });

  await writeFile(path.join(reportDir, "summary.md"), markdown, "utf8");
  await writeFile(path.join(reportDir, "findings.json"), JSON.stringify({
    diagnostics: result.diagnostics,
    failures,
    findings: result.findings,
    generatedAt: result.generatedAt,
    laneMetrics: result.laneMetrics,
    options: result.options,
    requestedSymbols: symbols,
    replayTimes: result.replayTimes,
    sourceBySymbol,
    sourceCounts,
    symbolsUsed: result.symbolsUsed,
  }, null, 2), "utf8");
  await writeFile(path.join(reportDir, "samples.csv"), `${rowsToCsv(selectionsToCsvRows(result.selections))}\n`, "utf8");

  return reportDir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return;
  }

  const horizonBars = Math.max(1, Math.round((args.horizonHours * 60 * 60_000) / intervalMs(args.interval)));
  const symbols = await resolveSymbols(args);

  if (symbols.length === 0) {
    throw new Error("No symbols resolved for historical backtest.");
  }

  console.log(`historical replay: source=public-futures-cascade symbols=${symbols.length} interval=${args.interval} days=${args.days}`);

  const { candlesBySymbol, failures, sourceBySymbol } = await fetchAllCandles({ args, symbols });

  if (candlesBySymbol.size === 0) {
    throw new Error("No historical candles fetched. Check network and symbol list.");
  }

  const result = runHistoricalReplay({
    candlesBySymbol,
    options: {
      horizonBars,
      moveThresholdPct: args.moveThresholdPct,
      stepBars: args.stepCandles,
      topN: args.topN,
    },
  });
  const reportDir = await writeReports({
    args,
    failures,
    result,
    sourceBySymbol,
    symbols,
  });

  console.log(`historical-backtest report: ${reportDir}`);
  console.log(`radar hitRate=${result.laneMetrics.radar.hitRatePct}% lateRate=${result.laneMetrics.radar.lateRatePct}% replayTimes=${result.replayTimes}`);

  if (result.findings.some((finding) => finding.severity === "high")) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
