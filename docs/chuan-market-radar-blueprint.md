# 川 Market Radar 核心蓝图

> 本文是 `/Users/chuan/Documents/web` 的长期事实源。后续新增、删除、优化、重构、部署、前端接线和数据源接入，都必须先对照本文。本文不再保存历史施工流水账；历史细节看 Git history 和专项文档。

> 最后整理日期：2026-06-27。当前阶段：腾讯云香港单机生产主线，GitHub `main` 为代码正本。

## 0. 唯一核心

这个网站只有一个核心目标：

```text
快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。
```

拆成四个主能力：

1. **快速全市场覆盖扫描**：尽快覆盖 Binance / OKX / Bybit 等公开合约市场，先发现哪里动了。
2. **发现真正有价值的机会**：从噪声里筛出值得深扫和继续观察的山寨币。
3. **给出可执行、可解释、可失效的策略**：说明为什么看、能不能做、怎么做、哪里错、怎么复盘。
4. **通过复盘持续自我提升**：追踪命中、失败、超时、漏判、错判和策略分型表现，让系统越来越准。

任何功能如果不能明确服务这四件事之一，就必须删除、合并或降级。

### 提前性最高原则

本网站不是行情播报器，也不是涨跌幅榜包装器。存在意义是：

```text
在行情还没完全爆发、仍有较好入场位置、止损可控、空间足够时，提前感知山寨币异动，并给出分析逻辑和策略。
```

硬规则：

- 已经大涨后才看多、已经大跌后才看空，默认不是交易机会，而是晚到信号。
- 晚到信号必须优先进入 `WAIT_PULLBACK`、`AVOID_CHASE`、`EXHAUSTION_RISK`、`REVIEW_ONLY` 或复盘样本池。
- 只有位置仍好、止损仍近、目标空间仍远、结构盈亏比仍不低于 `3:1`，才允许继续推进交易计划。
- 系统必须区分“方向判断”和“可交易性判断”：方向偏多/偏空不等于现在能做。
- 真正有价值的提醒必须说明：为什么提前看、现在位置好在哪里、触发条件是什么、错了在哪里失效。

最终判断标准：

```text
不是告诉用户行情已经发生；
而是在行情尚有布局价值时，把它推到用户面前。
```

## 1. 核心链路

后续所有系统设计必须沿着这条链路走：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

### 功能准入规则

新增功能前必须回答：

1. 它服务核心四能力中的哪一个？
2. 它进入核心链路的哪一环？
3. 它的数据来源是真实、缓存、partial、waiting 还是 unavailable？
4. 它会不会让前端看起来比后端真实能力更强？
5. 它能不能进入复盘验证？

处理规则：

- 服务核心且有真实数据：保留并做强。
- 服务核心但数据不完整：保留为 `partial/waiting/unavailable`，不能包装成完成。
- 有辅助价值但不直接服务交易判断：降级为 supporting。
- 重复展示：合并。
- 会误导判断：重构。
- 只为好看、无实战价值、挂不上核心链路：删除。

### 用户可读硬规则

前端不是调试面板。所有面向用户的页面、卡片、报告和状态标签必须使用中文业务表达：

- `Risk Gate` 必须展示为“风控门禁”。
- `RR` 必须展示为“结构盈亏比”。
- `Evidence` 必须展示为“证据融合/证据链”。
- `CVD proxy` 必须展示为“主动买卖代理”。
- `MFE/MAE` 必须展示为“最大浮盈/最大回撤”。
- `LIVE / EMPTY / FAILED / WATCH_ONLY / WAIT_PULLBACK` 等内部状态不得直接出现在普通用户界面，必须映射成中文业务状态。
- `sourceId`、内部枚举、worker 名称、schema 名称只能作为折叠调试或 title 辅助信息；主界面不得用它们解释交易判断。
- 每轮回测、审计、扫描复盘和分析报告，默认必须使用中文业务表达。内部问题编号可以保留，但必须配套中文标题、中文解释、中文影响判断和中文整改方案。
- 对用户汇报时，不能只说“已跑完”“已通过”“发现问题”；必须说明测试范围、数据来源、核心指标、发现的问题、为什么严重、下一步如何整改。

例外：系统中心、开发诊断、接口返回和测试代码可以保留内部字段名，但必须避免让它们冒充用户可读分析结论。

## 2. 不做什么

硬禁止：

- 不自动下单。
- 不接交易所下单 API。
- 不接入外部 AI 做判断、复核或报告；反证复核由代码规则完成。
- 不让前端编入场、止损、目标、方向或结构盈亏比。
- 不用 mock、旧缓存、0 值、动画或跳动数字冒充真实数据。
- 不把轻扫标记当交易信号。
- 不把榜单当推荐。
- 不把 CoinGlass 失败写成“市场无机会”。
- 不把已经涨完的多头、已经跌深的空头包装成狙击机会。
- 不因为方向正确就忽略位置、结构盈亏比、追涨追空风险和失效条件。
- 不接入清算热力图，不实现 liquidation heatmap、liquidation zone、heatmap provider，不把潜在清算区作为方向或目标位依据。
- 不绕过付费套餐、登录、验证码、Cloudflare、防爬、会员墙、robots.txt 禁止路径。
- 不做中国大陆访问专项优化；当前主线是腾讯云香港。

允许保留但必须降级：

- 首页介绍：不再作为主入口；`/` 必须直接进入雷达总控。若未来需要介绍页，只能放到独立辅助页，不得抢占实战入口。
- 榜单：只做市场观察，不等于机会。
- 大盘环境：只做顺风/逆风背景，不直接给个币方向。
- 外部资讯：只做事件背景和风险输入，不直接喊单。
- 规则反证：只审查成熟候选，不扫描全市场，不绕过风控门禁。
- 告警：只提醒状态变化，不制造交易结论。
- 宠物、段位、彩蛋、启动动画、全局浮动信号流、全局浮动日记、音效按钮：不得挂载在生产主界面；相关前端状态库和生产入口已清理。如后续恢复，必须重新论证它们直接服务复盘纪律或真实告警，并默认不抢占核心信息。

## 3. 信号成熟度

所有币必须分层展示，不能混在一起。

| 层级 | 含义 | 能否进主信号区 | 能否进狙击榜 | 能否出交易计划 |
| --- | --- | --- | --- | --- |
| `LIGHT_SCAN_MARK` | 轻扫发现异常 | 否 | 否 | 否 |
| `DEEP_SCAN_CANDIDATE` | 值得深扫验证 | 候选区 | 否 | 否 |
| `EVIDENCE_SIGNAL` | 已有结构和数据支持 | 是 | 否 | 仍需风控门禁 |
| `TRADE_PLAN_READY` | 证据、结构、结构盈亏比、风控都通过 | 是 | 是 | 是 |
| `BLOCKED` | 被风控门禁拦截 | 可说明 | 否 | 否 |
| `INVALIDATED` | 结构失效 | 可归档 | 否 | 否 |
| `COOLDOWN` | 冷却观察 | 可说明 | 否 | 否 |
| `REVIEW_ONLY` | 行情已大幅发生，只作为复盘教材 | 可说明 | 否 | 否 |

狙击榜只允许 `TRADE_PLAN_READY`。没有就空着，不能用候选补位。

所有前端展示必须同时表达两个结论：

1. 方向：偏多、偏空、中性、冲突。
2. 可交易性：可布局、等突破、等回踩、已过热不追、已跌深不追空、只复盘。

如果方向正确但位置已经失去优势，必须降级为等待或复盘，不能进入狙击榜。

## 4. 分析推理顺序

分析必须按固定顺序走，不能因为某个指标很亮就跳过结构和风控。

```text
大盘是否允许做山寨
-> 板块/全市场是否有资金异动
-> 个币是否相对强或相对弱
-> 是否处于启动前或趋势切换状态
-> 是否靠近关键位
-> 量能和衍生品是否确认
-> 多周期是否冲突
-> 是否已经过热/跌深，是否仍有可交易位置
-> 结构盈亏比是否至少 3:1
-> 风控门禁是否放行
-> 是否生成交易计划并进入复盘追踪
```

硬规则：

- 盘面结构优先于技术指标。
- 低周期不能推翻高周期。
- 市场环境必须分层，不得把“30 天回测取数窗口”误写成唯一长周期判断：短周期环境看 `4-24h`，中周期环境看 `3-7 天`，长周期环境看 `30-90 天`，大级别趋势背景看 `1d + 1w`。
- 当前长周期默认下限是 `30 天`，但分析和回测报告必须保留 `30-90 天` 的边界说明；真正决定高周期顺逆风的是日线/周线结构和 BTC/ETH/BTC.D/TOTAL2/TOTAL3 背景。
- 技术指标只能辅助趋势、动能、波动、位置和衰竭判断。
- 单一指标、单一 K 线、单一数据源不能直接生成交易结论。
- Funding 高不是强势，优先解释为拥挤风险。
- OI 上升不能单独看涨。
- RSI 超买不等于做空，RSI 超卖不等于做多。
- 结构盈亏比 `3:1` 是最低结构赔率下限，不是固定目标。
- 追涨多头和追跌空头默认拦截；除非回踩/反抽确认后仍有结构空间。
- 大涨后继续看多必须输出“等回踩/等二次确认”；大跌后继续看空必须输出“等反抽承压/等破位回踩”。
- 不交易也是正式输出状态，必须说明原因。

## 5. 数据源职责

### Binance / OKX / Bybit

定位：全市场快速发现主力。

用途：

- USDT 永续 universe。
- WebSocket 秒级轻扫。
- public 24h ticker。
- K 线 / OHLCV。
- 成交额、波动、价格速度。
- 公开 funding / OI / taker 可用数据。
- 交易所交叉验证和污染过滤。

边界：

- 可用于轻扫、候选排序、结构分析和公开交叉验证。
- 不能绕过证据融合 / 风控门禁直接生成交易计划。
- WebSocket 滑动窗口不能冒充 24h 市场榜单。

### CoinGlass Hobbyist

定位：付费深扫确认源，不是全市场分钟级发现源。

当前设计约束：

- 按 Hobbyist 等级设计。
- 约 `30 调用/分钟`。
- 服务器升级不改变 CoinGlass 限速。
- 必须使用令牌桶、批次、缓存、预算、失败降级和健康展示。

优先使用：

- supported exchanges / supported coins / supported pairs。
- pairs markets。
- open interest current / 4h+ history。
- funding current / 4h+ history。
- long-short / top trader crowding data。
- taker buy/sell 如果生产探针证明可用。
- BTC/ETH ETF、fear/greed、exchange assets 等只做大盘背景。

当前边界：

- Taker / CVD / real fund flow 未稳定前必须显示 `partial/waiting/unavailable`。
- OI、Funding、多空比只能作为资金质量和拥挤证据。
- CoinGlass 返回 `Upgrade plan`、鉴权失败、限速、空数据或 0 clean rows，必须进入 health、metadata、backend-contract 和前端数据源说明。
- 公共交易所 fallback 必须标注为公开源，不能冒充 CoinGlass。
- `deep-scan-quality.v1` 必须展示 planned、raw、clean、clean rate、failed assets、request failures 和边界说明；深扫失败不能被写成“市场无机会”。

### 合法外部情报

只接安全、稳定、有实际意义的数据：

- 交易所官方公告 / RSS / API。
- DEX Screener 官方 API。
- CoinGecko / CoinPaprika / DexPaprika / Token Lists / Trust Wallet Assets 等合法公开源。
- DefiLlama、CoinGecko global 等宏观公开 API。
- 项目官网 blog、Medium RSS、GitHub release：只抓标题、时间、URL、摘要和标签。
- 区块浏览器 API：只做低频大额转账、CEX 入金/出金、供应变化、LP 变化等风险背景。

固定进入链路：

```text
RawSource
-> SourceFetchRun
-> ExternalEvent
-> EvidenceItem / RiskEvent
-> 证据融合
-> 策略引擎 / 风控门禁
-> Report
-> Review Outcome
```

禁止：

- 不抓付费全文。
- 不抓会员墙。
- 不抓个人隐私。
- 不绕过登录、验证码、防爬或 robots 禁止。
- 不让外部事件直接生成交易结论。

## 6. 页面职责

### `/dashboard` 雷达总控

只回答系统是否真的在运行：

- 全市场覆盖数。
- 轻扫数量。
- 候选数量。
- 深扫数量。
- 证据信号数量。
- 交易计划就绪数量。
- 数据源状态。
- 最近扫描时间。
- 故障和 partial 原因。
- 轻扫质量：滚动窗口、成交量异常分、主动买卖代理、worker 心跳和发现层边界。
- 扫描稳定性：锁、缓存、worker 心跳、数据新鲜度和稳定性问题。

不能用动画替代运行证明。

### `/signals` 候选池与狙击榜

必须区分：

- 轻扫异常。
- 深扫候选。
- 证据信号。
- 计划就绪。
- 被拦截。
- 已失效。
- 发现层事实：轻扫阶段、提前分、主动买卖压力、主动买卖代理质量和晚到风险。

狙击榜只放 `TRADE_PLAN_READY`。候选池可以满，狙击榜可以空。

### `/token/[id]` 单币档案

这是最重要的交易判断页面。必须回答：

- 为什么看。
- 现在能不能做。
- 多还是空，还是只观察。
- 关键位在哪里。
- 支撑/压力/前高/前低/箱体/趋势线在哪里。
- 多周期是否冲突。
- OI / Funding / 成交量是否支持。
- 反证是什么。
- 风控门禁为什么放行或拦截。
- 入场触发条件是什么。
- 止损在哪里。
- 目标在哪里。
- 结构盈亏比是否达标。
- 分批止盈怎么做。
- 判断错了在哪里失效。
- 后续如何复盘。
- 发现层 / 主动成交：该币是否被轻扫提前命中、当前处于启动前/突破观察/晚到、主动买卖压力、主动买卖代理质量，以及该证据能不能用于交易计划。

没有后端结构化计划时，前端不得补交易计划。

### `/review` 复盘进化

必须回答：

- 哪类信号有效。
- 哪类信号坑人。
- 哪些币漏掉了。
- 哪些规则该增强。
- 哪些规则该降权。
- 当前样本有没有统计意义。
- 规则反证是否真的绑定证据。
- 今日涨幅榜和跌幅榜中，哪些币在启动前已有可识别征兆。
- 系统当时是否扫到这些币；如果扫到但没升级，原因是什么。
- 如果系统没扫到，是轻扫、候选排序、深扫轮转、分析推理还是数据源哪一层漏掉。
- 晚到信号是否被正确降级为等待、拦截或复盘，而不是误推成交易计划。
- 提前发现复盘：轻扫候选中启动前、晚到、主动买卖代理样本和漏判复盘样本数量。

样本不足必须显示 collecting / statistically thin，不能宣传稳定胜率。

### `/leaderboard` 榜单

只做观察和复盘样本入口，不做推荐，不做狙击榜补位。

榜单的核心价值不是让用户追涨杀跌，而是给复盘进化系统提供“已经发生的大样本教材”：

- 每天记录新增涨幅榜、跌幅榜、成交额榜和异常波动榜。
- 对涨跌幅夸张的币回看启动前 `1h / 3h / 6h / 12h / 24h` 的扫描、K 线、量能、OI、Funding、相对强弱和关键位状态。
- 归因系统是否提前发现、是否晚到、是否错过、是否错误拦截。
- 形成 missed opportunity、late signal、overextended mover 和 pre-move pattern 样本。

必须显示：

- 榜单来源。
- 交易所范围。
- 排序口径。
- 更新时间。
- 是否候选。
- 是否深扫。
- 是否已有信号。
- 是否只适合复盘。
- 如果已经涨跌过大，必须标注“已发生/不追/等回踩/等反抽”，不能暗示可直接做。

### `/market` 大盘环境

只做山寨顺风/逆风背景：

- BTC / ETH。
- BTC.D。
- TOTAL2 / TOTAL3。
- Funding / OI 背景。
- ETF / fear & greed 如真实接入才展示。
- `macro-readiness.v1` 必须说明 BTC.D、TOTAL2、TOTAL3 哪些真实可用、哪些缺失；宏观状态只能影响顺风/逆风背景，不能直接给个币方向。

不能直接给个币买卖方向，不能降低结构盈亏比门槛。

### `/system` 系统中心

只做生产健康：

- CoinGlass。
- Binance / OKX / Bybit。
- WebSocket。
- Redis。
- Postgres。
- worker heartbeat。
- API usage。
- 数据新鲜度。
- 部署提交号和回滚状态。

不能硬编码 healthy。

## 7. 当前工程事实

### 生产主线

- 当前生产主线：腾讯云香港单机 Docker Compose。
- 当前服务器基线：4C / 8G / 120G SSD / 200Mbps 峰值带宽。
- 当前代码正本：GitHub `main`。
- 当前生产数据库：本机 PostgreSQL。
- 当前缓存/锁/队列底座：本机 Redis。
- 当前反向代理：Caddy。
- 当前展示事实源：v0 前端 UI 作为当前展示事实源，只读消费 `/api/frontend/*` 合同，不负责生成交易判断。
- Vercel / Neon：只保留为旧回滚路径，不再作为新功能默认约束。

标准发布流程：

```text
本地改代码
-> 本地测试和构建
-> 提交并推送到 GitHub main
-> 腾讯服务器 git pull origin main
-> docker compose build/up 重启
-> 服务器健康检查和页面/API 验收
```

自动发布硬规则：

- 后续完整交付包完成后，默认由 Codex 自动执行 GitHub 提交、推送、腾讯云同步、Docker 重建/重启和生产验收，不再每次等待用户手动推送。
- 自动发布前必须先完成对应测试、构建和蓝图更新；验证不通过时禁止推送和部署。
- 自动发布不得提交 `.env`、真实 API key、服务器密码、数据库密码、SSH 私钥或其它敏感信息。
- 如果 GitHub 登录、SSH 认证、腾讯云权限、网络或第三方服务导致自动发布失败，必须直接汇报具体阻断点、已完成到哪一步、下一步需要用户提供什么。
- GitHub `main` 仍是代码正本；腾讯服务器只部署 `main` 的已验证版本。服务器不得成为长期写代码来源。

服务器不是写代码的地方。紧急服务器热修后，必须立刻同步回本地和 GitHub。

### 当前已落地

已落地的能力只表示“有基础”，不表示“实战已经成熟”。

- Next.js App Router 前后端一体。
- Docker Compose 单机部署。
- PostgreSQL 持久化。
- Redis 锁、限速、短缓存和 worker 心跳底座。
- Binance / OKX / Bybit public universe 和轻扫基础。
- WebSocket 轻扫 worker 基础。
- CoinGlass 深扫、pacing、预算和失败诊断。
- 全市场 coverage proof。
- 候选池轮换和 scan asset states。
- 信号成熟度分层。
- 多周期硬门控。
- Evidence Engine v2。
- Altcoin Trend Radar v3 分析层：Market Reading Engine、Key Level Engine、Forward Level Map、Pattern Library MVP。
- v3 复盘事件：`trend_switch_review`、`forward_map_review`。
- 结构盈亏比 / 风控门禁。
- TradingView 主图合同。
- 前端合同：radar、leaderboard、token dossier、review、journal、kline、external intel。
- 实时能力分层合同：`realtimeCapability.v1` 已把秒级、15-60 秒、1-5 分钟、5-15 分钟、低频和复盘周期分清楚。
- `/dashboard` 已展示实时能力分层：秒级 WebSocket / SSE 只用于发现异常和状态变化，不能直接生成交易计划。
- 生产 smoke 已校验 `realtimeCapability`：必须有 lanes，且所有 lane 的 `canCreateTradeSignal=false`。
- 轻扫质量诊断合同：`lightScanQuality.v1` 已展示数据新鲜度、覆盖、候选、滚动窗口、成交量异常分、worker 心跳和交易边界。
- `/dashboard` 已展示轻扫质量诊断：只解释发现层可靠性，不生成交易计划。
- 生产 smoke 已校验 `lightScanQuality`：必须有 checks，且 `canCreateTradeSignal=false`。
- 专业回测审计 v2 已接入 10x10 审计轮次：10 类目标山寨、每币最多 10 个历史节点、候选大池竞争、`latest-progress.json` 实时进度和 `/review` 前端展示。正式审计默认 10 个目标币、80 个候选币、Top10，避免“10 个币选 Top10”的自欺式捕获率。
- 合法外部情报基础：DEX Screener latest boosts 与 CoinGecko trending collector，可生成 context-only ExternalEvent 和 EvidenceCandidate，不直接生成交易信号。
- 外部情报 token identity 合同：DEX 事件可带 chain/contract，CoinGecko trending 可带 coingeckoId/logo/name/symbol，映射可信度必须显式展示；仍只能作为 context-only。
- 外部情报源就绪合同：`external-intel.v1.sourceReadiness` 已显示每个合法源是 live、waiting、disabled、partial 还是 failed，所有源 `canCreateTradeSignal=false`。
- Daily Mover Review 已输出 `DailyMoverPreMovePattern`：最佳启动前窗口、早期预警分、前兆线索和漏判原因，用于研究“为什么没提前看到”。
- `REVIEW_ONLY` 已接入雷达合同、单币档案、信号成熟度池、异常表解释和 dashboard 计数；晚到信号不会被包装成交易计划。
- 本地发布前闸门 `npm run production:preflight` 已落地，统一运行 typecheck、market/worker tests、lint 和 build。
- 生产依赖审计脚本 `npm run production:audit` 已落地，默认 high/critical 阻断，moderate 作为非阻断发现输出。
- 生产演练脚本 `npm run production:drill` 已落地：检查远端服务、生成 Postgres 备份、验证恢复保护和备份可读性，不会误恢复真实库。
- P8 提前发现质量层已落地：public light scan 和 websocket light scan 会输出 `earlyOpportunityScore`、`opportunityPhase` 和 `overextensionRisk`；Daily Mover 的启动前复盘会进入 repository priority hints 的 `early_opportunity` 调度原因。第一轮整改已把 WebSocket 轻扫排序改为启动前优先、晚到硬 cap，并把分析引擎置信度接入提前性加分与晚到惩罚。
- 发现层合同已接入前端主页面：`radarSignals.discovery`、`tokenDossier.discovery` 和 `review.discoveryReview` 已把轻扫阶段、提前分、主动买卖压力、主动买卖代理质量、晚到风险和决策边界展示出来。
- 信号生命周期和可交易性阅读层已接入：`radarSignals.lifecycle` 负责“刚出现/近期有效/旧信号/已过期”，`radarSignals.operatorRead` 负责“狙击榜/重点观察/验证中/不看/只复盘”和下一步动作。
- 单币分析报告已完成第一轮用户可读化：前端不再把 `sourceId`、内部状态枚举和英文调试名作为主解释，普通报告只展示中文业务结论，内部 ID 仅作为 hover/title 辅助。
- `/review` 已展示“每日涨跌榜复盘状态”：真实快照数、选中样本、漏判复查、校准建议、最近快照和下一步动作；没有真实样本时必须显示暂无/收集中，不能伪造。
- 单币执行地图 `token-execution-map.v1` 已接入后端合同和单币档案：方向读取、可交易性、位置质量、等待条件、失效条件和 TradingView 边界必须由后端输出，前端只展示。
- `/dashboard` 已展示 `scanStability`：锁、缓存、worker 心跳、数据新鲜度和稳定性问题不再只藏在后端。
- `/signals` 已展示候选发现层事实，晚到/高延展候选会降级为 `REVIEW_ONLY`，不能冒充狙击机会。
- `/token/[id]` 已展示“发现层 / 主动成交”，并明确主动买卖代理只能用于发现和排序，不能单独生成交易计划。
- `/review` 已展示“提前发现复盘”，用于观察启动前、晚到、主动买卖代理、漏判复查样本积累。
- `/review` 已展示 `opportunityCalibration.v1`：启动前、突破观察、晚到、主动买卖代理四类机会样本的门禁、阈值和只读校准边界。
- `coreChainGovernance` 后端和前端合同。
- `/dashboard` 已展示 `coreChainGovernance` 核心链路体检面板。
- `/dashboard` 已展示 `coreChainGovernance.featureTriage` 功能分级和 `pageRoles` 页面职责。
- `coreChainGovernance.p0Completion` 已成为 P0 完成度事实源：必须 `percent=100` 且 `status=ready`，P0 才算完成。
- `coreChainGovernance.apiRoles` 已标记核心接口职责：每个核心 API 必须说明返回什么、不能做什么。
- `/dashboard` 已展示 P0 完成度、完整功能分级、清理队列、页面职责和接口职责。
- 生产 smoke 已校验 P0：`coreChainGovernance.v1`、`p0Completion=100/ready`、`apiRoles` 和 `canCreateTradeSignal=false`。
- `/dashboard` 系统运行状态来自后端合同状态，不允许硬写“正常”。
- 全市场扫描证明头部状态来自 `scanProof.status`，不允许硬显示绿色健康。
- `/market` 综合参与建议来自宏观、衍生品、扫描和数据源合同状态，不允许硬写“适度参与”。
- `/market` 快照指标只展示后端合同值，不允许用前端随机波动制造“实时感”。
- `/signals` 状态标签来自 `radarSignals.status` 与候选 fallback 后资源状态，并必须映射成中文业务状态，不允许硬写 `LIVE` 等内部标签。
- 首页、介绍动画、热力图等辅助展示不得用“实时/LIVE”包装非实时合同快照或视觉演示。
- 复盘 outcome、missed opportunity、daily mover、forward map review 基础。
- 规则反证边界。
- 个人仓位镜头。
- 生产部署脚本和 smoke。

### 最近一次生产验收样本

最近一次已验证生产状态：

- GitHub 与腾讯服务器提交一致：以最新 production smoke 输出为准。
- `/api/health` 为 `ready`。
- 数据源为 `coinglass`。
- 数据库为 `ready`。
- 扫描为 `fresh`。
- 页面 `/`、`/dashboard`、`/signals`、`/leaderboard`、`/market`、`/review`、`/system` 返回 200。
- `/api/frontend/radar-contract` 返回 `core-chain-governance.v1`。
- `/api/frontend/radar-contract` 返回 `realtime-capability.v1` 和 `light-scan-quality.v1`。
- `/api/frontend/radar-contract` 返回 `coreChainGovernance.p1Completion`，用于证明 P1 快速全市场发现层是否闭环。
- `/api/radar/backend-contract` 返回 `core-chain-governance.v1`。
- 生产 smoke 显示 public leaderboards live，token dossier 图表 `canUseMockCandles=false`。

这些数字会随市场和扫描轮次变化；以最新 health、backend-contract、radar-contract 和 production smoke 为准。

## 8. 当前路线与剩余工作

只列真实还需要做的核心工作，不列装饰性想法。

### P0：核心链路可见化与清理

状态：已闭环，后续只做维护。

完成标准：

- 全站页面、核心功能和核心接口均已结构化标记。
- `/dashboard` 可见 P0 完成度、核心链路、功能分级、清理队列、页面职责和接口职责。
- `p0Completion.percent=100` 且 `p0Completion.status=ready`。
- 生产 smoke 会阻断 P0 回退。
- 前端展示能力不得强于后端真实能力。

执行规则：

- P0 低于 100% 时，不允许进入 P1。
- 后续发现新页面、新 API、新展示模块，必须先补进 `coreChainGovernance`，再继续对应功能开发。

### P1：快速全市场扫描继续增强

状态：已闭环到前端可见层，后续只做长期样本维护和 P2 质量增强。

完成标准：

- `coreChainGovernance.p1Completion.percent=100` 且 `status=ready`。
- P0 必须先闭环；P1 不能绕过核心链路治理。
- WebSocket / public light scan 必须有状态、覆盖、候选、freshness 和 worker 心跳。
- 秒级发现层必须输出滚动窗口、成交量异常分、主动买卖代理等质量指标。
- 主动买卖代理优先来自 Binance `aggTrade`、OKX `trades`、Bybit `publicTrade` 等公开主动成交流；成交流缺失时才回退到滚动价格/成交量方向推断。它只能用于异常发现和候选排序，不能冒充交易所官方完整资金流，也不能直接生成交易计划。
- 深扫轮转必须有公平性证明，不能让 BTC/ETH/SOL 等固定币长期霸占非锚点深扫位。
- 长尾探索必须保底，未进入深扫不代表淘汰。
- 状态池、历史复盘、missed opportunity 和动态优先级可以参与调度，但不能直接改交易结论。
- Binance / OKX / Bybit public data 都要作为快速发现层来源。
- CoinGlass Hobbyist 只做资金质量确认和深扫验证，请求必须受预算、pacing 和套餐边界保护。

已落地：

- `ScanLightScanCandidate.microstructure`：`buyPressureUsd`、`sellPressureUsd`、`cvdProxyUsd`、`tradeFlowImbalance`、`pressureSide`。
- WebSocket worker 已接入 public taker trade 流：Binance `aggTrade`、OKX `trades`、Bybit `publicTrade`；`proxyQuality=taker_trade_proxy` 时使用真实成交方向估算买卖压力，`proxyQuality=rolling_price_volume_proxy` 时为 ticker 兜底推断。
- 前端合同必须同时识别 `microstructure` 字段和 `trade_flow_proxy_imbalance` / `cvd_proxy_positive` / `cvd_proxy_negative` reason 标签；禁止出现后端已有主动买卖代理证据、前端质量统计仍显示 0 的“两张皮”状态。
- `lightScanQuality.v1`：新增 `cvdProxyCandidateCount`、`buyPressureCandidateCount`、`sellPressureCandidateCount` 和 `cvd_proxy_quality` 检查。
- `radarSignals.discovery`：把 top candidate 的阶段、提前分、主动买卖压力、主动买卖代理质量和晚到风险暴露给前端。
- `/signals` 成熟度池已显示发现层事实；高延展/晚到候选会以 `REVIEW_ONLY` 或只复盘语义展示。
- `coreChainGovernance.p1Completion`：新增 P1 完成度、检查项、剩余项和 summary。
- `/dashboard` 核心链路体检显示 P1 快速扫描完成度。
- `/dashboard` 扫描稳定性面板显示 Redis 锁、缓存、worker 心跳和新鲜度问题。
- 生产 smoke 会等待并校验 `realtimeCapability.secondLevelOnline=true`；P1 不能在秒级通道未在线时假通过。

硬边界：

- 轻扫、盘口/成交代理、主动买卖代理、榜单和轮转调度都不能生成交易计划。
- 没有证据融合、结构、结构盈亏比、风控门禁、失效条件和复盘追踪时，任何币都不能进入交易计划就绪。
- 如果 WebSocket、公开源或 CoinGlass 降级，页面必须显示 partial/failed，不允许用动画、旧缓存或 0 值冒充正常。

### P2：机会发现质量增强

状态：已完成机会质量合同、执行边界展示和前端可见化；已完成第一轮候选排序和晚到降权整改；后续继续用专业回测和真实 outcome 校准。

目标：让系统更早发现“还没完全爆发、仍有布局价值”的山寨，而不是追着已经涨完/跌完的币给方向。

已落地：

- 明确区分 early setup、active breakout、late trend、overextended、exhaustion risk。
- 榜单、轻扫、深扫、证据、计划必须继续分层。
- 轻扫和榜单发现的强波动币，如果已经错过最佳位置，优先进入复盘样本池，而不是交易计划。
- v3 已给出的 `AVOID_CHASE_LONG/SHORT`、`LONG_EXHAUSTION/SHORT_EXHAUSTION`、`CHASE_RISK` 和衰竭风险会进入 `REVIEW_ONLY`。
- 榜单 fallback 对无真实信号且 24h 波动过大的涨跌幅行降级为 `REVIEW_ONLY`，禁止追涨追跌。
- 单币档案和信号池已显示轻扫阶段、提前分、主动买卖压力、主动买卖代理和延展风险，让“已经涨完/跌完”的样本不会被误读为好位置。
- `opportunityQuality.v1` 已接入 `/api/frontend/radar-contract`：统一展示启动前、突破观察、证据信号、计划就绪、晚到、拦截、等待回踩/反抽等数量。
- `/dashboard` 已展示“机会质量与执行边界”：明确候选下一步、追涨追跌拦截数量和狙击榜只允许 `TRADE_PLAN_READY`。
- WebSocket 轻扫排序已从“涨幅/成交额优先”改为“启动前机会优先”：压缩放量、低位移、主动买卖代理加权；15m 窗口内大幅位移且贴近极值的 late move 会被 score cap，保留为发现/复盘样本但不能抢核心深扫位。
- 生产分析引擎 `analyzeMarketAnomaly` 已接入提前性校验与晚到惩罚：有量能、压缩、位置仍好且无 1h/4h 硬冲突才加分；已经大幅偏离启动区会降为观察/复盘，不能因为方向正确就进入 near trigger。
- 证据链已输出“提前性校验”和“晚到风险”，报告必须解释为什么优先观察或为什么不追。

继续做强：

- 长期样本阶段继续根据真实 outcome 减少追涨追跌浪费。
- 每个未进入下一层的币继续沉淀更细原因：未深扫、数据不足、位置太差、结构盈亏比不够、已经晚到、等待回踩、等待反抽。
- 阈值调整只能在 `opportunityCalibration.v1` 样本门禁通过后人工确认，不能自动改实时权重。

验收标准：

- 系统不会因为币已经涨很多就直接推多头计划。
- 系统不会因为币已经跌很多就直接推空头计划。
- 候选池能展示“提前观察/等待确认/等待回踩/只复盘”的差异。
- 狙击榜只出现仍有结构位置优势和 `结构盈亏比 >= 3:1` 的计划。

### P3：策略输出增强

状态：已完成单币策略就绪合同、单币执行地图、`REVIEW_ONLY` 保护、发现层解释和个人仓位镜头显式展示；后续继续增强结构计划表达。

- 单币档案继续做强。
- 多周期结构展示继续细化。
- 关键位、Forward Map、支撑压力、失效线、目标区继续增强。
- 技术指标解释继续保持低权重辅助。
- 资金流、主动成交、主动买卖代理未稳定前继续显示 partial。
- 单币档案已单独展示“发现层 / 主动成交”，让 discovery evidence 与 strategy evidence 分层，避免把轻扫证据误当交易计划。
- TradingView 与后端关键位/计划展示继续明确边界。
- 单币档案必须把“方向”和“可交易性”分开展示。
- 大涨后的多头默认输出等回踩/等二次确认/不追；大跌后的空头默认输出等反抽承压/等破位回踩/不追空。
- 交易计划必须说明当前位置为什么仍然可做；不能只说趋势强。
- 如果位置已经失去优势，必须输出 `AVOID_CHASE`、`WAIT_PULLBACK`、`WAIT_RETEST`、`REVIEW_ONLY` 或 `EXHAUSTION_RISK`。
- 单币档案不得把已 late/no-chase 的 v3 plan 显示成可交易计划；必须清空 tradePlan 并展示复盘观察/风控原因。
- `token-strategy-readiness.v1` 已接入单币档案：单独说明现在能不能做、缺什么、下一步等什么、个人仓位镜头是否适用。
- `token-execution-map.v1` 已接入单币档案：单独说明方向读取、可交易性、位置质量、等待条件、失效条件和 TradingView 边界。
- 个人仓位镜头仍只在后端结构交易计划生成后展示，不改变结构盈亏比、证据融合、风控门禁或自动执行边界。

### P4：复盘进化增强

状态：Daily Mover 启动前窗口、漏判归因、提前发现复盘和机会校准合同已增强；长期 outcome 和策略分型仍需继续积累。

- 积累真实 outcome 样本。
- 完整统计最大浮盈 / 最大回撤 / 先到目标 / 先到止损 / 超时。
- 强化 missed opportunity。
- 强化 Daily Mover Review：每天把新增涨幅榜、跌幅榜、成交额榜和异常波动榜纳入复盘样本。
- 对大涨/大跌币已回看启动前 `1h / 3h / 4h / 6h / 12h / 24h / 3d` 的征兆，并输出最佳窗口、早期预警分、前兆线索和漏判原因。
- 统计系统是否提前扫到、是否晚到、是否误拦截、是否因为轮转/阈值/数据源漏掉。
- 建立 late signal 惩罚：涨完看多、跌深看空不能计为优质命中。
- 建立 pre-move pattern 样本库：压缩、量能累积、相对强、Funding 中性、OI 温和变化、关键位临近等启动前征兆。
- 策略分型表现统计。
- 人工校准和回滚验证。
- 真实权重建议只能人工确认后生效，不能自动改实时权重。
- `/review` 已展示 `discoveryReview`：轻扫候选数量、启动前/晚到/主动买卖代理/漏判复查样本和复盘关注点。
- `discoveryReview.calibration` 已接入 `/review`：明确提前发现到结果、晚到惩罚、最大浮盈/最大回撤关联是否可用，样本不足时必须显示 collecting/empty。
- `opportunityCalibration.v1` 已接入 `/review`：固定样本门禁、早期分阈值、晚到惩罚和结构盈亏比下限只读展示；样本不足时不能宣传胜率或自动改权重。

### P5：合法外部情报

状态：基础 collector、token identity 合同、外部情报质量摘要和源就绪状态已完成；后续继续补更多合法源和低频 enrich。

- DEX Screener 已有 latest boosts 基础 collector；事件会带 chain/contract 作为 token identity。后续补 pair enrichment、流动性变化、链/地址到 symbol 的映射。
- CoinGecko trending 已有基础 collector；事件会带 coingeckoId/logo/name/symbol 作为 token identity。后续补更稳定的跨源映射。
- `external-intel.v1.quality` 已展示 enabled/active source、成功/失败 run、identity/mapped 数量；失败时不补假事件。
- `external-intel.v1.sourceReadiness` 已展示每个源的 live/waiting/disabled/failed/partial 状态和下一步动作；未启用或失败源不能被前端包装成可用数据。
- 接交易所官方公告和 RSS。
- 接 Token identity / logo / symbol mapping 数据源。
- 接宏观公开 API：BTC.D、TOTAL2、TOTAL3、稳定币流动性等。
- 所有外部事件必须转成证据、风险或复盘输入，不能直接生成交易结论。

### P6：生产运维

状态：本地发布前闸门、GitHub -> 腾讯云发布、smoke、日志打包、回滚、依赖审计和备份恢复演练脚本已完成；后续继续做真实周期演练和长期报警。

- 继续稳定 GitHub -> 腾讯云自动发布。
- 发布前必须先跑 `npm run production:preflight`，再推送和生产部署。
- 回滚脚本：`npm run production:rollback`，必须显式设置 `ROLLBACK_TO`。
- 日志打包：`npm run production:logs`，输出 `deploy/diagnostics/prod-logs-*.txt`。
- 依赖审计：`npm run production:audit`，默认 high/critical 阻断，moderate 输出为待评估风险。
- 备份恢复演练：`npm run production:drill`，生成 Postgres 备份、验证恢复保护和备份可读性，不直接恢复生产库。
- 补齐 worker 长期异常告警。
- 持续检查服务器 HEAD 与 GitHub main 一致。
- `ops-reliability.v1` 已接入 `/api/frontend/radar-contract` 和 `/dashboard`：统一展示 Postgres、Redis、worker、CoinGlass 预算、深扫质量和扫描稳定性。

### P7：前端统一打磨

状态：已完成核心化清理第一批。`/` 重定向到 `/dashboard`；全局宠物、彩蛋、启动动画、全局浮动信号流、顶部假搜索/通知/音效按钮、信号页浮动日记、复盘页段位横幅已从生产主界面移除。前端保留现有视觉质感，但主界面只服务扫描、候选、深扫、分析、策略和复盘。

二批清理状态：已完成生产无关状态库清理。`pet-store.ts`、`egg-store.ts`、`pet-brain.ts`、`training-engine.ts`、`ranks.ts`、`sound.ts` 已删除；`/api/frontend/ui-state` 只允许 `ui_preferences`，`frontend_ui_states` 只作为前端偏好表，不再承载宠物、彩蛋、声音或训练状态。

三批清理状态：已完成前端可见层物理清理。旧前端 mock 市场事实源 `src/lib/mock-data.ts` 已删除；未挂载的 `manual-journal.tsx`、`journal-stats.tsx`、`river-canvas.tsx`、`sparkline.tsx`、`components/ui/button.tsx` 已删除；旧介绍页、启动页、Hero 手掌美元、宠物、段位、训练卡、river 背景相关 CSS 已从 `globals.css` 清理；无用 `@base-ui/react` 和 `class-variance-authority` 依赖已移除。生产主界面只保留服务扫描、候选、深扫、分析、策略、复盘和系统健康的页面与组件。

四批清理状态：已完成真实可见页面收束。顶部导航改为作战链路语言：作战总控、候选验证、异动复盘榜、环境门控、复盘进化、数据源健康。`/signals` 去掉右侧 `LiveFeed` 和 `MarketHeatmap` 辅助面板，只保留狙击榜、信号成熟度池和异动候选明细；`/leaderboard` 去掉滚动 ticker 和第二套基础表格，只保留 `MarketLeaderboards` 作为真实榜单与复盘样本入口。`price-ticker.tsx`、`leaderboard-table.tsx`、`live-feed.tsx`、`market-heatmap.tsx` 已删除，避免非核心可见层回流。

等核心链路稳定后再统一精修。

重点不是“更花”，而是：

- 信息密度更高。
- 运行状态更清楚。
- 分层更明确。
- 不隐藏候选。
- 不截断关键解释。
- 不把 partial 伪装成 ready。
- 动效只服务运行感。
- 不把内部枚举、schema 名、sourceId、worker 名称当作普通分析文案展示。
- 分析报告必须回答“为什么看、能不能做、下一步是什么、哪里错就撤”，不能只堆数据名。

### P8：提前发现质量层

状态：已完成第一轮落地和第一轮整改；后续靠真实样本继续校准阈值。

目标：让系统优先找到“还没完全爆发、仍可能有较好位置”的山寨，而不是只追踪已经大涨或大跌的标的。

已落地：

- `ScanLightScanCandidate` 新增：
  - `earlyOpportunityScore`：启动前机会分，只用于候选排序和深扫调度解释。
  - `opportunityPhase`：`early_setup / breakout_watch / late_move / neutral_watch`。
  - `overextensionRisk`：`low / medium / high`。
- WebSocket 秒级轻扫会对预启动、压缩放量、低位移、主动买卖代理、窗口波动做早期机会评分。
- WebSocket 秒级轻扫的主动买卖代理优先使用公开主动成交流；ticker 推断只作为兜底，前端必须通过 `proxyQuality` 区分。
- WebSocket 秒级轻扫会对 15m 窗口内大幅位移并贴近窗口极值的币标为 `late_move`，降低其早期机会分。
- WebSocket 秒级轻扫排序已硬性降低 late move 抢位能力：`overextensionRisk=high` 的候选必须被 score cap，不能因为瞬时涨跌幅和成交额大就压过启动前候选。
- 分析引擎置信度已加入 `earlyOpportunity` 与 `lateMovePenalty`：高周期结构冲突时不给提前性加分；成交量不足时不给提前性加分；晚到惩罚会影响 state、risk、summary 和 evidence。
- Public REST 轻扫会对 24h 压缩、低位移、靠近关键边缘且未过度延展的币加分；对 24h 大幅延展样本加 `overextended_move_capped`。
- Daily Mover Review 的 `preMovePattern.earlyWarningScore` 会转成 repository priority hints 的 `earlyOpportunityScore`。
- `planUniverseScan` 动态优先级新增 `early_opportunity` reason，用于把历史漏判里的启动前征兆反哺到深扫排序。
- `/api/frontend/radar-contract.lightScanQuality` 会展示早期机会候选数、late move 候选数和每个 top candidate 的阶段。

硬边界：

- `earlyOpportunityScore` 不能生成交易计划。
- `early_opportunity` 只能影响深扫调度优先级，不能绕过证据融合、结构分析、结构盈亏比和风控门禁。
- `late_move` 不是做反向交易信号，只说明该币更适合复盘或等待回踩/反抽。
- 前端显示 early score 时必须同时保留轻扫边界：轻扫是发现层，不是交易结论。

后续继续做：

- 用真实 outcome 样本校准早期机会分阈值。
- 对 long / short 分别校准 `late_move` 位置边界。
- 把早期机会候选和后续最大浮盈/最大回撤做更细的复盘关联。
- 继续用 `backtest:professional-round` 检查整改是否真的降低迟到率、提高早期捕获率；如果雷达仍跑不赢 momentum，不能宣称提前发现能力成熟。

## 9. 个人仓位镜头

本网站是为用户本人定制的合约雷达。

个人展示假设：

- BTC / ETH：固定 `150x`。
- 其他山寨币：按交易所允许最高杠杆换算。
- 仓位语境：全仓风险提示。
- 初始入场保证金：总资金 `0.3%`。

硬边界：

- 这只用于交易计划生成后的保证金、名义仓位、ROE、止损亏损和目标收益展示。
- 不改变证据融合。
- 不改变风控门禁。
- 不改变 `3:1` 结构盈亏比。
- 不改变趋势阶段。
- 不新增自动下单权限。
- 如果山寨最高杠杆未知，必须显示 `waiting/unavailable`，不能臆造。

正确顺序：

```text
先有结构计划
-> 再算结构盈亏比
-> 再过风控门禁
-> 最后套个人仓位镜头做展示换算
```

## 10. 规则反证边界

外部 AI 已取消。系统不再配置 `AI_API_KEY`，不调用 OpenAI-compatible、DeepSeek 或其它模型 API。

规则反证只能做：

- 找反证。
- 找逻辑漏洞。
- 把证据链解释得更清楚。
- 复盘归因。
- 生成更易读的中文报告。

规则反证不能做：

- 全市场扫描。
- 直接喊买卖。
- 自动改权重。
- 绕过结构盈亏比。
- 绕过风控门禁。
- 绕过结构失效。
- 凭空新增事实。

规则反证输出必须绑定证据项、信号 id、复盘样本或已知后端事实。

## 11. 测试和验收

每次重要搭建至少按改动类型运行：

- `npm run typecheck`
- `npm run test:market`
- `npm run lint`
- `npm run build`

涉及生产时还要运行：

- `npm run production:deploy`
- `npm run production:smoke`

回测与审计：

- `npm run backtest:audit`
- 定位是“当前状态审计”，不是历史回放，不是量化收益回测。
- 只读拉取 `/api/health`、`/api/frontend/radar-contract`、`/api/archive`、`/api/daily-movers` 和核心榜单合同。
- 只输出 `reports/radar-audit/<日期时间>/summary.md`、`findings.json`、`samples.csv`。
- 不写数据库，不改策略权重，不代表历史收益，不允许用未来数据包装结论。
- 自动生成 `BT-DATA`、`BT-SCAN`、`BT-SIGNAL`、`BT-PLAN`、`BT-REVIEW` 问题编号，后续按编号修复。

- `npm run backtest:historical`
- 定位是“历史时间点回放 smoke test”，用于验证历史 K 线回放和早期评分是否能跑通。它不能代表完整网站分析推理能力。
- 当前实现读取公共交易所 USDT 永续历史 K 线，优先 Binance，失败后回退 Bybit；在每个历史时间点只使用当时之前的数据计算候选分数。
- 统计雷达候选对比 24h 涨跌幅、成交额和确定性随机基线的命中率、偏晚率、误报率、MFE 和 MAE。
- 报告必须输出分数区间诊断、原因标签诊断和漏掉的未来机会；发现跑输基线时必须能定位问题，不允许只给一句“表现不好”。
- 只输出 `reports/historical-backtest/<日期时间>/summary.md`、`findings.json`、`samples.csv`。
- 不写数据库，不自动下单，不自动改权重，不把回测结果包装成收益承诺。
- 如果雷达没有跑赢基线，必须如实输出 `HBT-*` 问题，不能把失败包装成成功。
- `/api/frontend/review-contract` 必须只读接入最新历史回放报告；`/review` 必须展示历史回放验证面板。
- 历史回放前端面板必须展示雷达与基线命中率、偏晚率、误报率、最大浮盈/最大回撤、问题清单、分数区间、原因标签和漏掉的未来机会。
- 没有历史回放报告时必须显示暂无报告；不能用 mock、旧口头结论或 0 值冒充已验证能力。
- 腾讯云 Docker 部署必须把 `/app/reports` 挂到持久化 volume；历史回放报告不能只存在容器临时层里，否则重建容器后前端会重新显示暂无报告。
- 后续所有“系统是否真的有选币能力”的判断，必须优先看历史回放结果，而不是只看当前页面是否有信号。
- 专业回测审计 v2 规范见 `docs/backtest-v2/PROFESSIONAL_BACKTEST_AUDIT_SPEC.md`。后续判断网站核心能力，必须使用专业回测审计 v2，而不是只看旧版 `backtest:historical`。
- 专业回测测试方案见 `docs/backtest-v2/BACKTEST_TEST_PLAN.md`。该文档定义每轮正式回测到底要测试什么、如何抽样、如何对比基线、如何输出问题编号、根因和整改方案。
- 专业回测审计 v2 必须复用真实扫描、分析、技术指标、结构、多周期、衍生品、RR、交易计划和复盘链路。它每轮必须输出问题清单、问题归因和下一轮整改方案。
- 专业回测必须按时间顺序回放，不允许用完整历史数据直接计算未来涨幅再反推信号。每个扫描点只能使用该时间点之前的数据先生成候选、信号、证据链、结构判断、RR 和交易计划；未来数据只能在信号生成之后用于评估表现、命中、失败、超时、最大浮盈、最大回撤和漏判归因。
- 每轮正式回测结束后，必须给用户一份中文详细报告。报告至少包含：本轮测了哪些币、哪些时间节点、使用哪些数据源、测试哪些能力、核心指标、捕获率、迟到率、漏判样本、误判样本、RR/计划就绪情况、跑赢/跑输哪些基线、问题严重程度、根因判断、整改顺序和下一轮验收标准。
- 每轮正式回测报告必须单独增加“对比上一轮是否提升”小节，不能只报告本轮数字。至少对比：radar 命中率、提前命中率、质量分、radar TopN 捕获率、启动前机会捕获率、大周期背景机会捕获率、迟到率、漏判早期命中数、`TRADE_PLAN_READY` 数量、高优先级问题数量、计划卡点 Top3、是否跑赢 random / volume / momentum。每项必须标注“提升 / 退步 / 持平 / 不可比”，并解释不可比原因。
- 回测报告必须遵循“回测 -> 发现问题 -> 归因 -> 整改方案 -> 整改 -> 验证 -> 下一轮回测”的闭环。不能连续回测却不整改，也不能只输出英文枚举、代码字段或问题编号。
- 如果某轮回测结果不支持“系统具备实战可靠筛选能力”，必须明确写出“不可靠/未达标”的原因，不能用模糊表述包装成进展。
- 回测系统本身必须专业化；不能用轻量评分或单一命中率去判断完整交易分析系统是否可靠。
- `npm run backtest:professional` 是专业回测审计 v2 的正式命令。它当前复用生产 `analyzeMarketAnomaly`、技术指标、多周期、v3 dossier、RR、交易计划和成熟度分类，并注入 Binance 公开永续历史 Funding/Open Interest 作为 `public_exchange` 衍生品证据。
- 专业回测 v2 的公开交易所历史衍生品只能用于审计 OI/Funding 是否改善判断，必须标记为 `public_exchange`；不能冒充 CoinGlass，也不能替代生产 CoinGlass 付费深扫的真实状态。
- 专业回测 v2 选择历史 K 线、历史衍生品、技术指标、结构、关键位和 RR 时必须只使用 `observedAt` 之前的数据，严禁未来函数；历史 Funding Z-score 和 OI 变化率都必须从历史窗口计算，不能用当前快照、0 值或旧缓存补齐。
- 如果某个币历史 Funding/OI 拉取失败，报告必须保留 `PBA-DERIVATIVES-*` 或 fetch failure，不能静默把衍生品能力标记为已验证。
- 专业回测 v2 必须输出 radar / momentum / volume / random 四条基线对比，至少包含样本数、命中率、提前命中率、迟到率、质量分、平均 MFE、平均 MAE、入选时已波动幅度和成交量倍数；如果 radar 的质量分没有跑赢 random 或长期跑不赢 momentum，必须输出 `PBA-SCAN-BASELINE-*`。单一命中率不能作为完整能力结论，因为 momentum/volume 可能靠追涨追跌获得更高粗命中率。
- 专业回测 v2 必须输出提前性审计和漏判机会样本：提前/迟到数量、迟到率、无计划样本数、未进入 radar topN 但事后达到阈值的机会样本。漏判样本只能用于复盘校准，不能自动改实时权重。
- 专业回测 v2 必须输出漏判和迟到的具体归因：节点类型、币种类型、目标在 radar 排序中的名次、主要迟到集中区、未捕获但不晚到的机会样本。只给总命中率或总迟到率不算完成审计。
- 专业回测 v2 必须把 radar TopN 拆成机会分层，不允许单一分数让已涨完/已跌深样本和启动前机会混在一起。固定机会池包括：启动前机会、回踩/反抽确认机会、大周期背景机会、风险复盘教材。
- 当前阶段正式回测主口径收敛为三大核心能力：`扫描`、`分析`、`策略`。其它指标只能作为证据明细，不能喧宾夺主；前端、美观、宠物、彩蛋、榜单装饰和页面动效不进入当前验收。
- 每轮正式回测必须输出 `coreCapabilityMetrics`，并在 Markdown 报告第一屏展示三张成绩单：扫描能不能提前发现，分析能不能判断机会质量，策略能不能给出可执行计划。每张成绩单必须包含状态、分数、通过率、测试节点、主要失败原因和下一步整改。
- 如果三大核心任一项为“不合格”，当前网站状态仍只能标记为“可运行但不完整”或“不能支撑实战”，不能用其它功能完成度包装成核心能力达标。
- `risk_review` 只能做复盘教材，不得进入可交易机会 TopN，不得被算作狙击机会捕获。
- Top10 默认配额为启动前机会 6、回踩/反抽确认机会 3、大周期背景机会 1、风险复盘教材 0；其它 TopN 按同一原则分配，剩余额度只能由可交易机会池补齐。该配额是第七轮后针对启动前机会捕获率不足的当前规则；如后续回测证明误伤回踩/大周期机会，必须先记录证据再调整。
- 专业回测报告必须输出 `opportunityLaneMetrics`：每个机会池的节点数、入选数、捕获率、命中率、迟到率、漏判早期命中、计划就绪数和平均排名。只给总捕获率不算完成审计。
- 专业回测报告必须输出 `planBlockerMetrics`：聚合 `tradePlan.blockedBy`，说明交易计划未就绪到底卡在结构盈亏比、结构止损、目标位、反应确认、趋势完整度还是风控门禁。
- 提前性审计的迟到率优先统计雷达实际选中的可交易机会，不再把所有目标节点或风险复盘教材混在一起制造失真指标。
- `npm run backtest:professional-round` 是 10 类山寨、每币 10 个历史节点的正式专业审计轮次。默认必须采用“10 个目标币 + 80 个候选币 + Top10”的大池竞争协议。
- 每轮正式专业回测必须更新一轮目标山寨币：默认读取上一轮 `latest-progress.json` 的 `plannedSymbols` 并在本轮目标池中尽量避让；只有可用币种不足时才允许少量重复。每轮仍必须保持 10 个不同山寨币，不得用 BTC/ETH 或上一轮同一组目标币反复证明能力。
- 专业审计必须把目标币池和候选排序池分开：目标币用于测试，候选池用于模拟全市场筛选压力。禁止用“10 个币选 Top10”证明扫描有效。
- 专业审计节点必须按小/中/大分层验证窗口执行，不能所有节点统一只看 24h：默认 small=4h、medium=24h、large=96h。每个节点必须输出 `validationWindowBars`、`validationWindowHours` 和 `validationWindowLabel`，前端和报告不得隐藏该边界。
- 专业回测报告必须同时写清市场环境窗口：短周期 `4-24h`，中周期 `3-7 天`，长周期 `30-90 天`，大级别趋势 `1d + 1w`。`--days 30` 只是默认历史 K 线取数窗口和长周期下限，不等于唯一长周期市场环境。
- 如果候选池数量不大于 TopN，专业回测必须输出 `PBA-SCAN-ROUND-DESIGN-001`，该轮捕获率和基线对比不能作为系统能力证明。
- `/review` 历史回测面板必须展示专业审计进度：状态、目标币、候选池大小、完成节点、当前币、当前节点和最近捕获结果。
- 专业回测 v2 必须是生产 Docker 镜像内可执行能力，不允许只停留在本地开发环境。Docker 构建必须执行 `npm run build:market-cli` 并复制 `.tmp/market-tests`；`npm run backtest:professional` 通过 `tools/run-professional-backtest.mjs` 统一入口运行，避免服务器缺少 TypeScript dev 依赖或 CLI 编译产物时前端长期看不到 v2 报告。
- `/review` 的历史回测面板必须兼容 `auditV2`，展示专业回测 v2 的基线对比、提前性、漏判机会、问题归因和整改方案；如果只有旧版历史回放报告，则只能显示 v1 能力边界。
- `/review` 判空必须优先识别 `auditV2`。专业回测 v2 不依赖旧版 `lanes.radar.count`，不能因为旧版 lane 为 0 就把 v2 报告显示成“暂无历史回测报告”。
- `historical-backtest-readonly` 必须有 v2 回归测试，确保 `professional-backtest-audit-report.v2` 生成后能进入 `/api/frontend/review-contract` 和 `/review`，不能出现“报告存在但前端看不到”的断层。

最近一次正式专业审计样本：

- 报告目录：`reports/professional-backtest-audit/2026-06-26T132540-108Z`，生产容器路径为 `/app/reports/professional-backtest-audit/2026-06-26T132540-108Z`。
- 参数：10 个目标山寨、80 个候选币、每币 10 个历史节点、Top10、30 天 Binance public futures 15m K 线。
- 本轮先发现并修复一个回测适配器根因：历史 Open Interest 端点从会跳转官网 HTML 的 `futures.binance.com` 改为 `fapi.binance.com`，修复后拉取失败从 80 降为 0。`reports/professional-backtest-audit/2026-06-26T130404-571Z` 是端点错误暴露轮，只能作为故障记录，不能作为有效能力结论。
- 结果：生产服务器完成 100/100 节点，目标节点 radar 捕获 11/100，迟到 48/100，交易计划就绪 0，拉取失败 0。
- 基线：radar 命中率 22.5%，random 19.2%，volume 23.5%，momentum 31.7%；radar 跑赢 random，但仍低于 volume 和 momentum。虽然 radar lane 迟到率只有 1.3%，但 10x10 目标节点迟到率仍为 48%，说明候选排序和目标节点捕获仍不可靠。
- 漏判归因：`PBA-SCAN-ROUND-MISSED-001` 输出 11 个不晚到但未进 Top10 的机会样本，平均 radar 排名 27.36；主要漏判节点仍集中在 `pullback_retest`。
- 阻断问题：`PBA-SCAN-ROUND-001` 捕获率不足、`PBA-SCAN-ROUND-BASELINE-001` 未跑赢随机、`PBA-SCAN-ROUND-MISSED-001` 仍有早期机会漏判、`PBA-TIMING-ROUND-001` 迟到率偏高、`PBA-RR-001` 大量结构盈亏比不足、`PBA-PLAN-001` 无计划就绪、`PBA-REVIEW-001` 多个样本先触发止损。
- 结论：当前网站仍不能宣称具备稳定实战选币能力。下一步必须优先整改候选排序、提前机会特征、pullback/retest 捕获、RR/结构目标质量、计划就绪条件和失败归因；在下一轮回测前不能把页面信号包装成可靠狙击结果。

上一轮问题整改：

- 专业回测 radar 排名不再只按 `signal.confidence` 排序；已加入 `professionalAuditRadarScore`，优先识别不晚到的回踩/反抽再确认、压缩、早期放量样本。
- 已对已经大幅涨跌、位置极端、高波动 meme 追涨样本做降权，避免回测继续把“涨完/跌完才提示”的样本当作核心能力。
- 交易计划层增加最后质量防线：即使上游 location/RR 标记为可交易，只要结构止损缺失、止损/目标方向错误、RR 低于 3:1、或结构止损距离超过 6%，计划层必须阻断。
- 专业审计已从单一 24h 验证窗口升级为分层窗口：small 节点默认验证未来 4h，medium 节点默认验证未来 24h，large 节点默认验证未来 96h；报告和 review 合同会保留每个节点的验证窗口。
- 市场环境窗口已固化为分层口径：短周期 `4-24h`、中周期 `3-7 天`、长周期 `30-90 天`、大级别趋势 `1d + 1w`；默认 `30 天` 只代表长周期下限和回测取数默认值。
- 历史 Open Interest 适配器端点已修复为 `https://fapi.binance.com/futures/data/openInterestHist`，避免 302 HTML 被当作 JSON 解析，保证专业回测能真实注入公开 OI 历史。
- 下一步必须按“回测 -> 问题 -> 整改方案 -> 整改 -> 验证”执行，不允许连续跑回测却不整改。

本轮整改进展：

- 专业回测 radar 排名已第二轮强化：新增“安静吸筹”“受控放量”“低量压缩”三类当时可见的提前机会特征，避免只奖励已经走出来的动量和成交量。
- 专业回测 radar TopN 已从单一分数竞争升级为机会分层竞争：启动前机会、回踩/反抽确认机会、大周期背景机会分别有固定名额，风险复盘教材不能抢占机会名额。
- 专业回测报告已新增 `opportunityLaneMetrics` 和 `planBlockerMetrics`，用于回答“哪类机会漏了”和“交易计划到底卡在哪里”。
- `/review` 专业回测面板已新增机会池表现和交易计划未就绪卡点；漏判样本会展示机会池、计划状态和 blocker，不再只显示 MFE/MAE。
- 计划卡点已统一中文化：`bull_structure_broken`、`bear_structure_broken`、`upper/lower_wick_exhaustion`、`chase_risk` 等内部码不得直接暴露在回测报告和 `/review` 普通展示里。
- 漏判机会样本已扩展归因字段：报告现在必须输出当时 radar 排名、节点类型、币种类型、周期层级和验证窗口，不能只写“某币漏判”。
- 专业回测 v2 的 `baselineMetrics` 已同步映射到通用 `lanes`，避免 `/review` 或接口出现“v2 报告存在但 lanes 全 0”的错觉。
- `/review` 回测面板已中文化基线、严重度、层级和节点类型，并新增漏判机会样本卡片，前端不再只展示英文内部字段。
- Markdown 回测报告已改为按问题编号聚合，重复 RR/止损/计划问题显示数量和代表样本，完整明细仍保存在 `findings.json`。
- 新增回归测试覆盖：提前机会排序、受控放量排序、v2 基线映射、漏判样本排名和节点字段。
- 整改后验证轮 `reports/professional-backtest-audit/2026-06-26T145301-811Z` 已完成：100/100 节点，拉取失败 0，radar 捕获 13/100，迟到 52/100，交易计划就绪 0，高优先级问题 119。
- 生产服务器同步后已在 Docker 容器内重新生成专业审计报告 `/app/reports/professional-backtest-audit/2026-06-26T151543-567Z`：100/100 节点，交易计划就绪 0，高优先级问题 120；`/api/frontend/review-contract` 已读取到该报告并返回 `status=partial`。
- 最新本地验证轮 `reports/professional-backtest-audit/2026-06-26T172358-239Z` 已完成：100/100 节点，80 个候选币，拉取失败 0，交易计划就绪 0，高优先级问题 116。
- 最新机会分层结果：启动前机会 42 个、入选 10 个、捕获率 23.81%、漏判早期命中 9 个；回踩/反抽确认机会 3 个、入选 3 个、捕获率 100%；大周期背景机会 8 个、入选 1 个、捕获率 12.5%、漏判早期命中 4 个；风险复盘教材 47 个，全部禁止进入可交易 TopN。
- 最新基线结果：radar 命中率 21.1%、迟到率 0%，random 19.2%，volume 23.1%，momentum 30.5%。radar 仍未跑赢动量基线，也未跑赢成交量基线，说明“提前但不够准”和“高质量机会捕获不足”仍是核心问题。
- 最新计划卡点：结构盈亏比低于 3:1 出现 64 次、空头结构已破坏 35 次、结构盈亏比未知 34 次、多头结构已破坏 33 次、方向不明确 14 次。交易计划就绪为 0，不能把当前证据信号包装成狙击机会。
- 最新结论：本轮修复了报告可读性、机会分层和卡点诊断，但没有根治核心选币能力。下一轮必须整改三件事：提高启动前/大周期背景机会捕获率，修复结构目标/止损/RR 生成质量，核实历史 OI/Funding 是否真正被分析链路使用，而不是只完成拉取。
- 本轮针对 `2026-06-26T172358-239Z` 问题继续整改：专业回测 10x10 节点选择已改成“历史时间桶 + 当时可见特征”抽样，正式审计节点不再用未来涨跌幅挑选；未来 K 线只在信号生成后用于评价 MFE/MAE/命中/止损。
- 本轮修正历史衍生品判定：`partial` 历史 Funding/OI 不再被粗暴报成 `PBA-DERIVATIVES-001` 完全缺失；报告必须区分 `tested`、`partial` 和 `unavailable`。
- 本轮继续强化提前机会排序：启动前机会增加低量压缩、受控位置和非极端位置加分；回踩/反抽增加缩量承接/承压特征；大周期背景机会 Top10 配额从 2 提高到 3，避免大周期可学习样本长期排在 Top10 外。
- 本轮验证已通过 `npm run build:market-cli` 和回测相关单测 20/20；完整 `npm run backtest:professional-round` 因本地无法连接 `https://fapi.binance.com` 超时，尚未形成新一轮有效能力报告。不能宣称 radar 指标已提升，必须等 Binance 公共期货接口或腾讯云生产环境可访问后重跑同一协议。

2026-06-27 生产验证轮：

- 本轮针对 `2026-06-27T002645-666Z` 暴露的问题继续整改：专业回测基线不再只用粗命中率判断优劣，已新增 `earlyHitRatePct` 和 `qualityScore`，把提前性、迟到率、MFE、MAE 和入选时已波动幅度纳入比较，避免把追涨追跌型 momentum/volume 基线误判成更优。
- 本轮修正历史审计方向推断：高位区间受阻/上影不再机械解释为多头追涨，低位区间承接/下影不再机械解释为空头追跌；中位弱变化优先判为方向不明，避免强行给方向。
- 生产服务器 Docker 镜像已同步 GitHub `main` 并重新构建，容器内 `/api/health` 和 Caddy 入口均返回 200；web 容器为 healthy，worker 容器已启动。
- 生产容器内重新生成专业审计报告 `/app/reports/professional-backtest-audit/2026-06-27T010858-438Z`：100/100 节点，80 个候选币，交易计划就绪 0，高优先级问题 104。
- 最新基线结果：radar 命中率 4.3%、提前命中率 4.3%、迟到率 0%、质量分 6.46；random 命中率 6.2%、提前命中率 3.31%、迟到率 18.5%、质量分 1.18；volume 命中率 8.2%、提前命中率 3.55%、迟到率 32.4%、质量分 -2.12；momentum 命中率 19.2%、提前命中率 11.9%、迟到率 91.6%、质量分 -9.88。
- 对比上一轮：高优先级问题从 108 降到 104，计划就绪仍为 0；radar 粗命中率仍低，但质量分跑赢 random/volume/momentum，说明系统更少追涨、位置更早，但绝对捕捉强度仍未达标。
- 最新机会分层结果：启动前机会 72 个，入选 9 个，捕获率 12.5%，命中 1 个；回踩/反抽确认机会 7 个，入选 3 个，捕获率 42.86%，命中 0；大周期背景机会 0 个；风险复盘教材 21 个，禁止进入可交易 TopN。
- 最新计划卡点：结构盈亏比未知 49 次、结构盈亏比低于 3:1 44 次、多头结构已破坏 36 次、方向不明确 33 次、空头结构已破坏 26 次。交易计划就绪仍为 0，当前系统不能把证据信号包装成可执行狙击机会。
- 最新结论：本轮修复了基线评价口径和一部分方向误判，但核心能力仍未成熟。下一轮整改必须优先处理：启动前机会捕获率偏低、绝对命中率偏低、RR/关键位生成不稳定、计划就绪长期为 0、`PBA-REVIEW-001` 大量先触发止损。

2026-06-27 本轮修复调整：

- 针对 `reward_risk_unknown` 和 `reward_risk_below_minimum` 过多的问题，v3 位置/RR 不再只用最近一个小压力/小支撑作为唯一目标；现在会在可追溯关键位里选择第一个能满足 3:1 的前方结构目标。最近小目标仍可作为 TP1 观察，但不能把更远且可追溯的结构空间误杀。最低 RR 仍固定为 3:1，没有放宽。
- v3 关键位保留策略从单纯按分数截断改为支持/压力均衡保留：优先保留当前价上下方的关键支撑和压力，再补充已到达/已破位的高分位，避免因为只留近端高分位导致远端目标丢失、RR 变成未知。
- 专业回测的 `nodeRole` 只注入本轮目标币自身，不污染同一时间点的其它候选币。这样既能让目标币按“启动前/回踩/大周期”等测试角色正确归类，又不会把测试标签泄露给全市场候选排序。
- 本轮已补充单测覆盖：远端结构目标满足 3R、空头远端支撑满足 3R、节点角色分类不把 late extension 包装成机会。本地 `backtest:professional-round` 仍因本机无法连接 `fapi.binance.com` 超时，正式能力验证必须在腾讯云生产容器内执行。
- 腾讯云生产容器已同步 GitHub `main` 并重新构建，`/api/health` 返回 ready，Postgres ready，扫描状态 ready，web 容器 healthy。
- 腾讯云生产容器生成新报告 `/app/reports/professional-backtest-audit/2026-06-27T015442-679Z`：100/100 节点，80 个候选币，交易计划就绪 0，高优先级问题 93。对比上一份 `/app/reports/professional-backtest-audit/2026-06-27T010858-438Z`，高优先级问题从 104 降到 93，说明 RR/关键位和节点归类修复有效，但没有达到实战可用。
- 新报告基线结果：radar 命中率 4.01%、提前命中率 4.01%、迟到率 0%、质量分 5.72；random 命中率 5.4%、提前命中率 4.16%、迟到率 23%、质量分 -1.08；volume 命中率 7.9%、提前命中率 2.66%、迟到率 36.2%、质量分 -4.7；momentum 命中率 20.7%、提前命中率 4.4%、迟到率 90.9%、质量分 -12.76。radar 仍保持低迟到和较好质量分，但绝对捕获强度仍不足。
- 新报告机会分层结果：启动前机会 45 个，入选 6 个，捕获率 13.33%，命中 0；回踩/反抽确认机会 26 个，入选 10 个，捕获率 38.46%，命中 1；大周期背景机会 0 个；风险复盘教材 29 个，不进入可交易 TopN。启动前捕获率略高于上一轮 12.5%，但命中没有改善。
- 新报告计划卡点：结构盈亏比未知从 49 降到 35，结构盈亏比低于 3:1 从 44 降到 28；方向不明确 34，多头结构破坏 30，空头结构破坏 26。下一轮不能继续只修 RR，必须转向“结构方向判定、入场触发确认、止损位置质量、启动前机会排序”的根因处理。
- 新报告结论：本轮修复属于有效但不充分。当前系统状态仍是“可运行但不完整”，不能称为完整完成或可实战信号系统。下一轮整改必须先出方案，再修改，不允许直接启动下一轮回测。

2026-06-27 第二轮根因修复：

- 趋势完整度不再因为任意历史 `LL/HH/BOS/CHOCH` 事件就把方向判死。现在必须同时看当前结构占优和周期方向：只有相反结构与相反周期共同占优，才输出 `bull_structure_broken` 或 `bear_structure_broken`。混合结构、低周期旧事件、高周期已修复的样本不能被粗暴归为结构破坏。
- 专业回测不再把“未达到交易计划就绪”的样本先触发理论结构止损，统计成 `PBA-REVIEW-001` 高危“放行后止损”。这类样本改为 `PBA-REVIEW-BLOCKED-001` 低危反证样本，只用于复盘方向、入场触发和止损位质量，不能冒充已放行计划失败。
- 专业回测 radar 排序新增“受控突破边缘”特征：只奖励未晚到、涨跌幅不大、仍处于压缩、量能刚启动、价格靠近突破边界的样本；已涨完/已跌深和 late extension 仍按风险复盘处理。
- 本轮新增回归测试覆盖：旧低周期 LL/HH 不误杀已修复方向、未就绪计划止损反证不算高危执行失败、受控突破边缘分数必须进入可竞争区间。聚焦验证和 v3/backtest 全组测试已通过。
- 腾讯云生产容器已同步 GitHub `main` 并重新构建，生产健康检查返回 `ok=true`、`level=ready`、Postgres ready、扫描 ready、数据源 `coinglass`。生产容器生成新报告 `/app/reports/professional-backtest-audit/2026-06-27T023558-247Z`：100/100 节点，交易计划就绪 1，高优先级问题 65。
- 对比上一轮 `/app/reports/professional-backtest-audit/2026-06-27T015442-679Z`：高优先级问题从 93 降到 65，交易计划就绪从 0 到 1，radar 命中率从 4.01% 到 4.7%，提前命中率从 4.01% 到 4.7%，质量分从 5.72 到 7.28，`bull_structure_broken` 从 30 降到 12，`bear_structure_broken` 不再进入主要卡点，回踩/反抽确认捕获率从 38.46% 到 54.17%。这说明趋势门控、阻断样本复盘归类和受控突破排序修复有效。
- 仍未解决的问题必须继续视为核心缺陷：启动前机会捕获率从 13.33% 降到 6.67%，启动前命中仍为 0；结构盈亏比问题仍是最大卡点，报告中 `rr` 类问题 62 次、`plan` 类问题 99 次，`reward_risk_unknown` 32 次、`reward_risk_below_minimum` 30 次；交易计划就绪只有 1 个，且仍出现真正计划就绪后先触发止损的 `PBA-REVIEW-001` 样本；部分卡点标签如 `support_lost` 仍需中文业务化。
- 下一轮正式回测验收不能只看高危数量下降，必须重点看：`bull_structure_broken/bear_structure_broken` 是否合理下降、`PBA-REVIEW-001` 是否只代表真正计划就绪后的失败、启动前机会捕获率是否提升、radar 质量分是否继续跑赢 random/volume/momentum、`TRADE_PLAN_READY` 是否仍为 0 以及为什么。
- 下一轮整改不能直接继续追求高分，必须先处理四个根因：早期机会排序退化、RR 目标/止损质量、唯一计划就绪样本为什么先止损、报告卡点中文化。未完成前，系统状态仍是“可运行但不完整”，不能称为完整完成或可实战信号系统。

2026-06-27 第三轮整改准备：

- 专业回测目标币计划已从脚本内固定 seed 逻辑拆成可测试模块。正式轮次会读取上一轮 `latest-progress.json` 的目标币，并在本轮目标池中优先避让，保证每轮默认换一组 10 个不同山寨币；候选池仍保留目标币并补足到 80 个，用于模拟全市场竞争压力。
- 启动前机会排序新增节点语义加分：`pre_move`、`early_volume_expansion`、`breakout_edge` 在未晚到、压缩、受控放量和位置不极端时获得额外机会池分数，避免早期机会被普通中性节点或回踩节点长期挤掉。
- 回测计划卡点继续中文化：`support_lost`、`trade_plan_not_ready`、`missing_strategy_v3`、`missing_trade_plan` 等内部码必须映射为中文业务原因，不得直接暴露给用户。
- 本轮只完成整改和常规验证；下一轮回测必须由用户确认后再跑，并且要检查：目标币是否已换一轮、启动前机会捕获率是否恢复、RR/计划卡点是否下降、唯一计划就绪先止损问题是否仍存在。

2026-06-27 第三轮正式回测结果：

- 腾讯云生产容器生成新报告 `/app/reports/professional-backtest-audit/2026-06-27T032252-447Z`：100/100 节点，目标币为 `AVAXUSDT`、`SEIUSDT`、`UNIUSDT`、`WIFUSDT`、`TAOUSDT`、`PIXELUSDT`、`DYDXUSDT`、`ZROUSDT`、`PYTHUSDT`、`BICOUSDT`；与上一轮目标币 0 重复，说明“每轮更换 10 个山寨币”的轮换机制有效。数据拉取失败为 0，高优先级问题 63，交易计划就绪 0。
- 对比上一轮 `/app/reports/professional-backtest-audit/2026-06-27T023558-247Z`：高优先级问题从 65 降到 63，`rr` 类问题从 62 降到 58，radar 命中率从 4.7% 到 5.1%，提前命中率从 4.7% 到 5.1%，质量分从 7.28 到 7.58，启动前机会捕获率从 6.67% 到 17.78%。这说明目标轮换和启动前机会排序修复有效，但幅度仍不足以支撑实战结论。
- 本轮倒退项必须作为下一轮根因：交易计划就绪从 1 降到 0，`plan` 类问题从 99 到 100，`reward_risk_unknown` 从 32 到 34，`bull_structure_broken` 从 12 到 19，追涨/止损过远相关卡点从 14 到 16，回踩/反抽确认捕获率从 54.17% 降到 37.5%。系统仍然不能稳定把“值得看”的机会推进到可执行交易计划。
- 本轮最关键漏判样本是 `WIFUSDT`：机会池为启动前机会，方向空，回测节点 `2026-06-22T13:15:00.000Z`，后续最大浮盈 10.42%、最大回撤 1.95%、RR 3.18，但 radar 排名只有 45，且交易计划被“结构优势不足，继续观察区间边界和量能变化”阻断。下一轮整改必须优先解释为什么一个 RR 足够且后续有效的样本被结构门控和排序共同漏掉。
- 结论：本轮属于“局部提升但仍未达标”。当前状态仍是“可运行但不完整”，不能称为完整完成，也不能把前端信号当成可靠实战参考。下一轮不能直接继续跑回测，必须先整改：`WIFUSDT` 漏判根因、`reward_risk_unknown` 增加、计划就绪为 0、回踩/反抽捕获率倒退和结构门控过严/过粗的问题。

2026-06-27 第三轮问题整改：

- 已把 `RANGE_IDLE` / `RANGE_COMPRESSION` 下的“结构优势不足、区间压缩尚未给出方向”从硬 Risk Gate 阻断中拆出：这类状态仍写入解释和等待条件，但不再把 RR 合格、无硬风险的样本直接打成 `BLOCKED`。
- 已新增条件计划语义：RR 合格但结构仍未确认的样本输出 `WAIT_PULLBACK` 或 `WAIT_RETEST`，并标记 `structure_confirmation_pending`；它仍不能进入 `TRADE_PLAN_READY`，但不再和垃圾信号混成同一种阻断。
- 已把当时可见的 RR 质量接入专业回测机会排序：`rewardRisk >= 3` 的早期机会、回踩/反抽机会和大周期机会会获得排序加分；该加分只读取 observedAt 之前已生成的交易计划/RR，不读取未来 MFE/MAE。
- 已修正回测计划卡点统计：方向中性的 `WATCH_ONLY` 样本不再额外统计为 `reward_risk_unknown`，避免把“方向未定”伪装成“RR 算不出来”。
- 本轮已新增回归测试覆盖以上四类问题，并通过 `npm run test:market`、`npm run lint`、`npm run build`。下一轮正式回测必须重点验收：`reward_risk_unknown` 是否下降、`structure_confirmation_pending` 是否替代无意义 BLOCKED、WIF 类 RR 合格样本排名是否前移、回踩/反抽捕获率是否恢复，以及 `TRADE_PLAN_READY` 是否在不降低 3:1 门槛的情况下合理恢复。

2026-06-27 第四轮正式回测结果：

- 腾讯云生产容器生成新报告 `/app/reports/professional-backtest-audit/2026-06-27T041035-857Z`：100/100 节点，目标币为 `DOGEUSDT`、`TIAUSDT`、`LDOUSDT`、`1000FLOKIUSDT`、`ARKMUSDT`、`SANDUSDT`、`RUNEUSDT`、`STRKUSDT`、`WUSDT`、`JASMYUSDT`；与上一轮目标币 0 重复，继续满足“每轮 10 个不同山寨币”的轮换要求。候选池 80，历史 K 线和公开衍生品拉取失败为 0，高优先级问题 75，交易计划就绪 0。
- 对比第三轮 `/app/reports/professional-backtest-audit/2026-06-27T032252-447Z`：`reward_risk_unknown` 从 34 降到 3，说明上一轮 RR 未知误计数修复有效；`structure_confirmation_pending` 出现 6 次，说明 RR 合格但结构未确认的样本已开始进入“等待确认”语义，不再全部混成无意义硬阻断。
- 本轮退步项更关键：高优先级问题从 63 增到 75，`rr` 类问题从 58 增到 72，交易计划就绪仍为 0；radar 命中率从 5.1% 降到 4.82%，提前命中率从 5.1% 降到 4.82%，质量分从 7.58 降到 6.79，启动前机会捕获率从 17.78% 大幅降到 4.44%。这说明系统虽然更少把 RR 算不出来当问题，但对“启动前机会”的排序和放行能力没有稳定住。
- 回踩/反抽确认机会捕获率从 37.5% 提升到 77.27%，属于有效提升；但命中率仍为 0、计划就绪仍为 0，说明系统能把更多回踩/反抽节点推入 Top10，却还不能把它们转化成可执行计划。下一轮必须区分：这是合理风控拦截，还是反应确认、目标位、止损距离和趋势完整度规则过严。
- 本轮最常见计划卡点是：结构盈亏比低于 `3:1` 39 次、方向不明确 33 次、结构盈亏比不足或未知 22 次、多头结构已破坏 19 次、追涨/追空风险 15 次、止损距离过宽 15 次。下一轮不能降低 `3:1` 门槛，而要检查目标位生成、止损位选择、关键位识别、入场位置等待逻辑是否过粗，导致大量样本只会被拦截却不能给出“等什么位置”的清晰计划。
- 本轮没有发现 radar TopN 外的可学习漏判机会，不代表系统没有漏判；它只说明本轮的漏判样本没有达到当前报告定义的“可学习漏判”阈值。后续仍必须扩大样本，并持续跟踪早期机会池捕获率。
- 结论：第四轮属于“局部修复有效但整体退步”。当前状态仍是“可运行但不完整”，不能称为完整完成，也不能把前端信号当成可靠实战参考。下一轮整改优先级：启动前机会排序恢复、RR 目标/止损质量复核、回踩/反抽捕获后的计划转化、方向不明确样本拆分、计划卡点中文化细化。

2026-06-27 三大核心成绩单正式回测：

- 已将正式回测报告第一屏收敛为三大核心能力成绩单：扫描、分析、策略。报告路径为 `/app/reports/professional-backtest-audit/2026-06-27T051250-441Z`，样本 100/100，候选池 80，历史 K 线和公开衍生品拉取失败为 0，交易计划就绪 0，高优先级问题 72。
- 本轮目标币为 `AVAXUSDT`、`OPUSDT`、`UNIUSDT`、`1000BONKUSDT`、`FETUSDT`、`GALAUSDT`、`CAKEUSDT`、`ENAUSDT`、`JUPUSDT`、`1000PEPEUSDT`；与上一轮目标币 0 重复，继续满足“每轮 10 个不同山寨币”的轮换要求。
- 三大核心成绩单全部不合格：扫描分数 48.01、通过率 0%、可交易机会池 TopN 捕获率 24.29%、启动前机会捕获率 12.5%；分析分数 23.74、通过率 0%、被雷达选中的 17 个节点里真正不晚到且事后有效比例为 0%；策略分数 0、通过率 0%、`TRADE_PLAN_READY` 为 0。
- 对比上一轮 `/app/reports/professional-backtest-audit/2026-06-27T041035-857Z`：高优先级问题从 75 降到 72，启动前机会捕获率从 4.44% 提升到 12.5%，但回踩/反抽确认机会捕获率从 77.27% 降到 50%，radar 命中率从 4.82% 降到 3.6%，质量分从 6.79 降到 4.82，交易计划就绪仍为 0。结论是“报告口径更清楚，但核心能力没有达标”。
- 本轮最关键根因：扫描排序还不能稳定把启动前机会推到前排；分析层对被选中节点的方向、结构、成熟度和反证判断有效率为 0；策略层被 `neutral_direction` 33 次、`reward_risk_below_minimum` 32 次、`bull_structure_broken` 22 次、`位置/RR` 16 次等卡点阻断，说明计划生成链路仍不能稳定输出“等什么位置、怎么失效、何时可做”。
- 当前状态继续标记为“可运行但不完整”。下一轮整改不能做 UI、美观、宠物、彩蛋或新功能扩展，必须只围绕三件事：提高启动前机会排序和捕获；拆分方向不明/结构等待/真正失效；复核 RR、止损、目标和等待条件，禁止为了提高计划数降低 3:1 门槛。

2026-06-27 三大核心成绩单整改包：

- 本轮只做整改和常规验证，不直接启动下一轮正式回测。下一轮能力是否提升，必须等用户确认后再跑 `backtest:professional-round` 验收。
- 扫描整改：专业回测候选排序必须使用当前扫描时间点可见的节点角色，而不是只用目标币测试标签。`pre_move`、`early_volume_expansion`、`breakout_edge`、`pullback_retest` 获得机会排序加分；`late_extension`、`fakeout_or_invalidation` 明确降权，避免已涨完/已跌深样本继续抢深扫位。
- 分析整改：三大核心成绩单里的分析卡点只统计雷达实际选中的节点。全量候选里的中性、失效和反证样本不能再误伤“已被系统推到用户面前的分析质量”判断。
- 策略整改：策略成绩单必须区分 `TRADE_PLAN_READY` 和 RR 合格但结构待确认的 `WAIT_PULLBACK` / `WAIT_RETEST` 条件计划。条件计划可以证明系统知道“等什么”，但不能冒充已经可以执行的狙击计划。
- 策略表达整改：v3 交易计划的等待说明必须写清结构止损、第一目标和结构盈亏比。`WAIT_PULLBACK` / `WAIT_RETEST` 不能只输出“等待确认”这类空话。
- 下一轮正式回测验收重点：启动前机会捕获率是否提升；被雷达选中节点的有效分析比例是否提升；条件计划是否能转化为更清楚的可执行触发/失效条件；`TRADE_PLAN_READY` 是否在不降低 `3:1` 门槛的情况下合理恢复。

2026-06-28 下一轮正式回测结果：

- 腾讯云生产容器生成新报告 `/app/reports/professional-backtest-audit/2026-06-28T092904-684Z`。本轮完成 100/100 节点，候选池 80，历史 K 线和公开 Funding/OI 拉取失败 0，高优先级问题 58，交易计划就绪 1。
- 本轮目标币为 `DOGEUSDT`、`TIAUSDT`、`AAVEUSDT`、`WIFUSDT`、`WLDUSDT`、`RONINUSDT`、`DYDXUSDT`、`HYPEUSDT`、`WUSDT`、`JASMYUSDT`；与上一轮目标币 0 重复，继续满足每轮更换 10 个山寨币的要求。
- 三大核心仍不合格：扫描分数 52.75、通过率 2.86%；分析分数 36.94、通过率 8.7%；策略分数 32.16、通过率 1%。当前网站状态仍是“可运行但不完整”，不能把前端信号当成可靠实战参考。
- 对比上一轮 `/app/reports/professional-backtest-audit/2026-06-27T051250-441Z`：高优先级问题从 72 降到 58，交易计划就绪从 0 到 1，radar 命中率从 3.6% 到 7.4%，提前命中率从 3.6% 到 7.4%，质量分从 4.82 到 11.51，启动前机会捕获率从 12.5% 到 18.6%，回踩/反抽确认捕获率从 50% 到 55.56%。这说明上轮整改有效，但只是从“明显不行”推进到“有改善但仍不合格”。
- 本轮雷达质量分 11.51，高于 random 2.65、volume -1.54、momentum -12.27；但原始命中率 7.4% 仍低于 random 7.9%、volume 12.3%、momentum 25.4%。解释：系统更少追涨、更早，但绝对捕捉能力仍偏弱。
- 本轮关键漏判样本是 `WUSDT`：方向多，启动前机会，4h 验证窗口，MFE 12.92%、MAE 0.42%，入选前已波动 0.11%，成交量 0.82x，但 radar 排名 51，计划卡点为方向不明确。下一轮必须优先研究为什么低波动、低回撤、事后大幅浮盈的启动前样本没有进入 Top10。
- 交易计划卡点 Top：方向不明确 27 次、结构盈亏比低于 3:1 23 次、结构盈亏比不足或未知 19 次、多头结构已破坏 17 次、追涨/追空风险 13 次、止损距离过宽 13 次、结构确认等待 10 次、回踩/反抽反应未确认 6 次。
- 下一轮整改不能继续泛泛加分，必须聚焦三件事：第一，修复 `WUSDT` 这类“安静启动前机会”排序低的问题；第二，压低方向不明确和结构噪声，让分析能更明确地区分“方向不明、等待确认、真正失效”；第三，复核止损距离和目标位生成，让 RR 合格样本能给出更清晰的条件计划，并继续严守最低 `3:1`。

2026-06-28 本轮回测问题整改：

- 本轮整改范围只覆盖三大核心能力中的扫描和分析诊断，不做 UI、美化、宠物、彩蛋或新功能扩展，不启动下一轮正式回测。
- 扫描整改：`professionalAuditRadarScore` 增加“安静启动前观察”权重。低波动、低成交、位置不极端、压缩未释放的样本会获得更高候选排序，目标是修复 `WUSDT` 这类启动前机会排到 TopN 外的问题；仍然不使用未来 MFE/MAE 参与排序。
- 槽位整改：专业审计 TopN 中启动前机会配额从 40% 提高到 50%，回踩/反抽确认维持 30%，大周期背景降为剩余配额。目的不是追求更多信号，而是让“提前发现”优先于“已经涨跌明显”的样本。
- 分析整改：新增 `direction_pending_quiet_setup` 计划阻断标签。符合安静早期机会条件但方向尚未确认的样本，不再粗暴计为 `neutral_direction`；它只能进入等待/复盘，不能进入狙击榜或交易计划就绪。
- 风控边界：本轮没有降低最低 `3:1` RR，没有让中性信号生成交易计划，没有改变“未确认不放行”的交易原则。
- 下一轮回测验收：观察 `WUSDT` 类低波动、低回撤、低成交的启动前样本是否更容易进入 Top10；`neutral_direction` 是否下降；`direction_pending_quiet_setup` 是否能把“值得等确认”和“无价值中性”区分开。

2026-06-28 第二轮正式回测后整改：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-28T140803-653Z`：100/100 节点，候选池 80，高优先级问题 66，`TRADE_PLAN_READY` 为 0。目标币为 `ADAUSDT`、`SEIUSDT`、`LDOUSDT`、`1000PEPEUSDT`、`TAOUSDT`、`SANDUSDT`、`RUNEUSDT`、`ZROUSDT`、`JUPUSDT`、`1000BONKUSDT`。
- 本轮不能称为能力达标：可交易机会池 TopN 捕获率 30.67%，启动前机会捕获率 10%，雷达原始命中率 4.3%，提前命中率 4.3%，交易计划就绪 0。状态继续标记为“可运行但不完整”，不能支撑实战信任。
- 同时发现一个回测口径问题：报告只用未来价格是否达到 `10%` 判断“命中”，会把 `3% - 5%` 且回撤很小的可交易级别波动全部算成无效。该口径会误导分析成绩单，尤其不符合本网站以高杠杆个人风险展示辅助理解机会质量的场景。最低结构 RR 仍保持 `3:1`，但回测评价必须区分“大行情命中”和“质量命中”。
- 本轮整改新增 `qualityHit`：未来最大浮盈至少达到质量波动阈值，且最大浮盈相对最大回撤具备明确优势，才算质量命中。`hit` 仍保留为大行情命中，不被删除；`qualityHit` 只用于回测审计和能力评估，不允许绕过实时风控、RR 门槛或结构确认。
- 扫描、分析、策略三大核心成绩单已改为同时参考“大行情命中或质量命中”，避免把可交易级别样本全部判成假阳性。报告仍必须继续展示严格的大行情命中率，不能用质量命中包装成系统已经成熟。
- API 合同整改：`historicalBacktest.auditV2` 必须透出 `coreCapabilityMetrics`，前端复盘页必须直接展示扫描、分析、策略三张成绩卡。此前后端报告已生成该字段，但前端合同没有透出，导致页面无法清楚解释系统核心能力。
- 机会池审计新增 `qualityHitCount`、`qualityHitRatePct`、`missedEarlyQualityHitCount`。正式报告和前端复盘页必须同时展示大行情命中、质量命中、漏判大行情、漏判质量命中，禁止只展示一个“命中 0%”造成误读。
- 本轮常规验证已通过 `npm run typecheck` 和 `npm run test:market`。本地 `npm run backtest:professional-round` 因本机访问 Binance 超时失败，下一轮正式能力验收必须在腾讯云生产容器运行。

2026-06-28 第三轮正式回测与排序整改：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-28T161032-693Z`：100/100 节点，候选池 80，高优先级问题 63，`TRADE_PLAN_READY` 为 0。报告已通过 `/api/frontend/review-contract` 透出，三大核心成绩单可在前端复盘合同中读取。
- 本轮仍未达标，状态继续标记为“可运行但不完整”：扫描分数 51.72、通过率 11.11%；分析分数 52.78、通过率 32%；策略分数 35.91、通过率 4%。不能把当前前端信号当成可靠实战参考。
- 对比上一轮 `/app/reports/professional-backtest-audit/2026-06-28T140803-653Z`：高优先级问题从 66 降到 63，radar 原始命中率从 4.3% 提升到 7.32%，提前命中率从 4.3% 提升到 7.32%，radar 质量分从 6.69 提升到 10.92，启动前机会捕获率从 10% 提升到 13.04%，回踩/反抽捕获率从 72% 提升到 73.08%。这说明 `qualityHit` 和核心成绩单修复有效，但提升幅度仍不足。
- 本轮关键缺陷：启动前机会质量命中率 19.57%，但漏判质量命中 6 个；回踩/反抽质量命中率 26.92%，漏判质量命中 2 个；交易计划就绪仍为 0。说明系统能够识别部分提前机会，但还不能稳定把“RR 合格、只差结构确认”的样本推到前排并转成清晰条件计划。
- 本轮典型漏判：`ENAUSDT` 启动前机会，RR 4.79，状态 `WAIT_PULLBACK`，卡在 `structure_confirmation_pending`，但 radar 排名第 23；`RENDERUSDT` 启动前机会，RR 4.73，状态 `WAIT_RETEST`，卡在 `reaction_not_confirmed`，但 radar 排名第 21；`HYPEUSDT` 启动前机会，RR 3.56，但被反抽质量卡点阻断，排名第 43。下一轮必须验证这些“可等待、RR 合格”的样本是否前移。
- 本轮计划卡点 Top：结构盈亏比低于 `3:1` 30 次、结构确认仍在等待 26 次、位置/RR 不足或未知 24 次、方向待确认的安静早期机会 15 次、多头结构已破坏 14 次、追涨/追空风险 13 次、止损距离过宽 13 次、方向不明确 11 次。
- 本轮整改：机会排序新增“计划可行性修正”。`rewardRisk >= 3`、`WAIT_PULLBACK`、`WAIT_RETEST`、`structure_confirmation_pending`、`reaction_not_confirmed`、`direction_pending_quiet_setup` 会提高机会池排序；`reward_risk_below_minimum`、`stop_distance_too_wide`、`chase_risk`、结构破坏、支撑/压力失效、上下影线衰竭等硬卡点会降低排序。该修正只使用 `observedAt` 之前已经生成的交易计划、RR 和卡点，不使用未来 MFE/MAE。
- 风控边界不变：本轮没有降低 `3:1`，没有把等待确认样本升级成 `TRADE_PLAN_READY`，没有让前端或回测系统伪造交易计划。等待确认只能说明“值得盯”和“等什么”，不能冒充可立即执行。
- 本轮常规验证已通过 `npm run typecheck`、`npm run test:market`、`npm run lint`、`npm run build`。下一步必须部署到腾讯云后重新运行正式回测，验收 `ENAUSDT` / `RENDERUSDT` / `HYPEUSDT` 类样本是否前移、硬阻断噪声是否下降、交易计划就绪是否在不降低风控门槛的情况下改善。

2026-06-28 第四轮正式回测退化与根因修正：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-28T164930-295Z`：100/100 节点，候选池 80，高优先级问题 76，`TRADE_PLAN_READY` 为 0。该轮验证说明上一轮“计划可行性修正”没有达标，不能视为完成。
- 对比上一轮 `/app/reports/professional-backtest-audit/2026-06-28T161032-693Z`：高优先级问题从 63 增到 76，radar 原始命中率从 7.32% 降到 4.5%，提前命中率从 7.32% 降到 4.5%，radar 质量分从 10.92 降到 7.07，启动前机会捕获率从 13.04% 降到 8.7%，回踩/反抽捕获率从 73.08% 降到 59.09%。结论是明确退化。
- 根因判断：上一轮把 `reward_risk_below_minimum`、`stop_distance_too_wide`、`chase_risk`、`位置/RR` 等策略门禁卡点直接强扣到扫描排序里，导致“值得先发现但暂时不能交易”的启动前机会被挤出 TopN。这违背核心链路：扫描层负责提前发现，策略层负责拦截和等待。
- 硬规则：扫描排序不得因为 RR 不足、止损过宽、追涨风险等策略层原因埋掉候选；这些卡点只能影响交易计划就绪、风险门控和前端成熟度。扫描层只对结构失效类卡点做小幅降权，不能把策略阻断当成发现层淘汰理由。
- 报告修正：`missedOpportunities` 必须输出 `radarScore` 和 `opportunityLaneScore`。漏判报告如果没有当时分数，就无法判断是排序问题、槽位问题、成熟度问题还是展示问题。
- 本轮整改：机会排序已改为“发现优先、策略后置”。RR 合格和等待型条件计划仍可加分；策略-only 卡点不再降低扫描发现分；结构失效类卡点只做轻量降权。新增回归测试确保 RR/止损/追涨卡点不会把发现候选埋掉。
- 风控边界不变：没有降低最低 `3:1` RR，没有把 `WAIT_PULLBACK` / `WAIT_RETEST` 升级成 `TRADE_PLAN_READY`，没有让扫描候选冒充交易信号。
- 下一轮正式回测验收：高优先级问题必须低于 76；radar 质量分必须恢复并优于 random/volume；启动前机会捕获率必须从 8.7% 回升；`missedOpportunities` 必须带分数；若 `TRADE_PLAN_READY` 仍为 0，必须继续把条件计划触发/失效表达作为策略层独立问题处理，不能再牺牲扫描层。

2026-06-28 第五轮正式回测与发现层排序修正：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-28T172947-742Z`：100/100 节点，候选池 80，高优先级问题 58，`TRADE_PLAN_READY` 为 2。对比第四轮，高优先级问题从 76 降到 58，交易计划就绪从 0 到 2，说明“策略门禁不得埋掉发现候选”的修正确实止住退化。
- 本轮仍未达标，状态继续标记为“可运行但不完整”：扫描分数 49.72、通过率 8.96%；分析分数 51.56、通过率 30%；策略分数 41.6、通过率 3%。不能把当前前端信号当成可靠实战参考。
- 本轮核心问题从“策略卡点压死扫描”转为“发现层排序仍有 raw score 噪声”：启动前机会捕获率 11.9%，回踩/反抽确认捕获率 60%；部分漏判样本 `ENAUSDT`、`HYPEUSDT`、`RONINUSDT` 的 `opportunityLaneScore` 已经不低，但仍排在 20-60 名，说明普通高分候选和中度延展候选仍会挤占 Top10。
- 硬规则：扫描排序不能只看 raw `radarScore`，也不能用 24h 热度、已发生位移或普通高置信度噪声替代“启动前机会质量”。发现层必须有独立 discovery score：压缩、低位移、量能启动、位置不极端、等待确认和主动成交代理优先；已明显延展的样本必须 cap，进入复盘或等待回踩，不得霸占深扫/TopN。
- 本轮整改：`opportunityLaneScore` 对 raw `radarScore` 做非线性压缩，避免普通高分噪声挤掉真实 early setup；中性低波动普通样本新增轻量降权；生产 `public-light-scan` 对 medium/high overextension 增加硬 cap，避免 24h REST 轻扫把已经涨跌较多的币推到压缩候选前面。
- 风控边界不变：没有降低最低 `3:1` RR，没有把等待确认样本升级为计划就绪，没有把轻扫候选包装成交易信号。此次只修“发现排序是否更早、更准”，策略门禁仍在后置层负责拦截。
- 下一轮正式回测验收：高优先级问题必须继续低于 58；启动前机会捕获率必须高于 11.9%；radar 质量分必须继续跑赢 random/volume；中度延展样本不得压过安静压缩候选；若策略仍失败，下一轮只处理条件计划触发/失效表达，不能再牺牲发现层。

2026-06-28 第六轮正式回测退步与修正：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-28T180934-330Z`：100/100 节点，候选池 80，高优先级问题 72，`TRADE_PLAN_READY` 为 0。对比第五轮，高优先级问题从 58 增到 72，交易计划就绪从 2 降到 0，说明上一刀不能视为完成。
- 三大核心继续不合格：扫描分数 47.97、通过率 4.23%；分析分数 43.58、通过率 17.65%；策略分数 30.37、通过率 2%。当前状态仍是“可运行但不完整”，不能支撑实战信任。
- 本轮关键退步：启动前机会捕获率 12.77% 小幅高于第五轮 11.9%，但回踩/反抽确认捕获率从第五轮 60% 跌到 45.83%，radar 质量分从 8.76 降到 7.33。根因是 raw `radarScore` 压缩被错误应用到所有机会池，误伤了回踩/反抽确认和大周期结构类机会。
- 硬规则补充：raw 分数压缩只能用于 `early_setup` 发现层去噪，不能压缩 `pullback_retest` 和 `higher_timeframe_context` 的结构强度。启动前机会要防噪声，回踩/反抽要保留结构确认能力；两类机会不能用同一套 cap 粗暴处理。
- 本轮修正：`opportunityLaneScore` 改为只对 `early_setup` 使用 discovery radar component；`pullback_retest`、`higher_timeframe_context` 和 late/risk review 恢复原 raw radar 结构分逻辑。新增回归测试确保回踩/反抽分数不会再被启动前去噪 cap 误伤。
- 下一轮正式回测验收：回踩/反抽捕获率必须恢复到接近或高于第五轮 60%；启动前机会捕获率不能低于第六轮 12.77%；高优先级问题必须低于 72，并优先观察是否低于第五轮 58。若策略仍为 0，下一步单独处理条件计划触发/止损/目标表达。

2026-06-28 第七轮正式回测与回测系统稳定性修正：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-28T182939-311Z`：100/100 节点，候选池 80，高优先级问题 67，`TRADE_PLAN_READY` 为 2。目标币为 `AVAXUSDT`、`ARBUSDT`、`UNIUSDT`、`1000BONKUSDT`、`FETUSDT`、`GALAUSDT`、`CAKEUSDT`、`JUPUSDT`、`HYPEUSDT`、`CELRUSDT`，与上一轮继续轮换。
- 对比第六轮 `/app/reports/professional-backtest-audit/2026-06-28T180934-330Z`：高优先级问题从 72 降到 67，交易计划就绪从 0 恢复到 2；扫描分数从 47.97 到 49.15，分析分数从 43.58 到 54.82，策略分数从 30.37 到 32.07；回踩/反抽捕获率从 45.83% 恢复到 61.9%，说明“只压缩 early_setup，不误伤 pullback_retest”的修正确实有效。
- 第七轮仍未达标，状态继续标记为“可运行但不完整”：扫描通过率 9.46%，分析通过率 35%，策略通过率 2%；启动前机会捕获率仅 13.21%，虽然高于第六轮 12.77%，但仍远低于实战要求。当前前端信号仍不能作为可靠实战参考。
- 本轮最常见计划卡点：结构盈亏比低于 `3:1` 30 次、结构确认仍在等待 25 次、位置/RR 不足或未知 25 次、追涨/追空风险 15 次、方向待确认的安静早期机会 15 次。下一轮不得降低 `3:1` 门槛，而要把“启动前值得盯但方向未确认”的等待条件、触发条件、失效条件讲清楚。
- 同时发现回测 CLI 稳定性问题：报告已经写完、`latest-progress.json` 显示 completed，但 Node 进程没有退出。根因边界是 CLI 原生 `fetch` 缺少 AbortController 超时，并且报告写完后只设置 `process.exitCode`，可能被连接池或挂起资源拖住。该问题会影响“每轮回测自动闭环”，必须现场修复。
- 本轮整改：`src/scripts/professional-backtest-audit.ts` 原生 fetch 增加 `BACKTEST_FETCH_TIMEOUT_MS`/`BACKTEST_CURL_MAX_TIME_SEC` 硬超时；报告写完后显式 `process.exit(0|2)`，保证有问题时以 2 退出、无高优先级问题时以 0 退出。新增仓库卫生测试固定这条防线，禁止回测任务写完报告后继续挂住。
- 下一轮核心整改方向：扫描层继续提高 `early_setup` 捕获率；分析层把“方向未确认、结构等待、真正失效”拆得更清楚；策略层补强条件计划表达，特别是等待什么价格行为、突破/回踩如何确认、止损和目标如何失效。仍禁止为了提高计划就绪数而放松最低 `3:1`。

2026-06-29 第八轮前整改包：

- 本轮不启动新的正式回测，只针对第七轮暴露的两个核心问题做整改：启动前机会捕获率仍低、等待型交易计划表达不够清楚。
- 专业回测 TopN 机会池当前规则调整为：启动前机会 60%、回踩/反抽确认 30%、大周期背景机会占剩余名额，风险复盘教材仍为 0。Top10 对应 6 / 3 / 1 / 0，目的是先修“提前发现”，不是让风险样本抢交易名额。
- `opportunityLaneScore` 新增“安静方向待确认”与“安静预启动”加分：只奖励当时可见的低位移、低/温和量能、压缩、非极端位置和 `direction_pending_quiet_setup` 样本；不得读取未来 MFE/MAE，不得把事后涨跌幅反推为入选理由。
- 条件计划文案必须明确写出等待触发和失效条件：等待突破、等待回踩、等待反抽、等待跌破后的确认，均要说明需要 15m/1h 收盘确认；否则前端报告会让用户只看到“等待”，不知道到底等什么。
- 风控边界不变：最低结构 RR 仍为 `3:1`，`WAIT_PULLBACK` / `WAIT_RETEST` 仍不是 `TRADE_PLAN_READY`，方向未确认和结构未确认只能进入观察/等待，不能包装成狙击榜可执行计划。
- 下一轮正式回测验收：启动前机会捕获率必须高于第七轮 13.21%；回踩/反抽捕获率不能明显跌破第七轮 61.9%；高优先级问题应低于 67；`TRADE_PLAN_READY` 至少保持第七轮 2 个或清楚说明为什么风控拦截；等待型样本的触发/失效解释必须能让用户看懂。

2026-06-29 第八轮正式回测结果：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-29T045947-955Z`：100/100 节点，候选池 80，历史 K 线和公开衍生品拉取失败 0，高优先级问题 71，`TRADE_PLAN_READY` 为 0。报告已通过 `/api/frontend/review-contract` 透出，前端复盘页可读取该轮结果。
- 本轮目标币为 `DOGEUSDT`、`SEIUSDT`、`ENAUSDT`、`WIFUSDT`、`TAOUSDT`、`AXSUSDT`、`DYDXUSDT`、`ZROUSDT`、`PYTHUSDT`、`BICOUSDT`；与第七轮目标币 0 重复，继续满足“每轮 10 个不同山寨币”的轮换要求。
- 对比第七轮 `/app/reports/professional-backtest-audit/2026-06-28T182939-311Z`：启动前机会捕获率从 13.21% 提升到 14.58%，回踩/反抽捕获率从 61.9% 提升到 66.67%，分析分数从 54.82 到 54.95；但高优先级问题从 67 增到 71，`TRADE_PLAN_READY` 从 2 降到 0，策略分数从 32.07 降到 26.99，扫描通过率仍只有 11.11%。结论是“发现层小幅改善，策略层明显退步”。
- 本轮三大核心成绩：扫描不合格，分数 50.02，通过率 11.11%，可交易机会池 TopN 捕获率 31.94%；分析观察，分数 54.95，通过率 34.78%，仍需连续多轮验证；策略不合格，分数 26.99，通过率 1%，只有 8 个 RR 合格条件计划，没有就绪计划。
- 本轮机会分层：启动前机会 48 个，入选 7 个，捕获率 14.58%，质量命中率 20.83%，漏判质量命中 10 个；回踩/反抽确认机会 24 个，入选 16 个，捕获率 66.67%，质量命中率 45.83%，漏判质量命中 3 个；大周期背景机会 0 个；风险复盘教材 28 个，仍禁止进入可交易 TopN。
- 本轮最常见计划卡点：结构盈亏比低于 `3:1` 33 次、结构确认仍在等待 22 次、位置/RR 不足或未知 21 次、方向不明确 16 次、多头结构已破坏 15 次、方向待确认的安静早期机会 15 次、追涨/追空风险 13 次、止损距离过宽 13 次。
- 本轮漏判样本集中在早期放量和启动前机会：`DOGEUSDT`、`SEIUSDT`、`WIFUSDT`、`DYDXUSDT`、`PYTHUSDT` 等多个不晚到且事后质量命中的样本仍排在 Top10 外。下一轮不能继续只改配额，必须专项处理“早期量能 + 关键位 + 主动买卖压力 + 结构门控”的组合排序。
- 本轮出现 `no recent touch` 仍以英文暴露在计划卡点里，说明中文业务化仍有漏网项。普通报告和前端不得继续把内部 blocker 原样展示给用户。
- 当前状态继续标记为“可运行但不完整”。下一轮整改顺序：先修策略层条件计划转化和止损/目标质量，再修启动前机会排序的漏判样本；不得降低 `3:1`，不得把 WAIT 样本包装成 `TRADE_PLAN_READY`。

2026-06-29 第九轮前整改包：

- 本轮只针对第八轮暴露的根因做整改，然后再启动下一轮正式回测；不能连续回测不整改。
- 报告和复盘 blocker 中文化继续补漏：`no_recent_touch`、`no_relevant_level`、`位置/RR`、`反抽质量`、`回踩质量`、`周期冲突` 等内部码必须映射成中文业务原因。回测报告和前端复盘不得直接展示英文内部字段。
- 发现层排序继续坚持“扫描先发现，策略后拦截”：`reward_risk_below_minimum`、`stop_distance_too_wide`、`chase_risk` 等策略-only 卡点不能把早期候选直接埋掉；结构破坏、支撑/压力失效这类结构卡点只允许轻量降权，不能替代机会池判断。
- `opportunityLaneScore` 新增受控早期放量、突破边缘和中周期预启动补强。只奖励当时可见的温和量能、低/中位移、压缩、非极端位置和等待确认条件，不读取未来 MFE/MAE。
- 条件计划表达继续补强：`WAIT_PULLBACK` / `WAIT_RETEST` 必须把等待原因拆成结构、位置、反应、赔率四类，并写清“等什么价格行为”，不能只输出“等待确认”。
- 风控边界不变：最低结构 RR 仍为 `3:1`，不把 WAIT 样本升级成 `TRADE_PLAN_READY`，不把候选包装成交易信号。
- 本轮本地常规验证已通过 `npm run test:market`、`npm run typecheck`、`npm run lint`、`npm run build`。下一步必须部署腾讯云并运行第九轮正式回测，验收第八轮的策略退步是否被修复，以及启动前机会质量命中漏判是否下降。

2026-06-29 第九轮正式回测结果：

- 腾讯云生产容器生成报告 `/app/reports/professional-backtest-audit/2026-06-29T065938-017Z`：100/100 节点，候选池 80，历史 K 线和公开衍生品拉取完成，高优先级问题 60，`TRADE_PLAN_READY` 为 0。`/api/frontend/review-contract` 已确认读取到该报告。
- 对比第八轮 `/app/reports/professional-backtest-audit/2026-06-29T045947-955Z`：高优先级问题从 71 降到 60，策略分数从 26.99 升到 37.05，分析分数从 54.95 升到 58.88；但扫描分数从 50.02 降到 47.33，启动前机会捕获率从 14.58% 降到 10.64%，回踩/反抽捕获率从 66.67% 降到 50%。本轮属于“策略表达和部分卡点改善，但提前发现退步”。
- 第九轮三大核心：扫描不合格，分数 47.33，通过率 9.86%，可交易机会池 TopN 捕获率 23.94%；分析观察，分数 58.88，通过率 41.18%；策略不合格，分数 37.05，通过率 3%，只有 10 个 RR 合格条件计划，没有就绪计划。
- 第九轮基线：radar 质量分 11.4，高于 random 1.32、volume -1.57、momentum 1.65；但 radar 原始命中率 7.1%，仍低于 random 7.7%、volume 10.5%、momentum 28.7%。解释仍是：系统相对更少追涨、更早，但绝对捕捉能力偏弱。
- 第九轮机会分层：启动前机会 47 个，入选 5 个，捕获率 10.64%，质量命中率 19.15%，漏判质量命中 9 个；回踩/反抽确认机会 24 个，入选 12 个，捕获率 50%，质量命中率 41.67%，漏判质量命中 3 个；风险复盘教材 29 个，不进入可交易 TopN。
- 第九轮计划卡点 Top：结构盈亏比低于 `3:1` 29 次、多头结构已破坏 24 次、结构确认仍在等待 22 次、位置/RR 不足或未知 18 次、方向不明确 13 次、方向待确认的安静早期机会 11 次、追涨/追空风险 9 次、止损距离过宽 9 次。
- 本轮中文化修复部分有效：`no_recent_touch` 不再进入 Top blocker 英文展示；但 `反抽质量` 的中文业务化仍不够，需要继续统一为“反抽承压质量不足”。后续所有 blocker 仍必须按用户可理解语言输出。
- 下一轮整改优先级必须回到扫描核心：不能再泛泛改策略文案。优先处理启动前机会排序退步、TopN 槽位被非质量机会占用、`early_volume_expansion` / `breakout_edge` / `medium_swing` 质量样本排名仍在 18-60 名的问题。策略层继续保持 3:1 和 WAIT 边界，不允许为了提高 `TRADE_PLAN_READY` 数量放松风控。
- 当前状态继续标记为“可运行但不完整”。不能称为完整完成，不能把前端信号当作稳定实战参考。

2026-06-29 专业回测审计系统升级：

- 本轮围绕核心链路“扫描 -> 分析 -> 策略 -> 复盘进化”升级，不新增装饰功能。
- 专业回测报告新增 `waitPlanMetrics` 和节点级 `waitPlanEvaluation`：`WAIT_PULLBACK` / `WAIT_RETEST` 会在历史未来窗口中验证是否触发、触发后先到目标还是先到止损、是否超时、是否缺少结构止损或第一目标。等待计划不能再只停留在“等待确认”文案。
- 专业回测报告新增 `pressureTestMetrics`：自动比较当前 TopN、2x TopN、3x TopN 的捕获率、提前捕获率、质量命中率和漏判质量机会，用来区分“完全没识别”与“识别了但排不上”。
- 专业回测报告新增 `marketRegimeMetrics`：按安静压缩启动前、早期放量启动、回踩/反抽确认、大周期背景、已延展/高风险、普通震荡分组审计，避免用一套总分掩盖某类市场状态弱点。
- 专业回测报告新增 `ruleStabilityMetrics`：按 blocker/规则输出出现次数、漏判质量机会、已选有效样本和稳定分，用来发现规则误伤或不稳定。
- 专业回测报告新增 `roundTrendComparison`：自动读取上一轮报告，对比高优先级问题、计划就绪、扫描/分析/策略分数、雷达质量分、启动前捕获率和等待计划有效率。
- `/api/frontend/review-contract` 和 `/review` 已接入上述新增字段，复盘页可以直接看到等待计划后验、候选压力、市场状态分组、规则稳定性和上一轮对比。
- 这批升级只是让回测系统更会“发现问题和定位问题”，不等于当前扫描分析策略能力已经达标。是否支撑实战仍必须看下一轮正式回测结果。

验收不能只看代码通过，还要看：

- 生产页面是否 200。
- `/api/health` 是否 ready。
- `/api/frontend/radar-contract` 是否有真实数据。
- `/api/radar/backend-contract` 是否能解释扫描、深扫、成熟度、治理和数据源。
- 榜单是否有真实来源和排序口径。
- 单币档案是否不编计划。
- 复盘是否显示样本状态。
- partial / waiting / unavailable 是否明确。

## 12. 文档分工

蓝图只记录当前事实源和主规则。详细规格放到专项文档：

- `docs/CORE_STRATEGY_SPEC.md`
- `docs/EVIDENCE_ENGINE_SPEC.md`
- `docs/INDICATOR_RULES.md`
- `docs/DATA_RULES.md`
- `docs/GOLDEN_CASES.md`
- `docs/MARKET_READING_SPEC.md`
- `docs/KEY_LEVEL_ENGINE_SPEC.md`
- `docs/RISK_GATE_SPEC.md`
- `docs/BACKEND_API_CONTRACT.md`
- `docs/frontend-backend-field-map.md`
- `docs/frontend-data-truth-contract.md`
- `docs/single-server-deployment.md`
- `docs/deployment-checklist.md`

如果专项文档和蓝图冲突，以蓝图的核心目标和硬边界为准；如果专项文档更新了真实实现状态，蓝图必须同步更新摘要。

## 13. 每次继续开发必须遵守

### 完整交付包规则

一个已批准的项目块必须一次性搭建到可验收状态，严禁再拆成没有意义的小碎片。

每个交付包必须包含：

1. 范围锁定：说明本轮服务四大核心能力中的哪一项，进入核心链路哪一环。
2. 代码闭环：后端合同、前端消费、测试、部署验收按需要一次完成。
3. 蓝图同步：蓝图必须及时更新，已完成项移出未完成，旧规则和不匹配信息直接删除或替换。
4. 质量底线：必须以顶级标准搭建，不能为了速度牺牲正确性、稳定性、数据真实性和可复盘性。
5. 现场根治：搭建期间发现问题必须当场整改；发现同类隐患要连同当前问题一起处理。
6. 清理纪律：发现无真实意义的垃圾代码、死代码、重复代码、旧文档和误导展示，确认不影响重要数据后直接清理。
7. 收尾汇报：搭建完毕后逐项汇报完成了什么、验证了什么、发现了什么、还剩什么、下一包应该做什么。
8. 外部阻塞例外：只有账号登录、密钥、服务器权限、第三方 API 限制等真实外部阻塞，才允许暂停并说明原因。

开始前：

1. 先读本蓝图。
2. 判断本轮改动服务四大核心能力中的哪一个。
3. 判断它进入核心链路哪一环。
4. 判断是否会引入假数据、旧数据、重复展示或误导。

开发中：

1. 优先复用现有后端合同、证据融合、风控门禁、复盘和 Repository。
2. 不新建平行逻辑。
3. 不让 UI 自己推导交易判断。
4. 发现垃圾代码、死代码、重复文档、旧规则，直接清理。
5. 发现同类隐患，连同当前问题一起处理。

收尾时：

1. 跑对应测试和构建。
2. 更新蓝图：已完成移出未完成，旧规则删除或替换。
3. 默认自动提交并推送到 GitHub `main`，除非用户明确要求本轮不推送。
4. 默认自动按生产发布流程同步部署到腾讯云，除非用户明确要求本轮只做本地改动。
5. 汇报完成了什么、验证了什么、发现了什么、剩余什么。
