# V2 M1.6-P0R 生产恢复运行手册

状态：`READY_FOR_CONTROLLED_USE / PRODUCTION_RECOVERY_NOT_EXECUTED / P0_BLOCKED`

## 1. 唯一目标

本手册只执行一次真实的生产 PostgreSQL 只读同快照加密备份、腾讯 COS 精确版本取回和隔离 PostgreSQL 16 恢复验证。它不扩容、不迁移、不启动 Worker、不修改生产服务，也不授权 P1。

正确顺序固定为：

```text
准备私有 COS 与独立密钥保管
-> 构建并核验 exact clean-commit transport bundle
-> 上传脱敏 bundle 与临时 secret 副本
-> 执行真实 backup / retrieval / isolated restore
-> 封存脱敏 evidence，确认临时 secret 与容器/volume 已清理
-> 用户执行系统盘升级
-> 验证完整生产健康
-> fresh P0
-> 只有 fresh P0 PASS 才能请求 P1
```

## 2. 外部前置条件

1. 专用腾讯 COS bucket：ACL 只能是 owner `FULL_CONTROL`，无公开 bucket policy，versioning=`ENABLED`。
2. Object Lock 已开启，默认 `COMPLIANCE` 至少 30 天；对象上传仍显式设置 31 天 COMPLIANCE。若账户未获白名单或 bucket 不满足限制，停止，不得改成普通可删对象。
3. 唯一对象 key 符合 `market-radar-v2/p0r/<date>/<run-id>.dump.age`，禁止复用旧 key。
4. 腾讯 STS 临时凭证总寿命 2-36 小时，执行开始时至少剩余 2 小时；权限声明必须与 runner 要求的 9 个 action 和唯一 bucket/key 完全一致。
5. 独立 age X25519 恢复身份由用户在可信设备生成。私钥在与 COS 分离的加密保险库中保留至少到对象 retention 到期；生产机只接收 `/dev/shm` 临时副本，执行后自动删除。
6. 腾讯系统盘存在可升级到至少 161,643,694,113 bytes 文件系统容量的选项，推荐 180 GiB；付费与关机尚不在本步骤执行。

## 3. 禁止材料

以下内容不得进入 Git、bundle、报告、聊天或持久化 staging：

```text
age private identity
SecretId / SecretKey / session token
.env.production 内容
DATABASE_URL
数据库业务行
原始 pg_dump 明文
COS bucket 名和 object key 明文证据
```

## 4. 本地构建

必须从 clean commit 构建；dirty worktree 只能产生 `LOCAL_TEMPLATE_ONLY`，不得上传执行。

```bash
npm run v2:m1:p0r:bundle -- \
  --age-archive /absolute/path/age-v1.3.1-linux-amd64.tar.gz \
  --age-recipient /absolute/path/age-recipient.txt \
  --output /absolute/path/p0r-transport.tar.gz
```

验收输出必须为 `PASS_P0R_PRODUCTION_TRANSPORT_BUNDLE`，并独立记录 source commit、bundle SHA-256、manifest digest 和 size。私钥不得传入 builder。

## 5. 临时凭证合同

credential file 必须是 mode 600 的单一 JSON 对象，字段只能如下；尖括号内容只能在 `/dev/shm` 临时文件中替换，不能保存为仓库文件：

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
      "cos:HeadObject",
      "cos:PutObject"
    ],
    "bucket": "<private-bucket-appid>",
    "objectKey": "market-radar-v2/p0r/<date>/<run-id>.dump.age",
    "region": "ap-<region>"
  },
  "issuedAt": "YYYY-MM-DDTHH:mm:ss.000Z",
  "schemaVersion": "v2-m1-production-storage-cos-temporary-credentials.v1",
  "secretId": "<temporary-secret-id>",
  "secretKey": "<temporary-secret-key>",
  "sessionToken": "<temporary-session-token>"
}
```

声明 action 精确并不能单独证明 STS 实际策略最小；签发时必须把 resource 限制到该唯一 bucket/key，并使用 COS object-lock mode/retention 条件键。无法证明实际策略时停止。

## 6. 生产 staging

选择一个合法 `run-id`，所有路径必须与它逐字一致：

```text
source: /home/ubuntu/.cache/market-radar-v2/p0r/staging/<run-id>
evidence: /home/ubuntu/.cache/market-radar-v2/p0r/evidence/<run-id>
COS credential: /dev/shm/market-radar-v2-p0r-<run-id>.cos-credentials.json
age identity: /dev/shm/market-radar-v2-p0r-<run-id>.age-identity.txt
```

staging/evidence 根目录和 source 目录必须是实际目录，不得是 symlink。解包后必须核验 transport bundle SHA-256、manifest、所有 file checksum 和 source commit。只上传 bundle、临时 credential file 与临时 age identity；不得同步源码仓库或生产 env。

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
- exact object version 的 HEAD、GET、bytes 和 SHA-256 一致。
- `network none`、无 host port、无生产 network/volume/credential 的 PG16 restore。
- source/restore structural digest 与 verification digest 一致。
- 单次源快照到远端取回验证 `<=15m`，隔离恢复 `<=60m`；不得宣称持续 RPO/PITR 已通过。
- 临时 COS credential、生产机 age identity、副本、container、volume 和 runtime 全部删除。
- Docker baseline、生产 Git HEAD/worktree、数据库和服务零 mutation。

任一项失败都保持 `BLOCKED`。失败后优先确认临时 secret 和隔离资源清理，不得继续扩容或 P1。

## 9. 扩容与重验

只有恢复证据封存且离机对象与保险库私钥均可用后，用户才在腾讯控制台确认 180 GiB 系统盘升级和必要关机。实例恢复后按 P0R 合同验证 boot/filesystem、Docker、PostgreSQL、Redis、应用 health、Git 身份，再完整重跑 fresh P0。

P0R PASS 不是 P1 PASS。只有 fresh P0 同时确认容量、恢复证据、旧 Fact=0、schema 状态和零漂移，才允许单独申请 P1 Add Schema。
