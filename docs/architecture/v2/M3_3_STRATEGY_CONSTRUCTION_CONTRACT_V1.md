# M3.3 Strategy Construction Contract V1

状态：`LOCAL_CONTRACT_PASS / SIX_FAMILY_LONG_SHORT_TEMPLATES / TEST_ONLY_UNCALIBRATED / NO_READY_AUTHORITY / PRODUCTION_UNCHANGED`

## 1. 目标

M3.3 把已解释、已分级但尚无交易权限的机会，转换成一份可审计的 `StrategyDraft v2`。它只回答：

- 当前机会族应使用哪一种计划模板。
- 哪个结构位是入场锚点和失效基准。
- stop 是否先按结构确定，再向风险侧应用缓冲。
- target 是否来自分析中已经存在的结构位。
- gross RR 和保守成本后 RR 是否按同一公式精确计算。
- 证据不足、结构不完整或价格已追远时为什么必须弃权。

本 Module 不评价实时点差、深度、容量、成交概率或账户风险，不产生 Action State，也永远不能写 `TRADE_PLAN_READY`。

## 2. 唯一输入与输出

```text
AnalysisSnapshot v3
SignalQualification v2
point-in-time reference price
frozen test-only cost assumptions
-> StrategyDraft v2 OR explicit no-draft abstention
```

输入必须使用同一 release、Episode、Analysis、Evidence Package、Market Context、Opportunity Family 和 direction。Analysis/Qualification 必须来自当前 policy，reference price 必须 fresh、在 cutoff 前可知，并与 Analysis 结构事实共享 lineage。

输出只有三种：

- `CONSTRUCTED_TEST_ONLY`：生成完整但带 no-authority blocker 的草案。
- `ABSTAINED_NO_DRAFT`：结构或资格不足，不生成任何价格占位。
- `BLOCKED`：schema、release、身份、时间、policy 或事实谱系被篡改。

## 3. 六族独立模板

| Opportunity Family | 入场语义 | 结构失效 | 主要目标语义 |
| --- | --- | --- | --- |
| `PRE_MOVE` | 压缩边界保持且参与度开始扩张 | 接受于不利压缩边界之外 | 邻近结构、流动性区、验证后的扩展位 |
| `BREAKOUT_RETEST` | 突破边界完成角色互换回踩并恢复 | 收盘重新穿回角色互换边界 | 前高低、结构边界、流动性区 |
| `TREND_CONTINUATION` | 结构性回调保持并恢复原趋势 | 被保护的趋势结构破坏 | 前趋势极值及后续结构 |
| `REVERSAL_RANGE` | 扫流动性后收复或拒绝并确认参与度 | 接受于 sweep extreme 之外 | 区间均值、结构、对侧边缘 |
| `RELATIVE_STRENGTH` | 相对优势持续且本币结构同步确认 | 本币结构失败或相对优势衰减 | 本币结构目标，不以相对强弱替代价格结构 |
| `DERIVATIVES_FLOW` | 衍生品错位持续且现货结构同向确认 | 现货结构失败或 flow 反转 | 结构与流动性目标 |

六族分别冻结 entry kind、target kind、confirmation window、expiry、no-chase 和 partial take-profit policy。不能把一种 entry/stop/target 模板套给全部机会。

## 4. 结构几何

1. LONG 入口只选择 reference price 下方或相等的允许结构位；SHORT 对称选择上方或相等结构位。
2. 入口锚点必须来自 `AnalysisSnapshot.structuralLevels`，Fibonacci 永远不能作为入口或 stop 的唯一结构。
3. planned entry zone 只在锚点两侧应用版本化 buffer。
4. stop base 先等于结构失效锚点，再向不利方向扩大：
   - LONG：`structuralStop < structuralStopBase`
   - SHORT：`structuralStop > structuralStopBase`
5. 不能移动 stop base 或缩小 stop buffer 来制造更好的 RR。
6. reference price 超过 family-specific no-chase 距离时返回 `ABSTAINED_NO_DRAFT`。
7. target 必须位于回报侧，并逐个引用 Analysis 中 exact level id 和 exact price。
8. Fibonacci target 只有在结构位明确带有 `validated_extension` 来源时才可用。

## 5. 精确价格与 RR

价格位移和 RR 使用 BigInt 定点十进制算法，不使用二进制浮点进行价格几何。

保守 entry 取：

- LONG：entry zone upper。
- SHORT：entry zone lower。

gross RR 使用 target allocation 加权回报除以结构风险。保守总成本为：

```text
2 * feePerSideBps
+ 2 * slippagePerSideBps
+ max(fundingBps, 0)
```

负 funding 不允许在草案阶段提高 RR。net RR 同时从回报扣除成本、向风险增加成本。

`StrategyDraft v2` 写入：

- exact RR calculation version 与 precision。
- fee/slippage/funding 和 total conservative cost。
- gross RR 与 estimated net RR。

Final Decision 会用 entry、stop、targets、allocation 和 cost 重新计算；手工修改 RR 或成本后不能通过。

## 6. 版本化成本与缓冲边界

当前成本集与 family buffer policy 均标记 `TEST_ONLY_UNCALIBRATED`。固定测试值只用于证明合同和算法，不能代表任一 Venue、币种、时段或账户的真实成交成本。

因此每份当前草案必须保留：

- `strategy_authority_test_only_uncalibrated`
- `strategy_buffer_policy_uncalibrated`
- `strategy_cost_assumptions_uncalibrated`
- `signal_qualification_calibration_abstained`

即使结构 RR 很高，以上 blocker 也不能被 RR 抵消。

## 7. 弃权与禁止占位

以下情况返回 `draft=null`：

- direction 为 NEUTRAL/UNKNOWN。
- Evidence Grade=`INSUFFICIENT`。
- Setup Grade=`INVALID/UNKNOWN`。
- 没有合格入口锚点。
- 没有回报侧结构目标。
- reference price 非 fresh。
- reference price 已超出 no-chase 距离。

不得用 `0`、当前价、固定百分比、前端画线或任意默认 target 补齐缺失计划。Evidence C 或 Setup MARGINAL 可以形成研究用完整草案，但必须带 `OBSERVE_ONLY` blocker。

## 8. Final Decision 二次防线

M3.0 当前额外核对：

- Draft family、direction、analyzer version 和 qualification policy lineage。
- Draft authority 与 TEST_ONLY/REPLAY/SHADOW/LIMITED/PRODUCTION scope 匹配。
- entry、stop、target 的 level id 在 Analysis 中存在。
- stop base 与来源结构位价格一致。
- target price 与来源结构位价格一致。
- reference price fact 属于 Analysis 结构事实。
- RR calculation version 正确，重算后的 gross/net/cost 与 Draft 完全一致。

任一不一致都不能被 Decision reason、UI 或授权开关覆盖。

## 9. 当前未完成

- family buffer 的真实 wick、volatility、order-book 和 regime 校准。
- Venue/币种/时段级真实 fee、slippage、funding 与 liquidity cost。
- tick size、lot size、最小下单额和可执行容量终审。
- 真实 historical cohort、untouched holdout 和 scope-matched Strategy authority。
- Entry Trigger runtime、Execution Feasibility、Personal/Portfolio Risk。
- M1/M2 runtime authority、Candidate emission、Decision Snapshot、API 和页面。

所以 M3.3 只达到本地合同出口，当前系统仍不能产生 V2 `TRADE_PLAN_READY`。

## 10. 验收

M3.3 定向 20/20，连同 M3.2 18/18、M3.1 21/21 和扩展后的 M3.0 22/22，共 81/81 PASS。

覆盖六族 long/short、精确小数、三目标 allocation、证据/形态弃权、缺入口/目标、追价、stale、跨 release/identity/time、cost 调参、Fibonacci 来源、低 RR 不缩 stop、authority/RR/level 伪造、确定性、深冻结和污染字段拒绝。
