# WP-G0.2 Cycle-3 Unified Lineage Refresh Local Superpackage v2

状态：`LOCAL_READY_FOR_GATE`
生产授权：`false`
生产执行：`false`

## 1. 目标

把已经过期的 Activation/Accumulation/Fresh 三证据 Lineage 模型替换为与当前生产事实一致的 v2：一份 Cycle-3 统一观察原始样本证明完整双门禁，数据库只读快照证明 Cycle-1 至 Cycle-3 的完整 control 与 release 写入血缘。

## 2. 统一观察证据

唯一允许的运行证据目录是 Cycle continuation observer 在 PASS 时保留的目录，文件固定为：

- `cycle-observation-final.json`
- `cycle-observation-samples.jsonl`
- `cycle-observation-closeout.json`

三个文件必须是 0600 私有普通文件、非符号链接、单硬链接，并由 capture specification 逐文件 SHA-256 绑定。Runner 必须重新调用当前 `evaluateCycleObservation` 处理全部原始样本，重算结果与 final 逐字段一致后，才允许接受 `PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE`。

重算必须同时证明：至少 289 个连续样本、覆盖至少 24 小时、样本间隔不超过 600 秒、至少 10,000 个真实 completed writes、至少 1,800 秒、至少 7 样本、至少两次真实推进、unresolved=0。任何单项不足都不能生成 Lineage PASS。

## 3. 历史真值

历史 197 样本/约 16.5 小时的 Activation 以 `ROLLBACK` 关闭，Cycle-2 第三次尝试在首样本前失败。它们都不是 PASS 证据，也不能通过复制、重命名或聚合冒充 v2 输入；只允许作为数据库 control 历史保留。

## 4. 数据库血缘

数据库采集固定使用 `REPEATABLE READ READ ONLY` 和 `SET LOCAL ROLE candidate_audit_role`。必须精确看到三条相邻 control：Cycle-1、Cycle-2 为 `legacy/frozen/even epoch`，Cycle-3 为唯一 `shadow_capture/writable/odd epoch`。每个窗口必须为 72 小时，release 唯一。

各 release 的 `legacy_scan_candidate` completed 总和必须等于全局 completed，也必须等于统一观察 final 的 completedWrites。outside-lineage、pending、claimed、retry_wait、unresolved quarantine 和 unresolved total 必须全部为 0。

## 5. 输出边界

输出 schema 固定为 `candidate-multi-cycle-lineage-evidence.v2`，状态固定为 `PASS_CYCLE3_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH`。输出记录统一 final/sample 语义哈希、数据库 control 快照哈希、全部 release 窗口、当前 Cycle-3 身份和所有阈值事实。

`productionReconciliationExecuted`、`shadowVerifyStarted`、`canonicalAuthorityChanged` 和 `g0Completed` 必须全部为 false。本地 PASS 不授权生产采集；生产采集也不自动进入 Reconciliation。

## 6. 当前真值

Cycle-3 生产 observer 正在运行，双门禁尚未通过。当前包只并行修复本地 Lineage，既不读取生产证据，也不连接生产数据库。系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`，G0 主步骤仍为 7。
