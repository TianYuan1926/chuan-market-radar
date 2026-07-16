# WP-G0.2 Production Reconciliation Execution Contract v1

状态：本地生产包准备；生产尚未执行，授权不由代码自行产生。

## 目标

在 Candidate Activation 的 24 小时观察取得真实 `PASS_ACTIVATE_AND_OBSERVE` 后，用独立的新请求执行一次生产只读对账。对账逐笔重建 Source Outbox 到 Candidate Event/Episode 的投影命令，至少比较 10,000 条，任何差异、重复映射或未决投递都失败。

## 双重只读边界

1. 数据库事务固定为 `REPEATABLE READ READ ONLY`。
2. 事务开始后强制 `SET LOCAL ROLE candidate_audit_role`。
3. 最终证据必须同时记录 `transactionReadOnly=true` 和 `currentRole=candidate_audit_role`。
4. 生产 runner 不执行 Git、Compose、service、env、Redis、Worker、DDL、DML、migration 或 phase transition。

## Activation 证据前置

- `observation-closeout.json` 必须为 `PASS_ACTIVATE_AND_OBSERVE`。
- `observation-final.json`、closeout 和 289 行原始样本分别做 SHA-256 绑定。
- 生产包从原始样本独立重算观察结果；重算结果必须与 final 精确一致。
- 必须覆盖至少 24 小时、最大间隔不超过 600 秒、completed writes 单调且最终大于 0。
- production commit、release 和正奇数 authority epoch 必须与请求及数据库控制行一致。

## 结果边界

PASS 只允许写 `PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL`。它不会自动进入 `shadow_verify`，不会打开 Canonical Read，不会改变 G0 状态。下一次 phase transition 必须是另一个独立、绑定 commit/evidence 的生产包。
