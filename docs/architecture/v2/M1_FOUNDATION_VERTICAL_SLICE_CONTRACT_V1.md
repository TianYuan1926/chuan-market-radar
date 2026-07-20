# M1 Foundation 第一纵向切片合同 v1

状态：`FROZEN_TASK_CONTRACT / M1.1-M1.5A_LOCAL_PASS / LIVE_EGRESS_UNAVAILABLE / M1.5B_SHADOW_GATE_PENDING / PRODUCTION_UNCHANGED`

## 目标

用 BTC 的三家独立线性 USDT 永续 instrument 贯通：

```text
Venue catalog
-> EligibleInstrumentSnapshot
-> PointInTimeMarketFact + FactQualitySnapshot
-> FeatureSetSnapshot + FeatureQualitySnapshot
-> MarketContextSnapshot
-> RuntimeTruthSnapshot
```

这条 slice 只证明数据与回放地基，不生成 Candidate、方向、等级、entry、stop、target、RR、Signal 或 READY。

## 输入

- Binance USD-M、OKX SWAP、Bybit Linear 的 instrument catalog fixture。
- 每个 instrument 的同一 cutoff `LAST_PRICE` fixture 和 quality metadata。
- 显式 `eventTime|null / receivedAt / normalizedAt / persistedAt|null / source id / sequence|null`。
- `src/v2/fixtures/m1-foundation-slice.v1.json`，永久标记 test-only/synthetic。

## 实施顺序

1. **Identity first**：实现 venue-specific parser、canonical instrument id、underlying group、status accounting 和 unresolved reason。
2. **Fact second**：实现 immutable fact envelope、null/quality 语义、duplicate/gap/out-of-order 检测。
3. **Feature third**：先实现一个跨 Venue 价格离散度特征；实时和 replay 调同一纯函数。
4. **Context fourth**：只依据同一 FeatureSet 形成最小 liquidity/confidence context，不给单币方向。
5. **Runtime truth last**：分别报告 liveness、dependency readiness、business readiness、data freshness 和 release validity。

## 允许范围

- `src/v2/modules/universe/**`
- `src/v2/modules/market-fact/**`
- `src/v2/modules/feature/**`
- `src/v2/modules/market-context/**`
- `src/v2/modules/runtime/**`
- 对应的 `src/v2/testing/**`、合同测试和 M1 报告

不允许 import Legacy。需要提取的 parser 必须先用 fixture 证明行为，再在新文件中重写最小纯函数；不得复制旧 Universe authority。

## 失败 fixture

每个 Venue 至少覆盖：pagination truncation、unsupported contract、suspended/delisting、identity conflict、missing settlement、duplicate sequence、out-of-order、gap、stale、schema drift、429、transport failure 和 recovery。

## 验收

- observed accounting=100%，三家 instrument 是三个不同 canonical id，但可映射到同一 underlying group。
- null 保持 null；缺失、stale、invalid 均有 reason，不使用默认 0。
- 同一冻结输入的 Fact/Feature/Context content hash 可重复。
- online/replay feature parity=PASS，cutoff 之后的数据无法被读取。
- 任何 Provider 只能被 Adapter 调用，页面、Detector、Analysis 不可访问。
- 数据失败时 Runtime Truth 明确 partial/stale/unavailable，不把 HTTP 200 当 ready。
- 定向、contract、property、provider-failure、replay 与 architecture tests 全部通过。

## 停止条件

发现 identity 静默合并、未来 K 线补齐、old cache 冒充 live、memory fallback 冒充 authority、test fixture 被 runtime import，或任一 Venue 无法完整分页时立即停止，不扩大到全市场。

## M1.1 当前证据

- 三家公开 catalog/ticker Adapter、GET-only allowlist Transport、Identity/Fact builder 已在独立 `src/v2` 中实现。
- observed row 100% accounting；不完整 identity 可留在分母，但不能 eligible；分页不完整会撤销该 Venue 已见记录的 eligibility。
- Fact 对 null、lineage、未持久化、duplicate、out-of-order、gap、stale、rate limit、transport、schema drift、future cutoff 和 recovery fail closed。
- `test:v2-foundation` 当前 67/67 PASS；同一冻结输入的 Universe/Fact ID 与 content hash 可重复，权威产物运行时深冻结。
- 当前环境的公开端点直连探测未成功，所以只声明本地合同/fixture PASS，不声明 live provider 或生产能力。
- 详细来源与限制见 `M1_1_PROVIDER_SOURCE_CONTRACTS_V1.md`。

## M1.2 当前证据

- `FeatureSetSnapshot` 以 `UNDERLYING_GROUP` 为 subject，避免把跨 Venue 特征错误挂到单一 instrument；schema 已升至 v2。
- 唯一首批 Feature 为 `cross-venue-last-price-dispersion.v1`，使用十进制整数运算计算 `(max - min) / median`，不经过浮点价格计算。
- Feature builder 要求每个 eligible instrument 恰好一个同 cutoff `LAST_PRICE` Fact，拒绝缺失、重复、晚 cutoff 和在 feature computedAt 之后才产生的 Fact。
- ONLINE 与两次 REPLAY 使用同一纯函数，但必须带三组不同 run ID、正确计算模式和相同 engine version；FeatureQuality 保存三份语义哈希，不能用同一对象或相同 run 冒充独立回放。
- Market Context 只允许从 fresh、parity PASS、replay deterministic 的分散度读取。分散度高于版本化阈值可标记 `FRAGMENTED`；低分散不能证明 `HEALTHY`，regime、volatility、breadth、correlation 和方向保持 UNKNOWN/null。
- `test:v2-m1-feature-context` 17/17 PASS；`test:v2-foundation` 84/84 PASS。详细合同见 `M1_2_FEATURE_CONTEXT_CONTRACT_V1.md`。

## M1.3 当前证据

- 六类 M1 artifact 通过 strict STORAGE boundary 写入 append-only PostgreSQL ledger；Universe、完整 Fact 分母和 FactQuality 必须原子追加，孤立 Fact 被拒绝。
- semantic content hash 与 full payload storage digest 分开验证；同 ID 异内容、不同 retention 的重试冲突，UPDATE/DELETE 同时由 privilege 与 trigger 拒绝。
- Replay Manifest 同时冻结 event cutoff 与 knowledge cutoff，并绑定每个 source artifact 的 ID、source cutoff、persisted time 和 storage digest。
- 两次独立 durable replay 调用 M1.2 同一 Feature builder，online/offline parity PASS 且 replay deterministic。
- Runtime Truth 升为 v2 并固定 required-check profile；隔离演练全部技术检查通过仍为 `REHEARSAL/PARTIAL`，不能冒充生产 READY。
- `test:v2-m1-store-replay` 12/12 PASS；隔离 PostgreSQL 16 integration 1/1 PASS。详细合同见 `M1_3_STORE_REPLAY_RUNTIME_TRUTH_CONTRACT_V1.md`。

M1.3 没有建立 live ingestion、采集 Worker、全 eligible Universe、生产 migration、API、页面或生产 authority。该缺口中的本地 Collector Runtime 已由 M1.4 补齐。

## M1.4 当前证据

- 冻结 21 observed / 15 eligible 的三 Venue 多标的 fixture，Bybit catalog 跨两页；每条 provider 记录均进入 accounting。
- Collector 明确区分 `providerObserved / accounted / eligible / collected / fresh`，ratio 同时携带分子和分母，0 分母返回 null。
- 冷启动、增量 ticker、周期 reconciliation、provider quota、global/per-provider concurrency、队列深度/等待、数据库失败和 recovery 状态机已通过定向测试。
- 完整成功 catalog 中消失的旧标的保留为不可交易 `DELISTING` tombstone；catalog/分页失败时旧分母保留为 `UNAVAILABLE`，不静默丢币。
- Collector 只经 Adapter 调用 provider，只经 M1 Store 原子持久化；Store 失败或 acknowledgement 不完整均不推进 Universe/sequence/schedule checkpoint。
- strict `CollectorCycleTelemetry` 拒绝被篡改的分母和虚假 READY；telemetry 不是市场或交易 authority。
- 隔离 PostgreSQL 16 已证明启动轮 `1 Universe + 15 Fact + 1 FactQuality`、增量轮 Universe 幂等加第二组 15 Fact，以及全 catalog 故障下 21 条 accounting、0 eligible、0 Fact 的诚实 durable 记录。

M1.4 当时仍未连接 live provider、没有连续 Worker、Shadow/SLO、生产 migration、API、页面或生产 authority；M1.5-A 已补齐其中的本地 Worker/Checkpoint/SLO 工程能力。

## M1.5-A 当前证据

- 新增独立 checksum 的 `v2-m1-collector-checkpoint.v1` additive migration，不修改 M1.3 base migration；checkpoint ledger append-only，并以外键和 trigger 约束精确 Universe/FactQuality durable slice。
- checkpoint 内容寻址绑定 release、runtime config、Universe、FactQuality、sequence、schedule、失败原因和 strict cycle telemetry；错 release/config、篡改 digest、未知 sequence key 均 fail closed。
- PostgreSQL 16 真实关闭读写连接后重新创建进程边界，成功从 checkpoint 继续 `INCREMENTAL_TICKER` 且不重复 catalog；checkpoint 不存在时只能冷启动，checkpoint append 失败时 Worker 停止。
- Worker 固定节拍、跳过已错过 tick、不堆积重叠周期；stop signal 会先完成当前 artifact/checkpoint 边界。启动 readiness 永远为 NOT_READY，只有本进程新周期和 checkpoint 都成功才可 operational READY。
- 进程入口强制完整 source commit 绑定、分离 reader/writer identity、显式 telemetry sink、`NO_AUTHORITY` 和 `automaticTradingAllowed=false`，且不能执行 migration。
- SLO evaluator 只输出 `INSUFFICIENT_EVIDENCE / PASS / FAIL`，短时健康 probe 不能 PASS；checkpoint 缺失、0 eligible、混 release/config、重复/重叠周期和资源/质量越界会 fail closed。
- 本机 live probe 已真实执行两轮；三家 endpoint 均连接/请求超时，结果为 0 observed / 0 eligible / `DEGRADED`。这证明失败语义诚实，不证明 live provider 能力。

## M1.5-B0 当前证据

- 生产入口现在显式假设并验证冻结 reader/writer capability role，不再依赖 URL 隐含 `options` 或登录角色的 INHERIT 行为。
- database URL 支持两个独立只读 secret file，并绑定同一非空 database、固定 host、不同 login；生产空密码、URL query/hash 和身份混用均拒绝。
- 每周期输出完整 strict observation envelope，可由固定 SLO evaluator 重算；部分日志、坏 JSON、空样本和未知 profile 不能进入结论。
- Shadow 只有固定 31 周期/30 分钟与 1441 周期/24 小时两档，`restart=no`；retention 最大 30 天，避免误配成无限采集。
- 专用镜像只复制编译后的 V2 runtime；Compose 边界为非 root、只读 filesystem、无 capabilities、无端口、无 Legacy env/Redis/CoinGlass secret，资源和日志有界。
- 定向测试 41/41 PASS，TypeScript、ESLint 和 YAML 语法通过。本机没有 Docker CLI，故真实 image build 与 Compose merge 明确未证明。
- Edge OrcaTerm 新鲜预检仍为 0 会话/无连接配置；未输入或保存凭据，生产零命令、零变更。

M1 仍未完成。高频 `PointInTimeMarketFact` 当前进入无物理 purge 的单一 append-only ledger，只适合有限 Shadow。当前工程入口改为 M1.6 分区 Fact/retention 地基；外部 M1.5-B1 30 分钟 early Shadow 可在可信通道恢复后并行，二者通过后才进入 M1.7 24 小时 SLO。全程不进入 Detector authority、API、页面或交易计划。
