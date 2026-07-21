# M1.6-P0R Capacity and Recovery Remediation Contract V1

状态：`LOCAL_RECOVERY_ENGINEERING_PASS / P0_BLOCKED / PRODUCTION_RECOVERY_NOT_EXECUTED`

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

当前达到 `P0R_LOCAL_RECOVERY_ENGINEERING_PASS / PRODUCTION_RECOVERY_AND_CAPACITY_ACTION_PENDING`：

- strict recovery verifier、同一快照 PostgreSQL backup capture、数据库结构/计数 fingerprint、腾讯 COS 私有归档 helper、隔离 PG16 restore runner 和可复现脱敏 bundle builder 已实现。
- P0R 定向测试 28/28、V2 ops 82/82 通过；COS mock HTTPS 流程、官方签名向量、backup/age 失败清理、runner 计划/确认/源码约束和 bundle 可复现性均有自动测试。
- 生产恢复尚未执行，生产容量尚未整改，fresh P0 尚未重跑；因此 P0 仍为 `BLOCKED`，P1 仍不允许启动。

下一生产动作必须先建立专用私有 COS bucket（versioning=`ENABLED`、Object Lock=`COMPLIANCE` 且至少 30 天）、生成一次性 age X25519 身份并签发 2-36 小时精确对象范围的临时 COS 凭证；然后执行真实同快照加密备份、远端按 version 取回、隔离 PG16 restore 和 fingerprint parity。只有该证据封存后，用户才执行系统盘付费扩容与必要关机。任何长期凭证、付费、关机或 P1 生产写入都不由本合同隐式授权。

参考：腾讯云官方文档说明套餐升级可涉及系统盘自动扩容且运行中实例需要确认强制关机；数据盘是 blast radius 更大的备选路径。

- https://cloud.tencent.com/document/product/1207/51730
- https://cloud.tencent.com/document/product/1207/63920
- https://cloud.tencent.com/document/product/436/7733
- https://cloud.tencent.com/document/product/436/55291
- https://cloud.tencent.com/document/product/436/55294
