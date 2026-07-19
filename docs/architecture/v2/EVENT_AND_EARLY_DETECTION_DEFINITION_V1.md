# 爆发行情与提前发现定义 v1

状态：`FROZEN_RESEARCH_CONTRACT / NOT_A_PRODUCTION_DETECTOR`

这份定义只建立统一评价口径。它使用未来窗口生成 Outcome 标签，因此只能进入 Evaluation/Research，永久禁止被实时 Detector、排序、Analysis、Strategy 或 Frontend 读取。

## 1. 评价对象

评价对象是当时 Universe Snapshot 中 `eligible` 的线性稳定币结算永续合约。每个样本绑定：

```text
canonicalInstrumentId / venue set / universeVersion
eventTime cutoff / price fact ids / quality status
liquidity bucket / market regime / direction / labelVersion
```

存在价格 gap、身份冲突、停牌、异常指数或关键窗口缺失时，标签为 `DATA_UNAVAILABLE`，不得强行判正负样本。

## 2. Significant Expansion Event V1

分别评价 `60m / 4h / 24h` 三个窗口和 long/short 两个方向。对每个 `horizon + direction + liquidity bucket + regime`，使用训练集中过去样本冻结的绝对收益分布阈值：

```text
threshold = max(absolute floor, frozen training Q99 directional excursion)

absolute floor:
60m = 5%
4h  = 8%
24h = 15%
```

阈值只允许在新 label version 中改变。validation/test/Shadow 期间不得根据结果移动分位数、流动性桶、regime 或绝对 floor。

一个事件必须同时满足：

1. 在 horizon 内，方向有利最大偏移达到 threshold。
2. 数据质量为可评价，且价格来自可追溯 point-in-time fact。
3. 事件前参考窗口没有已经消耗超过 threshold 50% 的同向移动。
4. 该标的在事件时具有冻结的最低可交易流动性；低流动性插针单独标为 `ILLIQUID_EXPANSION`，不计入主事件分母。
5. 高度重叠、同方向事件按 cooldown 合并为一个 Episode，不能把同一轮行情重复计数。

## 3. 公开启动点与 Lead Time

`publicBreakoutTime` 定义为从事件参考价起，第一根已收盘 1m K 线达到该事件 threshold 的 25%，且随后没有在 3 根 1m K 线内完全回吐的时间。它是“行情已经明显开始”的可重复代理，不靠人工看图回填。

```text
leadTime = publicBreakoutTime - firstEligibleCandidateTime
moveConsumed = abs(candidateObservedPrice - referencePrice) / (referencePrice * threshold)
```

只有同时满足以下条件才记为 `EARLY_CAPTURE`：

- leadTime 为正；
- `60m / 4h / 24h` 的最小 leadTime 分别为 `10m / 30m / 120m`；
- moveConsumed `< 25%`；
- Candidate 当时满足 lineage、freshness 和 detector lifecycle 资格；
- Candidate 与事件的 instrument、family-compatible direction 和 Episode 关系可证明。

`0 < leadTime < minimum` 为 `NEAR_START`；leadTime <= 0 或 moveConsumed >= 50% 为 `LATE`；其余为 `AMBIGUOUS`。这几类不得合并成“抓到”。

## 4. 三个分母

1. **Candidate denominator**：系统发出的全部合格候选，用于 precision、false positive 和注意力负担。
2. **Event denominator**：全部 Significant Expansion Event，用于 recall、miss 和 lead time。
3. **Matched non-event denominator**：同 instrument bucket、regime、时段和前兆相近但未爆发的样本，用于低基准率下的假阳性控制。

必须同时报告 numerator、denominator、样本量、置信区间和 unavailable 数量。23.53% 与 26.42% 只保留为 Legacy 历史审计参考；在 V2 label v1 重放前，它们不能与 V2 指标直接比较。

## 5. 机会不只等于爆发

Pre-Move 是首要评价族，但 Breakout/Retest、Trend Continuation、Reversal/Range、Relative Strength 和 Derivatives Flow 使用各自事件与计划结果。一个未满足 Significant Expansion Event 的高质量回踩计划可以是成功机会；反之，一个暴涨币若系统只在后半段追到，不能算提前发现成功。

## 6. 反自欺门禁

- Outcome 标签、MFE、MAE、eventStart、publicBreakoutTime 永不进入实时输入。
- 只展示命中案例、只看 top gainers、事后移动起点或删除 unavailable 样本，结果直接无效。
- 参数探索必须登记全部尝试并执行 purge/embargo、time/symbol/regime holdout。
- Candidate 数暴增不能单独算提升；recall、precision、lead time、late/noise、成本与注意力负担必须一起报告。
