# M1.5-B1-B2 Mark Price Snapshot 语义整改合同 v1

状态：`LOCAL_ENGINEERING_EXIT_PASS / B1-B1_EXECUTION_INVALID_NOT_COUNTED / B1-B3_SAME_GATE_PENDING / PRODUCTION_UNCHANGED`

## 1. 本包为什么存在

B1-A 已证明旧 Collector 能完整拉回 1,444 个 eligible instrument，却把大量真实可用价格判成 stale 或 duplicate。B1-B1 exact commit `3908f9f5d0066849311e9d3ac875cc6a76acc69e` 随后实际运行完 31 个周期，但最终证据包装失败：Runner 已使用合法的 1 小时 reconciliation，校验器仍硬编码旧的 24 小时值。原始字节按安全合同删除，因此该窗口不得计为有效 B1-B1，也不得从抽样画面反推完整业务 SLO。

现场只保留两个内容寻址失败报告：

- `sha256:ba16338bcf0cf7ae9600bd34d6c415f35e228a3e8958fcf70faa854a8ceb0ebc`：首次 Worker 配置失败。
- `sha256:cbf1079a177bb21f64452ecf9a396225daa933826edd527fffa87d894dd717e8`：31 周期后证据校验器与 Runner 配置漂移。

两份报告均独立重算 digest 一致、`exactDockerStateRestored=true`；它们只证明失败和宿主恢复，不证明 31 周期业务 PASS/FAIL。

## 2. 根因

旧实现把三家不同语义的最新成交价/ticker 时间统一写成 `LAST_PRICE`，再把逐标的成交时间是否变化当成 Collector freshness。低成交频率、缓存快照或一分钟内未出现新成交会产生 duplicate/stale，即使公开价格快照仍可用。

这混淆了三个问题：

1. Provider 是否按时返回一个新快照。
2. 快照中的价格是否可用于当前下游计算。
3. 某个市场事件或成交是否真的在近期发生。

Market Fact 地基只能回答前两项。第三项必须由未来独立的 trade/order-book/OI 事实流回答，不能借 `LAST_PRICE` 时间戳伪装。

## 3. 唯一价格事实语义

首批跨 Venue 价格事实统一为 `MARK_PRICE`，来源固定为：

| Venue | 公开端点 | 值 | 快照序列时间 |
| --- | --- | --- | --- |
| Binance USD-M Futures | `/fapi/v1/premiumIndex` | `markPrice` | row `time` |
| OKX SWAP | `/api/v5/public/mark-price?instType=SWAP` | `markPx` | row `ts` |
| Bybit Linear | `/v5/market/tickers?category=linear` | row `markPrice` | envelope `time` |

`eventTimeBasis` 固定为 `MARK_PRICE_SNAPSHOT`。Transport 的 `receivedAt` 仍是本系统获知响应的 knowledge boundary，不得覆盖 Provider 时间。Bybit envelope 时间代表这批响应的 Provider 快照时间，不得描述成逐标的成交时间。

严格规则：

- 值必须是正十进制定点数；缺失、0、负数、指数形式或坏 schema 均不可用。
- Provider 时间必须存在、可解析、不得晚于 `receivedAt` 或 point-in-time cutoff。
- 同一 instrument 的序列必须严格前进；相同序列仍为 duplicate，不能标 FRESH。
- 价格数值可以不变；只要 Provider 快照序列真实前进且年龄合格，它就是新快照。
- stale、duplicate、out-of-order、gap、429、transport failure 均保留真实质量状态，禁止 fallback、旧缓存或 0 补位。

## 4. 六个不可互相替代的计数

每个 Venue 和 aggregate 必须同时报告：

```text
providerObservedCount
accountedCount
eligibleCount
collectedCount
usablePriceCount
freshCount
```

不变量：

```text
freshCount <= usablePriceCount <= collectedCount <= eligibleCount <= accountedCount
aggregate = 三个 Venue 逐项求和
```

`collectedCount` 代表有本轮来源记录；`usablePriceCount` 代表事实值非空；`freshCount` 代表值可用且质量为 FRESH。三者不得互相冒充。

`READY` 必须同时满足 eligible 非零、collection=100%、price usability=100%、freshness=100%、持久化/checkpoint 成功、Provider failure=0 和无请求拒绝。任何一个维度不足都必须 `NOT_READY`。

## 5. SLO 与防自欺门禁

B1-B3 继续使用原来的 31 周期、60 秒 cadence 和原门槛，并新增：

```text
minPriceUsabilityCoverageRatio = 1
```

禁止缩小 eligible 分母、删除不活跃币种制造满覆盖、把相同 Provider 序列改成新鲜、用本机接收时间冒充 Provider 时间、用旧 `LAST_PRICE` 证据验证新合同，或把技术捕获 PASS 写成业务 Gate PASS。

对应 schema 已升级：runtime v2、worker cycle v2、observation log v2、SLO report v3、early-shadow domain evidence v2、runner evidence v2。旧证据可审计，但不能进入新 Gate。

## 6. Runner 漂移修复

Runner 与证据校验器现在共用同一个冻结 environment builder，reconciliation 固定为 3,600,000 ms。任何运行参数漂移会进入 allowlisted 验证阶段错误码，不再只留下无法定位的通用失败。

## 7. 范围边界

本包只修改 V2 Market Fact、直接 Feature、Collector/Worker/SLO、生产隔离 Runner 合同和对应测试/文档。

明确未修改：Legacy、页面、API authority、Candidate、Analysis、Strategy、Backtest、生产数据库、Redis、env、Feature Flag、生产服务和 secret。自动交易继续永久禁止。

## 8. 唯一下一入口

```text
V2-M1.5-B1-B3-MARK-PRICE-SAME-GATE-31-CYCLE-RETEST
```

B1-B3 必须绑定本包 exact clean commit，在腾讯隔离 Runner 从第 1 周期开始跑一个新的原子窗口。只有 execution evidence、domain evidence、六个分母、业务 SLO、内容 digest 和宿主恢复全部通过，M1.5-B1 才能减数。
