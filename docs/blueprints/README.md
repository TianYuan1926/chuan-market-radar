# Market Radar 权威蓝图目录

更新日期：2026-07-24

本目录只回答三件事：当前真实状态是什么、V2 应该怎样建设、哪些历史材料只能作参考。任何旧报告、旧周期身份或旧蓝图都不能绕过这里重新成为当前权威。

## 1. 当前唯一结论

```text
当前系统等级：R1 / 可运行但不完整 / 不能支撑实战
V2 设计状态：ACTIVE_DESIGN_AUTHORITY
V2 实现状态：M0_ENGINEERING_EXIT_LOCAL_PASS / M0.4_EXPANDED_SCOPE_DESIGN_PASS / M1.1A_REGISTRY_LOCAL_PASS / M1.1B_MULTI_ASSET_IDENTITY_LISTING_AND_EXACT_PROBE_LOCAL_IMPLEMENTATION_PASS_TEST_ONLY_CONFORMANCE_PASS / M1.1B0_R1_LIVE_0_OF_15_COMMON_RUNTIME_TRANSPORT_BLOCKED_R2_LIVE_14_OF_15_LISTING_GATE_BLOCKED_R3_LIVE_15_OF_15_ALL_GATES_PASS / M1.4A_ADAPTIVE_MULTI_ASSET_COLLECTOR_LOCAL_CONTRACT_AND_FULL_CI_PASS_NO_RUNTIME_AUTHORITY / M1.4B_LOCAL_ENGINEERING_AND_FULL_CI_PASS_LIVE_RUNTIME_UNPROVEN_15_LIVE_PROFILES_14_ROUTE_ELIGIBLE / SCOPE_EPOCH_V1_EVIDENCE_PRESERVED / M1.5-B1_EARLY_SHADOW_BUSINESS_GATE_PASS_V1_ONLY / M1.6-P0_EXECUTED_BLOCKED_CAPACITY_AND_RECOVERY / M1.6-P0R_CLEAN_PRE_STS_BASELINE_PASS_STS_AND_RECOVERY_PENDING / M2.2-B0.2-C1_FORWARD_ONLY_READY_V1_ONLY / M3.0-M3.3_LOCAL_CONTRACT_PASS_V1_ONLY_TEST_ONLY_UNCALIBRATED_NO_READY_AUTHORITY / PRODUCTION_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE_PASS / EXTERNAL_RIGHTS_AND_HISTORICAL_SOURCE_BLOCKED / BULK_AND_COHORT_BLOCKED / GATE_INSUFFICIENT / DETECTORS_DRAFT / M1_NOT_COMPLETE / M2_RUNTIME_BLOCKED
V2 生产权限：false
自动交易：永久禁止
最新生产存储门禁：P0_BLOCKED_CAPACITY_AND_RECOVERY / APPLICATION_HEALTH_NOT_EVALUATED
```

2026-07-21 M1.6-P0 已以 exact source 完成生产只读存储核验：PostgreSQL 16、V2 schema=`ABSENT_CLEAN`、旧/新 Fact=0、连接使用率 2%，数据库/服务/仓库 mutation 均为 0；但 120 GiB 系统盘按冻结模型预计使用率 90%，容量余量不足且 recovery evidence 缺失，因此准入结论是 `BLOCKED`。这不评价 `/api/health` 或生产业务 ready，不能扩写成全站健康或全站失败。

P0R 本地恢复、六小时无扩容容量和 fresh P0 组合准入工程已通过；真实 COS 已启用并回读 Object Lock=`COMPLIANCE` 31 天，age X25519 身份仅保存在 macOS Keychain。当前生产恢复入口已绑定 exact source `bed938566d242394de7f6c31b309bd9f8198b71f`、run `p0r-20260721t183927z-221b4eebbf2ab34191c63608771b21ea` 和 transport bundle `1adae1348bd983ba0eb003ba3521a1404faa4ed4a5559ab89b8a70cf473dac00`；旧 staging、16 个 `/dev/shm` 旧文件和诊断文件已精确清理，clean pre-STS baseline 通过。STS、生产对象、backup/retrieval/restore、fresh topology、exact-release 校准和 fresh P0 尚未发生，P1 继续关闭。M1.1B0 R3 已真实取得 15/15 exact endpoint conformance。M1.4B 本地核心现已完成 Profile、batch、两本请求预算和 Bybit/Bitget history checkpoint/gap 状态机，M1.1B 26/26、M1.4A 28/28、M1.4B 23/23、V2 Foundation 445 pass / 6 explicit skip、V2 Ops 125/125、M0、Next production build、Golden 16/16 与 security 全部 PASS；现场 runtime 仍未完成。15 个 live Profile 中当前只有 14 个 route eligible，`BINANCE_SPOT_CATALOG` 因 registry 仍为 `UNAVAILABLE` 保持阻断，必须修订 registry 并绑定新 digest 重跑 live conformance。Bitget Venue、Listing Lifecycle、股票 Asset Domain 与 Source Capability 独立核算；股票 tradable Fact 仍为 0。原三 Venue 加密证据的正式范围标识为 `SCOPE_EPOCH_V1_CRYPTO_3V`，M3.0-M3.3 只保留该范围效力，M3.4 草稿暂停等待 scope rebase。

固定生产派发通道的首个真实 signed dispatch 已在腾讯目标机完成 `publish -> pull -> verify -> launch -> package acceptance`，返回 `PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE`。生产应用 HEAD、clean worktree、11 个容器、health、Redis 和 timer 前后保持基线，两项 OrcaTerm 复发事故均已取得目标验收并关闭。该结果只证明普通无 secret 包的运输与独立启动地基，不提升任何 G0、M1 或交易能力状态，也不运输 P0R 临时凭证。

Legacy G0 的七个生产出口继续作为历史安全义务，但它们不是 V2 的建设步骤，也不能决定 V2 源码组织。蓝图重构没有减少、完成或跳过任何真实生产门槛。

## 2. 活跃权威

| 优先级 | 文档 | 唯一职责 |
| ---: | --- | --- |
| 1 | [V2 受控替换工程与运行蓝图 v1.35](./MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md) | 当前唯一产品、领域、工程、研究、运行与切换设计权威 |
| 2 | [V2 机器追踪矩阵 v1.40](./market-radar-v2-controlled-replacement-traceability.v1.json) | Scope Epoch、18 个 Module、5 维状态、硬门槛和 M0-M7 的机器合同 |
| 2A | [M0.4 扩展市场范围与 Scope Epoch 合同](../architecture/v2/M0_4_EXPANDED_MARKET_SCOPE_AND_SCOPE_EPOCH_CONTRACT_V1.md) | Bitget、上新/新币 watch、股票合约、T0-T3 数据策略和跨范围证据隔离 |
| 2B | [M0.4 交付报告](./V2_M0_4_EXPANDED_MARKET_SCOPE_AMENDMENT_DELIVERY_REPORT.md) | 设计变更、未实现边界、生产零变更和下一本地入口 |
| 2C | [M1.1A 四 Venue 来源能力登记合同](../architecture/v2/M1_1A_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY_V1.md) | 4 Venue + CoinGlass、33 类能力、165 行穷举矩阵和运行未证明边界 |
| 2D | [M1.1A 交付报告](./V2_M1_1A_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY_DELIVERY_REPORT.md) | 代码、官方资料修正、测试、生产零变更和 M1.1B 超级包入口 |
| 2E | [M1.1B 来源一致性、多资产身份与上新情报合同](../architecture/v2/M1_1B_EXACT_SOURCE_CONFORMANCE_MULTI_ASSET_IDENTITY_AND_LISTING_INTELLIGENCE_V1.md) | 15 个精确探针、Bitget、四 Venue 身份、股票防误判、epoch 和生命周期边界 |
| 2F | [M1.1B 交付报告](./V2_M1_1B_EXACT_SOURCE_CONFORMANCE_MULTI_ASSET_IDENTITY_AND_LISTING_INTELLIGENCE_DELIVERY_REPORT.md) | 四 Venue 身份、上新生命周期本地实现与 TEST_ONLY 边界；当前 live 尝试以 2H 为准 |
| 2G | [M1.1B0 腾讯实时来源一致性固定派发合同](../architecture/v2/M1_1B0_TENCENT_LIVE_SOURCE_CONFORMANCE_DISPATCH_CONTRACT_V1.md) | 15 项 live 分母、精确公告范围、无密钥运输、目标机 key 边界和生产零变更 Gate |
| 2H | [M1.1B0 固定派发包交付报告](./V2_M1_1B0_TENCENT_LIVE_SOURCE_CONFORMANCE_DISPATCH_PACKAGE_DELIVERY_REPORT.md) | 首次阻断、R1 0/15、R2 14/15、R3 15/15 全 Gate PASS、Bybit 有界窗口和生产零变更证据 |
| 2I | [M1.4A 自适应多资产采集调度合同](../architecture/v2/M1_4A_ADAPTIVE_MULTI_ASSET_COLLECTOR_CONTRACTS_V1.md) | Bitget、listing watch、股票独立域、T0-T3、live/rights/quota/checkpoint 和 no-authority 边界 |
| 2J | [M1.4A 交付报告](./V2_M1_4A_ADAPTIVE_MULTI_ASSET_COLLECTOR_CONTRACTS_DELIVERY_REPORT.md) | 28 项定向证据、400 标的分母、独立 clone 完整 CI 和生产零变更事实 |
| 2K | [M1.4B 端点批处理、Runtime Adapter 与上新历史合同](../architecture/v2/M1_4B_ENDPOINT_BATCHING_RUNTIME_ADAPTER_AND_LISTING_HISTORY_V1.md) | 15 live/14 route eligibility、两本请求预算、Bybit/Bitget 历史边界和四轴独立验收 |
| 2L | [M1.4B 本地交付报告](./V2_M1_4B_ENDPOINT_BATCHING_RUNTIME_ADAPTER_AND_LISTING_HISTORY_DELIVERY_REPORT.md) | 本地实现、定向回归、生产零变更、现场 runtime 与 listing checkpoint 未完成边界 |
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
| 20 | [M1.6 Partitioned Fact Storage V2 合同](../architecture/v2/M1_6_PARTITIONED_FACT_STORAGE_CONTRACT_V2.md) | 六小时分区、无扩容容量模型、最小权限、restore-verified retention 与生产未证明边界 |
| 21 | [M1.6 交付报告](./V2_M1_6_PARTITIONED_FACT_STORAGE_DELIVERY_REPORT.md) | 迁移兼容、PG16 跨分区、真实 dump/restore/replay 和清理审计证据 |
| 21A | [M1.6-P0R-D0 无扩容容量交付报告](./V2_M1_6_P0R_D0_NO_COST_CAPACITY_AND_SIX_HOUR_PARTITION_DELIVERY_REPORT.md) | 8 周期机器校准、六小时 v2 迁移、59%/67% 容量模型和外部门禁 |
| 21B | [M1.6 Fresh P0 容量准入合同](../architecture/v2/M1_6_FRESH_P0_CAPACITY_ADMISSION_CONTRACT_V1.md) | raw evidence 重建、旧门禁继承、三项容量替代和 60%/70% 双门槛 |
| 21C | [M1.6 Fresh P0 容量准入交付报告](./V2_M1_6_FRESH_P0_CAPACITY_ADMISSION_DELIVERY_REPORT.md) | 组合判定器、CLI、防篡改与完整 CI 证据，生产仍未执行 |
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
| 34 | [M2.2-B0.2-C 前向合约目录捕获合同](../architecture/v2/M2_2_B0_2_C_FIRST_PARTY_FORWARD_INSTRUMENT_CAPTURE_V1.md) | 三 Venue 原始字节、完整分母、身份 epoch、缺席语义、连续性 checkpoint 与运行起点双出口 |
| 35 | [M2.2-B0.2-C 交付报告](./V2_M2_2_B0_2_C_FIRST_PARTY_FORWARD_INSTRUMENT_CAPTURE_DELIVERY_REPORT.md) | 28 项定向证据、两轮真实失败捕获、出网阻断和生产零变更事实 |
| 36 | [M2.2-B0.2-C1 发布绑定前向捕获起点合同](../architecture/v2/M2_2_B0_2_C1_RELEASE_BOUND_FORWARD_CAPTURE_START_V1.md) | Unicode/out-of-scope 真值、exact release/config、完整 journal 和两轮运行出口 |
| 37 | [M2.2-B0.2-C1 交付报告](./V2_M2_2_B0_2_C1_RELEASE_BOUND_FORWARD_CAPTURE_START_DELIVERY_REPORT.md) | 34 项定向证据、两轮三 Venue COMPLETE、raw 全链复核和生产零变更事实 |
| 38 | [M0 开工基线报告](./V2_M0_FOUNDATION_START_DELIVERY_REPORT.md) | 干净分支、初始合同和 M0.0-M0.2 历史证据 |
| 39 | [M1.5-B1-A 可达 Docker Runner 交付报告](./V2_M1_5_B1_A_REACHABLE_DOCKER_RUNNER_PREFLIGHT_DELIVERY_REPORT.md) | exact image、三 Venue 四分母、技术 PASS、业务 SLO FAIL、清理和下一正确顺序 |
| 40 | [M1.5-B1-B0 Early Shadow Evidence 合同](../architecture/v2/M1_5_B1_B0_EARLY_SHADOW_EVIDENCE_CONTRACT_V1.md) | 原子 31 周期、不可拼接、独立业务 Gate、内容寻址证据与宿主精确恢复 |
| 41 | [M1.5-B1-B0 交付报告](./V2_M1_5_B1_B0_EARLY_SHADOW_EVIDENCE_DELIVERY_REPORT.md) | collection/freshness 分母、Runner 隔离、反夸大测试、完整门禁和 B1-B1 入口 |
| 42 | [M1.5-B1-B2 Mark Price 语义合同](../architecture/v2/M1_5_B1_B2_MARK_PRICE_SNAPSHOT_SEMANTICS_CONTRACT_V1.md) | 统一标记价格、六计数、schema 隔离、Runner 漂移修复与 B1-B3 门禁 |
| 43 | [M1.5-B1-B2 交付报告](./V2_M1_5_B1_B2_MARK_PRICE_SEMANTICS_REMEDIATION_DELIVERY_REPORT.md) | B1-B1 无效证据事实、语义整改、定向门禁与唯一复验入口 |
| 44 | [M1.5-B1-B3 交付报告](./V2_M1_5_B1_B3_MARK_PRICE_SAME_GATE_RETEST_DELIVERY_REPORT.md) | exact 31 周期业务 PASS、四项 100% 门槛、独立复算、宿主恢复与下一生产存储入口 |
| 45 | [M1.6-P0 生产只读预检交付报告](./V2_M1_6_P0_PRODUCTION_STORAGE_READ_ONLY_PREFLIGHT_DELIVERY_REPORT.md) | 只读 fact capture PASS、容量/恢复准入 BLOCKED、零生产 mutation 与证据索引 |
| 46 | [M1.6-P0R 容量与恢复整改合同](../architecture/v2/M1_6_P0R_CAPACITY_AND_RECOVERY_REMEDIATION_CONTRACT_V1.md) | 离机加密备份、隔离恢复、零付费容量架构证明和 P0 重跑边界 |
| 47 | [M1.6-P0 脱敏证据索引](./V2_M1_6_P0_PRODUCTION_STORAGE_EVIDENCE_INDEX.json) | report/database/host/bundle digest、容量事实、blocker 和零 mutation 边界 |
| 48 | [M1.6-P0R 本地恢复工程交付报告](./V2_M1_6_P0R_RECOVERY_ENGINEERING_DELIVERY_REPORT.md) | 同快照加密 backup、私有 COS、隔离 restore、失败注入、测试证据与生产未执行边界 |
| 49 | [M1.6-P0R 生产恢复运行手册](../runbooks/V2_M1_6_P0R_PRODUCTION_RECOVERY_RUNBOOK.md) | 离机密钥保管、临时凭证、staging、执行、清理、零付费容量证明和 fresh P0 的固定顺序 |
| 50 | [M1.6-P0R-B 云资源前置安全交付报告](./V2_M1_6_P0R_B_CLOUD_PREREQUISITE_SAFETY_DELIVERY_REPORT.md) | 单 AZ COS、运行级 STS、真实防覆盖合同、现场 inventory 与生产未执行边界 |
| 51 | [M1.6-P0R-B1 COS 空桶创建交付报告](./V2_M1_6_P0R_B1_COS_BUCKET_PROVISIONING_DELIVERY_REPORT.md) | 香港单 AZ 私有/versioned/SSE-COS 空桶、零对象核验与未完成安全动作边界 |
| 52 | [M1.6-P0R-B1B Object Lock 与 age vault 资格交付报告](./V2_M1_6_P0R_B1B_OBJECT_LOCK_AND_AGE_VAULT_QUALIFICATION_DELIVERY_REPORT.md) | 白名单缺口、未提交工单、Keychain 工具、41 项 P0R 门禁和生产未执行边界 |
| 53 | [M1.6-P0R-B1C Object Lock、age 与 transport 准备报告](./V2_M1_6_P0R_B1C_OBJECT_LOCK_AGE_AND_TRANSPORT_PREPARATION_DELIVERY_REPORT.md) | 31 天 COMPLIANCE、Keychain 身份、exact bundle、真实失败修复和 STS/恢复待执行边界 |
| 54 | [M3.0 Final Decision Authority 合同](../architecture/v2/M3_0_FINAL_DECISION_AUTHORITY_CONTRACT_V1.md) | upstream authority、lineage、Action State、READY parity、原因真值和 no-authority 边界 |
| 55 | [M3.0 交付报告](./V2_M3_0_FINAL_DECISION_AUTHORITY_CONTRACT_DELIVERY_REPORT.md) | 初始合同交付事实；当前回归已随 M3.3 扩至 22 项并增加 Strategy scope/level/RR 防伪 |
| 56 | [M3.1 六族 Analysis/Evidence 解释合同](../architecture/v2/M3_1_FAMILY_ANALYSIS_AND_EVIDENCE_INTERPRETATION_CONTRACT_V1.md) | 六族 long/short/失效、EvidenceItem 全核算、结构来源、AnalysisSnapshot v3 和无策略授权边界 |
| 57 | [M3.1 交付报告](./V2_M3_1_FAMILY_ANALYSIS_AND_EVIDENCE_INTERPRETATION_DELIVERY_REPORT.md) | M3.1 21 项、M3 合计 38 项、完整 CI、未校准与生产零变更证据 |
| 58 | [固定生产派发首单验收报告](./G0_PRODUCTION_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE_DELIVERY_REPORT.md) | 首个 signed dispatch、目标机验收、零漂移、失败保留和复发关闭证据 |
| 59 | [M3.2 Evidence/Setup Qualification 合同](../architecture/v2/M3_2_EVIDENCE_AND_SETUP_QUALIFICATION_CONTRACT_V1.md) | EvidencePackage v2、AnalysisSnapshot v3、双评级、校准防伪、abstain 和无决策授权边界 |
| 60 | [M3.2 交付报告](./V2_M3_2_EVIDENCE_AND_SETUP_QUALIFICATION_DELIVERY_REPORT.md) | M3 合计 57 项、全 V2/ops 回归、生产零变更与未完成事实 |
| 61 | [M3.3 Strategy Construction 合同](../architecture/v2/M3_3_STRATEGY_CONSTRUCTION_CONTRACT_V1.md) | 六族 long/short 模板、结构 stop/target、精确 RR、no-draft abstain 和无 READY 权限边界 |
| 62 | [M3.3 交付报告](./V2_M3_3_STRATEGY_CONSTRUCTION_DELIVERY_REPORT.md) | M3 合计 81 项、StrategyDraft v2、全 V2/ops 回归、生产零变更与未完成事实 |

只有第一份蓝图和第二份机器矩阵具有 V2 设计权威。Context 不能改写长期合同，蓝图也不能覆盖更晚的生产只读事实。

## 3. 权威解析顺序

同一事实出现冲突时，按以下顺序处理：

1. 与当前 release 身份对齐的新鲜生产只读证据。
2. 永久安全、事实、交易、无 future leak 和无自动交易红线。
3. V2 蓝图 v1.35 与机器追踪矩阵 v1.40。
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

M0.0-M0.3、M1.1-M1.6、M2.0-M2.2 已列本地包、C1、M3.0-M3.3 已通过各自工程、业务、运行起点或合同出口。B1-B1 永久 `INVALID_NOT_COUNTED`，B1-B3 已取得完整业务 PASS。M1.6-P0 因容量与 recovery evidence `BLOCKED`；Object Lock 31 天、age Keychain 身份、exact transport bundle 与 clean pre-STS baseline 已通过，STS、生产恢复、fresh topology/calibration/P0 仍待执行。历史来源仍 `RESEARCH_ONLY`，Gate=INSUFFICIENT、Detector=DRAFT；M3.3 只有 test-only 未校准且带 blocker 的 StrategyDraft，无 Feasibility/runtime/READY authority。当前生产执行入口是：

```text
V2-M1.6-P0R-C-STS-ENCRYPTED-BACKUP-EXACT-RETRIEVAL-AND-ISOLATED-RESTORE
```

P0R clean pre-STS baseline 已通过。下一步只签发与 frozen plan 完全一致的 7200 秒 STS，执行受限上传、真实加密离机备份、exact version retrieval、独立 PG16 restore parity 和 cleanup。随后刷新 production health/topology，在 exact clean release 重跑容量校准和 fresh P0；不得清缓存、缩短核心扫描分母或改阈值。只有新 P0 PASS 才能请求 P1，并严格按 `P1 schema -> P2 identities -> P3 partitions+dormant Worker -> P4 isolated-write Shadow -> M1.7 24h` 推进。固定通道只作为普通无 secret 包的默认运输层，不重复首单验收，也不替代 P0R `/dev/shm` 凭证边界或任一业务包自身 Gate。Scope V2 的 M1.4B 本地工程与完整 CI 已通过；下一证据包是腾讯隔离 no-authority runtime。只允许 live PASS 且 registry route eligible 的 capability 进入 batch。Bybit 必须形成真实 bootstrap/checkpoint/gap/incremental 证据，Bitget 只能声明官方一个月窗口，Binance spot 必须修订 registry 后用新 digest 重跑 live conformance。四条新增责任链不能互相借 PASS。外部门 `V2-M2.2-B0.2-B-EXACT-SOURCE-RIGHTS-AND-CAPABILITY-RESOLUTION` 仍需人工来源权利和合格历史身份；M1.7 前不得让 M2/M3 runtime 写 Candidate、接页面或生成真实等级/计划。

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
