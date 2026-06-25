import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type {
  Candle,
} from "../lib/market/ohlcv/types";
import {
  runProfessionalReplay,
} from "../lib/backtest/professional-replay";

const BINANCE_EXCHANGE_INFO_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const BINANCE_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";

type BinanceExchangeSymbolRow = {
  contractType?: string;
  quoteAsset?: string;
  status?: string;
  symbol?: string;
};

type CliOptions = {
  days: number;
  maxSymbols: number;
  out: string;
  requestDelayMs: number;
  topN: number;
};

function usage() {
  console.log(`Usage: npm run backtest:professional -- [options]

Professional Strategy Backtest Audit Engine v2.
It replays historical public futures candles through the production analysis chain.

Options:
  --days 30                         Historical window, default 30
  --max-symbols 120                 Max Binance USDT perpetual symbols, default 120
  --top-n 20                        Candidates per replay point, default 20
  --request-delay-ms 80             Delay between upstream requests, default 80
  --out reports/professional-backtest-audit

Examples:
  npm run backtest:professional -- --days 7 --max-symbols 40 --top-n 10
  npm run backtest:professional -- --days 30 --max-symbols 180 --top-n 24
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
    days: positiveNumber(args.days, 30),
    help: args.help === true,
    maxSymbols: Math.max(1, Math.round(positiveNumber(args["max-symbols"], 120))),
    out: typeof args.out === "string" ? args.out : "reports/professional-backtest-audit",
    requestDelayMs: Math.max(0, Math.round(positiveNumber(args["request-delay-ms"], 80))),
    topN: Math.max(1, Math.round(positiveNumber(args["top-n"], 20))),
  };
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const response = await fetch(BINANCE_EXCHANGE_INFO_URL, {
    headers: {
      "user-agent": "chuan-radar-professional-backtest/2.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Binance exchangeInfo returned ${response.status}`);
  }

  const payload = await response.json();
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
    const response = await fetch(`${BINANCE_KLINES_URL}?${params.toString()}`, {
      headers: {
        "user-agent": "chuan-radar-professional-backtest/2.0",
      },
    });

    if (!response.ok) {
      throw new Error(`${symbol} klines returned ${response.status}`);
    }

    const rows = await response.json();

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

async function fetchCandlesBySymbol(symbols: string[], options: CliOptions) {
  const candlesBySymbol = new Map<string, Candle[]>();
  const failures: Array<{ error: string; symbol: string }> = [];

  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index];

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
        error: error instanceof Error ? error.message : String(error),
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

function reportMarkdown(report: ReturnType<typeof runProfessionalReplay>, failures: Array<{ error: string; symbol: string }>) {
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
    `- 数据源：binance-public-futures 15m klines`,
    `- 使用币种：${report.input.symbolsUsed.length}`,
    `- 回放点：${report.input.replayTimes}`,
    `- 每轮候选：${report.input.topN}`,
    `- 验证窗口：${report.input.horizonBars} 根 15m K 线`,
    `- 拉取失败：${failures.length}`,
    "",
    "## 结论",
    "",
    `- ${report.summary}`,
    `- 样本数：${report.roundSummary.cases}`,
    `- 交易计划就绪：${report.roundSummary.planReadyCount}`,
    `- 高优先级问题：${report.roundSummary.highSeverityFindings}`,
    "",
    "## 问题清单",
    "",
  ];

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

  return reportDir;
}

async function main() {
  const options = readArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    return;
  }

  const symbols = await discoverBinanceSymbols(options.maxSymbols);
  const { candlesBySymbol, failures } = await fetchCandlesBySymbol(symbols, options);

  if (candlesBySymbol.size === 0) {
    throw new Error("No historical candles fetched. Check network or reduce symbol scope.");
  }

  const report = runProfessionalReplay({
    baseInterval: "15m",
    candlesBySymbol,
    options: {
      horizonBars: 96,
      maxCasesInReport: 300,
      moveThresholdPct: 10,
      stepBars: 4,
      topN: options.topN,
    },
  });
  const reportDir = await writeReport(options, report, failures);

  console.log(`professional-backtest-audit report: ${reportDir}`);
  console.log(`cases=${report.roundSummary.cases} highFindings=${report.roundSummary.highSeverityFindings} planReady=${report.roundSummary.planReadyCount}`);

  if (report.roundSummary.highSeverityFindings > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
