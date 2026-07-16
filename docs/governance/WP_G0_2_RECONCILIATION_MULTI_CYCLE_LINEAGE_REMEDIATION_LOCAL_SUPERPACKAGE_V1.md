# WP-G0.2 Reconciliation Multi-Cycle Lineage Remediation Local Superpackage v1

状态：`LOCAL_PREPARATION_ONLY`
生产授权：`false`
生产执行：`false`

## 1. 问题

旧 Reconciliation 把 migration 固定为 `candidate-episode-v1`，并只读取当前 release 的 Source Outbox。Validation Cycle Continuation 允许多个不可变 72 小时周期累计真实写入后，这个实现会遗漏历史周期，导致 10,000 条门禁无法真实验收，或被错误缩小为“只核对当前周期”。

这是 G0 核心链路的 P1 死路，不能通过降低 10,000 条阈值、延长旧 deadline、复活旧周期或只比较聚合总数解决。

## 2. 修复边界

本包只修改 Candidate Reconciliation 的治理合同、只读 runner、生产包请求验证、入口证据挂载和隔离演练：

- Activation 原始身份绑定第一个 release 窗口。
- 当前 production 身份绑定最后一个新鲜验证窗口。
- cycle 必须从 v1 开始严格连续，release 唯一，每个窗口精确 72 小时。
- 每条 Source/Event/Episode 按自身 release 窗口核对。
- 数据库全部 Candidate control 与请求血缘必须一一匹配。
- 历史 control 必须 Legacy/frozen，当前 control 必须唯一 shadow_capture active。
- 所有 `legacy_scan_candidate` 行必须属于批准血缘，outside-lineage 最大值为 0。
- Reconciliation 仍为 `REPEATABLE READ READ ONLY + candidate_audit_role`，不允许任何阶段推进。
- 生产核对要求 Candidate Worker 正在运行且健康、系统 ready/fresh；不允许用停掉 Worker 的方式伪造静态成功。

本包不修改 scan、analysis、strategy、RR、Risk Gate、交易计划、frontend、API、migration、Compose、env、Redis、Worker 或生产服务。

## 3. 证据要求

未来生产 request 必须同时绑定：

1. Activation final、closeout、289 原始样本及各自 SHA-256。
2. Activation production commit 和首个写 epoch。
3. 独立 `lineage-final.json` 的固定私有路径、权限和 SHA-256。
4. 完整 `sourceReleaseWindows`。
5. 当前 production commit、Web image、Compose/env 指纹和最后一个 release/epoch。
6. commit-bound runner artifact、脱敏 Bundle、一次性 90 分钟 authorization 和仓库外 WIP=1 lease。

Lineage evidence 必须声明累计 completed writes 至少 10,000、unresolved=0、门槛未改变、Reconciliation/Shadow Verify/Canonical/G0 均未提前执行。

## 4. 本地验收

- Runner/governance：多周期 PASS、单周期硬编码防回归、9,999、未决状态、血缘外写入、行级漂移全部 fail closed。
- Production packet：请求、Authorization、Activation、Lineage、transport、权限和无 mutation 边界全部验证。
- PostgreSQL 16：cycle1 与 cycle2 各 5,000 条，合计 10,000 条逐笔 0 difference；只读事务拒写；增加未批准 cycle3 control 后必须拒绝；最终 phase 仍为 `shadow_capture`。
- 基础门禁和安全门禁必须全部 PASS；formal backtest 禁止运行。

## 5. 当前真值

当前生产 Activation observer 仍在运行，最近只读证据为 96/289、累计 completed writes=1481。生产 Reconciliation 没有执行，本包也不授权执行。系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`，G0 未完成。
