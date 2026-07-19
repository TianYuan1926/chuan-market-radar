# Market Radar 不降质极速交付计划 v3.0

状态：`ACTIVE_RECOVERY_TRAIN`

生效日期：2026-07-19

适用范围：G0-G8 的工程组织；当前执行焦点为 G0 Cycle-6 恢复与 fresh Cycle-7。

## 1. 当前生产真值

- Cycle-6 第 42 条采样因 `observation_unresolved_outbox` 失败，前 41 条有效样本和 5,218 次写入永久保留为失败历史，不复用、不重标 PASS。
- 自动回滚已通过：生产恢复到 rollback baseline commit `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、tree `eb217a7fbaad5b464279a08d4441a8249fc266e3`；失败观察使用的 target commit 为 `72ee289388eea922d0aee58fd4ec7a3f18a91007`。Cycle-6 为 `legacy/frozen/epoch2`，Candidate Worker absent。
- 精确恢复前数据库为 600 episodes、5,218 events、10,484 outbox；Legacy lane 有 48 条 pending，Candidate event mirror lane 有 5,218 条 pending，后者不是损坏也不得被 shadow consumer 提前消费。
- G0 主步骤仍为 7；本地修复、上传、即时启动和观察中状态都不能减数。

## 2. 提速来源

只压缩重复劳动和人工空等，以下标准一律不变：

1. Production WIP 保持 1；数据库、writer、phase、read authority 和回滚严格串行。
2. Candidate 正式窗口保持至少 24 小时、289 样本、10,000 次真实写入、最大 600 秒间隔。
3. 基础门禁、安全门禁、PostgreSQL 16 演练、生产 smoke 和证据签名不删除。
4. RR 3:1、WAIT/READY、Risk Gate、前端不造计划、future outcome 不写回生产排序全部锁死。
5. 失败样本、旧缓存、fallback、mock 和 unavailable 不得计入 PASS。

## 3. 三线流水

### 3.1 本地工程线

相邻且共享目标、发布身份和回滚边界的改动组成一个超级包。迭代时运行定向测试；发布候选冻结后只运行一次完整基础和安全门禁。任何源码、合同、依赖或测试身份变化都会使旧门禁收据失效。

### 3.2 生产单写入线

一次上传一个确定性脱敏 Bundle。每个内部子 Gate 仍拥有独立 preflight、request、authorization、lease、fencing token、rollback 和 evidence。前一子 Gate 未 PASS，后一子 Gate不能启动。

### 3.3 后台观察线

24 小时和 7 天窗口由 session-independent transient unit 运行。观察期间继续准备无生产冲突的下一包，但不能提前宣称观察通过或 authority 切换完成。

## 4. 当前恢复列车

```text
Cycle-6 failure immutable evidence
-> exact 48-row Legacy drain
-> verify legacy/frozen/epoch4 and mirror integrity
-> restore ready/fresh baseline
-> generate fresh Cycle-7 request from live preflight
-> start adjacent Cycle-7
-> bounded transient outbox recheck
-> independent 24h/289/10,000 observation
```

Cycle-6 drain 的成功边界固定为：

```text
Legacy completed 5,266; pending/unresolved 0
Candidate event pending 5,266; non-pending/orphan/mismatch 0
events 5,266; outbox 10,532
global completed 5,266; pending/unresolved 5,266
control legacy/frozen/epoch4; Candidate Worker absent
```

这里的全局 pending/unresolved 来自完整 Candidate event mirror lane，不得伪装成 Legacy 积压或强行清零。

Cycle-7 observer 只对精确 JSON 失败 `{status:"fail",reason:"observation_unresolved_outbox"}` 每 5 秒重查，最多 45 秒。其他错误立即失败；45 秒耗尽自动回滚；重查不产生正式样本。

恢复后的基线健康不再依赖生产宿主机上的 Node 或 Compose 环境插值；Drain runner 直接验证 `/api/health`、三个 Radar 合同端点、Postgres `pg_isready` 和 Redis `PONG`。任一真实条件不满足仍按原 1,200 秒上限失败并回滚，门槛没有降低。

## 5. 自动继续与自动停止

自动继续：定向测试、PG16 演练、基础门禁、确定性打包、只读 preflight、可逆生产子包、证据收口和精确临时文件清理。

当前生产子 Gate 自动停止并回滚：secret、身份漂移、数据库计数漂移、未知 source lane、orphan/mismatch、health 非 ready/fresh 超时、回滚不可验证、WAIT/READY 或 RR/Risk Gate 被放宽。

停止一个失败子 Gate 不停止整个工程。没有共同 P0 时，本地工程线继续准备无依赖工作；修复完成后必须使用全新窗口和全新 evidence。

## 6. G0 计数规则

| 主步骤 | 唯一减数证据 |
| --- | --- |
| Cycle fresh activation | 新周期完整生产观察 PASS |
| Lineage/Reconciliation | 当前周期生产只读全量对账 PASS |
| Shadow Verify | 独立生产 24 小时窗口 PASS |
| Canonical Compat | 独立生产 24 小时窗口 PASS |
| Canonical Read Cutover | 可回滚切换与持续 smoke PASS |
| HTTPS/private session | 可信入口与 7 天 burn-in PASS |
| Release truth/G0 exit | release、incident guard 和总出口 PASS |

合并运输、代码完成、测试通过、上传成功、即时启动和 observer running 均不减数。

## 7. 当前执行顺序

1. 冻结并推送 Cycle-6 recovery + Cycle-7 continuation release candidate。
2. 现场只读绑定生产镜像、env、Compose、控制行和精确计数。
3. 执行 Cycle-6 drain；任何计数漂移都在 mutation 前 fail closed。
4. 验证干净基线后生成 fresh Cycle-7 request，禁止复用 Cycle-6 request 或样本。
5. 启动 Cycle-7 后台观察；同时准备 G0.3-G0.5 非冲突本地包。
6. 每个真实生产出口 PASS 后才更新 G0 剩余步骤。

本计划的目标不是让报告更快变绿，而是让已经必须做的严格工作连续运行、一次做对，并把人工管理时间压到真实观察关键路径之外。
