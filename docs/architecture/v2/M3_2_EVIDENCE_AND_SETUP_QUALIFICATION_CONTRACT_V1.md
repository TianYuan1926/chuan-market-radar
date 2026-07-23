# M3.2 Evidence and Setup Qualification Contract V1

状态：`LOCAL_CONTRACT_PASS / EVIDENCE_AND_SETUP_INDEPENDENT / TEST_ONLY_UNCALIBRATED / NO_DECISION_AUTHORITY / PRODUCTION_UNCHANGED`

## 1. 目标

M3.2 把“证据是否可靠”和“当前形态是否值得继续等待或研究”拆成两个独立判断：

- `EvidenceGrade` 只评价证据包的完整度、独立性、时效、质量、谱系和不确定性。
- `SetupGrade` 只评价方向、结构、位置、剩余空间、时机、假突破、噪音、regime 适配与市场不确定性。

本包不计算总分，不继承 Candidate Priority，不生成 Strategy、entry、stop、target、RR、仓位、杠杆或 Action State，也不能产生 `READY`。

## 2. 唯一输入与输出

```text
OpportunityThesis
EvidencePackage v2
AnalysisSnapshot v3
MarketContextSnapshot v2
-> SignalQualification v2
```

输入必须使用同一 release、同一 Episode/Thesis、同一 Evidence Package 和同一 Market Context；所有 artifact 必须在 qualification cutoff 前可知。跨 release 拼接、身份断链、EvidenceItem 漏解释或未来读取一律 fail closed。

## 3. 上游 schema 收口

### EvidencePackage v2

- 删除上游 `tier`。Deep Validation 只能提供证据，不能提前生成 Evidence Grade。
- 每个 EvidenceItem 必须声明 `REQUIRED` 或 `SUPPLEMENTAL`。
- 非 missing evidence 必须声明事实或特征谱系，并至少属于一个 `independenceGroupId`。
- missing evidence 不得伪造 lineage、独立来源或 fresh quality。
- `completenessRatio` 必须精确等于“已观察 required item / 全部 required item”。
- 包级 `FRESH` 只在全部 required item 均存在且 fresh 时成立。

### AnalysisSnapshot v3

在 M3.1 的 exact EvidenceItem、Market Context 和 analysis authority 谱系基础上增加 `spaceQuality`：

- `GOOD`
- `ACCEPTABLE`
- `CONSTRAINED`
- `UNKNOWN`

剩余结构空间必须成为显式输入，不能由下游从 RR、价格文案或 UI 反推。

## 4. Evidence Qualification

Evidence assessment 必须逐项输出：

- completeness
- independence
- freshness
- data quality
- lineage
- uncertainty
- required / observed-required / fresh / total item count
- independent group count
- 可审计 reason codes

当前 test-only policy 的诊断等级为：

- `A`：required evidence 完整，全部 item fresh，数据与不确定性通过，至少 3 个独立来源组且至少 3 个 fresh item。
- `B`：required evidence 完整且 fresh，至少 2 个独立来源组和 2 个 fresh item。
- `C`：required evidence 完整且 fresh，至少 1 个独立来源组，但未达到 A/B。
- `INSUFFICIENT`：required evidence 缺失或不 fresh、包质量失败、谱系失败、数据不确定性高或未知、没有独立来源。

可靠但互相冲突的证据仍可以保持高 Evidence Grade；冲突必须由 Analysis 和 Setup 如实反映，不能通过降低“证据可靠性”偷偷消失。

## 5. Setup Qualification

Setup assessment 独立输出九个维度：

- direction
- structure
- location
- space
- timing
- fakeout
- noise
- regime fit
- market uncertainty

六个 Opportunity Family 各自拥有 premium/qualified/invalid structure state 和允许的 regime，不使用跨 family 通用总分。

等级规则：

- `PREMIUM`：family-specific premium structure，且全部质量维度通过。
- `QUALIFIED`：没有 FAIL/UNKNOWN，允许明确的降级项。
- `MARGINAL`：结构尚未失效，但至少一个质量维度失败。
- `INVALID`：结构失效或剩余空间受限。
- `UNKNOWN`：任一关键维度未知，禁止猜测或被其他强项补偿。

因此 `A + MARGINAL`、`INSUFFICIENT + PREMIUM` 都是合法且必须保留的组合。

## 6. 校准合同

Evidence 与 Setup 必须分别校准，且绑定：

- calibration version
- target definition version
- calibration cohort id
- untouched holdout id
- family / direction / regime segment
- covered regimes
- sample size
- estimated probability
- confidence interval
- reliability error
- evaluated time
- abstain reason

声称 `CALIBRATED` 至少要求 60 个样本、独立 cohort、未触碰 holdout、至少三个唯一 regime 且包含当前 segment、概率落在置信区间内，并且没有 abstain reason。这个 60 只是 schema 最低防伪门槛，不是实际统计充分性的自动证明；真实准入仍由分层 CI、覆盖度、漂移与 holdout Gate 决定。

`UNCALIBRATED` 必须把样本量写成 0，把 probability、CI、reliability error 和评估时间写成 null，并给出明确 abstain reason。禁止用占位数字伪装模型能力。

## 7. 当前 authority

当前 builder 永远输出：

```text
qualificationAuthority = TEST_ONLY_UNCALIBRATED
authority = TEST_ONLY_NO_DECISION_AUTHORITY
```

它只允许在冻结 fixture 上形成诊断性 Evidence/Setup Grade。M3.0 对 REPLAY、SHADOW、LIMITED 和 PRODUCTION 分别要求 scope-matched calibrated Analysis 与 Signal Qualification；任一 calibration abstain 都是显式 blocker。

## 8. 防污染边界

M3.2 strict schema 拒绝：

- Candidate Priority、总分或通用 ranking score。
- Outcome、MFE、MAE 或其他未来标签。
- entry、stop、target、RR、仓位、杠杆、Action State 或 executable plan。
- 包外 EvidenceItem、跨 release/context/identity 拼接。
- 伪造概率、样本、校准 authority、cohort 或 holdout。
- 不完整 Evidence Package 声称 fresh。

输出必须确定、内容寻址并深冻结。

## 9. 验收与未完成

M3.2 定向 18 项保持通过；M3.3 后连同 M3.1 21 项、M3.3 20 项和扩展后的 M3.0 22 项共 81/81 PASS。覆盖六族、双等级独立性、关键缺失、未知 context、invalid structure、constrained space、污染字段、谱系拼接、校准防伪、策略越权、确定性与深冻结。

以下仍未完成：

- 真实 Deep Validation 生产链。
- 真实 cohort、分层校准、untouched holdout 和独立审计。
- scope-matched calibrated authority。
- M3.3 已建立 test-only Strategy Construction；真实 buffer/cost 校准、scope authority、live Execution Feasibility 与 Personal/Portfolio Risk 仍未完成。
- M1/M2 runtime authority、M3 runtime、API、Decision Snapshot 和页面。

因此 M3 主步骤仍未完成，当前不能产生 V2 `TRADE_PLAN_READY`。
