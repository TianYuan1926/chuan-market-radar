# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-08-01 / P0R B9 Pre-secret Bootstrap, Native Copy Timeout, and Verified Cleanup

### 本轮目标

在 B8 accepted target 上执行 B9 的 pre-secret bootstrap：复核 exact staging、建立仅限当前 SOCKS 出口 `/32` 的临时 8022 路线、启动 fixed local TTY bridge，并在用户 MFA/API Explorer 原生 Copy 后自动进入只读恢复演练。

### 当前证据

- local exact source `be87cf040472559979f4b6a602350970d9bf2c32`、plan、Keychain age identity、mode-600 SSH identity/known_hosts 和四条 GitHub 门保持合格；当前实现分支 HEAD `6a2b05a322e928a9f98bf4ae559f8e8284a65031` 干净且已同步。
- B8 target 再次通过三个祖先目录 `ubuntu:ubuntu 0700`、16 个普通文件、零 symlink、manifest SHA-256=`c9e85a91bf09a5fbeafb119517be93805a1f25ad09466c6c9a9a15a58295a318`、plan SHA-256=`71d05e2db2ae2f09fdc1332e8e05dde090bd3fe7c40a650b1b905fd86aca5cc8`、bindings SHA-256=`fd62c920191397ae7a708e5f81dab54222875db04ac32a3f9afa1b1dee428f92` 和全包聚合 SHA-256=`7a91cd89199269363cc642834000f3de33b1ddc9cbd8fcba8751763f77d894ca`；超时清理后同一 16-member 聚合摘要仍一致。
- 两个公网端点同时测得当前 BoostCore SOCKS 出口 `156.248.15.38`。生产只启动 `RuntimeMaxSec=2h`、ubuntu public-key-only、root/password/keyboard-interactive/forwarding 全禁用的独立 8022 sshd，并只添加 `156.248.15.38/32 -> TCP 8022` 腾讯规则。
- 本机使用固定 ed25519 identity、mode-600 known_hosts、`StrictHostKeyChecking=yes`、`HostKeyAlias=43.161.202.227` 和固定 SOCKS 完成真实握手，返回 `ubuntu / VM-0-9-ubuntu / active`。bridge v3 随后取得远端 echo-disabled `READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE`。
- READY 后 540 秒内没有收到结构有效的 API Explorer 原生 Copy，bridge 以 `clipboard_response_timeout` 安全失败关闭；没有 credential 被 bridge 接收或编译，没有 secret 进入生产 `/dev/shm`，Runner 未启动，数据库未读取，COS、backup、retrieval、restore 和 recovery evidence 均未发生。腾讯侧是否曾在浏览器中签发无法由该证据证明，因此该超时窗口任何可能存在的 response 一律禁止复用，下一次只允许 fresh STS。
- 自动清理已停止 transient sshd 并验证 unit=`inactive`、listener=`0`；唯一腾讯 `/32` 规则删除成功且 source/8022/remark 全部不存在；`/dev/shm` P0R 文件、P0R process、container 和 volume 均为 `0`。
- 生产保持 HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、clean worktree、11 个运行容器及原 full-ID/name/image identity；Web/PostgreSQL/Redis 均 healthy，`pg_isready` 接受连接，Redis 返回 `PONG`。env、migration、Feature Flag、Worker、流量和 authority 未改变。

### 当前真值与下一步

状态是 `B9_ACCEPTED_TARGET_RECHECK_PASS / PRE_SECRET_8022_BOOTSTRAP_PASS / STRICT_SSH_IDENTITY_PASS / BRIDGE_ECHO_DISABLED_READY_PASS / NATIVE_COPY_TIMEOUT / CREDENTIAL_NOT_RECEIVED_OR_COMPILED / RECOVERY_NOT_EXECUTED / FULL_TEMPORARY_ROUTE_AND_RUNTIME_CLEANUP_PASS / PRODUCTION_ZERO_DRIFT`。B9 仍未完成，P0 继续 BLOCKED。下一次必须先把本轮 exact API Explorer 请求页准备到只差用户 MFA、发起调用和原生 Copy 的状态，再测 fresh 出口、重建临时 8022/`/32` 和 bridge；不得在未准备页面或用户不在场时提前消耗 540 秒 secret window，也不得复用本轮可能存在的任何浏览器 response。

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

## 2026-07-29 / P0R Atomic Secret Session Root Remediation

### 本轮目标

根据两次真实 STS 失败证据，永久移除 raw response 落盘、裸 `tee`、手工编译、AX response reconstruction 和 Compose env 重插值路径；建立无回显、内存即时编译、两项 secret 到齐后自动执行且失败全清理的原子会话。

### 当前证据

- `bd20bd5b73ef0beb41c331aa43c58051ef01d37a` 的四条 GitHub 门禁、fresh production read-only rebind 和 v3 plan/bundle staging 核验仍是可信历史证据，但其旧 secret 会话实现已被真实失败证伪，因此不再拥有执行权。
- 第一枚 STS 因 receiver 未运行而误入交互 shell，已过期且永久禁用。第二枚 STS 最终进入真实 receiver，但多条手工操作导致超过签发后 5 分钟；编译器按真实时钟返回 `STS response was not compiled immediately after issuance`。未使用 `--now` 伪造时间，也未继续 COS、数据库、backup、retrieval 或 restore。
- raw path 删除后，独立现场核验发现 PID `1175383` 的 `tee` 仍持有已 unlink 文件并等待输入。该进程经 exact identity 核对后终止；随后分别证明生产 P0R 文件数 `0`、进程数 `0`。本机 clipboard 已覆盖，secret-bearing Node 会话已整体 reset。
- 第二枚 STS 的 exact expiry `2026-07-28T20:57:29Z` 已由本机 UTC `2026-07-28T20:57:48Z` 与腾讯 STS HTTPS Date `2026-07-28T20:57:56Z` 双重证明超过；该凭证现为 `EXPIRED_FORBIDDEN_REUSE`，永久禁止复用。两次尝试均没有生产数据库读取、COS 对象、backup、retrieval、restore、业务服务或 authority 变更。
- 新 `m1-production-storage-p0r-session.sh` 在 TTY 关闭 echo，使用 Web 容器内的受控 Node 从 stdin 有界读取 STS、在内存校验并即时编译，原始响应不落盘；credential 与 age identity 只以 exclusive mode 600 写入 `/dev/shm`。第二会话以 PID、Linux process-start token 和 source commit 三重绑定第一会话，拒绝 PID 复用或陈旧 ready 文件；两项 secret 到齐后自动启动 checksum-bound Runner，任一会话超时、断线、验证失败或 Runner 退出均立即清理整组 exact session 路径。
- session helper 不执行 `p0r-bindings.env`，只把它作为普通数据解析；恰好接受 12 个白名单键、一个 40 位 source commit 和 11 个 SHA-256。生产容器仅按 exact Compose project/service labels 选择，不再重新渲染 Compose 或读取 env。
- Runner 内部数据库描述和 canary 不再使用可预测公共 `/dev/shm` 文件：每次执行创建 owner-bound mode-700 私有目录，内部 plaintext/recovered canary 以 no-clobber mode-600 regular file 生成，禁止内部 `tee`，并在成功前验证整个目录已删除。
- credential ingress CLI 已删除 caller-supplied `--now`，生产编译只能使用进程真实时钟；回归证明任何时钟覆盖参数都会 fail closed。
- fresh rebind request/result schema v2 已把历史 transport v1 三文件替代比较与当前 transport v2 七文件运行资格分离；七文件集包含 runner 和 atomic session helper，任一摘要缺失或混写都 fail closed，且历史 13-member verifier 边界保持冻结。
- 当前定向 P0R `81/81`、Go helper、recurrence gate `10/10`、production dispatch `24/24`、`git diff --check` 和完整 `ci:production` 已通过；完整 CI 同时取得 V2 Foundation `631 PASS / 6 explicit skip`、V2 Ops `203/203`、Next production build、Golden `16/16` 与 security PASS。新 clean commit、GitHub 四门、fresh production read-only rebind、新 plan/bundle、真实目标 session acceptance 与恢复仍待完成。

### 当前真值

P0R 当前是“本地根因修复通过专项门禁，完整资格和真实生产恢复未完成”。没有可用 credential，没有读取生产数据库，没有生成或上传 backup，没有创建 COS 对象，没有执行 exact retrieval 或独立 PostgreSQL 16 restore。生产应用、数据库、Redis、Worker、env、migration、Feature Flag、生产仓库和业务 authority 未改变。旧 raw/tee/manual-compile 路线已永久退役，不能因历史四门或 staging PASS 恢复执行权。

### 下一步（已由上方固定 TTY bridge 路线覆盖）

本条原定的两个 fresh OrcaTerm secret 会话已被第三枚 STS disclosure 证伪并永久退役。当前只执行上方 `P0R Post-Response Disclosure Containment and Fixed Local TTY Bridge` 的新顺序；本段保留为历史演进证据，不再具有执行权。
