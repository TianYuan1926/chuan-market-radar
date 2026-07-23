# Market Radar V2 正确搭建顺序

## Goal

在不继承 Legacy 错误权威关系的前提下，先建立可信数据地基，再依次完成发现、验证、决策、工作台、学习、切换和实战准入。工程完成与时间证据分开计算，任何页面、提交或单次命中都不能冒充能力完成。

## Tasks

- [x] **M0.0 干净开工基线**：从最新 `origin/main` 建立独立 V2 实施分支，记录设计来源、排除的旧 G0 祖先、生产只读状态和永久禁区。验证：实施分支相对 `origin/main` 仅含已审查 V2 提交，生产仍为零变更。
- [x] **M0.1-M0.3 宪法、合同与隔离骨架**：冻结产品术语、18 个 Module、五维状态、四类不确定性、爆发行情标签、Legacy Capability Atlas、`src/v2` import fence、30 个权威产物 runtime schema 和第一条 M1 fixture。验证：V2 38/38、M0 十项机器出口与完整 `ci:production` PASS；Legacy 与 V2 零运行时互引，Legacy 539 个源文件已建立消费者地图，旧代码零删除，生产零变更。
- [ ] **M1 数据真值纵向切片**：按 `Universe -> Fact + Quality -> Point-in-Time Feature -> Market Context -> Runtime Truth` 建设，先贯通一个标的和三家 Venue，再扩大到全部 eligible instrument。验证：100% instrument accounting、无假 0、实时/回放同源、lineage 可追溯、故障诚实降级。
- [x] **M1.1 三 Venue Identity + Fact 本地纵切**：实现固定 HTTPS/GET Transport、Binance/OKX/Bybit catalog/price Adapter、完整 instrument accounting、不可变 Fact/Quality、分页/冲突/缺失/429/transport/duplicate/out-of-order/gap/stale/recovery 门禁。原 `LAST_PRICE` 已在 B1-B2 被 `MARK_PRICE / MARK_PRICE_SNAPSHOT` 替代。状态：`LOCAL_PASS_FROZEN_PROVIDER_CONTRACT / LIVE_CONNECTIVITY_UNPROVEN / PRODUCTION_UNCHANGED`。
- [x] **M1.2 Point-in-Time Feature + Context 纯函数纵切**：已实现三 Venue 同一 underlying 的精确价格分散度、带独立 ONLINE/REPLAY run 证据的 FeatureQuality，以及只在证据充分时识别价格碎片化的最小非方向性 Market Context。状态：`LOCAL_PASS_84_OF_84_V2 / PRODUCTION_UNCHANGED`；不能访问 cutoff 后数据，不输出 Candidate、方向或交易计划。
- [x] **M1.3 Fact Store + Replay + Runtime Truth**：已在隔离 PostgreSQL 16 演练 append-only artifact ledger、原子 Universe/Fact/Quality 分母、幂等冲突、retention metadata、双 cutoff replay manifest、五类 NOLOGIN capability role、完整 payload 篡改检测、两次 durable replay 和五维 Runtime Truth。状态：`LOCAL_POSTGRES16_REHEARSAL_PASS / PRODUCTION_UNCHANGED`；没有 production migration、live ingestion 或 authority。
- [x] **M1.4 全 eligible Universe + Collector Runtime 本地纵切**：已从 BTC 三 Venue fixture 扩大到 21 observed / 15 eligible 的多标的版本化范围，完成启动全量、增量 mark-price、周期 reconciliation、配额/并发/背压、冷启动、目录 tombstone、恢复、strict telemetry 和真实 PG16 原子落库。状态：`LOCAL_POSTGRES16_REHEARSAL_PASS / LIVE_MARKET_UNPROVEN / PRODUCTION_UNCHANGED`。
- [x] **M1.5-A Durable Worker 本地出口**：已完成独立 additive checkpoint migration、artifact 引用约束、config/sequence/content digest、精确 release 恢复、固定节拍 skip-missed Worker、优雅停止、强制 telemetry sink、NO_AUTHORITY 进程入口和三态 SLO evaluator；定向 30/30、全 V2 130 pass / 0 fail / 4 explicit skip，隔离 PG16 真实重启恢复 1/1。状态：`LOCAL_ENGINEERING_AND_POSTGRES16_PASS / PRODUCTION_UNCHANGED`。
- [x] **M1.5-B0 Shadow Release Safety 本地出口**：已补齐显式 reader/writer `SET ROLE` 与会话身份核验、secret-file URL、完整 strict observation JSONL、固定 30 分钟/24 小时 SLO 档位、有限周期、专用非 root/read-only/no-Legacy-secret 镜像与 Compose 模板。定向 41/41、全 V2 136 pass / 0 fail / 4 explicit external-dependency skips、三项隔离 PG16 回归与完整 `ci:production` PASS；Legacy Consumer Map 保持 539。B1-A 随后补齐真实 image build、三 Venue egress 和隔离 Docker Runner 证明。
- [x] **M1.5-B1-A Reachable Docker Runner 技术预检**：在腾讯生产宿主机的隔离 no-authority Runner 上，以 exact source commit `97f10e75ce296b07d933e9c362c40ba2be0997ea` 构建并运行专用镜像。两周期均完成 1,444/1,444 eligible/collected、三 Venue 无 provider failure、checkpoint/persistence `INSERTED`、完整清理并精确恢复宿主机 11 容器/4 network/5 volume 基线。技术结论 `PASS_REACHABLE_DOCKER_RUNNER`；业务结论必须保留为 `FAIL`：READY 0/2，fresh 1,441/1,444 后降至 1,274/1,444，出现 stale/duplicate 与 60 秒调度缺口。该 PASS 只证明 Runner 可用，不证明 Market Fact SLO。
- [x] **M1.5-B1-B Bounded Early Shadow 业务门禁**：B1-B3 绑定 exact commit `33f08d3fb72912a2617ed3a21f58cb4c347aefcb` 完成同一进程 31 周期、至少 30 分钟证据。31/31 READY，collection/price-usability/fresh/operational-ready ratio 均为 1，provider failure 与 missed start 均为 0；Runner evidence `sha256:58b5d118503def8287642b78e12eb895a26130ac0ecb12b52bbf06e82ce51860` 已独立复算，宿主精确恢复。状态：`PASS_EARLY_SHADOW_BUSINESS_GATE / M1.5-B1_COMPLETE`。
- [x] **M1.5-B1-B0 31 周期证据合同与原子 Runner**：已实现内容寻址 observation/domain/runner evidence、完整 `M1CollectorWorkerCycle` JSONL、每 Venue 与 aggregate 分母、资源/调度/checkpoint 指标、exact release/image/config、无生产 authority、固定 31 周期与宿主机精确恢复。中断或短包必须清理后从第 1 周期重跑，严禁拼接。M1 专用 68/68、全 V2 274/0/5 explicit skip、ops 31/31 与完整 `ci:production` PASS；状态：`LOCAL_ENGINEERING_PASS / BUSINESS_SLO_UNPROVEN / PRODUCTION_UNCHANGED`。
- [ ] **M1.5-B1-B1 31 周期原始实测**：exact commit `3908f9f5d0066849311e9d3ac875cc6a76acc69e` 的 Worker 实际运行完 31 周期，但 Runner/validator 的 reconciliation 合同漂移导致 sanitized evidence 构建失败，原始字节已按合同删除。宿主精确恢复、两份失败报告 digest 可复核；状态必须为 `EXECUTION_INVALID_NOT_COUNTED`，不得给业务 PASS/FAIL。
- [x] **M1.5-B1-B2 Mark Price Snapshot 语义整改**：三 Venue 从混合 `LAST_PRICE` 切换为统一 `MARK_PRICE / MARK_PRICE_SNAPSHOT`；新增 `usablePriceCount` 和 price-usability SLO，保留 duplicate/stale/out-of-order fail-closed，升级全部运行/证据 schema，并让 Runner/validator 共用唯一 environment 合同。状态：`LOCAL_ENGINEERING_EXIT_PASS / PRODUCTION_UNCHANGED`。
- [x] **M1.5-B1-B3 固定门槛复验**：exact source/image/config 从第 1 周期运行 31 周期；minimum collected/usable/fresh 均为 1,444/1,444，观察 1,805,547 ms，p95 cycle 5,997 ms，max schedule lag 45 ms。Domain/Runner/31 行 observation/32 行 process output 均内容寻址，永久副本复算一致；生产服务、数据和 authority 零变更。
- [x] **M1.6 Partitioned Fact Storage + Retention Governance 本地出口**：v1 历史迁移保持 checksum 不变，新增 additive v2 六小时 UTC 分区、无 DEFAULT fail-closed 路由、小时级 cutoff、有界活动身份、restore-verified DROP 与不可变事件。定向 7/7、ops 103/103、隔离 PG16 1/1；真实 `pg_dump -> pg_restore` 后 replay parity PASS/deterministic true，8 个连续分区覆盖 48 小时，旧日分区非空时拒绝升级，保留中/活跃 replay 阻断清理，到期后原子删除 1 分区/2 Fact 且拒绝重灌。状态：`SIX_HOUR_LOCAL_ENGINEERING_AND_POSTGRES16_PASS / PRODUCTION_MIGRATION_NOT_RUN`。
- [ ] **M1.6-P Production Storage 分阶段启用**：B1-B 已通过，当前开始分阶段启用；每步独立 checksum、备份/恢复、回滚和生产验证，不与业务逻辑整改混发。
- [x] **M1.6-P0 新鲜只读预检合同与现场证明**：exact source `d5dbc804be00c546624ab933bad6282228f983c4` 已完成 22 项定向、54 项 ops、完整 `ci:production` 和生产只读执行。Fact capture=`PASS`，admission=`BLOCKED`：V2 schema=`ABSENT_CLEAN`、旧/新 Fact=0、数据库/服务/仓库 mutation=0，但当前 120 GiB 系统盘按冻结模型预计使用率 90%，可用 70.02 GB 小于所需 87.09 GB，且无合格 recovery evidence。状态：`EXECUTED_BLOCKED_NOT_READY_FOR_P1`。
- [ ] **M1.6-P0R Capacity + Recovery Remediation**：P0R-D0 本地无扩容机器证明已通过：clean commit `15746813245744af4f4ba73f61a976b722ad9a21` 在隔离 PG16 完成 8 周期/11,552 Fact，最大周期 33,660 ms；按 1,805 Facts/分钟、30h retention、6h partition、1h sweep、1.5 倍字节成本和固定 reserve，稳态/峰值根盘预计 59%/67%，满足固定 60%/70% 双门槛。fresh P0 组合准入也已本地实现，继承全部非容量 blocker。腾讯 COS 已回读 Object Lock=`COMPLIANCE` 31 天，真实 age 身份已在 macOS Keychain 读回验证；当前 exact source `bed938566d242394de7f6c31b309bd9f8198b71f`、run `p0r-20260721t183927z-221b4eebbf2ab34191c63608771b21ea` 和无 secret bundle `1adae1348bd983ba0eb003ba3521a1404faa4ed4a5559ab89b8a70cf473dac00` 已完成 clean pre-STS baseline。STS、对象、backup/retrieval/restore 未执行；旧 topology 仍过期。固定剩余顺序为 `7200 秒 exact-plan STS -> 受限上传 -> 同快照加密 backup / exact retrieval / 独立 PG16 restore / cleanup -> fresh health + topology -> exact-release calibration -> fresh P0 composition admission`。当前状态：`CLEAN_PRE_STS_BASELINE_PASS / STS_AND_RECOVERY_PENDING / PRODUCTION_P0_BLOCKED`。
- [ ] **M1.6-P1 Add Schema**：仅在 fresh P0 PASS 和独立 migration 授权后，事务性依次应用 v1 `sha256:9a507139b88efa86a5bb5d4593149881a4e8fad8081f27e5a7ada791c8ac7303` 与 v2 `sha256:17cf407811a3f3518cfd7bf15312dda771e0709d8eb23a62b8bcc56f7c14b68e`；首次 v2 发现任何非空 v1 日分区必须失败。禁止 backfill、身份切换、Worker 启动和其他服务变更。
- [ ] **M1.6-P2 最小权限身份与会话证明**：独立创建/绑定 migration、writer、reader、replay、audit、retention 权限，验证越权拒绝；不启动 Worker。
- [ ] **M1.6-P3 分区与 dormant no-authority Worker**：按容量门槛预建有界 UTC 六小时分区，部署 dormant Worker，默认不写入；只做身份、镜像、配置、rollback 和 absence 证明。
- [ ] **M1.6-P4 有界 isolated-write Shadow**：使用冻结 release 打开受限写入，验证分区路由、恢复、容量/WAL、读回 parity 和回滚；PASS 后才进入 M1.7。
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
- [x] **M2.2-B0.2-C First-Party Forward Instrument Capture Local Engineering**：已在不读取 M1 authority、不写 Candidate 的独立 Research 边界内实现三 Venue exact raw bytes、完整/部分/失败分母、identity epoch、coverage gap、链式 checkpoint 和 append-only journal；后续 C1 把所有 artifact 升级为 exact release/config 绑定并验证完整 journal 历史链。
- [x] **M2.2-B0.2-C1 Egress-Capable Forward Capture Start**：release `4139cc631d3d760876c3e39404c494462541a910` 连续取得两轮三 Venue COMPLETE；每家 2/2 完整、跨度约 368.5 秒、raw 全链复核、active gap/unresolved/conflict/blocker=0，均为 `FORWARD_ONLY_READY`。状态：`OPERATIONAL_CAPTURE_START_PASS / FORWARD_ONLY / PRODUCTION_UNCHANGED`；永久禁止冒充历史回填、长期 SLO 或 Detector 能力。
- [ ] **M2.2-B1 Immutable Raw Archive Acquisition**：仅按冻结精确对象清单批量下载，逐文件官方 checksum、断点续传、容量水位和 Git 外不可变索引；L2 不足的 Detector 保持 unsupported。
- [ ] **M2.2-B2 Cohort Construction**：只在 TRAIN 拟合标签阈值，生成 point-in-time observations、Event、Matched non-event 与 Candidate Universe 完整背景；同一冻结 Detector 分母逐窗口运行，任何缺失进入 unavailable 分母。
- [ ] **M2.2-B3 Split + Sealed Holdout Freeze**：冻结 train/validation、purge/embargo、symbol/regime assignment 和独立 holdout commitment；本包仍不得打开 holdout，也不得挑选表现最好的 trial。
- [ ] **M2.2-C Registered Replay + Sensitivity + Untouched Holdout**：先在 validation 执行全部预登记 sensitivity trial 并报告失败，再单次打开 holdout，输出 overall/family/detector/direction/regime/liquidity 指标、Top20 late/noise、失败案例和 sealed result；每个实际 stratum 都必须登记并逐层过线，数据或样本不足必须 INSUFFICIENT。
- [ ] **M2.2-D Independent Audit + Lifecycle Proposal**：独立复核来源权利、分母、future leak、trial completeness、custody ledger 和 Gate digest。只有 PASS 才可提出 REPLAY_VALIDATED；生命周期修改仍需独立 package，Candidate/runtime 仍封闭。
- [ ] **M3 唯一决策纵向切片**：完成 family-specific Analysis、Evidence/Setup 双评级、StrategyDraft、Execution Feasibility 唯一终审、Personal/Portfolio Risk。验证：只有 Final Decision 能产生 READY，false READY=0，结构与净 RR 均不低于 3，所有关键缺失 fail closed。
- [x] **M3.0 Final Decision Authority Contract（可并行本地）**：已冻结 upstream authority、same-release/id/time lineage、Evidence/Setup 独立状态、Draft/Feasibility/Trigger/Runtime Gate、Action State 优先级、READY plan parity 和派生原因完整性。M3.2 后回归扩至 18/18，未校准 Analysis/Qualification、校准 abstain 或丢失反证均不得进入有权决策。状态：`LOCAL_CONTRACT_PASS / TEST_ONLY_NO_PRODUCTION_AUTHORITY / M1_P0R_PENDING / M2_DETECTORS_DRAFT`。
- [x] **M3.1 Family Analysis + Evidence Interpretation（可并行本地）**：六族分别覆盖 long、short、失效/unavailable；EvidenceItem 必须恰好解释一次，反证不得丢失，Market Context 和结构位绑定 exact lineage，缺失/stale/冲突/未来读/标签漂白/Fib-only 均 fail closed 或降为 UNKNOWN。M3.2 后 `AnalysisSnapshot v3` 增加显式 `spaceQuality`。状态：`LOCAL_CONTRACT_PASS / TEST_ONLY_UNCALIBRATED / NO_STRATEGY_AUTHORITY / PRODUCTION_UNCHANGED`。
- [x] **M3.2 Evidence + Setup Qualification（可并行本地）**：清除 EvidencePackage 上游 `tier`，以 v2 criticality/independence lineage 独立形成 Evidence Grade；Setup Grade 独立评价结构、位置、空间、时机、fakeout/noise、regime 和 uncertainty。真实 calibration contract 必须绑定 cohort、untouched holdout、至少 60 样本、至少 3 个 regime、CI 与 reliability error；当前 builder 永远 test-only uncalibrated，不生成概率或决策。M3.2 18/18、M3.1 21/21、M3.0 18/18，M3 合计 57/57；全 V2 336 pass / 0 fail / 6 explicit skip，ops 115/115。状态：`LOCAL_CONTRACT_PASS / NO_STRATEGY_OR_READY_AUTHORITY / PRODUCTION_UNCHANGED`。
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

## Execution Lanes

### 串行生产地基线

```text
M1.5-B1 PASS
-> M1.6-P0 fresh read-only preflight
-> M1.6-P0R encrypted off-host backup + isolated restore + no-cost capacity proof
-> M1.6-P0 fresh rerun PASS
-> M1.6-P1 additive schema
-> M1.6-P2 least-privilege identities
-> M1.6-P3 partitions + dormant worker
-> M1.6-P4 bounded isolated-write shadow
-> M1.7 same-release 24h SLO/capacity/recovery
-> M1 engineering exit
```

该线一次只改变一个生产权威；migration、writer、read authority 和长期观察不能合包冒充完成。

### 并行本地工程线

```text
M2.2-B0.2-B external rights/source resolution
+ M2 historical acquisition tooling without bulk execution
+ M3 analysis/strategy strict contracts on frozen fixtures
+ M4 DecisionSnapshot/workbench contracts without production data
+ Runtime/Security/Release Control tests
```

并行线只能生成合同、测试、fixture 和无 authority 工具，不得读取 M1 production authority、发 Candidate、生成 READY/交易计划或提前接页面。长观察期间可继续本地工程，但观察 release/config 必须冻结。

## Current Entry

```text
M0 engineering exit: LOCAL_PASS / PRODUCTION_UNCHANGED
Last completed local package: V2-M3.2-EVIDENCE-AND-SETUP-QUALIFICATION-CONTRACT
Next local package: V2-M3.3-STRATEGY-CONSTRUCTION-CONTRACT
Last production gate execution: V2-M1.6-P0-PRODUCTION-STORAGE-READ-ONLY-PREFLIGHT = BLOCKED
Current execution entry: V2-M1.6-P0R-C-STS-ENCRYPTED-BACKUP-EXACT-RETRIEVAL-AND-ISOLATED-RESTORE; Object Lock 31d, age Keychain identity and exact transport bundle are complete
Current blocked external entry: V2-M2.2-B0.2-B-EXACT-SOURCE-RIGHTS-AND-CAPABILITY-RESOLUTION
Completed bounded shadow gate: V2-M1.5-B1-B-PASS_EARLY_SHADOW_BUSINESS_GATE
Current status: M1.5-B1_COMPLETE / B1-B1_EXECUTION_INVALID_NOT_COUNTED / B1-B3_PASS / M1.6-P0_EXECUTED_BLOCKED_CAPACITY_AND_RECOVERY / M1.6-P0R_CLEAN_PRE_STS_BASELINE_PASS_STS_AND_RECOVERY_PENDING / M3.0-M3.2_LOCAL_CONTRACT_PASS_TEST_ONLY_UNCALIBRATED_NO_STRATEGY_OR_READY_AUTHORITY / M1_NOT_COMPLETE / M2_RUNTIME_BLOCKED / PRODUCTION_SERVICES_DATA_AND_AUTHORITY_UNCHANGED
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
