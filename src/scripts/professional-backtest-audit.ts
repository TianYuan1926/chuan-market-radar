import {
  execFile,
} from "node:child_process";
import {
  readdir,
  readFile,
  mkdir,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import type {
  Candle,
} from "../lib/market/ohlcv/types";
import {
  defaultLongMarketEnvironmentDays,
  describeMarketEnvironmentWindows,
} from "../lib/analysis/market-environment-windows";
import {
  runProfessionalReplay,
  type ProfessionalDerivativePoint,
} from "../lib/backtest/professional-replay";
import {
  professionalAuditPlanBlockerCategoryLabel,
  professionalAuditPlanBlockerDiagnosisLabel,
  professionalAuditPlanBlockerLabel,
  runProfessionalAuditRound,
  type ProfessionalAuditRoundProgress,
  type ProfessionalAuditRoundSymbolPlan,
} from "../lib/backtest/professional-audit-round";
import {
  runGoldenCases,
} from "../lib/backtest/golden-case-runner";
import {
  buildAuditCandidateUniverse,
  buildAuditSymbolPlan,
} from "../lib/backtest/professional-audit-symbol-plan";
import type {
  ProfessionalAuditMode,
  ProfessionalJudgeSystemLane,
  ProfessionalJudgeSystemSnapshot,
  ProfessionalReplayReport,
} from "../lib/backtest/professional-replay";

const BINANCE_EXCHANGE_INFO_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const BINANCE_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";
const BINANCE_FUNDING_RATE_URL = "https://fapi.binance.com/fapi/v1/fundingRate";
const BINANCE_OPEN_INTEREST_HIST_URL = "https://fapi.binance.com/futures/data/openInterestHist";
const BINANCE_OPEN_INTEREST_MAX_LOOKBACK_MS = 29 * 24 * 60 * 60_000;

function readablePlanBlockers(blockers: string[] | undefined, limit?: number) {
  const items = blockers ?? [];
  const visible = typeof limit === "number" ? items.slice(0, limit) : items;

  return visible.map((blocker) => professionalAuditPlanBlockerLabel(blocker));
}

type BinanceExchangeSymbolRow = {
  contractType?: string;
  quoteAsset?: string;
  status?: string;
  symbol?: string;
};

type BinanceFundingRateRow = {
  fundingRate?: string | number;
  fundingTime?: string | number;
};

type BinanceOpenInterestHistRow = {
  sumOpenInterest?: string | number;
  sumOpenInterestValue?: string | number;
  timestamp?: string | number;
};

type CliOptions = {
  auditMode: ProfessionalAuditMode;
  auditRound: boolean;
  auditSymbols: number;
  candidateSymbols: number;
  days: number;
  largeHorizonHours: number;
  maxSymbols: number;
  mediumHorizonHours: number;
  nodesPerSymbol: number;
  out: string;
  requestDelayMs: number;
  requireGoldenPass: boolean;
  smallHorizonHours: number;
  topN: number;
};

function usage() {
  console.log(`Usage: npm run backtest:professional -- [options]

Professional Strategy Backtest Audit Engine v2.
It replays historical public futures candles through the production analysis chain.

Options:
  --days 30                         Historical kline fetch window, default 30; long market environment default starts at 30d
  --max-symbols 120                 Max Binance USDT perpetual symbols, default 120
  --top-n 20                        Candidates per replay point, default 20
  --audit-mode full                 Audit mode: full | scan | analysis | strategy, default full
  --require-golden-pass             Block formal audit unless golden cases pass
  --audit-round                     Run strict 10-type x N-node professional audit round
  --audit-symbols 10                Symbols in audit round, default 10
  --candidate-symbols 80            Candidate universe for audit round ranking, default 80
  --nodes-per-symbol 10             Historical nodes per symbol, default 10
  --small-horizon-hours 4           Small-node validation window, default 4h
  --medium-horizon-hours 24         Medium-node validation window, default 24h
  --large-horizon-hours 96          Large-node validation window, default 96h
  --request-delay-ms 80             Delay between upstream requests, default 80
  --out reports/professional-backtest-audit

Examples:
  npm run backtest:professional -- --days 7 --max-symbols 40 --top-n 10
  npm run backtest:professional -- --days 30 --max-symbols 180 --top-n 24
  npm run backtest:professional -- --audit-round --days 30 --audit-symbols 10 --candidate-symbols 80 --nodes-per-symbol 10 --top-n 10

Market environment windows:
  ${describeMarketEnvironmentWindows()}
`);
}

function readArgs(argv: string[]): CliOptions & { help: boolean } {
  const args: Record<string, string | true> = {};

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

    if (!value || value.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = value;
    index += 1;
  }

  return {
    auditMode: readAuditMode(args["audit-mode"]),
    auditRound: args["audit-round"] === true,
    auditSymbols: Math.max(1, Math.round(positiveNumber(args["audit-symbols"], 10))),
    candidateSymbols: Math.max(1, Math.round(positiveNumber(args["candidate-symbols"], 80))),
    days: positiveNumber(args.days, 30),
    help: args.help === true,
    largeHorizonHours: positiveNumber(args["large-horizon-hours"], 96),
    maxSymbols: Math.max(1, Math.round(positiveNumber(args["max-symbols"], 120))),
    mediumHorizonHours: positiveNumber(args["medium-horizon-hours"], 24),
    nodesPerSymbol: Math.max(1, Math.min(10, Math.round(positiveNumber(args["nodes-per-symbol"], 10)))),
    out: typeof args.out === "string" ? args.out : "reports/professional-backtest-audit",
    requestDelayMs: Math.max(0, Math.round(positiveNumber(args["request-delay-ms"], 80))),
    requireGoldenPass: args["require-golden-pass"] === true,
    smallHorizonHours: positiveNumber(args["small-horizon-hours"], 4),
    topN: Math.max(1, Math.round(positiveNumber(args["top-n"], 20))),
  };
}

function readAuditMode(value: unknown): ProfessionalAuditMode {
  if (value === "scan" || value === "analysis" || value === "strategy" || value === "full") {
    return value;
  }

  return "full";
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause instanceof Error
    ? `; cause=${error.cause.message}`
    : "";

  return `${error.message}${cause}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backtestFetchTimeoutMs() {
  const parsed = Number(
    process.env.BACKTEST_FETCH_TIMEOUT_MS ??
      Number(process.env.BACKTEST_CURL_MAX_TIME_SEC ?? 60) * 1_000,
  );

  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1_000, Math.floor(parsed))
    : 60_000;
}

function curlProxyArgs(proxy: string) {
  if (proxy.startsWith("socks5h://")) {
    return ["--socks5-hostname", proxy.slice("socks5h://".length)];
  }

  if (proxy.startsWith("socks5://")) {
    return ["--socks5-hostname", proxy.slice("socks5://".length)];
  }

  return ["--proxy", proxy];
}

async function fetchJson(url: string, context: string) {
  const curlProxy = process.env.BACKTEST_CURL_PROXY?.trim();

  if (curlProxy) {
    return new Promise<unknown>((resolve, reject) => {
      execFile(
        "curl",
        [
          "--fail",
          "--location",
          "--max-time",
          String(Number(process.env.BACKTEST_CURL_MAX_TIME_SEC ?? 60)),
          "--silent",
          "--show-error",
          ...curlProxyArgs(curlProxy),
          url,
        ],
        {
          maxBuffer: 128 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`${context} curl failed: ${stderr.trim() || error.message}`));
            return;
          }

          try {
            const body = stdout.trim();

            if (!body) {
              reject(new Error(`${context} returned empty response body`));
              return;
            }

            resolve(JSON.parse(body));
          } catch (parseError) {
            reject(new Error(`${context} returned invalid JSON: ${errorMessage(parseError)}`));
          }
        },
      );
    });
  }

  const timeoutMs = backtestFetchTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`${context} timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "user-agent": "chuan-radar-professional-backtest/2.0",
      },
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`${context} fetch failed: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`${context} returned ${response.status}`);
  }

  return response.json();
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-");
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function discoverBinanceSymbols(maxSymbols: number) {
  const payload = await fetchJson(BINANCE_EXCHANGE_INFO_URL, "Binance exchangeInfo");
  const rows: BinanceExchangeSymbolRow[] = Array.isArray(payload?.symbols) ? payload.symbols : [];

  return rows
    .filter((row) => row?.contractType === "PERPETUAL")
    .filter((row) => row?.quoteAsset === "USDT")
    .filter((row) => row?.status === "TRADING")
    .map((row) => normalizeSymbol(row.symbol))
    .filter(Boolean)
    .sort()
    .slice(0, maxSymbols);
}

function progressPath(options: CliOptions) {
  return path.join(process.cwd(), options.out, "latest-progress.json");
}

async function previousAuditRoundSymbols(options: CliOptions) {
  if (!options.auditRound) {
    return [];
  }

  try {
    const payload = JSON.parse(await readFile(progressPath(options), "utf8")) as Partial<ProfessionalAuditRoundProgress>;

    return (payload.plannedSymbols ?? [])
      .map((item) => item.symbol)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeAuditProgress(options: CliOptions, progress: ProfessionalAuditRoundProgress) {
  const file = progressPath(options);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(progress, null, 2), "utf8");
}

function writePhaseProgress({
  candidateUniverseSize = 0,
  currentSymbol,
  options,
  phase,
  plannedSymbols,
  summary,
}: {
  candidateUniverseSize?: number;
  currentSymbol: string | null;
  options: CliOptions;
  phase: ProfessionalAuditRoundProgress["phase"];
  plannedSymbols: ProfessionalAuditRoundSymbolPlan[];
  summary: string;
}) {
  if (!options.auditRound) {
    return;
  }

  const now = new Date().toISOString();

  writeAuditProgress(options, {
    candidateUniverseSize,
    completedAt: null,
    completedNodes: 0,
    currentNodeRole: null,
    currentSymbol,
    generatedAt: now,
    guardrails: [
      "回测只用于找扫描和推理缺陷，不自动下单。",
      "没有进度文件时前端必须显示暂无或过期，不能造假。",
    ],
    nodes: [],
    nodesPerSymbol: options.nodesPerSymbol,
    phase,
    plannedSymbols,
    schemaVersion: "professional-backtest-audit-round-progress.v1",
    status: "running",
    summary,
    totalNodes: plannedSymbols.length * options.nodesPerSymbol,
    updatedAt: now,
  });
}

function normalizeKline(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 7) {
    return null;
  }

  const openTime = Number(row[0]);
  const closeTime = Number(row[6]);
  const candle = {
    close: Number(row[4]),
    closeTime: new Date(closeTime).toISOString(),
    high: Number(row[2]),
    low: Number(row[3]),
    open: Number(row[1]),
    openTime: new Date(openTime).toISOString(),
    volume: Number(row[5]),
  };

  if (
    !Number.isFinite(openTime) ||
    !Number.isFinite(closeTime) ||
    !Number.isFinite(candle.open) ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close) ||
    !Number.isFinite(candle.volume) ||
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0
  ) {
    return null;
  }

  return candle;
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoFromMs(value: unknown) {
  const ms = Number(value);

  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }

  return new Date(ms).toISOString();
}

function normalizeFunding(row: BinanceFundingRateRow): ProfessionalDerivativePoint | null {
  const observedAt = isoFromMs(row.fundingTime);
  const fundingRate = numberOrUndefined(row.fundingRate);

  if (!observedAt || fundingRate === undefined) {
    return null;
  }

  return {
    fundingRate,
    observedAt,
    source: "public_exchange",
  };
}

function normalizeOpenInterest(row: BinanceOpenInterestHistRow): ProfessionalDerivativePoint | null {
  const observedAt = isoFromMs(row.timestamp);
  const openInterestUsd = numberOrUndefined(row.sumOpenInterestValue ?? row.sumOpenInterest);

  if (!observedAt || openInterestUsd === undefined || openInterestUsd <= 0) {
    return null;
  }

  return {
    observedAt,
    openInterestUsd,
    source: "public_exchange",
  };
}

function binanceOpenInterestStartTime(startTime: number, endTime: number) {
  return Math.max(startTime, endTime - BINANCE_OPEN_INTEREST_MAX_LOOKBACK_MS);
}

async function fetchBinanceCandles(symbol: string, options: CliOptions) {
  const candles: Candle[] = [];
  const stepMs = 15 * 60_000;
  const endTime = Date.now() - stepMs;
  let cursor = endTime - options.days * 24 * 60 * 60_000;

  while (cursor < endTime) {
    const params = new URLSearchParams({
      endTime: String(endTime),
      interval: "15m",
      limit: "1500",
      startTime: String(cursor),
      symbol,
    });
    const rows = await fetchJson(`${BINANCE_KLINES_URL}?${params.toString()}`, `${symbol} klines`);

    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const candle = normalizeKline(row);

      if (candle) {
        candles.push(candle);
      }
    }

    const lastOpen = Number(rows.at(-1)?.[0]);

    if (!Number.isFinite(lastOpen) || lastOpen <= cursor) {
      break;
    }

    cursor = lastOpen + stepMs;

    if (options.requestDelayMs > 0) {
      await delay(options.requestDelayMs);
    }
  }

  return [...new Map(candles.map((candle) => [candle.openTime, candle])).values()]
    .sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime));
}

async function fetchBinanceFunding(symbol: string, startTime: number, endTime: number) {
  const params = new URLSearchParams({
    endTime: String(endTime),
    limit: "1000",
    startTime: String(startTime),
    symbol,
  });
  const rows = await fetchJson(`${BINANCE_FUNDING_RATE_URL}?${params.toString()}`, `${symbol} funding`);

  if (!Array.isArray(rows)) {
    throw new Error(`${symbol} funding returned non-array payload`);
  }

  return rows
    .map((row) => normalizeFunding(row as BinanceFundingRateRow))
    .filter((row): row is ProfessionalDerivativePoint => Boolean(row));
}

async function fetchBinanceOpenInterestHistory(symbol: string, startTime: number, endTime: number, options: CliOptions) {
  const points: ProfessionalDerivativePoint[] = [];
  let cursor = binanceOpenInterestStartTime(startTime, endTime);

  while (cursor < endTime) {
    const params = new URLSearchParams({
      endTime: String(endTime),
      limit: "500",
      period: "15m",
      startTime: String(cursor),
      symbol,
    });
    const rows = await fetchJson(`${BINANCE_OPEN_INTEREST_HIST_URL}?${params.toString()}`, `${symbol} openInterestHist`);

    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const point = normalizeOpenInterest(row as BinanceOpenInterestHistRow);

      if (point) {
        points.push(point);
      }
    }

    const lastTimestamp = Number((rows.at(-1) as BinanceOpenInterestHistRow | undefined)?.timestamp);

    if (!Number.isFinite(lastTimestamp) || lastTimestamp <= cursor) {
      break;
    }

    cursor = lastTimestamp + 15 * 60_000;

    if (options.requestDelayMs > 0) {
      await delay(options.requestDelayMs);
    }
  }

  return points;
}

function mergeDerivativePoints(points: ProfessionalDerivativePoint[]) {
  const merged = new Map<string, ProfessionalDerivativePoint>();

  for (const point of points) {
    const existing = merged.get(point.observedAt);

    merged.set(point.observedAt, {
      fundingRate: existing?.fundingRate ?? point.fundingRate,
      observedAt: point.observedAt,
      openInterestUsd: existing?.openInterestUsd ?? point.openInterestUsd,
      source: existing?.source ?? point.source,
    });
  }

  return [...merged.values()]
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
}

async function fetchBinanceDerivatives(symbol: string, candles: Candle[], options: CliOptions) {
  const first = candles[0];
  const last = candles.at(-1);

  if (!first || !last) {
    return {
      failures: ["missing candle range"],
      points: [],
    };
  }

  const startTime = Date.parse(first.openTime);
  const endTime = Date.parse(last.closeTime);

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return {
      failures: ["invalid candle timestamp range"],
      points: [],
    };
  }

  const failures: string[] = [];
  let funding: ProfessionalDerivativePoint[] = [];
  let openInterest: ProfessionalDerivativePoint[] = [];

  try {
    funding = await fetchBinanceFunding(symbol, startTime, endTime);
  } catch (error) {
    failures.push(`funding: ${errorMessage(error)}`);
  }

  if (options.requestDelayMs > 0) {
    await delay(options.requestDelayMs);
  }

  try {
    openInterest = await fetchBinanceOpenInterestHistory(symbol, startTime, endTime, options);
  } catch (error) {
    failures.push(`openInterestHist: ${errorMessage(error)}`);
  }

  return {
    failures,
    points: mergeDerivativePoints([...funding, ...openInterest]),
  };
}

async function fetchCandlesBySymbol(
  symbols: string[],
  options: CliOptions,
  auditPlan: ProfessionalAuditRoundSymbolPlan[] = [],
) {
  const candlesBySymbol = new Map<string, Candle[]>();
  const failures: Array<{ error: string; symbol: string }> = [];

  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index];

    writePhaseProgress({
      candidateUniverseSize: symbols.length,
      currentSymbol: symbol ?? null,
      options,
      phase: "fetching_candles",
      plannedSymbols: auditPlan,
      summary: `正在拉取历史 K 线 ${index + 1}/${symbols.length}：${symbol}`,
    });
    process.stdout.write(`[${index + 1}/${symbols.length}] ${symbol} professional audit klines\r`);

    try {
      const candles = await fetchBinanceCandles(symbol, options);

      if (candles.length > 0) {
        candlesBySymbol.set(symbol, candles);
      } else {
        failures.push({ error: "empty kline response", symbol });
      }
    } catch (error) {
      failures.push({
        error: errorMessage(error),
        symbol,
      });
    }
  }

  process.stdout.write("\n");

  return {
    candlesBySymbol,
    failures,
  };
}

async function fetchDerivativesBySymbol(
  candlesBySymbol: Map<string, Candle[]>,
  options: CliOptions,
  auditPlan: ProfessionalAuditRoundSymbolPlan[] = [],
) {
  const derivativesBySymbol = new Map<string, ProfessionalDerivativePoint[]>();
  const failures: Array<{ error: string; symbol: string }> = [];
  const entries = [...candlesBySymbol.entries()];

  for (let index = 0; index < entries.length; index += 1) {
    const [symbol, candles] = entries[index] ?? [];

    if (!symbol || !candles) {
      continue;
    }

    writePhaseProgress({
      candidateUniverseSize: candlesBySymbol.size,
      currentSymbol: symbol,
      options,
      phase: "fetching_derivatives",
      plannedSymbols: auditPlan,
      summary: `正在拉取历史 Funding/OI ${index + 1}/${entries.length}：${symbol}`,
    });
    process.stdout.write(`[${index + 1}/${entries.length}] ${symbol} professional audit derivatives\r`);

    try {
      const derivatives = await fetchBinanceDerivatives(symbol, candles, options);

      if (derivatives.points.length > 0) {
        derivativesBySymbol.set(symbol, derivatives.points);
      } else {
        failures.push({ error: "empty derivatives response", symbol });
      }
      for (const failure of derivatives.failures) {
        failures.push({ error: `derivatives: ${failure}`, symbol });
      }
    } catch (error) {
      failures.push({
        error: `derivatives: ${errorMessage(error)}`,
        symbol,
      });
    }

    if (options.requestDelayMs > 0) {
      await delay(options.requestDelayMs);
    }
  }

  process.stdout.write("\n");

  return {
    derivativesBySymbol,
    failures,
  };
}

type RoundTrendComparisonMetric = {
  current: number | null;
  delta: number | null;
  label: string;
  previous: number | null;
  status: "flat" | "improved" | "regressed" | "unavailable";
};

type RoundTrendComparison = {
  metrics: RoundTrendComparisonMetric[];
  previousReportId: string | null;
  summary: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function metricNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function valueFromPath(report: unknown, pathKey: string) {
  const parts = pathKey.split(".");
  let current: unknown = report;

  for (const part of parts) {
    current = objectValue(current)[part];
  }

  return metricNumber(current);
}

function coreScoreFrom(report: unknown, id: "analysis" | "scan" | "strategy") {
  const item = arrayValue(objectValue(report).coreCapabilityMetrics)
    .map(objectValue)
    .find((metric) => metric.id === id);

  return metricNumber(item?.score);
}

function opportunityLaneCaptureFrom(report: unknown, lane: string) {
  const item = arrayValue(objectValue(report).opportunityLaneMetrics)
    .map(objectValue)
    .find((metric) => metric.lane === lane);

  return metricNumber(item?.captureRatePct);
}

function compareMetric({
  current,
  higherIsBetter,
  label,
  previous,
}: {
  current: number | null;
  higherIsBetter: boolean;
  label: string;
  previous: number | null;
}): RoundTrendComparisonMetric {
  if (current === null || previous === null) {
    return {
      current,
      delta: null,
      label,
      previous,
      status: "unavailable",
    };
  }

  const delta = Number((current - previous).toFixed(2));
  const improved = higherIsBetter ? delta > 0 : delta < 0;

  return {
    current,
    delta,
    label,
    previous,
    status: Math.abs(delta) < 0.01 ? "flat" : improved ? "improved" : "regressed",
  };
}

async function latestPreviousProfessionalReport(options: CliOptions) {
  const root = path.join(process.cwd(), options.out);
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates: Array<{ id: string; mtimeMs: number; payload: Record<string, unknown> }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const findingsPath = path.join(root, entry.name, "findings.json");

    try {
      const details = await stat(findingsPath);
      const payload = JSON.parse(await readFile(findingsPath, "utf8")) as Record<string, unknown>;

      if (payload.schemaVersion !== "professional-backtest-audit-report.v2") {
        continue;
      }

      candidates.push({
        id: entry.name,
        mtimeMs: details.mtimeMs,
        payload,
      });
    } catch {
      continue;
    }
  }

  return candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0] ?? null;
}

async function buildRoundTrendComparison(options: CliOptions, report: ReturnType<typeof runProfessionalReplay>): Promise<RoundTrendComparison> {
  const previous = await latestPreviousProfessionalReport(options);

  if (!previous) {
    return {
      metrics: [],
      previousReportId: null,
      summary: "没有找到上一轮专业回测报告，本轮无法做趋势对比。",
    };
  }

  const previousReport = previous.payload;
  const metrics = [
    compareMetric({
      current: valueFromPath(report, "roundSummary.highSeverityFindings"),
      higherIsBetter: false,
      label: "高优先级问题",
      previous: valueFromPath(previousReport, "roundSummary.highSeverityFindings"),
    }),
    compareMetric({
      current: valueFromPath(report, "roundSummary.planReadyCount"),
      higherIsBetter: true,
      label: "交易计划就绪",
      previous: valueFromPath(previousReport, "roundSummary.planReadyCount"),
    }),
    compareMetric({
      current: coreScoreFrom(report, "scan"),
      higherIsBetter: true,
      label: "扫描分数",
      previous: coreScoreFrom(previousReport, "scan"),
    }),
    compareMetric({
      current: coreScoreFrom(report, "analysis"),
      higherIsBetter: true,
      label: "分析分数",
      previous: coreScoreFrom(previousReport, "analysis"),
    }),
    compareMetric({
      current: coreScoreFrom(report, "strategy"),
      higherIsBetter: true,
      label: "策略分数",
      previous: coreScoreFrom(previousReport, "strategy"),
    }),
    compareMetric({
      current: valueFromPath(report, "baselineMetrics.radar.qualityScore"),
      higherIsBetter: true,
      label: "雷达质量分",
      previous: valueFromPath(previousReport, "baselineMetrics.radar.qualityScore"),
    }),
    compareMetric({
      current: opportunityLaneCaptureFrom(report, "early_setup"),
      higherIsBetter: true,
      label: "启动前捕获率",
      previous: opportunityLaneCaptureFrom(previousReport, "early_setup"),
    }),
    compareMetric({
      current: valueFromPath(report, "waitPlanMetrics.usefulWaitRatePct"),
      higherIsBetter: true,
      label: "等待计划有效率",
      previous: valueFromPath(previousReport, "waitPlanMetrics.usefulWaitRatePct"),
    }),
  ];
  const improved = metrics.filter((metric) => metric.status === "improved").length;
  const regressed = metrics.filter((metric) => metric.status === "regressed").length;

  return {
    metrics,
    previousReportId: previous.id,
    summary: `对比上一轮 ${previous.id}：${improved} 项提升，${regressed} 项退步，其余持平或不可比。`,
  };
}

function reportMarkdown(report: ReturnType<typeof runProfessionalReplay>, failures: Array<{ error: string; symbol: string }>, trendComparison: RoundTrendComparison) {
  const laneLabel: Record<string, string> = {
    momentum: "动量基线",
    radar: "雷达排序",
    random: "随机基线",
    volume: "成交量基线",
  };
  const opportunityLaneLabel: Record<string, string> = {
    early_setup: "启动前机会",
    higher_timeframe_context: "大周期背景机会",
    pullback_retest: "回踩/反抽确认机会",
    risk_review: "风险复盘教材",
  };
  const severityLabel: Record<string, string> = {
    high: "高优先级",
    low: "低优先级",
    medium: "中优先级",
  };
  const nodeRoleLabel: Record<string, string> = {
    breakout_edge: "突破边缘",
    early_volume_expansion: "早期放量",
    fakeout_or_invalidation: "假突破/失效",
    large_context: "大周期背景",
    late_extension: "晚到延伸",
    medium_swing: "中周期波段",
    neutral_random: "中性随机",
    pre_move: "启动前",
    pullback_retest: "回踩确认",
    trend_acceleration: "趋势加速",
  };
  const coreStatusLabel: Record<string, string> = {
    fail: "不合格",
    pass: "通过",
    watch: "观察",
  };
  const auditWindowSummary = report.auditRound
    ? [...new Map(report.auditRound.nodes.map((node) => [node.timeframeBand, node.validationWindowLabel])).entries()]
      .sort(([left], [right]) => {
        const order = { large: 3, medium: 2, small: 1 } as const;

        return order[right as keyof typeof order] - order[left as keyof typeof order];
      })
      .map(([band, label]) => `${band}=${label}`)
      .join(" / ")
    : "";
  const groupedFindings = [...report.findings.reduce((map, finding) => {
    const current = map.get(finding.id) ?? {
      count: 0,
      finding,
      samples: [] as string[],
    };

    current.count += 1;
    if (current.samples.length < 3) {
      current.samples.push(finding.detail);
    }
    map.set(finding.id, current);

    return map;
  }, new Map<string, { count: number; finding: typeof report.findings[number]; samples: string[] }>()).values()];
  const lines = [
    "# Professional Strategy Backtest Audit v2",
    "",
    "## 边界",
    "",
    "- 这是扫描、分析、推理和交易计划能力审计，不是自动下单，不是收益承诺。",
    "- 每个历史时间点只使用当时以前的数据。",
    "- 数据缺失必须暴露为问题，不能用 mock 或当前值补。",
    "",
    "## 输入",
    "",
    `- 数据源：binance-public-futures 15m klines + public funding/open interest`,
    `- 审计模式：${report.auditMode ?? "full"}`,
    `- 候选池币种：${report.input.symbolsUsed.length}`,
    `- 已注入历史衍生品币种：${report.input.derivativesSymbolsUsed}`,
    `- 回放点：${report.input.replayTimes}`,
    `- 每轮候选：${report.input.topN}`,
    `- 市场环境窗口：${describeMarketEnvironmentWindows()}`,
    `- 长周期默认：${defaultLongMarketEnvironmentDays()} 天；这是默认下限，不是唯一长周期判断。`,
    report.auditRound
      ? `- 验证窗口：${auditWindowSummary || "按节点周期分层"}`
      : `- 验证窗口：${report.input.horizonBars} 根 15m K 线`,
    `- 拉取失败：${failures.length}`,
    "",
    "## 结论",
    "",
    `- ${report.summary}`,
    `- 样本数：${report.roundSummary.cases}`,
    `- 交易计划就绪：${report.roundSummary.planReadyCount}`,
    `- 高优先级问题：${report.roundSummary.highSeverityFindings}`,
    "",
    "## 裁判系统状态",
    "",
    `- 状态：${report.judgeSystem?.statusLabel ?? "可运行但不完整"}`,
    `- 摘要：${report.judgeSystem?.summary ?? "本报告尚未写入裁判系统状态。"}`,
    "",
    "| 环节 | 状态 | 来源 | 说明 |",
    "|---|---|---|---|",
  ];

  if (report.judgeSystem?.lanes.length) {
    for (const lane of report.judgeSystem.lanes) {
      const status = lane.status === "pass"
        ? "通过"
        : lane.status === "fail"
          ? "不合格"
          : lane.status === "watch"
            ? "观察"
            : "等待";

      lines.push(`| ${lane.label} | ${status} | ${lane.source} | ${lane.summary} |`);
    }
  } else {
    lines.push("| 裁判系统 | 等待 | report | 旧报告缺少裁判系统字段，需要重新运行金样本和专项审计。 |");
  }

  lines.push(
    "",
    "## 三大核心能力审计",
    "",
    "本轮只按三个核心判断系统是否有实战参考价值：扫描能不能提前感知、分析能不能判断对、策略能不能给出可执行计划。",
    "",
    "| 核心能力 | 状态 | 分数 | 通过率 | 测试节点 | 主要问题 | 下一步 |",
    "|---|---|---:|---:|---:|---|---|",
  );

  if (report.coreCapabilityMetrics.length > 0) {
    for (const metric of report.coreCapabilityMetrics) {
      const mainFailure = metric.mainFailures[0];
      const failureText = mainFailure
        ? `${mainFailure.label}：${mainFailure.detail}`
        : metric.summary;

      lines.push(`| ${metric.label} | ${coreStatusLabel[metric.status] ?? metric.status} | ${metric.score} | ${metric.passRatePct}% | ${metric.testedNodes} | ${failureText} | ${metric.nextAction} |`);
    }
  } else {
    lines.push("| 扫描/分析/策略 | 不可用 | 0 | 0% | 0 | 本轮报告缺少三大核心成绩单 | 先升级专业回测报告合同 |");
  }

  lines.push(
    "",
    "## 对比上一轮",
    "",
    `- ${trendComparison.summary}`,
  );

  if (trendComparison.metrics.length > 0) {
    lines.push(
      "",
      "| 指标 | 上一轮 | 本轮 | 变化 | 结论 |",
      "|---|---:|---:|---:|---|",
    );

    for (const metric of trendComparison.metrics) {
      const label = metric.status === "improved"
        ? "提升"
        : metric.status === "regressed"
          ? "退步"
          : metric.status === "flat"
            ? "持平"
            : "不可比";

      lines.push(`| ${metric.label} | ${metric.previous ?? "-"} | ${metric.current ?? "-"} | ${metric.delta ?? "-"} | ${label} |`);
    }
  }

  lines.push(
    "",
    "## 基线对比",
    "",
    "| 通道 | 样本 | 命中率 | 提前命中率 | 迟到率 | 质量分 | 平均 MFE | 平均 MAE | 入选时已波动 | 成交量倍数 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );

  for (const lane of ["radar", "momentum", "volume", "random"] as const) {
    const metric = report.baselineMetrics[lane];

    lines.push(`| ${laneLabel[lane]} | ${metric.count} | ${metric.hitRatePct}% | ${metric.earlyHitRatePct}% | ${metric.lateRatePct}% | ${metric.qualityScore} | ${metric.avgMfePct}% | ${metric.avgMaePct}% | ${metric.avgMoveAtSelectionPct}% | ${metric.avgVolumeRatio}x |`);
  }

  lines.push(
    "",
    "## 提前性审计",
    "",
    `- 提前样本：${report.timingMetrics.earlyCount} / ${report.timingMetrics.earlyRatePct}%`,
    `- 迟到样本：${report.timingMetrics.lateCount} / ${report.timingMetrics.lateRatePct}%`,
    `- 无交易计划样本：${report.timingMetrics.noPlanCount}`,
    "",
  );

  if (report.opportunityLaneMetrics.length > 0) {
    lines.push(
      "## 机会分层审计",
      "",
      "| 机会池 | 节点 | 入选 | 捕获率 | 大行情命中 | 质量命中 | 迟到率 | 漏判大行情 | 漏判质量 | 计划就绪 | 平均排名 | 平均雷达分 |",
      "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    );

    for (const metric of report.opportunityLaneMetrics) {
      lines.push(`| ${metric.label || opportunityLaneLabel[metric.lane] || metric.lane} | ${metric.totalNodes} | ${metric.selectedCount} | ${metric.captureRatePct}% | ${metric.hitRatePct}% | ${metric.qualityHitRatePct}% | ${metric.lateRatePct}% | ${metric.missedEarlyHitCount} | ${metric.missedEarlyQualityHitCount} | ${metric.planReadyCount} | ${metric.avgRadarRank ?? "-"} | ${metric.avgRadarScore} |`);
    }

    lines.push("");
  }

  if (report.planBlockerMetrics.length > 0) {
    lines.push(
      "## 交易计划未就绪原因",
      "",
      "| 阻断原因 | 类别 | 诊断 | 次数 | 质量命中 | 条件等待 | 已捕获 | 代表币种 |",
      "|---|---|---|---:|---:|---:|---:|---|",
    );

    for (const metric of report.planBlockerMetrics.slice(0, 12)) {
      lines.push(`| ${professionalAuditPlanBlockerLabel(metric.blocker)} | ${professionalAuditPlanBlockerCategoryLabel(metric.category)} | ${professionalAuditPlanBlockerDiagnosisLabel(metric.diagnosis)} | ${metric.count} | ${metric.qualityHitCount} | ${metric.conditionalWaitCount} | ${metric.capturedCount} | ${metric.sampleSymbols.join(" / ") || "-"} |`);
    }

    lines.push("");
  }

  lines.push(
    "## WAIT 条件计划后验",
    "",
    `- 条件计划总数：${report.waitPlanMetrics.totalWaitPlans}`,
    `- 已触发：${report.waitPlanMetrics.triggeredCount}`,
    `- 先到目标：${report.waitPlanMetrics.targetFirstCount} / ${report.waitPlanMetrics.usefulWaitRatePct}%`,
    `- 先到止损：${report.waitPlanMetrics.stopFirstCount} / ${report.waitPlanMetrics.badWaitRatePct}%`,
    `- 未触发：${report.waitPlanMetrics.notTriggeredCount} / ${report.waitPlanMetrics.noTradeRatePct}%`,
    `- 触发后超时：${report.waitPlanMetrics.timeoutCount}`,
    `- 缺少结构位：${report.waitPlanMetrics.missingLevelCount}`,
    "",
  );

  if (report.pressureTestMetrics.length > 0) {
    lines.push(
      "## 全市场候选池压力测试",
      "",
      "| 档位 | 选中数 | 候选压力 | 捕获率 | 提前捕获 | 质量命中 | 漏判质量机会 |",
      "|---|---:|---:|---:|---:|---:|---:|",
    );

    for (const metric of report.pressureTestMetrics) {
      lines.push(`| ${metric.label} | ${metric.selectedCount} | ${metric.universePressurePct}% | ${metric.captureRatePct}% | ${metric.earlyCaptureRatePct}% | ${metric.qualityHitRatePct}% | ${metric.missedEarlyQualityHitCount} |`);
    }

    lines.push("");
  }

  if (report.marketRegimeMetrics.length > 0) {
    lines.push(
      "## 市场状态分组审计",
      "",
      "| 市场状态 | 节点 | 捕获率 | 质量命中 | 迟到率 | 平均排名 | 代表币种 |",
      "|---|---:|---:|---:|---:|---:|---|",
    );

    for (const metric of report.marketRegimeMetrics) {
      lines.push(`| ${metric.label} | ${metric.totalNodes} | ${metric.captureRatePct}% | ${metric.qualityHitRatePct}% | ${metric.lateRatePct}% | ${metric.avgRadarRank ?? "-"} | ${metric.sampleSymbols.join(" / ") || "-"} |`);
    }

    lines.push("");
  }

  if (report.ruleStabilityMetrics.length > 0) {
    lines.push(
      "## 规则稳定性审计",
      "",
      "| 规则/卡点 | 状态 | 稳定分 | 出现 | 漏判质量机会 | 已选有效 | 代表币种 |",
      "|---|---|---:|---:|---:|---:|---|",
    );

    for (const metric of report.ruleStabilityMetrics.slice(0, 12)) {
      const status = metric.status === "stable" ? "稳定" : metric.status === "watch" ? "观察" : "不稳定";

      lines.push(`| ${metric.label} | ${status} | ${metric.stabilityScore} | ${metric.occurrenceCount} | ${metric.missedQualityHitCount} | ${metric.selectedUsefulCount} | ${metric.sampleSymbols.join(" / ") || "-"} |`);
    }

    lines.push("");
  }

  if (report.auditRound) {
    const captured = report.auditRound.nodes.filter((node) => node.capturedByRadar).length;
    const captureRate = report.auditRound.nodes.length > 0
      ? Number(((captured / report.auditRound.nodes.length) * 100).toFixed(2))
      : 0;

    lines.push(
      "## 10x10 专业审计轮次",
      "",
      `- 状态：${report.auditRound.status}`,
      `- 计划币种：${report.auditRound.plannedSymbols.length}`,
      `- 候选池币种：${report.auditRound.candidateUniverseSize}`,
      `- 每币节点：${report.auditRound.nodesPerSymbol}`,
      `- 已完成节点：${report.auditRound.completedNodes}/${report.auditRound.totalNodes}`,
      `- radar topN 捕获：${captured}/${report.auditRound.nodes.length} (${captureRate}%)`,
      "",
      "| 币种 | 类型 | 节点 | 机会池 | 周期 | 验证窗口 | 捕获 | 排名 | 迟到 | MFE | MAE | 成熟度 | 计划卡点 |",
      "|---|---|---|---|---|---|---|---:|---|---:|---:|---|---|",
    );

    for (const node of report.auditRound.nodes.slice(0, 50)) {
      lines.push(`| ${node.symbol} | ${node.coinTypeLabel} | ${nodeRoleLabel[node.nodeRole] ?? node.nodeRole} | ${node.opportunityLaneLabel ?? opportunityLaneLabel[node.opportunityLane] ?? node.opportunityLane} | ${node.timeframeBand} | ${node.validationWindowLabel} | ${node.capturedByRadar ? "是" : "否"} | ${node.radarRank ?? "-"} | ${node.lateAtSelection ? "是" : "否"} | ${node.mfePct}% | ${node.maePct}% | ${node.maturity} | ${readablePlanBlockers(node.planBlockers, 2).join(" / ") || "-"} |`);
    }

    lines.push("");
  }

  lines.push(
    "## 漏判机会样本",
    "",
  );

  for (const miss of report.missedOpportunities.slice(0, 20)) {
    const rank = typeof miss.radarRank === "number" ? `当时排名第 ${miss.radarRank}` : "当时排名未知";
    const node = miss.nodeRole ? `节点=${nodeRoleLabel[miss.nodeRole] ?? miss.nodeRole}` : "节点未知";
    const windowLabel = miss.validationWindowLabel ? `验证窗口=${miss.validationWindowLabel}` : "验证窗口未知";
    const lane = miss.opportunityLaneLabel ? `机会池=${miss.opportunityLaneLabel}` : "";
    const blocker = miss.planBlockers?.length ? `计划卡点=${readablePlanBlockers(miss.planBlockers, 3).join(" / ")}` : "";

    lines.push(`- ${miss.symbol} ${miss.direction === "short" ? "偏空" : "偏多"} ${rank} ${node} ${lane} ${windowLabel} MFE=${miss.mfePct}% MAE=${miss.maePct}% 入选前已波动=${miss.moveAtSelectionPct}% 成交量=${miss.volumeRatio}x ${blocker}：${miss.reason}`);
  }

  if (report.missedOpportunities.length === 0) {
    lines.push("- 本轮没有发现 radar topN 外的可学习漏判机会；这不代表系统一定没有漏判，需要扩大样本验证。");
  }

  lines.push(
    "",
    "## 问题清单",
    "",
  );

  for (const group of groupedFindings.slice(0, 18)) {
    const { finding } = group;
    const sample = group.samples.length > 0 ? ` 代表样本：${group.samples.join(" / ")}` : "";

    lines.push(`- ${finding.id} [${severityLabel[finding.severity] ?? finding.severity}] x${group.count} ${finding.title}：${finding.detail}${sample} 下一步：${finding.nextAction}`);
  }

  if (groupedFindings.length === 0) {
    lines.push("- 本轮没有发现问题；仍需扩大样本和接入历史衍生品继续验证。");
  }

  lines.push(
    "",
    "## 整改方案",
    "",
  );

  for (const item of report.remediationPlan) {
    lines.push(`- ${item.priority} ${item.targetModule}：${item.action} 验收：${item.acceptanceCriteria}`);
  }

  if (report.remediationPlan.length === 0) {
    lines.push("- 暂无整改项。");
  }

  return `${lines.join("\n")}\n`;
}

async function writeReport(options: CliOptions, report: ReturnType<typeof runProfessionalReplay>, failures: Array<{ error: string; symbol: string }>) {
  const reportDir = path.join(process.cwd(), options.out, timestampSlug());
  const roundTrendComparison = await buildRoundTrendComparison(options, report);

  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "summary.md"), reportMarkdown(report, failures, roundTrendComparison), "utf8");
  await writeFile(path.join(reportDir, "findings.json"), JSON.stringify({
    ...report,
    auditMode: options.auditMode,
    failures,
    roundTrendComparison,
  }, null, 2), "utf8");
  if (report.auditRound) {
    await writeFile(path.join(reportDir, "progress.json"), JSON.stringify(report.auditRound, null, 2), "utf8");
    writeAuditProgress(options, report.auditRound);
  }

  return reportDir;
}

function focusedAuditShouldFail(report: ProfessionalReplayReport, mode: ProfessionalAuditMode) {
  if (mode === "full") {
    return report.roundSummary.highSeverityFindings > 0;
  }

  const metric = report.coreCapabilityMetrics.find((item) => item.id === mode);

  if (!metric) {
    return true;
  }

  return metric.status === "fail";
}

function runGoldenGate() {
  const golden = runGoldenCases();

  return golden;
}

function enforceGoldenGate(options: CliOptions) {
  if (!options.requireGoldenPass) {
    return;
  }

  const golden = runGoldenGate();

  if (golden.status !== "passed") {
    const failed = golden.results
      .filter((result) => !result.passed)
      .map((result) => result.fixture.id)
      .join(", ");

    throw new Error(`Golden cases failed; formal audit is blocked. failed=${failed}`);
  }
}

function metricForMode(report: ProfessionalReplayReport, mode: Exclude<ProfessionalAuditMode, "full">) {
  return report.coreCapabilityMetrics.find((item) => item.id === mode);
}

function judgeLaneStatusFromMetric(metric: ReturnType<typeof metricForMode>) {
  if (!metric) {
    return "waiting" as const;
  }

  return metric.status;
}

function buildJudgeSystemSnapshot(
  report: ProfessionalReplayReport,
  auditMode: ProfessionalAuditMode,
): ProfessionalJudgeSystemSnapshot {
  const golden = runGoldenGate();
  const scan = metricForMode(report, "scan");
  const analysis = metricForMode(report, "analysis");
  const strategy = metricForMode(report, "strategy");
  const generatedAt = report.generatedAt;
  const lanes: ProfessionalJudgeSystemLane[] = [
    {
      id: "golden_cases",
      label: "金样本基础逻辑",
      source: "executable-fixtures",
      status: golden.status === "passed" ? "pass" : "fail",
      summary: golden.status === "passed"
        ? `基础逻辑样本 ${golden.passed}/${golden.total} 通过。`
        : `基础逻辑样本失败 ${golden.failed}/${golden.total}，禁止继续包装正式审计。`,
      updatedAt: generatedAt,
    },
    {
      id: "scan_audit",
      label: "扫描提前性审计",
      source: auditMode === "scan" ? "current-report" : "latest-report-or-current-core-metric",
      status: judgeLaneStatusFromMetric(scan),
      summary: scan?.summary ?? "尚未生成扫描专项审计报告。",
      updatedAt: generatedAt,
    },
    {
      id: "analysis_audit",
      label: "分析判断审计",
      source: auditMode === "analysis" ? "current-report" : "latest-report-or-current-core-metric",
      status: judgeLaneStatusFromMetric(analysis),
      summary: analysis?.summary ?? "尚未生成分析专项审计报告。",
      updatedAt: generatedAt,
    },
    {
      id: "strategy_audit",
      label: "策略计划审计",
      source: auditMode === "strategy" ? "current-report" : "latest-report-or-current-core-metric",
      status: judgeLaneStatusFromMetric(strategy),
      summary: strategy?.summary ?? "尚未生成策略专项审计报告。",
      updatedAt: generatedAt,
    },
    {
      id: "formal_audit",
      label: "正式综合审计",
      source: auditMode === "full" ? "current-report" : "not-current-mode",
      status: auditMode !== "full"
        ? "waiting"
        : report.roundSummary.highSeverityFindings > 0
          ? "fail"
          : "watch",
      summary: auditMode !== "full"
        ? "等待金样本和三个专项审计通过后再跑正式综合审计。"
        : report.roundSummary.highSeverityFindings > 0
          ? `正式审计仍有 ${report.roundSummary.highSeverityFindings} 个高优先级问题。`
          : "正式审计没有高优先级问题，但仍需 shadow-live 长期样本确认。",
      updatedAt: generatedAt,
    },
    {
      id: "shadow_live",
      label: "影子实盘验证",
      source: "review-contract",
      status: "waiting",
      summary: "等待生产候选写入影子跟踪样本；不能据此自动改权重或生成交易。",
      updatedAt: generatedAt,
    },
  ];
  const failing = lanes.filter((lane) => lane.status === "fail");
  const waiting = lanes.filter((lane) => lane.status === "waiting");
  const statusLabel: ProfessionalJudgeSystemSnapshot["statusLabel"] = failing.length > 0
    ? "不能支撑实战"
    : waiting.length > 0
      ? "可运行但不完整"
      : "临时验证版";

  return {
    guardrails: [
      "正式回测不是第一调试工具，必须先过金样本和专项审计。",
      "扫描、分析、策略三项必须分开验收，不能用综合分掩盖短板。",
      "影子实盘只做纸面验证，不能自动交易，不能自动改实时权重。",
    ],
    lanes,
    schemaVersion: "core-judge-system.v1",
    statusLabel,
    summary: statusLabel === "不能支撑实战"
      ? `裁判系统发现 ${failing.length} 个核心阻断项，先整改再继续正式回测。`
      : statusLabel === "可运行但不完整"
        ? `裁判系统可运行，但还有 ${waiting.length} 个环节等待报告或生产样本。`
        : "裁判系统具备临时验证能力，仍需扩大样本和影子实盘确认。",
  };
}

async function main() {
  const options = readArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    return;
  }

  enforceGoldenGate(options);

  const discoveredSymbols = await discoverBinanceSymbols(options.auditRound ? 2000 : options.maxSymbols);
  const previousRoundSymbols = await previousAuditRoundSymbols(options);
  const roundSeed = `${new Date().toISOString().slice(0, 13)}:${previousRoundSymbols.join(",")}`;
  const auditPlan = options.auditRound
    ? buildAuditSymbolPlan({
      avoidedSymbols: previousRoundSymbols,
      roundSeed,
      symbols: discoveredSymbols,
      targetCount: options.auditSymbols,
    })
    : [];
  const symbols = options.auditRound
    ? buildAuditCandidateUniverse({
      auditPlan,
      symbols: discoveredSymbols,
      targetCount: options.candidateSymbols,
    })
    : discoveredSymbols;

  if (options.auditRound && auditPlan.length === 0) {
    throw new Error("No audit-round altcoin symbols selected. Check Binance futures discovery.");
  }

  if (options.auditRound) {
    writePhaseProgress({
      candidateUniverseSize: symbols.length,
      currentSymbol: null,
      options,
      phase: "planning",
      plannedSymbols: auditPlan,
      summary: `已选择 ${auditPlan.length} 个不同类型山寨币，在 ${symbols.length} 个候选币池中执行 ${auditPlan.length * options.nodesPerSymbol} 个节点。本轮已避让上一轮目标币 ${previousRoundSymbols.length} 个。`,
    });
  }

  const { candlesBySymbol, failures } = await fetchCandlesBySymbol(symbols, options, auditPlan);

  if (candlesBySymbol.size === 0) {
    throw new Error("No historical candles fetched. Check network or reduce symbol scope.");
  }

  const {
    derivativesBySymbol,
    failures: derivativeFailures,
  } = await fetchDerivativesBySymbol(candlesBySymbol, options, auditPlan);

  const report = options.auditRound
    ? runProfessionalAuditRound({
      candlesBySymbol,
      derivativesBySymbol,
      options: {
        generatedAt: new Date().toISOString(),
        horizonBarsByBand: {
          large: Math.max(1, Math.round(options.largeHorizonHours * 4)),
          medium: Math.max(1, Math.round(options.mediumHorizonHours * 4)),
          small: Math.max(1, Math.round(options.smallHorizonHours * 4)),
        },
        moveThresholdPct: 10,
        nodesPerSymbol: options.nodesPerSymbol,
        onProgress: (progress) => writeAuditProgress(options, progress),
        candidateUniverseSize: candlesBySymbol.size,
        symbols: auditPlan.filter((item) => candlesBySymbol.has(item.symbol)),
        topN: options.topN,
      },
    })
    : runProfessionalReplay({
      baseInterval: "15m",
      candlesBySymbol,
      derivativesBySymbol,
      options: {
        horizonBars: 96,
        maxCasesInReport: 300,
        moveThresholdPct: 10,
        stepBars: 4,
        topN: options.topN,
      },
    });
  report.auditMode = options.auditMode;
  report.judgeSystem = buildJudgeSystemSnapshot(report, options.auditMode);
  const reportDir = await writeReport(options, report, [...failures, ...derivativeFailures]);

  console.log(`professional-backtest-audit report: ${reportDir}`);
  console.log(`cases=${report.roundSummary.cases} highFindings=${report.roundSummary.highSeverityFindings} planReady=${report.roundSummary.planReadyCount}`);

  process.exit(focusedAuditShouldFail(report, options.auditMode) ? 2 : 0);
}

main().catch((error) => {
  const message = errorMessage(error);

  try {
    const options = readArgs(process.argv.slice(2));

    if (options.auditRound) {
      const now = new Date().toISOString();

          writeAuditProgress(options, {
            candidateUniverseSize: 0,
            completedAt: now,
        completedNodes: 0,
        currentNodeRole: null,
        currentSymbol: null,
        generatedAt: now,
        guardrails: [
          "回测失败必须暴露真实原因，不能用旧报告或 0 值冒充已完成。",
          "如果本机无法访问交易所 API，应在腾讯云或可访问公开交易所 API 的环境运行。",
        ],
        nodes: [],
        nodesPerSymbol: options.nodesPerSymbol,
        phase: "failed",
        plannedSymbols: [],
        schemaVersion: "professional-backtest-audit-round-progress.v1",
        status: "failed",
        summary: `专业回测轮次失败：${message}`,
        totalNodes: options.auditSymbols * options.nodesPerSymbol,
        updatedAt: now,
      });
    }
  } catch {
    // Keep the original failure visible even if progress writing also fails.
  }

  console.error(message);
  process.exit(1);
});
