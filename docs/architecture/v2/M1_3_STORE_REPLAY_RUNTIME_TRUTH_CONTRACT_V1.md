# M1.3 Store、Replay Manifest 与 Runtime Truth 合同 v1

状态：`LOCAL_POSTGRES16_REHEARSAL_PASS / LIVE_INGESTION_UNPROVEN / PRODUCTION_UNCHANGED`

## 1. 目的与边界

M1.3 把 M1.1-M1.2 的冻结纵切从进程内对象推进为：

```text
Universe + exact Fact denominator + FactQuality
-> append-only PostgreSQL artifact ledger
-> bitemporal Replay Manifest
-> two independent durable replays
-> FeatureQuality parity proof
-> five-dimensional Runtime Truth
```

本合同只证明隔离本地 PostgreSQL 16 演练。它不执行生产 migration，不建立生产账号，不接 live provider、采集 Worker、Redis、API 或页面，不生成 Candidate、方向、等级、入场、止损、目标、RR 或交易计划。

## 2. 持久化对象与原子边界

账本当前接受六类 M1 权威产物：

- `EligibleInstrumentSnapshot`
- `PointInTimeMarketFact`
- `FactQualitySnapshot`
- `FeatureSetSnapshot`
- `FeatureQualitySnapshot`
- `MarketContextSnapshot`

Universe、全部 eligible instrument 的精确 Fact 分母和 FactQuality 必须在同一事务中追加。禁止孤立 Fact、缺少 Universe 的 FactQuality、Fact 与 Universe instrument/Venue/unit 不一致、不同 cutoff 或不同 release 混写。Feature、FeatureQuality 和 Context 必须引用同一原子纵切。

原始权威 payload 永不在持久化时原地修改。`PointInTimeMarketFact.lineage.persistedAt` 在 M1.1 进程内 artifact 中继续为 null；数据库行的 `persisted_at` 是本合同的权威系统时间，避免先猜时间再写回不可变 payload。

## 3. Append-only 与幂等

PostgreSQL schema：`market_radar_v2`；schema version：`v2-m1-artifact-store.v1`。

- artifact primary key 为 `(artifact_name, artifact_id)`。
- idempotency key 固定绑定 artifact authority 与 artifact ID。
- 同 ID、同完整 payload、同 retention 的重试返回 `IDEMPOTENT_REPLAY`。
- 同 idempotency key 或同 artifact ID 的不同完整 payload、retention 或 policy 一律冲突，不能静默覆盖。
- `UPDATE/DELETE` 既不授予运行身份，又由数据库 trigger 二次拒绝。
- schema migration 版本与 SQL body 的 SHA-256 绑定；同版本不同 checksum 必须失败。
- retention 只记录 policy 与 `retain_until`，本包不实现 purge；删除权不会因到期自动下放给运行身份。

代码中不存在 memory fallback。没有显式注入 PostgreSQL pool 时立即返回 `DURABLE_STORE_REQUIRED`。

## 4. Artifact Integrity

写入和读取均执行 strict `STORAGE` runtime schema。每行同时保存：

- artifact 自身的 semantic `contentHash`；
- 对完整 canonical payload 计算的 `storageDigest`；
- artifact ID、schema version、release、source cutoff、generated time；
- retention、数据库 persistence time 和实际数据库 writer identity。

Universe、Fact、FeatureSet、FeatureQuality、MarketContext 的 semantic hash 与 ID 从 payload 重算。FactQuality 额外按精确 Fact 顺序、质量和 Universe lineage 重算，并核对 completeness/gap/duplicate/late 四个比率。

这解决两个不同问题：semantic hash 防止业务内容与声明身份不一致；full storage digest 防止 semantic hash 未覆盖的 lineage 字段被存储层篡改。

## 5. Replay Manifest 与双时间边界

Replay Manifest schema：`v2-m1-replay-manifest.v1`。Manifest 同时记录：

- `eventCutoff`：本次计算允许读取到的市场事件时间；
- `knowledgeCutoff`：本次回放允许看见的数据库系统时间；
- Universe、每个 Fact、FactQuality 和期望 ONLINE FeatureSet 的 artifact ID、完整存储摘要、source cutoff、persisted time；
- feature engine、feature-set、computed time、release 和 store schema version；
- canonical manifest digest 与 content-addressed manifest ID。

任何 source cutoff 晚于 event cutoff、persisted time 晚于 knowledge cutoff、分母不完整、ONLINE identity 不匹配、Manifest 被改写或 digest 不一致均拒绝。

重放必须从账本重新读取 source artifact，并用同一 `buildCrossVenueFeatureSet` 分别执行两个不同 REPLAY run。只有 ONLINE/REPLAY 语义一致、两次 REPLAY 一致且三次 run identity 独立，FeatureQuality 才能 PASS。

## 6. 最小权限身份

数据库定义五个 `NOLOGIN`、非 superuser、非 createdb、非 createrole 的 capability role：

| 身份 | 允许 | 禁止 |
| --- | --- | --- |
| migration | schema/DDL/trigger ownership | 运行时登录 |
| writer | artifact INSERT + 幂等所需 SELECT | manifest INSERT、UPDATE、DELETE、DDL |
| reader | artifact/manifest/schema version SELECT | 所有写入 |
| replay | artifact SELECT + manifest INSERT/SELECT | artifact INSERT、UPDATE、DELETE、DDL |
| audit | 只读账本与 schema version | 所有写入 |

本地演练另外创建临时 login，连接后显式 `SET ROLE` 到 capability role；退出后整个 PostgreSQL cluster 销毁。生产凭证、生产角色和生产连接均不在本包中。

## 7. Runtime Truth v2

`RuntimeTruthSnapshot` 升级为 `runtime-truth.v2`，必须分别保存：

1. `liveness`
2. `dependencyReadiness`
3. `businessReadiness`
4. `dataFreshness`
5. `releaseValidity`

每个维度都必须包含 `checkedAt`、固定 profile 的 `checkIds`、实际 `evidenceIds` 和原因。全局 reasonCodes 必须与五维证据原因精确相等。

M1 profile 固定要求 PostgreSQL artifact ledger、Replay Manifest ledger、append-only、idempotency、cutoff-safe replay、online/offline parity 和 release identity binding。遗漏任一 required check，生产也只能 PARTIAL。

永久规则：

- HTTP/process 活着不能推出依赖、数据、发布或业务 READY。
- 数据 fresh 要求 FactQuality fresh、FeatureQuality fresh、parity PASS、replay deterministic、cutoff/release/时间一致。
- release valid 要求 release ID、commit、tree、database schema 和 feature versions 精确绑定。
- `REHEARSAL` 即使五类技术检查全部通过，`businessReadiness` 仍只能 PARTIAL。
- 只有 `PRODUCTION` 且五类真值和固定 profile 全部通过，schema 才允许业务 READY。

## 8. PostgreSQL 16 演练证据

隔离临时 cluster 已证明：

```text
artifactCount = 8
first append = INSERTED
exact retry = IDEMPOTENT_REPLAY
same identity / different payload = REJECTED
orphan fact = REJECTED
writer update/delete = DENIED
reader/replay cross-write = DENIED
owner update/delete = trigger SQLSTATE 55000
forced payload corruption = storage digest detected
replay parity = PASS
replay deterministic = true
runtimeMode = REHEARSAL
businessReadiness = PARTIAL
productionConnected = false
productionChanged = false
```

演练命令：`npm run v2:m1:store-replay:pg16-rehearsal`。脚本位于 V2 隔离路径 `scripts/v2/rehearsal/`，不会进入 Legacy Consumer Map。

## 9. 未证明项

- 没有 live provider、真实全 eligible Universe 或连续采集流。
- 没有生产 migration、生产 writer/reader/replay 身份或生产 authority。
- 没有 raw payload/object storage、Kline/orderbook/OI/funding replay。
- retention purge、partition、容量、备份、恢复和 SLO 尚未实现。
- 当前仍只有冻结 BTC 三 Venue `LAST_PRICE` 与一个价格分散 Feature。
- 本合同不能证明提前发现、Candidate recall、盈利能力或实战准入。

## 10. 下一入口

下一包为 `V2-M1.4 Full Eligible Universe and Collector Runtime`：在继续保持生产零变更的前提下，先建立全 observed instrument accounting、启动全量与增量 reconciliation、受限并发/限速/背压/冷启动/恢复和 coverage telemetry 的本地采集运行纵切。生产 migration 与 authority 切换仍须独立 Gate。
