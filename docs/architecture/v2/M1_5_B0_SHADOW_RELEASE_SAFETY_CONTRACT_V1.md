# M1.5-B0 Shadow Release Safety 合同 v1

状态：`LOCAL_ENGINEERING_PASS / B1-A_REACHABLE_DOCKER_RUNNER_TECHNICAL_PASS / BUSINESS_READINESS_FAIL / B1-B_PENDING / PRODUCTION_SERVICES_DATA_AND_AUTHORITY_UNCHANGED`

## 1. 目标

在任何 live Shadow 之前，把 M1 Collector 收紧为一个有限时、无读取权威、无交易权限、最小数据库权限和可重算 SLO 的独立运行单元。本包只准备安全运行边界，不执行 migration、身份创建、镜像发布或生产启动。

## 2. 固定运行边界

```text
Public GET Adapter
-> bounded M1 Collector Worker
-> append-only M1 artifacts/checkpoint
-> complete strict observation JSONL
-> fixed SLO profile evaluator
```

- `authorityMode=NO_AUTHORITY`、`automaticTradingAllowed=false` 永久固定。
- Worker 不读取 Legacy、Redis、CoinGlass、会话 secret、页面、Candidate、Analysis 或 Strategy。
- 启动入口必须显式 `SET ROLE` 到 `market_radar_v2_m1_writer` 与 `market_radar_v2_m1_reader`，并验证 `current_user`、`session_user` 和登录身份分离。
- reader/writer URL 必须来自两个独立 secret 文件；生产禁止空密码、查询参数、错误 host 或错误 database。
- 每个 observation line 包含完整 strict `M1CollectorWorkerCycle`；部分摘要不能作为 SLO 输入。

## 3. 有限 Shadow 档位

| Profile | 固定节拍 | 最大周期 | 最低证据 | 作用 |
| --- | ---: | ---: | ---: | --- |
| `EARLY_30_MINUTES` | 60 秒 | 31 | 30 分钟且至少 30 周期 | 连通、四分母、短时资源和 checkpoint 证明；不是 M1 出口 |
| `SUSTAINED_24_HOURS` | 60 秒 | 1441 | 24 小时且至少 1200 周期 | 分区存储完成后的持续 SLO 出口 |

入口拒绝无限周期、超过 30 天 retention、超过 1 小时 catalog reconciliation、超过 120 秒 freshness 或超过 10 分钟 sequence gap。当前 append-only 单表没有 purge 能力，因此只允许有限 Shadow；不得把 retention metadata 写成已完成物理保留治理。

## 4. 专用容器边界

- 独立 Dockerfile，只复制编译后的 `src/v2` runtime，不复制 Legacy 运行代码、生产脚本或 `.env`。
- 以 `node` 非 root 用户运行，root filesystem 只读，`cap_drop=ALL`，`no-new-privileges`，无端口，有限 PID/CPU/RAM，日志轮转。
- Worker 只加入独立 storage 与 egress network；Postgres 通过 storage alias 访问。
- `restart=no`。正常达到最大周期后停止；runtime、artifact 或 checkpoint 失败也停止，不自动重启掩盖故障。
- 镜像必须绑定完整 40 位 source commit；真实 image digest 只能在可用 Docker runner 构建后形成。

## 5. SLO 门槛

早期 30 分钟要求：checkpoint、fresh coverage、operational READY 均为 100%，provider failure、missed start 为 0，p95 周期不超过 30 秒，schedule lag 不超过 5 秒，RSS 不超过 512 MiB。

持续 24 小时仍要求 checkpoint 100%、每周期最低 fresh coverage 100%、READY 不低于 99.5%、provider failure cycle 不高于 0.5%，且零 eligible、混合 release/config、重复/重叠周期、artifact persistence failure 均为硬失败。

`INSUFFICIENT_EVIDENCE` 不等于 PASS。CLI 对空行包、坏 JSON、部分 telemetry、错误 profile 和不满足时间窗口全部 fail closed。

## 6. 当时发现的长期存储阻断与当前状态

B0 当时的 `PointInTimeMarketFact` 逐标的写入单一 append-only `artifact_ledger`。它已有不可变性和 lineage，但没有按时间分区、受控 partition drop、容量水位、保留执行证据或 purge 审计。全市场一分钟长期写入会持续放大单表、索引、备份和恢复成本。

M1.6 现已完成本地分区、容量、restore-verified retention 和隔离 PG16 出口；生产 migration 与真实容量仍未证明。因此本地存储设计阻断已收口，但生产长期 Shadow 仍必须等待 M1.5-B1 与 M1.7。

因此正确顺序调整为：

```text
M1.5-B0 local release safety
-> M1.5-B1-A reachable Docker Runner technical preflight
-> M1.5-B1-B0 31-cycle evidence contract
-> M1.5-B1-B1 fixed-policy empirical capture
-> M1.5-B1-B2 freshness semantics remediation when Gate FAIL
-> M1.5-B1-B3 same-policy repeat when remediation was required
-> M1.6 production storage staged enablement
-> M1.7 sustained 24-hour Shadow/SLO
-> M1 exit
```

B1-B0/B1 必须先保留 B1-A 暴露的失败真值；若 B1-B1 直接 PASS，则 B1-B2/B3 条件包跳过。M1.6 本地工程已通过，但生产分阶段启用等待 B1-B 语义 Gate；M1.7 必须等待两者都通过。M2 合同/fixture 可并行准备，但 M2 runtime 不得读取 M1 authority，直至 M1.7 出口通过。

## 7. 当前外部预检事实

2026-07-21 B1-A 已在腾讯宿主机的隔离 no-authority Runner 构建 exact source image 并完成两周期 live Collector。技术条件全部通过：三 Venue provider failure=0、eligible/collected 均 1,444/1,444、checkpoint/persistence=`INSERTED`、内容寻址证据可独立重算，宿主机 11 containers / 4 networks / 5 volumes 基线精确恢复。

业务条件未通过：两周期均 `DEGRADED/PARTIAL/NOT_READY`，fresh 为 1,441 和 1,274，READY 0/2，SLO 原因包括 freshness、missed schedule 和 operational readiness。该结果不证明生产 Compose merge、生产应用 health 或 bounded Shadow PASS。

## 8. 独立生产 Gate

进入 B1-B1 前必须绑定：exact source/tree/image/config、隔离 Runner 与 host baseline、三 Venue egress、固定 60 秒/31 周期档位、完整 observation schema、证据目录、资源上限、自动停止、断点恢复和清理目标。它不得读取生产 secret、连接生产 Postgres/Redis 或加入生产 network。

进入 M1.6 production storage 或 M1.7 前仍必须新鲜绑定：production HEAD/tree/cleanliness、Compose 与 identity wrapper、现有容器/镜像、Postgres/Redis/health、磁盘/内存、两份 secret file 的存在/权限而非内容、schema/migration checksum、登录角色、回滚目标和 B1-B PASS evidence。

本合同不授权创建连接配置、写 secret、创建数据库身份、执行 migration、构建/启动生产容器或修改 production repository。
