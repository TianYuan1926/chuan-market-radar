# WP-G0.2 Canonical Rollback State Machine Remediation Local Superpackage

## 1. 问题

现有 migration 009 允许 `canonical_compat -> canonical`，但没有任何受控的 `canonical -> legacy` 路径。直接进入最终 Canonical Read Cutover 后，故障只能让公开读取 fail closed 为 503，不能恢复旧读取，因此最终切换仍被阻断。

## 2. 本包目标

新增 migration 010，只增加一个回退专用过程：

```text
canonical / active / epoch N
-> legacy / frozen / epoch N+1
```

该过程只能由 `candidate_migration_role` 执行，必须携带精确 epoch、release 和 `sha256:` approval digest。它不允许前进切换，不允许任意目标 phase，不修改 Candidate 业务行，不修改 001-009。

## 3. 范围

允许：

- 新增 `010_candidate_canonical_rollback_safety.sql`。
- 新增治理合同、validator、负向测试和隔离 PostgreSQL 16 演练。
- 调整历史 migration 009 runner 测试，让它使用冻结的 1-9 fixture；旧 runner 继续拒绝含 010 的当前仓库，禁止复用。

禁止：

- 生产 migration、Canonical Cutover、Feature Flag、Web/Worker/Redis/Compose/env 变更。
- 修改 migration 001-009 checksum。
- 修改 scan、analysis、strategy、RR、Risk Gate、交易计划、backtest 或前端。

## 4. 失败关闭

以下任一条件必须拒绝且保持原状态：

- 当前 phase 不是 `canonical`；
- 当前 control 已冻结；
- epoch 不匹配；
- release 为空或 approval digest 不合规；
- 调用身份不是 `candidate_migration_role`；
- 重复回退或应用角色直接更新 control。

## 5. 真值边界

本地 PASS 只证明 migration 010 的设计、权限和隔离演练成立。它不等于 migration 010 已上生产，不授权 Canonical Cutover，也不完成 WP-G0.2 或 G0。
