# Production Observability Runbook

Market Radar 第 4 步的生产观测系统只负责证明系统是否可观察、可验证、可回滚，不改变扫描、分析、策略或回测逻辑。

## 默认安全规则

- `production.yml` 只支持手动 `workflow_dispatch`，不再监听 `push main` 自动生产部署。
- `npm run production:deploy` 默认 dry-run，不会执行 `docker compose up`。
- `npm run production:rollback` 默认 dry-run，不会切换 Git HEAD 或重启容器。
- 真实部署必须由用户明确授权，并使用显式 manual 命令。
- 本系统不运行 migration，不清 Postgres，不清 Redis，不删除 volume。

## 本地 dry-run

```bash
npm run production:health -- --dry-run
npm run production:smoke -- --dry-run
npm run production:status -- --dry-run
npm run production:evidence -- --dry-run
```

dry-run 只验证脚本、输出结构、守卫规则和证据包生成能力，不访问生产服务器。

## 只读生产检查

需要用户明确给出生产 URL 后才运行：

```bash
npm run production:health -- --base-url http://example.com
npm run production:smoke -- --base-url http://example.com
npm run production:status -- --base-url http://example.com
npm run production:evidence -- --base-url http://example.com
```

只读生产检查只请求公开 API，不部署、不重启、不写数据库。

## 真实部署门禁

真实部署不允许默认执行。只有用户明确授权后，才允许在生产服务器上运行：

```bash
DEPLOY_MODE=production_deploy CONFIRM_DEPLOY=true npm run production:deploy:manual
```

执行前必须确认：

- 当前分支和 GitHub main 一致。
- 基础门禁通过。
- 不需要 migration。
- 证据包不会提交 Git。
- 有明确回滚目标。

## 证据包

`npm run production:evidence -- --dry-run` 会按当前分支和 `PHASE4_OUTPUT_DIR` 生成证据。第 4.1 分支默认输出 `phase4-1-evidence-commit-alignment/`；其它分支默认回落到 `phase4-production-observability/`。第 4.2 部署准备另有 `npm run production:deploy-readiness` 生成部署授权证据包。

- `system-status.json`
- `production-health.json`
- `production-smoke.json`
- `production-scan.json`
- `production-worker-status.json`
- `production-data-source-status.json`
- `production-decision-contract-status.json`
- `production-ui-risk-status.json`
- `production-deployment-report.md`
- `gpt-handoff-summary.md`
- `production-evidence.zip`

`production-evidence.zip` 是交给用户/GPT 审计的证据包，不能进入 Git。

## 第 4.2 部署准备证据

```bash
npm run production:deploy-readiness
npm run production:deploy-readiness:validate
```

第 4.2 证据只证明部署授权审查、Runbook、Secrets/Runner、备份、验证、回滚方案准备完成，不证明腾讯云已经部署。
