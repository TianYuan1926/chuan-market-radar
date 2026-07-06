# Agent A：生产路径审查

## 结论

PASS，发现并已推动修复一个部署治理风险。

## 主要发现

旧 `.github/workflows/production.yml` 会监听 `push main`，并在测试通过后进入真实腾讯云 SSH 部署。这与第 4 步“默认 dry-run、禁止 push main 自动部署”的任务约束冲突。

## 处理结果

- `production.yml` 已改为仅 `workflow_dispatch`。
- 默认模式为 `dry_run`。
- `production_deploy` 需要显式确认，但本轮仍不执行真实部署。
- `scripts/deploy/auto-deploy.sh` 已增加 dry-run 默认门禁。
- `scripts/deploy/rollback.sh` 已增加 dry-run 默认门禁。

## DB / Redis / volume 风险

- 本轮未运行 migration。
- 本轮未清库。
- 本轮未清 Redis。
- 本轮未删除 volume。

## 剩余风险

旧 `deploy/scripts/*` 中仍有历史手动部署脚本，后续应保留为 legacy/manual，不应作为默认入口。
