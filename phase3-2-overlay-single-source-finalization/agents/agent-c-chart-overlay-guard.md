# Agent C - Kline / TradingView / Chart Overlay 收口

## 修改文件

- `src/lib/chart-types.ts`
- `src/lib/api/frontend-contract.ts`
- `src/components/kline-panel.tsx`
- `src/components/kline-chart.tsx`
- `src/lib/api/frontend-contract.test.ts`

## 实现结果

PASS。

## 核心门控

新增 overlay 语义：

- `structure_reference`：结构参考位，只能看图，不能当交易计划。
- `wait_condition`：等待条件线，只能表示等待触发 / 确认 / 失效。
- `blocked_context`：阻断上下文，不能当计划线。
- `ready_trade_plan`：只有统一决策引擎放行后才允许显示的交易计划线。

新增展示过滤：

- `target / stop` 只有在 `ready_trade_plan + ready_trade_plan_only + unified_decision_engine` 时可显示。
- `filterKlineOverlaysForDisplay()` 默认不允许 ready plan overlay。
- `KlinePanel` 只有在 Kline 数据状态为 `live` 时才向 `KlineChart` 显式放行 ready plan overlay。

## 状态边界

| 状态 | 图表允许 | 图表禁止 |
|---|---|---|
| OBSERVE | 支撑 / 压力 / 结构参考 | entry / stop / target / RR |
| WAIT | 等待触发 / 等待失效参考 | entry / stop / target / RR |
| BLOCKED | 风险区 / 阻断上下文 | 交易计划线 |
| TRADE_PLAN_READY | 统一 readyPlan 的 stop / target | 旧 v3 plan 直接画线 |
| stale / partial | 结构参考 | fresh ready plan overlay |

## 测试覆盖

已新增 / 更新：

- 非 READY 不暴露 stop / target。
- WAIT 只显示等待条件，不显示 stop / target 语义。
- stale Kline 隐藏 ready plan overlay。
- READY overlay 的 sourceDecision 必须是 `unified_decision_engine`。

## 剩余风险

无新增 P0。若未来新增图表组件，必须继续调用 `filterKlineOverlaysForDisplay()`，否则会重新产生视觉误导风险。

