# Agent B 深扫优先级 / 候选质量提升报告

## 结论

通过。该项提升了深扫队列和候选质量的可观测性，不增加 CoinGlass/API 请求预算，不改变实时排序主干，不生成交易计划。

## 修改范围

- `src/lib/market/scan-state-pool.ts`
- `src/lib/market/scan-state-pool.test.ts`
- `src/lib/market/types.ts`
- `src/lib/api/backend-contract.test.ts`
- `src/lib/market/scan-asset-state.test.ts`

## 核心变化

- `deepScan` 新增只读队列证明字段：
  - `deepScanCoveragePercent`
  - `pendingCount`
  - `oldestPendingAge`
  - `estimatedCycleMinutes`
  - `highPriorityPendingCount`
  - `skippedLowPriorityCount`
  - `pendingQualitySamples`
- `assetSamples` 增加 `priorityReason`，用于解释标的为什么被选中、排队、降级或阻断。
- 未被本轮深扫验证的 near-trigger / triggered 标的不再留在 `BATTLE_READY`，避免候选被误读成计划就绪。
- fallback 报告明确 `served_cache` 不能视为重新完成深扫。

## 边界

- 不改 scan 排序公式。
- 不提高 API 预算。
- 不生成入场、止损、目标。
- 不把深扫候选升级为 `TRADE_PLAN_READY`。

## 验证

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。

## 风险

- `oldestPendingAge` 和 `estimatedCycleMinutes` 是基于当前队列和 cadence 的只读估算，不是数据库真实 lastDeepScannedAt。
- 本轮只提升可观测性和误导防线，不证明候选 Top10 已达到实战稳定。
