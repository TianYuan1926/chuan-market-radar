# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

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

首次派发在业务 artifact 前阻断。R1 精确提交与派发形成 0/15 共同 `TRANSPORT_FAILURE_UNAVAILABLE` 证据。R2 精确提交 `d557c666e2e27b67842354b869a64271c91ceae1` 与派发 `m1b0-r2-live-source-20260723t165411z` 已形成 14/15：Identity/CoinGlass PASS，Listing 因唯一 `BINANCE_SPOT_CATALOG` 失败而 BLOCKED；现场生产 HEAD、clean worktree、11 个容器、listener、timer 和 health 保持基线，`productionChanged=false`、`secretMaterialPresent=false`。

### 风险与遗留问题

R3 完整 CI、exact commit/push、fresh 生产身份绑定和腾讯 15/15 重派发尚未完成。股票目录可达也不能证明 session、公司行动、reference、成本或股票实战能力；Bybit 两页窗口也不能证明完整 listing history。

### 下一轮建议

先完成 R3 完整 CI 和精确提交，再构建绑定 fresh production identity 的无密钥派发包；只有 live PASS capability 进入 M1.4B，随后由 M1.4B 单独验收 listing 历史回填。P0R 保持独立生产第一关键路径。

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

## 2026-07-23 / V2 M0.4 Expanded Market Scope Amendment

### 本轮目标

把 Bitget、上新/预上新生命周期、无支持合约的新币 watch、可用数据最大化和股票合约正式加入 V2 权威搭建计划，同时阻止旧三 Venue加密证据被误写成新四 Venue多资产能力。

### 修改范围

- 新增 `SCOPE_EPOCH_V1_CRYPTO_3V` 与 `SCOPE_EPOCH_V2_MULTI_ASSET_4V`，所有事实、Detector、cohort、校准、Shadow、决策和发布必须绑定 epoch。
- 新增加密永续、单一股票永续、股票指数/ETF 永续、Equity CFD 和其他 RWA 五个互斥资产域；后两类先 accounting，不自动 eligible。
- 冻结 Binance、OKX、Bybit、Bitget capability 初始矩阵；未验证能力保持 UNAVAILABLE，symbol 和 `isRwa` 不得单独决定资产身份。
- 建立公告、REST catalog、WebSocket instrument update 三路上市状态和 T0-T3 自适应采集策略。
- 新增 Listing/Venue Event 与 Equity Event/Basis 研究族，当前固定 design-only、Candidate 禁发。
- 把下一本地入口改为 M1.1A Four-Venue Capability Registry；当前未提交 M3.4 草稿暂停并等待 scope rebase。

### 核心链路影响

扩大 `全市场发现 -> 深扫验证 -> 决策 -> 复盘` 的目标分母，但不改变 Pre-Move 首要地位、READY 门禁或加密核心。股票和加密在 Portfolio Risk 前保持独立 Context、Detector、holdout、Analysis 和 Strategy。

### 测试结果

- 设计合同、蓝图、机器矩阵、搭建顺序、Context 和 README 已同步。
- JSON 语法、Scope Epoch 完整性、版本引用、Markdown 链接、diff whitespace、secret/forbidden-file 和独立 clean-worktree CI 见本包验证记录。

### 是否部署

未部署。生产服务、数据库、Redis、Worker、Feature Flag、数据和 authority 零变更。

### 风险与遗留问题

Bitget Adapter、股票身份、上市事件采集、四 Venue Shadow、扩展容量、历史 cohort、独立 holdout、Detector、校准、Strategy 和页面均未实现。V1 的 31 周期、C1 和 1,805 Facts/分钟容量结果不能证明 V2。

### 下一轮建议

本地进入 M1.1A，先建立所有 Venue/数据能力的可验证 Registry；生产 P0R 继续作为独立第一关键路径并绑定 V1 exact release。
