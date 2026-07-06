# 自动部署证据链

## 目标

每次生产部署必须留下可复查证据，避免只凭口头说“部署成功”。

当前事实：第 4.2 阶段只做部署授权审查和真实部署准备，不做真实部署。GitHub Actions 目前是手动 `workflow_dispatch` + dry-run evidence，不会因为 push main 自动部署腾讯云。

## 证据内容

- git head
- git status
- `/api/health`
- `/api/frontend/radar-contract`
- `/api/radar/backend-contract`
- `/api/radar/business-capability`
- `/api/frontend/review-contract`
- docker compose ps
- worker logs tail
- Postgres readiness
- Redis readiness
- scan status summary

## 生成脚本

```bash
npm run production:evidence -- --dry-run
```

实际脚本：

```text
scripts/production/observability.mjs
```

旧脚本 `scripts/audit/collect-production-facts.sh` 仍保留为 legacy evidence 入口，不作为第 4.2 默认部署准备入口。

## GitHub Actions artifact

`.github/workflows/production.yml` 当前只在手动触发后运行质量门禁和 dry-run evidence，并上传 artifact。

真实部署后的 production facts / evidence 必须在用户明确授权部署后单独执行，不能把 dry-run artifact 写成真实生产部署证据。

## 分支边界

- 安全分支 / PR 只用于代码审查、质量门禁和部署准备证据，不应同步腾讯云生产。
- `main` 是代码正本，但当前 workflow 不再监听 `push main` 自动部署生产。
- 任何仍处于整改验收的分支不得直接推送 `main`，必须先完成验收报告和用户确认。
- 真实部署必须有用户明确授权，并走服务器自拉 / self-hosted runner / 明确 manual 脚本之一。

## 失败处理

- health/API/smoke 失败时，必须停止发布结论并进入失败处理。当前 `auto-deploy.sh` 的失败回滚调用默认仍会走 dry-run rollback，不能写成已经真实自动回滚。
- 失败证据仍应保留在 `reports/` 或本轮 evidence 目录，但这些产物不进入 Git。
