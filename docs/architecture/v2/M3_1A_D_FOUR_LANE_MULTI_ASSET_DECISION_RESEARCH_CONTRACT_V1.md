# M3.1A-D Four-Lane Multi-Asset Decision Research Contract v1

状态：`LOCAL_RESEARCH_CONTRACT_SCAFFOLD / NO_REAL_COHORT_OR_CALIBRATION / NO_CANDIDATE_SIGNAL_STRATEGY_READY_OR_EXECUTION_AUTHORITY`

## 1. 目的

本合同把 Scope V2 的四条决策轨道落实为不能互借证明的运行时边界：

1. 四 Venue 成熟加密合约。
2. 加密上新 `TRADING_WARMUP`。
3. 单股永续。
4. 股票指数/ETF 永续。

它为后续真实 Analysis、Evidence/Setup Qualification 和 Strategy 提供严格合同，不声称 Detector、cohort、untouched holdout、真实校准、生产数据或交易权限已经完成。

## 2. 四轨绑定

| Decision lane | Asset domain | Lifecycle | 允许的特殊机会族 |
| --- | --- | --- | --- |
| `FOUR_VENUE_ESTABLISHED_CRYPTO` | `CRYPTO_LINEAR_PERPETUAL` | `ESTABLISHED` | 原六族 |
| `CRYPTO_LISTING_WARMUP` | `CRYPTO_LINEAR_PERPETUAL` | `TRADING_WARMUP` | `LISTING_AND_VENUE_EVENT` 加受控原族 |
| `SINGLE_NAME_EQUITY_ESTABLISHED` | `EQUITY_SINGLE_NAME_PERPETUAL` | `ESTABLISHED` | 原六族加 `EQUITY_EVENT_AND_BASIS` |
| `EQUITY_INDEX_ETF_ESTABLISHED` | `EQUITY_INDEX_ETF_PERPETUAL` | `ESTABLISHED` | 原六族加 `EQUITY_EVENT_AND_BASIS` |

每个输入必须绑定：

- `scopeEpoch`
- `releaseId`
- `decisionLane`
- `venue`
- `assetDomain`
- `lifecycleState`
- `canonicalInstrumentId`
- `underlyingGroupId`
- `identityEpoch`
- `listingEpoch`

`EQUITY_CFD`、`OTHER_RWA_DERIVATIVE`、`ASSET_LISTING_WATCH`、`CROSS_MARKET_CONTEXT`、预开盘、维护、限制、暂停、下架、离线和 unresolved 对象不能进入本合同的策略轨道。

## 3. Analysis

Analysis 必须：

- 按资产域完整核算 required category。
- 股票额外要求传统市场 session、underlying reference、公司行动、FX、闭市 basis 和合约规格。
- 上新暖机额外要求 `LISTING_WARMUP_BEHAVIOR`。
- 非方向性前提只能表达 `NEUTRAL`，不能给 LONG/SHORT 投票。
- 身份、生命周期、地区、session、reference、公司行动、FX 等硬前提出现有效反证即阻断，不能被另一条支持证据抵消。
- 结构位只能引用 point-in-time market、structure、location 或 liquidity 的 PASS 证据。
- Fib 不能成为唯一结构。
- 支持、设置和完整性 blocker 分开输出，再形成精确并集。

Analysis 固定输出：

- `promotionEligible=false`
- `signalLevel=null`
- `strategyAuthority=false`
- `readyAuthority=false`

## 4. Independent Qualification

Evidence 与 Setup 必须使用两份独立 calibration reference。每一份 calibration 只绑定跨样本 segment：

- Scope epoch
- release
- decision lane
- Venue
- asset domain
- lifecycle
- opportunity family
- direction
- regime

Calibration 不绑定单一 instrument，因此同一精确 segment 的不同 instrument 可以共享校准；任何 Venue、lane、domain、lifecycle、family、direction 或 regime 变化都必须使用另一份校准。

声称 `CALIBRATED` 至少需要：

- 样本数 `>=60`
- 至少三个 regime 且包含当前 regime
- cohort 与 untouched holdout 的独立身份和摘要
- holdout 只在冻结阈值后访问一次
- threshold 与 metric definition 摘要
- future leakage 为 false
- 至少两条 calibration evidence

未满足时必须输出 `INSUFFICIENT` 或 `UNAVAILABLE`，不得输出 grade、概率或置信区间。

## 5. Strategy Policy

Strategy policy 必须绑定精确 segment、family、direction、regime、Evidence calibration hash 和 Setup calibration hash，并内容寻址：

- policy evidence set
- entry/stop/target kind allowlist
- entry trigger
- structural invalidation
- no-chase
- partial take-profit
- confirmation window
- expiry
- entry/stop buffer
- gross/net RR floor

Fib target 默认禁止。只有 policy 明确为 `VALIDATED_EXTENSION_ONLY`、目标位引用已登记证据且 evidence set digest 精确匹配时才可使用。

## 6. Cost And Reference Truth

加密策略必须取得：

- Fee
- Slippage
- Funding

股票策略还必须取得：

- Closed-session basis
- FX

每个 PASS 成本必须有非空保守 bps 和 exact instrument evidence reference。`BLOCKED` 或 `UNAVAILABLE` 必须令 bps 为 `null`，禁止用 0 填缺。

参考价必须是内容寻址 artifact，绑定 exact instrument、source cutoff、available time、fact ids 和 PASS evidence。Strategy 还必须证明参考价证据与 entry structural evidence 相交。

## 7. Draft Geometry

Strategy Draft 只在所有前置条件通过时形成：

- Entry、stop base 和 target 必须来自 Analysis structural levels。
- Entry、stop 和 target level id 不得重复。
- Entry 不能超过 calibrated maximum distance。
- Stop base 必须已经在 entry 的不利一侧。
- Stop buffer 只能向结构失效方向外扩，不能为美化 RR 向 entry 收缩。
- Target 必须在获利一侧。
- Gross 与 conservative net RR 都必须达到 policy floor。
- 费用按 entry/exit fee、entry/exit slippage、funding，以及股票 basis/FX 精确重算。

Draft 固定为：

- `signalLevel=null`
- `strategyAuthority=false`
- `readyAuthority=false`
- `executionAuthority=false`

## 8. Fail-Closed Rules

以下任一情况必须返回 `draft=null`：

- Schema、hash、ID 或 lineage 不一致。
- 跨 Venue、跨 lane、跨 domain、跨 lifecycle 借证。
- 未来 evidence、calibration、policy、cost 或 reference。
- Evidence 或 Setup 任一维度未校准。
- 股票 session、公司行动、FX、reference、basis、规格或成本缺失。
- 费用不可得或使用 0 补缺。
- Reference stale、unavailable 或不绑定 entry。
- 未验证 Fib。
- Stop/target 几何错误。
- Gross 或 net RR 不足。
- 精确价格数学拒绝输入。

公共 Strategy builder 对任意 unknown 输入不得抛异常；失败必须形成明确、内容寻址的 blocked/abstained result。

## 9. 完成边界

本合同通过后只能声明：

`LOCAL_RESEARCH_CONTRACT_SCAFFOLD_PASS / FOUR_LANE_TESTS_PASS / NO_CANDIDATE_SIGNAL_GRADE_STRATEGY_READY_OR_PRODUCTION_AUTHORITY`

以下仍未完成：

- M2.3A/B 真实 Detector。
- M2.4A/B 真实 cohort 与 untouched holdout。
- M3.1A-M3.3D 真实分域校准和验收。
- M3.4-R1 Execution Feasibility。
- M3.5 Personal/Portfolio Risk。
- M3.6 Trigger/Runtime Gate。
- 生产部署、Candidate、Signal Level、READY 和执行权限。
