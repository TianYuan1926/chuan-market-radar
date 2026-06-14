# 每日异动归因复盘模块

## 定位

每日异动归因复盘模块用于把合约涨幅榜和跌幅榜转成可学习的市场样本。

它不是追涨杀跌入口，不给买卖建议，只回答：

- 今天为什么涨或跌？
- 上涨或下跌前发生了什么？
- 雷达是否提前发现？
- 如果没有发现，是覆盖、数据、规则还是不可学习事件的问题？

## 当前边界

当前已落地的是逻辑与持久化底座：

- `DailyMover`：上榜资产样本。
- `PreMoveWindow`：上榜前 `1h / 4h / 24h / 3d` 观察窗口。
- `MoverAttribution`：成交量、持仓、资金费率、爆仓、前置漂移等归因。
- `RadarMoverReview`：雷达已发现、漏判或不可学习样本判断。
- `DailyMoverSnapshot`：每日涨跌幅榜快照。
- CoinGlass 榜单行适配器：把外部 futures market rows 标准化成 `DailyMoverSnapshot`。
- CoinGlass 每日异动抓取服务：按配置资产低频请求榜单、构建快照并写入 repository。
- 受保护 API 入口：`POST /api/admin/daily-movers/ingest`，必须带 `Authorization: Bearer <CRON_SECRET>`。
- GitHub Actions 外部 cron：每天低频触发受保护 API，适配 Vercel 免费套餐边界。
- 持久化 schema 合同：`daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`。
- repository 写入和查询方法：`addDailyMoverSnapshot()`、`listDailyMoverSnapshots()`、`getDailyMoverSnapshot()`。

当前未落地：

- 只读 API。
- UI 展示。
- 自动规则权重调整。

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
- 外部定时触发：`.github/workflows/chuan-daily-movers.yml`
- 持久化合同：`src/lib/persistence/persistence-contract.ts`
- 仓储接入：`src/lib/persistence/persistence-store.ts`

## 下一步

1. 做“每日异动归因复盘”只读 API。
2. 与扫描归档和复盘日记关联。
3. 建立自动规则校准的只读建议层。
4. 最后再做“每日异动归因复盘”UI。
