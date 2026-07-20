# Market Radar V2 正确搭建顺序

## Goal

在不继承 Legacy 错误权威关系的前提下，先建立可信数据地基，再依次完成发现、验证、决策、工作台、学习、切换和实战准入。工程完成与时间证据分开计算，任何页面、提交或单次命中都不能冒充能力完成。

## Tasks

- [x] **M0.0 干净开工基线**：从最新 `origin/main` 建立独立 V2 实施分支，记录设计来源、排除的旧 G0 祖先、生产只读状态和永久禁区。验证：实施分支相对 `origin/main` 仅含已审查 V2 提交，生产仍为零变更。
- [x] **M0.1-M0.3 宪法、合同与隔离骨架**：冻结产品术语、18 个 Module、五维状态、四类不确定性、爆发行情标签、Legacy Capability Atlas、`src/v2` import fence、30 个权威产物 runtime schema 和第一条 M1 fixture。验证：V2 38/38、M0 十项机器出口与完整 `ci:production` PASS；Legacy 与 V2 零运行时互引，Legacy 539 个源文件已建立消费者地图，旧代码零删除，生产零变更。
- [ ] **M1 数据真值纵向切片**：按 `Universe -> Fact + Quality -> Point-in-Time Feature -> Market Context -> Runtime Truth` 建设，先贯通一个标的和三家 Venue，再扩大到全部 eligible instrument。验证：100% instrument accounting、无假 0、实时/回放同源、lineage 可追溯、故障诚实降级。
- [x] **M1.1 三 Venue Identity + Fact 本地纵切**：实现固定 HTTPS/GET Transport、Binance/OKX/Bybit catalog/ticker Adapter、完整 instrument accounting、不可变 Fact/Quality、分页/冲突/缺失/429/transport/duplicate/out-of-order/gap/stale/recovery 门禁。状态：`LOCAL_PASS_FROZEN_PROVIDER_CONTRACT / LIVE_CONNECTIVITY_UNPROVEN / PRODUCTION_UNCHANGED`。
- [x] **M1.2 Point-in-Time Feature + Context 纯函数纵切**：已实现三 Venue 同一 underlying 的精确价格分散度、带独立 ONLINE/REPLAY run 证据的 FeatureQuality，以及只在证据充分时识别价格碎片化的最小非方向性 Market Context。状态：`LOCAL_PASS_84_OF_84_V2 / PRODUCTION_UNCHANGED`；不能访问 cutoff 后数据，不输出 Candidate、方向或交易计划。
- [x] **M1.3 Fact Store + Replay + Runtime Truth**：已在隔离 PostgreSQL 16 演练 append-only artifact ledger、原子 Universe/Fact/Quality 分母、幂等冲突、retention metadata、双 cutoff replay manifest、五类 NOLOGIN capability role、完整 payload 篡改检测、两次 durable replay 和五维 Runtime Truth。状态：`LOCAL_POSTGRES16_REHEARSAL_PASS / PRODUCTION_UNCHANGED`；没有 production migration、live ingestion 或 authority。
- [x] **M1.4 全 eligible Universe + Collector Runtime 本地纵切**：已从 BTC 三 Venue fixture 扩大到 21 observed / 15 eligible 的多标的版本化范围，完成启动全量、增量 ticker、周期 reconciliation、配额/并发/背压、冷启动、目录 tombstone、恢复、strict telemetry 和真实 PG16 原子落库。状态：`LOCAL_POSTGRES16_REHEARSAL_PASS / LIVE_MARKET_UNPROVEN / PRODUCTION_UNCHANGED`。
- [x] **M1.5-A Durable Worker 本地出口**：已完成独立 additive checkpoint migration、artifact 引用约束、config/sequence/content digest、精确 release 恢复、固定节拍 skip-missed Worker、优雅停止、强制 telemetry sink、NO_AUTHORITY 进程入口和三态 SLO evaluator；定向 30/30、全 V2 130 pass / 0 fail / 4 explicit skip，隔离 PG16 真实重启恢复 1/1。状态：`LOCAL_ENGINEERING_AND_POSTGRES16_PASS / PRODUCTION_UNCHANGED`。
- [x] **M1.5-B0 Shadow Release Safety 本地出口**：已补齐显式 reader/writer `SET ROLE` 与会话身份核验、secret-file URL、完整 strict observation JSONL、固定 30 分钟/24 小时 SLO 档位、有限周期、专用非 root/read-only/no-Legacy-secret 镜像与 Compose 模板。定向 41/41、全 V2 136 pass / 0 fail / 4 explicit external-dependency skips、三项隔离 PG16 回归与完整 `ci:production` PASS；Legacy Consumer Map 保持 539。本机无 Docker CLI，真实 image build/Compose merge 仍未证明。Edge OrcaTerm 新鲜预检为 0 会话，生产零命令、零变更。
- [ ] **M1.5-B1 Reachable Egress + Bounded Early Shadow**：在可达 Docker runner 先构建精确 source image 并证明三家真实四分母，再经独立 Gate 运行 31 个一分钟 no-authority 周期。30 分钟 SLO PASS 只允许进入长期存储/持续观察，不等于 M1 完成。
- [x] **M1.6 Partitioned Fact Storage + Retention Governance 本地出口**：已建立专用 UTC 日分区、无 DEFAULT fail-closed 路由、有界活动身份注册表、旧账本新 Fact 禁写、容量水位、独立 Audit/Retention 身份、restore-verified DROP 与不可变事件。定向 5/5、隔离 PG16 1/1，真实 `pg_dump -> pg_restore` 后 replay parity PASS/deterministic true；迁移前旧 Fact 可读，2 个分区跨日读取，保留中/活跃 replay 均阻断清理，到期后原子删除 1 分区/2 Fact 且拒绝重灌；全 V2 141/0/5 explicit skips 与完整 `ci:production` PASS。状态：`LOCAL_ENGINEERING_AND_POSTGRES16_PASS / PRODUCTION_MIGRATION_NOT_RUN`。
- [ ] **M1.7 Sustained 24h Shadow/SLO**：等待 M1.5-B1 与 M1.6 同时通过后，以同一 release/config 连续运行至少 24 小时并满足固定 SLO、重启恢复、成本与容量门槛，才允许 M1 减数并向 M2 runtime 开放读取许可。
- [ ] **M2 发现与深验纵向切片**：先做 Pre-Move 和 Breakout/Retest，贯通 `DiscoveryCandidate -> CandidateEpisode + OpportunityThesis -> EvidencePackage`；稳定后再并行增加其余四个机会族。验证：Candidate 不带等级/计划，point-in-time replay 可复现，三分母、队列 SLA、冷启动和漂移成立。
- [x] **M2.0 发现合同与黄金样本（可并行本地）**：已冻结六族十四模式、Detector event/knowledge 双 cutoff 输入、Candidate/Episode/Thesis v2 生命周期、UTC 去重、三层运行漏斗和 19 个 point-in-time fixture。状态：`LOCAL_CONTRACT_PASS / M1_RUNTIME_BLOCKED / PRODUCTION_UNCHANGED`；Candidate 仍无等级/计划，fixture 无 Outcome/future material。
- [x] **M2.1 Pre-Move + Breakout/Retest DRAFT Replay Kernels（可并行本地）**：已建立三个 Pre-Move 与两个 Breakout/Retest 独立纯函数内核、显式多空/UNKNOWN、late/noise/fakeout veto、缺失诚实降级、确定性 digest 和注册身份防篡改。状态：`LOCAL_DRAFT_KERNEL_PASS / UNCALIBRATED / NO_CANDIDATE_EMISSION / M1_RUNTIME_BLOCKED`；合成样本不能把生命周期升级为 REPLAY_VALIDATED。
- [x] **M2.2-A Historical Replay Contract + Lifecycle Gate Harness（可并行本地）**：已冻结真实数据接纳、固定 Detector 分母、完整背景窗口、candidate/event/matched-non-event 三业务分母、purge/embargo、holdout group isolation、主 Bundle 与 sealed holdout 物理分离、target-blind 首次发现、knowledge-time lead、分层指标/CI 和四态 Gate。状态：`LOCAL_HARNESS_PASS / REAL_COHORT_MISSING / GATE_INSUFFICIENT / DETECTORS_DRAFT / NO_CANDIDATE_EMISSION`；test-only 合成 cohort 永远不能晋级。
- [ ] **M2.2-B Real Historical Cohort Acquisition + Freeze**：B0、B0.1 与 B0.2-A 已本地通过，B0.2-B 外部证据仍 blocked；任何子 Gate 不通过都不得用下载量或代码量冒充总包完成。
- [x] **M2.2-B0 Source Qualification + Acquisition Safety**：已建立人工权利审查、历史合约身份、knowledge-time、逐 Detector 数据覆盖、精确对象/checksum、工作区外路径、容量预算和单对象验证后强制删原始字节的 fail-closed Gate。真实 BTCUSDT 1m 月文件 1,838,455 bytes 与官方 SHA-256 一致；状态：`LOCAL_SOURCE_GATE_PASS / TECHNICAL_PILOT_PASS / BULK_BLOCKED / COHORT_BLOCKED / PRODUCTION_UNCHANGED`。
- [x] **M2.2-B0.1 Target-Blind Diagnostic Strength + Construction Policy Freeze**：已为五个 DRAFT Kernel 增加只读 relative-rule-margin strength，冻结固定 Detector 分母 Top20、TRAIN-only 六维事件阈值、matched control、300 秒完整背景、pre-cutoff regime/liquidity、observed/modeled knowledge-time、purge/embargo 和 1+4 trial registry，并把全部 id/digest 绑定到 dataset/experiment/holdout v2。定向 45/45 PASS；真实 cohort=0、Gate=INSUFFICIENT、Detector=DRAFT、Candidate 禁发、生产零变更。
- [x] **M2.2-B0.2-A Rights + Historical Instrument Evidence Gate**：已把外部人工、exact operator/双数据范围、条款 hash/bytes/留存、有效期、provider binding、identity epoch、状态区间、knowledge time、完整 point-in-time 分母和 unresolved 核算做成 fail-closed Gate。定向 35/35；五个来源候选均 `RESEARCH_ONLY`，这只证明错误证据过不了。
- [ ] **M2.2-B0.2-B Exact Source Rights + Capability Resolution**：由账户所有者或合格法律审查者绑定 exact source、账户、司法范围和有期限条款证据；来源还须逐字段证明完整历史分母、已退市、onboard/delist、contract/settlement/underlying/status interval 与 symbol reuse。该外部门通过前 B1 保持 blocked。
- [x] **M2.2-B0.2-C First-Party Forward Instrument Capture Local Engineering**：已在不读取 M1 authority、不写 Candidate 的独立 Research 边界内实现三 Venue exact raw bytes、完整/部分/失败分母、identity epoch、coverage gap、链式 checkpoint 和 append-only journal。定向 28/28 PASS；两轮本机真实请求均因 egress 失败，complete snapshot=0，因此只达到 `LOCAL_ENGINEERING_PASS`，运行捕获起点未通过，永久禁止冒充历史回填。
- [ ] **M2.2-B0.2-C1 Egress-Capable Forward Capture Start**：在可信可达网络运行同一 no-authority runner，取得至少两轮、跨度达到冻结 cadence、raw 可复核、active gap=0 且无 unresolved/conflict 的三 Venue 完整 Snapshot。失败 journal、单轮成功或部分分母均不得减数；不得顺带部署 M2 runtime 或修改生产 authority。
- [ ] **M2.2-B1 Immutable Raw Archive Acquisition**：仅按冻结精确对象清单批量下载，逐文件官方 checksum、断点续传、容量水位和 Git 外不可变索引；L2 不足的 Detector 保持 unsupported。
- [ ] **M2.2-B2 Cohort Construction**：只在 TRAIN 拟合标签阈值，生成 point-in-time observations、Event、Matched non-event 与 Candidate Universe 完整背景；同一冻结 Detector 分母逐窗口运行，任何缺失进入 unavailable 分母。
- [ ] **M2.2-B3 Split + Sealed Holdout Freeze**：冻结 train/validation、purge/embargo、symbol/regime assignment 和独立 holdout commitment；本包仍不得打开 holdout，也不得挑选表现最好的 trial。
- [ ] **M2.2-C Registered Replay + Sensitivity + Untouched Holdout**：先在 validation 执行全部预登记 sensitivity trial 并报告失败，再单次打开 holdout，输出 overall/family/detector/direction/regime/liquidity 指标、Top20 late/noise、失败案例和 sealed result；每个实际 stratum 都必须登记并逐层过线，数据或样本不足必须 INSUFFICIENT。
- [ ] **M2.2-D Independent Audit + Lifecycle Proposal**：独立复核来源权利、分母、future leak、trial completeness、custody ledger 和 Gate digest。只有 PASS 才可提出 REPLAY_VALIDATED；生命周期修改仍需独立 package，Candidate/runtime 仍封闭。
- [ ] **M3 唯一决策纵向切片**：完成 family-specific Analysis、Evidence/Setup 双评级、StrategyDraft、Execution Feasibility 唯一终审、Personal/Portfolio Risk。验证：只有 Final Decision 能产生 READY，false READY=0，结构与净 RR 均不低于 3，所有关键缺失 fail closed。
- [ ] **M4 单一读模型与专业工作台**：先建立 DecisionSnapshot 和站内 Alert，再重建 Inbox、Token Workbench、Review、System。验证：页面零 provider/decision 调用，同一 snapshot 在所有视图一致，E2E、a11y、visual、performance 和注意力预算通过。
- [ ] **M5 结果与研究治理**：从 M2 首个 Episode 起并行采集 Outcome，但只有冻结数据成熟后才评估；Research 与 Evaluation 物理分离。验证：future leak=0、Missed Movers/对照组完整、全部试验登记、Challenger 不能自批或自动晋级。
- [ ] **M6-M7 受控切换与实战准入**：严格按 replay -> no-write shadow -> isolated write -> dual read -> read authority -> single write -> rollback retention -> Legacy retirement；最后完成 60 天 Shadow、30 天模拟决策、安全、恢复和外部审计。验证：每次只切一个 authority，R4 评分与一票否决全部过线后才允许声明“人工实战决策辅助准入”。

## Critical Path

```text
M0 contracts
-> M1 truthful and retention-bounded data
-> M2 Pre-Move vertical slice
-> M3 strict final decision
-> M4 single read model
-> M6 controlled authority cutover
-> M7 practical-readiness gate
```

M5 的 Outcome 采集从 M2 开始并行，额外 Detector、UI fixture、Runtime/Security 可在合同冻结后并行；schema authority、production writer、holdout 验收、read cutover 和 Legacy 删除始终串行。

## Current Entry

```text
M0 engineering exit: LOCAL_PASS / PRODUCTION_UNCHANGED
Last completed package: V2-M2.2-B0.2-C First-Party Forward Instrument Capture Local Engineering
Current operational entry: V2-M2.2-B0.2-C1-EGRESS-CAPABLE-FORWARD-CAPTURE-START
Current blocked external entry: V2-M2.2-B0.2-B-EXACT-SOURCE-RIGHTS-AND-CAPABILITY-RESOLUTION
Pending external gate: V2-M1.5-B1-EGRESS-EARLY-SHADOW-GATE
Current status: M2.2_B0_B0.1_B0.2-A_B0.2-C_LOCAL_ENGINEERING_PASS / FORWARD_CAPTURE_START_BLOCKED_ON_EGRESS / RIGHTS_AND_HISTORICAL_IDENTITY_MACHINE_GATE_FROZEN / FIVE_SOURCE_CANDIDATES_RESEARCH_ONLY / BULK_AND_COHORT_BLOCKED_ON_EXTERNAL_RIGHTS_AND_QUALIFIED_HISTORICAL_SOURCE / M2.2_GATE_INSUFFICIENT / DETECTORS_STILL_DRAFT / M1.5-B1_AND_M1.7_PENDING / M1_NOT_COMPLETE / M2_RUNTIME_BLOCKED / PRODUCTION_UNCHANGED
```

M0 的减数只代表合同、运行时输入边界、Legacy 消费者地图和隔离门禁已经形成闭环；它不代表真实 Provider、全市场扫描、Detector、交易计划、页面或生产能力已经完成。

## Done When

- [ ] 系统能证明扫描了版本化目标范围，而不是只显示很多币。
- [ ] Pre-Move 的 recall、precision、lead time、late/noise 和注意力负担使用冻结分母报告。
- [ ] 每个 READY 都有后端完整计划、执行可行性、结构来源、成本后 RR 和风险视图。
- [ ] 生产只有一个事实与决策 authority，失败时诚实 partial/stale/unavailable。
- [ ] Outcome 只评价历史，Research 只提出新版本，任何规则晋级都需独立证据和人工批准。

## Progress Rule

每个包只报告 `NOT_STARTED / LOCAL_PASS / PUSHED / SHADOWING / PRODUCTION_PASS / BLOCKED`。只有该包出口 Gate 通过才减数；文档完成、代码存在、测试单层 PASS、已上传或观察中都不能单独减数。
