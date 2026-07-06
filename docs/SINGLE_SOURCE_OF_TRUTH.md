# Market Radar 单一事实源

本文件定义核心事实项的唯一来源。前端只能展示 contract 输出，不允许自己计算交易状态、计划就绪、入场、止损、目标或计划就绪区目标。

| 事实项 | 唯一来源 | 前端可计算 | 说明 |
|---|---|---:|---|
| tradePlanReady | strategy / trade-plan / risk gate + backend maturity fact | 否 | 只有后端 `TRADE_PLAN_READY` 且完整计划有效时才就绪 |
| token dossier ready | `SignalBackendDossier.signal.maturity.stage` + v3 trade plan guard | 否 | 单币档案不得根据 v3 草案自行升级计划就绪 |
| plan ready targets | `/api/frontend/radar-contract` ready targets | 否 | 前端不可把候选提升进计划就绪区 |
| candidateCount | scan proof / backend contract | 否 | 只读扫描层统计 |
| anomalyCount | scan proof / backend contract | 否 | 不等于交易机会数量 |
| radarSignals | frontend radar contract | 否 | 需包含成熟度和数据状态 |
| scan freshness | `/api/health` + scan proof | 否 | fresh/cache/stale 必须明确 |
| dataSource status | `/api/health` dataSource | 否 | CoinGlass/Binance 等状态不许前端猜测 |
| review latest report | review contract / reports | 否 | review 只研究，不影响生产 |
| WAIT / BLOCKED / TRADE_PLAN_READY | unified status dictionary + backend state | 否 | 文案统一从词典取 |
| served_cache / stale / partial | Resource status / health status | 否 | 缓存和降级不能冒充 live |
| frontend Chinese labels | `src/lib/ui-schema/status-dictionary.ts` | 否 | 页面不得自己翻译状态 |
| allowedUse | business capability contract | 否 | 当前核心分析仍是 research_only |
| canAutoExecute | business capability contract | 否 | 必须保持 false |
| canAutoAdjustWeights | review/evolution guard | 否 | 必须保持 false |
| canMutateLiveRanking | review/evolution guard | 否 | 必须保持 false |

## 强制边界

- SCAN 负责发现，不负责交易结论。
- ANALYSIS 负责结构和机会质量，不负责执行。
- STRATEGY 负责是否可交易，不负责提高扫描排序。
- BACKTEST / REVIEW 负责评价和归因，不得污染 production ranking。

## 禁止行为

- 前端根据分数自己生成计划就绪。
- 前端根据榜单涨跌幅生成推荐。
- review 根据历史命中率直接修改 live ranking。
- stale / served_cache 显示为实时数据。
- API fallback 返回 0 后被当成真实 0。
