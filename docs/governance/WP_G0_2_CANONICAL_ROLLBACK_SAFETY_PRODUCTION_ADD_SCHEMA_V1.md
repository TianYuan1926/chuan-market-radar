# WP-G0.2 Canonical Rollback Safety Production Add Schema

## 目标

只把已审计的 migration 010 安全加入生产，使最终 Canonical Read Cutover 在失败时具备受控回到 `legacy/frozen` 的数据库能力。本包不切换 Candidate phase，不部署服务，不修改 Feature Flag。

## 精确边界

- 生产基线必须恰好是 migration 001-009，版本、checksum 和 `applied` 状态逐项一致。
- 唯一待执行项必须是 `010_candidate_canonical_rollback_safety`，SHA-256 固定为 `2ae3247a64e08159adfb74a6da48bf0a51a45cba356fe4ad666482a18d0cb1ba`。
- 生产不得已经处于 `canonical`；最终切换必须等待本包成功验证。
- 使用非特权 `market_radar_migration_login`，只在事务内切换到 `candidate_migration_role`。
- 事务使用 advisory lock、`REPEATABLE READ`、5 秒锁等待、30 秒语句超时和 60 秒空闲事务超时。
- migration 只允许新增 rollback-only function 和 ledger 010；Candidate 业务行、服务、Git、Compose、env、Redis、Worker 和 Feature Flag 不变。

## 失败处理

提交前任何失败由数据库事务整体回滚。提交后禁止删除 function 或伪造 rollback；若提交后验证失败，必须标记 P0 并保留证据，因为 migration 010 是安全基础设施且历史 ledger 不得改写。

## 真值

当前只完成本地执行包准备，生产未连接、未执行，Canonical Cutover 仍未授权。只有生产 ledger 精确达到 10、function owner/SECURITY DEFINER/search_path/ACL 全部正确、服务与 Git 身份不变且 health 前后通过，才可写 Add Schema PASS。
