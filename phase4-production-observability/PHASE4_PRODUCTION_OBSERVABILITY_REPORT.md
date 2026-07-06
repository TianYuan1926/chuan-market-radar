# Market Radar 第 4 步交付报告：生产级自运行与观测闭环系统

## 1. 本轮目标

本轮目标是把 Market Radar 从“本地可运行 / 人工描述状态”推进到“本地工程可验证的生产观测闭环”：

- 生产部署必须有治理。
- 生产 health / smoke / status 必须有自动检查脚本。
- unifiedDecision / READY / overlay 的核心红线必须进入生产 smoke 检查。
- 证据包必须能自动生成并交给 GPT 审计。
- 失败必须有阻断和回滚预案。

本轮不是实战交易验证，不是策略调参，不是 formal 回测，不是真实腾讯云部署。

## 2. 范围边界

### 已改

- GitHub Actions 生产治理 workflow。
- 生产观测脚本。
- 部署/回滚脚本 dry-run 安全门。
- 部署观测文档和回滚文档。
- 项目上下文和蓝图中的发布规则。
- 第 4 步证据目录和 Agent 报告。

### 未改

- 未改扫描排序。
- 未改分析规则。
- 未改策略规则。
- 未降低 RR。
- 未改 READY 门槛。
- 未改前端交易计划展示逻辑。
- 未改数据库 schema。
- 未部署腾讯云。
- 未运行 formal。

## 3. 修改文件清单

见 `changed-files.txt`。

核心文件：

- `.github/workflows/production.yml`：收敛为手动触发、默认 dry-run、禁止 push main 自动部署。
- `scripts/production/observability.mjs`：新增 health / smoke / status / evidence 观测入口。
- `scripts/deploy/auto-deploy.sh`：默认 dry-run，真实部署需显式授权。
- `scripts/deploy/rollback.sh`：默认 dry-run，真实回滚需显式授权。
- `docs/deployment/PRODUCTION_OBSERVABILITY.md`：生产观测 runbook。
- `docs/deployment/ROLLBACK_PLAN.md`：回滚 runbook。
- `PROJECT_CONTEXT_FOR_CHATGPT.md` / `CHANGELOG_FOR_CHATGPT.md` / `docs/chuan-market-radar-blueprint.md`：同步第 4 步事实和发布规则。

## 4. 对核心链路的影响

| 核心链路 | 影响 |
|---|---|
| 全市场发现 | 不改扫描逻辑，只新增生产状态观测。 |
| 候选筛选 | 不改候选排序，只在 smoke 中检查候选不能冒充 READY。 |
| 深扫验证 | 不改 CoinGlass / 公开交易所深扫，只保留 data source status 快照结构。 |
| 结构分析 | 不改分析规则。 |
| 风险赔率 | 不改 RR 计算和 3:1 门槛。 |
| 交易计划 | 不改生成逻辑，只检查 READY 必须有 readyPlan。 |
| 复盘进化 | 不改 review/backtest；保持 research-only 边界。 |

## 5. 分层边界影响

| 层 | 影响 |
|---|---|
| SCAN | 只读观测，不改排序。 |
| ANALYSIS | 不改。 |
| STRATEGY | 不改，只增加 production smoke 合同检查。 |
| BACKTEST | 只运行 golden，不运行 formal，不污染 production。 |
| FRONTEND | 不改 UI。 |
| API | 不改业务 API，只读观测脚本可调用 API。 |
| DB / Redis / worker | 不操作。 |
| deployment | 新增 dry-run 安全门和 workflow 治理。 |
| secret | 不输出、不提交真实 secret。 |

## 6. 多 Agent 执行结果

| Agent | 结果 | 摘要 |
|---|---:|---|
| Agent 0 Git 安全 | pass | 基线分支和 commit 确认，创建安全分支。 |
| Agent A 生产路径审查 | pass | 发现并确认旧 `push main` 自动部署风险。 |
| Agent B Actions / 部署治理 | pass | workflow 改为手动触发、默认 dry-run。 |
| Agent C Health / Smoke / Status | pass | 新增生产观测脚本和 dry-run 输出。 |
| Agent D Decision / UI Risk | pass | production smoke 覆盖 unifiedDecision / READY / overlay 红线。 |
| Agent E Evidence / GPT Handoff | pass | 生成 GPT 交接和 evidence 输出结构。 |
| Agent F Rollback / Failure Handling | pass | 部署/回滚默认 dry-run，补充回滚文档。 |
| Agent G Tests / CI Guards | pass | 禁止文件和 secret 检查通过。 |
| Agent H 主集成 | pass | 完整测试和 dry-run 验证通过。 |
| Agent I 最终只读审计 | pass | 未发现新 P0。 |

## 7. 执行命令

```bash
npm run typecheck
npm run lint
npm run test:market
npm run build
npm run backtest:golden
npm run ci:forbidden-files
npm run ci:secret-patterns
npm run security:check
npm run production:health -- --dry-run
npm run production:smoke -- --dry-run
npm run production:status -- --dry-run
npm run production:evidence -- --dry-run
npm run production:deploy
npm run production:rollback
```

未运行：

```bash
npm run backtest:formal
```

## 8. 测试结果

见 `test-results.md`。

摘要：

- typecheck：pass
- lint：pass
- test:market：pass，810 + 17 + 4 全部通过
- build：pass
- backtest:golden：pass，16/16
- ci:forbidden-files：pass
- ci:secret-patterns：pass
- security:check：pass
- production health dry-run：pass
- production smoke dry-run：pass
- production status dry-run：pass
- production evidence dry-run：pass

## 9. 失败项

无阻断失败。

## 10. 风险说明

见 `remaining-risks.md`。

关键边界：

- dry-run 不等于生产真实通过。
- 本轮未部署腾讯云。
- 仍不能说系统支撑实战交易。
- 真实生产部署需要用户明确授权。

## 11. 是否更新项目上下文

- `PROJECT_CONTEXT_FOR_CHATGPT.md`：已更新。
- `CHANGELOG_FOR_CHATGPT.md`：已更新。
- `docs/chuan-market-radar-blueprint.md`：已更新发布规则和第 4 步观测闭环。

## 12. 是否可以进入下一轮

可以进入第 4 步 GPT 验收复查。

不建议直接进入腾讯云部署。部署必须等 GPT/用户确认后，在单独生产验证轮执行。

## 13. 下一轮建议

唯一建议：把本安全分支和 `phase4-production-observability.zip` 交给 GPT 做第 4 步验收复查。
