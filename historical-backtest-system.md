# Historical Backtest System Plan

## Goal

Build a professional, read-only historical replay system for Chuan Market Radar.
It must test whether the radar can identify useful altcoin opportunities before
large moves, not merely audit the current page state.

## Scope

- Fetch historical public futures OHLCV data.
- Replay the market point-by-point without future data leakage.
- Score early opportunity traits: compression, volume expansion, relative
  location, trend setup and overextension risk.
- Compare the radar-style selection against baselines: momentum, volume and
  deterministic random selection.
- Output human-readable and machine-readable reports.
- Keep the system research-only: no orders, no database mutation, no weight
  auto-adjustment.

## Deliverables

- `tools/radar-historical-backtest-core.mjs`
- `tools/radar-historical-backtest.mjs`
- `tools/radar-historical-backtest.test.mjs`
- `npm run backtest:historical`
- Updated documentation and blueprint.

## Verification

- Unit tests for scoring, no-future replay and outcome measurement.
- `npm run test:historical-backtest`
- `npm run typecheck`
- `npm run test:market`
- `npm run lint`
- `npm run build`

