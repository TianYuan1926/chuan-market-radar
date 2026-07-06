# Agent F - Integration Summary

## Integrated Change

Unified decision output is now connected to radar signal contract, token dossier contract, and main list/sniper visible readiness.

## Main Runtime Path

```text
SignalBackendDossier
-> buildFrontendTokenDossierContract()
-> buildUnifiedDecision()
-> TokenDossier.unifiedDecision
-> TokenDossier L1 display

Backend Signal / Candidate
-> buildRadarSignal()
-> RadarSignal.unifiedDecision
-> frontend display adapters
-> signal cards / sniper targets / maturity pool
```

## Critical Behavior

- Complete READY backend plan: `TRADE_PLAN_READY`, trade plan visible.
- WAIT backend plan with full trigger/confirmation/invalidation/whyNotNow: `WAIT`, wait plan visible, no trade plan.
- Stale READY without planned entry or complete plan: `BLOCKED`, no trade plan.
- No backend plan: cannot keep visible `TRADE_PLAN_READY`.
- Sniper target generation requires `unifiedDecision.canTradeNow === true` and non-null `readyPlan`.
- Dashboard decision does not use candidate or plan counts as trading conclusions.

## What Was Not Changed

- Scan sorting.
- Dashboard visual structure beyond decision source.
- Signals page visual redesign.
- Production deployment.
- Database / Redis.
- Formal backtest.

## Verdict

3.1 local integration target is satisfied for unified decision contract wiring across radar signal, token dossier, and main visible readiness surfaces. Kline / TradingView overlay audit remains a separate follow-up.
