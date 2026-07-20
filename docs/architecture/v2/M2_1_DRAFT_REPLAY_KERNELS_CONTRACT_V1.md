# M2.1 Pre-Move 与 Breakout/Retest DRAFT 回放内核合同 v1

状态：`LOCAL_DRAFT_KERNEL_PASS / UNCALIBRATED / NO_CANDIDATE_EMISSION / M1_RUNTIME_BLOCKED / PRODUCTION_UNCHANGED`

## 1. 目的与边界

M2.1 只实现 Pre-Move 与 Breakout/Retest 的确定性纯函数内核，证明同一 point-in-time 输入可以得到相同草案诊断。它不读取 M1 Store/runtime，不访问 Provider，不写 Candidate，不运行 Worker，也不产生 Analysis、等级、Signal、READY 或交易计划。

```text
M2DetectorReadInput + declared point-in-time observations
-> five independent DRAFT kernels
-> DRAFT_REPLAY_DIAGNOSTIC_ONLY
-> historical replay gate（下一包）
-> REPLAY_VALIDATED（仅门槛通过后才可能）
```

当前阈值身份固定为 `UNCALIBRATED_DRAFT_THRESHOLDS`。M2.0 的 19 个合成黄金样本只能证明合同和反未来泄漏，不能证明市场 precision、recall、lead time 或收益。

## 2. 五个独立内核

| Detector ID | 模式 | 当前方向能力 | 当前状态 |
| --- | --- | --- | --- |
| `v2.pre-move.compression` | `PRE_MOVE_COMPRESSION` | LONG / SHORT / UNKNOWN | DRAFT |
| `v2.pre-move.flow-divergence` | `PRE_MOVE_FLOW_DIVERGENCE` | LONG / SHORT / UNKNOWN | DRAFT |
| `v2.pre-move.liquidity-shift` | `PRE_MOVE_LIQUIDITY_SHIFT` | LONG / SHORT / UNKNOWN | DRAFT |
| `v2.breakout-retest.breakout-edge` | `BREAKOUT_EDGE` | LONG / SHORT；冲突时不发方向 | DRAFT |
| `v2.breakout-retest.role-flip-retest` | `ROLE_FLIP_RETEST` | LONG / SHORT；冲突时不发方向 | DRAFT |

五个 Detector 不合并为总分。相同输入可同时匹配多个模式，后续由 Candidate Lifecycle 合并资源并保留来源；本包尚未发射 Candidate。

## 3. 输入合同

`M2DraftReplayKernelInput` 固定：

```text
schemaVersion = v2-m2-draft-replay-input.v1
executionMode = REPLAY_ONLY_NO_AUTHORITY
detectorInput = M2DetectorReadInput
observations[] = observationId / featureId / semanticKey / value / unit / observedAt / quality
```

硬门禁：

1. observation ID、feature ID、semantic key 在一次评估中各自唯一。
2. 每个 observation feature ID 必须在冻结 FeatureSet lineage 中声明。
3. `observedAt <= eventCutoff`，禁止未来事实。
4. 非空值只能配 `FRESH/PARTIAL`；不可用、stale 或错误质量不得携带值。
5. Detector input 继续执行 M2.0 的同 release、event/knowledge 双 cutoff 和 available-at 门禁。
6. 内核不调用时钟、随机数、Provider、Store、Outcome 或下游决策模块。

输入排序不影响 digest 或结果；semantic key 重复时拒绝，不以“最后一个值”为准。

## 4. 输出合同

每个内核只输出 `M2DraftReplayEvaluation`：

```text
evaluationAuthority = DRAFT_REPLAY_DIAGNOSTIC_ONLY
detectorLifecycle = DRAFT
candidateEmissionAllowed = false
evaluationStatus = MATCHED_DRAFT_HYPOTHESIS | NO_MATCH | DATA_UNAVAILABLE
hypothesis = pattern + LONG/SHORT/UNKNOWN | null
eventCutoff / knowledgeCutoff
ruleSetVersion / ruleSetDigest
inputDigest / evaluationDigest / evaluationId
usedObservationIds / missingSemanticKeys
reasonCodes / counterHints
```

输出 schema 重新计算内容 digest 与 evaluation ID，并把 detector ID、version、family、pattern 锁定到注册定义。未知 Detector、身份漂移、内容篡改、重复/重叠理由或额外 Candidate/等级/计划字段全部拒绝。

`MATCHED_DRAFT_HYPOTHESIS` 只是“该 DRAFT 规则在该冻结输入上匹配”，不是 Candidate、Signal、方向真值或交易建议。

## 5. Pre-Move 规则合同

### 5.1 Compression

- LONG 独立读取：压缩分位、买量加速度、已消耗比例。
- SHORT 独立读取：压缩分位、卖量加速度、已消耗比例。
- 两边同时满足时输出 `UNKNOWN`，保留 `direction_confirmation_pending`，不按执行顺序偏向一边。

### 5.2 Flow Divergence

- LONG 独立读取主动买流、价格反应和已消耗比例。
- SHORT 独立读取主动卖流、价格反应和已消耗比例。
- 要求资金流领先而价格仍接近平坦；两边同时满足时输出 UNKNOWN。

### 5.3 Liquidity Shift

- 读取 spread contraction、depth expansion 和 directional flow balance。
- 流向达到长/短阈值时分别给 LONG/SHORT；中间区间保持 UNKNOWN。
- 盘口变好但方向不明不能被包装成多头或空头结论。

### 5.4 全族 veto

- `move_consumed_ratio` 达到晚到阈值时，所有 Pre-Move 内核 `NO_MATCH`。
- 单 Venue 巨量尖峰、极薄深度和无跨 Venue 确认同时成立时，所有 Pre-Move 内核 `NO_MATCH`，标记 noise/liquidity counter hints。
- veto 优先于正向匹配，防止“已经爆发”倒灌成“爆发前发现”。

## 6. Breakout/Retest 规则合同

### 6.1 Breakout Edge

- LONG：收于阻力上方、参与度达到阈值、离结构边界不过远。
- SHORT：收于支撑下方、独立 breakdown 参与度达到阈值、离结构边界不过远。
- 多空两边同时满足时 `NO_MATCH` + direction conflict，不允许 UNKNOWN，因为该机会族未授权 UNKNOWN。

### 6.2 Role-Flip Retest

- LONG：阻力上方保持、回踩拒绝强度和买方参与度分别达标。
- SHORT：支撑下方保持、回抽拒绝强度和卖方参与度分别达标。
- 做多与做空使用不同 semantic key，不以数值乘以 -1 实现。

### 6.3 全族 veto

- 收回原结构区间时 fakeout veto 优先，正向突破字段不能覆盖。
- 已消耗比例达到晚到阈值时 `NO_MATCH`。

## 7. 缺失与冲突语义

- 一个方向匹配、另一方向输入缺失：保留草案匹配，同时列出 missing keys 和 `opposite_direction_inputs_unavailable`；后续不得当作完整双向覆盖。
- 没有方向匹配且任一方向所需输入缺失：`DATA_UNAVAILABLE`，不得写成 NO_MATCH 或“市场无机会”。
- 两个方向都有完整输入但均不满足：`NO_MATCH`。
- 整体 input 为 PARTIAL 时输出始终带 `detector_input_partial` counter hint。

## 8. 当前阈值的正确解释

阈值已版本化并有 digest，但仍是合同级 DRAFT 起点：

- 用于验证边界、方向非对称、veto、缺失和重放确定性。
- 不得作为生产参数、真实策略参数或研究结论。
- 不得根据 19 个合成样本调到“全中”后宣称 Detector 有效。
- 下一步必须在冻结历史事件、匹配非事件、不同市场 regime 和 untouched holdout 上报告全部失败与分母。

## 9. 本地出口

本包只有在以下证据同时成立时计为本地完成：

- 五个 DRAFT kernel 均有独立 ID/version/pattern；
- M2.0 相关七个黄金 case 的 disposition 可重放；
- LONG/SHORT 使用独立输入，UNKNOWN/冲突行为明确；
- late/noise/fakeout veto 优先；
- unavailable、lineage、cutoff、ambiguity 和 value-quality lie fail closed；
- 结果与 observation 排序无关、深冻结、digest/identity 可校验；
- M2.0 回归、全 V2 和完整生产 CI 不回归。

本出口仍禁止：Candidate emission、Detector 生命周期升级、M1 runtime、DB/Redis/Worker、API/UI、Deep Validation、等级、计划、生产和任何实战能力声明。

## 10. 下一门禁

`V2-M2.2-HISTORICAL-REPLAY-AND-DETECTOR-LIFECYCLE-GATE` 必须建立：

1. 冻结 point-in-time historical cohort 和数据许可/lineage；
2. event、candidate、matched non-event 三分母；
3. family/direction/regime 分层 recall、precision、lead time、late/noise；
4. threshold sensitivity、失败案例和 untouched holdout；
5. 明确 PASS/FAIL/INSUFFICIENT，禁止自动调权或只展示最佳结果。

只有该 Gate 达到蓝图门槛并经独立审计，相关 Detector 才有资格从 DRAFT 提案升级到 `REPLAY_VALIDATED`；升级本身仍需独立 package。
