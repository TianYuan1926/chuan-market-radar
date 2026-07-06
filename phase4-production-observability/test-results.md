# 第 4 步测试结果

本文件记录第 4 步最终集成阶段实际运行的命令结果。未运行 formal，未部署腾讯云，未触碰数据库、Redis 或 volume。

| 命令 | 结果 | 摘要 |
|---|---:|---|
| `npm run typecheck` | pass | `tsc --noEmit` 通过。 |
| `npm run lint` | pass | `eslint .` 通过，无阻断错误。 |
| `npm run test:market` | pass | 市场核心测试 810 pass / 0 fail；worker 17 pass / 0 fail；historical smoke 4 pass / 0 fail。 |
| `npm run build` | pass | `next build --webpack` 编译、类型检查、页面生成通过。 |
| `npm run backtest:golden` | pass | golden cases 16/16 通过。 |
| `npm run ci:forbidden-files` | pass | 禁止跟踪文件检查通过。 |
| `npm run ci:secret-patterns` | pass | 已跟踪源码 secret pattern 检查通过。 |
| `npm run security:check` | pass | 已跟踪 env、高风险 artifact、明显 secret 值检查通过。 |
| `npm run production:health -- --dry-run` | pass | 生成 `production-health.json`；未访问生产。 |
| `npm run production:smoke -- --dry-run` | pass | 生成 `production-smoke.json`；验证 dry-run 规则结构。 |
| `npm run production:status -- --dry-run` | pass | 生成 `system-status.json` 和状态快照；未访问生产。 |
| `npm run production:evidence -- --dry-run` | pass | 生成 phase4 证据文件和内部 `production-evidence.zip`；zip 被 `.gitignore` 忽略，不提交。 |
| `npm run production:deploy` | pass | 默认 dry-run，只打印部署计划，不执行真实部署。 |
| `npm run production:rollback` | pass | 默认 dry-run，只打印回滚计划，不执行真实回滚。 |

## 明确未运行

- `npm run backtest:formal`：未运行。本轮禁止 formal。
- 腾讯云生产部署：未执行。
- 数据库 migration / Redis 清理 / volume 操作：未执行。
