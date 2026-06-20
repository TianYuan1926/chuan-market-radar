# Altcoin Trend Radar v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Chuan Market Radar into an evidence-based full-market altcoin trend-switching radar without breaking the existing CoinGlass, Neon, scan, journal, daily-mover, outcome, and Strategy Engine v2 foundations.

**Architecture:** Build v3 as an additive layer under `src/lib/analysis/v3/*`. v3 inherits v2 guard rails and adds Market Reading, Key Level, Forward Level Map, trend-switch scoring, and review hooks before it is allowed to mutate live ranking. Frontend consumption must stay read-only until v3 golden cases and review samples prove stability.

**Tech Stack:** Next.js App Router, TypeScript, Node test, existing `npm run test:market`, Neon-compatible persistence boundaries, current public OHLCV and CoinGlass low-quota scan rules.

## Global Constraints

- Do not implement liquidation heatmap, liquidation-zone module, heatmap provider, or potential liquidation-zone trading logic.
- Do not auto-trade or connect exchange trading permissions.
- Do not let `report_generator` decide market direction.
- Every market conclusion must be traceable to structured evidence.
- Full-market work must use two layers: light scan for all symbols, deep scan only for candidates.
- CoinGlass Hobbyist, Neon free tier, and Vercel free tier remain the resource baseline.
- Risk Gate remains above opportunity scores.
- Reward/risk below `3:1` cannot become a trade plan.
- v3 must support both long and short trend-switch paths.

---

## File Map

- Modify: `docs/chuan-market-radar-blueprint.md` to make v3 the current product truth.
- Create: `docs/MARKET_READING_SPEC.md` for v3 reading grammar.
- Create: `docs/KEY_LEVEL_ENGINE_SPEC.md` for zones, statuses, reaction scores, and Forward Map.
- Create: `docs/RISK_GATE_SPEC.md` for v3 hard gates.
- Create: `src/lib/analysis/v3/types.ts` for v3 schema.
- Create: `src/lib/analysis/v3/key-level-engine.ts` for KeyLevel extraction from OHLCV candles.
- Create: `src/lib/analysis/v3/forward-level-map.ts` for S/R route maps.
- Create: `src/lib/analysis/v3/forward-map-review.ts` for review samples that verify whether a pre-built map reacted later.
- Create tests beside each v3 module.
- Modify: `src/lib/api/repository-hygiene.test.ts` to enforce v3 specs and prevent deprecated analysis paths.

## Task 1: v3 Specs And Blueprint

**Files:**
- Modify: `docs/chuan-market-radar-blueprint.md`
- Create: `docs/MARKET_READING_SPEC.md`
- Create: `docs/KEY_LEVEL_ENGINE_SPEC.md`
- Create: `docs/RISK_GATE_SPEC.md`
- Modify: `src/lib/api/repository-hygiene.test.ts`

**Interfaces:**
- Consumes: current blueprint and v2 specs.
- Produces: v3 architecture truth and repository guard tests.

- [x] **Step 1: Update blueprint with v3 positioning**

The blueprint must name `Altcoin Trend Radar v3`, keep Strategy Engine v2 as the inherited safety layer, and remove the old “ordinary anomaly dashboard” direction.

- [x] **Step 2: Add v3 spec documents**

Create docs that define:

```text
MARKET_READING_SPEC.md: RANGE/TREND grammar, HH/HL/LH/LL, BOS, CHoCH, breakout, breakdown, pullback, retest, fakeout.
KEY_LEVEL_ENGINE_SPEC.md: KeyLevel, ForwardLevel, zone status, reaction score, maximum visible levels.
RISK_GATE_SPEC.md: rr gate, structural stop gate, crowding gate, stale data, liquidity, high-timeframe conflict.
```

- [x] **Step 3: Add repository hygiene guard**

Guard requirements:

```text
v3 spec docs exist.
Blueprint names Altcoin Trend Radar v3.
No source path implements heatmap provider or liquidation-zone module.
```

- [x] **Step 4: Run verification**

Run:

```bash
npm run test:market
```

Expected: passes after specs and guard updates.

## Task 2: v3 Types

**Files:**
- Create: `src/lib/analysis/v3/types.ts`
- Test: `src/lib/analysis/v3/types.test.ts`

**Interfaces:**
- Produces: `TrendState`, `TrendDecision`, `KeyLevel`, `ForwardLevel`, `TrendScores`, `TrendRadarReview`.

- [x] **Step 1: Write schema tests**

Tests must assert:

```ts
const level: KeyLevel = {
  id: "BTCUSDT-4h-range-high",
  symbol: "BTCUSDT",
  timeframe: "4h",
  type: "RANGE_HIGH",
  zoneLow: 81800,
  zoneHigh: 83200,
  midPrice: 82500,
  direction: "RESISTANCE",
  keyScore: 84,
  reactionScore: 0,
  confluenceScore: 70,
  status: "POTENTIAL",
  reasons: ["4H range high"],
  confirmationRules: ["4H close above zoneHigh and retest holds"],
  invalidationRule: "4H close back below zoneLow after breakout",
};
```

- [x] **Step 2: Implement types**

Use string literal unions matching the v3 blueprint. Include `KEY_LEVEL` in v3 evidence family, but do not mutate v2 types in this task.

- [x] **Step 3: Run verification**

Run:

```bash
npm run test:market
```

Expected: v3 schema tests pass.

## Task 3: Key Level Engine MVP

**Files:**
- Create: `src/lib/analysis/v3/key-level-engine.ts`
- Test: `src/lib/analysis/v3/key-level-engine.test.ts`

**Interfaces:**
- Consumes: `Candle[]` from `src/lib/market/ohlcv/types`.
- Produces: `buildKeyLevels(input): KeyLevel[]`.

- [x] **Step 1: Write failing tests**

Tests must cover:

```text
1. zones are ranges, not single price points.
2. outputs max 3 supports and 3 resistances.
3. price inside zone becomes ARRIVED.
4. price breaks above resistance zone becomes BROKEN.
5. each level includes reasons, confirmationRules, and invalidationRule.
```

- [x] **Step 2: Implement MVP**

Use swing highs/lows, recent range high/low, simple ATR-derived zone width, and current close to mark status. Do not produce trade decisions.

- [x] **Step 3: Run verification**

Run:

```bash
npm run test:market
```

Expected: Key Level tests pass.

## Task 4: Forward Level Map MVP

**Files:**
- Create: `src/lib/analysis/v3/forward-level-map.ts`
- Test: `src/lib/analysis/v3/forward-level-map.test.ts`

**Interfaces:**
- Consumes: `KeyLevel[]`, current price, symbol.
- Produces: `buildForwardLevelMap(input): ForwardLevel[]`.

- [x] **Step 1: Write failing tests**

Tests must cover:

```text
1. current price has S1/S2/S3 support candidates below it.
2. current price has R1/R2/R3 resistance candidates above it.
3. map includes one INVALIDATION_LEVEL and one TREND_CHANGE_LEVEL when source levels are available.
4. map is generated before future candles are evaluated.
```

- [x] **Step 2: Implement MVP**

Sort support levels below price descending and resistance levels above price ascending. Assign roles deterministically.

- [x] **Step 3: Run verification**

Run:

```bash
npm run test:market
```

Expected: Forward Map tests pass.

## Task 5: Forward Map Review Hook

**Files:**
- Create: `src/lib/analysis/v3/forward-map-review.ts`
- Test: `src/lib/analysis/v3/forward-map-review.test.ts`

**Interfaces:**
- Consumes: a saved `ForwardLevel[]` and future `Candle[]`.
- Produces: readonly `TrendRadarReview` samples.

- [x] **Step 1: Write failing tests**

Tests must cover:

```text
1. support map hit before future reaction is labeled forward_map_review.
2. price touches support and reclaims zoneHigh becomes reaction_confirmed.
3. price slices through without reaction becomes invalidated.
4. output is research_only and canAutoAdjustWeights false.
```

- [x] **Step 2: Implement review hook**

Do not write database records in this task. Return a bounded review object that existing journal/persistence layers can later store.

- [x] **Step 3: Run verification**

Run:

```bash
npm run test:market
```

Expected: Review hook tests pass.

## Task 6: Frontend Reset Boundary

Current frontend implementation was later reset. v3 remains a backend analysis layer and must be reconnected to any future frontend only through stable API contracts.

Expected: all pass.

## Task 7: Full Verification And Commit

**Files:**
- All changed files.

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: verified local commit.

- [x] **Step 1: Run full verification**

Run:

```bash
npm run test:market
npm run typecheck
npm run lint
npm run build
git diff --check
```

- [x] **Step 2: Commit**

Commit summary:

```text
Add altcoin trend radar v3 foundation
```

- [ ] **Step 3: Push**

Run:

```bash
git push origin main
```

Status: attempted after local commit, blocked by GitHub HTTPS authentication: `fatal: could not read Username for 'https://github.com': Device not configured`. Local commit remains intact.
