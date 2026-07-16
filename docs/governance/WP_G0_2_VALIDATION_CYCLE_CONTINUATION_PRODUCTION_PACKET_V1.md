# WP-G0.2 Validation Cycle Continuation Production Packet v1

## 目标

把不可变 Candidate 验证周期续接实现封装为会话独立、一次授权、精确身份绑定、自动降级回滚和持续留证的生产执行包。

## 不可降低门槛

- 当前 Activation 必须由 289 个原始样本重算为至少 24 小时 PASS。
- 每个 cycle 最长仍为 72 小时，旧 `started_at/deadline_at` 永远不可修改。
- Reconciliation 最低仍为 10,000 条真实 completed writes 和 0 difference。
- Shadow Verify 与 Canonical Compat 仍各自需要独立 24 小时窗口。

## 生产事务

执行入口使用 transient systemd unit。事务只允许精确 fetch/checkout 目标提交、保留当前 Web/Worker 镜像、构建并重建 Web 与 candidate-shadow-worker、调用既有 control procedure 原子续接周期、切换非敏感 cycle/release 环境和启动只读 observer。

底层 continuation core 同时验证“退役 active 后启动相邻周期”和“从最新 frozen Legacy 启动相邻周期”，避免容量回滚后形成生命周期死路；本生产包仍只允许从当前 Activation 的 `shadow_capture` 源周期执行，冻结态重试必须使用新的动态证据与新执行包，不能复用本次授权。

## 失败边界

任何身份、健康、租约、outbox、deadline、数据计数或服务验证失败，必须冻结新 cycle、停止 Candidate worker、关闭全部 Candidate flag、恢复旧 Git 与镜像。旧 cycle 不得复活，Legacy 始终保留权威。

## 真值

本地 Packet PASS 不等于生产续接；生产续接不等于 10,000 条对账；累计 10,000 条不等于 Shadow Verify、Canonical Cutover、WP-G0.2 或 G0 完成。
