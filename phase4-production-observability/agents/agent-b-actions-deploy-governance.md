# Agent B：GitHub Actions 与部署治理

## 结论

PASS。

## 本轮改动

- 重写 `.github/workflows/production.yml`。
- 取消 `push main` 自动生产部署触发。
- 增加手动 `workflow_dispatch` 输入：
  - `dry_run`
  - `production_prepare`
  - `production_deploy`
- 默认只运行质量门禁和第 4 步 dry-run 证据包。
- production deploy gate 要求输入 `DEPLOY_PRODUCTION`，且本轮仍显式停止，不做真实 SSH 部署。

## 质量门禁

workflow 保留：

- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run security:check`

## 证据

workflow 会上传 `phase4-production-observability/` 作为 dry-run artifact。

## 风险

真实腾讯云自动部署仍需后续单独配置 self-hosted runner 或安全 SSH 运行环境。本轮不把“workflow 已存在”写成“生产自动部署已完成”。
