# Unified Decision Engine

生成日期：2026-07-06

## 1. 定位

Unified Decision Engine 是后端策略层的统一决策归一化模块。

它不扫描市场，不生成关键位，不计算 RR，不生成交易计划，只消费后端已经形成的结构化 trade plan 和成熟度事实，把结果统一成：

```text
OBSERVE
WAIT
BLOCKED
TRADE_PLAN_READY
```

## 2. 核心边界

- `OBSERVE`：没有后端结构化 trade plan，或只能观察，不能生成入场、止损、目标。
- `WAIT`：已有后端等待型计划，但只能等待触发，不能执行。
- `BLOCKED`：计划被风控、结构、RR、目标、止损、成熟度或 WAIT 质量阻断。
- `TRADE_PLAN_READY`：只有后端成熟 trade plan 满足所有硬条件才允许输出。

## 3. READY 硬门槛

`TRADE_PLAN_READY` 必须同时满足：

1. 后端成熟度为 `TRADE_PLAN_READY`。
2. v3 trade plan 状态为 `READY_LONG` 或 `READY_SHORT`。
3. `isPlanEligible=true`。
4. 结构盈亏比 `RR >= 3`。
5. 有后端结构止损 `structuralStop`。
6. 有后端结构目标位 `targets`。
7. 有后端计划入场价 `plannedEntryPrice`。
8. `blockedBy` 为空。
9. `canAutoExecute=false`。
10. 不允许由前端、market regime 或 review/backtest 推导 READY。

任何一项缺失，统一输出 `BLOCKED`，并给出 blocker reason、是否可移除、解除条件。

## 4. WAIT 硬门槛

`WAIT` 必须同时具备：

```text
trigger
invalidation
confirmation
whyNotNow
```

如果 WAIT 缺少任一字段，统一降为 `BLOCKED`，blocker 为 `wait_quality_incomplete`。

WAIT 只说明“等什么、哪里错、怎么确认、为什么现在不能做”，不能进入计划就绪区。

## 5. BLOCKED 要求

BLOCKED 必须输出：

```text
reason
removable
unblockCondition
```

其中 `removable=false` 只适合不可修复事实；当前模块默认把 v3 blocker 视为需要重新验证的可移除阻断。

## 6. Market Regime 边界

Market Regime 只能进入 `marketRegimeContext`：

- 可以解释顺风、逆风、轮动、低流动性、高波动。
- 不直接生成 `TRADE_PLAN_READY`。
- 不直接改变扫描排序。
- 不替代个币结构、RR、止损、目标位和风控门禁。

## 7. 当前代码入口

- `src/lib/decision/unified-decision-engine.ts`
- `src/lib/decision/unified-decision-engine.test.ts`

## 8. 本轮验证

本轮新增 6 条统一决策定向测试，覆盖：

- 完整 READY 放行。
- 后端成熟度不足时阻断 READY。
- RR、结构止损、目标、入场价、blocker 缺陷时阻断 READY。
- WAIT 四要素完整时保留 WAIT。
- WAIT 四要素不完整时降为 BLOCKED。
- 没有 trade plan 时输出 OBSERVE。
