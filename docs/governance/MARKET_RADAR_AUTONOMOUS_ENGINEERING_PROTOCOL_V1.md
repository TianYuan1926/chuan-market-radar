# Market Radar G0-G8 全自动工程协议 v1.0

状态：`ACTIVE_FAIL_CLOSED`

适用范围：覆盖 G0-G8 本地施工、验证、提交、生产发布、真实观察、修复、证据收口与精确污染清理。

不授权：G9 及以后、自动下单、交易所下单 API、自动调权、未批准的交易规则变化、放宽 READY/RR/Risk Gate、缩短观察窗口、formal 自动回测、破坏性生产数据操作、未知目标批量删除、控制器自批或用失败证据标记 PASS。

## 1. 大白话定义

用户已经直接批准 Codex 按蓝图连续完成 G0-G8，不再逐个常规工作包等待重复授权。这个长期授权只消除等待，不消除 Gate、质量、真实时间和工程防线。

每个生产工作包仍必须有精确范围、最长 90 分钟窗口、提交和树绑定、证据哈希、外部生产租约、一次性 nonce、回滚目标与观察合同。任一条件失败，当前包停止并进入修复或回滚，不得把失败包装成完成。

```text
用户 G0-G8 长期授权
-> 精确工作包
-> 动态预检
-> 固定质量门禁
-> 外部租约与 fencing token
-> 单次生产执行
-> 观察与只读验证
-> PASS / 回滚 / 如实阻塞
```

审核 Agent 只能独立找问题和复核证据，不能替用户授权，也不能修改包内容、门禁或质量阈值。

## 2. 唯一机器正本

根目录 `AUTONOMOUS_ENGINEERING_STATE.json` 是自动施工状态正本，记录：

- 当前真实等级和实战状态。
- 当前唯一 Work Package。
- 允许和禁止修改的路径。
- 不可修改的质量锁。
- 定向、基础和安全门禁。
- 用户 G0-G8 长期授权与逐包精确执行记录。
- 后续队列和 WIP 状态。

状态文件不能替代 Git、测试、数据库或生产事实。多种证据冲突时，以更差的结果为准。

## 3. 不可修改的质量锁

- 结构 RR 最低 `3:1`。
- 不自动下单，不接交易所下单 API。
- 不自动修改实时排序、READY 或策略权重。
- 不使用 future outcome、MFE、MAE、hit 或 qualityHit 影响生产判断。
- 前端不能创建交易计划。
- formal 回测不能由自动流程执行。
- 控制器不能把自己生成的记录当作新的用户授权。
- G0-G8 长期授权不能扩展到 G9 及以后。
- 审核 Agent 不能成为授权者。
- 破坏性 DDL、生产业务数据删除、生产数据库恢复和未知目标批量删除不能自动执行。
- 失败、过期、partial、stale 或缺失证据不能写成 PASS。

依赖这些质量锁验收的工作包，不能在同一包修改质量锁。

## 4. G0-G8 用户长期授权

权威合同：`docs/governance/G0_G8_STANDING_AUTONOMY_AUTHORIZATION_V1.json`。

授权来源是当前任务中的用户直接批准。它允许 Codex 在 G0-G8 内创建逐包精确执行记录，但不允许 Codex：

- 扩大到 G9、跳过 Gate，或改变项目核心目标。
- 降低质量、门禁、观察时间或交易逻辑红线。
- 把失败、过期或伪造证据写成 PASS。
- 删除生产业务数据、数据库 volume 或未知文件。
- 绕过生产单写入者、外部租约、fencing token、一次性消费和自动回滚。

授权在 G8 出口真实 PASS 或用户撤销时终止。撤销发生在 mutation 中途时，只允许完成安全检查或自动回滚，然后停止。

## 5. 逐包生产执行合同

每个生产工作包必须绑定：

- `grantId`、Gate、Work Package、action class、risk tier。
- base/target commit、target tree、diff 与 path-set SHA-256。
- contract、runner、artifact、image/migration、Compose、environment、production identity SHA-256。
- gate evidence、动态 preflight、backup/restore、rollback target、observation contract 与 policy SHA-256。
- 唯一 approval ID、nonce、production lease ID、fencing token、revocation epoch。
- 最长 90 分钟窗口和 `maxExecutions=1`。
- 质量未改变、蓝图范围匹配、门禁真实通过、回滚已验证、WIP 可用、无 secret、无 P0、清污清单精确等断言。

Production WIP 永远最多 1，Local Preparation WIP 永远最多 1。任一前置包为 FAIL/PARTIAL/BLOCKED 时，后续生产包不能越级。

## 6. 外部信任根与证据真值

生产租约、fencing counter、撤销 epoch 和授权消费账本必须位于仓库外的绝对路径，由 `MARKET_RADAR_AUTONOMY_TRUST_ROOT` 指定。仓库内文件不能充当生产锁。

- 同一时刻只能持有一个生产租约。
- 已消费 approval 不能重放。
- 新租约必须取得更大的 fencing token。
- 每个 mutation checkpoint 必须重新验证租约和撤销 epoch。
- Gate 证据必须绑定当前 state、worktree、required artifacts、Git HEAD、Git tree、package scripts 和 policy。
- Gate 证据超过两小时、内容变化或缺任一固定门禁时失效。
- 门禁运行期间上述对象发生变化，本次结果直接 FAIL。

## 7. 机器控制器

```bash
npm run autonomy:status
npm run autonomy:gates
npm run autonomy:verify
npm run test:autonomy
```

### `autonomy:status`

读取状态、授权合同和真实 Git diff。越过 allowlist、触碰 prohibited path、改变硬锁、超过 WIP、缺少必需产物或生产租约时直接失败。

### `autonomy:gates`

只运行状态文件锁定且由控制器固定校验的 npm scripts。持久证据只保存命令名、退出码、耗时和输出 SHA，不保存原始日志。

基础门禁固定为：`typecheck`、`lint`、`test:market`、`build`、`backtest:golden`。

安全门禁固定为：`ci:forbidden-files`、`ci:secret-patterns`、`security:check`。

遇到第一个失败门禁立即停止。`backtest:formal` 永远拒绝自动运行。

### `autonomy:verify`

只有当前精确证据仍有效、当前包为 `ready_for_gate` 且全部门禁 PASS 时，才允许 `canAutoCommit=true`。生产包还必须拥有当前有效的 G0-G8 用户授权、逐包绑定和仓库外生产租约，才可能 `canAutoDeploy=true`。

`productionAutoApproval=false` 表示控制器不能创造新的用户权限；不否定用户已经签发的 G0-G8 长期授权。

## 8. 精确污染清理

允许自动清理的对象只包括：精确的本轮误生成未跟踪文件、过期传输包、已证明重复的生成物、已知 staging/temp 路径，以及经过测试和复核确认的 tracked obsolete code。

删除前必须具备：

1. 精确路径清单。
2. owner 与用途分类。
3. hash 或缺失合同。
4. 影响范围检查。
5. 删除后 absence 与 health 验证。

禁止自动删除生产业务行、数据库 volume、未知文件、没有轮换方案的 secret，以及活动/失败事故仍需保留的证据。发现范围不明的污染时先隔离并报告，不盲删。

## 9. 自动停止条件

- 修改文件超出 allowlist 或触碰 prohibited path。
- scan/analysis/strategy/backtest 分层边界被破坏。
- RR、Risk Gate、WAIT/READY 或状态词典被放宽。
- 测试、构建、安全、secret 或 forbidden-files 失败。
- 证据与当前 state/diff/commit/tree/scripts/policy 不一致。
- 生产工作树不干净、release identity 不一致或 health 非 ready/fresh。
- mock、旧缓存、0、fallback 或 unavailable 被包装成真实能力。
- G0-G8 授权缺失、撤销、过期或被扩展到 G9。
- 逐包记录缺精确哈希、超过 90 分钟或已被消费。
- 生产租约无效、fencing token 过期或撤销 epoch 增大。
- 数据库出现长事务、锁等待、部分 DDL 或恢复风险。
- 污染目标未知、删除范围无界或涉及禁止对象。

## 10. 当前 G0-G8 路线

```text
WP-AUTO-02 G0-G8 长期授权、核心目标锁与证据控制加固
-> Scanner Sustained Health 重新发布并完成观察
-> Dormant Runtime
-> Runtime Identity
-> Shadow Capture
-> Shadow Verify / Reconciliation
-> Deterministic Backfill / Canonical Compat
-> Canonical Read Cutover
-> HTTPS / Session / Release Identity
-> Known Incident Guards / G0 Security Hardening
-> G0 出口证据验收
-> G1 SLO / Backup-Restore / ASVS / E2E-Load
-> G2 MarketFact / 数据身份 / Deep SLA / Microstructure
-> G3 CandidateEpisode / RS / Pre-move / Frozen Holdout
-> G4 唯一 Analysis-Strategy 路径 / WAIT / 成本 / 风险
-> G5 Postgres Shadow / 真实 Outcome / Frozen A-B Governance
-> G6 专业工作台 / 三模式复盘 / 提醒
-> G7 30 天 Paper Workflow / Readiness Evaluator
-> G8 180 天治理 / 退化监控 / 成本决策
-> G8 出口证据验收并终止长期授权
```

当前 Candidate schema 已进入生产且保持 dormant，Candidate Runtime 关闭。Scanner Sustained Health 生产发布仍未 PASS；控制器不得跳过该关键阻塞直接进入后续生产阶段。

G0-G8 的真实观察窗口可以和下一 Gate 的本地非侵入准备重叠，但不得提前计时、缩短或用 pre-baseline 样本替代正式证据。长期观察期间生产 mutation 租约必须释放，只保留只读采集；任何后续生产写操作都重新取得逐包 90 分钟以内的新租约。

## 11. 防止自欺欺人的规则

1. 施工者的文字说明不是证据。
2. “能跑”不等于“完成”。
3. 自动控制器本身必须有绕过与攻击性测试。
4. 本轮依赖的测试和门禁不能在本轮删除或降级。
5. 旧 PASS 不能覆盖当前 FAIL/PARTIAL。
6. 观察窗口必须满足真实时间，不能缩短或改写时间戳。
7. 审核 Agent 意见不能冒充机器 verify PASS。
8. 生产 schema 存在不能冒充 Candidate Runtime 已启用。
9. 所有状态使用：`完整完成`、`可运行但不完整`、`临时验证版`、`等待外部条件`、`不能支撑实战`。
