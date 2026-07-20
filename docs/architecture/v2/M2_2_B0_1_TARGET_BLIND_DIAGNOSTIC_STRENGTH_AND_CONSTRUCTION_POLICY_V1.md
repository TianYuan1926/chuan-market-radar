# M2.2-B0.1 目标盲诊断强度与样本构造策略合同 v1

状态：`LOCAL_CONTRACT_PASS / NO_REAL_COHORT / DETECTORS_DRAFT / NO_CANDIDATE_EMISSION / PRODUCTION_UNCHANGED`

日期：2026-07-20

## 1. 目的

本包解决两个会直接污染历史能力评价的问题：

1. M2.1 只有 `MATCHED / NO_MATCH / DATA_UNAVAILABLE`，没有可解释、可复现且不读取未来结果的相对强度，无法形成诚实 Top20。
2. M2.2-A 允许数据集登记阈值和样本策略，但此前没有把事件阈值、对照、完整背景、regime/liquidity、knowledge-time、ranking 和全部试验锁成唯一策略摘要。

本合同只服务离线 Research。它不证明 Detector 有效，不读取 M1 runtime，不生成 Candidate、等级、Signal 或交易计划。

## 2. 诊断强度语义

每个命中的 DRAFT Detector 现在输出：

```text
每条已用 observation 相对冻结规则边界的归一化位置
-> 组件算术平均
-> 数据质量乘数
-> 方向明确度乘数
-> diagnostic strength [0, 1]
```

冻结语义为：

```text
RELATIVE_RULE_MARGIN_NOT_PROBABILITY_OR_TRADE_GRADE
```

它不是胜率、置信度、信号等级、Setup Grade、Evidence Grade 或 READY 强度。边界命中组件记为 0.5；达到冻结强锚点记为 1；弱于边界会向 0 收敛。`PARTIAL` 质量乘数为 0.85，方向 `UNKNOWN` 乘数为 0.75。最终分数、组件均值、最弱组件、观察值、归一化规则和策略摘要都由 strict schema 重算，不能由调用方自报。

以下结果永远不可排名：

- `NO_MATCH`
- 被 late/noise/fakeout/counter-evidence veto 的结果
- `DATA_UNAVAILABLE`

## 3. 目标盲 Top20 排序

排序输入只包含同一 cutoff 的 Detector input 与已经冻结的 DRAFT evaluations。排序函数没有 target、event start、public breakout、Outcome、MFE、MAE、future return 或 Candidate Store 参数。

规则：

1. 调用方必须预先声明固定 Detector 分母。
2. 每个 source 必须完整包含该分母，差一个、重复一个或多一个都拒绝。
3. 同一 `instrument + family + direction + cutoff` 的可排名 Detector 取强度算术平均。
4. 同方向每多一个独立 Detector 加 0.025，一共最多加 0.05；该加成不改变 Detector 自身结论。
5. 只返回精确 Top20；未命中和 unavailable 仍保留在报告分母，但不得进入榜单。
6. 同分使用带公开固定 salt 的 SHA-256 稳定排序，不使用 symbol 字母顺序、输入顺序或随机数。
7. item 与 report 都是内容寻址工件，顺序、分数、计数或 identity 篡改都会拒绝。

Top20 仍是离线诊断排序，不是候选榜、推荐榜或交易信号。

## 4. 历史样本构造策略

### 4.1 事件阈值

- 只读 `TRAIN`。
- 按 `60M / 4H / 24H x LONG / SHORT` 六个维度分别拟合。
- 每个维度至少 1,000 个训练窗口。
- 使用 nearest-rank P99。
- 最终阈值取 `max(绝对底线, TRAIN P99)`；绝对底线仍为 5% / 8% / 15%。
- validation read count 和 holdout read count 必须为 0。
- 六项 threshold registry 必须内容寻址，并在 TRAIN 结束后、VALIDATION 开始前冻结。
- 每个 Event 必须引用正确 horizon/direction 的 entry id、registry digest 和有效阈值；任意手写百分比拒绝。

### 4.2 Matched non-event

每个 Event 只允许一个同 split 的 confirmed non-event，对照匹配维度冻结为：

```text
horizon + direction + pre-cutoff regime + pre-cutoff liquidity + UTC hour
```

先要求完全同层，再按绝对时间距离，最后用稳定哈希破同分。future label 只能确认其确实 24 小时无 expansion，不能参与匹配距离；control 不得复用或与事件窗口重叠。

### 4.3 完整背景

所有当时合格 instrument 每 300 秒形成一个背景窗口。不得按 Outcome 抽样，不得用 case-control 比例代表 Candidate precision，unavailable 窗口必须保留在分母。

### 4.4 Pre-cutoff 分层

- regime 只使用 cutoff 前 1 天主窗口和 7 天辅窗口。
- liquidity 只使用 cutoff 前 1 天的 quote volume、trade count，以及来源具备时的 spread。
- liquidity 分层阈值只允许在 TRAIN 拟合。
- 证据不足必须为 `UNKNOWN`，不能借未来数据补齐。
- 每条 record 都要绑定 assignment cutoff、policy id/digest 和 evidence fact ids。

### 4.5 Knowledge time

合同明确分成两类：

- `OBSERVED_RECEIVED_AT`：每条输入确有不可变 receivedAt。
- `MODELED_CONSERVATIVE_AVAILABILITY`：事件闭合时间加冻结的非负延迟，并强制显示 `MODELED_NOT_OBSERVED`。

modeled 模式不能同时声称 `receivedAtComplete=true`。事件时间也不能替代 knowledge time 抬高提前量。

### 4.6 Split 与试验

- split 固定为 purged time/symbol/regime holdout。
- purge 与 embargo 各至少 24 小时，holdout underlying group 必须隔离。
- 预登记 1 个 baseline 与 4 个 sensitivity：Detector 阈值收紧 10%、放宽 10%、modeled latency x3、consensus bonus=0。
- 数据集和实验必须登记全部五个试验；漏项、换角色、改参数，即使重新计算自洽 digest，也会被 registry 拒绝。
- 构造期间禁止读取 holdout，禁止挑选表现最好的 trial。

## 5. 数据集合同升级

历史 dataset/experiment/holdout artifact schema 升级到 v2，并绑定：

- construction policy version/digest；
- diagnostic ranking policy version/digest；
- TRAIN-only event threshold registry；
- split policy id/digest；
- knowledge-time 模式和 clock/model digest；
- matched/background policy id/digest；
- pre-cutoff regime/liquidity policy id/digest；
- 完整 trial registry id/digest 和参数；
- holdout artifact 与主 manifest 的相同规则身份。

这只锁定政策与证据结构。真实 raw acquisition、完整背景枚举和 cohort builder 仍分别属于 B1/B2，不能用本包测试夹具冒充。

## 6. 机器防线

定向测试覆盖：

- 强度边界单调、长短独立、质量/UNKNOWN 惩罚；
- veto/unavailable 不可排名；
- 组件、聚合、item、report 防篡改；
- 固定 Detector 分母、Top20、输入顺序确定性和未来字段拒绝；
- 六维 TRAIN-only P99、绝对底线、缺维度/重复/非 TRAIN/样本不足拒绝；
- 任意事件阈值、matched/background policy、regime/liquidity policy 拒绝；
- modeled knowledge-time 诚实披露；
- trial 漏项与参数漂移拒绝；
- 原 M2.2 target-blind replay、三业务分母和 sealed holdout 回归。

## 7. 当前结论与下一入口

```text
B0.1_LOCAL_CONTRACT_PASS
REAL_HISTORICAL_COHORT=0
M2.2_GATE=INSUFFICIENT
detectorLifecycle=DRAFT
candidateEmissionAllowed=false
productionMutation=0
```

下一入口是 `M2.2-B0.2 Rights + Point-in-Time Instrument Metadata Resolution`。来源 retention/replay 权利与历史 onboard/delist/contract/settlement/underlying/status 未形成合格证据前，B1 bulk acquisition 继续 fail closed。
