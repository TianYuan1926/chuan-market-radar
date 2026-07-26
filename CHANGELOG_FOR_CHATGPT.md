# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-27 / V2 M2.2-C1 Forward Evidence Refresh and Domain Isolation

### 本轮目标

把 C1 前向目录证据的完整历史复核固化为正式只读验证器，并用 Scope V2 多资产 normalizer 重放最新 raw，防止旧 `CANONICAL_TARGET` 合约形状标签被误写成加密资产域结论。

### 修改范围

- Evidence Store 新增 `READ_ONLY_EXISTING`，验证时不得创建、补写或修复 evidence root。
- 新增完整 journal、artifact/raw 引用、跨轮 continuity、精确文件集、权限、symlink、orphan、partial 与 lock 审计。
- 新增 clean-HEAD CLI，分别绑定 evidence release 与 verifier release，证据完整但连续性不够时仍返回非零 readiness。
- 最新 retained raw 复用 Scope V2 Binance/OKX/Bybit 多资产 normalizer；Bybit 广义 `stock` 缺官方 mapping 时保持 `OTHER_RWA_DERIVATIVE`，不按名称猜单股或 ETF。
- Candidate、Strategy、READY、历史回填、生产写入和交易权限全部保持关闭。

### 验收结果

- 四轮 Batch 全部 `COMPLETE`；4 条 journal、28 个 artifact 引用、12 个 raw 引用和 37 个精确保留文件全部通过。
- Binance/OKX/Bybit 分别保留 845/426/757 行，三家均为 4/4 完整快照、约 998.5-998.7 秒跨度、gap=0 和 `FORWARD_ONLY_READY`。
- Scope V2 重放中，Binance 为 crypto 698、单股 125、指数/ETF 3、其他 RWA 8、unresolved 11；OKX 为 287/131/0/8/0；Bybit 为 crypto 620、其他 RWA 137，其中 133 个只能证明 provider `stock` 大类。三家 normalizer 都是 `PARTIAL`。
- 定向 42/42 与完整本地 CI PASS：Market 965 pass / 4 explicit skip、Workers 23/23、Historical 4/4、V2 Foundation 592 pass / 6 explicit skip、V2 Ops 180/180、M0、Next build、Golden 16/16 和 security 全部通过。
- verifier source 的 A0 `30223737098`、Full Quality `30223737124`、Independent Security `30223737105` 与 Signed Dispatch Quality `30223737131` 全部 PASS。

### 是否部署

未派发或部署本包。腾讯应用、数据库、Redis、Worker、容器、env、Feature Flag、migration、COS 和业务 authority 未由本包改变。独立 P0R dispatch 的目标 receipt 仍未读取，不能从本包推断其现场结果。

### 风险与下一步

该证据只覆盖三 Venue 约 16.6 分钟目录连续性，不含 Bitget、24h SLO、官方 mapping 完整性、价格或微观结构 Fact、真实 cohort、Detector、Candidate、Strategy 或 READY。下一生产动作仍是先只读取得 P0R 目标 receipt；A0 总门禁关闭后再启动同源 M1.5C/M1.5D。

## 2026-07-27 / V2 M1.6-P0R Read-Only Source Rebind

### 本轮目标

根据当前源码与服务器历史 staging 的真实差异，阻止 superseded P0R 包被误执行，并建立无 secret、只读、可签名派发的现场重绑定入口。

### 修改范围

- 历史 `bed938...` staging 的成员、manifest、plan、bindings 和摘要继续保留为审计事实，但状态改为 `REJECTED_SUPERSEDED_SECURITY_SOURCE`，禁止执行、复用或绑定新 STS。
- 根因是其三个目标机运行文件早于单句柄 `O_NOFOLLOW`、独占输出和有界读取修复；本地 bundle builder 也早于确定性 Node USTAR。
- source parts `408803e0bdc21051124a + 79e307db8e9eb39c793c` 新增 deterministic no-secret rebind bundle、strict request、精确只读命令 allowlist、single-use runner、staging 自动清理和脱敏 evidence。
- 重绑定核对生产 Git、容器、timer、listener、health、`/dev/shm`、P0R container/volume、腾讯 metadata `/32` 摘要与历史 staging 全成员；生产身份前后必须零漂移。
- 证据发布改为同目录临时文件加原子硬链接，任何同名结果直接失败，不能覆盖已有证据。

### 验收结果

- rebind package `9/9 PASS`。
- 完整 P0R `70/70 PASS`，Go COS helper PASS。
- 完整本地 CI PASS：Market 965 pass / 4 explicit skip、Workers 23/23、Historical 4/4、V2 Foundation 584 pass / 6 explicit skip、V2 Ops 179/179、M0、Next build、Golden 16/16 与 security 全部通过。
- exact-source Full Quality `30219999104`、A0 Release Qualification `30219999094` 与 Independent Security `30219999063` 全部 PASS；Security 明确证明 Gitleaks finding=`0`、CodeQL untriaged=`0`、Trivy HIGH/CRITICAL=`0`。
- 三条远端工作流均声明 `production_execution=false`、`production_mutation=false` 且未使用生产凭证；该结果关闭源码资格前置，不等于腾讯现场重绑定完成。

### 是否部署

signed read-only dispatch `p0r-rebind-preflight-20260726t213258z-e77631a3` 已发布并过期；目标 receipt 未读取，故现场是否领取、启动或完成都是 `UNKNOWN`。没有 STS、backup、retrieval、restore 或生产 mutation 的确认回执；不能写执行 PASS，也不能写“确定未执行”。

### 下一步

下一入口仍是 `V2-M1.6-P0R-R0-READ-ONLY-SOURCE-REBIND`，但必须先只读取得已发布 dispatch 的目标 receipt；若已有结果则先验收，若未领取才生成新时效派发。生产重绑定 PASS 后才允许从 current source 重建 plan/bundle；fresh STS 与 age identity 只能单独进入 `/dev/shm`，随后才能执行真实 backup、exact retrieval、isolated restore 与 cleanup。

## 2026-07-27 / V2 A0 Reproducible Release and Resource Baseline

### 本轮目标

在同一 exact source 上关闭 A0 的可重复制品/回滚与冻结性能资源基线，不放宽门槛、不减少样本，并让完整质量和独立安全重新验收最终源码。

### 修改范围

- 新增最小 Collector application capsule，只包含冻结运行闭包、一个必需诊断、精确 runtime package 和内容寻址 manifest；两次序列化必须字节一致。
- 新增两个独立 no-cache Buildx RootFS、canonical tree、exact image configuration、non-root 身份、read-only/no-network fail-closed smoke 和三个隔离 release-pointer rollback 场景。
- 新增冻结三 Venue、1,440 eligible instrument 工程负载：5 次 warm-up、12 次 cold、60 次 incremental；延迟、CPU、event-loop、RSS、heap 和吞吐预算全部预先冻结。
- 保留并根治远程红灯：Buildx RootFS ownership、合法 POSIX 路径、两处 evidence TOCTOU 和 event-loop p99 超限。证据读取改为单 `O_NOFOLLOW` 句柄前后 `fstat`；Collector 在四个既有重阶段间 cooperative yield。
- 没有减少 instrument 分母、样本、Collector 工作、CodeQL 查询或安全扫描，也没有提高 `200 ms` event-loop p99 门槛。

### 验收结果

- source parts `9ef63b85d1a76f3ad7ac + 815e081506c5dbc074a5` 的 A0 run `30217335595` 两个 job 全部 PASS。
- release provenance job `89833713538`：双 RootFS canonical digest、双 application capsule、exact image config、runtime smoke 和三个 rollback scenario 全部 PASS；artifact `8636196061`。
- performance job `89833713570`：cold/incremental latency p95=`183.731/44.944 ms`，event-loop p99=`64.750 ms`，throughput p05=`31,510.967 instruments/s`，heap/RSS=`140.406/232.801 MiB`；artifact `8636187635`。
- 同源 Full Quality `30217335543`、job `89833713330` PASS；Market 965 pass + 4 explicit skip、Workers 23/23、Historical 4/4、V2 Foundation 584 pass + 6 explicit skip、V2 Ops 170/170、M0、Next build、Golden 16/16 和 security 全部通过。
- 同源 Security `30217335622` 三 job 全部 PASS：Gitleaks finding=0、CodeQL untriaged=0、Trivy HIGH=0/CRITICAL=0。

### 核心链路影响

A0 的材料、供应链、独立安全、可重复制品/回滚和冻结性能资源控制均已关闭。性能证据仍是 `TEST_ONLY_ENGINEERING_RESOURCE_BASELINE_NOT_LIVE_MARKET_CAPACITY`，不能证明四 Venue Scope V2、腾讯宿主机、真实 Provider 或 PostgreSQL 容量。

### 是否部署

未部署。腾讯生产未读、未写；服务、数据库、Redis、Worker、Web、Caddy、COS、env、Feature Flag、migration、GitHub main 和业务 authority 均未改变。

### 风险与下一步

A0 总门禁仍为 `INCOMPLETE_P0R_PENDING`，唯一剩余控制是 P0R 真实加密离机备份、精确 COS version 取回、独立 PostgreSQL 16 restore parity 和 cleanup。P0R 关闭前 M1.5C/M1.5D 继续 blocked。

## 2026-07-27 / V2 M1.4C + M2.1A Local Contracts and A0 Materials/Security

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
- 新增许可证门禁、CycloneDX SBOM、零高危审计、GitHub Action/runner/base-image pin、ESLint + Biome 和 Sharp/PostCSS 原生烟测；完成独立安全验收后，蓝图升级到 v1.48、机器矩阵升级到 v1.53。
- 首次 GitHub Ubuntu Full Quality `30198990064` 与 Signed Dispatch `30198990079` 均在同一 host tar `--uid=0` 兼容点失败；没有掩盖红灯。提交 `29ab47dec0b9fbbbe66e1cfe7ce90aa2e1e4c25d` 已用纯 Node USTAR 根治四个活跃 V2 Bundle 的宿主方言依赖，Legacy 历史制品保持冻结。
- Signed Dispatch `30199692352` 已在 Ubuntu PASS；Full Quality `30199692349` 随后暴露 checkout depth-1 无法读取 M0 审查祖先。提交 `1d5638d0fb538bacec09086ec7b719d9e7a85ce9` 已改为完整 Git 历史，A0 门禁会阻止该配置回退，M0 失败会输出具体失败检查。
- Full Quality `30200077285`、job `89788386319` 已在 exact HEAD `dc5e1823d08ac5a2d1630f3989257e735f829695` 的 Ubuntu 24.04 完整 PASS；SBOM artifact `8631398374` digest=`sha256:ba6de688e0b2163ccc7f17c06e39c9ef35406eb98235d744a137d849cb57e241`。exact-runtime remote CI 控制项正式完成。
- 独立安全工作流已固定 full-history Gitleaks `8.30.1`、CodeQL action `4.37.3` + linked bundle `2.26.1` + JS query pack `2.4.1` + `AlertSuppression.ql`、exact collector image 与 Trivy `0.72.0`。Gitleaks 只接受 exact historical fingerprint；CodeQL suppression 只接受 exact rule/file/alert-line/review/invariant 且源码紧邻。
- exact source `4f501b0fb8b917ce87e0687eab8480b5c9595f27` 的 Security `30209898205` 三 job 全部 PASS：完整历史 secret finding=0；CodeQL result=8、reviewed=8、blocking=0；镜像 HIGH=0、CRITICAL=0。脱敏 artifact `8634143821`、`8634167593`、`8634153873` 已核验。同源 Full Quality `30209898207`、job `89814245105` PASS。
- 收口提交后的 Security `30211083028` 如实保留 Gitleaks 红灯：新交付报告两次连续写入审查提交 SHA，被误判为 Sourcegraph token。artifact `8634464899` 已证明精确位置；v4 审查只增加两个历史 fingerprint，当前报告/矩阵改为两段 20-hex，材料门禁和 M0 同时阻止连续 40-hex 回归。
- 修复 source parts `9f6d4731e6afbf0a68d3 + 2a98df64da179f20d84a` 已由 Security `30212437973` 和 Full Quality `30212437974` 复验：Gitleaks finding=0、CodeQL 8/8 reviewed 且 blocking=0、Trivy HIGH/CRITICAL=0；四个脱敏 artifact 与 SBOM 均已核验，生产 mutation=false。机器门禁现在同时绑定失败事故、精确历史 fingerprint、分段身份和修复后收据。
- 长期治理补充 `DYNAMIC_BLUEPRINT_POSITIVE_ADJUSTMENT_GATE` 与 `GENERALIZATION_AND_ANTI_OVERFIT_GATE`：施工顺序可按当前事实正向调整，但核心、上下游追踪、测试、安全、恢复与验收不能降级；模型、规则、阈值、币种、Venue、时间和 regime 过拟合均被统一阻断。
- 路线机器门禁把当前本地 A0、独立生产 P0R、A0 后 Scope V2 Shadow 和外部历史权利 Gate 分开表达；任一入口身份、阻断关系或生产权限漂移都会让 M0 失败。

### 核心链路影响

`Point-in-time Fact -> Market Mechanics Feature -> Bidirectional Research Hypothesis` 已有本地可执行合同和 fail-closed Gate，工程材料、跨平台归档、exact-runtime remote CI 与独立 secret/SAST/镜像扫描已收口。A0 总门禁仍缺性能/资源、完整制品 provenance/回滚和 P0R 真实恢复；真实 Trade/Book/Liquidation forward data、Detector Candidate、cohort/holdout、校准和最终决策链仍未形成，因此系统等级仍是 R1，不能支撑实战。

### 验证结果

- M1.4C Microstructure + Cache 定向 22/22 PASS。
- M2.1A Precursor Atlas 定向 13/13 PASS。
- exact Node `22.23.1` / npm `10.9.8` 最终树完整 `ci:production` PASS：Market 969 total / 965 pass / 4 explicit skip、Workers 23/23、Historical 4/4、V2 Foundation 589 total / 583 pass / 6 explicit skip、V2 Ops 153/153、M0、Next production build、Golden 16/16 与 security 全部通过。
- A0 materials `10/10`、repository hygiene + CodeQL evidence `56/56`、ESLint、Biome、M0 与 remote-equivalent Gitleaks PASS；accepted source 的 GitHub Security/Full Quality PASS，后续失败 run 仍按上一条单独保留、不冒充 PASS。A0 总门禁仍为 `INCOMPLETE`，下一缺口为性能资源、完整 provenance/rollback 和 P0R。

### 是否部署

未部署。没有修改生产服务、数据库、Redis、Worker、env、Feature Flag、数据、GitHub main 或任何业务 authority。

### 风险与遗留问题

M1.5D 尚未执行；没有历史 L2 时只能从启用时前向积累。当前真实 Microstructure 样本、三 Outcome cohort、matched control 结果、跨 regime 校准和 untouched holdout 均为 0，不得宣称前兆图谱有效。A0 不能因材料子门禁 PASS 而减数；M3.4-R1 仍缺独立定向测试和 Scope V2 上游证据。

### 下一轮建议

P0R 继续作为独立生产第一关键路径。A0 下一工程包把同一 exact release 的制品 provenance/rollback 与性能/资源基线合并建设，减少重复构建和远端操作但不合并验收；三项 A0 剩余控制全部关闭后，才准备 M1.5C 与 M1.5D 同源 Scope V2 证据包并保持两套状态独立验收。

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
