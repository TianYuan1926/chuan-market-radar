# Chuan Market Radar Backend API Contract

This document defines the readonly backend surfaces that future UI rebuilds should consume instead of guessing from scattered snapshot fields.

## Guardrails

- These endpoints do not trigger extra CoinGlass requests beyond the existing snapshot refresh path.
- Light scan output is discovery evidence only; it never creates trade decisions directly.
- Strategy, report and UI layers must not mutate live ranking, auto-adjust weights or auto-execute trades.
- Missing data must stay visible as `null`, `missing`, `empty`, `blocked`, `collecting` or equivalent explicit states.
- Frontend views must not silently truncate candidates. If UI space is limited, expose pagination, scrolling, tabs, filters or a count.

## `GET /api/radar/backend-contract`

Purpose: one compact backend truth contract for scan proof, data quality, runtime and evolution loop status.

Response shape:

- `ok`: request status.
- `contract.schemaVersion`: currently `backend-contract.v1`.
- `contract.source`: active data source, configured provider, realtime flag and source status.
- `contract.runtime`: scan trigger, cache status, repository mode and archive persistence.
- `contract.scanProof.fullMarket`: total, eligible, scanned, pending, coverage percent and coverage status.
- `contract.scanProof.lightScan`: public light scan status, universe size, accepted count, candidate count and top candidates.
- `contract.scanProof.deepScan`: planned assets, request count, raw/clean/primary row counts, empty assets and rejected rows.
- `contract.scanProof.allocation`: state-pool bucket assignment for the current deep-scan batch.
- `contract.scanProof.twoStageAllocation`: two-stage deep-scan allocation proof, including anchor/context slots, dynamic-priority slots, rotation slots, cold-exploration reserve slots and queued priority assets.
- `contract.dataQuality`: row-level quality counters.
- `contract.analysis.v3Coverage`: v3 coverage, OHLCV attempts and missing signals.
- `contract.analysis.v3StrategyLoop`: live v3 plans, risk-gate blocks and missing v3 count.
- `contract.analysis.evolution`: readonly strategy evolution boundary.
- `contract.apiSurfaces`: stable API surface names for frontend integration.
- `contract.guardrails`: non-negotiable execution and UI-safety boundaries.

Primary use:

- A redesigned frontend can show whether the system is really scanning, what was scanned, what remains pending and why a candidate entered deep scan.
- The two-stage allocation proof is the frontend-safe answer to "why these assets now": stage one discovers and ranks candidates from public light scan and repository hints; stage two spends the limited CoinGlass deep-scan slots while preserving at least one long-tail exploration slot when capacity allows.
- Assets listed in `queuedPriorityAssets` are not eliminated. They remain in the priority queue, rotation pool, revive watch or cold exploration pool for later batches.
- Operations panels can read one object instead of stitching together `/api/health`, `/api/scan` and local assumptions.

## `GET /api/radar/dossier?symbol=SYMBOL`

Purpose: one readonly backend dossier for a selected symbol.

Accepted symbols:

- Base asset: `ARB`
- Perpetual pair: `ARBUSDT`

Response shape:

- `ok`: request status.
- `dossier.found`: whether the current snapshot has a matching signal.
- `dossier.symbol`: resolved symbol.
- `dossier.signal`: selected signal state, direction, risk, confidence and summary.
- `dossier.chart.tradingView`: external TradingView symbol, interval and URL.
- `dossier.chart.availableTimeframes`: timeframes available from signal and v3 context.
- `dossier.strategyV3`: full readonly v3 dossier when available.
- `dossier.evidence`: raw evidence plus supportive/conflicting/neutral counts.
- `dossier.journal`: recent journal/outcome samples linked to the symbol or signal id.
- `dossier.guardrails`: no auto execution, no auto weight change, no live ranking mutation and report-only boundary.

Primary use:

- Signal detail pages, drawers or future standalone pages should call this endpoint for one-symbol context.
- TradingView remains the external real chart. The app can render readonly key levels, Forward Map and evidence overlays from `strategyV3`, but must label them as system context, not as live TradingView replacement.

## Current Relationship To Existing APIs

- `/api/health` remains the broad health report.
- `/api/radar` remains the full snapshot plus health payload.
- `/api/scan` remains the scan summary/refresh surface.
- `/api/radar/backend-contract` is the stable frontend contract.
- `/api/radar/dossier?symbol=SYMBOL` is the stable selected-symbol contract.
