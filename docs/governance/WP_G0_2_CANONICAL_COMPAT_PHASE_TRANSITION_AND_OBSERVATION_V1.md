# WP-G0.2 Canonical Compat Phase Transition and Observation v1

## 目标

在生产 `shadow_verify` 已取得独立 `PASS_DUAL_READ_OBSERVATION` 后，准备唯一允许的 `shadow_verify -> canonical_compat` 权威迁移与 24 小时观察。该阶段只有当前请求的 Candidate 与独立 Raw Oracle 同快照零差异时，Candidate 才能成为候选生命周期和复盘读取权威；任何 fallback、partial、unavailable 或差异都必须使样本失败。

本包不生成方向、入场、止损、目标、RR 或交易计划，不修改扫描排序、策略、回测、Redis 或 Candidate 业务数据。

## 进入条件

1. 生产 Git 必须 clean、detached 并精确绑定合同中的 commit/tree，Web image 必须与既有 `PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY` 证据一致。
2. Lineage、10,000 条零差异 Reconciliation 与代码发布证据必须保持同一 migration/release 链。
3. Dual Read 证据必须精确为 289 个样本、覆盖至少 24 小时、最大间隔不超过 600 秒、每次全分页零差异，且绑定当前 `shadow_verify` epoch。
4. 当前 control 必须为 `shadow_verify / writeFrozen=false`，release、epoch、approval digest 与现有 root-owned manifest 完全一致，deadline 至少剩余 24 小时加 10 分钟。
5. 当前 read flags 必须是 `dual=true / canonical=false / review=false`；API 必须仍返回 Legacy 权威并报告 parity pass。
6. Candidate worker、scanner-worker、Postgres、Redis、Web 与 scan freshness 必须 healthy/ready/fresh。
7. 执行必须使用仓库外 Standing Grant、单次 90 分钟启动授权、全局租约和递增 fencing token。

任何一项不满足都在 mutation 前停止。旧证据、短窗口、单页结果和本地演练不得冒充生产 PASS。

## 允许变更

1. 只把 `CANDIDATE_EPISODE_CANONICAL_READ` 和 `CANDIDATE_EPISODE_REVIEW_READ` 从 false 改为 true；Dual Read 保持 true。
2. 只 force-recreate Web，不 build、不 source sync、不重建 Candidate worker 或其它服务。
3. 安装 root-owned `0600` 目标 read-authority manifest 与 root-owned `0500` 全分页校验器。
4. 只调用既有 `candidate_authority.transition_migration_control_v1`，把 control 从 `shadow_verify` 推进到 `canonical_compat`，epoch 精确加一。
5. 写入脱敏 evidence、租约事件和观察样本。

禁止 DDL、migration、Candidate 业务 DML、Redis mutation、Git checkout、镜像 build、策略、RR、排序与回测变更。

## Manifest 真值

目标 Manifest 使用 `candidate-read-authority-manifest.v1`，精确绑定 migration、release、目标 epoch、`canonical_compat`、三个 true 的 read flags、Reconciliation evidence hash 与 Dual Read evidence hash。数据库 `approval_digest` 必须等于 Manifest 原始字节 SHA-256；Manifest 生成时间与 control 切换时间的间隔不得超过 90 分钟。

Manifest 缺失、权限错误、内容漂移、env/DB 不匹配或 authority fingerprint 改变时，API 必须 fail closed，不能返回旧缓存或空数组冒充成功。

## 每个观察样本

每 300 秒取样一次，每次必须同时证明：

1. Git、Web image/container、Candidate worker image/container、Compose、env 和 Manifest 身份无漂移。
2. health ready、scan fresh、Postgres ready、Redis healthy，两个 worker healthy。
3. control 仍是同一 migration/release/epoch 的 `canonical_compat`，digest 精确一致且 deadline 有效。
4. 公共 API 返回 200/ready，mode=`canonical_compat_candidate`、readSource=`candidate`、authority=`candidate_authority`、allowedUse=`candidate_lifecycle_and_review_only`。
5. 当前请求 parity 必须 pass 且差异为 0；Candidate review 可用，但 cutover、交易计划、实时排序修改与自动推进能力仍全部为 false。
6. Web 内校验器必须在同一 `SERIALIZABLE READ ONLY DEFERRABLE + candidate_audit_role` 事务内遍历全部 Candidate cursor 页面，并与独立 Raw Oracle 对比。总返回数必须等于 Review total，Episode ID 不重复，每页零差异。公共 API 用于验证真实路由语义，数据库全分页证明用于覆盖全部数据；两者缺一不可。

最终必须恰好 289 个样本、覆盖至少 24 小时、最大间隔不超过 600 秒，Legacy fallback、partial、unavailable 和差异次数全部为 0。

## 自动回退

一旦 Web 权威变更开始，DB transition 前后任何失败都必须回退到 `legacy / writeFrozen=true`：关闭全部 Candidate flags、停止并删除 Candidate worker、只重建 Web 以移除 Manifest，同时保留 Candidate 数据、生产 Git 和当前 Web code image。

回退成功只能报告 `ROLLBACK_PASS_CANONICAL_COMPAT_TO_LEGACY_FROZEN`。现有状态机不能回退到 `shadow_verify`，所以不得声称可自动重启旧周期；回退验证失败属于 P0。

## 出口

唯一 PASS 是 `PASS_CANONICAL_COMPAT_OBSERVATION`。它只证明 Canonical Compat 观察合格，不自动执行 `canonical` cutover，不代表 WP-G0.2 或 G0 完成。下一包必须独立绑定本证据并实施 `canonical` fail-closed 权威迁移。
