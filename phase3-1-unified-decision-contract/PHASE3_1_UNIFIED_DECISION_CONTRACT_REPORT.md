# 第 3.1 步交付报告：统一决策引擎主链路接线与合同验收

## 1. 本轮目标

把第 3 步新增的统一决策引擎接入主链路，让 radar signal、signals 页面、sniper board、anomaly board 和 token dossier 的可交易状态来自后端统一决策合同，而不是前端用候选数量、分数、赔率或局部状态二次推导。

## 2. 范围边界

本轮修改：

- 后端 radar signal / token dossier 合同。
- legacy radar contract 类型兼容。
- token dossier、signals、dashboard 前端读取方式。
- 统一决策引擎 blocker severity。
- 合同和 guard 测试。
- 项目上下文和本轮证据报告。

本轮未修改：

- scan 排序。
- scan 排序和 signals 页面视觉结构。
- strategy RR 门槛。
- market regime 生成 READY 逻辑。
- risk simulator。
- review/backtest production ranking。
- 数据库、Redis、worker、腾讯云生产。

## 3. 修改文件清单

- `src/lib/api/frontend-contract.ts`：新增 radar signal / token dossier `unifiedDecision` 字段，后端信号构建和 token dossier 均调用统一决策引擎；旧 READY 但缺完整计划会降级为 BLOCKED。
- `src/lib/radar-contract.ts`：为 legacy getter 增加 signal / token `unifiedDecision` 兼容字段，避免旧合同类型缺失。
- `src/lib/frontend-display-adapters.ts`：sniper target 只从 `unifiedDecision.canTradeNow + readyPlan` 生成；榜单兜底候选标记为 `frontend_candidate_guard`，不能伪装成后端计划。
- `src/lib/ui-schema-guard.ts`：信号 L1 决策优先读取 `unifiedDecision`，其次读取后端 `operatorRead.lane`，最后才使用成熟度兜底。
- `src/app/dashboard/page.tsx`：dashboard L1 只表达系统运行状态，不再用 `planReadyCount/candidateCount` 推导 TRADE/WAIT。
- `src/components/anomaly-board.tsx`：异动表不再用 category/odds 本地组合判断计划就绪。
- `src/components/signals/signal-maturity-pool.tsx`：计划提示读取 `unifiedDecision.canTradeNow + readyPlan`。
- `src/components/token/token-dossier.tsx`：L1 决策、等待条件、阻断原因均读取 `d.unifiedDecision`。
- `src/lib/decision/unified-decision-engine.ts`：给 blocker 增加 severity，READY 硬门槛失败为 critical。
- `src/lib/api/frontend-contract.test.ts`：新增 stale READY、WAIT、radar/dossier READY 一致、不伪造 trade plan 的合同测试。
- `src/lib/api/frontend-display-adapters.test.ts`：新增狙击榜只读统一 readyPlan 的测试。
- `src/lib/api/ui-schema-guard.test.ts`：新增统一决策压住旧 READY 成熟度的 guard。
- `src/lib/decision/unified-decision-engine.test.ts`：新增 blocker severity 断言。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：追加 3.1 当前事实。
- `CHANGELOG_FOR_CHATGPT.md`：追加 3.1 交付摘要。

## 4. 对核心链路的影响

- 全市场发现：无改动。
- 候选筛选：无改动。
- 深扫验证：无改动。
- 结构分析：无改动。
- 风险赔率：保留结构盈亏比最低 3:1；未降低门槛。
- 交易计划：radar signal、sniper board 和 token dossier 计划展示现在必须经过统一决策引擎；没有 readyPlan 不进入计划就绪区。
- 复盘进化：仍为 research-only，未进入 production ranking。

## 5. 分层边界影响

- SCAN：未改。
- ANALYSIS：未改。
- STRATEGY：radar signal / token dossier 读取统一决策结果；没有改变策略阈值。
- BACKTEST：未改。
- FRONTEND：只改决策来源和防误导读取，不做 UI 美化。
- API：radar signal / token dossier 合同增加 `unifiedDecision`。
- DB / Redis / Worker / Deployment / Secret：未触碰。

## 6. 关键修复

本轮发现并修复三个真实风险：

> 后端 maturity 残留为 `TRADE_PLAN_READY` 但没有完整 trade plan 时，token dossier 曾可能保留 visible `TRADE_PLAN_READY`。

修复后：

- 没有完整后端计划时不能保持 `TRADE_PLAN_READY`。
- `tradePlan` 只在 `unifiedDecision.canTradeNow === true` 时暴露。
- WAIT 只显示等待条件，不显示交易计划。
- READY 硬门槛失败 blocker 标为 critical。
- SniperBoard 不再用前端 `category + odds` 拼出计划就绪卡；必须读取后端 `unifiedDecision.readyPlan`。
- Dashboard 不再用候选数量或计划数量生成 L1 TRADE / WAIT，只表达系统运行状态。

## 7. 执行命令

```bash
npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js .tmp/market-tests/lib/api/frontend-display-adapters.test.js .tmp/market-tests/lib/decision/unified-decision-engine.test.js .tmp/market-tests/lib/api/ui-schema-guard.test.js
npm run typecheck && npm run lint && npm run test:market && npm run build && npm run backtest:golden && npm run ci:forbidden-files && npm run ci:secret-patterns
rg -n "新信号|证据信号|交易信号|高置信信号|推荐榜|狙击榜|狙击席|立即入场|强推荐|可交易候选" src app components pages tests docs
rg -n "planReadyCount|candidateCount|anomalyCount|TRADE_PLAN_READY|READY|decisionSource|unified_decision_engine" src app components pages tests
```

## 8. 测试结果

- 定向合同/展示/guard 测试：pass，52/52。
- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：pass，market core 807 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：pass。
- `npm run backtest:golden`：pass，16/16。
- `npm run ci:forbidden-files`：pass。
- `npm run ci:secret-patterns`：pass。
- `npm run backtest:formal`：未运行，本轮禁止。

## 9. 风险说明

新 P0：未发现。

剩余 P1：

- kline readonly overlays 需要单独审计，避免图表视觉上看起来比决策合同更强。
- 生产环境尚未部署本分支，生产 API 是否呈现新合同需要后续部署轮验证。

剩余 P2：

- 本轮未部署腾讯云，不能说生产已更新。

## 10. 是否更新上下文

- `PROJECT_CONTEXT_FOR_CHATGPT.md`：已更新。
- `CHANGELOG_FOR_CHATGPT.md`：已更新。

## 11. 是否可以进入下一轮

完成安全分支推送后，可以进入 3.1 验收复查。

不能直接说可实战；不能直接部署生产；不能 push main。

## 12. 下一轮建议

第 3.1 验收复查：只读检查新合同输出，确认 SniperBoard / signals / token dossier 不再存在本地 READY 推断。
