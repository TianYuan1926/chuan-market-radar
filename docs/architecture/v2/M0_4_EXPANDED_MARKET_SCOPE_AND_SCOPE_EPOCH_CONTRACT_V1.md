# Market Radar V2 M0.4 扩展市场范围与 Scope Epoch 合同 v1

状态：`DESIGN_SCOPE_AMENDMENT_PASS / IMPLEMENTATION_NOT_STARTED / PRODUCTION_UNCHANGED`

冻结日期：2026-07-23

## 1. 决策

Market Radar V2 正式把以下能力纳入目标蓝图：

1. 在 Binance、OKX、Bybit 之外新增 Bitget。
2. 不只扫描当前正常交易的合约，还持续发现待上市、预上线、刚上线、维护、限制开仓、暂停和下架中的合约；新币只有现货/资产公告而尚无支持合约时也进入 watch registry。
3. 在不购买新服务的前提下，最大化利用各 Venue、CoinGlass Hobbyist 和其他已获授权来源能够稳定提供的有效数据。
4. 在加密货币线性永续之外，新增单一股票永续和股票指数/ETF 永续资产域。
5. 对仅以 CFD、RWA 或模糊产品类型出现的标的先完整记账，只有身份、交易机制、数据、成本和风险都独立证明后才进入 eligible。

本变更扩展覆盖面，不改变唯一核心：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

Pre-Move 仍是最高优先能力。新增 Venue、上新事件和股票合约必须增强这一主链，不得把系统改造成行情百科、新闻聚合站或资产展示站。

## 2. 为什么必须使用 Scope Epoch

现有 M1/M2/M3 证据主要建立在 Binance、OKX、Bybit 三家加密线性永续上。它们不能自动证明：

- Bitget Adapter、速率、身份和故障语义正确。
- 股票合约与加密合约具有相同的交易时段、指数、资金费、公司行动或执行成本。
- 上新前后冷启动标的具有足够历史、流动性或可校准样本。
- 原 1,805 Facts/分钟容量模型能够承受第四家 Venue、更多事实类型和第二资产域。
- 原六个机会族的阈值、评级和 Strategy 可以跨资产域复用。

因此所有权威产物、数据集、Detector、校准、报告、Shadow 和发布必须携带 `scopeEpoch`。没有 epoch 的对象不得进入扩展范围链路。

## 3. Scope Epoch 冻结

| Scope Epoch | 精确范围 | 已有证据效力 | 允许声明 |
| --- | --- | --- | --- |
| `SCOPE_EPOCH_V1_CRYPTO_3V` | Binance Futures + OKX Swap + Bybit Linear，Adapter 支持的稳定币结算加密永续 | 保留原 M1.1-M1.6、B1-B3、C1 和 M3.0-M3.3 的原始效力 | 只能声明三 Venue 加密旧范围对应的本地或历史 Gate 状态 |
| `SCOPE_EPOCH_V2_MULTI_ASSET_4V` | Binance + OKX + Bybit + Bitget；加密线性永续、股票永续、股票指数/ETF 永续、合约上市生命周期和新币 watch registry | 当前只有设计范围，没有实现、容量、Shadow、校准或生产证明 | 只能声明 `DESIGN_SCOPE_AMENDMENT_PASS` |

硬规则：

- V1 PASS 不能被改名为 V2 PASS。
- V2 新增失败不能抹去 V1 的历史证据，但会阻止 V2 全范围声明。
- 每个报告必须同时给出 `scopeEpoch`、Venue 分母、assetDomain 分母和 unavailable 分母。
- M0.4 之前已经封存且没有 `scopeEpoch` 字段的不可变证据，由 release/evidence binding registry 外部绑定到 `SCOPE_EPOCH_V1_CRYPTO_3V`，不回写或伪造旧 payload。
- M0.4 之后新生成或 supersede 的权威对象必须在 payload 内携带 `scopeEpoch`。
- 混合两个 epoch 的 replay、cohort、holdout、Shadow 或 SLO 报告直接 `INVALID`。
- Scope Epoch 升级只能 additive；旧对象保持不可变，通过 supersedes 关系进入新版本。

## 4. Venue 能力初始矩阵

以下是 2026-07-23 的设计输入，不是运行 PASS。每项仍须由真实 Adapter 和 raw evidence 验证。

| Venue | 加密永续 | 上市生命周期 | 股票永续 | 当前设计结论 |
| --- | --- | --- | --- | --- |
| Binance | 官方 USD-M 永续 API 已确认 | `PENDING_TRADING/TRADING/.../CLOSE` 等状态可表达待上市与下架 | 未取得官方股票永续产品证明 | Crypto target；Equity=`UNVERIFIED_UNAVAILABLE` |
| OKX | `SWAP` 官方 API 已确认 | `listTime/state=preopen/live`、instrument WS 和 upcoming changes 可表达上市与规则变化 | 官方 Stock Perpetuals 已确认，instrument `instCategory=3` 表示 Stocks | Crypto + Equity product target；仍需 Adapter 运行证明 |
| Bybit | `linear` 永续官方 API 已确认 | `PreLaunch/Trading/.../Closed` 和 Pre-Market contract 可表达预上线 | 官方 TradFi Perpetual Contracts 包含 Stocks | Crypto + Equity product target；公开市场 API 字段映射仍须实证 |
| Bitget | USDT/USDC/COIN Futures 官方 API 已确认 | `listed/normal/maintain/limit_open/restrictedAPI/off`、`launchTime/offTime` 和公告 API 可表达上市与下架 | 官方 Stock Perps 已确认；contract config 有 `isRwa` | Crypto + Equity product target；`isRwa` 不能单独证明股票身份 |

官方设计依据：

- [Binance USD-M Futures API 与合约状态](https://developers.binance.com/zh-CN/docs/products/derivatives-trading-usds-futures/common-definition)
- [OKX Instruments API](https://www.okx.com/docs-v5/)
- [OKX Stock Perpetuals](https://www.okx.com/en-us/help/stock-perpetuals)
- [Bybit Instruments Info](https://bybit-exchange.github.io/docs/v5/market/instrument)
- [Bybit TradFi Perpetual Contracts](https://www.bybit.com/en/help-center/article/Introduction-to-TradFi-Perpetual-Contracts)
- [Bitget Contract Config](https://www.bitget.com/api-doc/contract/market/Get-All-Symbols-Contracts)
- [Bitget Announcements API](https://www.bitget.com/api-doc/common/notice/Get-All-Notices)
- [Bitget Stock Perps](https://www.bitget.com/support/articles/12560603835927)

官网说明只能证明产品或字段存在，不能替代当前地区可用性、API 可达性、完整分母、长期稳定性或生产资格。

## 5. 资产域

V2 扩展范围使用以下互斥 `assetDomain`：

| assetDomain | 含义 | 初始资格 |
| --- | --- | --- |
| `CRYPTO_LINEAR_PERPETUAL` | 稳定币结算的加密资产永续 | Primary，继承 V1 后按 V2 四 Venue 重证 |
| `EQUITY_SINGLE_NAME_PERPETUAL` | 追踪单一上市公司股票的永续衍生品 | Secondary，独立身份/日历/成本/校准 |
| `EQUITY_INDEX_ETF_PERPETUAL` | 追踪股票指数或 ETF 的永续衍生品 | Secondary，不能与单一股票混合校准 |
| `EQUITY_CFD` | 以 CFD 机制提供的股票合约 | Observed only；独立 lot、session、swap fee 和执行模型完成前不得 eligible |
| `OTHER_RWA_DERIVATIVE` | 商品、外汇、债券或无法可靠分类的 RWA 衍生品 | Accounting only，本轮不进入机会检测 |

不具备支持合约的新币不伪装成 derivative instrument，而是使用：

```text
coverageClass = ASSET_LISTING_WATCH
eligibility = WATCH_ONLY_NO_SUPPORTED_CONTRACT
```

它可以保留公告、现货上市时间、首个市场事实和后续合约出现事件，但不能进入合约 eligible 分母、执行可行性或交易计划。

身份至少包含：

```text
scopeEpoch
coverageClass
assetDomain
venue
venueInstrumentId
underlyingReferenceId
quoteAsset
settlementAsset
contractMechanism
contractMultiplier
priceTick
quantityStep
listingEpoch
jurisdictionAvailability
```

禁止：

- 根据 symbol 文本猜股票、ETF 或加密资产。
- 把 Bitget `isRwa=YES` 直接等同于股票。
- 把 Bybit TradFi CFD 与 TradFi Perpetual 混为一种合约。
- 把不同 Venue 的同名股票合约静默合并。
- 把股票永续价格当成真实股票现货价格。

## 6. 上市生命周期与上新情报

上新不是一个布尔字段，而是独立 point-in-time 生命周期：

```text
ANNOUNCED
+-> ASSET_OR_SPOT_LISTED_NO_CONTRACT -> WATCH_ONLY
+-> PRE_LAUNCH_OR_PREOPEN -> TRADING_WARMUP -> ESTABLISHED

任意阶段还可能进入：
MAINTENANCE / RESTRICTED / SUSPENDED / DELISTING / OFFLINE / UNRESOLVED
```

每个事件至少保存：

```text
announcementId/url
announcedAt
providerListTime
firstObservedAt
firstTradableAt
statusEffectiveAt
knowledgeTime
rawArtifactDigest
sourceCapability
identityEpoch
```

三路证据互相校验：

1. 官方公告或公告 API。
2. REST 合约目录的新增、状态和时间字段。
3. WebSocket instrument/config 更新或连续目录 diff。

规则：

- 单一路径缺失不会静默丢币，必须记录 coverage gap。
- 目录出现但公告缺失时可进入 `OBSERVED_UNCONFIRMED`，不得编造 announcedAt。
- 公告出现但目录未出现时进入 `ANNOUNCED_WAITING_CATALOG`。
- 只有现货/资产上市而没有支持合约时进入 `ASSET_LISTING_WATCH`；系统持续观察后续合约目录，但不得假定一定会上合约。
- watch asset 后续出现合约时创建新的 contract identity/listing epoch，通过 provenance link 关联原公告，不把现货身份直接改成合约身份。
- `TRADING_WARMUP` 必须显式反映历史不足、盘口薄、mark/index 不稳定、价格限制、API 限制和流动性未知。
- 上新事件只有在对应 Detector 完成独立 cohort、校准、untouched holdout 和生命周期晋级后，才可以生成 `LISTING_EVENT` Candidate；当前设计期固定 `NO_CANDIDATE_EMISSION`，且永远不能因“刚上线”自动获得证据等级、方向或 READY。

## 7. 数据最大化的正确定义

“各交易所只要能获取的数据都最大获取”定义为：

```text
最大化对发现、验证、执行和复盘有净价值的数据覆盖
而不是无差别永久保存每一条高频字节
```

所有来源进入 `SourceCapabilityRegistry`，至少记录：

```text
venue/source
endpoint/channel
fact semantics
public/authenticated
entitlement/plan
rate limit and weight
history horizon
push cadence
point-in-time suitability
replay suitability
retention/redistribution terms
observed runtime status
cost and storage estimate
fallback prohibition
```

采集分四层：

| 层级 | 覆盖 | 典型数据 | 调度原则 |
| --- | --- | --- | --- |
| `T0_CATALOG_EVENT` | 100% observed instruments + listing watch assets | 合约/现货上市公告、合约目录、状态、规格、上线/下架、规则变更、server time | 全量快照 + 增量事件 + reconciliation |
| `T1_WIDE_MARKET` | 100% eligible instruments | ticker、mark/index、Kline、成交量、funding、OI、top of book、基础质量 | 低成本广覆盖，按 Venue 限速动态调度 |
| `T2_CANDIDATE_BURST` | P0/P1 Candidate 与对照样本 | trades、增量 order book、liquidation、basis、多周期密集窗口 | 有界突发采集，必须保留对照组和资源公平 |
| `T3_DEEP_VALIDATION` | 进入 Deep Validation 的 Episode | CoinGlass Hobbyist 可用能力、跨 Venue OI/funding、深盘口、执行成本、事件上下文 | 权利/套餐/质量门禁后调用，失败不推断补齐 |

每个 Provider 新字段必须落入以下之一：

```text
ADOPTED_AS_FACT
DERIVED_WITH_LINEAGE
OBSERVED_UNSUPPORTED
REJECTED_REDUNDANT
REJECTED_UNLICENSED
REJECTED_LOW_VALUE_HIGH_COST
UNAVAILABLE
```

不能通过删除字段、缩小分母或只采热门标的来提高通过率。也不能为了“数据越多越好”挤爆当前单机、破坏延迟、超过免费配额或违反来源条款。

## 8. 股票合约独立门禁

股票合约不得复用加密资产的统一阈值。进入 Detection 前必须建立：

- 单一股票、ETF、指数和 CFD 的可靠身份。
- 交易所合约时间与 underlying 传统市场时段、节假日和盘前盘后状态。
- 交易所 mark/index/reference price 的来源和质量。
- USD/USDT 或其他 FX 转换事实。
- 休市期间 basis、流动性、价差和价格限制。
- 公司行动、拆股、分红、停牌、财报和指数调整的可用事件上下文。
- 合约 multiplier、tick、最小数量、资金费、手续费、滑点和最大杠杆。
- Venue/地区可用性与 API 限制。

缺少 underlying 参考、公司行动或成本语义时：

- 可以继续做目录 accounting 和市场事实采集。
- 可以输出 `OBSERVE / DATA_UNAVAILABLE / RISK_WARNING`。
- 不得输出 calibrated grade 或 `TRADE_PLAN_READY`。

加密和股票只在 `Portfolio Risk` 汇合，用于总风险、相关性、集中度和同一事件暴露；此前各自拥有独立 Context、Detector、cohort、holdout、Analysis 和 Strategy。

## 9. 新增机会族

在原六个加密机会族之外新增两个正式研究族：

| 机会族 | 作用 | 当前权限 |
| --- | --- | --- |
| `LISTING_AND_VENUE_EVENT` | 新币/现货上市 watch、合约上新、预上线、下架、维护、规则变更、恢复交易和异常状态切换 | `DESIGN_ONLY / NO_CANDIDATE_EMISSION` |
| `EQUITY_EVENT_AND_BASIS` | 财报、公司行动、传统市场开闭市、休市 basis、异常价差和流动性切换 | `DESIGN_ONLY / NO_CANDIDATE_EMISSION` |

它们必须独立拥有 Detector、反例、冷启动、lead-time 定义、cohort、holdout、Analysis、Strategy 和退化指标。事件本身只提供上下文，只有经验证的价格/流动性/结构链才能形成方向假设。

## 10. 校准与评分隔离

每个 Detector 和任何 calibrated artifact 必须绑定：

```text
scopeEpoch
assetDomain
venue or venueSet
opportunityFamily
direction
regime
liquiditySegment
calibrationVersion
cohortId
untouchedHoldoutId
```

禁止：

- 用加密样本校准股票。
- 用成熟合约样本校准新上币 warm-up。
- 用一家 Venue 的阈值无证明复制到另一家。
- 把多个资产域合成一个总 precision、总胜率或总等级。
- 因新增范围表现差而修改旧分母。

工作台必须先按资产域和 Venue 展示覆盖/能力，再展示各自 Candidate；不得把股票、加密、预上线标的混成一个无法解释的总榜。

## 11. 正确施工顺序

```text
M0.4 Multi-Asset Scope Amendment
-> M1.1A Four-Venue Capability Registry
-> M1.1B Multi-Asset Identity + Listing Intelligence
-> M1.4A Adaptive Multi-Asset Collector
-> M1.5C Four-Venue Multi-Asset Shadow
-> M1.6-D1 Expanded-Scope No-Cost Capacity Proof
-> M2.3 Listing/Venue + Equity Event Detection
-> M2.4 Multi-Asset Cohort + Domain-Sealed Holdout
-> M3.1A-M3.3A Multi-Asset Analysis/Qualification/Strategy
-> M3.4-M3.6 Execution Feasibility + Risk + Runtime
-> M4-M5 Domain-Separated Workbench + Review
-> M6-M7 Domain-by-Domain Cutover + Practical Readiness
```

并行与串行规则：

- 当前 P0R 生产恢复仍是独立第一关键路径，继续绑定 V1 exact release，不混入扩展范围。
- M1.1A/M1.1B 的本地合同可与 P0R 并行。
- Bitget、股票和上新数据进入生产前必须完成 D1 容量重证。
- 原 B1-B3 的 31 周期只属于 V1；V2 需要 M1.5C 新 Shadow。
- M2.3 可以先做 no-authority contract，但真实生命周期晋级必须等待 M1.5C、历史/前向 cohort 和独立 holdout。
- M3.4 之前开始的 V1 草稿必须先做 scope rebase review；未经 review 不提交、不发布。
- M4 页面不能领先 M1-M3 的 V2 权威产物。
- Cutover 按 `CRYPTO_LINEAR_PERPETUAL -> EQUITY_SINGLE_NAME_PERPETUAL -> EQUITY_INDEX_ETF_PERPETUAL` 分域进行，不能一次性全开。

## 12. 每个新增包的完成证据

### M1.1A

- 四 Venue capability inventory 100% 记账。
- 每个 endpoint/channel 的权限、限速、历史范围和失败语义明确。
- Binance 股票域保持 `UNVERIFIED_UNAVAILABLE`，不得猜测支持。

### M1.1B

- 四 Venue contract/spot listing watch、catalog、分页、Unicode、symbol reuse、listing epoch、coverageClass 和 assetDomain 归一化通过。
- 公告、目录、WS 三路差异有明确 gap。
- 股票/RWA/CFD 不发生静默误分类。

### M1.4A

- T0-T3 采集调度、配额、背压、公平性、冷启动和故障恢复通过。
- 全分母不因 Candidate 优先级被删除。
- CoinGlass Hobbyist 配额、429 和 endpoint capability 如实表达。

### M1.5C

- 四 Venue、各资产域和 listing state 分层 SLO。
- exact release/config/schema/scopeEpoch。
- 中断不可拼接，失败窗口不计数。

### M1.6-D1

- 使用 V2 实际 catalog 和事实率重跑无付费容量模型。
- 稳态 `<=60%`、施工峰值 `<=70%` 等现有硬门槛不降低。
- 超容量时先调整采集分层、保留和压缩，不能缩 coverage 分母。

### M2-M3

- 每个资产域独立 cohort、matched control、purge/embargo 和 untouched holdout。
- Listing warm-up 与成熟合约分层。
- 股票日历、公司行动、basis 和执行成本进入反证。
- false READY 必须为 0。

## 13. 当前真实边界

当前可以说：

```text
Bitget、上新生命周期和股票合约已正式进入 V2 设计权威。
Scope Epoch、资产域、数据层级和施工顺序已冻结。
```

当前不能说：

```text
Bitget 已接入。
股票合约已扫描。
上新币已能提前发现。
四 Venue 已通过 Shadow。
扩展范围容量已通过。
新增机会族已校准。
V2 多资产范围具备 READY 或生产权限。
```

生产服务、数据库、Redis、Worker、Feature Flag、数据和 authority 因本设计包均保持不变。
