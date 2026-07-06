# Agent G 机会生命周期报告

## 结论

通过。新增 research-only 机会生命周期模块，用于记录机会从发现到后验复盘的状态链路，不回写生产排序。

## 修改范围

- `src/lib/lifecycle/types.ts`
- `src/lib/lifecycle/opportunity-lifecycle.ts`
- `src/lib/lifecycle/index.ts`
- `src/lib/lifecycle/opportunity-lifecycle.test.ts`
- `docs/OPPORTUNITY_LIFECYCLE.md`
- `tsconfig.market-test.json`

## 生命周期状态

- `DISCOVERED`
- `CANDIDATE_OBSERVE`
- `DEEP_SCAN_PENDING`
- `EVIDENCE_OBSERVE`
- `WAIT_CONDITION`
- `BLOCKED`
- `TRADE_PLAN_READY`
- `INVALIDATED`
- `EXPIRED`
- `OUTCOME_REVIEWED`

## 边界

- `allowedUse=research_only`
- `canAutoExecute=false`
- `canAutoAdjustWeights=false`
- `canMutateLiveRanking=false`
- `canMutateProductionRanking=false`
- `OUTCOME_REVIEWED` 只能来自 review 层。

## 验证

- 定向测试已纳入 `npm run test:market`。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run backtest:golden`：通过，16/16。

## 风险

生命周期模块目前未接入生产 API。后续可用于 review/report 的只读合同，但不能让 outcome 影响实时 scan / analysis / strategy。
