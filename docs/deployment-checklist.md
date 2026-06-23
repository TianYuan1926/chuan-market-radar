# 川 Market Radar 部署检查清单

## 当前部署形态

2026-06-20 起，项目进入腾讯云香港单机迁移阶段。Vercel + Neon 保留为回滚路径，新生产目标以 Docker Compose 单机部署为准。

- Next.js App Router
- 旧线上回滚：Vercel 公开网站
- 新生产目标：Caddy + Docker Compose 单机部署
- 单机服务：`web`、`postgres`、`redis`、`scanner-worker`、`websocket-light-worker`、`coinglass-worker`、`signal-worker`、`dynamic-scan-scheduler`、`macro-worker`
- `/api/scan` 提供扫描摘要
- `/api/archive` 通过 repository 提供扫描快照归档、指定回放帧和相邻扫描差值
- `/api/journal` 通过 repository 提供复盘记录；未接入真实 SQL client 时自动使用内存演示存储
- `/api/daily-movers` 通过 repository 提供每日异动归因复盘只读样本
- `/api/health` 提供系统健康状态，包含数据源、扫描新鲜度、持久化模式和归档状态
- `POST /api/admin/persistence/migrate` 通过 `CRON_SECRET` 授权后执行数据库 schema 初始化
- `GET /api/admin/deployment/readiness` 通过 `CRON_SECRET` 授权后输出部署前检查报告，不暴露密钥原文
- `POST /api/admin/daily-movers/ingest` 通过 `CRON_SECRET` 授权后低频抓取每日异动并写入 repository
- `POST /api/admin/outcomes/run` 通过 `CRON_SECRET` 授权后低频执行生命周期复盘写回
- `POST /api/admin/v3/forward-map-reviews/run` 通过 `CRON_SECRET` 授权后低频执行 v3 Forward Map 只读复盘
- `POST /api/admin/strategy-weights/executions/record` 通过 `CRON_SECRET` 授权后保存人工权重变更审批账本，不写真实规则权重
- `GET /api/health` 会派生只读影子策略权重层、影子表现评估和真实权重启用门禁，展示人工审批后的当前/建议权重差异、样本数、有效/反证、回滚压力和真实启用阻断原因，但不影响真实扫描、评分或策略权重
- `.github/workflows/chuan-daily-movers.yml` 使用 GitHub Actions 每日低频触发每日异动抓取
- `.github/workflows/chuan-v3-forward-map-review.yml` 使用 GitHub Actions 每 6 小时低频触发 v3 Forward Map 复盘，复用 `CHUAN_SCAN_URL` 和 `CHUAN_CRON_SECRET`
- `src/lib/persistence/persistence-contract.ts` 提供 Postgres 持久化表结构与数据映射骨架
- `src/lib/persistence/persistence-store.ts` 提供内存/数据库仓储切换层
- `src/lib/persistence/database-client.ts` 提供数据库 URL、driver、SQL client 的接入诊断和 schema 初始化入口
- `src/lib/persistence/neon-client.ts` 通过 `@neondatabase/serverless` 把 Neon query 函数适配成通用 `SqlClient`
- `src/lib/persistence/postgres-client.ts` 通过 `pg` 把普通 PostgreSQL pool 适配成通用 `SqlClient`
- `src/lib/persistence/configured-sql-client.ts` 根据 `DATABASE_DRIVER` 选择 Neon 或普通 PostgreSQL client
- `src/lib/alerts/alert-policy.ts` 提供前端告警等级、重复抑制、静默时段和浏览器通知文案策略
- `docs/chuan-market-radar-blueprint.md` 是当前产品和技术状态的长期事实源，后续继续开发前必须先对照它
- `vercel.json` 保持旧线上回滚可部署；新生产部署不依赖 Vercel Cron

## 免费套餐边界

以下边界作为旧 Vercel/Neon 回滚路径继续有效；新主线按腾讯云单机部署推进。

- 当前默认按 CoinGlass 业余会员、Neon 免费套餐和 Vercel Hobby 免费套餐搭建。
- 新功能必须先设计低频、缓存、分批、降级和健康状态展示，不能默认要求付费套餐。
- CoinGlass 请求要优先控制 `COINGLASS_BASE_ASSETS` 和 `COINGLASS_BATCH_SIZE`，不要一次性追求全市场高频覆盖。
- Neon 写入要优先保存快照、摘要和必要 payload，避免无边界流水写入。
- Vercel 免费阶段需要定时任务时，优先外部 cron 请求受保护 API；升级付费套餐后再迁回更高频或内置 Cron。

## 必填环境变量

- `MARKET_DATA_PROVIDER`: 默认 `mock`；切到真实 CoinGlass 时设为 `coinglass`
- `SCAN_API_RATE_LIMIT`: 扫描 API 每分钟限制，默认 `60`
- `JOURNAL_API_RATE_LIMIT`: 日记写入每分钟限制，默认 `30`
- `CRON_SECRET`: 手动强制刷新用，建议生产环境填写随机长字符串
- `PERSISTENCE_SCOPE`: 当前公开站点数据命名空间，未登录阶段建议保持 `public-demo`
- `POSTGRES_DB`: 单机 PostgreSQL 数据库名，推荐 `chuan_market_radar`
- `POSTGRES_USER`: 单机 PostgreSQL 用户名
- `POSTGRES_PASSWORD`: 单机 PostgreSQL 密码，只能在服务器 `.env.production` 中填写
- `DATABASE_DRIVER`: 单机生产填 `postgres`，Neon 回滚填 `neon`
- `DATABASE_URL`: 单机生产指向 compose 内 `postgres:5432`
- `REDIS_URL`: 单机 Redis 地址，默认 `redis://redis:6379`
- `FRONTEND_LIVE_EVENTS_RATE_LIMIT`: 前端只读事件接口限流，默认 `180`
- `FRONTEND_UI_STATE_RATE_LIMIT`: 前端 UI 状态读写限流，默认 `180`
- `FRONTEND_UI_STATE_MAX_BYTES`: 单条 UI 状态最大字节数，默认 `32768`
- `AUTH_SESSION_RATE_LIMIT`: 私有登录接口限流，默认 `30`
- `CHUAN_PRIVATE_MODE_ENABLED`: 私有访问模式，默认 `false`
- `CHUAN_SESSION_COOKIE_NAME`: 私有访问 cookie 名，默认 `chuan_session`
- `CHUAN_SESSION_PASSWORD`: 私有访问密码，只能在服务器 `.env.production` 中填写；为空时不应开启私有模式
- `CHUAN_SESSION_SECRET`: 会话签名密钥，只能在服务器 `.env.production` 中填写
- `CHUAN_SESSION_TTL_SECONDS`: 会话有效期，默认 `604800`

## 后续接入时再填写

- `COINGLASS_API_KEY`: CoinGlass 会员 API
- `COINGLASS_BASE_ASSETS`: CoinGlass 查询币种白名单，例如 `BTC,ETH,SOL,ENA,SUI`
- `COINGLASS_BATCH_SIZE`: 每个 15m 主扫描窗口请求多少个基础币。当前 Hobbyist 30/min 阶段推荐 `24`，其中 BTC/ETH 为锚点，其余槽位轮转山寨。
- `COINGLASS_DAILY_REQUEST_BUDGET`: 主扫描每日 CoinGlass 请求预算，推荐 `3000`；`24 * 96 = 2304` 次/日，保留失败重试和手动刷新余量。
- `COINGLASS_MAX_CONCURRENCY`: CoinGlass 主扫描受控并发，推荐 `6`，避免 24 个币串行拖慢 Vercel 函数。
- `COINGLASS_MINUTE_REQUEST_LIMIT`: CoinGlass 每分钟调用上限，Hobbyist 当前按 `30` 配置；扫描协调器会用 Redis/内存令牌桶阻止超限。
- `COINGLASS_REQUEST_INTERVAL_MS`: CoinGlass 请求间隔，默认 `500`；主深扫和 daily mover 都必须 pacing，避免瞬时打爆 30/min。
- `SCAN_LOCK_TTL_SECONDS`: 单次扫描锁过期时间，默认 `600` 秒；用于避免 worker、手动刷新和页面读取同时触发深扫。
- `COINGLASS_DAILY_MOVER_MAX_ASSETS`: 每次每日异动抓取最多请求多少个基础币，免费阶段默认 `8`
- `COINGLASS_DAILY_MOVER_LIMIT_PER_SIDE`: 每侧最多保留多少个涨跌幅样本，默认 `10`
- `WS_LIGHT_SCAN_WINDOW_MS`: WebSocket 轻扫滑动窗口，默认 `900000`，即 15 分钟。
- `WS_LIGHT_SCAN_ZSCORE_THRESHOLD`: WebSocket 轻扫成交额 z-score 候选阈值，默认 `2`。
- `WS_LIGHT_SCAN_MIN_CANDIDATE_VOLUME_USD`: WebSocket 轻扫候选最低窗口成交额，默认 `250000`。
- `WS_LIGHT_SCAN_ENABLED`: 主扫描是否读取 Redis WebSocket 轻扫快照，默认 `true`；快照缺失或过期会回退到 REST public light scan。
- `WS_LIGHT_SCAN_WORKER_ENABLED`: 常驻 WebSocket 轻扫 worker 是否启动，默认 `true`。
- `WS_LIGHT_SCAN_EXCHANGES`: WebSocket 轻扫交易所，默认 `BINANCE,OKX,BYBIT`；Binance 使用全市场 ticker，OKX/Bybit 先公开发现 USDT 永续再订阅。
- `WS_LIGHT_SCAN_REDIS_KEY`: Redis 快照 key，默认 `chuan:ws-light-scan:snapshot`。
- `WS_LIGHT_SCAN_STALE_AFTER_MS`: 主扫描认为 WebSocket 快照过期的时间，默认 `180000`。
- `WS_LIGHT_SCAN_SNAPSHOT_INTERVAL_SECONDS`: Worker 写 Redis 快照间隔，默认 `15`。
- `WS_LIGHT_SCAN_SNAPSHOT_TTL_SECONDS`: Redis 快照 TTL，默认 `1200`。
- `WS_LIGHT_SCAN_SYMBOL_LIMIT_PER_EXCHANGE`: OKX/Bybit 每所最多订阅多少个 USDT 永续，默认 `500`。
- `WS_LIGHT_SCAN_SUBSCRIBE_CHUNK_SIZE`: OKX/Bybit WebSocket 订阅分批大小，默认 `40`。
- `WS_LIGHT_SCAN_MAX_PRIORITY_CANDIDATES`: WebSocket 轻扫最多输出多少个优先候选，默认 `48`。
- `WS_LIGHT_SCAN_RECONNECT_SECONDS`: WebSocket 断线重连间隔，默认 `10`。
- `WORKER_HEARTBEAT_TTL_SECONDS`: Worker 心跳 Redis TTL，默认 `1800`。
- `WORKER_HEARTBEAT_STALE_SECONDS`: Worker 心跳过期判定，默认 `900`。
- `WORKER_IDLE_HEARTBEAT_SECONDS`: 长间隔 Worker 任务睡眠期间的空闲心跳间隔，默认 `300`，防止 daily mover、signal、macro 这类低频任务被误判为 down。
- `SCANNER_INTERVAL_SECONDS`: 单机 scanner-worker 主扫描间隔，默认 `900`
- `DAILY_MOVER_INTERVAL_SECONDS`: 单机 coinglass-worker 每日异动抓取间隔，默认 `86400`
- `KLINE_CACHE_INTERVAL_SECONDS`: 单机 coinglass-worker K 线缓存填充间隔，默认 `21600`
- `OUTCOME_INTERVAL_SECONDS`: 单机 signal-worker 生命周期复盘间隔，默认 `3600`
- `V3_FORWARD_MAP_INTERVAL_SECONDS`: 单机 signal-worker v3 复盘间隔，默认 `21600`
- `HEALTH_WATCH_INTERVAL_SECONDS`: dynamic-scan-scheduler 健康巡检间隔，默认 `300`
- `MACRO_INGEST_INTERVAL_SECONDS`: 单机 macro-worker 抓取 BTC.D/TOTAL2/TOTAL3 宏观快照间隔，默认 `3600`
- `SUPABASE_URL`: Supabase 项目地址
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase 服务端密钥
- `AI_REVIEW_ENABLED`: 设为 `true` 才会启用服务端 AI 复核；默认关闭
- `AI_PROVIDER`: AI 供应商标识，默认按 OpenAI-compatible 处理
- `AI_API_KEY`: AI API Key
- `AI_BASE_URL`: OpenAI-compatible chat completions endpoint
- `AI_MODEL`: AI 复核模型名
- `AI_REVIEW_MAX_SIGNALS`: 每轮最多复核几个候选，默认 `3`
- `AI_REVIEW_MAX_PROMPT_CHARS`: 单个复核 prompt 最大字符数，默认 `12000`

## GitHub Actions Secrets

- `CHUAN_SCAN_URL`: 指向线上 `POST /api/scan` 的完整 URL。
- `CHUAN_DAILY_MOVER_INGEST_URL`: 指向线上 `POST /api/admin/daily-movers/ingest` 的完整 URL。
- `CHUAN_CRON_SECRET`: 与 Vercel 环境变量 `CRON_SECRET` 保持一致，用于 `Authorization: Bearer <CRON_SECRET>`。
- v3 Forward Map 复盘工作流不需要新增 GitHub secret；它会从 `CHUAN_SCAN_URL` 推导 `/api/admin/v3/forward-map-reviews/run`。

## 稳定性边界

- GET `/api/scan` 会优先使用新鲜缓存，减少上游调用。
- POST `/api/scan` 会强制刷新，但生产环境建议配合 `CRON_SECRET`。
- Provider 失败且已有缓存时，接口会返回旧快照并把状态降为 `stale`。
- Provider 失败且没有缓存时，接口返回 `503`，不能伪装成实时成功。
- 页面右侧的“系统状态”模块会显示当前是 `mock` 还是 `coinglass`、`memory` 还是 `database`、扫描是否新鲜、归档是否已有回放帧。
- 当前 `/api/journal` 已经走 repository；真实公开使用前必须传入普通 PostgreSQL/Neon/Supabase 的服务端 SQL client，否则只是内存演示存储。
- 当前 `/api/archive` 已经走 repository；真实公开使用前必须传入普通 PostgreSQL/Neon/Supabase 的服务端 SQL client，否则只是内存演示归档。
- 当前 `/api/daily-movers` 已经走 repository；它是公开只读归因样本 API，返回 `allowedUse: research_only`，不能作为追涨杀跌信号入口。
- 当前持久化骨架定义 `journal_events`、`scan_archives`、`rank_profiles` 三张 Postgres 表、映射函数、repository、数据库接入诊断和扫描归档 bundle 构建器；Neon SDK 已安装，但没有真实 `DATABASE_URL` 时仍不会把数据永久写入远端。
- 当前已经安装 Neon 官方 serverless driver；当 `DATABASE_DRIVER=neon` 且 `DATABASE_URL` 指向 Neon 时，应用会自动创建 Neon SQL client。
- 当前已经安装普通 PostgreSQL driver；当 `DATABASE_DRIVER=postgres` 且 `DATABASE_URL` / `POSTGRES_URL` 指向单机 PostgreSQL 时，应用会自动创建 PostgreSQL SQL client。
- 数据库迁移入口必须配置 `CRON_SECRET` 才会运行；没有 secret 时返回 `migration_secret_missing`。
- 部署前检查入口必须配置 `CRON_SECRET` 才会运行；没有 secret 时返回 `readiness_secret_missing`。
- 部署前检查会把系统状态归为 `ready`、`preview` 或 `blocked`：`mock` 数据源允许公开预览，但不会被标记为真实行情生产就绪。
- 即使 `DATABASE_URL` 已填写，只要没有注入真实 `SqlClient`，系统会显示为 fallback/memory，不能算已经接入数据库。
- CoinGlass provider 只有在 `MARKET_DATA_PROVIDER=coinglass` 且 `COINGLASS_API_KEY` 存在时启用。
- Hobbyist 会员需要用 `COINGLASS_BASE_ASSETS` 控制基础优先池，并用 `COINGLASS_BATCH_SIZE` 控制每轮请求数量；基础优先池不是全市场上限，公开 USDT 永续 universe 会继续并入轮转。
- 当前分批队列按 UTC 日内扫描窗口轮转。GitHub Actions 外部扫描 cron 与应用 cadence 对齐为 15 分钟；推荐 batch size 为 `24`，每轮约扫 BTC/ETH + 22 个山寨标的。
- CoinGlass provider 会先用 Binance public futures `exchangeInfo`、OKX public instruments、Bybit V5 public instruments 发现 USDT 永续合约，再按 `COINGLASS_BATCH_SIZE` 低频请求 CoinGlass；单个交易所发现失败会降级为 source note，全部发现失败时回退到配置白名单。
- `COINGLASS_DAILY_REQUEST_BUDGET` 会把过大的 `COINGLASS_BATCH_SIZE` 自动压回每日预算允许值。旧值 `300` 会把 15 分钟 cadence 下的安全批次压到约 `3`，导致长期只扫 BTC/ETH + 1 个山寨；当前推荐 `3000`，线上 metadata notes 应显示 `quota guard: requested batch 24 kept`。
- `COINGLASS_REQUEST_INTERVAL_MS` 不能随意设为 `0`。只有本地测试或明确排查才可关闭 pacing；生产默认 `500ms`，用于保护 CoinGlass Hobbyist 限速。
- 生产 CoinGlass key 更换必须用 `npm run production:update-coinglass-key` 或同等安全流程：隐藏输入或本地环境变量传入，只更新服务器 `.env.production`，自动备份、重建相关容器并跑受保护能力体检；不得把真实 key 写进仓库、聊天、日志或命令输出。
- 2026-06-23 旧生产探针曾显示旧 `COINGLASS_API_KEY` 对合约深扫端点返回 `Upgrade plan`。验收时必须先看 `/api/health.coinGlassRuntimeCapability`、`/api/radar/backend-contract.sourceAudit.coinGlassCapability`，必要时用 `Authorization: Bearer <CRON_SECRET>` 调用 `POST /api/admin/coinglass/capability`。如果结果仍为 `upgrade_required`、`auth_error`、`rate_limited`、`param_error`、`empty` 或 0 clean rows，必须判定为 CoinGlass 付费深扫未就绪或请求参数待修，不是系统没运行；公共轻扫和榜单仍可用，但不能生成 CoinGlass 衍生品 Evidence 或交易计划。
- `REDIS_URL` 存在时主扫描会优先使用 Redis 做跨容器扫描锁和 CoinGlass 分钟级令牌桶；Redis 不可用时自动降级为进程内锁，但多容器防重能力会变弱。
- WebSocket 轻扫已具备常驻 worker：`websocket-light-worker` 会连接 Binance/OKX/Bybit public ticker 流并写 Redis 快照；主扫描优先读取新鲜快照，缺失或过期时自动回退到 REST public light scan。该层仍只是调度和候选发现，不能直接生成交易信号。
- Macro Weather 已具备常驻 `macro-worker`：默认每小时请求受保护 `POST /api/admin/macro/ingest`，写入 `macro_market_snapshots`；该层只能提供 BTC.D/TOTAL2/TOTAL3 山寨环境锚点，不能直接生成交易方向、不能降低 `3:1` 最低 RR。
- outcome 复盘统计只承认 `EVIDENCE_SIGNAL` 和 `TRADE_PLAN_READY`；轻扫标记、深扫候选和缺成熟度旧样本不能进入命中率或人工校准胜率。
- Macro Weather 的 BTC.D / TOTAL2 / TOTAL3 只做山寨环境顺逆风说明；不得降低 `3:1` 最低赔率，也不能直接生成方向或交易计划。
- `/api/health` 会把 quota 与 coverage 汇总为 `scanEconomy`；系统状态面板必须显示“扫描经济 / 今日预算 / 剩余额度 / 请求/轮 / 批次上限 / 层级覆盖 / 不新增请求”，该面板只读展示，不触发额外 CoinGlass 请求。
- `/api/health.scanStability` 会把扫描归档、覆盖率、Redis 和 worker 心跳汇总为扫描稳定性诊断；该字段只用于运维排错，不允许前端或策略层把它当作交易信号。
- `/api/health.reviewStatistics` 会从真实复盘样本派生统计；样本少时必须显示 collecting/empty，不能据此自动调权。
- `/api/frontend/live-events/stream` 是 SSE 只读事件流，只能复用归档/心跳事件合同，不能触发扫描、不能调用 CoinGlass。
- `RadarContract.fundFlow` 当前是 partial/waiting 合同，未接 taker/CVD/真实资金流源前不得显示成 live。
- Universe planner 会把资产分成 anchor/core/active/long_tail；BTC/ETH 每轮固定，配置白名单和高流动性币优先，未验证流动性的长尾币默认每 8 个扫描窗口抽样一次。线上检查 metadata notes 时应能看到 `tiered universe` 和 `tier policy`。
- Universe planner 支持 dynamic priority hints；异常分、历史有效性、近期信号、流动性、交易所覆盖质量、可学习漏判和冷却复盘会进入非 anchor 轮转槽排序，但不能挤掉 BTC/ETH，也不能突破 quota 批次。线上检查 metadata notes 时应能看到 `dynamic priority`。
- 默认 CoinGlass provider 会从 repository 读取扫描归档、复盘 journal outcome、每日异动归因样本和 v3 trend review 样本，生成 repository priority hints 后再创建扫描计划。线上检查 metadata notes 时应能看到 `repository priority hints`。
- Universe coverage 会输出 `exchangeCoverage` 和 `exchangeCoverageSummary`，把币种分为 `major_three`、`multi_exchange`、`single_exchange`、`unlisted`；线上检查 metadata notes 时应能看到 `exchange coverage` 汇总。
- 当前主扫描会拒绝 UNKNOWN 交易所、非 USDT 或报价字段冲突的 CoinGlass 行，并在 metadata notes 中输出 raw、clean、primary 和过滤原因统计；线上检查时不要只看候选数量，也要看过滤原因是否异常放大。
- 每日异动归因复盘已有低频抓取写入服务、公开只读 API、受保护写入 API 和 GitHub Actions 外部 cron；写入触发入口是 `POST /api/admin/daily-movers/ingest`，必须带 `Authorization: Bearer <CRON_SECRET>`。
- 人工权重变更执行记录入口是 `POST /api/admin/strategy-weights/executions/record`，必须带 `Authorization: Bearer <CRON_SECRET>`；该入口只写 `journal_events` 审批账本，不新增表、不触发 CoinGlass 请求、不自动调整规则权重。
- 影子策略权重层只从已审批的 `strategy_weight_change_execution` journal 事件派生 `baseWeights`、`shadowWeights` 和 `diffs`；它不新增环境变量、不新增 Neon 表、不触发 CoinGlass 或公开 K 线请求，且 `canAffectLiveSignals` 固定为 `false`。
- 影子表现评估只从现有 `journal_events` 派生审批后的校准样本和人工确认摘要；它不新增环境变量、不新增 Neon 表、不触发 CoinGlass 或公开 K 线请求，且只能输出只读回滚压力。
- 真实权重启用门禁只从现有健康报告、影子权重、影子表现和人工执行记录派生；`STRATEGY_WEIGHT_ACTIVATION_MODE` 可选值为 `disabled|shadow|manual`，默认 `disabled`，当前只影响 `/api/health` 和系统状态面板解释，不接入扫描引擎、不新增 Neon 表、不触发外部请求。
- 公开 OHLCV provider 当前使用 Binance public futures K 线边界；该数据源不需要 API key，但只能作为 K 线和技术指标数据源，不能替代 CoinGlass 衍生品数据。
- CoinGlass provider 会对受限主候选拉取 `1m/5m/15m/30m/1h/4h/1d/1w` 公开 K 线，生成 timeframe profile 并补充技术指标证据；当前最多处理 8 个主候选，避免免费阶段请求尖峰。
- 技术指标证据当前包含 EMA、RSI、ATR、Bollinger、VWAP、Swing、MACD、近似成交量分布和多周期指标矩阵摘要；这些都只进入证据层，不直接触发交易信号。
- 策略卡存在 `多周期指标矩阵` 证据时，会展示紧凑指标矩阵和 POC/价值区摘要；线上检查时应确认该 UI 只作为证据展示，不把单一指标当作交易触发。
- 分析层会对指标矩阵与 `1h/4h` 结构 profile 做基础校准；线上信号可能出现 `指标/周期反证` 或 `指标/周期同向校验` evidence，它们只做小幅加权/降权，不允许替代触发、失效和赔率检查。
- 线上检查 metadata notes 时应能看到 `ohlcv multi-timeframe`；如果部分周期失败，应同时看到对应 `ohlcv unavailable`，但 `/api/scan` 不应因此失败。
- OHLCV provider 失败时必须降级为信号数据质量提示，不能让 CoinGlass 衍生品扫描崩溃。
- AI 复核只在服务端执行，浏览器端不会接触 `AI_API_KEY`。
- AI 复核默认关闭；缺少 `AI_REVIEW_ENABLED=true` 或 `AI_API_KEY` 时，信号会显示 disabled 状态，不会隐藏复核边界。
- AI 模型请求失败、解析失败或超出 prompt budget 时，系统会回落到规则引擎，不允许页面崩溃，也不能把失败模型输出当成判断。
- AI 复核必须先找反证，再输出事实、推理、判断、策略、失败路径和不确定性；它只能复核和解释，不能替代规则引擎做最终裁决。
- 告警策略当前在浏览器侧运行，不需要新增服务端环境变量；浏览器 Notification API 只会在用户主动开启告警后请求权限。
- 告警声音受静默时段控制；静默时段只关闭声音，不隐藏事件中心日志。
- 告警去重按同币种同状态抑制短窗口重复提醒，避免 Vercel/浏览器刷新时重复轰炸用户。
- 第 8 流程没有新增环境变量、数据库表或外部服务依赖；它只固化当前能力状态和后续路线。
- 每次新增功能后，必须同步更新蓝图中的“当前已落地模块”“当前未完整落地模块”和部署清单中的环境变量/运营检查。
- Vercel Hobby 账号不能使用每 15 分钟一次的内置 Cron。免费预览阶段先用 cron-job.org、UptimeRobot 或 GitHub Actions 定时请求 `/api/scan`；升级 Vercel Pro 后再把 `*/15 * * * *` 放回 `vercel.json`。
- 如果 Vercel 项目还没有连接 GitHub 仓库，CLI 本地部署可能直接进入 `production` target；要获得标准 Preview/Production 分支工作流，需要先把代码推到 GitHub 并在 Vercel Project 里连接该仓库。

## 上线前必须确认

- Vercel 环境变量已填写。
- 本地先运行 `npm run deployment:env-plan`，确认 preview 环境变量没有缺失；生产切换前运行 `npm run deployment:env-plan -- production`。
- 请求 `GET /api/admin/deployment/readiness`，带 `Authorization: Bearer <CRON_SECRET>`；返回 `status=preview` 表示可公开预览，返回 `status=ready` 才表示真实行情生产就绪。
- 首页可以打开且没有控制台错误。
- `/api/scan` 返回 `ok: true`。
- `/api/scan` 的 metadata notes 在有 OHLCV provider 时应显示 `ohlcv multi-timeframe`；公开 K 线源异常时应降级为信号证据里的 `OHLCV 数据缺失`，不能把主扫描拖成 500。
- `/api/archive` 返回 `ok: true`，且 `archive.retention.storage` 与 repository 模式一致；未接真实数据库时应为 `memory`。
- `/api/journal` 返回 entries。
- `/api/daily-movers` 返回 `ok: true`；即使暂时没有样本，也必须保持公开只读响应和 `allowedUse: research_only` 边界。
- `/api/health` 返回 `ok: true`，且 `health.level` 能准确反映 `ready`、`preview`、`degraded` 或 `blocked`。
- `/api/health` 的 `health.macroMarket` 必须显示 `status`、`source`、`ageMinutes`、`btcDominancePercent`、`total2MarketCapUsd`、`total3MarketCapUsd` 和 “不能直接生成交易方向” 边界。
- `bash deploy/scripts/production-verify.sh` 应在服务器上通过；本地没有 Docker 时不能用本地结果替代服务器验收。
- `bash deploy/scripts/production-full-verify.sh` 应在服务器上通过；它会统一检查 compose、迁移、health、frontend contracts、只读事件、UI state、扫描触发、worker 日志和备份 dry run。
- `npm run production:ssh-check` 应能从本机连通腾讯云 SSH，并确认远端项目目录和 Git 提交；不通时优先修 SSH，不把 OrcaTerm 手工复制当长期部署方案。
- `npm run production:deploy` 是本机到腾讯云生产的标准发布入口：本地 GitHub 同步检查、SSH 预检、服务器 `git pull --ff-only`、Docker Compose 重建、内部 health、公网 smoke。
- `npm run production:smoke` 应能检查公网页面、`/api/health`、前端 radar contract、leaderboard、review contract 和 backend contract；如果只页面 200 但合同为空，不能算完成。
- `bash deploy/scripts/backup-postgres.sh` 应能生成 PostgreSQL 备份；恢复必须用 `CONFIRM_RESTORE=yes bash deploy/scripts/restore-postgres.sh <backup-file>`，避免误覆盖。
- `bash deploy/scripts/production-observe.sh` 应能打印服务状态、健康摘要、backend contract 摘要和 worker 日志，不打印任何 secret。
- 系统状态面板的人工权重变更执行记录入口必须显示“只保存记录/不可写权重”边界；没有可审计候选时表单保持禁用。
- 系统状态面板的影子权重必须显示“当前权重/建议权重/差异”和“不影响实盘判断”边界；没有审批记录时应处于 collecting，不应显示成真实调权已生效。
- 系统状态面板的影子表现必须显示“样本数/有效/反证/回滚压力”和“不执行真实权重”边界；样本不足或回滚压力出现时不能显示成真实权重可生效。
- 系统状态面板的真实权重门禁必须显示“启用模式/通过项/阻断项/样本门槛”和“不接入扫描”边界；即使 `STRATEGY_WEIGHT_ACTIVATION_MODE=manual`，当前也只能显示候选或阻断原因，不能改变扫描结果。
- 数据库上线前，先在目标 Postgres 执行 `buildPersistenceSchemaSql()` 生成的 SQL，并确认当前持久化表、主键和索引存在。
- 如果不用 Neon SQL Editor 手动建表，可以请求 `POST /api/admin/persistence/migrate`；请求必须带 `Authorization: Bearer <CRON_SECRET>`。
- 数据库上线前，确认服务端已传入真实 `SqlClient`，不能只填 `DATABASE_URL` 就认为已经持久化。
- 数据库上线前，确认 `DATABASE_DRIVER` 与实际方案一致；Neon 填 `neon`，Supabase 填 `supabase`，普通 Postgres 填 `postgres`。
- Neon 上线前，确认 Vercel 已填 `DATABASE_DRIVER=neon` 和 Neon 的 `DATABASE_URL`，部署后 `/api/health` 应显示 `databaseDriver: neon`。
- CoinGlass 接入前不要把演示数据描述成实时数据。
- 数据库接入前不要承诺复盘记录、扫描归档、段位分数永久保存。
- 告警上线前，确认浏览器通知权限不是首屏自动请求，且静默时段内事件仍进入事件中心。
- 继续下一阶段前，先检查蓝图的阶段状态总览，确认没有把“基础已落地”误说成“完整专业闭环已完成”。
- 每轮部署前，确认 README/蓝图/部署清单描述和实际代码一致，尤其是数据源、AI、数据库、告警、全市场覆盖和多周期融合状态。
- 免费预览部署完成后，用 GitHub Actions 外部 cron 每 15 分钟请求线上 `/api/scan`；Vercel Hobby 内置 Cron 不支持这个频率。
- 每日异动归因复盘自动运行使用 `.github/workflows/chuan-daily-movers.yml` 每日低频请求 `/api/admin/daily-movers/ingest`，不要配置高频任务。
- v3 Forward Map 复盘自动运行使用 `.github/workflows/chuan-v3-forward-map-review.yml` 每 6 小时请求 `/api/admin/v3/forward-map-reviews/run`，只写只读复盘样本，不自动改权重。
- 本地 CLI 直传部署后，用 `vercel inspect <deployment-url>` 确认 `status: Ready`；如果当前网络无法访问 `*.vercel.app`，以 Vercel inspect 状态和你本机浏览器实测为准。
