# WP-G0.2 Post-Dormant Chain Clean Gate Integration v1

## 目标

本包只验证并行本地车道中的 Reconciliation、Canonical Read、Trusted Context 与 Review Truth 实现。它修复测试编译目录跨分支残留和 0 核心测试仍可能返回成功的证据缺口，不修改任何生产业务运行代码。

## 硬边界

- 每次 `build:market-cli` 先删除 `.tmp/market-tests`，并关闭 TypeScript incremental。
- `test:market` 必须先确认编译后的核心测试数大于 0。
- 干净编译必须重新生成 Canonical、Trusted Context 和 Review 的代表性测试。
- 五组 PostgreSQL 16 演练只连接隔离本地数据库，`productionConnected=false`。
- Activation 生产即时门禁已通过，但最终 24 小时/289 样本观察尚未 PASS；Canonical Read 授权继续为 false，不自动切 phase，不使用 future outcome，不修改 production ranking。
- 本分支包含 Canonical future-chain；Activation 最终观察和独立生产 Reconciliation 均通过前，绝对不得推进 `origin/main` 或生产接线。

## 当前证据

- 干净 `test:market`：995 pass、0 fail、7 个明确数据库 skip。
- 当前精确测试计数以本轮 clean gate 输出为准；历史计数不得冒充当前证据。
- PostgreSQL 16：Activation control start/rollback PASS；Reconciliation 10,000 writes / 0 difference / read-only PASS；Canonical Reader、Raw Oracle same snapshot、Trusted Context audit identity PASS。
- typecheck、lint、build、golden 16/16 和三项安全门禁 PASS。

## 结论

状态只能写本地 clean gate PASS。生产 Candidate Shadow Capture 正在观察但尚未最终 PASS，Canonical authority 仍为 false；系统仍为 R1、可运行但不完整、不能支撑实战。
