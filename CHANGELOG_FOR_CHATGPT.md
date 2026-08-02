# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-08-02 / Fixed Dispatch Autonomous Evidence Return Root Remediation

### 本轮目标

根据 fixed dispatch 可送达 signed package、但严格脱敏结果只能滞留生产服务器的重复阻断，永久退役 Edge/API response reading、AX/browser-state、人工复制和 OrcaTerm result transport，建立可签名、加密、自动取回、独立验证和到期删除的生产证据返回通道。

### 当前证据

- 新 `V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY` 由生产 SSH Ed25519 host key 对 canonical statement 作 namespace 签名，再用固定本机 X25519 recipient 经 HKDF-SHA256 + AES-256-GCM 加密；Caddy 只允许既有 HTTP 端口上的高熵 exact `.mre` ciphertext path，不允许目录、redirect、plaintext、secret 或任意文件。
- 本机固定 poller 只经 `127.0.0.1:7892` SOCKS 访问固定生产地址，校验 pinned host key/fingerprint、dispatch、schema、time 和 hash，以 mode-600、atomic、no-clobber 方式保存 payload、sealed object 和 receipt。生产每个对象由 exact transient systemd timer 在两小时租约后删除，并保留有界 prune。
- 生产 gateway package 只允许复用当前 Caddy image 并 force-recreate Caddy；生产仓库、数据库、Redis、Worker、env、migration、Feature Flag 和其他容器均禁止改变。它在 mutation 前用当前 production Caddy image、network-none、read-only rootfs 验证目标配置；任何变更后失败都恢复 baseline Caddy，并要求非 Caddy full container IDs 保持不变。
- 审批和 release 控制文件已统一使用 descriptor-first `O_NOFOLLOW`、mode-600、大小上限和读取前后 inode/mtime 稳定校验，并新增 broad-mode 与 symlink 红例。当前 production dispatch `37/37`、gateway `7/7`、P0R rebind `14/14`、V2 Ops `274/274`、ESLint、shell syntax、diff check 和故障注入 PASS。
- 第一次最新字节完整 CI 在 recurrence authority `10/11` 真实失败，进一步暴露 PROJECT_CONTEXT、蓝图索引和旧防复发测试仍把 B9 R2 route authority 标为当前入口。治理修复把新 gateway 锁为唯一当前入口，旧 route authority 只保留为已资格化上游；M0 对生产控制 ID 改为精确白名单并加入任意 ID、Legacy ID 和换行注入红例。Caddyfile 变更同时触发 Legacy consumer map 和 reviewed commit fail closed；重新审查后的 22 capabilities、539 source files、273 runtime edges 全部不变，仅受影响 capability digest 更新。
- 修复后最终字节完整 `ci:production` 已从头 PASS：recurrence `11/11`、dispatch `37/37`、V2 Foundation `644 total / 638 PASS / 6 explicit skips`、V2 Ops `274/274`、M0 `12/12`、Next production build、Golden `16/16` 和 security 全部通过。implementation `1ddc0fdc...` 与 authority-sync remediation `35d7b63a...` 已形成唯一 V2 分支 clean commits。本机没有 Docker/Caddy CLI，因此不能把模拟测试称为真实 Caddy validation；真实语法/runtime validation 已固定为 production mutation 前、当前 image 的隔离 preflight，尚未执行。GitHub 四门、确定性 production bundle、精确生产批准、Caddy-only bootstrap、自动取回和 fresh rebind 仍待完成。
- 首轮 exact remote qualification 保留真实红灯：source `d67c0e87...` 的 Signed Dispatch `30733232254`、Full Quality `30733232256`、A0 `30733232263` PASS，但 Independent Security `30733232255` FAIL。CodeQL job `91457099084` 在私钥 no-clobber 测试发现两处 path-read race；现已统一改为 descriptor-first `O_NOFOLLOW`、mode/size/dev/ino/mtime 稳定读取且无 suppression。Gitleaks job `91457099116` 唯一 finding 是固定 X25519 recipient 公钥指纹；历史提交仅登记 exact fingerprint，活动源码改为两段表示，禁止宽泛 allowlist。经官方校验和确认的 Gitleaks `8.30.1` 本地完整历史 finding=`0`，定向 `33/33` 与最新最终字节完整 `ci:production` PASS；新的 clean remediation commit 和四门重验尚未完成。
- 后续 exact source `dd67d81910f5696049d4271d527c264f2e42115f` 已从零取得 Signed Dispatch `30734390429`、Full Quality `30734390438`、A0 `30734390439`、Independent Security `30734390634` 四门，并在旧批准窗口内发布 signed dispatch `a52aa6acfbe2f4f5d26cb15a82701195ca2f32df`。目标在任何 gateway/Caddy mutation 前返回 `FAIL_DISPATCH_NOT_REUSABLE`；stderr digest `sha256:d41cd1e0993f4f20b1024ac7e1c9ba17ea70cd9a1f0f5ec61fd96523bde9701f` 唯一对应 `evidence_gateway_health_not_ready`。
- 根因是生产 `/api/health` 返回顶层 `{ok,health}`，gateway parser 与测试 fixture 却共同读取 `data.health`，导致模拟测试自洽但偏离真实 API。生产 fresh read-only 复核证明 health/scan/persistence ready、exact 11 containers 不变、目标 route 仍 404、gateway/outbound/staging/global lease absent，数据库、Redis、Worker、env、migration、Feature Flag、流量和仓库均无 mutation。旧批准已过期，旧 dispatch 永久不可复用。
- 当前 parser 与 fixture 已绑定真实 top-level envelope，并新增 obsolete nested envelope 必须在 mutation 前失败、mutation count=0、gateway root absent 的防复发红例；gateway `8/8`、recurrence `11/11`、dispatch `37/37`、Foundation `638 PASS / 6 skip`、Ops `275/275`、M0 `12/12`、Next build、Golden `16/16` 与 security 在 exact full CI 中 PASS。新字节尚未形成 clean commit、取得同一 commit 四门或新批准，不能借用 `dd67d819...` 的历史资格。

### 当前真值与下一步

状态是 `LAST_EXACT_SOURCE_REMOTE_FOUR_GATES_PASS / FIRST_PRODUCTION_ATTEMPT_BLOCKED_PRE_MUTATION_HEALTH_ENVELOPE_MISMATCH / LAST_APPROVAL_EXPIRED_DISPATCH_NOT_REUSABLE / FAILED_ATTEMPT_FRESH_ZERO_DRIFT_PASS / CURRENT_REMEDIATION_GATEWAY_8_OF_8_AND_FULL_CI_PASS / CLEAN_COMMIT_REMOTE_FOUR_GATES_NEW_PACKAGE_AND_NEW_APPROVAL_PENDING / P0R_BACKUP_RETRIEVAL_RESTORE_NOT_EXECUTED`。下一步形成并推送 clean remediation source、从零取得四门、重采生产基线并生成新 exact package；只有新的当前批准成立后才允许 Caddy-only bootstrap。成功自动取回并验证 gateway evidence 后，使用同一通道 fresh rebind，再恢复 P0R。

## 2026-08-02 / P0R B9 R2 External Transaction and Route Authority Root Remediation

### 本轮目标

根据同一 secret handoff 故障类连续两次 clipboard timeout 和随后 dynamic egress 漂移的真实证据停止重试，根治“只预建第一条 TTY、签发后再建第二条 SSH、短窗口无双会话心跳、事务执行未真正消费 route authority”四个跨层缺口。

### 当前证据

- source `6a70b8d3a964dd109d5051ba731813c4bccda62d` 的两个旧窗口分别等待 540 秒后安全退出；后到 native Copy 已作废，从未进入 Bridge、`/dev/shm` 或服务器。没有 Runner、数据库读取、COS、backup、retrieval、restore 或业务 mutation。
- 两个独立公网端点随后一致测得 BoostNet egress=`156.248.15.36`，旧 exact `/32` 下 strict 8022 在 SSH banner 前超时；这证明签发后的第二次 SSH 不能依赖动态 egress。
- 当前仅证明本机 Bridge process=0、clipboard 已覆盖。旧敏感 Edge response 页尚待本人关闭；云 listener、旧 firewall rule、服务器 secret/process/container/volume 和 production zero drift 均保持 `UNVERIFIED`，不得沿用上一窗口的 cleanup PASS。
- bridge/session v5 在 operator READY 前同时建立 credential 和 age 两条 strict no-echo TTY；primary 先发布 PID/start-token/source binding，secondary 验证后等待。1200 秒窗口持续检查两个 SSH 子进程并输出无 secret heartbeat，签发后不再建立网络连接。
- transaction v1 创建 mode-600、7200 秒 lease，绑定 exact clean source、plan SHA-256、双端点 egress、listener、唯一 `/32`、两条 TTY、clipboard、`/dev/shm`、process、container、volume、staging 和 closure。
- pre-commit 审计发现 transaction 初稿的 `authorizeIssuance` 尚未接入 execute。现 execute 强制消费 120 秒内 mode-600 的 exact route evidence，精确核对 listener unit/port/count 和 firewall identity hash/remark/source/direction/protocol/port；协调器只有在 route 有效且恰好一次双 TTY PREARMED 后才输出授权与 READY。
- 二次预提交审计继续发现 detached `authorize` CLI、Bridge 未声明字段/任意状态接收、陈旧或未来 cleanup evidence、lease 嵌套合同不精确和 preflight failure 未统一覆盖 clipboard cleanup 五类缺口；最终审计又发现 allowlist 未强制唯一终态顺序、累计输出/状态数无总上限以及 path `lstat` 后另行 `readFile` 的控制文件稳定性缺口。当前 CLI 只保留 `plan/create/execute/close`；Bridge 只接受 `PREARMED -> READY -> HEARTBEAT* -> CREDENTIAL -> AGE -> PASS`，BLOCKED/PASS 均为终态，两个输出流合计最多 `65,536` bytes、状态最多 `64`；lease/route/cleanup 必须以 canonical current-user mode-600、`O_NOFOLLOW`、最大 1 MiB 且读取前后 identity 不变的方式读取，provisioning plan 保持 exact SHA-256 绑定。cleanup evidence 必须非未来且不超过 120 秒，outer finally 覆盖 preflight。focused bridge/session `22/22`、transaction `10/10`、完整 P0R `124/124` 与 Go helper PASS；精确 Node `22.23.1`、npm `10.9.8`、本机 Go 且 `GOTOOLCHAIN=local` 的当前源码完整 `ci:production` 已从头 PASS：recurrence `11/11`、dispatch `25/25`、V2 Foundation `631 PASS / 6 explicit skips`、V2 Ops `246/246`、Next production build、Golden `16/16` 和 security 均通过。
- 当前 rebind 又识别出一个独立验收缺口：旧实现只保存全部 listener 哈希，无法证明 TCP 8022 为零。request/result 已升级为 v4/v3，强制 `forbiddenListenerPort=8022`、`forbiddenListenerUnit=market-radar-p0r-8022.service`，并分别要求 listener count=0、unit=`not-found/inactive`；任意 active/listening/malformed 状态失败关闭。rebind `13/13`、完整 P0R `125/125` 与 Go helper PASS；当前最终字节完整 `ci:production` 已从头 PASS：recurrence `11/11`、dispatch `25/25`、V2 Foundation `631 PASS / 6 explicit skips`、V2 Ops `247/247`、Next production build、Golden `16/16` 和 security 均通过。
- 后续权威审计发现 route evidence 只有 validator、没有 producer，transaction 测试以任意 64 位字符串冒充 firewall identity。隔离分支新增 route target v1、Tencent firewall capture v1、strict listener observer、authoritative route producer 和 route evidence v2；它绑定 exact Lighthouse instance、API action/version、完整分页 RequestId/FirewallVersion、唯一 `/32` 规则、exact unit/MainPID、一个 IPv4 listener、零 IPv6 listener、strict SSH identity 和 source-bound observer SHA。transaction 会重算 firewall identity 与 listener observation digest，不再接受手填 final hash。
- route target、lease、firewall capture 和 listener observation 现强制 canonical 字节，provisioning plan 保持安全稳定读取与 exact SHA-256 绑定。listener observer 已进入 transport v4，inner package 从 16 members 升为 17 members，rebind 当前 runtime 分母同步加入该脚本。101 条两页分页、官方 ICMP 空 `Port`、协议端口边界、RequestId 唯一性和 SSH identity no-follow/观察前后漂移回归已补齐。route authority/producer/transaction `23/23`、完整 P0R `138/138` 与 Go helper、ESLint、Biome PASS。本机错误默认 Node/npm 运行真实 FAIL 且不计资格；受限 exact-toolchain launcher `3/3` 自动切到锁定版本，全 V2 Ops `263/263` PASS。M0 exact CI binding `6/6` 进一步锁死 launcher、14 项有序生产门禁和 self-building verifier。隔离候选完整 CI 在唯一 V2 实施分支身份门 fail closed，Foundation=`643 total / 636 pass / 6 explicit skip / 1 expected blocker`，不得绕过或称为 full CI PASS；该历史失败保留。候选随后通过污染、安全与 diff 审计，形成 exact commit `157e9a79a635d8f31857481fbd6a51d10df51160` 并精确合入唯一 V2 实施分支。官方分支最终字节完整 `ci:production` 已从头 PASS：recurrence `11/11`、dispatch `25/25`、market `965 PASS / 4 explicit skip`、workers `23/23`、historical `4/4`、Foundation `643 total / 637 PASS / 6 explicit skip`、V2 Ops `263/263`、M0 `12/12`、Next production build、Golden `16/16` 和 security 全部通过。该历史节点的 GitHub 四门、fresh rebind 和真实恢复当时尚未完成；后续状态由下一条记录覆盖。
- 首轮远端安全资格没有被包装成成功：diagnostic commit `8059edf37fd0076b36cb7c57f233525c0d3056f3` 通过有界脱敏 annotation 暴露 CodeQL `js/file-system-race`、route evidence line 112、security severity 7.7；run `30725896115` / job `91437419288` 保持 FAIL。永久修复 `913bae3a2db4d8f172d0de9be87305ad21b53884` 把 public identity 改为先 `O_NOFOLLOW` open、以 descriptor identity 为 authority，再验证 path/realpath 并在读取后复核，新增 open-before-lstat 回归，没有 suppression。当前 route authority `24/24`、P0R `139/139`、V2 Ops `266/266` 和完整本地 CI PASS；同一 source 的 Signed Dispatch `30726178696`、Full Quality `30726178679`、A0 `30726178659`、Independent Security `30726178672` 四门全部 PASS，CodeQL job `91438221977` 无 annotation。GitHub 已推进，生产、腾讯云和 Edge 均未改变。

### 当前真值与下一步

状态是 `ROUTE_AUTHORITY_AND_IDENTITY_RACE_ROOT_REMEDIATION_P0R_139_OF_139_EXACT_MAIN_BRANCH_FULL_CI_AND_CURRENT_SOURCE_GITHUB_FOUR_GATES_PASS / FINAL_EVIDENCE_HEAD_QUALIFICATION_AND_FRESH_REBIND_PENDING / PRODUCTION_UNCHANGED / EXTERNAL_CLOUD_CLEANUP_AND_PRODUCTION_ZERO_DRIFT_UNVERIFIED / NO_USABLE_CREDENTIAL / P0_BLOCKED`。先完成权威资料最终 HEAD 的本地与远端资格，再由代理执行 fresh rebind；旧敏感 Edge 页关闭后由代理自动清理旧腾讯规则。外部全清场前仍禁止新 route、STS、数据库和 COS 动作。

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

### Archived Supporting History / 2026-07-30 Fixed Local TTY Bridge and Proxy-Compatible 8022 Route

#### 本轮目标

根据第三枚真实 STS 在 browser-state recovery 中进入工具输出的直接证据，永久移除 API response 出现后的浏览器状态读取和 OrcaTerm secret entry，改为签发前预先建立的固定本机 TTY bridge。

#### 当前证据

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

#### 当前真值

P0R 仍是 `PRODUCTION_RECOVERY_NOT_EXECUTED / P0_BLOCKED`。现在没有可用 credential；`44e518...` 的四门、rebind 和 package 是真实历史 PASS，但 package 因 bridge schema v2 路由根治失去执行权。当前已完成 8022 预秘密通道验收和 bridge v2 本地全资格，不能冒充 backup、retrieval、restore 或 P0R PASS。旧 browser/OrcaTerm secret 路线和默认 SSH port 22 fallback 均已永久退役。

#### 下一步

形成新的 clean exact commit 并重新取得 GitHub 四门；随后只通过高层 release 入口执行 fresh read-only rebind，再生成全新 run/object key/plan/bundle/staging。所有新 source 资格成立后，复核 8022 bootstrap gate、启动 bridge 并看到 READY，再由用户完成 MFA 和 API Explorer 原生 Copy。只有真实 backup、exact retrieval、独立 PostgreSQL 16 restore、证据封存、secret/container/volume/runtime 清理、8022 listener/云规则清理与生产零漂移全部 PASS，P0R 才能关闭。
