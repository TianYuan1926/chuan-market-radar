# Agent C - Frontend Contract Display

## Scope

验证 token dossier、signals/anomaly/sniper 可见层不会独立推断可交易状态。

## Implemented

- `src/components/token/token-dossier.tsx` now maps L1 decision from `d.unifiedDecision.decision`.
- Strategy panel displays `decisionLabel · unified_decision_engine`.
- WAIT shows unified wait conditions.
- BLOCKED shows unified blockers.
- Technical layer includes decision source and unified decision label.
- `src/lib/frontend-display-adapters.ts` now builds sniper targets only from `unifiedDecision.canTradeNow + readyPlan`.
- `src/components/anomaly-board.tsx` no longer uses `category + odds` to infer plan readiness.
- `src/components/signals/signal-maturity-pool.tsx` reads `unifiedDecision.canTradeNow + readyPlan`.
- `src/app/dashboard/page.tsx` no longer uses candidate/plan counts as a trading decision.

## UI Boundary

- Frontend still does not generate direction, entry, stop, target, RR, or trade plan.
- TradingView remains chart context only.
- WAIT remains waiting condition, not plan readiness.
- BLOCKED remains risk block.

## Remaining Risk

This round did not redesign page layout or visual hierarchy. Kline / TradingView readonly overlays still need a separate readiness audit.

## Verdict

Token dossier and main list readiness display are now contract-driven by unified decision output, with dashboard limited to runtime status.
