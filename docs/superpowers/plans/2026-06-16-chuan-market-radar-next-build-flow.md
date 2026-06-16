# Chuan Market Radar Next Build Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next stable sequence for Chuan Market Radar without drifting from the core mission: early contract-market anomaly capture, evidence-backed long/short strategy, clear invalidation, and review-driven self-improvement.

**Architecture:** Keep the radar as a modular opportunity operating system: data source -> scan planner -> analysis engine -> strategy plan -> journal/outcome -> calibration -> UI. Experimental features stay shadow-only or local-only until tests, rollback boundaries, and health reporting prove they are safe.

**Tech Stack:** Next.js App Router, TypeScript, Node test, Neon/Postgres repository layer, CoinGlass amateur API, public OHLCV provider, Vercel Hobby, GitHub Actions external cron, Product Design for frontend UI work.

---

## Current Position

The project is currently at the end of the stage 6 deepening path:

- Blueprint and long-term principles are solidified.
- CoinGlass, Neon, scan archive, daily movers, journal, rank, alert basics, OHLCV cache, outcome executor, readonly calibration, audit, and protected manual execution ledger exist.
- Manual execution ledger can be written through `POST /api/admin/strategy-weights/executions/record`, but it cannot change real strategy weights.
- The next correct build target is not automatic weight adjustment. The next target is a shadow-only weight isolation layer.

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
- [ ] User handles GitHub Desktop commit and push. End every stage with a suggested Summary line.

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

**Purpose:** Use the CoinGlass amateur membership better by making coverage, request budget, and scan tiers visible and tunable.

**Files likely involved:**

- Modify: `src/lib/market/scan-quota.ts`
- Modify: `src/lib/market/universe-registry.ts`
- Modify: `src/lib/api/system-health.ts`
- Modify: `src/components/radar/system-health-panel.tsx`
- Modify: `src/components/radar/radar-workspace.tsx`
- Modify: `docs/chuan-market-radar-blueprint.md`

**Steps:**

- [ ] Add tests for daily request budget display: configured budget, estimated requests per scan, remaining capacity estimate, and capped batch size.
- [ ] Add tests for tier coverage: anchors, core alts, hot assets, long tail, skipped.
- [ ] Expose coverage details in `/api/health` and scan metadata.
- [ ] Add UI section "扫描经济": today budget, batch size, covered/pending/skipped, next tier.
- [ ] Do not increase default request volume.
- [ ] Run full verification and browser responsive check.

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

- [ ] Use Product Design before implementation.
- [ ] Define one selected context: symbol, signal, timeframe, daily mover matches, journal history, alert status.
- [ ] Add desktop right drawer and mobile bottom sheet.
- [ ] Move full evidence, invalidation, journal matches, daily mover correlations, and TradingView link into the dossier.
- [ ] Keep main dashboard compact; dossier opens only on selected signal or copilot click.
- [ ] Verify keyboard and click behavior.
- [ ] Browser check desktop and mobile.

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

- [ ] Use Product Design first.
- [ ] Build UI around "radar cockpit + pixel intelligence room", not generic SaaS cards.
- [ ] Replace decorative noise with functional motion: scanning sweep, signal pulse, stale-data dimming, alert state.
- [ ] Add reduced-motion fallbacks.
- [ ] Tighten spacing, typography hierarchy, and panel density.
- [ ] Ensure no text overlap at mobile and desktop sizes.
- [ ] Browser screenshot checks at desktop and mobile.

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

## Phase 3.8: Gradual Market Coverage Expansion

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

1. Phase 6.13 shadow strategy weight layer.
2. Phase 6.14 shadow outcome evaluation and rollback validation.
3. Phase 3.7 scan coverage and CoinGlass budget dashboard.
4. Phase 2.8 / 4.8 signal dossier foundation.
5. Phase 8.2 living radar UI second pass.
6. Phase 8.3 pixel male copilot replacement.
7. Phase 7.2 in-site alerts, sound, and DIY settings.
8. Phase 4.9 professional data visualization.
9. Phase 5.2 production AI review, gated.
10. Phase 3.8 gradual market coverage expansion.
11. Phase 9 operations and replanning after every phase.

## Why This Order

- The first two phases protect the self-improvement loop from becoming unsafe auto-tuning.
- The budget dashboard comes before aggressive coverage expansion because the user needs visibility into the CoinGlass amateur limit.
- Signal dossier comes before the big UI polish because the product needs one fused interaction model before making it beautiful.
- Pixel copilot comes after the dossier because it should open and react to the selected signal context.
- AI comes late because it should review a mature evidence package, not compensate for missing data structure.
- Full-market expansion is gradual and quota-aware, not a one-shot "scan everything" feature.
