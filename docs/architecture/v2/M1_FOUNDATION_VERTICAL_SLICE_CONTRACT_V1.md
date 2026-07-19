# M1 Foundation 第一纵向切片合同 v1

状态：`FROZEN_TASK_CONTRACT / IMPLEMENTATION_NOT_STARTED`

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
- 显式 `eventTime / receivedAt / persistedAt / source id / sequence`。
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
