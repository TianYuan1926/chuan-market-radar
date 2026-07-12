# WP-G0.2 Post-Dormant Chain Clean Gate Integration v1

## 目标

本包只验证隔离 future-chain 中已经完成的 Runtime Identity、Activation、Reconciliation、Canonical Read、Trusted Context 与 Review Truth 本地实现。它修复测试编译目录跨分支残留和 0 核心测试仍可能返回成功的证据缺口，不修改任何业务运行代码。

## 硬边界

- 每次 `build:market-cli` 先删除 `.tmp/market-tests`，并关闭 TypeScript incremental。
- `test:market` 必须先确认编译后的核心测试数大于 0。
- 干净编译必须重新生成 Canonical、Trusted Context 和 Review 的代表性测试。
- 五组 PostgreSQL 16 演练只连接隔离本地数据库，`productionConnected=false`。
- 当前代码的 Activation 和 Canonical Read 授权继续为 false，不自动切 phase，不使用 future outcome，不修改 production ranking。
- 本分支包含 Dormant 之后的未来代码，Dormant production deploy PASS 前绝对不得合入当前 `main`。

## 当前证据

- 干净 `test:market`：995 pass、0 fail、7 个明确数据库 skip。
- Activation 12/12、Reconciliation 8/8、Canonical Read 14/14、Oracle 23/23、Route 12/12、Trusted Context 19/19、Review 42/42。
- PostgreSQL 16：Activation control start/rollback PASS；Reconciliation 10,000 writes / 0 difference / read-only PASS；Canonical Reader、Raw Oracle same snapshot、Trusted Context audit identity PASS。
- typecheck、lint、build、golden 16/16 和三项安全门禁 PASS。

## 结论

状态只能写 `PASS_LOCAL_POST_DORMANT_CHAIN_CLEAN_GATE`。生产仍是旧 release，Candidate runtime 未部署、未激活，系统仍为 R1、可运行但不完整、不能支撑实战。
