# Grep Evidence

## Commands

Required prompt paths:

```bash
rg -n "新信号|证据信号|交易信号|高置信信号|推荐榜|狙击榜|狙击席|立即入场|强推荐|可交易候选" src app components pages tests docs
rg -n "planReadyCount|candidateCount|anomalyCount|TRADE_PLAN_READY|READY|decisionSource|unified_decision_engine" src app components pages tests
```

Actual project root does not contain root-level `app`, `components`, `pages`, or `tests`; those paths are under `src/`. Therefore normalized greps were also run:

```bash
rg -n "新信号|证据信号|交易信号|高置信信号|推荐榜|狙击榜|狙击席|立即入场|强推荐|可交易候选" src docs
rg -n "planReadyCount|candidateCount|anomalyCount|TRADE_PLAN_READY|READY|decisionSource|unified_decision_engine" src
```

## Evidence Files

- `phase3-1-unified-decision-contract/greps/misleading-terms.txt`
- `phase3-1-unified-decision-contract/greps/decision-source.txt`
- `phase3-1-unified-decision-contract/greps/misleading-terms-normalized.txt`
- `phase3-1-unified-decision-contract/greps/decision-source-normalized.txt`

## Classification

- Forbidden Chinese term hits are mostly documentation or guard-test references proving those terms are forbidden and mapped away.
- `unified_decision_engine` now appears in `src/lib/api/frontend-contract.ts`, `src/lib/radar-contract.ts`, frontend display adapters, token dossier, and contract tests.
- `planReadyCount`, `candidateCount`, and `anomalyCount` still exist as scan/report metrics. They are not used by dashboard, signals, anomaly board, sniper target generation, or token dossier to infer `TRADE_PLAN_READY`.

## Risk

No P0 found from grep evidence. Remaining P1: Kline / TradingView readonly overlays should be audited separately so visual chart context cannot overstate readiness.
