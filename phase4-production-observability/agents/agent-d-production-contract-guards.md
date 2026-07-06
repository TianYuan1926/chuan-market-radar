# Agent D：Decision / UI Risk 生产守卫

## 结论

PASS。

## 守卫范围

production smoke 已纳入以下检查规则：

- `radarSignals.data[]` 必须有 `unifiedDecision`。
- `TRADE_PLAN_READY` 必须满足 `canTradeNow=true`、`readyPlan != null`、`blockerCount=0`。
- 非 READY 必须 `canTradeNow=false` 且 `readyPlan=null`。
- READY 的 `rewardRisk` 必须 `>= 3`。
- Kline 非 live 状态不得出现 `target/stop` 或 `ready_trade_plan` overlay。
- ready trade plan overlay 必须来自 `unified_decision_engine`，且 `allowedUse=ready_trade_plan_only`。

## 代码事实源

- `src/lib/decision/unified-decision-engine.ts`
- `src/lib/api/frontend-contract.ts`
- `src/lib/chart-types.ts`
- `src/components/kline-panel.tsx`
- `src/components/kline-chart.tsx`

## 风险

`TokenDossier.chart.overlaySource` 只能做档案信息，不可作为交易计划放行证据。production smoke 以 `/api/frontend/kline-contract` 的实时状态和 overlay 语义字段为准。
