# Agent A - Decision Source Map

## Scope

只读检查第 3 步统一决策引擎是否已成为主链路决策出口，并识别本轮最小接线点。

## Findings Before Patch

- `buildUnifiedDecision()` existed in `src/lib/decision/unified-decision-engine.ts`.
- Before this round, no frontend contract field exposed `decisionSource` or `unified_decision_engine`.
- Token dossier still derived display readiness from `strategyReadiness`, maturity, and local blocking checks.
- `radar-contract.ts` legacy getter did not expose unified decision state.

## Required Wiring Completed

Minimal safe connection points:

1. Call unified decision wiring for radar signal output.
2. Call `buildUnifiedDecision()` inside `buildFrontendTokenDossierContract()`.
3. Expose read-only `unifiedDecision` in radar signal and token dossier API contracts.
4. Make token dossier L1 decision read only `unifiedDecision.decision`.
5. Make signals/anomaly/sniper visible readiness read unified decision instead of local category/odds/counts.
6. Block stale `TRADE_PLAN_READY` maturity when no complete backend plan exists.

## Remaining Risk

- Kline / TradingView readonly overlays still need a separate visual readiness audit.
- Production has not deployed this branch, so production API behavior remains unverified.

## Verdict

Unified decision source wiring now covers radar signal, signals/sniper visible readiness, anomaly board, dashboard runtime decision, and token dossier. Do not broaden into scan sorting, strategy thresholds, or production deploy.
