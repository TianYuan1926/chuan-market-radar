# M1.6-P0R Capacity and Recovery Remediation Contract V1

状态：`COS_BUCKET_PROVISIONED / SIX_HOUR_NO_COST_CAPACITY_LOCAL_MACHINE_PROOF_PASS / OBJECT_LOCK_WHITELIST_REQUIRED / AGE_VAULT_TOOL_LOCAL_PASS_IDENTITY_NOT_CREATED / STS_RECOVERY_AND_FRESH_P0_PENDING / P0_BLOCKED`

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
-> P0R-D0 prove and apply a no-additional-cost storage-residency redesign
-> P0R-E verify boot, filesystem, Docker, PostgreSQL, Redis and application health
-> rerun P0 with fresh recovery evidence
-> only a new P0 PASS may request P1 Add Schema approval
```

备份和可恢复性必须先于任何存储驻留、保留策略或文件系统变化。不得先改数据布局再补备份证据。

## 4. 容量方案

### 4.1 当前活跃方案

用户已明确拒绝新增付费基础设施，因此 180 GiB 套餐升级和付费数据盘不再是活跃执行路线。当前路线是保留现有 120 GiB 生产实例，通过独立 `P0R-D0-NO-COST-CAPACITY-REDESIGN` 重新划分数据驻留职责：生产机只保存实时扫描、Detector 最大 lookback、故障回放和恢复所需的有界工作集；长期历史研究、批量回测和原始 cohort 不在生产根盘执行。该变化只能减少非实时驻留，不能减少 eligible instrument 分母、扫描 cadence、Market Fact 质量、恢复证据、审计记录或降级防线。

数学硬门槛：

```text
minimum filesystem total =
ceil((current used + projected consumption) / 0.70)
= 161,643,694,113 bytes
= 150.55 GiB
```

161,643,694,113 bytes 是旧 30 小时驻留模型下的已证明门槛，不能把现有 120 GiB 直接写成 PASS。P0R-D0 必须用新架构的实测增长率重新证明：稳态磁盘不超过 60%，冻结 worst-case 窗口不超过 70%，并单独计入 WAL、索引膨胀、Docker、系统日志、回滚副本和应急余量。任何关键数据类别、Detector lookback、全市场分母或恢复能力被削弱，都视为 Gate 失败。

机器证明至少包含：逐类 bytes/day、峰值写放大、最长 lookback、分区保留预算、WAL 上界、磁盘 soft/hard watermarks、过载时 `partial/waiting/unavailable` 降级、保留事件、恢复后的 replay parity，以及连续 Shadow 期间的实际增长曲线。未取得这些证据前，原 P0 blocker 保持有效。

### 4.2 非活跃付费备选

180 GiB 套餐升级或同可用区独立数据盘只保留为未来用户重新授权后的应急参考，不得自动进入执行队列。任何付费路线都必须重新取得当时价格、关机、回滚和用户财务确认，不能由旧合同隐式授权。

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

- 腾讯 COS 专用空桶已创建并由控制台概览核验为 `ap-hongkong / SINGLE_AZ / PRIVATE / VERSIONING / SSE-COS`，对象 0、存储 0 MB；精确名称只保存在 Git 外受限事实文件，Git 只登记名称摘要 `sha256:85c3b03bfc42eb22e41bd622bbabb3c8a04778c2397af932fd889aa14440fc63`；生产恢复仍未开始。
- bucket 必须位于 `ap-hongkong`、单可用区、私有 ACL、versioning=`ENABLED`、SSE-COS AES256，并开启不可撤销的 Object Lock，默认 `COMPLIANCE` 31 天。腾讯当前 Object Lock 为白名单能力且不支持多 AZ bucket；版本控制启用后不得暂停。
- 每次演练生成 128-bit 随机熵的 run-id，并形成唯一 `market-radar-v2/p0r/<date>/<run-id>.dump.age`。run-id、source commit、bucket、region、生产源 IP `/32`、唯一对象键和 STS policy 必须进入同一 provisioning plan 与 checksum-bound bundle。
- STS 使用 `GetFederationToken`、7200 秒、无 `principal` 的精确 CAM policy，只允许 10 个 bucket/object 读取验证与唯一对象 Put action；source IP、HTTPS、TLS>=1.2、private ACL、Content-Type 和 COMPLIANCE retention 均为条件。原始 STS response 与编译后的 credential 只能位于 `/dev/shm`，原始 response 编译后立即删除。
- provisioning plan、policy、STS request 和 RequestId 分别形成摘要。该链证明本次工具使用的明确申请材料和腾讯返回身份，但不谎称可从 token 本身反向解出服务端策略；真实 API 授权结果仍由后续 bucket/object 操作共同证明。
- 腾讯官方明确说明：versioning 启用后 `x-cos-forbid-overwrite` 不生效。因此它只能作为请求/策略约束，不能写成防覆盖能力。真实防碰撞合同是高熵唯一 key、上传前 HEAD 必须 404、已存在立即停止、上传后绑定 exact versionId；不得复用 key。

age 私钥必须由用户保存在与 COS 分离的加密保险库中，至少保留到对象 retention 到期；生产宿主机只允许 `/dev/shm` 临时副本，隔离恢复后删除。删除生产副本不等于销毁唯一恢复密钥。

免费保管路线固定为可信 Apple Silicon Mac 的登录 Keychain。生成工具必须验证官方 `age v1.3.1` darwin/arm64 archive SHA-256、独立推导 recipient、Keychain 读回与 recipient 一致性，只输出 mode-600 公钥和无私钥 attestation；重复项、输出覆盖、工具链漂移或读回不一致全部失败并回滚新建项。该本地工具 PASS 不代表真实身份已生成。

## 6. P0R-E 生产验收

P0R-D0 零付费容量本地机器证明通过后，生产仍必须按顺序验证；六小时 schema 只能在 fresh P0 PASS 后由 P1/P3 分阶段应用：

1. 实例正常运行，根文件系统只挂载一次，设备与 UUID 符合计划。
2. 文件系统实测使用率、逐类增长和新驻留预算通过 P0R-D0 固定 soft/hard watermarks，`fsck`/kernel/system journal 无新增磁盘错误。
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

当前达到 `P0R_COS_BUCKET_PROVISIONED / SIX_HOUR_NO_COST_CAPACITY_LOCAL_MACHINE_PROOF_PASS / OBJECT_LOCK_WHITELIST_REQUIRED / AGE_VAULT_TOOL_LOCAL_PASS_IDENTITY_NOT_CREATED / STS_RECOVERY_AND_FRESH_P0_PENDING`：

- strict recovery verifier、同一快照 PostgreSQL backup capture、数据库结构/计数 fingerprint、腾讯 COS 私有归档 helper、隔离 PG16 restore runner 和可复现受限 bundle builder 已实现。
- 运行级 provisioning plan/STS credential compiler 已实现；单 AZ/region、policy/request/plan digest、上传前对象不存在和 exact version 均进入 strict evidence。macOS Keychain age vault 工具已加入同一门禁，P0R 定向测试当前 41/41 通过。
- 香港单 AZ 私有/versioned/SSE-COS 空桶已创建；控制台未出现 Object Lock 入口，腾讯白名单工单已填写脱敏草稿但因账号手机号未设置尚未提交。真实 age 身份、STS、对象上传和恢复仍未执行。
- clean commit `15746813245744af4f4ba73f61a976b722ad9a21` 已用隔离 PG16 8 周期/11,552 Fact 证明六小时分区本地模型：稳态 59%、migration/WAL/rollback 峰值 67%，满足固定 60%/70% watermark。该结果只关闭 P0R-D0 本地机器证明，不声称生产容量通过。
- fresh production topology、真实 recovery evidence 和 fresh P0 尚未取得；因此旧 P0 仍为 `BLOCKED`，P1 仍不允许启动。

下一生产动作必须先补齐账号联系方式并提交白名单工单；只有腾讯确认支持后，才在动作时确认不可逆 COMPLIANCE 31 天、生成离机 age X25519 身份并按运行计划签发 7200 秒精确对象范围的临时 COS 凭证。然后执行真实同快照加密备份、远端按 version 取回、隔离 PG16 restore 和 fingerprint parity；随后刷新 boot/filesystem/Docker/Postgres/Redis/app health 与 topology，并完整重跑 P0。任何长期凭证、付费、关机或 P1 生产写入都不由本合同隐式授权。

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
