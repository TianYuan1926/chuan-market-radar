# WP-G0.2 Trusted Read Context Local Preparation

## 目标

关闭 Canonical API Route Adapter 中 Policy 与 Control 分开读取造成的权威竞态。未来路由只能读取一个可信上下文；该上下文把数据库 control、发布身份、Feature Flags、证据 manifest 和固定 read policy 绑定在一起。

## 权威来源

- `candidate_authority.candidate_migration_control` 必须在 `SERIALIZABLE READ ONLY DEFERRABLE` 事务中读取。
- Policy 的 `asOf` 来自数据库时钟，release 来自 `approved_release_id`，cohort 从 control `started_at` 开始。
- API 复盘默认 horizon 固定为 `24h`；公共请求不能改变 release、cohort、phase、evidence 或代码授权。
- Route Adapter 使用上下文前先按 flags/evidence/control/approval 重新计算 proof fingerprint，并在数据读取前后各读取一次上下文。`authorityFingerprint` 变化时丢弃结果并返回 503。

## 证据 Manifest

运行时文件固定为 `/run/market-radar/candidate-read-authority.json`。数据库 `approval_digest` 必须等于 manifest 原始字节的 SHA-256；release、epoch、phase 必须与 control 精确一致。manifest 未知字段拒绝，PASS 证据必须带 SHA-256，missing 必须为 null。

严禁根据 phase 自动推断证据 PASS。phase 只规定该阶段必须具备哪些证据，实际状态必须来自与审批 digest 绑定的 manifest。

## 运行边界

运行 release 必须与 control release 一致；三个 read flag 必须显式为 true/false，并同时匹配 manifest 与 phase。当前代码 `CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED=false`，所以即使本合同通过，也不能读取 Candidate authority。

本包不接现有 API、不改前端、不改 migration/Compose、不连接生产、不写数据库、不切 phase、不改 Feature Flag。

## 当前结论

本地单元测试和隔离 PostgreSQL 16 只能证明实现与失败边界。生产 authority manifest 尚未落盘，真实 API/Reader/双读窗口/canonical cutover 尚未执行，因此系统仍是 R1、可运行但不完整、不能支撑实战。
