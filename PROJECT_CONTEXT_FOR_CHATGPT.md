# Market Radar 项目总览交接文件

生成日期：2026-07-17
用途：给外部架构审计员 / ChatGPT 快速理解项目全景、边界、生产状态、代码结构、测试状态、未解决问题和下一步方向。  
敏感信息策略：所有密钥、连接串、服务器密码、cookie、token、私钥均视为 `[REDACTED]`。本文不包含真实 secret。

## 0. 最新生产事实快照

- 2026-07-17 `WP-G0.2-LEGACY-PENDING-DRAIN-PRODUCTION` 首次真实执行结果为 **FAIL / P0 rollback closeout incomplete**，不能写成 drain PASS。执行绑定 local commit=`381cd7be9a7c9f793b55953aa11eb976da2d3ae7`、Bundle SHA-256=`270ccaad8661a84bffcccd23141e9fad453aa7ca0e9dcbd511454cc778bb4826`，生产取得 fencing token 14 后停止 scanner；因仍存在 `scan:lock:*`，在数据库 preflight、epoch open、临时 Web/worker 之前安全失败。独立只读核查证明数据库始终是 migration 10、`candidate-episode-v1 / legacy / frozen / epoch4`、outbox=5,914、completed=2,957、pending/unresolved=2,957，Candidate worker absent；production Git/tree=`cec0b657...`/`eb217a7...`、env/Compose 指纹、Web image=`sha256:cd3652c1...`、scanner image=`sha256:b11c0cec...` 均恢复基线，Redis scan lock=0，扫描后续推进到 `completedAt=2026-07-17T14:10:25.013Z`，health=`ready/fresh`。真实缺陷是 rollback health 只等 600 秒，短于 scanner 900 秒 cadence；随后 runner 又用租约系统不接受的 `ROLLBACK_FAIL` outcome 释放，导致 active lease 保留，并把证据错误拼成 `ROLLBACK_FAIL\nROLLBACK_PASS`。本地最小修复现已固定 Redis 锁只读等待 660 秒、基线新扫描/ready/fresh 等待 1,200 秒、回滚不完整时保留租约并只写 `ROLLBACK_INCOMPLETE_LEASE_RETAINED`、回滚状态单值化；定向 20/20、隔离 PostgreSQL 16、typecheck、零 warning lint、market 1027/0/7、build、Golden 16/16、三项安全门禁和 Autonomy 31/31 均 PASS，runner artifact=`597abb94ac3192b8bdd9fe64f4a5f8841fe036b47eeb5ddf316766144d32a357`，formal 未运行。新修复尚未 commit-bound、未生成新 Bundle/request、未重试生产；G0 主步骤仍为 8，当前只能写 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-17 生产 Add Schema 后的独立只读聚合核查确认：migration=10，唯一 control=`candidate-episode-v1 / legacy / epoch 4 / writeFrozen=true / approvedRelease=candidate-shadow-e5eb90026d8b`，Candidate worker absent；Candidate 数据是 episodes=543、events=2,957、outbox=5,914，其中 completed=2,957、pending=2,957、claimed/retry_wait/quarantined/resolutions=0、unresolved=2,957。该 pending 不是“空队列”，因此旧的相邻 Validation Cycle Continuation 包已被 fail closed 地 supersede，cycle-2 在排空前禁止启动。`WP-G0.2-LEGACY-PENDING-DRAIN-REMEDIATION-LOCAL-SUPERPACKAGE` 已建立只排旧 pending、暂停 scanner/阻断新 source write、同 control 同 release 临时 `epoch 4 legacy/frozen -> epoch 5 shadow_capture -> epoch 6 legacy/frozen`、任何 retry/quarantine/partial 均失败的治理和 runner；定向 11/11、隔离 PostgreSQL 16 migrations 1-10 的 4 条 pending 全排空且 sourceWritesAdded=0、outboxDeleted=0、最终 legacy/frozen epoch6、typecheck、零警告 lint、market 1026/0/7、workers 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS，formal 未运行。该本地 PASS 不等于生产 2,957 条已排空；生产仍未修改，系统仍只能写 `R1 / 可运行但不完整 / 不能支撑实战`。G0 路线按当前事实审计为还剩 8 个主包：生产 pending drain、排空后相邻 cycle-2 启动与积累、多周期 Lineage+Reconciliation、Shadow Verify 发布/阶段/24h 双读、Canonical Compat+最终 Cutover、Candidate 收口与 G0.3-G0.5、统一长观察、G0 Exit Audit。
- 2026-07-17 `WP-G0.2-CANONICAL-ROLLBACK-SAFETY-PRODUCTION-ADD-SCHEMA` 已在生产真实 PASS。最终执行绑定 commit=`26d01d1a44280236e0f0b298c22b44500133238a`、tree=`7de9d6a608f42ce824b0ff4cc183453bb3f54c24`、deterministic Bundle SHA-256=`9b7ac0e9ab1b26a9a3f2fdd1bffecca8d99e75f61087693bf468f47154080a9f` 和单次 request SHA-256=`6e5ed1b46343a76c4d2be7a9ab82b52f504f958eeb9b51975020433118cf5eef`；生产从精确 ledger 001-009 只应用 `010_candidate_canonical_rollback_safety` 到 10，function owner=`candidate_migration_role`、least privilege=true、Candidate 业务数据 mutation=false。两份旧身份请求先后因 Web image 与 production Git identity 漂移在 lease/DB 前 fail closed，最终以实际 dormant baseline `cec0b657...`、Web image `sha256:cd3652c1...` 成功；fencing token=13 已以 PASS 释放，staging/ops/临时凭据/上传临时文件已清理，独立 restage verify 再次 PASS。生产 Git/tree/Web/全部容器执行前后不变，health=`ready/fresh`、Postgres/Redis/scanner/三份合同 PASS、Candidate worker absent。生产 control 当前是 `candidate-episode-v1 / legacy / epoch 4 / writeFrozen=true`，该状态在 migration 前已形成，不能归因于 Add Schema；Canonical rows=0。原始生产证据目录保留，脱敏 archive SHA-256=`bdf27244d973e7083f22e09a024b4cb35ddb7188359bab13835d2b36938da70a`。当前仍只能写 `R1 / 可运行但不完整 / 不能支撑实战`；最新只读事实已证明必须先完成 pending-only drain，再刷新相邻 Validation Cycle Continuation，不能直接跳到 cycle-2 或 Canonical Compat。
- 2026-07-17 `WP-G0.2-CANONICAL-ROLLBACK-STATE-MACHINE-REMEDIATION-LOCAL-SUPERPACKAGE` 已完成本地实现。审计确认 migration 009 的 phase graph 允许 `canonical_compat -> canonical`，但没有 `canonical -> legacy` 受控恢复边；在该缺口关闭前直接 Cutover 会成为只能 fail closed 503、不能恢复旧读取的单向门。新增 migration 010 只增加 `candidate_authority.rollback_canonical_migration_control_v1`：仅 `candidate_migration_role` 可把 active canonical 的精确 epoch 推进一代并回到 `legacy/frozen`，PUBLIC/应用角色、stale epoch、非 canonical、重复回退和坏 approval digest 全部拒绝，Candidate 业务数据不变；001-009 内容/checksum 未改，历史 009 runner 继续冻结到九文件 fixture 并会拒绝含 010 的当前仓库。治理和历史 runner 定向 57/57、隔离 PostgreSQL 16 migrations 1-10、`canonical epoch 9 -> legacy/frozen epoch 10`、权限与数据保留、Autonomy 31/31、typecheck、零警告 lint、market 1026/0/7、workers 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS；formal 未运行。该段的“生产 1-9、010 未执行”历史状态已被上方 Add Schema production PASS 取代；当前生产 ledger 已为 1-10，但 Canonical Cutover 仍受后续生命周期验证门禁阻断，系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-17 `WP-G0.2-CANONICAL-COMPAT-PHASE-TRANSITION-AND-OBSERVATION` 已完成本地实现并达到 `ready_for_gate`，生产未连接、phase 未切换、观察未开始。工具包只有在完整 Dual Read 289 样本/至少 24 小时/零差异证据与同一 migration/release、Lineage、Reconciliation、Web code release、clean detached 身份全部一致时，才允许从 `shadow_verify` 进入 `canonical_compat`。进入后 Candidate 仅在当前公共 API 请求 parity PASS 时成为候选生命周期与复盘读取权威；任何 fallback、partial、unavailable、全分页 Raw Oracle 差异、身份漂移或健康退化都会失败并自动回到 `legacy/frozen`，关闭全部 Candidate flags、停止 Candidate worker并保留数据/Git/Web image。Phase 定向 20/20、Canonical domain 105 pass / 0 fail / 3 explicit PostgreSQL skip、隔离 PostgreSQL 16 的 10,000 门槛/phase transition/rollback/data preservation、Autonomy 31/31、typecheck、零警告 lint、market 1026/0/7、workers 23/23、historical 4/4、build、Golden 16/16 与三项安全门禁均 PASS；formal 未运行。4 份过期 Canonical 机器合同已同步为“代码授权 true、phase/cutover 仍禁止”。当前本地 PASS 不等于生产 Canonical Compat、Canonical Cutover、WP-G0.2 或 G0 完成；本包推送后，G0 按主路线预计还剩约 7 个可审计主包，等待窗不能缩短或伪造。
- 2026-07-17 `WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION` 已完成本地实现并达到 `ready_for_gate`，生产未连接、phase 未切换、观察未开始。工具包只有在可信 Lineage 至少 10,000 条/两个 release、Reconciliation 零差异零重复零未解决、Web 代码发布 PASS、生产 clean detached `eb48827...` 和 shadow_capture 身份完全一致时才允许进入一次性 90 分钟 mutation。成功路径只改变三个 Candidate 读取 flag、root-owned manifest、既有 control procedure 和 no-build Web recreate；每个样本用数据库时钟，在同一 `SERIALIZABLE READ ONLY DEFERRABLE + candidate_audit_role` 快照内遍历全部 1,000 条分页并与独立 Raw Oracle 比较，必须精确 289 样本/至少 24 小时/最大间隔 600 秒/零差异，API 响应权威始终是 Legacy。失败自动回滚；切 phase 后的安全目标是 `legacy/frozen`、全部 Candidate flags 关闭、Candidate worker 停止、数据保留，且不宣称可直接续跑旧周期。合同与定向测试 19/19、隔离 PostgreSQL 16 迁移 1-9、10,000 条门槛、phase transition/rollback/data preservation、typecheck、零警告 lint、全量 market、build、Golden 16/16、三项安全门禁和 Autonomy unit 31/31 均 PASS；formal 未运行。当前本地 PASS 不等于生产 Shadow Verify、24 小时观察 PASS、Canonical Compat、Canonical Cutover、WP-G0.2 或 G0 完成。按主路线，G0 仍约 9 个可验收主步骤；其中等待窗口可并行准备后续本地包，但不能缩短或预填正式证据。
- 2026-07-17 `WP-G0.2-SHADOW-VERIFY-CODE-AUTHORIZATION-PRODUCTION-RELEASE` 已完成本地 commit=`9163eabd07c98df90f16ff974332added947424d` 并推送工作分支，生产未连接、未上传、未执行。发布目标是 baseline=`54837d03d0fb91b33cf9919bd25ab7aaad60dd7e` 的精确单父 3 文件 commit=`eb48827b8b403452328b65dc4b415c3fc0ecf765`，只包含 Candidate Read 授权常量及两组状态机测试；目标分支定向 22/22、typecheck、零警告 lint、build 和三项安全检查全部 PASS。生产工具只允许保存 rollback Web image、构建 Web、`--no-deps --no-build --force-recreate web` 和 1800 秒至少 61 样本观察；Candidate worker、scanner-worker、数据库、Redis、env、Compose、migration、Feature Flag、phase、read-authority manifest 和其它容器必须保持不变。确定性 Bundle、单次 Standing Grant request、transient systemd 入口、成功演练和 build 失败自动回滚共 6/6 PASS；原授权合同/域测试 37/37、Autonomy 31/31、typecheck、零警告 lint、market 1026/0/7、workers 23/23、historical 4/4、build、Golden 16/16、三项安全门禁与提交前自治总门禁 13/13 均 PASS，`worktreeUnchanged=true`。真实执行仍硬性等待可信 Lineage 至少 10,000 条和生产 Reconciliation 零差异/零重复/零未解决；当前本地 PASS 不等于生产 Web release、Shadow Verify、Canonical Cutover、WP-G0.2 或 G0 完成。
- 2026-07-17 `WP-G0.2-SHADOW-VERIFY-CODE-AUTHORIZATION-LOCAL-SUPERPACKAGE` 已达到本地 `ready_for_gate`。编译期 Candidate Read 状态机能力已显式启用，但 `legacy/shadow_capture` 仍只返回 Legacy；`shadow_verify` 必须绑定 Reconciliation PASS、可信数据库 phase、root-owned manifest、唯一 flags 和同一 `SERIALIZABLE READ ONLY DEFERRABLE` 快照 parity，且响应权威仍是 Legacy。公开请求不能控制 phase/flags/evidence/release，authority fingerprint 读取后必须复核；任何缺失或漂移继续返回 Legacy 或 503。定向合同与域测试 37/37、Canonical Read/Raw Oracle/Trusted Context 三套隔离 PostgreSQL 16、Autonomy 31/31、typecheck、零警告 lint、market 1026/0/7、workers 23/23、historical 4/4、build、Golden 16/16、三项安全门禁和自治总门禁 14/14 均 PASS，`worktreeUnchanged=true`。生产未连接、未部署、phase 未切换，当前不等于 Shadow Verify 或 G0 完成。
- 2026-07-17 `WP-G0.2-FRESH-VERIFICATION-CYCLE-LINEAGE-CAPTURE-PRODUCTION-PACKET` 已完成本地 commit=`464c301ddd8ccd63f75b2e9f56dfed4e8ccaa223` 并推送工作分支。确定性脱敏运输包两次生成 SHA-256 均为 `a75ce76c3d5342a94d4dfa1777b99350530dfef785f94b422b53934f087140d6`；最终提交后自治总门禁 15/15 PASS，`worktreeUnchanged=true`。生产采集只允许 `REPEATABLE READ READ ONLY + candidate_audit_role`，输出仅保留 Lineage、9 个来源文件哈希、数据库只读身份、租约与运行身份；生产未连接、未上传、未执行。真实执行仍被 Activation、累计 10,000 和新鲜相邻周期三项外部前置阻断。
- 2026-07-17 `WP-G0.2-FRESH-VERIFICATION-CYCLE-LINEAGE-CAPTURE-LOCAL-SUPERPACKAGE` 已完成 commit=`9472529` 并推送工作分支。共享 Lineage builder/validator 把 Activation 289 原始样本、累计达到 10,000 的前一周期至少 7 样本/1800 秒/2 次推进、严格相邻新周期独立至少 7 样本/1800 秒/2 次推进、全部 Candidate control 和按 release 写入计数重算为 `candidate-multi-cycle-lineage-evidence.v1`。新周期 startedAt 必须晚于累计 PASS 最后样本；历史 control 必须 Legacy/frozen/even，当前必须唯一 shadow_capture/odd；outside-lineage 和所有未决状态必须为 0。输出包含 7 个原始证据内容哈希，Reconciliation Bundle 复用同一 validator 并与 Activation 重算 final 交叉绑定。定向 6/6、Reconciliation packet 12/12、隔离 PostgreSQL 16 两 release 10005+15=10020、只读审计角色和血缘外写入拒绝、typecheck、干净 lint、market 1025/0/7、workers 23/23、historical 4/4、build、Golden 16/16、三项安全门禁和自治总门禁 13/13 均 PASS；生产未连接、未执行。
- 2026-07-17 `WP-G0.2-RECONCILIATION-MULTI-CYCLE-LINEAGE-REMEDIATION-LOCAL-SUPERPACKAGE` 已完成 commit=`55e7de1` 并推送工作分支。旧 Reconciliation 的单周期过滤和 Candidate Worker absent 死点已关闭；runner/governance 13/13、production packet 11/11、PostgreSQL 16 两周期各 5,000 条/合计 10,000 条零差异、基础、安全和提交后自治总门禁 14/14 全部 PASS。生产未连接、未执行；该完成只表示本地多周期核对能力成立，不等于生产累计、Lineage、Reconciliation、Shadow Verify 或 G0 完成。
- 2026-07-17 `WP-G0.2-VALIDATION-CYCLE-CONTINUATION-PRODUCTION-PACKET` 已完成 commit=`54837d03d0fb91b33cf9919bd25ab7aaad60dd7e` 并推送工作分支；最终脱敏可复现 Bundle SHA-256=`49e93e5d7ee18f30304e64ac2dd82c0f9717ed02f06a8c387298c27e677009a9`，未上传、未执行。定向、PostgreSQL 16、基础、安全和提交后自治总门禁 15/15 全部 PASS，`canAutoDeploy=false`。Microsoft Edge/OrcaTerm 最近一次只读生产证据为 observer active、96/289，sampledAt=`2026-07-17T04:26:21.264125+08:00`、全局 completed writes=1481、health ready/scan fresh/Postgres/Redis/workers healthy、cycle1 shadow_capture/epoch3/unresolved0。Activation、生产周期续接、10,000 条累计、Reconciliation、Shadow Verify、WP-G0.2 和 G0 均未完成。
- 2026-07-17 `WP-G0.2-VALIDATION-CYCLE-CONTINUATION-LOCAL-SUPERPACKAGE` 已完成本地实现、提交前/提交后 14/14 自治总门禁，已 commit=`bf2af47e11966dbf1ad80087c1cb11b95c7aff98` 并推送工作分支，生产未连接、未执行。单周期 72 小时与真实 10,000 条及三段 24 小时门禁的数学冲突已通过不可变多周期续接收口；旧 deadline、全部 Candidate 数据和门槛保持不变。该修复不等于生产续接、Reconciliation、Shadow Verify、WP-G0.2 或 G0 完成。
- 2026-07-17 `WP-G0.2-SHADOW-VERIFY-RUNTIME-WIRING-LOCAL-SUPERPACKAGE` 已完成本地实现、定向/基础/安全门禁、Autonomy unit 31/31 和自治总门禁，已 commit=`a9f4feaed7125be6577659ed24f3d8aeb9e1f3ff` 并推送工作分支；生产未连接、未部署、未切换 Candidate authority。新增 `/api/frontend/candidate-lifecycle` 只读 API，将 Canonical Read Model、独立 Raw Oracle、Trusted Context 和 Route Adapter 接成真实运行时；公开请求只能控制 limit 和完整 cursor pair，authority/release/phase/evidence/flags 全部由服务端可信上下文绑定。Monitor DB 或 root-owned manifest 缺失时返回 503，不用空数据或 stale fallback 冒充成功；Candidate 查询使用 `candidate_audit_role + SERIALIZABLE READ ONLY DEFERRABLE`，statement timeout=12 秒，严格短于 HTTP data deadline=15 秒，AbortSignal 进入数据库事务。编译期 `CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED=false` 保持不变，现有 Review API/页面、scan/analysis/strategy/RR/plan、migration、Compose、env、Redis 和 Worker 均未修改。接线 32/32、Canonical domain 103 pass / 0 fail / 3 explicit PG skip，三项独立 PostgreSQL 16 演练实际 PASS；typecheck、干净 lint、market 1021 pass / 0 fail / 7 explicit DB skip、workers 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁 PASS。最近生产只读证据仍只是 observer active、70/289；因此 Activation、Reconciliation、Shadow Verify、WP-G0.2 和 G0 均未完成。
- 2026-07-17 `WP-G0.2-RECONCILIATION-PRODUCTION-PACKET` 已达到本地 `ready_for_gate`，生产未连接、未查询、未部署。当前执行包要求从原始 289 个观察样本重算最终证据并精确匹配 final/closeout 哈希，拒绝少于 24 小时、采样间隔超过 600 秒、无完成写入或身份漂移；生产查询只能在 `REPEATABLE READ READ ONLY` 事务内 `SET LOCAL ROLE candidate_audit_role`，PASS 必须至少 10,000 条、0 difference、0 unresolved、0 duplicate 且 phase 不变。Production packet 9/9、runner/governance 12/12、Autonomy 31/31、PostgreSQL 16 真实 10,000 条隔离演练、typecheck、干净 lint、market 1017 pass / 0 fail / 7 explicit DB skip、workers 23/23、historical 4/4、build、Golden 16/16、三项安全门禁与提交前自治总门禁 13/13 全部 PASS。Edge/OrcaTerm 最近只读证据仍只是 observer active、61/289；因此 Activation、生产 Reconciliation、WP-G0.2 和 G0 均未完成。
- 2026-07-17 `WP-G0.3-G0.5-SECURITY-RELEASE-INCIDENT-LOCAL-SUPERPACKAGE` 已以 commit=`d2ee45fce1e30b7ddcfa7e59155fb17ce896f85d` 推送工作分支，生产、DNS、TLS、env、secret、数据库、Worker 和 Candidate authority 均未改变。审计确认生产源码默认仍是 `CHUAN_PUBLIC_HOST=:80 / HSTS=0`，因此 HTTPS 不能写 PASS；新增 Gate 要求公共 TLS 或零公网监听可信私网、private session 全合同、连续 7 天且至少 2017 样本零失败后才允许 G0.3。Session 已增加强配置、前一 secret 轮换、严格 token claims、同源 mutation、全响应 no-store、有界 rate limit 与脱敏审计；session password/secret 已从共享 worker environment 移到 Web 专属。G0.4 新增统一 release record schema/validator，GitHub main、commit/tree、不可变镜像、Compose、env 指纹、内容、migration、evidence、health 与 rollback 任一漂移即 FAIL；G0.5 十类历史事故均绑定实际可执行回归。Auth 9/9、超级包 22/22、production evidence 15/15、migration runner 59/59、Canonical domain 99 pass / 0 fail / 3 explicit PG skip、deploy safety 6/6、Autonomy 31/31、typecheck、lint、market 1017 pass / 0 fail / 7 explicit DB skip、workers 23/23、historical 4/4、build、Golden 16/16 与三项安全门禁全部 PASS；本地 PASS 不等于生产安全收口或 G0 完成。Edge/OrcaTerm 最新只读核验 observer unit 仍 active、61/289 样本；最新样本约 `2026-07-17T01:14:26+08:00` 为 health ready、scan fresh、Postgres ready、Redis 与 7 worker healthy、Candidate active/epoch3/ready、identity error/lock waiter/long transaction/unresolved quarantine 均 0，但该单批次 completed=0，仍须完整窗口证明期间有真实完成推进。
- 2026-07-17 `WP-G0.2-CANONICAL-COMPAT-LOCAL-SUPERPACKAGE` 已完成并以 commit=`194ccf388becd52020b68251c0875ed4a68048fa` 推送工作分支，生产未连接、未部署、未切换权威读链。当前包一次整合 Candidate Canonical Read Model、同一 `SERIALIZABLE READ ONLY DEFERRABLE` 快照内的独立 Raw Oracle、API Resource、纯 Route Adapter、Trusted Context、Legacy diagnostic 边界及 Review null/direction 真值；公共请求只能控制 limit 和完整 cursor pair，release/epoch/approval/manifest/flags/evidence 均由服务端可信上下文绑定。`CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED=false` 保持不变，现有 `src/app/api` 路由未接线，Legacy 不能证明 canonical parity。定向域/治理 102 项为 99 pass / 0 fail / 3 个显式 PG skip；对应三套隔离 PostgreSQL 16 演练另行全部 PASS 且 `productionConnected=false`。Autonomy 31/31、typecheck、lint、market 1008 pass / 0 fail / 7 explicit DB skip、workers 23/23、historical 4/4、build、Golden 16/16、三项安全门禁和提交前/提交后自治总门禁 18/18 均 PASS，最终证据绑定 commit=`194ccf3`、tree=`8c37ab3...`、`worktreeUnchanged=true`。GitHub main 与生产仍保持 `e5eb900...`；该本地包不等于生产 reconciliation 或 canonical cutover。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE` 当前生产激活已通过即时门禁并进入不可缩短的 24 小时观察。生产绑定 source commit=`e5eb90026d8bfcd52b060359446515de5a5c32d6`、Bundle SHA-256=`e05e64fbf20e6b31dd500d215844736515044c21806c620f5559523865c05287`、request SHA-256=`43f3b6937ca6a7663752332414f0836393a9b3df39c4641375c33efbde884466`、release=`candidate-shadow-e5eb90026d8b`；生产仓库为 clean detached exact commit，control=`shadow_capture / epoch 3 / writeFrozen=false`，Web healthy，Candidate worker running，health=`ready/fresh`，Postgres/Redis 和全部 worker 即时检查通过。Observer transient systemd unit 在浏览器断开后仍为 `active`，截至 `2026-07-16 22:59 +08:00` 已推进到 31/289 样本；这只能写“观察进行中”，不能提前写 `PASS_ACTIVATE_AND_OBSERVE`。当前上传到 `/home/ubuntu` 的两份 e5 脱敏运输文件尚未执行独立精确清理，不能伪装为不存在。观察期间本地并行完成 Reconciliation 准备：治理/纯函数 9/9、PG16 真实 10,000 条 Source-Event-Episode 对账、0 difference、只读事务拒写、phase unchanged、productionConnected=false；旧预案写死 epoch1 和观察证据身份不兼容已收口为正奇数 epoch 与证据 SHA-256/新审批/数据库控制行绑定。该本地 PASS 不等于生产 reconciliation，WP-G0.2/G0 仍未完成。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE` 第四次真实生产事务绑定 source=`6c615c33749f857797cfa1cfee1f95e7731352cb`、Bundle=`84a6457cad76ba6566ba9f767125672b83c8eeb10bc7f44d539ad70202ee52c2`、request=`d5d48825f4db23fac5cf796ac160b14a08f05a36d373db8e6fd75d1f9a7df661`。Bundle/request 远端 SHA 与本地一致，入口合同通过并启动 transient unit；数据库 control preflight 随后以 `candidate_control_not_empty` fail closed。失败发生在 lease、Git、DB control、env、Web 和 worker mutation 之前。生产复核仍为 clean detached `cec0b657...`，Candidate worker absent；控制行为 `candidate-episode-v1 / legacy / epoch 2 / writeFrozen=true`，deadline 尚余超过 24 小时，Candidate event/outbox/quarantine resolution 均为 0。staging/secure/ops 和本轮两份远端上传临时文件已精确清理，历史事故证据未动。根因是旧 runner 只接受 control 表为空，却又在回滚后按设计保留不可删除的 legacy 控制行，形成“能安全回滚、不能合法重试”的生命周期缺口。当前最小修复不删行、不清库、不改 migration：只有 exact legacy+frozen、正偶数 epoch、数据全空且剩余窗口至少覆盖 24 小时加一个采样间隔时，才调用既有受控 transition 进入下一正奇数 epoch；观察样本要求 runtime/monitor epoch 一致且为正奇数。Activation 28/28、PG16 `fresh epoch1 -> rollback epoch2 -> rearm epoch3 -> rollback epoch4`、typecheck、lint、market 965/0/4、workers 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS。runner artifact=`96705ce4...`、19 文件 activation artifact=`3f67df40...`、contract=`89efded1...`；修复尚待 clean commit、commit-bound gate、main 推送和全新单次 Bundle/request。24 小时观察未开始，Activation/WP-G0.2/G0 均未完成。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE` 第三次真实生产事务绑定 source=`a23365f42a4ff465d733d17390651c7c9af1e892`、Bundle=`b14681fd8bd309a991d5412bd8b0e1b626ff93b6c1539ba88a9d3e5ce842e569`、request=`07bfc56e0df0578df9f2f97e60488a64ff6f5588a8776afbbe2f8c52cf64a1ec`。事务完成 Git/control/env/Web/candidate-worker 激活并通过即时验收，但第一个持续观察样本发现 scanner-worker degraded，故本轮必须记为 FAIL，不能写 Activation PASS。生产诊断证明 `/api/scan` 在 Candidate 激活期间两次 HTTP 500；根因不是 CoinGlass 或数据库不可用，而是轻扫候选中有 7 个币未进入当前深扫批次，旧 mapper 把“本轮未深扫”误判为“身份无法解析”，Shadow Capture hard-stop 又未经隔离传播为核心扫描 500；worker 随后的 idle heartbeat 还会把真实 error 覆盖成 healthy。Observer 已触发自动回滚，但旧 ERR trap 丢失退出码、回滚身份检查错误假设 active state 必须 dormant，紧急回滚路径又误用生产仓库旧 verifier；最终通过独立恢复将生产安全恢复到 clean detached `cec0b657...`、旧 Web image=`sha256:cd3652...`、Candidate worker absent、control=`legacy/epoch 2/writeFrozen=true`、Web/Postgres/Redis healthy、lease=`ROLLBACK_PASS`。旧 Bundle/request 已消费且禁止复用，远端 stage/evidence/ops/secure 保留作事故证据，未伪装成已清理。当前最小 P0 修复只做四件事：从完整公开合约 universe 解析 Candidate 身份；Shadow 写入失败时保留 canonical archive 但让扫描状态如实 failed；idle heartbeat 不再覆盖真实 task error；修复 observer/production runner 的自动回滚。Activation 28/28、Composition 32/32、Shadow governance 8/8、Autonomy 31/31、真实 PG16、typecheck、lint、market 965 pass/0 fail/4 explicit skip、workers 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁全部 PASS。新 runner artifact=`0556176b...`、19 文件 activation artifact=`3503e051...`、contract=`95bae2d7...`；修复尚未 commit/push，尚未生成新的单次 Bundle/request，24 小时/289 样本观察未开始。Candidate 当前 dormant，WP-G0.2/G0 未完成，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION` 已取得真实生产 `PASS_RUNTIME_IDENTITY_AND_PERMISSION`。执行绑定 runner source=`1dd11ae20f89849a883859a0f98436982cc1f994`、脱敏 Bundle=`b5de0535b5fb6897667befd2b00f10976404e748d1e03c805c6b14433a221808`、request SHA-256=`6e08102baaed3b6f7b662fe0af42b334dfa05d4c075b16418c2de826af60f841` 和一次性外部授权 SHA-256=`f1edc98c65ac78d7afd035609eb8386c0601f04f0f04215b6c56998952955145`。生产事务即时阶段为 `PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION`；独立 observer unit最终 `Result=success / ExecMainStatus=0`，7 个样本覆盖 1851 秒且持续 ready/fresh。生产 evidence 文件实时 SHA-256=`bbd5836067d8fc9854c653ab1a2ea4b3c8a06bc5b1e8384dcf5ab8d3476a278d`（此前上下文首三位误抄为 `bdb`，本轮已纠正）：生产仍为 clean detached `cec0b657...`、Web image=`sha256:cd3652...`，3 个 NOINHERIT LOGIN、3 个固定 capability membership、3 条 Candidate URL 已配置；privileged LOGIN=0、Candidate Feature Flag=0、Candidate worker absent、Candidate 仍 dormant，观察期数据库/Redis/env/其它服务 mutation 均为 false。Runtime Identity 已完成，但 Shadow Capture activation 尚未通过，WP-G0.2/G0 仍未完成，系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION` 最新生产事务仍不能写 PASS。绑定 runner source=`26e82fb6a910018dbe6254dd1e0d2835d40f02b9`、Bundle=`e931515cc2aa9033e82adb4f9ae27bd80f4c323165a400a8dfd920acb2013f72`、request=`d7acd1f0ca86b05cefc6260656958bd0666a413298bdb8d9374642ee3180f730` 的 transient unit 完成三套临时 LOGIN/最小权限、env 切换和 Web no-build recreate，但在新 Web 尚未监听 `127.0.0.1:3000` 时立即执行身份探针，返回 `ECONNREFUSED`。自动回滚与独立只读复核证明 production HEAD 仍为 clean detached `cec0b657...`，旧 env SHA、旧 Web image=`sha256:cd3652...`、Candidate URL/runtime LOGIN/worker=`0/0/0`、schema ledger/control=`9|0`、writer archive grant absent、health ready/fresh 均恢复；生产没有保留本次 mutation。两个已上传的脱敏运输临时文件仍待精确清理，不能写成全部临时文件不存在。当前最小修复要求 Web 重建后最长等待 240 秒，只有容器 `running|healthy` 且容器内 health 同时达到 `ready / database ready / fresh` 才能进入身份探针；回滚重建复用同一门禁。Runner 17/17、Packet 13/13、Identity 14/14、Deploy Safety 6/6、Autonomy 31/31、隔离 PG16、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 与三项安全门禁均 PASS；runner artifact=`0d40fdf0...`、packet artifact=`5f734339...`。clean commit、提交后自治 gate evidence、新 Bundle/request 和生产重试仍待完成；Activation、WP-G0.2 与 G0 均未完成，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION` 最新生产事务不能写成 PASS。绑定 runner source=`f83d83e314bafbbe10d55c78555d406801966e2d`、Bundle=`0703656c3f403313f370e20932201f96b40daf2e2e7ec59083b3aac4ed0fac8f`、request=`bb66a0bedba952e761282054062fd11a473bf3e3b989c2c326393c61044be9c0` 的 transient unit 通过续证、数据库 preflight、三套 LOGIN/最小权限 provision、env 切换和 Web no-build recreate，随后 Web 身份探针被生产 Node 22 以 `ERR_AMBIGUOUS_MODULE_SYNTAX` 拒绝，根因是同一 stdin 脚本混用了 CommonJS `require()` 与顶层 `await`。Runner 按合同执行有界回滚；独立复核证明 production HEAD 仍为 clean detached `cec0b657...`，旧 env SHA 恢复，Web image=`sha256:cd3652...` 且 running/healthy/restart 0，Candidate URL/runtime LOGIN/worker=`0/0/0`，schema ledger/control=`9|0`，writer archive SELECT/INSERT=`false/false`，Postgres ready、Redis PONG，lease 已释放，staging/secure/ops/upload 临时文件均不存在。旧 Bundle/request 已消费，禁止复用。当前本地最小修复仅将精确探针封装为 async IIFE，并新增提取真实 heredoc 后执行 `node --check` 的回归；Runner 16/16、Packet 13/13、Identity 14/14、Deploy Safety 6/6、Autonomy 31/31、隔离 PG16、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS，Runner artifact=`d471bd5a...`、Packet artifact=`a110baddd...`。clean commit、提交后 gate evidence、新 Bundle/request 和生产重试仍未完成。Runtime Identity、Activation、WP-G0.2 与 G0 均未完成；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION` 最新生产重试仍不能写成 Runtime Identity PASS，但已获得可复用的真实新鲜 Dormant 证据。绑定 runner source=`77c3a3bd175201efe5e37853975625dc4abe160b`、Bundle=`ab4dbbec236b750c227aea9cbad918a08639046fce41d675002131086bfd0021` 的 transient unit 完成 1800 秒、61 样本只读续证，样本间隔 28-32 秒，持续 ready/fresh、Candidate dormant、worker absent；新摘要 completedAt=`2026-07-15T20:20:08Z`、SHA-256=`b76413fc317cd70511207e1a6dfb1280ccc7943331d06987320c8715fb070077`。身份事务随后在 mutation 前以 `SAFE_STOP_PRE_MUTATION` 结束：根因是摘要写在仓库外 evidence 目录，而通用隔离 Node 只只读挂载 source 与 secure root，validator 因文件不可见返回 generic `unexpected_error`；不是生产 health、样本数或证据内容失败。回滚合同验证证明 env、Web image、Candidate worker absence 和生产合同恢复，未创建 LOGIN、未改权限/env/Web，staging/secure/ops 已清理，脱敏摘要保留。当前最小修复只允许把续证摘要复制为 secure root 内 `0600` 临时桥接文件后进入 network-none/read-only/cap-drop-all validator，并把原 summary SHA 保留为 lineage、把 61 样本摘要绑定为当前 authority；任意其它 evidence 路径仍拒绝。红灯 2 项已真实复现并关闭，Runner 16/16、Packet 12/12、Identity 14/14、Deploy Safety 6/6、Autonomy 31/31、PG16、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS；runner artifact=`3d58b9ed...`、packet artifact=`60608ae6...`。当前修复尚待 clean commit、提交后 gate evidence、新 Bundle/request 和精确生产重试；旧 Bundle/request 永久失效。Candidate activation 继续禁止，G0/WP-G0.2 仍未完成，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION` 的最新生产续证重试以 `SAFE_ROLLBACK_DORMANT_REFRESH_SAMPLE_COUNT_TOO_LOW` 结束，不能写成 Runtime Identity PASS。绑定 runner source=`c37b89141b8d6d21d1a5013dbed9020c089551bd`、Bundle=`d4181d519f2ceb5275a86b9440330a8e14baddb3d9501edfd46a46680bdb22a7` 的 transient unit 在 1800 秒内只完成 51/57 个严格样本；根因不是市场或生产健康失败，而是旧调度在每轮检查结束后固定 sleep 30 秒，把检查耗时持续叠加到采样周期。Runner 在身份 mutation 前 fail closed，并执行了有界回滚；回滚验证证明 env、旧 Web image、Candidate worker absence 和生产合同恢复。随后独立只读复核仍为 clean detached `cec0b657...`、Web image=`sha256:cd3652...` 且 healthy/0 restart、Candidate URL/runtime LOGIN/worker=`0/0/0`、schema ledger/control=`9|0`、writer archive SELECT/INSERT=`false/false`、Postgres ready、Redis PONG，staging/secure/ops 目录均不存在；该独立命令没有正确打印 API 状态，因此 API 只能引用 runner 的回滚合同验证，下一次动态预检必须重新逐项核对。当前本地修复改为基于观察起点的绝对采样时间表，并增加样本间隔和调度滞后硬失败；Runner 16/16、Packet 11/11、Identity 14/14、Deploy Safety 6/6、Autonomy 31/31、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16、隔离 PG16 provision/rollback 与三项安全门禁均 PASS，runner artifact=`28d10a13...`、packet artifact=`32108b83...`。当前还只是本地修复 PASS，clean commit、提交后自治 gate evidence 和全新生产包尚待冻结。旧 Bundle 和旧 request 永久失效，不得复用；Candidate activation 继续禁止，G0/WP-G0.2 仍未完成，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-16 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION` 的最新真实生产尝试以 `SAFE_STOP_PRE_MUTATION_DORMANT_EVIDENCE_NOT_FRESH` 结束，不能写成身份切换 PASS。执行绑定 runner source=`e28691a6...`，在任何 LOGIN、权限、env 或 Web mutation 前识别到 Dormant 生产摘要已超过合同规定的 24 小时；生产随后只读复核仍为 clean detached `cec0b657...`、Web image=`sha256:cd3652...` 且 healthy/0 restart、Candidate URL/runtime LOGIN/worker=`0/0/0`、schema ledger/control=`9|0`、writer archive SELECT/INSERT=`false/false`、Redis PONG、4 个生产 API 均 HTTP 200，staging/secure/ops 临时目录均已删除。remediation commit=`2d79befe...` 已提交并推送 GitHub main：旧摘要只保留为 checksum-bound lineage，过期时必须先完成新的 1800 秒、至少 57 样本只读观察；每个样本都要求 production clean detached、目标 Web 身份不漂移、ready/fresh、Candidate dormant/worker absent、rollback image retained 和 lease checkpoint，有一项失败即停止，只有重新通过原 24 小时严格 freshness validator 后才允许既有 Runtime Identity transaction。Runner 16/16、Packet 11/11、Identity 14/14、Deploy Safety 6/6、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS；runner artifact=`a57522dc...`，packet artifact=`f7dccab3...`。当前仍须冻结控制面新提交、生成绑定该提交的自治 gate evidence、唯一 Bundle 与 fresh 90 分钟 request，再执行只读续证和身份事务。Candidate activation 继续禁止，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-16 `WP-G0.2-ACTIVATION-OBSERVATION-MAINLINE-INTEGRATION-REFRESH` 已完成当前 main 的本地生产安全刷新，生产未连接、未执行、Candidate runtime 仍 disabled。历史 runner 中会改写生产 `main`、使用 `nohup`、缺少仓库外 lease/fencing、缺少精确旧 Web 镜像 retention、观察期不感知 revocation 等问题已被真实红灯捕获并关闭。当前激活入口和观察器分别限定为 `Restart=no / RuntimeMaxSec=5400` 与 `Restart=no / RuntimeMaxSec=90000` 的 transient systemd unit；生产 Git 只允许 clean detached 精确 fetch/checkout；首个 mutation 前必须保存并核对审批绑定的旧 Web image；lease 在 mutation 前 acquire/consume，消费前失败只记 `SAFE_STOP_PRE_MUTATION`，24 小时观察只容忍自然审批到期，任何 revocation 立即回滚。观察 PASS 后的临时清理失败不回滚健康生产，自动回滚失败则保留诊断现场且不得输出 PASS。最终 PASS 仍要求 289 个 5 分钟样本、最大间隔 600 秒、ready/fresh、7 worker healthy、Candidate active、无 retry/quarantine/DB 阻塞且 completed writes>0；不检查或下调下一 Gate 的 10,000 compared writes，也不自动推进 phase。Activation 17/17、Autonomy/lease 31/31、隔离 PG16 control start/rollback、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS；runner artifact=`55da1aa7c6094e2b8799d68481fe641ff546f5a10eb47f7cb6cb242c6f368bcd`，current Dormant release artifact=`b0baa1c09da2e8062aee0fe0c96676ce9a53dfefedff5d5ab54de6c7725a9864`。这只证明本地准备，不是 Activation 生产 PASS。Runtime Identity 的 commit `e28691a6a3dc433db5f27b1161f90c44fabfe2cc` 已有脱敏 Bundle=`bf67839f02fcf39394ac9954d2c50866952a9bd7eedbc58f29954b93f9d949a4`，但旧 request=`fbd51283c7475b1a27cf09d1116f174702155712fcea6f33353a58f2ffbf23d3` 已过期且 Microsoft Edge / OrcaTerm 当前需要重新登录；该请求禁止执行，生产继续保持此前基线。下一生产动作只能是刷新动态事实、生成唯一新 request 并先完成 Runtime Identity；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-15 `WP-G0.2-RUNTIME-IDENTITY-CREDENTIAL-SOURCE-REMEDIATION` 已完成本地修复和固定基础/安全门禁，生产尚未重试。最近一次绑定 `d934f7a2166ae1e7f5cf67063dc57cb7a2a8a58b` 的真实生产执行在全局 lease fencing token `4` 下通过 dynamic preflight，但随后以 PostgreSQL `28P01` 在任何 role/env/Web mutation 前安全停止；lease 结果为 `SAFE_STOP_PRE_MUTATION`，自动回滚复核通过，生产继续保持 clean detached `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、Web `sha256:cd3652c1e72c8aabea87cee11233fb662a9209187435c14107f3da6426ba9efd`、Candidate flags/URLs/runtime LOGIN/worker=`0/0/0/0`。根因是生产入口把 Postgres 容器初始化环境中的旧 `POSTGRES_PASSWORD` 当作当前网络管理凭据；当前有效管理凭据实际由既有 identity-remediation 保存在合同锁定的 root-owned `0600` 文件。修复后 request/合同显式绑定该路径、owner/mode，入口禁止读取容器密码，只把 root-only 管理凭据和非敏感数据库身份通过进程管道交给 network-none/read-only/cap-drop-all 的当前 Web Node 运行时；解析器只接受精确 `POSTGRES_USER/POSTGRES_PASSWORD` 两键，校验容器用户名一致并在仓库外 `0700` 目录写两个 `0600` 临时文件。红灯先暴露 artifact drift、旧 fixture 缺字段及 Node 24 不支持 `fs/promises.readFile(0)` 三项真实问题，修复后 Runner 14/14、Packet 11/11、Identity 14/14、Deploy Safety 6/6、隔离 PostgreSQL 16 provision 3/rollback 3、typecheck、lint、market 960/0/4 explicit skip、workers 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS。当前 8 文件 runner artifact=`22248fbce38b27ea03add5b9b14319ac0c61f15fe20a961044cc5bb8db768e4c`，11 文件 production packet artifact=`8d5f6afd1ec6f991bf37d0cff71c733fac0671261738fd637f793a5df5d6854a`；clean commit、自治总门禁、新 Bundle 和新 90 分钟 request 尚待冻结。这仍不是 Runtime Identity 生产 PASS；Candidate activation 继续禁止，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 以下同日 Runtime Identity 条目保留历史演进；其中出现的“当前 artifact / 当前修复”只代表对应历史节点，以上述第一条为最新事实。
- 2026-07-15 `WP-G0.2-RUNTIME-IDENTITY-PRODUCTION-PREFLIGHT-REMEDIATION` 继续处于本地修复冻结阶段，生产未发生 mutation。首次绑定 commit=`1ba960fff5d29dda42898f7cb797e5e974efe728` 的运输包因两个真实预检缺口作废：旧 runner 假定 Dormant summary 存在并不存在的字段；通用 verifier 虽使用 root-owned identity wrapper，却没有向 wrapper 传入锁定的 `.env` 与 `.env.production`。随后 commit=`164540d47f612bc0204a764d14dd577c8409a711`、Bundle=`c7710aadb94c9226e628b3fed3c035319739bc72a1b35402780f6e238dfa2d26`、request=`57716b9825a2645861a3e2169c9f75bfcec115f430a09ef61881710d474da482` 在上传前审计又发现第三个同类缺口：`production-runner.sh` 内部后续 `config/ps/up/exec` 仍构造裸 wrapper，当前生产会在 mutation 前因 Compose env 插值 fail closed；该 Bundle/request 已精确删除并禁止执行。当前修复让 verifier 与 runner 的所有 Compose wrapper 调用统一显式绑定 `.env` 和 `.env.production`，不读取、不打印、不复制 secret；隔离测试先出现 2 个预期红灯，修复后 Runner 12/12、Packet 9/9、Identity 14/14、Deploy Safety 6/6、隔离 PostgreSQL 16、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16、两个治理 validator 与三项安全门禁均 PASS。真实 Dormant evidence 继续按 19 字段 schema 校验，并精确绑定 package/baseline/target/Web image、24 小时 freshness、1800 秒/57 样本、continuous ready/fresh、Candidate dormant/worker absent、rollback retained 与四项 mutation=false；summary SHA-256=`2ced16ca970c61e889eb966d5c32e8276f88d2f61d093ae9ab01c58f1330fc0c`。Microsoft Edge/OrcaTerm 最新只读预检证明生产仍为 clean detached `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、Web image=`sha256:cd3652c1e72c8aabea87cee11233fb662a9209187435c14107f3da6426ba9efd`、Web healthy/0 restart、Candidate flags/URLs/runtime LOGIN/worker=`0/0/0/0`、DB=`9|0|3|0|false|false`、Redis PONG、health ready、scan ready/fresh、scanner healthy、active lease=0；宿主未映射 `:3000`，容器内部 health 与两份合同 PASS。当前 8 文件 runner artifact=`b2826b9ba00189a09c81a269afab632c10cc44e45259e86cf9c381ca208a8773`，11 文件 production packet artifact=`b8ae75b72649b98cc2209891d8d2b6411a6021aca68063f0365a97c3851a98b8`；clean commit、自治总门禁和新 Bundle 尚待重冻。这仍不是 Runtime Identity 生产 PASS；Candidate activation 继续禁止，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-15 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION` 已形成 `PASS_LOCAL_RUNTIME_IDENTITY_PRODUCTION_PACKET`，生产未连接、未变更。生产包使用可字节级复现的 `ustar+gzip-n` 脱敏 Bundle，逐文件 checksum、current commit/tree/diff、门禁证据和旧 Web image 均进入精确绑定；Bundle 不包含 `.env`、credentials、role-admin URL、approval request、生产业务行或 raw log。真实执行只能进入 `Restart=no`、`RuntimeMaxSec=5400`、journald 的 transient systemd unit，不存在前台或 `nohup` fallback；宿主机无 Node 时使用当前已批准 Web 镜像的隔离 Node 运行时，并以完整容器 ID 防止预检期间漂移。外部单次授权最长 90 分钟，必须通过仓库外 lease、递增 fencing 和一次性消费。mutation 前动态复核 health ready/fresh、Candidate dormant/worker absent、schema `9|0`、0 个 runtime LOGIN、writer archive 权限 absent；唯一允许变更为 3 个 NOINHERIT LOGIN、3 个固定 membership、writer `scan_archives` SELECT/INSERT、3 条 Candidate URL 和 Web-only no-build recreate。失败必须恢复 env、旧 Web image、删除 LOGIN、撤销权限并重跑生产合同；回滚不完整为 P0。完整环境回滚备份只暂存在本包 `0700` ops 根，worker 退出时精确删除；保留证据仅为脱敏 JSON。当前 8 文件 runner artifact=`be3a3fe3095366e6fb8dd2e83e095dee1c4ec18ec9f1ce93d5284439b34560a3`，11 文件 production packet artifact=`c289d72aaff5c6b7b489ff00b281ee2becf09f74c20eb4a41141932b97bd75df`。Packet 9/9、Runner 11/11、Identity 14/14、Deploy Safety 6/6、PG16、typecheck/lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁均 PASS；formal 未运行。以上仍只证明本地生产包，不证明生产身份已切换；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-15 `WP-G0.2-CLOSEOUT-VERIFIER-AND-RUNTIME-IDENTITY-PREFLIGHT-SUPERPACK` 已完成、commit=`2ae4561c9139e91ab00d24fda89684ba423fef35` 并推送 GitHub main，固定基础/安全总门禁全部通过，生产未连接、未变更。通用 `production-check.sh` 在固定生产根目录会自动要求 root-owned `0700` identity wrapper 与 root-owned `0600` override，并逐项核对 SHA-256；缺失、权限或 checksum 漂移均在 Compose/API 验收前 fail closed。Runtime Identity runner 不再要求生产 `main`，而是把 runner source commit 与 clean detached production target `cec0b6572bb09ae91ff9e013f8bb160f73c045e2` 分开绑定；`.env`、`.env.production`、Compose、Dormant evidence、wrapper、override 和 8 文件 artifact 均进入 exact approval 合同。该轮冻结 artifact=`e109adeaab925d59535906965e4534fcbef3c2f1187e3d56fea45730e377ed38`，已被本轮新 artifact 取代，不得再用于审批。deploy safety 6/6、Runtime Identity runner 10/10、身份事务 14/14 和隔离 PG16 provision/rollback PASS；成功路径走 identity-safe verifier，故意失败路径恢复 env、旧 Web 与 3 个 LOGIN，并验证回滚后的 env checksum、旧 Web image、Candidate worker absent 和完整生产合同。该轮只证明 `PASS_LOCAL_RUNTIME_IDENTITY_CURRENT_RELEASE_PREFLIGHT`，生产角色、Candidate URL 和 Web 未改变。
- 2026-07-15 `WP-G0.2-DORMANT-RUNTIME-DEPLOY-STANDING-AUTHORITY-AND-RUNNER-REFRESH` 已通过新的精确单次 approval、仓库外 lease/fencing 和 session-independent transient unit 完成 Web-only 生产发布，结果为 `PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION`。生产从 clean detached `70722ea71b33268b688be5d42af9908d40f49859` 切到精确单父 target `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，新 Web image=`sha256:cd3652c1e72c8aabea87cee11233fb662a9209187435c14107f3da6426ba9efd`。1800 秒内 57 个样本持续 ready/fresh，Candidate runtime 全程 dormant、Candidate worker absent；数据库、Redis、env、migration、Feature Flag、其它服务均无 mutation。Postgres accepting connections、Redis PONG、frontend/backend/business 三份合同、目标 Web 镜像和 clean detached target 已独立复核通过。批准 staging 已自动删除，脱敏生产证据保留于仓库外 evidence 路径；旧 Web rollback image 继续保留，清理仍需独立批准。通用 `scripts/verify/production-check.sh` 直接调用普通 Compose 时因未加载锁定的生产身份 wrapper 而在 `POSTGRES_USER` 插值阶段失败，这是 verifier 调用兼容性 P1，不是生产 health 失败；身份安全 runner 的 57 次采样及独立检查均已通过。当前生产执行 PASS，但自治状态仍处于本包 closeout gate，完整 WP-G0.2/G0 尚未关闭；系统继续为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-14 `WP-G0.2-DORMANT-RUNTIME-DEPLOY-STANDING-AUTHORITY-AND-RUNNER-REFRESH` 已执行一次真实 Web-only 生产尝试，但不得写 PASS。绑定 source=`235459f8...`、runner=`9f8c6dc2...`、Bundle=`755512e4...`、request=`00575954...` 的 transient unit 成功构建并只重建 Web；Candidate worker 始终不存在，Candidate runtime 仍 dormant，数据库、Redis、migration、env、Feature Flag 和其它服务未变。目标 Web 连续留下 3 个 ready/fresh、Candidate absent 样本，第 4 个 observation checkpoint 的六项综合门禁中至少一项失败；旧 runner 只输出 generic error，无法诚实归类具体检查项，因此本次观察立即失败并自动恢复 Git baseline `70722ea71b33268b688be5d42af9908d40f49859` 与旧 Web image `sha256:6d02c759f295e3985b569be7a43c4afe99caa2e5b965a2f4b2395213f8df1a14`。自动 rollback checkpoint 本身为 pass，但回滚后立即执行的综合 health 复核尚未恢复，`rollback.json` 因此正确保留 `rollbackVerified=false`；后续只读人工复核证明生产现为 clean detached baseline、旧 image、health ready、database ready、scan fresh、scanner-worker healthy、Candidate absent。当前本地 remediation 为每一阶段记录精确 `failurePhase/failureCheck`，并只对回滚后的 ready/fresh 恢复增加原 240 秒上限内的轮询；目标 1800 秒观察仍是一票否决、未增加容错。Dormant 14/14、Autonomy 29/29、Deploy Safety 5/5、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 和三项安全检查已 PASS；正式 clean commit、冻结门禁、新 approval、Bundle 和生产重试仍待完成。系统继续为 `R1 / 可运行但不完整 / 不能支撑实战`，WP-G0.2/G0 未关闭。下一个同名条目是本次执行前的历史快照，已被本条取代。
- 2026-07-14 `WP-G0.2-DORMANT-RUNTIME-DEPLOY-STANDING-AUTHORITY-AND-RUNNER-REFRESH` 已从本地准备转入精确生产执行 Gate；生产仍只完成动态只读预检，未部署、未改变。历史 2026-07-12 Dormant 尝试继续保持“新 Web 启动竞态后自动回滚”，没有被改写成 PASS。当前发布不再使用 GitHub main 的 149/156 路径宽差异，而是从现生产 target `70722ea71b33268b688be5d42af9908d40f49859` 构造已推送的单父 18 文件 release `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，tree=`eb217a7...`、diff=`ee814eb0...`、path-set=`595fe259...`、runtime artifact=`5f4fb48d...`。专用 runner 只允许 Web build/force-recreate，Candidate 五个 Flag=false、三条数据库 URL 为空、release disabled、worker absent、control rows=0；数据库、Redis、migration、env、其它服务和 activation 禁止。生产执行接入 G0-G8 standing authorization、仓库外单次 approval、全局 lease、递增 fencing 和逐 mutation checkpoint；transient systemd unit 使用 `Restart=no`、`RuntimeMaxSec=5400`、journald，浏览器断开不终止。旧 Web image 在 mutation 前保留并成功后继续保留，失败自动恢复 baseline Git 与旧镜像。Microsoft Edge/OrcaTerm 在 `2026-07-13T22:47:34Z` 的只读预检证明：生产 clean detached `70722ea...`、remote target=`cec0b657...`、Candidate env=`flags 0 / URLs 0 / release disabled / worker expected false`、Candidate worker count=0、schema ledger/control=`9|0`、health ready/fresh、scanner healthy、三份合同 true、Postgres ready、Redis PONG、外部 active lease absent，identity wrapper/override 仍 root-owned `0700/0600`。预检同时真实发现宿主 `node=missing`，旧 runner 因此没有执行；随后新增当前 Web 容器 validator 和 network-none/read-only/cap-drop-all lease fallback。绑定阶段又真实发现 validator/request 仍使用历史包名，而自治控制器要求当前 active package，导致单份 approval 不可能同时通过；现已把 request、authorization、contract、Bundle、shell summary 和 lease package identity 统一到当前 active package，并增加跨状态回归测试。所有旧 gate 和 Bundle 因此失效。尚无当前状态的精确外部单次执行记录、正式 Bundle 或 1800 秒生产观察；系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`，WP-G0.2/G0 未关闭。
- 2026-07-14 `WP-G0.2-SCAN-SUSTAINED-HEALTH-PRODUCTION-RELEASE` 已在 G0-G8 standing authorization 下完成真实生产重发与持续健康观察，结果为 `PASS_PRODUCTION_SCAN_SUSTAINED_HEALTH_TWO_CADENCE_OBSERVATION`。执行绑定 runner source=`36c20e85...`、tree=`2dcb470...`、final bundle=`7a7cb17f...`、target=`70722ea71b33268b688be5d42af9908d40f49859`，只切换 Web 与 scanner-worker；transient systemd unit 在 OrcaTerm/浏览器之外独立运行并以 success 结束。生产最终为 clean detached target，新 Web=`sha256:6d02c759...`、scanner-worker=`sha256:b11c0cec...`；1800 秒内 59 个样本、2 次真实 `completedAt` 推进、3 次 updated-only success，最终 health ready/fresh、scanner heartbeat healthy，Postgres、Redis、前后端合同、非目标容器不变和 Candidate absent 均通过。数据库、Redis、env、Feature Flag、Candidate runtime 与其它服务没有 mutation；两个基线 rollback refs 保留，staging 已清除。反自欺收口另发现 v1 CLI 的 `production-lease-execution.json` 停留在 acquire 快照，虽 append-only events、consumed ledger、released history 和 active lease count=0 一致证明 `released/PASS`；原快照已保留，新增四源脱敏 reconciliation，CLI 与红-绿回归现原子持久化 `active_consumed`/`released`。artifact 漂移门禁曾真实使 release 套件 9/15，刷新未部署的事后 closeout artifact 后 15/15；自治 29/29、typecheck、lint、market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16、三项安全检查和最终冻结自治总门禁 10/10 全部 PASS，`worktreeUnchanged=true`。4 个 bundle、1 个 request 和 1 个外部单次 approval 已按逐路径 hash manifest 精确删除。本包只关闭 Scanner sustained-health P1；旧 Dormant Deploy 仍需刷新 standing authorization、当前 release identity、session-independent runner 和 rollback retention 后才可重试。系统继续是 `R1 / 可运行但不完整 / 不能支撑实战`，WP-G0.2 与 G0 未关闭。
- 2026-07-14 `WP-AUTO-02-G0-G8-STANDING-AUTHORITY-AND-EVIDENCE-HARDENING` 已完成、提交为 `386bf32be5d6d6106ce608a585d9a227a759ba35` 并推送 GitHub main，生产未连接、未部署、未改变。用户已把全自动范围扩展为 G0-G8；直接长期授权合同为 `docs/governance/G0_G8_STANDING_AUTONOMY_AUTHORIZATION_V1.json`，只取消常规逐包等待，不取消 Gate 顺序、最长 90 分钟 mutation 窗口、逐包 commit/tree/diff/artifact/environment/identity/preflight/rollback/observation 绑定、仓库外生产租约、递增 fencing token、一次性消费、固定基础/安全门禁和真实观察时间。唯一核心和七段核心链路已进入合同及工作包校验；G9、自动交易、自动调权、未批准交易规则、RR/Risk Gate 放宽、future outcome 生产回写、formal 自动运行、观察窗口缩短、破坏性数据操作和未知批量清理继续禁止。攻击性测试 26/26、typecheck、lint、test:market 960 pass/0 fail/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 与三项安全检查全部 PASS，`worktreeUnchanged=true`。当前生产事实和 G0 Scanner P1 均未因本控制包改变；唯一下一生产动作仍是 Scanner sustained-health 动态预检、Web+scanner-worker 精确重发和 1800 秒/至少两个 completion advances 观察。
- 2026-07-14 `WP-G0.2-SCAN-SUSTAINED-HEALTH-RUNNER-RECOVERY-HARDENING` 已完成本地加固，生产未连接、未部署、未改变。生产入口现只允许以受控 transient systemd unit 启动 detached worker，明确使用独立 uid/gid、`Restart=no`、最长 5400 秒、journald 日志和 HUP/TERM/INT 信号转发；入口返回或 OrcaTerm/浏览器断开不再终止 runner，且不存在前台 fallback。生产 runner 在任何 checkout/build/recreate 前，必须把当前 Web 与 scanner-worker 镜像分别保留为确定性不可变 rollback ref，并核对两条 ref 精确解析为原 image ID；任一保留或复核失败都在 Git/Docker mutation 前 fail closed。成功后也保留回滚 ref，清理必须另获批准；失败时从这两条 ref 恢复双镜像和 baseline Git。红灯基线为 6/12 fail，修复后定向 12/12、deploy-safety 5/5、autonomy unit 16/16、typecheck、lint、test:market 960 pass/0 fail/4 explicit DB skip、worker 23/23、historical 4/4、build、Golden 16/16、三项安全检查和自治总门禁 11/11 全部 PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。新 3 文件 artifact SHA-256=`6af759ceee3aa4a97ce22f92db28cbef31ebade519b57a088900278e1655eb69`；旧 artifact=`5dc432045b3e0ebdf9bd83b90dd3b720a024544da2c46872dc6ef4898892c7c5` 及其历史 bundle/approval 全部失效。当前生产仍是下方紧急恢复后的基线状态，P1 尚未通过新的连续观察关闭；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`，G0 未完成。
- 2026-07-14 `WP-G0.2-SCAN-SUSTAINED-HEALTH-EMERGENCY-BASELINE-RECOVERY` 已在用户精确批准的90分钟窗口内执行。原 sustained-health 发布切到 `70722ea71b33268b688be5d42af9908d40f49859` 并生成 Web=`sha256:67a489ec...`、scanner-worker=`sha256:8abc27a2...` 后，前台 OrcaTerm 会话断开导致 runner 终止，未形成完整观察总结，自动回滚状态不能据此判为成功；原发布明确不得写 PASS。紧急恢复仅把生产仓库 checkout 回 clean `main@0599f802f261fe8e3c1982a07106f362bd62ac13`，恢复旧 Web 镜像 `sha256:d51215624bd9e0a0ffc0138a20e9c1a4bf898f540be7528c01fef28fa5799800`，并因历史 scanner-worker 镜像 `sha256:acf89187...` 已丢失而从精确 baseline 源码仅重建 scanner-worker。重建摘要为 `sha256:bd01f60c83bdc0950659989fd243946a3343c0aad1ea8d31e1f1ab5cbbb97939`，与历史摘要不相同，因此唯一允许状态为 `RECOVERED_BASELINE_REBUILT_NOT_IDENTICAL`，不是 release PASS。只 force-recreate Web 与 scanner-worker；最终 health=`ready`、scan=`ready/fresh`、scanner heartbeat=`healthy`，三份合同、Web/scanner 身份指纹、Candidate absent、Postgres、Redis 和非目标容器不变检查通过。没有数据库、Redis、migration、env、Feature Flag、Candidate runtime、其它服务或 GitHub 变更。系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`；下一步必须先把生产 runner 改为不依赖浏览器前台会话，并保证回滚镜像留存，再申请新的独立发布批准。
- 2026-07-14 `WP-G0.2-SCAN-SUSTAINED-HEALTH-PRODUCTION-RELEASE` 的以下内容是发布执行前的历史包状态，已被上方生产执行与紧急恢复事实取代。该轮曾形成本地生产执行包，持续健康代码修复提交为 `b1a0eddf973129375292b139a81b326b924a57fa`；由于 GitHub main 还包含尚未获准进入生产的 Candidate/Dormant 代码，不能直接 pull main 重建 Web，因此从精确生产基线 `0599f802f261fe8e3c1982a07106f362bd62ac13` 另建了单父、16文件最小发布提交 `70722ea71b33268b688be5d42af9908d40f49859`，diff SHA-256=`80bab7d7e3cdd5a9811dc0815c5df10205bce54e3f87c14d1791c94bcd3f6f58`。执行包要求只发布 Web 与 scanner-worker、双镜像回滚并连续观察1800秒；隔离演练通过不等于本次真实生产发布通过。
- 2026-07-13 `WP-G0.2-SCAN-CADENCE-CACHE-AND-FRESHNESS-SUSTAINED-HEALTH-REMEDIATION` 已形成并提交本地修复，生产未连接、未部署、未改变。根因被拆为四项并分别收口：scanner 从任务完成后再等待900秒改为以计划时点为锚的串行 fixed-rate、错过窗口直接跳过且不突发追赶；所有 `getReadableMarketRadarSnapshot` 调用结构性 no-refresh，只有受保护刷新动作可调用 provider；lock contention 机器状态改为 `in_progress`，`POST /api/scan` 只有 `updated` 返回 HTTP 2xx/`ok=true`，旧缓存、锁竞争和失败全部 fail closed；成功扫描记录 started/completed/duration，health 从成功完成时间计龄，失败、缓存和锁竞争不刷新成功时间。scanner worker 同时解析响应 body，非 `updated` 即使 HTTP 200 也记录失败 heartbeat；锁释放失败只尝试一次且不写入未闭环缓存。红灯基线曾暴露14个预期类型/合同缺口，首次实现又真实暴露2个断言差异，均未绕过；修复后定向55/55、worker23/23、typecheck、lint、deploy safety5/5、autonomy unit16/16、test:market 960 pass/0 fail/4 explicit DB skip、historical4/4、build、Golden16/16和三项安全检查均 PASS；自治总门禁12/12 PASS、`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。功能提交=`b1a0eddf973129375292b139a81b326b924a57fa` 已推送；生产 P1 仍需通过上方最小发布包和跨周期观察关闭。
- 2026-07-13 `WP-G0.2-PRODUCTION-WEB-IDENTITY-RECOVERY` 已在 exact approval 的90分钟窗口内执行并输出 `PASS_PRODUCTION_WEB_IDENTITY_RECOVERY`，没有 PARTIAL 或 rollback。唯一重建服务是 Web，镜像仍为批准 digest，Web 身份指纹恢复为批准的最小权限 override；即时 health=`ready`、scan=`fresh`、persistence database status=`ready`，frontend/backend/business 三份合同、Redis 和 runner 内精确 Postgres readiness 通过，Candidate worker 继续 absent，非 Web 容器身份不变。生产 Git 仍为 `0599f802...`/main/clean，没有 source sync、build、数据库、Redis、Worker、Caddy、env、Feature Flag、migration、Dormant release 或生产仓库变更；批准 staging 已自动删除，本地 transport 临时副本已删除。OrcaTerm 误生成的远端12个审批/分块文件和4个 `/tmp` 后验证文件已按用户即时确认精确删除，随后两组 `ls -ld` 对16条路径逐项返回 `No such file or directory`；批准 staging 路径也再次确认不存在，未扩大到其它路径。后续 fresh 复查发现 health 曾因 scan age=17分钟超过 cadence=15分钟而短暂 `degraded/aging`，persistence 始终 ready；下一轮 snapshot 写入后自动恢复 `ready/fresh`。进一步代码与生产日志审计确认 fixed-delay 会把75至112秒任务时长叠加到900秒睡眠；同时多个 public/read 路由未声明 `allowRefresh:false`，可能在 cadence 边界主动争抢同一 Redis scan lock，`POST /api/scan` 又会把 lock-denied/provider-failed 的旧缓存以 HTTP 200 `served_cache` 返回，通用 Worker 只看 HTTP 状态即可误记 `task-ok`。此外 freshness 使用扫描开始时间，严格15分钟 fixed-rate 仍会在75至112秒执行期间越过 cadence。生产短任务是否均由锁竞争造成，现有500字符日志不足以逐条证明，必须在修复包增加机器可判定状态后验证。closeout 的定向、基础、安全和自治总门禁全部 PASS；当前状态为 `PASS_PRODUCTION_WEB_IDENTITY_RECOVERY / CLEANUP_COMPLETE_GATES_PASS_COMMIT_PENDING / P1_SUSTAINED_HEALTH_REGRESSION / R1 / 可运行但不完整 / 不能支撑实战`。独立 scan cadence/read-write/lock/completion-freshness remediation PASS 前不得申请 Dormant Deploy。
- 2026-07-13 `WP-G0.2-DORMANT-RELEASE-DIFF-REFRESH-AFTER-WEB-IDENTITY-RECOVERY`：在 Web Identity Recovery commit=`5b4bd617...` 推入 `main` 后，Dormant validator 对当前 HEAD 正确报 `release_diff_file_count_mismatch`。重算证明历史 approved commit=`a8dd5195...` 仍精确为 149 个 A/M 路径、path-set=`f39c8a26...`，证据未被篡改；当前 main 因 Web Recovery、Dormant safety 和治理传递依赖变为 156 个 A/M 路径、path-set=`8aa967379c97addb34f7908ca228092ab5ab4953e65d6cc705b7b36a71ea79a3`。全部路径仍通过原 allowlist/forbidden、required base/rollback 祖先和 A/M-only 约束，没有放宽发布边界。首次只刷新 release 合同后，定向测试以 2 个 `artifact_checksum_mismatch` 和 Runtime Identity `artifact_checksum` 真实失败，证明 validator 属于 14 文件 Dormant artifact 且继续传递到 8 文件 Runtime Identity artifact；现分别刷新为 Dormant=`b4fce8a64a9e468067101b50c2e5e59b5802d3f8b5459e176acb1bac25081e2c`、Runtime Identity=`d3b4f015e70a3b5e4310b5b635921f5b829c7e95854c4dcaf11bd1021adf08d0`，文件数均未扩大，旧值全部失效。隔离 execute fixture 也从旧 required-base path-set 改为当前 rollback..HEAD 并自证 count/hash；Dormant 12/12、Runtime Identity 8/8、deploy safety 5/5、Composition 28/28、Autonomy unit 16/16、基础/安全与自治总门禁 17/17 PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。本轮未连接或改变生产；生产仍需先执行独立批准的 Web Identity Recovery，Dormant Deploy 继续禁止。
- 2026-07-13 `WP-G0.2-PRODUCTION-WEB-IDENTITY-RECOVERY-DETERMINISTIC-TRANSPORT`：在等待生产 exact approval 时复核 final bundle，确认同一 clean commit 连续生成会因临时文件 mtime、tar header 和 gzip 时间元数据得到不同 SHA-256；旧 commit=`9d6a5fea...` 下的 Recovery=`340ab9db...`、contract=`9a161f7e...` 和 final bundle=`6285244a...` 因此全部失效并已删除，禁止审批或上传。bundle builder 现固定 payload 顺序、uid/gid、epoch=`946684800`，使用 `ustar` 后再 `gzip -n -9`；manifest 和生产 runner 同时锁定 `reproducibleArchive=true`、`archiveFormat=ustar+gzip-n`、`sourceDateEpoch=946684800`。跨 1.1 秒的两次独立构建已证明字节和 SHA 完全一致，旧默认 tar/gzip 路径不再使用；Recovery artifact 刷新为 `cb81523b21018868a81b21d42a195574a5a3c2695b2090fc9c770a9002b58a79`、contract=`10be74155f464285e9369b93e0ea9682ca8c7c736d7b3027f348a899d7b08265`，定向 13/13、基础门禁与自治总门禁 14/14 PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。生产仍未授权或改变；新 clean commit/main 和唯一 final bundle 完成前不得申请执行。
- 2026-07-13 `WP-G0.2-PRODUCTION-WEB-IDENTITY-RECOVERY-FINGERPRINT-TRUTH-REMEDIATION`：Microsoft Edge 最终动态只读预检发现本地恢复合同中的 identity override 与 wrapper SHA 无法匹配生产。精确分组 `sha256sum`、对合同值的布尔比较和文件元数据复核证明这不是新生产漂移：两文件均为 root-owned regular file、mode=`0600`/`0700`、mtime 均保持 2026-07-11 12:52:23 +0800，wrapper 仍能解析目标 Web 身份，目标 URL 指纹与当前错误 Web 身份不同。根因是此前从终端输出人工转录两条 64 位 SHA 时发生字符移位；旧 SHA、Recovery artifact=`7680f565...`、合同 checksum 和 bundle=`287462ff...` 全部失效。合同现绑定真实 override=`1b7f8ba4c623a0025ff35ddc203c6b769d1b262a1545a16892816cdbc478bacf`、wrapper=`fb473dc3bf0a2968be8ad385efac3273f4057530df17cee73f2003d3a369f1f3`，Recovery artifact=`340ab9dbc6850b9fbe648f52981b9c6f2f7e36d4d23926c0c51535d1fd5a5a42`、contract=`9a161f7e2929060dfb1bbdecf3d4a01aa023e15fa97b1050875c5ec5dfb54925`；旧误抄值已加入拒绝回归，定向 12/12、基础门禁与自治总门禁 14/14 PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。当前生产仍为 HEAD=`0599f802...`/main/clean、Compose=`2749a24d...`、Web image=`sha256:d51215624bd9e0a0ffc0138a20e9c1a4bf898f540be7528c01fef28fa5799800`、base env=`763b46f20cc5cdf1fbe03861f509cb441b8d579865d49f2530593e8b8eb5c47b`、production env=`4cafabd832c9cf1aeaacbabe3a1df77d192284f4aceaaeb87261cbcf8ea2da2a`；health degraded、scan fresh、DB ready、持久化认证仍失败、Candidate worker count=0。生产没有 mutation；仍需最终 commit/main、clean final bundle、执行前动态再确认和独立 exact approval。
- 2026-07-13 `WP-G0.2-PRODUCTION-WEB-IDENTITY-RECOVERY-RUNNER-AND-TRANSPORT`：针对当前 Web 持久化认证降级建立了独立恢复 runner，并关闭“生产禁止 source sync 后新 runner 无法安全到达”的执行缺口，本地生产 mutation=false。审批锁定生产 HEAD=`0599f802...`、最终 runner source commit、identity override SHA=`1b7f8ba4...`、root-owned wrapper SHA=`fb473dc3...`、生产 Compose SHA=`2749a24d...`、Recovery artifact=`7680f565...`、合同 checksum、脱敏 transport bundle checksum、仓库外 staging 路径，并实时绑定 `.env`、`.env.production` 与当前 Web image。bundle 只含合同、entrypoint、validator 和 recovery shell，声明 secrets=false、production repository mutation=false；dirty worktree 只能生成 `approvalEligible=false` 模板，只有 clean commit 才能生成最终审批 bundle。最终 bundle 仅能上传到 `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-web-identity-recovery-*` 的 `0700` staging，request 为 `0600`；entrypoint 固定生产路径/超时，安全校验完成后写临时 ready marker，SIGINT/SIGTERM 非零退出，并在成功、失败或回滚后删除 archive/request/marker/runner。Microsoft Edge 只读预检确认当前生产仍是 HEAD=`0599f802...`/clean、Web image=`sha256:d51215b2...`、DB probe ready、health degraded、scan aging、持久化认证失败且 Candidate worker 不存在。唯一服务 mutation 仍是 no-build/no-deps force-recreate `web`；禁止生产仓库 fetch/pull/checkout/write、镜像 build、其它服务、env write、DB/Redis mutation、migration、Feature Flag、Candidate worker 和 Dormant 新 release。身份或持久化恢复失败才回滚 base Compose；身份和持久化已经恢复但独立 scan 在固定 20 分钟内仍未 fresh 时，保留正确身份并返回 `PARTIAL_PRODUCTION_WEB_IDENTITY_RECOVERY_SCAN_NOT_FRESH`，不得写 PASS、不得开放 Dormant Deploy。只有身份指纹匹配、health ready/scan fresh、持久化认证错误消失、三份合同/Postgres/Redis/Candidate dormant 通过且其它容器 ID 完全不变才算 PASS。宿主机无 Node 时使用当前 Web 容器 Node 验证同一 base64 request/contract。Recovery 11/11 已覆盖成功、真实失败回滚、scan-aging PARTIAL 保留身份和安全 signal 清理；typecheck/lint、test:market 952/0/4 skip、worker 18/18、historical 4/4、build、Golden 16/16、安全门禁和自治总门禁 14/14 PASS。生产未恢复、未部署；执行前仍必须确认 GitHub main 对齐、重做动态只读预检并获得 exact approval。
- 2026-07-13 `WP-G0.2-DORMANT-RUNTIME-IDENTITY-OVERRIDE-PRESERVATION`：生产只读审计纠正上一轮 health 归因。总 health 的 `degraded` 不是由 `marketDataQuality` 汇总触发，而是 Web 持久化读取 `scan_archives`、`journal_events` 时以旧身份连接 PostgreSQL，返回 password authentication failed；数据库探针自身仍 ready、scan fresh、CoinGlass live、Redis 与六个 worker正常。既有 root-owned 最小权限身份 override 仍存在、权限为 `0600`，其期望数据库身份只读连接成功，但运行中 Web 的脱敏身份指纹与期望不同。根因是 Dormant runner 的正常部署和自动回滚都只用了 `.env` + `.env.production`，未带身份整改阶段建立的外部 Compose override。当前没有执行生产 mutation。部署器已在本地改为绑定 override 绝对路径/普通文件/`0600`/SHA-256，部署与回滚复用同一 Compose 数组，并核对 Compose 预期与 Web 实际身份指纹；checksum 漂移会在生产 Git/Docker mutation 前拒绝。当前 Dormant 14 文件 artifact=`a82ed943e7eae1df94bacb0f0c11439586e14fc3127564556215162bb8d82a50`，传递影响后的 Runtime Identity 8 文件 artifact=`95c50a233b4587234ab574d76de0a02fc870c481ed3fed04317112044cb40178`。自治总门禁 17/17 PASS、`canAutoCommit=true`、`canAutoDeploy=false`。生产恢复必须另获精确批准且只 force-recreate 旧 Web；Dormant 新发布仍需最终 commit/main 和新的独立审批。
- 2026-07-12 `WP-G0.2-DORMANT-RUNTIME-DEPLOY-READINESS-REMEDIATION`：用户以 exact commit=`a8dd51954c35cad6c4b14efd3adf6bf97127a342`、artifact=`78f1e3fa045615fd46dc38739adce0ed14a267e3665a3a1c99501f0520478449`、release diff 149/`f39c8a26ddf5ed8047a081a79bbbcaeed2ebfcc9540466d6e806adad8ce91f37`、rollback=`0599f802f261fe8e3c1982a07106f362bd62ac13` 批准 Web-only 生产执行。宿主机缺 Node 和项目依赖均在生产 mutation 前 fail closed，后以当前健康 Web 镜像中的 Node 22.23.1、`js-yaml` 和 `argparse` 临时只读提取完成审批校验。新 Web 镜像成功 build/recreate，但 runner 紧接启动即请求 `127.0.0.1:3000`，发生 `ECONNREFUSED` 启动竞态并自动恢复旧 Web 镜像和 rollback HEAD。生产代码因此仍是 `main`/`0599f802...`/clean，Candidate runtime disabled。后续审计确认自动回滚未恢复外部身份 override，造成 Web 持久化认证失败；上一版把总 health 降级归因于 market data quality 的结论已作废。该轮 `78f1e3fa...` 审批已消耗，后续 `e56d37ff...` checksum 也已被 2026-07-13 的身份保留修复取代。
- 2026-07-12 `WP-G0.2-DORMANT-RELEASE-DIFF-GUARD-AND-APPROVAL-REFRESH` 已关闭两个 P1 假 PASS 风险。第一，原 Dormant validator 只锁 14 个关键文件，不能证明 approved commit 未夹带其它 Web 代码；现强制 rollback=`0599f802f261fe8e3c1982a07106f362bd62ac13` 是 approved 的祖先、approved 继承 release base=`591163a37493910c346530ebdf271f878c6a67b5`，release diff 精确为 149 个 A/M 路径且 path-set SHA-256=`f39c8a26ddf5ed8047a081a79bbbcaeed2ebfcc9540466d6e806adad8ce91f37`，Review、Canonical read、activation、reconciliation 和任意非 allowlist 路径均 fail closed；审批请求必须额外绑定 diff count/hash。第二，跨分支遗留 `.tmp/market-tests` 曾把本分支 952 项虚增为 993 项；首次只删输出目录又暴露 TypeScript 增量缓存可造成 0 个核心测试仍绿灯。现 `build:market-cli` 每次清理输出、market test tsconfig 禁用 incremental、`test:market` 强制核心测试数大于 0，并有 sentinel 删除+当前 JS 重建回归。真实基线恢复为 952 pass/0 fail/4 explicit DB skip。Dormant 11/11、deploy safety 5/5、Runtime Identity Runner 8/8、Composition 28/28、Autonomy unit 16/16、typecheck/lint/build、worker 18/18、historical 4/4、golden 16/16 和安全门禁均 PASS。当前 Dormant 14 文件 artifact SHA-256=`78f1e3fa045615fd46dc38739adce0ed14a267e3665a3a1c99501f0520478449`，Runtime Identity 8 文件 artifact SHA-256=`855f8e0d72bb30cb65852c91efa6f89d5c325d9c8eb91f51e02acc7f028070a2`；两项旧 checksum 均失效。生产未连接或改变，仍需最终 commit 推 GitHub main 后重新绑定 exact approval；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-12 `WP-G0.2-SHADOW-CAPTURE-DORMANT-ARTIFACT-REFRESH-AFTER-IDENTITY-HARDENING` 已通过本地完整门禁：Runtime Identity 加固改变了 Candidate runtime database 的事务角色行为，原 Dormant 13 文件 artifact 因 checksum drift 正确 fail closed，且遗漏安全关键传递依赖 `transaction-adapter.ts`。current artifact 已刷新为 14 文件，SHA-256=`43e9deaef51e0c0408acb3c449a5cf92577181e66a14adaff958d669d3435f52`；旧 SHA-256=`8a0294b924936436f87c721319ef0435f532ce12da5e555900a3383051bfba08` 只保留为历史事实，禁止再用于审批。Dormant 9/9、Identity Runner 8/8、Composition 28/28、Autonomy 16/16、typecheck/lint/build、test:market 952 pass/0 fail/4 explicit DB skip、worker 18/18、historical 4/4、golden 16/16 和安全门禁全部 PASS；生产仍未连接或变更。
- 2026-07-12 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-PRODUCTION-RUNNER-PREPARATION` 已完成本地 runner：审批绑定 exact commit、8 文件 artifact SHA-256=`8069c06c83877cdf235c458b6516e935253941be3af2604f5bb015b266b86123`、runtime access checksum、24 小时内 Dormant final PASS 和 90 分钟窗口；secure credentials/role-admin 文件必须 0600，日志不输出 login/password/URL。隔离 shell 证明成功只配置 3 URL/recreate Web，失败恢复 env/旧 Web 并调用 DB rollback；隔离 PG16 真实 provision 3 LOGIN 后 rollback 为 0 LOGIN/0 writer archive 权限。Runner 8/8、Identity 14/14、Identity PG16、Composition 28/28、typecheck/lint/build、test:market 952 pass/0 fail/4 explicit DB skip、worker 18/18、historical 4/4、golden 16/16 和安全门禁全部 PASS；Autonomy 16/16。生产未连接或执行，Dormant Deploy 仍未授权。
- 2026-07-12 `WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION-LOCAL-PREPARATION` 发现并关闭一个 P1：三条 Candidate URL 虽已分离，但运行时未显式 `SET ROLE`，未来 NOINHERIT LOGIN 仅有 membership 时会真实返回 42501。事务适配器现按 source/consumer/monitor 固定映射到 writer/executor/audit 能力角色，角色名不可由环境或请求决定；source 对 legacy `scan_archives` 只补 SELECT/INSERT，UPDATE/DELETE/DDL 继续拒绝。隔离 PostgreSQL 16 创建 3 个临时 NOINHERIT LOGIN，证明每个只有 1 个 membership、无危险属性、跨角色切换被 42501 拒绝；新定向 14/14、Identity PG16 1/1、Composition 28/28、原完整 PG16 upgrade/atomic/composition/permission、typecheck/lint/build、test:market 952 pass/0 fail/4 explicit DB skip、worker 18/18、historical 4/4、golden 16/16 和安全门禁全部 PASS。新增身份 DB 测试在普通门禁中明确 skip，但已由独立 PG16 Gate 实跑，不以 skip 冒充通过。生产未连接，LOGIN/URL/权限未配置，Dormant Deploy 仍未授权。
- 2026-07-12 `WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY-EXECUTION-REHEARSAL` 已在本机隔离环境实际执行专用 runner 的成功和失败两条路径。真实 macOS `/bin/bash`（3.2）可完成 exact approval 解析；fake Git/Docker 与本地合同 API 证明成功路径只执行 `web` build/recreate，并在即时 health 降级时自动恢复审批绑定的 rollback commit 和旧 Web 镜像。Dormant 定向 9/9、deploy-safety 5/5、autonomy 16/16、Composition 28/28、typecheck/lint/build、test:market 950 pass/0 fail/3 explicit DB skip、worker 18/18、historical 4/4、golden 16/16 和安全门禁全部 PASS；生产仍未连接或修改。该轮 13 文件 artifact SHA-256=`8a0294b924936436f87c721319ef0435f532ce12da5e555900a3383051bfba08` 现仅为历史证据，已被上方 14 文件 current artifact 取代。
- 2026-07-12 `WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY-PREFLIGHT-AND-ENV-FIX` 生产只读预检确认：生产 `main`/HEAD=`0599f802f261fe8e3c1982a07106f362bd62ac13`、worktree clean，GitHub `main` 当时为 `f521367ce7abfb858c726c4cc38d6ede728b1f46`；11 个既有容器运行，Web/Postgres/Redis healthy，Candidate worker 不存在。运行中 Web 的五个 Candidate Flag enabled=0、三条 Candidate URL configured=0、release disabled、worker expected=false；health=200/ready、scan=fresh、database=ready、6 个业务 worker 非健康数=0，frontend/backend/business 三份合同通过。
- 同一预检发现专用 runner 单独使用 `.env.production` 时会因缺少 PostgreSQL 三项而 fail closed；生产真实 Compose 输入是 `.env` 基础变量加 `.env.production` 覆盖变量。该问题会直接阻断部署，判定为必须立即修复，不能后置。runner 与共享 `production-check.sh` 已改为按 `.env` -> `.env.production` 顺序加载并分别校验休眠边界；生产只读 `config --services` 已证明双文件可解析默认 11 服务且不含 Candidate worker。当前 Dormant artifact 以本节首条 14 文件 SHA-256 为准。
- Dormant Deploy 已执行一次并自动回滚，当前仍未部署、未激活。再次部署必须另行绑定 GitHub `main` 新 exact commit、新 artifact checksum、当前 rollback commit、`services=[web]` 和不超过 90 分钟窗口。即时验证通过也只能写 `PASS_IMMEDIATE_DORMANT_WEB_CHECKS_AWAITING_DB_VERIFY_AND_OBSERVATION`；还需 ledger=9/control rows=0 只读核验和 30-60 分钟观察，三者全通过才可写整包 PASS。
- 2026-07-12 `WP-G0.2-SHADOW-CAPTURE-PRODUCTION-COMPOSITION-WIRING` 已达到 `PASS_LOCAL_COMPOSITION_WIRING`。权威应用扫描归档点已在本地接入 Candidate composition；Source Writer、Shadow Executor、只读 Monitor 三条独立 Candidate 数据库身份通道、Outbox consumer、Episode service、受保护 API、profile 隔离 worker、条件 heartbeat 和 SIGTERM drain 已组装。它们绝不回退复用 legacy 应用 `DATABASE_URL`。代码授权仍固定为 false，五个 Candidate Feature Flag 默认全 false，普通 Compose 不启动该 worker；本轮未连接或部署生产。
- Composition 使用 PostgreSQL `clock_timestamp()` 作为 Gate/consumer 时间事实，避免应用主机时钟漂移。定向测试 28/28、隔离 PostgreSQL 16 完整 composition 链路、legacy identity dormant fail-closed、permission recovery 4/4、typecheck/lint、test:market 950 pass/0 fail/3 explicit DB skip、worker 18/18、historical 4/4、build、golden 16/16 和安全门禁全部 PASS；formal 未运行。
- 下一生产包只能是独立审批的 `WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY`。即使获批部署，也必须保持代码授权、Feature Flag、Candidate 专用数据库 URL 和 control lifecycle 关闭；之后还需独立的 Runtime Identity and Permission 包，才能申请 activation/observation。系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 2026-07-12 `WP-G0.2-SHADOW-CAPTURE-PRODUCTION-ADD-SAFETY-SCHEMA` 已在用户独立批准的 90 分钟窗口内完成。Runner 最终状态为 `PASS_PRODUCTION_ADD_SAFETY_SCHEMA`，只应用 `009_candidate_shadow_capture_safety`；001-008 全部 skipped，未部署 runtime、未启动 control lifecycle、未开启任何 Candidate Feature Flag。
- 本轮绑定审查 source commit=`b86f3282fa0d9cedab60b8a5bcb9166011fb7926`、runner commit=`c8dbcff0f3bd1d34d8f65aee65c69d08b2dfe556`、Migration 009 SHA-256=`2cc236dc6c44528b3ebba54e555d3ca07e95ba18709fd467b9578df9dd7979e5`。生产 catalog 从 8 tables / 151 columns / 20 functions / 10 trigger objects / 14 trigger event rows / ledger 8，增量变为 9 / 166 / 26 / 11 / 16 / ledger 9；roles 保持 7、control rows 保持 0，resolution table 已存在。
- 执行前 fresh 加密备份 `shadow-safety-preddl3-20260712T030500Z` 完成，encrypted SHA-256=`ea952bb62ba2cf53227da4b1105a4e755284d6747a76419c12400aa07eaa3a42`，archive verified；本机离机副本校验一致。容量门禁 14/14 PASS，完整 gate SHA-256=`6ccc80b81b69ccb9e8fcca3b9a4f7f1205451a64e30d131d6c2fe1248a65f4ec`，预计执行后磁盘使用 24%。
- 新增不可变 quarantine resolution ledger；只允许带审批摘要的 `replay_after_approved_fix` 或 `exclude_invalid_source`，原始 quarantine 永不改写，replay 创建新 Outbox。pending/claimed/retry_wait/未决 quarantine 均阻止 phase advance。
- Runtime readiness 已具备代码授权 + DB phase/epoch/deadline + release 对齐 + database repository + 环境 kill switch 多重 fail-closed Gate、canonical venue mapper 和只读 monitor；本地 API/worker/composition 已接线，当前代码授权仍硬关闭且生产未部署，五个 Candidate Feature Flag 仍为 false。
- 生产路线仍按独立 Gate 推进：schema-only 009 与本地 Composition Wiring 已完成；下一步 dormant runtime deploy 和其后的 activation/observation 必须分别获得新的独立生产审批；“继续”或“全自动搭建”不构成生产授权。
- 生产应用 worktree/release/image 未切换，仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13`；Candidate runtime 继续 disabled。系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`，009 schema PASS 不表示 WP-G0.2、G0 或实战能力完成。
- 证据打包时误落服务器根目录的 5 份无 secret 只读 JSON 副本，已在用户明确批准后按精确 allowlist 删除；shell 复核未发现这些路径并输出 `CLEAN5`。保留的 `evidence.tgz`、源证据、数据库和服务未改变。
- 2026-07-12 `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA-RERUN` 已在用户明确的 Add Schema-only 90 分钟窗口内执行一次。执行前新建加密生产备份 `add-schema-preddl2-20260711T172200Z`，完成 archive、离机下载、188299934 bytes 与 SHA-256 `51130d1cb5a9c324436c076966086ae83823f3554ec422e830bd9f80c7ea299c` 一致性校验；容量 validator 于 17:31:11Z 通过 14/14，预计磁盘 29%。
- Runner `execute` 已返回 pass，锁定的 8 个 migration 全部 applied。生产人工 catalog 真值为 schema=1、tables=8、columns=151、functions=20、trigger objects=10、trigger event rows=14、roles=7、applied ledger=8；10 与 14 是 `pg_trigger` 对象数和 `information_schema.triggers` 事件行数的不同口径，不是缺 4 个触发器。
- 自动 `verify` 返回 PostgreSQL `42501 permission denied for schema candidate_authority`，本包总状态为 `PARTIAL_SCHEMA_APPLIED_VERIFY_FAILED`，不得写成 PASS。根因是 `market_radar_migration_login` 为 `NOINHERIT` 且只具备 `candidate_migration_role` membership，runner 的 post-schema `readDatabaseBoundary` 在读取 ledger 前未显式 `SET ROLE candidate_migration_role`；生产只读证据同时证明 login 直接 schema usage/ledger select=false，而 owner role=true。
- 失败后未自动 resume、重跑 migration、drop、restore、改角色或放宽权限。五个 Candidate Feature Flag 仍为 0，旧应用仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13`、worktree clean、health ready/database；17:57:46Z 至 18:27:50Z 的 30 分钟只读观察 7/7 通过，Web/Postgres/Redis 全程 healthy，长事务、idle-in-transaction、lock waiter、ungranted lock 均为 0。
- Candidate schema 现在包含已验证 dormant 的 migration 1-9；writer、backfill、dual-read/read cutover、G1、R4、实盘和自动交易均未授权。Migration 009 禁止再次 execute；下一步仅允许本地 composition wiring。
- 2026-07-11 用户批准启动“不降低质量的提速方案”。新增 `MARKET_RADAR_ACCELERATED_DELIVERY_PLAN_V1.md`，采用 Production WIP=1、Local Preparation WIP=1 的双车道；只重叠本地准备和已经获准开始的证据窗口，不改变 G0-G8 顺序、审批、RR/Risk Gate、holdout、60 天 Shadow 或 30 天 paper 要求。
- `PRODUCTION-CAPACITY-OFFHOST-RESTORE-REMEDIATION` 已达到 `PASS_CAPACITY_AND_RECOVERY_REMEDIATION`：生产只清理未使用 Docker build cache，回收 88.76 GB；根盘从 85% 降到 12%，完成两份加密备份后最终为 13%，约 99.0 GiB 可用。未 prune image/container/volume，未重启服务。
- 生产 PostgreSQL 16 custom dump 由只驻留本机的 RSA 私钥对应公钥执行 CMS AES-256 加密；私钥从未上传生产。首份 177.0 MiB 加密备份完成 checksum/archive/off-host 校验，并在本机外部隔离 PostgreSQL 16 恢复成功：12 个用户表、1 个用户 schema、RPO 14 分钟、RTO 53 秒，未输出业务行，明文 dump 和临时集群均未保留。
- 为满足 Add Schema 申请前 15 分钟新鲜度，另建并下载第二份 fresh 加密备份。容量 validator 于 2026-07-11T10:45:06Z 以保守的 2 GiB migration temp、3 GiB WAL peak、2 GiB rollback reserve 和 20 GiB safety reserve 通过 14/14 检查：预计磁盘 18%，生产可用 112.1 GB，要求余量 29.2 GB，外部恢复可用 273.0 GB。结果只允许申请审批，仍为 `authorizesMigration=false`。
- 2026-07-11 `WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION` 达到 `PASS_IDENTITY_AND_RUNNER_REMEDIATION`：生产应用已从唯一超级 LOGIN 切换到独立最小权限 Application Runtime；独立 Migration LOGIN、NOLOGIN owner、受控 Break-glass 和显式双身份 Runner 已建立。角色原名和 Secret 未进入证据。
- 生产只 recreate 了 8 个 credential-bearing 应用/worker 容器以清除旧共享凭据，未重建镜像，未重启 Postgres、Redis 或 Caddy；生产应用仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13` 和原 image digest，生产 worktree before/throughout/after 均 clean。
- 身份整改轮当时 Runner 仅执行 plan/preflight/dry-run/verify；Application Runtime 被拒绝作为 migration identity。该历史轮次未执行 Candidate Migration，五个 Candidate Feature Flag 关闭。
- 生产身份切换后完成 7 次、每 5 分钟一次且总时长不少于 30 分钟的 detached 观察：Web/Scan/6 workers/Shadow/Review/Postgres/Redis、页面/API、角色会话、权限/事务错误、release/image 和 Worktree Guard 均通过。OrcaTerm 曾断线，原前台观察被废弃；重连 baseline 后改用 Ops 持久 PID/state 从零重跑，不能把中断窗口计入 PASS。
- 截至身份整改与容量/恢复 Gate 轮次，Candidate schema 尚不存在；该条是历史前置状态，已被本节顶部 2026-07-12 的 schema-applied / verify-failed 事实替代。
- 2026-07-10 已建立 Market Radar 双蓝图 v1.0：`docs/blueprints/MARKET_RADAR_ENGINEERING_BUILD_BLUEPRINT_V1.md` 规定系统怎样搭建，`docs/blueprints/MARKET_RADAR_PRODUCTION_RUNTIME_BLUEPRINT_V1.md` 规定系统怎样启动、稳态运行、降级、发布和恢复；`docs/blueprints/README.md` 是权威目录，`docs/blueprints/market-radar-blueprint-traceability.v1.json` 是机器追踪矩阵。
- 现有 `docs/chuan-market-radar-blueprint.md` 已改为兼容总索引；旧版详细内容完整保留为低优先级历史事实区，避免丢失当前工作树中的未提交历史变化。发生冲突时，当前生产事实/current evidence -> 双蓝图 -> V3/追踪矩阵 -> context/changelog -> 历史蓝图。
- 双蓝图与 V3 顺序已获用户确认，但目标合同不证明能力已经实现，也不授权跳包、扩大范围或降低门禁。当前仍是 `R1 / 可运行但不完整 / 不能支撑实战`。
- 工程蓝图以当前 Node 22、Next.js 16.2.9、React 19.2.7、PostgreSQL 16、Redis 7、Caddy 和 7 个 worker/runner 的单机 Compose 为基线；目标采用模块化单体 + 独立 worker，不为显得高级提前微服务化。
- 运行蓝图定义 11 个 Compose 服务、启动顺序、周期任务、五类健康语义、7 个核心状态/流程图、初始 SLO、error budget、18 类降级、SEV0-SEV3、RB-01 至 RB-12、发布、备份恢复、容量和 R4 暂停政策。
- 机器矩阵把 7 个核心链路环节、G0-G8、当前代码路径、目标合同、运行检查和证据逐项对应。首轮验证：JSON parse pass、当前路径缺失 0、Mermaid 13/13 有无障碍描述、敏感值 0、diff-check pass。
- WP-G0.1 已修改前端只读事实合同与展示，并完成 GitHub `main` 和腾讯 `web` 部署；未修改 DB、Redis、worker、Caddy、strategy、backtest 或 secret，未运行 migration、restore、rollback 或 formal。
- `WP-G0.2 - Candidate Lifecycle and Outcome Truth` 已完成仓库、持久化、Review、前端和生产只读审计，结论为 `PARTIAL_SCHEMA_MIGRATION_REQUIRED`；现有 mutable JSONB journal/scan-state 结构不能在数据库层保证单活跃 Episode、不可变 firstSeen、重触发继承、append-only 历史和 Outcome 只终态一次。本轮依约停止运行时代码、migration 和部署。
- `WP-G0.2-MIGRATION-DESIGN-AND-APPROVAL` 的历史审批包仍保留 `PROPOSED / approvedByUser=false` 原始事实；2026-07-10 用户通过独立执行合同明确授权后续 `WP-G0.2-MIGRATION-IMPLEMENTATION-AND-REHEARSAL`，该授权只覆盖正式 migration 实现和隔离演练，不改写旧审批包，也不授权生产 migration。
- `WP-G0.2-MIGRATION-IMPLEMENTATION-AND-REHEARSAL` 已达到 `PASS_IMPLEMENTATION_AND_REHEARSAL`：8 个 additive migration 覆盖批准 registry 的 8 表/151 字段，Episode/Event/Checkpoint/Outcome/Legacy/Outbox、同连接事务、并发幂等、lease/fencing、eg.v1、数据库角色和 deny guard 已实现；空库、上一稳定 12 表 schema、checksum drift、失败回滚、备份恢复和恢复后事务 smoke 均在 `wp_g0_2_rehearsal_*` 本地 Unix socket 数据库通过。
- 本轮真实 PostgreSQL 集成 5/5、候选域普通测试 88 pass/1 DB skip、全量 market 924 pass/1 DB skip、worker 17/17、historical 4/4、golden 16/16、typecheck/lint/build/forbidden/secret/security 均通过；真实 DB 套件按隔离环境单独实跑，不用普通门禁中的 skip 冒充通过。
- `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA` 已执行到生产只读 PostgreSQL preflight 后按硬门禁停止；migration 未执行。一次 OrcaTerm 复杂输入误生成 0 字节未跟踪文件，曾使生产 worktree 变脏并触发绝对禁止条款，因此本包总状态必须为 `FAIL_PRODUCTION_BOUNDARY_VIOLATION`，不能仅写成 preflight PARTIAL。生产只有 1 个 LOGIN 数据库角色；它同时是当前应用连接角色，并具有 SUPERUSER、CREATEDB、CREATEROLE、REPLICATION、BYPASSRLS。批准设计中的 7 个 Candidate NOLOGIN 角色均不存在，也没有独立 production migration LOGIN 身份。
- 生产 preflight 的非权限指标正常：PostgreSQL 16.14、连接 9/100、idle-in-transaction=0、长事务=0、lock waiter=0、ungranted lock=0；生产 Candidate authority schema 仍不存在（0 表/0 字段/0 函数/0 trigger），旧 catalog fingerprint 已脱敏记录。由于 migration identity Gate 失败，本轮没有创建生产备份、异地副本、restore drill、detached staging worktree，也没有执行 migration 或 30-60 分钟 post-migration observation。
- 本轮生产应用仍为 `main@0599f802f261fe8e3c1982a07106f362bd62ac13`，Web image、Worker、Shadow、Postgres、Redis 未重建或重启；结束时生产 worktree clean，health/scan 为 ready/fresh。误生成的 0 字节未跟踪文件已在用户明确批准后删除并复核 clean；未触碰跟踪文件、业务数据或 Schema，但最终 clean 不撤销边界失败判定。
- 本轮未写入生产业务数据、未执行 production migration、未改变生产 schema、未部署腾讯云应用、未开启 production shadow/dual-write/read cutover、未运行 formal。代码和隔离演练 PASS 不等于 `WP-G0.2`、G0 或实战能力完成。
- routine deploy/verify 脚本中的隐式 `/api/admin/persistence/migrate` 调用已从代码中移除，改为要求独立批准 runbook；该安全改动尚未部署腾讯云。当前唯一下一建议是另行审批 `WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION`，先建立与应用角色隔离的 migration 身份和可审计 production runner，再重跑 add-schema；当前 `canEnterProductionAddSchema=false`。
- 2026-07-10 已把两份历史 Master Plan、v2、最新 `53/100` 全系统审计、当前代码和当前只读生产点样本合并为唯一建议版 `Market Radar Practical Readiness Master Plan v3`：`docs/superpowers/plans/2026-07-10-market-radar-practical-readiness-master-plan-v3.md`。v2 已标记 `SUPERSEDED`，只保留审计历史。
- 历史方案的 46 项任务已逐项清洗为 completed / partial / superseded / deferred / not started，机器可读矩阵位于 `docs/superpowers/plans/2026-07-10-market-radar-v3-current-state-matrix.json`。CoinGlass 旧鉴权故障已归档为历史事故，不再冒充当前主阻断。
- V3 是已确认的顺序化建设与验收方案，不是实战能力证明；每个 work package 仍需独立范围锁定、门禁、部署证据和人工审计。
- 当前真实等级是 `R1 - 生产研究平台 / 可运行但不完整 / 不能支撑实战`。`53/100` 是最近架构审计分，不是实战 readiness 分。
- 当前生产验收点样本：`/api/health` 为 `ready / fresh`，六个业务 worker 当下 healthy；公开市场 observed=3112、accepted=1316，scan eligible=593，current-cycle=24，deep-scanned=48。前端合同分别显示公开接受率 42.3%（accepted/observed）、当前周期覆盖率 4.0%（current-cycle/eligible）和深扫覆盖率 8.1%（deep/eligible）。
- 当前公网入口仍为明文 `http://43.161.202.227`，浏览器标记“不安全”。这是新的 P0；Caddy 配置和 private-session 代码本地存在，不等于生产 HTTPS / private mode 已通过。
- 当前生产 frontend contract 返回 radarSignals=30、`TRADE_PLAN_READY=0`。生产旧 Review 点样本为最新 120 条 journal event，其中 closed=51、claimed evidence=61、pending=59、MFE/MAE=0；这些状态会重叠且 null 会被补 0，只能作为 legacy diagnostics，不能作为 Candidate Episode/Outcome 权威分母。生产 active/closed episode 和五类 outcome 数量当前应为 unavailable，不得写成 0。
- 当前活动 P0 包括公网明文 HTTP、Candidate/Outcome 权威 runtime 尚未接入、轻扫 `topCandidates` 仍被合成为 `RadarSignal`、Review neutral/unknown→long、null→0、pending/error→timeout 和事件行分母污染。WP-G0.1 的单一扫描证明和 leaderboard fallback 防线仍保留，但全站 frontend truth 已重开为 partial。
- 历史数据库超级权限依赖、加密离机备份和恢复演练前置风险已分别由 identity remediation 与 capacity/off-host restore 包关闭；post-schema verifier 的 NOINHERIT 显式 owner-role 切换已由 verify-only 关闭，Migration 009 也已 schema-only 应用并验证 dormant。本地 composition 已接线，但 production runtime 尚未部署/激活，不能把代码存在误写成新链已接管。
- v3 将路线重排为 G0-G8：事实/安全/生命周期/发布 -> 可靠性/恢复/安全/E2E -> 数据质量/身份/深扫 -> 候选与提前发现 -> 分析/策略/风险 -> 真实 Shadow/outcome -> 专业工作台/三模式复盘 -> 30 天模拟与 R4 审核 -> R5 长期治理。
- R4 只表示“受控人工实战决策辅助”，不表示保证盈利或自动交易。首次 R4 审核现实周期约 9-12 个月；必须 readiness >=85/100、各分项达标、无一票否决，并具备独立 holdout、至少 60 天真实 Shadow、30 天模拟决策、SLO、restore drill 和安全证据。
- 历史设计与 implementation/rehearsal 包已落成正式 migration；生产 schema 1-9 已于 2026-07-12 additive 应用并由 runner verify PASS，本地 runtime composition 已接入。生产 Web 身份已于 2026-07-13 恢复，Candidate Runtime Identity 已于 2026-07-16 通过生产事务和 1851 秒独立观察；这些只关闭身份地基，不表示 Candidate 新链已接管。
- Scanner sustained-health、Dormant Web-only 和 Runtime Identity 已分别完成真实生产观察。Candidate Shadow Capture 当前已激活到 `epoch 3`，worker running，24 小时/289 样本 observer 正在执行但尚未 PASS；canonical/dual/review 权威仍全部关闭。本地 10,000 条只读 reconciliation 工具已通过隔离 PG16，但生产对账必须等待观察 PASS 和新的精确绑定。在这些 Gate 通过前仍禁止 backfill、canonical read/write cutover、G1、R4 或实盘。

- 第 5.1-DEPLOY-CHANNEL-FIX 已完成腾讯云部署通道恢复诊断，结论为 `PASS_DEPLOY_CHANNEL_RECOVERED_VIA_ORCATERM`。本轮没有修改项目业务代码、没有同步服务器代码、没有部署、没有 Docker build/up/restart、没有运行 formal、没有动 DB/Redis/Postgres/volume、没有读取 `.env`/`.env.production` 原文、没有输出 secret 或 SSH 私钥。
- 第 5.1-DEPLOY-CHANNEL-FIX 证据显示：Chrome 里没有 OrcaTerm；用户打开 Microsoft Edge 中的腾讯云 OrcaTerm 后，Codex 通过 Computer Use 可控该页面，并以 `ubuntu@VM-0-9-ubuntu` 完成服务器只读 smoke。只读 smoke 覆盖 `whoami`、`hostname`、`pwd`、UTC date、`uname`、Docker/Compose 版本、项目目录访问、`ls -la`、`docker compose ps` / `sudo -n docker compose ps`。观察到 caddy、web、scanner-worker、coinglass-worker、dynamic-scan-scheduler、websocket-light-worker、signal-worker、macro-worker、shadow-runner、postgres、redis 等服务均在运行，web/postgres/redis 为 healthy。
- 第 5.1-DEPLOY-CHANNEL-FIX 仍保留边界：direct SSH 到腾讯云 22 端口超时；SOCKS 代理和 SOCKS 到目标 22 的 TCP connect 可用，但 SSH 在 KEX/banner 前后被关闭，没有进入 `Offering public key`、`Server accepts key` 或 `Authenticated`。当前恢复的是 Edge OrcaTerm 通道，不是 SSH 通道。下一步可以进入 `5.1-H.1-R.2-SCAN-FIX-PROD` 前置，但必须重新确认授权、备份、allowlist、只重建必要服务、30-60 分钟观察和 production evidence validate；仍不能进入 5.1-H / 5.2 / 实盘。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 已通过 Edge OrcaTerm 实际部署 14 个 allowlist 文件到腾讯云生产，结论为 `FAIL_PRODUCTION_SCAN_HEALTH_AFTER_DEPLOY`，不是 PASS。本轮创建服务器外部备份、完成 bundle hash 校验、应用 14 文件、重建并启动 `web` / `scanner-worker` / `coinglass-worker` / `dynamic-scan-scheduler`；没有 push main、没有运行 formal、没有动数据库/Redis/Postgres/volume、没有自动下单或新增交易 API。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 部署过程有一个已处理的部署工件问题：首次 Docker build 因备份目录位于项目根目录导致 Next/TypeScript 扫描备份源码而失败；备份已移动到 `/home/ubuntu/market-radar-backups/...`，项目根目录备份代码残留清除后，目标服务 build/up 重试通过。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 部署后验证显示 API 存活但 scan 主链路失败：GET `/api/health`、`/api/scan`、`/api/radar/backend-contract`、`/api/frontend/radar-contract` 均 HTTP 200；POST `/api/scan` 无密钥/错密钥为 401、正确密钥为 200；但 30 分钟有效观察 7/7 样本均为 `scanStatus=partial`、`scannedCount=0`、`candidateCount=0`、`signalsCount=0`、`scanCriticalStatus=failed`、`coinglassStatus=auth_error`、`deepScanStatus=auth_error`。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 本地门禁通过：observability test 15/15、typecheck、lint、test:market 835 + worker 17 + historical 4、build、backtest:golden 16/16、test:production-evidence 15/15、forbidden-files、secret-patterns、security:check；formal 未运行。服务器 web 容器内 real production evidence 生成成功，但 validate 正确失败：production health/status 不是 pass，`production-scan.json.scanGate.ok` 不是 true，`CoinGlass auth_error cannot pass real_production evidence`。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 下一步不能进入 5.1-H.1-R.2-RERUN / 5.1-H / 5.2 / 实盘；唯一下一步是修复腾讯云生产 CoinGlass `auth_error` / 运行时 key 或 provider capability 问题，再只重启必要服务并重跑 post-deploy validation、30 分钟观察和 real production evidence validate。
- 第 5.1-H.1-R.2-RERUN 已重跑 `Checkpoint Outcome 生产口径最终验收`，结论为 `PARTIAL_RUNTIME_HEALTH_REGRESSION`，不是 PASS。本轮未修改业务代码、未修改策略/扫描/UI 交易逻辑、未运行 formal、未动数据库/Redis/Postgres/volume、未 push main。
- 第 5.1-H.1-R.2-RERUN 证据显示：公网 Caddy API 可访问，`/api/health` HTTP 200，`health.level=ready`，但 `scan.status=partial`；第二次复查时 `scan.freshness=aging`，`/api/scan` 仍为 partial，CoinGlass requestFailures 包含 EDGE / USELESS 的 429 Too Many Requests。
- 第 5.1-H.1-R.2-RERUN 生产 evidence validate 正确失败：`phase4-3-1-summary.json.production_status must be pass`。按任务书要求，Step 0 运行健康回退时必须停止，因此本轮未继续执行 runner loop 两周期观察、dry-run、manual checkpoint、daily summary 或 server backup。
- 第 5.1-H.1-R.2-RERUN 下一步只能先恢复生产 `scan.status=ready` 并让 production evidence validate pass，然后从 Step 0 重跑本轮；不能进入 5.1-H，不能进入 5.2，不能写成支撑实盘交易。
- 第 5.1-H.1-R.2 已完成 `Checkpoint Outcome 生产口径最终验收`，结论为 `PARTIAL_NEEDS_RUNNER_LOOP_FIX`，不是 PASS。生产 runtime health、CoinGlass、worker heartbeat、scan freshness、production evidence validate 均已恢复并通过；manual checkpoint / dry-run / idempotency / missing price handling / research-only 隔离均通过。
- 第 5.1-H.1-R.2 证据显示：runId=`shadow-v1-20260707T182114Z`，checkpoint total=3636，due_total=2448，due_pending 从 148 降到 0，outcomes.jsonl 行数从 2300 增至 2448。新增 outcome 均因旧 Shadow baseline 缺 `priceAtObservation` 被正确标记为 `pending_with_error / MISSING_PRICE_AT_OBSERVATION`，没有伪造历史价格、没有 fake outcome、没有 future data leak。
- 第 5.1-H.1-R.2 阻断点：Shadow runner loop 未保持运行，runner lock pid 不存活，heartbeat stale，未观察到自动 capture/checkpoint due sweep。本轮只能证明 manual checkpoint 闭环，不得进入第 5.1-H 24h Shadow Health Review，不得进入 5.2，不得写成支撑实盘交易。下一步必须先修复 Shadow runner loop 启动/保活/自动 due sweep，再重跑 5.1-H.1-R.2。
- 第 5.1-H.1-R.1 已完成 `Production Evidence Health / Status Partial 收口`，结论为 `PARTIAL_PRODUCTION_STATUS_NOT_READY`，不是 PASS。生产 API 可访问，但真实生产状态仍为 partial，不能进入 5.1-H.1-R.2，不能进入 5.2，不能写成支撑实盘交易。
- 第 5.1-H.1-R.1 证据显示：`/api/health` HTTP 200、`level=ready`、Postgres ready、Redis healthy、`scan.freshness=fresh`，但 `scan.status=partial`；scanner-worker、websocket-light-worker、coinglass-worker、signal-worker、dynamic-scan-scheduler、macro-worker 均未收到心跳，worker heartbeat 状态为 down。
- 第 5.1-H.1-R.1 证据显示：`/api/scan` HTTP 200，但 `scan.status=partial`、`scannedCount=0`、`candidateCount=0`、`/api/scan signals=0`。公开发现层仍可用，liveInstrumentCount=1315；CoinGlass 深扫计划请求 24 次，但 rawRows=0、cleanRows=0、requestFailures=24。
- 第 5.1-H.1-R.1 证据显示：后端合同中 CoinGlass runtime capability 为 `deepScanStatus=auth_error`，`/api/futures/pairs-markets` 返回 `Invalid API key provided`。这不是“市场无机会”，而是生产 CoinGlass 深扫鉴权/运行状态未恢复。
- 第 5.1-H.1-R.1 已修复 production evidence 工具口径：本地验证生产 API 时支持 `OPS_PROXY_URL` 只读采集；production status 不再复用旧 `production-health.json` / `production-smoke.json`；`scan.status` 与 `scan.freshness` 分离；worker heartbeat down 会使 health/status 保持 partial；validator 未被弱化，仍要求 `production_health=pass` 与 `production_status=pass`。
- 第 5.1-H.1-R.1 production evidence 已重新生成，但 validate 正确失败：`phase4-3-1-summary.json.production_health must be pass`、`phase4-3-1-summary.json.production_status must be pass`。本轮没有伪造 pass，没有降低 validator 标准，没有修改 scan / analysis / strategy / UI 交易逻辑，没有运行 formal，没有动数据库、Redis、Postgres 或 volume。
- 第 5.1-H.1-R.1 下一步必须先修复腾讯云生产 CoinGlass API key / 套餐鉴权和 worker heartbeat，再重跑本轮生产证据。当前不能进入 `5.1-H.1-R.2 checkpoint outcome 生产口径最终验收`。
- 第 5.1-H.1-R 已执行到本地准备与安全分支阶段，结论为 `PARTIAL_LOCAL_FIX_NOT_APPLIED`，不是生产 PASS。安全分支 `codex/phase5-1-h-1-r-checkpoint-outcome-production-validation` 已推送，commit 为 `8518a14dcf03cd70e5470c3c9fd81e6e23a5dcb2`，只包含 `src/lib/shadow/storage.ts`、`src/scripts/shadow/shadow-tracking.ts`、`src/lib/shadow/storage.test.ts` 三个 Shadow 修复文件。
- 第 5.1-H.1-R 未能应用到腾讯云 live Shadow Runner：直接 SSH 超时，代理 SSH 到达认证阶段但失败，Codex 内置浏览器未暴露 OrcaTerm 标签。公网 `/api/health` 经代理返回 ready/fresh 只能证明生产当前可访问，不能证明本轮修复已应用。
- 第 5.1-H.1-R 当前边界：未创建服务器备份，未同步服务器 worktree，未执行服务器 dry-run/manual checkpoint/idempotency/runner-loop 验证，未验证 production isolation。下一步仍必须在可控腾讯云终端中应用安全分支并重跑 5.1-H.1-R，不能进入 5.2，不能写成支撑实盘交易。
- 第 5.1-H.1 已完成本地 `Checkpoint Outcome 回填闭环修复`，结论为 `PARTIAL_LOCAL_FIX_READY`，不是生产 PASS。当前未 push main、未运行 formal、未动数据库/Redis/Postgres/volume、未应用到腾讯云 Shadow Runner。
- 第 5.1-H.1 修改范围只限 Shadow research-only checkpoint/outcome：新增 checkpoint outcome writer、Binance Futures 历史 K 线 price source adapter、`shadow:checkpoint -- --dry-run`、幂等写入、latest/daily summary checkpoint 状态同步、runner loop 每次 capture 后的轻量 due sweep。未修改 scan / analysis / strategy / UI 交易逻辑，未降低 RR，未开启自动交易。
- 第 5.1-H.1 本地验证 runId 为 `shadow-20260707T134822Z`。修复前 checkpoint total=72、due=48、duePending=48、recorded=0、missed=0、pending_with_error=0；修复后 duePending=0、pending=24、recorded=0、missed=0、pending_with_error=48，`outcomes.jsonl` 写入 48 行。
- 第 5.1-H.1 的 recorded 仍为 0 是合理结果：本地 5.1 legacy baseline 缺少 `priceAtObservation`，系统按规则标记 `pending_with_error / MISSING_PRICE_AT_OBSERVATION`，没有伪造检测价、没有计算 rawMove/MFE/MAE、没有使用当前价冒充历史价。
- 第 5.1-H.1 基础门禁通过：typecheck、lint、shadow:validate、shadow:checkpoint dry-run、shadow:checkpoint、shadow:daily-summary、Shadow storage 单测 13/13、test:market 827 + worker 17 + historical smoke 4、build、backtest:golden 16/16、forbidden-files、secret-patterns、security-check。
- 第 5.1-H.1 下一步必须是 `phase5_1_h_1_r_checkpoint_outcome_validation`：把该修复应用到腾讯云 research-only Shadow Runner 后，验证生产 live run 的到期 checkpoint 是否能回填为 recorded / missed / pending_with_error。完成前不能重跑 5.1-H 写 PASS，不能进入 5.2，不能写成支撑实战交易。
- 第 5.1-H-pre 已完成 Shadow Checkpoint Due / Outcome Precheck，结论为 `PARTIAL_NEEDS_5_1_H_1`，不是 24h PASS。runId 仍为 `shadow-v1-20260707T182114Z`。
- 第 5.1-H-pre 服务器侧证据显示：checkpoint total=2664、due=1464、pending=2664、recorded=0、missed=0、pending_with_error=0、due_pending=1464；其中 1h due pending=833、4h due pending=631、24h due pending=0。
- 第 5.1-H-pre 已在腾讯云 web 容器内显式 `--out-dir /app/reports/phase5-1-1-tencent-shadow-runner-start/shadow --run-id shadow-v1-20260707T182114Z` 执行 manual checkpoint、validate、daily-summary。执行安全，未发现 fake outcome、未污染 production ranking、未开启自动交易；但 manual checkpoint 只刷新 `checkpoint-status.json`，不会回填 `priceAtCheckpoint`、MFE/MAE，也不会把 checkpoint 标成 recorded/missed。
- 第 5.1-H-pre 明确发现 P1：runner loop 当前只做 capture 和 heartbeat，不调用 checkpoint；`priceAtObservation` 当前缺失，`priceAtCheckpoint` 无真实价格源和写入逻辑；manifest 声明 `outcomesPath`，但当前没有实际 outcomes writer。因此下一步必须做 `5.1-H.1 checkpoint outcome 回填闭环修复`，不能直接等 24h 重跑，也不能进入 5.2。
- 第 5.1-H-R 已重跑 Shadow Runner 24h 健康复查，结论仍是 `PARTIAL_NOT_DUE`，不是 24h PASS。runId 为 `shadow-v1-20260707T182114Z`，startedAt 为 `2026-07-07T18:21:14.045Z`，服务器采集时间为 `2026-07-08T06:25:07Z`，已运行约 12.06 小时，预计 24h 到期时间为 `2026-07-08T18:21:14.045Z`。
- 第 5.1-H-R 已用腾讯云服务器内侧口径复取当前 runner：PID 737 alive，cmdline 为 `shadow-tracking.js run-loop`，lock/runId 一致，heartbeatAt 为 `2026-07-08T06:21:27.798Z`，heartbeat fresh。Shadow 仍为 research-only，enrichment gate pass，production evidence validate pass。
- 第 5.1-H-R 当前结论：可以继续 Shadow 观察态运行，但不能进入第 5.2，不能写成支撑实战交易；checkpoint dueCount 为 1323 且仍为 pending，说明 outcome 回填闭环尚未证明可用；Shadow manifest 记录的 production commit `45d854afafb9ba7931a30973bf8e553cd0b91f7d` 与当前服务器 HEAD `ae6852cfa2a2c9c09faa5d41ae6f5c886f023679` 不一致，后续正式 24h 验收必须收口。
- 第 5.1-R 已补齐 Shadow Tracking v1 正式启动代码入口、统一决策 enrichment gate、runner CLI 和测试保护，但本轮没有成功启动长期 Shadow Tracking。
- 第 5.1-R 启动命令已执行：`shadow:start --no-background --out-dir phase5-1-r-shadow-v1-start`。结果为 `PARTIAL / preflight_failed`，原因是当前执行环境访问生产公网入口失败：`production_health_fetch_failed:fetch failed`、`enrichment_preflight_failed:fetch failed`。
- 第 5.1-R 硬边界：`shadowTrackingStarted=false`，没有生成 running run，没有 first capture，没有 checkpoint plan，不允许写成已开始样本积累。下一步必须在腾讯云服务器侧或稳定生产访问通道中启动 runner。
- 第 5.1-R 本地基础门禁通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns、security-check、test:production-evidence、shadow:validate。
- 第 5.1 已建立 Shadow Tracking v1 文件存储基线与 run manifest：`reports/shadow-tracking/` 已生成 `manifests/current-run.json`、`events/<runId>/events.jsonl`、`events-manifest.json`、`checkpoint-plan.json`、`latest.json`、`latest.md`。
- 第 5.1 runId：`shadow-20260707T134822Z`；捕获来源为生产 `/api/scan` 快照，生产 commit `ae6852cfa2a2c9c09faa5d41ae6f5c886f023679`，production health `pass`，production evidence validate `pass`。
- 第 5.1 baseline 捕获：24 个生产信号事件、24 个唯一币种、72 个待记录 checkpoint（1h/4h/24h），READY=0，OBSERVE=16，WAIT=1，BLOCKED=7。
- 第 5.1 边界：`shadowTrackingStarted=false`，只做 baseline readiness，不启动 7-14 天 Shadow Tracking，不写未来 outcome，不修改 production ranking，不自动调参，不自动下单，仍不能写成支撑实战交易。
- 第 5.0-R 已在 CoinGlass key 修复后重跑生产基线：生产 commit `ae6852cfa2a2c9c09faa5d41ae6f5c886f023679`，与本地安全分支 HEAD 一致；本轮未 push main、未部署、未运行 formal、未动 Postgres / Redis / volume。
- 第 5.0-R 生产 API 复查：`/api/health` 3/3 HTTP 200 ready/fresh，`/api/scan` 3/3 HTTP 200 ready，`/api/radar/backend-contract` 3/3 HTTP 200 且 CoinGlass deep scan ready。
- 第 5.0-R 连续扫描观测：3 轮 `scannedCount=28`、`candidateCount=23`、`anomalyCount=23`、`radarSignals=23`，CoinGlass `invalid_key=0`，CoinGlass `429=0`。
- 第 5.0-R 复查结论：CoinGlass key 修复后的扫描基线已恢复，production smoke/status pass，unifiedDecision / overlay guard 未退化；但 Shadow Tracking 专用 report/storage/run manifest 仍为 partial。
- 当前可把第 5.1 存储基线交给 GPT 审计；审计确认后才可进入第 5.1-R 正式启动长期 Shadow Tracking。仍不能写成支撑实战交易。
- 第 5.0 基线曾发现腾讯云生产 CoinGlass 深扫全部失败，错误为 `Invalid API key provided`，导致 `scannedCount=0`、scan `partial`，不能进入 Shadow Tracking。
- 第 5.0.1 生产检查确认：服务器 `.env.production` 中的 `COINGLASS_API_KEY` 与运行中容器读取到的 key 指纹不一致；根因是 app 容器仍读取旧环境变量。
- 第 5.0.1 已只重建 app 容器，不动 Postgres / Redis / volume / schema。重建后 `web`、`scanner-worker`、`coinglass-worker` 等服务读取同一 CoinGlass key 指纹；真实 key 值未输出。
- CoinGlass capability probe 已从 `auth_error` 恢复为 `ready`，可用端点包括 `futures_pairs_markets`、`open_interest_current`、`funding_current`；`taker_buy_sell_current` 仍为不可用/受限边界。
- 生产深扫已重新返回真实数据：基线轮出现 `scannedCount=31`、`candidateCount=23/24`、`coinglass request failures` 不再是 invalid key。
- 当前仍不能写成实战成熟：最新一轮深扫出现单个 CoinGlass `429 Too Many Requests`，scan 可为 `partial`。这是限速/节流风险，不是 key 鉴权失败。

## 1. 项目一句话定义

Market Radar 是一个面向山寨币合约市场的雷达系统，用于快速全市场扫描，发现山寨币机会，给出策略，并通过复盘持续自我提升。

## 2. 项目唯一核心目标

唯一核心目标：

```text
快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。
```

四个核心能力：

1. **快速全市场覆盖扫描**：尽快覆盖 Binance / OKX / Bybit 等公开合约市场，发现哪些币开始异常波动。
2. **发现真正有价值的机会**：从涨跌幅、成交、压缩、相对强弱、关键位、衍生品验证中筛出值得继续深扫的标的。
3. **给出可执行、可解释、可失效的策略**：明确为什么看、能不能做、触发条件、止损、目标、结构盈亏比、失效条件。
4. **通过复盘持续自我提升**：追踪命中、失败、超时、漏判、错判、策略分型表现，避免系统只会展示而不能进化。

当前必须诚实说明：系统已具备可运行的扫描、展示、生产部署和部分复盘基础，但仍不能写成“实战成熟交易系统”。

## 3. 核心链路

固定链路：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

### 3.1 全市场发现

- 环节：全市场发现
- 负责目录：`src/lib/market`、`deploy/workers`
- 关键文件：`src/lib/market/universe-registry.ts`、`src/lib/market/providers/public-futures-universe-discovery.ts`、`src/lib/market/providers/public-light-scan.ts`、`src/lib/market/ws-light-scan.ts`、`deploy/workers/ws-light-scan-worker.mjs`
- 输入：Binance / OKX / Bybit public universe、public ticker、WebSocket 轻扫数据、Redis 轻扫快照
- 输出：可扫描 universe、轻扫覆盖数、轻扫候选、实时能力状态、扫描证明
- 当前状态：生产 smoke 显示 totalMonitored=593、scannable=593、lightScanned=593、coverage=100；WebSocket secondLevelOnline=true
- 主要风险：轻扫只能发现异常，不能生成交易计划；WebSocket 快照 stale 时必须明确降级；全市场覆盖成功不等于机会筛选成熟

### 3.2 候选筛选

- 环节：候选筛选
- 负责目录：`src/lib/market`、`src/lib/api`
- 关键文件：`src/lib/market/scan-state-pool.ts`、`src/lib/market/scan-coordinator.ts`、`src/lib/market/universe-priority-hints.ts`、`src/lib/api/backend-contract.ts`
- 输入：轻扫候选、状态池、历史 hints、daily mover 样本、候选轮换状态
- 输出：深扫排队、当前批次、长时间未扫资产、候选分层、rotation audit
- 当前状态：已有状态池、两阶段 allocation、rotation audit；第一轮修复了 `WARM` 资产深扫排队证明边界
- 主要风险：候选排序主干仍需长期验证，不能让少数热门币长期霸占 Top10；候选不能冒充信号

### 3.3 深扫验证

- 环节：深扫验证
- 负责目录：`src/lib/market/providers`、`deploy/workers`
- 关键文件：`src/lib/market/providers/coinglass-provider.ts`、`src/lib/market/providers/coinglass-client.ts`、`src/lib/market/providers/coinglass-capability-probe.ts`、`deploy/workers/protected-api-worker.mjs`
- 输入：深扫候选、CoinGlass Hobbyist 可用端点、公开交易所衍生品补充数据
- 输出：OI、Funding、pairs markets、CoinGlass capability、深扫 cleanRows/rawRows/failures
- 当前状态：第 5.0.1 已修复生产容器读取旧 CoinGlass key 的问题；capability probe 为 `ready`，`futures_pairs_markets`、`open_interest_current`、`funding_current` 可用；生产 scan 已重新出现 `scannedCount=31`，不再是 invalid key 导致的 0 深扫。
- 主要风险：CoinGlass Hobbyist 有限速和端点边界；最新基线仍出现单个 `429 Too Many Requests`，scan 可能为 `partial`；CoinGlass 失败不能写成市场无机会；公开交易所深扫不能冒充 CoinGlass

### 3.4 结构分析

- 环节：结构分析
- 负责目录：`src/lib/analysis`、`src/lib/analysis/v3`
- 关键文件：`src/lib/analysis/v3/market-reading-engine.ts`、`src/lib/analysis/v3/key-level-engine.ts`、`src/lib/analysis/v3/forward-level-map.ts`、`src/lib/analysis/v3/pattern-library.ts`、`src/lib/analysis/v3/current-signal-dossier.ts`
- 输入：OHLCV、关键位、趋势完整度、形态、技术指标辅助、宏观锚点、衍生品证据
- 输出：结构判断、关键位、Forward Map、证据链、反证链、成熟度
- 当前状态：已有 v3 结构分析骨架和测试；TradingView/Kline 合同已有基础；但分析报告可读性和实战稳定性仍需要专业回测继续校验
- 主要风险：技术指标不能单独给结论；低周期不能推翻高周期；大涨后看多/大跌后看空容易晚到

### 3.5 风险赔率

- 环节：风险赔率
- 负责目录：`src/lib/analysis/v3`、`src/lib/risk`
- 关键文件：`src/lib/analysis/v3/trade-plan.ts`、`src/lib/analysis/v3/forward-level-map.ts`、`src/lib/risk/personal-position-lens.ts`
- 输入：入场触发、止损、目标、关键位、结构空间、个人杠杆展示参数
- 输出：结构盈亏比、风控门禁、是否允许生成计划
- 当前状态：最低结构盈亏比 3:1 是硬下限；个人仓位镜头用于展示风险，不允许改变结构 RR 逻辑
- 主要风险：策略层容易卡死或过松；止损/目标位必须更聪明而不是单纯放宽；杠杆展示不能绕过风控门禁

### 3.6 交易计划

- 环节：交易计划
- 负责目录：`src/lib/analysis/v3`、`src/lib/api`、`src/components/token`
- 关键文件：`src/lib/analysis/v3/trade-plan.ts`、`src/lib/market/signal-backend-dossier.ts`、`src/app/api/frontend/token-dossier/route.ts`、`src/components/token/token-dossier.tsx`
- 输入：证据融合、结构分析、风险赔率、风控门禁、成熟度
- 输出：可执行计划、等待条件、失效条件、分批止盈、不可交易原因
- 当前状态：已有 token dossier 和 strategyV3 输出基础；计划复核区只允许后端事实源确认的 `TRADE_PLAN_READY`
- 主要风险：前端不能编计划；`WAIT` 不能冒充 `READY`；没有计划就绪时宁可空，不允许候选补位

### 3.7 复盘进化

- 环节：复盘进化
- 负责目录：`src/lib/analysis/v3`、`src/lib/market`、`src/lib/api`、`src/app/review`
- 关键文件：`src/lib/analysis/v3/forward-map-review.ts`、`src/lib/analysis/v3/forward-map-review-executor.test.ts`、`src/lib/market/daily-mover-ingest.ts`、`src/lib/market/daily-mover-kline-backtest.ts`、`src/app/api/frontend/review-contract/route.ts`
- 输入：信号生命周期、daily movers、后续价格路径、MFE/MAE、命中/失败/超时、漏判样本
- 输出：复盘报告、策略分型统计、错判/漏判归因、下一步规则建议
- 当前状态：已有 review contract、daily mover、outcome、forward map review 基础；但样本和能力验收仍不足
- 主要风险：回测 future outcome 不得污染 production score；复盘结论不能自动改生产权重；当前系统仍需要更多真实样本验证

## 4. 当前技术架构

- 前端：Next.js App Router + React + TypeScript + Tailwind，页面位于 `src/app`，组件位于 `src/components`
- 后端：Next.js Route Handlers，核心 API 位于 `src/app/api`，业务逻辑主要位于 `src/lib`
- 数据库：PostgreSQL，生产由 Docker Compose `postgres` 服务提供，持久化通过 repository 层访问
- 缓存：Redis，生产由 Docker Compose `redis` 服务提供，用于 WebSocket 轻扫快照、运行状态等
- worker：Docker Compose worker 服务，包括 scanner、websocket light scan、coinglass、signal、dynamic scheduler、macro
- 反代：Caddy，配置位于 `deploy/caddy/Caddyfile`
- 部署：Docker Compose 单机部署
- 代码正本：GitHub `main`
- 生产服务器：腾讯云香港单机
- reports volume：Docker volume `reports-data`，挂载到 `/app/reports`
- 重要边界：Vercel / Neon 已不再是主部署路线，但旧配置未必全部删除；当前生产主线是腾讯云香港单机

## 5. Docker 服务清单

| 服务名 | 作用 | 启动命令 | 依赖 | 是否核心 | 当前风险 |
|---|---|---|---|---|---|
| `web` | Next.js 前端和 API 服务 | Dockerfile 默认启动 `npm run start` | postgres、redis | 是 | Web 健康依赖 `/api/health`，如果只页面 200 不代表业务实战成熟 |
| `caddy` | 公网 HTTP/HTTPS 入口和反向代理 | `caddy run --config /etc/caddy/Caddyfile` | web healthy | 是 | Caddy 正常只能证明入口可访问，不能证明分析能力 |
| `postgres` | 生产关系数据库 | postgres 官方镜像 entrypoint | 无 | 是 | 不允许在普通轮次清表/迁移；备份恢复演练仍应持续验证 |
| `redis` | 缓存、WebSocket 轻扫快照、运行状态 | `redis-server --appendonly yes` | 无 | 是 | Redis 正常不代表快照新鲜，必须看 stale/age |
| `scanner-worker` | 定时触发 `/api/scan` | `node deploy/workers/protected-api-worker.mjs scanner` | web healthy | 是 | CRON_SECRET 错误会导致扫描停摆；served_cache 不能冒充 updated |
| `websocket-light-worker` | Binance/OKX/Bybit WebSocket 秒级轻扫 | `node deploy/workers/ws-light-scan-worker.mjs` | redis、web | 是 | 秒级轻扫只做发现和调度，不能直接生成交易计划 |
| `coinglass-worker` | daily mover ingest 和 K 线缓存填充 | `node deploy/workers/protected-api-worker.mjs coinglass` | web healthy | 是 | CoinGlass 限速/端点不可用必须 partial/unavailable，不可静默降级成假数据 |
| `signal-worker` | outcome、forward map review、shadow tracker | `node deploy/workers/protected-api-worker.mjs signal` | web healthy | 是 | 复盘结果不能污染生产排序或实时评分 |
| `dynamic-scan-scheduler` | health watch 和动态扫描调度辅助 | `node deploy/workers/protected-api-worker.mjs dynamic` | web healthy | 是 | 只能调度/观察，不能绕过扫描链路边界 |
| `macro-worker` | 宏观环境采集 | `node deploy/workers/protected-api-worker.mjs macro` | web healthy | 辅助核心 | 宏观环境只能做顺风/逆风背景，不能直接给个币方向 |

## 6. 主要页面说明

| 页面 | 页面作用 | 主要 API / 数据入口 | 展示什么 | 不能展示什么 | 是否可能误导用户 | 当前状态 |
|---|---|---|---|---|---|---|
| `/dashboard` | 雷达总控 | `getRadarContractForPage`、`getLeaderboardContractForPage`、`/api/frontend/radar-contract` | 系统状态、覆盖率、候选池摘要、轻扫/深扫、数据源、大盘环境 | 不能把候选当交易推荐 | 是，如果只看卡片不看成熟度 | 可访问；production smoke 200 |
| `/signals` | 候选验证台 | `getRadarContractForPage`、`getLeaderboardContractForPage` | 验证成熟度池、计划复核区、异动候选明细 | 轻扫标记不能进主信号区；WAIT 不能进计划复核区 | 是，尤其候选/观察项/计划边界 | 可访问；需继续审计展示是否强于后端 |
| `/leaderboard` | 每日异动复盘榜 | `getAllLeaderboardContractsForPage`、`/api/frontend/leaderboard` | 涨跌幅、成交额、强弱、衍生品排行和候选标记 | 榜单不能冒充推荐 | 是，榜单天然容易诱导追涨杀跌 | 可访问；production smoke 显示榜单 live |
| `/market` | 大盘环境与市场数据 | `getRadarContractForPage`、leaderboard contracts | BTC/ETH、BTC.D/TOTAL2/TOTAL3、衍生品/宏观环境 | 宏观不能直接给个币方向 | 中等，需明确 context-only | 可访问 |
| `/token/[id]` | 单币档案 | `getTokenDossierContractForPage`、`getKlineContractForPage`、leaderboards | TradingView/K线合同、证据链、关键位、风控、计划状态、历史样本 | 前端不能编交易计划；无后端证据不能显示 READY | 高，是交易决策核心页 | 可访问；需要重点审计实战可读性 |
| `/review` | 复盘进化中心 | `getReviewContractForPage`、`/api/frontend/review-contract` | daily mover、扫描帧、交易日记、样本归因、回测/复盘状态 | 不能把回测结论写进生产排序 | 高，future outcome 污染风险 | 可访问；需要持续样本验证 |
| `/system` | 系统中心 | `getRadarContractForPage` | 服务健康、数据源、扫描稳定性、告警/偏好 | 不能把系统健康等同于交易能力健康 | 中等 | 可访问 |
| `/login` | 身份核验入口 | `src/components/auth/login-terminal.tsx`、auth middleware/config | 私有模式下的登录入口 | 不能泄露服务端数据 | 中等；取决于私有模式配置 | 页面存在，需单独审计 session/路由级鉴权 |

页面硬规则：

- 候选不能冒充信号。
- WAIT 不能冒充 READY。
- 榜单不能冒充推荐。
- 前端不能编交易计划。

## 7. API 合同说明

| API | 作用 | 是否公开 | 是否需要 CRON_SECRET | 是否读 DB | 是否写 DB | 是否读 Redis | 是否调用外部 API | 是否给前端展示 | 风险 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `/api/health` | 系统健康、数据源、持久化、扫描、worker heartbeat | 是 | 否 | 是 | 否 | 可能 | 否 | 是 | ready/fresh 只能证明运行状态，不等于实战能力成熟 |
| `/api/scan` | GET 读扫描摘要；POST 触发扫描刷新 | GET 公开，POST 受保护 | POST 是 | 是 | POST 可能写归档/状态 | 可能 | POST 可能调用 | 部分 | served_cache 不能冒充 updated；POST 未授权必须失败 |
| `/api/archive` | 扫描回放归档读取 | 是 | 否 | 是 | 否 | 否 | 否 | 是 | 归档为空或旧数据时必须明确 |
| `/api/frontend/radar-contract` | 前端雷达总控合同 | 是 | 否 | 是 | 否 | 可能 | 间接读取缓存 | 是 | 前端主事实源，不能静默补假数据 |
| `/api/frontend/leaderboard` | 前端榜单合同 | 是 | 否 | 是/可能 | 否 | 可能 | 可能调用公开市场数据 | 是 | 榜单只做观察和复盘，不可推荐交易 |
| `/api/frontend/token-dossier` | 单币档案合同 | 是 | 否 | 是 | 否 | 可能 | 否/间接 | 是 | 交易计划必须来自后端 dossier，前端不能编 |
| `/api/frontend/kline-contract` | K线/TradingView/关键位合同 | 是 | 否 | 是 | 否 | 否 | 否/间接 | 是 | K线缺失时必须 waiting/unavailable，不可用 mock 伪装 |
| `/api/frontend/review-contract` | 复盘中心合同 | 是 | 否 | 是 | 否 | 可能 | 否 | 是 | 复盘样本不能污染生产排序 |
| `/api/radar/backend-contract` | 后端总事实合同 | 是 | 否 | 是 | 否 | 可能 | 否/间接 | 给前端和审计 | 合同字段多，前端不能只取好看的字段 |
| `/api/radar/business-capability` | 业务能力状态合同 | 是 | 否 | 是 | 否 | 可能 | 否 | 是/审计 | readiness 不是收益能力证明 |
| `/api/admin/*` | 生产运维、ingest、outcome、migration、capability 等 | 否 | 是 | 视接口而定 | 视接口而定 | 视接口而定 | 视接口而定 | 否 | 必须严格鉴权；不得泄露 secret；普通轮次不得随意迁移/清表 |

## 8. 数据源说明

| 数据源 | 用途 | 是否秒级 | 是否能生成交易计划 | 失败时如何展示 | fallback | 当前边界 |
|---|---|---:|---:|---|---|---|
| Binance | USDT 永续 universe、ticker、K线、部分 public 衍生品、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否，只能参与发现/验证 | partial/stale/failed | OKX/Bybit/public REST | 交易所数据不能单独给策略 |
| OKX | universe、ticker、K线、public swap 数据、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否 | partial/stale/failed | Binance/Bybit | symbol 格式和合约口径需清洗 |
| Bybit | universe、ticker、public linear 数据、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否 | partial/stale/failed | Binance/OKX | 只能做交叉验证/轻扫补充 |
| CoinGlass Hobbyist | OI、Funding、pairs markets、深扫验证、daily movers | 否，受 30 调用/分钟和端点限制 | 否，必须经过结构分析和风控后才可能形成计划 | partial/unavailable/upgrade_required/auth_error/rate_limited | 公开交易所衍生品补充，但不能冒充 CoinGlass | Taker/CVD 类能力不能写成完整可用 |
| CoinGecko | BTC.D、TOTAL2/TOTAL3、trending、market context | 否 | 否 | partial/stale/unavailable | DefiLlama/公开源 | 宏观和榜单 context-only |
| DefiLlama | 宏观/链上/TVL/稳定币等 context | 否 | 否 | partial/stale/unavailable | CoinGecko/其它公开源 | 不能直接给个币方向 |
| DEX Screener | DEX 新币观察、流动性、热度、外部事件 | 接近实时但非交易所秒级 | 否 | context-only/partial | CoinGecko trending/external intel | 只做早期观察，不直接进合约交易计划 |
| 其它 external intel | 情报、事件、logo/身份映射、新闻背景 | 否 | 否 | context-only/partial/unavailable | 无或人工复核 | 外部情报不能喊单，不能绕过证据链 |

必须明确：

- WebSocket 轻扫不能生成交易计划。
- 榜单不能生成交易计划。
- CoinGlass 失败不能写成市场无机会。
- 外部情报不能直接喊单。
- 宏观环境不能直接给个币方向。

## 9. Scan / Analysis / Strategy / Backtest 边界

固定职责：

- SCAN 只负责发现。
- ANALYSIS 只负责判断结构和机会质量。
- STRATEGY 只负责是否可交易。
- BACKTEST 只负责评价和归因。

红线：

- backtest future outcome 不得污染 production score。
- MFE / MAE / qualityHit 不得进入生产排序。
- strategy blocker 不得过早压死 scan candidate。
- WAIT / WATCH 不得进入计划复核区。
- 轻扫标记不允许附带完整交易计划。
- 深扫候选可以展示“验证中”，但不能包装成“计划就绪目标”。
- `TRADE_PLAN_READY` 才允许进入计划复核区。

## 10. 当前测试体系

| 命令 | 用途 | 什么时候跑 | 是否每次必须跑 | 是否当前通过 | 最近一次结果 |
|---|---|---|---:|---:|---|
| `npm run typecheck` | TypeScript 类型检查 | 每次代码改动后 | 是 | 是 | 第四轮证据：exit=0 |
| `npm run lint` | ESLint 检查 | 每次代码改动后 | 是 | 是 | 第四轮证据：exit=0；有 1 个既有 warning：`priorityReasons` 未使用 |
| `npm run test:market` | 市场、worker、历史回测 smoke 单元测试 | 扫描/分析/worker 改动后 | 是 | 是 | 第四轮证据：exit=0，769 + 17 + 4 全部通过 |
| `npm run build` | Next.js 生产构建 | 推送/部署前 | 是 | 是 | 第四轮证据：exit=0 |
| `npm run backtest:golden` | Golden cases 验证 | 分析规则/边界改动后 | 是 | 是 | 第四轮证据：exit=0，16/16 |
| `npm run backtest:formal` | 正式能力验收回测 | 只在能力验收轮跑 | 否 | 已运行，但业务能力不通过 | 第五轮证据：exit=2；程序完成，裁判发现高优先级能力阻断 |
| `npm run production:smoke` | 生产公网页面/API/合同 smoke | 部署后、生产证据轮 | 是，生产变更后 | 是 | 第三轮前置门禁：exit=0 |

说明：`formal` 不是普通测试，只能在能力验收轮跑，不能在普通证据轮或修复轮随手运行。

## 11. 当前生产部署流程

当前实际部署方式：

```text
本地 / Codex 修改代码
-> 测试
-> commit
-> push GitHub 安全分支
-> GPT / 用户验收
-> 明确授权后合并 main
-> 明确授权后腾讯云服务器同步 main
-> 明确授权后 docker compose build/up
-> production smoke / evidence
```

当前状态：

- GitHub `main` 是代码正本。
- 腾讯云香港单机是当前生产主线。
- Docker Compose 负责 web、caddy、postgres、redis、workers。
- 第二轮生产证据中，production smoke 通过。
- SSH/scp 直连在第二轮仍不可用，OrcaTerm 可用；这会影响自动化效率。
- 第 4 步后，`production.yml` 不再监听 `push main` 自动生产部署；默认只手动触发 dry-run 质量门禁和证据包。
- `npm run production:deploy` / `npm run production:rollback` 默认 dry-run；真实生产动作必须使用显式 manual 命令并获得用户授权。

GitHub Actions / self-hosted runner：

- 当前是否已实现：已建立第 4 步生产观测 dry-run workflow 和证据 artifact 基础。
- 还差什么：真实腾讯云自动部署仍需单独授权、生产 runner/SSH 安全环境和部署验收轮。
- 是否还依赖手动执行：是。真实部署仍不能默认自动执行。

## 12. 当前项目真实状态

- 当前是否空壳：不是空壳。已有生产部署、真实 API、数据库、Redis、worker、公开交易所轻扫、CoinGlass 深扫基础、前端合同和生产 smoke。
- 当前是否可运行：可运行。Scanner sustained-health 和 Dormant Web-only target 均已通过各自 1800 秒真实生产观察；这只证明当前运行地基稳定，不证明完整业务链已达到实战能力。
- 当前是否完整：不完整。扫描、分析、策略、复盘都有基础，但仍需要专业能力验收。
- 当前是否支撑实战：**当前系统仍不能支撑实战。**
- 当前最大短板：
  1. Shadow Capture 已激活并通过即时健康验证，但 24 小时/289 样本观察仍在进行；最终证据前不能写 Activation PASS，任何样本失败必须自动回滚。
  2. Reconciliation 本地 10,000 条工具已准备，生产只读对账、shadow_verify 独立审批、canonical compat/read cutover 均未执行；Candidate 新链仍无 canonical authority。
  3. 第五轮 formal 的历史能力证据仍显示 `TRADE_PLAN_READY=0`、WAIT 有效率 `0%`、扫描和分析提前性不足；后续新证据通过前不得宣称实战能力改善。
  4. 公网 HTTPS/session/security 仍需按 G0.3 独立收口。
  5. 回测/复盘和生产评分边界必须持续防污染。

不能把“页面可访问”写成“系统可实战”。当前更准确状态是：**可运行但不完整，具备继续审计和能力验证的基础。**

## 13. 最近三轮关键事件

### 当前最新三轮（2026-07-16）

- Activation 第五次生产执行：绑定 `e5eb900...` 与全新脱敏 Bundle/request，legacy epoch2 安全 rearm 到 shadow_capture epoch3；Web、Candidate worker、health、DB/Redis 和生产身份即时验证 PASS，observer session-independent active。
- 真实观察：截至 22:59 已有 31/289 样本，但 24 小时尚未结束；严格保持“进行中”，没有把即时健康包装为最终 PASS。
- 并行本地准备：Reconciliation 治理/纯函数 9/9、PG16 10,000 条逐笔对账 0 difference、只读拒写与 phase unchanged PASS；生产未连接，不能替代下一 Gate。

以下第二至第五轮为历史审计记录，不代表当前最新生产版本：

### 第二轮

- 目标：证明线上生产环境真实、安全、新鲜、可访问。
- 改了什么：未改业务代码；轮换生产 CRON_SECRET；重启必要服务；采集生产证据；生成第二轮脱敏证据包。
- 测试结果：
  - 无 secret admin：401。
  - 旧 secret admin：401。
  - 新 secret admin：200。
  - `/api/scan?force=1`：status=updated。
  - `/api/health`：ready/fresh。
  - Docker：10 个服务，异常 0。
  - worker：6/6 healthy。
  - Redis：PONG。
  - Postgres：accepting connections。
  - production smoke：exit=0。
  - typecheck/lint/test:market/build/backtest:golden：全部通过。
- 是否通过：通过。
- 遗留问题：SSH/scp 直连仍不可用，本机无法直接拉取服务器完整 zip；业务实战能力仍未通过 formal 能力验收。
- 下一轮：可进入第三轮生产/业务链路审计，但不得把生产可用等同于实战成熟。

### 第三轮

- 目标：正式能力回测轮，验证系统是否真正具备“快速全市场扫描、发现机会、给出策略、自我提升”的核心能力。
- 改了什么：未改业务代码、未改 UI、未调策略、未改扫描排序、未改回测逻辑、未提交、未部署、未迁移数据库；只采集前置门禁、运行 formal、生成报告和证据包。
- 测试结果：
  - 前置 API 门禁：通过，`/api/health` 为 ready/fresh，Redis healthy，worker 6/6 healthy。
  - production smoke：exit=0。
  - typecheck/lint/test:market/build/backtest:golden：全部 exit=0。
  - formal：exit=2；程序完成，但裁判系统发现高优先级能力阻断。
  - formal 报告：`reports/professional-backtest-audit/2026-07-05T025649-925Z`。
- 是否通过：生产前置门禁通过；正式能力验收不通过。
- 关键结论：
  - 总判定：当前系统仍不能支撑实战。
  - 扫描：不合格，分数 `50.88`，通过率 `7.69%`。
  - 分析：不合格，分数 `48.05`，通过率 `23.81%`。
  - 策略：不合格，分数 `28.61`，通过率 `0%`。
  - `TRADE_PLAN_READY=0`。
  - WAIT 有效率 `0%`。
- 遗留问题：策略计划层是最大短板；WAIT/RR/止损/目标需要专项整改；不能为了提高 READY 数量降低风控门槛。
- 下一轮：进入第四轮整改，但只能做策略计划层专项整改，不建议新增功能或 UI。

### 第四轮

- 目标：策略计划层专项整改，只修 WAIT / RR / 止损 / 目标 / 关键位投射 / 触发确认。
- 改了什么：
  - `StrategyV3TradePlan` 增加可选结构化等待字段：等待区、触发条件、二次确认、等待原因、当前为什么不能做。
  - `buildV3TradePlan` 输出更清楚的 WAIT 结构，不把 WAIT 升级 READY。
  - `structure_repair_pending` 拆成建设性修复等待、失败阻断、普通观察。
  - WAIT 后验诊断新增：`trigger_not_reached`、`structure_invalidated_before_trigger`、`stop_too_close_to_entry`、`target_too_far_or_unrealistic`。
  - 修正 WAIT 诊断内部价格距离百分比计算，避免误用数量占比函数。
- 测试结果：
  - 定向测试通过：`trade-plan` 13/13、`location-rr` 11/11、`trend-integrity` 8/8、`professional-audit-round` 57/57。
  - `npm run typecheck`：通过。
  - `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
  - `npm run test:market`：通过，769 + 17 + 4 全部通过。
  - `npm run build`：通过。
  - `npm run backtest:golden`：通过，16/16。
- 是否通过：第四轮基础门禁通过；未跑 formal。
- 遗留问题：不能宣称实战可用；第四轮没有验证 formal 能力是否改善。
- 下一轮：第五轮正式回归验收，重点看策略分数、WAIT 有效率、`TRADE_PLAN_READY` 是否仍为 0。

### 第五轮

- 目标：正式回归验收第四轮策略计划层整改是否有效。
- 改了什么：未改业务代码、未改 UI、未改扫描/分析/策略/回测规则、未部署、未动数据库、未提交 Git；只运行前置门禁、formal 回归、生成第五轮报告和脱敏证据包。
- 测试结果：
  - 生产公网从本地 shell 访问 43.161.202.227:80/443 超时；通过 SSH 只读检查服务器本机 health 为 ready/fresh。
  - 生产服务器 HEAD 为 `a76010223`，本地第四轮 HEAD 为 `dc22fda6`，生产尚未同步第四轮。
  - `npm run typecheck`：通过。
  - `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
  - `npm run test:market`：通过。
  - `npm run build`：通过。
  - `npm run backtest:golden`：通过。
  - `npm run backtest:formal`：直连 Binance 首次失败；使用 `BACKTEST_CURL_PROXY=socks5h://127.0.0.1:7892` 后完整跑完，exit=2。
  - formal 报告：`reports/professional-backtest-audit/2026-07-05T043726-668Z`。
- 是否通过：formal 有效生成，但业务能力不通过。
- 核心结果：
  - 总判定：当前系统仍不能支撑实战。
  - 高优先级问题：第三轮 `60` -> 第五轮 `65`，退步。
  - 扫描：`50.88` -> `50.74`，退步。
  - 分析：`48.05` -> `46.57`，退步。
  - 策略：`28.61` -> `22.48`，退步。
  - `TRADE_PLAN_READY`：仍为 `0`。
  - WAIT 有效率：仍为 `0%`。
  - WAIT bad rate：`8.33%` -> `25%`，退步。
- 遗留问题：第四轮 WAIT 文案和诊断变细，但策略计划能力没有改善；RR/止损/目标和 WAIT 触发质量仍是最大短板。
- 下一轮：第六轮只建议做“关键位/RR/目标投射与 WAIT 触发质量专项审计整改”，不建议新增功能或 UI。

## 14. 当前 P0 / P1 / P2 风险

## 13.1 当前收敛状态补充（2026-07-06）

第 2.1 步补充收敛整改已把以下事实写入当前代码和测试边界：

- Token 单币档案不能再根据 v3 交易计划草案自行升级为 `TRADE_PLAN_READY`；必须同时满足后端 `SignalBackendDossier.signal.maturity.stage === TRADE_PLAN_READY`、完整 trade plan 和 risk gate 放行。
- `/dashboard` 已引入统一四层信息结构：L1 决策层、L2 中文解释层、L3 结构化证据层、L4 折叠技术层。
- `/signals` 用户可见措辞收敛为“验证候选 / 证据观察 / 计划复核区 / 后端计划门禁”，避免把候选、WAIT、EVIDENCE_SIGNAL 写成可执行信号。
- market provider registry 在真实 provider 未配置时 fail-closed 到 `unconfigured`，不再静态导入 mock provider 作为生产兜底。
- CI guard 已覆盖审计包、证据包、zip/log/raw/env 和 secret pattern 检查；文档里的连接串示例统一改为 `[REDACTED]`。
- 本轮不改变最低 `3:1` 结构 RR，不新增自动下单，不让 review/backtest 影响 production ranking，不部署腾讯云，不运行 formal。

当前真实状态仍是：**可运行但不完整，不能支撑实战。**

## 14. 当前 P0 / P1 / P2 风险

### P0 风险

1. 问题：前端把候选、WAIT、WATCH、榜单包装成交易机会。
   - 影响核心链路哪一环：候选筛选、交易计划。
   - 证据：蓝图和 API 合同反复强调候选不能冒充信号、WAIT 不得进入狙击榜。
   - 当前状态：已有成熟度分层，但仍需页面级审计。
   - 下一步：逐页检查 `/signals`、`/dashboard`、`/token/[id]`，确认展示文案和排序不越权。

2. 问题：backtest future outcome 污染 production score。
   - 影响核心链路哪一环：候选筛选、复盘进化、生产排序。
   - 证据：第一轮专门修复生产排序测试边界。
   - 当前状态：测试已补强，但需要继续审计数据流。
   - 下一步：审计所有 ranking reasons、priority hints、review outcome 到 production ranking 的路径。

3. 问题：secret / admin 鉴权风险。
   - 影响核心链路哪一环：生产安全。
   - 证据：第二轮已轮换生产 CRON_SECRET 并验证 401/200。
   - 当前状态：第二轮通过。
   - 下一步：继续保持证据包不含 raw secret，推动自动化部署也必须脱敏。

### P1 风险

1. 问题：Shadow Capture activation 已进入生产观察，但不可缩短的 24 小时/289 样本尚未完成。
   - 影响核心链路哪一环：生产部署、证据真实性、回归验收。
   - 证据：生产 exact `e5eb900...`，control shadow_capture/epoch3/unfrozen，observer active；截至 22:59 为 31/289 样本，尚无最终 observation evidence。
   - 当前状态：即时门禁 PASS、观察进行中；任何中途样本失败仍会触发自动回滚，不能提前晋级。
   - 下一步：保持生产代码和身份冻结至 observer 完成；随后只读核对最终证据 SHA、289 样本、24 小时覆盖和生产健康，再进入独立 reconciliation 执行包。

2. 问题：扫描排序主干不够强，优质机会未必稳定进入 Top10。
   - 影响核心链路哪一环：全市场发现、候选筛选。
   - 证据：长期讨论和回测反馈集中在“提前性”和“优质机会进入候选”的稳定性。
   - 当前状态：有状态池、轻扫、深扫 allocation，但仍需 formal 能力验收。
   - 下一步：用 formal 能力回测专门测试“启动前识别”和“候选召回率”。

3. 问题：分析推理报告可读性和实战解释力不足。
   - 影响核心链路哪一环：结构分析、交易计划。
   - 证据：用户反馈分析报告乱、看不懂、无法直接实战参考。
   - 当前状态：有 v3 dossier/forward map，但仍需业务表达重构和验收。
   - 下一步：按“为什么看、为什么不看、怎么错、怎么等”重构报告合同。

4. 问题：CoinGlass 与公开衍生品数据边界容易被误解。
   - 影响核心链路哪一环：深扫验证。
   - 证据：Hobbyist 支持范围和 Taker/CVD partial 需要明确展示。
   - 当前状态：第二轮深扫可用，但不是所有衍生品维度都完整。
   - 下一步：继续在 sourceAudit/dataSourceCapabilities 中区分 live/partial/unavailable。

### P2 风险

1. 问题：SSH/scp 自动化链路不稳定。
   - 影响核心链路哪一环：生产部署、证据采集。
   - 证据：第二轮本机无法直接 scp 拉取服务器完整 zip，只能通过 OrcaTerm 操作。
   - 当前状态：未根治。
   - 下一步：修复 SSH 公钥或建立受控 CI/CD，不要依赖手动浏览器终端。

2. 问题：页面 200 和健康 ready 可能被误读为能力成熟。
   - 影响核心链路哪一环：全链路验收。
   - 证据：第二轮只证明生产真实、安全、新鲜、可访问，不证明实战能力。
   - 当前状态：已在报告中标明；第三轮 formal 也证明当前仍不能支撑实战。
   - 下一步：第五轮跑正式回归验收，不要继续堆功能。

3. 问题：旧演示/legacy 文件仍存在但已降级。
   - 影响核心链路哪一环：前后端一致性、数据真实性。
   - 证据：`src/lib/radar-contract.ts` 保留旧同步 getter，但返回 empty/disabled，避免 mock 冒充真实。
   - 当前状态：兼容层可接受，但需要防止新页面误用旧 getter。
   - 下一步：检索所有页面数据入口，禁止直接读取旧 mock 数据。

## 15. 给 ChatGPT 的审计重点

请优先审计：

1. 核心链路是否自洽。
2. scan / analysis / strategy / backtest 是否互相污染。
3. 前端是否展示强于后端。
4. 是否存在 mock / fallback / stale cache 冒充真实。
5. WAIT / WATCH / EVIDENCE_SIGNAL 是否容易误导。
6. 是否有生产安全风险。
7. 测试是否真的证明了当前能力。
8. 下一轮最应该做什么。

建议 ChatGPT 不要只看“功能多不多”，而要看系统是否真正围绕：

```text
快速发现 -> 候选筛选 -> 深扫验证 -> 结构分析 -> 风险赔率 -> 交易计划 -> 复盘进化
```

## 16. 当前用户工作方式

- 用户不写代码。
- 用户只提出产品想法、交易逻辑观点和最终决策。
- Codex 负责执行工程实现。
- ChatGPT 负责架构审计、任务拆解、交易逻辑边界、验收标准和风险判断。

协作要求：

- 对用户尽量用中文和大白话。
- 不能把“能跑”说成“完整完成”。
- 不能用旧数据、mock、缓存或 fallback 冒充真实能力。
- 涉及网站核心能力时，必须先对照蓝图和核心链路。

## 17. 后续协作规则

每轮 Codex 必须输出：

1. 修改文件清单。
2. 每个文件为什么改。
3. 执行命令。
4. 测试结果。
5. 是否影响核心链路。
6. 是否影响 scan / analysis / strategy / backtest 边界。
7. 是否有新风险。
8. 是否可以进入下一轮。

每轮还必须说明：

- 是否改业务代码。
- 是否部署。
- 是否跑 formal。
- 是否动数据库。
- 是否包含 secret。
- 是否存在不能支撑实战的边界。

## 18. 第六轮全站逐数字 + 后端全链路审计状态

本节记录 2026-07-05 第六轮审计状态。该轮只做证据采集和审计包生成，不修改业务代码、不部署、不提交 Git、不运行 formal、不动数据库。

审计结论：

- 当前系统仍不能支撑实战。
- 本轮发现 P0：是。
- P0 数量：2。
- P1 数量：4。
- P2 数量：4。
- 当前不允许直接开始优化。

阻断原因：

1. 生产运行态事实源不可采集：公网 `/api/health` HTTP/HTTPS 超时；SSH 经 SOCKS TCP 可达，但认证阶段被关闭；本地 3000 未运行，本地也没有可用 Docker 命令。
2. 生产 HEAD 与 GitHub main / 本地 HEAD 一致性本轮不可复核。第五轮曾记录生产 HEAD 落后本地，本轮不能重新确认。

本轮能证明的正向事实：

- 静态代码显示狙击榜入口只允许 `TRADE_PLAN_READY`、`RR >= 3`、且无 `whyBlocked` 的信号进入。
- 榜单 fallback 投影候选时已有“候选不等于交易计划”的保护边界。
- `useLiveNumber` 当前不再随机制造数字漂移。
- 最近 formal 报告仍明确显示系统不能支撑实战：`TRADE_PLAN_READY=0`，WAIT 有效率为 0%，高优先级问题 65。

本轮不能证明的事实：

- 不能证明生产页面逐数字真实。
- 不能证明生产 API 合同字段和前端展示一致。
- 不能证明 Postgres、Redis、worker heartbeat、scan lock、reports volume 正常。
- 不能证明 CoinGlass、WebSocket 轻扫和公开交易所深扫当前真实工作。

下一轮优先级：

先做“生产事实源恢复与逐数字验收轮”，恢复只读 SSH / API / Docker / DB / Redis 证据采集。P0 未关闭前，不应进入扫描排序、策略、UI 或业务能力优化。

## 2026-07-06 第 2 步最终复查 + 中文命名体系收口

本节记录 2026-07-06 本地最终复查状态。该轮只做中文命名体系、状态语义、单一事实源、前端四层结构、review research-only、Git/CI 安全和测试验证收口；不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 阻断型 P1：无。
- 是否可进入第 3 步实战能力提升：可以。
- 是否可 push main：否。
- 是否可部署腾讯云：否。

本轮已验证：

- `TRADE_PLAN_READY` 仍是计划就绪区唯一入口。
- `TRADE` 只是 L1 决策状态，不进入计划就绪区。
- 候选观察、证据观察、等待条件、风控阻断和计划就绪的中文语义已收口。
- 前端核心展示不再使用 `n/a` 或 `0` 冒充未知值。
- Review / backtest 仍为 research-only，不污染 production ranking。
- 基础门禁通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns。

仍需说明：

- 本轮不是生产验证轮，不能证明腾讯云当前已同步。
- 本轮不是 formal 能力验收轮，不能证明扫描、分析、策略已经支撑实战。
- 历史 `SniperTarget` 类型仍保留 entry/stop/target 字段，当前 UI 不用它生成计划，但后续应单独清理。

下一轮优先级：

进入第 3 步实战能力提升，只围绕扫描、分析、策略三大核心做正式样本验证和能力提升。

## 2026-07-06 第 3 步实战能力提升

本节记录 2026-07-06 本地能力提升状态。该轮只做后端能力基础件和测试保护；不改 UI、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 是否 push main：否。
- 是否部署腾讯云：否。
- 是否可进入下一步受控接线：可以。

本轮已完成的本地能力基础：

- 深扫队列和候选质量证明增强：`deepScanCoveragePercent`、`pendingCount`、`oldestPendingAge`、`estimatedCycleMinutes`、`highPriorityPendingCount`、`skippedLowPriorityCount`、`priorityReason`。
- 统一决策引擎：把后端 v3 trade plan 归一化为 `OBSERVE / WAIT / BLOCKED / TRADE_PLAN_READY`，并要求 READY 必须满足后端 maturity、结构止损、目标、入场、RR >= 3 和无 blocker。
- 市场状态识别：新增 `TREND_UP / TREND_DOWN / RANGE / HIGH_VOLATILITY / LOW_LIQUIDITY / RISK_OFF / ALT_ROTATION / UNKNOWN`，只作为 `market_context_only`。
- 错失机会复盘：新增 research-only missed opportunity 归因，覆盖 scan、light scan、deep scan、analysis、strategy、data source、market regime、frontend 等错失原因。
- 机会生命周期：新增 research-only lifecycle，从 `DISCOVERED` 到 `OUTCOME_REVIEWED`，禁止 outcome 回写 production ranking。
- 账户级风险模拟器：按 1500 USDT、3% 初始保证金、BTC/ETH 150x、山寨币交易所最高杠杆做只读风险镜头，不改变结构 RR 和策略门禁。

测试结果：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

仍需说明：

- 本轮新增能力多为后端基础件，尚未接入生产 API / 前端展示。
- 本轮不证明真实市场样本下的候选 Top10、WAIT 转 READY 或策略命中能力。
- 本轮不证明腾讯云生产已同步。

下一轮优先级：

进入第 3.1 步：把统一决策引擎接入 radar signal、signals/sniper 可见状态和 token dossier 合同，作为计划状态的唯一后端出口；仍不改 UI 美观、不改 scan 排序、不部署。

## 2026-07-06 第 3.1 步统一决策引擎主链路接线与合同验收

本节记录 2026-07-06 本地合同接线状态。该轮只做统一决策引擎到 radar signal、signals/sniper 可见状态和 token dossier 主链路的接线；不改 scan 排序、不改 RR 门槛、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 是否 push main：否。
- 是否部署腾讯云：否。
- 是否可进入 3.1 验收复查：可以。

本轮已完成的本地合同接线：

- radar signal 和 `buildFrontendTokenDossierContract()` 均调用统一决策链路。
- radar signal / token dossier 合同新增 `unifiedDecision`，包含 `decision`、`decisionLabel`、`source=unified_decision_engine`、`canTradeNow`、`blockerReasons`、`waitPlanReady`、`readyPlan`。
- token dossier 前端 L1 决策只读 `unifiedDecision.decision`，不再用页面局部逻辑推导 TRADE / WAIT / BLOCKED。
- signals / anomaly / sniper 可见状态不再用前端 category、odds、候选数量或计划数量自行推断 READY。
- dashboard L1 只表达系统运行状态，不再把候选数量或计划数量包装成交易结论。
- `tradePlan` 只在 `unifiedDecision.canTradeNow=true` 时暴露。
- WAIT 只展示等待条件，不生成入场、止损、目标。
- 修复 stale READY 风险：后端 maturity 残留为 `TRADE_PLAN_READY` 但没有完整后端计划时，token dossier 不再保留 visible `TRADE_PLAN_READY`。
- READY 硬门槛 blocker 增加 severity，缺入场、缺结构止损、缺目标、RR 不足、plan blocker 等均为 critical。

测试结果：

- 定向合同/展示/guard 测试：52/52 通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 807 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

仍需说明：

- 本轮只证明 radar signal、signals/sniper 可见状态和 token dossier 决策出口已接入统一决策链路。
- Kline readonly overlays 仍需单独审计，避免图表视觉层比决策合同更强。
- 本轮不证明腾讯云生产已同步。

下一轮优先级：

进入 3.1 验收复查，随后做 Kline / TradingView readonly overlay 边界审计，防止图表视觉层看起来强于统一决策合同。

## 2026-07-06 第 3.2 步图表叠加层与严格单一事实源最终收口

本节记录 2026-07-06 本地图表合同收口状态。该轮只修 Kline / TradingView overlay 与统一决策事实源的错位；不改 scan 排序、不改策略规则、不降低 RR、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮修复前发现 P0：Kline overlay 会把非 READY 的 v3 trade plan 草案显示成“结构止损 / TP”视觉线，可能与右侧“不能交易”结论冲突。
- 本轮本地修复后：Kline overlay 的交易计划线只允许来自 `unified_decision_engine` 的 `readyPlan`。
- 是否 push main：否。
- 是否部署腾讯云：否。

本轮已完成的本地合同收口：

- `KlineOverlay` 增加 `semanticRole`、`allowedUse`、`sourceDecision`。
- `target/stop` overlay 必须满足 `semanticRole=ready_trade_plan`、`allowedUse=ready_trade_plan_only`、`sourceDecision=unified_decision_engine` 才可渲染。
- `buildFrontendKlineContract()` 不再无条件从 `dossier.strategyV3.tradePlan` 输出止损/TP。
- 非 READY：只允许显示支撑、压力、前方结构、失效观察等结构参考。
- WAIT：只允许显示“等待触发区 / 等待失效参考”，不得显示为入场、止损或 TP。
- stale / partial / cached Kline 数据不允许显示 ready trade plan overlay。
- `chartIntegrity.overlaySource` 不再把 v3 草案标记为 trade plan overlay；READY 图表计划线来源改为 `v3_key_levels_forward_map_unified_ready_plan`。

定向验证：

- `npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js`：通过，32/32。
- `npm run typecheck`：通过。
- 完整基础门禁仍需在本轮最终报告中记录。

仍需说明：

- 本轮不证明腾讯云生产已同步。
- 本轮不证明策略命中率或实战能力达标。
- 后续能力提升仍需围绕扫描提前性、分析准确性、策略有效性和复盘闭环继续验收。

## 附录 A：核心相关文档清单

建议外部审计员优先阅读这些文档，而不是一次性读完整 docs：

- `docs/chuan-market-radar-blueprint.md`：长期事实源、核心目标、边界和不做什么。
- `docs/chuan-market-radar-engineering-charter.md`：长期工程准入、分层、删除、验证规则。
- `docs/BACKEND_API_CONTRACT.md`：后端合同、前端消费边界、核心 API 语义。
- `docs/frontend-data-truth-contract.md`：前端数据真实性边界。
- `docs/frontend-backend-field-map.md`：前后端字段映射。
- `docs/CORE_STRATEGY_SPEC.md`：策略系统目标、非目标、阶段和决策枚举。
- `docs/EVIDENCE_ENGINE_SPEC.md`：证据项、证据族、权重和可追溯边界。
- `docs/DATA_RULES.md`：OI、Funding、多空、主动买卖、相对强弱规则。
- `docs/INDICATOR_RULES.md`：RSI/MACD/Bollinger/ATR/EMA/VWAP/ADX 等技术指标边界。
- `docs/MARKET_READING_SPEC.md`：市场阅读和结构分析规范。
- `docs/RISK_GATE_SPEC.md`：风险门禁。
- `docs/KEY_LEVEL_ENGINE_SPEC.md`：关键位和结构位。
- `docs/backtest-v2/PROFESSIONAL_BACKTEST_AUDIT_SPEC.md`：专业回测审计目标。
- `docs/backtest-v2/BACKTEST_TEST_PLAN.md`：回测测试方案。
- `docs/single-server-deployment.md`：腾讯云单机部署。
- `docs/deployment-checklist.md`：部署检查清单。
- `audit-round-2/ROUND_2_PRODUCTION_EVIDENCE_REPORT.md`：最近一轮生产证据报告。

## 附录 B：打包说明

`project-context-for-chatgpt.zip` 应只包含：

- `PROJECT_CONTEXT_FOR_CHATGPT.md`
- 核心相关文档清单
- `package.json`
- `docker-compose.yml`
- 部署脚本清单
- 最近一轮 ROUND 报告的脱敏副本

不得包含：

- `.env`
- `.env.*`
- audit zip
- raw logs
- `node_modules`
- `.next`
- `dist`
- `build`
- 真实数据库数据
- 真实密钥

## 2026-07-06 第 4 步生产观测闭环补充

本节记录本地第 4 步事实：本轮只建设生产观测、dry-run 证据、GitHub Actions 手动门禁和回滚 dry-run，不部署腾讯云，不运行 formal，不动数据库 / Redis / volume。

- 安全分支：`phase4-production-observability`。
- workflow：`.github/workflows/production.yml` 已改为手动 `workflow_dispatch`，不再监听 `push main` 自动生产部署。
- 生产观测脚本：`scripts/production/observability.mjs`。
- dry-run 命令：`npm run production:health -- --dry-run`、`npm run production:smoke -- --dry-run`、`npm run production:status -- --dry-run`、`npm run production:evidence -- --dry-run`。
- 部署脚本：`npm run production:deploy` 默认 dry-run；真实部署需要显式 manual 命令和用户授权。
- 回滚脚本：`npm run production:rollback` 默认 dry-run；真实回滚需要显式 manual 命令和用户授权。
- 证据目录：`phase4-production-observability/`。
- 证据包：`phase4-production-observability.zip` 和目录内 `production-evidence.zip` 只用于用户/GPT 审计，不应进入 Git。
- 当前真实状态：本轮只能证明本地工程观测链路可执行，不能证明腾讯云已部署新代码，也不能证明系统支撑实战交易。

## 2026-07-06 第 4.1 步证据链收口补充

第 4.1 步只修生产证据链，不改扫描、分析、策略、图表、前端交易展示或数据库。

本轮事实：

- 安全分支：`phase4-1-evidence-commit-alignment`。
- 基线分支：`phase4-production-observability`。
- 基线 commit：`cd279008e3a9f55a3bf7485e80632cd3ec2e93a9`。
- 证据生成脚本：`scripts/production/observability.mjs`。
- 证据验证命令：`npm run production:evidence:validate -- --zip <production-evidence.zip>`。
- 证据输出目录：`phase4-1-evidence-commit-alignment/`，该目录为 ignored/untracked artifact，不进入 Git。
- 内层证据包：`phase4-1-evidence-commit-alignment/production-evidence.zip`，必须能单独交给 GPT 审计。
- 外层证据包：`phase4-1-evidence-commit-alignment.zip`，不进入 Git。
- 部署授权清单：`docs/DEPLOYMENT_AUTHORIZATION_CHECKLIST.md` 与 evidence 内 `DEPLOYMENT_AUTHORIZATION_CHECKLIST.md`。

第 4.1 步必须保证：

- `phase4-1-summary.json.source_commit` 等于当前安全分支 HEAD。
- `system-status.json.git.commit` 等于当前安全分支 HEAD。
- `gpt-handoff-summary.md` 与 `production-deployment-report.md` 明确写入当前 commit。
- `production-evidence.zip` 不包含 `pending_commit`、`等待 Agent`、`placeholder`、`TODO`、`待补充` 或旧第 3.2 commit 作为当前 HEAD。
- dry-run 和真实生产部署必须区分；本轮仍不能写成已经部署腾讯云。

当前真实状态：

- 本轮目标是部署授权前证据收口。
- 可以交给 GPT 做第 4.1 验收复查。
- 仍需用户明确授权才可进入腾讯云真实部署。
- 当前系统仍不能写成支撑实战交易。

## 2026-07-06 第 4.2 步腾讯云部署授权准备补充

第 4.2 步只做真实部署前的授权审查和部署准备，不做生产部署，不改扫描、分析、策略、前端交易展示或数据库。

本轮事实：

- 安全分支：`phase4-2-tencent-deploy-readiness`。
- 第 4.1 基线分支：`phase4-1-evidence-commit-alignment`。
- 第 4.1 基线 commit：`7913e4cf5bdaec77c757c590723abf7a4fb034c1`。
- 证据生成脚本：`scripts/production/deploy-readiness.mjs`。
- 证据生成命令：`npm run production:deploy-readiness`。
- 证据验证命令：`npm run production:deploy-readiness:validate`。
- 证据输出目录：`phase4-2-tencent-deploy-readiness/`，该目录为 ignored/untracked artifact，不进入 Git。
- 证据包：`phase4-2-tencent-deploy-readiness.zip`，不进入 Git。
- 第 4.2 evidence 内必须包含部署授权清单、Secrets/Runner 清单、腾讯云部署 Runbook、部署前备份、部署后验证、回滚失败处理、测试结果、grep 证据、剩余风险和下一步。

第 4.2 步必须保证：

- 不 push main。
- 不部署腾讯云。
- 不运行 `npm run backtest:formal`。
- 不运行 migration。
- 不动 Postgres、Redis 或 Docker volume。
- 不输出真实 secret、API key、DATABASE_URL、CRON_SECRET、SSH 私钥、cookie 或 token。
- 证据包只能证明部署准备和授权审查完成，不能证明生产已同步。
- 真实部署前必须由用户明确授权，并重新确认腾讯云目标目录、生产 HEAD、Docker Compose、`.env.production`、Caddy、Postgres、Redis、worker 和 reports volume。

当前推荐部署方式：

```text
GPT / 用户验收第 4.2 证据
-> 用户明确授权
-> 合并或推进 GitHub main
-> 腾讯云服务器自拉 main
-> Docker Compose 构建和启动
-> health / smoke / evidence / rollback guard 验证
```

当前真实状态：

- 本轮目标是腾讯云真实部署前准备。
- 可以交给 GPT 做第 4.2 验收复查。
- 通过后可以请求用户授权真实部署。
- 未授权前不能部署腾讯云，不能进入 shadow tracking。
- 当前系统仍不能写成支撑实战交易。

## 2026-07-06 第 4.3 步真实腾讯云部署执行补充

第 4.3 步在用户明确授权后执行了真实腾讯云部署。部署目标不是 `main`，而是安全分支：

- 目标分支：`phase4-2-tencent-deploy-readiness`
- 目标 commit：`953def3363ec64efb8a859e7772c55e9a51f175c`
- 腾讯云项目目录：`/home/ubuntu/apps/chuan-market-radar`

本轮真实结果：

- 腾讯云生产仓库已切换到 `phase4-2-tencent-deploy-readiness`。
- 腾讯云生产 HEAD 已对齐 `953def3363ec64efb8a859e7772c55e9a51f175c`。
- 已执行 Docker Compose build/up。
- web 容器为 healthy。
- Postgres / Redis 继续使用原有 volume，未删除、未重建、未清空。
- `/api/health` 最终为 `ready / fresh`。
- `/api/scan`、`/api/frontend/radar-contract`、`/api/radar/backend-contract`、`/api/frontend/kline-contract`、`/api/frontend/review-contract` 均返回 HTTP 200。
- 已生成第 4.3 evidence 目录：`phase4-3-production-deploy-first-evidence/`。
- 已生成 production evidence 首包：`phase4-3-production-deploy-first-evidence/production-evidence.zip`。
- 已生成外层证据包：`phase4-3-production-deploy-first-evidence.zip`。

第 4.3 剩余工程风险：

- 生产镜像未包含 `scripts/production/observability.mjs`，因此不能直接在 web 容器内运行 production evidence 脚本。本轮改为本地脚本通过 SSH tunnel 访问腾讯云 Caddy 真实生产 API 采集 evidence。
- `production:evidence:validate` 仍保留第 4.1 dry-run 口径，真实生产 evidence 会被 `dry_run_only must be true` 拦下。因此第 4.3 evidence validate 当前不能写成通过。
- `npm run security:check` 存在源码正则误报风险，安全总门禁不能写成全绿。

本轮明确没有做：

- 未 push main。
- 未运行 `npm run backtest:formal`。
- 未运行 migration。
- 未修改数据库 schema。
- 未清 Redis。
- 未删除或重建 Docker volume。
- 未接自动下单或交易所下单 API。

当前真实状态：

- 生产部署已完成，生产 health/API 可用。
- 生产 evidence 首包已生成。
- 生产 evidence validate 链路仍有 P1 工具缺口，需要下一轮修复。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。

## 2026-07-06 第 4.3.1 步生产 Evidence 真实口径修复补充

第 4.3.1 步只修复第 4.3 暴露的生产 evidence 工具链问题，不改扫描、分析、策略、前端交易逻辑、数据库或 Redis。

本轮事实：

- 安全分支：`phase4-3-1-production-evidence-real-mode`。
- 修复目标一：`production:evidence:validate` 支持 `dry_run` / `real_production` 两种 evidence 模式。
- 修复目标二：真实生产 evidence 使用 `phase4-3-1-summary.json`，不再把第 4.3 真实生产证据伪装成 `phase4-1-summary.json`。
- 修复目标三：Docker runner 镜像包含 `scripts/production/*.mjs` 和 `zip/unzip`，使生产容器内可以生成和验证 evidence。
- 修复目标四：`security:check` 不再把源码里的 secret 检测正则定义误判为真实 secret。
- 本轮本地基础门禁已通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns、security:check。
- 本轮本地 dry-run evidence 与 validate 已通过。

第 4.3.1 必须保证：

- 不 push main。
- 不运行 `npm run backtest:formal`。
- 不运行 migration。
- 不修改数据库 schema。
- 不清 Redis。
- 不删除或重建 Docker volume。
- 不接自动下单或交易所下单 API。
- 不改 scan / analysis / strategy / UI 交易逻辑。
- 真实生产 evidence validate 未通过前，不得进入 shadow tracking。

当前真实状态：

- 本地 evidence 工具链修复已通过基础门禁和 dry-run validate。
- 第 4.3.1 已完成腾讯云 web-only 重建、`real_production` 口径 evidence 生成和 validate pass，但后续复核发现 evidence 附属文件仍有一致性问题。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。

## 2026-07-07 第 4.3.2 步生产 Evidence 一致性与验证严格性最终收口

第 4.3.2 步只修复生产 evidence 的一致性和 validator 严格性，不改扫描、分析、策略、前端交易逻辑、数据库 schema、Redis 或 Docker volume。

本轮事实：

- 安全分支：`phase4-3-2-production-evidence-consistency`。
- 修复目标一：`grep-evidence.md` 不再依赖生产镜像是否安装 `rg`，改为 Node.js 内置文本扫描。
- 修复目标二：`production:evidence:validate` 必须识别 grep/git 命令失败文本、占位文本、非法 JSON、changed-files 结构缺失、rollback 旧口径和多 summary 口径冲突。
- 修复目标三：`production-evidence-validate-result.json` 必须是纯 JSON；命令日志单独放入 markdown。
- 修复目标四：`changed-files.txt` 必须写清比较基线 commit、当前 commit、已提交差异、未提交 tracked 变更和未跟踪 artifact。
- 修复目标五：真实生产 rollback plan 必须是部署后的回滚口径，不得继续写“本轮未部署 / 部署授权前计划”。
- 追加修复目标六：`grep-evidence.md` 中来自源码的 secret 检测规则文本必须全局脱敏；同一行出现多个 `DATABASE_URL=` / `CRON_SECRET=` / `COINGLASS_API_KEY=` 等模式时，不允许只脱敏第一个。
- 新增定向测试：`npm run test:production-evidence`，覆盖好包通过、command failure fail、占位文本 fail、非法 JSON fail、changed-files 缺结构 fail、多 summary 冲突 fail、4.3.2 扫描 partial 不冒充 pass、真实 secret-like 文本仍被拦截。
- 第 4.3.2 evidence 口径：生产扫描为 `partial` 时必须如实写成 `partial`，允许交给 GPT 审计，但不得写成 full pass，也不得宣称生产能力已完整。
- 本轮本地基础门禁已通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns、security-check、test:production-evidence。

第 4.3.2 必须保证：

- 不 push main。
- 不运行 `npm run backtest:formal`。
- 不运行 migration。
- 不修改数据库 schema。
- 不清 Redis。
- 不删除或重建 Docker volume。
- 不接自动下单或交易所下单 API。
- 不改 scan / analysis / strategy / UI 交易逻辑。
- 不得把 evidence validate 写成交易能力成熟。

当前真实状态：

- 本地 evidence 生成和 validator 严格性已增强并通过本地门禁。
- 首次腾讯云 4.3.2 真实 evidence 验证发现 `grep-evidence.md` 脱敏口径仍需补强：问题来自源码规则文本误判，不是已确认的真实 secret 泄露；本轮必须重新提交安全分支、重建 web、重采 real production evidence 并 validate。
- 仍需在腾讯云只重建 `web` 后重新生成 `phase4-3-2` real production evidence，并由 GPT 做最终生产 evidence 审计。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。

## 2026-07-08 第 5.1-H.1-R.1-FIX 生产运行健康根因修复

第 5.1-H.1-R.1-FIX 只修复生产运行健康，不改扫描、分析、策略、前端交易逻辑、checkpoint outcome、数据库 schema、Redis、Postgres 或 Docker volume。

本轮事实：

- 生产 CoinGlass key 已通过安全脚本注入服务器 `.env.production`，原值未写入代码、报告、证据包或日志。
- `deploy/scripts/update-prod-coinglass-key.sh` 补充 `websocket-light-worker` recreate，防止后续 key 更新时该 worker 留在旧 env。
- web、scanner-worker、websocket-light-worker、coinglass-worker、signal-worker、dynamic-scan-scheduler、macro-worker 已重建并读取更新后的运行时 env。
- CoinGlass capability smoke：HTTP 200，accountPlan=`hobbyist`，deepScanStatus=`ready`，`futures_pairs_markets` / `open_interest_current` / `funding_current` 可用；`taker_buy_sell_current` 仍为 blocked，必须按能力边界展示。
- `/api/scan` 授权口径已恢复：no secret=401，wrong secret=401，correct secret=200。
- worker heartbeat 已从 6 个 worker 全 down 恢复为 6 个 worker healthy。
- 生产 scan 已从 `partial / scannedCount=0` 恢复为 `ready / fresh`；最新证据中 scannedCount=40、candidateCount=24、radarSignals=24、requestFailures=0。
- production evidence 重新生成并 validate pass，errors=[]，warnings=[]；validator 未弱化，summary 未硬改 pass。
- 本轮门禁通过：ci:forbidden-files、ci:secret-patterns、security:check、test:production-evidence、typecheck、lint、test:market、build、backtest:golden。

仍需诚实保留的边界：

- 服务器 Git worktree 仍有未提交/未跟踪文件，不能写成 deploy clean。
- 本轮只能证明生产 runtime health 修复，不能证明 checkpoint outcome 生产闭环已通过。
- 当前系统仍不能写成支撑实战交易，不能进入 5.2，不能进入实盘。

## 2026-07-10 Git 工作区收口与生产部署真值强化

本轮先完成 GitHub Desktop 工作区清理、正式提交、GitHub `main` 快进和腾讯生产仓库收口，再处理部署过程中暴露的 P1 真值问题。未修改 scan / analysis / strategy / backtest / frontend 交易逻辑。

当前事实：

- 本地 `/Users/chuan/Documents/web` 工作区已清理为干净 `main`；生成态 production observability JSON 和临时恢复稿已先归档到 ignored `reports/workspace-cleanup-20260710/`，未删除历史证据、环境文件、数据库、Redis 或 Docker volume。
- 正式代码与蓝图已推送 GitHub；最终 `main` 为 `a247b59769ee4ec39e7160f50ac6727432a891c7`。
- 腾讯仓库旧分支热修已保存为 `stash@{0}: pre-main-sync-20260710`；仓库根目录 `phase5-*` 残留已移动到 `/home/ubuntu/market-radar-evidence/worktree-residue-20260710/`，没有直接删除。
- 腾讯生产仓库已切换为干净 `main`，HEAD 与 GitHub 一致；最终 Git 状态只有 `## main...origin/main`。
- 生产 `/api/health` 为 `ready`，Web / Postgres / Redis 正常，scanner / websocket-light / CoinGlass / signal / dynamic / macro worker 均运行。
- Shadow runner 已改为 Node 直接作为容器 PID 1；最终 health 为 `ok=true`、`heartbeatFresh=true`、`lockPidAlive=true`、`reason=pid_alive_heartbeat_fresh`、`sameRuntime=true`。
- `production-check.sh` 默认 API readiness 等待 600 秒，Shadow 单独等待 660 秒；远端旧 heartbeat 不再冒充本容器 supervisor healthy。
- 显式确认的 production deploy 若失败，会把 production rollback 确认传递给 rollback 脚本，不再出现“声称自动回滚但实际只 dry-run”。
- production facts 已纳入 Shadow 状态与日志；最新证据目录为 `/home/ubuntu/apps/chuan-market-radar/reports/production-facts/20260710T001040Z`。

测试事实：

- `typecheck`、`lint`、`build`、forbidden-files、secret-patterns、security-check：pass。
- `test:market`：836 pass；worker：17 pass；historical smoke：4 pass。
- `backtest:golden`：16/16 pass；未运行 formal。
- `test:deploy-safety`：5/5 pass；`test:production-evidence`：15/15 pass。
- 腾讯 `docker compose config --quiet`、强化后的 production check、Postgres、Redis、全部 worker、Shadow local supervisor health：pass。

仍需保留的能力结论：

- 当前生产运行底座健康，但系统整体仍为 `可运行但不完整 / 不能支撑实战`。
- 本轮只强化部署与运行真值，没有证明 G0-G9 工程蓝图已完成。
- 下一轮从蓝图 `WP-G0.1 Frontend Truth Contract` 开始，只清理前端合成事实与未知值伪装，不得顺手修改策略或扫描排序。

## 2026-07-10 WP-G0.1 Frontend Truth Contract

本轮只收口前端事实合同与展示语义，没有修改 scan 排序、analysis 结论、strategy、RR 3:1、交易计划、backtest、数据库、Redis、worker 或 secret。

当前事实：

- `main` 生产代码提交为 `05e9530846b276cd1c56bc789b95c2540bfa83aa`；功能提交为 `0e086c7`，扫描分母生产回归修复为 `05e9530`。
- leaderboard 只保留榜单和真实 ticker 价格用途，不再升级为 radar signal、signal card 或 signal token。
- 前端不再合成 direction、freshness、age、source、score、sentiment、volume multiple、anomaly score 或 bull/bear trend；未知价格和不支持字段显示 `n/a`，不再用 0 冒充。
- Dashboard、Signals、System 只消费后端 `radarSignals`；计划就绪为空时保持空，不用榜单补位。
- 全站主定位由“实战雷达”收口为“研究雷达”；SCAN / ANALYSIS / STRATEGY / BACKTEST 权限边界未放宽。
- 全市场扫描证明只保留一个权威组件。生产事实分别为 observed=3112、accepted=1316、eligible=593、current-cycle=24、deep=48；公开接受率 42.3% 以 observed 为分母，当前周期 4.0% 和深扫 8.1% 以 eligible 为分母。
- 本地定向测试 96/96、typecheck、lint、test:market 836/836、worker 17/17、historical smoke 4/4、build、golden 16/16、forbidden-files、secret-patterns、security-check 全部通过；formal 未运行。
- 腾讯生产只重建 `web`；未运行 migration，未修改或清理 Postgres/Redis，未删除或重建 volume。`/api/health` 为 ready/fresh，Postgres 接受连接，Redis PONG，全部 worker healthy，Shadow `heartbeatFresh/lockPidAlive/sameRuntime=true`。
- 生产浏览器复核通过：页面显示“研究雷达”、单一扫描证明、三组明确分母和真实空计划状态。公网仍为明文 HTTP，是未关闭的 P0。
- 脱敏生产证据目录：`/home/ubuntu/apps/chuan-market-radar/reports/production-facts/20260710T010527Z`。

当前真实状态仍是：**可运行但不完整，不能支撑实战。**

## 2026-07-10 WP-G0.2 Candidate Lifecycle and Outcome Truth

本轮先审计 Candidate/Outcome/Review 全链路，再依据任务停止规则冻结范围。结论为 `PARTIAL_SCHEMA_MIGRATION_REQUIRED`，不是 WP-G0.2 PASS，也不是完整 G0 PASS。

当前事实：

- 蓝图 `CandidateEpisode` 没有对应的权威 runtime/persistence entity；journal 与 scan-state 都是会冲突更新的 mutable projection。
- 现有 schema 不能强制一币单活跃 Episode、firstSeen 不可变、closed 历史保留、同币重触发新 ID、parent lineage、append-only event 和 `(eventId, checkpoint)` 单终态 Outcome。
- Review 当前按事件行而非 Episode/Checkpoint 统计；pending/closed 可重叠，null MFE/MAE 会变 0，DB 读取失败可退化为空数组。
- 前端 lifecycle 路径会把非 short 显示为 long，把缺失 price/MFE/MAE 显示为 0，把未命中 TP/SL 的所有状态显示成超时。
- 生产只读点样本 health 为 ready/fresh，但 CandidateEpisode/Outcome 权威数量不可用。旧 120 行 Review 诊断不能作为真实分母。
- 本轮未修改 runtime code、scan/analysis/strategy/READY/RR/ranking，未部署，未 migration，未清 DB/Redis/volume，未运行 formal。
- 已生成 `reports/wp-g0-2-candidate-lifecycle-outcome-truth/WP-G0.2-MIGRATION-PROPOSAL.md`。它是提案，不是迁移授权。

当前仍为 **R1 / 可运行但不完整 / 不能支撑实战**。最后完整完成包仍是 WP-G0.1；完整 G0 未通过。当前无自动授权的下一 Work Package，唯一建议是人工审批 `WP-G0.2-MIGRATION-DESIGN-AND-APPROVAL`。

## 2026-07-10 WP-G0.2 Migration Design and Approval

本轮是纯设计与审批包，最终设计状态为 `PROPOSED / READY_FOR_USER_APPROVAL`，不表示用户已批准或 schema 已实现。

冻结决定：v1 scope 为单一 `production_radar` 权威通道；单活跃键是 `(scope, canonical_instrument_id) WHERE closed_at IS NULL`；不允许同币 long/short 或多策略并行 Episode；方向反转关闭旧 Episode 并创建 child。Checkpoint 与 Outcome 分表，retry 属于 Checkpoint，Outcome 只有 recorded/missed/data_unavailable 三个不可变终态。`eg.v1` 要求有界 1m K 线 100% 覆盖、无缺失/重复/future candle，并保存版本、reasons 和 candle-set hash。

事务正确性由 Postgres same-connection transaction、advisory/row lock、partial unique、idempotency hash、stream version、claim lease 和 fencing token共同保证；Redis 不授予写权限。Legacy 默认权威 Episode/Outcome 回填数为 0，partial/unclassified 永不进入正常状态机或指标分母。

Cutover 使用 outbox + 单一 phase/epoch 控制，dual projection 硬上限 72h，需连续 24h 无可比差异和 10,000 次写入；切换写冻结最多 120 秒。Rollback 保留新 schema/历史，旧投影不完整时只能 forward-fix。任何 production add-schema、shadow writer、backfill 和 read cutover 都必须单独审批。

当前系统事实没有改善：runtime/schema/frontend/production 均未改变，完整 WP-G0.2/G0 未完成，仍为 R1、不能支撑实战、自动交易永久禁止。正式 known-issues registry 仍不存在，本包只生成 local risk register/supplement。

## 2026-07-09 第 5.1-H.1-R.2-FIX Shadow Runner Loop 根因修复

第 5.1-H.1-R.2-FIX 只修复 Shadow Runner 自动循环、lock、heartbeat、status 真伪判断、capture loop 和 auto checkpoint due sweep，不改 scan / analysis / strategy / UI 交易逻辑，不改 checkpoint outcome 算法，不动数据库 schema、Redis、Postgres 或 Docker volume。

本轮事实：

- 根因类别：`shadow_runner_missing_supervisor_and_runtime_truth_guard`。
- 修复前：runner manifest 显示 `running`，但 lock pid 已死，heartbeat 停在 `2026-07-08T14:36:03.170Z`，captureCount 停在 1212，未观察到自动 capture 或自动 due sweep。
- 直接根因：Shadow Runner 由 CLI start 派生 detached child，缺少 Docker/systemd supervisor；child 退出后 manifest 仍可能停留在 `running`。
- 状态根因：`shadow:status` 过度相信 manifest，没有用 pid、heartbeat、runtimeId 推导真实运行态。
- 已新增 `shadow-runner` Docker Compose 服务，`restart: unless-stopped`，依赖 `web` healthy，挂载 reports volume，执行 `shadow:prod:run-loop`。
- 已新增 runner runtime 状态推导：lock / state 记录 `hostname`、`pid`、`runtimeId`、`heartbeatAt`、`mode`、`updatedAt`；status / health 用 manifest + pid liveness + heartbeat freshness 推导。
- 已新增 stale lock cleanup、dead pid recovery、duplicate runner guard、`shadow:prod:health`。
- 生产修复后证据：`shadow-runner` 容器持续运行 17+ 分钟；lock pid alive；heartbeat fresh；effectiveStatus=`running`；duplicate runner 被 `shadow_runner_duplicate_active` 阻断。
- 已观察至少两个完整自动周期：`01:18`、`01:23`、`01:33` 均更新 capture 与 checkpoint sweep。
- outcomes 从 2448 增至 2918，events 从 1212 增至 1251，checkpoint `duePending=0`。
- `shadow:prod:validate`：pass。
- `production:smoke`：pass。
- `production:evidence:validate`：real_production / pass / errors=[] / warnings=[]。
- 本轮门禁通过：build:market-cli、runner-runtime 定向测试、shadow storage + runner runtime、typecheck、lint、test:market、build、backtest:golden、ci:forbidden-files、ci:secret-patterns、security:check、test:production-evidence。

仍需诚实保留的边界：

- 本轮不是 5.1-H.1-R.2 正式重跑；本轮成功后只允许重跑 `5.1-H.1-R.2 checkpoint outcome 生产口径最终验收`。
- 本轮不能直接进入 `5.1-H`、`5.2` 或任何实盘阶段。
- 本轮生产侧采用服务器文件覆盖 + 只重建 `shadow-runner` 的方式完成；服务器 Git worktree 仍需后续收口，不能写成 deploy clean。
- 当前系统仍不能写成支撑实战交易，不能进入实盘。

## 2026-07-12 WP-AUTO-01 全自动工程控制层与质量锁

本轮只建立全自动工程的治理和 fail-closed 控制层，不修改 scan、analysis、strategy、backtest、frontend、API、数据库、Redis、worker、部署或 secret。它是后续工程施工的质量底座，不提升当前交易能力等级。

当前事实：

- 新增机器状态源 `AUTONOMOUS_ENGINEERING_STATE.json`，锁定 R1、`可运行但不完整 / 不能支撑实战`、Candidate schema `applied_verify_failed` 和 runtime disabled。
- 自动控制器会检查每包 allowlist/prohibited path、Production/Local WIP=1、生产审批时间窗、必须工件、状态哈希、工作树指纹和全部门禁证据；任一不一致即 fail closed。
- 永久硬锁包括 RR `>=3:1`、禁止自动交易/交易所下单 API、禁止回测结果污染生产排序、禁止前端生成交易计划、禁止自动运行 formal、禁止自动批准生产操作。
- 定向防绕过和指纹回归测试 16/16 通过，覆盖降低 RR、自动交易、formal、过期/缺失生产审批、越界文件、陈旧或缺失门禁证据，以及 Git 暂存状态不改变内容指纹。
- 提交前 staged diff 复核曾发现指纹依赖 Git 暂存状态；提交被阻止且未产生 commit。控制器已改为只绑定文件路径、内容、可执行位和文件类型，并新增“同内容暂存前后指纹不变”回归测试。
- 历史 `reports/wp-capacity-offhost-restore-remediation/**` 已从 Git 索引取消跟踪，但本地文件完整保留；forbidden-files、secret-patterns 和 security-check 已恢复 PASS。
- 当前路线真值已更正：Candidate authority 8/8 migration 已执行，但 post-schema automatic verify 因 NOINHERIT login 未 `SET ROLE` 返回 42501；Feature Flag 仍为 0。禁止再次 execute migration，下一包只做本地 verifier 修复，之后 production verify-only 仍需新的独立审批。
- 本轮手工基础门禁已通过：typecheck、lint、test:market 924 pass / 0 fail / 1 isolated DB skip、worker 17/17、historical smoke 4/4、build、backtest:golden 16/16，以及三项安全门禁。formal 未运行且自动控制器明确禁止。

当前能力结论不变：**R1 / 可运行但不完整 / 不能支撑实战**。该控制层只能证明后续工程更难自欺、越界或带病提交，不能证明全市场雷达核心链已经达到实战级。

## 2026-07-12 WP-G0.2 Migration Runner Post-Schema Verify Fix

本轮是纯本地 verifier 修复包，不连接生产、不执行 migration、不修改角色属性或权限、不启用 Candidate runtime。

当前事实：

- 生产 42501 根因已在代码中做最小修复：migration login 先按原规则验证 least privilege 和 owner membership；只有 membership 为真才显式 `SET ROLE candidate_migration_role` 读取 Candidate schema/ledger 边界。
- schema boundary 读取放在 `try/finally` 中，无论读取成功或抛错都执行 `RESET ROLE`；没有把 migration login 改为 INHERIT，也没有授予直接 schema/table 权限。
- runner CLI 增加直接执行保护，使 verifier 函数可被测试导入而不会意外启动命令；直接运行脚本的行为保持不变。
- Migration Runner 定向测试由 43 增至 46，46/46 PASS。新增覆盖：NOINHERIT 成员显式激活 owner role、42501/任意边界异常后 RESET ROLE、无 membership 时禁止 SET ROLE。
- 完整本地门禁 10/10 PASS：autonomy 16/16、forbidden-files、secret-patterns、security-check、typecheck、lint、market 924 pass / 0 fail / 1 isolated DB skip、worker 17/17、historical smoke 4/4、build、golden 16/16。formal 未运行。
- 当前只证明本地代码修复；生产 verify-only 尚未批准、尚未执行，Add Schema 包仍是 `PARTIAL_SCHEMA_APPLIED_VERIFY_FAILED`，Feature Flag 仍为 0，shadow writer 继续禁止。

当前能力结论仍是：**R1 / 可运行但不完整 / 不能支撑实战**。只有全部本地门禁通过并获得新的独立只读生产审批后，才能执行 production verify-only；禁止再次 execute migration。

## 2026-07-12 WP-G0.2 Production Verify-Only

本轮在用户独立批准后，只执行一次 production verify-only；未部署应用、未切换生产 branch、未执行 migration/DDL/DML、未修改 Feature Flag、未重启服务。

生产证据：

- Runner source commit：`cb392426b1cc77d13f9190d5659bc796b5bda320`；生产应用 release 前后保持 `0599f802f261fe8e3c1982a07106f362bd62ac13`，worktree clean，image 未改变。
- Runner verify：status=pass、candidateSchemaPresent=true、migrationRegistryRows=8、ownerMembership=true、execute=false、schemaChanged=false、candidateMigrationExecuted=false。
- Catalog：schema=1、tables=8、columns=151、functions=20、triggerObjects=10、triggerEventRows=14、roles=7、appliedLedgerRows=8。
- 五个 Candidate Feature Flag 全部 false；long transaction、idle in transaction、lock waiter、ungranted lock、migration login session、break-glass session 均为 0。
- `/api/health` 前后均 ok / scan ready / fresh；11 个容器继续运行。
- 脱敏证据 tar SHA256=`bdc655ba30fae50d695fe5698862d7d2b72d69a2c43fd29641820ab3a1f9fb92`，73,828 bytes，模式 0600；本机敏感模式扫描 0 命中。
- 两次执行准备失败均发生在 Runner/数据库连接前：一次固定 SHA 对象解析失败，一次隔离 clone 无目标 commit；失败残留未删除，最终通过固定 commit archive 在新 ops 根目录完成。

当前 Candidate schema 状态从 `applied_verify_failed` 晋级为 **`applied_verified_dormant`**。这只关闭 Add Schema 验证缺口，不表示 writer、backfill、dual read、read cutover 或完整 WP-G0.2 已完成；系统仍为 **R1 / 可运行但不完整 / 不能支撑实战**。

## 2026-07-12 WP-G0.2 Shadow Capture Design and Validation

本轮只建立 shadow_capture 的本地机器合同、repository 事实校验和防降质回归测试；未连接生产，未修改 migration、src runtime、API、前端、worker、数据库、Redis、Feature Flag 或部署。

当前事实：

- 本地结论是 `PASS_LOCAL_DESIGN`；生产决定强制为 `BLOCKED_NOT_AUTHORIZED`，`productionMutationAllowed=false`。
- 旧系统仍是唯一 write/read authority；新链只能消费已提交 Outbox，不得改变 ranking、analysis、strategy、READY、RR 或 frontend。
- 已复核现有数据库防线：payload SHA-256、幂等唯一、phase+epoch、72h hard limit、`FOR UPDATE SKIP LOCKED`、lease/fencing、payload conflict 和 stale fence hard rejection。
- Candidate production activation 仍硬关闭，生产 API/worker 没有 `CandidateOutboxService` 接线。
- 发现四项工程 blocker：旧权威事务尚未原子写 Candidate Outbox；Outbox 没有数据库级重试耗尽 quarantine/failed 终态；production runtime wiring 未实现；隔离 PostgreSQL 16 演练未通过。第五项治理 blocker 是新的 production 审批不存在。
- 合同回归覆盖 authority 偷换、策略/RR 污染、Redis 越权、哈希冲突软化、无限重试、延长 72h、降低 10,000 writes 和删除审批阻断等降质路径，任一变化 fail closed。

下一包只能是 `WP-G0.2-SHADOW-CAPTURE-LOCAL-IMPLEMENTATION-AND-POSTGRES-REHEARSAL`。它完成并通过全部门禁后，才可生成新的 production shadow_capture 审批包。当前系统仍是 **R1 / 可运行但不完整 / 不能支撑实战**。

## 2026-07-12 WP-G0.2 Shadow Capture Local Implementation and PostgreSQL Rehearsal

本轮只完成 production 启用前的本地实现与真实 PostgreSQL 16 隔离演练；未连接腾讯云、未执行生产 migration、未修改 Feature Flag、未接生产 API/worker。

当前事实：

- `CandidateShadowCaptureSourceWriter` 在同一 connection transaction 内写不可变 scan archive 和 `legacy_scan_candidate` Outbox；同源同 hash 幂等，同源不同内容/hash 硬拒绝，Outbox 失败回滚 source archive。
- `CandidateShadowCaptureConsumer` 只 claim legacy candidate source，不消费 Candidate event Outbox；payload exact-key allowlist 禁止 trade plan/Outcome/future 字段，投影使用独立幂等键。
- Migration 009 本地草案增加 max attempts、结构化脱敏错误、quarantined 终态、source enqueue/source-only claim/retry/quarantine v2 procedures。
- authority epoch 检查使用 `FOR SHARE` 与 phase transition `FOR UPDATE` 形成数据库屏障，并使用数据库时钟执行 72h deadline。
- 空库 1-9 rehearsal PASS：8 tables、155 columns、24 functions、ledger 9。
- 生产形态 1-8 -> 009 upgrade rehearsal PASS：只 applied 009，重复执行 9/9 skipped，旧 public sentinel hash 保持不变。
- PG16 场景通过：原子回滚、hash conflict、source-only claim、Candidate 幂等投影、8 次失败 quarantine、终态不可改、quarantine 阻断 phase、lease takeover、stale fence、epoch lock race 和 database deadline。
- 本地合同结论为 `PASS_LOCAL_IMPLEMENTATION_AND_REHEARSAL / BLOCKED_NOT_AUTHORIZED`。

生产仍被四项 blocker 阻断：009 未审批/应用、quarantine resolution workflow 未实现、production runtime 未接线、新的独立限时审批不存在。下一包只能是 `WP-G0.2-SHADOW-CAPTURE-PRODUCTION-READINESS-AND-APPROVAL-PACKET`。当前仍是 **R1 / 可运行但不完整 / 不能支撑实战**。

## 2026-07-12 WP-G0.2 Shadow Capture Production Readiness and Approval Packet

本轮只完成本地生产准备和审批边界，不连接腾讯云、不执行生产 migration、不部署 runtime、不启动 Shadow lifecycle、不启用 Feature Flag。

当前事实：

- Migration 009 在生产应用前完成最终冻结：新增 11 字段的 immutable quarantine resolution ledger、数据库时钟 `start_shadow_capture_v3`、审批化 replay/exclude、phase state machine 和所有未完成 source item 的 advance block。
- 原始 quarantined Outbox 与 resolution ledger 都不可 update/delete；replay 创建新的独立 Outbox，replacement 未完成时仍阻止进入 `shadow_verify`。
- `CandidateQuarantineResolutionService` 对 approval ref/digest、reason code 和 replacement payload 做应用层验证；数据库再验证终态、source type、epoch、deadline、approval 和幂等冲突。
- Runtime readiness 同时检查代码 release 授权、数据库持久化、scope、phase、epoch、deadline、write freeze、release id 和环境 kill switch。当前 `CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED=false`，环境变量单独设为 true 仍不能启用。
- Canonical mapper 只接受可解析的 active perpetual venue identity；无法解析时明确拒绝，不猜交易所，不复制 long/short、strategy、RR、Outcome 或 future data。
- 只读 monitor 阈值为 oldest pending 300 秒 warning / 600 秒 critical、任一 unresolved quarantine critical；查询不读取 payload。
- PG16 真实演练通过：1-8 upgrade、空库 1-9、resolution exclude/replay、resolution immutable/conflict、crash-after-projection 幂等恢复、replacement pending block、phase advance、epoch lock、deadline，以及七个 NOLOGIN role 权限。生产连接始终为 false。
- 生产执行被进一步拆分：下一批准包只允许 schema-only 应用 009；后续 composition wiring、dormant deploy、activation/observation 分别独立验收和审批。

该准备包当时的机器结论为：`PASS_PRODUCTION_READINESS_PACKET / BLOCKED_AWAITING_EXPLICIT_APPROVAL / productionMutationAllowed=false`；当时生产仍是 Candidate 1-8 verified dormant。该历史状态已被下方 schema-only 009 生产执行结果取代，但系统能力等级仍为 **R1 / 可运行但不完整 / 不能支撑实战**。

## 2026-07-12 WP-G0.2 Shadow Capture Production Add Safety Schema

本轮只执行用户批准的 schema-only Migration 009；未部署 runtime、未启动 lifecycle、未修改 Feature Flag、未回填、未 dual read、未 read cutover、未重启生产服务。

当前事实：

- 绑定 source commit `b86f3282fa0d9cedab60b8a5bcb9166011fb7926`、runner commit `c8dbcff0f3bd1d34d8f65aee65c69d08b2dfe556` 和 Migration 009 SHA-256 `2cc236dc6c44528b3ebba54e555d3ca07e95ba18709fd467b9578df9dd7979e5`。
- fresh 加密备份在 DDL 前完成并离机下载；encrypted SHA-256 `ea952bb62ba2cf53227da4b1105a4e755284d6747a76419c12400aa07eaa3a42` 本机一致，容量门禁 14/14 PASS。
- 第一次 execute 尝试因生产 capacity gate 文件未成功落盘而被 runner 以 `capacity_gate_not_passed` fail closed；schema 保持 ledger 8，没有 DDL。更换 fresh 备份并补齐可核对 gate marker 后才进行有效 execute。
- 有效 execute 最终状态为 `PASS_PRODUCTION_ADD_SAFETY_SCHEMA`；只 applied `009_candidate_shadow_capture_safety`，001-008 全部 skipped。
- Catalog 从 8/151/20/10/14/7/8 增量变为 9/166/26/11/16/7/9；control rows=0，resolution table=true，Feature Flag enabled=0。
- 生产应用仍是 `0599f802f261fe8e3c1982a07106f362bd62ac13`，没有 runtime deployment，control lifecycle 未启动。
- 证据归档 `evidence.tgz` SHA-256=`51d4f362b0be3ec36b28415696aebcb107e56d2d323f22edb03f155e45888062`；另保留完整容量 gate 和备份 manifest。证据不包含 secret 或业务行。
- 证据打包误生成的 5 个根目录 JSON 副本待用户明确批准删除；它们不改变 schema PASS，但在清理前属于明确的运维遗留项。

当前 Candidate schema 状态为 **`migration_1_to_9_applied_verified_dormant`**。下一包只能是本地 `WP-G0.2-SHADOW-CAPTURE-PRODUCTION-COMPOSITION-WIRING`；生产 dormant deploy、activation/observation、writer、backfill、dual read 和 read cutover 均未授权。系统仍为 **R1 / 可运行但不完整 / 不能支撑实战**。

## 2026-07-15 WP-G0.2 Runtime Identity 生产容器 pg 解析修复

本轮继续限定在 Runtime Identity 生产身份地基，不修改 scan、analysis、strategy、backtest、frontend、业务 API、Candidate schema、Redis、worker、Feature Flag 或 Candidate activation。

当前事实：

- 绑定提交 `ef9d8446612014c039e0350cf8ab6d7a766c58b4` 的生产请求先完成 root-only 管理凭据文件边界验证和独立网络认证，认证结果为 `PASS_CURRENT_ADMIN_NETWORK_AUTH_READ_ONLY`。
- 该次受控执行获取全局生产租约 fencing token 5，但在数据库只读 preflight 阶段停止；lease 以 `SAFE_STOP_PRE_MUTATION` 释放。没有创建 Candidate LOGIN、没有写 Candidate URL、没有修改 env、没有 recreate Web。
- 脱敏只读数据库边界再次确认：当前管理身份 `rolsuper=true / rolcreaterole=true`、ledger=9、control rows=0、capability roles=3、runtime logins=0、writer archive access=false。
- 精确生产形态复现发现根因是 `ERR_MODULE_NOT_FOUND`：staged runner 从 `/src` 运行时，ESM `import("pg")` 不会自动解析 Web 镜像 `/app/node_modules/pg`。这不是数据库密码或权限失败。
- 本地修复为 `runner.mjs` 增加批准应用根目录模块解析回退，并由 `production-runner.sh` 对 preflight、provision、rollback 三条数据库容器路径显式绑定 `MARKET_RADAR_APPLICATION_ROOT=/app`。
- 新增回归测试证明 packet 位于 `/app` 外时仍只能从批准应用根解析 `pg`；Runner 15/15、Production Packet 11/11、Runtime Identity 14/14、Deploy Safety 6/6 和隔离 PostgreSQL 16 rehearsal 均通过。
- 基础门禁通过：typecheck、lint、test:market 960 pass / 0 fail / 4 explicit DB skip、workers 23/23、historical 4/4、build、golden 16/16，以及 forbidden-files、secret-patterns、security-check。formal 未运行。
- 当前 runner artifact=`4e213d3f2a22465e7e56d8fec7c408057017693d091c12aab0d1d00573892235`；production packet artifact=`127c308a8659ccc6a8d187278abdb83c5616ba19f8122687368772b9090db619`。它们仍需 clean commit 后重新冻结到新 Bundle 和新单次请求。

当前真实结论仍是：**Runtime Identity 未生产完成，WP-G0.2/G0 未完成；R1 / 可运行但不完整 / 不能支撑实战**。下一动作只能是 clean commit、自治总门禁、新 Bundle、新请求和同范围生产重试，不得夹带 Candidate activation。

## 2026-07-17 WP-G0.2 Canonical Rollback Add Schema 生产预检修复

本轮只修复 migration 010 专用生产执行包的容器模块解析边界，不修改 migration 001-010、业务代码、服务、环境、Feature Flag、Redis 或生产仓库。

当前事实：

- 腾讯生产只读身份仍为 Git `e5eb90026d8bfcd52b060359446515de5a5c32d6`、Candidate migration ledger 001-009、rollback function absent，health 为 ready/fresh。
- 原 Bundle 已完成服务器 SHA-256、权限和默认 dry-run 校验；随后显式只读数据库预检在连接数据库前以 `ERR_MODULE_NOT_FOUND: pg` 停止，生产数据库、服务、仓库和环境均未改变。
- 根因是 staged runner 位于 `/packet`，ESM 无法沿目录解析 Web 镜像 `/app/node_modules/pg`。本地最小修复把只读 packet 绑定到 `/app/packet`，没有增加依赖、复制 node_modules 或放宽容器权限。
- 新增边界回归测试，强制 `/app/packet` 且禁止退回 `/packet`；定向测试 10/10 和隔离 PostgreSQL 16 migration 010 演练已重新 PASS。
- 修复后的首次 transient unit 又在 DB/lease 前因 root-only 父目录导致宿主机 `-f` 检查不可达而 fail closed；没有证据目录、lease 或 DB 连接。第二个本地最小修复只用 `sudo stat` 核验该文件是单硬链普通文件、私有模式且 UID/GID 与非 root runner 一致，容器继续以 `ubuntu` 运行。未改共享父目录权限，也未安装 ACL 工具。
- 原 Bundle、原 request 和服务器 staging 不得继续执行。必须完成新提交、提交后自治门禁、新确定性 Bundle、新单次请求和服务器哈希校验后，才能重新进入生产 Add Schema。

当前能力结论不变：**R1 / 可运行但不完整 / 不能支撑实战**。生产仍是 migrations 001-009，Canonical phase transition 继续被 rollback safety schema 阻断。
