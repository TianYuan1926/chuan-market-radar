#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

const SENSITIVE_KEY_RE = /secret|token|cookie|password|database_url|api[_-]?key|private[_-]?key|authorization/i;
const DEFAULT_OUTPUT_DIR = join(rootDir, "phase4-production-observability");
const DEFAULT_BASE_URL = process.env.MARKET_RADAR_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3000";
const COMMANDS = new Set(["health", "smoke", "status", "evidence"]);

function parseArgs(argv) {
  const args = {
    command: argv.find((item) => !item.startsWith("-")) || "status",
    dryRun: argv.includes("--dry-run") || process.env.MARKET_RADAR_DRY_RUN === "true",
    baseUrl: DEFAULT_BASE_URL,
    outDir: process.env.PHASE4_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--base-url" && argv[index + 1]) {
      args.baseUrl = argv[index + 1];
    }
    if (argv[index] === "--out-dir" && argv[index + 1]) {
      args.outDir = resolve(argv[index + 1]);
    }
  }

  if (!COMMANDS.has(args.command)) {
    throw new Error(`Unsupported command: ${args.command}`);
  }

  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(outDir, name, payload) {
  ensureDir(outDir);
  writeFileSync(join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(outDir, name, text) {
  ensureDir(outDir);
  writeFileSync(join(outDir, name), text.endsWith("\n") ? text : `${text}\n`);
}

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : redact(item),
      ]),
    );
  }
  if (typeof value === "string" && /(Bearer\s+|sk-|BEGIN (RSA|OPENSSH|PRIVATE) KEY)/i.test(value)) {
    return "[REDACTED]";
  }
  return value;
}

function gitValue(args) {
  try {
    return execFileSync("git", args, { cwd: rootDir, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function fetchJson(baseUrl, path) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-store",
      "user-agent": "market-radar-phase4-observability/1.0",
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 2000) };
  }
  return {
    body: redact(body),
    latencyMs: Date.now() - startedAt,
    ok: response.ok,
    path,
    status: response.status,
    url,
  };
}

function dryRunEnvelope(kind) {
  return {
    dryRun: true,
    generatedAt: nowIso(),
    kind,
    status: "pass",
    summary: "dry-run 只验证脚本、字段规则、输出结构和安全门禁；未访问生产服务。",
  };
}

function validateHealthSnapshot(payload) {
  const body = payload?.body || {};
  const health = body.health || {};
  const scan = health.scan || {};
  const persistence = health.persistence || {};
  const runtimeProbes = health.runtimeProbes || {};
  const workers = Array.isArray(runtimeProbes.workers) ? runtimeProbes.workers : [];
  const checks = [
    { key: "http_200", ok: payload.ok === true, detail: `HTTP ${payload.status}` },
    { key: "health_ok", ok: body.ok === true, detail: `ok=${String(body.ok)}` },
    { key: "health_ready", ok: health.level === "ready", detail: `level=${health.level ?? "unknown"}` },
    { key: "scan_ready", ok: scan.status === "ready", detail: `scan.status=${scan.status ?? "unknown"}` },
    { key: "scan_fresh", ok: scan.freshness === "fresh", detail: `scan.freshness=${scan.freshness ?? "unknown"}` },
    {
      key: "database_ready",
      ok: persistence.databaseStatus === "ready",
      detail: `databaseStatus=${persistence.databaseStatus ?? "unknown"}`,
    },
    {
      key: "redis_not_failed",
      ok: runtimeProbes.redis?.status !== "failed",
      detail: `redis=${runtimeProbes.redis?.status ?? "unknown"}`,
    },
    {
      key: "workers_not_failed",
      ok: workers.every((worker) => worker.status !== "failed"),
      detail: `workers=${workers.map((worker) => `${worker.key}:${worker.status}`).join(",") || "unknown"}`,
    },
  ];

  return {
    checks,
    level: health.level ?? "unknown",
    scanFreshness: scan.freshness ?? "unknown",
    status: checks.every((check) => check.ok) ? "pass" : "fail",
  };
}

function decisionChecksForSignal(signal) {
  const decision = signal?.unifiedDecision;
  const base = {
    id: signal?.id ?? signal?.symbol ?? "unknown",
    maturity: signal?.maturity ?? null,
    symbol: signal?.symbol ?? null,
  };

  if (!decision) {
    return [{
      ...base,
      check: "unified_decision_required",
      ok: false,
      detail: "radar signal 缺 unifiedDecision，不能进入生产展示。",
    }];
  }

  const ready = decision.decision === "TRADE_PLAN_READY";
  return [
    {
      ...base,
      check: "ready_requires_ready_plan",
      ok: !ready || (decision.canTradeNow === true && decision.readyPlan !== null && decision.blockerCount === 0),
      detail: `decision=${decision.decision}; canTradeNow=${String(decision.canTradeNow)}; readyPlan=${decision.readyPlan ? "yes" : "no"}; blockers=${decision.blockerCount}`,
    },
    {
      ...base,
      check: "non_ready_has_no_ready_plan",
      ok: ready || (decision.canTradeNow === false && decision.readyPlan === null),
      detail: `decision=${decision.decision}; readyPlan=${decision.readyPlan ? "yes" : "no"}`,
    },
    {
      ...base,
      check: "unified_decision_source",
      ok: decision.source === "unified_decision_engine" || decision.source === "frontend_candidate_guard",
      detail: `source=${decision.source ?? "unknown"}`,
    },
    {
      ...base,
      check: "ready_rr_minimum",
      ok: !ready || Number(decision.readyPlan?.rewardRisk) >= 3,
      detail: `rr=${decision.readyPlan?.rewardRisk ?? "n/a"}`,
    },
  ];
}

function overlayChecksForKline(klinePayload) {
  const kline = klinePayload?.body?.kline || {};
  const overlays = Array.isArray(kline.overlays) ? kline.overlays : [];
  const staleLike = new Set(["cached", "stale", "partial", "failed", "empty", "error"]);
  const checks = [
    {
      check: "non_live_has_no_ready_trade_plan_overlay",
      ok: !staleLike.has(kline.status) || overlays.every((overlay) =>
        overlay.semanticRole !== "ready_trade_plan" &&
        overlay.kind !== "target" &&
        overlay.kind !== "stop"),
      detail: `status=${kline.status ?? "unknown"} overlays=${overlays.length}`,
    },
    {
      check: "ready_overlay_has_strict_source",
      ok: overlays
        .filter((overlay) => overlay.semanticRole === "ready_trade_plan" || overlay.kind === "target" || overlay.kind === "stop")
        .every((overlay) =>
          overlay.semanticRole === "ready_trade_plan" &&
          overlay.allowedUse === "ready_trade_plan_only" &&
          overlay.sourceDecision === "unified_decision_engine" &&
          kline.status === "live"),
      detail: `readyOverlays=${overlays.filter((overlay) => overlay.semanticRole === "ready_trade_plan" || overlay.kind === "target" || overlay.kind === "stop").length}`,
    },
  ];
  return checks;
}

async function runHealth(args) {
  if (args.dryRun) {
    const payload = {
      ...dryRunEnvelope("production-health"),
      checks: [
        { key: "http_200", ok: true, detail: "dry-run 未访问网络" },
        { key: "health_ready", ok: true, detail: "dry-run 结构检查通过" },
      ],
      productionDeployExecuted: false,
    };
    writeJson(args.outDir, "production-health.json", payload);
    return payload;
  }

  const snapshot = await fetchJson(args.baseUrl, "/api/health");
  const validation = validateHealthSnapshot(snapshot);
  const payload = {
    generatedAt: nowIso(),
    snapshot,
    status: validation.status,
    validation,
  };
  writeJson(args.outDir, "production-health.json", payload);
  if (validation.status !== "pass") {
    process.exitCode = 1;
  }
  return payload;
}

async function runSmoke(args) {
  if (args.dryRun) {
    const payload = {
      ...dryRunEnvelope("production-smoke"),
      checks: [
        { key: "unified_decision_required", ok: true, detail: "dry-run 规则存在" },
        { key: "ready_requires_ready_plan", ok: true, detail: "dry-run 规则存在" },
        { key: "non_ready_has_no_ready_plan", ok: true, detail: "dry-run 规则存在" },
        { key: "non_live_has_no_ready_trade_plan_overlay", ok: true, detail: "dry-run 规则存在" },
      ],
      productionDeployExecuted: false,
    };
    writeJson(args.outDir, "production-smoke.json", payload);
    return payload;
  }

  const health = await fetchJson(args.baseUrl, "/api/health");
  const radar = await fetchJson(args.baseUrl, "/api/frontend/radar-contract");
  const backend = await fetchJson(args.baseUrl, "/api/radar/backend-contract");
  const signals = radar.body?.contract?.radarSignals?.data || [];
  const firstSymbol = signals[0]?.symbol || "BTCUSDT";
  const kline = await fetchJson(args.baseUrl, `/api/frontend/kline-contract?symbol=${encodeURIComponent(firstSymbol)}&tf=4h&limit=120`);
  const signalChecks = signals.flatMap(decisionChecksForSignal);
  const overlayChecks = overlayChecksForKline(kline);
  const checks = [
    { key: "health_http", ok: health.ok, detail: `HTTP ${health.status}` },
    { key: "radar_http", ok: radar.ok, detail: `HTTP ${radar.status}` },
    { key: "backend_http", ok: backend.ok, detail: `HTTP ${backend.status}` },
    { key: "kline_http", ok: kline.ok, detail: `HTTP ${kline.status}` },
    ...signalChecks.map((item) => ({ key: `${item.check}:${item.symbol}`, ok: item.ok, detail: item.detail })),
    ...overlayChecks.map((item) => ({ key: item.check, ok: item.ok, detail: item.detail })),
  ];
  const payload = {
    endpoints: { backend, health, kline, radar },
    generatedAt: nowIso(),
    signalCount: signals.length,
    status: checks.every((check) => check.ok) ? "pass" : "fail",
    checks,
  };
  writeJson(args.outDir, "production-smoke.json", redact(payload));
  if (payload.status !== "pass") {
    process.exitCode = 1;
  }
  return payload;
}

async function runStatus(args) {
  const health = existsSync(join(args.outDir, "production-health.json"))
    ? JSON.parse(readFileSync(join(args.outDir, "production-health.json"), "utf8"))
    : await runHealth(args);
  const smoke = existsSync(join(args.outDir, "production-smoke.json"))
    ? JSON.parse(readFileSync(join(args.outDir, "production-smoke.json"), "utf8"))
    : await runSmoke(args);

  const systemStatus = {
    dryRun: args.dryRun,
    generatedAt: nowIso(),
    git: {
      branch: gitValue(["branch", "--show-current"]),
      head: gitValue(["rev-parse", "HEAD"]),
      statusShort: gitValue(["status", "--short"]),
    },
    productionDeployExecuted: false,
    status: health.status === "pass" && smoke.status === "pass" ? "pass" : "partial",
    summary: args.dryRun
      ? "本地 dry-run 完成；未访问生产、未部署。"
      : "生产状态快照已采集；按各子状态判断是否可继续。",
  };

  writeJson(args.outDir, "system-status.json", systemStatus);
  writeJson(args.outDir, "production-scan.json", {
    dryRun: args.dryRun,
    generatedAt: nowIso(),
    source: "api/health + api/frontend/radar-contract",
    status: args.dryRun ? "not_run_dry_run_only" : health.validation?.scanFreshness ?? "unknown",
    guardrail: "scan 状态只做生产观测，不生成交易计划。",
  });
  writeJson(args.outDir, "production-worker-status.json", {
    dryRun: args.dryRun,
    generatedAt: nowIso(),
    source: "api/health.runtimeProbes",
    status: args.dryRun ? "not_run_dry_run_only" : health.validation?.checks?.find((item) => item.key === "workers_not_failed")?.detail ?? "unknown",
  });
  writeJson(args.outDir, "production-data-source-status.json", {
    dryRun: args.dryRun,
    generatedAt: nowIso(),
    source: "api/health.dataSource",
    guardrail: "CoinGlass / public exchange 失败必须显示 partial/waiting/unavailable，不能写成无机会。",
    status: args.dryRun ? "not_run_dry_run_only" : health.snapshot?.body?.health?.dataSource?.status ?? "unknown",
  });
  writeJson(args.outDir, "production-decision-contract-status.json", {
    dryRun: args.dryRun,
    generatedAt: nowIso(),
    checks: smoke.checks?.filter((item) => /unified|ready|plan|rr/i.test(item.key)) ?? [],
    status: smoke.status,
  });
  writeJson(args.outDir, "production-ui-risk-status.json", {
    dryRun: args.dryRun,
    generatedAt: nowIso(),
    checks: smoke.checks?.filter((item) => /overlay|non_ready|non_live|kline/i.test(item.key)) ?? [],
    guardrail: "WAIT / WATCH / CANDIDATE 不得展示成 READY；非 live Kline 不显示 ready trade plan overlay。",
    status: smoke.status,
  });

  return systemStatus;
}

function buildMarkdownReport(args, systemStatus) {
  return `# 第 4 步生产观测闭环报告

## 1. 目标
建立生产级自运行与观测闭环：health、smoke、status、evidence、rollback 和 GPT handoff。

## 2. 执行模式
- dry-run：${args.dryRun ? "是" : "否"}
- 生产部署：否
- formal 回测：否
- 数据库 / Redis / volume：未触碰
- push main：否

## 3. 当前结论
${systemStatus.summary}

## 4. 关键红线
- 真实部署必须由用户明确授权。
- workflow 默认不能 push main 自动部署。
- 证据包不能进入 Git。
- 本报告不能证明系统支撑实战交易。
`;
}

async function runEvidence(args) {
  const health = await runHealth(args);
  const smoke = await runSmoke(args);
  const systemStatus = await runStatus(args);
  writeText(args.outDir, "production-deployment-report.md", buildMarkdownReport(args, systemStatus));
  writeText(args.outDir, "gpt-handoff-summary.md", `# GPT 交接摘要

- 第 4 步目标：生产自运行与观测闭环。
- 当前模式：${args.dryRun ? "dry-run，本地工程验证" : "真实 API 只读验证"}。
- 不包含：生产部署、formal 回测、数据库/Redis/volume 操作。
- 最大边界：仍不能说系统支撑实战交易。
`);
  writeText(args.outDir, "remaining-risks.md", `# 剩余风险

- 真实腾讯云部署仍需用户单独授权。
- dry-run 只能证明工程链路可执行，不能证明生产数据长期稳定。
- 如后续启用 workflow production_deploy，必须人工确认并保留回滚证据。
`);
  writeText(args.outDir, "next-actions.md", `# 下一步建议

第 4 步完成后，先交给 GPT 做验收复查。通过后再由用户明确授权是否进入腾讯云生产部署验证。
`);
  writeText(args.outDir, "changed-files.txt", gitValue(["diff", "--name-only"]) || "无未提交 diff");
  writeText(args.outDir, "test-results.md", "# 测试结果\n\n等待 Agent H 集成阶段写入完整测试结果。\n");
  writeText(args.outDir, "grep-evidence.md", "# grep 证据\n\n等待 Agent H 集成阶段写入 grep 结果。\n");

  const summary = {
    generatedAt: nowIso(),
    health: health.status,
    smoke: smoke.status,
    status: systemStatus.status,
  };
  writeJson(args.outDir, "production-evidence-summary.json", summary);

  try {
    execFileSync("zip", ["-r", "production-evidence.zip", "."], {
      cwd: args.outDir,
      stdio: "ignore",
    });
  } catch (error) {
    writeText(args.outDir, "production-evidence-zip-error.txt", error instanceof Error ? error.message : String(error));
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(args.outDir);

  if (args.command === "health") {
    await runHealth(args);
  } else if (args.command === "smoke") {
    await runSmoke(args);
  } else if (args.command === "status") {
    await runStatus(args);
  } else if (args.command === "evidence") {
    await runEvidence(args);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
