# WP-G0.2 Production Reconciliation Execution Contract v1

状态：本地生产包准备；生产尚未执行，授权不由代码自行产生。

## 目标

在 Activation 24 小时观察真实 PASS、累计至少 10,000 条真实写入、并进入一个新的相邻验证周期后，用独立的新请求执行一次生产只读对账。对账覆盖全部批准周期，逐笔重建 Source Outbox 到 Candidate Event/Episode 的投影命令；任何差异、重复映射、血缘外写入、遗漏 control 或未决投递都失败。

## 身份分离

- Activation 原始 production commit、release 和 authority epoch 只用于从 289 个原始样本重算第一个周期的观察 PASS。
- 当前 production commit、release、migration 和 authority epoch 必须绑定最后一个新鲜验证周期。
- 两套身份不得混为“同 release、同 epoch”；跨周期是预期事实，但必须通过连续的 `sourceReleaseWindows` 完整证明。
- 独立 `lineage-final.json` 必须位于固定私有证据目录，权限、大小、SHA-256、10,000 阈值、unresolved=0 和无未来阶段声明全部校验后才可运行。

## 多周期数据库边界

1. 数据库事务固定为 `REPEATABLE READ READ ONLY`。
2. 事务开始后强制 `SET LOCAL ROLE candidate_audit_role`。
3. 在同一事务读取全部 `candidate-episode-v1` 周期 control，并与请求窗口一一精确匹配。
4. 历史周期必须 `legacy + frozen + even epoch`，当前周期必须是唯一 `shadow_capture + writable + odd epoch`。
5. 所有 `legacy_scan_candidate` 行必须属于批准 release 血缘；outside-lineage 最大值固定为 0。
6. 最终证据必须同时记录 `transactionReadOnly=true` 和 `currentRole=candidate_audit_role`。
7. 生产 runner 不执行 Git、Compose、service、env、Redis、Worker、DDL、DML、migration 或 phase transition。
8. 当前 Candidate Worker 必须正在运行且 health 为 healthy，系统必须 ready/fresh；runner 只读验证，不停止或重启 Worker。

## Activation 和累计证据前置

- Activation `observation-closeout.json` 必须为 `PASS_ACTIVATE_AND_OBSERVE`。
- Activation final、closeout 和 289 行原始样本分别做 SHA-256 绑定，并从样本独立重算。
- 血缘第一个窗口必须匹配 Activation release 和正奇数写 epoch。
- 累计证据必须达到 `PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE`，completed writes 至少 10,000。
- 请求至少包含两个严格相邻、不重复、每个精确 72 小时的 release 窗口，最后一个窗口绑定当前 control。

## 结果边界

PASS 只允许写 `PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL`。它不会自动进入 `shadow_verify`，不会打开 Canonical Read/Write 或 Review Read，不会改变 G0 状态。下一次 phase transition 必须使用另一个独立、绑定 commit 和证据的生产包。
