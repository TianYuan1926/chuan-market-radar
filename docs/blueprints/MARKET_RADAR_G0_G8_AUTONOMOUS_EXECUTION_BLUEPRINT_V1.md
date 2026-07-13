# Market Radar G0-G8 全自动工程执行蓝图 v1.0

状态：`ACTIVE_FAIL_CLOSED`

生效时间：2026-07-14

权威上游：

- `MARKET_RADAR_ENGINEERING_BUILD_BLUEPRINT_V1.md`
- `MARKET_RADAR_PRODUCTION_RUNTIME_BLUEPRINT_V1.md`
- `2026-07-10-market-radar-practical-readiness-master-plan-v3.md`
- `G0_G8_STANDING_AUTONOMY_AUTHORIZATION_V1.json`

本蓝图只定义如何连续执行，不改变既有 Gate 顺序、产品核心、验收阈值、真实观察时间或交易逻辑红线。

## 1. 唯一目标与完成定义

唯一目标：

```text
快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。
```

所有工作必须明确进入以下核心链路之一：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

基础设施、安全、发布、备份和可观测性属于 supporting 工作，但必须证明它支撑哪一环。纯装饰、重复页面、平行事实源、无法提升实战链路的功能不进入自动队列。

“完成”必须同时满足：代码存在、定向测试通过、固定基础和安全门禁通过、真实生产身份对齐、所需观察和样本阈值满足、当前证据未过期、回滚可用、Context/Changelog/报告已收口。任何一项缺失只能标记 `可运行但不完整`、`临时验证版`、`等待外部条件` 或 `不能支撑实战`。

## 2. 自动执行权限与边界

用户直接授权 Codex 连续执行 G0-G8，不再逐包等待重复确认。该授权允许创建逐包精确执行记录，不允许控制器创造新的用户权限。

永久禁止：

- 自动下单或接交易所下单 API。
- RR 小于 `3:1`、放宽 Risk Gate、WAIT/WATCH 冒充 READY。
- 前端生成方向、entry、stop、target、RR 或计划。
- future outcome、MFE、MAE、hit、qualityHit 回写 production score。
- 自动修改生产策略权重或把新研究假设直接上线。
- formal 回测自动运行。
- 破坏性 schema、生产业务数据删除、生产数据库 restore、未知目标批量删除。
- secret 输出、提交或进入证据包。
- 缩短真实观察窗口、篡改时间戳或用 pre-baseline 冒充正式样本。
- 越过未通过 Gate 或扩展到 G9。

新的交易规则、阈值或风险哲学如果蓝图没有明确批准，只能进入 Proposal/Research/Frozen Shadow，不得自动成为生产规则。

## 3. 四车道与 WIP

### Lane A：生产关键路径

同时最多一个生产 Work Package。DDL、Feature Flag、writer、backfill、read cutover、secret rotation、restore 和 rollback 串行执行。

### Lane B：下一 Gate 本地准备

同时最多一个非侵入准备包。可以写测试、fixture、validator、runbook 和下一包代码；不得提前激活生产行为或把准备结果写成 Gate PASS。

### Lane C：只读观察

合法启动后的 SLO、TLS、数据 SLA、holdout、Shadow、paper 和治理窗口可以持续采集。每个窗口有独立 entry time、release、样本分母、状态和出口判定。

### Lane D：证据收口

自动执行定向、基础、安全和自治门禁，更新 Context、Changelog、交付报告与 traceability。历史失败只能追加后续事实，不能被覆盖或删除。

固定 WIP：

```text
Production WIP = 1
Local Preparation WIP = 1
Read-only Observation = 多窗口但独立合同
Evidence Closeout = 当前包唯一
```

## 4. 每个 Work Package 的机器生命周期

```text
DISCOVER
-> SCOPE_LOCKED
-> RED_BASELINE_CAPTURED
-> IMPLEMENTED
-> TARGETED_PASS
-> BASELINE_AND_SECURITY_PASS
-> READ_ONLY_REVIEW_PASS
-> COMMIT_TREE_BOUND
-> PRODUCTION_PREFLIGHT_PASS
-> MUTATION_LEASE_ACQUIRED
-> DEPLOYED_OR_ROLLED_BACK
-> OBSERVING
-> EXIT_PASS / PARTIAL / FAIL / BLOCKED
-> EVIDENCE_CLOSED
```

每个包必须具备：

1. 一个明确问题和一个 Gate。
2. 核心链路影响。
3. 文件 allowlist 与 prohibited paths。
4. 红灯失败基线或明确“不需要红灯”的理由。
5. 定向测试。
6. 固定基础门禁：typecheck、lint、test:market、build、backtest:golden。
7. 固定安全门禁：forbidden-files、secret-patterns、security-check。
8. commit、tree、diff、path-set、artifact、runner、policy 与 gate evidence 绑定。
9. 生产动态 preflight、备份/恢复证据、rollback target。
10. 最长 90 分钟 mutation 窗口、仓库外租约、递增 fencing token、一次性 nonce。
11. 生产 smoke、观察合同、真实 PASS/FAIL。
12. 中文报告、Context、Changelog 和 traceability。

## 5. G0-G8 执行矩阵

| Gate | 核心目标 | 顺序 Work Packages | 关键出口 | 不可压缩证据 |
| --- | --- | --- | --- | --- |
| G0 | 事实、安全、生命周期、HTTPS、发布真值 | G0.2 scanner/candidate lifecycle -> G0.3 HTTPS/session -> G0.4 release/evidence -> G0.5 incident registry | 无假事实；HTTPS/private session；runtime/release/Git/image/content 对齐 | TLS burn-in 7 天 |
| G1 | 可持续运行、恢复、安全、测试 | G1.1 SLO -> G1.2 backup/restore -> G1.3 ASVS -> G1.4 E2E/a11y/visual/load | 初始 SLO、RPO/RTO、ASVS、CI release gates | 初始 SLO 7 天；真实隔离 restore |
| G2 | 可追溯数据平面 | G2.1 MarketFact -> G2.2 identity -> G2.3 quota/deep SLA -> G2.4 microstructure -> G2.5 compliance | fact envelope 100%；light/deep SLA；无别名静默冲突 | 数据与 Tier SLA 14 天 |
| G3 | 可验证候选层 | G3.1 Episode -> G3.2 score purity/RS -> G3.3 pre-move research -> G3.4 movers control -> G3.5 holdout | scan >=70；pre-move/actionable 提升；late/noise 受控 | >=300 evaluable；3 regimes；2 frozen holdouts |
| G4 | 可验证分析与策略层 | G4.1 single path -> G4.2 levels/WAIT -> G4.3 costs/risk -> G4.4 strategy holdout | analysis >=70；strategy >=65；READY 合同 100%；无 future leak | >=60 real triggers；3 regimes；2 holdouts；net R CI >0 |
| G5 | 真实 Shadow 闭环 | G5.1 canonical store -> G5.2 outcome integrity -> G5.3 frozen A/B | due >=99%；duplicate=0；无 production mutation | >=60 天且 >=500 episodes、>=60 triggers |
| G6 | 可操作专业工作台 | G6.1 page convergence -> G6.2 review modes -> G6.3 alerts -> G6.4 optional export | 核心工作流 E2E/a11y；提醒可追溯；隐私隔离 | 多视口和关键工作流证据 |
| G7 | 模拟决策与 R4 准入 | G7.1 paper workflow -> G7.2 evaluator -> G7.3 final review | readiness >=85；否决项=0；外部审计与用户最终决定 | >=30 天且 >=30 个完整模拟流程 |
| G8 | 长期治理与 R5 评审 | daily/weekly/monthly/quarterly governance -> degradation -> cost/source/rule retirement | 可自动降级、不自动调规则；多 regime 无静默退化 | R4 维持 >=180 天 |

Gate 只允许顺序 PASS。后续 Gate 的本地准备可以提前一个完整 Gate，但不能激活其生产 authority，也不能使用尚未完成的观察结果晋级。

## 6. 当前真实起点与 G0 关键路径

当前只能标记：`R1 / 可运行但不完整 / 不能支撑实战`。

已确认事实：

- WP-G0.1 已生产验证。
- Candidate migrations 1-9 已生产 applied/verified/dormant。
- Candidate Runtime disabled，writer/read authority 未切换。
- Web identity recovery 已 PASS。
- Scanner sustained-health 发布曾因前台会话中断失败；生产已恢复 baseline，但重建 scanner digest 与历史 digest 不相同。
- session-independent runner 与 rollback image retention 已完成本地加固。
- Scanner sustained-health 仍是当前 P1，未生产重发和完成 1800 秒/至少两个 completion advances 观察。

唯一允许的近期生产顺序：

```text
1. G0-G8 控制层完整门禁与提交
2. Scanner sustained-health 动态只读 preflight
3. 生成绑定当前 commit/tree/artifact/environment 的单次执行记录
4. 取得仓库外生产租约和 fencing token
5. 只发布 Web + scanner-worker
6. 连续 1800 秒且至少两个扫描完成推进观察
7. PASS 后释放 Dormant Runtime
8. Runtime Identity
9. Shadow Capture 与生命周期观察
10. Shadow Verify / Reconciliation
11. Deterministic Backfill / Canonical Compat
12. Canonical Read Cutover
13. G0.3 HTTPS/session
14. G0.4 release/evidence
15. G0.5 incident guards
16. G0 出口
```

任一失败只允许最小修复或自动回滚，不跳到下一个生产包。

## 7. 观察窗口调度

- 生产 mutation 完成并稳定后立即释放 90 分钟租约，观察转为只读。
- 正式窗口从 entry criteria 全部满足后的机器时间开始。
- release/config/identity 变化使窗口失效或重新开始，规则由各窗口合同定义。
- pre-baseline 数据保留用于诊断，但不计正式样本。
- 观察期间可以推进下一包本地准备，不得提前执行其生产 mutation。
- 时间到但样本不足时继续观察；样本够但时间不足也继续观察。
- P0、false ready、future leak、secret、数据污染或生产身份漂移立即失败并触发降级/回滚。

## 8. 清污协议

污染对象分为：

- `task-generated`: 本轮误生成、未跟踪且 owner 明确。
- `expired-transport`: 已失效 bundle/request/staging。
- `duplicate-generated`: hash 和语义均证明重复。
- `obsolete-tracked`: 已被权威路径替代且测试证明可删除。
- `unknown`: 来源或用途无法证明。

前四类只有在 exact manifest、owner/purpose、hash/absence contract、blast-radius check、删除后 absence/health 验证齐全时才可自动删除。`unknown` 必须隔离和报告，不自动删除。生产业务行、数据库 volume、活动事故证据和没有轮换方案的 secret 永远不进入自动删除。

## 9. 部署与回滚

- GitHub main 是长期代码正本；生产不现场开发。
- 每次 release 绑定 commit、tree、image digest、Compose、env 指纹、migration status、release record 和 rollback target。
- 默认通过服务器自拉、self-hosted runner 或固定脚本，不反复临时 SSH。
- migration 只允许 additive、精确 checksum、独立 identity、fresh backup、隔离 restore 和 single-writer。
- rollback 必须证明 schema 兼容；无法安全 rollback 的动作不自动执行。
- health、contract、worker、Redis、Postgres、release identity 任一失败都不能写生产正常。

## 10. 反自欺审计

每个包结束自动回答：

1. 哪个真实失败基线被关闭？
2. 哪个测试能在回归时重新变红？
3. 当前证据是否绑定当前 commit/tree/artifact/production identity？
4. 是否有旧缓存、fallback、0、mock 或 unavailable 被包装？
5. 是否改变了 RR、READY、Risk Gate 或 future-outcome 边界？
6. 是否满足真实时间和样本分母？
7. 是否存在未解释 skipped test、partial、dirty worktree 或 digest drift？
8. 生产失败时是否真的回滚并重新验证？
9. 清污对象是否逐路径证明？
10. 本包对唯一核心的贡献是否可衡量？

任一答案不完整，状态不得为 PASS。

## 11. 自动推进与停止

自动推进只发生在当前包 `EXIT_PASS + EVIDENCE_CLOSED` 后。`PARTIAL` 允许修复当前包，`BLOCKED` 允许推进不依赖该外部条件的本地准备，均不允许生产越级。

遇到 secret 泄露、测试失败、production degraded、mock 冒充真实、WAIT 冒充 READY、candidate 冒充 signal、future outcome 污染 production、数据库风险、交易计划错误或 stale cache 冒充 fresh，立即停止无关开发，只处理该 P0/P1。

## 12. 当前立即执行

```text
WP-AUTO-02-G0-G8-STANDING-AUTHORITY-AND-EVIDENCE-HARDENING
-> 全部定向/基础/安全/自治门禁
-> commit + push
-> WP-G0.2-SCAN-SUSTAINED-HEALTH-PRODUCTION-RELEASE
```

在 Scanner sustained-health 真实 PASS 前，Dormant Runtime、Runtime Identity、Shadow、backfill、canonical cutover、HTTPS 后续生产包和 G1-G8 生产晋级全部保持关闭。
