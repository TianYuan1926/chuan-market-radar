# M3.3E Strategy Archetype Labeling and Outcome Attribution Contract v1

状态：`LOCAL_RUNTIME_BUILDERS_CONTENT_ADDRESSED_LINEAGE_AND_DESCRIPTIVE_ATTRIBUTION_PASS / TEST_ONLY_UNBOUND_SCOPE / REAL_EVALUATION_UI_SHADOW_PENDING / NO_PRODUCTION_AUTHORITY`

## 1. 目的

每笔完整策略都必须明确回答“这是什么交易逻辑”，例如“突破回踩确认做多”或“压力位反弹受阻做空”。该答案必须是可验证、可筛选、可统计、可版本化的后端权威产物，而不是前端文案、AI 临时总结或复盘后的事后解释。

本合同不授权 Detector、Candidate、Strategy、READY、自动下单或生产写入。它只冻结后续 schema、builder、Decision Snapshot、Outcome 和前端实现必须共同遵守的边界。

## 2. 三类标签

### 2.1 StrategyArchetypeLabel

每份完整 `StrategyDraft` 必须恰好一个 canonical 主标签：

```text
id
taxonomyVersion
opportunityFamily
direction
structureInteraction
triggerPattern
reasonCodes[]
analysisSnapshotId
signalQualificationId
evidencePackageId
structuralLevelIds[]
policyVersion
generatorVersion
releaseIdentity
scopeEpoch
generatedAt
contentHash
```

主标签由 Strategy Construction 生成。Final Decision 只能校验、拒绝或原样冻结，不能重新分类；Read Model 只能本地化、展示和筛选。

### 2.2 StrategyContextTags

辅助标签只能从版本化有界词表中选择，用于表达不改变主策略类型的上下文：

```text
regime
liquidityBucket
venueSet
assetDomain
listingLifecycle
timeframeAlignment
volatilityState
marketContext
evidenceDrivers
counterEvidenceFlags
executionConstraints
```

辅助标签不得成为自由文本类别，不得改变方向、结构止损、评级、净 RR、Action State 或权限。

### 2.3 StrategyStateLabel

状态标签只能由权威 Action State 映射。当前 `ActionState` 权威词表只有以下四项：

```text
OBSERVE -> 观察中
WAIT -> 等待触发
BLOCKED -> 已阻断
TRADE_PLAN_READY -> 计划已就绪
```

`EXPIRED` 和 `INVALIDATED` 当前属于 Candidate/Trigger/Alert/Outcome 生命周期，不是 `StrategyDecision.ActionState`。界面必须把它们作为独立生命周期状态展示，禁止伪装成决策状态；未来如需扩展 Action State，必须单独升版并迁移。状态标签不是策略类型，不能与主标签混用。

## 3. 初始主标签词表

初始词表是有界起点，不是对市场形态的永久穷举：

| ID | 中文显示 | 方向 |
| --- | --- | --- |
| `BREAKOUT_RETEST_LONG` | 突破回踩确认做多 | LONG |
| `BREAKDOWN_RETEST_SHORT` | 跌破反抽确认做空 | SHORT |
| `SUPPORT_BOUNCE_LONG` | 支撑位止跌反弹做多 | LONG |
| `RESISTANCE_REJECTION_SHORT` | 压力位反弹受阻做空 | SHORT |
| `TREND_PULLBACK_CONTINUATION_LONG` | 上升趋势回撤确认做多 | LONG |
| `TREND_RALLY_CONTINUATION_SHORT` | 下降趋势反抽确认做空 | SHORT |
| `FAILED_BREAKDOWN_REVERSAL_LONG` | 假跌破收复反转做多 | LONG |
| `FAILED_BREAKOUT_REVERSAL_SHORT` | 假突破跌回反转做空 | SHORT |
| `RANGE_LOW_REVERSAL_LONG` | 区间下沿反转做多 | LONG |
| `RANGE_HIGH_REVERSAL_SHORT` | 区间上沿反转做空 | SHORT |
| `COMPRESSION_EXPANSION_LONG` | 压缩后向上扩张做多 | LONG |
| `COMPRESSION_EXPANSION_SHORT` | 压缩后向下扩张做空 | SHORT |
| `LIQUIDITY_SWEEP_RECLAIM_LONG` | 扫流动性后收复做多 | LONG |
| `LIQUIDITY_SWEEP_REJECT_SHORT` | 扫流动性后受阻做空 | SHORT |

相对强弱、板块传播、OI、资金费率、主动买卖、爆仓和订单簿失衡属于发现依据或 `evidenceDrivers`，不是入场结构，禁止把它们单独命名为主策略标签。它们只有与上表某个可证伪的结构互动和触发形态共同成立时，才能作为该主标签的证据或上下文。

`LISTING_WARMUP_*` 不能因为“刚上线”自动生成。只有合约已实际可交易、身份与生命周期明确、mark/index/深度/费用可用、结构和触发成立时，才可通过正式研究流程提出对应标签。

## 4. 权威链

```text
Candidate / Opportunity Thesis
  -> setupHypothesis only
Analysis Snapshot
  -> structure and direction, no final strategy label
Signal Qualification
  -> evidence/setup quality, no final strategy label
Strategy Construction
  -> canonical StrategyArchetypeLabel + StrategyContextTags
Execution Feasibility + Final Decision
  -> validate and freeze, never relabel
Decision Snapshot
  -> localize and expose the frozen label
Outcome
  -> attribute results to the original frozen label
Research Governance
  -> propose, validate and approve taxonomy changes
```

## 5. 不可违反的规则

1. 完整 `StrategyDraft` 必须恰好一个主标签；零个或多个都不完整。
2. `setupHypothesis` 不等于主标签，Candidate 或 Analysis 不得冒充最终策略。
3. 主标签必须与 opportunity family、direction、结构互动、触发形态及结构位 lineage 一致。
4. 标签缺失、冲突、未知版本、未知 ID、未来时间、跨 release 或 hash 不一致时 fail closed。
5. 主标签不能由 symbol、单一币种、单日、单 Venue、近期盈亏或 Outcome 反推。
6. 标签不得提高 Evidence Grade、Setup Grade、Action State、User Fit 或 READY。
7. 标签不得修改结构止损、目标、成本、净 RR 或禁止追价条件。
8. Final Decision、Decision Snapshot 和 Outcome 必须保留同一标签 ID、taxonomy version 和 content hash。
9. 历史标签不可覆盖；taxonomy 迁移只能新增映射视图，原始决策保持不可变。
10. 前端不得调用 Provider、读取 K 线后重算标签或用自由文本替代缺失标签。

## 6. 反过拟合与词表晋级

任何新增、合并、拆分或退役主标签必须建立版本化 `ResearchProposal`，至少包含：

- 事前定义的形态、方向、触发、反证、Outcome 和失败条件。
- 上涨、下跌和未爆发样本，以及 matched control。
- 时间隔离、purge/embargo、walk-forward、消融和参数邻域稳定性。
- 跨币种、Venue、资产域、流动性层和 market regime 证据。
- sealed untouched holdout 与真实前向 no-authority Shadow。
- precision、recall、误报、漏报、提前率、延迟、净 R、费用、滑点、深度、容量和 abstention。
- 独立审计、人工批准、版本迁移与回滚计划。

单币种、单日、单 Venue、极端收益案例或少量成功截图只能生成 `Research Hypothesis`，不得新增生产词表。

## 7. Outcome 归因

Outcome 必须冻结决策时的主标签，而不是按结果重命名。每个标签至少按以下维度独立报告：

```text
taxonomyVersion
primaryLabel
direction
opportunityFamily
venue
assetDomain
listingLifecycle
regime
liquidityBucket
ActionState
checkpoint
eventLabelVersion
```

每个分层必须报告样本量、覆盖分母、precision、recall、误报、漏报、lead time、触发率、expired/not-triggered、MAE、MFE、净 R、费用、滑点、深度、容量和置信区间。样本不足必须是 `INSUFFICIENT`，不能以总平均替代。

## 8. 前端合同

- Inbox 在 StrategyDraft 尚未形成时显示“策略类型待确认”，不猜测标签。
- StrategyDraft 形成后显示后端主标签、状态标签和必要辅助标签。
- 用户可按标签筛选，但筛选不能改变 Decision Snapshot。
- 中文显示名称是 taxonomy 的本地化映射，不是新的权威值。
- Evidence Overlay 必须让用户看见标签成立依据、反证、触发、失效和过期条件。
- UI 测试必须证明同一 Decision Snapshot 在 Inbox、Workbench、Alert 和 Review 中标签一致。

## 9. 实施与验收顺序

```text
taxonomy schema + strict decoder
-> StrategyDraft builder classification
-> Final Decision parity and fail-closed validation
-> DecisionSnapshot and Alert propagation
-> Outcome immutable attribution
-> per-label evaluation and anti-overfit gate
-> frontend localization/filter/display
-> replay, holdout and forward Shadow
```

硬验收：

- 完整 StrategyDraft 无主标签数 = 0。
- 完整 StrategyDraft 多主标签数 = 0。
- 前端生成主标签数 = 0。
- 标签与 direction/family/structure 冲突数 = 0。
- Outcome 事后改写标签数 = 0。
- symbol-specific archetype 数 = 0。
- 标签驱动评级或 READY 提升数 = 0。
- Decision、Snapshot、Outcome 标签 lineage 不一致数 = 0。

## 10. 当前实施真值

本地核心合同已完成以下内容：

- `StrategyDraft v3` 要求恰好一个内容寻址的 `StrategyArchetypeLabel` 和一组内容寻址的有界 `StrategyContextTags`；缺失、数组、多标签、未知版本、ID/方向/family/structure 冲突、hash 篡改、跨 release/scope/time 或虚构结构位均拒绝。
- Strategy Construction input v2 显式消费 Thesis，并以 `opportunityPatterns + Analysis structureState + direction + entry structural level` 分类；无法证明时 `ABSTAINED_NO_DRAFT`，不按 symbol、Outcome 或近期盈亏猜测。
- 初始 14 个 ID 全部进入有界 taxonomy；当前 generator 只生成现有上游语义能明确证明的子集。`FAILED_BREAKDOWN_*`、`FAILED_BREAKOUT_*` 等词表项在缺少独立可证伪语义前保持不可发射，不能仅凭相似截图启用。
- Relative Strength 和 Derivatives Flow 只作为 evidence driver；主标签仍要求可证伪的本地支撑、压力或区间结构，不生成相对强弱/资金流自由文本主标签。
- `StrategyDecision v2`、`DecisionSnapshot v3`、`AlertEvent v2`、`OutcomeRecord v3` 原样携带主标签、上下文标签和 Action State 派生状态标签；跨对象 lineage contract 会拒绝事后改名，即使攻击者为新标签重新计算了一个格式合法的 hash。
- 本地 `DecisionSnapshot` 构建器只接受通过完整 Final Decision assessment 的同 release 输入，按最差数据质量聚合 freshness；READY 缺 Personal/Portfolio Risk、风险不适配、非 fresh、跨 release 或时间倒流时直接拒绝。快照冻结原始 `firstDetectedAt`，自身使用内容寻址 ID/hash，并只允许单调 supersession。
- 本地 Alert 构建器不接受调用方传入标签或 Alert 类型，只能从已验证快照派生 `READY`、`WAIT_NEAR_TRIGGER` 或 `DEGRADED`。`EARLY_CANDIDATE`、`EVIDENCE_READY`、`INVALIDATED` 和 `EXPIRED` 必须等待各自权威生命周期证据，不能由 Decision Snapshot 猜测。
- 本地 Outcome 构建器要求版本化 policy、唯一 point-in-time measurement fact IDs、完整 checkpoint 窗口和客观事件记录；lead time 只能由 `eventStartAt - firstDetectedAt` 计算。`DATA_UNAVAILABLE` 必须保留空事实和空测量，未触发/过期不得伪造 MFE、MAE 或净 R。
- 本地描述性归因报告按原始主标签、taxonomy/policy、方向、Action State、checkpoint、event label、regime、Venue、流动性、资产域和生命周期分层；拒绝重复 Outcome 或重复 decision-checkpoint，只输出样本数、状态计数及已有测量均值，明确 `probabilityAuthority=ABSENT`，不得冒充正式胜率或等级。
- 当前 V1 测试链明确使用 `M3_TEST_ONLY_UNBOUND_SCOPE_EPOCH`；Venue、asset domain、listing lifecycle 和 liquidity bucket 保持 `UNBOUND_TEST_ONLY`，不得冒充 Scope V2 四 Venue 或真实资产域能力。
- M3 核心定向回归 `93/93`、Read Model/Alert/Outcome 与 runtime-schema 定向 `48/48`、多资产隔离 `28/28`、Scope Rebase `12/12` 通过；这些只证明本地 test-only 构建器和合同，不证明真实 cohort、校准、运行服务、READY、生产数据或收益能力。

尚未完成：真实 Scope V2 数据接线与持久化、canonical Personal/Portfolio Risk builder、按标签的真实分层评估、UI 本地化/筛选/E2E、Scope V2 绑定、真实 cohort/matched control/holdout、前向 Shadow、独立审计和生产 authority。因此 M3.3E 仍不计为完整完成，也不得宣布实战准入。
