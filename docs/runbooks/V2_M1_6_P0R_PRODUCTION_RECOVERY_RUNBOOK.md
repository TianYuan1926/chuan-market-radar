# V2 M1.6-P0R 生产恢复运行手册

状态：`OBJECT_LOCK_31D_ENABLED_AND_VERIFIED / AGE_IDENTITY_KEYCHAIN_PASS / ORCATERM_PACKAGE_TRANSPORT_RETIRED / B8_AND_B9_R1_HISTORICAL_ONLY / B9_R2_LATE_RESPONSE_INVALIDATED / LOCAL_BRIDGE_ZERO_AND_CLIPBOARD_CLEARED / CLOUD_LISTENER_FIREWALL_SERVER_RESIDUE_AND_PRODUCTION_ZERO_DRIFT_UNVERIFIED / ROUTE_AUTHORITY_PRODUCER_TRANSPORT_V4_P0R_139_OF_139_EXACT_MAIN_BRANCH_FULL_CI_AND_CURRENT_SOURCE_GITHUB_FOUR_GATES_PASS / FINAL_HEAD_QUALIFICATION_FRESH_REBIND_AND_REAL_RECOVERY_PENDING / NO_USABLE_CREDENTIAL / P0_BLOCKED`

## 1. 唯一目标

本手册只执行一次真实的生产 PostgreSQL 只读同快照加密备份、腾讯 COS 精确版本取回和隔离 PostgreSQL 16 恢复验证。它不扩容、不迁移、不启动 Worker、不修改生产服务，也不授权 P1。

正确顺序固定为：

```text
准备私有 COS 与独立密钥保管
-> 隔离并拒绝执行 superseded 历史 staging
-> 完成最终 clean exact HEAD、本地完整门禁和同一 HEAD 的 GitHub 四门
-> 用 signed dispatch 执行 current-source 只读现场重绑定，证明 8022 listener、transient unit 和服务器 P0R residue 为零
-> 用户本人仅确认可能含 response 的旧 Edge 页已关闭
-> 自动删除旧腾讯云规则并证明外部零漂移
-> 从 exact pushed current source 重建 lease、run、plan 与 checksum-bound transport bundle
-> 在签名和发布前证明全部生产 staging 祖先目录的真实路径、owner 与 0700 权限
-> 只通过 signed fixed dispatch 原子投递无 secret、含受限目标元数据的 exact bundle 到 run-bound staging
-> 验证 exact 17 members、mode、owner、hash、外层 staging 清理和生产零漂移
-> 建立绑定 route target 和 observer SHA 的 7200 秒 exact transaction lease、双端点 egress、临时 8022、唯一 `/32` 与 120 秒 route evidence v2
-> 在 STS 签发前预建 credential 和 age 两条 strict no-echo TTY，维持 heartbeat 并由 coordinator 放出唯一 READY
-> 把 native-copied fresh STS 在内存即时编译到 /dev/shm，并从 Keychain 内部注入临时 age identity
-> 执行真实 backup / retrieval / isolated restore
-> 封存脱敏 evidence，按 lease 清理并确认 secret、process、container、volume、staging、listener 与云规则均为零
-> 执行并证明零付费容量驻留重设计
-> 验证完整生产健康
-> fresh P0
-> 只有 fresh P0 PASS 才能请求 P1
```

## 2. 外部前置条件

1. 专用腾讯 COS bucket 已按 `ap-hongkong`、单可用区、私有读写、versioning=`ENABLED`、SSE-COS 创建；精确名称只能从 Git 外 mode-600 事实文件注入，Git 只登记名称摘要 `sha256:85c3b03bfc42eb22e41bd622bbabb3c8a04778c2397af932fd889aa14440fc63`。尚未上传 P0R 对象；上传前仍必须由 helper 重新证明 owner 权限、无公开 bucket policy、region/单 AZ 和 exact key 不存在。
2. Object Lock 白名单现已由腾讯侧开通；用户在动作时明确确认后，Microsoft Edge 已启用并回读默认 `COMPLIANCE` 31 天。该能力不可关闭且 retention 只能延长；对象上传仍必须显式设置并回读 31 天 COMPLIANCE，不能降级成普通可删对象。
3. 唯一对象 key 符合 `market-radar-v2/p0r/<date>/<run-id>.dump.age`，禁止复用旧 key。
4. 腾讯 STS 使用当前 `GetFederationToken` API，固定 `Region=ap-hongkong` 和 7200 秒。Region 必须来自 plan 的 `stsRequest.region`，不得只凭 bucket 所在地域手工补填；必须在签发后 5 分钟内编译，编译时至少剩 6600 秒；COS helper 开始时至少剩 75 分钟。权限必须与 plan 要求的 10 个 action、唯一 bucket/key、源 IP `/32` 和请求条件完全一致。
5. 独立 age X25519 恢复身份已由本手册固定的 macOS Keychain 工具在可信设备生成：官方 darwin/arm64 archive 匹配冻结 SHA-256，私钥只经进程内存写入登录 Keychain，独立推导 recipient 并读回验证；Git 外仅保存 mode-600 recipient 与无私钥 attestation。私钥至少保留到所有绑定对象 retention 到期，生产机只接收 `/dev/shm` 临时副本，执行后自动删除。
6. 用户拒绝付费扩容；真实恢复证据封存后必须进入独立 P0R-D0 零付费容量重设计。该包必须在现有 120 GiB 上用实测增长、WAL/索引上界、Detector 最大 lookback、分区保留和磁盘水位证明稳态不超过 60%、worst-case 不超过 70%，不得减少 eligible 分母、扫描 cadence 或恢复防线。

## 3. 禁止材料

以下内容不得进入 Git、bundle、报告、聊天或持久化 staging：

```text
age private identity
SecretId / SecretKey / session token
.env.production 内容
DATABASE_URL
数据库业务行
原始 pg_dump 明文
COS bucket 名和 object key 出现在公开报告或聊天
```

## 4. 本地构建

### 4.0 生产 staging 祖先权限硬门

任何 `m1-p0r-transport-staging-release.mjs` 的 build、签名、`prepare-publish` 或 `publish` 之前，必须先通过独立只读现场检查，并把结果绑定到本次 run：

- `/home/ubuntu/.cache/market-radar-v2`、`/home/ubuntu/.cache/market-radar-v2/p0r` 和 `/home/ubuntu/.cache/market-radar-v2/p0r/staging` 必须全部存在、不是 symlink、`realpath` 与字面绝对路径逐字相同；
- 三个目录必须全部由当前生产 `ubuntu` 身份拥有，mode 必须精确为 `0700`，不能把 `0755`、group/other 可访问或 owner 漂移当成可自动修复状态；
- exact run target 在首次 staging 前必须不存在，任何 `.incoming-*` 残留也必须为零；
- production HEAD、clean worktree、容器集合、P0R container/volume、timer、PostgreSQL、Redis 和 Web health 必须先形成只读基线；
- 任一目录不安全时，Runner 必须在创建下一级目录前返回 `p0r_transport_stage_directory_unsafe`，不得静默 `chmod`、继续创建 child 或覆盖旧 target；权限修复必须作为边界精确、可回滚、经动作时授权的独立操作；
- OrcaTerm 登录 shell 中禁止直接使用会退出会话的裸 `set -e` 断言；需要 fail-fast 时必须放在独立 child shell，并由外层会话读取有界结果。

release CLI 的 `--branch` 只接受短名称 `production-dispatch`。禁止传入 `refs/heads/production-dispatch`，因为 publisher 会自行派生完整 ref；重复前缀必须在本地或 GitHub 拒绝，不能通过手工改远端 ref 绕过。2026-07-31 首次 fresh publish 曾因错误传入完整 ref 生成无效的嵌套 ref，GitHub 在远端 mutation 前拒绝，原 signed outbox 字节保持不变；纠正为短名称后才允许发布。

Object Lock 白名单和动作时确认均满足后，先在可信 Apple Silicon Mac 下载官方 `age v1.3.1` darwin/arm64 archive，并核对 SHA-256 `01120ea2cbf0463d4c6bd767f99f3271bbed1cdc8a9aa718a76ba1fe4f01998b`。该步骤已执行一次并通过；命令合同保留如下，禁止重复创建身份：

```bash
node scripts/v2/production/m1-production-storage-p0r-age-vault.mjs generate \
  --age-archive /absolute/path/age-v1.3.1-darwin-arm64.tar.gz \
  --attestation-output /absolute/restricted/path/age-vault-attestation.json \
  --keychain-account market-radar-v2-p0r-recovery \
  --keychain-service com.chuan.market-radar.v2.p0r.age \
  --recipient-output /absolute/restricted/path/age-recipient.txt \
  --confirm CREATE_V2_M1_P0R_AGE_IDENTITY_IN_MACOS_KEYCHAIN
```

命令拒绝覆盖已有 Keychain 项或输出，失败会回滚本次新建项；标准输出只含 attestation/recipient digest，不含私钥或 recipient 明文。当前 `PASS_P0R_AGE_IDENTITY_VAULT`、recipient 文件、attestation、Keychain readback 和 700/600 权限均已通过。不得重复运行 generate，也不得把私钥写入 shell 参数、聊天、报告、Git 或普通 staging。

必须先从 clean commit 生成运行级 provisioning plan。`run-id` 默认带 128-bit 随机熵；`source-ip-cidr` 必须是生产宿主公网出口的单个 `/32`：

```bash
npm run v2:m1:p0r:cos-plan -- \
  --app-id '<APPID>' \
  --bucket-base-name market-radar-v2-p0r \
  --source-commit '<clean-HEAD>' \
  --source-ip-cidr '<production-public-ip>/32' \
  --output /absolute/restricted/path/cos-provisioning-plan.json
```

计划不含 secret，但包含 bucket/object 目标元数据，必须 mode 600、限制传播。dirty worktree 只能产生 `LOCAL_TEMPLATE_ONLY`，不得上传执行。生产 bundle 必须额外绑定 plan：

```bash
npm run v2:m1:p0r:bundle -- \
  --age-archive /absolute/path/age-v1.3.1-linux-amd64.tar.gz \
  --age-recipient /absolute/path/age-recipient.txt \
  --cos-provisioning-plan /absolute/restricted/path/cos-provisioning-plan.json \
  --node-binary /absolute/path/to/node-v22.23.1 \
  --npm-binary /absolute/path/to/npm-v10.9.8 \
  --output /absolute/path/p0r-transport.tar.gz
```

验收输出必须为 `PASS_P0R_PRODUCTION_TRANSPORT_BUNDLE`。当前执行 Bundle 的 schema 必须为 `v2-m1-production-storage-p0r-transport.v4`、归档成员必须恰好 17 个、manifest 必须恰好绑定除自身外的 16 个文件，并独立记录 source commit、bundle SHA-256、manifest digest 和 size。新增成员必须包括 `m1-production-storage-p0r-runtime-capsule.mjs`、`p0r-node-runtime.tar` 与 `m1-production-storage-p0r-route-listener-observer.sh`；bindings 必须锁定三者 SHA-256。胶囊 schema 固定为 `v2-m1-production-storage-p0r-node-runtime.v1`，只允许 Node `22.23.1`、npm `10.9.8`、`pg 8.16.3` 的 lockfile 闭包，生产 `node_modules` 不再是前置。历史 transport v1/v2/v3 只允许作为历史证据读取，不得冒充当前执行包。`6a81e865e61569f7d2d7c3bb3be1d78db72a9eab`、`bed938...` 和 source `e83c1f...` 的失败 run 均不再拥有执行权。

source `e83c1f238b19a3495d17f791d0ca5b65a9447734` 的 run `p0r-20260729t193336z-0ec1106cf1a2ee7402b0309cddfa34b0` 已真实完成 STS 与 age identity handoff，但在第一份 backup evidence 产生前 BLOCKED。现场证明容器内 `pg@8.16.3` 存在，而宿主 `/proc/<web-pid>/root/app/node_modules` 不可见；这是 mount namespace 边界，不是依赖缺失。该 run 未读取生产业务行、未产生 backup/COS object/retrieval/restore，staging/evidence、`/dev/shm`、P0R process/container/volume、8022 listener 和腾讯 `/32` 规则均已清理并复核为 0。任何后续执行都必须使用 transport v4 自包含胶囊与 checksum-bound route listener observer，不得恢复宿主机 node_modules 检查、`docker cp` 临时拼依赖或复用该 run。

replacement source `be87cf040472559979f4b6a602350970d9bf2c32` 已取得 Signed Production Dispatch Quality `30494580534`、A0 Release Qualification `30494580517`、Independent Security Quality `30494580551` 和 Full Quality and Materials Gate `30494580577` 四门 PASS；fresh read-only rebind `p0r-rebind-preflight-20260729t220958z-0bc442e3` 也已在生产零漂移边界内 PASS。该 source 生成 run `p0r-20260729t221859z-48eee3208ed0c519e49c2519f05e665e` 的 exact 16-member transport v3，archive SHA-256=`44f5e34fdd2bbdbf94dbc642a3a45b39b6271f9d14e6dc5cb7173d7bddf2aa9b`、size=`9176819`、manifest digest=`sha256:8d6abdbc6ab91d35c2b9bd43269fe37993351094886eb56d194186968812d39b`、plan digest=`sha256:b595256b84ea2db11aba941ff22423e09b315baa8d76e006ff5e3b9ca9b3fd00`，且不含 secret。

该 exact archive 经 OrcaTerm 文件管理器三次受控送达均失败：原路径上传中断、重试保持 `0B/8.8MB`、短可见 Downloads 路径的同 SHA 对照仍失败。805 秒窗口结束后，目标文件和 run-bound staging 均不存在；没有 STS、credential、数据库、COS、session、Runner、recovery 或业务 mutation。`p0r_orcaterm_recovery_bundle_transport` 因而永久退役，重新加载、重试或改名上传都不是允许的修复。B8 只允许使用 `m1-p0r-transport-staging-release.mjs` 经 Ed25519 signed fixed dispatch 发布五成员外包，原子创建 exact 16-member staging；它不得请求或运输 credential、访问数据库/COS、启动 session/Runner/recovery。

B8 outer source `15d7cb3899b5f8c4763390fa0baba8e51aa29d56` 已通过 Signed Production Dispatch Quality `30632789118`、Independent Security Quality `30632789106`、A0 Release Qualification `30632788902` 和 Full Quality and Materials Gate `30632788867`。首次 dispatch `p0r-transport-stage-20260731t131227z-81fcaa2f`、commit `9fac599e9cf107f5cd2469c09fc7b5775810fd58` 在发现 `/home/ubuntu/.cache/market-radar-v2/p0r` mode=`0755` 后返回 `p0r_transport_stage_directory_unsafe`；Runner 没有静默 chmod、没有创建 target，也没有改变生产业务。用户随后只批准把该父目录收紧到 `0700`；owner、真实路径、staging `0700`、target absent、生产 HEAD、clean worktree、11 个容器、PostgreSQL、Redis、Web health、timer 和 P0R runtime=0 均在修复前后保持合同要求。

fresh dispatch `p0r-transport-stage-20260731t143942z-63b1e6f9` 由 signed commit `d5ea6e44797cd88239a474961bfa91cf4bf6ca6d` 成功启动。目标目录已按 exact realpath 验收为 `ubuntu:0700`，恰好 16 个普通文件、零 symlink；manifest SHA-256=`c9e85a91bf09a5fbeafb119517be93805a1f25ad09466c6c9a9a15a58295a318`，逐文件 size/hash/mode/owner 与 transport v3 合同一致，外层 dispatch staging 与 `.incoming-*` 均为零。生产 HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、clean worktree、11-container identity、Web/PostgreSQL/Redis、timer、P0R container/volume 和 `/dev/shm` 继续零漂移。B8 target staging 因而 `PASS`，但真实 backup、exact retrieval、isolated restore、STS 与 recovery 仍未执行；当前入口转为 B9，不得把 transport acceptance 扩写为 P0R PASS。

B9 首次执行随后真实完成 STS 即时编译、Keychain age identity handoff 和 Runner 启动，但在读取生产数据库前的 COS Object Lock control-plane preflight 阻断；没有 backup、COS object、exact retrieval、isolated restore、临时恢复 container/volume 或业务 mutation。根因是旧 v3 plan 把 REST 操作 `GET Bucket ObjectLockConfiguration` 的名称误写成 CAM action `cos:GetBucketObjectLockConfiguration`；腾讯官方 [COS CAM action table](https://intl.cloud.tencent.com/document/product/598/57092?lang=en) 规定真实授权动作为 `cos:GetBucketObjectLock`，而 [REST API](https://cloud.tencent.com/document/product/436/55291) 保留 `GET Bucket ObjectLockConfiguration` 这一操作名。两者不得混用。plan schema 现升级 v4、credential schema 升级 v3、operator bridge 升级 v4；helper 只允许输出固定脱敏 `p0r_cos_*` 阶段码，bridge 只传播 allowlist 内阶段，禁止 Provider 自由文本。旧 `be87...` run、v3 plan、v2 credential、object key 和 B8 staging 只保留历史审计价值，全部失去执行权，不得原地修改或复用。

2026-08-02 的后续两个窗口又在第一条 TTY READY 后分别等待 540 秒超时；后到 native Copy 已作废且未进入 Bridge 或服务器。随后双端点 SOCKS egress 一致变为 `156.248.15.36`，strict 8022 在 banner exchange 超时，证明“签发后再建立第二条 age SSH”仍会受 dynamic egress + exact `/32` 破坏。本机 Bridge 已为 0 且 clipboard 已覆盖；在用户本人关闭可能含响应的 Edge 页并允许控制面自动化恢复前，云 listener、旧规则、服务器 residue 和生产零漂移均保持 `UNVERIFIED`。旧 source/run/route/response 全部失去执行权。

post-acceptance guardrail 已新增“预存祖先目录 `0755`、delivery child 尚不存在”的独立红例，证明 Runner 在创建 child 前失败且不修改 ancestor。transport staging 现为 `11/11`，冻结 Node `22.23.1` 与本机 Go `1.26.3`、`GOTOOLCHAIN=local` 下完整 P0R 111/111 PASS；同一工具链下完整 `ci:production` 以退出码 0 通过，包含 recurrence `11/11`、production dispatch `25/25`、V2 Ops `233/233`、Next production build、Golden `16/16` 和 security。

`m1-production-storage-p0r-transaction.mjs` 是唯一 operator-side 事务入口；它调用 `m1-production-storage-p0r-route-evidence.mjs` 和 `m1-production-storage-p0r-local-tty-bridge.exp`。transaction 必须与 plan 的 exact source commit 同属一个 clean worktree，先让两个公网端点返回同一 global IPv4，再创建 mode-600、7200 秒 exact lease，绑定 plan SHA-256、canonical route target SHA-256、exact Lighthouse provider/instance、observer script SHA-256、run、listener、唯一 `/32`、两条 TTY、clipboard、secret、process、container、volume、staging 和 cleanup。route producer 只能消费由代理保存的 authenticated Tencent API Explorer native response、完整 `DescribeFirewallRules` 分页和 strict SSH listener observation；它必须重算 RequestId/FirewallVersion/rule identity 与 listener observation digest，拒绝手填 final hash、宽 CIDR、多端口、额外 8022 ACCEPT、IPv6 listener、错误 unit/PID 或 stale source。execute 还必须消费 120 秒内、当前用户所有、mode-600、canonical route evidence v2 并再次重算 authority。协调器只接受固定 Bridge status/key allowlist，并且 child 状态只能按 `PREARMED -> READY -> HEARTBEAT* -> CREDENTIAL_HANDOFF -> AGE_HANDOFF -> LOCAL_PASS` 推进；`BLOCKED` 在任一未终结阶段都是终态，乱序、重复或终态后输出全部 fail closed。stdout 与 stderr 累计不超过 `65,536` bytes，状态不超过 `64` 个；内部 `PASS_P0R_ISSUANCE_AUTHORIZED` 不属于 child safe-status 证据。lease、target、capture、listener observation、route 和 cleanup 文件必须为 canonical、当前用户所有、mode-600 普通文件；既有 provisioning plan 不改变序列化格式，但必须以相同安全稳定读取边界和 lease 中的 exact SHA-256 验证。安全敏感路径必须先以 `O_NOFOLLOW` 打开 exact file，再以 descriptor metadata 作为 authority；有界读取最多 `1,048,576` bytes，并在读取后复核 descriptor、path 和 realpath 仍指向同一完整 identity。禁止先依赖 path lstat 再打开文件。只有 route gate 通过且 Bridge 恰好一次报告双 TTY PREARMED 后才内部形成授权并转发 operator READY；不存在 detached authorize 命令。未通过 source/lease/route/双 TTY gate 时不得签发 STS。无论 child 是否启动，outer finally 都清空 clipboard。默认 SSH port 22 永久禁止作为 fallback。

当前 route authority/producer/transaction directed `24/24`、rebind/transport/bundle `30/30`、完整 P0R `139/139`、exact-toolchain launcher `3/3`、全 V2 Ops `266/266` 与 Go helper、ESLint、Biome 均 PASS。一次 host 默认 Node 24/npm 11 运行按 exact runtime gate 失败且不计 PASS；固定入口自动选择 Node `22.23.1` / npm `10.9.8`。M0 exact CI binding `6/6` 锁死外层 launcher、内层 14 项有序生产门禁和 self-building verifier。隔离候选分支身份失败、远端 CodeQL `js/file-system-race` 失败均保留为历史红证据。implementation commit `157e9a79...`、脱敏诊断 commit `8059edf...` 和 descriptor-first remediation commit `913bae3a2db4d8f172d0de9be87305ad21b53884` 形成可追踪修复链；最终修复源码的完整本地 CI 已 PASS，Signed Dispatch `30726178696`、Full Quality `30726178679`、A0 `30726178659`、Independent Security `30726178672` 四门也全部 PASS，CodeQL job `91438221977` 无 annotation 且无 suppression。承载最终权威资料的 HEAD 仍须按同一规则资格化；fresh rebind、external cleanup 和真实恢复尚未完成，不得复用旧 `125/125` 或 transport v3 资格冒充当前执行权。

历史重绑定实现 source parts `408803e0bdc21051124a + 79e307db8e9eb39c793c` 和 source `94118...` 的 PASS 均保留为前序证据。Region 与第四门触发根因修复 source `bd20bd5b73ef0beb41c331aa43c58051ef01d37a` 也已通过 GitHub Full Quality `30273183761`、Signed Dispatch `30273183650`、Independent Security `30273183504` 与 A0 Qualification `30273183454`；fresh read-only dispatch `p0r-rebind-preflight-20260728t110438z-b2815255` 返回 `PASS_P0R_READ_ONLY_REBIND_PREFLIGHT` 且生产零漂移。这些均是真实历史证据，但 `bd20...` 的 bundle 不含当前固定 atomic session helper，旧 secret 路线又被第二次真实 STS 失败证伪，因此它已失去执行权。后续 plan、bundle、STS 和 recovery 必须绑定 replacement clean exact source；不得退回 `bd20...` 或更早 source。

### 4.1 只读现场重绑定

只读重绑定必须通过 `v2:m1:p0r:rebind-bundle` 从 clean、已推送的 exact commit 构建，并且只允许由 `v2:m1:p0r:rebind-release` 通过固定 Ed25519 signed dispatch 通道发布。当前 request schema 必须为 `market-radar-v2-m1-p0r-rebind-request.v4`，result schema 必须为 `market-radar-v2-m1-p0r-rebind-result.v3`；request 必须显式绑定 `dispatchRuntimeMaxSeconds=90`、`forbiddenListenerPort=8022` 和 `forbiddenListenerUnit=market-radar-p0r-8022.service`，release 入口必须从 canonical request 派生 source、ref、approval window、runner、staging、success marker 和 runtime，禁止操作员重复填写或覆盖。历史 transport v1 的替代比较集固定为当时已经存在的三个安全文件，当前 source 资格集则必须完整绑定 transport v4 的九个运行源码文件，尤其包括 runner、atomic session helper、runtime capsule helper 与 route listener observer；两者不得混为同一分母。它只能：

- 核对生产 HEAD、clean worktree、完整容器身份、timer、listener 和 health，并明确证明 TCP 8022 监听数量为 0；
- 证明 `market-radar-p0r-8022.service` 同时为 `LoadState=not-found`、`ActiveState=inactive`，不得用“全部 listener 哈希前后相同”替代精确零残留；
- 证明 `/dev/shm` 无 P0R 临时 secret，且无 P0R container/volume；
- 从腾讯实例 metadata 在内存读取公网 IPv4，只保留 `<IP>/32` 摘要并与历史 plan 绑定值比较；
- 校验历史 staging 的每个成员、manifest、plan、bindings 和摘要；
- 证明历史三个安全文件已被当前源码替代，同时保存当前九文件 P0R 运行集的精确摘要；
- 在 fixed dispatch evidence 根写入不可覆盖的脱敏结果，并清理自身精确 staging。

它不得读取或输出 raw credential、bucket、object key、env、数据库业务行，也不得修改应用、数据库、Redis、Worker、生产仓库、COS 或历史 staging。任何九文件当前运行摘要缺失、历史三文件比较摘要缺失或两组 key 漂移都必须失败关闭。唯一成功状态是 `PASS_P0R_READ_ONLY_REBIND_PREFLIGHT`；历史 staging 仍必须同时记录为 `REJECTED_SUPERSEDED_SECURITY_SOURCE`。

首次 signed rebind dispatch 已在目标机被确认从未执行。生产固定派发代理曾因 Git child 超过 systemd 180 秒时限被终止，并遗留无 owner 的空锁；后续 4,526 次轮询均被旧锁拒绝。source parts `2b4fccc9f3affe613d4f + 0da0f97295d97b0c6452` 已将 Git child 固定为 90 秒硬上限，并加入 owner-aware、四分钟 stale 下限的锁恢复。腾讯生产验收通过后，旧 dispatch 被记录为 `FAIL_DISPATCH_NOT_REUSABLE / dispatch_not_current`，没有 claim、解包或业务 Runner，应用与 11 容器零漂移。该旧 dispatch 已消费且禁止复用；其“必须 fresh redispatch”结论已由 `p0r-rebind-preflight-20260728t110438z-b2815255` 的 current-source PASS 正式关闭。

source `e3626387ee8d57ef8e4f9c11c2e098b781ac6fbe` 曾完整通过本地 CI、GitHub 四门和 fresh read-only rebind `p0r-rebind-preflight-20260728t222400z-e994dde2`；生产 HEAD、11 个容器和应用真值均保持不变。但随后绑定 run `p0r-20260728t222552z-299113ff2921579d305df1e295e51914` 的 STS 响应在浏览器状态恢复时被披露，因此该 run、plan、object key、bundle 和 staging 全部失去执行权。它们只可作为事故证据保留，必须由新的 clean source、新 run、新 plan、新 object key 和新 bundle 替代，禁止向旧 run 重新签发 credential。

## 5. 临时凭证合同

不得手工编 credential JSON。必须在腾讯 API Explorer 中逐字使用 plan 的 `stsRequest`，包括 `Region=ap-hongkong`；API policy 不含 `principal`，由源 IP、HTTPS、TLS、private ACL、Content-Type、COMPLIANCE retention 和唯一 resource 约束。

既往短期 STS 均不得复用。2026-07-23 现场只读 inventory 未发现可用 credential 文件；名为 `/dev/shm/p0r-sts` 的旧占位文件为 0 字节，同目录另有 15 个旧辅助脚本或 base64 中间文件。用户在动作时确认后，这 16 个精确路径已全部删除；随后 `find /dev/shm -maxdepth 1 -type f -print` 返回空，诊断临时文件也已确认不存在。历史 run `p0r-20260727t142908z-03d9dbeef09a8b47290dd5638115449f` 的 exact v3 plan/bundle 已在受限 staging 通过外层 bundle SHA-256、13 个合同成员、权限、所有者、run-id、plan digest 与 runner plan-mode 复核；该结果只保留为历史 staging 证据，不能用于下一次执行。

2026-07-28 用户完成本人 MFA 后，API Explorer 成功返回一枚 exact 7200 秒 STS；但预期的 OrcaTerm `tee` 接收器实际未运行，原始响应被粘贴到交互式 shell 并回显。该凭证立即定级为 `COMPROMISED_FORBIDDEN_UNTIL_EXPIRED`，过期时间 `2026-07-28T18:55:30Z`，不得编译或用于任何 COS/P0R 动作。独立新会话核验得到：`/dev/shm` P0R raw/credential 文件数 0、P0R `tee` 进程不存在、持久 shell history 敏感字段计数 0；没有数据库读取、COS 对象、backup、retrieval 或 restore。只有确认该凭证过期并取得新的动作时确认后，才允许重新签发。

随后在同一真实腾讯宿主机完成不含 secret 的双会话 canary。receiver 的 exact `tee` 先由 verifier 独立证明唯一 PID、完整路径、owner=`ubuntu`、mode=`600`、size=`0`；写入 32 字节固定 canary 并发送 EOF 后，verifier 又证明 `tee` 已退出、文件仍为 `ubuntu:600`、size=`32`、内容逐字匹配，最后精确删除并证明路径不存在。演练同时发现 OrcaTerm 快捷命令编辑器会对较长复合命令从开头静默截断：198 字节清理命令完整执行，而约 300 字节的复合检查丢失开头。该结果只证明接收机制和长度风险，不证明真实 STS 已安全接收、编译或使用。

后续只读 staging 复核又直接捕获到第二种输入完整性风险：在上一条命令执行后立即连续写入时，一条仅 94 字节的 `find` 命令也曾丢失开头的 `find`。执行前 exact visible preview 拒绝了该命令，因此它没有运行；清空 editor、等待至少 1,000 毫秒、重新写入、再次等待至少 1,000 毫秒并逐字比较完整可见值后，同一命令才被允许执行。由此，`<=200` 字节只是必要条件，不再被当作完整性证明。

第二枚 exact 7200 秒 STS 的 exact expiry 为 `2026-07-28T20:57:29Z`。Edge 后台睡眠曾使 OrcaTerm receiver 失活；已在 Edge 站点例外中固定 `orcaterm.cloud.tencent.com` 保持活动。API response 页的复制与导航状态仍不可靠，曾依赖进程内 AX 状态恢复响应；该恢复路径不得再次用于 credential。响应最终进入真实 receiver 后，编译器按真实时钟发现已经超过签发后 5 分钟，并正确返回 `STS response was not compiled immediately after issuance`。没有使用 `--now` 伪造时钟，也没有继续 COS、数据库、backup、retrieval 或 restore。

编译器删除 raw path 后，独立现场核验仍发现 PID `1175383` 的旧 `tee` 持有已经 unlink 的同一路径并等待输入。该 PID 已核对为本 run 的唯一 P0R receiver 后精确终止；随后两次独立命令分别证明 `/dev/shm/market-radar-v2-p0r-*` 文件为零、P0R 进程为零。本机 clipboard 已由固定无敏感文本覆盖，Node 会话已整体 reset。第二枚 credential 的 exact expiry `2026-07-28T20:57:29Z` 已由本机 UTC `2026-07-28T20:57:48Z` 与腾讯 STS HTTPS Date `2026-07-28T20:57:56Z` 双重证明超过，现为 `EXPIRED_FORBIDDEN_REUSE`，永久不得复用。

2026-07-29，source `e362...`、新 run、v3 plan、transport-v2 bundle、GitHub 四门与 fresh read-only rebind 均已通过后，用户完成本人 MFA，腾讯 API Explorer 成功返回第三枚 exact 7200 秒 STS。随后为了恢复浏览器上下文而读取页面状态时，完整响应进入了工具输出。该 credential 立即定级为 `COMPROMISED_FORBIDDEN_UNTIL_EXPIRED`，exact expiry 为 `2026-07-29T06:09:17Z`，永久禁止用于 P0R；它从未进入服务器、从未编译、从未访问 COS，也没有发生数据库 backup、retrieval 或 restore。

事故后 API 页被替换为空白页，本机 clipboard 被固定无敏感值覆盖，secret-bearing browser/Node context 被销毁；生产通过四条独立只读命令证明 `/dev/shm` P0R 文件、P0R session/provisioning 进程、P0R container 和 P0R volume 全部为零。生产应用、数据库、Redis、仓库、env、migration、authority 和 11 个既有容器均未改变。direct SSH read-only probe 随后返回 PASS，证明可以在签发前建立不依赖 OrcaTerm 或响应后浏览器状态恢复的固定 TTY 通道。

### 5.1 固定本机 TTY bridge 与远端无回显内存入口

裸 `tee` receiver、raw `.sts-response.json`、manual `compile-credentials`、AX response reconstruction、response-after browser state read、OrcaTerm secret entry、terminal direct typing、多条手工变量命令和 `docker compose --env-file ... ps` 全部退役。原因分别是 secret 回显或残留、5 分钟即时编译窗口丢失、浏览器与 UI 状态不权威、标点丢失、命令前缀漂移和 `.env.production` 无法独立重建当前 Compose 插值环境。

新 bundle 必须包含 checksum-bound `m1-production-storage-p0r-session.sh`。它只允许：

- 通过 exact Compose project=`chuan-market-radar` 与 service label 定位唯一运行中 Web/PostgreSQL 容器，不重新渲染 Compose，不读取或输出 env；
- 在交互 TTY 上先关闭 echo，只有 echo 已关闭后才输出 exact READY marker，再由 Web 容器内已验证 Node 从 stdin 有界读取 STS response；
- 直接在内存解析、校验并即时编译 credential，原始响应不写任何文件；
- 以 exclusive create、root owner、mode 600 写入 exact `/dev/shm/...cos-credentials.json`；
- 等待第二个独立会话通过同一 no-echo 入口以 root owner、mode 600 写入唯一 age X25519 identity；session-ready 则必须精确属于当前 operator；
- age identity 必须严格匹配 `AGE-SECRET-KEY-1` 加 58 个 age Bech32 字符；宽泛大写字符串、错误 alphabet、错误长度或多身份输入必须在写入前失败关闭；
- Runner 的数据库连接描述与 canary 只能进入 `mktemp -d` 创建、owner-bound、mode 700 的独立 `/dev/shm` 私有目录；内部文本必须 exclusive mode 600 创建，禁止 `tee`、可预测公共路径或覆盖已有文件，成功与失败均须删除并验证目录不存在；
- evidence output 目录必须在确认路径不存在后由单次原子 `mkdir --mode=700` 创建，并验证 owner、mode 及非 symlink；禁止复用旧 evidence 目录或覆盖同 run-id 证据；
- 第二会话必须用 PID、Linux process-start token 和 source commit 三重绑定第一会话，拒绝 PID 复用、陈旧 ready 文件或 source 漂移；
- 两项 secret 到齐后自动启动 checksum-bound Runner；
- 任一会话超时、断线、验证失败或 Runner 退出都立即清除整组 exact credential、identity 与 session-ready 文件；
- Runner 成功后必须同步删除 credential、identity 与 session-ready，并逐项证明路径和断裂符号链接均不存在，清理未证明时不得成功退出。

`p0r-bindings.env` 不得再由 Shell `source`。session helper 必须把它当普通数据逐项解析，只接受 14 个精确白名单键、一个 40 位 source commit 和 13 个 64 位 SHA-256；其中 runtime capsule 与 capsule helper 必须分别绑定摘要。重复、缺失、额外、非法值或任一 source checksum 不一致均失败关闭。credential ingress CLI 不接受 caller-supplied `--now`，即时编译门禁只能使用进程真实时钟。

可信 Mac 上必须先运行 `m1-production-storage-p0r-local-tty-bridge.exp`。它只允许：

- 从 mode-600、当前用户拥有、非 symlink 的 exact plan 读取 run-id/source commit，并要求本地 Git HEAD 完全一致且 worktree clean；
- 固定并验证 `/Users/chuan/.nvm/versions/node/v22.23.1/bin/node`，拒绝 PATH 或 Node 版本漂移；
- 固定目标 IP、ubuntu 用户、SSH port 8022、`HostKeyAlias=43.161.202.227`、SSH identity、known_hosts、ed25519 host key、loopback SOCKS proxy、BatchMode 和两个由 run-id 派生的远端命令；execute 模式不接受任意 host、port、host alias、remote command、secret 或 Keychain 名称；
- 在 API 请求前依次建立 credential 与 age 两条 SSH TTY；primary 必须先创建 PID/start-token/source binding，secondary 必须验证该 binding，两条都收到 no-echo READY 后才开放 native-copy 窗口；
- 把 clipboard 先设为 run-bound sentinel，只接受结构精确、大小有界的腾讯响应 JSON；在远端 handoff 前立即覆盖 clipboard；
- response 出现后不调用 screenshot、OCR、AX、browser state、computer-use 或 OrcaTerm；
- 在 credential compile PASS 后使用已经预建的第二条 TTY，从固定 macOS Keychain service/account 内部读取 exact age identity，不把 identity 放入参数、日志或 clipboard，也不建立任何新网络连接；
- native-copy 等待窗口为 1200 秒；期间必须持续证明两个 SSH 子进程存活并输出有界无 secret heartbeat，任一会话退出立即失败关闭；
- 全程抑制 child output，只输出 bridge 自己的无 secret 状态；任一 marker、SSH、clipboard、JSON、Keychain、remote exit 或 timeout 异常都断开 TTY、触发远端 cleanup 并失败关闭；
- 无论成功或失败都再次覆盖 clipboard；只有远端 `PASS_P0R_RECOVERY_DRILL`、两个 SSH clean exit 和最终 clipboard clear 同时成立，bridge 才返回 PASS。

bridge/session schema v5 与 transaction schema v1 的 8022 路由在签发 STS 前还必须独立满足以下 bootstrap gate；它们继承固定端口和严格主机身份，并只允许有界 `p0r_session_line_N`、`p0r_runner_line_N` 或 allowlisted `p0r_cos_*` 失败阶段离开远端：

- 在任何 listener 或云规则变更前，Microsoft Edge 必须已经打开本轮 exact plan 对应的 API Explorer，请求字段已逐项核对且停在未发起调用状态，用户本人明确在线并准备立即完成 MFA、发起调用和页面原生 Copy。用户未明确在线时不得继续；未满足时停止，不得提前消耗 8022、`/32` 或 bridge clipboard window；准备页面不授权在 bridge READY 前签发 STS；
- 通过两个独立公网端点重新测量当前 loopback SOCKS 出口 IPv4；两者必须一致，且在创建云规则前和启动 transaction 前各复核一次。禁止复用任何历史来源地址；
- 在动作时确认后，仅启动一个 `RuntimeMaxSec=7200` 的独立 transient sshd：`PermitRootLogin=no`、`PasswordAuthentication=no`、`KbdInteractiveAuthentication=no`、`PubkeyAuthentication=yes`、`AuthenticationMethods=publickey`、`AllowUsers=ubuntu`、`DisableForwarding=yes`；
- 先证明 transient unit 为 active 且 8022 仅由该独立 sshd 监听，再在腾讯轻量云添加唯一 `TCP 8022 / ALLOW / 当前 SOCKS 出口 /32` 规则；不得放通 `0.0.0.0/0`；
- 由 authoritative producer 生成不含 secret 的 mode-600 canonical route evidence v2：腾讯 capture 必须带 exact provider/instance/action/version、完整分页、RequestId、FirewallVersion、唯一 exact `/32` TCP 8022 ACCEPT rule；strict SSH observer 必须证明 exact unit loaded/active/running、MainPID、一个 IPv4 listener、零 IPv6 listener、sshd PID、known_hosts/public-key 和 source-bound observer SHA。producer 与 transaction 分别重算 firewall identity 和 listener digest；任一 source 超过 120 秒或任一字段漂移时自动失效并重新清场，禁止手改 final JSON、时间或 hash；
- 使用 `StrictHostKeyChecking=yes`、原 mode-600 known_hosts、ed25519 host key 和 `HostKeyAlias=43.161.202.227` 完成真实 `ubuntu` 身份握手；握手失败必须立即停止 transient unit、删除精确云防火墙规则并验证二者均不存在；
- 只有 bootstrap gate、当前 exact source 的本地最终字节 CI、GitHub 四门、fresh read-only rebind、全新 lease/run/plan/bundle 和 staging acceptance 同时通过，transaction 才可以启动；只有两条 TTY 都 PREARMED 后才可输出 operator READY；
- P0R 成功、失败、取消或超时后，都必须停止 transient unit、删除精确 8022 云防火墙规则，并分别验证 listener、unit 和规则均不存在。systemd 自动超时不能代替云防火墙清理。

### 5.2 下一次 exact 执行顺序

固定顺序如下：

1. `COMPLETED_EXPIRY_PREREQUISITE`：第三枚 STS exact expiry=`2026-07-29T06:09:17Z`；本机 UTC `2026-07-29T10:32:53Z` 与腾讯 HTTPS Date `2026-07-29T10:35:42Z` 已独立证明超过到期点。它现为 `EXPIRED_FORBIDDEN_REUSE`，且永不恢复旧 run 的执行权。
2. `HISTORICAL_B8_TARGET_ACCEPTANCE_ONLY`：source `be87cf...` 的四条 GitHub 门、fresh rebind、16-member transport 和 B8 target acceptance 都是真实历史 PASS；但绑定 v3 plan 的 B9 执行已证明 Object Lock CAM action 错误，因此旧 run、plan、credential contract、object key 和 staging 没有当前执行权。OrcaTerm 文件管理器仍永久退役。
3. `B9_R2_ROOT_REMEDIATION_QUALIFIED_SOURCE`：plan v4、credential v3、bridge/session v5、transaction v1、官方 `cos:GetBucketObjectLock`、固定脱敏 COS reason code、旧合同拒绝、route authority producer 和 descriptor-first identity reader 已通过完整本地质量门；remediation source `913bae3a...` 的 GitHub 四门也已 PASS。旧 plan、旧 digest、旧 object key 和旧 route identity 继续禁止复用。
4. `FINAL_HEAD_QUALIFICATION_AND_FRESH_REBIND`：承载本轮权威资料的最终 clean HEAD 必须通过完整本地门禁和同一 HEAD 的 GitHub 四门；随后由代理执行 fresh production read-only rebind，明确证明 8022 listener=0、unit=`not-found/inactive`、server residue=0，再生成新 run/object key/v4 plan/transport，并用 fixed dispatch 创建新的 no-clobber staging 与独立 target acceptance。任何一项缺失都停止在 STS 之前。该步骤不读取或操纵敏感 Edge 页面，也不允许提前创建 listener、云规则、STS、数据库或 COS 动作。
5. `CORRECTED_B9_EXACT_STAGED_RECOVERY_EXECUTION`：先确认旧敏感响应页由用户本人关闭，再自动删除并验证旧 listener/rule/server residue 和 production zero drift。生成全新 route target、run、plan 和 transport v4，把 exact API Explorer 请求页准备到只差用户 MFA、发起调用和页面原生 Copy；随后创建绑定 target/observer SHA 的 transaction lease，按 lease 启动 7200 秒受限 8022 sshd、添加当前 SOCKS egress `/32` 云规则，由代理自动保存 authenticated `DescribeFirewallRules` native response，复核双端点未漂移并通过 producer 生成 120 秒有效的 route evidence v2。可信 Mac 只能由 transaction v1 启动 bridge/session v5；只有稳定 no-follow 控制文件读取、provider与server双权威 route evidence、唯一 listener/rule、credential 与 age 两条 exact remote TTY、一次 PREARMED 和唯一合法状态机前缀全部通过，协调器才输出 `PASS_P0R_ISSUANCE_AUTHORIZED` 与 `READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE`，随后才允许发起 API 调用。
6. Microsoft Edge 中只执行新 v4 plan 的 exact `GetFederationToken`，由用户完成本人 MFA，并点击 API Explorer 的页面原生 Copy。response 出现后任何自动化都不得读取页面状态、截图、OCR、AX tree 或切换到 OrcaTerm；native Copy 无法完成时立即停止。
7. bridge 只接受结构精确且有界的 clipboard JSON，语义无损紧凑化后先清空 clipboard，再经已握手的 no-echo TTY 发送 newline + EOT。helper 必须在签发后 5 分钟内返回 compile PASS；否则自动清理并停止。
8. bridge 在 compile PASS 后通过已预建的第二条 TTY，从固定 Keychain 项内部读取 age identity 并完成 no-echo handoff；identity 不进入 shell 参数、clipboard、日志或工具输出，且此阶段禁止任何网络 reconnect。credential compile 已确认后，用户关闭 API response 页。
9. 第一 helper 自动接管 identity、启动 Runner 并执行 COS preflight、只读加密 backup、exact version retrieval、隔离 PG16 restore、证据封存、容器/volume/runtime/secret 清理和零漂移复核。COS preflight 任一阶段失败时只能输出对应的固定 `p0r_cos_*` code 并停止在数据库读取之前。
10. transaction 只有在 child 完整状态序列、`PASS_P0R_RECOVERY_DRILL`、secondary/primary SSH clean exit、累计输出/状态上限和最终 clipboard clear 同时成立时才接受 Bridge PASS；它仍只可标记 `BRIDGE_PASS_CLEANUP_STILL_REQUIRED`。
11. 无论成功或失败，独立只读验证仍须再次证明 Bridge、clipboard、P0R `/dev/shm`、session/provisioning 进程、临时 container/volume/runtime、run staging、listener、unit 和唯一云规则全部归零。cleanup evidence 必须为当前用户所有、mode-600、时间不在未来且生成后不超过 120 秒，并通过 transaction `close` 才可标记 `CLOSED_ZERO_TEMPORARY_RESIDUE`；TTL 自动到期不能替代该证明。

唯一允许的本机 orchestration 入口如下；`<plan>`、`<route-target>`、`<lease>`、`<firewall-capture>`、`<listener-observation>`、`<route-evidence>`、`<result>`、`<cleanup-evidence>` 与 `<closure>` 均位于 Git 外 mode-600 受限目录，命令本身不含 secret。`<route-target>` 与 `<firewall-capture>` 由代理从 fresh exact instance inventory 和 authenticated Tencent native response 形成，严禁要求用户手写：

```bash
node scripts/v2/production/m1-production-storage-p0r-transaction.mjs create --plan <plan> --route-target <route-target> --output <lease>
node scripts/v2/production/m1-production-storage-p0r-route-evidence.mjs observe-listener --lease <lease> --route-target <route-target> --output <listener-observation>
node scripts/v2/production/m1-production-storage-p0r-route-evidence.mjs produce --plan <plan> --lease <lease> --route-target <route-target> --firewall-capture <firewall-capture> --listener-observation <listener-observation> --output <route-evidence>
node scripts/v2/production/m1-production-storage-p0r-transaction.mjs execute --plan <plan> --lease <lease> --route-evidence <route-evidence> --result <result>
node scripts/v2/production/m1-production-storage-p0r-transaction.mjs close --lease <lease> --evidence <cleanup-evidence> --output <closure>
```

bridge 返回 READY 前禁止请求 STS。bridge 返回 READY 后，只允许 API Explorer 原生 Copy 这一项浏览器动作。secret 可见期间禁止截图、屏幕录制、AX/OCR、browser state read、日志、回显或 OrcaTerm secret 输入。

原始 STS response 不落盘。credential file 是 mode 600 的单一 JSON 对象，schema 为 v3，除临时三元组外还绑定运行计划与签发证据：

```json
{
  "expiresAt": "YYYY-MM-DDTHH:mm:ss.000Z",
  "grant": {
    "actions": [
      "cos:GetBucketACL",
      "cos:GetBucketObjectLock",
      "cos:GetBucketPolicy",
      "cos:GetBucketVersioning",
      "cos:GetObject",
      "cos:GetObjectACL",
      "cos:GetObjectRetention",
      "cos:HeadBucket",
      "cos:HeadObject",
      "cos:PutObject"
    ],
    "bucket": "<private-bucket-appid>",
    "objectKey": "market-radar-v2/p0r/<date>/<run-id>.dump.age",
    "region": "ap-hongkong",
    "runId": "<run-id>",
    "sourceIpCidr": "<production-public-ip>/32"
  },
  "issuance": {
    "durationSeconds": 7200,
    "method": "TENCENT_STS_GET_FEDERATION_TOKEN",
    "planDigest": "sha256:<hex>",
    "policyDigest": "sha256:<hex>",
    "requestDigest": "sha256:<hex>",
    "requestId": "<tencent-request-uuid>"
  },
  "issuedAt": "YYYY-MM-DDTHH:mm:ss.000Z",
  "schemaVersion": "v2-m1-production-storage-cos-temporary-credentials.v3",
  "secretId": "<temporary-secret-id>",
  "secretKey": "<temporary-secret-key>",
  "sessionToken": "<temporary-session-token>"
}
```

plan/request/policy digest 与 RequestId 证明本次工具使用的申请材料和腾讯响应身份，但不能从 token 内部反解服务端 policy。无法在 API Explorer 核对实际请求参数时停止，不得仅凭 credential 声明通过。

注意：腾讯官方 `PUT Object` 文档明确写明 versioning 开启后 `x-cos-forbid-overwrite` 不生效。它仍必须携带，但不得称为防覆盖。helper 会先 HEAD 唯一高熵 key，只有 404 才上传；发现已有对象立即停止，成功后只按腾讯返回的 exact versionId 进行 ACL、retention、HEAD 和 GET 验证。

## 6. 生产 staging

读取 provisioning plan 中已经生成的 `credentialGrant.runId`；禁止另选、缩写或重建 `run-id`。所有路径必须与该值逐字一致：

```text
source: /home/ubuntu/.cache/market-radar-v2/p0r/staging/<run-id>
evidence: /home/ubuntu/.cache/market-radar-v2/p0r/evidence/<run-id>
COS credential: /dev/shm/market-radar-v2-p0r-<run-id>.cos-credentials.json
age identity: /dev/shm/market-radar-v2-p0r-<run-id>.age-identity.txt
```

staging/evidence 根目录和 source 目录必须是实际目录，不得是 symlink。解包后必须核验 transport bundle SHA-256、manifest、所有 file checksum 和 source commit。P0R package transport 只允许由 `m1-p0r-transport-staging-release.mjs` 通过 signed fixed dispatch 完成；OrcaTerm 文件管理器、浏览器上传、改名重试和人工复制均永久禁止。外包必须恰好五个成员，并在 run-bound `.incoming-*` 内验证 exact 17 members 后 no-clobber 原子 rename；最终必须复核 mode、owner、bytes、hash、外层 staging 清理和生产零漂移。credential response 与 age identity 只可经固定 TTY bridge 进入远端 session 的 stdin，并由 session 独占写入 exact `/dev/shm`。不得把两项 secret 当文件上传，不得同步源码仓库或生产 env。bundle 无 secret，但含受限 COS 目标元数据；目标 staging 只有通过独立 acceptance 后才可供后续 session 使用。

2026-07-23 只读 inventory 最初发现两个 staging run；较早副本已在动作时确认后精确删除。剩余 `bed938...` staging 的成员和摘要仍作为历史审计材料保留，但不再是执行入口。只读重绑定通过前不得删除它；重绑定 PASS 后也只能在新的 current-source plan、bundle 和回滚证据全部绑定后，以独立精确清理动作删除，不能覆盖、修改或复用。

## 7. 执行

只有只读重绑定、current-source plan/bundle 和 fresh secret 边界全部 PASS 后，才允许对新 source 执行计划模式并保存脱敏输出：

```bash
bash <source>/m1-production-storage-p0r-runner.sh plan
```

生产执行不得再手工 `source p0r-bindings.env`、设置变量、进入 OrcaTerm secret session 或直接调用 Runner。local TTY bridge 只能启动两个固定远端 session；`m1-production-storage-p0r-session.sh` 会把 binding 文件作为普通数据解析、验证精确白名单与 checksum，并在两项 secret 都通过后自动提供以下运行合同：

```text
P0R_SOURCE_DIRECTORY
P0R_SOURCE_COMMIT
P0R_PRODUCTION_WORKTREE=/home/ubuntu/apps/chuan-market-radar
P0R_PRODUCTION_ENV_FILE=/home/ubuntu/apps/chuan-market-radar/.env.production
P0R_OUTPUT_DIRECTORY
P0R_RUN_ID
P0R_COS_CREDENTIAL_FILE
P0R_AGE_IDENTITY_FILE
CONFIRM_P0R_RECOVERY_DRILL=EXECUTE_V2_M1_P0R_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE
```

不得手抄 checksum，不得修改 runner，不得把 secret 作为命令行参数，也不得绕过 session helper 直接执行生产模式。最终唯一成功状态是 `PASS_P0R_RECOVERY_DRILL`。

## 8. PASS 证据

PASS 必须同时具备：

- 同一 `REPEATABLE READ READ ONLY` snapshot 的 source fingerprint 与加密 backup。
- 明文 dump 从未落盘；密文离机前已 age X25519 加密。
- bucket/object owner-only ACL、无公开 policy、versioning、COMPLIANCE retention、AES256 SSE。
- bucket region=`ap-hongkong` 且 HEAD Bucket 未返回 multi-AZ 标记；provisioning plan、STS policy/request 与 run-id 摘要一致。
- 上传前 exact key 确认为不存在；防碰撞结论明确是高熵唯一 key + absence check，不是无效的 versioning overwrite header。
- exact object version 的 HEAD、GET、bytes 和 SHA-256 一致。
- `network none`、无 host port、无生产 network/volume/credential 的 PG16 restore。
- source/restore structural digest 与 verification digest 一致。
- 单次源快照到远端取回验证 `<=15m`，隔离恢复 `<=60m`；不得宣称持续 RPO/PITR 已通过。
- 临时 COS credential、生产机 age identity、副本、container、volume 和 runtime 全部删除。
- Docker baseline、生产 Git HEAD/worktree、数据库和服务零 mutation。

任一项失败都保持 `BLOCKED`。失败后优先确认临时 secret 和隔离资源清理，不得继续 P0R-D0 或 P1。

## 9. 零付费容量重设计与重验

只有恢复证据封存且离机对象与保险库私钥均可用后，才允许实施独立 P0R-D0。P0R-D0 只重划生产在线工作集、长期研究数据和离机恢复职责，不得降低全市场覆盖、实时 Fact 质量、Detector lookback 或安全门禁。应用后按 P0R 合同验证 filesystem 增长、水位、Docker、PostgreSQL、Redis、应用 health、Git 身份，再完整重跑 fresh P0。

P0R PASS 不是 P1 PASS。只有 fresh P0 同时确认容量、恢复证据、旧 Fact=0、schema 状态和零漂移，才允许单独申请 P1 Add Schema。
