# 自动部署证据链

## 目标

每次生产部署必须留下可复查证据，避免只凭口头说“部署成功”。

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
npm run production:evidence
```

实际脚本：

```text
scripts/audit/collect-production-facts.sh
```

## GitHub Actions artifact

`.github/workflows/production.yml` 会在部署后下载最新 production facts 包并上传 artifact。

## 分支边界

- 安全分支 / PR 只用于代码审查和质量门禁，不应同步腾讯云生产。
- `main` 是生产部署入口；推送 `main` 会触发 production workflow。
- 任何仍处于整改验收的分支不得直接推送 `main`，必须先完成验收报告和用户确认。

## 失败处理

- health/API/smoke 失败时，`auto-deploy.sh` 可触发 `rollback.sh`。
- 失败证据仍应保留在 `reports/`，但 `reports/` 不进入 Git。
