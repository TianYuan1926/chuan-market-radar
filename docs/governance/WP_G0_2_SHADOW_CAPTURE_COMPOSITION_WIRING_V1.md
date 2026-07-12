# WP-G0.2 Shadow Capture Composition Wiring 合同

## 1. 当前结论

本地 composition、受保护 worker 调用链和真实 PostgreSQL 16 排练已接通，但生产没有部署、没有激活：

```text
本地实现：PASS_LOCAL_COMPOSITION_WIRING
生产 runtime：DORMANT / NOT DEPLOYED
生产授权：MISSING
系统等级：R1 / 可运行但不完整 / 不能支撑实战
```

## 2. 接线边界

- 只有应用的权威扫描归档调用点经过 Candidate composition；测试或显式注入的 repository 保持原行为。
- 默认代码授权固定为 `false`。环境变量、Compose profile 或 worker 启动都不能单独授权写入。
- 休眠时继续只写 legacy archive；Candidate Outbox、Episode、排序、分析、策略、RR 和 READY 均不改变。
- 未来只有全部 Gate 同时通过，才会在同一 PostgreSQL connection transaction 中写 immutable scan archive 与 source Outbox。
- Gate 和 consumer 使用 PostgreSQL `clock_timestamp()`，不以应用主机时钟决定 deadline 或 lease 时间。
- Source Writer、Shadow Executor 和只读 Monitor 使用三条独立 Candidate 数据库身份通道，绝不回退复用 legacy 应用 `DATABASE_URL`。

## 3. Worker 生命周期

`candidate-shadow-worker` 只存在于 `candidate-shadow-runtime` Compose profile，普通 Compose 启动不会创建它。worker 只调用 Bearer 保护的内部 API，支持 heartbeat、SIGTERM 停止接收新任务、等待当前请求完成和 shutdown heartbeat。

## 4. 已验证

- Composition 定向套件：28 pass / 0 fail。
- 隔离 PostgreSQL 16：真实 archive + Outbox + claim + Episode projection + completion + monitor 链路 PASS。
- PostgreSQL runtime role 权限套件：4 pass / 0 fail。
- 隔离 legacy application identity 在无法读取 Candidate schema 时保持 dormant，只写 legacy archive、Candidate Outbox=0。
- 排练使用 `/tmp` 临时集群与专用 rehearsal 数据库，`productionConnected=false`。

## 5. 仍未完成

1. 代码尚未部署腾讯云。
2. Candidate worker profile 尚未启动。
3. 生产代码授权与五个 Feature Flag 全部关闭。
4. `candidate_migration_control` lifecycle 尚未启动。
5. Shadow 观察、10,000 compared writes、24 小时 clean window、reconciliation 和 cutover 均未开始。
6. 当前生产 Application Runtime 没有 Candidate 权限，least-privilege active composition 尚未证明；Dormant deploy 后、activation 前必须独立完成 Candidate Runtime Identity and Permission 包。

## 6. 下一包

只有本包全部门禁通过并获得新的独立生产审批后，才能进入 `WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY`。Dormant deploy 仍必须保持代码授权、Feature Flag 和 control lifecycle 关闭；不得与 activation 合并。
