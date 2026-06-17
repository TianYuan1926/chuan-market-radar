# Chuan Market Radar Next Build Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next stable sequence for Chuan Market Radar without drifting from the core mission: early contract-market anomaly capture, evidence-backed long/short strategy, clear invalidation, and review-driven self-improvement.

**Architecture:** Keep the radar as a modular opportunity operating system: data source -> scan planner -> analysis engine -> strategy plan -> journal/outcome -> calibration -> UI. Experimental features stay shadow-only or local-only until tests, rollback boundaries, and health reporting prove they are safe.

**Tech Stack:** Next.js App Router, TypeScript, Node test, Neon/Postgres repository layer, CoinGlass amateur API, public OHLCV provider, Vercel Hobby, GitHub Actions external cron, Product Design for frontend UI work.

---

## Current Position

The project is currently in a product/UI route rebaseline before the next frontend rebuild. This plan is now superseded for frontend UI reset work by `docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md` and `docs/superpowers/plans/2026-06-17-ui-reset-living-radar-cockpit.md`.

- Blueprint and long-term principles are solidified.
- CoinGlass, Neon, scan archive, daily movers, journal, rank, alert basics, OHLCV cache, outcome executor, readonly calibration, audit, protected manual execution ledger, shadow weights, shadow evaluation, activation gate, scan budget dashboard, signal dossier, and the first living-radar UI pass exist.
- The user rejected the current surface as too paper-like, too static, and not visually strong enough. The next correct target is not another small polish pass.
- The corrected frontend route is a real Tailwind CSS + daisyUI UI reset, not a custom-CSS shell with daisyUI-style naming. The desired product form remains a Live Navbar / Banner, one Cockpit Card, desktop columns at 2:6:2, a short boot/briefing layer, session clock, and visible runtime feedback.
- Altcoins and new listings remain the primary opportunity target. BTC/ETH/ETF/CoinGlass macro data becomes the market weather layer, not a replacement for the altcoin opportunity board.
- Mainland China access work is intentionally excluded from the current roadmap. Do not add ICP, mainland CDN, or mainland hosting tasks to this flow unless the user explicitly reopens that decision.
- Latest v3 backend progress: Signal Dossier already has Key Level Map, Forward Map, multi-timeframe trend context, trend scores, and readonly conflict output. Altcoin Opportunity Board now also surfaces v3 trend state, v3 decision, v3 risk gate, and first no-participation reason without changing live ranking or CoinGlass request volume.

## Build Rules For Every Stage

- [ ] Re-read `docs/chuan-market-radar-blueprint.md` before coding.
- [ ] Keep CoinGlass requests bounded by existing quota settings; prefer public OHLCV for K line work.
- [ ] Keep Neon writes low-frequency and summary-first.
- [ ] Never turn daily movers, AI, pet copy, or alerts into direct buy/sell orders.
- [ ] Maintain these verification commands before handoff:

```bash
npm run test:market
npm run typecheck
npm run lint
npm run build
git diff --check
```

- [ ] For frontend stages, use Product Design first, then verify desktop and mobile with Browser screenshots and overflow checks.
- [ ] Codex should stage/commit/push when local GitHub credentials allow it. If HTTPS credentials are unavailable, Codex must still commit locally, report the exact GitHub Desktop Summary, and let the user push from GitHub Desktop.

---

## Phase 0: Rebaseline Product And UI Direction

**Purpose:** Lock the new design and build route before touching the frontend shell, so the UI rebuild does not drift into another small cosmetic patch.

**Files likely involved:**

- Modify: `docs/chuan-market-radar-blueprint.md`
- Modify: `docs/superpowers/plans/2026-06-16-chuan-market-radar-next-build-flow.md`
- Modify: `src/lib/api/repository-hygiene.test.ts`

**Steps:**

- [x] Add a repository hygiene test that requires the blueprint and build plan to mention the new radar control-center route.
- [x] Record the new constraints: Tailwind CSS + daisyUI, Live Navbar / Banner, Cockpit Card, left / center / right = 2 : 6 : 2, 雷达之眼 / Crystal Lens, no background music, boot/briefing, session clock, and runtime feedback.
- [x] Reorder the build flow around UI shell, runtime layer, altcoin board, and macro radar before deeper character/cosmetic work.
- [x] Run full verification.

**Acceptance:**

- The blueprint is the fact source for the redesigned UI route.
- The build plan tells the next worker exactly what to build next.
- Future UI work cannot silently fall back to the old paper-like layout.

**GitHub Desktop Summary:**

```text
Rebaseline radar UI roadmap
```

---

## Phase 8.2b Legacy: Custom-CSS Shell Probe

**Purpose:** This phase is a historical shell probe, not the final UI reset. It improved the current page structure with Live Navbar / Banner, Crystal Lens slot, Cockpit Card, and 2:6:2 layout language, but it did not actually install or configure Tailwind CSS and daisyUI.

**Files likely involved:**

- Modify: `src/app/globals.css`
- Modify: `src/components/radar/radar-workspace.tsx`
- Add asset under `public/` only if the 雷达之眼 / Crystal Lens source image is committed or recreated as a web-safe asset.

**Steps:**

- [x] Use Product Design brief as the frontend design source.
- [x] Inspect current styles, Tailwind setup, component boundaries, and responsive pain points.
- [x] Keep the stable custom CSS stack and implement a daisyUI-style cockpit structure without adding dependency risk.
- [x] Build the top Live Navbar / Banner with "川", scan heartbeat, freshness, countdown, market session, and health badges.
- [x] Replace the scattered page feel with one Cockpit Card.
- [x] Implement desktop layout: left / center / right = 2 : 6 : 2.
- [x] Implement mobile layout: stacked sections with the opportunity board first, then selected signal, then system/macro/supporting panels.
- [x] Fix current desktop text clipping around the candidate pool.
- [x] Keep existing APIs and business logic unchanged in this phase.
- [ ] Browser-check desktop and mobile for overflow, text clipping, and readable density.
- [x] Run automated verification: `npm run test:market`, `npm run typecheck`, `npm run lint`, and `npm run build`.

**Acceptance:**

- This phase is not enough for the user's updated request.
- Do not claim Tailwind CSS or daisyUI are implemented based on this phase alone.
- The corrected next phase is Phase 8.2b-R in the 2026-06-17 UI reset plan.

**GitHub Desktop Summary:**

```text
Probe radar UI shell
```

Historical Summary token retained for repository hygiene compatibility:

```text
Rebuild radar UI shell
```

---

## Superseded Frontend Route

Frontend implementation should now continue from:

- Spec: `docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md`
- Plan: `docs/superpowers/plans/2026-06-17-ui-reset-living-radar-cockpit.md`

The first active implementation task is **Phase 8.2b-R: Tailwind And DaisyUI Foundation**.

---

## Phase 8.2c: Live Radar Runtime Layer

**Purpose:** Add the movement and operational feedback that makes the site feel alive without turning it into decorative noise.

**Files likely involved:**

- Create or modify: `src/lib/time/market-session.ts`
- Create or modify: `src/components/radar/market-session-clock.tsx`
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `src/components/radar/event-center-panel.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/api/repository-hygiene.test.ts`

**Steps:**

- [ ] Add a short, skippable startup animation / intro briefing.
- [ ] Add market-session clock: Asia, London, New York, overlap, weekend/low-liquidity notes.
- [ ] Add scan heartbeat, next-scan countdown, stale-data dimming, and event stream movement.
- [ ] Add runtime badges for provider, database, archive, budget, and cron freshness.
- [ ] Respect `prefers-reduced-motion`.
- [ ] Keep background music deleted; this phase does not add music.
- [ ] Browser-check desktop/mobile motion, layout stability, and reduced-motion fallback.
- [ ] Run full verification.

**Acceptance:**

- The user can tell whether the site is operating, stale, degraded, or waiting for the next scan.
- Motion maps to actual state changes.
- The runtime layer does not hide market evidence.

**GitHub Desktop Summary:**

```text
Add live radar runtime layer
```

---

## Phase 3.8: Altcoin Opportunity Board

**Purpose:** Make altcoins and new listings the primary decision surface, because the product goal is early long/short opportunity detection in high-upside contract names.

**Files likely involved:**

- Create: `src/lib/market/altcoin-opportunity-board.ts`
- Create: `src/lib/market/altcoin-opportunity-board.test.ts`
- Create or modify: `src/components/radar/altcoin-opportunity-board.tsx`
- Modify: `src/lib/api/scan-response.ts` or related mappers if needed.
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `docs/chuan-market-radar-blueprint.md`

**Steps:**

- [x] Derive board groups from existing scan, universe, daily mover, alert, and journal data before adding new external requests.
- [x] Group opportunities: long warming, short warming, overextended/no chase, new/long-tail watch, and data-insufficient watch.
- [x] Show why each symbol is on the board: trigger gap, OI/funding/volume evidence, BTC/ETH environment, scan tier, and stale state.
- [x] Add action links into Signal Dossier and TradingView.
- [x] Keep board labels conditional and evidence-backed, not buy/sell orders.
- [x] Add tests for grouping, stale handling, no-FOMO labels, and v3 risk gate display.
- [x] Surface v3 trend state, v3 decision, v3 risk gate, and first no-participation reason from readonly `strategyV3.trendContext`.
- [ ] Run full verification after the current v3 risk-gate stage.

**Acceptance:**

- The homepage answers "which altcoins should I pay attention to now and why".
- New/long-tail assets can be watched without pretending data quality is equal to BTC/ETH.
- The board reuses existing data and does not spike CoinGlass usage.

**GitHub Desktop Summary:**

```text
Add altcoin opportunity board
```

## Phase 4V3-6: v3 Risk Gate And No-Participation Reasons

**Purpose:** Make the v3 engine explain why a signal is blocked, waiting, conflicting, or only watchable directly on the primary opportunity surface.

**Files likely involved:**

- Modify: `src/lib/analysis/v3/types.ts`
- Modify: `src/lib/analysis/v3/trend-context.ts`
- Modify: `src/lib/analysis/v3/current-signal-dossier.test.ts`
- Modify: `src/lib/market/altcoin-opportunities.ts`
- Modify: `src/lib/market/altcoin-opportunities.test.ts`
- Modify: `src/components/radar/altcoin-opportunity-board.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/chuan-market-radar-blueprint.md`

**Steps:**

- [x] Add RED tests for trend-context risk gate and no-participation reasons.
- [x] Add board mapper tests proving v3 risk gate does not change opportunity grouping.
- [x] Add UI hygiene test requiring `v3风控` and `不参与原因`.
- [x] Implement readonly `riskGate` and `noParticipationReasons` on `StrategyV3TrendContext`.
- [x] Map v3 state, decision, risk gate, and no-participation reason into `AltcoinOpportunityItem`.
- [x] Render compact v3 risk and no-participation blocks in the opportunity card.
- [ ] Run full verification and commit.

**Acceptance:**

- User can see why v3 blocks or waits without opening every dossier.
- The board still does not output execution orders.
- No CoinGlass request count or live ranking changes.

**GitHub Desktop Summary:**

```text
Surface v3 risk gate on opportunities
```

---

## Phase 3.9: BTC ETH Macro Radar

**Purpose:** Add BTC/ETH and CoinGlass-supported macro context as market weather that changes opportunity confidence, timing, and risk.

**Files likely involved:**

- Create: `src/lib/market/macro-radar.ts`
- Create: `src/lib/market/macro-radar.test.ts`
- Create or modify: `src/components/radar/macro-radar-panel.tsx`
- Modify: `src/lib/analysis/*` only if a read-only environment score already exists and can be safely extended.
- Modify: `docs/chuan-market-radar-blueprint.md`

**Steps:**

- [ ] Use existing BTC/ETH anchors, funding/OI/liquidation fields, scan metadata, and cached OHLCV first.
- [ ] Add ETF-related fields only after probing the actual CoinGlass Hobbyist endpoint with the configured key and documenting availability.
- [ ] Output regimes: tailwind, headwind, chop, leverage crowded, deleveraging, volatility expansion, and data unknown.
- [ ] Feed macro status into UI ordering/explanations first; do not silently mutate strategy weights in this phase.
- [ ] Add tests for regime classification and unknown-data fallback.
- [ ] Run full verification.

**Acceptance:**

- BTC/ETH context is visible and useful without burying the altcoin opportunity board.
- Unknown or unavailable ETF data is shown as unavailable, not guessed.
- Macro context explains risk and timing rather than becoming a direct signal.

**GitHub Desktop Summary:**

```text
Add BTC ETH macro radar
```

---

## Phase 6.13: Shadow Strategy Weight Layer

**Purpose:** Let the system calculate "what would change if approved weights existed" while guaranteeing live scan decisions still use current production rules.

**Files likely involved:**

- Create: `src/lib/journal/strategy-weight-shadow.ts`
- Create: `src/lib/journal/strategy-weight-shadow.test.ts`
- Modify: `src/lib/api/system-health.ts`
- Modify: `src/lib/api/system-health.test.ts`
- Modify: `src/components/radar/system-health-panel.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/chuan-market-radar-blueprint.md`
- Modify: `docs/modules/daily-mover-review.md`

**Steps:**

- [x] Add failing tests for a shadow report that reads `strategy_weight_change_execution` journal events and outputs `baseWeights`, `shadowWeights`, `diffs`, `status`, `guardrail`, and `canAffectLiveSignals: false`.
- [x] Implement `buildStrategyWeightShadowReport()` with no persistence and no real strategy mutation.
- [x] Add health report integration under `health.outcomes.strategyWeightShadow`.
- [x] Add health panel UI: "影子权重", "当前权重", "建议权重", "差异", "不影响实盘判断".
- [x] Verify empty state: no execution records -> collecting, no scary broken UI.
- [x] Verify approved/increase/decrease/quarantine records change only shadow output.
- [x] Update blueprint and module docs.
- [ ] Run full verification.

**Acceptance:**

- Existing scan/analysis output is unchanged.
- UI can show proposed shadow diffs.
- `canAffectLiveSignals` is always `false`.

**GitHub Desktop Summary:**

```text
Add shadow-only strategy weight layer
```

---

## Phase 6.14: Shadow Outcome Evaluation And Rollback Validation

**Purpose:** Compare shadow recommendations against historical outcomes before any real weight activation is considered.

**Files likely involved:**

- Create: `src/lib/journal/strategy-weight-shadow-evaluation.ts`
- Create: `src/lib/journal/strategy-weight-shadow-evaluation.test.ts`
- Modify: `src/lib/api/system-health.ts`
- Modify: `src/components/radar/system-health-panel.tsx`
- Modify: `docs/chuan-market-radar-blueprint.md`

**Steps:**

- [x] Add tests for evaluating shadow diffs against closed outcome samples, calibration reviews, and strategy confirmations.
- [x] Output buckets: `insufficient_samples`, `improving`, `mixed`, `rollback_watch`, `blocked`.
- [x] Include sample counts, valid/rejected ratio, rollback trigger match, and next action.
- [x] Keep evaluation derived from existing journal events and cached samples. Do not add a new table yet.
- [x] Add UI panel: "影子表现", "样本数", "有效/反证", "回滚压力".
- [x] Update docs to state real activation remains blocked.
- [x] Run full verification.

**Acceptance:**

- A shadow weight can be observed over time.
- The system can say "keep observing", "rollback watch", or "blocked".
- There is still no automatic live weight change.

**GitHub Desktop Summary:**

```text
Add shadow weight outcome evaluation
```

---

## Phase 6.15: Real Weight Activation Boundary Design

**Purpose:** Build the formal gate for future real weight activation without enabling it by default.

**Files likely involved:**

- Create: `src/lib/journal/strategy-weight-activation-gate.ts`
- Create: `src/lib/journal/strategy-weight-activation-gate.test.ts`
- Modify: `src/lib/api/system-health.ts`
- Modify: `src/components/radar/system-health-panel.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/chuan-market-radar-blueprint.md`
- Modify: `docs/deployment-checklist.md`

**Steps:**

- [x] Add tests requiring all activation conditions: enough samples, manual approval, shadow evaluation positive, rollback plan, no blocked/quarantine candidates.
- [x] Implement `buildStrategyWeightActivationGate()` returning `blocked`, `eligible_for_manual_activation`, or `active_disabled_by_config`.
- [x] Add a hard config flag such as `STRATEGY_WEIGHT_ACTIVATION_MODE=disabled|shadow|manual`.
- [x] Default to `disabled`.
- [x] Expose the gate in health, not in the scan engine yet.
- [x] Add system health UI card: "真实权重门禁", "启用模式", "通过项", "阻断项", "不接入扫描".
- [x] Document that enabling real weights is a separate future stage.
- [x] Run full verification.

**Acceptance:**

- The site can explain exactly why real activation is blocked.
- No scan decision changes.
- Future activation has a clear and testable checklist.

**GitHub Desktop Summary:**

```text
Add strategy weight activation gate
```

---

## Phase 3.7: Scan Coverage And CoinGlass Budget Dashboard

**Purpose:** Use the CoinGlass amateur membership better by making coverage, request budget, and scan tiers visible and auditable before later config work.

**Files likely involved:**

- Modify: `src/lib/market/scan-quota.ts`
- Modify: `src/lib/market/universe-registry.ts`
- Modify: `src/lib/api/system-health.ts`
- Modify: `src/components/radar/system-health-panel.tsx`
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `docs/chuan-market-radar-blueprint.md`

**Steps:**

- [x] Add tests for daily request budget display: configured budget, estimated requests per scan, remaining capacity estimate, and capped batch size.
- [x] Add tests for tier coverage: anchors, core alts, hot assets, long tail, skipped.
- [x] Expose coverage details in `/api/health` and scan metadata.
- [x] Add UI section "扫描经济": today budget, batch size, covered/pending/skipped, next tier.
- [x] Do not increase default request volume.
- [x] Run full verification and browser responsive check.

**Acceptance:**

- User can see how much of the market is being covered.
- The site explains why it is not scanning every asset every 15 minutes.
- No CoinGlass request spike.

**GitHub Desktop Summary:**

```text
Expose scan budget and coverage dashboard
```

---

## Phase 2.8 / 4.8: Signal Dossier Foundation

**Purpose:** Fuse modules around one selected signal so the UI stops feeling like separate panels.

**Files likely involved:**

- Create: `src/components/radar/signal-dossier.tsx`
- Create: `src/components/radar/signal-dossier.test.tsx` if component tests are introduced; otherwise use repository hygiene tests.
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `src/components/radar/strategy-card.tsx`
- Modify: `src/components/radar/daily-mover-panel.tsx`
- Modify: `src/components/radar/journal-panel.tsx`
- Modify: `src/app/globals.css`

**Steps:**

- [x] Use Product Design before implementation.
- [x] Define one selected context: symbol, signal, timeframe, daily mover matches, journal history, alert status.
- [x] Add desktop right drawer and mobile bottom sheet.
- [x] Move full evidence, invalidation, journal matches, daily mover correlations, and TradingView link into the dossier.
- [x] Keep main dashboard compact; dossier opens only on selected signal or copilot click.
- [x] Verify keyboard and click behavior.
- [x] Browser check desktop and mobile.

**Acceptance:**

- Clicking a signal opens one coherent dossier.
- Daily mover, journal, chart, and strategy context point to the same symbol.
- The main page becomes easier to scan.

**GitHub Desktop Summary:**

```text
Add signal dossier foundation
```

---

## Phase 8.2: Living Radar UI Second Pass

**Purpose:** Improve beauty, motion, and uniqueness after the core decision flow is clearer.

**Files likely involved:**

- Modify: `src/app/globals.css`
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `src/components/radar/system-health-panel.tsx`
- Modify: `src/components/radar/event-center-panel.tsx`
- Modify: `src/components/radar/scan-replay-panel.tsx`
- Modify: `docs/chuan-market-radar-blueprint.md`

**Steps:**

- [x] Use Product Design first.
- [x] Build UI around "radar cockpit + pixel intelligence room", not generic SaaS cards.
- [x] Replace decorative noise with functional motion: scanning sweep, signal pulse, stale-data dimming, alert state.
- [x] Add reduced-motion fallbacks.
- [x] Tighten spacing, typography hierarchy, and panel density.
- [x] Ensure no text overlap at mobile and desktop sizes.
- [x] Browser screenshot checks at desktop and mobile.

**Acceptance:**

- UI feels more alive and less template-like.
- Motion communicates scan state or risk state.
- No core data is hidden behind decorative effects.

**GitHub Desktop Summary:**

```text
Refine living radar UI pass
```

---

## Phase 8.3: Pixel Male Copilot Replacement

**Purpose:** Migrate away from the old S680 visual direction and make the pet a living signal companion.

**Files likely involved:**

- Create: `src/components/radar/pixel-copilot.tsx`
- Create: `src/lib/copilot/copilot-state.ts`
- Create: `src/lib/copilot/copilot-state.test.ts`
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `src/components/radar/pixel-s680.tsx` only as a temporary compatibility shell or delete when imports are migrated.
- Modify: `src/app/globals.css`
- Modify: `src/lib/api/repository-hygiene.test.ts`

**Steps:**

- [ ] Use Product Design before drawing the character.
- [ ] Add state logic for `idle`, `scanning`, `alert`, `skeptical`, `serious`, `celebrate`, `facepalm`, `sleepy`, `upgrade`.
- [ ] Render pixel male avatar with BTC necklace, expression variants, and small equipment slots.
- [ ] Remove S680 copy from normal UI.
- [ ] Keep character feedback non-executional: no buy/sell calls, no FOMO.
- [ ] Add tests that state selection follows signal/rank/outcome conditions.
- [ ] Browser check desktop and mobile.

**Acceptance:**

- The pet is a stateful pixel male copilot, not a static image.
- It reacts to signal quality, discipline, risk, and review results.
- It remains secondary to the market decision UI.

**GitHub Desktop Summary:**

```text
Replace S680 with pixel copilot
```

---

## Phase 7.2: In-Site Alerts, Sound, And DIY Settings

**Purpose:** Make alerts useful without Telegram/Webhook and without disturbing the radar.

**Files likely involved:**

- Modify: `src/lib/alerts/alert-policy.ts`
- Modify: `src/components/radar/event-center-panel.tsx`
- Create: `src/lib/settings/local-radar-settings.ts`
- Create: `src/lib/settings/local-radar-settings.test.ts`
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `src/app/globals.css`

**Steps:**

- [ ] Add local settings for sound, quiet hours, alert severity threshold, copilot chatter level, and UI density.
- [ ] Persist settings in browser localStorage only; no login and no Neon write needed.
- [ ] Add alert history panel with dedupe, severity, symbol, reason, and action link to signal dossier.
- [ ] Add sound cues for new candidate, near trigger, high risk, review due, upgrade.
- [ ] Respect reduced motion and user mute.
- [ ] Run tests and browser checks.

**Acceptance:**

- Alerts are controllable and useful.
- No Telegram/Webhook is required.
- Settings do not affect server stability.

**GitHub Desktop Summary:**

```text
Add in-site alert settings
```

---

## Phase 4.9: Professional Data Visualization

**Purpose:** Upgrade from summary evidence to inspectable market structure visuals.

**Files likely involved:**

- Create: `src/components/radar/market-structure-chart.tsx`
- Create: `src/lib/market/structure-series.ts`
- Create: `src/lib/market/structure-series.test.ts`
- Modify: `src/components/radar/signal-dossier.tsx`
- Modify: `src/app/globals.css`

**Steps:**

- [ ] Build compact chart data from existing OHLCV cache and scan snapshots.
- [ ] Show multi-timeframe structure, volume expansion, funding/OI snapshot trend when available, and BTC/ETH anchor conflict.
- [ ] Keep TradingView as the deep chart link.
- [ ] Do not introduce heavy chart libraries unless the current UI cannot support the required interaction.
- [ ] Verify rendering and mobile constraints.

**Acceptance:**

- User can inspect why a setup is early, late, confirmed, or invalidated.
- Charts use cached/public data first.
- CoinGlass is not used for every visual refresh.

**GitHub Desktop Summary:**

```text
Add market structure visualization
```

---

## Phase 5.2: Production AI Review, Gated

**Purpose:** Add real AI review only after the rule engine and dossier can expose the facts clearly.

**Files likely involved:**

- Modify: `src/lib/analysis/ai-reviewer.ts`
- Modify: `src/lib/analysis/ai-reviewer.test.ts`
- Modify: `src/lib/api/system-health.ts`
- Modify: `src/components/radar/strategy-card.tsx`
- Modify: `src/components/radar/signal-dossier.tsx`
- Modify: `docs/deployment-checklist.md`

**Steps:**

- [ ] Add env plan for model provider, model name, daily AI budget, max candidates per scan.
- [ ] Review only bounded high-value candidates, not the whole market.
- [ ] Cache AI results by signal id / evidence hash.
- [ ] Keep facts, reasoning, judgment, strategy, uncertainty separated.
- [ ] Add UI state for disabled, budget exhausted, failed, stale, reviewed.
- [ ] AI cannot override rule engine or generate direct execution orders.
- [ ] Run full verification.

**Acceptance:**

- AI becomes a second-layer reviewer.
- Cost and failure are visible.
- Rule engine remains the primary decision system.

**GitHub Desktop Summary:**

```text
Add gated production AI review
```

---

## Phase 3.10: Gradual Market Coverage Expansion

**Purpose:** Move toward full-market scanning without pretending amateur CoinGlass can do high-frequency full coverage.

**Files likely involved:**

- Modify: `src/lib/market/universe-registry.ts`
- Modify: `src/lib/market/scan-batch.ts`
- Modify: `src/lib/market/scan-quota.ts`
- Modify: `src/lib/api/system-health.ts`
- Modify: `docs/deployment-checklist.md`

**Steps:**

- [ ] Expand from current configured assets to discovered tiered universe.
- [ ] Keep BTC/ETH anchors every run.
- [ ] Scan hot/core assets more often, long-tail assets lower frequency.
- [ ] Promote assets from daily movers, recent alerts, and successful outcomes.
- [ ] Add coverage warnings when budget cannot cover the desired pool.
- [ ] Add tests for no request burst and no anchor starvation.

**Acceptance:**

- Coverage increases over time.
- The user can see what is scanned now, pending, skipped, and why.
- Request budget is not exceeded.

**GitHub Desktop Summary:**

```text
Expand quota-aware market coverage
```

---

## Phase 9: Operations, Maintenance, And Route Replanning

**Purpose:** Keep the site maintainable after each major addition.

**Files likely involved:**

- Modify: `docs/chuan-market-radar-blueprint.md`
- Modify: `docs/deployment-checklist.md`
- Modify: `src/lib/api/deployment-readiness.ts`
- Modify: `src/lib/api/deployment-readiness.test.ts`

**Steps:**

- [ ] After each phase, update current completion status.
- [ ] Recompute next priority based on actual failures, user feedback, request budget, and UI pain.
- [ ] Add deployment readiness checks for new required env vars or cron secrets.
- [ ] Keep old plans from becoming fake truth; blueprint remains the fact source.

**Acceptance:**

- The next step is recalculated from reality, not blindly followed.
- Documentation matches code.
- Vercel/Neon/CoinGlass free-tier boundaries stay visible.

**GitHub Desktop Summary:**

```text
Update build roadmap status
```

---

## Recommended Execution Order

1. Phase 0: Rebaseline Product And UI Direction.
2. Phase 8.2b: Rebuild UI Shell With Tailwind And DaisyUI.
3. Phase 8.2c: Live Radar Runtime Layer.
4. Phase 3.8: Altcoin Opportunity Board.
5. Phase 3.9: BTC ETH Macro Radar.
6. Phase 4.9 professional data visualization.
7. Phase 8.3 pixel male copilot replacement.
8. Phase 7.2 in-site alerts, sound, and DIY settings.
9. Phase 5.2 production AI review, gated.
10. Phase 3.10 gradual market coverage expansion.
11. Phase 9 operations and replanning after every phase.

## Why This Order

- Phase 0 prevents roadmap drift before a large UI rebuild.
- The UI shell comes before new visual features because the current pain is the whole page feeling like a static document.
- The runtime layer comes immediately after the shell because the user needs to see the system operating, not just read static values.
- The altcoin board comes before macro and character work because the core objective is early altcoin long/short opportunity discovery.
- BTC/ETH macro comes next as a risk/weather layer that improves timing and confidence without replacing the altcoin focus.
- Pixel copilot, sound, and settings come after the cockpit has a stable layout, so playful systems attach to a real decision surface.
- AI comes late because it should review a mature evidence package, not compensate for missing data structure.
- Full-market expansion remains gradual and quota-aware, not a one-shot "scan everything" feature.
