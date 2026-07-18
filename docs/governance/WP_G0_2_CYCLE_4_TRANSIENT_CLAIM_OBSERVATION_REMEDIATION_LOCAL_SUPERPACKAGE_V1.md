# WP-G0.2 Cycle-4 短暂 Claim 观察误杀修复本地超级包

## 1. 任务目标

修复 Cycle-3 生产观察器把正常、短暂、仍在处理中的 `claimed` 任务误判为不可恢复积压的问题，并把生产续接入口从已冻结的 Cycle-3 精确刷新到相邻 Cycle-4。

本包只服务候选生命周期真值和长期稳定观察，不生成交易信号，不修改排序、结构分析、RR、交易计划或回测输入。

## 2. 已确认生产事实

- Cycle-3 observer 在第 47 个样本后以 `sample_monitor_unresolved` 失败。
- 最后一个样本仍为 health `ready/fresh`、Candidate Worker healthy、Postgres/Redis healthy、source unresolved=0、lock waiter=0、long transaction=0。
- 同一瞬间 Candidate monitor 为 pending=0、claimed=38、retry=0、quarantine=0、unresolved=38、oldest age=29.526496 秒。
- 随后的数据库快照已看到 legacy claimed=0，证明该 38 条为采样竞态中的短暂在途批次，不是持续积压。
- 自动回滚为 `ROLLBACK_PASS`；生产恢复到 clean detached `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，Web 镜像 `sha256:cd3652c1...` healthy，Candidate Worker absent。
- Cycle-3 已冻结为 `legacy / write_frozen=true / epoch2`；577 episodes、3,705 events、7,410 outbox 均保留。

## 3. 修复边界

短暂在途任务仅在以下条件全部满足时允许进入观察样本：

```text
monitor status = ready
blockers = 0
warnings = 0
retry_wait = 0
quarantine = 0
unresolved_quarantine = 0
unresolved = pending + claimed + retry_wait + unresolved_quarantine
unresolved = 0 时 oldest age 必须为 null
unresolved > 0 时 0 <= oldest age < 300 秒
```

任一条件不满足仍立即失败关闭并进入原有自动回滚。300 秒来自既有 Shadow Capture monitor warning 阈值，不新增更宽松阈值。

## 4. 质量门槛

以下门槛保持原值：

- 至少 10,000 条真实 completed writes。
- 至少 1,800 秒稳定观察、7 个样本、2 次真实推进。
- 新 Cycle-4 至少 289 个样本并覆盖 24 小时。
- 最大样本间隔 600 秒。
- source unresolved、retry wait、unresolved quarantine、数据库锁等待和长事务必须为 0。
- 旧 Cycle-3 的 47 个样本不得继承到 Cycle-4。

## 5. Cycle-4 生产绑定

生产 Packet v2 只接受：

- clean detached baseline `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`；
- 当前 Web 镜像 `sha256:cd3652c1e72c8aabea87cee11233fb662a9209187435c14107f3da6426ba9efd`；
- Cycle-3 `legacy / frozen / epoch2`；
- release `candidate-shadow-cycle-3-b098238b5d86`；
- Candidate Worker absent；
- 577 episodes、3,705 events、0 checkpoints、0 outcomes、7,410 outbox；
- 3,705 legacy completed、0 legacy unresolved、3,705 Candidate event pending、0 orphan、0 contract mismatch。

只允许启动严格相邻 `candidate-episode-v1-cycle-4`。任何现场漂移都必须在 lease 和 mutation 前拒绝。

## 6. 禁止项

- 禁止复用 Cycle-3 样本或把 47 样本重标为 PASS。
- 禁止降低观察窗口、写入门槛或告警阈值。
- 禁止 migration、旧 deadline 修改、Redis/scanner/其它服务变更。
- 禁止 frontend、scan、analysis、strategy、RR、交易计划和 backtest 修改。
- 禁止 formal backtest。

## 7. 进入生产前门禁

必须完成定向测试、PostgreSQL 16 隔离演练、基础五门禁、自治攻击性测试和三项安全门禁，再形成 clean commit、确定性脱敏 Bundle、现场只读 preflight 和单次 90 分钟请求。

本地 PASS 不等于 Cycle-4 已启动，也不等于 G0 完成。
