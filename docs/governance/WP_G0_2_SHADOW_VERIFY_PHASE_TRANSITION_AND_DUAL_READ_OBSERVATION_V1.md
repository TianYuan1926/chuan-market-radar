# WP-G0.2 Shadow Verify Phase Transition and Dual Read Observation v1

## 目标

在可信多周期 Lineage、至少 10,000 条生产写入零差异 Reconciliation，以及 Shadow Verify Web-only 代码发布全部真实 PASS 后，执行唯一允许的 `shadow_capture -> shadow_verify` 状态迁移，并完成不可缩短的 24 小时/289 样本双读观察。

本阶段仍由 Legacy 返回生产响应。Candidate Read 只用于同一 `SERIALIZABLE READ ONLY DEFERRABLE` 数据库快照内的独立 Raw Oracle 对比，不生成方向、入场、止损、目标、RR 或交易计划，不修改实时排序。

## 进入条件

1. 当前生产 Git 必须 clean detached exact commit `eb48827b8b403452328b65dc4b415c3fc0ecf765`。
2. Web-only 代码发布证据必须为 `PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY`，且绑定当前 Web image。
3. Lineage 必须覆盖至少两个严格相邻验证周期、累计完成写入不少于 10,000、当前周期身份唯一。
4. Reconciliation 必须为 `PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL`，差异、重复和未解决项全部为 0。
5. 当前 Candidate control 必须为 `shadow_capture / writeFrozen=false`，release、epoch、deadline 与证据完全一致；deadline 至少剩余 24 小时加 10 分钟。
6. Candidate worker、scanner-worker、Postgres、Redis、Web 与 scan freshness 必须 healthy/ready/fresh。
7. 当前 read-authority manifest 必须不存在，三个 read flag 必须全部为 false。
8. 生产 mutation 必须使用仓库外 Standing Grant、单次审批、全局租约和递增 fencing token。

任何条件不满足都必须在 mutation 前停止，不允许把旧证据、单页结果或本地演练包装成生产 PASS。

## 唯一允许的变更

1. 把生产 env 中 `CANDIDATE_EPISODE_DUAL_READ` 从 false 改为 true；Canonical Read 和 Review Read 继续为 false。
2. 只 force-recreate Web，不 build、不 source sync、不重建 Worker 或其它服务。
3. 在 Web 容器内安装 root-owned `0600` read-authority manifest 和 root-owned `0500` 全量校验器。
4. 仅调用既有 `candidate_authority.transition_migration_control_v1`，把当前 control 从 `shadow_capture` 推进到 `shadow_verify`，epoch 精确加一。
5. 写入脱敏 evidence、租约事件和观察样本。

不得执行 DDL、migration、Candidate 业务 DML、Redis mutation、Git checkout、镜像 build、策略或排序变更。

## Manifest 真值

Manifest 必须使用 `candidate-read-authority-manifest.v1`，精确绑定 migration、release、目标 epoch、`shadow_verify`、三个 flags 和 Reconciliation evidence hash。数据库 control 的 `approval_digest` 必须等于 Manifest 原始字节的 SHA-256；Manifest `generatedAt` 必须不晚于 control `updated_at`，且可信窗口不超过 90 分钟。

Manifest 缺失、权限错误、内容漂移、env/DB 不匹配或 authority fingerprint 改变时，Candidate API 必须 503 fail closed，不得返回空数组或旧缓存冒充成功。

## 每个观察样本

每 300 秒生成一个样本，必须同时证明：

1. Git、Web image、Web container、Candidate worker container/image、Compose、env 和 manifest 身份没有漂移。
2. health ready、scan fresh、Postgres ready、Redis healthy、Candidate worker 和 scanner-worker healthy。
3. control 仍为同一 migration/release/epoch 的 `shadow_verify`，approval digest 精确一致且 deadline 有效。
4. `/api/frontend/candidate-lifecycle` 返回 200，但 mode 必须是 `dual_read_legacy_authority`、readSource 必须是 `legacy`、authority 必须是 `legacy_projection_non_authoritative`。
5. API parity 必须 pass、differenceCount=0、differences 为空；Candidate review 不可用，cutover/plan/ranking/automatic advance 全部为 false。
6. Web 容器内全量校验器必须在同一个 `SERIALIZABLE READ ONLY DEFERRABLE + candidate_audit_role` 事务内读取全部 Candidate 页面与独立 Raw Oracle。必须走完整 cursor 链，returned 总数等于 Review total、Episode ID 无重复、每一页零差异；只验证第一页一律 FAIL。

最终必须恰好 289 个样本、覆盖至少 24 小时、最大间隔不超过 600 秒。时间和样本缺一不可。

## 失败与回退

- DB transition 前失败：恢复原 env/Web，manifest 必须 absent，control 保持 `shadow_capture`。
- DB transition 后任何失败：使用同一预授权 safety checkpoint，把 control 推进到 `legacy / writeFrozen=true`，关闭全部 Candidate flags，停止并删除 Candidate worker 容器，重建 Web 移除 manifest；保留 Candidate 数据、生产 Git 和当前 Web code image。
- 回退成功只能写 `ROLLBACK_PASS_SHADOW_VERIFY_TO_LEGACY_FROZEN`，不能写 Shadow Verify PASS，也不能声称可以自动重启新周期。由于现有数据库状态机不允许退回 `shadow_capture`，后续重启必须另做相邻周期恢复审计。
- 回退验证失败是 P0，必须停止其它生产动作。

## 出口

唯一 PASS 是 `PASS_DUAL_READ_OBSERVATION`。PASS 仍不会自动进入 `canonical_compat`、Canonical Read Cutover、WP-G0.2 完成或 G0 完成；下一阶段必须使用独立、证据绑定的 Canonical Compat 包。
