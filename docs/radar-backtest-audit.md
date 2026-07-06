# 雷达回测与审计体系

本文定义三类不同工具，不能混用：

- `backtest:audit`：当前线上状态审计。它读取现有真实接口，检查系统现在是否在扫、是否分层、是否存在假数据或误导展示。
- `backtest:historical`：历史时间点回放 smoke test。它读取历史 K 线，在过去每个时间点只使用当时之前的数据打分，再看后续是否真的出现行情。它只验证早期评分和历史数据回放，不代表完整分析推理能力。
- `professional-backtest-audit v2`：专业回测审计系统。它必须复用真实扫描、分析、技术指标、结构、多周期、衍生品、RR、交易计划和复盘链路，用来全面审计网站核心能力。

三者都不是量化收益宣传，都不能自动下单，都不能自动改策略权重。

## 当前状态审计目标

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

## 当前状态审计命令

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
sudo docker compose --env-file .env.production exec -T web \
  npm run backtest:audit -- --base-url http://127.0.0.1:3000 --out /tmp/chuan-radar-audit
```

## 当前状态审计输出

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

## 当前状态审计范围

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

当前状态审计不能回答：

- 过去半年完整提前发现率。
- 严格历史时间点重跑。
- 大规模长期策略表现。

这些由 `backtest:historical` 负责。

## 历史时间点回放目标

`backtest:historical` 用来回答一个更核心的问题：

> 如果把时间倒回过去，系统能不能在山寨币大幅上涨或下跌前，把它排进候选？

它会：

- 拉取公共交易所 USDT 永续历史 K 线；当前优先 Binance，失败后回退 Bybit。
- 在每个历史时间点只使用当时之前的数据。
- 计算波动压缩、成交量放大、关键区间、是否已大幅启动、追涨追跌风险。
- 按雷达早期机会评分选出候选。
- 与三个基线对照：24h 涨跌幅、成交额、确定性随机。
- 统计未来验证窗口内的 MFE、MAE、命中率、偏晚率、误报率。

## 历史时间点回放命令

```bash
npm run backtest:historical
```

常用参数：

```bash
npm run backtest:historical -- --symbols SOLUSDT,ENAUSDT,ONDOUSDT --days 14
npm run backtest:historical -- --days 30 --max-symbols 200 --top-n 24
npm run backtest:historical -- --symbols-file ./symbols.txt --days 60 --interval 15m
```

默认输出到：

```text
reports/historical-backtest/<日期时间>/
```

包含：

- `summary.md`：中文读数报告。
- `findings.json`：机器可读问题清单、各基线指标、失败 symbol、分数区间诊断、原因标签诊断和漏掉的未来机会。
- `samples.csv`：每个回放点的候选、分数、MFE、MAE、命中和偏晚标签。

## 历史回放前端可见规则

历史回放不能只停留在命令行。`/review` 必须通过 `/api/frontend/review-contract` 读取最新历史回放报告，并展示：

- 雷达提前评分、24h 涨跌幅基线、成交额基线、随机基线的命中率、偏晚率、误报率、最大浮盈和最大回撤。
- 回测问题清单，尤其是没有跑赢基线、偏晚率过高、历史 K 线不足等阻断项。
- 雷达分数区间表现、原因标签表现和漏掉的未来机会。
- 没有报告时必须显示“暂无历史回测报告”，不能用模拟数据或旧口头结论补位。

页面只读报告，不触发回测，不写数据库，不自动改实时权重。

生产部署要求：腾讯云 Docker 的 `web` 服务必须把 `/app/reports` 挂到持久化 volume。历史回放报告不能只写在容器临时层，否则下一次 `docker compose up --build` 后前端会重新变成“暂无历史回测报告”。

## 历史回放边界

- 不写数据库。
- 不自动下单。
- 不自动修改策略权重。
- 不把回测结果当收益承诺。
- 不用未来数据参与当时的候选评分。
- 不把涨跌幅榜大波动直接当交易计划。
- 如果雷达没有跑赢基线，报告必须明确暴露问题，不能包装成成功。

## 专业回测审计 v2

详细规范见 `docs/backtest-v2/PROFESSIONAL_BACKTEST_AUDIT_SPEC.md`。

专业回测审计 v2 的目标不是只看命中率，而是全面回答：

- 系统是否真的提前发现山寨币机会。
- 扫描、候选、深扫、证据、计划哪一层失效。
- 技术指标是否帮助判断，还是制造噪音。
- 结构、多周期、衍生品、RR 是否真正提高信号质量。
- 哪些机会被漏掉，哪些垃圾信号被放过。
- 下一轮具体该修什么。

旧版 `backtest:historical` 后续只作为 smoke test 和回放基础设施验证；任何“网站核心分析能力是否可靠”的判断，必须以专业回测审计 v2 报告为准。

### 专业回测审计 v2 命令

```bash
npm run backtest:professional
```

常用参数：

```bash
npm run backtest:professional -- --days 7 --max-symbols 40 --top-n 10
npm run backtest:professional -- --days 30 --max-symbols 180 --top-n 24
```

默认输出到：

```text
reports/professional-backtest-audit/<日期时间>/
```

包含：

- `summary.md`：中文审计报告，必须包含问题和整改方案。
- `findings.json`：机器可读专业审计结果，schema 为 `professional-backtest-audit-report.v2`。

当前首版 v2 已经复用生产链路：

- `analyzeMarketAnomaly`
- `buildTechnicalEvidence`
- `buildTimeframeProfile`
- `buildSignalTrendRadarV3Dossier`
- `applySignalMaturity`
- v3 关键位、结构、多周期、RR、交易计划和成熟度分类

当前 v2 的衍生品接入边界：

- v2 会尝试注入 Binance 公开永续历史 Funding/Open Interest，来源必须标记为 `public_exchange`。
- 公开交易所历史衍生品只能证明“历史 OI/Funding 审计链路可用”，不能冒充 CoinGlass 付费深扫。
- CoinGlass 历史 OI/Funding/多空拥挤未注入或公开交易所历史衍生品拉取失败时，报告必须输出 `PBA-DERIVATIVES-*` 或 fetch failure。
- 输入只有公共 K 线时，扫描层只能审计历史样本，不等于完整生产 universe 调度。
- 本机网络如果无法访问交易所历史接口，应在腾讯云服务器运行该命令。
