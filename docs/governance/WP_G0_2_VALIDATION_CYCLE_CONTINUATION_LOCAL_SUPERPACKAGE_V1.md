# WP-G0.2 Validation Cycle Continuation Local Superpackage v1

状态：按 2026-07-18 生产只读证据刷新本地实现与 PostgreSQL 16 演练；本刷新包尚未连接生产、尚未执行。

## 为什么必须增加验证周期续接

现有每个 Candidate 双投影周期最多 72 小时，deadline 不允许更新；门禁同时要求真实写入不少于 10,000 条，并依次完成 Activation、Dual Read、Canonical Compat 三段各不少于 24 小时的观察。生产当前周期在多次安全回滚和修复后，剩余时间与真实吞吐已不能完成全部门禁。

不得通过降低 10,000、缩短观察、加快时间戳或生成无业务意义写入解决。正确做法是让一个验证周期安全结束并保留全部历史，再开始另一个独立、同样不可超过 72 小时的新周期。

## 不可降低边界

1. 旧周期必须在同一 SERIALIZABLE 事务内退回 Legacy 并冻结。
2. 旧周期 started_at、deadline_at 和全部 Candidate 业务数据永久保留。
3. 新周期 ID 必须严格相邻；cycle 1 继续使用 `candidate-episode-v1`，后续使用 `candidate-episode-v1-cycle-N`。
4. 任意时刻最多一个非 Legacy 周期。
5. `legacy_scan_candidate` 来源通道必须为 2,957 条已完成、0 条未决；2,957 条 `candidate_episode_event` 待投递记录属于独立事件通道，必须原样保留，不能误当作待消费候选或删除。
6. 新周期仍严格 72 小时；这不是重置旧 deadline。
7. 任一步失败必须回滚整个事务，Legacy 始终保持权威。
8. 10,000 条、三段 24 小时、RR 3:1、Risk Gate 和所有交易边界均不变。
9. 旧 Activation 唯一留存证据为 197 个样本、约 16.5 小时并以 `ROLLBACK` 关闭，不能重算或包装为 PASS；Cycle-2 必须重新采集至少 289 个样本并覆盖至少 24 小时。

## 当前生产只读基线

- `candidate-episode-v1` 已处于 `legacy / frozen / epoch 4`，当前 active cycle 为 0。
- Candidate Worker 容器缺席；Web 与 scanner-worker 已恢复到健康基线。
- Candidate 表计数为 episodes 543、events 2,957、outbox 5,914、checkpoints 0、outcomes 0。
- `candidate_episode_event` 通道为 pending 2,957、non-pending 0、orphan 0、contract mismatch 0。
- 新周期只能是严格相邻的 `candidate-episode-v1-cycle-2`，不能复活旧周期，也不能清理事件通道。
- Cycle-2 将把新 Activation 与 10,000 条真实写入积累并行观察，但最终只有两项同时达标才输出 PASS。

## 当前结论

隔离 PostgreSQL 16 必须再次证明旧 deadline 不变、来源通道与事件通道不变、旧周期冻结、新周期启动且 active cycle 始终为 1。当前不等于生产周期已续接，不等于 10,000 条真实写入已累计，也不等于 Reconciliation、Shadow Verify、WP-G0.2 或 G0 完成。
