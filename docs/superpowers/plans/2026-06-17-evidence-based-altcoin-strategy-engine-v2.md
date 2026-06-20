# Evidence-Based Altcoin Strategy Engine v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an evidence-based altcoin strategy engine that identifies compression, accumulation, pre-breakout, breakout confirmation, trend acceleration, exhaustion risk, conflict, and invalidation without using liquidation heatmaps or single-indicator callouts.

**Architecture:** Implement v2 as a parallel, test-first engine under `src/lib/analysis/v2/*` so it can be wired into the current scanner after its contracts are proven. The engine flow is data adapters -> feature extractors -> evidence ledger/fusion -> scoring -> state machine -> decision engine -> report translation. Existing `src/lib/analysis/*` behavior remains stable until v2 is explicitly integrated.

**Tech Stack:** Next.js App Router, TypeScript, Node test, existing market-test TypeScript build, current `@/lib/*` import conventions.

## Global Constraints

- Do not implement Liquidation Heatmap.
- Do not implement liquidation-zone modules.
- Do not implement heatmap provider modules.
- Do not use potential liquidation zones as target, direction, stop loss, or entry basis.
- Do not auto-trade.
- Do not predict guaranteed upside or downside.
- Do not let `report_generator` make trading decisions.
- Do not let any single indicator, data point, or candle pattern produce a final trade decision.
- Every analysis conclusion must be represented as EvidenceItem before Strategy Engine consumption.
- If evidence conflicts, reward/risk is below `3:1`, RiskScore is too high, or structure invalidates, output observation, waiting, conflict, or invalidated.

---

## File Map

Specification files already created:

- `docs/CORE_STRATEGY_SPEC.md`: core goals, non-goals, stages, decisions, scores, entries, exits, risk gates.
- `docs/EVIDENCE_ENGINE_SPEC.md`: EvidenceItem, families, directions, weights, traceability, report boundary.
- `docs/INDICATOR_RULES.md`: RSI, MACD, Bollinger, ATR, EMA/VWAP, ADX, Volume/OBV/CVD interpretation.
- `docs/DATA_RULES.md`: OI, Funding, Long/Short Ratio, taker flow, relative strength, market regime, liquidation-data boundary.
- `docs/GOLDEN_CASES.md`: golden scenarios that become tests.

Implementation files to create in later stages:

- `src/lib/analysis/v2/data/binance-adapter.ts`: normalize public OHLCV/market context inputs.
- `src/lib/analysis/v2/data/coinglass-adapter.ts`: normalize OI, Funding, Long/Short Ratio, taker-flow-like fields when available.
- `src/lib/analysis/v2/data/market-context.ts`: normalize BTC/ETH Macro Weather and relative-strength inputs.
- `src/lib/analysis/v2/features/market-structure.ts`: swing high/low, HH/HL, LH/LL, range and structure state facts.
- `src/lib/analysis/v2/features/level-detector.ts`: previous high/low, range high/low, breakout level, invalidation level.
- `src/lib/analysis/v2/features/range-compression.ts`: ATR/Bollinger/price-range compression facts.
- `src/lib/analysis/v2/features/breakout-quality.ts`: breakout close quality, volume expansion, reclaim/loss checks.
- `src/lib/analysis/v2/features/pullback-quality.ts`: pullback depth, volume contraction, reclaim, support hold.
- `src/lib/analysis/v2/features/fakeout-risk.ts`: failed breakout, wick rejection, return into range.
- `src/lib/analysis/v2/features/trend-integrity.ts`: trend continuation and trend damage facts.
- `src/lib/analysis/v2/features/location-rr.ts`: position quality, stop distance, target distance, reward/risk.
- `src/lib/analysis/v2/evidence/evidence-types.ts`: shared EvidenceItem and family/direction types.
- `src/lib/analysis/v2/evidence/evidence-ledger.ts`: append, dedupe, group, trace evidence items.
- `src/lib/analysis/v2/evidence/evidence-builder.ts`: convert features and interpreted data into EvidenceItem arrays.
- `src/lib/analysis/v2/evidence/evidence-fusion.ts`: enforce family caps, same-source dedupe, technical indicator weight caps.
- `src/lib/analysis/v2/indicators/indicator-registry.ts`: allowed indicator list and source grouping.
- `src/lib/analysis/v2/indicators/indicator-calculator.ts`: uses existing indicator helpers where possible.
- `src/lib/analysis/v2/indicators/indicator-interpreter.ts`: converts indicator facts into EvidenceItem only.
- `src/lib/analysis/v2/derivatives/oi-interpreter.ts`: OI interpretation rules.
- `src/lib/analysis/v2/derivatives/funding-interpreter.ts`: Funding interpretation rules.
- `src/lib/analysis/v2/derivatives/long-short-interpreter.ts`: Long/Short Ratio interpretation rules.
- `src/lib/analysis/v2/derivatives/taker-flow-interpreter.ts`: taker flow or proxy interpretation with data-boundary labels.
- `src/lib/analysis/v2/scoring/pre-move-score.ts`: pre-breakout score.
- `src/lib/analysis/v2/scoring/energy-score.ts`: breakout/trend energy score.
- `src/lib/analysis/v2/scoring/risk-score.ts`: chase/crowding/fakeout/location risk score.
- `src/lib/analysis/v2/scoring/trend-hold-score.ts`: existing-trend management score.
- `src/lib/analysis/v2/scoring/energy-decay-score.ts`: exhaustion and decay score.
- `src/lib/analysis/v2/strategy/market-state-machine.ts`: stage classification.
- `src/lib/analysis/v2/strategy/hypothesis-scorer.ts`: bullish/bearish/neutral hypothesis aggregation.
- `src/lib/analysis/v2/strategy/conflict-detector.ts`: high-weight conflict detection.
- `src/lib/analysis/v2/strategy/risk-gate.ts`: reward/risk, RiskScore, invalidation, stale-data gates.
- `src/lib/analysis/v2/strategy/decision-engine.ts`: final StrategyDecision.
- `src/lib/analysis/v2/strategy/entry-plan.ts`: conditional entry plan.
- `src/lib/analysis/v2/strategy/exit-plan.ts`: targets, partial take profit, trend hold management.
- `src/lib/analysis/v2/strategy/invalidation-rules.ts`: structural invalidation checks.
- `src/lib/analysis/v2/report/report-schema.ts`: structured report schema.
- `src/lib/analysis/v2/report/report-generator.ts`: converts structured result into report sections only.
- `src/lib/analysis/v2/report/chinese-templates.ts`: Chinese labels and copy.

Repository guard files to modify:

- `src/lib/api/repository-hygiene.test.ts`: enforce docs exist and banned liquidation heatmap modules do not exist.
- `tsconfig.market-test.json`: include v2 tests if the current include pattern misses them.

## Task 1: Documentation And Guard Rails

**Files:**
- Create: `docs/CORE_STRATEGY_SPEC.md`
- Create: `docs/EVIDENCE_ENGINE_SPEC.md`
- Create: `docs/INDICATOR_RULES.md`
- Create: `docs/DATA_RULES.md`
- Create: `docs/GOLDEN_CASES.md`
- Modify: `src/lib/api/repository-hygiene.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: specification anchors and repository guard tests.

- [x] **Step 1: Add repository hygiene test for v2 specs and banned liquidation heatmap files**

Add a test that asserts:

```ts
const requiredSpecs = [
  "docs/CORE_STRATEGY_SPEC.md",
  "docs/EVIDENCE_ENGINE_SPEC.md",
  "docs/INDICATOR_RULES.md",
  "docs/DATA_RULES.md",
  "docs/GOLDEN_CASES.md",
];
const bannedPathTokens = [
  "liquidation-heatmap",
  "liquidation-zone",
  "liquidation_heatmap",
  "liquidation_zone",
  "heatmap-provider",
];
```

The test must verify each spec contains `不使用清算热力图` or its relevant English equivalent, and no source path contains banned tokens.

- [x] **Step 2: Run test to verify it passes after specs exist**

Run: `npm run test:market`

Expected: all repository hygiene tests pass.

- [x] **Step 3: Commit**

Commit summary:

```text
Add strategy engine v2 specs
```

## Task 2: Evidence Types And Ledger

**Files:**
- Create: `src/lib/analysis/v2/evidence/evidence-types.ts`
- Create: `src/lib/analysis/v2/evidence/evidence-ledger.ts`
- Test: `src/lib/analysis/v2/evidence/evidence-ledger.test.ts`

**Interfaces:**
- Produces: `EvidenceItem`, `EvidenceFamily`, `EvidenceDirection`, `createEvidenceLedger()`.

- [x] **Step 1: Write failing tests**

Test requirements:

- EvidenceItem requires family, direction, timeframe, fact, reasoning, freshness.
- Ledger groups by family.
- Ledger can trace evidence by id.
- Ledger dedupes same source/timeframe/label.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:market`

Expected: fail because v2 evidence files do not exist.

- [x] **Step 3: Implement evidence types and ledger**

Implement only types and ledger operations. Do not add scoring or strategy logic.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:market`

Expected: all tests pass.

## Task 3: Market Structure And Location Facts

**Files:**
- Create: `src/lib/analysis/v2/features/market-structure.ts`
- Create: `src/lib/analysis/v2/features/level-detector.ts`
- Create: `src/lib/analysis/v2/features/location-rr.ts`
- Test: `src/lib/analysis/v2/features/market-structure.test.ts`
- Test: `src/lib/analysis/v2/features/location-rr.test.ts`

**Interfaces:**
- Consumes: OHLCV candle arrays.
- Produces: facts only: swing points, trend structure, range bounds, location quality, reward/risk.

- [x] **Step 1: Write failing tests from GOLDEN_CASES**

Cover:

- compression inside range does not become long.
- breakout then close back inside range becomes invalidation fact.
- small timeframe breakout near higher timeframe resistance becomes location risk.
- reward/risk below `3:1` blocks trade eligibility.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:market`

Expected: fail because feature extractors do not exist.

- [x] **Step 3: Implement facts only**

Implement feature outputs without `StrategyDecision` strings.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:market`

Expected: all tests pass.

## Task 4: Indicator And Derivatives Interpreters

**Files:**
- Create: `src/lib/analysis/v2/indicators/indicator-registry.ts`
- Create: `src/lib/analysis/v2/indicators/indicator-calculator.ts`
- Create: `src/lib/analysis/v2/indicators/indicator-interpreter.ts`
- Create: `src/lib/analysis/v2/derivatives/oi-interpreter.ts`
- Create: `src/lib/analysis/v2/derivatives/funding-interpreter.ts`
- Create: `src/lib/analysis/v2/derivatives/long-short-interpreter.ts`
- Create: `src/lib/analysis/v2/derivatives/taker-flow-interpreter.ts`
- Test: `src/lib/analysis/v2/indicators/indicator-interpreter.test.ts`
- Test: `src/lib/analysis/v2/derivatives/derivatives-interpreters.test.ts`

**Interfaces:**
- Consumes: feature facts, indicator values, derivative snapshots.
- Produces: EvidenceItem arrays only.

- [x] **Step 1: Write failing tests**

Cover:

- RSI overbought does not output short.
- MACD cross does not output buy or sell.
- Bollinger squeeze outputs compression evidence with neutral direction.
- OI up alone does not output bullish.
- Funding high outputs risk, not strength.
- CVD unavailable produces proxy boundary, not fake CVD.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:market`

Expected: fail because interpreters do not exist.

- [x] **Step 3: Implement interpreters**

Each interpreter returns `{ evidence, dataIssues }` or `{ evidence, ignoredSignals }`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:market`

Expected: all tests pass.

## Task 5: Evidence Fusion And Scoring

**Files:**
- Create: `src/lib/analysis/v2/evidence/evidence-builder.ts`
- Create: `src/lib/analysis/v2/evidence/evidence-fusion.ts`
- Create: `src/lib/analysis/v2/scoring/pre-move-score.ts`
- Create: `src/lib/analysis/v2/scoring/energy-score.ts`
- Create: `src/lib/analysis/v2/scoring/risk-score.ts`
- Create: `src/lib/analysis/v2/scoring/trend-hold-score.ts`
- Create: `src/lib/analysis/v2/scoring/energy-decay-score.ts`
- Test: `src/lib/analysis/v2/evidence/evidence-fusion.test.ts`
- Test: `src/lib/analysis/v2/scoring/scoring.test.ts`

**Interfaces:**
- Consumes: EvidenceItem arrays.
- Produces: fused evidence summary and five numeric scores.

- [x] **Step 1: Write failing tests**

Cover:

- technical indicators cannot exceed `15%`.
- same-source indicators are deduped.
- price structure outranks indicators.
- RiskScore rises when OI spikes, Funding is high, and price stalls.
- PreMoveScore rises for compression plus neutral funding plus relative strength.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:market`

Expected: fail because fusion and scoring files do not exist.

- [x] **Step 3: Implement fusion and scores**

Do not return StrategyDecision from scoring files.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:market`

Expected: all tests pass.

## Task 6: State Machine, Risk Gate, And Decision Engine

**Files:**
- Create: `src/lib/analysis/v2/strategy/market-state-machine.ts`
- Create: `src/lib/analysis/v2/strategy/hypothesis-scorer.ts`
- Create: `src/lib/analysis/v2/strategy/conflict-detector.ts`
- Create: `src/lib/analysis/v2/strategy/risk-gate.ts`
- Create: `src/lib/analysis/v2/strategy/decision-engine.ts`
- Create: `src/lib/analysis/v2/strategy/entry-plan.ts`
- Create: `src/lib/analysis/v2/strategy/exit-plan.ts`
- Create: `src/lib/analysis/v2/strategy/invalidation-rules.ts`
- Test: `src/lib/analysis/v2/strategy/decision-engine.test.ts`

**Interfaces:**
- Consumes: fused evidence, scores, location/risk facts.
- Produces: `MarketStage`, `StrategyDecision`, entry/exit/invalidation plan.

- [x] **Step 1: Write failing tests from all GOLDEN_CASES**

Cover at minimum the 14 documented cases in `docs/GOLDEN_CASES.md`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:market`

Expected: fail because strategy modules do not exist.

- [x] **Step 3: Implement state and decision logic**

Hard gates:

- reward/risk below `3:1` blocks trade signal.
- RiskScore `>= 70` blocks chase.
- invalidation outputs `INVALIDATED`.
- high-weight conflict outputs `CONFLICT` or `WATCH_ONLY`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:market`

Expected: all tests pass.

## Task 7: Report Schema And Chinese Templates

**Files:**
- Create: `src/lib/analysis/v2/report/report-schema.ts`
- Create: `src/lib/analysis/v2/report/report-generator.ts`
- Create: `src/lib/analysis/v2/report/chinese-templates.ts`
- Test: `src/lib/analysis/v2/report/report-generator.test.ts`

**Interfaces:**
- Consumes: Strategy Engine structured result.
- Produces: Chinese report sections only.

- [x] **Step 1: Write failing tests**

Cover:

- report output includes evidence ids.
- report cannot change `StrategyDecision`.
- conflict and invalidation are preserved.
- watch-only is not phrased as trade entry.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:market`

Expected: fail because report modules do not exist.

- [x] **Step 3: Implement report translation**

Report generator maps structured fields to Chinese copy without adding new judgment.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:market`

Expected: all tests pass.

## Task 8: Integration Boundary With Current Radar

**Files:**
- Modify: `src/lib/analysis/engine.ts` or current analysis entrypoint after verifying actual file ownership.
- Test: current market tests plus new integration tests.

**Interfaces:**
- Consumes: v2 structured result.
- Produces: structured market stage, evidence trace, risk gate, no-trade reason.

- [x] **Step 1: Write failing integration tests**

Cover:

- v2 output is exposed through structured data without replacing existing signal state.
- no liquidation heatmap concepts appear in structured output.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:market`

Expected: fail because v2 is not wired.

- [x] **Step 3: Wire read-only v2 output**

Integrate as read-only explanation first. Do not change live ranking until v2 passes review samples.

- [x] **Step 4: Run full verification**

Run:

```bash
npm run test:market
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands pass.

## Execution Notes

- Implement one task per commit.
- Keep v2 read-only until golden cases and API traceability are stable.
- Do not add dependencies unless a later task proves existing helpers cannot support the required calculation.
- Do not introduce full-market heavy analysis before the light-scan plus candidate-heavy boundary is wired.
