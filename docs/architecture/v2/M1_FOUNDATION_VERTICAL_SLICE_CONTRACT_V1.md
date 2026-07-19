# M1 Foundation 第一纵向切片合同 v1

状态：`FROZEN_TASK_CONTRACT / M1.1_IDENTITY_FACT_LOCAL_PASS / M1.2_FEATURE_CONTEXT_LOCAL_PASS / M1.3_STORE_REPLAY_RUNTIME_TRUTH_LOCAL_PASS / M1.4_READY_LOCAL_ONLY / PRODUCTION_UNCHANGED`

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

M1.3 没有建立 live ingestion、采集 Worker、全 eligible Universe、生产 migration、API、页面或生产 authority。下一步只进入 M1.4 的全 observed/eligible Universe 与 Collector Runtime 本地纵切。
