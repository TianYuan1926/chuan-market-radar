# M3.0 Final Decision Authority Contract V1

状态：`LOCAL_CONTRACT_PASS / TEST_ONLY_NO_PRODUCTION_AUTHORITY / M1_P0R_PENDING / M2_DETECTORS_DRAFT`

## 1. 目标

M3.0 只冻结最终决策的唯一权威边界：任何 `TRADE_PLAN_READY` 都必须由同一 release、同一 Candidate Episode 谱系、完整 point-in-time 证据、独立 Evidence/Setup 评级、StrategyDraft、Execution Feasibility、入场触发和 Runtime Gate 共同支持。

本包防止“有候选就给计划”“Analysis 直接给计划”“前端补齐价格”“缺数据仍 READY”。它不实现完整 M3，不证明任何真实策略有效，也不开放生产写入。

## 2. 唯一输入链

```text
M3DecisionAuthorization
CandidateEpisode(PROMOTED)
-> OpportunityThesis
-> EvidencePackage
-> AnalysisSnapshot
-> SignalQualification
-> StrategyDraft
-> ExecutionFeasibilitySnapshot
-> EntryTriggerObservation
-> RuntimeDecisionGate
-> StrategyDecision
-> M3FinalDecisionAssessment
```

任何输入缺失、版本未知、release 不同、身份断链、时间倒流或原因不完整，assessment 必须 fail closed。

## 3. 授权门

最终决策 authority 只有在以下条件全部成立时才可能为 `AUTHORIZED`：

1. scope 不是 `TEST_ONLY`。
2. M1 engineering exit=`PASS`。
3. M2 lifecycle Gate=`PASS`。
4. Candidate emission 已独立授权。
5. final-decision authority 已显式启用，并绑定时间与 evidence id。
6. Episode 已真实推进到 `PROMOTED`。
7. Detector lifecycle 与运行 scope 匹配。
8. production scope 还必须单独具备 production write authority。
9. 非 TEST_ONLY scope 必须同时具有 scope-matched calibrated Analysis、Signal Qualification 和 Strategy authority。

production write authority 不能脱离 final-decision authority 单独存在；授权字段互相矛盾时，整个 Bundle 在 schema 层拒绝。

当前真实系统不满足第 2 至第 7 项，故只能是 `NOT_AUTHORIZED`。测试中的授权 REPLAY Bundle 只是合同反例，不是当前能力证明。

## 4. Action State 推导

优先级固定为：

```text
任何 authority / 关键事实 / RR / feasibility / runtime / trigger 硬阻断
-> BLOCKED

Evidence Grade=C 或 Setup Grade=MARGINAL
-> OBSERVE

入场触发仍 PENDING
-> WAIT

全部授权、质量、结构、执行和触发门通过
-> TRADE_PLAN_READY
```

`INSUFFICIENT / INVALID / UNKNOWN` 不得进入 OBSERVE 或 WAIT；它们必须 `BLOCKED`。非 READY 状态的 `executablePlan` 必须为 `null`。

## 5. READY 硬条件

READY 至少要求：

- Evidence fresh 且 completeness ratio=1。
- Evidence Grade 不是 `INSUFFICIENT`；Setup Grade 不是 `INVALID/UNKNOWN/MARGINAL`。
- Evidence/Setup calibration 均不得处于 abstain，且 authority 必须匹配当前 scope。
- Analysis 具有明确方向，且 family/direction/analyzer/qualification policy 与 StrategyDraft 相同。
- Draft 没有 blocker，至少一个有结构来源的目标。
- Draft entry/stop/target 必须引用 Analysis exact level/fact，stop base 和 target price 必须与来源 level 一致。
- Draft 的 gross/net RR 与成本必须由当前 exact calculation version 重算一致。
- gross structural RR `>=3`。
- Execution Feasibility=`PASS`，执行事实 fresh，net RR `>=3`。
- Runtime Gate=`READY`。
- Trigger=`CONFIRMED`、事实 fresh 且包含 point-in-time fact id。
- Draft 在 decision 时尚未过期。
- Decision 的计划字段逐项等于 StrategyDraft，net RR 精确来自 Feasibility。

M3.0 不计算 family-specific level、止损、目标或 RR；这些必须由后续受测 Module 生成。该合同只校验它们是否来自正确上游并满足现有宪法门槛。

## 6. Lineage 与时间

- authorization、Episode、Thesis、Evidence、Analysis、Qualification、Draft、Feasibility、Runtime 和 Decision 必须使用同一 release。
- Episode/Thesis/Evidence/Analysis/Qualification/Draft/Feasibility/Decision 的 id 必须形成唯一上游链。
- 下游 `sourceCutoff/generatedAt` 不得早于上游。
- Trigger 必须晚于 StrategyDraft；Runtime Gate 必须覆盖 Feasibility cutoff。
- Decision 必须晚于 Trigger、Runtime Gate 与 authority evidence，并覆盖它们的最新 cutoff。
- 未知字段和 future Outcome material 在 strict schema 层拒绝。

## 7. 原因真值

Decision 必须至少包含 assessment 从输入事实推导出的全部关键原因。例如：

- `m1_engineering_exit_not_passed`
- `m2_lifecycle_gate_not_passed`
- `entry_trigger_pending`
- `evidence_grade_c_observe`
- `setup_grade_marginal_observe`
- `signal_qualification_calibration_abstained`
- `signal_qualification_authority_not_calibrated_for_scope`
- `strategy_authority_not_calibrated_for_scope`
- `all_final_decision_gates_passed`

泛化的 `blocked`、`wait` 或 UI 文案不能替代可审计原因。额外原因允许存在，但不能遮蔽必需原因。

## 8. 当前明确未完成

- family-specific Analysis 与 Evidence/Setup 双评级合同已建立，但真实校准仍未完成。
- Deep Validation 的真实 EvidencePackage 生产链。
- Evidence Grade / Setup Grade 的真实样本校准。
- 各机会族 Strategy template、结构 RR 和反例合同已由 M3.3 建立，但真实 buffer/cost 校准与 scope authority 尚未完成。
- spread、slippage、funding、liquidity、capacity 的 live Feasibility。
- Personal Risk 与 Portfolio Risk。
- 真实 historical cohort、untouched holdout 和独立审计。
- M1 production authority、M2 Candidate emission、M3 runtime、API、页面和生产写入。

因此 M3 主步骤保持未完成，M3.0 只能记 `LOCAL_CONTRACT_PASS`。

## 9. 验收

定向测试 22/22 覆盖：授权 REPLAY READY、当前 closed state、伪造 READY、DRAFT Detector、WAIT/OBSERVE/BLOCKED/READY、低质量评级、计划篡改、release/id 拼接、时间倒流、原因隐藏、矛盾权限、Strategy scope、family/policy/level/RR 伪造、未知 future 字段、确定性与深冻结。

完整出口还要求 typecheck、lint、`test:market`、全 V2、ops、M0、production build、Golden 16/16 和 security 全部通过。`backtest:formal` 不属于本包。
