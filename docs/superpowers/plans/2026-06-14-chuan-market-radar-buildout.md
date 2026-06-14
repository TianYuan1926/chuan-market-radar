# Chuan Market Radar Buildout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining professional Chuan Market Radar capabilities without losing the agreed product, analysis, stability, UI, and review requirements.

**Architecture:** Keep the app as a public Next.js/Vercel site with server-side data providers, a repository-backed persistence layer, and a modular analysis pipeline. The pipeline must separate universe discovery, OHLCV collection, technical indicators, derivatives evidence, multi-timeframe fusion, AI review, signal lifecycle, and UI presentation.

**Tech Stack:** Next.js App Router, TypeScript, Vercel, Neon Postgres, CoinGlass API, public exchange OHLCV APIs, Node test runner, ESLint.

---

## Source Of Truth

- Product blueprint: `docs/chuan-market-radar-blueprint.md`
- Persistence notes: `docs/database-persistence.md`
- Deployment notes: `docs/deployment-checklist.md`
- Existing analysis engine: `src/lib/analysis/anomaly-engine.ts`
- Existing CoinGlass provider: `src/lib/market/providers/coinglass-provider.ts`
- Existing UI shell: `src/components/radar/radar-workspace.tsx`

Before implementing any task, read `docs/chuan-market-radar-blueprint.md` and confirm the change does not violate the public-site, no-login, no-auto-trading, evidence-first, flexible-scoring principles.

## Current Execution Status

- Task 1 Multi-Timeframe Profile: implementation and verification complete.
- Task 2 OHLCV Provider Boundary: implementation and verification complete.
- Task 3 Technical Indicator Evidence: implementation and verification complete.
- Task 4 Contract Universe Registry: implementation and verification complete.
- Task 5 AI Counter-Review Layer: implementation and verification complete.
- Task 6 Outcome Tracking And Self-Improvement: implementation and verification complete.
- Task 7 Alert Policy: implementation and verification complete.
- Next task: Task 8 Blueprint Status Update.

## File Structure Map

### Files To Create

- `src/lib/analysis/timeframe-profile.ts`: builds multi-timeframe profile objects and weights.
- `src/lib/analysis/timeframe-profile.test.ts`: verifies role definitions, conflict handling, and no hard-gate behavior.
- `src/lib/market/ohlcv/types.ts`: shared candle and OHLCV provider contracts.
- `src/lib/market/ohlcv/public-exchange-provider.ts`: fetches public exchange candles through server-side fetch.
- `src/lib/market/ohlcv/public-exchange-provider.test.ts`: validates candle normalization and provider failure behavior.
- `src/lib/analysis/technical-indicators.ts`: computes EMA, RSI, MACD, ATR, Bollinger, VWAP, and swing points from candles.
- `src/lib/analysis/technical-indicators.test.ts`: validates deterministic indicator output.
- `src/lib/market/universe-registry.ts`: normalizes supported contract assets and scan priority.
- `src/lib/market/universe-registry.test.ts`: validates dedupe, priority, and coverage reporting.
- `src/lib/analysis/ai-reviewer.ts`: model-agnostic AI review boundary with cost and failure guard.
- `src/lib/analysis/ai-reviewer.test.ts`: validates prompt boundaries and fallback behavior.
- `src/lib/journal/outcome-tracker.ts`: computes signal outcome checkpoints from future prices.
- `src/lib/journal/outcome-tracker.test.ts`: validates 1h, 4h, and 24h review logic.
- `src/lib/alerts/alert-policy.ts`: alert severity, dedupe, quiet hours, and sound profile rules.
- `src/lib/alerts/alert-policy.test.ts`: validates alert suppression and severity.

### Files To Modify

- `src/lib/analysis/types.ts`: add multi-timeframe evidence and signal lifecycle fields.
- `src/lib/analysis/anomaly-engine.ts`: consume timeframe profiles and indicator evidence.
- `src/lib/analysis/strategy-planner.ts`: include multi-timeframe invalidation and no-chase logic.
- `src/lib/market/providers/coinglass-provider.ts`: stop hardcoding real signals as single `15m` input.
- `src/lib/market/types.ts`: expose universe coverage and timeframe profile summaries in snapshots.
- `src/lib/market/radar-snapshot.ts`: include coverage and profile data in mock and live snapshots.
- `src/components/radar/chart-panel.tsx`: show active timeframe role, not only interval buttons.
- `src/components/radar/strategy-card.tsx`: show multi-timeframe support/conflict and AI counter-evidence.
- `src/components/radar/system-health-panel.tsx`: show scan coverage and provider freshness.
- `src/components/radar/event-center-panel.tsx`: classify alert-worthy events.
- `src/components/radar/journal-panel.tsx`: show planned review checkpoints and outcome.
- `docs/chuan-market-radar-blueprint.md`: update status after each completed stage.

## Task 1: Multi-Timeframe Profile

**Files:**
- Create: `src/lib/analysis/timeframe-profile.ts`
- Create: `src/lib/analysis/timeframe-profile.test.ts`
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/analysis/anomaly-engine.ts`
- Test: `src/lib/analysis/timeframe-profile.test.ts`

- [ ] **Step 1: Add failing tests for timeframe roles**

Create `src/lib/analysis/timeframe-profile.test.ts` with tests that assert:

- `1m` and `5m` are execution layers.
- `15m` and `30m` are anomaly layers.
- `1h` and `4h` are structure layers.
- `1d` and `1w` are regime layers.
- A lower-timeframe trigger without higher-timeframe support returns `waiting_confirmation`.
- A BTC/ETH environment conflict reduces confidence but does not force `no_trade`.

Run: `npm run test:market`
Expected: FAIL because `timeframe-profile.ts` does not exist.

- [ ] **Step 2: Implement profile types and role weights**

Create `src/lib/analysis/timeframe-profile.ts` with:

- `TimeframeRole = "execution" | "anomaly" | "structure" | "regime"`
- `TimeframeProfileFrame`
- `TimeframeProfile`
- `timeframeRoleMap`
- `buildTimeframeProfile(frames)`
- `summarizeTimeframeAgreement(profile)`

The implementation must never hard-reject a signal from one frame. It returns agreement, conflict, missing, and dominant role summaries.

- [ ] **Step 3: Wire profile into analysis input**

Modify `src/lib/analysis/types.ts` and `src/lib/analysis/anomaly-engine.ts` so a signal can carry:

- `timeframeProfile`
- `timeframeAgreement`
- `timeframeConflicts`

The score impact must be weighted:

- execution support: small positive
- anomaly support: medium positive
- structure support: strong positive
- regime support: medium positive
- conflict: penalty
- missing data: data-quality warning

- [ ] **Step 4: Verify**

Run:

```bash
npm run test:market
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/timeframe-profile.ts src/lib/analysis/timeframe-profile.test.ts src/lib/analysis/types.ts src/lib/analysis/anomaly-engine.ts
git commit -m "feat: add multi-timeframe analysis profile"
```

## Task 2: OHLCV Provider Boundary

**Files:**
- Create: `src/lib/market/ohlcv/types.ts`
- Create: `src/lib/market/ohlcv/public-exchange-provider.ts`
- Create: `src/lib/market/ohlcv/public-exchange-provider.test.ts`
- Modify: `src/lib/market/providers/coinglass-provider.ts`
- Test: `src/lib/market/ohlcv/public-exchange-provider.test.ts`

- [ ] **Step 1: Add failing tests for candle normalization**

The tests must cover:

- Binance-style arrays normalize into `{ openTime, open, high, low, close, volume, closeTime }`.
- Invalid numeric strings are rejected.
- Provider failures return a typed error and do not crash the scan.
- Supported intervals map to `1m/5m/15m/30m/1h/4h/1d/1w`.

Run: `npm run test:market`
Expected: FAIL because OHLCV provider files do not exist.

- [ ] **Step 2: Implement server-side OHLCV contracts**

Create `src/lib/market/ohlcv/types.ts`:

- `Candle`
- `OhlcvInterval`
- `OhlcvRequest`
- `OhlcvProvider`
- `OhlcvProviderResult`

Create `src/lib/market/ohlcv/public-exchange-provider.ts`:

- fetches public candles through injected `fetcher`
- defaults to Binance futures public endpoint shape
- normalizes candles
- returns typed failures without throwing from normal provider errors

- [ ] **Step 3: Keep CoinGlass as derivatives source**

Modify `src/lib/market/providers/coinglass-provider.ts` so CoinGlass remains responsible for derivatives evidence while OHLCV is a separate optional source. The scan must still succeed when OHLCV fails, but the signal gets a data-quality warning.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test:market
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/ohlcv src/lib/market/providers/coinglass-provider.ts
git commit -m "feat: add public OHLCV provider boundary"
```

## Task 3: Technical Indicator Evidence

**Files:**
- Create: `src/lib/analysis/technical-indicators.ts`
- Create: `src/lib/analysis/technical-indicators.test.ts`
- Modify: `src/lib/analysis/anomaly-engine.ts`
- Modify: `src/components/radar/strategy-card.tsx`
- Test: `src/lib/analysis/technical-indicators.test.ts`

- [ ] **Step 1: Add failing deterministic indicator tests**

Tests must validate:

- EMA returns expected smoothed values on a fixed close series.
- RSI returns neutral near 50 for alternating gains/losses.
- ATR increases when candle ranges expand.
- Bollinger width contracts on flat ranges.
- VWAP uses price times volume divided by total volume.
- Swing points identify local highs and lows.

Run: `npm run test:market`
Expected: FAIL because `technical-indicators.ts` does not exist.

- [ ] **Step 2: Implement indicators without external dependencies**

Create pure TypeScript functions:

- `ema(values, period)`
- `rsi(values, period)`
- `atr(candles, period)`
- `bollinger(values, period, multiplier)`
- `vwap(candles)`
- `swingPoints(candles, lookback)`
- `buildTechnicalEvidence(candlesByTimeframe)`

- [ ] **Step 3: Feed indicators into evidence layer**

Modify `src/lib/analysis/anomaly-engine.ts` so indicators add evidence only. They must not directly trigger a trade.

- [ ] **Step 4: Display indicator evidence**

Modify `src/components/radar/strategy-card.tsx` so indicator evidence appears under existing evidence/counter-evidence areas without creating another large card.

- [ ] **Step 5: Verify and commit**

```bash
npm run test:market
npm run typecheck
npm run lint
git add src/lib/analysis/technical-indicators.ts src/lib/analysis/technical-indicators.test.ts src/lib/analysis/anomaly-engine.ts src/components/radar/strategy-card.tsx
git commit -m "feat: add technical indicator evidence"
```

## Task 4: Contract Universe Registry

**Files:**
- Create: `src/lib/market/universe-registry.ts`
- Create: `src/lib/market/universe-registry.test.ts`
- Modify: `src/lib/market/provider-registry.ts`
- Modify: `src/lib/market/providers/coinglass-provider.ts`
- Modify: `src/lib/market/types.ts`
- Modify: `src/components/radar/system-health-panel.tsx`
- Test: `src/lib/market/universe-registry.test.ts`

- [ ] **Step 1: Add failing universe coverage tests**

Tests must assert:

- Symbols normalize from `BTC`, `BTCUSDT`, `BTC/USDT`.
- Duplicate assets collapse.
- BTC and ETH remain anchor assets.
- Assets can be ranked by priority.
- Coverage report includes total, scanned, pending, skipped, and coverage percent.

- [ ] **Step 2: Implement registry**

Create:

- `normalizeUniverseAsset(value)`
- `buildUniverseRegistry(configuredAssets, observedInstruments)`
- `planUniverseScan(registry, batchSize, now)`
- `buildCoverageReport(registry, batchPlan)`

- [ ] **Step 3: Expose coverage in scan metadata**

Modify `src/lib/market/types.ts` and CoinGlass provider metadata notes to expose current scan coverage as structured data, not only text notes.

- [ ] **Step 4: Show coverage in UI**

Modify `src/components/radar/system-health-panel.tsx` to show coverage status compactly:

- scanned assets
- pending assets
- batch index
- next batch
- provider status

- [ ] **Step 5: Verify and commit**

```bash
npm run test:market
npm run typecheck
npm run lint
git add src/lib/market/universe-registry.ts src/lib/market/universe-registry.test.ts src/lib/market/provider-registry.ts src/lib/market/providers/coinglass-provider.ts src/lib/market/types.ts src/components/radar/system-health-panel.tsx
git commit -m "feat: add contract universe coverage"
```

## Task 5: AI Counter-Review Layer

**Files:**
- Create: `src/lib/analysis/ai-reviewer.ts`
- Create: `src/lib/analysis/ai-reviewer.test.ts`
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/market/radar-snapshot.ts`
- Modify: `src/components/radar/strategy-card.tsx`
- Modify: `docs/deployment-checklist.md`
- Test: `src/lib/analysis/ai-reviewer.test.ts`

- [x] **Step 1: Add failing AI boundary tests**

Tests must assert:

- AI input contains only structured signal, evidence, and snapshot metadata.
- Prompt tells the model to find counter-evidence first.
- Missing `AI_API_KEY` returns disabled status.
- Model error returns fallback review and does not crash.
- Output is parsed into fact, reasoning, judgment, strategy, failure path, and uncertainty sections.

- [x] **Step 2: Implement model-agnostic reviewer**

Create:

- `buildAiReviewPrompt(signal, context)`
- `parseAiReviewResponse(text)`
- `reviewSignalWithAi({ signal, context, env, fetcher })`
- `disabledAiReview(reason)`

The function must support OpenAI-compatible APIs by configuration and must not expose API keys to the client.

- [x] **Step 3: Attach AI review as optional evidence**

Modify the snapshot builder so AI review enriches signals only when enabled. If disabled or failed, the UI shows a small disabled/fallback status instead of hiding the boundary.

- [x] **Step 4: Verify and commit**

```bash
npm run test:market
npm run typecheck
npm run lint
git add src/lib/analysis/ai-reviewer.ts src/lib/analysis/ai-reviewer.test.ts src/lib/analysis/types.ts src/lib/market/radar-snapshot.ts src/components/radar/strategy-card.tsx docs/deployment-checklist.md
git commit -m "feat: add guarded AI signal review"
```

## Task 6: Outcome Tracking And Self-Improvement

**Files:**
- Create: `src/lib/journal/outcome-tracker.ts`
- Create: `src/lib/journal/outcome-tracker.test.ts`
- Modify: `src/lib/journal/journal-entry.ts`
- Modify: `src/lib/journal/rank-engine.ts`
- Modify: `src/lib/persistence/persistence-contract.ts`
- Modify: `src/components/radar/journal-panel.tsx`
- Test: `src/lib/journal/outcome-tracker.test.ts`

- [x] **Step 1: Add failing lifecycle tests**

Tests must assert:

- A tracked signal schedules 1h, 4h, and 24h review checkpoints.
- A price hitting invalidation before target records loss or saved-loss depending on action.
- A price hitting target before invalidation records win.
- A signal that never triggers expires without rank reward.
- Rank rewards discipline more than blind wins.

- [x] **Step 2: Implement outcome tracker**

Create:

- `buildReviewSchedule(signal, createdAt)`
- `evaluateSignalOutcome(signal, candles, schedule)`
- `buildLifecycleJournalEvent(signal, outcome)`
- `deriveRuleAdjustment(outcomes)`

- [x] **Step 3: Persist lifecycle fields**

Modify persistence schema payload mapping so lifecycle details are saved in JSON payload and indexed where already supported by symbol and created time.

- [x] **Step 4: Display review checkpoints**

Modify journal UI to show:

- next review time
- current outcome
- trigger hit
- invalidation hit
- lesson tags

- [x] **Step 5: Verify and commit**

```bash
npm run test:market
npm run typecheck
npm run lint
git add src/lib/journal/outcome-tracker.ts src/lib/journal/outcome-tracker.test.ts src/lib/journal/journal-entry.ts src/lib/journal/journal-entry.test.ts src/lib/analysis/types.ts src/lib/persistence/persistence-contract.ts src/lib/persistence/persistence-contract.test.ts src/lib/persistence/persistence-store.ts src/lib/persistence/database-client.test.ts src/components/radar/journal-panel.tsx src/app/globals.css src/data/mock-signals.ts docs/chuan-market-radar-blueprint.md docs/superpowers/plans/2026-06-14-chuan-market-radar-buildout.md
git commit -m "feat: add signal outcome tracking"
```

## Task 7: Alert Policy

**Files:**
- Create: `src/lib/alerts/alert-policy.ts`
- Create: `src/lib/alerts/alert-policy.test.ts`
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `src/components/radar/event-center-panel.tsx`
- Test: `src/lib/alerts/alert-policy.test.ts`

- [x] **Step 1: Add failing alert policy tests**

Tests must assert:

- `near_trigger` creates high severity.
- `triggered` creates critical severity.
- Repeated same-symbol same-state alerts are suppressed within the dedupe window.
- Quiet hours suppress sound but keep event log entries.
- System stale/failed state creates operations alert.

- [x] **Step 2: Implement policy**

Create:

- `buildAlertEvent(signal, metadata)`
- `shouldSuppressAlert(event, previousEvents, now)`
- `soundProfileForSeverity(severity)`
- `notificationCopyForAlert(event)`

- [x] **Step 3: Wire browser-side alerts**

Modify `radar-workspace.tsx` so alert policy controls sound and optional browser notifications. Do not request browser notification permission on first page load; request only after user enables alerts.

- [x] **Step 4: Verify and commit**

```bash
npm run test:market
npm run typecheck
npm run lint
git add src/lib/alerts/alert-policy.ts src/lib/alerts/alert-policy.test.ts src/components/radar/radar-workspace.tsx src/components/radar/event-center-panel.tsx src/app/globals.css package.json tsconfig.market-test.json docs/chuan-market-radar-blueprint.md docs/deployment-checklist.md docs/superpowers/plans/2026-06-14-chuan-market-radar-buildout.md
git commit -m "feat: add alert policy"
```

## Task 8: Blueprint Status Update

**Files:**
- Modify: `docs/chuan-market-radar-blueprint.md`
- Modify: `docs/deployment-checklist.md`

- [ ] **Step 1: Update completed stage status**

After each task above is implemented, update `docs/chuan-market-radar-blueprint.md` so the "当前已落地模块" and "当前未完整落地模块" sections match the actual code.

- [ ] **Step 2: Update deployment requirements**

Update `docs/deployment-checklist.md` with any new environment variables, public API dependencies, and operational checks introduced by the task.

- [ ] **Step 3: Verify docs and repo state**

Run:

```bash
npm run test:market
npm run typecheck
npm run lint
git status --short
```

Expected: tests pass and only intended files are modified before commit.

## Execution Rules

- Do not mark a task complete without running its verification commands.
- After each task, report:
  - success or failure
  - files changed
  - tests run
  - next task
- Do not call a skeleton a completed capability.
- Do not narrow multi-timeframe analysis back to only `15m`, `1h`, or `4h`.
- Do not make BTC/ETH conflicts absolute hard stops.
- Do not expose API keys to client components.
- Do not replace existing stable behavior with a large rewrite unless tests first capture the old behavior.
