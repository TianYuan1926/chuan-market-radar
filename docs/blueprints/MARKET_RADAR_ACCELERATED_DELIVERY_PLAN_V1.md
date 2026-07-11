# Market Radar 不降质提速执行计划 v1.0

状态：`ACTIVE_EXECUTION_OVERLAY`
生效日期：2026-07-11
适用范围：工程蓝图 G0-G8 的执行组织、证据积累和生产变更调度
不改变：Gate 顺序、验收阈值、RR、Risk Gate、Shadow/holdout/paper 时间窗和人工审批边界

## 1. 目标

在不跳过 Gate、不缩短真实证据窗口、不降低安全或交易逻辑标准的前提下，减少等待、重复验证、人工命令和跨包返工。

当前关键路径：

```text
容量与恢复门禁
-> WP-G0.2 Add Schema rerun
-> shadow_capture
-> shadow_verify / reconciliation
-> canonical_compat
-> canonical
-> G0.3 / G0.4 / G0.5
-> G0 出口
-> G1-G8
```

当前事实：生产身份隔离和 Migration Runner dry-run 已通过；容量/恢复整改也已通过。根盘最终 13%，fresh 加密离机备份 checksum/archive 验证通过，外部隔离 PostgreSQL 16 restore drill 为 RPO 14 分钟、RTO 53 秒，容量 validator 14/14 PASS、预计磁盘 18%。Candidate schema 仍不存在，migration 仍未获授权；当前只能申请 Add Schema rerun 的独立明确审批。

## 2. 双车道模型

### Lane A：生产关键路径

任何时刻最多一个生产 Work Package，必须串行：

1. 独立审批。
2. 锁定 commit、artifact、checksum、operator 和时间窗。
3. fresh worktree/runtime/database preflight。
4. fresh backup、恢复与容量门禁。
5. 最小生产变更。
6. 定向验证、基础门禁和生产 smoke。
7. 30-60 分钟观察或该包指定证据窗口。
8. PASS 后才开放下一审批点。

生产数据库 DDL、Feature Flag、writer、backfill、read cutover、restore、rollback 和 secret rotation 不允许并行。

### Lane B：本地准备与证据工程

Lane A 执行或等待人工审批时，最多允许一个非侵入准备包：

- 定向测试、fixture 和失败基线。
- evidence schema、validator、报告模板和回滚检查。
- 下一包的只读 preflight、容量计算和 runbook。
- DNS、TLS、异地备份目标等外部条件准备。
- 已上线能力的 SLI/SLO 数据采集，不改变生产状态。

Lane B 不得连接生产执行写操作，不得提前启用下一 Gate 的 runtime 行为，不得把准备完成写成能力完成。

## 3. WIP 和合并纪律

- Production WIP：`1`。
- Local preparation WIP：`1`。
- 每个包只允许一个核心问题和固定文件 allowlist。
- 多 worktree/并行审查仅用于读取、测试或互不重叠的准备；由一个集成负责人合并。
- 不在同一包混合数据库、策略、UI 和部署。
- 生产服务器不是开发工作树；GitHub commit 和 image digest 必须是发布正本。

## 4. 可以重叠的证据窗口

| 已通过的前置 Gate | 立即启动 | 可并行的本地工作 | 不得提前声明 |
| --- | --- | --- | --- |
| HTTPS 上线 | 7 天 TLS burn-in | G0.4/G0.5 准备 | G0 PASS |
| G0 出口 | G1 7 天初始 SLO | restore/ASVS/E2E 实现 | 可持续 R1 |
| G1 出口 | G2 14 天数据/Tier SLA | G3 fixture/holdout harness | 候选能力有效 |
| G4 出口 | G5 60 天真实 Shadow | G6 工作台实现 | R2/R3 |
| G6 出口 | G7 30 天 paper workflow | readiness evaluator | R4 |

证据窗口可以与后续本地准备重叠，但不得与其前置生产 Gate 重叠，也不得使用窗口未完成的数据晋级。

## 5. 不可压缩项

- Candidate migration 每个生产阶段的独立审批。
- fresh 加密异地备份和隔离 restore drill。
- 生产 worktree/release/image/evidence 对齐。
- HTTPS 7 天、G1 初始 SLO 7 天、G2 数据证据 14 天。
- 两个 frozen holdout、G4 最少 60 triggers。
- G5 至少 60 天真实 Shadow。
- G7 至少 30 天模拟决策。
- RR `>=3:1`、结构止损、目标位、WAIT/READY 和 Risk Gate。
- secret、安全、forbidden-file、基础门禁和生产观察。

## 6. 可压缩项

- 用机器 JSON 代替重复人工抄写状态。
- 定向测试先行，候选提交只运行一次完整基础门禁。
- evidence/report/ZIP/secret scan 统一生成和校验。
- 在等待审批时完成下一包的只读模板和测试准备。
- 外部域名、DNS、磁盘和恢复目标提前采购与配置。
- 长证据窗口开始后立即推进不改变其前提条件的本地工作。

## 7. 当前容量与恢复门禁

执行工具：

```bash
npm run migration:capacity:template -- --output /secure/path/capacity-input.json
npm run migration:capacity:evaluate -- --input /secure/path/capacity-input.json --output /secure/path/capacity-result.json
npm run test:migration-capacity
```

输入只能包含脱敏数字和布尔证据，禁止连接串、角色名、用户名、密码、token 或业务行。硬门禁：

- 容量证据不超过 15 分钟。
- 预计操作后主机磁盘使用率 `<=70%`。
- 本地可用空间覆盖 backup/temp/WAL/rollback/safety reserve。
- 加密异地备份不超过 15 分钟，checksum 和 archive 均验证。
- 外部隔离恢复目标容量充足。
- restore drill 通过且不超过 90 天。
- RPO `<=24h`，RTO `<=2h`。

工具只判断是否可以“申请 Add Schema rerun 审批”，永远不授权或执行 migration。

## 8. 当前执行队列

| 顺序 | Work Package | Lane | 当前状态 | 放行条件 |
| --- | --- | --- | --- | --- |
| 1 | WP-ACCEL-01 Safe Delivery and Capacity Gate | B | completed | 工具、测试、治理门禁通过 |
| 2 | Production capacity/off-host restore remediation | A | pass | 根盘 13%、fresh 加密离机备份、真实隔离恢复、容量 14/14 PASS |
| 3 | WP-G0.2 Add Schema rerun | A | approval pending | 第 2 项 PASS；仍需新的独立明确审批 |
| 4 | WP-G0.2 shadow_capture | A | prohibited | Add Schema PASS + 独立审批 |
| 5 | WP-G0.2 shadow_verify/reconciliation | A | prohibited | shadow_capture 稳定 + 独立审批 |
| 6 | WP-G0.2 canonical cutover | A | prohibited | reconciliation PASS + 独立审批 |
| 7 | WP-G0.3/G0.4/G0.5 | A/B | queued | WP-G0.2 完成并按独立包执行 |

## 9. 停止条件

任何 P0、测试失败、工作树污染、release mismatch、secret 命中、证据过期、备份/恢复失败、磁盘容量不足、生产 health 非 ready/fresh 或未经授权的状态变化都立即停止当前包和后续晋级。

## 10. 当前结论

提速计划已启动，容量与恢复前置条件已经形成 PASS 证据。该 PASS 不授权 migration；下一生产动作必须先获得 `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA-RERUN` 的独立明确审批，未批准前继续禁止 DDL、writer、backfill 和 read cutover。
