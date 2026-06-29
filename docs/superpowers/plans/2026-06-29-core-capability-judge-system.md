# Core Capability Judge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable judge system that proves whether Chuan Market Radar can scan early, analyze correctly, produce usable strategy plans, and improve through review.

**Architecture:** Keep the existing production scanning, analysis, strategy, professional backtest, and review modules. Add a layered verification system on top: golden cases for basic logic, three focused audit modes for scan/analysis/strategy, full 10x10 formal audit for overall proof, and shadow-live review for real-time validation.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner, existing `src/lib/backtest/*`, `src/lib/analysis/*`, `src/lib/market/*`, `src/lib/journal/*`, production Docker Compose on Tencent Cloud.

---

## Current Problem

The website now has many capabilities, but the product cannot be judged by "features exist". The core question is:

```text
Can the system find altcoin opportunities early, analyze them correctly, create usable strategy plans, and learn from misses?
```

The latest formal audit showed:

- Scan improved: early setup capture improved from 24.39% to 42.86%.
- Analysis regressed: score dropped from 65.49 to 52.
- Strategy regressed: score dropped from 46.36 to 37.68.
- Trade plan ready count dropped from 1 to 0.

Therefore the next build must not randomly tune scoring. It must first build a stronger judging and remediation system.

## File Map

### Docs

- Modify `docs/chuan-market-radar-blueprint.md`
  - Add this judge-system workflow as the official next build direction.
  - Mark "continuous blind full backtest loops" as forbidden.

- Modify `docs/GOLDEN_CASES.md`
  - Expand current static golden cases into executable test categories.
  - Add expected scan/analysis/strategy outcomes per case.

- Modify `docs/backtest-v2/BACKTEST_TEST_PLAN.md`
  - Add focused audit modes: scan-only, analysis-only, strategy-only.
  - Add round gating: golden cases must pass before formal audit.

- Modify `docs/backtest-v2/PROFESSIONAL_BACKTEST_AUDIT_SPEC.md`
  - Add judging hierarchy and round freeze requirements.

### Golden Case System

- Create `src/lib/backtest/golden-case-types.ts`
  - Defines canonical golden case fixtures, expected outcomes, and pass/fail result schema.

- Create `src/lib/backtest/golden-case-fixtures.ts`
  - Contains hand-built deterministic cases for compression, accumulation, breakout, fakeout, RR failure, high-timeframe conflict, exhaustion, and WAIT plan scenarios.

- Create `src/lib/backtest/golden-case-runner.ts`
  - Runs each fixture through current analysis and strategy logic.

- Create `src/lib/backtest/golden-case-runner.test.ts`
  - Proves golden case runner catches wrong decisions.

### Focused Audit Modes

- Modify `src/lib/backtest/professional-audit.ts`
  - Add `auditMode: "full" | "scan" | "analysis" | "strategy"`.
  - Keep full audit behavior unchanged when mode is `full`.

- Modify `src/lib/backtest/professional-audit-round.ts`
  - Add separate scorecards for scan-only, analysis-only, and strategy-only modes.
  - Preserve existing 10x10 formal audit output.

- Modify `src/scripts/professional-backtest-audit.ts`
  - Add CLI flags:
    - `--audit-mode scan`
    - `--audit-mode analysis`
    - `--audit-mode strategy`
    - `--audit-mode full`
    - `--require-golden-pass`

- Modify `tools/run-professional-backtest.mjs`
  - Pass audit mode flags to the compiled CLI.

- Modify `package.json`
  - Add scripts:
    - `backtest:golden`
    - `backtest:scan-audit`
    - `backtest:analysis-audit`
    - `backtest:strategy-audit`
    - `backtest:formal`

### Strategy Remediation

- Modify `src/lib/analysis/v3/trade-plan.ts`
  - Separate "RR truly invalid" from "RR unknown because target/stop generation is weak".
  - Keep minimum structural RR at `3:1`.

- Modify `src/lib/analysis/v3/location-rr.ts`
  - Add explainable RR diagnostics:
    - entry source
    - stop source
    - target source
    - why RR failed
    - whether better-position wait is possible

- Modify `src/lib/analysis/v3/key-level-engine.ts`
  - Strengthen target and stop candidate generation for early setups.
  - Do not invent targets if structure has no reliable level.

- Modify `src/lib/analysis/v3/reaction-quality.ts`
  - Make WAIT plan trigger quality explicit:
    - touched level
    - did not break structural stop first
    - reaction candle closed in expected direction
    - minimum reaction strength met

### Report and Review UI Data

- Modify `src/lib/api/historical-backtest-readonly.ts`
  - Expose latest golden case status and focused audit status to `/review`.

- Modify `src/components/review/review-evolution.tsx`
  - Add sections:
    - Golden case status
    - Scan audit
    - Analysis audit
    - Strategy audit
    - Formal audit
  - Keep styling consistent with current frontend; do not redesign UI here.

### Shadow Live Validation

- Create `src/lib/journal/shadow-live-signal-tracker.ts`
  - Records current production candidates and their future 4h/24h/3d outcomes.

- Create `src/lib/journal/shadow-live-signal-tracker.test.ts`
  - Verifies paper tracking does not promote unready signals into trade plans.

- Create `src/app/api/admin/shadow-live/run/route.ts`
  - Protected cron endpoint to update shadow-live outcomes.

- Modify `docker-compose.yml`
  - Add or extend existing worker command only if there is already a scheduler pattern available. Do not create a separate complex service if existing dynamic scheduler can call the endpoint.

## Build Phases

### P0: Blueprint and Build Law

Purpose: prevent blind backtest loops.

- [x] Update `docs/chuan-market-radar-blueprint.md`.
- [x] Add rule: formal backtest is not the first debugging tool.
- [x] Add rule: every formal round must follow:

```text
golden cases -> focused audit -> remediation -> formal audit -> report -> no next audit until root fix
```

- [x] Add completion label:

```text
Current judge-system status = 可运行但不完整
```

Validation:

```bash
rg -n "golden cases|focused audit|formal audit|可运行但不完整" docs/chuan-market-radar-blueprint.md
```

Expected: all new rules are present.

### P1: Golden Case Executable Test System

Purpose: stop using expensive full audits to catch basic logic errors.

Golden cases must cover:

1. Compression but no breakout.
2. Accumulation.
3. Pre-breakout.
4. Quality breakout.
5. High-risk breakout.
6. RSI overbought but trend healthy.
7. OI spike but price stalls.
8. RR below 3:1.
9. Breakout falls back into range.
10. Exhaustion risk.
11. Low timeframe bullish but high timeframe resistance.
12. BTC down but alt resilient.
13. Already pumped and too late.
14. Already dumped and too late to short.
15. WAIT pullback should not trigger.
16. WAIT pullback should trigger and stay valid.

Files:

- Create `src/lib/backtest/golden-case-types.ts`.
- Create `src/lib/backtest/golden-case-fixtures.ts`.
- Create `src/lib/backtest/golden-case-runner.ts`.
- Create `src/lib/backtest/golden-case-runner.test.ts`.

Validation:

```bash
npm run build:market-cli
node --test .tmp/market-tests/lib/backtest/golden-case-runner.test.js
```

Expected:

- All golden cases pass.
- If a case expects `WATCH_ONLY`, runner fails if strategy returns `TRADE_PLAN_READY`.
- If a case expects RR block, runner fails if plan bypasses `3:1`.

### P2: Focused Scan Audit

Purpose: judge only whether the radar finds opportunities early.

Scope:

- Candidate universe.
- TopN pressure.
- Early setup capture.
- Quiet compression capture.
- Early volume capture.
- Missed quality opportunities.
- Baseline comparison with random, volume, momentum.

Status:

- [x] Focused audit CLI mode `scan` is wired.
- [x] Reports include judge-system lane status.
- [x] Package script `backtest:scan-audit` is available.

Files:

- Modify `src/lib/backtest/professional-audit.ts`.
- Modify `src/lib/backtest/professional-audit-round.ts`.
- Modify `src/scripts/professional-backtest-audit.ts`.
- Add tests in `src/lib/backtest/professional-audit-round.test.ts`.

Validation:

```bash
npm run build:market-cli
node .tmp/market-tests/scripts/professional-backtest-audit.js --audit-round --audit-mode scan --days 30 --audit-symbols 10 --candidate-symbols 80 --nodes-per-symbol 10 --top-n 10
```

Expected:

- Report focuses on scan only.
- It does not fail because `TRADE_PLAN_READY=0`.
- It still flags missed early opportunities and TopN pressure.

### P3: Focused Analysis Audit

Purpose: judge whether selected candidates are interpreted correctly.

Scope:

- Direction clarity.
- Structure stage.
- High timeframe conflict.
- Key levels.
- Technical indicators as secondary evidence.
- Derivatives evidence quality.
- False positives.

Status:

- [x] Focused audit CLI mode `analysis` is wired.
- [x] Reports include analysis lane status and summaries.
- [x] Package script `backtest:analysis-audit` is available.

Files:

- Modify `src/lib/backtest/professional-audit.ts`.
- Modify `src/lib/backtest/professional-audit-round.ts`.
- Add tests in `src/lib/backtest/professional-audit.test.ts`.

Validation:

```bash
npm run build:market-cli
node .tmp/market-tests/scripts/professional-backtest-audit.js --audit-round --audit-mode analysis --days 30 --audit-symbols 10 --candidate-symbols 80 --nodes-per-symbol 10 --top-n 10
```

Expected:

- Report answers whether analysis is misclassifying structure or direction.
- It separates "correctly rejected" from "wrongly rejected".
- It lists the top structure/indicator/derivatives mistakes.

### P4: Focused Strategy Audit

Purpose: fix the current biggest failure: no usable trade plan.

Scope:

- RR diagnostics.
- Stop source.
- Target source.
- WAIT trigger validity.
- WAIT outcome.
- Plan-ready strictness.
- Correct no-trade decisions.

Status:

- [x] Focused audit CLI mode `strategy` is wired.
- [x] Focused strategy mode fails only on strategy core metric failure, not unrelated formal-round noise.
- [x] Package script `backtest:strategy-audit` is available.

Files:

- Modify `src/lib/analysis/v3/location-rr.ts`.
- Modify `src/lib/analysis/v3/trade-plan.ts`.
- Modify `src/lib/analysis/v3/key-level-engine.ts`.
- Modify `src/lib/analysis/v3/reaction-quality.ts`.
- Modify `src/lib/backtest/professional-audit-round.ts`.

Validation:

```bash
npm run test:market -- --runInBand
npm run build:market-cli
node .tmp/market-tests/scripts/professional-backtest-audit.js --audit-round --audit-mode strategy --days 30 --audit-symbols 10 --candidate-symbols 80 --nodes-per-symbol 10 --top-n 10
```

Expected:

- It does not lower `3:1`.
- It reports why each plan is blocked.
- It shows whether blocked cases were correct no-trade decisions.
- It improves WAIT plan evaluation without creating fake plan-ready signals.

### P5: Formal Audit Gate

Purpose: run full 10x10 only after basic and focused checks pass.

Status:

- [x] Formal audit supports `--require-golden-pass`.
- [x] Formal audit writes judge-system status into `findings.json` and `summary.md`.
- [x] Package script `backtest:formal` enforces the golden-case gate.

Files:

- Modify `src/scripts/professional-backtest-audit.ts`.
- Modify `tools/run-professional-backtest.mjs`.
- Modify `package.json`.

Gate rule:

```text
Formal audit can run only if:
1. golden cases pass
2. scan focused audit produced a report
3. analysis focused audit produced a report
4. strategy focused audit produced a report
```

Validation:

```bash
npm run backtest:golden
npm run backtest:scan-audit
npm run backtest:analysis-audit
npm run backtest:strategy-audit
npm run backtest:formal
```

Expected:

- Formal audit report includes:
  - golden case status
  - focused audit status
  - full 10x10 result
  - comparison to previous formal round
  - remediation plan

### P6: Shadow Live Validation

Purpose: test current market behavior without risking real funds.

Scope:

- Every live candidate gets recorded.
- It tracks 4h, 24h, and 3d outcomes.
- It records MFE, MAE, whether trigger occurred, whether plan was blocked, and why.
- It does not alter live weights automatically.

Status:

- [x] Shadow-live paper tracker exists.
- [x] Protected admin endpoint exists.
- [x] Existing protected API worker can call the endpoint on schedule.
- [x] Tests prove shadow-live tracking cannot promote signals or auto-change weights.

Files:

- Create `src/lib/journal/shadow-live-signal-tracker.ts`.
- Create `src/lib/journal/shadow-live-signal-tracker.test.ts`.
- Create `src/app/api/admin/shadow-live/run/route.ts`.
- Modify existing scheduler only if it already has admin endpoint support.

Validation:

```bash
npm run test:market
npm run typecheck
```

Production validation:

```bash
curl -sS http://43.161.202.227/api/health
curl -sS http://43.161.202.227/api/frontend/review-contract
```

Expected:

- Shadow-live state appears in review contract.
- It never promotes `EVIDENCE_SIGNAL` into `TRADE_PLAN_READY`.

### P7: Review Page Integration

Purpose: make the judge system visible without making the frontend noisy.

Status:

- [x] Historical backtest readonly loader exposes judge-system status.
- [x] Frontend review contract merges shadow-live journal state into the judge system.
- [x] Review page displays the core capability judge lanes.

Files:

- Modify `src/lib/api/historical-backtest-readonly.ts`.
- Modify `src/app/api/frontend/review-contract/route.ts`.
- Modify `src/components/review/review-evolution.tsx`.

UI sections:

1. Golden case pass/fail.
2. Scan audit status.
3. Analysis audit status.
4. Strategy audit status.
5. Formal audit status.
6. Shadow-live outcome status.

Validation:

```bash
npm run typecheck
npm run build
BASE_URL=http://43.161.202.227 bash deploy/scripts/prod-smoke.sh
```

Expected:

- Review page shows judge-system status.
- It clearly labels `可运行但不完整` when strategy remains weak.
- It does not show "实战可靠" unless scan, analysis, strategy, and shadow-live all pass.

### P8: Production Sync and Final Verification

Purpose: make GitHub, Tencent Cloud, and blueprint consistent.

Commands:

```bash
npm run test:market
npm run typecheck
npm run build
git status --short
git add docs src tools package.json
git commit -m "Build core capability judge system"
git push origin main
npm run production:deploy
npm run production:git-sync
```

Expected:

- Local tests pass.
- GitHub main equals local commit.
- Tencent server equals GitHub main.
- `/api/health` is ready or degraded with explicit reason.
- `/review` shows judge-system status.

## Acceptance Standard

This build is complete only when:

1. Golden cases are executable and passing.
2. Scan audit can run independently.
3. Analysis audit can run independently.
4. Strategy audit can run independently.
5. Full formal audit is gated by the above checks.
6. Shadow-live validation records paper outcomes.
7. Review page exposes the judge-system status.
8. Blueprint records what is complete and what is still `可运行但不完整`.

## Non-Goals

- Do not add auto-trading.
- Do not lower the `3:1` structural RR gate.
- Do not use user leverage assumptions to justify weaker RR.
- Do not let AI replace the rule engine.
- Do not redesign the frontend.
- Do not claim practical reliability from one good backtest round.

## Execution Order

1. P0 Blueprint and build law.
2. P1 Golden cases.
3. P2 Scan audit.
4. P3 Analysis audit.
5. P4 Strategy audit.
6. P5 Formal audit gate.
7. P6 Shadow live validation.
8. P7 Review page integration.
9. P8 Production sync.

The next coding step should start with P0 and P1. P4 is the highest business-impact remediation, but it should not begin until golden cases exist, otherwise strategy changes cannot be judged safely.
