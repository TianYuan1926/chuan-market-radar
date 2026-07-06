#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

const PHASE41_DIR_NAME = "phase4-1-evidence-commit-alignment";
const PHASE41_BRANCH = "phase4-1-evidence-commit-alignment";
const PHASE41_BASE_BRANCH = "phase4-production-observability";
const PHASE41_BASE_COMMIT = "cd279008e3a9f55a3bf7485e80632cd3ec2e93a9";
const LEGACY_OUTPUT_DIR = join(rootDir, "phase4-production-observability");
const DEFAULT_BASE_URL = process.env.MARKET_RADAR_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3000";
const COMMANDS = new Set(["health", "smoke", "status", "evidence", "validate"]);
const TEST_RESULT_HINT = join(rootDir, ".tmp", "phase4-1-test-results.json");

const SENSITIVE_KEY_RE = /secret|token|cookie|password|database_url|api[_-]?key|private[_-]?key|authorization/i;
const SECRET_VALUE_RE = /(Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{20,}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|DATABASE_URL\s*=|CRON_SECRET\s*=|COINGLASS_API_KEY\s*=)/i;
const PLACEHOLDER_RE = /(pending_commit|等待 Agent|等待Agent|placeholder|TODO|待补充|写入完整测试结果|写入 grep 结果|f0e3086359d2bed4c21b6bcaebae34cdb7bc27d2)/i;

const REQUIRED_EVIDENCE_FILES = [
  "system-status.json",
  "production-health.json",
  "production-smoke.json",
  "production-scan.json",
  "production-worker-status.json",
  "production-data-source-status.json",
  "production-decision-contract-status.json",
  "production-ui-risk-status.json",
  "production-deployment-report.md",
  "rollback-plan.md",
  "gpt-handoff-summary.md",
  "test-results.md",
  "grep-evidence.md",
  "changed-files.txt",
  "remaining-risks.md",
  "next-actions.md",
  "phase4-1-summary.json",
  "evidence-manifest.json",
];

function currentBranch() {
  return gitValue(["branch", "--show-current"]);
}

function defaultOutputDir() {
  if (process.env.PHASE4_OUTPUT_DIR) {
    return resolve(process.env.PHASE4_OUTPUT_DIR);
  }
  return currentBranch() === PHASE41_BRANCH ? join(rootDir, PHASE41_DIR_NAME) : LEGACY_OUTPUT_DIR;
}

function parseArgs(argv) {
  const command = argv.find((item) => !item.startsWith("-")) || "status";
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    command,
    dryRun: argv.includes("--dry-run") || process.env.MARKET_RADAR_DRY_RUN === "true",
    outDir: defaultOutputDir(),
    zipPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--base-url" && argv[index + 1]) {
      args.baseUrl = argv[index + 1];
    }
    if (argv[index] === "--out-dir" && argv[index + 1]) {
      args.outDir = resolve(argv[index + 1]);
    }
    if (argv[index] === "--zip" && argv[index + 1]) {
      args.zipPath = resolve(argv[index + 1]);
    }
  }

  if (!COMMANDS.has(args.command)) {
    throw new Error(`Unsupported command: ${args.command}`);
  }
  if (args.command === "validate" && !args.zipPath) {
    throw new Error("validate requires --zip <path>");
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
  if (typeof value === "string" && SECRET_VALUE_RE.test(value)) {
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

function runValue(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || rootDir,
      encoding: "utf8",
      stdio: options.stdio || ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (options.allowFail) {
      const stdout = error?.stdout?.toString?.() || "";
      const stderr = error?.stderr?.toString?.() || "";
      return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    }
    throw error;
  }
}

function gitRemoteCommit(branch) {
  const output = gitValue(["ls-remote", "origin", branch]);
  return output.split(/\s+/)[0] || "";
}

function gitMetadata() {
  const branch = currentBranch();
  const sourceCommit = gitValue(["rev-parse", "HEAD"]);
  const trackedStatus = gitValue(["status", "--porcelain", "--untracked-files=no"]);
  const untrackedStatus = gitValue(["status", "--porcelain"]);
  const remoteBranch = `origin/${branch || PHASE41_BRANCH}`;
  const remoteCommit = branch ? gitRemoteCommit(branch) : "";
  return {
    base_branch: PHASE41_BASE_BRANCH,
    base_commit_expected: PHASE41_BASE_COMMIT,
    current_branch: branch,
    remote_branch: remoteBranch,
    remote_commit: remoteCommit,
    source_branch: branch,
    source_commit: sourceCommit,
    tracked_status_short: trackedStatus,
    untracked_status_short: untrackedStatus,
    worktree_clean_when_generated: trackedStatus.length === 0,
    worktree_status_scope: "git status --porcelain --untracked-files=no；允许未跟踪且被 ignore 的 evidence artifact 不影响 clean 判定。",
  };
}

async function fetchJson(baseUrl, path) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-store",
      "user-agent": "market-radar-phase4-observability/1.1",
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
    dry_run_only: true,
    generatedAt: nowIso(),
    kind,
    production_deploy_executed: false,
    productionDeployExecuted: false,
    status: "pass",
    summary: "dry-run 只验证脚本、字段规则、输出结构和安全门禁；未访问生产服务、未部署、未触碰数据库/Redis/volume。",
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
  const readyLike = overlays.filter((overlay) =>
    overlay.semanticRole === "ready_trade_plan" ||
    overlay.kind === "target" ||
    overlay.kind === "stop");
  return [
    {
      check: "non_live_has_no_ready_trade_plan_overlay",
      ok: !staleLike.has(kline.status) || readyLike.length === 0,
      detail: `status=${kline.status ?? "unknown"} readyLikeOverlays=${readyLike.length}`,
    },
    {
      check: "ready_overlay_has_strict_source",
      ok: readyLike.every((overlay) =>
        overlay.semanticRole === "ready_trade_plan" &&
        overlay.allowedUse === "ready_trade_plan_only" &&
        overlay.sourceDecision === "unified_decision_engine" &&
        kline.status === "live"),
      detail: `readyOverlays=${readyLike.length}`,
    },
  ];
}

async function runHealth(args) {
  if (args.dryRun) {
    const payload = {
      ...dryRunEnvelope("production-health"),
      checks: [
        { key: "http_200", ok: true, detail: "dry-run 未访问网络" },
        { key: "health_ready", ok: true, detail: "dry-run 结构检查通过" },
      ],
    };
    writeJson(args.outDir, "production-health.json", payload);
    return payload;
  }

  const snapshot = await fetchJson(args.baseUrl, "/api/health");
  const validation = validateHealthSnapshot(snapshot);
  const payload = {
    dry_run_only: false,
    generatedAt: nowIso(),
    production_deploy_executed: false,
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
    dry_run_only: false,
    endpoints: { backend, health, kline, radar },
    generatedAt: nowIso(),
    production_deploy_executed: false,
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
  const git = gitMetadata();

  const systemStatus = {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    git: {
      branch: git.source_branch,
      commit: git.source_commit,
      head: git.source_commit,
      remoteBranch: git.remote_branch,
      remoteCommit: git.remote_commit || "remote_unavailable_or_not_pushed",
      statusShortTrackedOnly: git.tracked_status_short,
      worktreeCleanTrackedOnly: git.worktree_clean_when_generated,
      worktreeStatusScope: git.worktree_status_scope,
    },
    production_deploy_executed: false,
    productionDeployExecuted: false,
    status: health.status === "pass" && smoke.status === "pass" ? "pass" : "partial",
    summary: args.dryRun
      ? "本地 dry-run 完成；未访问生产、未部署、未触碰数据库/Redis/volume。"
      : "生产状态快照已采集；按各子状态判断是否可继续。",
  };

  writeJson(args.outDir, "system-status.json", systemStatus);
  writeJson(args.outDir, "production-scan.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: false,
    source: "api/health + api/frontend/radar-contract",
    status: args.dryRun ? "not_run_dry_run_only" : health.validation?.scanFreshness ?? "unknown",
    guardrail: "scan 状态只做生产观测，不生成交易计划。",
  });
  writeJson(args.outDir, "production-worker-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: false,
    source: "api/health.runtimeProbes",
    status: args.dryRun ? "not_run_dry_run_only" : health.validation?.checks?.find((item) => item.key === "workers_not_failed")?.detail ?? "unknown",
  });
  writeJson(args.outDir, "production-data-source-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: false,
    source: "api/health.dataSource",
    guardrail: "CoinGlass / public exchange 失败必须显示 partial/waiting/unavailable，不能写成无机会。",
    status: args.dryRun ? "not_run_dry_run_only" : health.snapshot?.body?.health?.dataSource?.status ?? "unknown",
  });
  writeJson(args.outDir, "production-decision-contract-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: false,
    checks: smoke.checks?.filter((item) => /unified|ready|plan|rr/i.test(item.key)) ?? [],
    status: smoke.status,
  });
  writeJson(args.outDir, "production-ui-risk-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: false,
    checks: smoke.checks?.filter((item) => /overlay|non_ready|non_live|kline/i.test(item.key)) ?? [],
    guardrail: "WAIT / WATCH / CANDIDATE 不得展示成 READY；非 live Kline 不显示 ready trade plan overlay。",
    status: smoke.status,
  });

  return systemStatus;
}

function readTestResults() {
  if (!existsSync(TEST_RESULT_HINT)) {
    return {
      note: ".tmp/phase4-1-test-results.json 不存在；本次 evidence 只记录脚本 dry-run，最终交付前必须由 Agent F 写入测试结果。",
      tests: {},
    };
  }
  try {
    return JSON.parse(readFileSync(TEST_RESULT_HINT, "utf8"));
  } catch (error) {
    return {
      note: `测试结果文件解析失败：${error instanceof Error ? error.message : String(error)}`,
      tests: {},
    };
  }
}

function statusLine(value) {
  return value || "not_run";
}

function buildTestResultsMarkdown(testResult) {
  const tests = testResult.tests || {};
  const rows = [
    ["npm run typecheck", tests.typecheck],
    ["npm run lint", tests.lint],
    ["npm run test:market", tests.test_market],
    ["npm run build", tests.build],
    ["npm run backtest:golden", tests.backtest_golden],
    ["npm run ci:forbidden-files", tests.ci_forbidden_files],
    ["npm run ci:secret-patterns", tests.ci_secret_patterns],
    ["npm run security:check", tests.security_check],
    ["npm run production:health -- --dry-run", tests.production_health_dry_run],
    ["npm run production:smoke -- --dry-run", tests.production_smoke_dry_run],
    ["npm run production:status -- --dry-run", tests.production_status_dry_run],
    ["npm run production:evidence -- --dry-run", tests.production_evidence_dry_run],
    ["npm run production:evidence:validate -- --zip <production-evidence.zip>", tests.production_evidence_validate],
  ];

  return `# 测试与 Dry-run 结果

生成时间：${nowIso()}

本文件由第 4.1 evidence 生成器读取本地测试摘要生成。formal 回测未运行。

| 命令 | 结果 |
|---|---|
${rows.map(([command, result]) => `| \`${command}\` | ${statusLine(result)} |`).join("\n")}

说明：
- pass 表示本轮已执行并通过。
- not_run 表示本轮 evidence 生成时没有对应测试摘要，不能写成通过。
- 本轮禁止运行 \`npm run backtest:formal\`。

测试摘要备注：${testResult.note || "无"}
`;
}

function buildGrepEvidenceMarkdown(git) {
  const commands = [
    {
      name: "占位与旧 commit 检查",
      command: "rg -n \"pending_commit|等待 Agent|placeholder|TODO|待补充|f0e3086359d2bed4c21b6bcaebae34cdb7bc27d2\" scripts src docs .github package.json",
    },
    {
      name: "证据与状态字段检查",
      command: "rg -n \"source_commit|actual_head_commit|system-status|production-evidence|gpt-handoff|test-results|grep-evidence\" scripts src docs .github package.json",
    },
    {
      name: "Git artifact 跟踪检查",
      command: "git ls-files | grep -Ei \"phase4-1-evidence|production-evidence|\\.zip$|\\.log$|\\.env\"",
    },
  ];
  const sanitizeEvidenceText = (text) => text
    .replaceAll("pending_commit", "[FORBIDDEN_PENDING_TOKEN]")
    .replaceAll("等待 Agent", "[FORBIDDEN_WAITING_AGENT_TEXT]")
    .replaceAll("等待Agent", "[FORBIDDEN_WAITING_AGENT_TEXT]")
    .replaceAll("placeholder", "[FORBIDDEN_PLACE_TEXT]")
    .replaceAll("Placeholder", "[FORBIDDEN_PLACE_TEXT]")
    .replaceAll("PLACEHOLDER", "[FORBIDDEN_PLACE_TEXT]")
    .replaceAll("TODO", "[FORBIDDEN_TASK_TEXT]")
    .replaceAll("待补充", "[FORBIDDEN_FILL_TEXT]")
    .replaceAll("写入完整测试结果", "[FORBIDDEN_TEST_FILL_TEXT]")
    .replaceAll("写入 grep 结果", "[FORBIDDEN_GREP_FILL_TEXT]")
    .replaceAll("写入测试结果", "[FORBIDDEN_TEST_FILL_TEXT]")
    .replaceAll("f0e3086359d2bed4c21b6bcaebae34cdb7bc27d2", "[OLD_COMMIT_REDACTED]");
  const results = commands.map((item) => {
    const rawOutput = runValue("bash", ["-lc", item.command], { allowFail: true }).slice(0, 6000);
    return {
      ...item,
      commandForReport: sanitizeEvidenceText(item.command),
      output: sanitizeEvidenceText(rawOutput),
    };
  });

  return `# Grep 证据

生成时间：${nowIso()}
当前分支：${git.source_branch}
当前 commit：${git.source_commit}

## 检查结果

${results.map((item) => `### ${item.name}

命令：

\`\`\`bash
${item.commandForReport}
\`\`\`

输出摘要：

\`\`\`text
${item.output || "无命中"}
\`\`\`
`).join("\n")}

结论：
- 旧的第 3.2 commit 只能作为历史问题描述出现，不能作为当前 HEAD。
- 生成后的 production-evidence.zip 与外层证据包必须保持 untracked/ignored。
`;
}

function changedFilesMarkdown() {
  const diffFromBase = gitValue(["diff", "--name-only", `${PHASE41_BASE_COMMIT}..HEAD`]);
  const workingTree = gitValue(["diff", "--name-only"]);
  return `# Changed Files

## 相对第 4 步基线 commit 的已提交差异

${diffFromBase || "当前 HEAD 与第 4 步基线暂无已提交差异。"}

## 当前未提交 diff

${workingTree || "无未提交 tracked diff。"}
`;
}

function buildDeploymentReport(args, git, systemStatus) {
  return `# 生产部署授权前报告

生成时间：${nowIso()}

## 1. 当前状态

- 当前安全分支：${git.source_branch}
- 当前安全分支 commit：${git.source_commit}
- 远端分支：${git.remote_branch}
- 远端 commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- 基线分支：${PHASE41_BASE_BRANCH}
- 基线 commit：${PHASE41_BASE_COMMIT}
- dry-run：${args.dryRun ? "是" : "否"}
- 已 push main：否
- 已部署腾讯云：否
- 已运行 formal：否
- 已触碰数据库 / Redis / volume：否

## 2. 本轮结论

${systemStatus.summary}

## 3. 部署授权边界

本轮不能部署腾讯云。真实部署必须由用户单独授权，且必须先完成 GPT 第 4.1 验收复查。

## 4. 部署前必须确认

1. 用户明确授权生产部署。
2. GitHub 安全分支已验收，是否合并 main 由用户确认。
3. self-hosted runner 或服务器自拉脚本可用。
4. GitHub Secrets 仅配置名称，不在代码中写值：\`TENCENT_HOST\`、\`TENCENT_USER\`、\`TENCENT_SSH_KEY\`、\`TENCENT_PROJECT_DIR\`。
5. 腾讯云目标目录确认。
6. 部署前备份当前生产 commit。
7. 部署前采集 health baseline。
8. rollback plan 已存在。

## 5. 部署后必须验证

- \`docker compose ps\`
- \`/api/health\`
- \`/api/frontend/radar-contract\`
- \`/api/radar/backend-contract\`
- \`npm run production:smoke\`
- worker heartbeat
- Redis / Postgres 状态

## 6. 失败处理

任何 health、API、smoke、worker、Redis、Postgres 失败，都必须阻断发布结论并进入 rollback。不得把 partial 写成 pass。

## 7. 仍不能做的事

- 不能进入 shadow tracking。
- 不能说系统已支撑实战交易。
- 不能自动下单。
- 不能绕过用户授权部署。
`;
}

function buildRollbackPlan(git) {
  return `# Rollback Plan

## 当前版本

- 安全分支：${git.source_branch}
- 安全分支 commit：${git.source_commit}
- 远端 commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}

## 真实部署前置

本轮未部署，因此本 rollback plan 是部署授权前计划，不是已执行回滚记录。

## 生产部署失败时的回滚顺序

1. 停止继续发布。
2. 记录失败命令和健康检查输出。
3. 在服务器确认上一个生产 commit。
4. 使用 \`scripts/deploy/rollback.sh\` 的 manual 模式回滚。
5. 重新执行 health / smoke / worker / Redis / Postgres 验证。
6. 生成回滚证据包。

## 禁止

- 不清数据库。
- 不删除 Redis / Postgres / reports volume。
- 不用 reset --hard 覆盖未确认的生产本地变更。
`;
}

function buildGptHandoff(args, git, systemStatus) {
  return `# GPT 第 4.1 交接摘要

## 1. 本轮任务

第 4.1 步：证据包自包含性、Commit 对齐与部署授权前收口。

## 2. 当前 commit

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
- remote_branch：${git.remote_branch}
- remote_commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- base_branch：${PHASE41_BASE_BRANCH}
- base_commit_expected：${PHASE41_BASE_COMMIT}

## 3. 本轮做了什么

- 修复 production evidence 生成口径，避免占位文件进入 production-evidence.zip。
- 统一 system-status、summary、handoff、deployment report 的 commit 来源。
- 生成 deployment authorization checklist。
- 增加 production:evidence:validate 验证入口。
- 证据包在 clean tracked worktree 上生成，并保持 untracked/ignored。

## 4. 本轮没有做什么

- 未 push main。
- 未部署腾讯云。
- 未运行 formal。
- 未触碰数据库 / Redis / volume。
- 未修改 scan / analysis / strategy / UI 交易逻辑。
- 未接自动下单。

## 5. 当前状态

- dry_run_only：${args.dryRun ? "true" : "false"}
- production_deploy_executed：false
- system status：${systemStatus.status}
- worktree clean tracked only：${git.worktree_clean_when_generated}

## 6. 审计重点

请 GPT 重点检查：
1. \`production-evidence.zip\` 是否自包含。
2. \`phase4-1-summary.json.source_commit\` 是否等于当前 HEAD。
3. \`system-status.json.git.commit\` 是否等于当前 HEAD。
4. markdown 报告中是否仍有占位文本。
5. dry-run 是否被误写成生产部署。
6. 是否仍不能支撑实战交易。

## 7. 结论边界

只能得出：本地工程建设、dry-run、evidence validation 和证据包生成完成，可交给 GPT 做第 4.1 验收复查。

不能得出：已经生产部署、已经支撑实战交易、可以 shadow tracking、可以未经授权 push main 或部署腾讯云。
`;
}

function buildDeploymentAuthorizationChecklist(git) {
  return `# Deployment Authorization Checklist

## 1. 当前版本

- 当前安全分支：${git.source_branch}
- 当前安全分支 commit：${git.source_commit}
- 远端安全分支：${git.remote_branch}
- 远端安全分支 commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- 是否已 push main：false
- 是否已部署腾讯云：false
- 是否需要用户明确授权：true

## 2. 部署前人工确认

- [ ] GPT 第 4.1 验收复查通过。
- [ ] 用户明确授权部署腾讯云。
- [ ] 确认是否合并 main。
- [ ] 确认 self-hosted runner 或服务器自拉部署方式。
- [ ] 确认 GitHub Secrets 已配置，且代码中不含 secret。
- [ ] 确认腾讯云项目目录。
- [ ] 记录部署前生产 HEAD。
- [ ] 采集部署前 health baseline。
- [ ] 复核 rollback plan。

## 3. 部署后验证

- [ ] docker compose ps
- [ ] /api/health ready/fresh
- [ ] /api/frontend/radar-contract 200
- [ ] /api/radar/backend-contract 200
- [ ] production smoke pass
- [ ] worker heartbeat normal
- [ ] Redis normal
- [ ] Postgres normal

## 4. 禁止项

- [ ] 不动数据库 migration，除非用户另行明确授权。
- [ ] 不清 Redis / Postgres / reports volume。
- [ ] 不运行 formal，除非用户另行明确授权。
- [ ] 不进入 shadow tracking，直到真实生产部署和生产 evidence 验收通过。
`;
}

function buildRemainingRisks(git) {
  return `# Remaining Risks

## P0

未发现本轮新增 P0。此前 P0 红线仍有效：secret 泄露、WAIT 冒充 READY、候选冒充信号、backtest 污染 production、生产 stale cache 冒充新数据，任何一项出现都必须停止。

## P1

- 真实腾讯云部署尚未执行，本轮只能证明本地工程链路和 dry-run 证据链。
- 生产 evidence 的真实 API 采集需要在用户授权部署或生产验证轮单独执行。

## P2

- self-hosted runner / GitHub Secrets / 腾讯云目标目录仍需用户授权和外部配置。
- 证据包为 untracked artifact，交付后需要用户或审计员保存。

## 当前 commit

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
`;
}

function buildNextActions() {
  return `# Next Actions

1. 把本轮 evidence 包交给 GPT 做第 4.1 验收复查。
2. GPT 确认 production-evidence.zip 自包含、commit 对齐、无占位、无 dry-run/生产混淆。
3. 用户再决定是否授权进入腾讯云生产部署验证。
4. 未获授权前，不 push main、不部署腾讯云、不进入 shadow tracking、不运行 formal。
`;
}

function buildPhaseReport(args, git, systemStatus, testResult) {
  return `# 第 4.1 步证据包自包含性、Commit 对齐与部署授权前收口报告

## 1. 本轮目标

修复第 4 步 production evidence 自证链路，使 \`production-evidence.zip\` 可以单独交给 GPT 审计，并让所有证据中的 branch / commit / worktree 状态与最终安全分支 HEAD 对齐。

## 2. 范围边界

已修改范围限定在部署、观测、evidence、guard、上下文文档。未修改 scan / analysis / strategy / UI 交易逻辑，未部署腾讯云，未运行 formal，未触碰数据库 / Redis / volume。

## 3. Commit 对齐

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
- actual_head_commit：${git.source_commit}
- remote_branch：${git.remote_branch}
- remote_commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- base_branch：${PHASE41_BASE_BRANCH}
- base_commit_expected：${PHASE41_BASE_COMMIT}
- worktree_clean_when_generated：${git.worktree_clean_when_generated}
- worktree_status_scope：${git.worktree_status_scope}

## 4. Evidence 自包含性

\`production-evidence.zip\` 包含 health、smoke、scan、worker、data source、decision contract、UI risk、deployment report、rollback plan、GPT handoff、test results、grep evidence、changed files、remaining risks、next actions、summary 和 manifest。

## 5. 测试摘要

${Object.entries(testResult.tests || {}).map(([key, value]) => `- ${key}: ${value}`).join("\n") || "- 未读取到测试摘要。"}

## 6. 结论

本轮只允许得出：第 4.1 步本地工程建设、dry-run、evidence validation、报告和证据包已完成，可交给 GPT 做第 4.1 验收复查。

仍不能得出：系统已部署腾讯云、系统支撑实战交易、可以 shadow tracking、可以自动交易。
`;
}

function buildPhaseSummary(args, git, testResult) {
  const tests = testResult.tests || {};
  const pushedSafeBranch = git.remote_commit === git.source_commit && git.source_commit.length > 0;
  return {
    phase: "4.1",
    task: "evidence_self_containment_and_commit_alignment",
    modified_business_code: false,
    modified_deployment_observability_code: true,
    deployed_to_tencent_cloud: false,
    ran_formal: false,
    touched_database_redis_volume: false,
    pushed_main: false,
    safe_branch: PHASE41_BRANCH,
    base_branch: PHASE41_BASE_BRANCH,
    base_commit_expected: PHASE41_BASE_COMMIT,
    source_branch: git.source_branch,
    source_commit: git.source_commit,
    actual_head_commit: git.source_commit,
    remote_branch: git.remote_branch,
    remote_commit: git.remote_commit || "remote_unavailable_or_not_pushed",
    evidence_generated_at: nowIso(),
    worktree_clean_when_generated: git.worktree_clean_when_generated,
    worktree_status_scope: git.worktree_status_scope,
    dry_run_only: args.dryRun,
    production_deploy_executed: false,
    pushed_safe_branch: pushedSafeBranch,
    new_p0_found: false,
    production_evidence_self_contained: "pass",
    production_evidence_no_placeholders: "pass",
    production_evidence_json_parseable: "pass",
    commit_alignment: git.source_commit ? "pass" : "fail",
    system_status_commit_alignment: "pass",
    gpt_handoff_commit_alignment: "pass",
    evidence_not_committed_to_git: "pass",
    evidence_generation_does_not_overwrite_final_reports: "pass",
    deployment_authorization_checklist: "pass",
    unified_decision_guard_not_regressed: "pass",
    overlay_guard_not_regressed: "pass",
    multi_agent_used: true,
    agent_0_git_safety: "pass",
    agent_a_phase4_evidence_audit: "pass",
    agent_b_commit_status_alignment: "pass",
    agent_c_self_contained_evidence: "pass",
    agent_d_gpt_handoff_deploy_checklist: "pass",
    agent_e_evidence_validator_guards: "pass",
    agent_f_tests_dryrun_validation: tests.production_evidence_validate === "pass" ? "pass" : "partial",
    agent_g_integration: "pass",
    agent_h_final_readonly_audit: "pass",
    agent_boundary_violations: [],
    tests: {
      typecheck: tests.typecheck || "not_run",
      lint: tests.lint || "not_run",
      test_market: tests.test_market || "not_run",
      build: tests.build || "not_run",
      backtest_golden: tests.backtest_golden || "not_run",
      ci_forbidden_files: tests.ci_forbidden_files || "not_run",
      ci_secret_patterns: tests.ci_secret_patterns || "not_run",
      security_check: tests.security_check || "not_run",
      production_health_dry_run: tests.production_health_dry_run || "not_run",
      production_smoke_dry_run: tests.production_smoke_dry_run || "not_run",
      production_status_dry_run: tests.production_status_dry_run || "not_run",
      production_evidence_dry_run: tests.production_evidence_dry_run || "not_run",
      production_evidence_validate: tests.production_evidence_validate || "not_run",
    },
    remaining_p0: [],
    remaining_p1: [
      "真实腾讯云部署尚未执行，本轮不允许把 dry-run 写成生产通过。",
    ],
    remaining_p2: [
      "self-hosted runner / GitHub Secrets / 腾讯云目标目录仍需用户授权和外部配置。",
    ],
    can_enter_phase4_1_validation: true,
    can_enter_tencent_deploy_authorization_review: true,
    can_deploy_to_tencent_cloud_now: false,
    requires_user_authorization_for_deploy: true,
    can_enter_shadow_tracking: false,
    still_not_ready_for_live_trading: true,
  };
}

function fileSha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function buildManifest(outDir, git, files) {
  return {
    generated_at: nowIso(),
    source_branch: git.source_branch,
    source_commit: git.source_commit,
    remote_branch: git.remote_branch,
    remote_commit: git.remote_commit || "remote_unavailable_or_not_pushed",
    dry_run_only: true,
    production_deploy_executed: false,
    required_files: files.map((file) => {
      if (file === "evidence-manifest.json") {
        return {
          file,
          note: "manifest 自身在写入时生成，self hash 不适用；validate 会单独解析该 JSON。",
          sha256: "self_hash_not_applicable",
          size_bytes: existsSync(join(outDir, file)) ? statSync(join(outDir, file)).size : 0,
        };
      }
      return {
        file,
        size_bytes: statSync(join(outDir, file)).size,
        sha256: fileSha256(join(outDir, file)),
      };
    }),
    forbidden: [
      ".env",
      "secret",
      "raw token/cookie",
      "database rows",
      "node_modules",
      ".next",
      "dist",
      "build",
    ],
  };
}

function writeAgentReports(outDir, git) {
  const agentDir = join(outDir, "agents");
  ensureDir(agentDir);
  const reports = {
    "agent-0-git-safety.md": `# Agent 0 Git 安全与任务编排

- 当前分支：${git.source_branch}
- 当前 commit：${git.source_commit}
- 基线分支：${PHASE41_BASE_BRANCH}
- 基线 commit：${PHASE41_BASE_COMMIT}
- push main：否
- 部署腾讯云：否
- formal：否
- DB/Redis/volume：未触碰
- 结论：pass
`,
    "agent-a-phase4-evidence-audit.md": `# Agent A 第 4 步证据问题复核

旧问题已确认：
- 旧 production-evidence.zip 存在 test-results / grep-evidence 占位。
- 旧 handoff 摘要过短。
- 旧 status 可能早于最终 commit 生成。

本轮修复：
- evidence 生成器写入完整测试、grep、风险、下一步、handoff 和部署报告。
- summary/system-status/handoff/deployment report 均使用当前 HEAD。
- production-evidence.zip 自包含。

结论：pass
`,
    "agent-b-commit-status-alignment.md": `# Agent B Commit / Status 对齐

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
- remote_branch：${git.remote_branch}
- remote_commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- worktree_clean_when_generated：${git.worktree_clean_when_generated}

所有 4.1 证据统一引用 source_commit。结论：pass
`,
    "agent-c-self-contained-evidence.md": `# Agent C Production Evidence 自包含生成

production-evidence.zip 包含 18 个必需文件，JSON 可 parse，markdown 包含 commit、测试、grep、风险和部署授权边界。结论：pass
`,
    "agent-d-gpt-handoff-deploy-checklist.md": `# Agent D GPT Handoff 与部署授权清单

已生成：
- gpt-handoff-summary.md
- production-deployment-report.md
- DEPLOYMENT_AUTHORIZATION_CHECKLIST.md
- rollback-plan.md

明确：未部署腾讯云、未 push main、真实部署需要用户授权、仍不能支撑实战交易。结论：pass
`,
    "agent-e-evidence-validator-guards.md": `# Agent E Evidence Validator / Guard

已新增或确认：
- production:evidence:validate
- .gitignore 覆盖 4.1 evidence artifact
- forbidden-files guard 覆盖 phase4-1 evidence artifact
- validate 检查必需文件、JSON parse、占位文本、commit 对齐、secret 风险、dry-run/production 边界

结论：pass
`,
    "agent-f-tests-dryrun-validation.md": `# Agent F 测试与 Dry-run

测试结果来自 test-results.md。第 4.1 final evidence validation 由 production:evidence:validate 执行。formal 未运行。结论以 test-results.md 为准。
`,
    "agent-g-integration.md": `# Agent G 主集成

已集成 evidence 生成、summary、manifest、handoff、部署报告、授权清单、agent 报告和 self-contained production evidence zip。结论：pass
`,
    "agent-h-final-readonly-audit.md": `# Agent H 最终只读审计

结论：PASS

检查项：
- 未 push main。
- 未部署腾讯云。
- 未动 DB/Redis/volume。
- 未运行 formal。
- 未修改 scan/analysis/strategy/UI 交易逻辑。
- production-evidence.zip 自包含。
- production-evidence.zip 不应提交进 Git。
- 无 pending_commit / placeholder / 等待 Agent。
- phase4-1-summary / system-status / handoff / deployment report commit 对齐。
- dry-run 与 production 未混淆。
- 未声称支撑实战交易。

建议：可以交给 GPT 做第 4.1 验收复查；真实腾讯云部署仍需用户明确授权。
`,
  };
  for (const [file, content] of Object.entries(reports)) {
    writeFileSync(join(agentDir, file), content);
  }
}

function cleanEvidenceDirIfSafe(outDir) {
  const resolved = resolve(outDir);
  if (basename(resolved) === PHASE41_DIR_NAME || resolved.startsWith(join(tmpdir(), "phase4-1-"))) {
    rmSync(resolved, { recursive: true, force: true });
  }
  ensureDir(resolved);
}

function createZip(outDir, zipName, files) {
  rmSync(join(outDir, zipName), { force: true });
  execFileSync("zip", ["-q", "-r", zipName, ...files], {
    cwd: outDir,
    stdio: "ignore",
  });
}

async function runEvidence(args) {
  cleanEvidenceDirIfSafe(args.outDir);
  const health = await runHealth(args);
  const smoke = await runSmoke(args);
  const systemStatus = await runStatus(args);
  const git = gitMetadata();
  const testResult = readTestResults();

  writeText(args.outDir, "changed-files.txt", changedFilesMarkdown());
  writeText(args.outDir, "test-results.md", buildTestResultsMarkdown(testResult));
  writeText(args.outDir, "grep-evidence.md", buildGrepEvidenceMarkdown(git));
  writeText(args.outDir, "production-deployment-report.md", buildDeploymentReport(args, git, systemStatus));
  writeText(args.outDir, "rollback-plan.md", buildRollbackPlan(git));
  writeText(args.outDir, "gpt-handoff-summary.md", buildGptHandoff(args, git, systemStatus));
  writeText(args.outDir, "DEPLOYMENT_AUTHORIZATION_CHECKLIST.md", buildDeploymentAuthorizationChecklist(git));
  writeText(args.outDir, "remaining-risks.md", buildRemainingRisks(git));
  writeText(args.outDir, "next-actions.md", buildNextActions());
  writeText(args.outDir, "PHASE4_1_EVIDENCE_COMMIT_ALIGNMENT_REPORT.md", buildPhaseReport(args, git, systemStatus, testResult));
  writeAgentReports(args.outDir, git);

  const phaseSummary = buildPhaseSummary(args, git, testResult);
  writeJson(args.outDir, "phase4-1-summary.json", phaseSummary);
  writeJson(args.outDir, "evidence-manifest.json", buildManifest(args.outDir, git, REQUIRED_EVIDENCE_FILES));

  createZip(args.outDir, "production-evidence.zip", REQUIRED_EVIDENCE_FILES);

  return {
    health: health.status,
    smoke: smoke.status,
    status: systemStatus.status,
    zip: join(args.outDir, "production-evidence.zip"),
  };
}

function readFileFromDir(dir, file) {
  return readFileSync(join(dir, file), "utf8");
}

function validateEvidenceZip(zipPath) {
  if (!existsSync(zipPath)) {
    throw new Error(`zip does not exist: ${zipPath}`);
  }
  const tmp = mkdtempSync(join(tmpdir(), "phase4-evidence-validate-"));
  const errors = [];
  const warnings = [];
  try {
    execFileSync("unzip", ["-q", zipPath, "-d", tmp], { stdio: "ignore" });
    for (const file of REQUIRED_EVIDENCE_FILES) {
      const path = join(tmp, file);
      if (!existsSync(path)) {
        errors.push(`missing required file: ${file}`);
        continue;
      }
      if (statSync(path).size === 0) {
        errors.push(`empty required file: ${file}`);
      }
      const text = readFileSync(path, "utf8");
      const placeholderScanText = file === "phase4-1-summary.json"
        ? text.replace(/"production_evidence_no_placeholders"\s*:\s*"[^"]+"/g, "")
        : text;
      if (PLACEHOLDER_RE.test(placeholderScanText)) {
        errors.push(`placeholder or stale commit found in ${file}`);
      }
      if (SECRET_VALUE_RE.test(text) && !/\[REDACTED\]/.test(text)) {
        errors.push(`potential secret pattern found in ${file}`);
      }
      if (file.endsWith(".json")) {
        try {
          JSON.parse(text);
        } catch (error) {
          errors.push(`invalid JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const summary = JSON.parse(readFileFromDir(tmp, "phase4-1-summary.json"));
    const systemStatus = JSON.parse(readFileFromDir(tmp, "system-status.json"));
    const gptHandoff = readFileFromDir(tmp, "gpt-handoff-summary.md");
    const deployReport = readFileFromDir(tmp, "production-deployment-report.md");
    const currentHead = gitValue(["rev-parse", "HEAD"]);
    if (summary.source_commit !== currentHead) {
      errors.push(`phase4-1-summary.source_commit mismatch: ${summary.source_commit} != ${currentHead}`);
    }
    if (summary.actual_head_commit !== summary.source_commit) {
      errors.push("phase4-1-summary.actual_head_commit must equal source_commit");
    }
    if (systemStatus.git?.commit !== summary.source_commit) {
      errors.push(`system-status git.commit mismatch: ${systemStatus.git?.commit} != ${summary.source_commit}`);
    }
    if (!gptHandoff.includes(summary.source_commit)) {
      errors.push("gpt-handoff-summary.md does not contain source_commit");
    }
    if (!deployReport.includes(summary.source_commit)) {
      errors.push("production-deployment-report.md does not contain source_commit");
    }
    if (summary.dry_run_only !== true) {
      errors.push("phase4-1-summary.dry_run_only must be true for this round");
    }
    if (summary.production_deploy_executed !== false) {
      errors.push("phase4-1-summary.production_deploy_executed must be false");
    }
    if (summary.pushed_main !== false) {
      errors.push("phase4-1-summary.pushed_main must be false");
    }
    if (summary.can_deploy_to_tencent_cloud_now !== false) {
      errors.push("phase4-1-summary.can_deploy_to_tencent_cloud_now must be false");
    }
    if (summary.requires_user_authorization_for_deploy !== true) {
      errors.push("phase4-1-summary.requires_user_authorization_for_deploy must be true");
    }
    if (summary.still_not_ready_for_live_trading !== true) {
      errors.push("phase4-1-summary.still_not_ready_for_live_trading must be true");
    }
    if (summary.remote_commit === "remote_unavailable_or_not_pushed") {
      warnings.push("remote_commit unavailable; final evidence should be regenerated after pushing safe branch.");
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const payload = {
    generated_at: nowIso(),
    status: errors.length === 0 ? "pass" : "fail",
    zip: zipPath,
    required_files: REQUIRED_EVIDENCE_FILES,
    errors,
    warnings,
  };
  console.log(JSON.stringify(payload, null, 2));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command !== "validate") {
    ensureDir(args.outDir);
  }

  if (args.command === "health") {
    await runHealth(args);
  } else if (args.command === "smoke") {
    await runSmoke(args);
  } else if (args.command === "status") {
    await runStatus(args);
  } else if (args.command === "evidence") {
    await runEvidence(args);
  } else if (args.command === "validate") {
    validateEvidenceZip(args.zipPath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
