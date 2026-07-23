# Market Radar V2 M1.1B 精确来源一致性、多资产身份与上新情报合同 v1

状态：`LOCAL_IMPLEMENTATION_PASS / TEST_ONLY_CONFORMANCE_PASS / LIVE_B0_NOT_RUN / PRODUCTION_UNCHANGED`

冻结日期：2026-07-23

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 任务定位

M1.1B 把 M1.1A 的来源能力登记转成三个可执行但彼此不越权的组件：

1. B0 精确来源一致性探针，证明当前环境实际能否读取所登记的目录、时间、现货和公告接口。
2. B1 四 Venue 多资产身份层，纳入 Bitget、加密永续、股票类永续、ETF/指数类永续和其他 RWA。
3. B1 上新生命周期层，记录首次出现、预上线、交易、维护、限制、下架及目录缺失。

本包不接入旧 V1 Eligibility、Market Fact、Candidate、Signal、Strategy 或 READY。它只形成可审计的来源证据、身份快照和生命周期账本。

## 2. 为什么建立独立 Scope V2 层

旧 V1 运行链路硬编码为 Binance、OKX、Bybit 三 Venue 加密线性永续。直接扩大旧枚举会同时改变旧证据分母、生产消费者和历史合同，容易把 V1 的 PASS 冒充成四 Venue 多资产 PASS。

因此 M1.1B 使用独立命名空间：

```text
source-capability
-> source-conformance
-> multi-asset-universe
-> future adaptive collector
```

旧 V1：

```text
SCOPE_EPOCH_V1_CRYPTO_3V
```

新增层：

```text
SCOPE_EPOCH_V2_MULTI_ASSET_4V
```

两个 epoch 不共享 runtime PASS、Shadow、容量、阈值或校准结论。

## 3. 唯一机器实现

### 3.1 B0 来源一致性

- `src/v2/modules/source-conformance/source-conformance-contract.ts`
- `src/v2/modules/source-conformance/adapters/exact-source-conformance-runner.ts`
- `src/v2/entrypoints/m1-exact-source-conformance.ts`
- `src/v2/modules/source-conformance/source-conformance-contract.test.ts`

### 3.2 B1 多资产身份与生命周期

- `src/v2/modules/multi-asset-universe/multi-asset-identity-contract.ts`
- `src/v2/modules/multi-asset-universe/listing-lifecycle-contract.ts`
- `src/v2/modules/multi-asset-universe/adapters/four-venue-multi-asset-catalog.ts`
- `src/v2/modules/multi-asset-universe/adapters/bybit-bitget-listing-announcements.ts`
- `src/v2/modules/multi-asset-universe/multi-asset-universe-contract.test.ts`

定向验证入口：

```bash
npm run test:v2-m1-source-conformance-multi-asset
```

真实只读探针入口：

```bash
npm run v2:m1:source-conformance -- \
  --repository-root <absolute-clean-repository> \
  --release-id <exact-40-hex-commit> \
  --network-environment <LOCAL_WORKSTATION|TENCENT_ISOLATED_READ_ONLY>
```

## 4. B0 固定的 15 个探针

### 4.1 多资产身份 Gate，8 项

```text
BINANCE_SERVER_TIME
BINANCE_DERIVATIVE_CATALOG
OKX_SERVER_TIME
OKX_DERIVATIVE_CATALOG
BYBIT_SERVER_TIME
BYBIT_DERIVATIVE_CATALOG
BITGET_SERVER_TIME
BITGET_DERIVATIVE_CATALOG
```

### 4.2 上新情报 Gate，6 项

```text
BINANCE_SPOT_CATALOG
OKX_SPOT_CATALOG
BYBIT_SPOT_CATALOG
BYBIT_LISTING_ANNOUNCEMENT
BITGET_SPOT_CATALOG
BITGET_LISTING_ANNOUNCEMENT
```

### 4.3 CoinGlass 上下文 Gate，1 项

```text
COINGLASS_SUPPORTED_COINS
```

CoinGlass 使用用户已确认的 Hobbyist 只读 key。key 只通过 `CG-API-KEY` 发送，不进入 artifact、日志、Git 或响应摘要。

上新公告探针固定为官方可验证语义：

- Bybit 使用 `type=new_crypto`，从第一页开始完整遍历官方分页。
- Bitget 使用 `annType=coin_listings`，覆盖官方允许的一个月窗口并完整遍历 cursor。
- 五个来源组允许并行，但同一来源内严格串行；每页超时 12 秒、响应上限 8 MiB。
- 公告过滤、分页和执行策略均进入 `probePlanDigest`，任一变化都必须重新取得 B0 证据。

## 5. B0 证据等级与硬门槛

证据只有两类：

```text
LIVE_READ_ONLY
TEST_ONLY
```

注入 fixture fetch 时，runner 强制：

```text
evidenceClass = TEST_ONLY
networkEnvironment = TEST_HARNESS
gateStatus = NOT_EVALUATED_TEST_ONLY
```

测试全部 HTTP 200 也不能制造 live PASS。正式 Gate 只有在真实网络、精确 clean release 和全部必需探针 PASS 时才可为 `PASS`。

每个探针必须保存：

- probe definition digest。
- attempt/receive 时间和延迟。
- HTTP 状态。
- response body digest 与字节数。
- top-level keys、record keys 和记录数。
- provider server time 与绝对时钟偏差。
- 分页完成状态。
- credential disposition。
- 明确失败语义。
- `rawBodyRetained=false`。
- `secretMaterialPresent=false`。

任何计数、Gate 或内容摘要被修改，artifact schema 都必须拒绝。

## 6. B0 运输与失败关闭

runner 只允许：

- HTTPS。
- 固定官方 host。
- GET。
- 不跟随 redirect。
- 每页 8 MiB 上限。
- 12 秒请求超时。
- 有界页数。
- response digest，不保存 raw body。

强制失败：

- 非法 host、URL 或 probe 定义漂移。
- 401/403。
- 429。
- 非 2xx。
- 非 JSON 或 schema 漂移。
- 必需目录返回空数组。
- provider body error。
- 重复 cursor、缺 cursor 或超过最大页数。
- server time 缺失或与接收时间偏差超过 30 秒。
- CoinGlass key 缺失时，该探针显式 `NOT_RUN`。

公告在合法时间窗内可以返回 0 条；目录、服务器时间和 supported-coins 不能以空响应冒充正常覆盖。

## 7. B1 身份主键

每条 observation 同时保存：

```text
scopeEpoch
sourceId
venueInstrumentId
coverageClass
assetDomain
canonicalInstrumentId
underlyingReferenceId
underlyingGroupId
baseAsset
quoteAsset
settlementAsset
contractMechanism
contractMultiplier
priceTick
quantityStep
listingEpoch
identityEpoch
identityStatus
classificationAuthority
classificationEvidenceIds
providerStatus
lifecycleState
providerListTime
providerDelistTime
firstObservedAt
statusEffectiveAt
receivedAt
knowledgeAt
jurisdictionScope
sourceCapabilityId
rawRecordDigest
reasonCodes
```

身份主键不是 symbol 字符串。`canonicalInstrumentId` 必须绑定 source、venue instrument、asset domain、contract mechanism、settlement 和 listing epoch。

## 8. 四 Venue 分类规则

### 8.1 Binance

- `underlyingType=COIN` 才能按 provider 明确分类为加密线性永续。
- 缺失或未知 `underlyingType` 时保持 `UNRESOLVED`。
- 股票外观的 symbol 不能用于推断股票身份。
- 股票、ETF 或指数必须有仍在有效期内的官方产品映射。

### 8.2 OKX

使用官方 `instCategory`：

```text
1 = Crypto
3 = Stocks
4 = Commodities
5 = Forex
6 = Bonds
```

`3` 可进入股票类身份；`4/5/6` 只进入 broad RWA。缺失或未知枚举保持 unresolved。

### 8.3 Bybit

使用官方 `symbolType`：

```text
empty / innovation = crypto
stock = broad equity-like RWA
commodity = broad RWA
forex = broad RWA
```

`G9` 是费率分组，不是 instrument `symbolType`，禁止用于身份分类。

`symbolType=stock` 仍不能区分单一股票和 ETF，因此只进入 `OTHER_RWA_DERIVATIVE`；必须用有效的官方 underlying mapping 才能细分为：

```text
EQUITY_SINGLE_NAME_PERPETUAL
EQUITY_INDEX_ETF_PERPETUAL
```

### 8.4 Bitget

```text
isRwa=NO  -> crypto
isRwa=YES -> broad RWA
```

`isRwa=YES` 不能证明单股、ETF、指数、商品或外汇。只有证据绑定的官方产品映射可以细分。

### 8.5 官方映射

映射必须包含：

- source 与 exact venue instrument。
- exact asset domain。
- underlying reference。
- 至少一个 evidence ID。
- reviewed time。
- expiry time。

过期映射不生效。provider 分类与映射冲突、或同一 instrument 存在多个有效映射时，整条身份保持 unresolved。

## 9. listingEpoch 与 symbol reuse

相同 symbol 可能下架后重新上线，也可能变更 underlying 或合约规格。系统必须区分：

```text
listingEpoch
identityEpoch
```

规则：

1. provider 提供明确 listing time 时，用 source、instrument 与 listing time 构造 epoch。
2. provider 未提供 listing time 时，以首次观察建立 provisional epoch。
3. 后续 release 仍未提供 listing time 时，沿用前一个 provisional epoch，不能每次轮询制造“新币”。
4. provider 后来给出更晚的新 listing time 时，生成新 epoch。
5. 新 epoch 生成新 canonical identity。

## 10. 上新生命周期

状态集合：

```text
ANNOUNCED
OBSERVED_UNCONFIRMED
ANNOUNCED_WAITING_CATALOG
ASSET_OR_SPOT_LISTED_NO_CONTRACT
PRE_LAUNCH_OR_PREOPEN
TRADING_WARMUP
ESTABLISHED
MAINTENANCE
RESTRICTED
SUSPENDED
DELISTING
OFFLINE
UNRESOLVED
```

证据来源：

```text
official announcement
REST catalog observation
complete catalog absence
future instrument/config stream
```

硬规则：

- 公告 title 只保存摘要，不从自然语言标题猜 symbol。
- 只有 provider 返回的结构化 instrument ID 才能关联 announcement 与 instrument。
- product update 或 other announcement 不能伪装成新上线。
- 完整目录中暂时缺失一个 instrument 只能记为 `UNRESOLVED`，不能推断已下架。
- delisting 必须来自明确 provider status、delist time 或结构化官方公告。
- announcement、catalog 与 stream 冲突时保留冲突，不能静默择一。

## 11. 权威边界

所有 M1.1B 产物固定：

```text
runtimeEligibility = NOT_EVALUATED_NO_AUTHORITY
candidateEmissionAllowed = false
strategyAuthorityGranted = false
productionChanged = false
```

本包不能：

- 写 Candidate Store。
- 生成信号等级。
- 生成多空入场、止损或止盈。
- 进入 READY。
- 修改旧 V1 eligibility denominator。
- 接生产页面。
- 证明四 Venue live 覆盖。
- 证明股票域可实战。

## 12. 当前验证真值

截至冻结时：

```text
TypeScript isolated compile = PASS
directed contract tests = 22/22 PASS
test harness conformance = PASS_TEST_ONLY
live local conformance = NOT_RUN
Tencent isolated live conformance = NOT_RUN
full production CI = PASS
production mutation = 0
```

本地直连目标 Venue 曾观察到 transport reset，因此不能使用本地 fixture 代替真实 B0。正式 B0 应绑定提交后的 clean release，在腾讯隔离只读环境执行。

## 13. 后续固定顺序

```text
M1.1B local implementation + full CI
-> exact commit push
-> M1.4A capability-independent scheduler contract [COMPLETE]
-> M1.1B0 no-secret fixed-dispatch package
-> Tencent isolated LIVE_READ_ONLY B0
-> only passed capabilities enter M1.4B runtime Adapter
-> M1.5C Four-Venue Multi-Asset Shadow
-> M1.6-D1 Expanded-Scope No-Cost Capacity Proof
-> M2/M3 per-domain detection, calibration, feasibility and risk
```

B0 中失败的能力不能在 M1.4B 中假定可用。单股和 ETF/指数必须分别取得 session、reference/index、公司行动、费用、资金费、流动性、地区可用性、历史/Shadow、容量和校准证据。

P0R 生产恢复继续作为独立第一关键路径。M3.4 V1 草稿继续暂停，等待 Scope V2 rebase review。

## 14. 官方依据

- [Bybit Instruments Info](https://bybit-exchange.github.io/docs/v5/market/instrument)
- [Bybit Enums](https://bybit-exchange.github.io/docs/v5/enum)
- [Bybit Announcements](https://bybit-exchange.github.io/docs/v5/announcement)
- [Bitget Contract Config](https://www.bitget.com/api-doc/contract/market/Get-All-Symbols-Contracts)
- [Bitget Spot Symbol Info](https://www.bitget.com/api-doc/spot/market/Get-Symbols)
- [Bitget Announcements](https://www.bitget.com/api-doc/common/notice/Get-All-Notices)
- [OKX API v5](https://www.okx.com/docs-v5/en/)
- [Binance USD-M Futures](https://developers.binance.com/en/docs/catalog)
- [CoinGlass Supported Coins](https://docs.coinglass.com/reference/trading-market)
- [CoinGlass Authentication](https://docs.coinglass.com/reference/authentication)
