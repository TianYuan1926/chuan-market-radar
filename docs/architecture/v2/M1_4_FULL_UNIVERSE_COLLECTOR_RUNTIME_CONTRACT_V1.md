# Market Radar V2 M1.4 Full Universe and Collector Runtime Contract V1

状态：`FROZEN_TASK_CONTRACT / LOCAL_POSTGRES16_REHEARSAL_PASS / LIVE_MARKET_UNPROVEN / PRODUCTION_UNCHANGED`

## 1. 任务目的

本包只把 M1.1-M1.3 的单 BTC 证据切片扩大为三家目标 CEX 的完整目录与受控采集运行纵切：

```text
Provider Catalog Adapter
-> observed instrument accounting
-> eligibility policy
-> immutable EligibleInstrumentSnapshot
-> Provider Ticker Adapter
-> exact eligible denominator facts + FactQuality
-> append-only M1 Store
-> non-authoritative Collector telemetry
```

本包不发现机会，不产生 Candidate、方向、等级、Signal 或交易计划。

## 2. 四个不可混淆的分母

每个 cycle 必须同时报告：

1. `providerObservedCount`：本轮 catalog 实际返回并完成规范化的记录数；增量 ticker cycle 为 `null`，不得冒充重新观察。
2. `accountedCount`：当前 Universe 中仍被逐条解释的完整分母，包括本轮未返回但从上次 durable Universe 保留的记录。
3. `eligibleCount`：本轮政策和 provider 状态共同证明可采集的线性 USDT 永续合约数。
4. `collectedCount` / `freshCount`：eligible 分母中实际匹配到 ticker 的数量，以及其中通过 event-time、sequence、freshness 质量门禁的数量。

必须满足：

```text
freshCount <= collectedCount <= eligibleCount <= accountedCount
```

任何 ratio 的分子和分母必须随 telemetry 一起输出。分母为 0 时 ratio 为 `null`，不得用 0% 暗示真实失败率。

## 3. Universe reconciliation 规则

- `STARTUP_FULL`、`PERIODIC_RECONCILIATION` 和 `RECOVERY` 必须读取三家 catalog。
- `INCREMENTAL_TICKER` 只允许复用最后一次成功持久化的 Universe，不得复用未落库结果。
- provider 失败或分页不完整时，旧记录必须保留为 `UNAVAILABLE`；完整成功 catalog 中旧标的消失时，保留为 `DELISTING` tombstone。两者都必须 `eligible=false` 并带明确 reason code。
- 只有 provider 当前记录明确满足合同类型、结算资产和交易状态时才可 `ELIGIBLE`。
- identity 冲突全部 fail closed 为 `UNRESOLVED`；不能静默合并。
- reconciliation 允许新增标的，但不能无原因缩小 accounting denominator。

## 4. Collector 状态机

```text
COLD_START
-> RECONCILING
-> COLLECTING
-> PERSISTING
-> READY

任一 provider / quality / quota / queue / store 失败
-> DEGRADED 或 BACKPRESSURED
-> RECOVERY 全量 reconciliation
```

- 单进程只允许一个 cycle 在途。
- `READY` 必须同时满足：Universe fresh、FactQuality fresh、fresh/eligible=100%、M1 Store 原子持久化成功、无 request rejection。
- PostgreSQL 失败不得回退内存；未落库的 Universe、sequence 和 schedule checkpoint 不得成为下一 cycle authority。
- liveness、HTTP 200 或部分 ticker 成功都不能单独产生 `READY`。

## 5. 调度、配额和背压

- 冷启动无 durable checkpoint 时强制 `STARTUP_FULL`。
- 默认 reconciliation 间隔为 24 小时；到期必须先 catalog，再 ticker。
- provider request budget 使用明确的 rolling window；Bybit 每个分页请求都计入 budget。
- global 和 per-provider concurrency 都是硬上限。
- 队列有最大深度和最大等待时间；超限返回明确 `collector_backpressure_*`，不得无限堆积。
- 429、body-level rate limit、timeout、schema drift、queue rejection 必须保留原始类别和 reason code。

## 6. 唯一写入路径

Collector 只能调用 V2 Adapter 和 `M1PostgresArtifactStore.appendArtifacts`。每个 cycle 原子提交：

```text
1 EligibleInstrumentSnapshot
+ N PointInTimeMarketFact，N 等于 eligibleCount
+ 1 FactQualitySnapshot
```

Universe cutoff 可以早于 ticker cutoff，但不能晚于 ticker cutoff。相同 Universe 在增量 cycle 中必须走 M1 Store 幂等重放；事实与质量仍按新 cutoff 追加。

## 7. Telemetry 边界

`CollectorCycleTelemetry` 是严格、不可变、可观测运行证据，不是新的市场 authority。必须包含：

- cycle/release/trigger/state/time；
- 四分母及 per-venue breakdown；
- catalog/ticker provider failures；
- request attempts、quota rejection、queue rejection、queue lag、最大并发；
- persistence 结果；
- recovery attempted/succeeded 和前次失败原因；
- 下一次 reconciliation 时间。

它不得被 Detector、Analysis、Strategy 或前端直接解释为机会。

## 8. 本地出口门禁

必须通过：

1. 三 Venue 多标的 fixture，含 Bybit 多页，100% accounting。
2. 新增、消失、暂停、退市、unsupported、malformed 和 identity conflict。
3. incremental ticker 不假装重跑 catalog。
4. 429、timeout、schema drift、分页中断、ticker 缺失、重复、乱序、stale。
5. quota、global/per-provider concurrency、queue depth/wait 硬上限。
6. database failure 无 fallback，下一轮强制 recovery。
7. ephemeral PostgreSQL 16 中真实原子写入并复核 artifact 数量和 exact denominator。
8. M1.4 定向测试、全 V2、基础门禁全部 PASS。

本出口仍只能声明 `LOCAL_POSTGRES16_REHEARSAL_PASS`。没有 live provider、生产 Worker、Shadow/SLO 和生产 authority 证据时，不得宣称完成全市场实战采集。
