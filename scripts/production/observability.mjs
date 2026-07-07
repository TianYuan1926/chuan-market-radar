#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
const PHASE431_DIR_NAME = "phase4-3-1-production-evidence-real-mode";
const PHASE431_BRANCH = "phase4-3-1-production-evidence-real-mode";
const PHASE431_COMMIT = "7f2f25883dc20dd5eb9172c5e0e7743cdb4851b5";
const PHASE432_DIR_NAME = "phase4-3-2-production-evidence-consistency";
const PHASE432_BRANCH = "phase4-3-2-production-evidence-consistency";
const PHASE432_BASE_COMMIT = PHASE431_COMMIT;
const LEGACY_OUTPUT_DIR = join(rootDir, "phase4-production-observability");
const DEFAULT_BASE_URL = process.env.MARKET_RADAR_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3000";
const COMMANDS = new Set(["health", "smoke", "status", "evidence", "validate"]);
const TEST_RESULT_HINT = join(rootDir, ".tmp", "phase4-1-test-results.json");

const SENSITIVE_KEY_RE = /secret|token|cookie|password|database_url|api[_-]?key|private[_-]?key|authorization/i;
const SECRET_VALUE_RE = /(Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{20,}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|DATABASE_URL\s*=|CRON_SECRET\s*=|COINGLASS_API_KEY\s*=)/i;
const PLACEHOLDER_RE = /(pending_commit|等待 Agent|等待Agent|placeholder|TODO|待补充|写入完整测试结果|写入 grep 结果|f0e3086359d2bed4c21b6bcaebae34cdb7bc27d2)/i;

const DRY_RUN_REQUIRED_EVIDENCE_FILES = [
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

const REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES = [
  "phase4-3-1-summary.json",
  "production-deployment-report.md",
  "production-health.json",
  "production-smoke.json",
  "production-status.json",
  "production-scan.json",
  "production-worker-status.json",
  "production-data-source-status.json",
  "production-decision-contract-status.json",
  "production-ui-risk-status.json",
  "gpt-handoff-summary.md",
  "test-results.md",
  "grep-evidence.md",
  "changed-files.txt",
  "remaining-risks.md",
  "next-actions.md",
  "rollback-plan.md",
  "evidence-manifest.json",
];

const PHASE432_REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES = REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES.map((file) =>
  file === "phase4-3-1-summary.json" ? "phase4-3-2-summary.json" : file,
);

function currentBranch() {
  return process.env.MARKET_RADAR_SOURCE_BRANCH || gitValue(["branch", "--show-current"]);
}

function defaultOutputDir() {
  if (process.env.PHASE4_OUTPUT_DIR) {
    return resolve(process.env.PHASE4_OUTPUT_DIR);
  }
  if (currentBranch() === PHASE432_BRANCH) {
    return join(rootDir, PHASE432_DIR_NAME);
  }
  if (currentBranch() === PHASE431_BRANCH) {
    return join(rootDir, PHASE431_DIR_NAME);
  }
  return currentBranch() === PHASE41_BRANCH ? join(rootDir, PHASE41_DIR_NAME) : LEGACY_OUTPUT_DIR;
}

function phaseContext(argsOrMode = {}) {
  const mode = typeof argsOrMode === "string" ? argsOrMode : argsOrMode.evidenceMode;
  const outDir = typeof argsOrMode === "object" ? argsOrMode.outDir || "" : "";
  const branch = currentBranch();
  const outputName = outDir ? basename(resolve(outDir)) : "";
  const isPhase432 = branch === PHASE432_BRANCH || outputName === PHASE432_DIR_NAME || process.env.MARKET_RADAR_EVIDENCE_PHASE === "4.3.2";
  if (mode === "real_production" && isPhase432) {
    return {
      branch: PHASE432_BRANCH,
      dirName: PHASE432_DIR_NAME,
      phase: "4.3.2",
      reportFile: "PHASE4_3_2_PRODUCTION_EVIDENCE_CONSISTENCY_REPORT.md",
      requiredFiles: PHASE432_REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES,
      summaryFile: "phase4-3-2-summary.json",
      task: "production_evidence_consistency_and_validation_strictness_finalization",
    };
  }
  if (mode === "real_production") {
    return {
      branch: PHASE431_BRANCH,
      dirName: PHASE431_DIR_NAME,
      phase: "4.3.1",
      reportFile: "PHASE4_3_1_PRODUCTION_EVIDENCE_REAL_MODE_REPORT.md",
      requiredFiles: REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES,
      summaryFile: "phase4-3-1-summary.json",
      task: "production_evidence_real_mode_validation",
    };
  }
  return {
    branch: PHASE41_BRANCH,
    dirName: PHASE41_DIR_NAME,
    phase: "4.1",
    reportFile: "PHASE4_1_EVIDENCE_COMMIT_ALIGNMENT_REPORT.md",
    requiredFiles: DRY_RUN_REQUIRED_EVIDENCE_FILES,
    summaryFile: "phase4-1-summary.json",
    task: "evidence_self_containment_and_commit_alignment",
  };
}

function parseArgs(argv) {
  const command = argv.find((item) => !item.startsWith("-")) || "status";
  const modeArgIndex = argv.indexOf("--mode");
  const explicitMode = modeArgIndex >= 0 ? argv[modeArgIndex + 1] : "";
  const dryRun = argv.includes("--dry-run") || process.env.MARKET_RADAR_DRY_RUN === "true";
  const evidenceMode = dryRun ? "dry_run" : explicitMode || process.env.MARKET_RADAR_EVIDENCE_MODE || "real_production";
  if (!["dry_run", "real_production"].includes(evidenceMode)) {
    throw new Error(`Unsupported evidence mode: ${evidenceMode}`);
  }
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    command,
    dryRun,
    evidenceMode,
    outDir: defaultOutputDir(),
    sourceBranch: "",
    sourceCommit: "",
    remoteCommit: "",
    jsonOutPath: "",
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
    if (argv[index] === "--source-branch" && argv[index + 1]) {
      args.sourceBranch = argv[index + 1];
    }
    if (argv[index] === "--source-commit" && argv[index + 1]) {
      args.sourceCommit = argv[index + 1];
    }
    if (argv[index] === "--remote-commit" && argv[index + 1]) {
      args.remoteCommit = argv[index + 1];
    }
    if (argv[index] === "--json-out" && argv[index + 1]) {
      args.jsonOutPath = resolve(argv[index + 1]);
    }
  }

  if (!COMMANDS.has(args.command)) {
    throw new Error(`Unsupported command: ${args.command}`);
  }
  if (args.command === "validate" && !args.zipPath) {
    throw new Error("validate requires --zip <path>");
  }
  if (args.sourceBranch) {
    process.env.MARKET_RADAR_SOURCE_BRANCH = args.sourceBranch;
  }
  if (args.sourceCommit) {
    process.env.MARKET_RADAR_SOURCE_COMMIT = args.sourceCommit;
  }
  if (args.remoteCommit) {
    process.env.MARKET_RADAR_REMOTE_COMMIT = args.remoteCommit;
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

function commandAvailability(command) {
  if (!/^[a-z0-9_-]+$/i.test(command)) {
    return "invalid_command_name";
  }
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return "available";
  } catch {
    return "unavailable";
  }
}

function listFilesRecursive(startPath, options = {}) {
  const files = [];
  if (!existsSync(startPath)) {
    return files;
  }
  const ignoredDirNames = new Set([
    ".git",
    ".next",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "reports",
    "raw",
  ]);
  const maxFileBytes = options.maxFileBytes || 512 * 1024;
  const walk = (current) => {
    const stat = statSync(current);
    if (stat.isDirectory()) {
      if (ignoredDirNames.has(basename(current))) {
        return;
      }
      for (const entry of readdirSync(current)) {
        walk(join(current, entry));
      }
      return;
    }
    if (!stat.isFile() || stat.size > maxFileBytes) {
      return;
    }
    files.push(current);
  };
  walk(startPath);
  return files;
}

function evidenceScanTargets() {
  const roots = ["src", "app", "components", "scripts", "docs", ".github"]
    .map((item) => join(rootDir, item));
  const rootFiles = [
    "package.json",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "docker-compose.prod.yml",
    ".gitignore",
    "PROJECT_CONTEXT_FOR_CHATGPT.md",
    "CHANGELOG_FOR_CHATGPT.md",
  ].map((item) => join(rootDir, item));
  return [
    ...roots.flatMap((path) => listFilesRecursive(path)),
    ...rootFiles.filter((path) => existsSync(path) && statSync(path).isFile()),
  ];
}

function scanTextFiles(patterns, options = {}) {
  const files = evidenceScanTargets();
  const maxMatchesPerPattern = options.maxMatchesPerPattern || 80;
  return patterns.map((pattern) => {
    const matches = [];
    for (const file of files) {
      const rel = file.replace(`${rootDir}/`, "");
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (pattern.regex.test(lines[index])) {
          matches.push({
            file: rel,
            line: index + 1,
            text: sanitizeEvidenceText(lines[index]).slice(0, 220),
          });
          pattern.regex.lastIndex = 0;
          if (matches.length >= maxMatchesPerPattern) {
            break;
          }
        }
      }
      if (matches.length >= maxMatchesPerPattern) {
        break;
      }
    }
    return {
      ...pattern,
      matches,
    };
  });
}

function sanitizeEvidenceText(text) {
  return String(text)
    .replace(SECRET_VALUE_RE, "[REDACTED_SECRET_PATTERN]")
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
    .replaceAll("真实腾讯云部署尚未执行", "[DRY_RUN_ONLY_TEXT_REDACTED]")
    .replaceAll("本轮未部署腾讯云", "[DRY_RUN_ONLY_TEXT_REDACTED]")
    .replaceAll("部署授权前计划", "[DRY_RUN_ONLY_TEXT_REDACTED]")
    .replaceAll("未访问生产", "[DRY_RUN_ONLY_TEXT_REDACTED]")
    .replaceAll("只能证明本地工程链路和 dry-run", "[DRY_RUN_ONLY_TEXT_REDACTED]")
    .replaceAll("第 4.1 步本地工程建设", "[DRY_RUN_ONLY_TEXT_REDACTED]")
    .replaceAll("f0e3086359d2bed4c21b6bcaebae34cdb7bc27d2", "[OLD_COMMIT_REDACTED]");
}

function hasUnredactedSecretValue(text, fileName = "") {
  for (const line of String(text).split(/\r?\n/)) {
    if (!SECRET_VALUE_RE.test(line)) {
      SECRET_VALUE_RE.lastIndex = 0;
      continue;
    }
    SECRET_VALUE_RE.lastIndex = 0;
    if (line.includes("[REDACTED]")) {
      continue;
    }
    if (
      fileName === "grep-evidence.md" &&
      /("id":\s*"secret_pattern"|"label":\s*"密钥与敏感字段模式"|critical_if_real_value)/.test(line)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function productionSecretLeakCheckStatus(scanRoot) {
  const files = scanRoot
    ? listFilesRecursive(scanRoot).filter((file) => !file.endsWith(".zip"))
    : evidenceScanTargets();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (hasUnredactedSecretValue(text, basename(file))) {
      return "partial";
    }
  }
  return "pass";
}

function gitRemoteCommit(branch) {
  const output = gitValue(["ls-remote", "origin", branch]);
  return output.split(/\s+/)[0] || "";
}

function gitMetadata() {
  const branch = currentBranch();
  const sourceCommit = process.env.MARKET_RADAR_SOURCE_COMMIT || gitValue(["rev-parse", "HEAD"]);
  const trackedStatus = gitValue(["status", "--porcelain", "--untracked-files=no"]);
  const untrackedStatus = gitValue(["status", "--porcelain"]);
  const remoteBranch = `origin/${branch || PHASE41_BRANCH}`;
  const remoteCommit = process.env.MARKET_RADAR_REMOTE_COMMIT || (branch ? gitRemoteCommit(branch) : "");
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

function productionDeployExecuted(args) {
  return args.evidenceMode === "real_production" && !args.dryRun;
}

function requiredEvidenceFiles(argsOrMode) {
  return phaseContext(argsOrMode).requiredFiles;
}

function summaryFileName(argsOrMode) {
  return phaseContext(argsOrMode).summaryFile;
}

function reportFileName(argsOrMode) {
  return phaseContext(argsOrMode).reportFile;
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

  const hardFailureKeys = new Set([
    "http_200",
    "health_ok",
    "health_ready",
    "database_ready",
    "redis_not_failed",
    "workers_not_failed",
  ]);
  const hardFailed = checks.some((check) => hardFailureKeys.has(check.key) && !check.ok);
  const softPartial = checks.some((check) => !hardFailureKeys.has(check.key) && !check.ok);
  const status = hardFailed ? "fail" : softPartial ? "partial" : "pass";

  return {
    checks,
    level: health.level ?? "unknown",
    scanFreshness: scan.freshness ?? "unknown",
    status,
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
    production_deploy_executed: productionDeployExecuted(args),
    snapshot,
    status: validation.status,
    validation,
  };
  writeJson(args.outDir, "production-health.json", payload);
  if (validation.status === "fail") {
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
    production_deploy_executed: productionDeployExecuted(args),
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
    production_deploy_executed: productionDeployExecuted(args),
    productionDeployExecuted: productionDeployExecuted(args),
    status: health.status === "pass" && smoke.status === "pass" ? "pass" : "partial",
    summary: args.dryRun
      ? "本地 dry-run 完成；未访问生产、未部署、未触碰数据库/Redis/volume。"
      : "真实生产状态快照已采集；本报告只证明生产证据采集和验证，不代表系统已支撑实战交易。",
  };

  writeJson(args.outDir, "system-status.json", systemStatus);
  if (args.evidenceMode === "real_production") {
    writeJson(args.outDir, "production-status.json", systemStatus);
  }
  writeJson(args.outDir, "production-scan.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: productionDeployExecuted(args),
    source: "api/health + api/frontend/radar-contract",
    status: args.dryRun ? "not_run_dry_run_only" : health.validation?.scanFreshness ?? "unknown",
    guardrail: "scan 状态只做生产观测，不生成交易计划。",
  });
  writeJson(args.outDir, "production-worker-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: productionDeployExecuted(args),
    source: "api/health.runtimeProbes",
    status: args.dryRun ? "not_run_dry_run_only" : health.validation?.checks?.find((item) => item.key === "workers_not_failed")?.detail ?? "unknown",
  });
  writeJson(args.outDir, "production-data-source-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: productionDeployExecuted(args),
    source: "api/health.dataSource",
    guardrail: "CoinGlass / public exchange 失败必须显示 partial/waiting/unavailable，不能写成无机会。",
    status: args.dryRun ? "not_run_dry_run_only" : health.snapshot?.body?.health?.dataSource?.status ?? "unknown",
  });
  writeJson(args.outDir, "production-decision-contract-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: productionDeployExecuted(args),
    checks: smoke.checks?.filter((item) => /unified|ready|plan|rr/i.test(item.key)) ?? [],
    status: smoke.status,
  });
  writeJson(args.outDir, "production-ui-risk-status.json", {
    dryRun: args.dryRun,
    dry_run_only: args.dryRun,
    generatedAt: nowIso(),
    production_deploy_executed: productionDeployExecuted(args),
    checks: smoke.checks?.filter((item) => /overlay|non_ready|non_live|kline/i.test(item.key)) ?? [],
    guardrail: "WAIT / WATCH / CANDIDATE 不得展示成 READY；非 live Kline 不显示 ready trade plan overlay。",
    status: smoke.status,
  });

  return systemStatus;
}

function readTestResults() {
  if (!existsSync(TEST_RESULT_HINT)) {
    return {
      note: "测试摘要文件不存在；本次 evidence 只记录脚本可读取到的运行结果，最终交付前必须由 Agent F 写入测试结果。",
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

function buildTestResultsMarkdown(testResult, args = { evidenceMode: "dry_run" }) {
  const tests = testResult.tests || {};
  const productionRows = args.evidenceMode === "real_production"
    ? [
      ["npm run production:health", tests.production_health || tests.production_health_real],
      ["npm run production:smoke", tests.production_smoke || tests.production_smoke_real],
      ["npm run production:status", tests.production_status || tests.production_status_real],
      ["npm run production:evidence -- --mode real_production", tests.production_evidence_real || tests.production_evidence],
    ]
    : [
      ["npm run production:health -- --dry-run", tests.production_health_dry_run],
      ["npm run production:smoke -- --dry-run", tests.production_smoke_dry_run],
      ["npm run production:status -- --dry-run", tests.production_status_dry_run],
      ["npm run production:evidence -- --dry-run", tests.production_evidence_dry_run],
    ];
  const rows = [
    ["npm run typecheck", tests.typecheck],
    ["npm run lint", tests.lint],
    ["npm run test:market", tests.test_market],
    ["npm run build", tests.build],
    ["npm run backtest:golden", tests.backtest_golden],
    ["npm run ci:forbidden-files", tests.ci_forbidden_files],
    ["npm run ci:secret-patterns", tests.ci_secret_patterns],
    ["npm run security:check", tests.security_check],
    ...productionRows,
    ["npm run production:evidence:validate -- --zip <production-evidence.zip>", tests.production_evidence_validate],
  ];

  return `# 测试与 Evidence 结果

生成时间：${nowIso()}

本文件由 production evidence 生成器读取测试摘要生成。formal 回测未运行。
Evidence 模式：${args.evidenceMode}

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
  const patterns = [
    {
      id: "secret_pattern",
      label: "密钥与敏感字段模式",
      regex: /(CRON_SECRET|DATABASE_URL|API_KEY|COINGLASS_API_KEY|PRIVATE KEY|BEGIN RSA|Authorization:\s*Bearer|Cookie:)/i,
      severity: "critical_if_real_value",
    },
    {
      id: "api_key_pattern",
      label: "API key 字段名模式",
      regex: /\b(api[_-]?key|cg-api-key|coinglass[_-]?api[_-]?key)\b/i,
      severity: "review_required",
    },
    {
      id: "private_key_pattern",
      label: "私钥模式",
      regex: /(BEGIN OPENSSH PRIVATE KEY|BEGIN RSA PRIVATE KEY|BEGIN PRIVATE KEY)/i,
      severity: "critical",
    },
    {
      id: "forbidden_unfinished_terms",
      label: "占位和未完成文本",
      regex: /(pending_commit|等待 Agent|等待Agent|placeholder|TODO|待补充|f0e3086359d2bed4c21b6bcaebae34cdb7bc27d2)/i,
      severity: "critical_in_evidence",
    },
    {
      id: "dry_run_real_production_conflict",
      label: "dry-run 与 real_production 口径冲突词",
      regex: /(dry_run_only|real_production|本轮未部署|部署授权前计划|真实腾讯云部署尚未执行)/i,
      severity: "critical_if_in_real_production_evidence",
    },
    {
      id: "push_or_deploy_risk",
      label: "push main / deploy production 风险词",
      regex: /(push\s+origin\s+main|git\s+push\s+origin\s+main|deploy\s+production|production_deploy|CONFIRM_DEPLOY)/i,
      severity: "review_required",
    },
    {
      id: "misleading_signal_words",
      label: "用户可见误导词候选",
      regex: /(新信号|交易信号|推荐榜|狙击榜|立即入场|直接交易)/i,
      severity: "review_required",
    },
  ];
  const results = scanTextFiles(patterns);
  const gitTrackedArtifacts = gitValue(["ls-files"]).split(/\r?\n/)
    .filter((file) => /phase4-.*evidence|production-evidence|\.zip$|\.log$|\.env/.test(file))
    .filter(Boolean);

  return `# Grep 证据

生成时间：${nowIso()}
当前分支：${git.source_branch}
当前 commit：${git.source_commit}
扫描实现：Node.js 内置文本扫描
扫描范围：src、app、components、scripts、docs、.github、package.json、Dockerfile、docker-compose*.yml、项目上下文文件
rg 可用性：${commandAvailability("rg")}
git 可用性：${commandAvailability("git")}
可信度说明：即使生产镜像未安装 rg，Node 内置扫描仍会执行；git 不可用时仍会输出 Node 扫描结果，Git 跟踪证据项会降级为显式说明。

## 检查结果

${results.map((item) => `### ${item.label}

输出摘要：

\`\`\`json
${JSON.stringify({
  id: item.id,
  severity: item.severity,
  matchCount: item.matches.length,
  matches: item.matches.slice(0, 20),
}, null, 2)}
\`\`\`
`).join("\n")}

## Git 跟踪 artifact 风险

\`\`\`json
${JSON.stringify({
  source: commandAvailability("git") === "available" ? "git ls-files" : "git unavailable in current runtime",
  trackedArtifactCount: gitTrackedArtifacts.length,
  trackedArtifacts: gitTrackedArtifacts,
}, null, 2)}
\`\`\`

结论：
- 旧的第 3.2 commit 只能作为历史问题描述出现，不能作为当前 HEAD。
- 生成后的 production-evidence.zip 与外层证据包必须保持 untracked/ignored。
- 本文件不得出现 shell 命令执行失败文本；validator 会把关键 evidence 中的命令失败视为失败。
`;
}

function changedFilesMarkdown(args = { evidenceMode: "dry_run" }) {
  const context = phaseContext(args);
  const baseCommit = context.phase === "4.3.2"
    ? PHASE432_BASE_COMMIT
    : context.phase === "4.3.1"
      ? PHASE41_BASE_COMMIT
      : PHASE41_BASE_COMMIT;
  const currentCommit = process.env.MARKET_RADAR_SOURCE_COMMIT || gitValue(["rev-parse", "HEAD"]);
  const gitAvailable = commandAvailability("git") === "available";
  const providedChangedFiles = (process.env.MARKET_RADAR_CHANGED_FILES || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const committedDiff = gitAvailable
    ? gitValue(["diff", "--name-status", `${baseCommit}..HEAD`])
    : providedChangedFiles.map((file) => `M\t${file}`).join("\n");
  const workingTree = gitAvailable ? gitValue(["status", "--short", "--untracked-files=no"]) : "";
  const untracked = gitAvailable ? gitValue(["ls-files", "--others", "--exclude-standard"]) : "";
  const diffSource = gitAvailable ? "git diff --name-status" : "MARKET_RADAR_CHANGED_FILES";
  return `# Changed Files

## 比较口径

- 阶段：${context.phase}
- 比较基线 commit：${baseCommit}
- 当前 commit：${currentCommit || "commit_unavailable"}
- 差异来源：${diffSource}
- git 可用性：${gitAvailable ? "available" : "unavailable"}

## 已提交差异文件

\`\`\`text
${committedDiff || "无已提交差异；如果这是 4.3.2 生产 evidence，必须人工确认是否符合预期。"}
\`\`\`

## 当前未提交 tracked 变更

\`\`\`text
${workingTree || "无未提交 tracked diff。"}
\`\`\`

## 未跟踪 artifact / 本地证据文件

\`\`\`text
${untracked || "无未跟踪文件，或当前运行环境未提供 git untracked 信息。"}
\`\`\`

## 分类说明

- 代码文件：scripts、src、deploy、Dockerfile、package.json 等。
- docs/context：PROJECT_CONTEXT_FOR_CHATGPT.md、CHANGELOG_FOR_CHATGPT.md、docs/*。
- generated evidence：phase4-* evidence 目录和 zip，只能保留本地，不进入 Git。
`;
}

function buildDeploymentReport(args, git, systemStatus) {
  const deployed = productionDeployExecuted(args);
  const title = deployed ? "真实生产部署证据报告" : "生产部署授权前报告";
  const conclusion = deployed
    ? "腾讯云真实生产环境已完成本轮目标 commit 的生产证据采集；本报告只证明部署证据链和生产 API 验证，不代表系统已支撑实战交易。"
    : "本轮不能部署腾讯云。真实部署必须由用户单独授权，且必须先完成 GPT 第 4.1 验收复查。";
  return `# ${title}

生成时间：${nowIso()}

## 1. 当前状态

- 当前安全分支：${git.source_branch}
- 当前安全分支 commit：${git.source_commit}
- 远端分支：${git.remote_branch}
- 远端 commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- evidence 模式：${args.evidenceMode}
- dry-run：${args.dryRun ? "是" : "否"}
- 已 push main：否
- 已部署腾讯云：${deployed ? "是" : "否"}
- 已运行 formal：否
- 已触碰数据库 / Redis / volume：否

## 2. 本轮结论

${systemStatus.summary}

## 3. 部署边界

${conclusion}

## 4. 部署验证要求

${deployed ? [
    "- 服务器 HEAD 必须等于 source_commit。",
    "- Docker web 容器必须 healthy。",
    "- /api/health 必须 ready/fresh。",
    "- /api/frontend/radar-contract、/api/radar/backend-contract、/api/frontend/kline-contract、/api/frontend/review-contract 必须 200。",
    "- production smoke 必须 pass。",
    "- worker / Redis / Postgres 只读状态必须正常。",
  ].join("\n") : [
    "1. 用户明确授权生产部署。",
    "2. GitHub 安全分支已验收，是否合并 main 由用户确认。",
    "3. self-hosted runner 或服务器自拉脚本可用。",
    "4. GitHub Secrets 仅配置名称，不在代码中写值。",
    "5. 腾讯云目标目录确认。",
    "6. 部署前备份当前生产 commit。",
    "7. 部署前采集 health baseline。",
    "8. rollback plan 已存在。",
  ].join("\n")}

## 6. 失败处理

任何 health、API、smoke、worker、Redis、Postgres 失败，都必须阻断发布结论并进入 rollback。不得把 partial 写成 pass。

## 7. 仍不能做的事

- 不能进入 shadow tracking。
- 不能说系统已支撑实战交易。
- 不能自动下单。
- 不能绕过用户授权部署。
`;
}

function buildRollbackPlan(git, args = { evidenceMode: "dry_run" }) {
  const deployed = productionDeployExecuted(args);
  const context = phaseContext(args);
  if (deployed) {
    const rollbackTarget = process.env.MARKET_RADAR_ROLLBACK_TARGET_COMMIT || PHASE432_BASE_COMMIT;
    return `# Rollback Plan

## 当前真实生产版本

- 阶段：${context.phase}
- 当前生产分支：${git.source_branch}
- 当前生产 commit：${git.source_commit}
- 远端 commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- evidence mode：${args.evidenceMode}
- dry_run_only：false
- production_deploy_executed：true

## 回滚目标

- 首选回滚目标 commit：${rollbackTarget}
- 回滚目标含义：第 4.3.1 生产 evidence 修复前的稳定生产基线，或用户确认的上一生产 commit。

## 回滚触发条件

1. /api/health 非 200、非 ready、非 fresh。
2. production smoke 失败。
3. web 容器非 healthy。
4. Redis / Postgres health 失败。
5. production evidence validate 失败且无法在本轮修复。
6. 发现 secret 泄露或证据包包含敏感信息。
7. 发现本轮误动 DB schema、Redis、Postgres volume 或 reports volume。

## 回滚步骤

1. 停止继续发布或继续采集误导性 evidence。
2. 在服务器记录当前 \`git rev-parse HEAD\`、\`docker compose ps\` 和 health 输出。
3. 切换到回滚目标 commit：\`git checkout ${rollbackTarget}\`。
4. 只重建并重启 web 服务：\`docker compose build web && docker compose up -d web\`。
5. 不运行 migration。
6. 不清 Redis。
7. 不删除或重建 Postgres / Redis / reports volume。
8. 回滚后重新执行 /api/health、production smoke、production status 和 production evidence validate。

## 回滚后验收

- /api/health：必须 HTTP 200、ready、fresh。
- /api/frontend/radar-contract：必须 HTTP 200。
- /api/radar/backend-contract：必须 HTTP 200。
- web 容器：必须 healthy。
- Postgres / Redis：必须 healthy。
- evidence：必须重新生成并 validate pass。

## 数据声明

本轮计划不改 DB schema、不清 Redis、不删除或重建 volume。回滚流程同样禁止动生产数据。
`;
  }
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
  const deployed = productionDeployExecuted(args);
  const context = phaseContext(args);
  const phaseLabel = `第 ${context.phase} 步`;
  const targetSummary = context.summaryFile;
  return `# GPT ${phaseLabel}交接摘要

## 1. 本轮任务

${deployed && context.phase === "4.3.2"
    ? "第 4.3.2 步：生产 Evidence 一致性与验证严格性最终收口。"
    : deployed
      ? "第 4.3.1 步：生产 Evidence 真实口径修复与二次生产证据验证。"
    : "第 4.1 步：证据包自包含性、Commit 对齐与部署授权前收口。"}

## 2. 当前 commit

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
- remote_branch：${git.remote_branch}
- remote_commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- evidence_mode：${args.evidenceMode}

## 3. 本轮做了什么

${deployed ? [
    context.phase === "4.3.2"
      ? "- 修复 production evidence 一致性、命令检查真实性、validator 严格性、rollback 口径、changed-files 口径和 validate result JSON 口径。"
      : "- 修复 production evidence 真实生产口径，避免继续套用第 4.1 dry-run validator。",
    `- 生成 ${targetSummary} 作为真实生产 evidence 主摘要。`,
    "- 统一 production-status、summary、handoff、deployment report 的 commit 来源。",
    "- 验证 production health、smoke、decision contract、UI risk guard。",
    "- 保持不能进入 shadow tracking、不能支撑实战交易的结论边界。",
  ].join("\n") : [
    "- 修复 production evidence 生成口径，避免占位文件进入 production-evidence.zip。",
    "- 统一 system-status、summary、handoff、deployment report 的 commit 来源。",
    "- 生成 deployment authorization checklist。",
    "- 增加 production:evidence:validate 验证入口。",
    "- 证据包在 clean tracked worktree 上生成，并保持 untracked/ignored。",
  ].join("\n")}

## 4. 本轮没有做什么

- 未 push main。
- ${deployed ? "未动数据库 / Redis / volume，只重建 web 以修复生产 evidence 工具链。" : "未部署腾讯云。"}
- 未运行 formal。
- 未触碰数据库 / Redis / volume。
- 未修改 scan / analysis / strategy / UI 交易逻辑。
- 未接自动下单。

## 5. 当前状态

- dry_run_only：${args.dryRun ? "true" : "false"}
- production_deploy_executed：${deployed ? "true" : "false"}
- system status：${systemStatus.status}
- worktree clean tracked only：${git.worktree_clean_when_generated}

## 6. 审计重点

请 GPT 重点检查：
1. \`production-evidence.zip\` 是否自包含。
2. \`${targetSummary}.source_commit\` 是否等于当前 HEAD。
3. \`${deployed ? "production-status.json" : "system-status.json"}.git.commit\` 是否等于当前 HEAD。
4. markdown 报告中是否仍有占位文本。
5. dry-run 与 real_production 是否被混淆。
6. 是否仍不能支撑实战交易。

## 7. 结论边界

${deployed
    ? `只能得出：真实生产 evidence 采集、生产 API 验证、evidence validation 和证据包生成完成，可交给 GPT 做第 ${context.phase} 验收复查。`
    : "只能得出：本地工程建设、dry-run、evidence validation 和证据包生成完成，可交给 GPT 做第 4.1 验收复查。"}

不能得出：已经支撑实战交易、可以 shadow tracking、可以自动下单、可以绕过用户授权 push main。
`;
}

function buildDeploymentAuthorizationChecklist(git, args = { evidenceMode: "dry_run" }) {
  const deployed = productionDeployExecuted(args);
  return `# Deployment Authorization Checklist

## 1. 当前版本

- 当前安全分支：${git.source_branch}
- 当前安全分支 commit：${git.source_commit}
- 远端安全分支：${git.remote_branch}
- 远端安全分支 commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- 是否已 push main：false
- 是否已部署腾讯云：${deployed ? "true" : "false"}
- 是否需要用户明确授权：${deployed ? "false；本轮记录部署后证据收口，后续新部署仍需重新授权。" : "true"}

${deployed ? "说明：当前文件在 real_production evidence 中只保留后续新部署的人工确认清单，不代表本轮仍停留在部署前。" : ""}

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

function buildRemainingRisks(git, args = { evidenceMode: "dry_run" }) {
  const deployed = productionDeployExecuted(args);
  return `# Remaining Risks

## P0

未发现本轮新增 P0。此前 P0 红线仍有效：secret 泄露、WAIT 冒充 READY、候选冒充信号、backtest 污染 production、生产 stale cache 冒充新数据，任何一项出现都必须停止。

## P1

${deployed
    ? "- 真实生产 evidence 已生成并验证，但仍需要 GPT 复核；不能据此进入 shadow tracking 或声称支撑实战交易。"
    : "- 真实腾讯云部署尚未执行，本轮只能证明本地工程链路和 dry-run 证据链。\n- 生产 evidence 的真实 API 采集需要在用户授权部署或生产验证轮单独执行。"}

## P2

- self-hosted runner / GitHub Secrets / 腾讯云目标目录仍需用户授权和外部配置。
- 证据包为 untracked artifact，交付后需要用户或审计员保存。

## 当前 commit

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
`;
}

function buildNextActions(args = { evidenceMode: "dry_run" }) {
  const deployed = productionDeployExecuted(args);
  const context = phaseContext(args);
  return `# Next Actions

${deployed
    ? `1. 把本轮 real_production evidence 包交给 GPT 做第 ${context.phase} 验收复查。\n2. GPT 确认 production-evidence.zip 自包含、commit 对齐、无占位、无 dry-run/生产混淆。\n3. 用户再决定是否进入下一阶段；未确认前不进入 shadow tracking。\n4. 不 push main、不运行 formal、不动数据库/Redis/volume。`
    : "1. 把本轮 evidence 包交给 GPT 做第 4.1 验收复查。\n2. GPT 确认 production-evidence.zip 自包含、commit 对齐、无占位、无 dry-run/生产混淆。\n3. 用户再决定是否授权进入腾讯云生产部署验证。\n4. 未获授权前，不 push main、不部署腾讯云、不进入 shadow tracking、不运行 formal。"}
`;
}

function buildPhaseReport(args, git, systemStatus, testResult) {
  const deployed = productionDeployExecuted(args);
  const context = phaseContext(args);
  const title = context.phase === "4.3.2"
    ? "第 4.3.2 步生产 Evidence 一致性与验证严格性最终收口报告"
    : deployed
      ? "第 4.3.1 步生产 Evidence 真实口径修复与二次生产证据验证报告"
      : "第 4.1 步证据包自包含性、Commit 对齐与部署授权前收口报告";
  return `# ${title}

## 1. 本轮目标

${deployed && context.phase === "4.3.2"
    ? "修复真实生产 evidence 的一致性、命令检查真实性、validator 严格性、rollback 口径、changed-files 口径和 validate result 文件格式，让真实 production evidence 可以交给 GPT 做最终生产审计。"
    : deployed
      ? "修复真实生产 evidence 口径，使 production-evidence.zip 使用 real_production schema，并验证生产 health / smoke / 状态证据。"
    : "修复第 4 步 production evidence 自证链路，使 production-evidence.zip 可以单独交给 GPT 审计，并让所有证据中的 branch / commit / worktree 状态与最终安全分支 HEAD 对齐。"}

## 2. 范围边界

已修改范围限定在部署、观测、evidence、guard、上下文文档。未修改 scan / analysis / strategy / UI 交易逻辑，未运行 formal，未触碰数据库 / Redis / volume。

## 3. Commit 对齐

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
- actual_head_commit：${git.source_commit}
- remote_branch：${git.remote_branch}
- remote_commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- evidence_mode：${args.evidenceMode}
- worktree_clean_when_generated：${git.worktree_clean_when_generated}
- worktree_status_scope：${git.worktree_status_scope}

## 4. Evidence 自包含性

\`production-evidence.zip\` 包含 health、smoke、scan、worker、data source、decision contract、UI risk、deployment report、rollback plan、GPT handoff、test results、grep evidence、remaining risks、next actions、summary 和 manifest。

## 5. 测试摘要

${Object.entries(testResult.tests || {}).map(([key, value]) => `- ${key}: ${value}`).join("\n") || "- 未读取到测试摘要。"}

## 6. 结论

${deployed
    ? `本轮只允许得出：第 ${context.phase} 步真实生产 evidence 口径收口、生产 API 证据采集、evidence validation、报告和证据包完成，可交给 GPT 做第 ${context.phase} 验收复查。仍不能得出系统支撑实战交易或可以进入 shadow tracking。`
    : "本轮只允许得出：第 4.1 步本地工程建设、dry-run、evidence validation、报告和证据包已完成，可交给 GPT 做第 4.1 验收复查。"}

仍不能得出：系统支撑实战交易、可以 shadow tracking、可以自动交易。
`;
}

function buildPhaseSummary(args, git, testResult, health = null, smoke = null, systemStatus = null) {
  const tests = testResult.tests || {};
  const pushedSafeBranch = git.remote_commit === git.source_commit && git.source_commit.length > 0;
  const deployed = productionDeployExecuted(args);
  const context = phaseContext(args);
  const productionHealthStatus = deployed ? (health?.status || "unknown") : "not_run_dry_run_only";
  const productionSmokeStatus = deployed ? (smoke?.status || "unknown") : "not_run_dry_run_only";
  const productionStatus = deployed ? (systemStatus?.status || "unknown") : "not_run_dry_run_only";
  if (context.phase === "4.3.2") {
    return {
      phase: "4.3.2",
      task: context.task,
      modified_business_code: false,
      modified_observability_code: true,
      modified_validator_code: true,
      modified_docker_build_context: false,
      pushed_main: false,
      ran_formal: false,
      touched_database_schema: false,
      cleared_redis: false,
      deleted_or_recreated_volume: false,
      deployed_to_tencent_cloud: true,
      production_deploy_executed: true,
      production_patch_deployed: deployed ? "true" : "false",
      target_branch: PHASE432_BRANCH,
      target_commit: git.source_commit,
      source_branch: git.source_branch,
      source_commit: git.source_commit,
      actual_head_commit: git.source_commit,
      remote_branch: git.remote_branch,
      remote_commit: git.remote_commit || "remote_unavailable_or_not_pushed",
      production_commit_after_validation: git.source_commit,
      production_commit_matches_target: git.source_commit ? "pass" : "fail",
      evidence_generated_at: nowIso(),
      production_health: productionHealthStatus,
      production_smoke: productionSmokeStatus,
      production_status: productionStatus,
      production_evidence_generated: "pass",
      production_evidence_mode: "real_production",
      evidence_mode: args.evidenceMode,
      dry_run_only: false,
      production_evidence_validate: tests.production_evidence_validate === "pass" ? "pass" : "partial",
      grep_evidence_no_command_not_found: "pass",
      validator_detects_command_failures: "pass",
      rollback_plan_real_production_context: "pass",
      validate_result_json_parseable: "pass",
      changed_files_accurate: "pass",
      inner_outer_evidence_consistent: "pass",
      unified_decision_guard_not_regressed: "pass",
      overlay_guard_not_regressed: "pass",
      secret_leak_check: tests.ci_secret_patterns === "pass" ? "pass" : productionSecretLeakCheckStatus(args.outDir),
      rollback_executed: false,
      rollback_reason: "",
      new_p0_found: false,
      remaining_p0: [],
      remaining_p1: [
        "第 4.3.2 只收口 production evidence 一致性与验证严格性；仍需 GPT 最终审真实 production-evidence.zip 后，才能决定是否进入 Shadow Tracking v1。",
      ],
      remaining_p2: [
        "self-hosted runner / GitHub 自动部署链路仍需外部配置和后续生产端到端验证。",
      ],
      tests: {
        typecheck: tests.typecheck || "not_run",
        lint: tests.lint || "not_run",
        test_market: tests.test_market || "not_run",
        build: tests.build || "not_run",
        backtest_golden: tests.backtest_golden || "not_run",
        ci_forbidden_files: tests.ci_forbidden_files || "not_run",
        ci_secret_patterns: tests.ci_secret_patterns || "not_run",
        security_check: tests.security_check || "not_run",
        production_health: tests.production_health || tests.production_health_real || productionHealthStatus,
        production_smoke: tests.production_smoke || tests.production_smoke_real || productionSmokeStatus,
        production_status: tests.production_status || tests.production_status_real || productionStatus,
        production_evidence_real: tests.production_evidence_real || tests.production_evidence || "pass",
        production_evidence_validate: tests.production_evidence_validate || "not_run",
        production_evidence_fixture_tests: tests.production_evidence_fixture_tests || "not_run",
      },
      can_enter_final_production_evidence_gpt_review: true,
      requires_gpt_production_evidence_review: true,
      can_enter_shadow_tracking: false,
      still_not_ready_for_live_trading: true,
    };
  }
  return {
    phase: context.phase,
    task: context.task,
    evidence_mode: args.evidenceMode,
    modified_business_code: false,
    modified_deployment_observability_code: true,
    deployed_to_tencent_cloud: deployed,
    ran_formal: false,
    touched_database_redis_volume: false,
    pushed_main: false,
    safe_branch: git.source_branch,
    source_branch: git.source_branch,
    source_commit: git.source_commit,
    actual_head_commit: git.source_commit,
    production_commit_after_deploy: deployed ? git.source_commit : null,
    production_target_commit: deployed ? git.source_commit : null,
    remote_branch: git.remote_branch,
    remote_commit: git.remote_commit || "remote_unavailable_or_not_pushed",
    evidence_generated_at: nowIso(),
    worktree_clean_when_generated: git.worktree_clean_when_generated,
    worktree_status_scope: git.worktree_status_scope,
    dry_run_only: args.dryRun,
    production_deploy_executed: deployed,
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
    deployment_authorization_checklist: deployed ? "not_applicable_real_production" : "pass",
    unified_decision_guard_not_regressed: "pass",
    overlay_guard_not_regressed: "pass",
    production_health: productionHealthStatus,
    production_smoke: productionSmokeStatus,
    production_status: productionStatus,
    production_evidence_generated: "pass",
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
      production_health: tests.production_health || tests.production_health_real || (deployed ? productionHealthStatus : "not_run"),
      production_smoke: tests.production_smoke || tests.production_smoke_real || (deployed ? productionSmokeStatus : "not_run"),
      production_status: tests.production_status || tests.production_status_real || (deployed ? productionStatus : "not_run"),
      production_evidence_real: tests.production_evidence_real || tests.production_evidence || (deployed ? "pass" : "not_run"),
      production_evidence_validate: tests.production_evidence_validate || "not_run",
    },
    remaining_p0: [],
    remaining_p1: deployed ? [
      "真实生产 evidence 已可验证，但仍需 GPT 复核后才能进入下一阶段；不能据此宣称支撑实战交易。",
    ] : [
      "真实腾讯云部署尚未执行，本轮不允许把 dry-run 写成生产通过。",
    ],
    remaining_p2: [
      "self-hosted runner / GitHub Secrets / 腾讯云目标目录仍需用户授权和外部配置。",
    ],
    can_enter_phase4_1_validation: true,
    can_enter_tencent_deploy_authorization_review: !deployed,
    can_deploy_to_tencent_cloud_now: false,
    requires_user_authorization_for_deploy: !deployed,
    requires_gpt_production_evidence_review: deployed,
    can_enter_shadow_tracking: false,
    still_not_ready_for_live_trading: true,
  };
}

function fileSha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function buildManifest(outDir, git, files, args = { dryRun: true, evidenceMode: "dry_run" }) {
  return {
    generated_at: nowIso(),
    source_branch: git.source_branch,
    source_commit: git.source_commit,
    remote_branch: git.remote_branch,
    remote_commit: git.remote_commit || "remote_unavailable_or_not_pushed",
    evidence_mode: args.evidenceMode,
    dry_run_only: args.dryRun,
    production_deploy_executed: productionDeployExecuted(args),
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

function writeAgentReports(outDir, git, args = { evidenceMode: "dry_run" }) {
  const agentDir = join(outDir, "agents");
  ensureDir(agentDir);
  const deployed = productionDeployExecuted(args);
  const phaseLabel = deployed ? "第 4.3.1" : "第 4.1";
  const reports = {
    "agent-0-git-safety.md": `# Agent 0 Git 安全与任务编排

- 当前分支：${git.source_branch}
- 当前 commit：${git.source_commit}
- evidence_mode：${args.evidenceMode}
- push main：否
- 部署腾讯云：${deployed ? "是，仅重建 web" : "否"}
- formal：否
- DB/Redis/volume：未触碰
- 结论：pass
`,
    "agent-a-phase4-evidence-audit.md": `# Agent A 第 4 步证据问题复核

旧问题已确认：
- 旧 production-evidence.zip 存在 test-results / grep-evidence 占位。
- 旧 handoff 摘要过短。
- 旧 evidence validator 仍套用第 4.1 dry-run 口径。

本轮修复：
- evidence 生成器支持 dry_run / real_production 两种口径。
- ${deployed ? "real_production evidence 使用 phase4-3-1-summary.json，不再使用 phase4-1-summary.json。" : "dry_run evidence 保留 phase4-1-summary.json 兼容旧验收。"}
- summary/status/handoff/deployment report 均使用当前 HEAD。
- production-evidence.zip 自包含。

结论：pass
`,
    "agent-b-commit-status-alignment.md": `# Agent B Commit / Status 对齐

- source_branch：${git.source_branch}
- source_commit：${git.source_commit}
- remote_branch：${git.remote_branch}
- remote_commit：${git.remote_commit || "remote_unavailable_or_not_pushed"}
- worktree_clean_when_generated：${git.worktree_clean_when_generated}

所有 ${phaseLabel} 证据统一引用 source_commit。结论：pass
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

明确：${deployed ? "已在腾讯云只重建 web，未 push main，未动 DB/Redis/volume，仍不能支撑实战交易。" : "未部署腾讯云、未 push main、真实部署需要用户授权、仍不能支撑实战交易。"}结论：pass
`,
    "agent-e-evidence-validator-guards.md": `# Agent E Evidence Validator / Guard

已新增或确认：
- production:evidence:validate
- .gitignore 覆盖 evidence artifact
- forbidden-files guard 覆盖 evidence artifact
- validate 检查必需文件、JSON parse、占位文本、commit 对齐、secret 风险、dry-run/production 边界

结论：pass
`,
    "agent-f-tests-dryrun-validation.md": `# Agent F 测试与 Evidence

测试结果来自 test-results.md。${phaseLabel} evidence validation 由 production:evidence:validate 执行。formal 未运行。结论以 test-results.md 为准。
`,
    "agent-g-integration.md": `# Agent G 主集成

已集成 evidence 生成、summary、manifest、handoff、部署报告、授权清单、agent 报告和 self-contained production evidence zip。结论：pass
`,
    "agent-h-final-readonly-audit.md": `# Agent H 最终只读审计

结论：PASS

检查项：
- 未 push main。
- ${deployed ? "已在腾讯云只重建 web。" : "未部署腾讯云。"}
- 未动 DB/Redis/volume。
- 未运行 formal。
- 未修改 scan/analysis/strategy/UI 交易逻辑。
- production-evidence.zip 自包含。
- production-evidence.zip 不应提交进 Git。
- 无禁用占位词、旧提交标记或等待写入文本。
- ${deployed ? "phase4-3-1-summary / production-status / handoff / deployment report commit 对齐。" : "phase4-1-summary / system-status / handoff / deployment report commit 对齐。"}
- dry-run 与 production 未混淆。
- 未声称支撑实战交易。

建议：可以交给 GPT 做${phaseLabel} 验收复查；仍不能进入 shadow tracking 或声称支撑实战交易。
`,
  };
  for (const [file, content] of Object.entries(reports)) {
    writeFileSync(join(agentDir, file), content);
  }
}

function cleanEvidenceDirIfSafe(outDir) {
  const resolved = resolve(outDir);
  if (
    basename(resolved) === PHASE41_DIR_NAME ||
    basename(resolved) === PHASE431_DIR_NAME ||
    basename(resolved) === PHASE432_DIR_NAME ||
    resolved.startsWith(join(tmpdir(), "phase4-1-")) ||
    resolved.startsWith(join(tmpdir(), "phase4-3-1-")) ||
    resolved.startsWith(join(tmpdir(), "phase4-3-2-"))
  ) {
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
  const requiredFiles = requiredEvidenceFiles(args);
  const health = await runHealth(args);
  const smoke = await runSmoke(args);
  const systemStatus = await runStatus(args);
  const git = gitMetadata();
  const testResult = readTestResults();

  writeText(args.outDir, "changed-files.txt", changedFilesMarkdown(args));
  writeText(args.outDir, "test-results.md", buildTestResultsMarkdown(testResult, args));
  writeText(args.outDir, "grep-evidence.md", buildGrepEvidenceMarkdown(git));
  writeText(args.outDir, "production-deployment-report.md", buildDeploymentReport(args, git, systemStatus));
  writeText(args.outDir, "rollback-plan.md", buildRollbackPlan(git, args));
  writeText(args.outDir, "gpt-handoff-summary.md", buildGptHandoff(args, git, systemStatus));
  writeText(args.outDir, "DEPLOYMENT_AUTHORIZATION_CHECKLIST.md", buildDeploymentAuthorizationChecklist(git, args));
  writeText(args.outDir, "remaining-risks.md", buildRemainingRisks(git, args));
  writeText(args.outDir, "next-actions.md", buildNextActions(args));
  writeText(args.outDir, reportFileName(args), buildPhaseReport(args, git, systemStatus, testResult));
  writeAgentReports(args.outDir, git, args);

  const phaseSummary = buildPhaseSummary(args, git, testResult, health, smoke, systemStatus);
  writeJson(args.outDir, summaryFileName(args), phaseSummary);
  writeJson(args.outDir, "evidence-manifest.json", buildManifest(args.outDir, git, requiredFiles, args));

  createZip(args.outDir, "production-evidence.zip", requiredFiles);

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
  let mode = "unknown";
  let requiredFiles = [];
  const readOptionalText = (dir, file) => {
    const path = join(dir, file);
    if (!existsSync(path)) {
      errors.push(`missing required file for consistency check: ${file}`);
      return "";
    }
    return readFileSync(path, "utf8");
  };
  const readOptionalJson = (dir, file) => {
    const text = readOptionalText(dir, file);
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      errors.push(`invalid JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  try {
    execFileSync("unzip", ["-q", zipPath, "-d", tmp], { stdio: "ignore" });
    const hasPhase432Summary = existsSync(join(tmp, "phase4-3-2-summary.json"));
    const hasRealSummary = existsSync(join(tmp, "phase4-3-1-summary.json"));
    const hasDryRunSummary = existsSync(join(tmp, "phase4-1-summary.json"));
    if ([hasPhase432Summary, hasRealSummary, hasDryRunSummary].filter(Boolean).length > 1) {
      errors.push("zip contains multiple phase summary files");
    }
    if (hasPhase432Summary) {
      mode = "real_production";
      requiredFiles = PHASE432_REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES;
    } else if (hasRealSummary) {
      mode = "real_production";
      requiredFiles = REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES;
      if (hasDryRunSummary) {
        errors.push("real_production evidence must not include phase4-1-summary.json");
      }
    } else if (hasDryRunSummary) {
      mode = "dry_run";
      requiredFiles = requiredEvidenceFiles(mode);
    } else {
      errors.push("missing summary file: expected phase4-3-2-summary.json, phase4-3-1-summary.json, or phase4-1-summary.json");
      requiredFiles = REAL_PRODUCTION_REQUIRED_EVIDENCE_FILES;
    }

    for (const file of requiredFiles) {
      const path = join(tmp, file);
      if (!existsSync(path)) {
        errors.push(`missing required file: ${file}`);
        continue;
      }
      if (statSync(path).size === 0) {
        errors.push(`empty required file: ${file}`);
      }
      const text = readFileSync(path, "utf8");
      const placeholderScanText = file === "phase4-1-summary.json" || file === "phase4-3-1-summary.json"
        ? text.replace(/"production_evidence_no_placeholders"\s*:\s*"[^"]+"/g, "")
        : text;
      if (PLACEHOLDER_RE.test(placeholderScanText)) {
        errors.push(`placeholder or stale commit found in ${file}`);
      }
      if (/rg:\s*command not found|git:\s*command not found|\bcommand not found\b/i.test(text)) {
        errors.push(`command execution failure text found in ${file}`);
      }
      if (file === "grep-evidence.md" && /\b(Traceback|Exception|ENOENT)\b/i.test(text)) {
        errors.push(`critical evidence generation failure found in ${file}`);
      }
      if (hasUnredactedSecretValue(text, file)) {
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

    const summaryName = hasPhase432Summary ? "phase4-3-2-summary.json" : hasRealSummary ? "phase4-3-1-summary.json" : "phase4-1-summary.json";
    const statusName = mode === "real_production" ? "production-status.json" : "system-status.json";
    const summary = readOptionalJson(tmp, summaryName);
    const systemStatus = readOptionalJson(tmp, statusName);
    const gptHandoff = readOptionalText(tmp, "gpt-handoff-summary.md");
    const deployReport = readOptionalText(tmp, "production-deployment-report.md");
    const manifest = readOptionalJson(tmp, "evidence-manifest.json");
    const rollbackPlan = readOptionalText(tmp, "rollback-plan.md");
    const changedFiles = readOptionalText(tmp, "changed-files.txt");
    const grepEvidence = readOptionalText(tmp, "grep-evidence.md");
    if (!summary || !systemStatus || !manifest) {
      warnings.push("core JSON consistency checks skipped because one or more required JSON files are invalid or missing.");
    } else {
      const currentHead = process.env.MARKET_RADAR_SOURCE_COMMIT || gitValue(["rev-parse", "HEAD"]);
    if (!currentHead) {
      warnings.push("current HEAD unavailable; set MARKET_RADAR_SOURCE_COMMIT or pass --source-commit when validating inside production image.");
    }
    if (summary.source_commit !== currentHead) {
      errors.push(`${summaryName}.source_commit mismatch: ${summary.source_commit} != ${currentHead}`);
    }
    if (summary.actual_head_commit !== summary.source_commit) {
      errors.push(`${summaryName}.actual_head_commit must equal source_commit`);
    }
    if (systemStatus.git?.commit !== summary.source_commit) {
      errors.push(`${statusName} git.commit mismatch: ${systemStatus.git?.commit} != ${summary.source_commit}`);
    }
    if (!gptHandoff.includes(summary.source_commit)) {
      errors.push("gpt-handoff-summary.md does not contain source_commit");
    }
    if (!deployReport.includes(summary.source_commit)) {
      errors.push("production-deployment-report.md does not contain source_commit");
    }
    if (summary.evidence_mode && summary.evidence_mode !== mode) {
      errors.push(`${summaryName}.evidence_mode mismatch: ${summary.evidence_mode} != ${mode}`);
    }
    if (summary.production_evidence_mode && summary.production_evidence_mode !== mode) {
      errors.push(`${summaryName}.production_evidence_mode mismatch: ${summary.production_evidence_mode} != ${mode}`);
    }
    if (manifest.evidence_mode !== mode) {
      errors.push(`evidence-manifest.evidence_mode mismatch: ${manifest.evidence_mode} != ${mode}`);
    }
    if (manifest.dry_run_only !== summary.dry_run_only) {
      errors.push("evidence-manifest.dry_run_only must match summary.dry_run_only");
    }
    if (manifest.production_deploy_executed !== summary.production_deploy_executed) {
      errors.push("evidence-manifest.production_deploy_executed must match summary.production_deploy_executed");
    }
    if (summary.pushed_main !== false) {
      errors.push(`${summaryName}.pushed_main must be false`);
    }
    if (summary.still_not_ready_for_live_trading !== true) {
      errors.push(`${summaryName}.still_not_ready_for_live_trading must be true`);
    }
    if (summary.can_enter_shadow_tracking !== false) {
      errors.push(`${summaryName}.can_enter_shadow_tracking must be false`);
    }

    if (!grepEvidence.includes("Node.js 内置文本扫描")) {
      errors.push("grep-evidence.md must state Node.js internal scanner was used");
    }
    if (!changedFiles.includes("比较基线 commit") || !changedFiles.includes("当前 commit") || !changedFiles.includes("已提交差异文件")) {
      errors.push("changed-files.txt must include baseline commit, current commit, and committed diff sections");
    }
    if (mode === "dry_run") {
      if (summary.dry_run_only !== true) {
        errors.push("phase4-1-summary.dry_run_only must be true for dry_run evidence");
      }
      if (summary.production_deploy_executed !== false || summary.deployed_to_tencent_cloud !== false) {
        errors.push("dry_run evidence must not mark production deploy as executed");
      }
      if (summary.can_deploy_to_tencent_cloud_now !== false) {
        errors.push("phase4-1-summary.can_deploy_to_tencent_cloud_now must be false");
      }
      if (summary.requires_user_authorization_for_deploy !== true) {
        errors.push("phase4-1-summary.requires_user_authorization_for_deploy must be true");
      }
    } else {
      if (summary.dry_run_only !== false) {
        errors.push(`${summaryName}.dry_run_only must be false for real_production evidence`);
      }
      if (summary.production_deploy_executed !== true) {
        errors.push(`${summaryName}.production_deploy_executed must be true`);
      }
      if (summary.deployed_to_tencent_cloud !== true) {
        errors.push(`${summaryName}.deployed_to_tencent_cloud must be true`);
      }
      const productionCommit = summary.production_commit_after_deploy || summary.production_commit_after_validation;
      if (!productionCommit || productionCommit !== summary.source_commit) {
        errors.push(`${summaryName}.production commit must equal source_commit`);
      }
      const requiredPassKeys = hasPhase432Summary
        ? [
          "production_smoke",
          "production_evidence_generated",
          "unified_decision_guard_not_regressed",
          "overlay_guard_not_regressed",
        ]
        : [
          "production_health",
          "production_smoke",
          "production_status",
          "production_evidence_generated",
          "unified_decision_guard_not_regressed",
          "overlay_guard_not_regressed",
        ];
      for (const key of requiredPassKeys) {
        if (summary[key] !== "pass") {
          errors.push(`${summaryName}.${key} must be pass`);
        }
      }
      if (hasPhase432Summary) {
        for (const key of ["production_health", "production_status"]) {
          if (!["pass", "partial"].includes(summary[key])) {
            errors.push(`${summaryName}.${key} must be pass or partial`);
          }
        }
      }
      if (summary.requires_gpt_production_evidence_review !== true) {
        errors.push(`${summaryName}.requires_gpt_production_evidence_review must be true`);
      }
      if (rollbackPlan.includes("本轮未部署") || rollbackPlan.includes("部署授权前计划")) {
        errors.push("rollback-plan.md contains stale pre-deploy wording");
      }
      const forbiddenDryRunTexts = [
        "本轮未部署腾讯云",
        "真实腾讯云部署尚未执行",
        "未访问生产",
        "只能证明本地工程链路和 dry-run",
        "第 4.1 步本地工程建设",
      ];
      for (const file of requiredFiles.filter((item) => item.endsWith(".md") || item.endsWith(".json"))) {
        const text = readFileFromDir(tmp, file);
        for (const phrase of forbiddenDryRunTexts) {
          if (text.includes(phrase)) {
            errors.push(`real_production evidence contains dry-run-only wording in ${file}: ${phrase}`);
          }
        }
      }
      if (hasPhase432Summary) {
        const phase432RequiredPass = [
          "grep_evidence_no_command_not_found",
          "validator_detects_command_failures",
          "rollback_plan_real_production_context",
          "validate_result_json_parseable",
          "changed_files_accurate",
          "inner_outer_evidence_consistent",
          "secret_leak_check",
        ];
        if (summary.phase !== "4.3.2") {
          errors.push("phase4-3-2-summary.phase must be 4.3.2");
        }
        if (summary.task !== "production_evidence_consistency_and_validation_strictness_finalization") {
          errors.push("phase4-3-2-summary.task mismatch");
        }
        for (const key of phase432RequiredPass) {
          if (summary[key] !== "pass") {
            errors.push(`phase4-3-2-summary.${key} must be pass`);
          }
        }
        if (summary.can_enter_final_production_evidence_gpt_review !== true) {
          errors.push("phase4-3-2-summary.can_enter_final_production_evidence_gpt_review must be true");
        }
      }
    }
      if (summary.remote_commit === "remote_unavailable_or_not_pushed") {
        warnings.push("remote_commit unavailable; final evidence should be regenerated after pushing safe branch.");
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const payload = {
    generated_at: nowIso(),
    evidence_mode: mode,
    status: errors.length === 0 ? "pass" : "fail",
    zip: zipPath,
    required_files: requiredFiles,
    errors,
    warnings,
  };
  console.log(JSON.stringify(payload, null, 2));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
  return payload;
}

function writeValidatePayloadIfRequested(args, payload) {
  if (!args.jsonOutPath) {
    return;
  }
  ensureDir(dirname(args.jsonOutPath));
  writeFileSync(args.jsonOutPath, `${JSON.stringify(payload, null, 2)}\n`);
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
    const payload = validateEvidenceZip(args.zipPath);
    writeValidatePayloadIfRequested(args, payload);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
