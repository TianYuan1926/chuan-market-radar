# M1.6 Partitioned Fact Storage Contract V2

状态：`SIX_HOUR_LOCAL_ENGINEERING_AND_POSTGRES16_CAPACITY_PASS / P0R_OBJECT_LOCK_31D_AGE_AND_TRANSPORT_PASS_STS_RECOVERY_PENDING / PRODUCTION_P0_STILL_BLOCKED / M1_NOT_COMPLETE`

## 1. 目的

本合同在不付费扩容、也不削减核心能力的前提下，重新冻结高频 `PointInTimeMarketFact` 的生产存储模型。它只服务 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 地基，不产生 Candidate、Analysis、Strategy、READY 或交易计划。

## 2. 不可变迁移链

- Base store v1 checksum：`sha256:88915ee4a13d14eb03eae6172bb57a52b5929f69b4c4f7232dcf987041644f51`。
- Partition store v1 checksum：`sha256:9a507139b88efa86a5bb5d4593149881a4e8fad8081f27e5a7ada791c8ac7303`。
- Six-hour additive v2 checksum：`sha256:17cf407811a3f3518cfd7bf15312dda771e0709d8eb23a62b8bcc56f7c14b68e`。
- v2 不改写 v1；fresh install 必须按 v1 -> v2 顺序执行。
- v2 首次应用时若发现任何 v1 日分区、分区 Fact、活动身份、分区事件或 retention run，必须失败并要求独立迁移方案。
- 生产仍为 `ABSENT_CLEAN` 的过期只读快照；本合同没有授权生产 migration。

## 3. 固定能力边界

容量模型不得通过以下手段取得 PASS：

- 不得把已观测 1,444 Facts/周期的全市场分母缩小。
- 必须按 1,805 Facts/周期规划，保留至少 25% 标的增长余量。
- 扫描周期不得慢于 60 秒。
- Detector 最大回看不得短于 24 小时。
- 恢复重叠不得短于 6 小时。
- 热 Fact 配置保留期不得短于 30 小时。
- 每条存储成本必须使用实测较大口径并乘至少 1.5 安全系数。
- 不得把明文备份、恢复库或历史研究 bulk 放在生产根文件系统。
- 不得降低 4 GiB 非 Fact、2 GiB WAL、2 GiB migration、5 GiB rollback 和 2 GiB runtime/log reserve。
- 稳态磁盘使用率不得超过 60%，施工峰值不得超过 70%。

## 4. 六小时物理模型

```text
point_in_time_market_fact_ledger
  -> RANGE(source_cutoff)
  -> UTC 6h partition
  -> name pYYYYMMDD_HH, HH only 00/06/12/18
  -> no DEFAULT partition

point_in_time_market_fact_active_identity_registry
  -> current active Fact global identity
  -> shrinks in the same transaction as partition DROP

market_fact_partition_event_ledger
  -> append-only CREATED/DROPPED truth
  -> policy v2-m1-fact-six-hour-partition.v2

market_fact_retention_run_ledger
  -> cutoff_at timestamptz
  -> no longer limited to a UTC date cutoff
```

最坏物理驻留按 `30h configured retention + 6h partition span + 1h sweep lag = 37h` 计算。日分区的同口径最坏驻留为 55 小时，在当前根盘上无法满足施工峰值 70% 门槛，因此不得继续作为生产候选。

## 5. 分区创建合同

- `ensure_market_fact_partitions(startAt, endAt, releaseId)` 只接受 canonical UTC timestamp。
- start/end 必须精确落在 00/06/12/18 六小时边界，跨度不得超过 63 天。
- 每个 relation 必须同时有 exact CREATED event；未知 relation 占用名称时失败。
- 已有 DROPPED event 的分区不得重建。
- Writer 只有预建分区写权限；没有 DEFAULT 或 fallback。

## 6. Retention 合同

- `drop_expired_market_fact_partitions(runId, cutoffAt, releaseId, backupEvidenceId)` 只接受整点 UTC cutoff，且不得晚于数据库时钟。
- 候选分区 upper bound 必须不晚于 cutoff。
- `max(retain_until)` 必须到期。
- 必须取得分区 `ACCESS EXCLUSIVE` 和 replay manifest ledger `SHARE` 锁。
- 活跃 Replay Manifest 引用必须阻断 DROP。
- Audit 身份登记的真实 backup/restore evidence 必须覆盖候选上界和 Fact 数量。
- relation DROP、活动身份清理、DROPPED event 和 retention run 必须同事务提交。
- Fact 删除数和身份清理数必须精确相等，否则全事务回滚。

## 7. 权限边界

- `m1_writer`：Fact append 和治理真值只读，不能建/删分区。
- `m1_reader`：Fact、inventory 和 retention run 只读。
- `m1_replay`：Fact 读取与 Manifest append，不能写 Fact。
- `m1_audit`：只能登记不可变 backup/restore evidence。
- `m1_retention`：只能执行受控 ensure/inspect/drop 函数。
- `m1_migration`：拥有 schema/function，不作为生产登录身份。

所有 capability role 继续要求 `NOLOGIN / NOSUPERUSER / NOCREATEDB / NOCREATEROLE / NOINHERIT / NOREPLICATION`。

## 8. PostgreSQL 16 真实本地演练

隔离演练已证明：

- v1 日分区非空时 v2 拒绝升级。
- v1 和 v2 checksum 均精确登记，v2 可安全重放。
- 8 个连续六小时分区覆盖完整 48 小时窗口。
- 迁移前旧 Fact 可读，新 Fact 只进入六小时分区。
- 17 条分区 Fact 跨分区可读。
- `pg_dump -> pg_restore -> replay` parity PASS，deterministic=true。
- retention 前、活跃 replay 和越权身份均阻断 DROP。
- 到期后精确删除 1 分区/2 Fact，活动身份 17 -> 15。
- 已 DROP 分区和已退休 Fact 均不得复活。

## 9. 正式容量校准

Clean source：`15746813245744af4f4ba73f61a976b722ad9a21`。

- PostgreSQL：16，隔离临时实例，生产连接/改动均为 false。
- 8 周期，每周期 1,444 Facts，总计 11,552。
- 最大周期耗时 33,660 ms，平均 28,170 ms，均低于 60,000 ms。
- Fact + identity 全量口径 2,773 bytes/Fact。
- 增量口径 2,763 bytes/Fact。
- 数据库总增长口径 2,809 bytes/Fact，作为三者最大值。
- 乘 1.5 后按 4,214 bytes/Fact 规划。
- WAL 3,263 bytes/Fact；容量仍保留独立 2 GiB WAL reserve。

## 10. 当前根盘模型

- 已观测分母：1,444 Facts/周期。
- 规划分母：1,805 Facts/周期。
- 最坏物理驻留：37 小时。
- 预计热 Fact：4,007,100 行，16,885,919,400 bytes。
- 稳态新增：23,328,370,344 bytes，预计根盘使用率 59%。
- migration/WAL/rollback 同时占用时峰值新增：32,992,046,760 bytes，预计根盘使用率 67%。
- 本地容量模型：`PASS_LOCAL_NO_COST_MODEL`。

## 11. Fresh P0 组合准入

`m1-production-storage-fresh-capacity-admission.mjs` 已把旧 P0 的只读现场真值与六小时容量模型组合为本地通过的 fail-closed 判定器：旧报告必须能由原始 database/host/recovery evidence 精确重建，所有非容量 blocker 原样继承，只允许用新模型替代旧日分区的 primary headroom、projected use 和 restore target 三项计算。新模型另行要求隔离 restore target 容纳当前数据库、完整稳态数据集和 WAL reserve，并执行稳态 `<=60%`、峰值 `<=70%` 双门槛。

该工具本地 PASS 不代表已生成生产准入；完整合同见 `M1_6_FRESH_P0_CAPACITY_ADMISSION_CONTRACT_V1.md`。

## 12. 仍未通过的生产门禁

- 旧 P0 topology 已过期，必须重新只读采集。
- 旧 evidence index 的远端 bundle 摘要长度不合法，不能继续作为 fresh 生产证据。
- 真实加密离机 backup、exact version retrieval 和独立 restore evidence 尚不存在。
- Object Lock=`COMPLIANCE` 31 天、真实 age Keychain 身份和 exact transport bundle 已通过；fresh 7200 秒 exact-plan STS、真实加密备份、exact version retrieval 与独立 PG16 restore 尚未执行。
- 未执行生产 migration、身份创建、分区预建、Worker 或写入。

因此当前结论只能是：`LOCAL_CAPACITY_MODEL_PASS / BLOCKED_EXTERNAL_PREREQUISITES / PRODUCTION_CAPACITY_PASS_NOT_CLAIMED`。

## 13. 后续顺序

```text
fresh 7200s exact-plan STS + immediate server-side credential compile
-> encrypted off-host backup + exact retrieval + isolated PG16 restore
-> fresh boot/filesystem/Docker/Postgres/Redis/app health and topology capture
-> exact clean release capacity recalibration
-> fresh P0 read-only preflight + six-hour capacity admission
-> only if P0 PASS: P1 v1+v2 additive schema
-> P2 identities
-> P3 six-hour partitions + dormant worker
-> P4 isolated-write shadow
-> M1.7 same-release 24h SLO
```

本合同不允许跳过任何生产 Gate，也不改变 Candidate、Strategy 或自动交易权限。
