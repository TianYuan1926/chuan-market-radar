# WP-G0.2 Legacy Pending Drain Production Packet v1

> **状态：`SUPERSEDED_SOURCE_LANE_CLASSIFICATION`，禁止再次执行。** 2026-07-18
> 第六次执行与随后独立只读聚合证明：`legacy_scan_candidate` 已经
> 2,957/2,957 completed，未完成数为 0；全局 2,957 条 pending 全部属于
> `candidate_episode_event`。Shadow Capture 合同明确禁止 Shadow Consumer 消费
> Candidate 自己产生的 event Outbox。因此当前生产不满足本包的
> `legacyPending >= 1` 入口，本包会在 control open 前以
> `legacy_pending_work_missing` fail closed。不得再生成生产 request。

## 纠正后的生产真值

- `legacy_scan_candidate`: completed=2,957，unresolved=0。
- `candidate_episode_event`: pending=2,957，非 pending=0。
- 2,957 条 completed source 均存在对应 `shadow-projection:<outbox_id>` 事件，缺失=0。
- 2,957 条 event Outbox 均能精确关联事件账本，孤儿=0、合同字段不匹配=0。
- checkpoints=0、outcomes=0；第二层交付能力尚未启用，不能把 pending 改成 completed。
- control 保持 `legacy/frozen epoch4`；不需要为错误的全局 drain 目标推进到 epoch6。
- 下一生产包是刷新后的相邻 validation cycle continuation，不是第七次 drain。

## 目标

本节以下内容是历史设计，仅用于事故追溯：原计划处理被误判为
`legacy_scan_candidate` 的 2,957 条 pending。该前提已被生产 source-type 证据推翻。

## 当前生产前置

- Git 必须是 clean detached `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，tree=`eb217a7fbaad5b464279a08d4441a8249fc266e3`。
- Web 必须是 `sha256:cd3652c1e72c8aabea87cee11233fb662a9209187435c14107f3da6426ba9efd`；scanner 镜像和容器身份必须在新 request 中动态绑定。
- migration ledger 必须精确为 10。
- control 必须是 `candidate-episode-v1 / candidate-shadow-e5eb90026d8b / legacy / frozen / epoch 4`。
- outbox 必须精确为 5,914，其中 completed=2,957、pending=unresolved=2,957，claimed/retry_wait/quarantined/resolutions 全为 0。

任一项漂移即在 mutation 前停止，不能自动“适配”新状态。

## 唯一允许的变化

1. 保留 Git、env、Web、scanner 镜像和非目标容器基线。
2. 在 scanner 仍在线时精确 fetch/checkout 已批准 target，构建临时 Web 与 Candidate worker；所有数据库 runner 命令只能使用包含 `pg` 的目标 Web 镜像，并必须从镜像内 `/app/package.json` 解析运行时依赖，禁止沿只读 `/packet` 挂载目录误解析。preflight、control open 和 final verify 三个 `jq` 合同门必须使用已冻结、可独立编译的单行过滤器，禁止在单引号过滤器内续行。
3. 停止 scanner；只读等待最长 660 秒让 Redis 的 600 秒扫描锁自然释放，禁止删除锁，超时即失败。
4. 生产 `.env.production` 只能作为精确单文件只读挂载进入专用隔离 renderer 的 `/runtime/env.production`；renderer 输出只能写入本轮临时 OPS 目录，通用 lease runner 不得获得 env 挂载。随后临时 env 开启 shadow consumer，同时设置 `CANDIDATE_EPISODE_DRAIN_ONLY=true`；source enqueue 必须 fail closed。
5. control 从 epoch 4 临时进入 epoch 5；处理旧 pending 后停止 Candidate worker。
6. 仅在 pending/claimed/retry_wait/quarantined/unresolved 全部归零且 outbox 总数未变时冻结为 legacy epoch 6。
7. 恢复原 env、原 Git、原 Web/scanner 镜像，Candidate worker absent；基线健康等待最长 1,200 秒，以覆盖 15 分钟 scanner 周期和 5 分钟余量，scanner 必须产生晚于执行前基线的新 completedAt 并重新达到 ready/fresh。

## 失败处理

任何超时、payload 失败、retry_wait、quarantine、resolution、新 outbox、数据删除、身份漂移或验证失败都会先停止 Candidate worker，再将开放的 epoch 冻结到 legacy，随后恢复完整生产基线。回滚成功只能写单一状态 `ROLLBACK_PASS`，不得写生产 drain PASS。若完整基线仍未恢复，必须写单一状态 `ROLLBACK_INCOMPLETE_LEASE_RETAINED` 并保留全局生产租约到安全过期，不得用租约系统不接受的结果值尝试释放，也不得允许下一生产写入者进入。

## 明确禁止

不运行 migration，不删除 Candidate 业务行，不修改 Redis 数据，不启动 cycle-2，不改 scan 排序、analysis、strategy、RR、Risk Gate、trade plan、frontend 或 backtest，不运行 formal backtest，不部署 GitHub main，不触碰其它服务。

## 历史完成真值（已失效）

这组条件基于“全局 pending 全是 legacy source”的错误前提，现仅保留为历史记录，
不得再作为生产完成条件。当前完成条件改为：legacy source unresolved=0、source/event
一一对应完整、Candidate event lane 独立保留、生产 ready/fresh、租约释放和证据闭环。
