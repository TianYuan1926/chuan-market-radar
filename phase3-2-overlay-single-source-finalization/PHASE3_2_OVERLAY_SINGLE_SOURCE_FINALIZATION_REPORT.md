# Market Radar 第 3.2 步交付报告

## 1. 本轮目标

第 3.2 步：图表叠加层与严格单一事实源最终收口。

目标是把第 3.1 剩余的 `unified_decision_engine_single_source = partial` 收口，并确保 Kline / TradingView / 图表 overlay 不会在非 `TRADE_PLAN_READY` 状态下显示成交易计划。

## 2. 范围边界

本轮修改：

- 统一决策读取与 chart overlay 合同。
- Kline overlay 类型和过滤器。
- KlinePanel / KlineChart 展示门控。
- 系统健康 ready plan 统计语义。
- 合同测试、上下文文档和本轮证据。

本轮未做：

- 未部署腾讯云。
- 未 push main。
- 未运行 formal。
- 未动数据库 / Redis / volume。
- 未新增交易功能。
- 未降低 RR。
- 未放宽 `TRADE_PLAN_READY`。

## 3. 修改文件清单

- `src/lib/chart-types.ts`：新增 overlay 语义角色和统一显示过滤器，默认不允许 ready plan overlay。
- `src/lib/api/frontend-contract.ts`：Kline overlay 改为统一决策驱动；WAIT 只给等待条件；READY 才给 stop / target。
- `src/components/kline-panel.tsx`：只有 live Kline 数据才允许放行 ready plan overlay。
- `src/components/kline-chart.tsx`：图表底层增加 overlay 过滤和显式放行参数。
- `src/lib/radar-contract.ts`：更新 chart overlaySource 类型。
- `src/lib/api/system-health.ts`：readyPlans 统计改为统一就绪计划事实，不再只看旧 `isPlanEligible`。
- `src/lib/api/frontend-contract.test.ts`：新增非 READY / WAIT / stale overlay 安全测试。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：更新第 3.2 当前事实。
- `CHANGELOG_FOR_CHATGPT.md`：追加第 3.2 变更记录。

## 4. 对核心链路的影响

| 核心链路 | 影响 |
|---|---|
| 全市场发现 | 无直接影响 |
| 候选筛选 | 无直接影响 |
| 深扫验证 | 无直接影响 |
| 结构分析 | 结构位继续可视化，但明确为结构参考 |
| 风险赔率 | 不改 RR，不降低 3:1 |
| 交易计划 | 图表计划线只允许统一决策 READY 后显示 |
| 复盘进化 | 无 production 污染，未触碰 review/backtest |

## 5. 分层边界影响

- SCAN：未改排序、未改扫描预算。
- ANALYSIS：未改结构分析规则。
- STRATEGY：未放宽策略门禁，只收紧图表展示。
- BACKTEST：未运行 formal，未让 outcome 污染 production。
- FRONTEND：图表展示层增加严格门控。
- API：Kline contract 和 Token chart integrity 语义收紧。
- DB / Redis / worker / deployment / secret：未触碰。

## 6. 风险说明

未发现新 P0。

已消除的 P0 风险：

- 旧 Kline overlay 可能从 `strategyV3.tradePlan` 直接画 stop / target，导致 WAIT / OBSERVE / BLOCKED 看起来像交易计划。

剩余 P2：

- 生产未部署，本轮不能写成生产已验证。
- 历史文档和 guard fixture 保留禁用词用于防回归。
- 未来新增图表组件必须复用 overlay guard。

## 7. 执行命令

```bash
npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js
npm run typecheck
npm run lint
npm run test:market
npm run build
npm run backtest:golden
npm run ci:forbidden-files
npm run ci:secret-patterns
```

## 8. 测试结果

- typecheck：pass
- lint：pass
- test:market：pass，market core 810 / worker 17 / historical smoke 4
- build：pass
- backtest:golden：pass，16/16
- ci:forbidden-files：pass
- ci:secret-patterns：pass
- 定向合同测试：32/32 pass

## 9. Agent 结果

| Agent | 结果 |
|---|---|
| Agent 0 Git 安全 | pass |
| Agent A 单一事实源地图 | pass |
| Agent B 严格单一事实源收口 | pass |
| Agent C 图表 overlay guard | pass |
| Agent D 用户可见文案审查 | pass |
| Agent E 测试与 guard | pass |
| Agent F 主集成 | pass |
| Agent G 最终只读审计 | pass |

未发现 Agent 越权修改。

## 10. 核心验收结论

- `unified_decision_engine_single_source`：pass。
- production 用户可见 fallback READY 路径：已安全降级 / 收口。
- 缺 unifiedDecision 不能 READY：pass。
- SniperBoard 只能从 unifiedDecision.readyPlan 生成目标：未发现回归。
- OBSERVE 图表不显示交易计划线：pass。
- WAIT 图表只显示等待条件，不显示交易计划线：pass。
- BLOCKED 图表不显示交易计划线：pass。
- TRADE_PLAN_READY + readyPlan + live 才能显示 stop / target：pass。
- 旧 v3 plan overlay 不能绕过 unifiedDecision：pass。

## 11. 是否更新上下文

- `PROJECT_CONTEXT_FOR_CHATGPT.md`：已更新。
- `CHANGELOG_FOR_CHATGPT.md`：已更新。

## 12. 是否可以进入下一轮

可以进入第 3.2 验收复查。

不可以直接进入第 4 步。
不可以写成生产已验证。
当前系统仍不能支撑实战交易。

## 13. 下一轮建议

进入第 3.2 验收复查，由 GPT 重点审查图表 overlay 是否确实不再视觉误导。

