# M1.2 Point-in-Time Feature 与 Market Context 合同 v1

状态：`LOCAL_PASS_REPLAY_PROVEN_FIXTURE_SLICE / LIVE_CONNECTIVITY_UNPROVEN / PRODUCTION_UNCHANGED`

## 1. 目的与边界

M1.2 只把 M1.1 的冻结 `Universe -> LAST_PRICE Fact + FactQuality` 推进为：

```text
Point-in-Time FeatureSet
-> independent ONLINE/REPLAY parity evidence
-> FeatureQuality
-> minimal non-directional MarketContext
```

它不扫描全市场、不发现 Candidate、不判断多空、不生成信号、入场、止损、目标、RR 或交易计划，也不证明 live provider、数据库、Worker、API、页面或生产 authority。

## 2. 权威对象

| 对象 | schema | 唯一职责 |
| --- | --- | --- |
| `FeatureSetSnapshot` | `feature-set-snapshot.v2` | 保存同一 cutoff 的版本化特征及计算 run 身份 |
| `FeatureQualitySnapshot` | `feature-quality-snapshot.v2` | 保存 null、online/replay parity 和重复 replay 确定性证据 |
| `MarketContextSnapshot` | `market-context-snapshot.v2` | 保存当前证据实际支持的非方向性市场背景 |

跨 Venue Feature 的 subject 必须是 `UNDERLYING_GROUP`，不能伪挂到任一单独 `canonicalInstrumentId`。Context 必须同时引用 Universe、FeatureSet 和 FeatureQuality snapshot。

## 3. 首个 Feature

定义版本：`cross-venue-last-price-dispersion.v1`。

对于同一 underlying 在 Binance Futures、OKX Swap、Bybit Linear 的三个正价格：

```text
dispersion = (max(lastPrice) - min(lastPrice)) / median(lastPrice)
```

- 使用十进制字符串和 `BigInt` 对齐小数位，不把价格转为 JavaScript 浮点数。
- 输出固定最多 12 位小数并确定性四舍五入。
- 三个 Venue 缺一、重复、价格无效或任一 source Fact 非 fresh 时，value 必须为 null，不能用 0、旧值或其他 Venue 补位。
- Feature 必须保存全部 source fact ID、cutoff、computedAt、definition version、feature-set version 和质量原因。

## 4. Point-in-Time 门禁

Feature builder 必须拒绝：

- Fact 数量不等于 eligible instrument 数量。
- 同一 instrument 缺失、重复或多出 Fact。
- Fact 的 instrument、Venue symbol、unit 或 fact type 与 Universe 不一致。
- Fact cutoff 与本次 Feature cutoff 不一致。
- Fact、FactQuality 或 Universe 在 `computedAt` 之后才生成。
- Universe 或 FactQuality lineage 不属于本次 authority snapshot。

同一输入、同一 run identity 和相同时间参数必须生成同一 feature ID、snapshot ID 和 content hash；输入顺序不能改变结果。

## 5. Online / Replay 证明

一次 FeatureQuality 评估必须接收：

1. 一次 `ONLINE` FeatureSet。
2. 第一次独立 `REPLAY` FeatureSet。
3. 第二次独立 `REPLAY` FeatureSet。

三份 artifact 必须是不同对象、不同 run ID、正确 mode，并使用相同 engine version。比较时排除 run metadata，只比较 Universe、cutoff、engine version、feature-set version 和排序后的完整 Feature 语义。

FeatureQuality 持久记录三份 snapshot ID、run ID 和 semantic SHA-256：

- ONLINE 与第一次 REPLAY 相等才可 `onlineOfflineParity=PASS`。
- 两次 REPLAY 相等才可 `replayDeterministic=true`。
- 同一对象、浅拷贝沿用同 run ID、mode 错误或 engine version 不同，一律 `NOT_EVALUATED / UNAVAILABLE`，不能冒充独立证明。
- parity mismatch 或 replay 不确定一律 `INVALID`。
- 只有 featureCount > 0、nullCount=0、全部 Feature fresh、parity PASS 且 replay deterministic 才可把 FeatureQuality 标为 `FRESH`。

## 6. 最小 Market Context

规则版本：`m1-cross-venue-fragmentation-context.v1`。

当前阈值：价格分散度严格大于 `0.002` 时，可把 liquidity context 标为 `FRAGMENTED`。此结论只在所需 Feature fresh、FeatureQuality fresh、parity PASS 且 replay deterministic 时成立。

永久保守规则：

- 低价格分散不等于订单簿深、不等于可执行滑点低，因此不能标记 `HEALTHY`。
- 单一价格分散 Feature 不能证明 regime、volatility、breadth 或 correlation；这些字段保持 `UNKNOWN/null`。
- Context 不存在 direction 字段，不能产生 LONG/SHORT 偏向。
- 即使 Feature 可用，M1.2 Context 仍为 `PARTIAL + LOW confidence`，因为范围只覆盖价格分散。
- FeatureQuality 不可用时，Context 必须降为 `UNKNOWN`，并传播 `INVALID/STALE/UNAVAILABLE/PARTIAL` 原因。

## 7. 已验证失败矩阵

- 不完整、重复、future-produced 和 later-cutoff Fact。
- stale/null Fact 无 fallback。
- 价格顺序变化和 100 次重复计算确定性。
- 0、负数、指数格式和过度精度拒绝。
- 同一 artifact 冒充三次独立运行。
- 相同 run ID 的浅拷贝冒充 replay。
- ONLINE/REPLAY 语义不一致。
- 两次 REPLAY 不一致。
- 伪造 fresh parity runtime artifact。
- 低分散误标健康流动性。
- FeatureQuality lineage 不匹配。

## 8. 当前证据与未证明项

```text
test:v2-m1-feature-context = 17/17 PASS
test:v2-foundation = 84/84 PASS
production mutation = 0
```

完整基础 CI 结果记录在 `V2_M1_2_FEATURE_CONTEXT_DELIVERY_REPORT.md`。这些结果来自官方形状的冻结 test-only provider fixture；M1.1 的 live connectivity 仍为 `UNPROVEN`。

## 9. 下一入口

下一包为 `V2-M1.3 Fact Store, Replay Manifest and Runtime Truth Rehearsal`：本地建立 append-only store、artifact integrity、幂等/去重、replay manifest、最小权限身份合同和五类 Runtime Truth。生产 migration、真实 writer 或 authority 切换不包含在本合同内。
