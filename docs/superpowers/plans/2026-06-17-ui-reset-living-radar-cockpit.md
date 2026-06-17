# UI Reset Living Radar Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Chuan Market Radar frontend presentation layer into a living altcoin contract radar cockpit while preserving existing backend/data contracts.

**Architecture:** Keep API/data/analysis behavior stable and rebuild the frontend shell in layers: design-system foundation -> app shell -> center opportunity surface -> left operations -> right companion/review -> runtime feedback -> mobile and QA. UI components should become smaller and testable instead of concentrating all presentation behavior in `radar-workspace.tsx`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, daisyUI, lucide-react, existing Node tests, Vercel, Neon, CoinGlass amateur API.

---

## Source Of Truth

Before implementation, read:

- `docs/chuan-market-radar-blueprint.md`
- `docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md`
- This plan file.

Do not reintroduce:

- Mainland access/ICP/CDN work.
- Background music.
- S680 as the active companion product direction.
- Element Plus as an installed dependency.
- A cosmetic patch that keeps the old paper-like page structure.

## File Map

Expected files to create:

- `postcss.config.mjs`: Tailwind/PostCSS plugin config.
- `src/components/radar/top-radar-bar.tsx`: brand, scan/session/health runtime status.
- `src/components/radar/radar-boot-briefing.tsx`: short skippable boot/purpose/risk layer.
- `src/components/radar/radar-cockpit-shell.tsx`: 2:6:2 desktop layout and mobile tab/drawer layout.
- `src/components/radar/ops-and-filter-panel.tsx`: provider, scan economy, filters, event stream.
- `src/components/radar/altcoin-opportunity-board.tsx`: grouped altcoin opportunity surface.
- `src/components/radar/signal-focus-panel.tsx`: selected signal evidence, plan, invalidation, TradingView actions.
- `src/components/radar/macro-weather-panel.tsx`: BTC/ETH environment surface.
- `src/components/radar/signal-lifecycle-panel.tsx`: discovered/watching/triggered/invalidated/reviewed summary.
- `src/components/radar/pixel-copilot.tsx`: male pixel co-pilot replacing the S680 product direction.

Expected files to modify:

- `package.json` and `package-lock.json`: add Tailwind CSS, daisyUI, PostCSS packages.
- `src/app/globals.css`: import Tailwind/daisyUI and keep only necessary custom brand/pixel/motion CSS.
- `src/components/radar/radar-workspace.tsx`: compose the new shell from focused components while preserving data contracts.
- `src/components/radar/pixel-s680.tsx`: keep only if needed as a compatibility wrapper; do not continue the S680 direction.
- `src/lib/api/repository-hygiene.test.ts`: enforce UI reset constraints.
- `docs/chuan-market-radar-blueprint.md`: update status after each stage.

## Phase 8.2b-R: Tailwind And DaisyUI Foundation

**Purpose:** Correct the design-system foundation so the project really uses Tailwind CSS and daisyUI.

- [x] Add a failing repository hygiene test that checks `package.json` for `tailwindcss`, `@tailwindcss/postcss`, `postcss`, and `daisyui`.
- [x] Add the same test checks for `postcss.config.mjs`, `@import "tailwindcss";`, and `@plugin "daisyui";`.
- [x] Add a hygiene assertion that Element Plus is not installed and is documented as reference-only.
- [x] Install dependencies using npm.
- [x] Create `postcss.config.mjs`.
- [x] Add Tailwind/daisyUI entry lines to `src/app/globals.css`.
- [x] Run `npm run test:market` and confirm the new hygiene test passes.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

**Acceptance:**

- Tailwind CSS and daisyUI are real dependencies/configuration, not just roadmap words.
- Build remains stable.
- No Element Plus dependency is added.

**GitHub Desktop Summary:**

```text
Add Tailwind daisyUI foundation
```

## Phase 8.2c: New AppShell And Cockpit Reset

**Purpose:** Replace the old paper-like presentation shell with a coherent cockpit layout.

- [x] Add `TopRadarBar` using daisyUI navbar semantics and existing scan/health/session data.
- [x] Add `RadarBootBriefing` with short skippable copy: purpose, data source, current health, risk boundary.
- [x] Add `RadarCockpitShell` with desktop 2:6:2 layout and mobile tab/drawer layout.
- [x] Move existing left/system content into `OpsAndFilterPanel` without changing API calls.
- [x] Move existing center radar/table/strategy/chart composition into the center slot without losing current actions.
- [x] Move companion/rank/journal/replay into the right slot.
- [x] Remove or neutralize old CSS that creates paper-like stacked sections.
- [x] Run browser QA for desktop and mobile if local port permission works.
- [x] Run full verification.

**Acceptance:**

- First screen has one cockpit container.
- Desktop columns are visually 2:6:2.
- Mobile does not compress three columns.
- No candidate-pool clipping or text overlap.

**GitHub Desktop Summary:**

```text
Rebuild radar cockpit shell
```

## Phase 8.2d: Live Runtime Feedback

**Purpose:** Make the page visibly operational without fake realtime effects.

- [x] Add scan heartbeat and last-update freshness display to `TopRadarBar`.
- [x] Add next-scan countdown when cadence metadata is available.
- [x] Add market-session clock: Asia, London, New York, overlap, weekend/low-liquidity.
- [x] Add stale/degraded visual states for CoinGlass, Neon, archive, and cron freshness.
- [x] Add new-signal and changed-metric highlight transitions.
- [x] Add reduced-motion fallback.
- [x] Keep background music out of scope.
- [x] Run browser QA and full verification.

**Acceptance:**

- The user can tell whether the site is live, stale, degraded, or waiting.
- Motion always maps to state.
- Reduced-motion users get a stable interface.

**GitHub Desktop Summary:**

```text
Add live runtime feedback
```

## Phase 3.8: Altcoin Opportunity Board

**Purpose:** Make altcoins the primary opportunity surface.

- [ ] Derive groups from existing scan, universe, daily mover, journal, alert, and replay data first.
- [ ] Add groups: long warming, short warming, near trigger, overextended/no chase, new/long-tail watch, data-insufficient watch.
- [ ] Show evidence on every item: OI, funding, volume, volatility, price move, BTC/ETH environment, stale/data-quality status.
- [ ] Selecting an item updates `SignalFocusPanel`, TradingView action, companion line, and quick journal context.
- [ ] Add tests for grouping, stale handling, and no-FOMO labels.
- [ ] Run full verification.

**Acceptance:**

- The homepage answers which altcoins deserve attention and why.
- Daily movers are context, not trade signals.
- No extra CoinGlass request spike.

**GitHub Desktop Summary:**

```text
Add altcoin opportunity board
```

## Phase 3.9: BTC ETH Macro Weather

**Purpose:** Keep BTC/ETH as market weather that affects confidence and timing without replacing the altcoin-first surface.

- [ ] Build `MacroWeatherPanel` from existing BTC/ETH anchors, funding/OI/liquidation-like fields, and cached OHLCV first.
- [ ] Show regimes: tailwind, headwind, chop, leverage crowded, deleveraging, volatility expansion, unknown.
- [ ] Do not mutate live strategy weights in this phase.
- [ ] Probe ETF-related CoinGlass endpoint only after availability and quota are verified.
- [ ] Add tests for regime classification and unknown-data fallback.
- [ ] Run full verification.

**Acceptance:**

- Macro context is visible and useful.
- Unknown macro data is marked unknown.
- Altcoin opportunity board remains primary.

**GitHub Desktop Summary:**

```text
Add BTC ETH macro weather
```

## Phase 8.3: Pixel Co-Pilot Reset

**Purpose:** Replace the active S680 product direction with the male pixel co-pilot concept.

- [ ] Create `PixelCoPilot` or migrate `PixelS680` behind a compatibility export.
- [ ] Render a male pixel character with BTC necklace and minimal state animation.
- [ ] Add states: idle, scanning, alert, skeptical, serious, celebrate, facepalm, sleepy, upgrade.
- [ ] Tie speech to selected signal, rank/discipline, and data state.
- [ ] Add tests preventing direct buy/sell commands in companion copy.
- [ ] Run full verification.

**Acceptance:**

- Companion is not a static image.
- S680 is not the visible/default product direction.
- Companion supports discipline and review, not FOMO.

**GitHub Desktop Summary:**

```text
Reset pixel copilot
```

## Phase 8.4: Mobile, Accessibility, And Visual QA

**Purpose:** Verify the reset is usable across desktop and mobile.

- [ ] Desktop QA: cockpit proportions, no clipping, readable density, stable controls.
- [ ] Mobile QA: opportunity-first ordering, tabs/drawer, no horizontal overflow.
- [ ] Reduced-motion QA.
- [ ] Empty, loading, stale, degraded, and error-state QA.
- [ ] Run `npm run test:market`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

**Acceptance:**

- User can actually operate the radar on desktop and inspect it on mobile.
- UI reset is not complete until browser QA is reported or explicitly blocked by local port permissions.

**GitHub Desktop Summary:**

```text
Verify radar UI reset
```

## Progress Reporting Template

Every completed stage must report:

- Current stage.
- Completed work.
- Files changed.
- Verification commands and results.
- Browser QA result or blocker.
- GitHub Desktop Summary.
- Correct next stage.
- Remaining major items.
