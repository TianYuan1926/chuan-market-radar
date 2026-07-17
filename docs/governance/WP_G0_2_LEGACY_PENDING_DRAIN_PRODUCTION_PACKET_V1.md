# WP-G0.2 Legacy Pending Drain Production Packet v1

## 目标

只处理生产中已经存在的 2,957 条 Candidate pending outbox。执行期间禁止 scanner 产生新扫描，临时 Web 必须以 drain-only 模式硬阻断 Candidate source enqueue，只允许临时 Candidate consumer 消费旧 pending。

## 当前生产前置

- Git 必须是 clean detached `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，tree=`eb217a7fbaad5b464279a08d4441a8249fc266e3`。
- Web 必须是 `sha256:cd3652c1e72c8aabea87cee11233fb662a9209187435c14107f3da6426ba9efd`；scanner 镜像和容器身份必须在新 request 中动态绑定。
- migration ledger 必须精确为 10。
- control 必须是 `candidate-episode-v1 / candidate-shadow-e5eb90026d8b / legacy / frozen / epoch 4`。
- outbox 必须精确为 5,914，其中 completed=2,957、pending=unresolved=2,957，claimed/retry_wait/quarantined/resolutions 全为 0。

任一项漂移即在 mutation 前停止，不能自动“适配”新状态。

## 唯一允许的变化

1. 保留 Git、env、Web、scanner 镜像和非目标容器基线。
2. 在 scanner 仍在线时精确 fetch/checkout 已批准 target，构建临时 Web 与 Candidate worker；所有数据库 runner 命令只能使用包含 `pg` 的目标 Web 镜像。
3. 停止 scanner；只读等待最长 660 秒让 Redis 的 600 秒扫描锁自然释放，禁止删除锁，超时即失败。
4. 临时 env 开启 shadow consumer，同时设置 `CANDIDATE_EPISODE_DRAIN_ONLY=true`；source enqueue 必须 fail closed。
5. control 从 epoch 4 临时进入 epoch 5；处理旧 pending 后停止 Candidate worker。
6. 仅在 pending/claimed/retry_wait/quarantined/unresolved 全部归零且 outbox 总数未变时冻结为 legacy epoch 6。
7. 恢复原 env、原 Git、原 Web/scanner 镜像，Candidate worker absent；基线健康等待最长 1,200 秒，以覆盖 15 分钟 scanner 周期和 5 分钟余量，scanner 必须产生晚于执行前基线的新 completedAt 并重新达到 ready/fresh。

## 失败处理

任何超时、payload 失败、retry_wait、quarantine、resolution、新 outbox、数据删除、身份漂移或验证失败都会先停止 Candidate worker，再将开放的 epoch 冻结到 legacy，随后恢复完整生产基线。回滚成功只能写单一状态 `ROLLBACK_PASS`，不得写生产 drain PASS。若完整基线仍未恢复，必须写单一状态 `ROLLBACK_INCOMPLETE_LEASE_RETAINED` 并保留全局生产租约到安全过期，不得用租约系统不接受的结果值尝试释放，也不得允许下一生产写入者进入。

## 明确禁止

不运行 migration，不删除 Candidate 业务行，不修改 Redis 数据，不启动 cycle-2，不改 scan 排序、analysis、strategy、RR、Risk Gate、trade plan、frontend 或 backtest，不运行 formal backtest，不部署 GitHub main，不触碰其它服务。

## 完成真值

本地 Packet PASS 只说明执行包可审计，不说明生产已清空。生产只有在 2,957 条全部完成、outbox 总数仍为 5,914、control 为 legacy/frozen epoch 6、Candidate worker absent、原生产身份和 scanner ready/fresh 全部恢复后，才能写 `PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN`。该 PASS 仍不代表 cycle-2、WP-G0.2 或 G0 完成。
