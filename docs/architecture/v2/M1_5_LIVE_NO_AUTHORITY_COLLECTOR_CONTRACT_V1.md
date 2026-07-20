# M1.5 Live No-Authority Collector 合同 v1

状态：`FROZEN_TASK_CONTRACT / M1.5A_LOCAL_ENGINEERING_AND_POSTGRES16_PASS / LIVE_EGRESS_UNAVAILABLE / M1.5B_SHADOW_GATE_PENDING / PRODUCTION_UNCHANGED`

## 1. 本轮目标

把 M1.4 的全量/增量 Collector Runtime 组合成一个可重启、可停止、不可重叠运行的单实例 Worker，并为 live public provider rehearsal 和连续 Shadow/SLO 建立不可伪造的证据入口。

本轮只证明行情采集地基，不产生 Candidate、方向、Signal、入场、止损、目标或交易计划，不成为页面读取权威，不自动下单。

## 2. 固定边界

```text
Public Provider
-> Provider Adapter
-> Collector Runtime
-> append-only M1 Artifact Ledger
-> append-only Collector Cycle Checkpoint Ledger
-> Worker Telemetry
-> SLO Evaluation
```

- Provider host 和网络 transport 继续只存在于 Adapter 边界。
- Runtime 只调用 Adapter 和 M1 Store，不读取 Legacy、页面或交易模块。
- Worker authorityMode 固定为 `NO_AUTHORITY`，automaticTradingAllowed 固定为 `false`。
- liveness、operational readiness、data quality 和 SLO conclusion 必须分别表达。
- fixture、单轮 live probe、短时 rehearsal、生产 Shadow 和生产 authority 是五种不同证据，禁止互相替代。

## 3. Durable checkpoint 真值

每个成功事实周期可产生一个 `M1CollectorCheckpoint`，必须包含：

- 精确 releaseId、runtime config 和 config digest；
- cycleId、nextCycleOrdinal、最终 runtime state 和失败原因；
- Universe 与 FactQuality 的不可变 artifact 引用；
- lastCatalogAt、nextReconciliationAt；
- 完整 sequence state 及独立 digest；
- 原始严格 CollectorCycleTelemetry；
- checkpointId、checkpointDigest、retention 边界；
- `NO_AUTHORITY` 和 `automaticTradingAllowed=false`。

恢复规则：

1. 只读取当前精确 release 的最新 checkpoint。
2. runtime config、digest、checkpoint digest、sequence digest 任一不匹配即 fail closed。
3. 必须重新读取并验证被引用的 Universe 和 FactQuality；release、source cutoff、snapshot identity 任一不一致即拒绝恢复。
4. checkpoint 中的 sequence key 只能属于当前 eligible Universe。
5. 新 release 不继承旧 release checkpoint，必须冷启动全量 reconciliation。
6. 启动时即使恢复自上一轮 READY，Worker readiness 仍为 NOT_READY；只有当前进程完成新周期及 checkpoint 后才可报告 READY。

## 4. 持久化次序与故障语义

固定次序：

```text
append artifacts transaction
-> verify complete acknowledgement
-> append checkpoint referencing durable artifacts
-> verify checkpoint round trip
-> publish worker cycle truth
```

checkpoint 可以因进程崩溃而落后 artifact，但数据库外键和应用校验必须保证 checkpoint 永远不能领先 artifact。checkpoint append 失败后 Worker 必须停止，不得继续推进下一周期。重启后从最后一个已验证 checkpoint 重放；无 checkpoint 时执行冷启动全量 reconciliation，不从内存、缓存或时间猜测。

旧 `v2-m1-artifact-store.v1` migration 内容和 checksum 永不修改。checkpoint 使用独立 additive migration、独立 checksum 和 migration guard。

## 5. Worker 调度合同

- 单实例循环，同一时刻最多一个采集周期。
- 使用固定节拍；周期超时跨过的 tick 明确计为 missed starts，不堆积补跑。
- SIGTERM/Abort 进入 DRAINING：不启动新周期，当前周期完成 artifact 与 checkpoint 边界后停止。
- runtime 抛错、artifact persistence 失败或 checkpoint persistence 失败均使本次运行 fail closed。
- 每个周期记录 scheduled/start/complete、schedule lag、missed starts、RSS/heap、runtime telemetry 和 checkpoint status。

## 6. SLO 合同

SLO 结论只有三种：

```text
INSUFFICIENT_EVIDENCE
PASS
FAIL
```

最低证据同时要求观察时长和周期数。单轮或短时 live probe 只能证明连通性与真实 denominator，必须返回 `INSUFFICIENT_EVIDENCE`，不能返回 PASS。

SLO 至少评估：

- operational ready ratio；
- eligible/collected/fresh 四分母和最低 fresh coverage；
- provider failure、零 denominator 和 backpressure；
- cycle duration p95、schedule lag 和 missed starts；
- checkpoint 完整率；
- RSS/heap 上界；
- release/config 单一性和 NO_AUTHORITY 不变量。

## 7. Live rehearsal 出口

live rehearsal 只允许三家目标 CEX 的无需鉴权公开 GET 和本机临时 PostgreSQL 16。输出必须脱敏，只保留数量、比率、状态、reason code、耗时、资源和内容摘要，不保存完整 provider payload。

本轮工程出口要求：

1. checkpoint schema/codec/store 定向测试通过；
2. PostgreSQL 16 证明 append-only、最小权限、checkpoint 不领先 artifact、进程重启恢复和错误 release 隔离；
3. Worker 证明固定节拍、不重叠、优雅停止和 checkpoint failure fail closed；
4. SLO evaluator 证明短观察不能伪造 PASS；
5. live probe 若网络可达，必须报告真实 observed/accounted/eligible/collected/fresh；若不可达，必须保留 FAIL/UNAVAILABLE 事实；
6. 全 V2、M0、Legacy 基础门禁和 `ci:production` 通过；
7. production migration、production Worker、页面 authority 和 Legacy 删除均为 0。

## 8. 独立生产 Gate

本合同不授权生产变更。进入生产 Shadow 前必须重新绑定 commit、artifact、migration checksum、镜像、身份、资源预算、回滚目标和观察窗口，并先做生产只读 preflight。生产 Shadow 仍为 no-authority；读权威切换另需后续独立 Gate。

## 9. Provider 官方约束基线

核对日期：2026-07-20。以下只作为 Adapter/限流/演练合同依据，不把文档可访问性当作 live endpoint 可访问性：

- Binance USD-M 官方 Market Data：`/fapi/v1/exchangeInfo` 为公开交易规则与 symbol 目录，IP weight 1；全 symbol `/fapi/v2/ticker/price` 的 IP weight 2。来源：`https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data`。
- Bybit 官方 Instruments Info 明确默认只返回 500 条且 linear symbol 已超过 500，必须使用 `cursor` 或提高 `limit` 完成全量；极端波动时接口可能延迟。来源：`https://bybit-exchange.github.io/docs/v5/market/instrument`。
- Bybit 官方 IP 默认上限为 5 秒 600 次并明确不建议贴边运行；body `retCode=10006` 代表限流。来源：`https://bybit-exchange.github.io/docs/v5/rate-limit`。
- OKX 官方 Market Data 无需鉴权，`/api/v5/market/tickers` 为 IP 维度 2 秒 20 次；多个独立 cache 可能让后一次响应早于前一次，因此 out-of-order 防线不得删除。来源：`https://app.okx.com/docs-v5/en`。

本实现的默认预算远低于官方上限，并继续把 429、body-level rate limit、分页不完整、超时、乱序和 schema drift 分别记录，禁止合并成“市场无机会”。
