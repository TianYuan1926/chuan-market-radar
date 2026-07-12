# WP-G0.2 Canonical API Route Adapter Local Preparation

## 1. 目标

建立未来 Next Route 可直接调用的纯服务适配器，在真正接 API 前锁住公共请求、可信 policy/control、Legacy/Candidate 编排和 HTTP 失败语义。本包不修改任何现有路由或前端。

## 2. 公共请求边界

公共 query 只允许 `limit`、`cursorFirstSeenAt`、`cursorEpisodeId`。limit 默认 100、最大 1000；cursor 必须成对出现；未知参数和重复参数返回 400。release、asOf、cohort、phase、evidence 和代码授权均禁止由 query 控制。

## 3. 可信控制边界

policy 与 control 由无公共请求参数的服务端 provider 提供，并在任何 Legacy/Candidate 数据读取前验证。控制读取固定 2 秒 deadline，完整数据编排固定 15 秒 deadline；每个 provider 都收到 `AbortSignal`，超时会通知底层取消。provider 抛错、挂起、超时或返回非法数据时返回 503，不读取后续数据、不复用旧 control、不回退 stale cache。

## 4. 代码授权

adapter 直接读取 `CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED`。当前值固定为 false，不能通过 dependency injection、query、header 或 env 覆盖。因此即使可信 control 声称 phase 已到 canonical，当前 adapter 仍只运行 Legacy diagnostic，Candidate read 和 Oracle compare 调用次数都必须为 0。

## 5. 编排与资源

adapter 复用既有 `executeCandidateReadRoute`，不复制 phase 状态机。Legacy events 按请求 limit 有界读取，结果交给既有 Legacy diagnostic 与 `candidate-canonical-api-resource.v1`。未来代码授权独立放行后，Candidate 与 Oracle 仍须服从原有 reconciliation、双 24 小时窗口和逐请求 parity。

## 6. HTTP 真值

所有响应固定 `cache-control: no-store`，并输出 contract、data status、read source、authority headers。非法请求返回 400；可信控制、依赖或 Candidate unavailable 返回 503；partial 保留为 partial，不能改成 ready；任何依赖失败禁止旧缓存或 empty fallback。

## 7. 分层与生产边界

adapter 只读且不生成方向、入场、止损、目标、RR 或交易计划，不修改实时排序。当前现有 API、前端、数据库、Redis、worker、Compose、migration、Feature Flag、control 和生产均未改变；本地 PASS 不表示 API 已上线或 canonical cutover 已完成。

## 8. 当前结论

生产下一步仍只能是另行审批的 Dormant Runtime Deploy。系统仍为 R1、可运行但不完整、不能支撑实战。
