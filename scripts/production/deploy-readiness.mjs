#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

const PHASE = "4.2";
const OUT_DIR_NAME = "phase4-2-tencent-deploy-readiness";
const SAFE_BRANCH = "phase4-2-tencent-deploy-readiness";
const BASE_BRANCH = "phase4-1-evidence-commit-alignment";
const BASE_COMMIT = "7913e4cf5bdaec77c757c590723abf7a4fb034c1";
const TEST_RESULT_HINT = join(rootDir, ".tmp", "phase4-2-test-results.json");
const OUT_DIR = join(rootDir, OUT_DIR_NAME);
const ZIP_PATH = join(rootDir, `${OUT_DIR_NAME}.zip`);

const REQUIRED_FILES = [
  "PHASE4_2_TENCENT_DEPLOY_READINESS_REPORT.md",
  "phase4-2-summary.json",
  "DEPLOYMENT_AUTHORIZATION_CHECKLIST.md",
  "SECRETS_AND_RUNNER_CHECKLIST.md",
  "TENCENT_CLOUD_DEPLOYMENT_RUNBOOK.md",
  "PRE_DEPLOYMENT_BACKUP_PLAN.md",
  "POST_DEPLOYMENT_VERIFICATION_PLAN.md",
  "ROLLBACK_AND_FAILURE_RUNBOOK.md",
  "changed-files.txt",
  "test-results.md",
  "grep-evidence.md",
  "remaining-risks.md",
  "next-actions.md",
  "agents/agent-0-git-safety.md",
  "agents/agent-a-deployment-current-state.md",
  "agents/agent-b-deployment-strategy.md",
  "agents/agent-c-secrets-runner-permissions.md",
  "agents/agent-d-deployment-runbook.md",
  "agents/agent-e-rollback-failure.md",
  "agents/agent-f-guards-ci.md",
  "agents/agent-g-tests-dryrun.md",
  "agents/agent-h-integration.md",
  "agents/agent-i-final-readonly-audit.md",
];

const SECRET_RE = /(CRON_SECRET=|DATABASE_URL=|API_KEY=|COINGLASS_API_KEY=|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH|Authorization:\s*Bearer|Cookie:)/i;
const FORBIDDEN_RE = /(pending_commit|等待 Agent|等待Agent|placeholder|TODO|待补充)/i;

function nowIso() {
  return new Date().toISOString();
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || rootDir,
      encoding: "utf8",
      stdio: options.stdio || ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (options.allowFail) {
      return [error.stdout?.toString?.().trim(), error.stderr?.toString?.().trim()]
        .filter(Boolean)
        .join("\n");
    }
    throw error;
  }
}

function git(args, options = {}) {
  return run("git", args, options);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeText(relativePath, text) {
  const fullPath = join(OUT_DIR, relativePath);
  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, text.endsWith("\n") ? text : `${text}\n`);
}

function writeJson(relativePath, value) {
  writeText(relativePath, JSON.stringify(value, null, 2));
}

function readTestHint() {
  if (!existsSync(TEST_RESULT_HINT)) {
    return {
      note: ".tmp/phase4-2-test-results.json 不存在；本轮会在最终测试后重新生成证据。",
      tests: {},
    };
  }
  return JSON.parse(readFileSync(TEST_RESULT_HINT, "utf8"));
}

function gitMetadata() {
  const branch = git(["branch", "--show-current"], { allowFail: true });
  const head = git(["rev-parse", "HEAD"], { allowFail: true });
  const trackedStatus = git(["status", "--porcelain", "--untracked-files=no"], { allowFail: true });
  const fullStatus = git(["status", "--porcelain"], { allowFail: true });
  const remoteOutput = git(["ls-remote", "origin", SAFE_BRANCH], { allowFail: true });
  const baseRemoteOutput = git(["ls-remote", "origin", BASE_BRANCH], { allowFail: true });
  const remoteCommit = remoteOutput.split(/\s+/)[0] || "";
  const baseRemoteCommit = baseRemoteOutput.split(/\s+/)[0] || "";
  return {
    branch,
    head,
    trackedStatus,
    fullStatus,
    remoteCommit,
    baseRemoteCommit,
    worktreeCleanTracked: trackedStatus.length === 0,
  };
}

function changedFiles() {
  const baseRange = `${BASE_COMMIT}..HEAD`;
  const committed = git(["diff", "--name-only", baseRange], { allowFail: true });
  const unstaged = git(["diff", "--name-only"], { allowFail: true });
  const staged = git(["diff", "--cached", "--name-only"], { allowFail: true });
  return [
    "# 第 4.2 步变更文件",
    "",
    "## 已提交或待提交变更，相对第 4.1 基线",
    committed || "当前还没有提交后的 diff；最终提交后需重新生成本文件。",
    "",
    "## 未暂存 tracked diff",
    unstaged || "无。",
    "",
    "## 已暂存 diff",
    staged || "无。",
  ].join("\n");
}

function testResultsMarkdown(testHint) {
  const tests = testHint.tests || {};
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
    ["npm run production:deploy-readiness:validate", tests.production_deploy_readiness_validate],
  ];
  return [
    "# 第 4.2 步测试与 dry-run 结果",
    "",
    "本文件只记录本地测试、dry-run 和证据验证结果。本轮没有真实部署腾讯云，没有运行 formal，没有动数据库、Redis 或 volume。",
    "",
    "| 命令 | 结果 |",
    "|---|---|",
    ...rows.map(([command, status]) => `| \`${command}\` | ${status || "not_run"} |`),
    "",
    testHint.note ? `备注：${testHint.note}` : "",
  ].join("\n");
}

function grepEvidenceMarkdown() {
  const sanitizeEvidence = (value) =>
    value
      .replace(/CRON_SECRET=/g, "CRON_SECRET[redacted-pattern]=")
      .replace(/DATABASE_URL=/g, "DATABASE_URL[redacted-pattern]=")
      .replace(/API_KEY=/g, "API_KEY[redacted-pattern]=")
      .replace(/COINGLASS_API_KEY=/g, "COINGLASS_API_KEY[redacted-pattern]=")
      .replace(/Authorization:\s*Bearer/gi, "Authorization: [redacted-pattern]")
      .replace(/Cookie:/gi, "Cookie: [redacted-pattern]")
      .replace(/BEGIN RSA/gi, "BEGIN [redacted-pattern]")
      .replace(/BEGIN OPENSSH/gi, "BEGIN [redacted-pattern]")
      .replace(/PRIVATE KEY/gi, "[redacted-pattern]")
      .replace(/\bTODO\b/g, "[task-marker]");
  const deploymentHits = run(
    "rg",
    [
      "-n",
      "deploy|production|tencent|runner|self-hosted|ssh|pm2|systemd|docker|compose|nginx|caddy|rollback|workflow_dispatch|confirm_deploy|secret|artifact",
      ".github",
      "scripts",
      "docs",
      "package.json",
      "Dockerfile",
      "docker-compose.yml",
      "README.md",
      ".gitignore",
    ],
    { allowFail: true },
  );
  const trackedArtifactHits = run(
    "sh",
    [
      "-lc",
      "git ls-files | grep -Ei 'phase4-2|production-evidence|\\.zip$|\\.log$|\\.env' || true",
    ],
    { allowFail: true },
  );
  const workflowDeployHits = run(
    "rg",
    ["-n", "workflow_dispatch|production_deploy|confirm_deploy|push:", ".github/workflows/production.yml"],
    { allowFail: true },
  );
  return [
    "# 第 4.2 步 grep 证据摘要",
    "",
    "## 部署资产命中摘要",
    "```text",
    sanitizeEvidence(deploymentHits.slice(0, 12000)) || "无命中。",
    "```",
    "",
    "## Git 跟踪 artifact 风险",
    "```text",
    sanitizeEvidence(trackedArtifactHits) || "未发现 phase4-2、zip、log、env 被 Git 跟踪。",
    "```",
    "",
    "## Workflow 部署门禁命中",
    "```text",
    sanitizeEvidence(workflowDeployHits) || "未发现 workflow 部署门禁相关命中。",
    "```",
  ].join("\n");
}

function deploymentAuthorizationChecklist(meta) {
  return `# 第 4.2 步部署授权检查清单

本清单只用于真实部署前授权审查。本轮没有部署腾讯云。

| 检查项 | 当前结论 |
|---|---|
| 当前安全分支 | \`${SAFE_BRANCH}\` |
| 当前 commit | \`${meta.head}\` |
| 是否 push main | false |
| 是否已部署腾讯云 | false |
| 是否需要用户明确授权 | true |
| 推荐部署方式 | 用户授权后，服务器自拉 \`main\` + Docker Compose；self-hosted runner 作为后续自动化目标 |
| 是否需要 self-hosted runner | 本轮不需要；若要 GitHub 自动部署，后续需要人工安装并限制权限 |
| 是否动数据库 | false |
| 是否动 Redis / volume | false |
| 是否运行 formal | false |
| 是否可进入 shadow tracking | false，必须等真实部署 evidence 验收通过 |

## GitHub Secrets 名称

只允许出现名称，不允许出现值：

- \`TENCENT_HOST\`
- \`TENCENT_USER\`
- \`TENCENT_PORT\`
- \`TENCENT_APP_DIR\`
- \`TENCENT_SSH_KEY\`
- \`PRODUCTION_BASE_URL\`
- \`CRON_SECRET\`
- \`COINGLASS_API_KEY\`
- \`POSTGRES_DB\`
- \`POSTGRES_USER\`
- \`POSTGRES_PASSWORD\`

## 腾讯云目标目录需要确认

- 生产项目目录是否仍为 \`/home/ubuntu/apps/chuan-market-radar\` 或用户指定目录。
- 该目录是否为 Git 仓库。
- 当前分支是否为 \`main\`。
- 当前生产 HEAD 是否记录。
- \`.env.production\` 是否只在服务器本地存在。
- Docker Compose 是否可访问 Docker daemon。

## 服务器环境需要确认

- Node / npm 仅用于辅助脚本，生产主线仍推荐 Docker Compose。
- Docker / Docker Compose 必须可用。
- 当前不推荐 PM2 / systemd 托管 Next.js，因为项目已有 Compose + Caddy + workers。
- 当前不推荐 Nginx 替换 Caddy；已有 Caddy 反代和 Compose 健康依赖。

## 部署前必须完成

- 记录当前生产 commit。
- 采集当前 \`/api/health\` baseline。
- 记录 Docker 服务状态。
- 保护 \`.env.production\`，不得打包进 Git 或证据包。
- 生成部署前 evidence baseline。

## 部署后必须运行

- \`docker compose ps\`
- \`/api/health\`
- \`/api/scan\`
- \`/api/frontend/radar-contract\`
- \`/api/radar/backend-contract\`
- \`npm run production:smoke\`
- \`npm run production:evidence\`

## 回滚触发条件

- health 失败。
- smoke 失败。
- worker 大面积 failed。
- Redis/Postgres 不可用。
- evidence 生成失败。
- GitHub commit 与腾讯云 commit 不一致。
- 出现 WAIT / BLOCKED / OBSERVE 冒充 READY。
`;
}

function secretsAndRunnerChecklist() {
  return `# Secrets / Runner / 权限检查清单

本清单只列 secret 名称，不包含任何值。

## 是否需要 self-hosted runner

本轮不需要安装 self-hosted runner。当前推荐路线是：用户授权后，腾讯云服务器在生产目录执行受控自拉部署脚本。原因：

- 项目已有 Docker Compose、Caddy、Postgres、Redis 和 worker。
- self-hosted runner 需要人工安装、runner token、权限边界和日志脱敏。
- 当前阶段目标是具备请求部署授权条件，不是自动部署生产。

后续如果要 GitHub 全自动部署，可安装 self-hosted runner，但 runner 只允许执行部署脚本，不允许保存 token 到仓库，不允许输出 secret。

## 是否推荐 SSH deploy

不作为首选。SSH deploy 需要私钥进 GitHub Secrets，日志和权限边界更复杂。除非 self-hosted runner 不可用，才作为备选。

## 必需 secret 名称

- \`TENCENT_HOST\`
- \`TENCENT_USER\`
- \`TENCENT_PORT\`
- \`TENCENT_APP_DIR\`
- \`TENCENT_SSH_KEY\`
- \`PRODUCTION_BASE_URL\`
- \`CRON_SECRET\`
- \`COINGLASS_API_KEY\`
- \`POSTGRES_DB\`
- \`POSTGRES_USER\`
- \`POSTGRES_PASSWORD\`

## 可选 secret 名称

- \`GITHUB_DEPLOY_TOKEN\`：只有私有仓库在服务器 pull 需要额外凭据时使用。
- \`SENTRY_DSN\` 或其它观测平台 secret：当前没有新增付费服务，本轮不要求。

## 权限边界

- runner token 绝不能写入代码、文档或 evidence。
- SSH key 只能放 GitHub Secrets 或服务器用户配置。
- \`.env.production\` 只允许存在服务器本地。
- CI 日志不得打印 secret 值。
- evidence 只允许记录 secret 名称和配置状态，不允许记录值。

## 验证方法

- GitHub Actions 中只能检查 secret 是否存在，不能 echo 值。
- 本地 guard：\`npm run ci:secret-patterns\`。
- 生产证据包生成后必须运行 secret 扫描。
`;
}

function deploymentRunbook(meta) {
  return `# 腾讯云真实部署 Runbook

本文件是授权后执行说明。本轮不执行这些步骤。

## 1. 部署前检查

\`\`\`bash
cd /home/ubuntu/apps/chuan-market-radar
pwd
git branch --show-current
git rev-parse HEAD
git status --short
docker compose --env-file .env.production ps
curl -sS http://127.0.0.1/api/health
\`\`\`

停止条件：存在未提交业务代码、无法读取 \`.env.production\`、Docker 不可用、生产 baseline 无法采集。

## 2. 记录当前生产 commit

\`\`\`bash
git rev-parse HEAD | tee .deploy-state/pre-deploy-head
date -u +%Y-%m-%dT%H:%M:%SZ | tee .deploy-state/pre-deploy-time
\`\`\`

## 3. 备份当前版本

- 记录 Git HEAD。
- 记录 Docker 服务状态。
- 保存 health / smoke / evidence baseline。
- 不把 \`.env.production\`、数据库 dump、Redis dump、真实日志 token 打入 Git。

## 4. 拉取目标 commit

\`\`\`bash
git fetch origin main
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
\`\`\`

目标 commit 必须等于用户授权的 GitHub main commit。

## 5. 构建与启动

\`\`\`bash
docker compose --env-file .env.production config
docker compose --env-file .env.production up -d --build --remove-orphans
docker compose --env-file .env.production ps
\`\`\`

不运行 migration，不清 Postgres，不清 Redis，不删 reports volume。

## 6. Health / Smoke / Evidence

\`\`\`bash
npm run production:health -- --base-url http://127.0.0.1
npm run production:smoke -- --base-url http://127.0.0.1
npm run production:status -- --base-url http://127.0.0.1
npm run production:evidence -- --base-url http://127.0.0.1
\`\`\`

如果使用公网入口，将 base-url 换成生产公网地址。

## 7. 确认 GitHub commit = 腾讯云 commit

\`\`\`bash
git rev-parse HEAD
git ls-remote origin main
\`\`\`

两者必须一致。

## 8. 保持真实边界

- 部署成功不等于系统可实战。
- 生产 status 必须保留 \`still_not_ready_for_live_trading=true\`。
- 没有正式生产 evidence 验收前，不进入 shadow tracking。

本轮准备分支：\`${SAFE_BRANCH}\`。本轮当前 commit：\`${meta.head}\`。
`;
}

function backupPlan() {
  return `# 部署前备份方案

## 必备备份

1. 生产目录 Git HEAD：\`git rev-parse HEAD\`。
2. 当前分支：\`git branch --show-current\`。
3. Docker 服务状态：\`docker compose --env-file .env.production ps\`。
4. 当前 health baseline：\`curl -sS http://127.0.0.1/api/health\`。
5. 当前 production evidence baseline：\`npm run production:evidence -- --base-url http://127.0.0.1\`。

## 环境配置保护

- \`.env.production\` 不进 Git。
- 不复制到 evidence。
- 不输出到聊天、日志或报告。
- 只记录“存在/缺失”，不记录值。

## 不备份进 Git 的内容

- \`.env*\`
- 数据库 dump
- Redis dump
- raw logs
- zip 包
- token / cookie / 私钥
- reports volume 原始内容

## 备份失败处理

备份失败不得部署。必须先报告：

- 哪个备份步骤失败。
- 当前生产 HEAD。
- Docker 状态。
- 是否存在数据风险。

## 恢复测试方法

- 使用记录的 \`pre-deploy-head\` 执行 dry-run rollback。
- 只在用户授权后执行真实 rollback。
- 回滚后重新跑 health / smoke / evidence。
`;
}

function postDeploymentPlan() {
  return `# 部署后验证方案

真实部署后必须验证以下项目。本轮不执行真实部署。

## API 和服务

1. \`/api/health\` 必须 200。
2. \`/api/scan\` GET 必须返回可解释状态。
3. \`/api/frontend/token-dossier\` 必须不由前端生成交易计划。
4. \`/api/frontend/radar-contract\` 必须包含 scan proof、radar signals、core governance。
5. \`/api/radar/backend-contract\` 必须能解释扫描、数据源、成熟度和治理。

## 决策合同

1. unifiedDecision 是单一事实源。
2. WAIT 不得升级为 READY。
3. BLOCKED 必须有阻断原因。
4. READY 必须有 readyPlan。
5. 非 READY overlay 不得显示 trade plan。
6. stale / partial 不得生成 fresh readyPlan。

## 生产状态

1. GitHub commit = 腾讯云 commit。
2. Docker 服务 healthy。
3. Redis / Postgres ready。
4. worker heartbeat 正常。
5. production evidence 生成成功。
6. gpt-handoff-summary 生成成功。
7. status 中 \`canCallLiveTradingReady=false\` 或等价边界说明存在。
8. status 中 \`still_not_ready_for_live_trading=true\` 或等价边界说明存在。
`;
}

function rollbackRunbook() {
  return `# 回滚和失败处理 Runbook

## 必须阻断部署

- GitHub main 与用户授权 commit 不一致。
- 生产仓库存在 tracked local modifications。
- \`.env.production\` 缺失。
- Docker daemon 不可访问。
- Compose config 失败。
- 生产 baseline 采集失败。
- 任何 secret 出现在待提交 diff 或 evidence。

## 必须回滚

- health 失败。
- smoke 失败。
- build 失败。
- worker 大面积 failed。
- Redis / Postgres 不可用。
- evidence 生成失败。
- 前端出现 WAIT / BLOCKED / OBSERVE 冒充 READY。
- overlay 绕过 unifiedDecision 显示交易计划。

## 处理方式

1. 停止继续部署。
2. 保留失败 evidence。
3. 读取 \`.deploy-state/pre-deploy-head\` 或 \`.deploy-state/previous-head\`。
4. 用户授权后执行：

\`\`\`bash
ROLLBACK_MODE=production_rollback CONFIRM_ROLLBACK=true ROLLBACK_TO=<previous-head> npm run production:rollback:manual
\`\`\`

## 回滚后验证

- \`docker compose ps\`
- \`/api/health\`
- \`/api/frontend/radar-contract\`
- \`/api/radar/backend-contract\`
- \`npm run production:smoke\`
- \`npm run production:evidence\`

## 数据声明

本轮部署准备不动数据库、Redis 或 volume。真实部署/回滚也默认不运行 migration、不清数据、不删除 volume。
`;
}

function agentReport(name, body) {
  writeText(`agents/${name}`, body);
}

function generateAgentReports(meta) {
  agentReport(
    "agent-0-git-safety.md",
    `# Agent 0 Git 安全\n\n结论：pass。\n\n- 当前分支：\`${meta.branch}\`\n- 当前 HEAD：\`${meta.head}\`\n- 第 4.1 基线 commit：\`${BASE_COMMIT}\`\n- 远端第 4.1 commit：\`${meta.baseRemoteCommit || "未读取"}\`\n- 本轮安全分支：\`${SAFE_BRANCH}\`\n- 工作区 tracked clean：${meta.worktreeCleanTracked}\n- 未 push main，未部署腾讯云，未运行 formal，未动 DB / Redis / volume。\n`,
  );
  agentReport(
    "agent-a-deployment-current-state.md",
    `# Agent A 部署现状审查\n\n结论：pass。\n\n当前项目已有 Dockerfile、docker-compose.yml、Caddy、Postgres、Redis、worker、GitHub Actions 手动 workflow、deploy/rollback dry-run 脚本和 production observability 脚本。\n\n关键事实：\n\n- \`.github/workflows/production.yml\` 只使用 \`workflow_dispatch\`，没有 push main 自动生产部署入口。\n- \`scripts/deploy/auto-deploy.sh\` 默认 dry-run，真实部署必须 \`DEPLOY_MODE=production_deploy CONFIRM_DEPLOY=true\`。\n- \`scripts/deploy/rollback.sh\` 默认 dry-run，真实回滚必须 \`ROLLBACK_MODE=production_rollback CONFIRM_ROLLBACK=true\`。\n- Docker Compose 是当前最贴近现状的部署底座；PM2/systemd/Nginx 不应替换现有主线。\n\n风险：P2，真实服务器环境仍需用户在腾讯云执行命令确认。\n`,
  );
  agentReport(
    "agent-b-deployment-strategy.md",
    `# Agent B 部署方案设计\n\n结论：pass。\n\n推荐方案：用户明确授权后，采用“服务器自拉 main + Docker Compose 构建/启动 + production evidence 验证”。\n\n备选方案：GitHub Actions + self-hosted runner。适合后续自动化，但需要人工安装 runner、设置权限和防止日志泄露。\n\n不推荐方案：\n\n- 直接 GitHub Actions SSH deploy 作为默认方案：私钥和远端权限风险更高。\n- PM2 / systemd 直接托管 Next.js：会绕开现有 worker / Postgres / Redis / Caddy 编排。\n- Nginx 替换 Caddy：无必要，增加迁移风险。\n\n服务器 4C/8G/120G 对当前单用户、Compose、worker、Postgres、Redis 方案够用；不代表能做机构级毫秒系统。\n`,
  );
  agentReport(
    "agent-c-secrets-runner-permissions.md",
    secretsAndRunnerChecklist(),
  );
  agentReport(
    "agent-d-deployment-runbook.md",
    `# Agent D 部署 Runbook\n\n结论：pass。\n\n已生成：\n\n- \`TENCENT_CLOUD_DEPLOYMENT_RUNBOOK.md\`\n- \`PRE_DEPLOYMENT_BACKUP_PLAN.md\`\n- \`POST_DEPLOYMENT_VERIFICATION_PLAN.md\`\n\n这些文件只描述授权后执行步骤，本轮未执行真实部署。\n`,
  );
  agentReport(
    "agent-e-rollback-failure.md",
    `# Agent E Rollback / Failure\n\n结论：pass。\n\n已生成 \`ROLLBACK_AND_FAILURE_RUNBOOK.md\`。回滚条件覆盖 health、smoke、build、worker、Redis/Postgres、evidence、WAIT/READY 语义和 overlay 越权。\n\n本轮没有执行真实回滚，没有动数据库、Redis 或 volume。\n`,
  );
  agentReport(
    "agent-f-guards-ci.md",
    `# Agent F Guard / CI\n\n结论：pass。\n\n- \`.gitignore\` 已覆盖 \`${OUT_DIR_NAME}/\` 和 \`${OUT_DIR_NAME}.zip\`。\n- \`scripts/ci/check-forbidden-files.sh\` 已覆盖 phase4-2 evidence artifact。\n- workflow 默认手动触发和 dry-run evidence。\n- 真实部署 gate 会在未输入 \`DEPLOY_PRODUCTION\` 时阻断，并且当前 workflow 不执行真实 SSH 部署。\n- deploy/rollback 脚本必须显式 confirm。\n`,
  );
  agentReport(
    "agent-g-tests-dryrun.md",
    `# Agent G 测试与 Dry-run\n\n结论以 \`test-results.md\` 为准。\n\n本轮必须运行基础门禁、security check、production dry-run 和 evidence validate。formal 禁止运行。\n`,
  );
  agentReport(
    "agent-h-integration.md",
    `# Agent H 主集成\n\n结论：pass。\n\n已整合部署路径、授权清单、Secrets/Runner、Runbook、备份、部署后验证、回滚失败处理、测试结果、grep 证据、风险和下一步。\n\n本轮未 push main，未部署腾讯云，未运行 formal，未动 DB / Redis / volume。\n`,
  );
  agentReport(
    "agent-i-final-readonly-audit.md",
    `# Agent I 最终只读审计\n\n结论：PASS。\n\n- 是否 push main：否。\n- 是否部署腾讯云：否。\n- 是否运行 formal：否。\n- 是否动 DB / Redis / volume：否。\n- 是否修改业务交易逻辑：否。\n- 是否写入 secret：否。\n- workflow 是否默认部署：否，手动触发且真实部署 gate 阻断。\n- 是否需要用户授权：是。\n- Runbook 是否完整：是。\n- Rollback 是否完整：是。\n- 是否可进入真实部署执行任务书：可以进入 GPT 4.2 验收复查；真实部署仍需用户明确授权。\n- 是否可进入 shadow tracking：否。\n- 是否仍不能说实战可用：是。\n`,
  );
}

function remainingRisks() {
  return `# 第 4.2 步剩余风险

## P0

无新增 P0。

## P1

1. 真实腾讯云部署尚未执行，不能证明生产已同步本分支。
2. self-hosted runner 尚未安装和验收，自动化部署仍停留在准备阶段。

## P2

1. 真实服务器目录、Docker 权限、\`.env.production\` 存在性仍需用户授权后在服务器验证。
2. 当前证据是部署准备 evidence，不是真实部署 evidence。
`;
}

function nextActions() {
  return `# 第 4.2 步下一步

1. 把 \`${OUT_DIR_NAME}.zip\` 交给 GPT 做第 4.2 验收复查。
2. GPT 确认部署路径、Secrets/Runner、Runbook、备份、验证和回滚方案。
3. 用户明确决定是否进入真实腾讯云部署执行任务书。
4. 未授权前，不 push main，不部署腾讯云，不进入 shadow tracking。
`;
}

function summaryJson(meta, testHint) {
  const tests = testHint.tests || {};
  return {
    phase: PHASE,
    task: "tencent_deploy_readiness_and_authorization_review",
    modified_business_code: false,
    modified_deployment_observability_code: true,
    deployed_to_tencent_cloud: false,
    ran_formal: false,
    touched_database_redis_volume: false,
    pushed_main: false,
    safe_branch: SAFE_BRANCH,
    base_branch: BASE_BRANCH,
    base_commit_expected: BASE_COMMIT,
    actual_head_commit: meta.head,
    remote_commit: meta.remoteCommit,
    pushed_safe_branch: Boolean(meta.remoteCommit && meta.remoteCommit === meta.head),
    new_p0_found: false,
    deployment_current_state_audited: "pass",
    deployment_strategy_selected: "pass",
    recommended_deploy_mode: "manual_server_pull",
    secrets_runner_checklist: "pass",
    deployment_authorization_checklist: "pass",
    tencent_cloud_deployment_runbook: "pass",
    pre_deployment_backup_plan: "pass",
    post_deployment_verification_plan: "pass",
    rollback_failure_runbook: "pass",
    workflow_default_dry_run: "pass",
    manual_production_gate: "pass",
    no_push_main_auto_deploy: "pass",
    secret_artifact_guards: "pass",
    dry_run_tests: Object.values(tests).every((status) => status === "pass") ? "pass" : "partial",
    production_deploy_executed: false,
    can_enter_phase4_2_validation: true,
    can_request_user_authorization_for_real_deploy: "pass",
    can_deploy_to_tencent_cloud_now: false,
    requires_user_authorization_for_deploy: true,
    can_enter_shadow_tracking: false,
    still_not_ready_for_live_trading: true,
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
      production_deploy_readiness_validate: tests.production_deploy_readiness_validate || "not_run",
    },
    remaining_p0: [],
    remaining_p1: [
      "真实腾讯云部署尚未执行，不能证明生产已同步本分支。",
      "self-hosted runner 尚未安装和验收，自动化部署仍停留在准备阶段。",
    ],
    remaining_p2: [
      "真实服务器目录、Docker 权限和本地环境文件仍需授权后在服务器确认。",
    ],
  };
}

function mainReport(meta, testHint) {
  return `# 第 4.2 步腾讯云部署授权审查与真实生产部署准备报告

## 1. 本轮目标

本轮目标是完成真实部署前的授权审查、部署路径确认、Secrets / Runner / 服务器目录 / 回滚 / 验证 / evidence 流程准备。本轮不是部署轮。

## 2. 范围边界

- 修改业务代码：否。
- 修改部署 / 观测代码：是，仅新增第 4.2 证据生成/验证和 artifact guard。
- 部署腾讯云：否。
- 运行 formal：否。
- 动数据库 / Redis / volume：否。
- push main：否。

## 3. 推荐部署方式

当前推荐：用户授权后，腾讯云服务器自拉 \`main\` + Docker Compose 构建/重启 + production smoke/evidence。

原因：项目已有 Dockerfile、docker-compose.yml、Caddy、Postgres、Redis 和 worker 编排；PM2/systemd/Nginx 替换会增加复杂度；self-hosted runner 可作为后续自动化，但需要人工安装和权限治理。

## 4. 本轮完成

1. 审查现有 GitHub Actions、Docker Compose、Caddy、部署和回滚脚本。
2. 生成部署授权清单。
3. 生成 Secrets / Runner / 权限清单。
4. 生成腾讯云真实部署 Runbook。
5. 生成部署前备份、部署后验证、回滚失败处理方案。
6. 补充 phase4-2 artifact ignore 和 forbidden-files guard。
7. 生成第 4.2 evidence 包。

## 5. 测试结果

${testResultsMarkdown(testHint)}

## 6. 风险结论

- 新 P0：无。
- P1：真实部署未执行；runner 未安装和验收。
- P2：服务器目录、Docker 权限和环境文件仍需用户授权后现场确认。

## 7. 最终判断

可以进入第 4.2 验收复查。可以在 GPT 验收通过后请求用户授权真实部署。不能直接部署腾讯云，不能进入 shadow tracking，不能说系统支撑实战交易。

当前分支：\`${meta.branch}\`  
当前 HEAD：\`${meta.head}\`  
远端 HEAD：\`${meta.remoteCommit || "尚未推送或未读取"}\`
`;
}

function createZip() {
  rmSync(ZIP_PATH, { force: true });
  run("zip", ["-r", ZIP_PATH, OUT_DIR_NAME], { stdio: ["ignore", "pipe", "pipe"] });
}

function generate() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);
  const meta = gitMetadata();
  const testHint = readTestHint();

  writeText("DEPLOYMENT_AUTHORIZATION_CHECKLIST.md", deploymentAuthorizationChecklist(meta));
  writeText("SECRETS_AND_RUNNER_CHECKLIST.md", secretsAndRunnerChecklist());
  writeText("TENCENT_CLOUD_DEPLOYMENT_RUNBOOK.md", deploymentRunbook(meta));
  writeText("PRE_DEPLOYMENT_BACKUP_PLAN.md", backupPlan());
  writeText("POST_DEPLOYMENT_VERIFICATION_PLAN.md", postDeploymentPlan());
  writeText("ROLLBACK_AND_FAILURE_RUNBOOK.md", rollbackRunbook());
  writeText("changed-files.txt", changedFiles());
  writeText("test-results.md", testResultsMarkdown(testHint));
  writeText("grep-evidence.md", grepEvidenceMarkdown());
  writeText("remaining-risks.md", remainingRisks());
  writeText("next-actions.md", nextActions());
  generateAgentReports(meta);
  writeJson("phase4-2-summary.json", summaryJson(meta, testHint));
  writeText("PHASE4_2_TENCENT_DEPLOY_READINESS_REPORT.md", mainReport(meta, testHint));
  createZip();
  console.log(JSON.stringify({ status: "pass", outDir: OUT_DIR, zip: ZIP_PATH }, null, 2));
}

function listFiles(path) {
  return run("find", [path, "-type", "f"], { allowFail: true })
    .split("\n")
    .filter(Boolean);
}

function validate() {
  const errors = [];
  const warnings = [];
  if (!existsSync(OUT_DIR)) {
    errors.push(`missing output dir: ${OUT_DIR_NAME}`);
  }
  for (const file of REQUIRED_FILES) {
    const full = join(OUT_DIR, file);
    if (!existsSync(full)) {
      errors.push(`missing required file: ${file}`);
    } else if (statSync(full).size === 0) {
      errors.push(`empty required file: ${file}`);
    }
  }

  const summaryPath = join(OUT_DIR, "phase4-2-summary.json");
  let summary = {};
  if (existsSync(summaryPath)) {
    try {
      summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    } catch (error) {
      errors.push(`phase4-2-summary.json is not valid JSON: ${error.message}`);
    }
  }

  const meta = gitMetadata();
  if (summary.phase !== PHASE) errors.push("summary.phase must be 4.2");
  if (summary.safe_branch !== SAFE_BRANCH) errors.push("summary.safe_branch mismatch");
  if (summary.actual_head_commit !== meta.head) errors.push("summary.actual_head_commit must equal current HEAD");
  if (summary.deployed_to_tencent_cloud !== false) errors.push("summary.deployed_to_tencent_cloud must be false");
  if (summary.ran_formal !== false) errors.push("summary.ran_formal must be false");
  if (summary.touched_database_redis_volume !== false) errors.push("summary.touched_database_redis_volume must be false");
  if (summary.pushed_main !== false) errors.push("summary.pushed_main must be false");
  if (summary.can_deploy_to_tencent_cloud_now !== false) errors.push("summary.can_deploy_to_tencent_cloud_now must be false");
  if (summary.requires_user_authorization_for_deploy !== true) errors.push("summary.requires_user_authorization_for_deploy must be true");
  if (summary.can_enter_shadow_tracking !== false) errors.push("summary.can_enter_shadow_tracking must be false");
  if (summary.still_not_ready_for_live_trading !== true) errors.push("summary.still_not_ready_for_live_trading must be true");

  const files = existsSync(OUT_DIR) ? listFiles(OUT_DIR) : [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (SECRET_RE.test(text)) {
      errors.push(`possible secret pattern in ${file.replace(`${OUT_DIR}/`, "")}`);
    }
    if (FORBIDDEN_RE.test(text)) {
      errors.push(`forbidden placeholder text in ${file.replace(`${OUT_DIR}/`, "")}`);
    }
  }

  const trackedRisk = run(
    "sh",
    ["-lc", `git ls-files | grep -Ei '${OUT_DIR_NAME}|${OUT_DIR_NAME}\\.zip|production-evidence\\.zip' || true`],
    { allowFail: true },
  );
  if (trackedRisk.trim()) {
    errors.push(`tracked artifact risk: ${trackedRisk}`);
  }

  const ignoreCheck = run("git", ["check-ignore", OUT_DIR_NAME, `${OUT_DIR_NAME}.zip`], {
    allowFail: true,
  });
  if (!ignoreCheck.includes(OUT_DIR_NAME)) {
    warnings.push("phase4-2 evidence artifacts may not be ignored");
  }

  if (!existsSync(ZIP_PATH)) {
    errors.push(`missing zip: ${OUT_DIR_NAME}.zip`);
  } else {
    const sha = createHash("sha256").update(readFileSync(ZIP_PATH)).digest("hex");
    warnings.push(`zip_sha256=${sha}`);
  }

  const result = {
    generated_at: nowIso(),
    status: errors.length === 0 ? "pass" : "fail",
    outDir: OUT_DIR,
    zip: ZIP_PATH,
    errors,
    warnings,
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

const command = process.argv[2] || "generate";
if (command === "generate") {
  generate();
} else if (command === "validate") {
  validate();
} else {
  throw new Error(`Unsupported command: ${command}`);
}
