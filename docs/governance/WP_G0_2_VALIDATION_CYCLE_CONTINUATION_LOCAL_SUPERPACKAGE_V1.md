# WP-G0.2 Validation Cycle Continuation Local Superpackage v1

状态：本地实现与 PostgreSQL 16 演练；生产未连接、未执行。

## 为什么必须增加验证周期续接

现有每个 Candidate 双投影周期最多 72 小时，deadline 不允许更新；门禁同时要求真实写入不少于 10,000 条，并依次完成 Activation、Dual Read、Canonical Compat 三段各不少于 24 小时的观察。生产当前周期在多次安全回滚和修复后，剩余时间与真实吞吐已不能完成全部门禁。

不得通过降低 10,000、缩短观察、加快时间戳或生成无业务意义写入解决。正确做法是让一个验证周期安全结束并保留全部历史，再开始另一个独立、同样不可超过 72 小时的新周期。

## 不可降低边界

1. 旧周期必须在同一 SERIALIZABLE 事务内退回 Legacy 并冻结。
2. 旧周期 started_at、deadline_at 和全部 Candidate 业务数据永久保留。
3. 新周期 ID 必须严格相邻；cycle 1 继续使用 `candidate-episode-v1`，后续使用 `candidate-episode-v1-cycle-N`。
4. 任意时刻最多一个非 Legacy 周期。
5. 未决 outbox 大于 0 时禁止续接。
6. 新周期仍严格 72 小时；这不是重置旧 deadline。
7. 任一步失败必须回滚整个事务，Legacy 始终保持权威。
8. 10,000 条、三段 24 小时、RR 3:1、Risk Gate 和所有交易边界均不变。

## 当前结论

隔离 PostgreSQL 16 已证明旧 deadline 不变、已完成 outbox 和全部业务计数不变、旧周期冻结、新周期启动且 active cycle 始终为 1。当前不等于生产周期已续接，不等于 Reconciliation、Shadow Verify、WP-G0.2 或 G0 完成。
