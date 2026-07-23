# Market Radar V2 M1.4B 端点批处理、Runtime Adapter 与上新历史合同 v1

状态：`LOCAL_ENGINEERING_AND_EXACT_DISPATCH_PACKAGE_FULL_CI_PASS / LIVE_NO_AUTHORITY_RUNTIME_UNPROVEN / PRODUCTION_UNCHANGED`

冻结日期：2026-07-24

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 唯一职责

M1.4B 把 M1.1B0 的 exact live source conformance 和 M1.4A 的逐标的采集意图，转换成：

1. 绑定精确 endpoint、分页、鉴权和恢复语义的 Runtime Adapter Profile。
2. 把大量逐标的意图合并成有界 source-capability 请求批次的计划。
3. 为 Bybit 与 Bitget 上新公告建立可恢复、可审计、失败关闭的历史 checkpoint/gap/incremental 状态机。

本包不启动持续采集、不访问生产数据库、不写 Market Fact、不产生 Candidate、Signal、Strategy 或 `TRADE_PLAN_READY`。所有产物固定：

```text
runtimeExecutionAllowed = false
factAuthorityGranted = false
candidateAuthorityGranted = false
strategyAuthorityGranted = false
readyAuthorityGranted = false
productionChanged = false
```

## 2. 输入和 lineage

Runtime Profile 必须同时绑定：

```text
scopeEpoch
runtimeReleaseId
conformanceReleaseId
conformanceArtifactId + contentHash
registryDigest
probePlanDigest
probeId + definitionDigest
exact HTTPS host + initial URL
```

只接受：

- `LIVE_READ_ONLY` evidence。
- `TENCENT_ISOLATED_READ_ONLY` network environment。
- 当前 probe plan 中 exact definition digest 一致的 PASS observation。
- 与当前 Source Capability Registry digest 一致的 conformance artifact。

`TEST_ONLY` artifact 生成零 Profile。失败探针保持 absent，不能借其他 Venue 或相似 capability 的 PASS。

## 3. Live conformance 与调度资格是两道不同门

R3 已证明 15/15 exact endpoint 可以在腾讯隔离只读环境按冻结探针合同响应，但 endpoint PASS 不自动改写 Source Capability Registry。

当前精确记账：

```text
live-conformant endpoint profiles = 15
scheduler-route-eligible profiles = 14
registry-blocked profiles = 1
blocked probe = BINANCE_SPOT_CATALOG
blocked disposition = UNAVAILABLE
```

Binance 现货目录在 R3 使用官方 `showPermissionSets=false` 后通过 8 MiB 响应门禁，但 M1.1A registry 仍保留早期的 `UNAVAILABLE` disposition。它因此：

- 保留 live conformance PASS 事实。
- `schedulerRouteEligible=false`。
- `noAuthorityShadowEligible=false`。
- 不得生成 M1.4A live grant 或 M1.4B batch。

正确修复顺序是：

```text
复核并修订 registry row
-> 生成新的 registry digest
-> 绑定新 digest 重跑 exact live conformance
-> 新 artifact PASS
-> 才可开放 Binance spot scheduler route
```

不得用旧 R3 artifact 越过新 registry digest。Binance 官方接口合同见 [Spot REST API General endpoints](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/general)。

## 4. Endpoint Profile

每个 Profile 冻结：

- 精确 HTTPS host、URL、GET method 和 credential class。
- REST poll transport；当前 WebSocket Profile 数量固定为 0。
- `SOURCE_WIDE_SNAPSHOT`、`PAGINATED_SOURCE_WIDE_SNAPSHOT` 或 `LISTING_HISTORY_SEGMENT`。
- 单请求 token、每 source 并发 1、12 秒超时和单页 8 MiB 上限。
- pagination、history responsibility、checkpoint retry 和 no-stale-promotion。
- Bitget Venue、Listing Lifecycle、Equity Asset Domain、Data Maximization 四条独立验收轴。

Profile 只证明 endpoint 语义和进入后续 no-authority Shadow 的资格，不代表已执行、已稳定、已落库或已获得 Fact authority。

## 5. 批处理与两本请求预算

M1.4A 按每个 intent 一个 token 计算保守上界。M1.4B 只对 source-wide snapshot 比较批处理节省，listing history 使用独立分页预算。

### 5.1 Snapshot 账

```text
snapshotReadyIntentCount
snapshotPerIntentTokenUpperBound
snapshotRequestTokens
snapshotRequestTokenSavings
```

同一 source-capability 的多个 ready intent 只形成一个 source-wide batch。每个 ready intent 必须恰好进入一个 batch；重复、遗漏、Profile 缺失或 route blocked 均失败。

当前 400 个四 Venue derivative catalog 测试：

```text
ready intents = 400
endpoint batches = 4
snapshot per-intent upper bound = 400 tokens
snapshot request budget = 67 tokens
snapshot savings = 333 tokens
```

67 不是四个普通单页请求：Bybit derivative catalog 保留最多 64 页的显式分页预算，其他三个 Venue 各 1。

### 5.2 Listing history 账

```text
listingHistoryRequestTokens
requestBudgetClass = LISTING_HISTORY_CHECKPOINTED
```

历史 bootstrap 最多 64 页，是 M1.4B 新增的 checkpointed history 职责，不能与 M1.4A 的单次逐标的 snapshot 上界比较，也不能把 64 页写成“负节省”或虚假优化。

总预算满足：

```text
maximumRequestTokens
= snapshotRequestTokens
+ listingHistoryRequestTokens
```

## 6. 上新历史状态机

### 6.1 Bybit

- 使用官方 announcement endpoint 的 `new_crypto` 范围。
- B0 的最新两页只证明 `BOUNDED_COMPLETE` conformance，不代表完整历史。
- M1.4B bootstrap 按 page 1..N 遍历 provider 可提供历史。
- segment 可在 64 页边界形成 `BOOTSTRAP_IN_PROGRESS` checkpoint，下段从 exact next page 恢复。
- 完成后 `providerHistoryComplete=true`，但只表示该 endpoint 当时可提供的历史。

Bybit 官方 endpoint 见 [Announcement API](https://bybit-exchange.github.io/docs/v5/announcement)。

### 6.2 Bitget

- 使用官方 `coin_listings` 范围。
- 每页最多 10 条，以最后一条 `annId` 作为下一 cursor。
- 官方接口只提供最近一个月，因此完成后只能声明：

```text
providerWindowComplete = true
providerHistoryComplete = false
```

- 不得把一个月窗口改写成全历史。

Bitget 官方边界见 [Get All Notices](https://www.bitget.com/api-doc/common/notice/Get-All-Notices)。

### 6.3 原子 gap

以下情况产生内容寻址 gap，旧 checkpoint 保持不变：

- source/profile/release 漂移。
- 首 token、页间 token 或 segment ordinal 不连续。
- 重复 token。
- 空的非终止页。
- 同 announcement id 内容摘要冲突。
- incremental 未与旧 checkpoint 重叠。
- segment stop 与 terminal 状态矛盾。
- 页知识时间晚于 source cutoff。
- 单 segment 超过 Profile 的 64 页上限。

原始响应正文和 secret 均不得进入 page、checkpoint 或 gap artifact。

## 7. 新增范围独立验收

四条轴允许在一个 batch 上重叠，但不得互相借 PASS。前三条是业务范围，第四条是跨来源能力开放治理；代码可同包执行，分母、状态、证据和完成判定必须分开。

### 7.1 Bitget Venue

- 独立 source identity、capability、quota、batch、failure、Shadow、SLO 和回滚。
- Bitget derivative catalog 的 PASS 不替代 Bitget spot、listing、行情或深验 capability。
- 其他 Venue 的数据不得补成 Bitget 可用性。

### 7.2 Listing Lifecycle

- spot catalog 与 announcement 分别记账。
- watch 资产只进入 T0，不是 eligible derivative。
- 历史完整度按 Provider 边界分别核算。
- 公告或上新事件本身不能产生方向、Candidate 或交易计划。

### 7.3 股票与股票指数/ETF合约

- 当前 Profile 只允许 derivative catalog accounting。
- `equityTradableFactBatchCount=0`。
- session、corporate action、FX、reference/mark/index、basis、费用、地区和执行机制未完成前，不能生成股票可交易 Fact 或后续决策 authority。
- 股票 Asset Domain 不能借加密、Bitget Venue 或 Listing Lifecycle 的 PASS。

### 7.4 Data Maximization

- 每个 source-capability 以自身 route、请求、记录、失败、配额和恢复分母验收。
- `DATA_MAXIMIZATION` 失败不能改写 Bitget、Listing 或 Equity 的独立事实，其他三轴通过也不能把缺失 capability 补成可用。
- “交易所能返回”只证明 observed；没有官方语义、权利、point-in-time、质量、容量和下游增量价值时保持 blocked。

## 8. “数据最大化”是治理策略，不是盲目抓取

可用数据最大化必须遵循：

```text
Source Capability Registry
-> official semantics and rights
-> exact live conformance
-> route-eligible Adapter Profile
-> bounded no-authority Shadow
-> quality / quota / cost / capacity
-> point-in-time persistence and replay
-> downstream calibration
```

没有通过某一层的 capability 保持 `UNAVAILABLE/BLOCKED/ABSENT`。禁止用相似接口、缓存、旧 Scope Epoch 或 UI 需求补位。

## 9. 权威实现与验证

```text
src/v2/modules/source-conformance/adapters/exact-source-conformance-runner.ts
src/v2/modules/collector/runtime-adapter-profile.ts
src/v2/modules/collector/runtime-adapter-profile.test.ts
src/v2/modules/collector/runtime-adapter-live.ts
src/v2/modules/collector/runtime-adapter-live.test.ts
src/v2/modules/multi-asset-universe/listing-history-runtime.ts
src/v2/modules/multi-asset-universe/listing-history-runtime.test.ts
scripts/v2/production/m1-runtime-adapter-live-bundle.mjs
scripts/v2/production/m1-runtime-adapter-live-runner.mjs
scripts/v2/production/m1-runtime-adapter-live-entrypoint.sh
```

腾讯现场包冻结以下边界：

- 15 个 live-conformant Profile 保持完整分母；只执行 14 个 route-eligible Profile，`BINANCE_SPOT_CATALOG` 请求数必须为 0。
- Binance、OKX、Bybit、Bitget、CoinGlass 五个 source group 可跨来源并行；同一来源严格并发 1。
- Bybit 与 Bitget listing segment 各最多 64 页；页间 request token、checkpoint、gap 和 prior `PASS` result 必须精确绑定。
- Bundle 不含 secret；CoinGlass key 只在目标机从受限生产 env 进入一次性子进程，不写入 staging、日志、artifact、result 或 checkpoint。
- 执行前后绑定 production HEAD、容器身份、listener、timer 和 health。任何漂移在证据晋级前失败关闭。
- blocked segment 可以保留脱敏诊断 artifact/result，但不得写可续跑 checkpoint；历史 checkpoint 必须绑定原 `PASS` result 的路径和 SHA-256，孤儿、失败或被篡改结果一律拒绝。
- 本地注入 transport 只能产生 `TEST_ONLY / TEST_HARNESS`；不能冒充腾讯 `LIVE_READ_ONLY`。

定向验证：

```bash
npm run test:v2-m1-source-conformance-multi-asset
npm run test:v2-m1-adaptive-collector
npm run test:v2-m1-runtime-adapter-listing-history
npm run test:v2-m1-runtime-adapter-live-package
```

当前结果：

```text
M1.1B source conformance + multi-asset regression: 26/26 PASS
M1.4A adaptive collector regression: 28/28 PASS
M1.4B runtime profile + listing history: 23/23 PASS
M1.4B Tencent runtime fixed-dispatch package: 9/9 PASS
V2 Foundation: 448 PASS / 6 explicit skip / 454 total
V2 Ops: 131/131 PASS
M0 machine exit: PASS
Next production build: PASS
Golden cases: 16/16 PASS
Security check: PASS
full ci:production: PASS
```

## 10. 本地出口与后续顺序

本地核心、精确派发包和正式实施分支完整 CI 已通过；GitHub 同步后，M1.4B 仍未完成现场运行验收。现场后续固定为：

```text
Tencent isolated no-authority runtime execution
-> real Bybit bootstrap + Bitget one-month checkpoint evidence
-> quota/request-rate/full-denominator verification
-> registry amendment + new-digest conformance for Binance spot
-> M1.5C Four-Venue Multi-Asset Shadow
-> M1.6-D1 Expanded-Scope No-Cost Capacity Proof
```

只有 Tencent isolated runtime、持久 checkpoint、完整分母、失败恢复和请求率均通过后，M1.4B 主步骤才可关闭。
