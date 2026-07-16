# WP-G0.2 Shadow Verify Code Authorization Local Superpackage v1

状态：本地实现完成前置施工；生产未连接、未部署、未切换 Candidate phase。

## 目标

启用既有 Candidate Read 状态机的编译期能力，让未来 `shadow_verify` 可以执行同一数据库快照下的 Legacy Reference 与 Candidate 对比。该授权不是 Canonical Cutover：在 `shadow_verify` 中，Legacy 仍是唯一响应权威，Candidate 结果只用于零差异验证。

## Fail-Closed 边界

1. `legacy` 与 `shadow_capture` 始终返回 Legacy diagnostic。
2. `shadow_verify` 必须同时满足可信数据库 phase、root-owned manifest、Reconciliation PASS 证据和唯一正确 flags。
3. 公开请求只能控制 limit 与完整 cursor pair，不能控制 phase、flags、release 或 evidence。
4. 双读必须在同一个 `SERIALIZABLE READ ONLY DEFERRABLE` 快照内并使用 `candidate_audit_role`。
5. parity 失败或依赖不可用时不得把 Candidate 作为权威；authority fingerprint 在数据读取后必须再次校验。
6. `canonical_compat` 和 `canonical` 仍分别受前一阶段 24 小时证据阻断，不能自动推进。
7. 输出不能生成交易计划、修改实时排序或使用 future outcome 影响生产判断。

## 当前结论

本包只完成代码授权和本地验证。生产仍需先完成 Activation、10,000 条累计、新鲜验证周期、Lineage Capture 和 Reconciliation，再使用独立生产发布包部署本代码，之后才允许另包切换 `shadow_verify`。当前不等于 Shadow Verify、Canonical Read、WP-G0.2 或 G0 完成。
