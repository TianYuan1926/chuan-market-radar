# WP-G0.2 Fresh Verification Cycle Lineage Capture Local Superpackage v1

状态：`LOCAL_PREPARATION_ONLY`
生产授权：`false`
生产执行：`false`

## 1. 目标

为多周期 Reconciliation 生成可重算、不可人工自报的 `candidate-multi-cycle-lineage-evidence.v1`。该证据只回答“真实 10,000 条累计之后，是否启动了严格相邻的新验证周期，并且完整 Candidate control 与写入计数是否一致”。

## 2. 原始证据

Lineage 必须由以下事实重算：

1. Activation exact 289 个原始样本，覆盖至少 24 小时，最大间隔 600 秒，最终状态为 `PASS_ACTIVATE_AND_OBSERVE`。
2. 达到 10,000 的周期至少 7 个原始样本，覆盖至少 1,800 秒，至少 2 次真实 completed 推进，unresolved=0。
3. 严格相邻新周期另取至少 7 个原始样本，覆盖至少 1,800 秒，至少 2 次 completed 推进，持续 ready/fresh、Worker healthy、unresolved=0。
4. 数据库全部 Candidate control 的只读快照。
5. 每个 approved release 的 completed 写入计数和全局状态计数。

Activation、累计周期和新鲜周期的 final 都必须从原始样本重新计算并逐字段相等；不能只信任 final 文件里的 status。

## 3. 时间与血缘边界

- 血缘必须从 `candidate-episode-v1` 开始，后续 cycle 编号严格连续。
- 每个 release 唯一，每个 control 窗口精确 72 小时。
- 历史 control 必须 `legacy / frozen / even epoch`；恢复出的原写 epoch 为 even-1。
- 当前 control 必须是唯一 `shadow_capture / writable / odd epoch`。
- 新周期必须严格等于达到 10,000 周期的下一个 cycle。
- 新周期 `startedAt` 必须晚于累计 PASS 的最后原始样本；否则不能叫“fresh verification cycle”。
- 新鲜周期样本必须全部位于当前 control 窗口内，completed 不能回退。

## 4. 数据库边界

采集固定在 `REPEATABLE READ READ ONLY` 事务中，并强制 `SET LOCAL ROLE candidate_audit_role`。每个 approved release 的 completed 数之和必须等于全局 completed；outside-lineage、pending、claimed、retry_wait、unresolved quarantine 和 unresolved total 全部必须为 0。

本包没有 INSERT、UPDATE、DELETE、DDL、migration 或 phase transition。隔离 PostgreSQL 16 演练中的建数和负向写入只存在于测试进程，不属于生产 runner。

## 5. 输出边界

PASS 输出固定为 `PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION`，并包含：

- Activation final/sample 内容哈希。
- 累计 final/sample 内容哈希。
- Fresh final/sample 内容哈希。
- 数据库 control/count snapshot 内容哈希。
- 完整 `sourceReleaseWindows`、当前 cycle/release/epoch、completed 和 unresolved。
- `thresholdsChanged=false`。
- `productionReconciliationExecuted=false`。
- `shadowVerifyStarted=false`。
- `canonicalAuthorityChanged=false`。
- `g0Completed=false`。

Reconciliation Bundle 复用同一个 validator，并把 Lineage 的 Activation 内容哈希与 289 样本重算后的 final 再次交叉绑定，避免两套规则漂移。

## 6. 当前真值

当前只完成本地实现和隔离演练。生产 Activation observer 最近已知状态仍是 96/289、completed=1481；没有达到 10,000，没有新鲜验证周期，没有生产 Lineage、Reconciliation 或 Shadow Verify。系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`，G0 未完成。
