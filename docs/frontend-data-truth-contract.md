# Frontend Data Truth Contract

This document defines how the ChuanScan frontend may display backend data.
It exists to prevent the UI shell, backend engine, and review system from
drifting into separate products.

## Active Rule

All market-facing UI must be one of these states:

- Backend fact: data produced by backend contract routes or server-side contract readers.
- Derived display: formatting, sorting, grouping, or visual adaptation of backend facts.
- Honest empty state: backend returned no qualifying data, and the UI says so.
- UI state: local preferences only. Animation, sound, pet, and easter-egg state cannot re-enter active pages unless they directly serve scan, alert, review discipline, or another core chain requirement.

Anything else is forbidden for active pages.

## Forbidden On Active Pages

- Randomly generated market signals.
- Randomly generated prices, volume, market cap, hit rate, or PnL.
- Seed journal entries that look like real trades.
- Mock review samples shown as if they came from the review/evolution system.
- Fake whale alerts, fake liquidation alerts, fake chain-flow alerts, or fake AI conclusions.
- Showing `0` for unavailable market cap when the real meaning is unknown.
- Polluted symbols or non-crypto underlyings, including Chinese text assets, tokenized stocks, commodities, non-USDT contracts, or any invalid symbol that slipped through old cache/database state.

## Current Backend Contract Sources

- `/api/frontend/radar-contract`
- `/api/frontend/leaderboard`
- `/api/frontend/token-dossier`
- `/api/frontend/review-contract`
- server-side readers in `src/lib/frontend-contract-server.ts`

## Active Page Mapping

- `/`: backend radar contract plus backend-derived token display.
- `/dashboard`: backend radar contract plus leaderboard-derived token display.
- `/signals`: backend radar signals plus leaderboard candidate fallback. Candidate fallback is allowed only when marked as candidate/waiting, not as trade plan.
- `/leaderboard`: backend leaderboard contract.
- `/market`: backend macro, derivatives, scan proof, data source, and leaderboard contracts.
- `/review`: backend review contract. Empty review data must render empty state.
- `/system`: backend radar/system contract.
- `/token/[id]`: backend radar token list plus backend token dossier. Missing K-line or flow data must show waiting/empty state.

## Local UI State That Is Allowed

- Login placeholder state until real server session is added.
- Sound on/off.
- Pet/easter-egg progress and animation.
- Client-side clock/session display.
- UI open/closed, selected tabs, search query, sorting, pagination.

These states must not be described as market facts.

## Formatting Rule

If backend does not provide a value:

- Market cap: show `待补齐`, not `0`.
- K-line: show `等待真实 K 线数据`, not generated candles.
- Signal archive: show no backend dossier/empty state, not generated evidence.
- Journal: show no local records unless the user created records.

## Build Rule

Any future frontend delivery must be wired through the same contract shape first.
Do not add a new mock layer to "fill the page" during integration.
Mock/seed data may only run when an explicit local preview switch is enabled.
The production contract layer must filter polluted historical symbols before they reach visible UI fields.
