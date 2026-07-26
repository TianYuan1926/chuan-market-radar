# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-26 / V2 M1.4C + M2.1A Local Contracts and A0 Engineering Materials

### 本轮目标

在 M0.5 设计修订之后，把 Microstructure Fact/Feature/Cache 与双向前兆研究图谱落成本地合同，同时先建立 M1.5C/M1.5D 前的 A0 工程材料硬门禁，继续关闭 Candidate、Signal、READY 和生产权限。

### 修改范围

- M1.4C 实现六类 Microstructure Fact、LiquidityWallEpisode 生命周期、十三项 Market Mechanics Feature、exact source/identity/cutoff/freshness lineage，以及 ONLINE 与两个独立 REPLAY 的语义一致性。
- 缓存合同冻结 L1 进程内、L2 Redis、L3 PostgreSQL、L4 COS 的 12 行 artifact policy；missing 不得变 0，stale 不得变 fresh，缓存不可取得 Decision authority。
- M2.1A 实现八族各自 LONG/SHORT/UNKNOWN 共 24 个 DRAFT/UNCALIBRATED 假设，禁止用同一 Feature 的正负翻转冒充双向机制。
- 研究 Gate 强制三 Outcome、point-in-time 板块关系、逐 family-direction 四 Venue/三 regime/三 liquidity segment、matched control、消融、sealed holdout、forward Shadow、rights 和独立审计。
- 修复既存 M3.4-R1 草稿与当前 strict schema 的 import、枚举和 fixture 兼容阻断；只恢复全仓编译与回归，不把定向测试为 0 的草稿标成 M3.4 出口。
- Provider Adapter 改入正式 adapter 边界并锁定 exact host/role/REST schema；Live Transport 补齐并发启动、停止结算、有界丢弃、超时、重连和 future-time 拒绝测试。exact Node 22 完整 CI 进一步发现负责 Promise 结算的 timeout 被错误 `unref`，已根治并以修复提交 `2ae438b394d289a05f02dbfa0c2846cd2194ea37` 复验。
- A0 第一批锁定 Node `22.23.1`、npm `10.9.8` 和全部直接依赖，升级 Next/PostCSS/Sharp 安全补丁，删除未使用的 `shadcn` CLI/MCP 依赖和死 CSS 导入。
- 新增许可证门禁、CycloneDX SBOM、零高危审计、GitHub Action/runner/base-image pin、ESLint + Biome 和 Sharp/PostCSS 原生烟测；蓝图升级到 v1.46、机器矩阵升级到 v1.51。
- 首次 GitHub Ubuntu Full Quality `30198990064` 与 Signed Dispatch `30198990079` 均在同一 host tar `--uid=0` 兼容点失败；没有掩盖红灯。提交 `29ab47dec0b9fbbbe66e1cfe7ce90aa2e1e4c25d` 已用纯 Node USTAR 根治四个活跃 V2 Bundle 的宿主方言依赖，Legacy 历史制品保持冻结。
- Signed Dispatch `30199692352` 已在 Ubuntu PASS；Full Quality `30199692349` 随后暴露 checkout depth-1 无法读取 M0 审查祖先。提交 `1d5638d0fb538bacec09086ec7b719d9e7a85ce9` 已改为完整 Git 历史，A0 门禁会阻止该配置回退，M0 失败会输出具体失败检查。
- 路线机器门禁把当前本地 A0、独立生产 P0R、A0 后 Scope V2 Shadow 和外部历史权利 Gate 分开表达；任一入口身份、阻断关系或生产权限漂移都会让 M0 失败。

### 核心链路影响

`Point-in-time Fact -> Market Mechanics Feature -> Bidirectional Research Hypothesis` 已有本地可执行合同和 fail-closed Gate，工程材料第一批与跨平台归档本地根因治理已收口。A0 总门禁仍缺修复提交上的 exact Node 22 远端 PASS、独立 secret/SAST/镜像扫描、性能/资源、完整制品 provenance/回滚和 P0R 真实恢复；真实 Trade/Book/Liquidation forward data、Detector Candidate、cohort/holdout、校准和最终决策链仍未形成，因此系统等级仍是 R1，不能支撑实战。

### 验证结果

- M1.4C Microstructure + Cache 定向 22/22 PASS。
- M2.1A Precursor Atlas 定向 13/13 PASS。
- exact Node `22.23.1` / npm `10.9.8` 修复后完整 `ci:production` PASS：Market 969 total / 965 pass / 4 explicit skip、Workers 23/23、Historical 4/4、V2 Foundation 588 total / 582 pass / 6 explicit skip、V2 Ops 139/139、M0、Next production build、Golden 16/16 与 security 全部通过。
- USTAR 定向 `2/2`、Production Dispatch `21/21`、Expanded Shadow `59/59`、ESLint、Biome、`git diff --check`、secret pattern、forbidden-file、零漏洞审计、SBOM 与原生材料烟测 PASS；A0 总门禁仍为 `INCOMPLETE`，修复提交上的 GitHub 远端 exact-runtime PASS 尚待取得。

### 是否部署

未部署。没有修改生产服务、数据库、Redis、Worker、env、Feature Flag、数据、GitHub main 或任何业务 authority。

### 风险与遗留问题

M1.5D 尚未执行；没有历史 L2 时只能从启用时前向积累。当前真实 Microstructure 样本、三 Outcome cohort、matched control 结果、跨 regime 校准和 untouched holdout 均为 0，不得宣称前兆图谱有效。A0 不能因材料子门禁 PASS 而减数；M3.4-R1 仍缺独立定向测试和 Scope V2 上游证据。

### 下一轮建议

P0R 继续作为生产第一关键路径。先关闭 A0 剩余工程门禁，再准备 M1.5C 与 M1.5D 同一 exact release 的 Scope V2 证据包，并保持两套状态和证据独立验收；通过后进入 M1.6-D1，再用真实 forward evidence 建设 M2.4A cohort/holdout。

## 2026-07-24 / V2 M3.1A-D Four-Lane Multi-Asset Decision Research Contract

### 本轮目标

把 Bitget、上新暖机、单股永续和指数/ETF 永续正确接入 Scope V2 的 Analysis、Independent Qualification 与 Strategy 合同，避免四条新增范围在决策层重新混为一套。

### 修改范围

- 新增四条 exact decision lane，分别锁定 Venue、asset domain、lifecycle、family、instrument identity 与 listing/identity epoch。
- 新增 Listing/Venue Event 和 Equity Event/Basis family/pattern；CFD、RWA、watch、prelaunch、maintenance、suspended 和 delisting 对象禁止进入。
- Analysis 分开 evidence/setup/integrity blocker；非方向硬前提不能投 LONG/SHORT，支持与有效反证并存时阻断。
- Evidence 与 Setup 使用两份独立 calibration；校准只可在 exact segment 内跨 instrument 复用，最低 60 样本、3 regime、冻结阈值、一次 untouched holdout 和无 future leak。
- Cost、Reference Price、Policy 和 Draft 全部内容寻址；不可得成本为 null，禁止 0 补缺。股票缺 session、公司行动、FX、reference、闭市 basis、规格或成本即弃权。
- Strategy 使用精确价格数学、结构 stop 外扩、gross/net RR；未验证 Fib、低 RR、未来 artifact、哈希篡改和极端输入均 fail closed。

### 核心链路影响

形成 `Scope V2 lane -> Analysis -> Independent Evidence/Setup Qualification -> Domain Strategy Research Draft` 的严格本地合同。它不读取 M1 生产 authority，不替代 M2.3/M2.4 真实 cohort/holdout，也不生成 Signal Grade、READY 或交易权限。

### 测试结果

- Analysis 10/10。
- Qualification 7/7。
- Strategy 11/11。
- 定向合计 28/28；TypeScript 和新文件 ESLint 通过。
- 正式实施分支完整 `ci:production` PASS：V2 Foundation 494 total / 488 pass / 6 explicit skip、V2 Ops 131/131、M0 11/11、Next production build、Golden 16/16 与 security 全部通过。

### 是否部署

未部署。生产服务、数据库、Redis、Worker、env、Feature Flag、数据和业务 authority 零变更。

### 风险与遗留问题

真实 M2.3A/B Detector、M2.4A/B cohort/untouched holdout、M3.1A-M3.3D 校准、M3.4-R1 Feasibility、M3.5 Risk、M3.6 Runtime 均未完成。本包只能标记 research contract scaffold PASS。

### 下一轮建议

完成精确提交和 GitHub 同步；随后恢复生产 P0R 第一关键路径，并在 no-authority 工程线上继续积累 Scope V2 runtime 与真实 cohort 前置证据。

## 2026-07-24 / V2 M3.4-R0 Scope Rebase Governance Gate

### 本轮目标

在继续执行可行性实现前，把 Bitget、上新生命周期、股票合约和数据最大化四条新增能力轴强制接入 M3.4 的正式范围与证据链，防止旧草稿用三 Venue、单一 crypto 逻辑或测试阈值获得交易权限。

### 修改范围

- 新增纯治理门禁；它只判断某个范围能否进入后续 M3.4 实现，不能生成 Candidate、Signal、Strategy、READY 或交易计划。
- 四条能力轴分别记账，任何一条缺失都不能被其他能力替代；Bitget 固定进入 Venue 分母，上新使用系统冻结的 `ANNOUNCED_WAITING_CATALOG`、`OBSERVED_UNCONFIRMED`、`PRE_LAUNCH_OR_PREOPEN`、`TRADING_WARMUP`、`ESTABLISHED`、维护/限制/暂停/下架/离线和 unresolved 生命周期。
- 股票类合约必须额外证明交易时段、休市/隔夜 basis、公司行动、FX、underlying reference、成本和流动性边界；CFD、RWA watch、跨市场观察对象不能冒充可交易股票合约。
- 所有 PASS 证明必须绑定 Scope V2、Venue、asset domain、lifecycle、release、evidenceId 与 SHA-256；禁止跨 Venue、跨资产域、跨生命周期或跨 release 借用证明。
- 旧 M3.4 草稿保持隔离：当前 typecheck 有 3 个失败、无测试、仍是三 Venue 且缺 Scope epoch、asset domain、listing warm-up 和股票专项校准，因此不能提交或作为基线。
- P0R exact plan、13 个 Bundle 成员和腾讯 staging hash 已重新核验一致；生产 HEAD、容器、listener、timer、health、`/dev/shm` 与恢复容器/卷均保持只读基线。

### 核心链路影响

形成 `Scope V2 -> M3.4-R0 Governance Gate -> Domain-Sealed Calibration -> M3.4 Feasibility` 的唯一入口。新增市场范围被正确纳入后续工程，但本包不声称任何新增范围已经具备实战能力。

### 测试结果

- M3.4-R0 定向合同 12/12 PASS。
- 新实现 ESLint 0 error / 0 warning。
- 正式实施分支身份下完整 `ci:production` PASS：V2 Foundation 466 total / 460 pass / 6 explicit skip、V2 Ops 131/131、M0 11/11、Next production build、Golden 16/16 与 security 全部通过。

### 是否部署

未部署。生产服务、数据库、Redis、Worker、env、Feature Flag、数据和业务 authority 零变更；P0R 仍因缺少新的 7200 秒 exact-plan STS 而未执行。

### 风险与遗留问题

M3.4-R0 只是范围与证据门禁，真正的多资产可执行性数学、分域阈值、股票市场微观结构、上新 warm-up 校准、Shadow 和生产验收仍未完成。P0R 必须在实际操作时新生成 STS，并只进入服务器 `/dev/shm`。

### 下一轮建议

完成精确提交与 GitHub 同步后，集中完成 P0R 的一次性 STS、加密备份、精确版本取回、隔离 PostgreSQL 16 恢复和清理。M3.4 后续只能基于本门禁重新实现，不能修补旧草稿后直接放行。

## 2026-07-24 / V2 M1.4B Endpoint Batching, Runtime Adapter and Listing History

### 本轮目标

把 R3 exact live conformance 与 M1.4A 逐标的调度合同接成内容寻址、可批处理、可恢复但仍无 authority 的 Runtime Adapter 核心和腾讯固定派发包，并把 Bitget、上新、股票合约和数据最大化正确落到独立验收链。

### 修改范围

- 从 exact conformance artifact 生成绑定 registry/probe digest、HTTPS endpoint、分页、credential、恢复和 source-cutoff 的 Profile；TEST_ONLY 生成零 Profile。
- 将 source-capability 的 ready intent 精确一次合并；snapshot batching 与 listing-history bootstrap 使用两本请求预算。
- 建立 Bybit provider-available history 和 Bitget 官方一个月窗口的 bootstrap、resume、gap、incremental 状态机；token、ordinal、segment、内容冲突和 future knowledge 全部 fail closed。
- Bitget Venue、Listing Lifecycle、Equity Asset Domain、Data Maximization 四轴独立记账；股票当前只做 catalog accounting，tradable Fact 为 0。
- 纠正 15/15 endpoint conformance 与 14/15 scheduler route eligibility 的差异；Binance spot registry 仍为 `UNAVAILABLE`，不能进入 batch 或 Shadow。
- 新增无 secret、内容寻址 Bundle/Runner/Entrypoint；14 个 route 跨五来源有界运行，同源并发 1，执行前后绑定生产 HEAD、容器、listener、timer 和 health。
- 新增 request/envelope/bundle 跨层预检，在上传前拒绝 source ref、commit、approval hash、entrypoint、staging 和运行时限漂移；此前 5400 秒外层窗口与不在目标机 allowlist 的 source ref 都会本地失败。
- blocked segment 不晋级 checkpoint；续跑必须绑定原 checkpoint、精确 `PASS` result 路径和 SHA-256，失败、孤儿或被篡改结果均拒绝。

### 核心链路影响

`Live Source Conformance + Adaptive Intent -> Route-Eligible Profile -> Bounded Batch/Listing Checkpoint -> Exact Fixed Dispatch` 已完成腾讯 bootstrap 与 checkpoint-bound resume。它形成有界 no-authority 证据链，不形成持续 Collector、Fact、Candidate、Strategy、READY 或生产 authority。

### 测试结果

- M1.1B 回归 26/26 PASS。
- M1.4A 回归 28/28 PASS。
- M1.4B 定向 23/23 PASS。
- M1.4B 腾讯 fixed-dispatch package 9/9 PASS；包含四轴分母、零 blocked-route 请求、同源并发 1、Bundle 无 secret/无额外 payload、宿主不变、失败不晋级 checkpoint 和 PASS-result 续跑绑定。
- 正式实施分支完整 `ci:production` PASS：V2 Foundation 494 total / 488 pass / 6 explicit skip、V2 Ops 131/131、M0 11/11、Next production build、Golden 16/16 与 security 全部通过。
- 腾讯 bootstrap `m1-4b-runtime-live-20260723t232457z` 与 checkpoint-bound resume `m1-4b-runtime-live-20260723t233213z` 均为 14/14 route PASS、0 failed、1 registry blocked、request budget/attempts=203/80、listing gap=0 和两个 committed checkpoint；第二轮绑定第一轮 checkpoint 与原 `PASS` result。

### 是否部署

已执行无 authority 的隔离证据包并只保留脱敏 result/checkpoint；未部署 V2 应用，也未改变生产服务、数据库、Redis、Worker、env、Feature Flag、业务数据或 authority。生产 HEAD、clean worktree、11 容器、listener、timer 与 health 前后不变，两次 staging 均删除。

### 风险与遗留问题

M1.5C 四 Venue多资产持续 Shadow、M1.6-D1 扩展容量、Binance spot registry 新 digest 复验和股票 session/公司行动/FX/reference/basis/成本事实均未完成。M1.4B 四轴 PASS 只证明本包有界分母；股票 tradable Fact 仍为 0，不能宣称股票实战能力。

### 下一轮建议

Scope V2 下一证据包进入 M1.5C Four-Venue Multi-Asset Shadow，再用真实事实率进入 M1.6-D1。P0R 的 fresh 7200 秒 exact-plan STS 仍是独立生产第一关键路径。

## 2026-07-24 / V2 M1.1B0 Tencent Live Source Conformance Dispatch Package

### 本轮目标

把 M1.1B 的 15 个探针做成腾讯固定生产派发通道可以安全执行的无密钥、内容寻址、只读且失败关闭的 exact-release 包。

### 修改范围

- Bybit 公告 B0 固定为 `type=new_crypto` 最新两页 `BOUNDED_COMPLETE` 一致性窗口，完整历史移交 M1.4B bootstrap/checkpoint/gap/incremental；Bitget 保持 `annType=coin_listings` 官方一个月窗口和完整 cursor。
- 五个来源组跨来源并行、同一来源严格串行；每页 12 秒超时、8 MiB 上限及 85 秒探针 deadline 全部进入摘要。
- 新增确定性 bundle、目标机 runner、固定 entrypoint、独立最小 TypeScript 编译和 Zod 4.4.3 最小运行树。
- CoinGlass Hobbyist key 只从目标机受限生产 env 读取并进入一次性子进程，不进入 Git、运输、staging、日志、artifact 或 result。
- 执行前后绑定 production HEAD、clean worktree、容器 ID、listener、timer 和 health；任何变化均失败关闭。
- request 通过后的前 artifact 故障必须持久化脱敏 phase/reason；Bitget Venue、Listing Lifecycle、股票 Asset Domain 分别记账，不能合并成一个能力状态。
- R1 现场证明固定 Node `--jitless` 的 Web Fetch 因不可用 WebAssembly 统一失败；R2 保留 `--jitless + MemoryDenyWriteExecute`，改用 TLS 验证、exact-host、无重定向、12 秒超时和 8 MiB 上限的 Node core HTTPS live 传输，Fetch 仅保留 TEST_ONLY。
- R2 现场只剩 Binance 现货目录超出 8 MiB；R3 仅改用官方 `showPermissionSets=false` 有界查询，不提高上限、不放宽 schema、不删探针。

### 核心链路影响

形成 `M1.1B local contract -> no-secret fixed dispatch -> Tencent LIVE_READ_ONLY B0 -> M1.4B live-passed Adapter` 的唯一入口；不产生 Fact、Candidate、Strategy 或 READY。

### 测试结果

- R2 定向 package tests 24/24 PASS。
- 确定性 bundle、secret 拒绝、身份/窗口篡改拒绝、blocked result、前 artifact 脱敏失败结果和 staging cleanup 均 PASS。
- 固定派发回归 21/21、V2 Ops 125/125 PASS。
- R2 独立正确分支克隆完整 `ci:production` PASS：V2 Foundation 422 pass / 6 skip、V2 Ops 125/125、M0、Next build、Golden 16/16 和 security 全部通过。
- R3 定向 package 24/24、固定派发 21/21、V2 Ops 125/125 和独立正确分支完整 `ci:production` PASS；V2 Foundation 422 pass / 6 skip、M0、Next build、Golden 16/16 与 security 全部通过。
- 本地 14 个公开探针的 reset/timeout 只登记为 `LOCAL_UNCOMMITTED_DIAGNOSTIC_NOT_AUTHORITY`。

### 是否部署

首次派发在业务 artifact 前阻断。R1 精确提交与派发形成 0/15 共同 `TRANSPORT_FAILURE_UNAVAILABLE` 证据。R2 精确提交 `d557c666e2e27b67842354b869a64271c91ceae1` 与派发 `m1b0-r2-live-source-20260723t165411z` 形成 14/15。R3 精确提交 `06c1fd1fe0559dfed2097d1d64cb94382973ec62`、bundle `8483d1b8111cc34ddbf745f5fb44739a95c6b47de102f1d524589aef52407dc5` 与派发 `m1b0-r3-live-source-20260723t175033z` 已在腾讯取得 15/15，Identity、Listing、CoinGlass Gate 全部 PASS。artifact=`source-conformance:5a6d0c06c7085db00380f746`；现场生产 HEAD、clean worktree、11 个容器、listener、timer 和 health 前后保持基线，`productionChanged=false`、`secretMaterialPresent=false`，staging 已删除。

### 风险与遗留问题

M1.1B0 只关闭 exact source conformance。M1.4B runtime Adapter、Bybit 完整 listing history、四 Venue Shadow、扩展容量和持续 SLO 尚未完成；股票目录可达也不能证明 session、公司行动、FX、reference、basis、成本或股票实战能力。

### 下一轮建议

本地进入 M1.4B，只为 R3 live PASS capability 建设 endpoint batching/runtime Adapter，并单独验收 Bybit listing 历史 bootstrap/checkpoint/gap/incremental。P0R 继续保持独立生产第一关键路径。
