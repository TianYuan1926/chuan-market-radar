# M1.6-P0R Capacity and Recovery Remediation Contract V1

状态：`LOCAL_RECOVERY_AND_CLOUD_PREREQUISITE_ENGINEERING_PASS / P0_BLOCKED / PRODUCTION_RECOVERY_NOT_EXECUTED`

## 1. 目的

P0R 只解决 2026-07-21 生产只读预检发现的三个硬阻断：主盘容量余量不足、预计磁盘使用率超过 70%、缺少合格的离机备份与隔离恢复证据。它不执行 migration，不建立 V2 写入身份，不启动 Worker，不改变交易逻辑。

## 2. 绑定事实

- P0 source commit：`d5dbc804be00c546624ab933bad6282228f983c4`。
- 生产 HEAD：`cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，现场 worktree clean。
- PostgreSQL 16，V2 schema=`ABSENT_CLEAN`，migration/旧 Fact/新 Fact/分区均为 0。
- 根盘 `/dev/vda2` 为 ext4；系统盘 120 GiB，文件系统总量 126,695,636,264 bytes，可用 70,016,385,024 bytes。
- PostgreSQL named volume `chuan-market-radar_postgres-data` 位于根文件系统。
- 冻结 30 小时模型需要 87,088,269,540 bytes headroom，预计占用率 90%；恢复目标需要 51,836,979,428 bytes。
- 脱敏 P0 report digest：`sha256:344ae4e05ec78e74ca97c92728fc06576f744e795bf4919d6eb3b76ee145769e`。

## 3. 正确整改顺序

```text
P0 BLOCKED evidence sealed
-> P0R-A freeze remediation contract and anti-inflation tests
-> P0R-B create least-privilege encrypted off-host backup destination
-> P0R-C fresh encrypted backup + checksum + isolated PG16 restore drill
-> P0R-D expand system capacity with a protected maintenance window
-> P0R-E verify boot, filesystem, Docker, PostgreSQL, Redis and application health
-> rerun P0 with fresh recovery evidence
-> only a new P0 PASS may request P1 Add Schema approval
```

备份和可恢复性必须先于任何关机、套餐升级或文件系统变化。不得先扩容再补备份证据。

## 4. 容量方案

### 4.1 选定主方案

优先使用腾讯轻量应用服务器套餐升级，把系统盘提升到至少 180 GiB。原因：当前 PostgreSQL 与 Docker volume 都在系统盘；官方套餐升级路径可同时扩展系统盘，避免在本包内迁移 PGDATA、改 Compose volume 或制造第二套存储权威。

数学硬门槛：

```text
minimum filesystem total =
ceil((current used + projected consumption) / 0.70)
= 161,643,694,113 bytes
= 150.55 GiB
```

因此文件系统实测总量必须不小于 161,643,694,113 bytes。180 GiB 是当前推荐目标，按同一冻结模型预计使用率约 59%，给后续 WAL、备份、索引膨胀和观测留出余量。不得用删除日志、清 Docker cache 或缩短数据分母替代永久容量整改。

套餐升级涉及费用、关机和腾讯控制台确认，必须由用户完成最终财务动作。Codex 不代替用户支付或同意强制关机。

### 4.2 备选方案

若当前地域没有满足条件的系统盘套餐，才允许提出独立 `P0R-DATA-DISK-RELOCATION` 包：同可用区至少 200 GiB SSD 数据盘、GPT/ext4、UUID mount、启动前 mount guard、完整 backup/restore、停机 copy/verify、Compose/volume 单一切换和旧路径保留回滚。该方案 blast radius 更大，不能与 P0R-C 或 P1 合包执行。

## 5. 恢复证据合同

恢复证据必须满足现有 P0 strict schema：

- 新鲜 PostgreSQL 备份，完成时间距 P0 评估不超过 90 分钟。
- 备份在离开生产宿主机前已加密；离机对象私有、checksum 与 archive retrieval 均已验证。
- 加密对象 digest 内容寻址，上传后从远端重新读取并复算，不能只信上传返回码。
- 使用独立 PostgreSQL 16 目标恢复；无生产 network、无 host port、无生产数据库写权限。
- 恢复验证不输出业务行，只核对 schema、对象计数、约束、关键摘要和可读性。
- RPO 不超过 24 小时、RTO 不超过 120 分钟；P0R 单次演练目标收紧为源快照到远端精确取回验证不超过 15 分钟、隔离恢复不超过 60 分钟。它不证明持续 15 分钟 RPO；连续备份/PITR 仍由 M1.7 验收。
- 明文 dump、解密临时文件和隔离恢复集群在证据生成后全部删除；加密离机对象按保留策略继续存在。
- evidence 绑定 production HEAD、数据库 identity digest、备份 digest、恢复目标容量和 UTC 时间。

对象存储 bucket、KMS/加密密钥和上传身份必须最小权限、不可写入仓库或 env 文件。创建持久凭证或扩大访问权限是独立安全动作，不能由本合同隐式授权。

### 5.1 腾讯 COS 运行级硬约束

- 当前腾讯 COS 控制台 inventory 为 0；尚无 bucket，因此生产恢复仍未开始。
- bucket 必须位于 `ap-hongkong`、单可用区、私有 ACL、versioning=`ENABLED`、SSE-COS AES256，并开启不可撤销的 Object Lock，默认 `COMPLIANCE` 31 天。腾讯当前 Object Lock 为白名单能力且不支持多 AZ bucket；版本控制启用后不得暂停。
- 每次演练生成 128-bit 随机熵的 run-id，并形成唯一 `market-radar-v2/p0r/<date>/<run-id>.dump.age`。run-id、source commit、bucket、region、生产源 IP `/32`、唯一对象键和 STS policy 必须进入同一 provisioning plan 与 checksum-bound bundle。
- STS 使用 `GetFederationToken`、7200 秒、无 `principal` 的精确 CAM policy，只允许 10 个 bucket/object 读取验证与唯一对象 Put action；source IP、HTTPS、TLS>=1.2、private ACL、Content-Type 和 COMPLIANCE retention 均为条件。原始 STS response 与编译后的 credential 只能位于 `/dev/shm`，原始 response 编译后立即删除。
- provisioning plan、policy、STS request 和 RequestId 分别形成摘要。该链证明本次工具使用的明确申请材料和腾讯返回身份，但不谎称可从 token 本身反向解出服务端策略；真实 API 授权结果仍由后续 bucket/object 操作共同证明。
- 腾讯官方明确说明：versioning 启用后 `x-cos-forbid-overwrite` 不生效。因此它只能作为请求/策略约束，不能写成防覆盖能力。真实防碰撞合同是高熵唯一 key、上传前 HEAD 必须 404、已存在立即停止、上传后绑定 exact versionId；不得复用 key。

age 私钥必须由用户保存在与 COS 分离的加密保险库中，至少保留到对象 retention 到期；生产宿主机只允许 `/dev/shm` 临时副本，隔离恢复后删除。删除生产副本不等于销毁唯一恢复密钥。

## 6. P0R-E 生产验收

容量动作后必须按顺序验证：

1. 实例正常启动，根文件系统只挂载一次，设备与 UUID 符合计划。
2. 文件系统总量达到硬门槛，`fsck`/kernel/system journal 无新增磁盘错误。
3. Docker container/network/volume 身份与动作前基线一致。
4. PostgreSQL 16 ready、数据库 identity 不变、数据库大小与表计数合理、无 recovery mode、无 waiting lock/long transaction。
5. Redis ready，全部现有应用服务恢复 healthy；生产仓库 HEAD 与 worktree 未漂移。
6. 重新运行完整 P0，不复用已过期的数据库或 host facts。

任一项失败立即停止，不得进入 P1；按套餐/实例升级平台能力回滚或进入事故恢复，不得用空库、旧缓存或重建 volume 冒充恢复。

## 7. 四项 advisory 的去向

- privileged bootstrap 由 P2 最小权限身份包消除。
- database default timezone 必须在 P2/P3 前形成独立配置变更；所有 V2 session 继续强制 UTC。
- continuous WAL archiving 在 M1.7 前升级为 PITR 能力门槛，目标 RPO 15 分钟。
- data checksums 不能在线假装开启；在 PostgreSQL 维护窗口或未来托管数据库迁移中单独决策并演练。

这些 advisory 不允许被写成“已解决”，也不允许偷偷混入 Add Schema。

## 8. 反自欺门禁

- `backup command exit 0` 不等于可恢复。
- 本机副本、同一 Docker volume、系统盘 snapshot 不等于离机 PostgreSQL 恢复证据。
- 容量按 `df` 实测文件系统计算，不按控制台标称容量计算。
- 清缓存获得的暂时空间不算 headroom remediation。
- 只恢复 schema、只启动空库、抽查一张表或输出业务行均不能通过。
- P0 report 过期后必须重采；不能改 JSON 把 BLOCKED 变 PASS。
- P0R PASS 只允许重新运行 P0，不直接授权 P1。

## 9. 当前出口

当前达到 `P0R_LOCAL_RECOVERY_AND_CLOUD_PREREQUISITE_ENGINEERING_PASS / PRODUCTION_RECOVERY_AND_CAPACITY_ACTION_PENDING`：

- strict recovery verifier、同一快照 PostgreSQL backup capture、数据库结构/计数 fingerprint、腾讯 COS 私有归档 helper、隔离 PG16 restore runner 和可复现受限 bundle builder 已实现。
- 运行级 provisioning plan/STS credential compiler 已实现；单 AZ/region、policy/request/plan digest、上传前对象不存在和 exact version 均进入 strict evidence。P0R 定向测试当前 35/35 通过。
- 生产恢复尚未执行，生产容量尚未整改，fresh P0 尚未重跑；因此 P0 仍为 `BLOCKED`，P1 仍不允许启动。

下一生产动作必须先建立专用单 AZ 私有 COS bucket，再生成离机 age X25519 身份并按运行计划签发 7200 秒精确对象范围的临时 COS 凭证；然后执行真实同快照加密备份、远端按 version 取回、隔离 PG16 restore 和 fingerprint parity。只有该证据封存后，用户才执行系统盘付费扩容与必要关机。2026-07-21 控制台只读预览确认存在 4C16G/180GB 套餐，显示应付 1206.45 元且会强制关机；该金额会变化，本轮未勾选协议、未付费、未关机。任何长期凭证、付费、关机或 P1 生产写入都不由本合同隐式授权。

参考：腾讯云官方文档说明套餐升级可涉及系统盘自动扩容且运行中实例需要确认强制关机；数据盘是 blast radius 更大的备选路径。

- https://cloud.tencent.com/document/product/1207/51730
- https://cloud.tencent.com/document/product/1207/63920
- https://cloud.tencent.com/document/product/436/7733
- https://cloud.tencent.com/document/product/436/55291
- https://cloud.tencent.com/document/product/436/55294
- https://cloud.tencent.com/document/product/436/55293
- https://cloud.tencent.com/document/product/436/7749
- https://cloud.tencent.com/document/product/436/71307
- https://cloud.tencent.com/document/product/1312/48195
