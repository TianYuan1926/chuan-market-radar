# Seven Flow Autonomous Buildout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining seven Chuan Market Radar buildout flows as independently verifiable delivery blocks without drifting from the core altcoin trend-switch radar objective.

**Architecture:** Preserve the current Next.js App Router, Neon repository, CoinGlass low-rate provider, Strategy Engine v2/v3, and light liquid-glass UI. Each flow lands as small tested modules, read-only or guarded by explicit gates first, then progressively connects to live ranking only after samples and rollback controls exist.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, daisyUI, Neon serverless SQL, CoinGlass Hobbyist API, public OHLCV providers, Node test runner.

## Global Constraints

- The product is an altcoin trend-switch radar, not an automatic trading bot.
- Do not implement liquidation heatmap, LiquidationZone, or heatmap-provider decision logic.
- CoinGlass Hobbyist API must be budgeted, cached, low-rate, and reused; public OHLCV handles candles whenever possible.
- Full-market scanning is two-layered: light scan covers the market, deep analysis only runs on candidates.
- Reports, AI, UI, pets, sounds, and alerts cannot override structured evidence, risk gates, or invalidation.
- No Telegram/Webhook alert work; alerts remain in-app/browser-only.
- UI Phase 8 is closed; future UI changes must follow core functionality and stay scoped.
- Each delivery block must update blueprint state, add/adjust tests, run verification, and commit.

---

### Task 1A: Full-Market Priority Scan Depth

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/market/universe-registry.ts`
- Modify: `/Users/chuan/Documents/web/src/lib/market/universe-registry.test.ts`
- Modify: `/Users/chuan/Documents/web/src/lib/api/system-health.ts`
- Modify: `/Users/chuan/Documents/web/src/components/radar/system-health-panel.tsx`
- Modify: `/Users/chuan/Documents/web/src/lib/api/repository-hygiene.test.ts`
- Modify: `/Users/chuan/Documents/web/docs/chuan-market-radar-blueprint.md`

**Interfaces:**
- Consumes: `UniversePriorityHint`, `planUniverseScan()`, `buildCoverageReport()`, `SystemHealthReport.fullMarketCoverage`
- Produces: high-priority scan lane metadata, candidate reason counts, and operator-readable next-scan explanation without increasing CoinGlass requests.

- [x] Add failing tests for high-priority candidate admission and quota-safe dynamic slots.
- [x] Implement high-priority lane metadata in `planUniverseScan()`.
- [x] Surface high-priority lane summary in `/api/health` and the health panel.
- [x] Update blueprint and repository hygiene tests.
- [x] Run `npm run typecheck`, `npm run test:market`, `npm run lint`, `npm run build`, and browser/API smoke if UI changes materially.
- [x] Commit as `Enhance full-market priority scan depth`.

### Task 1B: Coverage Drilldown And Exchange Quality

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/api/system-health.ts`
- Modify: `/Users/chuan/Documents/web/src/components/radar/system-health-panel.tsx`
- Modify: `/Users/chuan/Documents/web/src/lib/market/universe-registry.ts`
- Modify: `/Users/chuan/Documents/web/src/lib/api/repository-hygiene.test.ts`
- Modify: `/Users/chuan/Documents/web/docs/chuan-market-radar-blueprint.md`

**Interfaces:**
- Consumes: `metadata.coverage.exchangeCoverage` and `exchangeCoverageSummary`
- Produces: exchange-quality drilldown, unsupported venue explanation, and next coverage actions.

- [x] Add tests for exchange-quality drilldown rows and no-extra-request guardrail.
- [x] Implement health report drilldown fields.
- [x] Render compact front-end drilldown in System Health.
- [x] Update blueprint, run `npm run typecheck`, `npm run test:market`, `npm run lint`, and `npm run build`; Playwright recheck was blocked by tool approval after 1A browser smoke had already verified the same settings panel route.
- [x] Commit as `Add exchange coverage drilldown`.

### Task 2: Data Quality Enforcement And Aggregation Explainability

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/market/providers/coinglass-provider.ts`
- Modify: `/Users/chuan/Documents/web/src/lib/market/providers/coinglass-mapper.ts`
- Modify: `/Users/chuan/Documents/web/src/lib/api/system-health.ts`
- Modify: `/Users/chuan/Documents/web/src/components/radar/system-health-panel.tsx`
- Modify: tests under `/Users/chuan/Documents/web/src/lib/market/providers/` and `/Users/chuan/Documents/web/src/lib/api/`

**Interfaces:**
- Consumes: CoinGlass market rows, quality rejection counters, primary-row selection.
- Produces: transparent aggregation decision, dirty-row examples, and blocking/degrading rules.

- [ ] Lock rejection and aggregation behavior with tests.
- [ ] Add primary-row selection reason output.
- [ ] Expose examples and operator actions in health.
- [ ] Update blueprint, verify, commit.

### Task 3: Multi-Timeframe Market Structure Deepening

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/analysis/v3/*`
- Modify: `/Users/chuan/Documents/web/src/components/radar/signal-dossier.tsx`
- Modify: `/Users/chuan/Documents/web/src/components/radar/chart-panel.tsx`
- Modify: related v3 tests.

**Interfaces:**
- Consumes: existing OHLCV candles and v3 context.
- Produces: richer market reading facts, pattern support, Fibonacci/harmonic auxiliary evidence, and clearer chart/dossier traceability.

- [ ] Add structure and pattern golden tests.
- [ ] Implement facts first, then evidence, then read-only display.
- [ ] Keep technical and pattern evidence low-weight and traceable.
- [ ] Update blueprint, verify, commit.

### Task 4: V3 Strategy Loop Practical Readiness

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/api/system-health.ts`
- Modify: `/Users/chuan/Documents/web/src/lib/analysis/v3/*`
- Modify: `/Users/chuan/Documents/web/src/components/radar/altcoin-opportunity-board.tsx`
- Modify: `/Users/chuan/Documents/web/src/components/radar/signal-dossier.tsx`

**Interfaces:**
- Consumes: v3 key levels, forward maps, trade plans, review samples.
- Produces: readiness grading and candidate explanation without changing live ranking.

- [ ] Add tests for v3 readiness buckets.
- [ ] Connect readiness to opportunity and dossier explanations.
- [ ] Preserve no-auto-trade and no-live-weight guards.
- [ ] Update blueprint, verify, commit.

### Task 5: Review Evolution And Safe Weight Activation

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/journal/*`
- Modify: `/Users/chuan/Documents/web/src/lib/api/system-health.ts`
- Modify: `/Users/chuan/Documents/web/src/components/radar/journal-panel.tsx`
- Modify: `/Users/chuan/Documents/web/src/components/radar/system-health-panel.tsx`

**Interfaces:**
- Consumes: outcome executor, manual confirmations, shadow weights, rollback gates.
- Produces: stronger sample admission, rollback validation, and still-disabled live activation unless separate release criteria pass.

- [ ] Add tests for sample floor, rollback pressure, and activation blockers.
- [ ] Improve manual/readonly evolution panels.
- [ ] Keep `canAutoAdjustWeights=false` and live ranking unchanged.
- [ ] Update blueprint, verify, commit.

### Task 6: AI Counter-Evidence Production Boundary

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/analysis/ai-reviewer.ts`
- Modify: `/Users/chuan/Documents/web/src/components/radar/strategy-card.tsx`
- Modify: `/Users/chuan/Documents/web/src/components/radar/signal-dossier.tsx`
- Modify: AI tests.

**Interfaces:**
- Consumes: structured signal evidence and metadata.
- Produces: model-cost boundary, counter-evidence summary, uncertainty, and replay calibration hooks.

- [ ] Add tests for cost-safe disabled/configured modes.
- [ ] Add multi-model/config surface only if env keys exist; otherwise keep visible disabled state.
- [ ] Display AI as reviewer, not decider.
- [ ] Update blueprint, verify, commit.

### Task 7: In-App Alert History And Event Center

**Files:**
- Modify: `/Users/chuan/Documents/web/src/lib/alerts/*`
- Modify: `/Users/chuan/Documents/web/src/components/radar/event-center-panel.tsx`
- Modify: `/Users/chuan/Documents/web/src/components/radar/alert-control-panel.tsx`
- Modify: persistence schema only if durable history is implemented.

**Interfaces:**
- Consumes: existing alert events and preferences.
- Produces: in-app alert history, filtering, archive/seen states, and richer sound profile without Telegram/Webhook.

- [ ] Add tests for history retention, filtering, seen/archive behavior.
- [ ] Implement local first; durable only if schema changes are justified.
- [ ] Keep external channels disabled.
- [ ] Update blueprint, verify, commit.

### Final Acceptance

**Files:**
- Modify: `/Users/chuan/Documents/web/docs/chuan-market-radar-blueprint.md`
- Modify: `/Users/chuan/Documents/web/design-qa.md` only if browser UI changed.

**Interfaces:**
- Consumes: all flow outputs.
- Produces: final status report, residual limitations, and deployment notes.

- [ ] Run full verification suite.
- [ ] Run production browser QA for material UI changes.
- [ ] Confirm `/api/health`, `/api/scan`, and deployment readiness.
- [ ] Commit final closeout.
- [ ] Attempt push; report credential blockers if any.
