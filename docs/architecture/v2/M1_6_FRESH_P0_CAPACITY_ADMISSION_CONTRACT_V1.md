# M1.6 Fresh P0 Capacity Admission Contract V1

状态：`LOCAL_ENGINEERING_PASS / FRESH_PRODUCTION_EVIDENCE_PENDING / P0_STILL_BLOCKED / P1_CLOSED`

## 1. 目的

本合同把 M1.6 生产只读预检与六小时无扩容容量模型组合成唯一 fresh P0 容量准入。它只判断现有生产根盘是否能安全承接有界 `PointInTimeMarketFact` 工作集，不执行 migration、写数据库、启动 Worker、产生 Candidate 或开放交易权限。

## 2. 必须同时绑定的证据

一次有效准入必须来自同一 source commit/tree，并同时具备：

1. 15 分钟内的数据库只读事实。
2. 15 分钟内的宿主机 filesystem、Docker 和 Git 事实。
3. 可由原始事实逐字重建的 P0 v1 报告及其 evidence digest。
4. 90 分钟内完成的加密离机 backup 证据和 90 天内完成的隔离 PostgreSQL 16 restore 证据。
5. 24 小时内、至少 8 周期、每周期 1,444 Facts、单周期不超过 60 秒的 clean-commit PostgreSQL 16 校准。
6. 所有输入文件的 SHA-256；CLI 只接受 absolute、regular、non-symlink、owner-only JSON 文件，并用 `wx/0600` 写一次性结果。

任一证据缺失、过期、字段漂移、source 不一致、摘要不一致或无法从原始事实重建时，必须 `BLOCKED` 或 `INVALID`。

## 3. 继承与替代边界

旧 P0 的所有非容量检查原样继承，包括：只读事务、零 DML、受限读取身份、PostgreSQL 16 primary、UTC、schema exact stage、旧 Fact=0、锁/长事务、连接余量、Git/Docker 恢复、临时运行时清理、恢复身份/RPO/RTO 和零生产 mutation。

只允许替代以下三个旧日分区容量检查：

```text
primary_capacity_headroom_available
primary_projected_disk_use_below_70_percent
restore_target_capacity_sufficient
```

第三项不是删除恢复容量门禁，而是由 `isolated_restore_target_capacity_sufficient` 替代：隔离恢复目标必须容纳当前数据库、完整六小时模型稳态数据集和独立 WAL reserve。任何其他旧 P0 blocker 都必须继续阻断。

## 4. 六小时固定容量门槛

- 规划 1,805 Facts/周期，保留 25% Universe 余量。
- cadence 不慢于 60 秒。
- Detector lookback 不短于 24 小时。
- recovery overlap 不短于 6 小时。
- configured retention 不短于 30 小时。
- 物理驻留按 `30h + 6h partition + 1h sweep = 37h`。
- 每 Fact 取全量、增量、数据库增长三口径最大值，再乘至少 1.5。
- 固定保留 4 GiB non-Fact、2 GiB WAL、2 GiB migration、5 GiB rollback、2 GiB runtime/log。
- 明文 backup、restore target 和 research bulk 不得占用生产根盘。
- 稳态预计磁盘使用率必须 `<=60%`。
- migration/WAL/rollback 同时存在的峰值必须 `<=70%`。

不得通过缩小标的分母、放慢 cadence、缩短 lookback/retention、降低字节倍数或 reserve 取得 PASS。

## 5. 结论语义

只有全部检查通过时，报告才允许：

```text
status=PASS
productionCapacityPassClaimed=true
conclusion=PASS_READY_FOR_ADDITIVE_SIX_HOUR_SCHEMA
```

该 PASS 只允许请求独立的 P1 Add Schema 授权，不自动执行 migration。若 schema 已精确存在，只允许进入审计，不得重复 P1。任何失败输出 `BLOCKED`，并列出 inherited、capacity model 和 admission blockers。

## 6. 当前真实状态

本合同、组合判定器、CLI 和 10 个定向场景已本地通过，并进入 V2 ops 回归。生产 recovery evidence 和 fresh topology 尚不存在，当前没有生成 fresh P0 PASS 报告，`productionCapacityPassClaimed=false`，P1 继续关闭。
