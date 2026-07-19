# V2 数据能力、许可、成本与回放基线 v1

状态：`M0 CONTRACT / LIVE CAPABILITY REQUIRES PROBE`

核验日期：2026-07-20。本文只依据仓库实现与官方公开文档定义“可以建设什么”；未连接生产、未读取 API key，也没有证明当前生产套餐和端点可用。

## 1. 数据源角色

| 来源 | V2 角色 | 官方可用能力 | 当前 Legacy 事实 | V2 结论 |
| --- | --- | --- | --- | --- |
| Binance USD-M Futures | 主公共事实源之一 | instrument、Kline、book、trade、OI、funding、REST/WS | 已有 universe、light scan、OHLCV 与 WS 代码 | `EXTRACT_ADAPTER / REVERIFY_GAPS_AND_LIMITS` |
| OKX SWAP | 主公共事实源之一与跨 Venue 交叉验证 | instruments、tickers、candles、books、trades、OI、funding | 已有 universe/light scan，深度能力不完整 | `EXTRACT_PARTIAL / COMPLETE_ADAPTER` |
| Bybit Linear | 主公共事实源之一与跨 Venue 交叉验证 | paginated instruments、tickers、Kline、book、trade、OI、funding | 已有 universe/light scan 代码，但旧 capability matrix 未纳入完整权威 | `EXTRACT_PARTIAL / COMPLETE_PAGINATION_AND_IDENTITY` |
| CoinGlass V4 | 候选深验的授权聚合确认源 | OI、funding、long/short、taker、liquidation、orderbook 等，按 key/plan 限制 | 旧代码硬编码 Hobbyist 与 30/min，文档检查日期已过期 | `UNVERIFIED_CURRENT_PLAN / NEVER_REQUIRED_FOR_PUBLIC_DISCOVERY` |

关键官方入口：

- Binance USD-M Futures：`https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/Introduction`
- OKX API v5：`https://www.okx.com/docs-v5/en/`
- Bybit V5 Market：`https://bybit-exchange.github.io/docs/v5/market/instrument`
- CoinGlass V4：`https://docs.coinglass.com/reference/endpoint-overview` 与 `https://docs.coinglass.com/reference/authentication`

Bybit 官方明确提示 linear instruments 已超过默认 500 条，必须 cursor 分页；因此任何只取第一页的“全市场”声明直接 FAIL。CoinGlass 限额以响应头和当前套餐 probe 为准，不继续把旧硬编码 30/min 当作当前真值。

## 2. Source Capability Registry 必填字段

每个 endpoint 上线前必须登记：

```text
provider / endpoint / capability / auth class
allowed venue + contract class / pagination / rate-limit source
event-time semantics / update frequency / units
retention right / replay right / redistribution right
freshness SLA / fallback behavior / cost owner
last docs review / last live probe / schema fingerprint
```

`docs reviewed`、`key configured`、`HTTP 200`、`rows returned`、`fresh enough` 是五个不同状态。

## 3. 采集与存储分层

为了既覆盖全市场又控制成本，V2 使用分级采集：

| Tier | 覆盖 | 数据 | 目的 |
| --- | --- | --- | --- |
| U | 100% observed instruments | instrument/status/specification | Universe accounting 与身份 |
| L | 100% eligible | ticker、1m Kline、聚合成交/轻量 WS、公开 OI/funding 可得项 | 全市场低成本发现 |
| A | P0/P1 Candidate，受配额 | order book、主动成交、跨 Venue、细粒度 OI/funding/basis | 5 分钟内深验 |
| B | P2 Candidate，受配额 | 较低频微结构与衍生品证据 | 30 分钟内深验 |
| R | Outcome/Research 冻结样本 | 事件窗口、对照组、特征 lineage | 回放、漏报与研究 |

第一阶段不保存全部标的的全量 L2 order-book delta。只有容量、许可和能力增益证据证明值得，才扩大原始深度保留；否则只保存候选窗口、快照、固定 bps depth 和可审计聚合。

## 4. 容量与成本 Gate

M1 上线前使用真实 24 小时采样计算：

```text
daily bytes = instruments * events_per_second * average_event_bytes * 86400
monthly storage = daily bytes * retention_days * replication/compression factor
network + object storage + Postgres index + Redis memory + provider request cost
```

必须分别给出 P50/P95/P99 event rate、压缩率、热存、对象存储、回放吞吐和恢复时间。没有测量前不填写伪精确成本，也不采购更高套餐。

## 5. 许可与安全 Gate

- 公共端点不等于允许无限留存或再分发；每个 Provider 的 ToS/许可需要独立记录。
- CoinGlass key 只进入专用深验 Worker，Web、浏览器、证据包和日志不得获得。
- 系统永久不保存交易/提现权限，不接订单接口。
- 原始 payload 进入对象存储前做 schema、大小、时间、source 和敏感字段检查。
- 许可不允许回放保存时，只保留允许的派生事实与 lineage，不伪造原始可重放能力。

## 6. M1 出口条件

- 三家 Venue instrument 100% accounting，unsupported/unresolved 保留原因。
- 每个启用 endpoint 通过分页、429、auth、schema drift、乱序、重复、断流和恢复 fixture。
- 实时与回放使用同一 Feature 实现，同一冻结输入字节级确定。
- 单源失败只降级对应能力；unknown 不变 0，stale 不变 live。
- CoinGlass 当前 plan、限额和端点只有 fresh capability probe 后才可从 `UNVERIFIED` 升级。
