import {
  execFile,
} from "node:child_process";
import {
  mkdir,
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
  runProfessionalAuditRound,
  type ProfessionalAuditRoundCoinType,
  type ProfessionalAuditRoundProgress,
  type ProfessionalAuditRoundSymbolPlan,
} from "../lib/backtest/professional-audit-round";

const BINANCE_EXCHANGE_INFO_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const BINANCE_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";
const BINANCE_FUNDING_RATE_URL = "https://fapi.binance.com/fapi/v1/fundingRate";
const BINANCE_OPEN_INTEREST_HIST_URL = "https://futures.binance.com/futures/data/openInterestHist";

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
    smallHorizonHours: positiveNumber(args["small-horizon-hours"], 4),
    topN: Math.max(1, Math.round(positiveNumber(args["top-n"], 20))),
  };
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

  const response = await fetch(url, {
    headers: {
      "user-agent": "chuan-radar-professional-backtest/2.0",
    },
  });

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

const auditCoinTypeLabels: Record<ProfessionalAuditRoundCoinType, string> = {
  ai_depin: "AI / Depin",
  defi: "DeFi",
  exchange_infra: "交易所/基础设施",
  gaming: "GameFi",
  large_liquid_alt: "高流动性主流山寨",
  layer1_layer2: "L1 / L2",
  long_tail: "长尾小币",
  meme: "Meme 高波动",
  midcap_trend: "中市值趋势币",
  new_hot_listing: "新上市/热点币",
};

const auditSeeds: Record<ProfessionalAuditRoundCoinType, string[]> = {
  ai_depin: ["FETUSDT", "TAOUSDT", "RENDERUSDT", "WLDUSDT", "ARKMUSDT", "AIUSDT"],
  defi: ["AAVEUSDT", "UNIUSDT", "MKRUSDT", "PENDLEUSDT", "ENAUSDT", "LDOUSDT"],
  exchange_infra: ["BNBUSDT", "OKBUSDT", "GTUSDT", "CAKEUSDT", "RUNEUSDT", "DYDXUSDT"],
  gaming: ["GALAUSDT", "PIXELUSDT", "IMXUSDT", "RONINUSDT", "SANDUSDT", "AXSUSDT"],
  large_liquid_alt: ["SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT"],
  layer1_layer2: ["SUIUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "SEIUSDT", "TIAUSDT"],
  long_tail: ["1000PEPEUSDT", "1000BONKUSDT", "BICOUSDT", "CELRUSDT", "JASMYUSDT", "TRUUSDT"],
  meme: ["1000PEPEUSDT", "DOGEUSDT", "WIFUSDT", "1000FLOKIUSDT", "1000BONKUSDT", "PNUTUSDT"],
  midcap_trend: ["ONDOUSDT", "INJUSDT", "HYPEUSDT", "JUPUSDT", "WUSDT", "PYTHUSDT"],
  new_hot_listing: ["HYPEUSDT", "WUSDT", "JUPUSDT", "ZROUSDT", "STRKUSDT", "ENAUSDT"],
};

const auditTypeOrder: ProfessionalAuditRoundCoinType[] = [
  "large_liquid_alt",
  "layer1_layer2",
  "defi",
  "meme",
  "ai_depin",
  "gaming",
  "exchange_infra",
  "new_hot_listing",
  "midcap_trend",
  "long_tail",
];

function deterministicSymbolScore(symbol: string) {
  let hash = 2166136261;

  for (let index = 0; index < symbol.length; index += 1) {
    hash ^= symbol.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function buildAuditSymbolPlan(symbols: string[], targetCount: number): ProfessionalAuditRoundSymbolPlan[] {
  const available = new Set(symbols.filter((symbol) => !["BTCUSDT", "ETHUSDT"].includes(symbol)));
  const used = new Set<string>();
  const plan: ProfessionalAuditRoundSymbolPlan[] = [];

  for (const coinType of auditTypeOrder) {
    const symbol = auditSeeds[coinType].find((seed) => available.has(seed) && !used.has(seed));

    if (!symbol) {
      continue;
    }

    used.add(symbol);
    plan.push({
      coinType,
      coinTypeLabel: auditCoinTypeLabels[coinType],
      symbol,
    });

    if (plan.length >= targetCount) {
      return plan;
    }
  }

  const fallback = [...available]
    .filter((symbol) => !used.has(symbol))
    .sort((left, right) => deterministicSymbolScore(left) - deterministicSymbolScore(right));

  for (const symbol of fallback) {
    const coinType: ProfessionalAuditRoundCoinType = "long_tail";
    plan.push({
      coinType,
      coinTypeLabel: auditCoinTypeLabels[coinType],
      symbol,
    });

    if (plan.length >= targetCount) {
      break;
    }
  }

  return plan;
}

function buildAuditCandidateUniverse(
  symbols: string[],
  auditPlan: ProfessionalAuditRoundSymbolPlan[],
  targetCount: number,
) {
  const requiredSymbols = auditPlan.map((item) => item.symbol);
  const required = new Set(requiredSymbols);
  const candidateLimit = Math.max(requiredSymbols.length, targetCount);
  const filler = symbols
    .filter((symbol) => symbol && !["BTCUSDT", "ETHUSDT"].includes(symbol))
    .filter((symbol) => !required.has(symbol))
    .sort((left, right) => deterministicSymbolScore(left) - deterministicSymbolScore(right));

  return [...requiredSymbols, ...filler]
    .slice(0, candidateLimit);
}

function progressPath(options: CliOptions) {
  return path.join(process.cwd(), options.out, "latest-progress.json");
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
  let cursor = startTime;

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

function reportMarkdown(report: ReturnType<typeof runProfessionalReplay>, failures: Array<{ error: string; symbol: string }>) {
  const auditWindowSummary = report.auditRound
    ? [...new Map(report.auditRound.nodes.map((node) => [node.timeframeBand, node.validationWindowLabel])).entries()]
      .sort(([left], [right]) => {
        const order = { large: 3, medium: 2, small: 1 } as const;

        return order[right as keyof typeof order] - order[left as keyof typeof order];
      })
      .map(([band, label]) => `${band}=${label}`)
      .join(" / ")
    : "";
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
    "## 基线对比",
    "",
    "| 通道 | 样本 | 命中率 | 迟到率 | 平均 MFE | 平均 MAE | 入选时已波动 | 成交量倍数 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const lane of ["radar", "momentum", "volume", "random"] as const) {
    const metric = report.baselineMetrics[lane];

    lines.push(`| ${lane} | ${metric.count} | ${metric.hitRatePct}% | ${metric.lateRatePct}% | ${metric.avgMfePct}% | ${metric.avgMaePct}% | ${metric.avgMoveAtSelectionPct}% | ${metric.avgVolumeRatio}x |`);
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
      "| 币种 | 类型 | 节点 | 周期 | 验证窗口 | 捕获 | 排名 | 迟到 | MFE | MAE | 成熟度 |",
      "|---|---|---|---|---|---|---:|---|---:|---:|---|",
    );

    for (const node of report.auditRound.nodes.slice(0, 50)) {
      lines.push(`| ${node.symbol} | ${node.coinTypeLabel} | ${node.nodeRole} | ${node.timeframeBand} | ${node.validationWindowLabel} | ${node.capturedByRadar ? "是" : "否"} | ${node.radarRank ?? "-"} | ${node.lateAtSelection ? "是" : "否"} | ${node.mfePct}% | ${node.maePct}% | ${node.maturity} |`);
    }

    lines.push("");
  }

  lines.push(
    "## 漏判机会样本",
    "",
  );

  for (const miss of report.missedOpportunities.slice(0, 20)) {
    lines.push(`- ${miss.symbol} ${miss.direction} observed=${miss.observedAt} MFE=${miss.mfePct}% MAE=${miss.maePct}% 入选前已波动=${miss.moveAtSelectionPct}% volume=${miss.volumeRatio}x：${miss.reason}`);
  }

  if (report.missedOpportunities.length === 0) {
    lines.push("- 本轮没有发现 radar topN 外的可学习漏判机会；这不代表系统一定没有漏判，需要扩大样本验证。");
  }

  lines.push(
    "",
    "## 问题清单",
    "",
  );

  for (const finding of report.findings.slice(0, 30)) {
    lines.push(`- ${finding.id} [${finding.severity}] ${finding.title}：${finding.detail} 下一步：${finding.nextAction}`);
  }

  if (report.findings.length === 0) {
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

  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "summary.md"), reportMarkdown(report, failures), "utf8");
  await writeFile(path.join(reportDir, "findings.json"), JSON.stringify({
    ...report,
    failures,
  }, null, 2), "utf8");
  if (report.auditRound) {
    await writeFile(path.join(reportDir, "progress.json"), JSON.stringify(report.auditRound, null, 2), "utf8");
    writeAuditProgress(options, report.auditRound);
  }

  return reportDir;
}

async function main() {
  const options = readArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    return;
  }

  const discoveredSymbols = await discoverBinanceSymbols(options.auditRound ? 2000 : options.maxSymbols);
  const auditPlan = options.auditRound
    ? buildAuditSymbolPlan(discoveredSymbols, options.auditSymbols)
    : [];
  const symbols = options.auditRound
    ? buildAuditCandidateUniverse(discoveredSymbols, auditPlan, options.candidateSymbols)
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
      summary: `已选择 ${auditPlan.length} 个不同类型山寨币，在 ${symbols.length} 个候选币池中执行 ${auditPlan.length * options.nodesPerSymbol} 个节点。`,
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
  const reportDir = await writeReport(options, report, [...failures, ...derivativeFailures]);

  console.log(`professional-backtest-audit report: ${reportDir}`);
  console.log(`cases=${report.roundSummary.cases} highFindings=${report.roundSummary.highSeverityFindings} planReady=${report.roundSummary.planReadyCount}`);

  if (report.roundSummary.highSeverityFindings > 0) {
    process.exitCode = 2;
  }
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
