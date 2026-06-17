# v3 Forward Map Persistence Plan

**Goal:** Persist the readonly Altcoin Trend Radar v3 Forward Map generated during scan processing so later review executors can verify whether the prebuilt map was useful.

**Boundary:** This phase is research-only. It must not add CoinGlass requests, liquidation heatmap concepts, automatic trading, live ranking mutation, or automatic weight changes.

## Completed In This Phase

- [x] Add failing tests for v3 Forward Map persistence contract, schema, memory repository, and Postgres repository.
- [x] Add `V3ForwardMapSnapshot` as a bounded readonly review snapshot type.
- [x] Extend scan replay signals to keep existing `strategyV3` dossiers when present.
- [x] Add `v3_forward_map_snapshots` to the durable schema.
- [x] Store queryable metadata: scan id, signal id, symbol, generated time, key-level count, forward-map count, source timeframes, and readonly guardrails.
- [x] Teach memory and Postgres repositories to extract v3 snapshots during `addScanArchive()`.
- [x] Add list/read methods for future review executors.
- [x] Update the blueprint with the true completed state.

## Verification

- [x] RED verified: persistence tests failed on missing v3 conversion functions and repository methods.
- [x] GREEN verified: `npm run test:market` passed with 378/378 tests.

## Next Correct Build Phase

Completed after this persistence phase:

- [x] Build a readonly Forward Map review executor.
- [x] Compare saved v3 maps against future OHLCV candles.
- [x] Write `forward_map_review` and `key_level_reaction_review` journal records.
- [x] Add protected `POST /api/admin/v3/forward-map-reviews/run`.
- [x] Surface review results in the journal panel and Signal Dossier action labels.
- [x] Keep all calibration manual and readonly until there are enough validated samples.

Next correct build phase:

1. Add an external low-frequency trigger plan for the v3 Forward Map review endpoint.
2. Add a system-health summary for latest v3 review run, skipped reasons, and failure count.
3. Start `missed_altcoin_review` by connecting daily mover misses with v3 saved map coverage.
4. Continue without automatic weights until enough manually reviewed samples exist.
