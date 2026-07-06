# Next Actions

## Recommended Next Step

Run a focused 3.1 validation review on this safety branch:

1. Check radar contract and token dossier API output for `unifiedDecision`.
2. Confirm no stale `TRADE_PLAN_READY` survives without backend `readyPlan`.
3. Confirm SniperBoard, maturity pool and anomaly board read unified/operator contract state instead of local count/score/category inference.

## Do Not Do Yet

- Do not push main.
- Do not deploy Tencent production.
- Do not run formal.
- Do not change scan sorting.
- Do not alter strategy thresholds.

## Follow-up Candidate

第 3.2 步建议：只读审计 TradingView / Kline overlay 对非 READY 状态的展示边界，防止图表视觉层比统一决策合同更强。
