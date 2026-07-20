# Market Radar 项目当前上下文

更新日期：2026-07-20

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

- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`，内容版本 v1.2。
- `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json`，机器合同 v1.2。
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
M1.5_LIVE_EGRESS_UNAVAILABLE
M1.5B1_EARLY_SHADOW_EXTERNAL_GATE_PENDING
M1.6_PARTITIONED_FACT_STORAGE_LOCAL_POSTGRES16_PASS
M2.0_DISCOVERY_CONTRACTS_LOCAL_PASS
M2.1_REPLAY_KERNELS_LOCAL_READY_RUNTIME_BLOCKED
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
- M1.1 已建立独立 GET-only/HTTPS allowlist Transport、Binance/OKX/Bybit catalog 与 ticker Adapter、100% observed accounting、稳定 canonical identity、Point-in-Time `LAST_PRICE`、FactQuality 和 duplicate/out-of-order/gap/stale/recovery 门禁。V2 67/67 测试通过；权威产物运行时深冻结，内存产物明确 `persistedAt=null`，失败不补 0、不编 event time。
- M1.2 已实现 `UNDERLYING_GROUP` 级跨三 Venue `LAST_PRICE` 分散 Feature、精确十进制计算、同 cutoff/future-read 门禁、独立 ONLINE/REPLAY run 和语义哈希证据，以及最小非方向性 Market Context。定向 17/17、全 V2 84/84 PASS；低分散不会被包装成健康流动性，regime/volatility/breadth/correlation/方向不凭空生成。
- M1.3 已建立无 memory fallback 的 PostgreSQL artifact store、Universe/Fact/FactQuality 原子事务、完整 payload digest、严格幂等冲突、event/knowledge 双 cutoff Manifest、五类 NOLOGIN capability role、两次 durable replay 和固定 profile 的 Runtime Truth v2。隔离 PG16 真实演练 1/1 PASS：8 artifact、权限、append-only、污染检测、parity 和 deterministic replay 均通过；结果保持 `REHEARSAL/PARTIAL`。
- M1.4 已建立 21 observed / 15 eligible 的三 Venue 多标的 fixture、完整/增量 reconciliation、目录 tombstone、provider quota、global/per-provider concurrency、有限队列、冷启动、数据库失败和恢复状态机。Collector strict telemetry 分开报告 providerObserved/accounted/eligible/collected/fresh；真实 PG16 已证明启动、增量和全 catalog 故障的原子持久化，生产 import 仍只能通过 Adapter。
- M1.5-A 已建立独立 additive checkpoint migration、artifact 引用与 digest 防线、精确 release/config/sequence/schedule 恢复、固定节拍 skip-missed Worker、优雅停止、强制 telemetry sink、分离 reader/writer 身份的 NO_AUTHORITY 进程入口和三态 SLO evaluator。隔离 PG16 已证明关闭连接后的精确增量恢复、append-only、幂等、越权拒绝和 checkpoint 不领先 artifact。
- M1.5-B0 已补齐显式 reader/writer role assumption 与会话身份核验、两个 secret-file database URL、完整 strict observation JSONL、固定 30 分钟/24 小时有限 Shadow profile，以及无 Legacy secret、非 root、只读 filesystem、无端口的专用容器边界。定向 41/41、全 V2 136 pass / 0 fail / 4 explicit external-dependency skips、三项隔离 PG16 回归与完整 `ci:production` 均通过；本机无 Docker CLI，真实 image build/Compose merge 未证明。
- M1.6 已建立专用 UTC 日分区、无 DEFAULT fail-closed 路由、有界活动身份注册表、旧账本新 Fact 禁写、容量水位、Audit/Retention 分权、restore-verified DROP 与不可变 CREATED/DROPPED/run evidence。隔离 PG16 真实证明旧读兼容、两日跨分区、`pg_dump -> pg_restore -> replay parity`、保留/replay 阻断、原子清理与防重灌；全 V2 141/0/5 explicit skips 与完整 `ci:production` PASS，生产 migration 和真实容量未证明。
- M2.0 已冻结六个机会族、十四种模式、family-specific direction、Detector event/knowledge 双 cutoff、Candidate/Episode/Thesis strict v2 schema、Detector emission authority、UTC Episode 去重、生命周期、三层运行漏斗和 19 个 test-only point-in-time fixture。全 V2 当前 157 pass / 0 fail / 5 explicit external-dependency skips；fixture 递归拒绝 Outcome/MFE/MAE 等未来材料。该结论只证明本地合同，不证明 Detector、Deep Validation、真实市场发现率或生产能力。
- 本机 live no-authority probe 已执行两轮；Binance、OKX、Bybit 三家公开 HTTPS endpoint 均连接/请求超时，结果诚实保持 0 observed / 0 eligible / `DEGRADED`。因此当前仍没有 live 全市场规模、Shadow/SLO、生产 migration、API、页面或生产 authority 证据。

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

- Binance Futures、OKX Swap、Bybit Linear Perpetual 的公开合约目录、ticker、Kline 和 WebSocket 数据。
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
npm run test:v2-m1-store-replay
npm run v2:m1:store-replay:pg16-rehearsal
npm run test:v2-m1-collector
npm run v2:m1:collector-checkpoint:pg16-rehearsal
npm run v2:m0:verify
npm run build
npm run backtest:golden
npm run ci:forbidden-files
npm run ci:secret-patterns
npm run security:check
```

先跑与改动相关的定向测试，再跑基础门禁。涉及部署还需 production smoke、health、前后端合同、Postgres、Redis、worker heartbeat 和 release identity。

`npm run backtest:formal` 只在明确能力验收轮运行，普通修复和文档轮禁止乱跑。

## 12. 当前部署流程

建议流程：

```text
本地范围锁定与测试
-> commit/push GitHub
-> 生产服务器精确 fetch/自拉或固定 runner
-> preflight + identity + rollback 绑定
-> Docker build/up 或精确服务重建
-> production verification
-> 成功保留证据，失败自动回滚
```

不把服务器密码、SSH 私钥或 secret 交给 Codex。数据库 migration、清库、volume 删除和 production authority 切换必须有独立任务与明确边界。

需要人工控制台时，当前历史工作方式为 Microsoft Edge 中的腾讯 OrcaTerm；这不替代机器证据和独立生产身份校验。

## 13. 当前真实状态

```text
系统等级：R1
工程描述：可运行但不完整
实战描述：不能支撑实战
V2：M0、M1.1-M1.6 与 M2.0 本地出口通过；分区/retention 已在隔离 PG16 证明，但 Docker/live/生产 migration/真实容量未证明，M1.5-B1 与 M1.7 仍待外部证据；当前只允许 M2.1 test-only 纯函数回放内核，Detector runtime 禁止启动
本轮生产变更：0
当前生产终态：UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION
```

最后一条已记录生产事实来自 2026-07-19：Cycle-7 已成功启动后台观察，截至当时至少完成 sample 3，状态仍为 `IN_PROGRESS_FRESH_ACTIVATION_AND_ACCUMULATION`。活跃记忆没有更晚的 final evidence。

2026-07-20 本轮尝试通过 Microsoft Edge 读取腾讯 OrcaTerm，但页面显示 0 个会话且无连接配置，没有执行任何生产命令。因此现在不能声称 observer 仍在运行、Cycle-7 PASS/FAIL、G0 完成或生产当前健康/异常。任何下一生产动作前必须恢复可信只读通道并重新验证 release identity、Compose、health、Candidate runtime、Postgres、Redis 和 observer/终证据。

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

### 2026-07-20 / V2 M2.0 Discovery Contracts Local Exit

- 冻结六族十四模式、Detector event/knowledge 双 cutoff、Candidate/Episode/Thesis strict v2 schema、UTC Episode key、生命周期/去重和三层运行漏斗；Candidate 仍没有等级、行动状态或交易计划。
- 19 个 test-only point-in-time fixture 覆盖每族 LONG、SHORT 和反例，并明确包含 direction unresolved、late、noise、fakeout 与 unavailable；递归 future-material 防线拒绝 Outcome/MFE/MAE 等未来数据。
- M2.0 定向 16/16、全 V2 157 pass / 0 fail / 5 explicit skips、完整 `ci:production` PASS；M1 runtime、Deep Validation、API、页面和生产均未改变。

### 2026-07-20 / V2 M1.6 Partitioned Fact Storage Local Exit

- 新 Fact 只能进入无 DEFAULT 的 UTC 日分区，旧账本拒绝旁路；活动身份唯一性随 retention 原子收缩，DROPPED 事件永久封闭旧 source day。
- 定向 5/5、全 V2 141 pass / 0 fail / 5 explicit external-dependency skips、完整 `ci:production` PASS；M1.3/M1.4/M1.5 与 M1.6 四项隔离 PG16 各 1/1 PASS。
- M1.6 强演练真实完成两日跨分区、`pg_dump -> pg_restore -> replay parity PASS`、活跃保留/replay 阻断和 1 分区/2 Fact 原子 DROP；生产零连接、零 migration、零变更。

### 2026-07-20 / V2 M1.5-B0 Shadow Release Safety Local Exit

- 修复生产入口未显式假设 capability role 的缺口，增加 session/current role 核验、secret-file URL、固定 host/database 和不同登录身份门禁。
- observation 改为完整 strict cycle envelope，并冻结 30 分钟/24 小时 SLO profile；专用容器无 Legacy secret、非 root、只读、无 capabilities/端口且有限周期。
- 定向 41/41、全 V2 136 pass / 0 fail / 4 explicit external-dependency skips、三项隔离 PG16 回归与完整 `ci:production` 均通过。首次全 V2 门禁暴露 `deploy/v2/**` 被误纳 Legacy 图，已统一 V2 graph root 边界且基线保持 539；本机无 Docker CLI，image/Compose 仍未证明。Edge OrcaTerm 为 0 会话，生产零命令、零变更。

## 15. 当前风险

### P0

- 当前没有经过新鲜生产证据确认的开放 P0，也没有资格声称 P0=0；生产状态尚未重新核验。
- 一旦发现 mock/fallback 冒充真值、WAIT 冒充 READY、future leak、secret、数据库损坏或错误交易计划，立即停止其他开发。

### P1

- 最新生产终态未知，任何发布或 Legacy Gate 继续前都需要 fresh read-only verification。
- Legacy 多套事实/决策/Candidate/Outcome 路径仍存在，单一 authority 未完成。
- 数据库失败回退内存、前端合同过宽、health 语义和管理面权限仍有事实误导风险。
- 预览 mock seed 入口仅在本地删除，尚未部署；若生产旧 env 曾错误启用，必须以现场证据确认影响。
- V2 M1.1-M1.6 已有本地数据、Worker、checkpoint、SLO、Shadow 安全和分区/恢复证据；但三家 provider egress、Docker image、Compose merge、生产 migration、真实容量、Shadow 与 SLO PASS 均未证明。
- M1.6 migration 前旧 V2 Fact 保持兼容但不自动清理；生产 preflight 必须证明旧 Fact 为零，非零时另做受控 backfill/retirement，不能进入长期 Shadow。
- M2.0 只冻结合同和 test-only fixture；Detector kernel、真实 replay 指标、Deep Validation、队列/配额、Candidate Store 与 live runtime 均未实现，禁止把 19 个样本当作市场能力证据。

### P2

- 仓库保留大量 Legacy 治理脚本、历史报告和旧蓝图；逐消费者地图已经建立，但消费者尚未清零、replacement 尚未稳定，仍不得批量删除。
- 单机 Compose 的故障域、共享镜像和资源隔离需要在 M1 用容量/SLO/恢复证据决定是否升级。

## 16. 审计重点

下一轮审计优先检查：

1. M2.1 是否只实现 Pre-Move 与 Breakout/Retest 的 test-only 纯函数回放内核，不绕过 M1.7 读取 M1 authority、写 Candidate Store 或启动 Detector runtime。
2. M1.5-B1 是否先在可达网络得到三家 live provider 原始 observed/accounted/eligible/collected/fresh，而不是把 fixture、官方文档或超时写成全市场证据。
3. M1.6 production Gate 是否绑定旧 Fact=0、migration checksum、预建窗口、容量阈值、备份恢复和 Audit/Retention 分权。
4. Candidate/Evidence/Setup/Action/User Fit 是否越层。
5. READY 是否由后端完整计划、执行可行性、结构 RR、净成本和运行健康共同决定。
6. 数据缺失、CoinGlass 失败、429、stale 和数据库故障是否诚实降级。
7. Outcome/Research 是否与生产判断隔离，是否记录所有失败试验。
8. 前端是否只读 Decision Snapshot。
9. 发布是否绑定 commit、artifact、image、schema、feature/rule version、rollback 和 evidence。
10. 旧代码删除是否有消费者扫描、replacement 稳定期和 absence test。

## 17. 用户工作方式与协作规则

- 用户提出产品目标、交易观察和最终决策，不负责写代码或判断代码质量。
- Codex 负责审计、拆包、实现、测试、证据、上下文和风险说明。
- 汇报使用中文大白话，同时给出可复核文件、命令和 PASS/FAIL。
- 不用“已完成”替代证据；本地 PASS、已上传、已部署、观察中和生产 PASS 必须分开。
- 每轮只做一个小而完整的问题；发现 P0/P1 时先报告并最小修复，不借机扩展无关模块。
- 生产权限即使被长期批准，也不取消平台安全审批、精确身份、preflight、回滚和证据门禁。
- 不创建自动审批 Agent 代替用户或平台授权。
- 污染清理分三类：确定无引用且已有 replacement 的删除；用途不明的隔离；仍有消费者的登记到 Legacy Capability Atlas 后受控替换。

## 18. 唯一下一入口

```text
V2-M2.1-PRE-MOVE-BREAKOUT-REPLAY-KERNELS
```

目标只在冻结的 `M2DetectorReadInput` 和 19 个 test-only fixture 上实现 Pre-Move 与 Breakout/Retest 的多空/UNKNOWN 纯函数内核、reason/counter-hint 与确定性重放。外部 M1.5-B1 固定 31 周期 early Shadow 在可信通道恢复后并行，随后进入 M1.7；在 M1 工程出口前不得启动 Detector runtime、读取 M1 authority、写 Candidate Store、接入页面、生成等级/Signal/Plan 或使用 Outcome。

## 19. 活跃记忆维护规则

- 本文件最多 400 行，只保留当前事实。
- 易变生产事实没有 fresh evidence 就写 UNKNOWN，不沿用旧状态。
- 最近事件只保留 3 次；更早细节从 Git、交付报告和脱敏证据读取。
- 不写 raw log、真实业务行、secret、token、密码、私钥或未脱敏环境值。
- 蓝图改变项目事实时更新；纯实现细节进入 Changelog 和交付报告。
