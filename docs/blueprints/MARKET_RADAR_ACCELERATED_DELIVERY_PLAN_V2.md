# Market Radar 不降质极速交付计划 v2.0

状态：`ACTIVE_EXECUTION_OVERLAY`

生效日期：2026-07-19

适用范围：G0-G8 的工程组织、生产调度、观察、证据和自动交接。

本计划只压缩重复劳动、人工等待和返工概率，不改变 Gate 顺序、真实时间窗、样本分母、RR、Risk Gate、生产 WIP、回滚、安全和实战准入标准。

## 1. 当前事实与提速目标

当前生产仍为 `R1 / 可运行但不完整 / 不能支撑实战`。Cycle-5 观察因非原子快照等值判断误报而失败，自动回滚已通过；57 条捕获和 56 条有效样本只保留为失败历史，禁止复用。Cycle-6 的括号快照修复已形成 commit `abae0b5009d3cb40903d2c61b636252fa32f6679` 并推送，但尚未启动生产观察。

当前 G0 主步骤仍为 7。合并运输或自动交接不能减少主步骤；只有对应生产出口 Gate 真实 PASS 才能减数。

提速目标：

- 浏览器只负责一次生产列车启动，后续由 session-independent transient units 运行。
- 每个不可压缩的 24 小时或 7 天窗口只在真实业务失败时重启，不因观察器、传输、shell 或身份工具缺陷重启。
- 同一 immutable release candidate 只构建一次，按 image digest 晋级，不在相邻阶段重复构建相同内容。
- 同一 commit/tree/path-set/toolchain 的完整门禁只在 release candidate 边界执行一次；中间迭代先跑定向门禁，任何身份变化自动使缓存失效。
- 观察期间完成后续本地准备，使生产 Gate PASS 后无需再等待开发、报告或 Bundle 组装。
- 保持 Production WIP=1、Local Preparation WIP=1；只读观察可以多窗口独立运行。

## 2. 绝对不压缩的质量边界

以下项目保持原值或更严格：

1. Candidate 每个正式观察窗口至少 24 小时、289 个样本、10,000 次真实写入；短窗仍至少 1,800 秒、7 个样本、2 次 completion advances，最大样本间隔 600 秒。
2. Shadow Verify 与 Canonical Compat 各自使用独立窗口、独立样本、独立 evidence，不共享或继承上游样本。
3. HTTPS burn-in 7 天，G1 初始 SLO 7 天，G2 数据与 Tier SLA 14 天，G5 Shadow 至少 60 天，G7 paper 至少 30 天，G8 R4 维持至少 180 天。
4. RR 最低 3:1、结构止损、结构目标、WAIT/READY、Risk Gate、front-end 不造计划、future outcome 不回写生产排序。
5. 数据库/Feature Flag/writer/backfill/read cutover/restore/rollback/secret rotation 继续严格串行。
6. 每个子 Gate 继续拥有独立 manifest、request、nonce、fencing token、lease、preflight、rollback 和 final evidence。
7. 基础门禁、安全门禁、生产 smoke、Postgres、Redis、worker heartbeat、release identity 和回滚验证不删除。
8. formal backtest 仍只允许在明确能力验收轮运行，禁止自动执行。

## 3. 六项核心提速机制

### 3.1 G0.2 关闭列车

把已完成本地实现的相邻阶段封装为一次上传、一次外层启动、多个严格串行子单元：

```text
Cycle-6 dynamic preflight
-> Cycle-6 activate + 24h/289/10,000 observer
-> Cycle-6 final verify
-> Code Presence
-> Current-Cycle Lineage
-> Current-Cycle Reconciliation
-> Shadow Verify transition + 独立 24h/289 observer
-> Shadow Verify final verify
-> Canonical Compat transition + 独立 24h/289 observer
-> Canonical Compat final verify
-> Canonical read cutover + immediate/full smoke
```

外层单元只负责调度。每个箭头后的子 Gate 在运行时依据刚产生的前一阶段 evidence 动态生成自己的精确 request；不能预签结果，不能跨失败继续，不能共享 mutation lease。任一子 Gate FAIL 时停止列车，按该子 Gate 合同回滚或保持安全旧 authority，不执行后续步骤。

### 3.2 发布候选冻结与构建一次

- Cycle-6 启动前冻结 G0.2 release candidate 的 commit、tree、lockfile、Dockerfile、Compose 指纹和脚本 artifact。
- Web 与 Candidate Worker 在服务器只构建一次，保留 target digest 和 rollback digest。
- 后续 Code Presence、Shadow Verify、Canonical Compat 优先验证并复用精确 digest；只有路径集合或 runtime 合同确实变化才允许新构建。
- 任何源码、env、Compose、base image 或依赖指纹变化，冻结身份立即失效，必须重新跑完整门禁和动态 preflight。

### 3.3 生产前并发数字孪生

每个长观察器上线前必须在隔离 PostgreSQL 16 和容器环境执行 30 至 60 分钟高强度预演，至少覆盖：

- 并发 writer 位于 DB-before、API monitor、DB-after 三次读取之间。
- health 从 fresh 到 aging 再恢复 fresh，等待期间不产生业务写入或正式样本。
- Web/Worker 重启、observer 进程退出、浏览器断开和 transient unit 恢复边界。
- cycle/release/phase/epoch/deadline 漂移、时间倒退、样本间隔超限和旧 schema 样本。
- 10,000 级写入、零 unresolved、orphan/duplicate/mismatch 拒绝和自动回滚。

该预演不能代替生产时间窗，只用于把工具缺陷挡在 24 小时窗口开始前。

### 3.4 内容寻址门禁复用

建立 Gate receipt，至少绑定：

```text
commit + tree + changed path set + lockfile + toolchain
+ test command + test source hash + policy hash + environment class
```

- 开发迭代只跑受影响定向测试。
- release candidate 冻结后运行一次完整 typecheck、lint、test:market、build、backtest:golden 和三项安全门禁。
- 相邻生产子包只有在 receipt 全字段精确一致且未过期时才能复用结果；否则自动重跑。
- build 与 typecheck 不并发写 `.next`；先 typecheck，再 build。互不写共享目录的测试可并行。
- 失败、skip 增加、warning 增加、dirty worktree 或 hash 漂移都会使 receipt 无效。

### 3.5 观察与本地准备重叠

合法生产观察开始后，立即使用唯一 Lane B 准备下一个完整 Gate：

| 生产只读窗口 | 同时进行的本地工作 | 禁止提前声明 |
| --- | --- | --- |
| Cycle-6 24h | 冻结 G0.3 HTTPS/session、G0.4 release/evidence、G0.5 incident 子合同与测试 | G0.2 或 G0 PASS |
| Shadow Verify 24h | Canonical Compat final packet、G0.3 production preflight 模板 | Shadow Verify PASS |
| Canonical Compat 24h | Canonical cutover rehearsal、G0.3-G0.5 shared release train | Canonical authority |
| HTTPS 7d | G0.4/G0.5 最终本地包和 G1 全部本地准备 | G0 PASS |
| G1 SLO 7d | restore、ASVS、E2E/a11y/load 的非侵入准备 | G1 PASS |
| G2 SLA 14d | G3 fixture、holdout harness、研究数据清洗 | G2/G3 PASS |
| G5 Shadow 60d | G6 工作台实现与本地验收 | R4 |
| G7 paper 30d | G8 治理自动化准备 | R4/R5 |

### 3.6 一次运输与自动证据收口

- 每个生产列车只上传一个脱敏、确定性、内容寻址 Bundle。
- Bundle 在远端先做 SHA-256、size、gzip、tar 路径、manifest 和 secret boundary 校验，再进入 0700 staging。
- 浏览器断开后 transient unit 继续；日志、状态、final evidence 和 rollback evidence 写入仓库外固定目录。
- 报告、Context、Changelog、traceability 和清理 manifest 从机器 evidence 自动生成，人工只审阅异常和最终事实。
- 所有 staging、request 和 transport 清理必须 exact manifest + absence verify；未知文件隔离，不批量删除。

## 4. G0 剩余七个主步骤的极速路径

| 主步骤 | 生产出口 | 施工方式 | 最短硬时间 |
| --- | --- | --- | --- |
| 1 | Cycle-6 Shadow Capture PASS | 关闭列车启动，独立观察 | 24 小时 |
| 2 | Lineage + Reconciliation PASS | Cycle-6 PASS 后自动只读执行 | 通常 1 至 3 小时 |
| 3 | Shadow Verify PASS | 自动 phase transition，独立观察 | 24 小时 |
| 4 | Canonical Compat PASS | 自动 phase transition，独立观察 | 24 小时 |
| 5 | Canonical Read Cutover PASS | 短冻结、即时及持续 smoke、可回滚 | 2 至 4 小时 |
| 6 | G0.3 HTTPS/private session PASS | 独立发布和真实 burn-in | 7 天 |
| 7 | G0.4 release truth + G0.5 incident guards + G0 exit | 同一 release train、独立子 Gate | 4 至 12 小时 |

理想关键路径约 10 至 11 天，不包含真实缺陷修复时间。原先按人工逐包和重复上传执行，G0 可能继续拖到 2 至 4 周且每次工具误报都会增加至少 24 小时；v2 的目标是把额外管理时间压到硬观察时间的 10% 以内。

## 5. G0 之后的现实工期

不允许用开发完成代替市场时间和样本分母。按 Gate 顺序和允许的本地重叠：

- G0：成功启动 Cycle-6 后约 10 至 11 天。
- G1：G0 后至少 7 天，restore/ASVS/E2E 可与 SLO 窗口并行。
- G2：G1 后至少 14 天。
- G3：取决于至少 300 个 evaluable、3 个 regime 和 2 个 frozen holdout，不能给伪固定日期。
- G4：取决于至少 60 个真实 trigger、3 个 regime、2 个 holdout 和净收益置信区间，不能靠造样本加速。
- G5：G4 后至少 60 天。
- G6：大部分本地建设与 G5 并行，生产验收预计 3 至 7 天。
- G7：G6 后至少 30 天 paper workflow。
- G8：R4 后至少维持 180 天才可评审 R5。

从工程角度可以把大部分实现提前完成，但从实战证据角度，G0-G8 的理论下限仍是数月；真实合理区间约 12 至 18 个月，主要取决于 G3/G4 的市场 regime、样本和统计证据，而不是编码速度。

## 6. 反自欺控制台

每个子 Gate 自动输出以下机器字段，任何缺失都不能 PASS：

```text
sourceCommit / sourceTree / imageDigest / configFingerprint
entryCriteriaMetAt / observationStartedAt / observationEndedAt
sampleCount / eligibleSampleCount / realWriteCount / completionAdvances
healthReadyFreshRatio / unresolved / duplicate / orphan / mismatch
rollbackTarget / rollbackVerified / leaseReleased
targetedGateReceipt / baselineGateReceipt / securityGateReceipt
productionEvidenceSha256 / reportSha256 / cleanupVerified
```

强制检查：

1. 失败窗口是否仍被完整保留并明确标记 FAIL。
2. 是否把旧样本、pre-baseline、mock、fallback、0、stale 或 unavailable 计入 PASS。
3. 是否因为合并运输而合并了独立 Gate 或样本分母。
4. 是否存在 source/image/env/Compose 漂移后仍复用旧 receipt。
5. 是否有测试未跑、skip 增加、warning 增加或失败被二次命令覆盖。
6. 是否改变 scan/analysis/strategy/backtest 边界、RR、Risk Gate 或 authority。
7. 生产失败后是否真实回滚并重新验证，而不只是 runner 返回 0。
8. G0 主步骤是否只在对应生产出口 PASS 后减数。

## 7. 自动停止和自动继续

以下情况自动停止当前生产子 Gate并回滚或保持旧 authority：P0、secret、数据污染、future leak、WAIT/READY 错位、RR/Risk Gate 降低、数据库损坏风险、health 非 ready/fresh 超时、release identity 漂移、observer contract failure、回滚不可验证。

停止当前生产子 Gate不等于整个工程停摆。只要没有共同 P0，Lane B 可以继续准备与故障无依赖的下一本地包；修复只允许作用于失败子 Gate，完成定向和完整门禁后从新的正式窗口重新开始。

## 8. 立即执行顺序

```text
1. 对 commit abae0b5 做 fresh production read-only preflight
2. 生成 Cycle-6 精确 request 与单一确定性 Bundle
3. 通过 Microsoft Edge OrcaTerm 只上传并启动一次关闭列车
4. 验证 Cycle-6 第一条 sample v3、后台 observer、回滚目标和非目标服务
5. 观察运行期间完成 G0.3-G0.5 最终本地准备
6. Cycle-6 PASS 后由列车自动执行只读验证和后续 phase handoff
7. 每个生产出口 PASS 后按固定格式减少 G0 主步骤
```

当前不是重新设计系统，也不是增加新功能。v2 的第一目标是让已经具备的严格 Gate 能稳定、连续、可证据化地通过生产关键路径。
