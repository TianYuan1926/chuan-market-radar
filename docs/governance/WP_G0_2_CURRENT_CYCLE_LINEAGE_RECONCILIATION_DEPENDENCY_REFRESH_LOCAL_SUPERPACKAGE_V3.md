# WP-G0.2 Current-Cycle Lineage / Reconciliation Dependency Refresh v3

状态：`LOCAL GATES PASS / PRODUCTION NOT EXECUTED`

日期：2026-07-19

## 1. 目标

移除 Lineage、Reconciliation 和 Shadow Verify 生产准备链路中的 Cycle-3 硬编码，使证据窗口数由当前 migration cycle 推导，并把当前合法身份精确锁定到 Cycle-5。历史 v2 合同和失败证据继续保留，不能被 v3 覆盖或重写。

本包服务核心链路中的候选筛选与复盘进化：只有完整多轮血缘和零差异逐行对账，才允许后续 Shadow Verify。它不生成候选、方向、止损、目标、RR 或交易计划。

## 2. 范围

允许修改：

- Candidate Lineage 本地 runner、生产只读采集包、测试和 v3 合同。
- Candidate Reconciliation 本地 runner、生产只读对账包、测试和 v3 合同。
- Shadow Verify code authorization、Web release 和 phase transition 对 v3 依赖的校验。
- 项目上下文、自治状态和本轮中文证据。

明确禁止：

- 连接或修改生产数据库、Redis、Web、Worker、Caddy、env、Feature Flag 或 migration。
- 修改 scan、analysis、strategy、backtest、frontend、业务 API、RR 或 Risk Gate。
- 执行旧 Shadow Verify release target，切换 phase，启动 dual-read 观察或运行 formal backtest。

## 3. v3 证据合同

Lineage：

- schema：`candidate-multi-cycle-lineage-evidence.v3`
- status：`PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH`
- 当前验证周期：Cycle-5
- 精确窗口数：5，由 migration cycle 推导，不接受手工少报或多报。
- 窗口必须从 Cycle-1 连续到当前周期；历史窗口为 `legacy/frozen/even epoch`，当前窗口为 `shadow_capture/unfrozen/odd epoch`。
- 正式查询必须使用 `REPEATABLE READ READ ONLY` 与 `candidate_audit_role`。

Reconciliation：

- schema：`candidate-multi-cycle-reconciliation-evidence.v3`
- status：`PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL`
- 只接受同一当前周期的 v3 Lineage，文件哈希、控制身份、release windows 和语义来源哈希必须一致。
- 至少比较 10,000 条 `legacy_scan_candidate`；difference、duplicate、outside lineage 和 unresolved 必须全部为 0。
- future outcome、MFE、MAE、hit、qualityHit 和 ranking input 必须为 0。

Shadow Verify：

- response authority 继续为 `legacy`，本包不授权 Candidate 成为响应真值。
- 只接受精确五窗口 Lineage v3 和零差异 Reconciliation v3。
- 历史 release `54837d03... -> eb48827b...` 已与生产 `94b6d415...` 漂移，必须重新生成发布身份，旧合同不得执行。

## 4. 本地证据

- 联动定向测试：71/71 PASS。
- Lineage PostgreSQL 16：5 controls、10,020 completed writes、release distribution=`[2505,0,2505,0,5010]`、只读与审计角色强制、outside lineage 拒绝、`productionConnected=false`。
- Reconciliation PostgreSQL 16：10,020 compared writes、release distribution=`[2004,2004,2004,2004,2004]`、difference=0、只读与最小权限角色强制、phase 保持 `shadow_capture`、`productionConnected=false`。
- typecheck、lint、build、Golden 16/16 PASS。
- market 1,027 pass / 0 fail / 7 explicit skip；workers 23/23、historical 4/4 PASS。
- forbidden-files、secret-patterns、security-check PASS；Autonomy 31/31 PASS。
- formal backtest 未运行。

关键哈希：

- Lineage local runner：`837f8c160e294df95c04246311242c1fa018c1d19e874d36c298645fa55ae930`
- Lineage production artifact：`075d8ad059274d981b8b4ea2824e1a7f2f0d4a0b755ee179f424ae0e77055a5b`
- Lineage local contract：`f56556f321d9885a536b6d5c848aea1b763bb87b5fe385486b5d1482e69988bf`
- Lineage execution contract：`c81643df0d75de7cc61afc0de7b32ef7cb6743e8a9e1094ee63e7ff00bafdb72`
- Reconciliation local runner：`fa1a37085b163e031d9194b39aac3ea2f5aac9fbe17d9df647e505918b33c4ee`
- Reconciliation production artifact：`021ec7aef1ea3a0356e82afff1aa177e7506f0f6f8d7f399bb0c653d46dc3908`
- Reconciliation preparation contract：`6842fe615f5e92844e4bfc8d2ac58cb3c29538549be8ca9f8740fedeade6a369`
- Reconciliation execution contract：`18711af2a5c00c021edeb37bf430955752a1abbd2bc546294d0a986dfe88472d`
- Shadow Verify release runner artifact：`b8a34ef8b60a8f920de43886b4654107d87daa32007e38a40509430b9b1743f7`
- Shadow Verify phase runner artifact：`0c53d6c9613ec8d25ae64dea4142a9e4956933161116e40b419b753c1ff3a70a`

## 5. 生产边界与出口

Cycle-5 observer 仍是唯一生产 WIP。当前包只完成不依赖观察结果的本地准备；生产 Lineage 必须等 Cycle-5 累计、短观察和 24 小时门禁全部 PASS 后重新现场绑定。之后才能按顺序执行生产 Lineage、生产 Reconciliation、刷新 Shadow Verify release identity，并另行执行 Web-only release 与 phase observation。

因此本包不会让 G0 主步骤减数，G0 仍为 7。
