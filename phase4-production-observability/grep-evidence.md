# 第 4 步 grep 证据分类

## 1. 敏感关键词扫描

执行命令：

```bash
rg -n "SECRET|TOKEN|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH|apiKey|API_KEY|CG-API-KEY|BINANCE|COINGLASS" . \
  --glob '!node_modules' \
  --glob '!*.lock' \
  --glob '!phase4-production-observability/production-evidence.zip' \
  --glob '!phase4-production-observability.zip'
```

结果：命中 651 行。

人工分类：

| 类别 | 是否真实风险 | 说明 |
|---|---:|---|
| `BINANCE` / `COINGLASS` 交易所和环境变量名 | 否 | 主要来自 provider、worker、测试、部署文档和 `.env.example` 占位说明，不是密钥值。 |
| `CRON_SECRET` / `API_KEY` 字段名 | 否 | 主要是授权边界、脚本变量名、文档占位和禁止规则；未发现真实密钥值。 |
| `CHANGE_ME_*` 占位值 | 否 | 明确是示例占位。 |
| `Authorization: Bearer <CRON_SECRET>` 文档示例 | 否 | 是文档说明，不是实际 token。 |
| `deploy/scripts/bootstrap-prod-env.sh` 生成 secret 的脚本逻辑 | 否 | 脚本生成服务器本地 `.env.production`，本轮未运行，未提交真实 `.env`。 |
| `src/data/mock-signals.ts` | P2 已知隔离项 | 旧 mock 数据源仍存在于源码中，但不是本轮新增，不应进入生产事实源；后续仍需持续确认 production 链路不引用它。 |

结论：本轮新增文件未发现真实 secret 泄露。`npm run ci:secret-patterns` 已通过。

## 2. 部署治理关键词扫描

执行命令：

```bash
rg -n "push main|deploy production|production_deploy|workflow_dispatch|confirm_deploy|rollback|production-evidence|system-status|gpt-handoff" .github scripts docs package.json
```

结果：命中 56 行。

人工分类：

| 位置 | 结论 | 说明 |
|---|---|---|
| `.github/workflows/production.yml` | pass | 只支持 `workflow_dispatch`，不监听 `push main`。 |
| `.github/workflows/production.yml` | pass | `production_deploy` 需要 `confirm_deploy=DEPLOY_PRODUCTION`，且本轮仍显式停止真实部署。 |
| `scripts/deploy/auto-deploy.sh` | pass | 默认 `DEPLOY_MODE=dry_run`，未显式确认不会部署。 |
| `scripts/deploy/rollback.sh` | pass | 默认 `ROLLBACK_MODE=dry_run`，未显式确认不会回滚。 |
| `scripts/production/observability.mjs` | pass | 生成 health / smoke / status / evidence 文件，dry-run 不访问生产。 |
| `docs/deployment/*` | pass | 文档明确部署和回滚需要用户授权。 |

结论：旧的 `push main` 自动生产部署风险已收敛；本轮没有引入默认生产部署路径。

## 3. Git 跟踪风险检查

执行命令：

```bash
git ls-files | grep -Ei '(^|/)(\.env|.*\.zip$|.*\.log$|.*\.exitcode$|audit|evidence|secret-grep|raw)' || true
git check-ignore -v phase4-production-observability.zip phase4-production-observability/production-evidence.zip || true
```

结果：

- `phase4-production-observability.zip` 命中 `.gitignore:*.zip`。
- `phase4-production-observability/production-evidence.zip` 命中 `.gitignore:*.zip`。
- 未发现本轮生成 zip 被 Git 跟踪。
- `docs/EVIDENCE_ENGINE_SPEC.md`、`src/lib/analysis/v2/evidence/*` 属于正式源码/文档，不是审计证据包。
- `.env.example` 是允许提交的占位文件，不含真实 secret。

结论：本轮证据 zip 和本地证据文件不会被误提交为生产代码。
