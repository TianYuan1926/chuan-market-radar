# M1.6 Partitioned Fact Storage Contract V1

状态：`LOCAL_ENGINEERING_AND_POSTGRES16_REHEARSAL_PASS / PRODUCTION_MIGRATION_NOT_RUN / M1_NOT_COMPLETE`

## 1. 目的

本合同只解决高频 `PointInTimeMarketFact` 的长期写入地基：日分区、活动身份唯一性、容量水位、受控物理保留、备份恢复证据和不可变清理审计。它不改变 Fact 业务语义，不增加市场发现能力，也不产生 Candidate、Signal、READY 或交易计划。

## 2. 不可变前提

- M1.3 base migration checksum 必须继续为 `sha256:88915ee4a13d14eb03eae6172bb57a52b5929f69b4c4f7232dcf987041644f51`。
- M1.5 checkpoint migration 不得改写。
- M1.6 使用独立版本 `v2-m1-partitioned-fact-store.v1`，当前 checksum 为 `sha256:9a507139b88efa86a5bb5d4593149881a4e8fad8081f27e5a7ada791c8ac7303`。
- 所有生产 migration、身份创建、分区预建和 retention run 仍需独立精确 Gate；本轮没有生产权限。

## 3. 物理模型

```text
artifact_ledger
  -> 继续保存 Universe / FactQuality / Feature / Context 与迁移前有限旧 Fact

point_in_time_market_fact_ledger
  -> 仅保存迁移后 PointInTimeMarketFact
  -> 按 source_cutoff UTC 日 RANGE 分区
  -> 无 DEFAULT partition，未预建即失败

point_in_time_market_fact_active_identity_registry
  -> 仅保存当前活动 Fact 的全局 fact_id / idempotency 唯一性
  -> 与 Fact 分区在同一 retention transaction 中收缩，不无限增长

market_fact_partition_event_ledger
  -> append-only CREATED / DROPPED 真值
```

迁移后，旧 `artifact_ledger` 上的触发器允许历史 Fact 读取和精确幂等重放，但拒绝任何新 `PointInTimeMarketFact` 写入。新高频写入只有分区表一条路径。

## 4. 读写兼容

- 新 Store 写 Fact 到分区表，其他五类 artifact 继续写原账本，保持原子 M1 slice。
- 读取先查活动身份注册表并精确命中 `source_cutoff` 分区；未命中时读取迁移前旧 Fact。
- migration 前旧 Fact 不会被自动删除或伪装成已迁移。生产 preflight 必须报告旧 Fact 精确数量；非零时只允许有限兼容，必须另做受控 backfill/retirement，不能进入长期 Shadow。
- 已 DROP 的 source day 由不可变事件永久封闭；即使活动身份已同步清理，也不允许重建同名分区或重灌 Fact。

## 5. 身份和权限

| 身份 | 允许 | 禁止 |
| --- | --- | --- |
| `m1_writer` | 新 Fact append、活动身份/事件只读 | 建分区、drop、备份批准、UPDATE/DELETE |
| `m1_reader` | Fact、分区清单、retention run 只读 | 写入、drop |
| `m1_replay` | Fact 读取、Manifest append | Fact 写入、drop |
| `m1_audit` | 登记不可变 backup/restore evidence | 建分区、drop、修改证据 |
| `m1_retention` | 调用受控 ensure/inspect/drop 函数 | 写 Fact、批准自己的 backup、直接表 DML |
| `m1_migration` | 拥有 schema/function | 不作为生产会话登录 |

所有 capability role 均为 `NOLOGIN / NOSUPERUSER / NOCREATEDB / NOCREATEROLE / NOINHERIT / NOREPLICATION`。

## 6. 分区生命周期

1. Retention 身份调用 `ensure_market_fact_partitions`，单次最多 63 个 UTC 日。
2. 每个日分区必须同时形成 append-only `CREATED` 事件；同名未知 relation 直接阻断。
3. Writer 只向已预建分区写入；没有 DEFAULT/fallback。
4. Capacity inspection 报告连续覆盖、精确 relation bytes、显式 estimated rows、单分区/总容量水位。
5. 只有 `drop_expired_market_fact_partitions` 可以物理清理；禁止 `CASCADE`。
6. DROP 与活动身份清理、DROPPED 事件、retention run 在同一事务中提交或回滚。
7. DROPPED source day 永久禁止重建与重灌。

## 7. DROP 硬门禁

每个候选分区必须同时满足：

- upper bound 不晚于明确 UTC cutoff day；cutoff 不得在数据库当前日期之后。
- `max(retain_until) <= DB clock_timestamp()`。
- ACCESS EXCLUSIVE 锁已取得，Writer 不能在检查后插入新行。
- Replay Manifest ledger 被 SHARE 锁定，检查期间不能产生竞态引用。
- 没有仍在保留期内的 Manifest 引用候选 Fact。
- Audit 身份已登记真实 backup + restore evidence。
- evidence release 一致、restore 已完成、coveredThrough 覆盖候选上界、artifactCount 不小于候选 Fact 数。
- 删除 Fact 数与活动身份清理数精确相等。

任一条件失败，整个事务回滚，不形成部分 DROP 或伪 PASS。

## 8. 备份和恢复证据

Backup evidence 必须包含 source digest、release、创建时间、恢复验证时间、覆盖上界、artifact 数量、隔离目标身份和审计身份。仅“备份命令成功”不够；必须在独立目标恢复并完成 canonical artifact decode 与 replay parity。

本地 PG16 演练真实执行：

```text
pg_dump custom format
-> 新建隔离数据库
-> pg_restore
-> 从恢复库读取旧/新 Fact
-> ONLINE/REPLAY parity PASS
-> 两次 replay deterministic=true
```

## 9. 容量判定

- 空 partition inventory：`INSUFFICIENT_EVIDENCE`。
- 分区不连续、缺少计划写入窗口、任一分区或总字节越线：`BLOCKED`。
- `estimatedRows` 必须明确标为估算；不能冒充精确分母。
- 生产阈值必须在 B1/M1.7 根据真实磁盘、写入率、WAL、备份窗口和恢复时间绑定，本地 64/128 MiB 只用于小样本演练，不是生产容量承诺。

## 10. 本地证据

- 定向合同：5/5 PASS。
- 隔离 PostgreSQL 16：1/1 PASS，`productionConnected=false / productionChanged=false`。
- 完整 `ci:production`：PASS；Legacy market 965/0、Worker 23/23、历史回测 4/4、全 V2 141/0/5 explicit skips、M0 10/10、生产 build、golden 16/16 与安全门禁全部通过。
- 迁移前旧 Fact 可读；迁移后新 Fact 无法写回旧账本。
- 两个 UTC 日分区、17 条新 Fact、跨分区读取和容量报告 PASS。
- 真实 dump/restore 后 replay parity PASS、deterministic true。
- 保留中和活跃 replay 均阻断 DROP；到期后删除 1 分区/2 Fact，活动身份 17 -> 15。
- DROP run 幂等；旧日分区重建、Fact 重灌、Writer/Audit 越权均拒绝。

## 11. 未证明项

- 未执行 production migration、生产分区预建、生产 backup/restore 或 retention run。
- 未证明真实全市场每分钟写入率、WAL、磁盘增长、autovacuum、备份时长、RTO/RPO 或 24 小时容量水位。
- 未证明 Docker image、Compose merge、三 Venue live egress、30 分钟或 24 小时 Shadow SLO。
- M1 仍未完成，M2 runtime 仍不得读取 M1 authority。

## 12. 后续顺序

```text
M1.6 local exit
-> M1.5-B1 image + egress + bounded 30m Shadow
-> M1.7 same-release 24h sustained SLO + capacity + recovery
-> M1 engineering exit
```

等待外部 Gate 时，只允许并行构建 `M2.0 Opportunity Taxonomy + DiscoveryCandidate/CandidateEpisode/OpportunityThesis` 合同与 point-in-time 黄金样本；不得启动读取 M1 runtime 的 Detector。
