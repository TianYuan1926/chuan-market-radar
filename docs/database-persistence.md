# 川 Market Radar 数据库持久化骨架

## 当前状态

当前项目已经具备数据库持久化的类型边界、Postgres schema 生成能力，以及可替换的 repository 仓储层。

当前生产主线按腾讯云单机 PostgreSQL 设计，Neon 保留为旧线上回滚路径。优先保存快照、摘要、复盘结果、轮换状态和必要 payload；新增功能不能默认制造高频、无上限的明细流水写入。

- 入口文件：`src/lib/persistence/persistence-contract.ts`
- 仓储文件：`src/lib/persistence/persistence-store.ts`
- 数据库接入诊断：`src/lib/persistence/database-client.ts`
- Neon 连接适配器：`src/lib/persistence/neon-client.ts`
- 测试文件：`src/lib/persistence/persistence-contract.test.ts`
- 仓储测试：`src/lib/persistence/persistence-store.test.ts`
- 数据库接入测试：`src/lib/persistence/database-client.test.ts`
- Neon 适配器测试：`src/lib/persistence/neon-client.test.ts`
- 当前运行：没有传入真实 SQL client 时自动降级为内存演示存储
- 当前已安装：`@neondatabase/serverless` 和普通 PostgreSQL driver
- 当前已接入：`/api/journal` 已通过 repository 读取和写入
- 当前已接入：`/api/archive` 已通过 repository 读取扫描归档 bundle
- 当前已接入：每日异动归因复盘快照可通过 repository 写入、列表读取和按 id 读取
- 当前已接入：`/api/health` 会读取 repository 模式，并把 `memory` / `database` 显示为系统健康状态的一部分
- 当前已接入：`appPersistenceDiagnostics` 会记录数据库是 `unconfigured`、`fallback` 还是 `ready`
- 当前已接入：`app-repository` 会在 `DATABASE_DRIVER=neon` 且存在 Neon 连接串时自动创建 Neon SQL client
- 当前已接入：`POST /api/admin/persistence/migrate` 可在授权后执行当前持久化表 schema 初始化

## 表结构

持久化骨架当前包含这些核心表：

- `journal_events`: 复盘日记、纸面跟踪、拒绝追单、失效记录
- `scan_archives`: 扫描快照摘要、回放 frame、候选信号 payload
- `v3_forward_map_snapshots`: 事前关键位地图和 Forward Map 快照，只用于复盘验证和人工校准
- `rank_profiles`: 当前段位、XP、纪律分等派生结果
- `daily_mover_snapshots`: 每日涨跌幅榜快照摘要
- `daily_mover_assets`: 每日上榜资产的可查询列和原始 payload
- `mover_attribution_reviews`: 上榜资产的归因结果、证据强度和可学习性
- `radar_miss_reviews`: 雷达是否提前发现、漏判原因和改进标签
- `ohlcv_candle_cache`: 公开 OHLCV candles 有界缓存，用于复盘、技术指标和趋势档案
- `scan_asset_states`: 每个币的深扫轮换账本，记录上次深扫、连续跳过、近期深扫次数、状态池、被动态优先级挤占和选中/跳过原因
- `macro_market_snapshots`: BTC.D、ETH.D、TOTAL2、TOTAL3 和总市值宏观快照，只作为山寨环境锚点，不生成交易信号

每张表都带 `scope` 字段。未登录阶段建议使用 `public-demo`；未来加登录后可以改成用户 id、workspace id 或匿名设备 id。

## 接入顺序

1. 在目标 Postgres 执行 `buildPersistenceSchemaSql()` 生成的 SQL。
2. 确认当前持久化表和索引存在。
3. 当前 Neon 已接入 `@neondatabase/serverless`；如果未来改 Supabase，再安装 Supabase 服务端 SDK。
4. 把目标数据库 client 适配成 `SqlClient` 的 `query(sql, params)` 形状。
5. 在 server-only 入口创建 `createDatabaseAwarePersistenceRepository({ env: process.env, client })`。
6. `/api/journal` 先写入 `journal_events`，再读取当前日志重新计算并 upsert `rank_profiles`。
7. 扫描 runtime 写入 `scan_archives`，`/api/archive` 通过 repository 读取列表、回放帧和最近两次扫描对比。
8. 每日异动归因复盘写入 `daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`，后续由数据源适配器和定时任务触发。
9. 扫描 refresh 持久化时同步 upsert `scan_asset_states`，用于下一轮 repository priority hints 和轮换公平性。
10. 受保护 `POST /api/admin/macro/ingest` 写入 `macro_market_snapshots`，供 Macro Weather 和 `/api/health.macroMarket` 读取。
11. 保留内存 fallback，只能作为数据库失败时的临时降级，不能在 UI 上说成永久保存。

## Neon 环境变量

Vercel 生产环境建议先填这几项：

- `DATABASE_DRIVER=neon`
- `DATABASE_URL=postgresql://...neon.tech/...`
- `PERSISTENCE_SCOPE=public-demo`

不要把 `DATABASE_URL` 写进客户端组件，也不要改成 `NEXT_PUBLIC_DATABASE_URL`。

## Neon 初始化顺序

1. 在 Neon 控制台创建 project 和 database。
2. 复制 pooled 或普通 Postgres connection string 到 Vercel 的 `DATABASE_URL`。
3. 在 Vercel 填写 `CRON_SECRET`，用于保护后台迁移入口。
4. 在 Neon SQL Editor 执行 `buildPersistenceSchemaSql()` 生成的当前 schema SQL，或者请求 `POST /api/admin/persistence/migrate` 执行 schema 初始化。
5. 如果走迁移接口，请求必须带 `Authorization: Bearer <CRON_SECRET>`。
6. 迁移成功后接口会返回当前持久化表清单，包括 `journal_events`、`scan_archives`、`rank_profiles`、`v3_forward_map_snapshots`、`ohlcv_candle_cache`、`scan_asset_states` 和每日异动归因复盘相关表。
7. 部署后访问 `/api/health`。
8. 确认 `health.persistence.databaseDriver` 是 `neon`。
9. 确认 `health.persistence.databaseStatus` 是 `ready`。
10. 如果仍是 `unconfigured`，说明没有读到 `DATABASE_URL`。
11. 如果是 `fallback`，说明填了 URL 但没有创建服务端 SQL client。

## 迁移接口安全边界

- `POST /api/admin/persistence/migrate` 默认拒绝无 `CRON_SECRET` 环境变量的环境。
- 请求 header 必须是 `Authorization: Bearer <CRON_SECRET>`。
- 当前没有登录系统，所以这个接口不能放宽为公开 GET。
- 没有 Neon URL 或 Neon client 未激活时，接口返回 `database_unavailable`，不会尝试执行 SQL。
- 迁移失败时接口返回 `migration_failed`，不会把连接串回显给前端。

## 仓储边界

- `detectDatabaseClientConfig()` 会识别 `DATABASE_URL` / `POSTGRES_URL`、`DATABASE_DRIVER`、`PERSISTENCE_SCOPE`。
- `DATABASE_DRIVER` 可填 `postgres`、`neon` 或 `supabase`；不填时默认按通用 Postgres 处理。
- `createDatabaseAwarePersistenceRepository()` 只有在同时存在数据库 URL 和服务端 `SqlClient` 时才会进入 `database` repository。
- `createNeonSqlClient()` 只在 driver 被识别为 `neon` 时创建 Neon client；普通 Postgres 或 Supabase 不会误用 Neon adapter。
- 如果没有传入真实 `SqlClient`，即使配置了数据库 URL，也会回落到内存 repository，保证预览不会崩。
- Postgres repository 只依赖通用 `query(sql, params)`，避免现在锁死 Neon 或 Supabase。
- `runPersistenceSchemaMigration(client)` 可用于上线前通过注入的 SQL client 执行当前持久化 schema。
- 每日异动归因复盘已落地持久化 schema、record 转换合同、CoinGlass 榜单行适配器、抓取写入服务、受保护 API 入口、公开只读 API、GitHub Actions 外部 cron 和 repository 写入/查询；尚未接入 UI、扫描归档/复盘日记关联和规则校准建议。
- `runAdminPersistenceMigration()` 负责迁移入口的 secret 校验、Neon 激活校验和迁移结果归一化。
- `addJournalEvent()` 会写入日志后重新读取当前日志样本，再派生段位状态，避免只凭单条新日志计算段位。
- `addScanArchive()` 会保存扫描摘要和轻量 replay frame；`getScanReplayFrame()` 和 `compareLatestScanArchives()` 负责回放与最近两轮对比。
- `addDailyMoverSnapshot()` 会保存每日涨跌幅榜快照、上榜资产、归因复盘和雷达命中/漏判结果；`listDailyMoverSnapshots()` 与 `getDailyMoverSnapshot()` 负责读取复盘样本。
- `addMacroMarketSnapshot()` 会保存 CoinGecko global 宏观快照；`listMacroMarketSnapshots()` 和 `getLatestMacroMarketSnapshot()` 负责读取 BTC.D/TOTAL2/TOTAL3 环境锚点。
- `buildSystemHealthReport()` 会把当前 repository 模式暴露给页面和 `/api/health`，避免只填环境变量却误以为已经持久化。
- 所有 SQL 写入都使用参数数组，不拼接用户输入。

## 重要边界

- 当前 schema 使用 Postgres `jsonb` 保存完整 payload，同时把常用查询字段拆成列。
- 这样可以兼顾后期灵活调整和基础查询性能。
- 当前 Neon SDK 已安装；没有真实 `DATABASE_URL` 时仍不会连接远端数据库。
- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 暴露到客户端组件或 `NEXT_PUBLIC_*` 环境变量。
