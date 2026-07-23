# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

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
- blocked segment 不晋级 checkpoint；续跑必须绑定原 checkpoint、精确 `PASS` result 路径和 SHA-256，失败、孤儿或被篡改结果均拒绝。

### 核心链路影响

`Live Source Conformance + Adaptive Intent -> Route-Eligible Profile -> Bounded Batch/Listing Checkpoint -> Exact Fixed Dispatch` 已形成本地工程链；没有腾讯持续网络执行、真实 checkpoint、Fact、Candidate、Strategy、READY 或生产 authority。

### 测试结果

- M1.1B 回归 26/26 PASS。
- M1.4A 回归 28/28 PASS。
- M1.4B 定向 23/23 PASS。
- M1.4B 腾讯 fixed-dispatch package 9/9 PASS；包含四轴分母、零 blocked-route 请求、同源并发 1、Bundle 无 secret/无额外 payload、宿主不变、失败不晋级 checkpoint 和 PASS-result 续跑绑定。
- 正式实施分支完整 `ci:production` PASS：V2 Foundation 454 total / 448 pass / 6 explicit skip、V2 Ops 131/131、M0、Next production build、Golden 16/16 与 security 全部通过。

### 是否部署

未部署。生产服务、数据库、Redis、Worker、env、Feature Flag、数据和 authority 零变更。

### 风险与遗留问题

GitHub 实施分支同步、腾讯隔离 no-authority runtime、真实 Bybit/Bitget checkpoint、请求率/配额/完整分母、Binance spot registry 新 digest 复验、M1.5C 和 M1.6-D1 均未完成。

### 下一轮建议

同步 GitHub 实施分支后，用 exact package 在腾讯执行 no-authority Adapter/listing runtime。P0R 的 fresh 7200 秒 exact-plan STS 仍是独立生产第一关键路径。

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

## 2026-07-23 / V2 M1.4A Adaptive Multi-Asset Collector Contracts

### 本轮目标

把 Bitget、上新/无合约资产 watch、股票类合约和 CoinGlass Hobbyist 正确接入 Scope V2 自适应采集计划，避免新增范围只留在文字蓝图或与旧三 Venue 证据混用。

### 修改范围

- 新增 T0 catalog/event、T1 wide market、T2 candidate burst、T3 deep validation 四级有界调度合同。
- Bitget 固定为第四 Venue 分母；listing watch 只进入 T0；股票类合约进入独立 asset domain，缺 session/corporate-action capability 时失败关闭。
- live B0、外部人工 rights review、entitlement、jurisdiction、CoinGlass Hobbyist、quota/429/auth/source failure、checkpoint、backoff/circuit 均显式门禁。
- 基础扫描保留位先于跨来源 burst，随后按 fairness cursor 轮转；超量意图保留为 deferred，不截断分母。
- T2/T3 Candidate 必须有同 tier、同 capability matched control；Candidate/control 必须是 exact eligible established derivative。
- subjects、grants、quota、checkpoints 和 policy 五组输入均进入内容寻址 lineage。

### 核心链路影响

`Source Capability + Multi-Asset Identity -> bounded collection intent plan` 已形成独立合同，但没有 Provider 调用、Fact、Candidate、Strategy、READY 或 runtime authority。

### 测试结果

- direct TypeScript compile PASS。
- 定向合同 28/28 PASS；包含 400 subject 四 Venue全量 T0/T1 accounting。
- 新实现 ESLint PASS。
- 完整独立 Git clone `ci:production`：PASS；V2 Foundation 424 total / 418 pass / 6 explicit skip，V2 Ops 115/115，M0、Next build、Golden 16/16 和 security 全部 PASS。

### 是否部署

未部署。生产服务、数据库、Redis、Worker、env、Feature Flag、数据与业务 authority 零变更。

### 风险与遗留问题

腾讯 live B0 未执行；股票 session/corporate-action 当前 registry 仍 blocked；M1.4B batching/runtime Adapter、四 Venue Shadow、扩展容量和分域校准未完成。每意图 1 token 仍是保守预算上界。

### 下一轮建议

提交推送 M1.4A 后，准备 M1.1B0 无 secret 固定派发 runner/bundle；M1.4B 只能接入 live B0 实际 PASS 的 capability。P0R 继续作为独立生产第一关键路径。

## 2026-07-23 / V2 M1.1B Exact Source Conformance + Multi-Asset Identity

### 本轮目标

把 M1.1A 的来源登记转为可执行探针、Bitget 与四 Venue 多资产身份、股票防误判和上新生命周期，同时保持旧 V1 与 Candidate/Strategy authority 完全隔离。

### 修改范围

- 冻结 15 个精确只读探针，分别形成 8 项 identity、6 项 listing 和 1 项 CoinGlass Hobbyist Gate；fixture 强制 `TEST_ONLY`，不能产生 live PASS。
- 新增四 Venue catalog normalizer、Bitget、多资产 identity snapshot、官方 underlying mapping、listing/identity epoch 与 symbol reuse 防线。
- 新增 Bybit/Bitget announcement normalizer 和 lifecycle ledger；不从标题猜 symbol，完整目录缺失不推断 delisting。
- 股票外观 symbol、Bitget `isRwa=YES` 和 Bybit `symbolType=stock` 均不能静默区分单股/ETF；Bybit 费率组 `G9` 明确禁止作为 instrument 类型。
- P0R 生产第一关键路径、M3.4 冻结草稿和 V1 证据边界均保持不变。

### 核心链路影响

建立 `Capability Registry -> Live Source Conformance -> Multi-Asset Identity/Listing -> Adaptive Collector` 的唯一扩展入口；本包不写 Market Fact、Candidate、Signal、Strategy 或 READY。

### 测试结果

- 全新隔离工作区 TypeScript 编译 PASS。
- M1.1B 定向合同 22/22 PASS；空目录、adapter row schema 漂移、时钟漂移、分页重复、缺 key、计数/Gate/摘要篡改和资产误分类均有拒绝测试。
- 完整 `ci:production` 已在排除冻结 M3.4 草稿的全新隔离快照通过，退出码 0；V2 Foundation 396 项、V2 Ops 115 项、Next production build、Golden 16/16 和 security check 全部通过。

### 是否部署

未部署、未执行 live B0。生产服务、数据库、Redis、Worker、env、Feature Flag、数据和业务 authority 零变更。

### 风险与遗留问题

腾讯隔离 live B0、真实四 Venue/地区/Hobbyist 可用性、M1.4B runtime Adapter、四 Venue Shadow、扩展容量、分域校准和生产 authority 均未证明；M1.4A 只完成 no-authority 本地合同。

### 下一轮建议

先绑定 exact clean commit 执行腾讯隔离 `LIVE_READ_ONLY` B0；只让实际 PASS 的 capability 进入 M1.4B runtime Adapter。生产 P0R 继续独立推进。

## 2026-07-23 / V2 M1.1A Four-Venue Source Capability Registry

### 本轮目标

把 Bitget、上新币种、股票永续和可用外部数据正确纳入同一 V2 搭建计划，建立不能漏项、不能把官方文档冒充运行能力的来源登记表。

### 修改范围

- 新增 4 Venue + CoinGlass Hobbyist、33 类能力、165 行 source-capability 穷举登记；缺失、重复、证据错绑、摘要篡改、套餐越权和 secret 均 fail closed。
- 每行记录 endpoint/channel、事实语义、鉴权/套餐、限速、分页、历史、推送、point-in-time/replay、权利、实现/live 状态、成本、失败和 no-stale fallback。
- Bitget 正式进入 Venue 分母；合约/现货上新进入 T0 listing watch；股票永续进入独立 equity asset domain。
- 根据最新官方资料纠正 M0.4：Binance、OKX、Bybit、Bitget 均有股票/TradFi 永续产品证明，但 Scope V2 Adapter/live/session/corporate-action 仍未证明。
- 下一本地包升级为 M1.1B 超级包，内部先 B0 exact source conformance，再 B1 multi-asset identity/listing。

### 核心链路影响

来源能力、套餐和缺口成为 `Universe -> Fact -> Detection -> Validation` 的统一前置合同；不改变 Pre-Move 优先级，不产生任何 Candidate、Strategy 或 READY。

### 测试结果

- M1.1A 定向合同 8/8 PASS。
- 165/165 组合、110 个官方文档行、57 个 unavailable/unlicensed、Scope V2 runtime PASS=0，registry violations=0。
- 完整 `ci:production` 在排除冻结 M3.4 草稿的真实分支隔离快照通过。

### 是否部署

未部署；没有网络能力探测。生产服务、数据库、Redis、Worker、env、Feature Flag、数据和业务 authority 零变更。

### 风险与遗留问题

Bitget、股票和 listing Adapter 尚未实现；CoinGlass 除明确页面外仍需 Hobbyist exact-plan 探测；四 Venue live、Shadow、容量和分域校准均未证明。

### 下一轮建议

执行 M1.1B0/B1 本地超级包；生产 P0R 继续作为独立第一关键路径，M3.4 草稿保持冻结。
