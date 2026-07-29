# V2 M1.6-P0R 生产恢复运行手册

状态：`OBJECT_LOCK_31D_ENABLED_AND_VERIFIED / AGE_IDENTITY_KEYCHAIN_PASS / LEGACY_BED938_STAGING_REJECTED_SUPERSEDED_SECURITY_SOURCE / E362_REMOTE_GATES_AND_READ_ONLY_REBIND_HISTORICAL_PASS / E362_RUN_PLAN_BUNDLE_INVALIDATED_BY_POST_RESPONSE_DISCLOSURE / FIRST_SECOND_AND_THIRD_STS_EXPIRED_FORBIDDEN_REUSE / THIRD_STS_DUAL_CLOCK_EXPIRY_PROOF_PASS / PROD_P0R_FILES_PROCESSES_CONTAINERS_VOLUMES_ZERO_VERIFIED / LOCAL_FIXED_TTY_BRIDGE_FULL_QUALIFICATION_PASS / NEW_EXACT_COMMIT_REMOTE_REBIND_AND_PRODUCTION_RECOVERY_PENDING / NO_USABLE_CREDENTIAL / PRODUCTION_RECOVERY_NOT_EXECUTED / P0_BLOCKED`

## 1. 唯一目标

本手册只执行一次真实的生产 PostgreSQL 只读同快照加密备份、腾讯 COS 精确版本取回和隔离 PostgreSQL 16 恢复验证。它不扩容、不迁移、不启动 Worker、不修改生产服务，也不授权 P1。

正确顺序固定为：

```text
准备私有 COS 与独立密钥保管
-> 隔离并拒绝执行 superseded 历史 staging
-> 用 signed dispatch 执行 current-source 只读现场重绑定
-> 从 exact pushed current source 重建 plan 与 checksum-bound transport bundle
-> 上传无 secret、含受限目标元数据的 bundle
-> 预先启动固定本机 TTY bridge，在 exact remote no-echo marker 后把 native-copied fresh STS 在内存即时编译到 /dev/shm，并从 Keychain 内部注入临时 age identity
-> 执行真实 backup / retrieval / isolated restore
-> 封存脱敏 evidence，确认临时 secret 与容器/volume 已清理
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
  --output /absolute/path/p0r-transport.tar.gz
```

验收输出必须为 `PASS_P0R_PRODUCTION_TRANSPORT_BUNDLE`，新原子会话 Bundle 的 schema 必须为 `v2-m1-production-storage-p0r-transport.v2`、归档成员必须恰好 14 个、manifest 必须恰好绑定除自身外的 13 个文件，并独立记录 source commit、bundle SHA-256、manifest digest 和 size。历史 transport v1 只允许由历史证据 verifier 读取，不得冒充当前执行包。`6a81e865e61569f7d2d7c3bb3be1d78db72a9eab` 与 `bed938...` 均只保留为历史来源证据，不再拥有执行权。历史 `bed938...` staging 的 run、plan 和 transport bundle 已完整保留并校验，但其源码早于三项生产安全修复：backup/credential/recovery evidence 读取尚未统一使用单一 `O_NOFOLLOW` 句柄，部分输出尚未使用独占创建；其本地 bundle builder 也早于确定性 Node USTAR 替换。因此该 staging 的权威状态改为 `REJECTED_SUPERSEDED_SECURITY_SOURCE`，禁止执行、复制成新包或签发绑定它的 STS。

`m1-production-storage-p0r-local-tty-bridge.exp` 是可信 Mac 上的 operator-side 控制面，不进入生产 transport bundle，也不扩大生产运行成员分母。它必须与 plan 的 exact source commit 同属一个 clean worktree，通过本地测试和 GitHub 四门，并在执行时重新校验 plan、clean HEAD、本机私钥、known_hosts、固定目标、固定代理和两个不可注入的远端命令。bridge 未通过自身 plan/test/source gate 时，不得签发 STS。

历史重绑定实现 source parts `408803e0bdc21051124a + 79e307db8e9eb39c793c` 和 source `94118...` 的 PASS 均保留为前序证据。Region 与第四门触发根因修复 source `bd20bd5b73ef0beb41c331aa43c58051ef01d37a` 也已通过 GitHub Full Quality `30273183761`、Signed Dispatch `30273183650`、Independent Security `30273183504` 与 A0 Qualification `30273183454`；fresh read-only dispatch `p0r-rebind-preflight-20260728t110438z-b2815255` 返回 `PASS_P0R_READ_ONLY_REBIND_PREFLIGHT` 且生产零漂移。这些均是真实历史证据，但 `bd20...` 的 bundle 不含当前固定 atomic session helper，旧 secret 路线又被第二次真实 STS 失败证伪，因此它已失去执行权。后续 plan、bundle、STS 和 recovery 必须绑定 replacement clean exact source；不得退回 `bd20...` 或更早 source。

### 4.1 只读现场重绑定

只读重绑定必须通过 `v2:m1:p0r:rebind-bundle` 从 clean、已推送的 exact commit 构建，并通过固定 Ed25519 signed dispatch 通道执行。当前 request/result schema 必须为 v2：历史 transport v1 的替代比较集固定为当时已经存在的三个安全文件，当前 source 资格集则必须完整绑定 transport v2 的七个运行文件，尤其包括 runner 与 `m1-production-storage-p0r-session.sh`；两者不得混为同一分母。它只能：

- 核对生产 HEAD、clean worktree、完整容器身份、timer、listener 和 health；
- 证明 `/dev/shm` 无 P0R 临时 secret，且无 P0R container/volume；
- 从腾讯实例 metadata 在内存读取公网 IPv4，只保留 `<IP>/32` 摘要并与历史 plan 绑定值比较；
- 校验历史 staging 的每个成员、manifest、plan、bindings 和摘要；
- 证明历史三个安全文件已被当前源码替代，同时保存当前七文件 P0R 运行集的精确摘要；
- 在 fixed dispatch evidence 根写入不可覆盖的脱敏结果，并清理自身精确 staging。

它不得读取或输出 raw credential、bucket、object key、env、数据库业务行，也不得修改应用、数据库、Redis、Worker、生产仓库、COS 或历史 staging。任何七文件当前运行摘要缺失、历史三文件比较摘要缺失或两组 key 漂移都必须失败关闭。唯一成功状态是 `PASS_P0R_READ_ONLY_REBIND_PREFLIGHT`；历史 staging 仍必须同时记录为 `REJECTED_SUPERSEDED_SECURITY_SOURCE`。

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

`p0r-bindings.env` 不得再由 Shell `source`。session helper 必须把它当普通数据逐项解析，只接受 12 个精确白名单键、一个 40 位 source commit 和 11 个 64 位 SHA-256；重复、缺失、额外、非法值或任一 source checksum 不一致均失败关闭。credential ingress CLI 不接受 caller-supplied `--now`，即时编译门禁只能使用进程真实时钟。

可信 Mac 上必须先运行 `m1-production-storage-p0r-local-tty-bridge.exp`。它只允许：

- 从 mode-600、当前用户拥有、非 symlink 的 exact plan 读取 run-id/source commit，并要求本地 Git HEAD 完全一致且 worktree clean；
- 固定并验证 `/Users/chuan/.nvm/versions/node/v22.23.1/bin/node`，拒绝 PATH 或 Node 版本漂移；
- 固定目标 IP、ubuntu 用户、SSH identity、known_hosts、ed25519 host key、loopback SOCKS proxy、BatchMode 和两个由 run-id 派生的远端命令；execute 模式不接受任意 host、remote command、secret 或 Keychain 名称；
- 在 API 请求前建立第一条 SSH TTY，只有收到 `READY_P0R_STS_RESPONSE_INPUT_NO_ECHO` 后才开放 native-copy 窗口；
- 把 clipboard 先设为 run-bound sentinel，只接受结构精确、大小有界的腾讯响应 JSON；在远端 handoff 前立即覆盖 clipboard；
- response 出现后不调用 screenshot、OCR、AX、browser state、computer-use 或 OrcaTerm；
- 在 credential compile PASS 后建立第二条固定 SSH TTY，从固定 macOS Keychain service/account 内部读取 exact age identity，不把 identity 放入参数、日志或 clipboard；
- 全程抑制 child output，只输出 bridge 自己的无 secret 状态；任一 marker、SSH、clipboard、JSON、Keychain、remote exit 或 timeout 异常都断开 TTY、触发远端 cleanup 并失败关闭；
- 无论成功或失败都再次覆盖 clipboard；只有远端 `PASS_P0R_RECOVERY_DRILL`、两个 SSH clean exit 和最终 clipboard clear 同时成立，bridge 才返回 PASS。

### 5.2 下一次 exact 执行顺序

固定顺序如下：

1. `COMPLETED_EXPIRY_PREREQUISITE`：第三枚 STS exact expiry=`2026-07-29T06:09:17Z`；本机 UTC `2026-07-29T10:32:53Z` 与腾讯 HTTPS Date `2026-07-29T10:35:42Z` 已独立证明超过到期点。它现为 `EXPIRED_FORBIDDEN_REUSE`，且永不恢复旧 run 的执行权。
2. `NEXT_EXACT_SOURCE`：local TTY bridge、echo-before-ready 和防复发门禁已通过伪 TTY 10/10、P0R 87/87、recurrence 10/10、dispatch 24/24 与精确 Node/npm 完整 `ci:production`；现在形成新的 clean exact commit，再通过 GitHub 四门和 fresh 生产只读重绑定。`e362...` run/plan/bundle/staging 永久失去执行权。
3. 由新 source 生成全新 run-id、object key、plan 和 bundle，并在全新生产 staging 完成成员、checksum、plan-mode、零 secret 与零漂移验证；禁止复用旧 run 的任何 execution identity。
4. 在签发前先验证 direct SSH read-only channel，并从可信 Mac 启动 bridge。只有 bridge 已建立 exact remote TTY、远端 echo 已关闭且本机出现 `READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE`，才允许进入 API Explorer 动作。
5. Microsoft Edge 中只执行新 plan 的 exact `GetFederationToken`，由用户完成本人 MFA，并点击 API Explorer 的页面原生 Copy。response 出现后任何自动化都不得读取页面状态、截图、OCR、AX tree 或切换到 OrcaTerm；native Copy 无法完成时立即停止。
6. bridge 只接受结构精确且有界的 clipboard JSON，语义无损紧凑化后先清空 clipboard，再经已握手的 no-echo TTY 发送 newline + EOT。helper 必须在签发后 5 分钟内返回 compile PASS；否则自动清理并停止。
7. bridge 在 compile PASS 后自动建立第二条固定 TTY，从固定 Keychain 项内部读取 age identity 并完成 no-echo handoff；identity 不进入 shell 参数、clipboard、日志或工具输出。credential compile 已确认后，用户关闭 API response 页。
8. 第一 helper 自动接管 identity、启动 Runner 并执行 COS preflight、只读加密 backup、exact version retrieval、隔离 PG16 restore、证据封存、容器/volume/runtime/secret 清理和零漂移复核。
9. bridge 只有在 `PASS_P0R_RECOVERY_DRILL`、secondary/primary SSH clean exit 和最终 clipboard clear 同时成立时才返回 `PASS_P0R_LOCAL_TTY_BRIDGE`。
10. 无论成功或失败，独立只读验证仍须再次证明 P0R `/dev/shm` 文件、session/provisioning 进程、临时 container/volume 和 runtime 为零；只有完整证据同时存在才可关闭。

唯一允许的本机 secret orchestration 入口如下；`<plan>` 是新 run 的 restricted mode-600 exact plan。命令本身不含 secret：

```bash
/usr/bin/expect scripts/v2/production/m1-production-storage-p0r-local-tty-bridge.exp execute --plan <plan>
```

bridge 返回 READY 前禁止请求 STS。bridge 返回 READY 后，只允许 API Explorer 原生 Copy 这一项浏览器动作。secret 可见期间禁止截图、屏幕录制、AX/OCR、browser state read、日志、回显或 OrcaTerm secret 输入。

原始 STS response 不落盘。credential file 是 mode 600 的单一 JSON 对象，schema 为 v2，除临时三元组外还绑定运行计划与签发证据：

```json
{
  "expiresAt": "YYYY-MM-DDTHH:mm:ss.000Z",
  "grant": {
    "actions": [
      "cos:GetBucketACL",
      "cos:GetBucketObjectLockConfiguration",
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
  "schemaVersion": "v2-m1-production-storage-cos-temporary-credentials.v2",
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

staging/evidence 根目录和 source 目录必须是实际目录，不得是 symlink。解包后必须核验 transport bundle SHA-256、manifest、所有 file checksum 和 source commit。只上传 checksum-bound、无 secret 的 bundle；credential response 与 age identity 只可经固定 TTY bridge 进入远端 session 的 stdin，并由 session 独占写入 exact `/dev/shm`。不得把两项 secret 当文件上传，不得同步源码仓库或生产 env。bundle 无 secret，但含受限 COS 目标元数据，执行后 staging 必须清理。

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
