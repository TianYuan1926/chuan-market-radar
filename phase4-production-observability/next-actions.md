# 第 4 步下一步建议

## 唯一建议

先把本轮安全分支和 `phase4-production-observability.zip` 交给 GPT 做第 4 步验收复查。

## GPT 验收重点

1. `production.yml` 是否真正消除了 `push main` 自动生产部署风险。
2. `scripts/production/observability.mjs` 的 health / smoke / status / evidence 是否覆盖第 3.1 / 3.2 的统一决策和 overlay 红线。
3. `auto-deploy.sh` 和 `rollback.sh` 的默认 dry-run 是否足够安全。
4. 证据包是否没有夸大生产状态。
5. 是否可以进入“腾讯云生产部署验证轮”。

## 暂时不要做

- 不要直接 push main。
- 不要直接部署腾讯云。
- 不要跑 formal。
- 不要动数据库、Redis 或 volume。
- 不要把 dry-run 结果写成生产通过。
