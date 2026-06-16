# 每日异动归因复盘模块

## 定位

每日异动归因复盘模块用于把合约涨幅榜和跌幅榜转成可学习的市场样本。

它不是追涨杀跌入口，不给买卖建议，只回答：

- 今天为什么涨或跌？
- 上涨或下跌前发生了什么？
- 雷达是否提前发现？
- 如果没有发现，是覆盖、数据、规则还是不可学习事件的问题？

## 当前边界

当前已落地的是低频抓取、只读归因、关联复盘、校准候选队列、人工回测候选链路、策略版本只读表现层、K 线缓存填充基础、缓存 K 线验证结果、observedAt 事件窗口回测、outcome 健康状态展示、只读策略权重回测校准 MVP、只读策略权重变更审计 MVP、人工权重变更执行记录写入入口、只读 registry 和影子策略权重层：

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
- 持久化 schema 合同：`daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`、`ohlcv_candle_cache`。
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
- 策略版本长周期表现/回滚边界：`GET /api/daily-movers` 会从 `strategyPerformanceFeedback` 派生 `strategyVersionPerformance`，输出版本名、确认时间、后续样本窗口、已验证样本数、有效率、反证率、待复查数、阈值画像、手动回滚计划和只读回滚边界；`DailyMoverPanel` 展示“版本表现”“阈值画像”“回滚边界”和“回滚计划”，不新增写入、不触发 CoinGlass 请求、不自动改权重。
- K 线回测计划边界：`GET /api/daily-movers` 会输出 `klineBacktestPlan`，从 `backtestCandidates` 和已存每日异动样本生成 planning-only 的缓存计划，包含计划币种、周期、缓存键、请求预算封顶和 deferred symbols；该计划不执行外部 K 线请求、不占用 CoinGlass 请求、不自动改权重。
- K 线缓存持久化：`ohlcv_candle_cache` 保存公开 OHLCV candles、来源、拉取时间、周期和样本边界；repository 支持内存和 Neon 双路径读写。
- 低频 K 线缓存填充 MVP：`POST /api/admin/daily-movers/klines/fill` 通过 `CRON_SECRET` 保护，默认读取 repository 中的回测计划候选，只拉公开 Binance Futures OHLCV，跳过已有缓存，并受 `KLINE_BACKTEST_DAILY_REQUEST_BUDGET` 和 `KLINE_BACKTEST_MAX_SYMBOLS_PER_RUN` 封顶；该入口不占用 CoinGlass 请求、不自动改权重。
- 缓存 K 线验证结果：`GET /api/daily-movers` 会输出 `klineBacktestResults`，只读取 bounded `ohlcv_candle_cache`，计算缓存覆盖率、周期涨跌幅、最大冲高、最大回撤和量能变化；该结果不触发外部请求、不新增写入、不自动改权重。
- observedAt 事件窗口回测：`klineBacktestResults.eventWindowResults` 会按每日异动样本的 `observedAt` 把已缓存 candles 拆成 pre/post 窗口，输出样本方向、pre/post K 线数量、post 回撤/冲高、量能扩张和只读判定；该结果不触发外部请求、不新增写入、不自动改权重。
- outcome executor MVP：`POST /api/admin/outcomes/run` 通过 `CRON_SECRET` 保护，从 repository 读取待复查 tracking journal，使用公开 OHLCV 按 checkpoint 评估 partial win、saved、loss、expired，并把 lifecycle 结果写回 journal/rank；`.github/workflows/chuan-outcome-executor.yml` 会每小时低频触发该入口，并复用已有 `CHUAN_SCAN_URL` 推导 outcome executor URL；同一 signal 已存在 closed lifecycle outcome 时，会跳过旧 tracking entry，避免重复请求公开 K 线。
- outcome executor 运行审计：每次执行会写入一条 `outcome_executor_run` journal 审计事件，记录扫描数、到期数、写回数、跳过数、失败数、拉取 K 线数量、失败摘要和跳过原因分层；该事件保持 `research_only`，不参与段位 XP、tracking 计数或自动调权。
- outcome executor 复盘面板展示：`JournalPanel` 已把 `outcome_executor_run` 展示为只读执行批次，显示扫描、到期、写回、跳过、失败、K 线数量和跳过原因，并明确“不改权重”。
- outcome 健康状态展示：`GET /api/health` 和系统状态面板已展示自动复盘覆盖率、待复查、到期、最近写回、最近执行批次、写回数、跳过数、失败数、失败原因摘要、样本质量分层、手动校准准入门槛、只读校准流、阻断解释、样本明细、阈值层和人工回滚计划；该展示来自现有 `journal_events`，不新增 Neon 表，不自动改权重。
- outcome 样本准入基础：`buildOutcomeCalibrationAdmission()` 会把 outcome 样本按有效、反证、过期和待复查汇总，输出 `ready / collecting / blocked`、准入分、阻断项和下一步建议；该结果只用于人工校准和回滚复核，不能自动改权重。
- outcome 只读校准流：`buildOutcomeCalibrationFlow()` 会从现有 `journal_events` 汇总样本准入、`calibration_review`、`strategy_confirmation` 和确认后回滚观察，输出校准流状态、人工确认数、回滚观察数、待校准数、阻断项解释、样本分布、最近校准样本明细、阈值层和人工回滚计划；该结果只服务人工确认和回滚边界，不写策略权重。
- 只读策略权重回测校准 MVP：`buildStrategyWeightCalibrationReport()` 会从现有 `journal_events` 汇总 `calibration_review` 和 `strategy_confirmation`，输出升权候选、降权候选、隔离候选和继续观察候选；`GET /api/health` 与系统状态面板只读展示候选分布和明细，不新增表、不触发外部请求、不自动改权重。
- 只读策略权重变更审计 MVP：`buildStrategyWeightChangeAuditReport()` 会从策略权重回测校准候选生成只读人工审计包和回滚验证要求，区分可审计、需回滚、样本不足、待确认和隔离阻断；`GET /api/health` 与系统状态面板展示审计候选、可审计、需回滚和阻断审计，并明确 `canExecuteWeightChange: false`，不新增表、不触发外部请求、不执行真实权重变更。
- 人工权重变更执行记录写入入口和只读 registry：`POST /api/admin/strategy-weights/executions/record` 通过 `CRON_SECRET` 保护，系统状态面板可用管理密钥把人工审批状态、版本标签、回滚触发器和观察窗口写入 `strategy_weight_change_execution` journal 事件；`buildStrategyWeightChangeExecutionReport()` 会把这些记录汇总进 `GET /api/health`，系统状态面板展示执行记录、已记录、待审批、回滚/阻断和“不可写权重”。该层只保存审批账本，不新增表、不新增外部请求、不自动改权重，不把记录写入真实规则权重。
- 影子策略权重层：`buildStrategyWeightShadowReport()` 会从已审批的 `strategy_weight_change_execution` journal 事件生成 `baseWeights`、`shadowWeights` 和 `diffs`；`GET /api/health` 与系统状态面板展示影子权重、当前权重、建议权重、差异和“不影响实盘判断”。该层只读，不新增表、不触发外部请求、不影响真实扫描、真实评分或真实策略权重。

当前未落地：

- 自动规则权重调整；当前明确不允许自动调整。
- outcome 样本准入到人工确认、回滚边界的基础只读校准流、阻断解释、样本明细、阈值层、策略版本阈值画像、手动回滚计划、只读策略权重回测校准 MVP、只读策略权重变更审计 MVP、人工执行记录写入入口、只读 registry 和影子策略权重层已落地，但影子表现评估、真实权重生效隔离层和真实回滚验证仍需继续完善；当前不能当作完整自动校准闭环。

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
- K 线缓存计划：`src/lib/market/daily-mover-kline-backtest.ts`
- K 线缓存填充：`src/lib/market/daily-mover-kline-cache-fill.ts`
- K 线缓存后台入口授权：`src/lib/market/daily-mover-kline-cache-admin.ts`
- outcome executor：`src/lib/journal/outcome-executor.ts`
- outcome executor 后台入口授权：`src/lib/journal/outcome-executor-admin.ts`
- outcome 样本准入：`src/lib/journal/outcome-sample-admission.ts`
- outcome 只读校准流：`src/lib/journal/outcome-calibration-flow.ts`
- 策略权重变更审计：`src/lib/journal/strategy-weight-change-audit.ts`
- 策略权重执行记录：`src/lib/journal/strategy-weight-change-execution.ts`
- 策略权重执行记录后台入口：`src/lib/journal/strategy-weight-change-execution-admin.ts`
- 影子策略权重层：`src/lib/journal/strategy-weight-shadow.ts`
- outcome 健康状态：`src/lib/api/system-health.ts`
- outcome 健康面板：`src/components/radar/system-health-panel.tsx`
- outcome 执行批次复盘面板：`src/components/radar/journal-panel.tsx`
- API route：`src/app/api/admin/daily-movers/ingest/route.ts`
- K 线缓存 API route：`src/app/api/admin/daily-movers/klines/fill/route.ts`
- outcome executor API route：`src/app/api/admin/outcomes/run/route.ts`
- 策略权重执行记录 API route：`src/app/api/admin/strategy-weights/executions/record/route.ts`
- 只读 API 服务：`src/lib/api/daily-mover-readonly.ts`
- 只读 API route：`src/app/api/daily-movers/route.ts`
- 复盘队列入口：`src/app/api/journal/route.ts`
- 公开 UI：`src/components/radar/daily-mover-panel.tsx`
- 外部定时触发：`.github/workflows/chuan-daily-movers.yml`
- outcome executor 外部定时触发：`.github/workflows/chuan-outcome-executor.yml`
- 持久化合同：`src/lib/persistence/persistence-contract.ts`
- 仓储接入：`src/lib/persistence/persistence-store.ts`

## 下一步

1. 继续把影子策略权重层接入表现评估和回滚压力验证，让它服务规则复核而不是自动调权。
2. 补齐真实权重生效隔离层和真实回滚验证方案；人工执行记录入口只能保存审批账本，不能直接改变规则权重。
3. 继续保持 UI 只读研究定位，避免把涨跌幅榜做成追涨杀跌入口。
