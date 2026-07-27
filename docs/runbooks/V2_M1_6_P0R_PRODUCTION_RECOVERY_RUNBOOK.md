# V2 M1.6-P0R 生产恢复运行手册

状态：`OBJECT_LOCK_31D_ENABLED_AND_VERIFIED / AGE_IDENTITY_KEYCHAIN_PASS / LEGACY_BED938_STAGING_REJECTED_SUPERSEDED_SECURITY_SOURCE / READ_ONLY_REBIND_PACKAGE_LOCAL_AND_EXACT_SOURCE_REMOTE_QUALIFICATION_PASS / PREVIOUS_DISPATCH_CONFIRMED_NOT_EXECUTED_EXPIRED_NOT_CLAIMED / FIXED_DISPATCH_TIMEOUT_LOCK_RECOVERY_PASS / FRESH_REDISPATCH_REQUIRED / NO_USABLE_STS / PRODUCTION_RECOVERY_NOT_EXECUTED / P0_BLOCKED`

## 1. 唯一目标

本手册只执行一次真实的生产 PostgreSQL 只读同快照加密备份、腾讯 COS 精确版本取回和隔离 PostgreSQL 16 恢复验证。它不扩容、不迁移、不启动 Worker、不修改生产服务，也不授权 P1。

正确顺序固定为：

```text
准备私有 COS 与独立密钥保管
-> 隔离并拒绝执行 superseded 历史 staging
-> 用 signed dispatch 执行 current-source 只读现场重绑定
-> 从 exact pushed current source 重建 plan 与 checksum-bound transport bundle
-> 上传无 secret、含受限目标元数据的 bundle
-> 通过 /dev/shm 单独注入 fresh 7200 秒 STS 与临时 age identity
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

验收输出必须为 `PASS_P0R_PRODUCTION_TRANSPORT_BUNDLE`，并独立记录 source commit、bundle SHA-256、manifest digest 和 size。`6a81e865e61569f7d2d7c3bb3be1d78db72a9eab` 与 `bed938...` 均只保留为历史来源证据，不再拥有执行权。历史 `bed938...` staging 的 run、plan 和 transport bundle 已完整保留并校验，但其源码早于三项生产安全修复：backup/credential/recovery evidence 读取尚未统一使用单一 `O_NOFOLLOW` 句柄，部分输出尚未使用独占创建；其本地 bundle builder 也早于确定性 Node USTAR 替换。因此该 staging 的权威状态改为 `REJECTED_SUPERSEDED_SECURITY_SOURCE`，禁止执行、复制成新包或签发绑定它的 STS。

当前重绑定实现 source parts 为 `408803e0bdc21051124a + 79e307db8e9eb39c793c`。它只生成无 secret、确定性、签名派发可验的只读包；本地 package `9/9`、P0R `70/70`、V2 Ops `179/179` 与完整 `ci:production` 已通过。exact-source GitHub Full Quality `30219999104`、A0 Release Qualification `30219999094` 和 Independent Security `30219999063` 已全部 PASS；Security 明确证明 Gitleaks finding=`0`、CodeQL untriaged=`0`、Trivy HIGH/CRITICAL=`0`，三条工作流均未执行生产或接触生产凭证。远端源码资格前置已关闭，但生产现场身份仍可能漂移；生产只读重绑定 PASS 之前不得构建新的执行级 P0R plan/bundle。

### 4.1 只读现场重绑定

只读重绑定必须通过 `v2:m1:p0r:rebind-bundle` 从 clean、已推送的 exact commit 构建，并通过固定 Ed25519 signed dispatch 通道执行。它只能：

- 核对生产 HEAD、clean worktree、完整容器身份、timer、listener 和 health；
- 证明 `/dev/shm` 无 P0R 临时 secret，且无 P0R container/volume；
- 从腾讯实例 metadata 在内存读取公网 IPv4，只保留 `<IP>/32` 摘要并与历史 plan 绑定值比较；
- 校验历史 staging 的每个成员、manifest、plan、bindings 和摘要；
- 证明三个目标机运行文件已被当前安全源码替代；
- 在 fixed dispatch evidence 根写入不可覆盖的脱敏结果，并清理自身精确 staging。

它不得读取或输出 raw credential、bucket、object key、env、数据库业务行，也不得修改应用、数据库、Redis、Worker、生产仓库、COS 或历史 staging。唯一成功状态是 `PASS_P0R_READ_ONLY_REBIND_PREFLIGHT`；历史 staging 仍必须同时记录为 `REJECTED_SUPERSEDED_SECURITY_SOURCE`。

首次 signed rebind dispatch 已在目标机被确认从未执行。生产固定派发代理曾因 Git child 超过 systemd 180 秒时限被终止，并遗留无 owner 的空锁；后续 4,526 次轮询均被旧锁拒绝。source parts `2b4fccc9f3affe613d4f + 0da0f97295d97b0c6452` 已将 Git child 固定为 90 秒硬上限，并加入 owner-aware、四分钟 stale 下限的锁恢复。腾讯生产验收通过后，旧 dispatch 被记录为 `FAIL_DISPATCH_NOT_REUSABLE / dispatch_not_current`，没有 claim、解包或业务 Runner，应用与 11 容器零漂移。该旧 dispatch 已消费且禁止复用；必须生成新的 90 分钟 signed dispatch 才能继续本节。

## 5. 临时凭证合同

不得手工编 credential JSON。必须在腾讯 API Explorer 中逐字使用 plan 的 `stsRequest`，包括 `Region=ap-hongkong`；API policy 不含 `principal`，由源 IP、HTTPS、TLS、private ACL、Content-Type、COMPLIANCE retention 和唯一 resource 约束。腾讯返回的原始 JSON 只能暂存为 `/dev/shm/...sts-response.json` mode 600，再由 bundle 内工具编译。生产宿主不依赖系统 Node，必须复用正在运行的 Web 容器内已验证 Node 二进制：

既往短期 STS 均已过期且不得复用。2026-07-23 现场只读 inventory 未发现可用 credential 文件；名为 `/dev/shm/p0r-sts` 的旧占位文件为 0 字节，同目录另有 15 个旧辅助脚本或 base64 中间文件。用户在动作时确认后，这 16 个精确路径已全部删除；随后 `find /dev/shm -maxdepth 1 -type f -print` 返回空，诊断临时文件也已确认不存在。当前是 clean pre-STS baseline，尚未创建新 credential。

```bash
WEB_CONTAINER="$(sudo docker compose \
  --env-file /home/ubuntu/apps/chuan-market-radar/.env.production \
  -f /home/ubuntu/apps/chuan-market-radar/docker-compose.yml ps -q web)"
WEB_PID="$(sudo docker inspect -f '{{.State.Pid}}' "${WEB_CONTAINER}")"
HOST_NODE="/proc/${WEB_PID}/root/usr/local/bin/node"
sudo test -x "${HOST_NODE}"
sudo "${HOST_NODE}" --preserve-symlinks \
  <source>/m1-production-storage-p0r-cos-provisioning.mjs compile-credentials \
  --plan <source>/cos-provisioning-plan.json \
  --sts-response /dev/shm/market-radar-v2-p0r-<run-id>.sts-response.json \
  --output /dev/shm/market-radar-v2-p0r-<run-id>.cos-credentials.json
```

编译器成功或失败都会删除 raw STS response。credential file 是 mode 600 的单一 JSON 对象，schema 为 v2，除临时三元组外还绑定运行计划与签发证据：

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

staging/evidence 根目录和 source 目录必须是实际目录，不得是 symlink。解包后必须核验 transport bundle SHA-256、manifest、所有 file checksum 和 source commit。只上传 checksum-bound bundle、临时 credential file 与临时 age identity；不得同步源码仓库或生产 env。bundle 无 secret，但含受限 COS 目标元数据，执行后 staging 必须清理。

2026-07-23 只读 inventory 最初发现两个 staging run；较早副本已在动作时确认后精确删除。剩余 `bed938...` staging 的成员和摘要仍作为历史审计材料保留，但不再是执行入口。只读重绑定通过前不得删除它；重绑定 PASS 后也只能在新的 current-source plan、bundle 和回滚证据全部绑定后，以独立精确清理动作删除，不能覆盖、修改或复用。

## 7. 执行

只有只读重绑定、current-source plan/bundle 和 fresh secret 边界全部 PASS 后，才允许对新 source 执行计划模式并保存脱敏输出：

```bash
bash <source>/m1-production-storage-p0r-runner.sh plan
```

执行模式必须从 bundle 内 `p0r-bindings.env` 导入 checksum，并显式提供以下环境变量：

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

不得手抄 checksum，不得修改 runner，不得把 secret 作为命令行参数。最终唯一成功状态是 `PASS_P0R_RECOVERY_DRILL`。

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
