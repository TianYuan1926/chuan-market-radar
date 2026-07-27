# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-27 / Fixed Dispatch Timeout Lock Root-Cause Recovery

### 本轮目标

读取旧 P0R 派发的真实目标 receipt，根治固定派发代理在 systemd 超时后遗留空锁、持续拒绝后续包的问题，并恢复低延迟的生产派发通道。

### 修改范围

- 生产 journal 证明 2026-07-26 14:09:36 +08:00 的 Git fetch 在 180 秒后被 systemd `SIGTERM`；空 `agent.lock` 无任何 live owner，随后累计 4,526 次 `dispatch_agent_already_running`。
- agent 的 Git child 改为不可由调用方取消的 90 秒硬上限；SSH 增加连接次数、连接超时和 keepalive 失败边界。
- lock 新增 boot ID、PID、Linux process-start token、acquiredAt 和随机 token；live owner fail closed，dead owner 隔离恢复，空旧锁只在四分钟后恢复。
- governance contract、24 项固定通道回归、复发注册表、运行手册、权威蓝图和生产验收报告同步更新。

### 验收结果

- `npm run test:production-dispatch` 24/24、recurrence gate 9/9 和完整本地 `ci:production` PASS。
- 腾讯隔离 Linux smoke 返回 `PASS_LINUX_AGENT_LOCK_SELF_RECOVERY_AND_EXCLUSION`。
- 生产只替换 agent、Git SSH wrapper 和 README 三文件；旧件和游标保留为可回滚证据。
- 旧 dispatch 被记录为 `FAIL_DISPATCH_NOT_REUSABLE / dispatch_not_current`，无 claim、解包或业务 Runner；随后手动和 timer 轮询均为 `IDLE_NO_NEW_DISPATCH`。
- 生产应用 HEAD/clean worktree、11 容器、Web/PostgreSQL/Redis、六 Worker 和 health 全部零漂移；远端 staging 已精确删除。

### 风险与下一步

本次完成的是生产派发控制面的根因关闭，不是 P0R 完成。旧派发已确认过期、未领取、未执行且禁止复用；下一动作是生成并执行 fresh exact signed read-only rebind，然后才能进入 current-source plan/bundle、fresh `/dev/shm` STS/age、加密 backup、exact retrieval、独立 PG16 restore、cleanup 与 fresh P0。

## 2026-07-27 / V2 M1.4D + M1.5C/M1.5D Local Runtime and Exact Package

### 本轮目标

在 A0/P0R 仍关闭生产 live 执行的前提下，补齐 Scope V2 四 Venue 多资产 Base Fact、M1.5C/M1.5D 两类 31 周期 Shadow runtime、独立证据验证器和同一 exact release 的无密钥腾讯派发包。

### 修改范围

- M1.4D 建立四 Venue catalog/listing watch、identity v2/snapshot v3、T0 lifecycle、T1 wide-market 和 point-in-time Base Fact Snapshot。
- Provider URL、HTTP/WebSocket transport 全部收进 Adapter；Core 仅持 URL hash、分页、超时和字节边界，架构门禁新增 Bitget host。
- M1.5C 固定 31 周期、60 秒 cadence 和四责任轴逐周期分母；M1.5D 固定同 cadence 的 trades/book/mark-index 前向采集及确定性 research/control 选择。
- 新增两套独立 verifier、隔离 PostgreSQL 16 store、combined runtime entrypoint、deterministic Bundle、strict request/envelope、Runner 和 entrypoint。
- Runner 禁止目标 build、source sync、dependency install 及生产 DB/Redis/应用/env/Feature Flag/migration 写入；只有 topology 精确恢复时才允许声明 `productionChanged=false`。
- Binance JSON subscribe endpoint 按 routed stream 语义修正为 `/public/stream` 与 `/market/stream`，并由回归锁定。

### 验收结果

- Base Fact 23/23、Expanded Shadow 70/70 PASS。
- Exact live package 12/12 PASS。
- V2 Ops 192/192、P0R Go package、全 V2 编译测试、typecheck、ESLint、Biome 715 files、forbidden-files 和 secret-pattern 全部 PASS。
- 完整 `ci:production` PASS：V2 Foundation 637 total / 631 pass / 6 explicit skip、V2 Ops 192/192、M0、Next production build、Golden 16/16 与 security 全部通过。

### 是否部署

未部署。M1.5C live cycle=0，M1.5D live cycle=0；腾讯生产服务、数据库、Redis、Worker、Caddy、env、Feature Flag、migration、COS、生产仓库和业务 authority 均未改变。

### 风险与下一步

本地工程 PASS 不代表四 Venue coverage、微观结构 SLO 或容量 PASS。当前生产 Bundle 必须 fail closed，因为 A0/P0R 尚未关闭，且旧 M1.4B/source-conformance evidence 与当前源码不是 same-commit upstream。正确顺序是先完成 P0R 和 fresh P0，再在同一 clean commit 刷新 upstream，执行 M1.5C/M1.5D 两包并分别验收，最后进入 M1.6-D1。

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

未派发或部署本包。腾讯应用、数据库、Redis、Worker、容器、env、Feature Flag、migration、COS 和业务 authority 未由本包改变。当时独立 P0R receipt 尚未读取；该历史未知状态现已由本日志首条的目标核对结果覆盖。

### 风险与下一步

该证据只覆盖三 Venue 约 16.6 分钟目录连续性，不含 Bitget、24h SLO、官方 mapping 完整性、价格或微观结构 Fact、真实 cohort、Detector、Candidate、Strategy 或 READY。P0R 旧包已确认未执行，当前下一生产动作是 fresh signed read-only rebind；A0 总门禁关闭后再启动同源 M1.5C/M1.5D。

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

signed read-only dispatch `p0r-rebind-preflight-20260726t213258z-e77631a3` 当时已发布并过期，现场状态最初保持 `UNKNOWN`。当前 receipt 已证明它未 claim、未解包、未执行，并因过期写入 `dispatch_not_current`；该旧未知结论已失效。仍没有 STS、backup、retrieval 或 restore。

### 下一步

下一入口仍是 `V2-M1.6-P0R-R0-READ-ONLY-SOURCE-REBIND`，但必须生成新的时效派发，禁止复用已消费的旧 commit。生产重绑定 PASS 后才允许从 current source 重建 plan/bundle；fresh STS 与 age identity 只能单独进入 `/dev/shm`，随后才能执行真实 backup、exact retrieval、isolated restore 与 cleanup。

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
