# M3.3E Strategy Archetype Labeling and Outcome Attribution Contract v1

状态：`DESIGN_AUTHORITY_ADDED / IMPLEMENTATION_NOT_STARTED / NO_RUNTIME_OR_PRODUCTION_AUTHORITY`

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

状态标签只能由权威 Action State 映射：

```text
OBSERVE -> 观察中
WAIT -> 等待触发
BLOCKED -> 已阻断
TRADE_PLAN_READY -> 计划已就绪
EXPIRED -> 已过期
INVALIDATED -> 已失效
```

状态标签不是策略类型，不能与主标签混用。

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

在 schema、builder、校验、Outcome、前端和真实 Shadow 全部有证据前，本合同状态保持 `DESIGN_AUTHORITY_ADDED / IMPLEMENTATION_NOT_STARTED / NO_RUNTIME_OR_PRODUCTION_AUTHORITY`。
