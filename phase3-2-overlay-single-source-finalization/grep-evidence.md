# 第 3.2 步 grep 证据人工判断

## 执行命令

```bash
rg -n "unifiedDecision|unified_decision_engine|decisionSource|TRADE_PLAN_READY|READY|readyPlan|tradePlan|canTradeNow|fallback|legacy|overlay|entry|stop|target|Kline|TradingView|chart" src scripts docs
rg -n "新信号|证据信号|交易信号|高置信信号|推荐榜|狙击榜|狙击席|立即入场|强推荐|可交易候选" src docs
```

原始输出：

- `greps/single-source-chart-grep.txt`
- `greps/visible-language-risk-grep.txt`

## 人工判断

### 1. 图表交易计划线

本轮新增的 sourceId：

- `unified-decision:ready-plan:stop`
- `unified-decision:ready-plan:tp1/2/3`
- `unified-decision:wait:trigger`
- `unified-decision:wait:invalidation`

判断：安全。

原因：

- ready plan overlay 只在统一决策 `TRADE_PLAN_READY` 且数据 live 时生成。
- wait overlay 使用 `wait_condition`，不使用 stop / target 语义。
- chart 底层默认不允许 ready plan overlay，必须由 `KlinePanel` 传入 live 状态放行。

### 2. `trade-plan:*` sourceId

命中位置在 Token Dossier 报告段落，不是 Kline overlay。

判断：安全。

原因：

- `tradePlan = unifiedDecisionRead.canTradeNow ? rawTradePlan : null`。
- 非 READY 状态进入 WAIT / blocked 文案，不展示完整交易计划。

### 3. 用户可见禁用词

命中集中在：

- `docs/NAMING_STANDARD.md`
- `src/lib/ui-schema/display-names.ts`
- `src/lib/ui-schema/*.test.ts`

判断：非 production 风险。

原因：

- 这些文件用于定义禁用词和测试防回归。
- 没有新增生产页面文案使用“交易信号 / 推荐榜 / 狙击榜 / 立即入场”等词。

