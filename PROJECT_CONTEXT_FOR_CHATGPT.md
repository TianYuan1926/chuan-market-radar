# Market Radar 项目当前上下文

更新日期：2026-07-22

用途：让 Codex、ChatGPT 和外部审计员在几分钟内获得当前真实状态、唯一蓝图、风险和下一入口。本文件只保存当前事实，不保存施工流水账，不包含 secret。

## 1. 项目一句话定义

Market Radar 是面向山寨币合约市场的人工决策雷达：持续覆盖目标 CEX 的合格合约，尽可能提前发现主升/主跌前兆，同时识别其他高赔率结构机会，经过深度验证后给出严格计划，并用真实结果持续改进。

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

- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`，内容版本 v1.19。
- `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json`，机器合同 v1.21。
- `docs/blueprints/README.md`，权威解析入口。
- `market-radar-v2-build-sequence.md`，当前正确施工依赖与减数规则。

状态：

```text
ACTIVE_DESIGN_AUTHORITY
M0_ENGINEERING_EXIT_LOCAL_PASS
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
M1.6P0R_OBJECT_LOCK_31D_AGE_VAULT_AND_TRANSPORT_PASS_STS_AND_RECOVERY_PENDING
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
M3.0_DECISION_CONTRACT_AND_M3.1_FAMILY_ANALYSIS_LOCAL_PASS_TEST_ONLY_UNCALIBRATED_NO_AUTHORITY
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
- M1.1 已建立独立 GET-only/HTTPS allowlist Transport、Binance/OKX/Bybit catalog 与 mark-price Adapter、100% observed accounting、稳定 canonical identity、Point-in-Time `MARK_PRICE / MARK_PRICE_SNAPSHOT`、FactQuality 和 duplicate/out-of-order/gap/stale/recovery 门禁。价格数值不变但 Provider 快照序列前进仍是新事实；同序列才是 duplicate。权威产物运行时深冻结，内存产物明确 `persistedAt=null`，失败不补 0、不编 event time。
- M1.2 已实现 `UNDERLYING_GROUP` 级跨三 Venue `MARK_PRICE` 分散 Feature、精确十进制计算、同 cutoff/future-read 门禁、独立 ONLINE/REPLAY run 和语义哈希证据，以及最小非方向性 Market Context。低分散不会被包装成健康流动性，regime/volatility/breadth/correlation/方向不凭空生成。
- M1.3 已建立无 memory fallback 的 PostgreSQL artifact store、Universe/Fact/FactQuality 原子事务、完整 payload digest、严格幂等冲突、event/knowledge 双 cutoff Manifest、五类 NOLOGIN capability role、两次 durable replay 和固定 profile 的 Runtime Truth v2。隔离 PG16 真实演练 1/1 PASS：8 artifact、权限、append-only、污染检测、parity 和 deterministic replay 均通过；结果保持 `REHEARSAL/PARTIAL`。
- M1.4 已建立 21 observed / 15 eligible 的三 Venue 多标的 fixture、完整/增量 reconciliation、目录 tombstone、provider quota、global/per-provider concurrency、有限队列、冷启动、数据库失败和恢复状态机。Collector strict telemetry 分开报告 providerObserved/accounted/eligible/collected/fresh；真实 PG16 已证明启动、增量和全 catalog 故障的原子持久化，生产 import 仍只能通过 Adapter。
- M1.5-A 已建立独立 additive checkpoint migration、artifact 引用与 digest 防线、精确 release/config/sequence/schedule 恢复、固定节拍 skip-missed Worker、优雅停止、强制 telemetry sink、分离 reader/writer 身份的 NO_AUTHORITY 进程入口和三态 SLO evaluator。隔离 PG16 已证明关闭连接后的精确增量恢复、append-only、幂等、越权拒绝和 checkpoint 不领先 artifact。
- M1.5-B0 已补齐显式 reader/writer role assumption 与会话身份核验、两个 secret-file database URL、完整 strict observation JSONL、固定 30 分钟/24 小时有限 Shadow profile，以及无 Legacy secret、非 root、只读 filesystem、无端口的专用容器边界。定向 41/41、全 V2 136 pass / 0 fail / 4 explicit external-dependency skips、三项隔离 PG16 回归与完整 `ci:production` 均通过；B1-A 已随后补齐 exact image build、三 Venue egress 与隔离 Docker Runner 证明。
- M1.6 v1 日分区迁移 checksum 保持不可变，新增 additive v2 六小时 UTC 分区和小时级 retention cutoff。隔离 PG16 已证明非空 v1 拒绝升级、8 个连续分区、dump/restore/replay parity、引用阻断和原子淘汰；8 周期/11,552 Fact 校准得到稳态/峰值 59%/67% 本地无扩容模型 PASS。Object Lock 已回读 `COMPLIANCE` 31 天，真实 age 身份仅在 macOS Keychain；当前 P0R source commit=`bed938566d242394de7f6c31b309bd9f8198b71f`、run=`p0r-20260721t183927z-221b4eebbf2ab34191c63608771b21ea`、plan digest=`sha256:b01284de724cdbf3fe3907f91be67bf14655b744073e9de055444d5909015119`、脱敏 bundle=`1adae1348bd983ba0eb003ba3521a1404faa4ed4a5559ab89b8a70cf473dac00` 已在服务器精确 staging；多次 STS 因人工控制台时延超过 immediate compile gate 而失效，未形成可用凭证，COS 对象、真实 recovery、fresh topology 和 fresh P0 均未执行，P1 关闭。
- M2.0 已冻结六个机会族、十四种模式、family-specific direction、Detector event/knowledge 双 cutoff、Candidate/Episode/Thesis strict v2 schema、Detector emission authority、UTC Episode 去重、生命周期、三层运行漏斗和 19 个 test-only point-in-time fixture；fixture 递归拒绝 Outcome/MFE/MAE 等未来材料。该结论只证明本地合同，不证明 Detector、Deep Validation、真实市场发现率或生产能力。
- M2.1 已建立三个 Pre-Move 与两个 Breakout/Retest 独立 DRAFT 纯回放内核，包含显式长短/UNKNOWN、late/noise/fakeout veto、unavailable 降级、顺序无关 digest 和 Detector 注册身份防篡改。阈值固定标记 `UNCALIBRATED_DRAFT_THRESHOLDS`，Candidate emission=false；定向 10/10、M2.0 回归 16/16、全 V2 167 pass / 0 fail / 5 explicit skips。没有历史 cohort、真实指标或生命周期升级证据。
- M2.2-A 已建立真实历史数据接纳、完整 Candidate 背景窗口、candidate/event/matched-non-event 三业务分母、固定 Detector 分母、purge/embargo、holdout group isolation 与独立 custody、target-blind 首次发现、Wilson CI/lead-time 秩区间和四态 lifecycle proposal Gate。独立 custody 下 research Bundle 物理禁止 inline holdout，Gate 只打开 commitment 匹配的 sealed artifact；lead time 使用数据实际可知的 knowledge cutoff。当前仓库 accepted real cohort=0，Top20 ranking、threshold sensitivity 和真实 untouched holdout 均缺失，因此 Gate=`INSUFFICIENT`；五个 Detector 保持 DRAFT、Candidate 禁发。
- M2.2-B0 已把来源权利、point-in-time instrument history、knowledge-time、逐 Detector 数据覆盖、精确对象/checksum、磁盘预算、Git 外原始区和单对象技术验证做成 fail-closed 合同。真实 BTCUSDT 1m 月文件 1,838,455 bytes 与官方 SHA-256 一致，验证后原始字节强制删除；但权利审查、历史合约身份和 L2 不足，故 bulk acquisition=false、cohort freeze=false。
- M2.2-B0.1 已为五个 DRAFT Detector 增加 target-blind relative-rule-margin diagnostic strength，明确不是概率、等级或交易结论；固定 Detector 分母 Top20、TRAIN-only 六维事件阈值、matched/background、pre-cutoff regime/liquidity、observed/modeled knowledge-time、purge/embargo 和 1+4 trial registry 已由 version/digest 绑定到 dataset/experiment/holdout v2。定向 45/45 PASS；真实 cohort 仍为 0、Gate=`INSUFFICIENT`、Detector 仍 DRAFT、Candidate 禁发。
- M2.2-B0.2-A 已把来源权利升级为内容寻址、限定账户/法域、带有效期且只能由账户所有者或合格法律审查者作出的外部结论；把历史 instrument identity、onboard/delist、状态区间、knowledge time、symbol reuse epoch 和全分母覆盖核算做成 fail-closed Gate。当前五个来源候选全部为 `RESEARCH_ONLY`，合格历史来源仍为 0；Agent、当前快照和 archive presence 均不能自证通过。
- M2.2-B0.2-C/C1 已建立 release-bound 三 Venue exact raw capture、工作区外内容寻址 store、完整分母、三类 identity evidence、identity epoch、持续缺席非 delist、全链 journal 验证与 clean-HEAD CLI。冻结 release `4139cc631d3d760876c3e39404c494462541a910` 连续取得两轮三 Venue COMPLETE；Binance/OKX/Bybit 分别 841/426/746 rows，目标 654/272/642，out-of-scope 187/154/104，unresolved=0；跨度约 368.5 秒，三家均 2/2 complete、gap/conflict/blocker=0、`FORWARD_ONLY_READY`。这只通过前向捕获起点，不回填历史、不解锁 B0.2-B/B1 historical acquisition、Detector 或 Candidate。
- M3.0 已冻结 Final Decision authority、lineage、Action State 与 READY parity；M3.1 已为六族建立 long/short/失效解释，要求每个 EvidenceItem 恰好解释一次、结构位有 fresh fact 来源、Fib 不得独立决策，并以 `AnalysisSnapshot v2` 绑定 evidence ids、Market Context id 和 authority。M3.1 21/21、M3.0 回归 17/17、完整 CI PASS；当前固定 `TEST_ONLY_UNCALIBRATED`，真实 Deep Validation、双评级校准、Strategy、Feasibility、Risk 和 runtime 均未完成。
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

- Binance Futures、OKX Swap、Bybit Linear Perpetual 的公开合约目录、mark-price snapshot、Kline 和 WebSocket 数据；成交、订单簿、OI 等未来必须保持独立事实语义。
- CoinGlass 授权能力，用于部分 OI、Funding、pairs market 等衍生品验证；套餐、限速、鉴权和端点能力必须逐项如实表达。
- PostgreSQL 持久化业务状态，Redis 保存短生命周期状态和轻扫快照。

### 9.2 V2 初始目标范围

目标范围是 Adapter 明确支持的线性稳定币结算永续合约。所有 observed instrument 必须 100% 记账；unsupported、suspended、delisting、unresolved 仍留在分母并说明原因。

不得把当前范围写成覆盖全球全部交易所或全部衍生品。

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

签名 pull-only 通道本地代码和隔离测试已通过，但尚未安装到腾讯生产，所以当前不能声称日常运输已经自动化。它不开放入站端口，不允许任意命令/参数，不修改应用生产 worktree，不运输 `.env`、Token、数据库 URL、COS STS、SSH key 或业务数据；package runner 原有 lease/fencing、checkpoint、rollback 和 evidence 不变。

不把服务器密码、SSH 私钥或 secret 交给 Codex。数据库 migration、清库、volume 删除和 production authority 切换必须有独立任务与明确边界。P0R 腾讯 STS/MFA 仍是 `/dev/shm` 短期 secret 例外，不能通过 Git 通道运输。

固定通道安装前，或需要首次安装、腾讯 MFA/secret rotation、紧急救援时，仍使用 Microsoft Edge 中的腾讯 OrcaTerm；这不替代机器证据和独立生产身份校验。

## 13. 当前真实状态

```text
系统等级：R1
工程描述：可运行但不完整
实战描述：不能支撑实战
V2：M0、M1.1-M1.6、M1.5-B1、M2.0-M2.2 已列本地包、C1、M3.0 和 M3.1 合同出口通过；B1-B1 永久不计。M1.6-P0 因容量与恢复证据 BLOCKED；Object Lock 31 天、age Keychain 身份和 exact P0R staging 已通过，多次短期 STS 已失效且未执行 COS/数据库恢复，fresh topology/P0 未执行，M1 未完成。历史 cohort Gate=INSUFFICIENT，Detector=DRAFT、Candidate 禁发；M3.1 仅 test-only 未校准，无 Strategy/runtime/READY authority
本轮生产服务、数据库、Redis、Worker 与业务 authority 变更：0；外部安全状态：COS Object Lock COMPLIANCE 31 天已启用
当前生产存储门禁：P0_BLOCKED_CAPACITY_AND_RECOVERY；P0R_OBJECT_LOCK_31D_AGE_VAULT_AND_TRANSPORT_PASS_STS_RECOVERY_AND_FRESH_TOPOLOGY_PENDING；应用业务健康未在本包评估
固定生产执行通道：LOCAL_IMPLEMENTED_TESTED_NOT_INSTALLED；旧 approved_orcaterm_bundle_upload 包禁止伪装成 signed_git_bundle
```

2026-07-21 P0 通过只读事务取得数据库/容量事实，Docker/Git before/after 一致，证据 `sha256:344ae4e05ec78e74ca97c92728fc06576f744e795bf4919d6eb3b76ee145769e`。它只判定存储准入，不包含 `/api/health`、Redis 或业务 ready，因此不得扩写为全站健康或全站失败。

Legacy G0 历史剩余安全出口为 7：

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

### 2026-07-22 / G0 Signed Pull-Only Production Dispatch Local Engineering
- 新增 Ed25519 canonical envelope、四文件脱敏运输、独立 bare mirror、20 秒 timer、single pending commit、source-ref reachability、Bundle/request/entrypoint hash、tar/path/secret 防线和 production lease defer；systemd 以 `MemoryDenyWriteExecute` + `node --jitless` 运行，Node 子进程继承 `--jitless`，合法归档路径内出现凭证内容同样拒绝。异常租约只等待，无效单任务会被隔离后推进 cursor，claim 在启动前同步到磁盘，半安装自动回收且安装 source-set 包含安装器自身。生产预检证明主机没有 Node，旧 `/usr/bin/node` 假设已删除；安装器现只从 Node.js 官方 HTTPS 下载固定 `v24.18.0` Linux x64，并在任何 mutation 前校验 archive/binary/license SHA、架构和版本，独立安装且不改全局 PATH。
- agent 不接受 shell command/arguments，不开放入站端口、不接触生产 `.env`、不修改应用 worktree，只启动原 session-independent package entrypoint；旧 OrcaTerm transport request 明确拒绝。
- 初版因放在 Legacy deploy 层被 M0 正确拒绝；现已迁入 V2 control plane，Legacy consumer map 保持 539 source / 273 runtime edges、protected drift=0。固定 runtime 修正后定向 12/12、自治 31/31 和完整 CI PASS；腾讯生产尚未安装，不能写运输自动化已生效。P0R STS/MFA 仍为独立例外。

### 2026-07-21 / V2 M1.6-P0R-B1C Object Lock, Age and Transport Preparation
- 用户动作级确认后，Microsoft Edge 已启用并回读 Object Lock=`COMPLIANCE` 31 天；真实 age X25519 身份只在 macOS Keychain，public attestation 不含私钥。
- 首次 bundle 因错误交叉编译 `go test` 真实失败；提交 `6a81e865e61569f7d2d7c3bb3be1d78db72a9eab` 拆分 host-test/linux-build 并用真实 helper 测试修复。
- exact plan 与 mode-600 transport bundle 已通过，12/12 hash 一致且无 secret/private key；STS、对象、backup/retrieval/restore 未执行，P0/P1 不变。

### 2026-07-22 / V2 M3.1 Family Analysis and Evidence Interpretation
- 六族均建立 long、short 和失效/unavailable 路径；EvidenceItem 一对一解释，反证、Market Context 和结构位来源不能静默丢失或拼接。
- `AnalysisSnapshot v2` 显式绑定 evidence ids、Market Context id 与 authority；M3.1 21/21、M3.0 回归 17/17、全 V2 317/0/6 explicit skip、ops 115/115 和完整 CI PASS。
- 只达到 `TEST_ONLY_UNCALIBRATED / NO_STRATEGY_AUTHORITY`；真实校准、双评级、Strategy、Feasibility、Risk 和 M3 runtime 仍缺失。

## 15. 当前风险

### P0

- M1.6-P0 存储准入仍为 BLOCKED；Object Lock、age 和 transport 不是恢复 PASS，仍缺 STS、加密备份、exact retrieval、独立 PG16 restore、cleanup、fresh topology 和 exact-release calibration，P1 严禁启动。
- 固定执行通道尚未生产安装；在安装 evidence、无新增监听端口、应用 worktree/容器零变化和 timer health 通过前，仍不得把 OrcaTerm 瓶颈写成已关闭。
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
- M3.0/M3.1 只验证决策与未校准六族解释合同；真实 Deep Validation、Evidence/Setup 校准、Strategy template、执行成本事实、个人/组合风险和 untouched holdout 缺失，任何 V2 READY 声明均为 P1 风险。

### P2

- 仓库保留大量 Legacy 治理脚本、历史报告和旧蓝图；逐消费者地图已经建立，但消费者尚未清零、replacement 尚未稳定，仍不得批量删除。
- 单机 Compose 的故障域、共享镜像和资源隔离需要在 M1 用容量/SLO/恢复证据决定是否升级。

## 16. 审计重点

下一轮审计优先检查：

1. COS 是否保持单 AZ/私有/versioned/SSE-COS/Object Lock 31d；STS 是否 exact-plan 最小权限，上传前 key absent、加密备份、exact version retrieval、独立 PG16 restore、无明文 dump 和临时 secret 清理是否真实通过；fresh P0 是否继承全部非容量 blocker并满足稳态 60% / 峰值 70%。
2. C1 正式证据是否继续保持 exact release/config、两轮完整 raw、冻结 cadence、active gap=0 和无 identity conflict；前向 capture 永远不能伪装历史回填或长期 SLO。
3. M1.6 production Gate 是否绑定旧 Fact=0、migration checksum、预建窗口、容量阈值、备份恢复和 Audit/Retention 分权。
4. Candidate/Evidence/Setup/Action/User Fit 是否越层。
5. M3 Analysis 是否完整核算 EvidenceItem、绑定 exact Market Context/结构 fact、具备匹配 scope 的校准 authority；READY 是否只由同 release/id/time lineage 的后端完整计划、双评级、执行可行性、结构与净 RR、Trigger 和 Runtime Gate 共同决定。
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

B1-B3 已关闭 M1.5-B1；P0 已执行并因容量与 recovery evidence BLOCKED。Object Lock 31 天、age Keychain 身份、source=`bed938566d242394de7f6c31b309bd9f8198b71f` 和 exact staging 已通过；当前 P0R 只执行 fresh exact-plan 7200 秒 STS 的即时 server-side compile、受限上传、加密备份、精确取回、隔离恢复和 cleanup。既往短期 STS 已失效且不得复用，生产数据库和服务尚未因本 P0R 改变。随后刷新完整生产健康/topology，在 exact clean release 重跑校准并执行 fresh P0。只有新 P0 PASS 才能进入 `P1 v1+v2 schema -> P2 identities -> P3 six-hour partitions+dormant Worker -> P4 isolated-write Shadow -> M1.7 24h`。签名 pull-only 通道在本地并行完成但未生产安装；它不能运输 P0R secret。外部门 B0.2-B 仍需账户所有者/合格审查者和可验证历史来源，未解决前 historical bulk、真实 cohort、holdout、Detector lifecycle 和 runtime 一律关闭。

## 19. 活跃记忆维护规则

- 本文件最多 400 行，只保留当前事实。
- 易变生产事实没有 fresh evidence 就写 UNKNOWN，不沿用旧状态。
- 最近事件只保留 3 次；更早细节从 Git、交付报告和脱敏证据读取。
- 不写 raw log、真实业务行、secret、token、密码、私钥或未脱敏环境值。
- 蓝图改变项目事实时更新；纯实现细节进入 Changelog 和交付报告。
