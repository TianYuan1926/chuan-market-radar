# M2.2 Historical Replay and Detector Lifecycle Gate Contract V1

日期：2026-07-20
状态：`M2.2-A_LOCAL_HARNESS_PASS / REAL_COHORT_MISSING / GATE_INSUFFICIENT / DETECTORS_DRAFT / NO_CANDIDATE_EMISSION / PRODUCTION_UNCHANGED`

## 1. 本合同解决什么

M2.1 只有五个未校准 DRAFT 回放内核。M2.2 负责回答一个更严格的问题：

```text
这些 Detector 是否真的能在当时可见的数据上，
比公开突破更早地发现真实行情，
同时没有用大量误报、晚到和噪音换取 recall？
```

本合同只建立可审计的历史回放、统计指标和生命周期提案门禁。它不启动 runtime，不写 Candidate，不生成 Signal、等级或交易计划，也不改变 Detector 生命周期。

## 2. 当前真实结论

仓库盘点结果：

- `reports/professional-backtest-audit/*` 是 Legacy 审计摘要和旧引擎输出，包含观察时间、旧 Signal 与 Outcome，但不具备 M2.2 所需的 V2 feature observation、knowledge cutoff、完整 Candidate 背景窗口、匹配非事件和独立 holdout custody。
- `src/v2/testing/m2-discovery-golden-fixtures.ts` 是明确的 test-only 合成合同样本，只能证明 schema、边界和确定性。
- 当前没有一份可接纳的 `REAL_POINT_IN_TIME_HISTORICAL` 数据集。
- 当前没有 Top20 排序证据，也没有完整 threshold sensitivity 试验。
- 因此当前 Gate 只能是 `INSUFFICIENT`；五个 Detector 继续保持 `DRAFT`，Candidate emission 继续为 `false`。

旧报告可以作为缺陷线索，不能转换成 V2 lifecycle 晋级证据。

## 3. 数据集接纳边界

真实 lifecycle 数据集必须同时满足：

1. `datasetKind=REAL_POINT_IN_TIME_HISTORICAL`。
2. 每个来源有唯一 registry/capability 身份。
3. license review 已批准，retention right 与 replay right 已授予。
4. event time、receivedAt、knowledge cutoff 和 lineage 完整。
5. Candidate Universe 背景窗口覆盖完整，不能只挑爆发行情附近的窗口。
6. 原始载荷和数据集都有不可变 SHA-256 identity。
7. event label 版本固定为 `significant-expansion-event.v1`。
8. Detector rule set 精确绑定 M2.1 version 和 digest。
9. 本次评估的 Detector 集合在 manifest 冻结，每一条 Event、Matched control 和完整背景记录都必须运行同一集合，不能给成功样本多跑 Detector、给背景样本少跑 Detector。
10. train、validation、holdout 都非空。
11. split 使用真实时间窗，purge + embargo 间隔由 schema 计算验证。
12. holdout underlying group 与此前 split 分离，并保留 symbol/regime assignment evidence digest。
13. 独立 custody 模式下，research dataset Bundle 的 `records` 字段禁止出现任何 HOLDOUT 载荷，只能保存 artifact id/digest 和计数承诺；真正载荷只能由单次 Gate 输入，读取后立即封存结果和 access ledger。

任一条件缺失都只能 `INELIGIBLE / INSUFFICIENT`，不得用说明文字覆盖。

## 4. 四组必须并存的数据

### 4.1 Candidate denominator

在完整 Universe 背景窗口上回放后，所有 Detector 首次命中的总数。它用于 precision、误报和内部资源负担。

### 4.2 Event denominator

覆盖期内全部 Significant Expansion Event。未命中、输入不可用和失败事件仍留在分母中，用于 recall、miss 与 lead time。

### 4.3 Matched non-event denominator

按方向、流动性、regime 和时间环境匹配，但之后没有爆发的对照窗口。它用于检验 Detector 是否只是对普遍噪音敏感。

### 4.4 Complete background non-event windows

这是 Candidate denominator 的真实性支撑，不是第四个替代性业务指标。如果只有事件和人工匹配对照，candidate precision 会被病例对照采样比例人为抬高。完整背景窗口负责把全市场误报重新放回分母。

## 5. Future leak 隔离

每个 cohort record 分为两个物理字段：

```text
replaySteps
  -> 只含当时可见 DetectorInput 与 observations

target
  -> 只含事后 Event / Non-event 标签
```

执行器 `executeTargetBlindReplay` 只接收 `recordId + detectorIds + replaySteps`，不接收 target。Detector 输出冻结后，Evaluator 才读取 `eventStartAt / publicBreakoutAt / moveConsumedFraction`。

严格 schema 拒绝在 replay input 中加入 future outcome、MFE、MAE、future return、public breakout 或其他未声明字段。未来标签不得回写阈值、排序或生产模块。

`eventCutoff` 表示行情事实截止时间，`knowledgeCutoff` 表示这些事实真正可被系统知道的时间。发现时间和 lead time 一律使用 `knowledgeCutoff`；两个 cutoff 都必须严格递增且位于冻结 split 内，不能用更早的事件时间掩盖供应商或网络延迟。

## 6. 首次发现与去重

每个 record 可有多个严格递增的 replay step。每个 Detector 只保留该 record 内首次 `MATCHED_DRAFT_HYPOTHESIS`：

```text
同 Detector + 同 cohort record
-> first detection only
-> 后续重复命中不扩大 Candidate denominator
```

系统级事件 lead time 使用最早兼容方向首次发现的 `knowledgeCutoff`。方向分层不把 `UNKNOWN` 重复记入 LONG 与 SHORT；UNKNOWN 只能贡献总体 Pre-Move 异常发现，不能冒充方向能力。

## 7. 指标定义

Gate 同时输出 overall、family、detector 和 `family x direction x regime x liquidity` required stratum；Event/Matched-control 实际出现的 stratum 必须全部进入 registry，不能删掉表现差的分层：

- candidate precision 与 Wilson 95% CI；
- event recall 与 Wilson 95% CI；
- matched non-event activation rate 与 Wilson 95% CI；
- unavailable event rate；
- late、noise、wrong-direction 数量；
- late/noise rate；
- candidates per instrument-day；
- lead-time P25 / median / P75；
- median 的非参数秩区间。

零分母必须输出 `null + numerator/denominator=0`，禁止输出 0% 冒充有效统计。

## 8. 初始 Gate Policy V1

Policy identity：`v2-m2-historical-replay-gate-policy.v1`，内容有独立 digest，验收时不能临时改分母或阈值。

Pre-Move 初始门槛：

- Candidate 最少 100；Event 最少 200；Matched non-event 最少 200。
- 每个 required `family x direction x regime x liquidity` 至少 30 Event 和 30 Matched non-event，并逐层执行性能门槛，不能只让 family 总平均通过。
- Event recall `>=40%`。
- Candidate precision `>=20%`。
- Recall 95% CI 下界必须高于旧审计基线 `23.53%`。
- Event recall CI 下界必须高于 matched-control activation CI 上界。
- Late/noise `<=30%`。
- Event unavailable `<=5%`。
- Lead-time median 必须大于 0。
- Top20 late/noise 必须 `<=30%`，且需独立 ranking evidence。
- 所有 sensitivity trials 必须预登记并全部报告。

Breakout/Retest 当前没有经 ADR 冻结的 promotion threshold，因此即使样本表现好，也只能 `INSUFFICIENT`，不得套用 Pre-Move 门槛自批。

## 9. Gate 状态语义

| 状态 | 含义 |
|---|---|
| `INVALID` | identity、trial registry、custody 或实验合同自相矛盾 |
| `INSUFFICIENT` | 真实数据、样本、holdout、Top20 或 sensitivity 证据不足 |
| `FAIL` | 证据充分，但冻结性能门槛失败 |
| `PASS` | 冻结真实 holdout 与全部门槛通过，可生成晋级提案 |

即使 `PASS`：

```text
lifecycleMutationAllowed=false
candidateEmissionAllowed=false
independentAuditRequired=true
```

Gate 只允许提出 `REPLAY_VALIDATED` proposal。真正修改生命周期必须由独立 package、人工/独立审计和新 release 完成。

## 10. 本地实现

- `src/v2/research/historical-replay-contract.ts`
- `src/v2/research/historical-replay-gate.ts`
- `src/v2/research/historical-replay-gate.test.ts`
- `npm run test:v2-m2-historical-replay`

13 项定向测试覆盖：不可变 dataset identity、未来字段拒绝、purge/embargo、固定 Detector 分母、holdout group isolation、holdout 载荷物理分离与单次打开、三分母、背景误报、unavailable 保留、以 knowledge time 计算提前量、合成样本禁晋级和 report 防篡改。

## 11. 当前未完成项

M2.2-A 完成合同和 harness，M2.2-B0 已完成来源准入与一文件技术验证；二者都不是能力验收。以下仍未完成：

1. 由人工取得并登记允许 retention/replay 的真实历史来源，并绑定不可变官方条款证据。
2. 取得 point-in-time onboard/delist/contract/settlement/underlying/status，不能以归档 presence 或当前 snapshot 代替。
3. 为 DRAFT evaluation 增加 target-blind diagnostic strength，冻结 Candidate ranking policy；当前只有 matched/no-match，不能生成有效 Top20。
4. 冻结 train-only 事件阈值、matching、完整背景、pre-cutoff regime/liquidity 和 trial registry，并绑定全部 policy digest。
5. 构建完整 point-in-time feature observations 与背景窗口。
6. 冻结 Event、Matched non-event、train/validation/holdout。
7. 用真实数据生成独立 holdout artifact，并落实外部 custodian/access ledger；代码合同已经能拒绝 inline 假隔离，但当前没有真实工件。
8. 注册并运行全部 threshold sensitivity trials。
9. 运行真实 holdout，输出失败案例、分层指标和独立审计。

## 12. 下一施工顺序

```text
M2.2-B0.1 Target-Blind Diagnostic Strength and Construction Policy Freeze
-> M2.2-B0.2 Rights and Point-in-Time Instrument Metadata Resolution
-> M2.2-B1 Immutable Raw Archive Acquisition
-> M2.2-B2 Cohort Construction
-> M2.2-B3 Split and Sealed Holdout Freeze
-> M2.2-C Registered Replay, Sensitivity and Untouched Holdout
-> M2.2-D Independent Audit and Lifecycle Proposal
```

在 M2.2-D 之前，五个 Detector 永远保持 DRAFT；M1.7 之前，任何 M2 runtime 仍禁止启动。
