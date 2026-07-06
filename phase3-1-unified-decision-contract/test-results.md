# Test Results

## Targeted Tests

Command:

```bash
npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js .tmp/market-tests/lib/api/frontend-display-adapters.test.js .tmp/market-tests/lib/decision/unified-decision-engine.test.js .tmp/market-tests/lib/api/ui-schema-guard.test.js
```

Result:

- tests: 52
- pass: 52
- fail: 0

## Full Required Gate

Command:

```bash
npm run typecheck && npm run lint && npm run test:market && npm run build && npm run backtest:golden && npm run ci:forbidden-files && npm run ci:secret-patterns
```

Result:

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run test:market`: pass, market core 807 pass, worker 17 pass, historical smoke 4 pass.
- `npm run build`: pass.
- `npm run backtest:golden`: pass, 16/16.
- `npm run ci:forbidden-files`: pass.
- `npm run ci:secret-patterns`: pass.

## Formal

`npm run backtest:formal` was not run. This round explicitly forbids formal.
