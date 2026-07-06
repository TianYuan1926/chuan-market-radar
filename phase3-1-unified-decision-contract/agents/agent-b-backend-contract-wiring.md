# Agent B - Backend Contract Wiring

## Scope

验证本轮后端合同是否把 radar signal 和 token dossier 决策状态统一交给统一决策链路。

## Implemented

- Added `SignalUnifiedDecisionRead` and `TokenUnifiedDecisionRead` to `src/lib/api/frontend-contract.ts`.
- Added `unifiedDecision` to `RadarSignal`.
- Added `unifiedDecision` to `TokenDossier`.
- `buildRadarSignal()` now creates a unified decision read model from backend maturity and `strategyV3.tradePlan`.
- Light scan / leaderboard fallback candidates use `frontend_candidate_guard`, not backend strategy approval.
- `buildFrontendTokenDossierContract()` now calls `buildUnifiedDecision()`.
- `riskGate.allowTradePlan` now follows `unifiedDecision.canTradeNow`.
- `tradePlan` is exposed only when `unifiedDecision.canTradeNow === true`.
- `WAIT` exposes `waitPlan`; it does not fabricate trade plan fields.
- `BLOCKED` exposes blockers; stale READY drafts without complete plan are blocked.

## Critical Guard Added

If backend maturity says `TRADE_PLAN_READY` but no valid backend trade plan exists, the radar signal / token dossier visible contract now returns:

- `unifiedDecision.decision = BLOCKED` or `OBSERVE` depending on source condition.
- visible maturity / readiness is not allowed to stay plan-ready.
- `tradePlan = null`.
- `riskGate.allowTradePlan = false`.

## Backend Boundary

- No RR threshold change.
- No scan sorting change.
- No market regime direct READY generation.
- No risk simulator influence.
- No review/backtest production ranking influence.

## Verdict

Backend radar signal and token dossier contracts are wired to unified decision output for this round.
