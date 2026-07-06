# Remaining Risks

## P0

No new P0 found in local validation.

## P1

1. Kline readonly overlays can still display plan levels if a dossier provides v3 plan overlays; this should be audited separately to avoid visual overstatement on non-ready states.
2. This branch is not deployed to Tencent production; production API/page behavior cannot be claimed until a later deployment round.

## P2

1. Grep command requested root-level `app/components/pages/tests`; project uses `src/app` and `src/components`, so evidence includes normalized greps.
2. This branch is not deployed to Tencent production; no production smoke was run.

## Not A Risk In This Round

- No RR threshold change.
- No auto trading.
- No review/backtest production pollution.
- No database or Redis mutation.
- RadarSignal / TokenDossier now both expose `unifiedDecision`.
- SniperBoard requires backend unified readyPlan and no longer uses local category/odds as plan readiness.
