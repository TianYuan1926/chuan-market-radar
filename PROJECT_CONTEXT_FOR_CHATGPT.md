# Market Radar 项目当前上下文
更新日期：2026-07-23
用途：让 Codex、ChatGPT 和外部审计员在几分钟内获得当前真实状态、唯一蓝图、风险和下一入口。本文件只保存当前事实，不保存施工流水账，不包含 secret。
## 1. 项目一句话定义
Market Radar 是以加密合约为首要核心、并扩展到股票永续的多资产人工决策雷达：持续覆盖目标 CEX 的合格合约和上市生命周期，尽可能提前发现主升/主跌前兆，同时识别其他高赔率结构机会，经过深度验证后给出严格计划，并用真实结果持续改进。
它不是行情展示站、涨跌榜、喊单器或自动交易系统。
## 2. 唯一核心目标

```text
快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。
```
优先顺序：

1. 首要能力是爆发前尽可能早地发现异常。
2. 同时覆盖突破回踩、趋势延续、关键位反转、区间边缘、相对强弱和衍生品资金流等机会。
3. 发现要宽，深度验证和 READY 必须严。
4. 系统只辅助人工决策，永久不自动下单。
用户是高杠杆、小仓位风格，但杠杆只进入风险情景，不能放大信号等级、RR 或 READY 数量。
## 3. 核心链路
业务语言保持七段：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

V2 工程链路细化为：

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

Runtime / Security / Release Control 贯穿全链。

## 4. 当前权威

当前唯一设计权威：

- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`，内容版本 v1.26。
- `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json`，机器合同 v1.30。
- `docs/blueprints/README.md`，权威解析入口。
- `market-radar-v2-build-sequence.md`，当前正确施工依赖与减数规则。

状态：

```text
ACTIVE_DESIGN_AUTHORITY
M0_ENGINEERING_EXIT_LOCAL_PASS / M0.4_EXPANDED_SCOPE_DESIGN_PASS / M1.1A_CAPABILITY_REGISTRY_LOCAL_PASS_OFFICIAL_DOCS_REVIEWED_SCOPE_V2_ADAPTERS_AND_LIVE_UNPROVEN / SCOPE_EPOCH_V1_EVIDENCE_PRESERVED
M1.1_IDENTITY_FACT_LOCAL_PASS
M1.2_FEATURE_CONTEXT_LOCAL_PASS
M1.3_STORE_REPLAY_RUNTIME_TRUTH_LOCAL_PASS
M1.4_FULL_UNIVERSE_COLLECTOR_LOCAL_POSTGRES16_PASS
M1.5A_DURABLE_WORKER_CHECKPOINT_SLO_LOCAL_POSTGRES16_PASS
M1.5B0_SHADOW_RELEASE_SAFETY_LOCAL_PASS
M1.5B1A_REACHABLE_DOCKER_RUNNER_TECHNICAL_PASS
M1.5B1A_BUSINESS_READINESS_AND_SLO_FAIL
M1.5B1B0_EARLY_SHADOW_EVIDENCE_CONTRACT_LOCAL_PASS
M1.5B1B1_EXECUTION_INVALID_NOT_COUNTED
M1.5B1B2_MARK_PRICE_SEMANTICS_LOCAL_ENGINEERING_EXIT_PASS
M1.5B1B3_EARLY_SHADOW_BUSINESS_GATE_PASS
M1.5B1_COMPLETE
M1.6_PARTITIONED_FACT_STORAGE_LOCAL_POSTGRES16_PASS
M1.6P0_PRODUCTION_STORAGE_READ_ONLY_PREFLIGHT_EXECUTED_BLOCKED
M1.6P0R_CLEAN_PRE_STS_BASELINE_PASS_STS_AND_RECOVERY_PENDING
M1.6_FRESH_P0_CAPACITY_ADMISSION_LOCAL_ENGINEERING_PASS_PRODUCTION_EVIDENCE_PENDING
M2.0_DISCOVERY_CONTRACTS_LOCAL_PASS
M2.1_DRAFT_REPLAY_KERNELS_LOCAL_PASS
M2.2A_HISTORICAL_REPLAY_GATE_HARNESS_LOCAL_PASS
M2.2B0_HISTORICAL_SOURCE_GATE_AND_TECHNICAL_PILOT_LOCAL_PASS
M2.2B0.1_TARGET_BLIND_STRENGTH_AND_CONSTRUCTION_POLICY_LOCAL_PASS
M2.2B0.2A_RIGHTS_AND_HISTORICAL_IDENTITY_MACHINE_GATE_LOCAL_PASS
M2.2B0.2C_FORWARD_INSTRUMENT_CAPTURE_LOCAL_ENGINEERING_PASS
M2.2B0.2C1_FORWARD_CAPTURE_START_PASS
forwardInstrumentContinuity=FORWARD_ONLY_READY
M3.0_M3.1_M3.2_M3.3_LOCAL_CONTRACT_PASS_TEST_ONLY_UNCALIBRATED_NO_READY_AUTHORITY
M2.2_REAL_COHORT_GATE_INSUFFICIENT
detectorLifecycle=DRAFT
candidateEmissionAllowed=false
liveIngestionProven=false
localV2ImplementationAuthorized=true
productionMutationAuthorized=false
automaticTradingAllowed=false
```

旧工程蓝图、运行蓝图、G0-G8 自动蓝图、V3 readiness 和旧机器矩阵只作 Legacy 安全、恢复、阈值与历史参考，不具有 V2 当前实施权威。

## 5. 当前技术架构

### 5.1 Legacy 运行架构

- Next.js App Router + TypeScript，Web 和 API 同仓。
- Docker Compose 单机部署，Caddy 对外，PostgreSQL 16 为持久化数据库，Redis 7 保存短生命周期运行状态。
- Node worker 执行扫描、WebSocket 轻扫、CoinGlass 深扫、结果处理、宏观数据和 Shadow 任务。
- 当前生产主线记录为腾讯云香港单机；Vercel/Neon 属于旧路线或兼容代码，不是当前建议主线。
- 数据路径包含公共 CEX、CoinGlass、PostgreSQL、Redis 和内部 API 合同。

### 5.2 已确认的 Legacy 架构债务

- `src/lib/api/frontend-contract.ts` 当前约 5,720 行，读模型、格式转换和部分决策调用边界过宽。
- Analysis、旧 Strategy、V2/V3/Unified Decision 和多套 Candidate/Outcome 路径并存。
- 页面/SSR、provider、worker 和 API 之间曾形成多条数据路径，单一 authority 不完整。
- 持久化层允许数据库缺失时回退内存；生产必须 fail closed 的对象尚未完全隔离。
- Web 和多个 worker 共享过宽 env/secret/数据库能力，镜像职责没有完全最小化。
- health、HTTP 成功、业务 ready、数据 fresh 和 release valid 的语义仍需彻底拆开。

因此采用受控替换，不继续把新核心功能堆入 Legacy。

### 5.3 V2 当前本地架构

- 实施分支 `codex/market-radar-v2-implementation` 从 `origin/main@e5eb9002` 直接分叉，不继承旧 G0 的 70 个中间提交。
- `src/v2/` 已建立物理隔离，架构测试禁止 V2 读取 Legacy，也禁止 Legacy 在切换前读取 V2。
- 已冻结 18 Module、五维状态、四类不确定性、核心对象 TypeScript 合同、唯一 READY 联合类型与 RR validator。
- 已建立爆发行情/提前发现评价合同、数据许可/成本/回放基线、Capability 级 Legacy Atlas 和第一条 M1 test-only fixture。
- 30 个唯一权威产物各有一个 strict Zod runtime schema；29 个 envelope 产物锁定精确 schema version，`UserFit` 为严格标量枚举。跨 API、进程、存储和回放的 decoder 对未知字段、版本漂移、错误状态、时间倒流、恶意对象、过大载荷和不完整 READY fail closed。
- Legacy Consumer Map 已覆盖 22 个 capability、539 个源文件、273 条直接运行消费者边、118 条测试消费者边、109 个运行入口、13 个提取候选和 21 个存储对象；Legacy 删除权限仍为 false。
- M0 十项机器出口与 `ci:production` 已通过。这些是本地工程地基，不是市场运行能力。
- M1.1 已建立 `SCOPE_EPOCH_V1_CRYPTO_3V` 的独立 GET-only/HTTPS allowlist Transport、Binance/OKX/Bybit catalog 与 mark-price Adapter、100% observed accounting、稳定 canonical identity、Point-in-Time `MARK_PRICE / MARK_PRICE_SNAPSHOT`、FactQuality 和 duplicate/out-of-order/gap/stale/recovery 门禁。M1.1A 已把 Binance/OKX/Bybit/Bitget + CoinGlass Hobbyist 按 33 类能力形成 165 行穷举登记，官方文档行 110、unavailable/unlicensed 57、Scope V2 runtime PASS=0；最新官方资料确认四 Venue 均有股票永续产品，但 Bitget、股票、上新 Adapter/live 仍未实现。下一本地超级包是 M1.1B0 exact conformance + M1.1B1 identity/listing。
- M1.2 已实现 `UNDERLYING_GROUP` 级跨三 Venue `MARK_PRICE` 分散 Feature、精确十进制计算、同 cutoff/future-read 门禁、独立 ONLINE/REPLAY run 和语义哈希证据，以及最小非方向性 Market Context。低分散不会被包装成健康流动性，regime/volatility/breadth/correlation/方向不凭空生成。
- M1.3 已建立无 memory fallback 的 PostgreSQL artifact store、Universe/Fact/FactQuality 原子事务、完整 payload digest、严格幂等冲突、event/knowledge 双 cutoff Manifest、五类 NOLOGIN capability role、两次 durable replay 和固定 profile 的 Runtime Truth v2。隔离 PG16 真实演练 1/1 PASS：8 artifact、权限、append-only、污染检测、parity 和 deterministic replay 均通过；结果保持 `REHEARSAL/PARTIAL`。
- M1.4 已建立 21 observed / 15 eligible 的三 Venue 多标的 fixture、完整/增量 reconciliation、目录 tombstone、provider quota、global/per-provider concurrency、有限队列、冷启动、数据库失败和恢复状态机。Collector strict telemetry 分开报告 providerObserved/accounted/eligible/collected/fresh；真实 PG16 已证明启动、增量和全 catalog 故障的原子持久化，生产 import 仍只能通过 Adapter。
- M1.5-A 已建立独立 additive checkpoint migration、artifact 引用与 digest 防线、精确 release/config/sequence/schedule 恢复、固定节拍 skip-missed Worker、优雅停止、强制 telemetry sink、分离 reader/writer 身份的 NO_AUTHORITY 进程入口和三态 SLO evaluator。隔离 PG16 已证明关闭连接后的精确增量恢复、append-only、幂等、越权拒绝和 checkpoint 不领先 artifact。
- M1.5-B0 已补齐显式 reader/writer role assumption 与会话身份核验、两个 secret-file database URL、完整 strict observation JSONL、固定 30 分钟/24 小时有限 Shadow profile，以及无 Legacy secret、非 root、只读 filesystem、无端口的专用容器边界。定向 41/41、全 V2 136 pass / 0 fail / 4 explicit external-dependency skips、三项隔离 PG16 回归与完整 `ci:production` 均通过；B1-A 已随后补齐 exact image build、三 Venue egress 与隔离 Docker Runner 证明。
- M1.6 v1 日分区迁移 checksum 保持不可变，新增 additive v2 六小时 UTC 分区和小时级 retention cutoff。隔离 PG16 已证明非空 v1 拒绝升级、8 个连续分区、dump/restore/replay parity、引用阻断和原子淘汰；8 周期/11,552 Fact 校准得到稳态/峰值 59%/67% 本地无扩容模型 PASS。Object Lock 已回读 `COMPLIANCE` 31 天，真实 age 身份仅在 macOS Keychain；当前 P0R source commit=`bed938566d242394de7f6c31b309bd9f8198b71f`、run=`p0r-20260721t183927z-221b4eebbf2ab34191c63608771b21ea`、plan digest=`sha256:b01284de724cdbf3fe3907f91be67bf14655b744073e9de055444d5909015119`、脱敏 bundle=`1adae1348bd983ba0eb003ba3521a1404faa4ed4a5559ab89b8a70cf473dac00` 已在服务器精确 staging；多次 STS 因人工控制台时延超过 immediate compile gate 而失效，未形成可用凭证。已覆盖旧 staging、16 个 `/dev/shm` 旧辅助/占位文件和诊断文件已精确删除，复核只剩当前 exact run 且 `/dev/shm` 普通文件为空；COS 对象、真实 recovery、fresh topology 和 fresh P0 均未执行，P1 关闭。
- M2.0 已冻结六个机会族、十四种模式、family-specific direction、Detector event/knowledge 双 cutoff、Candidate/Episode/Thesis strict v2 schema、Detector emission authority、UTC Episode 去重、生命周期、三层运行漏斗和 19 个 test-only point-in-time fixture；fixture 递归拒绝 Outcome/MFE/MAE 等未来材料。该结论只证明本地合同，不证明 Detector、Deep Validation、真实市场发现率或生产能力。
- M2.1 已建立三个 Pre-Move 与两个 Breakout/Retest 独立 DRAFT 纯回放内核，包含显式长短/UNKNOWN、late/noise/fakeout veto、unavailable 降级、顺序无关 digest 和 Detector 注册身份防篡改。阈值固定标记 `UNCALIBRATED_DRAFT_THRESHOLDS`，Candidate emission=false；定向 10/10、M2.0 回归 16/16、全 V2 167 pass / 0 fail / 5 explicit skips。没有历史 cohort、真实指标或生命周期升级证据。
- M2.2-A 已建立真实历史数据接纳、完整 Candidate 背景窗口、candidate/event/matched-non-event 三业务分母、固定 Detector 分母、purge/embargo、holdout group isolation 与独立 custody、target-blind 首次发现、Wilson CI/lead-time 秩区间和四态 lifecycle proposal Gate。独立 custody 下 research Bundle 物理禁止 inline holdout，Gate 只打开 commitment 匹配的 sealed artifact；lead time 使用数据实际可知的 knowledge cutoff。当前仓库 accepted real cohort=0，Top20 ranking、threshold sensitivity 和真实 untouched holdout 均缺失，因此 Gate=`INSUFFICIENT`；五个 Detector 保持 DRAFT、Candidate 禁发。
- M2.2-B0 已把来源权利、point-in-time instrument history、knowledge-time、逐 Detector 数据覆盖、精确对象/checksum、磁盘预算、Git 外原始区和单对象技术验证做成 fail-closed 合同。真实 BTCUSDT 1m 月文件 1,838,455 bytes 与官方 SHA-256 一致，验证后原始字节强制删除；但权利审查、历史合约身份和 L2 不足，故 bulk acquisition=false、cohort freeze=false。
- M2.2-B0.1 已为五个 DRAFT Detector 增加 target-blind relative-rule-margin diagnostic strength，明确不是概率、等级或交易结论；固定 Detector 分母 Top20、TRAIN-only 六维事件阈值、matched/background、pre-cutoff regime/liquidity、observed/modeled knowledge-time、purge/embargo 和 1+4 trial registry 已由 version/digest 绑定到 dataset/experiment/holdout v2。定向 45/45 PASS；真实 cohort 仍为 0、Gate=`INSUFFICIENT`、Detector 仍 DRAFT、Candidate 禁发。
- M2.2-B0.2-A 已把来源权利升级为内容寻址、限定账户/法域、带有效期且只能由账户所有者或合格法律审查者作出的外部结论；把历史 instrument identity、onboard/delist、状态区间、knowledge time、symbol reuse epoch 和全分母覆盖核算做成 fail-closed Gate。当前五个来源候选全部为 `RESEARCH_ONLY`，合格历史来源仍为 0；Agent、当前快照和 archive presence 均不能自证通过。
- M2.2-B0.2-C/C1 已建立 release-bound 三 Venue exact raw capture、工作区外内容寻址 store、完整分母、三类 identity evidence、identity epoch、持续缺席非 delist、全链 journal 验证与 clean-HEAD CLI。冻结 release `4139cc631d3d760876c3e39404c494462541a910` 连续取得两轮三 Venue COMPLETE；Binance/OKX/Bybit 分别 841/426/746 rows，目标 654/272/642，out-of-scope 187/154/104，unresolved=0；跨度约 368.5 秒，三家均 2/2 complete、gap/conflict/blocker=0、`FORWARD_ONLY_READY`。这只通过前向捕获起点，不回填历史、不解锁 B0.2-B/B1 historical acquisition、Detector 或 Candidate。
- M3.0-M3.3 已冻结 V1 六族的 Final Decision authority、双评级、Analysis 和 `StrategyDraft v2`，M3 合计 81/81、全 V2 360/0/6、ops 115/115；这些测试只属于三 Venue 加密 fixture。当前未提交 M3.4 草稿暂停并等待 scope rebase；V2 股票/上新 Analysis、校准、Execution Feasibility、Risk、runtime 和 READY authority 均未完成。
- M1.5-B1-A 已在腾讯宿主机隔离 no-authority Runner 以 exact commit `97f10e75ce296b07d933e9c362c40ba2be0997ea` 构建专用镜像并真实运行两周期。每周期 eligible/collected 均 1,444/1,444、三 Venue provider failure=0、checkpoint/persistence=`INSERTED`，宿主机 11 容器/4 network/5 volume 已按 digest 精确恢复；evidence `sha256:a44cab89b8a4bf291e7c8f67eb6de2b76f2637f4f8265d91ebb8f1224d2a40c2` 独立重算通过。技术 Runner=`PASS`，业务 readiness=`FAIL`：READY 0/2，fresh 1,441 后降至 1,274，原因包括 stale、duplicate 和 missed schedule。31 周期 Shadow、语义整改、24h SLO、生产 migration、API、页面和生产 authority 仍未证明。
- M1.5-B1-B0 已冻结单进程 31 周期、60 秒 cadence、完整分母、strict process summary、独立业务 SLO、内容寻址 domain/runner evidence 和宿主 Docker 精确恢复；中断、短包或跨进程/config 拼接全部拒绝。
- M1.5-B1-B1 exact commit `3908f9f5d0066849311e9d3ac875cc6a76acc69e` 虽观察到进程运行 31 周期，但 Runner 使用 1 小时 reconciliation、validator 仍要求旧 24 小时值，导致完整脱敏证据未生成且原始字节已按清理合同删除。两个失败报告 digest 已独立重算、宿主精确恢复；该窗口只能记 `EXECUTION_INVALID_NOT_COUNTED`，不得推断业务 PASS/FAIL。
- M1.5-B1-B2 已统一三 Venue `MARK_PRICE / MARK_PRICE_SNAPSHOT`，把 coverage 拆成 providerObserved/accounted/eligible/collected/usablePrice/fresh 六计数，新增 100% price-usability SLO，并让 Runner/validator 共用唯一冻结 environment。旧 `LAST_PRICE` schema 证据不得进入新 Gate。
- M1.5-B1-B3 绑定 exact commit `33f08d3fb72912a2617ed3a21f58cb4c347aefcb` 完成单进程 31 周期：31/31 READY，minimum collected/usable/fresh 均为 1,444，collection/price-usability/fresh/operational-ready ratio 均为 1，provider failure 与 missed start 为 0。Runner evidence `sha256:58b5d118503def8287642b78e12eb895a26130ac0ecb12b52bbf06e82ce51860`、Domain 与两个脱敏对象均已独立复算；宿主 11 containers / 4 networks / 5 volumes 精确恢复，临时资源清零。M1.5-B1 已完成，但 production storage、24h SLO 与 M1 总出口仍未完成。

## 6. Docker 服务清单

当前 `docker-compose.yml` 声明：

| 服务 | 当前职责 |
| --- | --- |
| `postgres` | PostgreSQL 16 持久化 |
| `redis` | Redis 7 缓存、锁、heartbeat 和短状态 |
| `web` | Next.js 页面与 API |
| `caddy` | HTTP/HTTPS 入口 |
| `scanner-worker` | 受保护扫描调度 |
| `websocket-light-worker` | Binance/OKX/Bybit WebSocket 轻扫 |
| `coinglass-worker` | CoinGlass 能力、mover 和缓存任务 |
| `signal-worker` | Outcome 和旧 V3 review 任务 |
| `candidate-shadow-worker` | Candidate Shadow profile，默认受 profile 控制 |
| `shadow-runner` | 旧 Shadow tracking |
| `dynamic-scan-scheduler` | 动态扫描调度 |
| `macro-worker` | 宏观数据摄取 |

这些是当前 Legacy 声明，不等于每个服务此刻正在生产运行；运行状态必须现场验证。

## 7. 主要页面

| 路由 | 当前业务定位 |
| --- | --- |
| `/dashboard` | 总览工作台 |
| `/market` | 市场与扫描视图 |
| `/leaderboard` | 发现层榜单，不得包装成推荐 |
| `/signals` | 信号/行动状态视图 |
| `/token/[id]` | 单标的 dossier |
| `/review` | 复盘与 Outcome 视图 |
| `/system` | 系统健康与能力状态 |
| `/login` | 私有会话入口 |

V2 前端目标不是保留这些页面名称，而是确保所有页面只读同一个 `DecisionSnapshot`，不在浏览器或页面请求中重算方向、计划或状态。

## 8. API 合同

当前关键读合同包括：

- `/api/health`
- `/api/scan`
- `/api/radar/backend-contract`
- `/api/radar/business-capability`
- `/api/frontend/radar-contract`
- `/api/frontend/token-dossier`
- `/api/frontend/review-contract`

当前还有 admin 路由用于扫描、Outcome、migration、heartbeat、Shadow 和数据摄取。它们属于 Legacy 管理面，V2 必须按最小权限、独立身份和非 HTTP migration 原则重新划界。

任何 API 的 HTTP 200 都不能单独证明业务 ready。状态必须分开表达 `ready / partial / stale / unavailable / rate_limited / auth_error / transport_error / waiting / blocked`。

## 9. 数据源

### 9.1 当前来源

- 当前已实现来源仍是 Binance Futures、OKX Swap、Bybit Linear Perpetual 的公开目录、mark-price、Kline 和 WebSocket；Bitget、四 Venue listing lifecycle 与四家股票永续均已进入官方能力登记，但尚无 Scope V2 Adapter/运行证明。Binance 股票产品已由官方资料确认，不能继续标为产品不可用。
- CoinGlass 授权能力，用于部分 OI、Funding、pairs market 等衍生品验证；套餐、限速、鉴权和端点能力必须逐项如实表达。
- PostgreSQL 持久化业务状态，Redis 保存短生命周期状态和轻扫快照。

### 9.2 V2 当前目标范围

`SCOPE_EPOCH_V2_MULTI_ASSET_4V` = Binance、OKX、Bybit、Bitget + 加密线性永续 + 单一股票永续 + 股票指数/ETF 永续 + 上新/预上新/维护/限制/暂停/下架生命周期；只有现货/资产上新且无支持合约的新币进入 WATCH_ONLY，不进入合约计划。`EQUITY_CFD` 和其他 RWA 先记账，独立机制未证明前不 eligible。

V1 的 31 周期、三 Venue前向捕获和容量结果不能证明 V2。所有权威对象必须携带 scopeEpoch；加密、股票和 listing warm-up 使用独立 Context/cohort/holdout/calibration。不得把当前范围写成覆盖全球全部交易所或全部衍生品。

## 10. 分层边界

- SCAN 只发现 Candidate，不生成 grade、entry、stop、target 或 plan。
- Candidate Priority 只决定资源，不代表证据或可交易性。
- ANALYSIS 只输出结构、方向倾向、位置、反证和不确定性。
- QUALIFICATION 分开输出 Evidence Grade 与 Setup Grade，不能直接 READY。
- Strategy Construction 只生成 `StrategyDraft`。
- 只有 Execution Feasibility + Final Decision 可以产生 `TRADE_PLAN_READY`。
- Personal/Portfolio Risk 只能产生 User Fit 或阻断，不能升级系统 Action State。
- Frontend 只显示后端快照，不创造交易事实。
- Outcome 只评价冻结历史，Research 只提出并治理新版本；future label 不回写原判断。
- `TRADE_PLAN_READY` 的结构 RR 不低于 3:1，止损和目标必须有结构来源。

## 11. 当前测试体系

提交前基础门禁：

```bash
npm run typecheck
npm run lint
npm run test:market
npm run test:v2-foundation
npm run test:v2-m2-discovery-contracts
npm run test:v2-m2-replay-kernels
npm run test:v2-m1-store-replay
npm run v2:m1:store-replay:pg16-rehearsal
npm run test:v2-m1-collector
npm run v2:m1:collector-checkpoint:pg16-rehearsal
npm run v2:m0:verify
npm run build
npm run backtest:golden
npm run ci:forbidden-files
npm run ci:secret-patterns
npm run test:production-dispatch
npm run security:check
```

先跑与改动相关的定向测试，再跑基础门禁。涉及部署还需 production smoke、health、前后端合同、Postgres、Redis、worker heartbeat 和 release identity。

`npm run backtest:formal` 只在明确能力验收轮运行，普通修复和文档轮禁止乱跑。

## 12. 当前部署流程

当前普通无 secret 包的目标流程：

```text
本地范围锁定与测试
-> 生成脱敏 Bundle + exact approval request
-> 仓库外 Ed25519 私钥签名
-> 推送专用 production-dispatch ref
-> 腾讯服务器固定 timer 拉取到独立 bare mirror
-> 验签 + 时效 + commit/hash/path + production WIP
-> 启动原 package runner
-> preflight + identity + rollback 绑定
-> Docker build/up 或精确服务重建
-> production verification
-> 成功保留证据，失败自动回滚
```

签名 pull-only 通道已按 exact source `7a59e45b1c277907475f093a25cbb310b7287e12` 安装到腾讯生产。首单 `g0-first-signed-exact-20260722t211117z` 已通过专用 ref 自动 pull、Ed25519 验签、独立 runner 启动并返回 `PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE`；从 publish 到 acceptance 约 10 秒。生产应用 HEAD/clean worktree、11 个容器、health/scan/persistence/Redis 和 timer 均保持基线，staging 自动清理。普通无 secret 运输闭环通过，但通道不允许任意命令/参数、不运输 secret，也不替代 package runner 原有 lease/fencing、checkpoint、rollback、evidence 和逐包业务验收。

不把服务器密码、SSH 私钥或 secret 交给 Codex。数据库 migration、清库、volume 删除和 production authority 切换必须有独立任务与明确边界。P0R 腾讯 STS/MFA 仍是 `/dev/shm` 短期 secret 例外，不能通过 Git 通道运输。

腾讯 MFA/secret rotation、紧急救援和明确不适用于 signed Git 的例外仍使用 Microsoft Edge 中的腾讯 OrcaTerm；这不替代机器证据和独立生产身份校验。

## 13. 当前真实状态

```text
系统等级：R1
工程描述：可运行但不完整
实战描述：不能支撑实战
V2：M1.1A 已完成四 Venue + CoinGlass、33 类能力、165 行来源登记与官方资料修正，但 `SCOPE_EPOCH_V2_MULTI_ASSET_4V` 的 Adapter/live/Shadow/容量/校准仍未开始；原 M1.1-M1.6、B1-B3、C1、M3.0-M3.3 只保留 V1 效力，B1-B1 永久不计。P0R clean pre-STS baseline 已通过但 STS/COS 恢复/fresh topology/P0 未执行，M1 未完成；历史 cohort Gate=INSUFFICIENT、Detector=DRAFT、Candidate 禁发、M3.4 草稿待 scope rebase，无 Feasibility/runtime/READY authority
本轮业务服务、数据库、Redis、Worker 与业务 authority 变更：0；Runtime Control 新增 fixed dispatch timer/service；外部安全状态：COS Object Lock COMPLIANCE 31 天已启用
当前生产存储门禁：P0_BLOCKED_CAPACITY_AND_RECOVERY；P0R_OBJECT_LOCK_31D_AGE_VAULT_TRANSPORT_AND_CLEAN_PRE_STS_BASELINE_PASS_STS_RECOVERY_AND_FRESH_TOPOLOGY_PENDING；应用业务健康未在本包评估
固定生产执行通道：PRODUCTION_OPERATIONAL_FIRST_SIGNED_DISPATCH_ACCEPTED；机器复发门禁 2 项 CLOSED、0 项 open，旧 approved_orcaterm_bundle_upload 包禁止伪装成 signed_git_bundle
```

2026-07-21 P0 通过只读事务取得数据库/容量事实，Docker/Git before/after 一致，证据 `sha256:344ae4e05ec78e74ca97c92728fc06576f744e795bf4919d6eb3b76ee145769e`。它只判定存储准入，不包含 `/api/health`、Redis 或业务 ready，因此不得扩写为全站健康或全站失败。

Legacy G0 历史剩余安全出口为 7；它只是一份旧生产安全债务账，不是当前 V2 蓝图或主进度条：

```text
Cycle final
-> Lineage/Reconciliation
-> Shadow Verify
-> Canonical Compat
-> Canonical Read Cutover
-> HTTPS/private session
-> Release truth/G0 exit
```

这 7 项不是 V2 建设计数。它们只在继续操作 Legacy 生产时作为安全义务，不能阻止 V2 本地 M0/M1 工程，也不能被本地准备包或旧观察记录减数。

## 14. 最近三次关键事件

### 2026-07-23 / V2 M1.1A Four-Venue Source Capability Registry
- 4 个第一方 Venue + CoinGlass Hobbyist、33 类能力、165 个 source-capability 组合完整记账；缺失、重复、证据错绑、摘要篡改、套餐越权和密钥内容均 fail closed。
- 官方资料纠正 Binance 股票域旧结论：Binance、OKX、Bybit、Bitget 均有股票/TradFi 永续产品证明；Scope V2 identity、Adapter、地区可用性、session/corporate-action feed 和 live probe 均未证明。
- 8 项定向合同测试 PASS；本包不发网络请求、不部署，生产服务、数据和 authority 零变更。下一本地包合并 M1.1B0 exact conformance 与 M1.1B1 identity/listing。

### 2026-07-23 / V2 M3.3 Strategy Construction
- 六族 long/short 独立模板、结构 entry/stop/target、no-chase、expiry 和 partial take-profit 已进入 `StrategyDraft v2`；缺入口、目标或 fresh reference 时返回 `draft=null`，不造占位价格。
- BigInt 定点算法按最不利 entry 计算加权 gross/net RR；低 RR 只增加 blocker、不缩 stop。Final Decision 重新核对 Strategy scope、level/price/fact 和 RR，手工篡改无法通过。
- M3 81/81、全 V2 360/0/6、ops 115/115；当前全部 Draft 固定 test-only 未校准并带 no-authority blocker，未部署且不具备 READY。

### 2026-07-23 / V2 M0.4 Expanded Market Scope Amendment
- Bitget、上新/预上新生命周期、受控数据最大化、单一股票永续和股票指数/ETF 永续正式进入 `SCOPE_EPOCH_V2_MULTI_ASSET_4V`。
- 旧三 Venue加密证据只保留 `SCOPE_EPOCH_V1_CRYPTO_3V` 效力；跨 epoch/assetDomain 的 Shadow、容量、阈值、校准和 holdout 禁止混用。
- M1.1A 已把该设计落成来源能力登记合同；下一本地超级包为 M1.1B exact conformance + identity/listing，M3.4 草稿继续暂停等待 scope rebase。

## 15. 当前风险

### P0

- M1.6-P0 存储准入仍为 BLOCKED；Object Lock、age 和 transport 不是恢复 PASS，仍缺 STS、加密备份、exact retrieval、独立 PG16 restore、cleanup、fresh topology 和 exact-release calibration，P1 严禁启动。
- 固定通道首单已通过，但它不运输 P0R secret，也不替代任何业务包自身生产验收；禁止把运输 PASS 扩写成 G0、M1 或实战能力 PASS。
- 一旦发现 mock/fallback 冒充真值、WAIT 冒充 READY、future leak、secret、数据库损坏或错误交易计划，立即停止其他开发。

### P1

- 应用业务健康未由 P0 评估；任何应用发布或 Legacy Gate 继续前仍需对应 fresh read-only verification。
- Legacy 多套事实/决策/Candidate/Outcome 路径仍存在，单一 authority 未完成。
- 数据库失败回退内存、前端合同过宽、health 语义和管理面权限仍有事实误导风险。
- 预览 mock seed 入口仅在本地删除，尚未部署；若生产旧 env 曾错误启用，必须以现场证据确认影响。
- V2 M1.1-M1.6 与 B1-B3 已有本地/早期 Shadow 证据，但 production capacity、recovery、migration/身份、isolated-write Shadow 和 24h SLO 仍未通过，M1 不得提前完成。
- P0 已证明旧 V2 Fact=0；该事实会过期，P1 前仍必须由新 P0 重新确认，不能沿用本轮快照。
- M2.0 的 19 个 test-only fixture 只证明合同和反未来泄漏，不能作为 Detector precision/recall/lead-time 或生命周期晋级证据。
- M2.2-A/B0.1/B0.2-A 已能拒绝 future leak、病例对照 precision 膨胀、任意排序/构造政策、伪 holdout、Agent 自批权利和当前快照倒推历史，但 accepted real historical cohort=0；真实来源权利、完整背景实际构造、真实 Top20/sensitivity、独立 holdout custody/result 和审计都未完成，Gate 必须保持 INSUFFICIENT，禁止发 Candidate 或宣称 Detector 有效。
- M2.2-B0 证明官方归档技术链可用；B0.2-A 进一步证明公开下载、当前 snapshot 和 archive presence 都不能给出历史 eligibility。五个候选全部 `RESEARCH_ONLY`，Kline 也不支持 L2 Liquidity Shift，故 bulk/cohort 继续 blocked。
- C1 前向捕获起点已通过，但当前只有两轮、约 6 分钟目录证据；它不能替代持续采集、历史 instrument source、历史权利、真实 cohort 或长期 SLO，旧未绑定 release 的诊断根不得并入正式链。
- M3.0-M3.3 只验证 V1 三 Venue加密 fixture 的决策、六族解释、双评级和 test-only Strategy；Bitget/股票/上新实现为 0，旧 31 周期与容量不能证明 V2 扩展。真实 Deep Validation、分域 calibration/holdout、执行成本、风险和 runtime 缺失，任何 V2 READY 声明均为 P1 风险。

### P2

- 仓库保留大量 Legacy 治理脚本、历史报告和旧蓝图；逐消费者地图已经建立，但消费者尚未清零、replacement 尚未稳定，仍不得批量删除。
- 单机 Compose 的故障域、共享镜像和资源隔离需要在 M1 用容量/SLO/恢复证据决定是否升级。

## 16. 审计重点

下一轮审计优先检查：

1. COS 是否保持单 AZ/私有/versioned/SSE-COS/Object Lock 31d；STS 是否 exact-plan 最小权限，上传前 key absent、加密备份、exact version retrieval、独立 PG16 restore、无明文 dump 和临时 secret 清理是否真实通过；fresh P0 是否继承全部非容量 blocker并满足稳态 60% / 峰值 70%。
2. `scopeEpoch` 是否覆盖所有权威对象；V1 C1/B1-B3/D0 是否保持原范围，Bitget/股票/上新是否只在 M1.1A/M1.1B 后进入新证据，任何旧 PASS 都不得改名为 V2 PASS。
3. M1.6 production Gate 是否绑定旧 Fact=0、migration checksum、预建窗口、容量阈值、备份恢复和 Audit/Retention 分权。
4. Candidate/Evidence/Setup/Action/User Fit 是否越层。
5. M3 Analysis 是否完整核算 EvidenceItem、绑定 exact Market Context/结构 fact；Evidence/Setup 是否独立、真实 cohort/holdout/CI/reliability 与 scope authority 是否齐全；Strategy 是否禁止占位、缩 stop 和 RR 篡改；READY 是否只由同 release/id/time lineage 的后端完整计划、双评级、执行可行性、结构与净 RR、Trigger 和 Runtime Gate 共同决定。
6. 数据缺失、CoinGlass 失败、429、stale 和数据库故障是否诚实降级。
7. 前端是否只读 Decision Snapshot。
8. 发布是否绑定 commit、artifact、image、schema、feature/rule version、rollback 和 evidence。
9. 旧代码删除是否有消费者扫描、replacement 稳定期和 absence test。

## 17. 用户工作方式与协作规则

- 用户提出产品目标、交易观察和最终决策，不负责写代码或判断代码质量。
- Codex 负责审计、拆包、实现、测试、证据、上下文和风险说明。
- 汇报使用中文大白话，同时给出可复核文件、命令和 PASS/FAIL。
- 不用“已完成”替代证据；本地 PASS、已上传、已部署、观察中和生产 PASS 必须分开。
- 每轮只做一个小而完整的问题；发现 P0/P1 时先报告并最小修复，不借机扩展无关模块。
- 同一故障类别第二次出现即触发 `RECURRENCE_ROOT_CAUSE_GATE`：停止重复 workaround，必须交付复现指纹、具体根因、永久修复、先红后绿回归测试、运行防复发门禁和真实环境验收；重连、重试、重新上传、清缓存或重启本身不算解决。
- 生产权限即使被长期批准，也不取消平台安全审批、精确身份、preflight、回滚和证据门禁。
- 不创建自动审批 Agent 代替用户或平台授权。
- 污染清理分三类：确定无引用且已有 replacement 的删除；用途不明的隔离；仍有消费者的登记到 Legacy Capability Atlas 后受控替换。

## 18. 当前执行入口与关键外部门

```text
V2-M1.6-P0R-C-STS-ENCRYPTED-BACKUP-EXACT-RETRIEVAL-AND-ISOLATED-RESTORE
```

B1-B3 已关闭 V1 M1.5-B1；P0 已执行并因容量与 recovery evidence BLOCKED。Object Lock 31 天、age Keychain 身份、source=`bed938566d242394de7f6c31b309bd9f8198b71f` 和 exact staging 已通过；已覆盖旧 staging、16 个 `/dev/shm` 旧辅助/占位文件与诊断文件均已精确清理，clean pre-STS baseline 已复核通过。当前生产 P0R 下一步是 fresh exact-plan 7200 秒 STS 的即时 server-side compile、受限上传、加密备份、精确取回、隔离恢复和 cleanup；随后刷新 topology、重跑校准与 fresh P0，只有 PASS 才能进入 P1-P4/M1.7。签名通道不能运输 P0R secret。并行本地下一包是 `M1.1B Exact Source Conformance + Multi-Asset Identity and Listing Intelligence`，M3.4 草稿暂停等待 scope rebase；外部门 B0.2-B 未解决前 historical bulk、真实 cohort、holdout、Detector lifecycle 和 runtime 一律关闭。

## 19. 活跃记忆维护规则

- 本文件最多 400 行，只保留当前事实。
- 易变生产事实没有 fresh evidence 就写 UNKNOWN，不沿用旧状态。
- 最近事件只保留 3 次；更早细节从 Git、交付报告和脱敏证据读取。
- 不写 raw log、真实业务行、secret、token、密码、私钥或未脱敏环境值。
- 蓝图改变项目事实时更新；纯实现细节进入 Changelog 和交付报告。
