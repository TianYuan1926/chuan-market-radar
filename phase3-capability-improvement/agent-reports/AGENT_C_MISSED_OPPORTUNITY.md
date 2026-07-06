# Agent C Missed Opportunity 交付报告

## 结论

通过。新增 research-only 错失机会反查模块，用于复盘“为什么优质机会没进入后续链路”，不影响生产排序和实时策略。

## 修改范围

- `src/lib/review/missed-opportunity/types.ts`
- `src/lib/review/missed-opportunity/review.ts`
- `src/lib/review/missed-opportunity/index.ts`
- `src/lib/review/missed-opportunity/review.test.ts`
- `docs/MISSED_OPPORTUNITY_REVIEW.md`
- `tsconfig.market-test.json`

## 支持的错失原因

- `scan_not_covered`
- `light_scan_not_triggered`
- `deep_scan_pending_too_long`
- `analysis_missed_structure`
- `strategy_blocked_too_strict`
- `data_source_missing`
- `market_regime_filtered`
- `frontend_not_highlighted`
- `insufficient_data`

## 边界

- `allowedUse=research_only`
- `canAutoExecute=false`
- `canAutoAdjustWeights=false`
- `canMutateLiveRanking=false`
- `canMutateProductionRanking=false`

## 验证

- 定向测试已纳入 `npm run test:market`。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run backtest:golden`：通过，16/16。

## 风险

后续如果接入 review 页面或报告系统，必须继续保持 research-only。错失机会只能给人工复核和后续规则建议，不能自动放宽风控或改变生产 ranking。
