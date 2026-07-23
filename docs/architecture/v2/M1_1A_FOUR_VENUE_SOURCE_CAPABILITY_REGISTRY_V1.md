# Market Radar V2 M1.1A 四 Venue 来源能力登记合同 v1

状态：`LOCAL_CONTRACT_PASS / OFFICIAL_DOCUMENTS_REVIEWED / LIVE_PROBE_AND_SCOPE_V2_ADAPTERS_UNPROVEN / PRODUCTION_UNCHANGED`

冻结日期：2026-07-23

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 目标

M1.1A 把以下新增范围放进同一个可执行、可审计、不能漏项的来源能力登记表：

1. Binance Futures。
2. OKX Swap。
3. Bybit Derivatives。
4. Bitget Futures。
5. CoinGlass V4，账号套餐为用户已确认的 Hobbyist。
6. 当前合约、预上线/刚上线/维护/限制/下架合约。
7. 只有资产或现货上新、尚无支持合约的 watch 标的。
8. 加密线性永续、单一股票永续、股票指数/ETF 永续。
9. 对发现、验证、执行和复盘有净价值的衍生品、盘口、事件与跨市场上下文。

本包只建立来源治理合同。它不发网络请求、不接生产、不生成 Market Fact、Candidate、Signal、Strategy 或 READY。

## 2. 唯一机器权威

合同与登记表：

- `src/v2/modules/source-capability/source-capability-contract.ts`
- `src/v2/modules/source-capability/adapters/four-venue-capability-registry.ts`
- `src/v2/modules/source-capability/source-capability-contract.test.ts`

登记表固定：

```text
4 个第一方 Venue
+ 1 个聚合确认来源 CoinGlass
x 33 类能力
= 165 个 source-capability 唯一组合
```

每个组合都必须存在。未知能力不能省略，只能显式进入：

```text
UNAVAILABLE
OBSERVED_UNSUPPORTED
REJECTED_UNLICENSED
REJECTED_REDUNDANT
REJECTED_LOW_VALUE_HIGH_COST
```

任何缺行、重复、错误证据绑定、摘要篡改、套餐越权或密钥内容都会使登记表失败。

## 3. 两层真值

每项能力必须同时表达两层状态：

### 3.1 官方能力层

回答：

- 官方是否公开说明产品、endpoint 或 channel。
- 是否公开说明鉴权、套餐、限速、分页、历史范围或推送节奏。
- 官方资料能否证明股票永续、上新状态或某种数据存在。

### 3.2 Market Radar 运行层

回答：

- V2 Adapter 是否实现。
- 是否执行过当前 Scope Epoch 的真实能力探测。
- 返回 schema、分页、时钟、限速和失败语义是否经过实证。
- 当前地区、账号和套餐是否真实可用。

硬规则：

```text
OFFICIAL_DOCUMENTED != ADAPTER_IMPLEMENTED
ADAPTER_IMPLEMENTED != LIVE_PROBE_PASS
HTTP_200 != CLEAN_ROWS
CLEAN_ROWS != FRESH_ENOUGH
PRODUCT_EXISTS != MARKET_RADAR_CAN_SCAN_IT
```

M1.1A 只有官方文档和合同层 PASS。Scope V2 的真实探测与 Adapter PASS 数量仍为 0。

## 4. 33 类能力

### T0 Catalog / Event

- `SERVER_TIME`
- `DERIVATIVE_INSTRUMENT_CATALOG`
- `SPOT_INSTRUMENT_CATALOG`
- `LISTING_ANNOUNCEMENT`
- `INSTRUMENT_STATUS_STREAM`
- `PRICE_LIMIT_RISK_RULE`
- `INSTRUMENT_FEE_SCHEDULE`
- `EQUITY_SESSION_REFERENCE`
- `EQUITY_CORPORATE_ACTION`
- `TOKEN_UNLOCK_EVENT`
- `MARKET_NEWS_EVENT`

### T1 Wide Market

- `TICKER`
- `MARK_PRICE`
- `INDEX_PRICE`
- `TRADE_KLINE`
- `MARK_PRICE_KLINE`
- `INDEX_PRICE_KLINE`
- `ORDER_BOOK_SNAPSHOT`
- `OPEN_INTEREST_CURRENT`
- `FUNDING_CURRENT`
- `FX_REFERENCE`

### T2 Candidate Burst

- `PUBLIC_TRADE`
- `ORDER_BOOK_DELTA`
- `OPEN_INTEREST_HISTORY`
- `FUNDING_HISTORY`
- `LIQUIDATION_EVENT`
- `TAKER_FLOW`

### T3 Deep Validation / Context

- `LONG_SHORT_RATIO`
- `HISTORICAL_BULK_ARCHIVE`
- `OPTIONS_MARKET_CONTEXT`
- `ETF_FLOW_CONTEXT`
- `EXCHANGE_BALANCE_CONTEXT`
- `SENTIMENT_INDEX_CONTEXT`

T0-T3 是调度层，不是证据等级。T3 数据也不能绕过结构、资格、执行可行性和风险门禁。

## 5. 每行强制字段

每个 source-capability 组合完整保存：

```text
sourceId
capabilityId
assetDomains
endpoint / channel
source semantics
auth class
documentation status
entitlement status
rate limit and evidence
pagination termination
history horizon
push cadence
point-in-time suitability
replay suitability
rights status
implementation status and source reference
runtime probe status and evidence
disposition
cost/storage class
failure semantics
reason codes
NO_SYNTHETIC_OR_STALE_FALLBACK
```

未取得精确限速、历史或套餐证明时必须保留 `UNVERIFIED`，不得根据旧代码、博客或经验补写。

## 6. 当前官方资料结论

### 6.1 股票永续基线纠正

2026-07-23 官方资料确认四家目标 Venue 均存在股票类永续或 TradFi 永续产品：

- [Binance Stock Perpetuals](https://www.binance.com/en/academy/articles/how-to-trade-stock-perpetual-contracts-on-binance)
- [OKX Stock Perpetuals](https://www.okx.com/en-us/help/stock-perpetuals)
- [Bybit TradFi Perpetual Contracts](https://www.bybit.com/en/help-center/article/Introduction-to-TradFi-Perpetual-Contracts)
- [Bitget Stock Perps](https://www.bitget.com/support/articles/12560603835927)

因此 M0.4 的旧结论：

```text
Binance Equity = UNVERIFIED_UNAVAILABLE
```

已失效，必须纠正为：

```text
OFFICIAL_PRODUCT_DOCUMENTED
+ EXISTING_GENERAL_FUTURES_API_SURFACE
+ SCOPE_V2_ASSET_IDENTITY_MAPPING_NOT_IMPLEMENTED
+ LIVE_CAPABILITY_PROBE_NOT_RUN
+ REGION_AVAILABILITY_UNVERIFIED
```

这项修正扩大官方产品证明，不扩大 Market Radar 运行证明。

四家 Venue 的股票产品都存在传统市场休市、reference/index、basis、流动性、资金费、价格跳空和公司行动风险。当前均未取得合格的机器可读 session calendar 与 corporate-action feed，所以股票域仍不能进入 Detection 或 READY。

### 6.2 上新与生命周期

- Bybit 官方提供 announcements API、`PreLaunch/Trading` 与 pre-listing 字段。
- Bitget 官方提供 announcements API，当前文档声明可查询一个月，且 catalog 包含 `listed/normal/maintain/limit_open/restrictedAPI/off`、`launchTime/offTime`。
- OKX 官方提供 public instruments 与 instruments WebSocket channel。
- Binance 官方提供合约目录和 contract information stream。
- Binance 与 OKX 的机器可读官方公告 API 当前未验证，保持 `UNAVAILABLE`，不能用网页抓取或新闻聚合静默代替。

官方依据：

- [Bybit Instruments Info](https://bybit-exchange.github.io/docs/v5/market/instrument)
- [Bybit Announcements](https://bybit-exchange.github.io/docs/v5/announcement)
- [Bitget Contract Config](https://www.bitget.com/api-doc/classic/contract/market/Get-All-Symbols-Contracts)
- [Bitget Announcements](https://www.bitget.com/api-doc/common/notice/Get-All-Notices)
- [OKX API v5](https://www.okx.com/docs-v5/en/)
- [OKX Instrument Channel Guidance](https://www.okx.com/docs-v5/trick_en/)
- [Binance USD-M Market Data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data)

### 6.3 Bitget

Bitget 正式进入四 Venue 主分母。当前官方资料已登记：

- futures contract config 和 `isRwa`。
- spot instrument catalog。
- listing/delisting announcement。
- ticker、mark/index。
- market/mark/index Kline。
- public fills、REST depth 和 WebSocket depth。
- current OI。
- current/history funding。
- long-short ratio。
- price/risk rule 和公开 maker/taker fee。
- Stock Perps 产品。

`isRwa=YES` 只说明 RWA，不足以判定股票、ETF、指数、商品或外汇。M1.1B 必须结合官方产品元数据和 underlying reference 建立资产身份；不能按 symbol 猜。

### 6.4 CoinGlass Hobbyist

用户已确认账号套餐为 Hobbyist。官方 pricing 当前说明：

```text
80+ endpoints
30 requests/minute
updates <= 1 minute
personal use
4h history up to 180 days
```

但套餐总表不能证明每个具体 endpoint 都可用。当前只有官方 endpoint 页面明确标注的能力可记为 `HOBBYIST_CONFIRMED`；其余均为 `PLAN_ENTITLEMENT_UNVERIFIED`，等待 exact-plan 探测。

明确拒绝：

- Liquidation WebSocket 要求 Standard 或以上，Hobbyist=`REJECTED_UNLICENSED`。
- News endpoint 对 Hobbyist 不可用，`REJECTED_UNLICENSED`。

CoinGlass 只用于候选确认和跨市场上下文，不替代四家 Venue 的全市场发现、目录、mark/index、盘口或执行事实。

官方依据：

- [CoinGlass Authentication](https://docs.coinglass.com/reference/authentication)
- [CoinGlass Endpoint Overview](https://docs.coinglass.com/reference/endpoint-overview)
- [CoinGlass Pricing](https://www.coinglass.com/pricing)
- [CoinGlass Supported Coins](https://docs.coinglass.com/reference/trading-market)
- [CoinGlass News](https://docs.coinglass.com/reference/article-list)
- [CoinGlass Liquidation WebSocket](https://docs.coinglass.com/reference/ws-liquidation-order)

## 7. 登记结果

| Source | 官方文档行 | Adopted | Derived | Observed unsupported | Rejected | Unavailable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Binance | 23 | 21 | 0 | 2 | 0 | 10 |
| OKX | 23 | 21 | 0 | 2 | 0 | 10 |
| Bybit | 24 | 20 | 1 | 3 | 0 | 9 |
| Bitget | 22 | 19 | 0 | 3 | 0 | 11 |
| CoinGlass | 18 | 11 | 4 | 0 | 3 | 15 |

CoinGlass 的 3 个 Rejected 包含 2 个套餐不许可和 1 个与第一方 Venue Kline 重复的能力。

全局结果：

```text
expected rows = 165
observed rows = 165
documented rows = 110
unavailable or unlicensed rows = 57
scope-v1 historical runtime-pass rows = 6
scope-v2 runtime-pass rows = 0
violations = 0
```

六个 V1 行仅是 Binance/OKX/Bybit 的 catalog 与 mark-price 旧范围证据，不能证明股票、Bitget、上市生命周期或 V2。

## 8. 失败语义

所有来源统一 fail closed：

- 401/403：`AUTH_FAILURE_UNAVAILABLE` 或 `ENTITLEMENT_FAILURE_UNAVAILABLE`。
- 429：退避并保留 unavailable；禁止提升旧缓存。
- 非 2xx：`HTTP_NON_2XX_UNAVAILABLE`。
- schema drift：整项 unavailable，不从未知字段猜值。
- 空返回：记录 observed empty，不解释为市场无机会。
- 分页未终止：整批 incomplete，不把前几页冒充完整分母。
- WebSocket sequence gap：reconcile 或 unavailable。
- source clock 不明：不能进入 point-in-time authority。
- transport failure：不静默切到不同语义来源。

任何 fallback 必须是登记过的独立来源与独立 lineage；旧缓存、mock、前端补值和跨 Venue 猜测永久禁止。

## 9. 权利、成本与存储

- 官方 API 文档不是数据留存、回放或再分发许可。
- Venue 数据进入长期存储或研究归档前仍需 exact terms review。
- CoinGlass 按个人使用和套餐合同治理，不保存或输出 API key。
- T2/T3 高频数据使用有界突发窗口和对照样本，不无差别永久保存。
- 新来源进入生产前必须重跑四 Venue实际 facts/min、存储、网络和 CPU 的无付费容量证明。

## 10. 正确后续顺序

为避免“登记表完成但接入时又重新猜”的问题，M1.1B 作为一个实现超级包，内部固定两个不可跳过的出口：

```text
M1.1B0 Exact Source Conformance
  -> 四 Venue公开 endpoint/channel 样本捕获
  -> CoinGlass Hobbyist exact-plan allowlist 探测
  -> schema/rate-limit/pagination/time/failure evidence

M1.1B1 Multi-Asset Identity + Listing Intelligence
  -> Bitget adapter
  -> 四 Venue crypto/equity/RWA/CFD identity
  -> contract + spot listing watch
  -> announcement/catalog/stream reconciliation
  -> listing epoch and symbol reuse
```

两个出口在同一超级包中合并施工和完整 CI，以提高效率；但 B0 不通过的 capability 不能在 B1 中被假定可用。

后续：

```text
M1.1B0/B1
-> M1.4A Adaptive Multi-Asset Collector
-> M1.5C Four-Venue Multi-Asset Shadow
-> M1.6-D1 Expanded-Scope No-Cost Capacity Proof
-> M2.3 Listing/Venue + Equity Event Detection
```

P0R 生产恢复继续作为独立第一关键路径，绑定 V1 exact release。M3.4 草稿继续冻结，直到 scope rebase 完成。

## 11. 本包完成边界

可以说：

```text
四 Venue + CoinGlass 的目标能力分母已经穷举。
Bitget、上新、股票永续和跨市场上下文已经正确进入同一搭建计划。
官方产品能力、套餐状态、实现状态和运行状态已经分层。
Binance 股票永续旧结论已经纠正。
```

不能说：

```text
Bitget 已接入。
股票合约已能扫描。
上新币已能提前发现。
CoinGlass 全部 Hobbyist endpoint 已验证。
四 Venue live 能力或容量已经通过。
任何新增 Detector、Candidate、Strategy 或 READY 已具备 authority。
```

本包对生产服务、数据库、Redis、Worker、env、Feature Flag、数据和业务 authority 的变更均为 0。
