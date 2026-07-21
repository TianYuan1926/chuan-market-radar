# V2 M1.6-P0R 生产恢复运行手册

状态：`OBJECT_LOCK_31D_ENABLED_AND_VERIFIED / AGE_IDENTITY_KEYCHAIN_PASS / EXACT_TRANSPORT_BUNDLE_PASS / STS_AND_PRODUCTION_RECOVERY_NOT_EXECUTED / P0_BLOCKED`

## 1. 唯一目标

本手册只执行一次真实的生产 PostgreSQL 只读同快照加密备份、腾讯 COS 精确版本取回和隔离 PostgreSQL 16 恢复验证。它不扩容、不迁移、不启动 Worker、不修改生产服务，也不授权 P1。

正确顺序固定为：

```text
准备私有 COS 与独立密钥保管
-> 构建并核验 exact clean-commit transport bundle
-> 上传无 secret、含受限目标元数据的 checksum-bound bundle 与临时 secret 副本
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
4. 腾讯 STS 使用当前 `GetFederationToken` API，固定 7200 秒。必须在签发后 5 分钟内编译，编译时至少剩 6600 秒；COS helper 开始时至少剩 75 分钟。权限必须与 plan 要求的 10 个 action、唯一 bucket/key、源 IP `/32` 和请求条件完全一致。
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

验收输出必须为 `PASS_P0R_PRODUCTION_TRANSPORT_BUNDLE`，并独立记录 source commit、bundle SHA-256、manifest digest 和 size。当前 exact source commit=`6a81e865e61569f7d2d7c3bb3be1d78db72a9eab` 的受限 bundle 已通过，mode 600、12/12 payload hash 一致，manifest=`containsSecrets=false / containsPrivateKey=false / containsSensitiveDestinationMetadata=true`。私钥未传入 builder。该 bundle 尚未上传或执行。

## 5. 临时凭证合同

不得手工编 credential JSON。必须在腾讯 API Explorer 中逐字使用 plan 的 `stsRequest`；API policy 不含 `principal`，由源 IP、HTTPS、TLS、private ACL、Content-Type、COMPLIANCE retention 和唯一 resource 约束。腾讯返回的原始 JSON 只能暂存为 `/dev/shm/...sts-response.json` mode 600，再由 bundle 内工具编译。生产宿主不依赖系统 Node，必须复用正在运行的 Web 容器内已验证 Node 二进制：

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

## 7. 执行

先执行计划模式并保存脱敏输出：

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
