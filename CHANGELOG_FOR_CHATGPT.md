# Market Radar 外部审计变更日志

用途：给外部架构审计员 / ChatGPT 快速了解最近轮次发生了什么。本文只记录事实，不包含密钥、连接串、服务器密码、cookie、token 或私钥。

## 2026-07-05 - 第三轮正式能力回测

本轮性质：正式能力回测轮。

本轮边界：

- 未新增功能。
- 未改 UI。
- 未优化策略。
- 未修改扫描排序。
- 未修改分析规则。
- 未修改回测逻辑。
- 未提交 Git。
- 未部署。
- 未重启服务。
- 未迁移或清理数据库。

前置门禁：

- `/api/health`：ready / fresh。
- Redis：healthy。
- worker：6 / 6 healthy。
- `npm run production:smoke`：exit=0。
- `npm run typecheck`：exit=0。
- `npm run lint`：exit=0；存在 1 个 warning：`priorityReasons` 未使用。
- `npm run test:market`：exit=0。
- `npm run build`：exit=0。
- `npm run backtest:golden`：exit=0。

formal 执行：

- 命令：`npm run backtest:formal`
- 本地直连 Binance 首次失败，原因是 Node fetch 无法直连外网；失败证据已保留。
- 通过 undici proxy preload 后 formal 完整跑完。
- formal exit code：2。
- exit code 2 含义：程序完成，但裁判系统发现高优先级能力阻断，不是程序崩溃。
- formal 报告路径：`reports/professional-backtest-audit/2026-07-05T025649-925Z`。

核心结果：

- 总判定：当前系统仍不能支撑实战。
- 回测样本：100 个 replay 节点。
- 高优先级问题：60 个。
- `TRADE_PLAN_READY`：0 个。
- WAIT 总数：24 个。
- WAIT 有效率：0%。
- WAIT 触发后先止损：2 个，占 8.33%。

三大核心能力：

| 能力 | 状态 | 分数 | 通过率 |
|---|---:|---:|---:|
| 扫描：提前发现能力 | 不合格 | 50.88 | 7.69% |
| 分析：判断机会质量 | 不合格 | 48.05 | 23.81% |
| 策略：计划可执行性 | 不合格 | 28.61 | 0% |

最大短板：

1. 策略计划层没有形成可执行样本：`TRADE_PLAN_READY=0`。
2. WAIT 条件计划后验无效：WAIT 有效率为 0%。
3. RR、止损、目标投射仍是主要阻断项。
4. 分析判断有效率不足。
5. 扫描 TopN 仍漏掉部分早期质量机会。

第四轮建议：

- 只做策略计划层专项整改。
- 重点处理 WAIT 触发质量、RR、止损、目标、关键位投射。
- 不降低 3:1 RR。
- 不把 WAIT 包装成 READY。
- 不新增 UI 或功能。
- 不让 backtest future outcome 污染 production score。

## 2026-07-05 - 第四轮策略计划层专项整改

本轮性质：整改轮，不是 formal 能力验收轮。

本轮边界：

- 未改 UI。
- 未改扫描排序。
- 未改榜单。
- 未改 WebSocket。
- 未部署。
- 未跑 `npm run backtest:formal`。
- 未动数据库。
- 未降低 3:1 RR。
- 未把 WAIT / WATCH 包装成 READY。
- 未让 future outcome 污染 production strategy。

本轮修改：

- `StrategyV3TradePlan` 增加可选结构化等待字段：等待区、触发条件、二次确认、等待原因、当前为什么不能做。
- `buildV3TradePlan` 对 WAIT 输出更清楚的结构化解释。
- `structure_repair_pending` 拆分为建设性修复等待、失败阻断、普通观察。
- WAIT 后验诊断新增：`trigger_not_reached`、`structure_invalidated_before_trigger`、`stop_too_close_to_entry`、`target_too_far_or_unrealistic`。
- 修正 WAIT 诊断内部价格距离百分比计算，避免误用数量占比函数。

本轮测试：

- `npm run build:market-cli`：通过。
- 定向测试：
  - `trade-plan.test`：13/13 通过。
  - `location-rr.test`：11/11 通过。
  - `trend-integrity.test`：8/8 通过。
  - `professional-audit-round.test`：57/57 通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
- `npm run test:market`：通过，769 + 17 + 4 全部通过。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。

本轮报告：

- `audit-round-4/strategy-root-cause-analysis.md`
- `audit-round-4/ROUND_4_STRATEGY_PLAN_FIX_REPORT.md`

当前真实结论：

- 第四轮只证明策略计划层的基础约束更清楚、更可验证。
- 当前系统仍不能支撑实战。
- 是否改善第三轮 formal 的策略分数，需要第五轮正式回归验收确认。

第五轮建议：

- 在不改规则的前提下跑 formal。
- 重点看 WAIT 有效率、TRADE_PLAN_READY 是否仍为 0、策略分数是否真实改善。
