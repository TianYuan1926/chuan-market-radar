# Market Radar 权威蓝图目录

更新日期：2026-07-20

本目录只回答三件事：当前真实状态是什么、V2 应该怎样建设、哪些历史材料只能作参考。任何旧报告、旧周期身份或旧蓝图都不能绕过这里重新成为当前权威。

## 1. 当前唯一结论

```text
当前系统等级：R1 / 可运行但不完整 / 不能支撑实战
V2 设计状态：ACTIVE_DESIGN_AUTHORITY
V2 实现状态：M0_ENGINEERING_EXIT_LOCAL_PASS / M1.1-M1.6_LOCAL_PASS / M2.0_LOCAL_CONTRACT_PASS / M2.1_LOCAL_DRAFT_KERNEL_PASS / M2.2-A_LOCAL_HARNESS_PASS / M2.2-B0_LOCAL_SOURCE_GATE_AND_TECHNICAL_PILOT_PASS / M2.2-B0.1_LOCAL_CONTRACT_PASS / M2.2-B0.2-A_LOCAL_EVIDENCE_GATE_PASS / FIVE_SOURCE_CANDIDATES_RESEARCH_ONLY / EXTERNAL_RIGHTS_AND_HISTORICAL_SOURCE_BLOCKED / BULK_AND_COHORT_BLOCKED / REAL_COHORT_MISSING / GATE_INSUFFICIENT / DETECTORS_STILL_DRAFT / M1_NOT_COMPLETE / M2_RUNTIME_BLOCKED / LIVE_MARKET_AND_SHADOW_UNPROVEN
V2 生产权限：false
自动交易：永久禁止
最新生产终态：UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION
```

2026-07-19 最后一条已记录生产事实只证明 Cycle-7 已启动并至少运行到 sample 3，当时仍为 IN_PROGRESS；活跃记忆中没有更晚的终证据。因此不得写成 Cycle-7 PASS、G0 PASS、observer 仍在运行或当前生产已经失败。下一次涉及生产判断时必须先做新的只读核验。

Legacy G0 的七个生产出口继续作为历史安全义务，但它们不是 V2 的建设步骤，也不能决定 V2 源码组织。蓝图重构没有减少、完成或跳过任何真实生产门槛。

## 2. 活跃权威

| 优先级 | 文档 | 唯一职责 |
| ---: | --- | --- |
| 1 | [V2 受控替换工程与运行蓝图 v1.4](./MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md) | 当前唯一产品、领域、工程、研究、运行与切换设计权威 |
| 2 | [V2 机器追踪矩阵 v1.6](./market-radar-v2-controlled-replacement-traceability.v1.json) | 18 个 Module、5 维状态、4 类不确定性、硬门槛和 M0-M7 的机器合同 |
| 3 | [项目当前上下文](../../PROJECT_CONTEXT_FOR_CHATGPT.md) | 当前事实、风险、生产未知项和唯一下一入口 |
| 4 | [最近变更日志](../../CHANGELOG_FOR_CHATGPT.md) | 最近最多 5 个重要变化，不保存历史流水账 |
| 5 | [正确搭建顺序](../../market-radar-v2-build-sequence.md) | 当前唯一施工依赖、Critical Path、并行边界和减数规则 |
| 6 | [V2 M0 基线清单](../architecture/v2/V2_BASE_MANIFEST.v1.json) | Git、设计来源、排除祖先、生产只读状态和授权边界 |
| 7 | [M0 工程出口交付报告](./V2_M0_ENGINEERING_EXIT_DELIVERY_REPORT.md) | M0.3 实现、十项机器出口、完整门禁和生产零变更证据 |
| 8 | [M1.1 交付报告](./V2_M1_1_IDENTITY_FACT_DELIVERY_REPORT.md) | Identity/Fact 实现、27 个定向场景、完整门禁和生产零变更证据 |
| 9 | [M1.1 公开数据源合同](../architecture/v2/M1_1_PROVIDER_SOURCE_CONTRACTS_V1.md) | 三 Venue endpoint、identity/fact 归一化、失败语义和 live 未证明边界 |
| 10 | [M1.2 交付报告](./V2_M1_2_FEATURE_CONTEXT_DELIVERY_REPORT.md) | 精确 Feature、独立 replay 证据、保守 Context、完整门禁和生产零变更证据 |
| 11 | [M1.2 Feature/Context 合同](../architecture/v2/M1_2_FEATURE_CONTEXT_CONTRACT_V1.md) | 点时边界、计算公式、parity 证明、Context 降级和禁止能力 |
| 12 | [M1.3 交付报告](./V2_M1_3_STORE_REPLAY_RUNTIME_TRUTH_DELIVERY_REPORT.md) | append-only Store、双 cutoff replay、最小权限身份、PG16 演练和 Runtime Truth 证据 |
| 13 | [M1.3 Store/Replay/Runtime Truth 合同](../architecture/v2/M1_3_STORE_REPLAY_RUNTIME_TRUTH_CONTRACT_V1.md) | 原子持久化、完整性、幂等、Manifest、身份与五维真值边界 |
| 14 | [M1.4 交付报告](./V2_M1_4_FULL_UNIVERSE_COLLECTOR_RUNTIME_DELIVERY_REPORT.md) | 多标的四分母、Collector 状态机、配额/背压、恢复与 PG16 演练证据 |
| 15 | [M1.4 Full Universe/Collector 合同](../architecture/v2/M1_4_FULL_UNIVERSE_COLLECTOR_RUNTIME_CONTRACT_V1.md) | 目录保全、唯一写入路径、strict telemetry 和本地出口边界 |
| 16 | [M1.5 交付报告](./V2_M1_5_LIVE_NO_AUTHORITY_COLLECTOR_DELIVERY_REPORT.md) | durable checkpoint、Worker/SLO、PG16 重启恢复和 live egress 失败事实 |
| 17 | [M1.5 Live No-Authority Collector 合同](../architecture/v2/M1_5_LIVE_NO_AUTHORITY_COLLECTOR_CONTRACT_V1.md) | checkpoint、调度、证据三态、live rehearsal 和独立生产 Gate |
| 18 | [M1.5-B0 Shadow Release Safety 合同](../architecture/v2/M1_5_B0_SHADOW_RELEASE_SAFETY_CONTRACT_V1.md) | 最小权限身份、secret-file、完整 observation、有限 Shadow 与存储阻断 |
| 19 | [M1.5-B0 交付报告](./V2_M1_5_B0_SHADOW_RELEASE_SAFETY_DELIVERY_REPORT.md) | 41 项定向证据、外部通道事实、Docker 未证明边界与新施工顺序 |
| 20 | [M1.6 Partitioned Fact Storage 合同](../architecture/v2/M1_6_PARTITIONED_FACT_STORAGE_CONTRACT_V1.md) | 日分区、容量、最小权限、restore-verified retention 与生产未证明边界 |
| 21 | [M1.6 交付报告](./V2_M1_6_PARTITIONED_FACT_STORAGE_DELIVERY_REPORT.md) | 迁移兼容、PG16 跨分区、真实 dump/restore/replay 和清理审计证据 |
| 22 | [M2.0 发现合同与黄金样本](../architecture/v2/M2_0_DISCOVERY_CONTRACTS_AND_GOLDEN_FIXTURES_V1.md) | 六族十四模式、双 cutoff、Candidate/Episode/Thesis、去重、运行漏斗与 future-leak 防线 |
| 23 | [M2.0 交付报告](./V2_M2_0_DISCOVERY_CONTRACTS_DELIVERY_REPORT.md) | 发现合同、19 个 point-in-time fixture、完整门禁和 M1 runtime 阻断证据 |
| 24 | [M2.1 DRAFT 回放内核合同](../architecture/v2/M2_1_DRAFT_REPLAY_KERNELS_CONTRACT_V1.md) | 五个独立内核、未校准阈值、方向/veto/unavailable、确定性和 Candidate 禁发边界 |
| 25 | [M2.1 交付报告](./V2_M2_1_DRAFT_REPLAY_KERNELS_DELIVERY_REPORT.md) | 定向/回归/完整门禁、失败修复和 Detector 仍为 DRAFT 的证据 |
| 26 | [M2.2 历史回放与生命周期门禁合同](../architecture/v2/M2_2_HISTORICAL_REPLAY_AND_LIFECYCLE_GATE_CONTRACT_V1.md) | 真实数据接纳、固定 Detector/完整背景分母、target-blind replay、sealed holdout custody、knowledge-time lead、统计门槛和四态 Gate |
| 27 | [M2.2-A 交付报告](./V2_M2_2_A_HISTORICAL_REPLAY_GATE_HARNESS_DELIVERY_REPORT.md) | 本地 harness、真实数据缺口、定向/回归/完整门禁和下一真实 cohort 入口 |
| 28 | [M2.2-B0 来源资格与采集安全合同](../architecture/v2/M2_2_B0_HISTORICAL_SOURCE_QUALIFICATION_AND_ACQUISITION_SAFETY_V1.md) | 人工权利、历史身份、时间、能力、checksum、容量、路径与删 raw 的 fail-closed Gate |
| 29 | [M2.2-B0 交付报告](./V2_M2_2_B0_HISTORICAL_SOURCE_QUALIFICATION_DELIVERY_REPORT.md) | 真实一文件技术验证、bulk/cohort 阻断、测试与下一 ranking policy 入口 |
| 30 | [M2.2-B0.1 目标盲诊断强度与构造策略合同](../architecture/v2/M2_2_B0_1_TARGET_BLIND_DIAGNOSTIC_STRENGTH_AND_CONSTRUCTION_POLICY_V1.md) | 相对规则边际、固定分母 Top20、TRAIN-only 阈值、构造政策和试验注册表 |
| 31 | [M2.2-B0.1 交付报告](./V2_M2_2_B0_1_TARGET_BLIND_DIAGNOSTIC_STRENGTH_DELIVERY_REPORT.md) | 定向/完整门禁、策略防漂移、真实 cohort 缺口和生产零变更证据 |
| 32 | [M2.2-B0.2 权利与历史合约身份真值门禁](../architecture/v2/M2_2_B0_2_RIGHTS_AND_HISTORICAL_INSTRUMENT_EVIDENCE_GATE_V1.md) | 外部人工权利、条款留存、identity epoch、状态区间、knowledge time、完整分母和来源候选结论 |
| 33 | [M2.2-B0.2-A 交付报告](./V2_M2_2_B0_2_A_RIGHTS_AND_HISTORICAL_INSTRUMENT_EVIDENCE_GATE_DELIVERY_REPORT.md) | 机器 Gate、定向/完整测试、外部缺口、来源候选和生产零变更证据 |
| 34 | [M0 开工基线报告](./V2_M0_FOUNDATION_START_DELIVERY_REPORT.md) | 干净分支、初始合同和 M0.0-M0.2 历史证据 |

只有第一份蓝图和第二份机器矩阵具有 V2 设计权威。Context 不能改写长期合同，蓝图也不能覆盖更晚的生产只读事实。

## 3. 权威解析顺序

同一事实出现冲突时，按以下顺序处理：

1. 与当前 release 身份对齐的新鲜生产只读证据。
2. 永久安全、事实、交易、无 future leak 和无自动交易红线。
3. V2 蓝图 v1.4 与机器追踪矩阵 v1.6。
4. `PROJECT_CONTEXT_FOR_CHATGPT.md` 中仍标为 current 的事实。
5. Legacy 工程、运行和 readiness 文档中仍适用的安全与验收合同。
6. 历史蓝图、旧请求、旧报告、旧 digest 和 Git history。

历史材料可以证明过去发生过什么，不能证明现在仍然成立。

## 4. V2 核心链路

```text
Universe Registry
-> Market Fact + Quality
-> Point-in-Time Feature Engine
-> Market Context
-> Independent Opportunity Detectors
-> Candidate Episode + Opportunity Thesis
-> Deep Validation
-> Family Analysis
-> Evidence Grade + Setup Grade
-> Strategy Draft
-> Execution Feasibility + Final Decision
-> Personal Risk + Portfolio Risk
-> Decision Snapshot + Alerts
-> Outcome Evaluation
-> Research Governance
```

Runtime / Security / Release Control 贯穿全链。任何 Module 不得跳过前置权威产物直接生成交易计划。

## 5. 五维状态

| 维度 | 只回答什么 |
| --- | --- |
| Candidate Priority | 谁先获得稀缺深扫资源 |
| Evidence Grade | 证据是否完整、独立、及时、可信 |
| Setup Grade | 结构、位置、空间和反证是否优质 |
| Action State | 当前是 OBSERVE、WAIT、BLOCKED 还是 TRADE_PLAN_READY |
| User Fit | 计划是否适合当前个人和组合风险 |

五维不得合并为一个总分。只有 Execution Feasibility + Final Decision 可以产生 `TRADE_PLAN_READY`；Personal/Portfolio Risk 可以阻断用户执行，不能升级系统判断。

## 6. 当前实施入口

M0.0-M0.3、M1.1-M1.5-B0、M1.6、M2.0、M2.1、M2.2-A、M2.2-B0、B0.1 和 B0.2-A 已通过各自本地出口；生产仍为零变更。B0 已证明 Binance Vision 精确对象技术链，B0.1 已冻结 target-blind ranking/构造政策，B0.2-A 已冻结外部人工权利和 historical identity/coverage 机器 Gate；五个来源候选均为 `RESEARCH_ONLY`，因此 bulk acquisition=false、cohort freeze=false。当前 accepted real cohort=0，真实 Top20/sensitivity/holdout 证据缺失，所以 Gate=INSUFFICIENT、Detector 仍为 DRAFT。M1.6 只证明分区/retention 本地实现和隔离 dump/restore/replay，不证明生产容量。本机 provider live probe 连接超时，Edge OrcaTerm 为 0 会话，本机无 Docker CLI，故真实镜像、live market 和 Shadow/SLO 均未证明。当前可执行本地入口是：

```text
V2-M2.2-B0.2-C-FIRST-PARTY-FORWARD-INSTRUMENT-CAPTURE
```

该本地包只从真实 capture start 起建设前向 instrument truth，不能回填过去。关键路径外部门 `V2-M2.2-B0.2-B-EXACT-SOURCE-RIGHTS-AND-CAPABILITY-RESOLUTION` 仍必须取得人工来源权利结论和合格历史身份；Agent、公开下载、当前 snapshot、archive presence 和厂商宣传都不能自批。外部 `V2-M1.5-B1-EGRESS-EARLY-SHADOW-GATE` 在可信通道恢复后执行固定 31 个一分钟周期；B1 与 M1.6 都通过后才进入 M1.7 24 小时 Shadow。任何生产 Shadow、identity 或 migration 必须另过独立 Gate；M1.7 前不得让 M2 runtime 读取 M1 authority、写 Candidate Store、接入页面或生成等级/交易计划。

## 7. Legacy 参考材料

以下文档保留安全门槛、运行经验或历史审计价值，但状态统一为 `HISTORICAL_REFERENCE / NO_CURRENT_IMPLEMENTATION_AUTHORITY`：

| 文档 | 仍可提取什么 |
| --- | --- |
| [工程搭建蓝图 v1](./MARKET_RADAR_ENGINEERING_BUILD_BLUEPRINT_V1.md) | 测试、发布、恢复和工程质量要求 |
| [生产运行蓝图 v1](./MARKET_RADAR_PRODUCTION_RUNTIME_BLUEPRINT_V1.md) | 健康、降级、备份、事故和 Runbook 要求 |
| [实战就绪路线图 v3](../superpowers/plans/2026-07-10-market-radar-practical-readiness-master-plan-v3.md) | R4/R5、Shadow、paper workflow 和不可压缩门槛 |
| [旧 G0-G8 自动执行蓝图 v1](./MARKET_RADAR_G0_G8_AUTONOMOUS_EXECUTION_BLUEPRINT_V1.md) | Legacy 施工历史和旧生产出口 |
| [旧机器追踪矩阵 v1](./market-radar-blueprint-traceability.v1.json) | 历史 Gate 映射，不解析当前 authority |
| [不降质极速交付计划 v1](./MARKET_RADAR_ACCELERATED_DELIVERY_PLAN_V1.md) | 工程线/证据线分离与 Production WIP=1 |

重复的未提交模块化蓝图 v2 及其矩阵已经被 V2 完整吸收并删除。历史内容仍可从 Git 历史和旧交付报告审计，不再占用活跃记忆。

## 8. 活跃记忆卫生

- `PROJECT_CONTEXT_FOR_CHATGPT.md` 最多 400 行，只写当前事实、当前风险和当前入口。
- `CHANGELOG_FOR_CHATGPT.md` 最多保留 5 个重要变化；详细历史从 Git 和脱敏报告读取。
- 活跃蓝图只能有 1 份，活跃机器矩阵只能有 1 份。
- 生产 commit、image、observer、样本和 digest 都是易变事实；未经新鲜只读验证不得续写为 current。
- raw log、secret、真实 token、数据库业务行和临时请求身份不得进入活跃记忆。
- `TARGET`、`LOCAL PASS`、`DEPLOYED`、`OBSERVING`、`PRODUCTION PASS` 必须分开，不能互相冒充。
- 未证明用途的代码只允许隔离和登记，不能凭文件名批量删除。

## 9. 每轮阅读路径

1. 读 `PROJECT_CONTEXT_FOR_CHATGPT.md`，确认当前事实和停止条件。
2. 在 V2 蓝图定位唯一 Module、权威输出、禁止依赖和 Gate。
3. 用机器矩阵验证状态维度、硬门槛和建设顺序。
4. 只在需要 Legacy 安全/恢复门槛时读取历史参考。
5. 新建小而完整的任务包，先失败基线，再实现、定向测试、基础门禁和证据报告。
6. 涉及生产时重新获取只读事实；文档中的旧身份不能直接成为执行授权。

## 10. 永久禁止

- 自动下单或交易所账户写权限。
- mock、fallback、旧缓存、随机数或 0 冒充真实市场事实。
- Candidate、榜单、轻扫或外部情报冒充 Signal/READY。
- 前端生成方向、entry、stop、target、RR 或交易计划。
- Outcome/MFE/MAE/future label 回写生产排序。
- 为增加信号数量降低结构 RR 3:1、数据质量或风控门槛。
- Big Bang 切换、双生产写权威和 replacement 未稳定前删除 Legacy。
