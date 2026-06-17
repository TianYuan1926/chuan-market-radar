# v3 Signal Dossier Integration Plan

**Goal:** Connect the Altcoin Trend Radar v3 Key Level and Forward Level Map foundation into real scan signals and the Signal Dossier without changing live ranking, weights, or CoinGlass request volume.

**Boundary:** This phase is read-only. It must reuse existing OHLCV candles fetched for technical/timeframe evidence. It must not add liquidation heatmap logic, automatic trading, automatic weight changes, or extra CoinGlass requests.

## Completed In This Phase

- [x] Add failing tests for `strategyV3` dossier construction, CoinGlass provider attachment, and Signal Dossier UI anchors.
- [x] Add `StrategyV3Dossier` to `MarketSignal` as optional read-only context.
- [x] Add `buildSignalTrendRadarV3Dossier`.
- [x] Reuse existing provider OHLCV candles to build v3 key levels and Forward Map.
- [x] Add provider metadata note for v3 key-level availability.
- [x] Display `关键位地图` and `Forward Map` inside Signal Dossier.
- [x] Add compact CSS classes for v3 dossier blocks.
- [x] Update blueprint with true v3 integration status.

## Verification So Far

- [x] `npm run test:market` passed after RED -> GREEN cycle.

## Still Required Before Commit

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`
- [x] local runtime smoke test if build succeeds
- [x] commit
- [ ] push if GitHub HTTPS credentials are available

Push status: attempted after local commit, blocked by GitHub HTTPS authentication: `fatal: could not read Username for 'https://github.com': Device not configured`. Local commit remains intact.

## Next Correct Build Phase

After this phase is committed, the next stable phase is:

1. Persist v3 Forward Map snapshots into Neon as research-only scan context.
2. Add a read-only Forward Map review executor that compares future OHLCV with saved maps.
3. Surface `forward_map_review` and `key_level_reaction_review` in journal/replay panels.
4. Only after enough samples exist, add manual calibration summaries; no automatic weights.
