# WP-G0.2 Cycle-3 Unified Reconciliation Refresh Local Superpackage v2

状态：`READY_FOR_GATE_LOCAL_ONLY`
生产授权：`false`
生产执行：`false`

## 1. 目标

把 Reconciliation 从旧 Activation/Accumulation/Fresh 和 Lineage v1 模型刷新为只接受 Cycle-3 统一 Lineage v2。对账只证明 Candidate source、event 与 Episode 投影是否逐行一致，不自动改变任何生产 authority。

## 2. 唯一先决证据

唯一允许的输入是 `candidate-multi-cycle-lineage-evidence.v2`，状态必须为 `PASS_CYCLE3_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH`。Lineage 文件必须为私有普通单链接文件，并由一次性 request 逐字节 SHA-256 绑定。

Reconciliation 不再读取历史 Activation final、samples 或 closeout。历史 197 样本回滚与 Cycle-2 零样本失败不得通过重命名、复制或聚合进入本包。

## 3. 数据库与逐行对账

数据库固定使用 `REPEATABLE READ READ ONLY` 和 `SET LOCAL ROLE candidate_audit_role`。Lineage、request 与数据库必须同时精确证明 Cycle-1/2 为 `legacy/frozen/even epoch`，Cycle-3 为唯一 `shadow_capture/active/odd epoch`。

至少 10,000 条 `legacy_scan_candidate` completed source 必须逐行验证 source payload hash、projection command hash、Candidate event、Episode identity、release window 与时间边界。difference、duplicate source、duplicate event、outside lineage、pending、claimed、retry_wait 和 unresolved 全部必须为 0。

## 4. 输出边界

输出固定为 `candidate-cycle3-reconciliation-evidence.v2` 和 `PASS_CYCLE3_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL`，并绑定 Lineage 文件哈希与三个语义来源哈希。

`automaticPhaseAdvance`、`shadowVerifyTransitionExecuted`、Canonical read/write、Review read、production ranking、future outcome 输入和 `g0Completed` 必须全部为 false。

## 5. 当前真值

Cycle-3 生产 observer 仍在运行，双门禁尚未通过。当前包只做本地实现和 PostgreSQL 16 隔离演练，不读取生产 Lineage、不连接生产数据库。G0 主步骤仍为 7。
