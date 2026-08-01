# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-08-01 / P0R B9-R1 Remote Requalification and M3.3E Local Core

### 本轮目标

在不触碰生产业务与 secret 边界的前提下恢复 P0R 下一次执行资格，并在隔离工作树完成策略类型标签的本地权威合同，避免“标签只是前端文案”或 Outcome 事后改名。

### 当前证据

- P0R B9-R1 已在冻结 source `6a70b8d3a964dd109d5051ba731813c4bccda62d` 上完成四个 GitHub PASS 门、fresh signed read-only rebind、全新 v4 run/plan/transport、无凭证 fixed-dispatch staging 和独立 target acceptance；资格包 SHA-256=`185ebe4f0c0c47f7916ca647c1d10a6219b1e39a10d53382f06a551851258243`。
- 该窗口没有建立 8022、签发 STS、读取或写入数据库、访问 COS、执行 backup/restore，也没有改变服务、env、migration、Feature Flag、流量或生产仓库；生产保持零漂移。P0R 完整恢复仍未执行，并需要新的动作时授权。
- M3.3E 隔离本地核心合同已将 `StrategyDraft` 升至 v3：完整草案必须恰好一个内容寻址 canonical 主标签和有界 context tags；无法从 Thesis pattern、Analysis structure、方向和结构位证明时 no-draft abstain。
- 标签沿 `StrategyDecision v2`、`DecisionSnapshot v3`、`AlertEvent v2`、`OutcomeRecord v3` 原样冻结；跨对象合同拒绝重算合法 hash 后的事后改名与状态重写。词表固定为 14 个结构主标签，相对强弱与衍生品资金流只作为 evidence driver。
- 本地 Read Model/Alert/Outcome 构建器已接通：READY 必须具备同 release、fresh 且 SUITABLE 的 Personal/Portfolio Risk；提醒不能由调用方指定类型或标签；Outcome 必须绑定 policy、measurement facts、objective event、完整 checkpoint 和原始 firstDetectedAt，lead time 由事件起点客观计算。描述性按标签归因拒绝重复记录，并明确无概率 authority。
- M3 核心回归 `93/93`、runtime/schema 定向 `48/48`、多资产 `28/28`、Scope Rebase `12/12` 已通过。当前仍是 `M3_TEST_ONLY_UNBOUND_SCOPE_EPOCH`；真实 Scope V2 接线/存储、canonical Risk builder、真实评估、UI、cohort/holdout、Shadow、独立审计和生产 authority 未完成。

### 当前真值与下一步

P0R 是“远端资格通过、完整恢复未执行”；M3.3E 是“本地 test-only 运行构建器通过、真实数据接线与实战验收未完成”。下一步先完成本包完整 CI 与独立审计并保持冻结 source 不变；P0R 只在新的动作时授权内执行临时 8022、bridge v4、fresh STS、只读加密 backup、精确版本取回、独立 PostgreSQL 16 restore 和全量清理。

## 2026-08-01 / P0R B9 COS Object Lock CAM Root Remediation

### 本轮目标

在 B8 accepted target 上执行 B9，并在真实 Runner 阻断后完成根因定位、生产清理和本地永久整改：纠正 COS Object Lock 的 CAM action，废止旧执行 authority，并把未分类自由文本升级为固定脱敏阶段诊断。

### 当前证据

- 旧执行 source `be87cf040472559979f4b6a602350970d9bf2c32`、run `p0r-20260729t221859z-48eee3208ed0c519e49c2519f05e665e` 和 B8 target 在执行前通过 exact plan、16 files、零 symlink、mode/owner/hash 与 source identity 复核。
- fixed local TTY bridge 真实完成 API Explorer 原生 Copy、STS 即时编译和 Keychain age identity handoff，Runner 随后启动。它在读取生产数据库前的 COS control-plane preflight 返回 `recovery_drill_failed_blocked_unclassified`；evidence 目录为空，没有 backup、COS object、exact retrieval、isolated restore 或临时恢复 container/volume。
- remote exact-plan verify PASS，生产出网由两个独立公网端点一致证明为 plan 绑定的 `43.161.202.227/32`，因此来源 IP 和 plan digest 不是根因。
- 腾讯官方合同区分 REST 操作 `GET Bucket ObjectLockConfiguration` 和 CAM action `cos:GetBucketObjectLock`。旧 plan/policy 错误使用 `cos:GetBucketObjectLockConfiguration`；该 STS 可以签发，但不能授权真实 Object Lock GET，这与失败阶段和空 evidence 精确一致。
- 本地整改把 plan schema 升为 `v2-m1-production-storage-cos-provisioning-plan.v4`、credential schema 升为 `v2-m1-production-storage-cos-temporary-credentials.v3`、bridge 升为 v4；JS、Go helper 和 policy 统一使用官方 action。旧 v3 plan、v2 credential、run/object key/staging 自动拒绝，禁止手改或复用。
- Go helper 现在只输出固定脱敏 `p0r_cos_*` reason code；bridge 只传播 allowlist 内阶段。Provider 自由文本、bucket、object key 或 credential material 不得进入错误输出；malformed/未知诊断继续 fail closed。
- 定向 Node 计划/桥接/transport `32/32`、旧合同拒绝回归 `12/12`、完整 P0R `113/113` 和 Go helper 均 PASS。补全固定 PATH 中本机 `/sbin/sha256sum` 后，完整 `ci:production` 已从头 PASS：recurrence `11/11`、dispatch `25/25`、V2 Foundation `631 PASS / 6 explicit skips`、V2 Ops `235/235`、Next build、Golden `16/16` 和 security；第一次 PATH 漏项失败不计入通过。clean commit、GitHub 四门、fresh rebind、新 run/v4 plan/package/staging 和 corrected real-target recovery 尚未完成。
- 临时 8022 sshd 已停止，listener=`0`；唯一 `156.248.15.38/32 -> TCP 8022` 腾讯规则已删除并确认不存在。`/dev/shm` P0R 文件、process、container 和 volume 均为 `0`。
- 生产保持 HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、clean worktree、11 个运行容器及原 full-ID/name/image identity；Web/PostgreSQL/Redis 均 healthy，`pg_isready` 接受连接，Redis 返回 `PONG`。数据库、env、migration、Feature Flag、Worker、流量和 authority 未改变。

### 当前真值与下一步

状态是 `B9_STS_AND_AGE_HANDOFF_PASS / RUNNER_STARTED / COS_OBJECT_LOCK_AUTHORIZATION_BLOCKED_BEFORE_DATABASE_READ / RECOVERY_NOT_EXECUTED / LOCAL_ROOT_REMEDIATION_P0R_113_OF_113_AND_FULL_CI_PASS / CLEAN_EXACT_SOURCE_AND_REMOTE_QUALIFICATION_PENDING / FULL_TEMPORARY_ROUTE_SECRET_AND_RUNTIME_CLEANUP_PASS / PRODUCTION_ZERO_DRIFT`。B9 与 P0 仍未完成。下一步形成 clean exact commit，再完成 GitHub 四门、fresh production read-only rebind、新 run/v4 plan/transport/fixed-dispatch staging 和 target acceptance；只有这些全部通过后，才允许重新建立临时 8022 路线并签发 fresh STS。

## 2026-07-31 / P0R Fixed Dispatch Transport Staging Root Remediation

### 本轮目标

根据同一 exact P0R transport v3 在 OrcaTerm 文件管理器连续三次无法送达的真实证据，永久退役该浏览器上传路径，改用现有 Ed25519 signed pull-only 固定生产通道完成无 secret、delivery-only 的原子 staging。

### 当前证据

- replacement source `be87cf040472559979f4b6a602350970d9bf2c32` 已通过 Signed Dispatch `30494580534`、A0 `30494580517`、Independent Security `30494580551`、Full Quality `30494580577` 和 fresh rebind `p0r-rebind-preflight-20260729t220958z-0bc442e3`。
- run `p0r-20260729t221859z-48eee3208ed0c519e49c2519f05e665e` 的 exact 16-member inner transport SHA-256=`44f5e34fdd2bbdbf94dbc642a3a45b39b6271f9d14e6dc5cb7173d7bddf2aa9b`，大小 9,176,819 bytes，不含 secret。三次 OrcaTerm 上传包含短路径同 SHA 对照，805 秒后服务器目标文件和 run staging 均不存在。
- 失败窗口没有 STS、credential、`/dev/shm`、8022、数据库、COS、session、Runner、recovery、应用、Redis、Worker、env、migration、Feature Flag 或 authority 变更；生产保持零漂移。
- `REC-2026-07-23-ORCATERM-ZERO-BYTE-UPLOAD` 已按真实复发重新打开，`p0r_orcaterm_recovery_bundle_transport` 永久退役。重新加载或继续重试 OrcaTerm 文件上传不再是允许的修复。
- B8 外包恰好五个成员，由 canonical request 绑定 source/ref、run、plan、inner SHA、目标路径、90 秒 runtime、成员 mode/hash 和 no-secret/no-recovery 权限。目标 Runner 只在 `.incoming-*` 验证 exact 16 members 后原子 rename，不覆盖既有 staging，不请求 credential、不读数据库、不启动 P0R。
- transport staging 10/10、recurrence+staging 21/21、完整 P0R 110/110 和 Go helper 已 PASS。精确 Node `22.23.1`、npm `10.9.8`、Go `1.26.3` 下的完整 `ci:production` 也已 PASS，包含 recurrence 11/11、dispatch 24/24、Market 965 PASS / 4 explicit skips、Workers 23/23、historical smoke 4/4、V2 Ops 232/232、Next build、Golden 16/16 与 security。受管 sandbox 中七个 `clipboard_arm_failed` 已被最小 A/B 证明为 Tcl/Expect 内部 `exec` 的 `EPERM` 环境限制；同一 bridge suite 在真实主机权限边界 9/9 PASS，没有弱化生产 bridge。
- clean outer source `15d7cb3899b5f8c4763390fa0baba8e51aa29d56` 已通过 Signed Dispatch `30632789118`、Independent Security `30632789106`、A0 `30632788902` 和 Full Quality `30632788867` 四门。
- 首次 signed dispatch `p0r-transport-stage-20260731t131227z-81fcaa2f` / commit `9fac599e...` 在预存 `p0r` 祖先目录 mode=`0755` 上返回 `p0r_transport_stage_directory_unsafe`。Runner 没有 chmod、没有创建 target、没有残留 `.incoming-*`，生产业务零变更。
- 用户只授权将该祖先收紧为 `0700`；修复前后 owner、realpath、staging、production HEAD、clean worktree、11-container identity、Web/PostgreSQL/Redis、timer 与 P0R runtime 均通过零漂移复核。
- fresh dispatch `p0r-transport-stage-20260731t143942z-63b1e6f9` / signed commit `d5ea6e...` 已通过 exact 16 个普通文件、零 symlink、manifest SHA-256=`c9e85a91...`、逐文件 size/hash/mode/owner、outer cleanup 和生产零漂移验收。OrcaTerm upload recurrence 因此关闭为 `CLOSED_VERIFIED`。
- release CLI 首次误传完整 `refs/heads/production-dispatch`，GitHub 在远端 mutation 前拒绝嵌套 ref；signed outbox 未变，改用短名称 `production-dispatch` 后才成功发布。publisher 现会在任何文件、Git 或网络 I/O 前拒绝 `refs/...`，production dispatch `25/25` 与运行手册共同固定这一边界。
- post-acceptance ancestor 红例已加入并通过，transport staging 升为 `11/11`；冻结 Node `22.23.1`、Go `1.26.3`、`GOTOOLCHAIN=local` 下完整 P0R `111/111` PASS。
- post-acceptance 完整 `ci:production` 已以退出码 0 通过：recurrence `11/11`、production dispatch `25/25`、Market `965 PASS / 4 explicit skips`、Workers `23/23`、historical smoke `4/4`、V2 Foundation `631 PASS / 6 explicit skips`、V2 Ops `233/233`、M0 exit、Next production build、Golden `16/16` 与 security 全部 PASS。该证据只关闭防复发本地质量门，不冒充 B9 recovery 或 fresh P0。

### 当前真值与下一步

状态是 `B8_LOCAL_AND_REMOTE_QUALIFICATION_PASS / UNSAFE_PARENT_FAIL_CLOSED / P0R_PARENT_0700_REMEDIATION_PASS / FRESH_SIGNED_DISPATCH_EXACT_TARGET_ACCEPTANCE_PASS / POST_ACCEPTANCE_GUARDRAIL_FULL_CI_PASS / REAL_RECOVERY_NOT_STARTED / PRODUCTION_BUSINESS_MUTATION_NONE`。祖先目录权限、短 branch 参数、防复发测试、手册与权威真值已在本地完整质量门收口；执行入口是 `V2-M1.6-P0R-B9-EXACT-STAGED-RECOVERY-EXECUTION`。B9 才负责受限 8022、fresh STS、加密 backup、exact retrieval、独立 PG16 restore 与全量 cleanup；当前不需要用户生成 STS 或操作 COS。

## 2026-07-30 / P0R Runtime Namespace Root Remediation

### 本轮目标

根据 exact source `e83c1f238b19a3495d17f791d0ca5b65a9447734` 的首次真实 P0R Runner 阻断，根治“宿主机必须能看见生产 Web 容器 `/app/node_modules`”这一错误运行依赖假设，并把远端失败诊断收紧为不含路径、参数或 secret 的有界源码位置。

### 当前证据

- run `p0r-20260729t193336z-0ec1106cf1a2ee7402b0309cddfa34b0` 的 STS 与 age identity 原子交接均通过，随后 Runner 在第一份 backup evidence 产生前返回 BLOCKED；没有读取或改变生产业务数据，没有创建 backup、COS 对象、retrieval、restore、临时恢复容器或 volume。
- 现场只读检查证明 Web/PostgreSQL 容器各恰好一个且均运行，生产 Node 和 PostgreSQL socket 可用；Web 容器内部 `pg@8.16.3` 可解析，但宿主 `/proc/<web-pid>/root/app/node_modules` 不存在。这是 mount namespace 可见性差异，不是 Web 依赖缺失、数据库故障或用户权限问题。
- 失败后已关闭 credential 页面，删除 exact staging/evidence，停止临时 8022 sshd，删除唯一 `/32 -> TCP 8022` 腾讯规则，并复核 listener、unit、`/dev/shm`、P0R process/container/volume 全部为 0；生产数据库、服务、仓库、env、migration、Feature Flag 和 authority 未改变。
- Runner、session 和 bridge 的失败输出现只允许 `p0r_runner_line_N` 或 `p0r_session_line_N`，不传播自由文本。malformed 或 secret-shaped 远端诊断统一降为 unclassified BLOCKED。
- 新 transport v3 内置 checksum-bound P0R Node runtime capsule：精确 Node `22.23.1`、npm `10.9.8`、`pg 8.16.3`，不依赖生产 `node_modules`。胶囊只允许 lockfile 中的普通文件，拒绝符号链接、native module、`.bin`、额外包、路径逃逸、权限漂移、摘要不符和版本漂移。
- 两次相互独立的真实隔离 `npm ci` 已构建并复检同一个 143 文件、457099 unpacked bytes 的胶囊，字节级摘要均为 `cc0ce88091cc0b32850197c98c222df8b3b1406d2afb36fa6aed69021e76a7b9`；构建时提前清理临时安装目录的异步竞态也被测试捕获并永久修复。
- 当前 P0R 定向回归 `100/100`、Go helper、recurrence `11/11`、dispatch `24/24` 和精确 Node `22.23.1` / npm `10.9.8` / Go `1.26.3` 下的完整 `ci:production` 均 PASS；完整 CI 包含 V2 Foundation `631 PASS / 6 explicit skips`、V2 Ops `222/222`、Next build、Golden `16/16` 和 security。clean commit、GitHub 四门、fresh rebind、transport-v3 exact package 和新生产恢复仍待完成，因此 M1/P0R 不能减数。

### 当前真值与下一步

状态是 `LOCAL_ROOT_REMEDIATION_P0R_100_OF_100_AND_FULL_CI_PASS / PRODUCTION_RECOVERY_BLOCKED_PRE_BACKUP / PRODUCTION_ZERO_DRIFT / TEMPORARY_ROUTE_AND_SECRET_RESIDUE_CLEAN / CLEAN_COMMIT_REMOTE_GATES_REBIND_AND_NEW_EXECUTION_PENDING`。当前不需要用户生成 STS、开放端口或操作 COS。下一步形成 clean commit、四门、fresh read-only rebind 和全新 run/plan/object key/transport-v3；只有这些全部通过后，才允许在动作时重新建立临时 8022 路线并请求新的 STS。

## 2026-07-30 / P0R Fixed Local TTY Bridge and Proxy-Compatible 8022 Route

### 本轮目标

根据第三枚真实 STS 在 browser-state recovery 中进入工具输出的直接证据，永久移除 API response 出现后的浏览器状态读取和 OrcaTerm secret entry，改为签发前预先建立的固定本机 TTY bridge。

### 当前证据

- source `e3626387ee8d57ef8e4f9c11c2e098b781ac6fbe` 的本地 CI、GitHub 四门、fresh read-only rebind 和 staged transport-v2 曾真实 PASS，但 run `p0r-20260728t222552z-299113ff2921579d305df1e295e51914` 的 STS response 随后被浏览器状态读取披露。因此该 source 的资格证据仍是历史事实，该 run、plan、object key、bundle 和 staging 则全部永久失去执行权。
- 第三枚 STS 从未进入服务器、从未编译、从未访问 COS；没有数据库 backup、retrieval 或 restore。其 exact expiry 为 `2026-07-29T06:09:17Z`，到期前状态是 `COMPROMISED_FORBIDDEN_UNTIL_EXPIRED`，到期后仍永久禁止复用。
- 本机 UTC `2026-07-29T10:32:53Z` 与腾讯 STS HTTPS Date `2026-07-29T10:35:42Z` 已分别晚于该 exact expiry，第三枚 STS 现为 `EXPIRED_FORBIDDEN_REUSE`；双时钟证明只允许后续在新 source、新 run 和新 plan 下重新签发，绝不恢复旧 credential 或旧 execution identity。
- 事故后 API 页已清空、clipboard 已覆盖、secret-bearing browser/Node context 已销毁。生产四条独立只读检查证明 P0R 文件、session/provisioning 进程、container 和 volume 全部为 0；生产应用、数据库、Redis、仓库、env、migration、authority 和 11 个既有容器未改变。
- direct SSH read-only probe 已真实 PASS。新 `m1-production-storage-p0r-local-tty-bridge.exp` 固定目标、SSH identity、known_hosts、ed25519 host key、loopback proxy、run-derived staging 和两个远端命令；execute 模式不接受任意 host、remote command、secret 或 Keychain 名称。
- bridge 必须在 STS 签发前收到远端 echo-disabled READY marker。之后只接受 API Explorer 原生 Copy 的结构精确有界 JSON，先覆盖 clipboard 再 handoff；credential compile 后从固定 Keychain 项内部读取 age identity。response 后禁止 screenshot、OCR、AX、browser state、computer-use 和 OrcaTerm secret 输入。
- 远端 session 已改为先执行 `stty -echo` 再输出 READY，移除 ready/echo 竞态，接收窗口扩至 600 秒但仍由编译器强制签发后 5 分钟即时编译。
- 本地伪 TTY 红绿测试 10/10 PASS：覆盖完整双 session、secret 不进入 stdout/stderr、固定命令、固定 Keychain 参数、malformed clipboard、错误 marker、SSH failure 和无论成败 clipboard 清理。
- bridge 的计划校验运行时已固定为本机受控 Node `v22.23.1`，并 fail closed 拒绝版本漂移；完整 P0R `87/87`、Go helper、recurrence gate `10/10`、production dispatch `24/24`、精确 Node/npm 的完整 `ci:production`、Next production build、Golden `16/16` 与 security check 均已 PASS。新 clean commit、GitHub 四门、fresh rebind、新 execution identity 和真实生产恢复仍待完成，不能用本地全绿冒充生产 PASS。
- replacement source `38b49f43e0dc15514d1da9c1169d2fed233d8f5a` 的 Full Quality 缺 `/usr/bin/expect` 后，已通过精确安装 Ubuntu Noble `expect=5.45.4-3` 与 `tcl-expect=5.45.4-3` 根治；新 source `0e035784988261926eb9656d25050180c87b0d1e` 的 A0 `30457497065`、Signed Dispatch `30457497032`、Full Quality `30457497061` 和 Independent Security `30457497311` 四门全部 PASS。
- fresh rebind `p0r-rebind-preflight-20260729t150004z-c85ec1a4` 经 signed dispatch commit `a0dac15d3cc85cf846566eed8a64cd7fd6e35112` 到达生产，但在 `PACKAGE_BINDING` 阶段正确阻断：通用 envelope 的 `runtimeMaxSeconds=5400` 超过只读包允许的 90 秒。没有 production mutation attempt，staging 自动清理。
- 事后 fresh read-only 复核确认 production HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、clean worktree、11 个容器和 P0R files/containers/volumes 均保持零漂移。根因是 approval request 未把包级运行上限写入跨层合同，而非生产环境故障。
- request schema 已升级为 v3 并显式绑定 `dispatchRuntimeMaxSeconds=90`；固定通道在签名前、outbox 验证和生产代理阶段比对 request/envelope，包内 runner 再独立比对。唯一高层 release 入口从 canonical request 派生全部重复字段并拒绝 operator-supplied binding 选项，5400 秒红例必须在 outbox 创建前失败。生产恢复 Runbook 中残留的 request/result `v2` 混写已纠正为 request v3、result v2；通用固定派发 Runbook 也明确把 P0R 排除在 5400 秒示例之外。recurrence test 同时锁定两份 Runbook 的 schema、90 秒上限、唯一 release 入口和 P0R 禁用通用 prepare 的边界，防止操作文档再次回退。当前定向 29/29、P0R 88/88、最小 PATH dispatch 回归、V2 Foundation 631 PASS / 6 explicit skips、V2 Ops 209/209、Go helper、Next build、Golden 16/16 和 security 的完整本地 CI 均 PASS；新 exact commit、四门重验和 fresh rebind 尚未完成。
- 上述跨层根治后的 clean source `44e51823f11ad81cbabc632256f0402ef2d00c29` 已取得 Signed Dispatch `30474274621`、A0 `30474274716`、Full Quality `30474274718`、Independent Security `30474274719` 四门 PASS；fresh rebind `p0r-rebind-preflight-20260729t172500z-a32c3e9b` 返回 `PASS_P0R_READ_ONLY_REBIND_PREFLIGHT`，生产 HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、clean worktree、11 containers、P0R files/containers/volumes=0 和 health/timer 零漂移。
- `44e518...` 下的全新 run `p0r-20260729t174950z-83b68bfeebff953f49873bccf12cdacf`、plan digest `sha256:6c9909788fd0e19abffe5b206f7383412cfdc3e546f97d65f90a23d4d2406fdb`、bundle `8d8f80f8583b2608031f0883627e01ad6f5a411b4dd7843d42abb8dceb6954d5` 和独立本地 package acceptance 均 PASS。签发 STS 前的真实通道检查却证明当前本机直连和 BoostNet SOCKS 到生产 port 22 均在 SSH banner 前失败；相同 SOCKS 到 `ssh.github.com:443` 可返回 SSH banner，说明根因是端口路径而非 SSH 协议或密钥。
- 受控端口矩阵证明 8022 可经当前 SOCKS 到达、2222 不可达；当前出口为 `157.254.154.223`。生产随后只启动一个 `RuntimeMaxSec=7200`、ubuntu public-key-only、root/password/keyboard-interactive/forwarding 全禁用的独立 sshd，并只新增 `157.254.154.223/32 -> TCP 8022` 腾讯规则。严格 known_hosts、ed25519、`HostKeyAlias=43.161.202.227` 的本机握手真实返回 `ubuntu / VM-0-9-ubuntu / active`。该步骤没有签发 STS，没有 COS、数据库或业务 runtime 变更。
- bridge schema v2 已固定 port 8022 与 HostKeyAlias，把完整 SSH 参数纳入两条伪 TTY 会话测试并禁止回退 `-p 22`。当前 bridge 6/6、P0R 88/88、recurrence 11/11、dispatch 24/24、V2 Foundation 631 PASS / 6 explicit skips、V2 Ops 210/210、Next build、Golden 16/16 和 security 的完整本地生产 CI 均 PASS；新 exact commit、四门、fresh rebind、新 run/plan/bundle 和真实 recovery 尚未完成。临时 listener 与云规则仍在受控窗口内，必须在成功、失败或超时后显式删除并验证。

### 当前真值

P0R 仍是 `PRODUCTION_RECOVERY_NOT_EXECUTED / P0_BLOCKED`。现在没有可用 credential；`44e518...` 的四门、rebind 和 package 是真实历史 PASS，但 package 因 bridge schema v2 路由根治失去执行权。当前已完成 8022 预秘密通道验收和 bridge v2 本地全资格，不能冒充 backup、retrieval、restore 或 P0R PASS。旧 browser/OrcaTerm secret 路线和默认 SSH port 22 fallback 均已永久退役。

### 下一步

形成新的 clean exact commit 并重新取得 GitHub 四门；随后只通过高层 release 入口执行 fresh read-only rebind，再生成全新 run/object key/plan/bundle/staging。所有新 source 资格成立后，复核 8022 bootstrap gate、启动 bridge 并看到 READY，再由用户完成 MFA 和 API Explorer 原生 Copy。只有真实 backup、exact retrieval、独立 PostgreSQL 16 restore、证据封存、secret/container/volume/runtime 清理、8022 listener/云规则清理与生产零漂移全部 PASS，P0R 才能关闭。
