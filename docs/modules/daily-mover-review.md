# 每日异动归因复盘模块

## 定位

每日异动归因复盘模块用于把合约涨幅榜和跌幅榜转成可学习的市场样本。

它不是追涨杀跌入口，不给买卖建议，只回答：

- 今天为什么涨或跌？
- 上涨或下跌前发生了什么？
- 雷达是否提前发现？
- 如果没有发现，是覆盖、数据、规则还是不可学习事件的问题？

## 当前边界

当前已落地的是低频抓取、只读归因、关联复盘、校准候选队列和人工回测候选链路：

- `DailyMover`：上榜资产样本。
- `PreMoveWindow`：上榜前 `1h / 4h / 24h / 3d` 观察窗口。
- `MoverAttribution`：成交量、持仓、资金费率、爆仓、前置漂移等归因。
- `RadarMoverReview`：雷达已发现、漏判或不可学习样本判断。
- `DailyMoverSnapshot`：每日涨跌幅榜快照。
- CoinGlass 榜单行适配器：把外部 futures market rows 标准化成 `DailyMoverSnapshot`。
- CoinGlass 每日异动抓取服务：按配置资产低频请求榜单、构建快照并写入 repository。
- 受保护 API 入口：`POST /api/admin/daily-movers/ingest`，必须带 `Authorization: Bearer <CRON_SECRET>`。
- GitHub Actions 外部 cron：每天低频触发受保护 API，适配 Vercel 免费套餐边界。
- 公开只读 API：`GET /api/daily-movers`，支持读取最新样本、按 `id` 查询历史样本、用 `limit` 控制列表数量。
- 持久化 schema 合同：`daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`。
- repository 写入和查询方法：`addDailyMoverSnapshot()`、`listDailyMoverSnapshots()`、`getDailyMoverSnapshot()`。
- 关联摘要：选中样本会 bounded 读取扫描归档、扫描 replay 和复盘日记，输出命中已复盘、命中待复盘、漏判有证据、不可学习等状态。
- UI 展示：`DailyMoverPanel` 已展示涨跌幅样本、归因统计、关联摘要、历史样本切换、单样本详情和规则校准候选。
- 校准候选入队：校准候选可通过 `calibration_review` 写入 `journal_events`，进入跟踪队列，但 rank 分数保持 0。
- 只读校准反馈：`GET /api/daily-movers` 会按 `calibrationTag` 汇总 `calibration_review` 的待复查、有效、反证和过期样本数，`DailyMoverPanel` 只读展示反馈趋势。
- 人工回测候选：`GET /api/daily-movers` 会从 `calibrationFeedback` 派生 `backtestCandidates`，按 `ready / collecting / blocked` 标记候选状态，`DailyMoverPanel` 只读展示样本、有效、反证和候选分数。
- 历史样本验证：`GET /api/daily-movers` 会从 `backtestCandidates` 和已存每日异动快照派生 `backtestValidations`，只读展示日记验证、历史样本、有效率、抓到率、结论和限制说明。
- 策略版本草案：`GET /api/daily-movers` 会从 `backtestValidations` 派生 `strategyDrafts`，记录候选规则、验证结论、限制条件、草案版本名和人工确认状态；`DailyMoverPanel` 只读展示，不写正式版本、不自动改权重。
- 策略版本人工确认：`DailyMoverPanel` 可把待确认草案以 `strategy_confirmation` 写入现有 `journal_events`；`GET /api/daily-movers` 会汇总 `strategyConfirmations`，并把匹配草案显示为已确认。
- 策略确认后表现反馈：`GET /api/daily-movers` 会从 `strategyConfirmations` 和确认后的 `calibration_review` 日记派生 `strategyPerformanceFeedback`，统计后续样本、有效、反证、待复查和只读状态；`DailyMoverPanel` 展示“确认后表现”，不新增表、不触发 CoinGlass 请求、不自动改权重。

当前未落地：

- 完整 K 线级回测执行，包含独立历史 K 线窗口、缓存、成本控制和适用边界验证。
- 策略版本长周期表现统计、版本回滚边界和更完整的表现趋势。
- 自动规则权重调整；当前明确不允许自动调整。

## 使用边界

模块输出必须保持 `allowedUse: "research_only"`。

允许用途：

- 复盘市场真实异动。
- 建立样本库。
- 发现雷达漏判原因。
- 为后续规则校准提供证据。

禁止用途：

- 生成追涨杀跌提示。
- 把涨跌幅榜包装成交易信号。
- 把低流动性插针或单一事件硬解释成可学习规律。

## 代码位置

- 逻辑：`src/lib/market/daily-movers.ts`
- 测试：`src/lib/market/daily-movers.test.ts`
- 数据源适配：`src/lib/market/providers/coinglass-daily-movers.ts`
- 抓取写入服务：`src/lib/market/daily-mover-ingest.ts`
- 后台入口授权：`src/lib/market/daily-mover-admin.ts`
- API route：`src/app/api/admin/daily-movers/ingest/route.ts`
- 只读 API 服务：`src/lib/api/daily-mover-readonly.ts`
- 只读 API route：`src/app/api/daily-movers/route.ts`
- 复盘队列入口：`src/app/api/journal/route.ts`
- 公开 UI：`src/components/radar/daily-mover-panel.tsx`
- 外部定时触发：`.github/workflows/chuan-daily-movers.yml`
- 持久化合同：`src/lib/persistence/persistence-contract.ts`
- 仓储接入：`src/lib/persistence/persistence-store.ts`

## 下一步

1. 设计完整 K 线级回测的低成本数据缓存和验证边界，不能直接扩大 CoinGlass 请求。
2. 建立策略版本长周期表现统计和版本回滚规则，但仍保持人工准入。
3. 继续保持 UI 只读研究定位，避免把涨跌幅榜做成追涨杀跌入口。
