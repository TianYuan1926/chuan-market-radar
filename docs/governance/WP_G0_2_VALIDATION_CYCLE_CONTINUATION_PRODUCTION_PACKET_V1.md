# WP-G0.2 Validation Cycle Continuation Production Packet v1

## 目标

把不可变 Candidate 验证周期续接实现按当前生产真值重新封装为会话独立、一次授权、精确身份绑定、自动降级回滚和持续留证的生产执行包，并在新周期内重新完成 Activation 真值观察。

## 不可降低门槛

- 旧 Activation 的唯一真实证据只有 197 个样本、约 16.5 小时，closeout 为 `ROLLBACK`；它不得作为 PASS 前置条件或生产通行证。
- Cycle-2 必须从零采集至少 289 个连续样本、覆盖至少 24 小时，任意样本健康、Candidate runtime/monitor、数据库锁等待或长事务异常都 fail closed。
- Cycle-2 同时必须达到至少 10,000 条 `legacy_scan_candidate` completed、至少 1,800 秒稳定、至少 7 个样本和至少两次真实推进；两个窗口可并行观察，但必须同时 PASS。
- 每个 cycle 最长仍为 72 小时，旧 `started_at/deadline_at` 永远不可修改。
- Reconciliation 最低仍为 10,000 条真实 completed writes 和 0 difference。
- Shadow Verify 与 Canonical Compat 仍各自需要独立 24 小时窗口。

## 当前生产前提

- 当前控制行必须精确为 `candidate-episode-v1 / legacy / frozen / epoch 6`，active cycle 必须为 0。该 epoch 来自 fencing token 19 的 Legacy Pending Drain 安全回滚，不得复用回滚前的 epoch 4 身份。
- Candidate Worker 必须完全缺席；基线只保留 Web 回滚镜像，不得伪造不存在的 Worker 基线镜像。
- `legacy_scan_candidate` 必须是 completed 2,957、unresolved 0。
- `candidate_episode_event` 必须是 pending 2,957、non-pending 0、orphan 0、contract mismatch 0，并在续接事务前后保持不变。
- Candidate 总计数必须仍为 episodes 543、events 2,957、outbox 5,914、checkpoints 0、outcomes 0。

## 生产事务

执行入口使用 transient systemd unit。事务只允许精确 fetch/checkout 目标提交、保留当前 Web 镜像、构建并重建 Web 与 candidate-shadow-worker、调用既有 control procedure 原子启动严格相邻的 `candidate-episode-v1-cycle-2`、切换非敏感 cycle/release 环境和启动统一只读 observer。生产请求不再接收或挂载旧 Activation final 文件。

底层 continuation core 同时验证“退役 active 后启动相邻周期”和“从最新 frozen Legacy 启动相邻周期”，避免容量回滚后形成生命周期死路；本刷新包只允许从当前冻结的 Legacy 源周期启动，旧 `shadow_capture` 假设已作废。所有动态证据和授权都必须在 90 分钟窗口内重新生成，不能复用旧请求。

## 失败边界

任何身份、健康、租约、来源通道、事件完整性、deadline、数据计数或服务验证失败，必须冻结新 cycle、停止并删除 Candidate Worker、关闭全部 Candidate flag、恢复旧 Git 与 Web 镜像。即使 Worker 已自行消失也必须继续回滚；若回滚不完整，生产租约必须保留并报告失败，不能伪报 `ROLLBACK_PASS`。旧 cycle 不得复活，Legacy 始终保留权威。

## 真值

本地 Packet PASS 不等于生产续接；生产续接不等于新 Activation PASS；单独满足 24 小时或 10,000 条任一条件都不能 PASS；统一观察 PASS 仍不等于 Lineage、Reconciliation、Shadow Verify、Canonical Cutover、WP-G0.2 或 G0 完成。
