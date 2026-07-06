# Agent E - Tests And Guards

## Scope

验证本轮新增 guard 是否覆盖 stale READY、WAIT 和 unified decision blocker severity。

## Added / Updated Tests

- `token dossier blocks stale READY drafts that fail unified decision planned entry guard`
- `token dossier maps complete unified WAIT without fabricating a trade plan`
- Existing ready-plan token dossier tests now assert `unifiedDecision.source = unified_decision_engine`.
- Unified decision engine tests now assert blocker severity is present and READY gate blockers are critical.
- Late avoid-chase token dossier test now expects unified `BLOCKED` as primary maturity while preserving legacy `review_only` strategy read.
- Radar signal contract tests assert `unifiedDecision` is exposed consistently with token dossier.
- Frontend display adapter tests assert sniper targets remain empty without unified readyPlan and only use backend unified readyPlan levels.
- UI schema guard tests assert unified decision can block stale READY maturity.

## Targeted Test Result

Command:

```bash
npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js .tmp/market-tests/lib/api/frontend-display-adapters.test.js .tmp/market-tests/lib/decision/unified-decision-engine.test.js .tmp/market-tests/lib/api/ui-schema-guard.test.js
```

Result:

- pass: 52
- fail: 0

## Full Gate Result

See `test-results.md`.

## Verdict

Contract and guard tests cover the key 3.1 failure modes found in this round.
