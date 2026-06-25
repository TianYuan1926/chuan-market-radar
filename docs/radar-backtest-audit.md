# 雷达只读回测审计

本文定义第一轮临时回测系统。它不是量化回测，也不是收益率宣传，而是用现有真实接口检查网站当前是否具备“提前发现、正确分层、清楚复盘”的能力。

## 目标

- 检查全市场扫描是否真的运行。
- 检查信号成熟度是否把候选、证据、计划分清。
- 检查涨跌幅榜大波动币是否进入雷达复盘视野。
- 检查每日涨跌榜、扫描归档、K 线缓存和漏判复盘是否有可读样本。
- 自动生成问题编号，方便后续直接按编号修复。

## 非目标

- 不自动下单。
- 不写数据库。
- 不修改策略权重。
- 不证明历史收益。
- 不允许偷看未来数据包装结论。
- 不把榜单大波动当作交易建议。

## 命令

```bash
npm run backtest:audit
```

常用参数：

```bash
npm run backtest:audit -- --base-url http://127.0.0.1:3000
npm run backtest:audit -- --base-url http://43.161.202.227 --limit 20 --min-move-pct 15
```

本地网络无法直连公网时，可以在腾讯云服务器项目目录运行：

```bash
cd /home/ubuntu/apps/chuan-market-radar
npm run backtest:audit -- --base-url http://127.0.0.1:3000
```

## 输出

默认输出到：

```text
reports/radar-audit/<日期时间>/
```

包含：

- `summary.md`：人读报告。
- `findings.json`：机器可读问题清单。
- `samples.csv`：涨幅榜、跌幅榜、成交额榜样本和雷达状态。

问题编号规则：

- `BT-DATA-xxx`：接口或数据源读取问题。
- `BT-SCAN-xxx`：扫描覆盖、深扫、秒级通道、归档问题。
- `BT-SIGNAL-xxx`：信号成熟度、风控、交易计划边界问题。
- `BT-PLAN-xxx`：交易计划可能追涨追跌或结构赔率边界问题。
- `BT-REVIEW-xxx`：每日涨跌榜复盘、漏判、K 线缓存问题。

用户后续可以直接说：

```text
修 BT-SCAN-001 和 BT-REVIEW-002
```

## 第一轮范围

第一轮读取这些只读接口：

- `/api/health`
- `/api/frontend/radar-contract`
- `/api/archive`
- `/api/daily-movers`
- `/api/frontend/leaderboard?kind=gainers`
- `/api/frontend/leaderboard?kind=losers`
- `/api/frontend/leaderboard?kind=volume`

第一轮能回答：

- 网站现在是否真的在扫全市场。
- 当前有没有深扫、归档、秒级发现。
- 是否存在候选冒充交易计划。
- 涨跌幅榜大波动币有没有进入候选、深扫、信号或复盘视野。
- 每日涨跌榜复盘有没有真实样本。

第一轮不能回答：

- 过去半年完整提前发现率。
- 严格历史时间点重跑。
- 大规模长期策略表现。

这些需要后续正式“历史时间点回放引擎”。
