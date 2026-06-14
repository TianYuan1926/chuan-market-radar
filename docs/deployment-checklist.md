# 川 Market Radar 部署检查清单

## 当前部署形态

- Next.js App Router
- Vercel 公开网站
- `/api/scan` 提供扫描摘要
- `/api/archive` 通过 repository 提供扫描快照归档、指定回放帧和相邻扫描差值
- `/api/journal` 通过 repository 提供复盘记录；未接入真实 SQL client 时自动使用内存演示存储
- `/api/health` 提供系统健康状态，包含数据源、扫描新鲜度、持久化模式和归档状态
- `POST /api/admin/persistence/migrate` 通过 `CRON_SECRET` 授权后执行数据库 schema 初始化
- `GET /api/admin/deployment/readiness` 通过 `CRON_SECRET` 授权后输出部署前检查报告，不暴露密钥原文
- `src/lib/persistence/persistence-contract.ts` 提供 Postgres 持久化表结构与数据映射骨架
- `src/lib/persistence/persistence-store.ts` 提供内存/数据库仓储切换层
- `src/lib/persistence/database-client.ts` 提供数据库 URL、driver、SQL client 的接入诊断和 schema 初始化入口
- `src/lib/persistence/neon-client.ts` 通过 `@neondatabase/serverless` 把 Neon query 函数适配成通用 `SqlClient`
- `vercel.json` 保持 Hobby 免费预览可部署；15 分钟扫描先使用外部 cron，升级 Pro 后再接回 Vercel Cron

## 必填环境变量

- `MARKET_DATA_PROVIDER`: 默认 `mock`；切到真实 CoinGlass 时设为 `coinglass`
- `SCAN_API_RATE_LIMIT`: 扫描 API 每分钟限制，默认 `60`
- `JOURNAL_API_RATE_LIMIT`: 日记写入每分钟限制，默认 `30`
- `CRON_SECRET`: 手动强制刷新用，建议生产环境填写随机长字符串
- `PERSISTENCE_SCOPE`: 当前公开站点数据命名空间，未登录阶段建议保持 `public-demo`

## 后续接入时再填写

- `COINGLASS_API_KEY`: CoinGlass 会员 API
- `COINGLASS_BASE_ASSETS`: CoinGlass 查询币种白名单，例如 `BTC,ETH,SOL,ENA,SUI`
- `COINGLASS_BATCH_SIZE`: 每个扫描窗口请求多少个基础币，业余会员建议先用 `3`
- `DATABASE_URL`: Neon 或其他 Postgres
- `DATABASE_DRIVER`: `postgres`、`neon` 或 `supabase`；默认按通用 Postgres 处理
- `SUPABASE_URL`: Supabase 项目地址
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase 服务端密钥
- `AI_REVIEW_ENABLED`: 设为 `true` 才会启用服务端 AI 复核；默认关闭
- `AI_PROVIDER`: AI 供应商标识，默认按 OpenAI-compatible 处理
- `AI_API_KEY`: AI API Key
- `AI_BASE_URL`: OpenAI-compatible chat completions endpoint
- `AI_MODEL`: AI 复核模型名
- `AI_REVIEW_MAX_SIGNALS`: 每轮最多复核几个候选，默认 `3`
- `AI_REVIEW_MAX_PROMPT_CHARS`: 单个复核 prompt 最大字符数，默认 `12000`

## 稳定性边界

- GET `/api/scan` 会优先使用新鲜缓存，减少上游调用。
- POST `/api/scan` 会强制刷新，但生产环境建议配合 `CRON_SECRET`。
- Provider 失败且已有缓存时，接口会返回旧快照并把状态降为 `stale`。
- Provider 失败且没有缓存时，接口返回 `503`，不能伪装成实时成功。
- 页面右侧的“系统状态”模块会显示当前是 `mock` 还是 `coinglass`、`memory` 还是 `database`、扫描是否新鲜、归档是否已有回放帧。
- 当前 `/api/journal` 已经走 repository；真实公开使用前仍必须传入 Neon/Supabase 的服务端 SQL client，否则只是内存演示存储。
- 当前 `/api/archive` 已经走 repository；真实公开使用前仍必须传入 Neon/Supabase 的服务端 SQL client，否则只是内存演示归档。
- 当前持久化骨架定义 `journal_events`、`scan_archives`、`rank_profiles` 三张 Postgres 表、映射函数、repository、数据库接入诊断和扫描归档 bundle 构建器；Neon SDK 已安装，但没有真实 `DATABASE_URL` 时仍不会把数据永久写入远端。
- 当前已经安装 Neon 官方 serverless driver；当 `DATABASE_DRIVER=neon` 且 `DATABASE_URL` 指向 Neon 时，应用会自动创建 Neon SQL client。
- 数据库迁移入口必须配置 `CRON_SECRET` 才会运行；没有 secret 时返回 `migration_secret_missing`。
- 部署前检查入口必须配置 `CRON_SECRET` 才会运行；没有 secret 时返回 `readiness_secret_missing`。
- 部署前检查会把系统状态归为 `ready`、`preview` 或 `blocked`：`mock` 数据源允许公开预览，但不会被标记为真实行情生产就绪。
- 即使 `DATABASE_URL` 已填写，只要没有注入真实 `SqlClient`，系统会显示为 fallback/memory，不能算已经接入数据库。
- CoinGlass provider 只有在 `MARKET_DATA_PROVIDER=coinglass` 且 `COINGLASS_API_KEY` 存在时启用。
- Hobbyist 会员需要用 `COINGLASS_BASE_ASSETS` 控制查询范围，并用 `COINGLASS_BATCH_SIZE` 控制每轮请求数量。
- 当前分批队列按 UTC 日内扫描窗口轮转。例如 15 分钟 cadence、batch size 为 `3` 时，每 15 分钟只请求 3 个基础币，下一窗口自动轮到下一批。
- 公开 OHLCV provider 当前使用 Binance public futures K 线边界；该数据源不需要 API key，但只能作为 K 线和技术指标数据源，不能替代 CoinGlass 衍生品数据。
- OHLCV provider 失败时必须降级为信号数据质量提示，不能让 CoinGlass 衍生品扫描崩溃。
- AI 复核只在服务端执行，浏览器端不会接触 `AI_API_KEY`。
- AI 复核默认关闭；缺少 `AI_REVIEW_ENABLED=true` 或 `AI_API_KEY` 时，信号会显示 disabled 状态，不会隐藏复核边界。
- AI 模型请求失败、解析失败或超出 prompt budget 时，系统会回落到规则引擎，不允许页面崩溃，也不能把失败模型输出当成判断。
- AI 复核必须先找反证，再输出事实、推理、判断、策略、失败路径和不确定性；它只能复核和解释，不能替代规则引擎做最终裁决。
- Vercel Hobby 账号不能使用每 15 分钟一次的内置 Cron。免费预览阶段先用 cron-job.org、UptimeRobot 或 GitHub Actions 定时请求 `/api/scan`；升级 Vercel Pro 后再把 `*/15 * * * *` 放回 `vercel.json`。
- 如果 Vercel 项目还没有连接 GitHub 仓库，CLI 本地部署可能直接进入 `production` target；要获得标准 Preview/Production 分支工作流，需要先把代码推到 GitHub 并在 Vercel Project 里连接该仓库。

## 上线前必须确认

- Vercel 环境变量已填写。
- 本地先运行 `npm run deployment:env-plan`，确认 preview 环境变量没有缺失；生产切换前运行 `npm run deployment:env-plan -- production`。
- 请求 `GET /api/admin/deployment/readiness`，带 `Authorization: Bearer <CRON_SECRET>`；返回 `status=preview` 表示可公开预览，返回 `status=ready` 才表示真实行情生产就绪。
- 首页可以打开且没有控制台错误。
- `/api/scan` 返回 `ok: true`。
- `/api/archive` 返回 `ok: true`，且 `archive.retention.storage` 与 repository 模式一致；未接真实数据库时应为 `memory`。
- `/api/journal` 返回 entries。
- `/api/health` 返回 `ok: true`，且 `health.level` 能准确反映 `ready`、`preview`、`degraded` 或 `blocked`。
- 数据库上线前，先在目标 Postgres 执行 `buildPersistenceSchemaSql()` 生成的 SQL，并确认三张表、主键和索引存在。
- 如果不用 Neon SQL Editor 手动建表，可以请求 `POST /api/admin/persistence/migrate`；请求必须带 `Authorization: Bearer <CRON_SECRET>`。
- 数据库上线前，确认服务端已传入真实 `SqlClient`，不能只填 `DATABASE_URL` 就认为已经持久化。
- 数据库上线前，确认 `DATABASE_DRIVER` 与实际方案一致；Neon 填 `neon`，Supabase 填 `supabase`，普通 Postgres 填 `postgres`。
- Neon 上线前，确认 Vercel 已填 `DATABASE_DRIVER=neon` 和 Neon 的 `DATABASE_URL`，部署后 `/api/health` 应显示 `databaseDriver: neon`。
- CoinGlass 接入前不要把演示数据描述成实时数据。
- 数据库接入前不要承诺复盘记录、扫描归档、段位分数永久保存。
- 免费预览部署完成后，如果需要接近 15 分钟刷新，用外部 cron 请求线上 `/api/scan`；Vercel Hobby 内置 Cron 不支持这个频率。
- 本地 CLI 直传部署后，用 `vercel inspect <deployment-url>` 确认 `status: Ready`；如果当前网络无法访问 `*.vercel.app`，以 Vercel inspect 状态和你本机浏览器实测为准。
