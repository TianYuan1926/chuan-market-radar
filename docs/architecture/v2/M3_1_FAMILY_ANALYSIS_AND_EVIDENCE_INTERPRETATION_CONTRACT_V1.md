# M3.1 Family Analysis and Evidence Interpretation Contract V1

状态：`LOCAL_CONTRACT_PASS / SIX_FAMILIES_LONG_SHORT_AND_INVALIDATION_PASS / ANALYSIS_SNAPSHOT_V3 / TEST_ONLY_UNCALIBRATED / NO_STRATEGY_AUTHORITY / PRODUCTION_UNCHANGED`

## 1. 目标

M3.1 只建立六类机会的独立结构解释层：把同一 Candidate Episode 的 Opportunity Thesis、完整 Evidence Package、point-in-time Market Context 和有事实来源的结构位，解释成一个可审计的 `AnalysisSnapshot v3`。

本包回答“证据共同说明了什么、哪里可能失效、哪些事实仍缺失”。它不做机会评级，不生成入场、止损、目标、RR、杠杆、仓位或 Action State，也不具备 Strategy 或生产 authority。

## 2. 唯一输入链

```text
OpportunityThesis
-> EvidencePackage v2
-> one-to-one normalized observations
-> exact MarketContextSnapshot
-> evidence-backed StructuralLevel[]
-> AnalysisSnapshot v3
```

所有输入必须属于同一 release、同一 Episode/Thesis 谱系，并在 analysis cutoff 前已经可知。跨 release 拼接、未来事实、漏解释 EvidenceItem 或无来源结构位必须 fail closed。

## 3. 六类机会的独立解释职责

| Opportunity Family | 主要回答 | 多空依据 | 明确失效或不可用路径 |
| --- | --- | --- | --- |
| `PRE_MOVE` | 压缩、流量领先或流动性状态是否仍处于早期 | long/short flow lead 必须来自同向 EvidenceItem | 行情已消耗、单 Venue 薄流动性失真 |
| `BREAKOUT_RETEST` | 边界突破、接受与角色互换回踩是否成立 | long/short boundary 或 role flip | 返回原区间、空间受限、回踩待确认 |
| `TREND_CONTINUATION` | 趋势结构和结构性回调是否保持 | 上升/下降结构与对应回调保持 | 结构受损、延伸已消耗 |
| `REVERSAL_RANGE` | 关键位扫流动性后的收复/拒绝或区间边缘反应 | 支撑扫低收复或压力扫高拒绝 | 未收复、继续逆向扩张、确认待定 |
| `RELATIVE_STRENGTH` | 相对基准与同类资产的偏离是否持续 | 相对强势为 long、相对弱势为 short | 低成交失真、基准冲击、优势不持续 |
| `DERIVATIVES_FLOW` | 价格/OI、拥挤释放、资金费率与基差错位说明什么 | 每个衍生品观察均有独立 long/short code | 过热、清算后噪音或数据能力缺失 |

六族可以复用通用的结构、位置、参与度、时机、跨 Venue 和噪音类别，但不得借用其他 family 的专用 observation code。

## 4. Evidence 解释完整性

1. 每个 EvidenceItem 必须恰好对应一个 observation，不允许遗漏、重复或引用包外 evidence id。
2. observation 的 family、category、stance 和 observedAt 必须与 EvidenceItem 一致。
3. EvidenceItem 必须包含精确的 `m3_observation:<observation_code>` reason code；同类别证据也不能被重新贴成更有利的标签。
4. supporting evidence 进入 `supportingReasons`；contradicting、missing 或非 fresh evidence 进入 `counterEvidence`，不得静默丢弃。
5. M3.0 最终决策合同再次核对 `AnalysisSnapshot.evidenceItemIds` 与 Evidence Package 完全相等，防止下游换包或删反证。

## 5. AnalysisSnapshot v3

M3.1 首次把 AnalysisSnapshot 从 v1 升级为 v2；M3.2 随后升级到 v3。当前四个不可省略的真值为：

- `evidenceItemIds`：精确声明本次解释消费的全部 EvidenceItem。
- `marketContextSnapshotId`：绑定本次分析实际读取的 Market Context。
- `analysisAuthority`：区分 `TEST_ONLY_UNCALIBRATED`、REPLAY、SHADOW、LIMITED 和 PRODUCTION 校准权限。
- `spaceQuality`：显式记录结构后的剩余空间为 GOOD、ACCEPTABLE、CONSTRAINED 或 UNKNOWN。

当前实现永远输出 `TEST_ONLY_UNCALIBRATED`。M3.0 在 REPLAY、SHADOW、LIMITED 或 PRODUCTION scope 下要求对应级别的 calibrated authority，因此当前 M3.1 结果不能进入有权决策。

输出还包含 family、direction bias、structure state、market stage、location quality、space quality、结构位、支持/反证、late/fakeout/noise risk 和四维 uncertainty。输出不包含 grade、交易计划或个人风险参数。

## 6. 结构位与 Fibonacci 边界

- 每个 StructuralLevel 必须有唯一 level id、至少一个 source fact id，并能在 fresh、非 missing EvidenceItem 中找到来源。
- 重复 level id、包外 fact id 或仅由 stale/missing evidence 支撑的 level 必须拒绝。
- Fibonacci 可以作为辅助位置，但不能成为唯一结构基础；全是 `FIB_ZONE` 时 fail closed。
- M3.1 不从前端输入或主观文案编造关键位。

## 7. 缺失、过期、冲突与不确定性

- Evidence Package 不完整、必需类别缺失、任一关键 evidence stale 或硬失效时，direction 必须回到 `UNKNOWN`。
- 同时出现 long 和 short 方向证据时不得强行择边。
- Market Context stale 时必须在 market uncertainty 中显式保留，但不能借机改写结构方向。
- 模型不确定性固定为 `HIGH`，并标记 policy 尚未经验校准。
- execution uncertainty 固定为 `UNKNOWN`，因为 Analysis 不评价点差、滑点、容量、费用或资金费率执行成本。

## 8. 当前明确未完成

- 真实 Deep Validation 和 Evidence Package 生产链。
- observation definition、family policy 与 required-category 的历史 cohort 校准。
- Evidence/Setup 双评级合同已由 M3.2 建立，但真实校准、置信区间证据和 scope authority 尚未完成。
- M1 production authority、M2 lifecycle Gate 与 Candidate emission。
- M3.3 已建立各 family 的 test-only Strategy template、结构止损、目标和精确 RR；真实 buffer/cost 校准、scope authority 与 trigger 仍未完成。
- live Execution Feasibility、Personal Risk、Portfolio Risk。
- untouched holdout、独立审计、M3 runtime、API、Decision Snapshot 和页面。

因此 M3 主步骤仍未完成，当前系统仍不能产生 V2 `TRADE_PLAN_READY`。

## 9. 验收

M3.1 定向测试 21/21 覆盖：六族 long、六族 short、六族失效/不可用、完整 evidence 核算、缺失、stale、方向冲突、跨 release、身份拼接、标签漂白、未来时间、结构位来源、Fib-only、Market Context、future/plan 字段拒绝、无等级/计划输出、确定性和深冻结。

M3.3 后，M3.1 仍为 21/21；M3.2 为 18/18，M3.3 为 20/20，M3.0 扩展到 22/22，合计 M3 定向 81/81。新增门禁拒绝未校准 Qualification、calibration abstain、旧 schema、Strategy scope/level/RR 伪造。完整出口还要求 typecheck、lint、`test:market`、全 V2、ops、M0、production build、Golden 16/16 和 security PASS。`backtest:formal` 不属于本包。
