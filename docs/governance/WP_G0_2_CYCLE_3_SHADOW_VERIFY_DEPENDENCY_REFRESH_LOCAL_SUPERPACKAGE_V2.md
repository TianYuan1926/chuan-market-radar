# WP-G0.2 Cycle-3 Shadow Verify Dependency Refresh v2

## 1. 目标

只刷新 Shadow Verify 的两个下游生产入口，使 Web-only 代码发布和 phase transition 均只接受 Cycle-3 统一 Lineage v2 与 Reconciliation v2。历史 v1 证据、两窗口模型和人工推导 epoch 必须失败关闭。

## 2. 核心链路

本包服务候选筛选与复盘进化之间的候选生命周期真值闭环。它不生成交易信号，不修改排序、方向、入场、止损、目标或 RR。

## 3. 允许范围

- Shadow Verify code authorization 治理校验。
- Shadow Verify Web-only release 的本地合同、runner 和攻击性测试。
- Shadow Verify phase transition 的本地合同、runner、攻击性测试和 PostgreSQL 16 隔离演练。
- 项目上下文、变更记录、本轮报告和自治状态。

## 4. 证据门禁

- Lineage 必须为 `candidate-multi-cycle-lineage-evidence.v2`，状态必须为 `PASS_CYCLE3_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH`。
- Reconciliation 必须为 `candidate-cycle3-reconciliation-evidence.v2`，状态必须为 `PASS_CYCLE3_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL`。
- Lineage 必须精确包含 Cycle-1、Cycle-2、Cycle-3 三个相邻 release window；前两轮是冻结的 legacy 偶数 epoch，当前 Cycle-3 是活动的 shadow_capture 奇数 epoch。
- 当前 migration 必须是 `candidate-episode-v1-cycle-3`；Lineage、Reconciliation、执行 request 和数据库身份必须一致。
- completed/compared writes 至少 10000，且两份证据计数必须相等。
- comparison difference、duplicate mapping、unresolved outbox 必须为 0。
- Reconciliation 必须绑定 Lineage 文件哈希和三个语义哈希。
- 自动 phase 推进、Shadow Verify transition、Canonical read/write、Review read、生产排序、未来结果输入和 G0 完成声明必须全部为 false。

## 5. 明确禁止

- 不连接生产，不上传生产包，不执行 Web 发布或 phase transition。
- 不修改数据库、Redis、环境变量、Feature Flag、migration 或任何生产服务。
- 不修改 frontend、API、scan、analysis、strategy、backtest、RR 和 trade plan。
- 不运行 formal backtest。

## 6. 测试顺序

1. Code authorization 定向合同和攻击性测试。
2. Web-only release 定向合同、可复现 bundle、私有证据和请求绑定测试。
3. Phase transition 定向合同、runner、生产边界和 PostgreSQL 16 隔离演练。
4. 自治范围门禁、基础五门禁和安全三门禁。

## 7. 完成边界

本地 PASS 只表示两个生产入口已能正确拒绝旧证据。本包不等于生产 Lineage PASS、生产 Reconciliation PASS、Web 发布 PASS、Shadow Verify 观察 PASS 或 G0 完成。
