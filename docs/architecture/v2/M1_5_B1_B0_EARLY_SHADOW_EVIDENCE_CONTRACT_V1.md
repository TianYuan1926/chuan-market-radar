# M1.5-B1-B0 Early Shadow Evidence 合同 v1

状态：`LOCAL_ENGINEERING_PASS / B1-B1_EMPIRICAL_RUN_PENDING / BUSINESS_SLO_UNPROVEN / PRODUCTION_SERVICES_DATA_AND_AUTHORITY_UNCHANGED`

## 1. 目标

为 M1 Collector 冻结一套不能拼接、不能缩小分母、不能把技术执行成功冒充业务成功的 31 周期 Early Shadow 证据合同，并提供一个只使用腾讯宿主机隔离临时资源、结束后精确恢复宿主 Docker 基线的执行 Runner。

本包只完成合同、Runner 和反夸大测试。它不执行 31 周期外部实测，不连接生产 Postgres/Redis，不修改生产服务、migration、env、Feature Flag 或 authority。

## 2. 原子运行合同

一份有效 Early Shadow 必须来自同一 Worker 进程的完整输出：

```text
31 条 canonical M1CollectorWorkerCycle JSONL
-> 1 条 strict M1CollectorProcessSummary JSONL
-> 独立 SLO 重算
-> content-addressed domain evidence
-> exact runtime + host restoration evidence
```

- Profile 固定为 `EARLY_30_MINUTES`，节拍固定 60 秒，周期固定 31。
- 第一周期必须是未错过调度的 `STARTUP_FULL`；其后周期索引必须从 1 到 31 连续。
- 所有周期必须共享同一 `workerRunId`、release 和 runtime config digest。
- scheduled cadence 必须精确解释 missed start，周期不得重叠或时间倒流。
- stdout 必须恰好 32 条 canonical JSONL、以换行结束、最大 32 MiB；额外日志、空行、CR、短包和坏 JSON 全部拒绝。
- 中断、进程失败或证据不完整均为执行失败。禁止把多个进程、多个 release 或多次尝试拼接成 31 周期；清理后必须从第 1 周期重新执行。

## 3. 业务 Gate 与技术执行分离

技术执行只有一个成功结论：`PASS_31_CYCLE_CAPTURE`，表示 31 周期输出、证据和宿主清理完整。

业务结论独立重算：

- `PASS_EARLY_SHADOW_BUSINESS_GATE`：捕获完整且固定 SLO 为 PASS。
- `CAPTURE_COMPLETE_BUSINESS_FAIL`：捕获完整，但固定 SLO 为 FAIL。
- `FAIL_EARLY_SHADOW_RUNNER`：捕获、运行、证据或恢复失败。

业务 FAIL 时 Runner 使用独立非零退出码 2，但保留完整、可审计证据；执行失败使用退出码 1。任何状态都固定 `m1ExitClaimed=false`，不得把 B1-B0/B1-B1 写成 M1 出口。

## 4. 固定 SLO

Early Shadow 保持原门槛，并新增独立 collection coverage 防线：

- checkpoint ratio = 100%。
- collection coverage = 100%，任何 eligible instrument 未被 collected 都失败。
- fresh coverage = 100%。
- operational READY ratio = 100%。
- provider failure cycle ratio = 0。
- missed schedule starts = 0。
- p95 cycle duration <= 30 秒，schedule lag <= 5 秒，RSS <= 512 MiB。
- 零 eligible、混合 release/config、重复/重叠周期、持久化或 checkpoint 失败均为硬失败。

`INSUFFICIENT_EVIDENCE` 在完整 31 周期后仍出现时，证据构建必须拒绝。不得放宽 freshness、删除失败周期、缩小 eligible 分母、把 duplicate/carried-forward 标成 FRESH 或用 0/fallback 补齐事实。

## 5. 隔离 Runner 边界

- Runner 命令必须显式给出获准的完整 source commit，且 exact clean Git HEAD 必须与其相同；随后构建带该 revision label 的专用 Collector image。
- Node 22、PostgreSQL 16 和 Buildx 均绑定 immutable image digest，并核对本机 Node binary 与 Buildx plugin。
- Worker 使用非 root、read-only root filesystem、`cap_drop=ALL`、`no-new-privileges`、有限 PID/CPU/RAM、无端口。
- 临时 PostgreSQL 使用独立 internal storage network、tmpfs data、无 host bind/volume、无生产 network 或生产数据；另建独立 egress network 仅供公开三 Venue GET。
- reader/writer 使用不同临时 login identity 和两个只读 secret-file mount；Collector 环境禁止 direct database URL。
- 临时 PostgreSQL 的 `trust` 只属于隔离 rehearsal，必须在 evidence 中明示；它不能证明生产认证或授权已通过。
- 运行前记录宿主 running containers/networks/volumes 与资源水位；运行后删除本轮 image、container、network、builder、volume 和 raw 临时目录，并要求 baseline/post-cleanup digest 完全一致。

## 6. 证据产物

- Domain evidence 绑定原始 process output 与 31 条 observation 的 byte digest、line count、release、runtime config、Worker run、每 Venue 和 aggregate 分母、质量、持久化、checkpoint、provider failure、资源、调度及 SLO。
- Runner evidence 再绑定 source commit/ref/repository、collector/base/buildx/postgres image、Dockerfile、package lock、Runner/validator bytes、运行容器边界和宿主恢复证明。
- 原始 observation 和 process output 以 SHA-256 文件名写入工作区外 `~/.cache/market-radar-v2/evidence/b1b1`，冲突字节拒绝覆盖；报告本身也内容寻址且不包含 secret。
- 报告层、domain 层和原始字节 digest 任一不一致均拒绝。

## 7. 本地出口

- M1 专用门禁：68/68 PASS。
- 全 V2：274 pass / 0 fail / 5 项明确外部依赖 skip。
- V2 ops：31/31 PASS。
- 完整 `ci:production`：PASS；Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、M0 11/11、build、Golden 16/16 和 security 全部通过。
- `backtest:formal` 未运行；本包不是能力验收。
- 生产 smoke 未运行；本包没有部署或生产变更。

## 8. 下一入口

唯一下一入口是 `V2-M1.5-B1-B1-31-CYCLE-EMPIRICAL-CAPTURE`：在腾讯隔离 Runner 使用本包提交的 exact source 执行一次原子 31 周期实测。

若业务 Gate PASS，跳过条件整改包并进入 M1.6-P production storage 分阶段启用；若业务 Gate FAIL，必须先进入 B1-B2 freshness 语义诊断与定点整改，再以完全相同合同执行 B1-B3。无论结果如何，M1.7 24 小时 Shadow 都必须等待 B1-B 与 M1.6-P 同时通过。
