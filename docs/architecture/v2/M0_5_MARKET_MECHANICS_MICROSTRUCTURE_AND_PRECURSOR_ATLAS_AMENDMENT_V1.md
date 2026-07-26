# M0.5 Market Mechanics、Microstructure 与双向前兆图谱设计修订 v1

状态：`DESIGN_AMENDMENT_PASS / IMPLEMENTATION_NOT_STARTED / REAL_COHORT_NOT_AVAILABLE / NO_CANDIDATE_SIGNAL_OR_READY_AUTHORITY / PRODUCTION_UNCHANGED`

日期：2026-07-26

适用范围：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 修订目的

本修订把近期对山寨币爆发前异常、上涨与下跌前兆、市场机制、板块传播、盘口证据、外部数据和专业工作台的讨论，收口为 Market Radar V2 的受控工程合同。

它不新增第二套主线，也不改变系统核心：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

它解决当前蓝图的一个真实缺口：V2 已登记价格、成交、盘口、主动成交、OI、Funding、Basis 和 Liquidation，但尚未把这些事实组织成可回放、可证伪、可校准的“市场机制证据”，也尚未定义订单墙生命周期、成交压力与价格响应、双向前兆图谱和板块传播研究合同。

## 2. 已吸收的最新结论

1. 爆发前异动是首要研究方向，但不是唯一机会来源；突破回踩、趋势延续、关键位反转、区间边缘、相对强弱和衍生品资金流继续保留独立机会族。
2. 上涨前兆和下跌前兆必须分别建模，不能使用同一规则的符号反转。
3. 成交量放大不是爆发前的必要条件。安静吸筹、安静派发、流动性收缩、订单吸收和相对强弱先行都可能发生在明显放量之前。
4. 主动买入不等于看多，主动卖出不等于看空。只有把主动成交压力与同期、随后价格响应结合，才可能识别吸收、派发、延续或失败。
5. 静态订单墙不能直接解释为真实支撑或压力。必须追踪其出现、持续、补单、撤单、成交、迁移和跨 Venue 一致性。
6. 单币异常需要放入 BTC/ETH、全市场、板块和同类标的上下文。板块内部可能出现龙头先动、同类扩散、滞后补涨或补跌，但该关系必须 point-in-time 验证，不能事后按涨跌重新编组。
7. 外部产品中值得借鉴的是“把真实证据锚定到行情发生时点”和“按图层控制信息密度”；未经校准的“主力控盘”“强支撑 89 分”等标签不得进入权威语义。
8. 高灵敏、标准、低噪声可以作为提醒和展示策略，但不得改变事实、分析、评级、风险或 READY 权限。
9. 前端只消费后端 Decision Snapshot 和可追溯 Evidence Overlay，不得自行拼接盘口、新闻或 AI 文本生成交易判断。
10. 在不新增付费服务的前提下最大化已有资源，但“最大化”表示最大化有用且获授权的可观测性，不表示全标的全字段同频永久保存。

## 3. 明确不作出的新承诺

- 本修订不声称已经证明任何 SHIB、POPCAT 或其他币种的通用前兆。
- 本修订不把个案图表、KOL 截图、社交媒体叙述或合成样本当作 Detector 有效性证据。
- 本修订不声称订单墙代表真实意图，不声称能够识别具体“主力”或“巨鲸”身份。
- 本修订不产生正式概率、Signal Grade、Strategy、READY 或生产运行权限。
- 本修订不授权全市场永久保存完整深度或每笔原始成交。
- 本修订不改变 P0R、M1.5C、M1.6-D1 和 M2 真实 cohort/holdout 的现有硬前置。

## 4. 架构落位

本能力不是第十九个权威 Module，而是贯穿现有 Module 的纵向证据切片：

```text
Market Fact + Quality
-> Microstructure Fact Family
-> Point-in-Time Feature Engine
-> Market Mechanics Feature Set
-> Market Context
-> Independent Opportunity Detectors
-> Candidate Episode + Opportunity Thesis
-> Deep Validation Evidence Package
-> Family Analysis
-> Decision Snapshot Evidence Overlay
-> Outcome Evaluation
-> Research Governance
```

任何下游仍只能读取前一阶段的权威产物，不能绕过 Fact/Feature 直接读取交易所或第三方 Provider。

## 5. Market Mechanics Cube

Market Mechanics Cube 是研究组织框架，不是总分。三个主轴分别保留原始事实、派生特征、反证和不确定性。

### 5.1 价格与结构轴

- 多周期趋势、区间、关键位、压缩、扩张、突破、回踩、失败突破和结构失效。
- 相对 BTC、ETH、板块和同流动性标的的强弱。
- 价格位移、速度、回撤、影线、收盘位置和未完成 K 线边界。
- 上方和下方可用空间、结构止损空间、追价风险和晚到状态。

### 5.2 参与与杠杆轴

- 现货与永续成交量、主动买卖、成交密度和大额成交的归一化异常。
- OI 变化、Funding、Basis、Long/Short、Liquidation 和拥挤释放。
- 价格与 OI、价格与主动流、现货与永续之间的背离。
- 新增仓位、减仓、强平驱动和无新增参与的价格位移必须分开表达。

### 5.3 流动性与响应轴

- spread、固定 bps depth、book imbalance、gap、slippage 和 liquidity vacuum。
- 订单墙持续、撤单、补单、成交、迁移和跨 Venue 一致性。
- 主动成交压力推动价格的效率，以及价格对相反压力的吸收能力。
- 假墙、瞬时噪音、单 Venue 局部异常和 API 采样缺口必须作为反证或 uncertainty。

`timeframe / venue / assetDomain / listingLifecycle / regime / liquiditySegment / sectorSnapshot` 是强制分层维度，不得压缩成第四个综合分轴。

## 6. 双向前兆图谱

以下均为 `RESEARCH_HYPOTHESIS`，只有完成真实 cohort、matched control、validation、untouched holdout 和 Shadow 后才能进入 Detector 生命周期。

| 前兆族 | 上涨方向假设 | 下跌方向假设 | 必须保留的反证 |
| --- | --- | --- | --- |
| Compression / Energy | 低波动收缩后买方结构逐步占优 | 低波动收缩后卖方结构逐步占优 | 无方向、假突破、流动性过薄 |
| Quiet Accumulation / Distribution | 价格抗跌、卖压被吸收、相对强度改善 | 价格滞涨、买压被吸收、相对弱势加深 | 成交样本不足、单次大单、事件噪音 |
| Flow-Price Divergence | 主动卖压增加但价格不跌或快速收回 | 主动买压增加但价格不涨或快速回落 | 延迟成交、聚合误差、跨 Venue 冲突 |
| Position Build / Unwind | 价格稳定或走强且 OI/现货参与健康增加 | 价格稳定或走弱且 OI/卖方参与健康增加 | 过度 Funding、强平尾声、OI 来源不完整 |
| Liquidity Shift | 卖墙撤退、买墙持续补单、上方流动性变薄 | 买墙撤退、卖墙持续补单、下方流动性变薄 | spoof risk、短暂快照、单 Venue 现象 |
| Relative and Sector Propagation | 龙头先强、同类扩散、滞后标的结构确认 | 龙头先弱、同类扩散、滞后标的结构破坏 | 事后分类、共同 BTC beta、低流动性错觉 |
| Failed Auction / Trap | 下破失败、流动性扫取后收回 | 上破失败、流动性扫取后回落 | 仅一根 K 线、无成交响应、空间不足 |
| Event and Listing Transition | 催化出现且可交易事实、流动性和结构确认 | 利空或规则变化且可交易事实、流动性和结构确认 | 仅有公告、已透支、无合约、warm-up 不足 |

同一标的可以同时存在相反方向或不同前兆族的 Thesis。冲突不得由一个总分抹平。

## 7. Microstructure Evidence Contract

### 7.1 原始事实

最低事实族：

```text
TradeFact
TopOfBookFact
OrderBookSnapshotFact
OrderBookDeltaFact
LiquidationFact
MarkIndexReferenceFact
```

每条事实继续遵守 `sourceId / venueInstrumentId / eventTime / receivedAt / sequence / status / qualityReasons`，并区分交易所原生事实、授权聚合事实和派生代理。

### 7.2 LiquidityWallEpisode

订单墙必须按价格带和生命周期记录：

```text
wallEpisodeId / canonicalInstrumentId / venueInstrumentId
side / priceBand / normalizedNotional / distanceBps
firstSeenAt / lastSeenAt / persistenceMs
executedNotional / cancelledNotional / refillCount
migrationBps / sourceFactIds / cutoff
qualityStatus / qualityReasons / featureVersion
```

价格带需要适配 tick size、波动率和流动性。相同固定美元阈值不得跨 BTC、SHIB、新币和股票合约直接复用。

### 7.3 必须形成的派生特征

- `aggressiveFlowImbalance`
- `priceResponseEfficiency`
- `buyAbsorptionStrength`
- `sellAbsorptionStrength`
- `wallPersistence`
- `wallCancelVelocity`
- `wallRefillRatio`
- `wallMigrationBps`
- `executedWallRatio`
- `nearBookDepthChange`
- `liquidityVacuumRisk`
- `crossVenueAgreement`
- `spoofRisk`

大额成交使用 instrument、Venue、regime 和 liquidity segment 的滚动分位数、z-score 或经验证的归一化阈值。固定 `10万/50万/100万` 只允许作为用户显示过滤器，不能成为生产 Detector 权威阈值。

### 7.4 压力与响应解释

```text
主动卖压强 + 价格不跌 = 买方吸收研究假设
主动买压强 + 价格不涨 = 卖方吸收研究假设
订单墙持续 + 补单 + 实际成交后不破 = 真实流动性区域候选
订单墙快速出现后撤销 = spoof/noise 风险
低成交 + 高价格位移 = liquidity vacuum 风险
```

这些只是 Feature/Analysis 语义。方向、等级和计划仍由后续独立证据、结构、执行可行性和风险门禁决定。

## 8. 板块传播与跨标的上下文

建立 point-in-time `AssetRelationshipSnapshot`：

- taxonomy 来源、版本、knowledge time 和未知分类。
- BTC/ETH beta、市场中性相对强弱和共同因子调整。
- leader、peer、laggard 只根据当时信息定义。
- lead-lag 关系必须报告样本、稳定性、时间延迟和 regime。
- 同名、包装资产、1000 倍面值、跨链映射和不同合约不能静默合并。

传播研究必须同时覆盖：

- 先涨后扩散、先跌后扩散。
- 龙头延续与龙头失败。
- 同板块未跟随的 matched control。
- 全市场共同波动造成的伪传播。

板块传播可以提高 Candidate Priority 或形成独立 Thesis，不能直接生成方向、Grade 或 READY。

## 9. 数据源优先级

| 层级 | 来源 | 允许用途 | 权威边界 |
| --- | --- | --- | --- |
| A | Binance、OKX、Bybit、Bitget 第一方公开或已授权接口 | 合约身份、价格、成交、盘口、mark/index、funding、OI 和公告 | 市场事实主来源，仍需逐 capability live/SLO 通过 |
| B | CoinGlass Hobbyist | 套餐允许的衍生品补充验证 | 不越过套餐、限速和历史能力 |
| B | CoinGecko 免费 API | token metadata、市值、类别、全局市场和上新辅助 watch | 不作为执行价格、盘口或 READY 单一依据 |
| C | DefiLlama、合规链上浏览器和其他公开来源候选 | TVL、协议、链和生态上下文 | 先通过权利、身份、时效和增量价值审查 |
| D | 新闻、公告聚合、社交热度和 KOL 内容 | EventContext、催化和风险提醒 | 低权威研究证据，不能独立决定方向 |

任何新来源都必须先进入 `SourceCapabilityRegistry`，通过官方语义、权利、套餐、司法范围、live conformance、quota、freshness、checkpoint、容量和增量价值 Gate。API key 只允许进入受限环境或 secret file，不得写入 Git、蓝图、报告、缓存 key 或日志。

## 10. 缓存与读路径

采用四层读路径，但只有 PostgreSQL/对象存储中的受控事实和产物具有审计权威：

```text
L1 process memory: 单进程极短窗口，可丢失、非权威
L2 Redis: 热窗口、锁、配额、heartbeat、短期快照，可重建
L3 PostgreSQL: Fact index、Feature、Episode、Evidence、Decision 和状态权威
L4 COS: 获授权的原始事件、分区聚合、回放和恢复对象
```

规则：

- 前端只访问 Market Radar 后端，不直连 Provider。
- cache key 必须包含 source、Venue、instrument、fact type、schema/feature version、window 和 cutoff。
- TTL 按事实类型、新鲜度合同和 Provider cadence 决定，不使用一套通用 TTL。
- 使用 singleflight、jitter、bounded retry、quota-aware scheduling 和 circuit breaker 防止缓存击穿与 Provider 风暴。
- stale cache 只能以 `STALE/DEGRADED` 返回；关键执行事实 stale 时必须阻断 READY，不能后台刷新同时冒充当前。
- negative cache 必须短时、带明确原因；`missing` 不能改写成数值 0 或“无异动”。
- warm-up 只预热版本化 Universe 的 T0/T1 热数据和活跃 Candidate/Control，不做无边界全量预热。
- 每层记录 hit/miss、age、source request、quota wait、fallback reason 和 payload size。

## 11. 采集与容量策略

- T1 对全部 eligible 保留 top-of-book、交易/成交聚合和基础质量分母。
- T2 对 research trigger、P0/P1 Candidate 和 matched control 开启有界 trades/order-book burst。
- T3 只对 Deep Episode 获取高成本跨 Venue、CoinGlass 和执行成本证据。
- M2 runtime 未开放前，T2 只允许使用冻结的 research trigger、确定性轮转样本和 matched control；不得伪装成生产 Candidate。
- 原始 book delta 和逐笔成交采用 delta compression、时间分区、短期热保留和按研究价值归档；长期优先保留可回放聚合、Wall Episode、Feature 和 lineage。
- `M1.6-D1` 必须同时测量基础四 Venue范围和 Microstructure 增量；磁盘、WAL、Redis、网络、Provider quota 或恢复门槛失败时降低采样深度或保留时间，但不得缩小 T0/T1 instrument accounting 分母。

## 12. 研究与反自欺门禁

每个前兆族和微观结构特征至少需要：

1. Candidate、真实 Event 和相似未爆发三个分母。
2. 上涨、下跌、无方向三个结果类别。
3. 按 Venue、regime、liquidity、listing lifecycle 和 asset domain 分层。
4. matched control 与固定 Detector 分母。
5. TRAIN-only 阈值和完整试验注册表。
6. validation sensitivity、untouched holdout 和独立审计。
7. lead time、recall、precision、late/noise、alert burden 和数据成本。
8. 特征消融，证明订单墙、主动流、板块传播或外部数据是否有独立增量。
9. 失败案例，包括 spoof、单 Venue 假象、数据延迟、低流动性和事后分类。
10. realtime no-authority Shadow 和漂移监控。

个案可以提出假设，不能证明规律。截图可以提出界面需求，不能证明算法有效。未经校准的分数只能是相对诊断强度，不能展示成概率或正式 Signal Grade。

## 13. 专业工作台落位

Token/Equity Workbench 在 M4 只读取 `DecisionSnapshot + EvidenceOverlaySnapshot`：

- 证据按 event time 锚定到 K 线或时间线。
- 盘口、主动成交、OI、Funding、Liquidation、新闻、结构和计划分别开关。
- 默认保持稀疏，细节通过 hover、zoom 和 Evidence Timeline 展开，不能遮挡价格结构。
- 右侧工作区固定为机制、结构、证据、反证、计划、风险，不使用未经证明的“主力控盘”。
- 多周期状态显示结构理由、冲突和失效，不只显示红绿多空。
- 高灵敏/标准/低噪声只改变提醒阈值、聚合和展示密度；底层 Fact、Analysis、Grade、Decision 和 Risk 完全一致。
- AI 只允许总结现有 Snapshot、指出缺失和反证，不能创建事实、方向、分数、关键位或计划。
- 自定义指标和无代码规则编辑器延后为 Research Sandbox；只能读取获准的 point-in-time Feature，输出 Challenger Proposal，不能取得生产 authority。

## 14. 唯一施工落位

| 包 | 内容 | 真实出口 |
| --- | --- | --- |
| M1.4C | Microstructure Fact、LiquidityWallEpisode、Market Mechanics Feature 和缓存合同 | 本地合同、fixture、parity、no-authority |
| M1.5D | 四 Venue有界 Microstructure 前向捕获和质量 Shadow | 真实 trades/book、完整分母、matched control、SLO、资源证据 |
| M1.6-D1 | 扩展范围无付费容量 | 同时覆盖基础四 Venue和 Microstructure 增量 |
| M2.1A | 双向前兆图谱、Market Mechanics Cube 和板块传播 DRAFT 研究合同 | research-only kernels/feature registry，不发 Candidate |
| M2.4A | 四 Venue成熟加密和 listing warm-up 真实 cohort/holdout | 逐机制、方向、Venue、regime、liquidity 分层验证 |
| M3.1A/B | 成熟加密与 listing warm-up 分析/评级/策略 | 只消费已验证 Evidence，不读取 Provider |
| M4 | Evidence Overlay、Timeline、图层和灵敏度展示 | Decision Snapshot 单一真值、E2E/性能/注意力预算 |
| M5 | Outcome、Missed Movers、消融、Champion/Challenger | 不自动调权或晋级 |

M1.4C 与 M2.1A 可在 P0R 和 M1.5C 长流程期间并行做本地合同；M1.5D 可以与 M1.5C 使用同一 exact release 超级包运行，但状态、证据、容量和失败必须分别记账。生产 writer、Candidate emission、holdout 开启、read authority 和 Legacy 删除仍保持串行。

## 15. 完成定义

本设计修订只有在以下条件全部满足后，才能从设计成果变成实战能力：

- 四 Venue 微观结构来源 capability、权利、live、checkpoint 和 SLO 通过。
- LiquidityWallEpisode 和响应特征实时/回放 parity 通过。
- 固定金额阈值不再作为跨标的 Detector 权威。
- 上涨、下跌和未爆发三个分母完整。
- 真实 cohort、matched control、untouched holdout 和独立审计通过。
- 单 Venue 与跨 Venue 结果分开报告。
- 前端只读 Snapshot，stale/missing/partial 明确，AI 和自定义指标无 authority。
- no-cost 容量、备份、恢复和降级验证通过。
- 生产 Shadow 达到冻结时长和样本门槛，且没有 false READY。

截至 2026-07-26，设计后的本地合同出口已有两项通过，但运行和研究证据条件仍未完成：

```text
DESIGN_AMENDMENT_PASS
M1.4C_LOCAL_CONTRACT_PASS_22_OF_22_FULL_CI_PASS_NO_RUNTIME_AUTHORITY
M2.1A_LOCAL_RESEARCH_CONTRACT_PASS_13_OF_13_FULL_CI_PASS_NO_CANDIDATE_EMISSION
M1.5D_FORWARD_CAPTURE_NOT_STARTED
REAL_COHORT_NOT_AVAILABLE
NO_CANDIDATE_SIGNAL_OR_READY_AUTHORITY
PRODUCTION_UNCHANGED
```

M1.4C 的合同、fixture、ONLINE/REPLAY parity 与四层缓存边界已经可执行验证；M2.1A 的八族、24 个方向假设和研究 Gate 已经可执行验证。它们仍不等于真实 Trade/Book/Liquidation 数据接入，不等于前兆有效，也不解锁 Candidate、Signal Grade、Strategy、READY、页面或生产权限。下一证据出口必须是 M1.5C 与 M1.5D 同一 exact release 下的独立 forward Shadow，再由真实三 Outcome、matched control、cohort、sealed untouched holdout 和独立审计验证。
