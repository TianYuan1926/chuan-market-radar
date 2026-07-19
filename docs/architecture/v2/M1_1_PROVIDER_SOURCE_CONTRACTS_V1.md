# M1.1 三家交易所公开数据源合同 v1

状态：`LOCAL_CONTRACT_IMPLEMENTED / FROZEN_PROVIDER_FIXTURES_PASS / LIVE_CONNECTIVITY_UNPROVEN / PRODUCTION_UNCHANGED`

核对日期：2026-07-20

## 1. 本合同证明什么

本合同只覆盖 M1.1：Binance USD-M Futures、OKX SWAP、Bybit Linear 的公开合约目录与 `LAST_PRICE` 快照。它证明 V2 已有独立、只读、失败关闭的 Adapter 和本地纵向切片，不证明公网当前可达、全市场覆盖已运行、数据库已持久化、Worker 已部署或生产已接管。

输出边界：

```text
公开 Venue catalog
-> InstrumentAccountingRecord
-> EligibleInstrumentSnapshot
-> 公开 ticker
-> PointInTimeMarketFact
-> FactQualitySnapshot
```

不生成 Candidate、方向、等级、入场、止损、目标、RR、Signal 或交易计划。

## 2. 官方来源与固定端点

| Venue | 官方资料 | M1.1 固定公开 GET |
| --- | --- | --- |
| Binance USD-M | [Binance Developer Catalog](https://developers.binance.com/en/docs/catalog)、[官方 Futures Connector market source](https://github.com/binance/binance-futures-connector-python/blob/main/binance/um_futures/market.py) | `/fapi/v1/exchangeInfo`、`/fapi/v2/ticker/price` |
| OKX SWAP | [OKX API v5](https://www.okx.com/docs-v5/en/) | `/api/v5/public/instruments?instType=SWAP`、`/api/v5/market/tickers?instType=SWAP` |
| Bybit Linear | [Instruments Info](https://bybit-exchange.github.io/docs/v5/market/instrument)、[Tickers](https://bybit-exchange.github.io/docs/v5/market/tickers) | `/v5/market/instruments-info?category=linear&limit=1000`、`/v5/market/tickers?category=linear` |

所有端点固定为 HTTPS allowlist，Transport 只发无凭证 `GET`，不读取 secret，不接账户和下单 API。Bybit 目录必须持续翻页直到空 `nextPageCursor`；重复 cursor、后续页失败或达到页数上限时整家 Venue 不得保留 eligible 状态。

## 3. Identity 归一化

Canonical ID：

```text
{venue}:{venueInstrumentId}:LINEAR_PERPETUAL:{settlementAsset}
```

Underlying Group：

```text
{baseAsset}:{settlementAsset}_LINEAR_PERPETUAL
```

| Venue | 合格合同判定 | 合约数量单位 |
| --- | --- | --- |
| Binance | `contractType=PERPETUAL`、`quoteAsset=USDT`、`marginAsset=USDT`、`status=TRADING` | 线性合约数量按 1 个 base quantity unit 归一化 |
| OKX | `instType=SWAP`、`ctType=linear`、crypto category、`settleCcy=USDT`、`state=live` | 使用官方 `ctVal`，base 使用 `ctValCcy` |
| Bybit | `contractType=LinearPerpetual`、`quoteCoin=USDT`、`settleCoin=USDT`、`status=Trading`、非 pre-listing | 线性合约数量按 1 个 base quantity unit 归一化 |

任何记录即使字段缺失也必须获得稳定 `observationId` 并留在 observed 分母。只有完整身份可以 `ELIGIBLE`；unsupported、suspended、delisting、unresolved 和 unavailable 均保留原因。Canonical 冲突不会择一保留，所有冲突行统一降为 `UNRESOLVED`。

`contractSize` 归一化在扩大到全市场和用于任何执行计算前还要按交易所规格做独立 reconciliation；M1.1 只把它用于身份合同，不用于仓位、成本或下单。

## 4. Fact 与时间语义

| Venue | 价格 | event/sequence |
| --- | --- | --- |
| Binance | `price` | ticker `time` |
| OKX | `last` | ticker `ts` |
| Bybit | `lastPrice` | response `time` |

每个 Fact 明确保存：

```text
eventTime | null
receivedAt
normalizedAt
persistedAt | null
sourceRecordIds
sequence | null
quality + reasonCodes
```

M1.1 不写数据库，所以 `persistedAt=null`。网络失败没有 exchange event time，必须 `eventTime=null`；非空价格必须有合法 event time。0、缺失值、旧缓存和 fallback 都不能替代未知。

重复序列和乱序序列作废当前值；超过配置阈值的 sequence gap 标记 `PARTIAL`；超过 freshness 阈值标记 `STALE`；cutoff 之后的事件作废。OKX 官方说明不同缓存服务可能让后一次请求返回更旧数据，因此乱序检测是合同要求，不是可选优化。

## 5. 失败分类

| 事实 | 输出 |
| --- | --- |
| HTTP 429 / Bybit 10006 | `RATE_LIMITED` |
| HTTP 401/403 | `AUTH_ERROR` |
| 超时、连接或其他 HTTP 失败 | `TRANSPORT_ERROR` |
| JSON、外层 schema、timestamp、price 或 sequence 非法 | `INVALID` |
| 合格 instrument 没有对应 ticker | `UNAVAILABLE` |
| 部分 Venue 或部分 Fact 失败 | 总体 `PARTIAL`，不写成“市场无机会” |

Transport 有明确 timeout 和最大响应字节数，不把上游 body、原始价格或未知字段回显到错误对象。

## 6. 本地证据与未证明项

本地冻结样本和故障测试覆盖：正常三 Venue、完整分页、截断/重复 cursor、后续页失败、unsupported、停牌、退市、缺失结算币、身份冲突、schema drift、HTTP/body rate limit、transport failure、invalid JSON、超大响应、重复记录、重复 sequence、乱序、gap、stale、future cutoff 和 recovery。

2026-07-20 曾从当前本地环境对六个公开端点做只读、15 秒超时探测，均未取得可解析响应。因此当前必须记录：

```text
official_contract_reviewed=true
frozen_fixture_path_pass=true
live_provider_connectivity_proven=false
production_market_fact_authority=false
```

下一步不是把失败伪装成通过，而是进入 M1.2 的纯 Feature/Context 纵切；公网连通、全量 instrument reconciliation、Worker、持久化和 Shadow 分别在后续独立 Gate 证明。
