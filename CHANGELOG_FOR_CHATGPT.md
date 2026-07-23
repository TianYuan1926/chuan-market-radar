# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

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

## 2026-07-23 / V2 M3.3 Strategy Construction

### 本轮目标

把六族 Analysis 与 Signal Qualification 转换成结构来源完整、成本可审计、RR 可重算的 StrategyDraft；缺字段时必须弃权，不生成占位价格。

### 修改范围

- 新增六族 long/short 独立 template、entry/stop/target、confirmation、expiry、no-chase 和 partial take-profit policy。
- 新增 BigInt 定点价格与加权 gross/net RR 算法；负 funding 不得提高草案 RR。
- `StrategyDraft v2` 增加 family/authority/analyzer/qualification/reference/buffer/cost/RR lineage。
- stop 从结构失效 base 向风险侧扩大；低 RR 只增加 blocker，禁止缩止损。
- M3.0 对 Strategy scope、level/price/fact lineage 与 RR/cost 进行二次重算。

### 核心链路影响

加固 `Analysis -> Qualification -> StrategyDraft -> Final Decision`，但当前只形成带 blocker 的 test-only 草案，不产生 READY。

### 测试结果

- M3.3 20/20、M3.2 18/18、M3.1 21/21、M3.0 22/22，合计 81/81 PASS。
- 全 V2 360/0/6 explicit skip；ops 115/115；typecheck、严格 ESLint 和 `git diff --check` PASS。
- 完整 `ci:production` PASS，退出码 0；forbidden-file、secret-pattern、recurrence、production-dispatch、typecheck、lint、Legacy/Worker/historical、V2 Foundation、V2 Ops、M0 zero-drift、Next build、Golden 16/16 和 security check 全部通过。

### 是否部署

未部署；生产应用、数据库、Redis、Worker、migration、env、Feature Flag、数据与业务 authority 零变更。

### 风险与遗留问题

真实 buffer/cost、historical cohort、untouched holdout、scope authority、Execution Feasibility、Risk 和 runtime 均未完成；当前 Draft 永远 `TEST_ONLY_UNCALIBRATED`。

### 下一轮建议

本地进入 M3.4 Execution Feasibility；生产线仍只允许 fresh STS、P0R 恢复与 fresh P0。

## 2026-07-23 / V2 M3.2 Evidence and Setup Qualification

### 本轮目标

把 Evidence Grade 与 Setup Grade 建成两个独立、可审计、可弃权的资格层，并清理 Deep Validation 上游等级、Candidate Priority 继承、总分补偿和无样本概率等错误权威关系。

### 修改范围

- `EvidencePackage v2` 删除 `tier`，新增 required/supplemental criticality、independence group、精确 completeness 与 fresh truth。
- `AnalysisSnapshot v3` 新增 `spaceQuality`；六族 Analysis 必须显式解释剩余结构空间。
- `SignalQualification v2` 新增 exact Thesis/Context/Family/Direction/Policy/Authority、独立 Evidence/Setup assessment 和双 Calibration Reference。
- 校准 schema 要求真实 cohort、untouched holdout、至少 60 样本、至少三个 regime、当前 segment、概率/CI/reliability error 和无 abstain；未校准必须保持 0/null 并解释弃权。
- M3.0 增加 Qualification identity、scope authority 和 calibration-abstain blocker；runtime schema 拒绝 assessment 与 grade 不一致的人工上调。

### 核心链路影响

加固 `Deep Validation -> Family Analysis -> Evidence/Setup Qualification -> 后续 Strategy`，但不实现真实 calibration、Strategy、runtime 或 READY。

### 测试结果

- M3.2 18/18、M3.1 21/21、M3.0 18/18，合计 57/57 PASS。
- 全 V2 336/0/6 explicit skip；ops 115/115。
- 完整宿主 `ci:production` PASS：Legacy 965/965、Worker 23/23、historical、M0、Next build、Golden 16/16 和 security 全部通过。
- 受限沙箱仅因两个 Worker 监听 `127.0.0.1` 返回 `EPERM`；未改门槛，宿主原样通过。

### 是否部署

未部署；生产应用、数据库、Redis、Worker、migration、env、Feature Flag、数据与业务 authority 零变更。

### 风险与遗留问题

当前 builder 永远 `TEST_ONLY_UNCALIBRATED / NO_DECISION_AUTHORITY`。真实 Deep Validation runtime、cohort/holdout calibration、Strategy、Feasibility、Personal/Portfolio Risk 和 M3 runtime 仍未完成。

### 下一轮建议

本地进入 M3.3 Strategy Construction Contract；生产线仍只允许 fresh STS、P0R 恢复和 fresh P0。

## 2026-07-23 / V2 M1.6-P0R Production Resume Preflight and Truth Cleanup

### 本轮目标

从生产现场重新确认 P0R 唯一有效入口，清除现行合同中的旧 Object Lock/age/transport 状态，并在签发新 STS 前识别所有 staging 与 `/dev/shm` 残留。

### 修改范围

- 两份现行 M1.6/P0R 合同已从“Object Lock 白名单未开、age 身份未创建”纠正为 `COMPLIANCE 31d + age Keychain + exact transport PASS`，STS、真实恢复和 fresh P0 继续关闭。
- 腾讯主机只读复核确认当前唯一入口为 source `bed938566d242394de7f6c31b309bd9f8198b71f`、run `p0r-20260721t183927z-221b4eebbf2ab34191c63608771b21ea`；manifest 禁止生产/数据库/服务/仓库 mutation。
- 现场同时发现一个已覆盖旧 staging、16 个 `/dev/shm` 旧 P0R 辅助/占位文件和一个诊断临时文件；`p0r-sts` 为 0 字节，没有读取任何可能的凭证内容。用户在动作时确认后，这三类残留已按精确路径删除。

### 核心链路影响

只修复 `Market Fact + Quality -> Runtime Truth -> Recovery` 的现场真值和执行入口，不改变 scan、analysis、strategy、backtest、前端或生产业务。

### 测试结果

- V2 Foundation：317/317 PASS，6 个合同明确 skip。
- V2 Ops：115/115 PASS，Go helper PASS。
- JSON parse、diff check 和 Context 400 行上限 PASS。
- 生产 clean-baseline 复核：诊断文件 absent；staging 仅剩根目录和当前 exact run；`/dev/shm` 普通文件为空；当前 run 的执行文件仍完整存在。

### 是否部署

未部署、未签发 STS、未上传对象、未读取数据库、未执行恢复，生产应用与数据 mutation=0；通过 Edge/OrcaTerm 执行只读 inventory、manifest/binding/hash 核对，以及用户明确确认的三类精确残留清理。

### 风险与遗留问题

clean pre-STS baseline 已通过；既往短期 STS 全部失效且不得复用。当前剩余风险是尚未创建新的 exact-plan STS，也尚未执行 COS 对象、加密备份、精确取回、隔离恢复和最终 cleanup。

### 下一轮建议

进入 fresh 7200 秒 exact-plan STS 的即时 server-side compile，然后只执行绑定计划的受限上传、加密备份、精确取回、隔离 PG16 恢复和 cleanup。

## 2026-07-23 / G0 Signed Pull-Only Production Dispatch First Acceptance

### 本轮目标

完成固定 pull-only 通道的首个真实签名派发，证明普通无 secret Bundle 可脱离 OrcaTerm 上传和前台会话完成 publish、pull、验签、独立启动与 package acceptance，同时保持生产业务零漂移。

### 修改范围

- 新增首单 acceptance runner 与可复现 Bundle：只读检查 production HEAD/worktree、11 个容器、health、前后端合同、Redis 和 timer；仅两个精确 Docker 读调用使用 `sudo -n`，没有把 `ubuntu` 加入 Docker 组。
- 前三次 dispatch 全部保留为失败：第一次为 Docker socket permission；后两次为人工抄录 64 字符容器 ID 错误。最终使用目标机排序机器文件和 exact diff，未降低身份门禁，也未复用失败 dispatch。
- `g0-first-signed-exact-20260722t211117z` 绑定 source `5a98c7d2783a2e74e36fec47541a2b9f2d7eada4`、Bundle `5e263bb5...`、request `b8168ed6...`，发布 commit `467ce8e2156aabe399ca61211b232c9d81294c4e`。
- 目标机返回 `PASS_SESSION_INDEPENDENT_RUNNER_LAUNCHED` 与 `PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE`；普通无 secret Bundle 的运输和独立启动正式退出 OrcaTerm 文件上传路径。
- 生产 HEAD/worktree、11 容器身份、ready/fresh/persistence、Redis PONG、timer enabled/active 前后不变，应用、DB、Redis、Worker mutation 均未尝试，staging 自动清理。
- `RECURRENCE_ROOT_CAUSE_GATE` 当前 2 CLOSED / 0 open；OrcaTerm 长特殊字符命令和普通 Bundle 上传继续永久退役。P0R STS/MFA 仍使用 `/dev/shm` 独立边界，不能进入 Git Bundle。

### 核心链路影响

只加固整条核心链路的 Runtime Control / Deployment 地基；不改变机会发现、判断、计划或排序能力，G0 主步骤仍为 7。

### 测试结果

- `test:production-dispatch`：21/21 PASS。
- `test:recurrence-gate`：9/9 PASS；2 CLOSED / 0 open、violations=0，active operation 恢复为 `shadow_capture_activation`。
- 完整 `ci:production`：PASS，退出码 0；market 965/965、Worker 23/23、historical backtest 4/4、V2 Foundation 317/317、V2 Ops 115/115、M0 zero-drift、build、Golden 16/16 和 security check 全部通过。受限沙箱曾因禁止监听 `127.0.0.1` 让两个 Worker 测试返回 `EPERM`；未改测试，宿主原样重跑通过。

### 是否部署

已安装并验收腾讯生产 Runtime Control：首单从 publish 到 acceptance 约 10 秒，状态为 `PRODUCTION_OPERATIONAL_FIRST_SIGNED_DISPATCH_ACCEPTED`。生产应用、数据、业务容器和 authority 零变更；P0R STS/MFA 仍通过 `/dev/shm` 独立处理。

### 风险与遗留问题

固定通道只解决普通无 secret 运输和独立启动，不替代业务包自身的 lease、回滚、生产验证或观察；人工长身份抄录禁止复用，旧 `approved_orcaterm_bundle_upload` request 必须重生为 `signed_git_bundle`。

### 下一轮建议

回到当前最高优先 P0R 恢复准入与既定 V2/G0 顺序；默认使用固定通道运输普通无 secret 包，不重复首单验收。
