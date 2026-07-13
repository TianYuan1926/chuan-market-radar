# Market Radar 不降质提速执行计划 v1.0

状态：`ACTIVE_EXECUTION_OVERLAY`
生效日期：2026-07-11
适用范围：工程蓝图 G0-G8 的执行组织、证据积累和生产变更调度
不改变：Gate 顺序、验收阈值、RR、Risk Gate、Shadow/holdout/paper 时间窗和人工审批边界

## 1. 目标

在不跳过 Gate、不缩短真实证据窗口、不降低安全或交易逻辑标准的前提下，减少等待、重复验证、人工命令和跨包返工。

当前关键路径：

```text
容量与恢复门禁（PASS）
-> WP-G0.2 Add Schema（已执行，verify 未通过）
-> Migration Runner post-schema verify 本地修复
-> 仅只读 production verify（需独立审批）
-> shadow_capture（继续禁止）
-> shadow_verify / reconciliation
-> canonical_compat
-> canonical
-> G0.3 / G0.4 / G0.5
-> G0 出口
-> G1-G8
```

当前事实：生产身份隔离、容量/恢复、Add Schema execute 和 production verify-only 均已有 PASS 证据。Add Schema 只执行过一次，8/8 migration applied；修复后的 Runner 在独立批准窗口内完成只读 verify，确认 schema present、ledger=8、owner membership=true、`execute=false`、`schemaChanged=false`。catalog 为 8 表、151 字段、20 函数、10 个 trigger object（14 个 trigger event row）、7 个角色；五个 Candidate Feature Flag 仍为 false，生产应用 release/image/worktree 未改变。Candidate schema 当前是 `applied_verified_dormant`，不等于 runtime 接入或 WP-G0.2 完成。

## 2. 四车道模型

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

### Lane C：自动持续观察

统一证据平台持续采集 release/config/Feature Flag、health、SLO、数据质量、样本分母、异常和回滚事实。各观察窗口共用采集设施和最终报告，但必须保持独立 entry criteria、开始时间、样本口径和 PASS/FAIL；前置条件通过前采集的数据只能叫 pre-baseline，不能计入正式窗口。

### Lane D：自动证据收口

每个包结束后自动运行定向、基础、安全与自治门禁，刷新 Context、Changelog、交付报告和机器状态；涉及生产证据时生成脱敏证据包。Lane D 不能改写已批准合同或用新报告覆盖历史失败，只能追加当前事实。

## 3. WIP 和合并纪律

- Production WIP：`1`。
- Local preparation WIP：`1`。
- Lane B 默认只提前一个完整 Gate；通用监控、测试和 runbook 可以更早准备，依赖真实观察的评分、阈值和策略不得提前冻结。
- Lane C 可以覆盖多个已经合法启动的观察窗口，但每个窗口独立计时、独立判定和独立失败。
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
| 3 | WP-G0.2 Add Schema rerun | A | PASS: applied and verified dormant | 禁止再次 execute；保持 Feature Flag=0 |
| 4 | Migration Runner post-schema verify fix | B | completed | NOINHERIT 回归与全部本地门禁 PASS |
| 5 | Production verify-only | A | PASS | execute=false、schemaChanged=false、catalog/health/worktree PASS |
| 6 | WP-G0.2 shadow_capture design/validator | B | local PASS | 生产结论固定 BLOCKED；已识别 5 项 blocker |
| 7 | WP-G0.2 shadow_capture local implementation + PostgreSQL rehearsal | B | local PASS | 原子 Outbox、quarantine、source-only consumer、PG16 empty/upgrade/failure PASS |
| 8 | WP-G0.2 production readiness + approval packet | B | local PASS | immutable resolution、runtime gate/mapper、monitor、009 checksum/权限/回退和 schema-only 审批包 |
| 9 | WP-G0.2 production add safety schema | A | PASS: 009 only applied and verified dormant | catalog 8/151/20/10/14/8 -> 9/166/26/11/16/9；Feature Flag=0；禁止再次 execute |
| 10 | WP-G0.2 production composition wiring | B | local PASS | 28/28 定向、PG16 完整 composition、legacy identity dormant fail-closed、permission 4/4 与基础门禁 PASS |
| 11 | WP-G0.2 production Web identity recovery | B -> A | PASS_PRODUCTION_WEB_IDENTITY_RECOVERY / cleanup complete / committed and pushed | exact approval 下只 no-build/no-source-sync/no-deps recreate Web；身份、persistence 和即时 ready/fresh 恢复，无 PARTIAL/rollback，生产 Git/image/非 Web 服务不变。远端16个精确临时文件已删除并逐项复核 absent；closeout 定向、基础、安全和自治门禁全部 PASS，commit=`5abb93cad2b3da4bbee0ab79015ea38f32a5a1bf` 已推当前分支与 GitHub main。后续持续健康 P1 作为独立包处理，不反向抹除 Recovery PASS |
| 11A | WP-G0.2 scan cadence/cache/freshness sustained health remediation | B -> A | local remediation candidate / autonomy 12/12 PASS / production P1 open | public/read 已结构性 no-refresh；只有受保护 action 可刷新；scanner 使用串行 fixed-rate、跳过错过窗口且不突发追赶；POST/Worker 区分 updated、in-progress、served-cache 和 failed；freshness 使用成功 completion 事实，锁释放失败 fail closed 且不写缓存。红灯缺口已真实记录，修复后定向55/55、worker23/23、test:market 960/0/4 skip、historical4/4、typecheck/lint/build/Golden16/16和安全门禁 PASS；自治总门禁12/12 PASS、`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。仍需 commit/main、绑定实际 Web+scanner-worker 变更面的独立 exact approval、生产部署及至少两个 cadence 周期无 aging/degraded/假 task-ok 观察；API/Web 合同变化不得伪装成 scanner-worker-only 部署 |
| 12 | WP-G0.2 dormant runtime deploy | A | post-Recovery release-diff local PASS / production prohibited by P1 | 14 文件 artifact=`b4fce8a6...`；release base/rollback 祖先、156 个 A/M 路径与 path-set SHA=`8aa96737...` 已锁定，历史149/`f39c8a...` 明确失效；必须先完成 Recovery closeout 和 scanner sustained-health remediation，再重新动态预检 |
| 13 | WP-G0.2 runtime identity + permission | A | local code/contract/runner/PG16 preparation PASS / production prohibited | NOINHERIT 显式角色、3 LOGIN/单 membership/跨角色拒绝已通过；仍需 dormant deploy final PASS 与独立审批 |
| 14 | WP-G0.2 activate + shadow observation | A | prohibited | runtime identity PASS + 独立审批；启动 72h lifecycle 和不少于 24h clean window |
| 15 | WP-G0.2 shadow_verify/reconciliation | A | prohibited | shadow_capture 稳定、>=10,000 compared writes + 独立审批 |
| 16 | WP-G0.2 canonical cutover | A | prohibited | reconciliation PASS + 独立审批 |
| 17 | WP-G0.3/G0.4/G0.5 | A/B | queued | WP-G0.2 完成并按独立包执行 |

## 9. 停止条件

任何 P0、测试失败、工作树污染、release mismatch、secret 命中、证据过期、备份/恢复失败、磁盘容量不足、生产 health 非 ready/fresh 或未经授权的状态变化都立即停止当前包和后续晋级。

## 10. 当前结论

容量/恢复、Add Schema、production verify-only、Shadow Safety Schema 009、本地 Composition Wiring 和 Dormant Deploy 本地准入已形成闭环证据。独立 Web Identity Recovery 已在 exact approval 下输出 `PASS_PRODUCTION_WEB_IDENTITY_RECOVERY`，Web 身份与 persistence 恢复，生产 Git/image 与非 Web 服务不变，Candidate 继续 dormant；远端16个精确临时文件已删除并复核 absent，closeout commit=`5abb93cad2b3da4bbee0ab79015ea38f32a5a1bf` 已推当前分支和 GitHub main。持续健康 P1 的本地修复候选已把 scanner 改为串行 fixed-rate/skip-missed，强制 readable snapshot no-refresh，让 POST 与 Worker 对非 updated fail closed，并以成功 completion 计 freshness；锁释放异常不再重复释放或写入未闭环缓存。红灯基线和首次断言差异均有记录，当前定向55/55、worker23/23、test:market 960/0/4 skip、historical4/4、typecheck/lint/build/Golden16/16和安全门禁 PASS；自治总门禁12/12 PASS、`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。生产尚未部署、跨周期观察尚未开始，所以 P1 仍开放，不能写持续健康 PASS。Dormant 完整 release path-set 仍为156/`8aa96737...`，Dormant 14文件 artifact=`b4fce8a64a9e468067101b50c2e5e59b5802d3f8b5459e176acb1bac25081e2c`，Runtime Identity 8文件 artifact=`d3b4f015e70a3b5e4310b5b635921f5b829c7e95854c4dcaf11bd1021adf08d0`；当前 Candidate runtime deployment=false、control lifecycle 未启动。下一步先完成 commit/main，再为 Web+scanner-worker 生成独立 exact approval 包并观察至少两个 cadence 周期；之后才可重新动态预检和申请 Dormant 审批。Runtime Identity、Writer、backfill、dual read 和 read cutover继续禁止。
