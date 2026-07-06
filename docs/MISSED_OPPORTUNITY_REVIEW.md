# Missed Opportunity Review

本文定义错失机会反查模块的工程边界。该模块只属于 BACKTEST / REVIEW 层，不参与实时扫描排序、策略门禁或自动调权。

## 定位

错失机会反查用于回答：

```text
某个后验发生的机会，为什么没有被系统提前推到用户面前？
```

它服务核心链路中的“复盘进化”，向前反查：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

## 支持的 missedReason

- `scan_not_covered`：扫描覆盖未包含该标的。
- `light_scan_not_triggered`：覆盖内标的没有触发轻扫候选。
- `deep_scan_pending_too_long`：轻扫后深扫等待太久。
- `analysis_missed_structure`：事前结构线索存在，但分析层未识别。
- `strategy_blocked_too_strict`：策略门禁可能过严，需要人工复核。
- `data_source_missing`：关键数据源缺失或不可用。
- `market_regime_filtered`：市场环境过滤器拦截。
- `frontend_not_highlighted`：后端有观察线索，但前端没有突出显示。
- `insufficient_data`：证据不足，不能归因。

## 只读边界

模块输出必须固定：

```text
allowedUse = research_only
canAutoExecute = false
canAutoAdjustWeights = false
canMutateLiveRanking = false
canMutateProductionRanking = false
```

禁止用途：

- 不回写 production ranking。
- 不调整 live scan priority。
- 不自动放宽策略门禁。
- 不自动调权。
- 不自动下单。

## 当前代码

- `src/lib/review/missed-opportunity/types.ts`
- `src/lib/review/missed-opportunity/review.ts`
- `src/lib/review/missed-opportunity/review.test.ts`

当前实现是最小纯函数模块，后续如果接入 formal / review 报告，也必须保持 research-only 边界。
