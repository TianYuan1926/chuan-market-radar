#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const defaultBaseUrl = process.env.BASE_URL || "http://43.161.202.227";
const defaultReportRoot = process.env.RADAR_AUDIT_REPORT_ROOT || "reports/radar-audit";
const defaultTimeoutMs = 25_000;

const maturityOrder = [
  "LIGHT_SCAN_MARK",
  "DEEP_SCAN_CANDIDATE",
  "EVIDENCE_SIGNAL",
  "REVIEW_ONLY",
  "TRADE_PLAN_READY",
  "BLOCKED",
  "INVALIDATED",
  "COOLDOWN",
];

const maturityLabels = {
  LIGHT_SCAN_MARK: "轻扫标记",
  DEEP_SCAN_CANDIDATE: "深扫候选",
  EVIDENCE_SIGNAL: "证据信号",
  REVIEW_ONLY: "只复盘",
  TRADE_PLAN_READY: "交易计划就绪",
  BLOCKED: "风控拦截",
  INVALIDATED: "结构失效",
  COOLDOWN: "冷却观察",
};

const leaderboardKinds = ["gainers", "losers", "volume"];

function parseArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    limit: 20,
    minMovePct: 15,
    outRoot: defaultReportRoot,
    timeoutMs: defaultTimeoutMs,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === "--limit" && next) {
      args.limit = positiveInt(next, args.limit);
      index += 1;
    } else if (arg === "--min-move-pct" && next) {
      args.minMovePct = positiveNumber(next, args.minMovePct);
      index += 1;
    } else if (arg === "--out" && next) {
      args.outRoot = next;
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      args.timeoutMs = positiveInt(next, args.timeoutMs);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, "");
  return args;
}

function printHelp() {
  console.log(`Usage: npm run backtest:audit -- [options]

Read-only radar backtest audit. It does not mutate the database, trading rules, or production state.

Options:
  --base-url <url>        API base URL. Default: ${defaultBaseUrl}
  --limit <number>        Daily mover and sample limit. Default: 20
  --min-move-pct <num>    Move threshold for review findings. Default: 15
  --out <dir>             Report root. Default: ${defaultReportRoot}
  --timeout-ms <number>   Per-request timeout. Default: ${defaultTimeoutMs}
`);
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nowStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-") + "-" + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

async function fetchJson(baseUrl, endpoint, timeoutMs) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        "cache-control": "no-store",
        "user-agent": "chuan-radar-backtest-audit/1.0",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (error) {
      return {
        endpoint,
        ok: false,
        status: response.status,
        elapsedMs: Date.now() - started,
        error: `invalid_json: ${error instanceof Error ? error.message : String(error)}`,
        bodyText: text.slice(0, 500),
      };
    }

    return {
      endpoint,
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      body,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: 0,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function resourceData(resource, fallback) {
  if (resource && typeof resource === "object" && "data" in resource) {
    return resource.data ?? fallback;
  }
  return fallback;
}

function resourceStatus(resource) {
  if (resource && typeof resource === "object" && "status" in resource) {
    return resource.status ?? "unknown";
  }
  return "unknown";
}

function normalizeSymbol(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/^BINANCE:/, "")
    .replace(/^OKX:/, "")
    .replace(/^BYBIT:/, "")
    .replace(/-USDT-SWAP$/, "USDT")
    .replace(/USDT\.P$/, "USDT")
    .replace(/USDT$/, "")
    .replace(/USD$/, "");
}

function symbolFromRow(row) {
  return normalizeSymbol(row?.symbol ?? row?.baseAsset ?? row?.base_asset ?? row?.asset ?? row?.id);
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getContract(payload) {
  return payload?.body?.contract ?? payload?.contract ?? {};
}

function getLeaderboardRows(payload) {
  return resourceData(payload?.body?.leaderboard ?? payload?.leaderboard, []);
}

function getDailyMover(payload) {
  return payload?.body ?? payload ?? {};
}

function getArchive(payload) {
  return payload?.body?.archive ?? payload?.archive ?? {};
}

function findingFactory() {
  const counters = new Map();
  return function finding(category, severity, title, detail, sample = {}) {
    const next = (counters.get(category) ?? 0) + 1;
    counters.set(category, next);
    return {
      id: `BT-${category}-${String(next).padStart(3, "0")}`,
      category,
      severity,
      title,
      detail,
      sample,
    };
  };
}

function maturityCounts(signals) {
  const counts = Object.fromEntries(maturityOrder.map((key) => [key, 0]));
  for (const signal of signals) {
    const stage = signal?.maturity ?? "UNKNOWN";
    counts[stage] = (counts[stage] ?? 0) + 1;
  }
  return counts;
}

function signalIndex(signals) {
  const map = new Map();
  for (const signal of signals) {
    const key = normalizeSymbol(signal?.symbol);
    if (key) map.set(key, signal);
  }
  return map;
}

function collectArchiveSymbols(archive) {
  const symbols = new Set();
  const entries = Array.isArray(archive?.entries) ? archive.entries : [];
  const visit = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      const symbol = normalizeSymbol(value);
      if (symbol && /^[A-Z0-9]{1,30}$/.test(symbol)) symbols.add(symbol);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (/symbol|asset|base/i.test(key) && typeof child === "string") visit(child);
        else if (/signals|tickers|candidates|topSymbols|symbols/i.test(key)) visit(child);
      }
    }
  };
  visit(entries);
  return symbols;
}

function evaluateApiHealth(responses, addFinding) {
  const findings = [];
  for (const response of responses) {
    if (!response.ok) {
      findings.push(addFinding(
        "DATA",
        "high",
        `${response.endpoint} 读取失败`,
        `只读回测审计无法读取 ${response.endpoint}，当前结果不完整。`,
        { endpoint: response.endpoint, status: response.status, error: response.error ?? null },
      ));
    }
  }
  return findings;
}

function evaluateScan(contract, health, archive, addFinding) {
  const findings = [];
  const scanProof = resourceData(contract.scanProof, {});
  const scanStability = resourceData(contract.scanStability, {});
  const realtime = resourceData(contract.realtimeCapability, {});
  const lightQuality = resourceData(contract.lightScanQuality, {});
  const deepQuality = resourceData(contract.deepScanQuality, {});
  const archiveEntries = archive?.entries?.length ?? health?.archive?.entries ?? 0;
  const scannable = numberOrNull(scanProof.scannable) ?? 0;
  const lightScanned = numberOrNull(scanProof.lightScanned) ?? 0;
  const deepScanned = numberOrNull(scanProof.deepScanned) ?? 0;
  const awaitingDeepScan = numberOrNull(scanProof.awaitingDeepScan) ?? 0;

  if (scannable > 0 && lightScanned < Math.floor(scannable * 0.8)) {
    findings.push(addFinding(
      "SCAN",
      "high",
      "全市场轻扫覆盖不足",
      `可扫描 ${scannable} 个，但本轮轻扫 ${lightScanned} 个。临时回测只能说明覆盖不足，不能证明系统发现能力。`,
      { scannable, lightScanned },
    ));
  }

  if (awaitingDeepScan > 0 && deepScanned === 0) {
    findings.push(addFinding(
      "SCAN",
      "high",
      "候选等待深扫但本轮深扫为 0",
      "这会让系统停留在发现层，无法形成衍生品验证和交易计划。",
      { awaitingDeepScan, deepScanned },
    ));
  }

  if (realtime.secondLevelOnline !== true) {
    findings.push(addFinding(
      "SCAN",
      "medium",
      "秒级发现通道未在线",
      "临时审计发现 realtimeCapability.secondLevelOnline 不是 true，秒级异动发现能力需要检查。",
      { secondLevelOnline: realtime.secondLevelOnline ?? null },
    ));
  }

  if (resourceStatus(contract.lightScanQuality) === "failed" || lightQuality.status === "failed") {
    findings.push(addFinding(
      "SCAN",
      "high",
      "轻扫质量状态失败",
      "轻扫质量失败时，不能用候选池或榜单假装正常运行。",
      { status: lightQuality.status ?? resourceStatus(contract.lightScanQuality) },
    ));
  }

  if (archiveEntries === 0) {
    findings.push(addFinding(
      "SCAN",
      "medium",
      "没有可读扫描归档",
      "严格真实回测依赖扫描归档。没有归档时，只能做当前快照审计，不能判断历史提前性。",
      { archiveEntries },
    ));
  }

  if (Array.isArray(scanStability.issues) && scanStability.issues.length > 0) {
    findings.push(addFinding(
      "SCAN",
      "medium",
      "扫描稳定性存在问题",
      "scanStability 报告了运行问题，回测结论需要降低置信度。",
      { issues: scanStability.issues.map((issue) => issue.code ?? issue.id ?? issue.summary).slice(0, 10) },
    ));
  }

  return {
    findings,
    metrics: {
      scannable,
      lightScanned,
      deepScanned,
      awaitingDeepScan,
      coverage: scanProof.coverage ?? null,
      deepCoverage: scanProof.deepCoverage ?? null,
      realtimeOnline: realtime.secondLevelOnline === true,
      lightQualityStatus: lightQuality.status ?? resourceStatus(contract.lightScanQuality),
      archiveEntries,
      deepQuality,
    },
  };
}

function evaluateSignals(contract, addFinding) {
  const findings = [];
  const signals = resourceData(contract.radarSignals, []);
  const counts = maturityCounts(signals);
  const tradeReady = signals.filter((signal) => signal.maturity === "TRADE_PLAN_READY");
  const evidence = signals.filter((signal) => signal.maturity === "EVIDENCE_SIGNAL");
  const reviewOnly = signals.filter((signal) => signal.maturity === "REVIEW_ONLY");

  for (const signal of tradeReady) {
    const rr = numberOrNull(signal.rr);
    if (rr !== null && rr < 3) {
      findings.push(addFinding(
        "SIGNAL",
        "critical",
        "交易计划就绪但结构盈亏比低于 3:1",
        "这违反网站核心风控边界。狙击榜不能出现结构盈亏比不足的计划。",
        { symbol: signal.symbol, rr },
      ));
    }
    if (signal.whyBlocked) {
      findings.push(addFinding(
        "SIGNAL",
        "critical",
        "交易计划就绪同时存在拦截原因",
        "同一个信号不能既是交易计划就绪，又被风控拦截。",
        { symbol: signal.symbol, whyBlocked: signal.whyBlocked },
      ));
    }
    if (signal.operatorRead?.canTrade !== true) {
      findings.push(addFinding(
        "SIGNAL",
        "high",
        "交易计划就绪但操作层不允许交易",
        "信号成熟度和 operatorRead 出现冲突，前端容易误导。",
        { symbol: signal.symbol, maturity: signal.maturity, operatorRead: signal.operatorRead ?? null },
      ));
    }
  }

  for (const signal of signals) {
    if ((signal.maturity === "LIGHT_SCAN_MARK" || signal.maturity === "DEEP_SCAN_CANDIDATE") && signal.operatorRead?.canTrade === true) {
      findings.push(addFinding(
        "SIGNAL",
        "critical",
        "候选层被标成可交易",
        "轻扫标记和深扫候选不能直接交易，必须先完成证据融合、结构盈亏比和风控门禁。",
        { symbol: signal.symbol, maturity: signal.maturity, operatorRead: signal.operatorRead },
      ));
    }
  }

  if (signals.length > 0 && tradeReady.length === 0 && evidence.length === 0 && reviewOnly.length === 0) {
    findings.push(addFinding(
      "SIGNAL",
      "medium",
      "当前只有候选，没有证据信号或交易计划",
      "这不一定是错误，但说明当前网站只能做发现和等待验证，不能用于实战入场参考。",
      { counts },
    ));
  }

  return {
    findings,
    metrics: {
      totalSignals: signals.length,
      counts,
      tradeReady: tradeReady.length,
      evidenceSignals: evidence.length,
      reviewOnly: reviewOnly.length,
    },
  };
}

function evaluateLeaderboards(leaderboards, signals, archiveSymbols, minMovePct, addFinding) {
  const findings = [];
  const signalBySymbol = signalIndex(signals);
  const samples = [];

  for (const [kind, rows] of Object.entries(leaderboards)) {
    for (const [index, row] of rows.slice(0, 20).entries()) {
      const symbol = symbolFromRow(row);
      const value = numberOrNull(row.value) ?? 0;
      const signal = signalBySymbol.get(symbol);
      const absMove = Math.abs(value);
      const sample = {
        kind,
        rank: index + 1,
        symbol,
        value,
        price: numberOrNull(row.price),
        source: row.source ?? "",
        inCandidatePool: Boolean(row.inCandidatePool),
        deepScanned: Boolean(row.deepScanned),
        hasSignal: Boolean(row.hasSignal),
        awaitingScan: Boolean(row.awaitingScan),
        maturity: signal?.maturity ?? "",
        operatorLane: signal?.operatorRead?.lane ?? "",
        archivedRecently: archiveSymbols.has(symbol),
      };
      samples.push(sample);

      if ((kind === "gainers" || kind === "losers") && absMove >= minMovePct) {
        if (!row.inCandidatePool && !row.awaitingScan && !row.deepScanned && !row.hasSignal) {
          findings.push(addFinding(
            "REVIEW",
            "medium",
            `${kind === "gainers" ? "涨幅" : "跌幅"}榜大波动币未进入任何雷达层`,
            `该币 ${kind === "gainers" ? "上涨" : "下跌"} ${value}% ，但当前没有候选、深扫、信号或等待扫描标记。需要进入漏判复盘，不等于可以追。`,
            sample,
          ));
        } else if (!row.deepScanned && !row.hasSignal) {
          findings.push(addFinding(
            "REVIEW",
            "low",
            `${kind === "gainers" ? "涨幅" : "跌幅"}榜大波动币只停留在发现/等待层`,
            `该币波动 ${value}% ，当前还没有深扫或证据融合。需要记录为复盘样本，检查是否晚到或名额不足。`,
            sample,
          ));
        }

        if (signal?.maturity === "TRADE_PLAN_READY") {
          findings.push(addFinding(
            "PLAN",
            "high",
            "大幅波动币仍显示交易计划就绪，需要人工复核是否追涨追跌",
            "榜单大幅波动不一定代表计划错误，但必须确认该计划是在好位置生成，而不是行情已经发生后追单。",
            { ...sample, whySelected: signal.whySelected, whyBlocked: signal.whyBlocked },
          ));
        }
      }
    }
  }

  return {
    findings,
    samples,
  };
}

function evaluateDailyMover(dailyMover, addFinding) {
  const findings = [];
  const snapshots = Array.isArray(dailyMover.snapshots) ? dailyMover.snapshots : [];
  const selectedDetails = Array.isArray(dailyMover.selectedDetails) ? dailyMover.selectedDetails : [];
  const missedAltcoinReviews = Array.isArray(dailyMover.missedAltcoinReviews) ? dailyMover.missedAltcoinReviews : [];
  const klineResults = dailyMover.klineBacktestResults ?? {};
  const candidates = Array.isArray(dailyMover.backtestCandidates) ? dailyMover.backtestCandidates : [];
  const validations = Array.isArray(dailyMover.backtestValidations) ? dailyMover.backtestValidations : [];

  if (snapshots.length === 0) {
    findings.push(addFinding(
      "REVIEW",
      "high",
      "每日涨跌榜没有快照",
      "没有 daily mover 快照时，系统无法系统性复盘“哪些币启动前有什么征兆”。",
      { retention: dailyMover.retention ?? null },
    ));
  }

  if (snapshots.length > 0 && selectedDetails.length === 0) {
    findings.push(addFinding(
      "REVIEW",
      "medium",
      "每日涨跌榜有快照但没有选中样本详情",
      "有榜单但没有样本详情，复盘无法定位具体币种和归因。",
      { snapshotCount: snapshots.length, latestSnapshot: dailyMover.latestSnapshot?.id ?? null },
    ));
  }

  if (missedAltcoinReviews.length > 0) {
    findings.push(addFinding(
      "REVIEW",
      "medium",
      "存在漏判复盘样本",
      "这不是坏事，说明系统已经抓到可学习样本；下一步应看漏判原因是否进入候选排序和阈值复核。",
      { missedReviewCount: missedAltcoinReviews.length, sampleIds: missedAltcoinReviews.slice(0, 5).map((item) => item.id ?? item.symbol ?? item.title) },
    ));
  }

  if (klineResults.status === "empty" || klineResults.status === "blocked") {
    findings.push(addFinding(
      "REVIEW",
      "medium",
      "K 线回测缓存结果不足",
      "当前只能做榜单和扫描归档审计，无法充分判断最大浮盈/最大回撤。",
      { status: klineResults.status, summary: klineResults.summary ?? null },
    ));
  }

  return {
    findings,
    metrics: {
      snapshotCount: snapshots.length,
      selectedDetailCount: selectedDetails.length,
      missedAltcoinReviewCount: missedAltcoinReviews.length,
      backtestCandidateCount: candidates.length,
      backtestValidationCount: validations.length,
      klineBacktestStatus: klineResults.status ?? "unknown",
      latestObservedAt: dailyMover.latestSnapshot?.observedAt ?? null,
      retention: dailyMover.retention ?? null,
    },
  };
}

function severityScore(severity) {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[severity] ?? 0;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  const headers = [
    "kind",
    "rank",
    "symbol",
    "value",
    "price",
    "source",
    "inCandidatePool",
    "deepScanned",
    "hasSignal",
    "awaitingScan",
    "maturity",
    "operatorLane",
    "archivedRecently",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")),
  ].join("\n") + "\n";
}

function reportSummary({
  args,
  generatedAt,
  metrics,
  findings,
  reportDir,
}) {
  const bySeverity = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1;
    return acc;
  }, {});
  const byCategory = findings.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    "# 川 Market Radar 第一轮只读回测审计",
    "",
    `- 生成时间：${generatedAt}`,
    `- 数据源：${args.baseUrl}`,
    `- 输出目录：${reportDir}`,
    "- 使用边界：只读审计，不写数据库，不改策略，不代表量化收益。",
    "",
    "## 一句话结论",
    "",
    conclusion(findings, metrics),
    "",
    "## 核心指标",
    "",
    `- 可扫描：${metrics.scan.scannable}`,
    `- 轻扫：${metrics.scan.lightScanned}`,
    `- 深扫：${metrics.scan.deepScanned}`,
    `- 等待深扫：${metrics.scan.awaitingDeepScan}`,
    `- 扫描归档帧：${metrics.scan.archiveEntries}`,
    `- 秒级通道在线：${metrics.scan.realtimeOnline ? "是" : "否"}`,
    `- 可见信号：${metrics.signals.totalSignals}`,
    `- 交易计划就绪：${metrics.signals.tradeReady}`,
    `- 证据信号：${metrics.signals.evidenceSignals}`,
    `- 只复盘：${metrics.signals.reviewOnly}`,
    `- 每日涨跌榜快照：${metrics.dailyMover.snapshotCount}`,
    `- 每日涨跌榜选中样本：${metrics.dailyMover.selectedDetailCount}`,
    `- 漏判复盘样本：${metrics.dailyMover.missedAltcoinReviewCount}`,
    `- K 线回测缓存状态：${metrics.dailyMover.klineBacktestStatus}`,
    "",
    "## 信号成熟度分布",
    "",
    ...maturityOrder.map((key) => `- ${maturityLabels[key]}：${metrics.signals.counts[key] ?? 0}`),
    "",
    "## 问题分布",
    "",
    `- 按严重度：${JSON.stringify(bySeverity)}`,
    `- 按类别：${JSON.stringify(byCategory)}`,
    "",
    "## 问题清单",
    "",
  ];

  if (findings.length === 0) {
    lines.push("本轮只读审计没有发现阻断级问题。注意：这不等于完整历史回放通过，只代表当前接口和已有样本没有触发审计规则。");
  } else {
    for (const item of findings) {
      lines.push(`### ${item.id} ${item.title}`);
      lines.push("");
      lines.push(`- 严重度：${item.severity}`);
      lines.push(`- 类别：${item.category}`);
      lines.push(`- 说明：${item.detail}`);
      lines.push(`- 样本：\`${JSON.stringify(item.sample).slice(0, 800)}\``);
      lines.push("");
    }
  }

  lines.push("## 你后续怎么反馈问题");
  lines.push("");
  lines.push("直接复制问题编号给我，例如：`修 BT-SCAN-001 和 BT-REVIEW-002`。");
  lines.push("也可以补充截图或币种，我会按编号反查这份报告和后端接口。");
  lines.push("");

  return lines.join("\n");
}

function conclusion(findings, metrics) {
  const maxSeverity = Math.max(0, ...findings.map((item) => severityScore(item.severity)));
  if (maxSeverity >= 4) {
    return "存在阻断级问题：当前不能把网站输出当作实战参考，必须先处理 critical findings。";
  }
  if (maxSeverity >= 3) {
    return "存在高优先级问题：系统能运行，但关键链路有风险，需要先修 high findings。";
  }
  if (metrics.signals.tradeReady === 0 && metrics.signals.evidenceSignals === 0) {
    return "当前更像发现和复盘系统，暂时没有足够成熟的实战信号。";
  }
  if (maxSeverity >= 2) {
    return "当前链路可审计，但仍有复盘或展示问题需要继续处理。";
  }
  return "当前只读审计未发现明显阻断，下一步可以扩大历史窗口。";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const stamp = nowStamp();
  const reportDir = path.join(args.outRoot, stamp);
  const addFinding = findingFactory();

  const endpoints = [
    "/api/health",
    "/api/frontend/radar-contract",
    "/api/archive",
    `/api/daily-movers?limit=${args.limit}`,
    ...leaderboardKinds.map((kind) => `/api/frontend/leaderboard?kind=${kind}`),
  ];

  const responses = await Promise.all(endpoints.map((endpoint) => fetchJson(args.baseUrl, endpoint, args.timeoutMs)));
  const byEndpoint = Object.fromEntries(responses.map((response) => [response.endpoint, response]));
  const health = byEndpoint["/api/health"]?.body?.health ?? {};
  const contract = getContract(byEndpoint["/api/frontend/radar-contract"]);
  const archive = getArchive(byEndpoint["/api/archive"]);
  const dailyMover = getDailyMover(byEndpoint[`/api/daily-movers?limit=${args.limit}`]);
  const leaderboards = Object.fromEntries(leaderboardKinds.map((kind) => [
    kind,
    getLeaderboardRows(byEndpoint[`/api/frontend/leaderboard?kind=${kind}`]),
  ]));
  const signals = resourceData(contract.radarSignals, []);
  const archiveSymbols = collectArchiveSymbols(archive);

  const apiFindings = evaluateApiHealth(responses, addFinding);
  const scanAudit = evaluateScan(contract, health, archive, addFinding);
  const signalAudit = evaluateSignals(contract, addFinding);
  const leaderboardAudit = evaluateLeaderboards(leaderboards, signals, archiveSymbols, args.minMovePct, addFinding);
  const dailyMoverAudit = evaluateDailyMover(dailyMover, addFinding);
  const findings = [
    ...apiFindings,
    ...scanAudit.findings,
    ...signalAudit.findings,
    ...leaderboardAudit.findings,
    ...dailyMoverAudit.findings,
  ].sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || a.id.localeCompare(b.id));

  const metrics = {
    scan: scanAudit.metrics,
    signals: signalAudit.metrics,
    dailyMover: dailyMoverAudit.metrics,
    endpoints: responses.map(({ endpoint, ok, status, elapsedMs, error }) => ({ endpoint, ok, status, elapsedMs, error })),
  };

  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "summary.md"), reportSummary({ args, generatedAt, metrics, findings, reportDir }), "utf8");
  await writeFile(path.join(reportDir, "findings.json"), JSON.stringify({
    generatedAt,
    baseUrl: args.baseUrl,
    allowedUse: "read_only_radar_backtest_audit",
    guardrail: "本报告只用于验证雷达发现、分层、复盘和展示质量；不自动修改策略、不写数据库、不代表量化收益。",
    metrics,
    findings,
  }, null, 2), "utf8");
  await writeFile(path.join(reportDir, "samples.csv"), toCsv(leaderboardAudit.samples), "utf8");

  console.log(`radar-backtest-audit report: ${reportDir}`);
  console.log(`findings: ${findings.length}`);
  console.log(`critical/high: ${findings.filter((item) => item.severity === "critical" || item.severity === "high").length}`);
  for (const item of findings.slice(0, 8)) {
    console.log(`${item.id} [${item.severity}] ${item.title}`);
  }

  if (apiFindings.some((item) => item.severity === "high" || item.severity === "critical")) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
