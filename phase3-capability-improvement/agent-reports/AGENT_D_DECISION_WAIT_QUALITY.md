# Agent D 决策 / WAIT 质量报告

## 结论

通过。新增统一决策引擎，把后端 v3 trade plan 归一化为 `OBSERVE / WAIT / BLOCKED / TRADE_PLAN_READY`，并锁住 WAIT 与 READY 的硬门槛。

## 修改范围

- `src/lib/decision/unified-decision-engine.ts`
- `src/lib/decision/unified-decision-engine.test.ts`
- `docs/UNIFIED_DECISION_ENGINE.md`
- `tsconfig.market-test.json`

## 核心规则

- `TRADE_PLAN_READY` 必须满足：
  - 后端 maturity 为 `TRADE_PLAN_READY`
  - v3 trade plan 状态为 `READY_LONG` 或 `READY_SHORT`
  - `isPlanEligible=true`
  - 结构盈亏比 `>= 3:1`
  - 有后端结构止损
  - 有后端结构目标
  - 有后端 plannedEntryPrice
  - 没有 blocker
- `WAIT` 必须同时具备：
  - trigger
  - invalidation
  - confirmation
  - whyNotNow
- WAIT 不完整时降为 `BLOCKED`，不能包装成有效等待计划。

## 边界

- 不修改原 v3 trade-plan 逻辑。
- 不修改 scan ranking。
- 不从 market regime 生成交易计划。
- 不让前端生成 READY。

## 验证

- 定向测试已纳入 `npm run test:market`。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run backtest:golden`：通过，16/16。

## 风险

该模块目前是后端纯函数基础件，尚未接入生产 API。后续接线时必须保持后端事实源优先，不能让 UI 或市场状态模块自行升 READY。
