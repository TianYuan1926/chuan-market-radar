# WP-G0.2 Shadow Verify Runtime Wiring Local Superpackage v1

状态：本地运行时接线；生产未授权、未连接、未部署。

## 目标

把已经通过隔离验证的 Candidate Canonical Read Model、独立 Raw Oracle、可信 Authority Context 和 HTTP Route Adapter 接成真实 Next.js 只读 API。该 API 是后续 `shadow_verify` 每次双读比较的唯一运行入口，不修改现有 Review 路由或页面。

## Fail-Closed 边界

1. 编译期 `CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED` 本包继续保持 `false`。
2. 公开请求只能控制 limit 和完整 cursor pair，不能控制 phase、release、evidence、flags 或 authority。
3. 只使用 `CANDIDATE_MONITOR_DATABASE_URL`，事务内强制 `candidate_audit_role`。
4. Monitor DB、root-owned manifest、可信控制或依赖缺失均返回 503，不返回空 Candidate 或 stale fallback。
5. 路由超时的 AbortSignal 必须进入 PostgreSQL transaction；Candidate 数据查询的数据库 statement timeout 固定为 12 秒，严格小于 HTTP 数据截止时间 15 秒，避免响应结束后查询继续长时间运行。
6. 输出永远禁止生成交易计划、修改实时排序、自动推进 phase 或使用 future outcome。

## 当前结论

本包只证明 API 运行时接线具备 Fail-Closed 结构。它不创建 runtime manifest、不改 Compose/env/Feature Flag、不部署生产，也不等于 Activation、Reconciliation、Shadow Verify、WP-G0.2 或 G0 完成。
