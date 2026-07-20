# M2.0 发现合同与黄金样本 v1

状态：`FROZEN_LOCAL_CONTRACT / REPLAY_INPUT_ONLY / M1_RUNTIME_BLOCKED / PRODUCTION_UNCHANGED`

## 1. 目的

本合同冻结 M2 发现层的业务语言和运行边界，使后续 Detector 能在同一份 point-in-time 输入上独立发现候选，并把候选组织成可审计 Episode 与验证假设。它不实现 live Detector、不读取 M1 运行权威、不做深扫、评级、方向结论或交易计划。

核心链路位置：

```text
Universe + Fact/Quality + Feature/Quality + Market Context
-> Detector read input
-> DiscoveryCandidate
-> CandidateEpisode + OpportunityThesis
-> Deep Validation（后续包）
```

## 2. 六类机会与十四种模式

| 机会族 | 机会模式 | 合法方向 | 业务边界 |
| --- | --- | --- | --- |
| `PRE_MOVE` | `PRE_MOVE_COMPRESSION`、`PRE_MOVE_FLOW_DIVERGENCE`、`PRE_MOVE_LIQUIDITY_SHIFT` | LONG / SHORT / UNKNOWN | 首要发现爆发前压缩、资金流领先价格或流动性状态提前变化；允许方向尚未解决 |
| `BREAKOUT_RETEST` | `BREAKOUT_EDGE`、`ROLE_FLIP_RETEST` | LONG / SHORT | 发现结构边界测试、突破边缘和角色互换回踩，不把一次越界直接写成突破成立 |
| `TREND_CONTINUATION` | `TREND_COMPRESSION`、`STRUCTURAL_PULLBACK_RESUMPTION` | LONG / SHORT | 发现既有趋势中的压缩或结构回踩后恢复，不把晚到追涨跌写成延续机会 |
| `REVERSAL_RANGE` | `KEY_LEVEL_REVERSAL`、`RANGE_EDGE` | LONG / SHORT | 关键位反转与区间边缘是同一机会族的不同模式，不重复计为两个独立机会族 |
| `RELATIVE_STRENGTH` | `RELATIVE_STRENGTH`、`RELATIVE_WEAKNESS` | LONG / SHORT | 只表达相对基准或同组标的的强弱偏离；相对强弱不是绝对交易方向真值 |
| `DERIVATIVES_FLOW` | `PRICE_OI_DIVERGENCE`、`CROWDING_RELEASE`、`FUNDING_BASIS_DISLOCATION` | LONG / SHORT / UNKNOWN | 发现价格、仓位、拥挤、资金费率或基差异常；授权能力缺失时必须 unavailable |

六个机会族是稳定分类；模式是族内可扩展的具体发现形态。一个标的可以同时存在不同机会族或相反方向的独立 Thesis，不能用总分把它们互相覆盖。

## 3. Detector 只读输入

`M2DetectorReadInput` 只允许引用已冻结的 point-in-time artifact：

```text
releaseId
canonicalInstrumentId / underlyingGroupId
eventCutoff / knowledgeCutoff
EligibleInstrumentSnapshot reference
FeatureSetSnapshot reference + exact featureIds
FeatureQualitySnapshot reference
MarketContextSnapshot reference
observed price fact reference + positive decimal value
inputQuality = FRESH | PARTIAL
```

每个引用必须包含 `artifactId / releaseId / sourceCutoff / availableAt`，并满足：

1. 所有 artifact 属于同一 release，禁止混用发布身份。
2. `sourceCutoff <= eventCutoff`，禁止读取市场时间截止后的事实。
3. `sourceCutoff <= availableAt <= knowledgeCutoff`，禁止使用当时系统尚未获得的信息。
4. `eventCutoff <= knowledgeCutoff`，市场时间和系统认知时间不可倒置。
5. Feature ID 唯一且非空；Universe 必须明确 eligible。
6. 只接受 `FRESH` 或显式 `PARTIAL`；stale、unavailable 或错误输入不得被包装成可检测输入。

Event cutoff 回答“市场当时发生到哪里”，knowledge cutoff 回答“系统当时实际知道什么”。两者分离是防止延迟数据和未来补齐污染历史重放的硬门禁。

## 4. DiscoveryCandidate

`DiscoveryCandidate.v2` 是单个 Detector 的发现记录，必须保存：

- instrument/group、机会族、机会模式和方向假设；
- detector ID、版本、生命周期、允许的 emission scope；
- `firstDetectedAt`、`observedPriceFactId`、observed price、source cutoff、generatedAt、expiresAt；
- Universe、FeatureSet、FeatureQuality、MarketContext 和 observed-price 的精确 lineage；
- event/knowledge 双 cutoff、输入质量、reason codes 和 counter hints；
- P0-P3 资源优先级及其 policy/version、时效、潜在价值、成本和过期风险依据。

Candidate 只能决定是否值得继续验证。它永久禁止 Evidence Grade、Setup Grade、Action State、entry、stop、target、RR、position size 和交易计划。

Detector 生命周期与可发射范围：

| 生命周期 | 允许范围 |
| --- | --- |
| `DRAFT` | 不得发射 |
| `REPLAY_VALIDATED` | REPLAY |
| `SHADOW` | REPLAY、SHADOW |
| `LIMITED` | REPLAY、SHADOW、LIMITED |
| `ACTIVE` | REPLAY、SHADOW、LIMITED、PRODUCTION |
| `SUSPENDED` / `RETIRED` | 不得发射 |

`validateM2CandidateAgainstDetectorInput` 要求 Candidate 与输入在 release、instrument、双 cutoff、五类 artifact、Feature population、observed price 和质量摘要上精确一致；任一不一致均为 `BLOCKED`。

## 5. CandidateEpisode

活动 Episode 唯一键由以下字段的 UTC 规范值确定：

```text
canonicalInstrumentId
+ opportunityFamily
+ directionHypothesis
+ episodeWindowPolicyVersion
+ windowStart
+ windowEnd
```

相同瞬间的 `Z` 与带时区偏移文本必须得到同一 key，避免时区表示不同导致重复 Episode。

关系分类固定为：

- `SAME_EPISODE`：同 instrument、family、direction 和规范窗口；
- `NEW_EPISODE_WINDOW`：同 instrument/family/direction，但属于新窗口；
- `PARALLEL_DIRECTION_THESIS`：同 instrument/family、相反或不同方向；
- `PARALLEL_FAMILY_THESIS`：同 instrument、不同机会族；
- `INDEPENDENT_INSTRUMENT`：不同 instrument。

生命周期只允许：

```text
DISCOVERED -> QUEUED / REJECTED / EXPIRED / DATA_UNAVAILABLE
QUEUED -> VALIDATING / REJECTED / EXPIRED / DATA_UNAVAILABLE
VALIDATING -> EVIDENCE_READY / REJECTED / EXPIRED / DATA_UNAVAILABLE
EVIDENCE_READY -> PROMOTED / REJECTED / EXPIRED / DATA_UNAVAILABLE
```

终态不可变。活动状态内的 candidate merge 或 priority change 必须显式记录 transition kind；禁止无原因版本跳变。每次变更保存 previous lifecycle、reasons、version、idempotency key 和 outbox event，语义为 at-least-once + idempotent，不宣称分布式 exactly-once。

## 6. OpportunityThesis

`OpportunityThesis.v2` 的 `thesisKind` 固定为 `VALIDATION_HYPOTHESIS_ONLY`。它必须保存：

- Episode、instrument、family、direction、patterns 和 release 身份；
- 每一个 Candidate 对应的 Detector 来源、版本、生命周期、发射范围、模式、首次发现时间和 cutoff；
- supporting、conflicting、unknown reason codes；
- firstDetectedAt、sourceCutoff、version、createdAt、updatedAt。

Detector 来源必须与 Episode 的完整 Candidate population 一一对应，且生命周期必须对声明的 emission scope 有真实发射权限；重复 Detector 不得被重复计权。来源 cutoff 不得晚于首次发现时间。支持、冲突和未知理由必须各自唯一且三类互不重叠。Thesis 仅组织后续验证，不是方向结论、信号、证据等级或 READY。

## 7. Bundle 一致性

`validateM2CandidateBundle` 对 Candidate、Episode 和 Thesis 做整包校验：

- Candidate ID population、instrument/group、family、direction 和 release 精确一致；
- 所有 Candidate 位于冻结 Episode window 内，expiry 不越界；
- patterns、最早/最晚发现时间和最新 source cutoff 一致；
- Episode priority 取候选中最高资源优先级，但不转化为质量等级；
- priority policy、Episode key、Episode/Thesis identity 和 Detector source 精确一致。

任一关系不成立时整包为 `BLOCKED`，不得靠前端或存储层修补。

## 8. 三层运行漏斗分母

每个 cohort 必须保存完整人口 ID 和 digest，不只保存数量：

```text
eligible instruments
evaluated instruments
data-unavailable instruments
discovered episodes
deep-validated episodes
actionable episodes
data-unavailable episodes
```

三层含义固定：

1. `discovered`：全部唯一发现 Episode。
2. `deepValidated`：discovered 中已完成 Deep Validation 的 Episode。
3. `actionable`：deepValidated 中最终获得 `TRADE_PLAN_READY` 的 Episode。

集合必须满足 `actionable ⊆ deepValidated ⊆ discovered`；evaluated 必须属于 eligible；不可用对象不能从分母消失。覆盖不全或存在 unavailable 时为 `PARTIAL`，分母为空为 `INSUFFICIENT_EVIDENCE`，集合污染或时间倒置为 `BLOCKED`。零 Candidate 在全覆盖且无不可用时可以是诚实 `PASS`，不能被解释为“市场无机会”。

这套运行漏斗与 `EVENT_AND_EARLY_DETECTION_DEFINITION_V1.md` 的研究评价分母不同。后者使用 candidate/event/matched-non-event 三组冻结 cohort 计算 recall、precision、lead time、late/noise；两套分母必须并列保留，禁止互相替代。

## 9. 黄金样本

当前冻结 19 个 `TEST_ONLY_POINT_IN_TIME` 样本：

- 六个机会族各至少有 LONG 发现、SHORT 发现和反例；
- PRE_MOVE 另有方向尚未解决的早期样本；
- 明确包含 late、noise-risk、fakeout-risk 和 data-unavailable 反例；
- 每个 observation 都必须 `observedAt <= cutoff` 且声明 lineage；
- fixture 永久 `runtimeImportAllowed=false`。

递归防线拒绝 Outcome、MFE、MAE、qualityHit、public breakout time、event start、future price/candle/window/return 等未来材料。样本只证明合同与反未来泄漏边界，不证明任何 Detector 的真实 precision、recall、lead time 或盈利能力。

## 10. 当前出口与阻断

M2.0 本地出口要求：

- 六族十四模式冻结且 family/pattern/direction 可机器校验；
- 三个 authority artifact 使用 strict v2 runtime schema；
- 双 cutoff、Detector 生命周期、Episode 状态机、去重、Bundle 和三层分母有定向测试；
- 19 个 fixture 通过完整性和 future-leak 扫描；
- 全 V2 与完整生产 CI 不回归。

即使本地出口通过，以下能力仍为未实现或被阻断：

- live/realtime Detector、M1 Store 读取、Candidate 数据库写入和 Worker；
- Deep Validation、Evidence Package、Analysis、评级、Strategy、Risk、READY；
- API、页面、Alert、Outcome、Research、生产 migration 和 authority 切换；
- 真实市场 recall、precision、lead time、queue SLO 和资源容量。

下一包只能实现纯函数、纯回放的 Pre-Move 与 Breakout/Retest Detector kernel。读取 M1 runtime authority 仍需 M1.5-B1 与 M1.7 外部门禁通过。
