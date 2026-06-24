# 川 Market Radar 固化蓝图

> 本文是本项目的长期事实源。后续继续搭建、重构、接入数据源、调整 UI、加入 AI 或登录系统时，先检查本文，避免聊天上下文过长导致遗漏或逻辑漂移。

> 长期工程搭建、文档分级、功能准入、删除和验证规则见 `docs/chuan-market-radar-engineering-charter.md`。蓝图只记录产品定位、长期原则、核心边界和重大路线，不作为普通迭代施工日志。

## 一句话定位

川 Market Radar 是一个公开访问的 **Altcoin Trend Radar v3 全市场山寨币趋势切换雷达**，用于从支持合约交易的山寨币中识别震荡压缩、趋势前夜、突破/跌破确认、回踩/反抽确认、趋势加速和衰竭风险，并在好位置、好价格、好盈亏比时给出证据分层、策略计划、失败路径、复盘记录和系统自我进化反馈。

## 不做什么

- 当前不做多用户账户系统；只支持可选私有登录模式，默认关闭，开启后用于个人站点访问保护。
- 当前不做自动下单。
- 当前不接交易权限，不做自动交易系统。
- 当前不做普通行情站、指标信号站或单纯涨跌幅榜。
- 当前不承诺实时秒级行情。
- 当前不把单一指标当作买卖信号。
- 当前不把 AI 输出当作最终裁决。
- 当前不接入清算热力图，不实现清算区、heatmap provider 或潜在清算区交易模块。
- 当前不通过爬虫绕过付费套餐、登录、验证码、Cloudflare、防爬、会员墙、robots.txt 禁止路径或网站明确禁止的抓取规则；CoinGlass 清算热力图等付费能力只能走官方 API 和套餐权限，不能用网页爬取替代。
- 当前不把演示数据、缓存数据或缺字段数据说成真实生产级数据。
- 当前不做中国大陆访问专项优化，不做 ICP 备案、大陆云服务器或大陆 CDN 路线；站点主线切换为腾讯云香港单机部署，Vercel/Neon 只保留为旧线上回滚路径。

## 产品原则

0. **核心目标不可偏移**：网站的一切搭建都必须服务“提前发现山寨币从震荡切换成趋势的机会、解释证据、给出多空策略、管理买卖/失效条件、复盘学习并逐步提高稳定性”这条主线。任何 UI、AI、告警、动效或数据展示，如果不能增强“扫描 -> 读盘 -> 关键位 -> 证据 -> 风控 -> 策略 -> 复盘 -> 学习”闭环，就必须降级、后置或删除。
1. **专业优先**：市场分析必须区分事实、推理、判断和策略，不能把结论写成玄学。
2. **灵活优先**：BTC 下跌、资金费率偏高、成交量不足等因素只能降权或进入观察，不能一刀切否定所有币种。
3. **证据优先**：每个信号必须能解释为什么出现、为什么不能追、什么条件失效。
4. **稳定优先**：业余版 CoinGlass API 需要低频、缓存、分批、降级和健康状态展示。
5. **可扩展优先**：数据源、分析引擎、AI 复核、复盘、告警、UI 模块必须保持边界清楚，方便后期替换。
6. **个人站点优先**：生产主线服务用户本人。私有登录只控制访问权限；分析、扫描和复盘数据仍按清晰 scope 归类，未来如扩展多用户账户、个人 watchlist 和私有日记，必须另设数据边界。
7. **运行感优先**：网站必须能让用户看出系统正在扫描、排队、分析、深扫、写入和复盘；动效、提示音和互动反馈只能表达真实运行状态，不能替代信号判断，不能变成娱乐主线。
8. **长期迭代优先**：V3.0 不是最终版，而是专业稳定底座版；后续新增功能、优化功能、替换数据源、调整 UI 或加入登录系统时，必须通过模块边界、测试、迁移和预览验证继续迭代，不能靠堆代码硬加。
9. **路线动态校准**：每完成一个阶段后，必须基于当下真实代码、数据源、验证结果和线上约束重新判断后续顺序；如果旧计划已被部分覆盖、优先级变化或出现更关键风险，后续计划要良性调整，不能机械照搬历史清单。
10. **前端展示优先**：凡是能帮助用户理解“发现了什么、为什么值得看、现在能不能做、还差什么确认、怎么失效、如何复盘”的信息，优先在前端以清晰层级展示；不能只把关键判断藏在后端日志或纯文本里。
11. **v3 趋势切换优先**：后续分析升级优先围绕 Market Reading Engine、Key Level Engine、Forward Level Map、多空双向状态机和复盘验证展开；普通指标、AI 润色、动效和视觉细节不能排在趋势切换能力之前。
12. **系统融合硬规则**：以后所有关于网站搭建、扫描顺序、分析能力、UI 展示、复盘进化、告警、数据源、部署和优化调整的讨论，必须先对照已经搭好的分析板块和蓝图里未完成的分析板块，再决定新增、修改、删除或后置。严禁提出与现有 v2/v3 Evidence、Market Reading、Key Level、Forward Map、Risk Gate、Trade Plan、复盘进化、Universe Registry、Scan Economy 脱节的新方案；严禁让新方案和现有系统“两张皮”。
13. **单机生产主线**：2026-06-20 起，新增能力默认按腾讯云香港 4C/8G/120G 单机生产环境设计；Vercel/Neon 免费约束只作为回滚和降级边界，不再作为新扫描、Worker、Redis、Postgres、复盘任务和可观测性的默认上限。
14. **三源数据优先**：Binance、OKX 和 CoinGlass 必须协同设计，不允许只把 CoinGlass 当成唯一数据源。Binance/OKX 负责全市场公共轻扫、K 线结构、ticker、成交额、基础衍生品和交易所交叉验证；CoinGlass 负责付费深扫、资金质量确认和风险排雷。任何新数据源都必须进入 Evidence / Risk Gate / 复盘闭环，不能成为孤立展示面板。
15. **速度与质量双硬线**：后续搭建必须同时追求速度和质量。提速只能来自大块交付、自动化脚本、减少人工等待、减少返工、复用现有模块和清晰验收；不能通过跳过测试、跳过健康检查、跳过真实数据验证、跳过回滚方案或把半成品说成完成来换速度。速度和质量冲突时，质量优先，但必须同步给出提速改造方案。
16. **付费源失败降级硬规则**：CoinGlass 是深扫确认源，不是主雷达唯一生命线。任何 CoinGlass 套餐限制、单币接口拒绝、限速、空返回或临时失败，都必须写入 metadata / health / 日志诊断并降级处理；不得让公共轻扫、全市场覆盖证明、状态池调度、页面加载、数据库归档或系统健康接口整体崩掉。公共轻扫结果只能用于发现和调度，不能绕过 CoinGlass / 结构证据 / Risk Gate 直接生成交易结论。
17. **数据污染双防线**：全市场 universe、公开轻扫、交易所发现、CoinGlass 映射、前端合同输出和生产 smoke 都必须过滤非合约币、股票/商品、非 USDT 永续、中文/特殊字符资产和非法 symbol。入口层负责不写入，输出层负责不展示历史脏数据；生产验收必须能抓出符号污染、榜单零价格和覆盖率语义错误。
18. **预览种子默认关闭**：任何 mock、seed、演示复盘和样例信号默认不能注入真实 repository 或活跃页面。只有显式设置 `ENABLE_PREVIEW_SEED_DATA=true` 的本地预览才允许加载样例数据；生产、降级和无数据库模式都不能把样例数据说成真实记录。
19. **蓝图清理硬规则**：每次重要搭建收尾时，必须同步清理蓝图和字段映射：已经验证完成的项目从“未完成/待验证”移到“已完成/已验证”，仍未完成的项目必须保留原因、下一步、验证方式；旧规则如果被新架构覆盖，必须标记替换或删除，不能让历史计划、当前代码和生产事实互相打架。
20. **个人仓位镜头规则**：本网站是为用户本人定制的合约雷达，交易计划展示和复盘统计必须提供独立的个人仓位镜头：BTC 与 ETH 杠杆固定 `150x`；其他山寨币按交易所允许的最高杠杆换算；仓位模式按全仓语境提示风险；每次入场初始保证金按总资金 `0.3%` 计算。该规则只用于把既有结构计划换算为保证金占用、名义仓位、止损亏损、目标收益、ROE、爆仓距离语义和复盘归因展示；不改变 Evidence、Risk Gate、`3:1` 结构 RR、趋势阶段、结构止损、人工复核边界，也不能新增自动下单或交易所下单权限。若交易所实际最高杠杆未知，前端必须显示 `waiting/unavailable` 或“等待交易所杠杆上限”，不能臆造。
21. **合法外部情报规则**：后续新增爬虫或采集能力只允许接入安全、稳定、实际有意义的数据：官方 API/WebSocket、官方 RSS/公告、robots.txt 允许的低频公开页面和有明确授权的数据源。所有外部事件必须先标准化为 `ExternalEvent`，再转成 `EvidenceItem` 或 `Risk` 背景进入 Evidence / Risk Gate / Review；不得直接生成交易结论，不得保存付费全文或受版权保护全文，不得抓个人隐私，不得绕过权限。

## 不可偏移核心目标

川 Market Radar 的核心目标不是做一个炫酷面板、互动小游戏或普通行情站，而是做一个 **合约机会操作系统**：

- 尽可能在行情爆发前提前捕捉上涨或下跌前的异常币种。
- 让用户第一时间注意到潜在机会，同时避免因为涨跌幅本身制造 FOMO。
- 在证据充分、位置合理、风险可控时，辅助判断多/空方向。
- 给出“什么时候买、什么时候卖、什么时候不能做、错了在哪里失效”的条件化策略。
- 输出详细逻辑原因、证据链、反证、触发条件、止盈/止损、失效条件和复盘路径。
- 通过交易日记、扫描回放、每日异动归因、outcome executor 和人工校准，让系统一点一点学习，目标是越来越准确、越来越稳定。

核心闭环：

```text
提前扫描
-> 异常捕捉
-> 证据链判断
-> 多空策略
-> 最优位置等待
-> 入场/不入场条件
-> 止盈/止损/失效条件
-> 日记复盘
-> 策略校准
-> 下一次更稳
```

产品必须把“不交易”也作为一等状态展示：现在不能做、为什么不能做、还差什么确认、硬做的风险在哪里，必须和可执行计划一样清楚。

## Altcoin Trend Radar v3 最终融合原则

2026-06-17 最新路线：当前项目正式升级为 **Altcoin Trend Radar v3：全市场山寨币趋势切换雷达系统**。这不是推翻现有系统，而是在当前扫描、Binance/OKX 公共轻扫、CoinGlass 深扫、Postgres 持久化、Redis 调度底座、日记、每日异动、outcome executor、Strategy Engine v2 和 Signal Dossier 的基础上继续升级。

v3 的核心不是“预测涨跌”，而是：

```text
提前建立关键位置地图
-> 识别震荡和趋势切换
-> 判断多头/空头趋势机会
-> 过滤假突破、追高、追空和证据冲突
-> 生成入场、止损、止盈、趋势仓和失效条件
-> 保存事前地图和结构判断
-> 复盘验证地图、状态机、Risk Gate 和策略计划是否有效
```

### v3 必须继承的现有底座

- 继续使用 Next.js App Router、TypeScript、Node test；生产主线运行在腾讯云香港单机 Docker Compose，Vercel/Neon 保留为旧线上回滚路径。
- 继续使用 CoinGlass Hobbyist 低频、分批、缓存、预算保护和失败降级；服务器升级不改变 CoinGlass `30 调用/分钟` 这类外部限速边界。
- 继续使用 Binance/OKX 等公开源承担全市场轻扫、K 线、成交量、ticker 和交易所交叉验证，避免浪费 CoinGlass 请求。
- 继续保留 Strategy Engine v2 的证据优先、风险门控、报告不越权、清算热力图禁用和 `3:1` 赔率硬边界。
- 继续保留日记、扫描回放、每日异动归因、outcome executor、人工校准、影子权重和真实权重启用门禁。
- 继续以 Signal Dossier 作为单币深挖入口，不把全部细节堆在首页；v3 关键位地图和 Forward Map 必须优先进入该档案，而不是首页堆满线。

### v3 必须新增的核心能力

1. **Market Reading Engine**
   - 把 OHLCV 转成盘面结构语言，而不是让 AI 看图或让指标直接发信号。
   - 必须识别 HH/HL、LH/LL、BOS、CHoCH、箱体、波动压缩、实体突破/跌破、影线假突破、回踩确认、反抽确认、趋势完整度和衰竭风险。
   - Feature Layer 只提取事实，不下交易结论。

2. **Key Level Engine**
   - 关键位必须是价格区域，不是单点。
   - `KeyLevel` 必须包含 `zoneLow`、`zoneHigh`、`midPrice`、`direction`、`keyScore`、`reactionScore`、`confluenceScore`、`status`、`reasons`、`confirmationRules` 和 `invalidationRule`。
   - 关键位状态必须至少支持 `POTENTIAL`、`ARRIVED`、`REACTION_STARTED`、`CONFIRMED`、`WEAKENING`、`BROKEN`、`RECLAIMED`、`INVALIDATED`。
   - 系统最多输出上方 3 个压力区、下方 3 个支撑区、1 个主要突破位和 1 个主要失效位；不允许画太多线。
   - 2026-06-17 已完成 MVP：`buildKeyLevels` 可从既有 OHLCV 生成区域式关键位，当前接入只读 `strategyV3`，不改变 live ranking。

3. **Forward Level Map**
   - 系统必须事前生成 S1/S2/S3 支撑阶梯、R1/R2/R3 压力阶梯、主要防守位、主要突破位、下一反应区和趋势变化位。
   - Forward Map 必须随扫描保存，用于之后验证“是否事前识别”，不能事后画线冒充提前判断。
   - Fibonacci、整数位、动态均线和成交密集区只能在与结构位共振后成为关键位，不能单独生成交易结论。
   - 2026-06-17 已完成 MVP：`buildForwardLevelMap` 和 `buildSignalTrendRadarV3Dossier` 复用本轮已有 OHLCV，为 Signal Dossier 展示关键位和前方位，不新增 CoinGlass 请求。
   - 2026-06-17 已完成持久化 MVP：扫描归档写入时会把已有 `strategyV3` 中的 Forward Map 和 Key Level 摘要保存为 `v3_forward_map_snapshots`，仅用于后续复盘验证、人工校准和 missed altcoin review，不允许改变 live ranking 或自动调权。

4. **多空双向趋势状态机**
   - v3 状态必须覆盖：`RANGE_IDLE`、`RANGE_COMPRESSION`、`PRE_TREND_LONG`、`PRE_TREND_SHORT`、`LONG_BREAKOUT`、`SHORT_BREAKDOWN`、`LONG_PULLBACK_CONFIRM`、`SHORT_RETEST_CONFIRM`、`LONG_TREND_ACCELERATION`、`SHORT_TREND_ACCELERATION`、`LONG_EXHAUSTION`、`SHORT_EXHAUSTION`、`INVALIDATED`、`CONFLICT`。
   - 不允许只输出 BUY / SELL。

5. **v3 决策枚举**
   - 最终决策必须使用有限枚举：`WATCH_ONLY`、`PREPARE_LONG`、`PREPARE_SHORT`、`WAIT_LONG_BREAKOUT`、`WAIT_SHORT_BREAKDOWN`、`WAIT_LONG_PULLBACK`、`WAIT_SHORT_RETEST`、`LONG_PLAN`、`SHORT_PLAN`、`AVOID_CHASE_LONG`、`AVOID_CHASE_SHORT`、`TREND_HOLD_LONG`、`TREND_HOLD_SHORT`、`TAKE_PROFIT_LONG`、`TAKE_PROFIT_SHORT`、`NO_TRADE`、`CONFLICT_WAIT`、`INVALIDATED`。

6. **v3 五大分数**
   - `PreTrendScore`：是否正在从震荡切向趋势。
   - `TrendEnergyScore`：趋势如果启动，能量强不强。
   - `RiskScore`：是否追高、追空、拥挤、假突破或盈亏比不足。
   - `TrendHoldScore`：已有趋势还能不能继续拿。
   - `ExhaustionScore`：趋势是否接近兑现或防反转。
   - 分数必须支持多空方向，例如 `longPreTrendScore`、`shortPreTrendScore`、`longTrendEnergyScore`、`shortTrendEnergyScore`。

7. **技术指标辅助层**
   - 技术指标必须保留，但只能作为 Evidence 辅助层，不能单独生成买卖结论。
   - 第一批固定指标：EMA、RSI、MACD、Bollinger Band、ATR、VWAP、ADX、Volume、OBV/CVD proxy、Fibonacci 回撤/扩展。
   - RSI 超买不等于做空，RSI 超卖不等于做多；强趋势中 RSI 高位优先解释为动能强，同时增加追高风险。
   - MACD 金叉不等于买入，死叉不等于卖出；必须结合结构突破、回踩/反抽质量和关键位位置解释。
   - Bollinger 收窄只代表波动压缩，不代表方向；强趋势贴上轨不等于见顶。
   - ATR 只判断波动和止损缓冲，不判断方向。
   - EMA/VWAP 只辅助趋势、承接和均价位置判断，不能单独触发交易计划。
   - ADX 只判断趋势强度，不判断方向。
   - Volume、OBV、CVD proxy 只判断资金推动质量、背离和衰竭风险。
   - Fibonacci 只能在与结构位、前高前低、箱体边界、成交密集区或关键位共振后参与位置/RR 判断。
   - 技术指标总权重必须受限，原则上不超过整体证据权重的 `10%-15%`；结构、位置/RR、资金质量和风险门控优先级更高。

8. **复盘进化接入**
   - 复盘不只验证交易盈亏，还要验证趋势切换、关键位地图、Forward Map、Risk Gate 和漏判原因。
   - 新增复盘对象：`trend_switch_review`、`forward_map_review`、`key_level_reaction_review`、`risk_gate_review`、`missed_altcoin_review`。
   - 这些复盘样本先进入人工确认和只读校准，不允许自动改真实权重。
   - 2026-06-17 已完成 MVP：`runForwardMapReviewExecutor` 可读取已保存的 v3 事前地图，拉取后续公开 OHLCV，写入 `forward_map_review` 和 `key_level_reaction_review` journal 事件，并记录受保护执行批次；该链路只读，不自动改权重。
   - 2026-06-17 已完成健康摘要 MVP：`/api/health` 现在暴露 `v3ForwardMapReviews`，系统健康面板展示事前地图数量、最近执行、完成/跳过/失败分布、存储迁移状态和只读边界，用于判断 v3 复盘引擎是否真的在运转。若当前生产 Postgres 或旧 Neon 回滚库还没有迁移 `v3_forward_map_snapshots`，首页必须降级提示“待迁移”，不能 500。
   - 2026-06-21 已完成业务能力总控 MVP：`buildBusinessCapabilityReport` 和 `/api/radar/business-capability` 把信号生命周期、复盘判定标准、候选池公平轮换、信号成熟度分层、影子实盘追踪、策略分型统计、历史案例回放、AI 反证复核和进化建议系统统一暴露为 `business-capability.v1`。该接口只读、研究用途，不触发额外 CoinGlass 请求，不自动下单，不自动改权重，不改变实时排序。
   - 前端重建时必须读取业务能力总控状态：每个板块至少能看到 `status`、`score`、`summary`、`evidence`、`nextAction` 和 `guardrail`。如果某项还在收集样本或被禁用，必须明确展示，不能用漂亮 UI 掩盖“还没实战验证”的事实。
   - 业务能力总控固定 9 项：`signal_lifecycle`、`outcome_standard`、`candidate_rotation`、`signal_maturity`、`shadow_tracking`、`strategy_family_stats`、`historical_case_replay`、`ai_counter_review`、`evolution_suggestions`。后续新增复盘或进化能力必须接入这条链，不能成为孤立面板。

### v3 必须剔除或降级的旧方向

- 剔除“普通行情站/指标信号站/涨跌幅榜网站”定位。
- 剔除“异常数据一出现就给方向”的路径；异常必须进入结构和关键位上下文。
- 剔除清算热力图、清算区、heatmap provider 和潜在清算区交易逻辑。
- 剔除 report generator 自行判断行情。
- 剔除只增加视觉热闹但不增强扫描、证据、策略、复盘的互动方向。
- 降级所有只增加视觉热闹但不增强扫描、证据、策略、复盘的 UI 或互动效果。
- 降级 AI 为反证、解释和复盘助手，不能成为核心裁决。

### v3 总流程

```text
全市场轻扫描
-> 候选池
-> 深扫描候选
-> Market Reading Engine
-> Key Level Engine
-> Forward Level Map
-> Evidence Engine
-> Trend State Machine
-> Scoring Engine
-> Risk Gate
-> Trade Plan Engine
-> Report Generator
-> Signal Dossier
-> 复盘验证与人工校准
```

全市场扫描必须分两层：轻扫描覆盖全市场，深扫描只分析候选池。任何全市场深扫、全市场高频全周期 K 线重算或无边界 CoinGlass 请求，都违背 CoinGlass Hobbyist 限速和单机长期稳定原则。

### v3 扫描调度与防漏网原则

2026-06-19 校准：全市场扫描不能设计成“硬漏斗”。前置层如果把币直接淘汰，会导致爆发前仍处于压缩、低波动、低成交但正在蓄势的山寨币根本走不到结构分析、CoinGlass 深扫和作战池。因此后续扫描系统固定为 **状态池 + 动态调度 + 多入口晋级 + 深扫配额 + 复活复盘**，而不是“轻扫不达标就删除”的一次性漏斗。

核心状态：

```text
COLD：冷池，低频轻扫
WARM：温池，出现早期迹象
HOT：热池，明显异动或多交易所共振
CANDIDATE：候选池，进入结构/位置预筛
DEEP_QUEUE：CoinGlass 深扫队列
BATTLE_WATCH：作战观察，还差确认
BATTLE_READY：作战准备，条件接近完整
COOLDOWN：过热、结构失效或风险过高，等待降温
REVIVE_WATCH：复活观察，等待回踩、反抽、Funding 降温或结构修复
```

扫描顺序固定如下：

```text
0. 系统健康与数据可信门禁
1. 全市场 Universe 常驻池
2. BTC / ETH / 市场宽度大盘天气
3. 全市场轻扫打标签
4. 多入口候选晋级
5. v3 结构 / 关键位 / Forward Map / 位置 RR 预筛
6. CoinGlass 深扫队列
7. v2 Evidence / Scoring / Risk Gate
8. v3 作战池
9. 复盘进化反哺扫描优先级
```

前置层只允许调整优先级、扫描频率、下一次复查时间和状态池归属，不能永久删除可交易标的。真正硬门槛只放在数据可信、流动性极差、非可交易合约、结构失效、`3:1` 赔率不足、止损过远、RiskScore 过高和证据严重冲突这些风险门控上。

候选晋级必须多入口，不允许只依赖涨幅榜或成交量榜：

- 放量异动入口：短周期成交量、成交额和波动突然扩张。
- 压缩临界入口：低波动、箱体压缩、接近突破/跌破边缘。
- 相对强弱入口：BTC 横盘或下跌时个币抗跌/走强，或 BTC 反弹时个币明显弱势。
- 关键位入口：接近前高、前低、箱体边界、v3 Key Level 或 Forward Map 区域。
- 回踩/反抽入口：趋势后回踩支撑、反抽压力、缩量回调或承压失败。
- 做空入口：跌破结构、反抽不过、相对弱势和空头趋势完整度改善。
- 新币/长尾入口：新上合约或长尾币突然活跃，但必须标记高波动和低样本。
- 漏判复查入口：每日异动和 missed altcoin review 发现的漏网样本进入复活观察或优先级提示。

CoinGlass 深扫不是全市场扫描器，而是资金质量确认器和风险排雷器。每轮深扫名额必须保留防漏网配额，不能全部给已经涨起来的热门币。当前腾讯云单机 + CoinGlass Hobbyist 边界下，默认建议把深扫名额分配为：BTC/ETH 锚定、作战池跟踪、HOT 明显异动、PRE_TREND 压缩临界、回踩/反抽复活观察、每日异动/漏判复查和冷门探索轮转。具体数量由 `COINGLASS_BATCH_SIZE`、CoinGlass 分钟令牌桶和预算健康动态决定。

当前腾讯云单机资源可以承载“常驻全市场轻扫 + 候选结构分析 + CoinGlass 深扫 + Redis 调度 + Postgres 长期复盘”的正式版本，但仍禁止把系统做成“全市场每个币多周期 K 线 + CoinGlass 深度数据 + 全量原始历史永久入库”的重型数据仓库。Postgres 只长期保存扫描摘要、状态变化、候选晋级原因、Evidence、作战池计划、Forward Map 快照、outcome 结果、missed opportunity 复盘和人工校准记录；无价值原始脏数据、重复快照和全市场分钟级完整历史必须缓存、降采样、过期或不入库。

前端必须展示扫描证明，而不是只展示最终几个币：全市场池数量、各状态池数量、本轮轻扫数量、深扫队列、作战池、复活观察、冷门探索、下一轮深扫计划、被降频/阻断原因和最近漏判复盘结论都应逐步可见。

2026-06-19 已落地状态池 MVP：`coverage.statePool` 和 `/api/health.scanStatePool` 会展示 COLD/WARM/HOT/CANDIDATE/DEEP_QUEUE/BATTLE_WATCH/BATTLE_READY/COOLDOWN/REVIVE_WATCH 数量、本轮深扫容量、下一批资产、复活观察、冷门探索和“未进入深扫也不删除”的证明。状态池只解释优先级、扫描频率、复查顺序和展示，不允许绕过 Risk Gate 或永久淘汰可交易标的。

2026-06-19 已落地 v2/v3 晋级桥 MVP：状态池会读取现有 `strategyV2` 和 `strategyV3` 的阶段、决策、赔率、Risk Gate、冲突和失效信息，生成只读晋级/冷却解释。该桥接层 `canMutateLiveRanking=false`，只用于解释“为什么进入作战观察、作战准备、候选或冷却”，不能新增交易信号、不能改变实时排序、不能自动调权。

2026-06-20 已落地免费公共轻扫层 MVP：生产环境默认使用 Binance public futures、OKX SWAP、Bybit linear 24h ticker 做全市场轻扫，快速获取 USDT 永续候选、成交额、24h 波动、靠近高低点和压缩/异动标签。轻扫结果只能生成 `public light scan priority hints`、补充 universe instruments 和状态诊断，不能直接生成 EvidenceItem、交易方向、买卖建议或绕过 CoinGlass 深扫。CoinGlass 仍是深扫资金质量确认器，轻扫只负责“全市场先看一遍”和“别让深扫永远停在固定几个币”。

2026-06-20 已落地 Binance + OKX 组合轻扫 MVP：生产默认公共轻扫从单一 Binance 24h ticker 升级为 `public-light-composite`，同时读取 Binance USDT 永续和 OKX USDT SWAP ticker，合并候选、去重同币种，并对多交易所同时出现的异常标记 `cross_exchange_light_scan`。组合轻扫只能提高发现和交叉验证质量，不能直接生成 Evidence、方向判断、交易建议或绕过 CoinGlass / Risk Gate。任一公共源失败时必须显示 `partial` 和源级 notes，不能假装全绿，也不能静默退回少数固定币。

2026-06-19 已落地扫描诊断可观测 MVP：`ScanMetadata` 新增 `lightScan`、`diagnostics` 和 `runtime`。`/api/health` 会暴露轻扫状态、public discovery/fallback 来源、CoinGlass 本轮计划请求币种、空返回币种、过滤行数、主信号数、v3 OHLCV 尝试币种、v3 覆盖缺口、触发来源、缓存状态、归档是否持久化和 repository 模式。以后排查“为什么页面一直是 BTC/ETH/ONDO”“为什么只有几个币”“是否真的在扫”，必须先看这些结构化字段，不能只看前端 Top N。

2026-06-22 已落地运行心跳 MVP：新增受保护 `POST /api/admin/runtime/heartbeat`，`scanner-worker`、`websocket-light-worker`、`coinglass-worker`、`signal-worker`、`dynamic-scan-scheduler` 和 `macro-worker` 会把任务状态写入 Redis；`/api/health.runtimeProbes`、`/api/radar/backend-contract.runtime.runtimeProbes` 和 `RadarContract.serviceNodes` 读取真实 Redis/worker 探针。前端运行状态、系统节点、扫描是否真的在跑，必须优先看这些心跳和健康字段，不能用静态文案、动画或假在线状态替代。

2026-06-19 已落地每日异动宽覆盖 MVP：每日异动抓取不再只依赖少量固定币种，默认在配置资产基础上接入公开合约 universe 轮转，低频扩大涨跌榜归因覆盖；它仍是研究/复盘层，不直接生成交易信号，也不增加主扫描 CoinGlass 深扫预算。

### 三源数据与单机资源最大化原则

2026-06-20 校准：腾讯云服务器上线后，项目从“免费云函数预览版”转为“单机常驻生产系统”。新增能力必须最大化利用服务器常驻进程、Postgres、Redis 和多数据源，但不能因此牺牲证据边界、风控边界和可回滚性。

三源职责固定如下：

```text
Binance public data：主轻扫源
-> 全市场 USDT 永续 universe
-> 24h ticker / price velocity / volume / turnover
-> K 线结构、波动压缩、关键位和多周期 OHLCV
-> 公开 OI / Funding / taker 等可用衍生品辅助

OKX public data：交叉验证源
-> SWAP universe
-> ticker / candles / funding 等公开数据
-> 判断异常是否为单交易所噪音
-> 补充 Binance 未覆盖或流动性分布不同的山寨

CoinGlass paid data：深扫确认源
-> 多交易所合约资金质量
-> OI / Funding / Long-Short / Taker / 合约市场聚合
-> HOT / PRE_TREND / REVIVE / missed opportunity 的高价值验证
-> 拥挤、假突破和风险排雷
```

默认数据流：

```text
交易所 universe
-> Binance/OKX 全市场轻扫
-> 动态状态池
-> 候选结构与关键位预筛
-> CoinGlass 深扫队列
-> Evidence Engine
-> Risk Gate / Trade Plan
-> Signal Dossier / 前端展示
-> Outcome / Missed Opportunity / 策略进化
```

### CoinGlass Hobbyist 官方能力清单与接入规则

2026-06-20 已按 CoinGlass 官方文档重新校准：当前账号按 **Hobbyist** 级别设计。CoinGlass 不是全市场分钟级发现源，而是候选币深扫确认源。后续任何 CoinGlass 新接口接入前，必须先进入能力白名单，标明 `supported_by_hobbyist`、`unsupported_by_hobbyist`、`interval_limit`、`scan_layer`、`visualization_target` 和 `fallback_behavior`；不允许在代码里直接硬接一个未确认端点。

官方文档来源：

- `https://docs.coinglass.com/reference/supported-exchanges`
- `https://docs.coinglass.com/reference/instruments`
- `https://docs.coinglass.com/reference/endpoint-overview`
- `https://docs.coinglass.com/reference/responses-error-codes`
- `https://docs.coinglass.com/reference/user-account-subscription`

当前 Hobbyist 限制按用户已购买套餐展示设计：约 `30 调用/分钟`、`80+ 数据接口端点`、更新频率最高可到 `<= 1 分钟`。服务器升级不改变 CoinGlass 外部限速，因此仍必须使用令牌桶、批次、缓存、预算、失败降级和健康展示。

2026-06-23 生产实测补充：旧生产 `COINGLASS_API_KEY` 曾对合约深扫端点返回 `code=401`、`msg=Upgrade plan`，探测范围包括 `/api/futures/supported-exchanges`、`/api/futures/supported-coins`、`/api/futures/supported-exchange-pairs`、`/api/futures/pairs-markets`、`/api/futures/open-interest/exchange-list`、`/api/futures/funding-rate/exchange-list` 和 `/api/futures/taker-buy-sell-volume/exchange-list`。该结果只能作为历史故障样本，不能替代最新 key 的受保护能力体检。最新生产事实必须以 `POST /api/admin/coinglass/capability` 和本轮 `metadata.diagnostics.requests` 为准；只要返回 `Upgrade plan`、鉴权失败、限速、参数错误、空数据或 0 clean rows，就必须进入 `coinGlassRuntimeCapability`、`metadata.diagnostics.requests`、`/api/health.scanStability`、`/api/radar/backend-contract.sourceAudit.coinGlassDeepScan` 和前端数据源说明；不得把失败写成“市场无机会”或“0 行正常”。公共轻扫、OHLCV、榜单和复盘继续使用 Binance/OKX/Bybit 等免费公开源运转，但不能生成 CoinGlass 衍生品 Evidence 或 TradePlanReady。

2026-06-23 第二批生产验证修正：已通过 `npm run production:update-coinglass-key` 安全替换生产 CoinGlass key，未在日志、命令行、Git 或聊天中输出密钥。使用正确 key 后，线上受保护探针返回 `deepScanStatus=ready`、`providerCanFetchPairMarkets=true`；`futures_pairs_markets`、`open_interest_current`、`funding_current` 可用，`taker_buy_sell_current` 当前仍不可用。最新生产 smoke 显示本轮 `rawRows=559`、`cleanRows=45`、`deepScanned=45`，CoinGlass 核心合约深扫已恢复。后续主路径恢复为 CoinGlass 候选深扫 + Binance/OKX/Bybit 公共全市场轻扫；Taker Buy/Sell、CVD proxy 和更高频资金流必须继续按运行态探针展示为 `partial/waiting/unavailable`，不能假装完整。

下面表格是按文档和目标架构设计的能力白名单；实际启用必须以生产受保护探针为准。任何端点只要返回 `Upgrade plan`、`Invalid API key`、`Endpoint not found`、参数错误、限速或连续空数据，就按不可用/待修处理并进入可观测诊断，不允许在 UI 或报告里宣称已接通。

Hobbyist 可用并建议接入：

| 数据能力 | 官方端点/类别 | 使用位置 | 可视化目标 | 硬边界 |
| --- | --- | --- | --- | --- |
| 账户等级与到期 | `/api/user/account/subscription` | 系统状态 / 设置 | CoinGlass 账号状态、到期、套餐能力 | 不展示 API key，不把失败当作数据源失败 |
| 支持交易所 | `/api/futures/supported-exchanges` | Universe / 扫描证明 | 支持交易所矩阵、覆盖说明 | 只证明 CoinGlass 支持范围，不等于本轮已深扫 |
| 支持交易对 | `/api/futures/supported-exchange-pairs` | Universe / 数据清洗 | 合约池覆盖、交易所覆盖、USDT 永续过滤 | 用于过滤脏数据，不直接生成 Evidence |
| 支持币种 | `/api/futures/supported-coins` | Universe / Coverage | CoinGlass 可深扫币池数量 | 与 Binance/OKX 交叉验证，不能替代公共全市场轻扫 |
| 合约 Pairs Markets | `/api/futures/pairs-markets` | 候选深扫 | 合约市场基础卡片 | 只对候选使用，不全市场高频刷 |
| 当前 OI | `/api/futures/open-interest/exchange-list` | Evidence / 深扫 | OI 脉冲、交易所 OI 分布、价格/OI 对照 | OI 上升不能单独看涨 |
| OI 图表/历史 | `open-interest/*history*` | Dossier / 复盘 | 4h+ OI 趋势线、复盘对照 | Hobbyist 历史周期限制 `>=4h`，不能当 15m/30m 早期发现源 |
| 当前 Funding | `/api/futures/funding-rate/exchange-list` | Evidence / 风险门控 | Funding 拥挤仪表、交易所 funding 对比 | 高 funding 是拥挤风险，不是强势本身 |
| Funding 历史 | `funding-rate/*history*` | Dossier / 复盘 | 4h+ funding 趋势线 | Hobbyist 历史周期限制 `>=4h` |
| 当前 Taker Buy/Sell | `/api/futures/taker-buy-sell-volume/exchange-list` | Evidence / 深扫 | 主动买卖天平、买卖量堆叠条 | 只能验证资金推动质量，不单独决定方向 |
| Taker Buy/Sell 历史 | `taker-buy-sell-volume/history` | 复盘 / 趋势质量 | 4h+ 主动买卖趋势线 | Hobbyist 历史周期限制 `>=4h` |
| 多空账户 / 大户多空 | `global/top-long-short-*history` | Risk Gate / 拥挤判断 | 多空拥挤条、反向风险提示 | 极端多空比只能作为拥挤证据 |
| BTC ETF / ETH ETF | `/api/etf/bitcoin/*`、`/api/etf/ethereum/*` | Macro Weather | ETF 流入流出、AUM、净资产趋势 | 只做大盘天气，不抢山寨主线 |
| 恐惧贪婪指数 | `/api/index/fear-greed-history` | Macro Weather | 情绪仪表 | 只做背景降权/加权 |
| 交易所资产/余额 | `/api/exchange/assets`、`/api/exchange/balance/list` | Macro / 风险背景 | 交易所余额变化、资金流背景 | 低频展示，不做短线入场依据 |

Hobbyist 不支持或当前明确不接：

| 数据能力 | 官方状态 | 处理方式 |
| --- | --- | --- |
| CoinGlass 全市场涨跌幅 `/api/futures/coins-price-change` | Hobbyist 不支持 | 用 Binance/OKX public ticker 自己算全市场涨跌、波动、成交额 |
| CoinGlass RSI/MACD/EMA/MA/ATR 列表 | Hobbyist 不支持 | 用本地指标引擎从 Binance/OKX K 线计算 |
| CoinGlass Pair RSI/MACD/BOLL/EMA/ATR | Hobbyist 不支持 | 本地计算并标明来源周期 |
| CoinGlass News `/api/article/list` | Hobbyist 不支持 | 后续如需要新闻，另接免费 RSS、交易所公告或公开资讯源 |
| CVD | Hobbyist 不支持 | 用 Taker Buy/Sell 作为 CVD proxy，不冒充真实 CVD |
| NetFlow / Net Position | Hobbyist 不支持 | 暂不接；升级套餐前只标记为 unavailable |
| Altcoin Season Index / Bitcoin Dominance | Hobbyist 不支持 | 另找免费公开源，或延后 |
| Token Unlock / Vesting | Hobbyist 不支持 | 另找免费解锁数据源，或延后 |
| Liquidation Heatmap / Map / Max Pain | Hobbyist 不支持，且本项目蓝图禁用 | 不实现、不作为目标位、不作为方向依据 |

Hobbyist 可用但当前降级或默认不用：

- Liquidation history / liquidation coin-list / liquidation exchange-list：部分 Hobbyist 可用，但项目已禁止清算热力图和潜在清算区逻辑。除非后续单独重开“清算历史只做风险背景”的设计，否则不进入主线。
- 4h+ 历史数据：适合复盘、趋势质量和中周期背景；不适合作为 15m/30m 爆发前发现源。

CoinGlass 可视化接入优先级：

```text
第一优先：Scan Proof / Source Status
-> 套餐状态、分钟限速、今日预算、已用/剩余、本轮请求、失败/降级原因、支持交易所和支持交易对

第二优先：Candidate Deep Scan
-> OI 脉冲、Funding 拥挤、Taker 买卖天平、多空拥挤、交易所分布

第三优先：Signal Dossier Evidence
-> 单币价格结构 + OI + Funding + Taker + Long/Short + 关键位 + RR + Risk Gate 联动展示

第四优先：Macro Weather
-> BTC/ETH ETF、恐惧贪婪、交易所余额/资产背景，只影响环境解释和机会权重

第五优先：Review Evolution
-> 事后验证 OI/Funding/Taker 是否支持信号、是否出现拥挤、是否错过机会
```

首页可视化必须遵守：

- 首页只显示最重要的扫描证明、候选排行和选中币作战摘要；完整数据进 Signals / Dossier / Review。
- 任何 Top N 展示必须显示 `显示 X / 共 Y` 和完整入口，不能让用户误以为只扫到了几个币。
- CoinGlass 深扫可视化必须标明 `current`、`4h+ history`、`unsupported_by_plan`、`stale` 或 `partial`。
- TradingView 真实图、自研结构图、CoinGlass 衍生品图必须命名清楚，不能互相冒充。
- 所有图表必须回答交易问题：有没有提前迹象、资金质量是否支持、是否拥挤、位置是否合理、能不能做、错了在哪里失效。

Worker 目标拆分：

- `binance-universe-worker`：低频同步 Binance USDT 永续合约池。
- `okx-universe-worker`：低频同步 OKX USDT SWAP 合约池。
- `binance-light-worker`：30-60 秒级轻扫全市场 ticker，生成价格速度、成交额、波动和初始标签。
- `okx-light-worker`：30-60 秒级轻扫 OKX SWAP，用于交叉验证和补漏。
- `bybit-light-worker`：30-60 秒级轻扫 Bybit linear USDT，用于补充长尾覆盖和交叉验证。
- `structure-worker`：对 WARM/HOT/CANDIDATE 资产拉取必要周期 K 线，生成 Market Reading、Key Level、Forward Map 和位置/RR 事实。
- `derivatives-public-worker`：对候选池拉取 Binance/OKX 可用 OI、Funding、Taker 等公开衍生品。
- `coinglass-worker`：按令牌桶和优先级执行 CoinGlass 深扫，不做全市场盲扫。
- `signal-worker`：融合 Evidence、Scoring、Risk Gate、Trade Plan 和只读报告。
- `review-worker`：写入 outcome、missed opportunity、Forward Map review、策略版本样本和人工校准队列。

Redis 使用边界：

- 可用于分布式锁、扫描队列、令牌桶、短缓存、去重、正在扫描状态和前端运行心跳。
- 当前已接入主扫描锁与 CoinGlass 分钟级令牌桶：`REDIS_URL` 存在时优先使用 Redis；Redis 不可用时降级进程内锁，避免系统完全停摆。
- Redis 不作为长期事实源；长期样本必须落 Postgres。
- Redis 只完成“锁/限速”不等于完整队列调度；前端不得把它表述成“队列调度已全部完成”。

Postgres 使用边界：

- 长期保存 Evidence、信号生命周期、状态池变更摘要、关键位快照、Forward Map 快照、outcome、missed opportunity、人工校准和策略版本审计。
- 轻扫原始 ticker、全市场分钟级 K 线和重复中间结果默认不永久保存；只存摘要、候选窗口和复盘需要的 bounded sample。
- 数据保留必须可配置：轻扫摘要短保留，候选证据中期保留，日记/复盘/策略审计长期保留。

数据归类硬规则：

- 全市场合约池必须先按交易所元数据过滤，再做跨交易所聚合。Binance 必须要求 `underlyingType=COIN` 和 USDT 永续；OKX 必须要求 crypto swap 类别并拒绝 pre-market / tokenized / commodity；Bybit 必须拒绝 `symbolType=stock/commodity`。禁止只靠币种名字黑名单、全局 baseAsset 黑名单或单一交易所状态决定整个币种是否可扫。
- 同名冲突必须按交易所级别处理。例如某交易所把 `QNT/BB` 类标成非加密合约，但其他交易所存在真实 crypto USDT 永续时，不能全局删除该币；只能剔除污染交易所的数据源。只有所有有效来源都被元数据判定为非加密/股票/商品/预市场时，才允许进入污染清理列表。
- `universe_*`：交易所合约池、上市状态、交易所覆盖、基础流动性。
- `light_scan_*`：Binance/OKX 全市场轻扫摘要、速度、成交额、波动、压缩和异常标签。
- `state_pool_*`：COLD/WARM/HOT/CANDIDATE/DEEP_QUEUE/BATTLE/REVIVE 状态迁移和复查原因。
- `scan_asset_states`：每个币的持久化轮换账本，记录上次深扫、连续跳过、近期深扫次数、状态池、被动态优先级挤占与选中/跳过原因；只用于调度公平性和扫描证明，不用于交易判断。
- `deep_scan_*`：CoinGlass 深扫请求、返回摘要、配额消耗、失败原因和资金质量确认。
- `signal_maturity_*`：`LIGHT_SCAN_MARK`、`DEEP_SCAN_CANDIDATE`、`EVIDENCE_SIGNAL`、`TRADE_PLAN_READY` 分层统计和展示资格；只用于区分“后台轻扫标记 / 验证中候选 / 证据融合信号 / 可人工复核计划”，不能绕过 Evidence、Risk Gate 或赔率门槛。
- `structure_*`：K 线结构、关键位、Forward Map、RR、趋势完整度、假突破风险。
- `indicator_*`：EMA、RSI、MACD、Bollinger、ATR、VWAP、ADX、Volume、OBV/CVD proxy、Fibonacci 等技术指标证据摘要。
- `evidence_*`：所有进入策略引擎的 EvidenceItem、证据家族、方向、权重、同源去重和追溯链。
- `strategy_*`：Market Stage、Decision、Score、Risk Gate、Entry/Exit/Invalidation Plan 和只读报告。
- `review_*`：outcome、missed opportunity、人工校准、策略版本审计和复盘进化样本。
- `system_*`：Worker 心跳、扫描证明、数据新鲜度、错误日志、备份状态、部署版本和回滚记录。
- `ui_cache_*`：前端只读缓存和展示状态，不能成为事实源，不能覆盖后端新数据。

服务器资源不再限制“能不能常驻跑”，但仍限制“能不能无边界保存、无边界重算、无边界深扫”。后续任何提速都必须优先靠队列、缓存、批次、状态池、WebSocket 或增量更新，而不是暴力加请求。

## 长期运营工程原则

这是长期运营网站，不是一次性页面。后续所有拓展必须保证稳定、流畅、可 DIY、可关闭、可继续优化：

- **稳定优先**：CoinGlass、AI、提示音、动画、浏览器通知任一模块失败，都不能拖垮主雷达、策略判断、复盘写入、系统健康或页面加载。
- **流畅优先**：核心面板先显示，次要模块可延迟、缓存或降级；动效要低负载，遵守 `prefers-reduced-motion`。
- **可 DIY**：扫描频率、扫描币池、告警阈值、静默时段、提示音、UI 密度、AI 复核开关、风险偏好和策略观察项，后续应逐步进入配置中心。
- **可关闭**：动效、声音、AI 复核、浏览器通知和实验性策略必须能按模块关闭或降级。
- **模块边界清楚**：数据源层、扫描层、分析层、策略层、复盘层、告警层、UI 展示层和配置层保持解耦。
- **功能开关优先**：实验性功能先通过 feature flag 或配置边界接入，避免新功能崩掉主线。
- **前端展示不等于前端乱塞**：能展示的要展示，但按决策路径渐进展开：首页显示最该注意的东西，信号档案显示完整证据链，展开层显示细节和历史，复盘层显示学习与策略变化。
- **主动审计责任**：后续搭建不能只在用户指出问题后修补。每轮开发都必须主动检查同类隐患，包括扫描容量是否符合“全市场山寨雷达”目标、后端能力是否被前端完整承接、是否存在静默隐藏、文字溢出、旧数据误导、模块两张皮、图表承诺不真实、定时任务成功但业务无效等问题。发现问题必须汇报类别、影响、是否已修、是否需要蓝图规则或测试防回归。
- **全市场发现不得静默塌缩**：如果 Binance/OKX/Bybit public universe discovery 在腾讯云生产环境或 Vercel 回滚环境失败、被区域网络阻断或返回过少标的，系统不得静默退回 `COINGLASS_BASE_ASSETS` 的 7 个基础币并显示 100% 覆盖。必须启用广谱 USDT 永续静态兜底池继续轮转，同时在 metadata、`/api/health.fullMarketCoverage.status` 和前端覆盖区明确标注 `fallback/兜底轮转`。兜底池只用于防止漏扫和维持轮转，不是交易所上市事实源，不得单独构成 EvidenceItem、方向判断、买卖建议或策略入场依据；候选仍必须由 CoinGlass 数据、盘面结构、证据链和 Risk Gate 过滤。
- **前后端信息一致性**：后端返回、计算、归档或复盘出的核心信息，前端不能无提示吞掉。任何 Top N、`slice`、折叠、样本展示、摘要展示，都必须在用户可见处说明“显示 X / 共 Y”、`+N`、完整入口或被隐藏原因。首页可以分层，但不能让用户误以为系统只扫描或只产生当前可见的几个币。
- **可读性是核心功能**：文字溢出、遮挡、挤压、截断无提示、按钮文字放不下、状态条重叠、移动端横向滚动、桌面窄宽错位，都按功能缺陷处理，不按普通美观问题处理。任何前端阶段完成前，必须检查主要断点和高密度内容区域的可读性。
- **验收不止代码通过**：`lint`、`typecheck`、`build`、测试通过只能证明工程基础合格，不能证明产品合格。每次重要搭建还必须验证真实页面表现、信息完整性、数据新鲜度、线上动作是否真的生效、用户是否能看懂系统正在做什么。
- **验证命令顺序硬规则**：`next build` 会重建 `.next/types`，因此 `npm run typecheck` 和 `npm run build` 不能并行执行；必须顺序执行，避免工具互相删除/生成 `.next/types` 导致假失败。可以并行的是互不写同一产物的只读检查。

## 前端 UI 交付边界

2026-06-21 最新校准：**v0 前端 UI 作为当前展示事实源**。这套 UI 由外部前端工具生成，目标是 1:1 保留视觉、布局、动效、文案、宠物小人和交互壳；Codex 的职责是后端、数据契约、接口适配和真实数据接线，不重新设计 UI。

本次接入只恢复前端展示层，不删除后端核心能力：

- 保留 `src/app/api/**` API。
- 保留 `src/lib/**` 扫描、分析、复盘、告警、持久化、Worker 相关能力。
- 保留数据库、迁移、Postgres/Redis、扫描调度和部署配置。
- 保留后端只读契约：`GET /api/radar/backend-contract` 和 `GET /api/radar/dossier?symbol=SYMBOL`。
- 新增前端专用契约：`GET /api/frontend/radar-contract`、`GET /api/frontend/token-dossier?symbol=SYMBOL`、`GET /api/frontend/leaderboard?kind=KIND`、`GET /api/frontend/review-contract`、`GET /api/frontend/kline-contract?symbol=SYMBOL&tf=TF`、`GET/POST /api/frontend/journal-contract`。

后续前端融合必须遵守：

- v0 UI 文件默认不重写；必须修改前端时，优先只改数据接入层和最小必要绑定。
- 前端不得自己生成交易判断；所有方向、成熟度、RR、Risk Gate、证据、反证、复盘状态必须来自后端契约或后端 mapper。
- 前端不得用 mock 冒充真实扫描、真实 K 线、真实信号、真实运行状态；未接真实数据的模块必须保留可见降级/占位语义。
- 前端必须清楚区分全市场资产池、当前扫描批次、当前候选信号、深扫候选、人工复盘样本和策略演化样本。
- 前端不能因为布局、分页、Top N、折叠或视觉选择，让用户误以为系统只扫描了当前可见的几个币。
- UI 设计由外部前端工具负责；Codex 负责让 UI 消费真实后端数据并保持 1:1 视觉不被破坏。
- 2026-06-22 起，前后端全量对接以 `docs/frontend-backend-field-map.md` 为字段级施工基线。任何新增对接、删改 mapper、补接口或改空状态前，必须先核对该字段地图，避免“页面看起来接了、实际字段半接或两张皮”。
- 2026-06-23 起，页面切换流畅性按核心功能处理。服务端页面读取 `RadarContract`、榜单、复盘等只读合同必须使用短 TTL 缓存和 in-flight 合并，避免一次页面切换重复聚合相同 snapshot、重复扫描公开榜单或误触 CoinGlass。该缓存只能服务展示层，不能覆盖扫描事实源、不能写入数据库、不能让 stale 数据冒充 live。

### Scan Economy 扫描经济系统

CoinGlass 业余会员 API 要精打细算地用满：不乱打、不浪费、不省到失去价值。每一次 CoinGlass 请求都必须有用途、有缓存、有复用、有优先级。

- CoinGlass 优先用于最有价值的合约数据：OI、资金费率、合约市场、涨跌榜、爆仓/多空相关数据。
- K 线和基础 OHLCV 优先使用免费公开源，避免浪费 CoinGlass 请求。
- BTC/ETH 锚定币每轮优先，核心山寨较高频，长尾低频轮转。
- 涨跌榜、扫描异常、日记复盘中频繁出现的币可以动态提权。
- 扫描调度采用状态池，不采用硬漏斗；前置层只调整 COLD/WARM/HOT/CANDIDATE/DEEP_QUEUE/BATTLE/COOLDOWN/REVIVE_WATCH 状态、扫描频率和复查条件。
- CoinGlass 深扫必须预留 HOT、PRE_TREND、REVIVE_WATCH、missed opportunity 和冷门探索名额，避免热门币耗尽所有预算导致漏网。
- CoinGlass 某个接口返回 `Upgrade Plan`、限速或单币失败时，必须标记为 `partial/degraded` 并保留 public light scan、universe coverage、state pool 和诊断输出；不能把这种情况说成完整成功，也不能让整轮 `/api/scan` 失败。
- 同一份扫描结果要复用到雷达、信号档案、告警、日记、复盘和系统状态反馈，不能各模块重复请求。
- 所有 CoinGlass 请求必须进入进程级全局 pacing 队列，统一遵守 `COINGLASS_REQUEST_INTERVAL_MS`。单个 provider 内部节流不够，页面、健康探针、能力体检、worker 或临时受保护入口并发时也不能互相撞限速。
- 前端要逐步展示今日请求预算、已用/预计、覆盖率、状态池数量、下一轮扫描计划、当前币池结构和深扫配额去向。
- 2026-06-19 已接入状态池调度证明和 v2/v3 只读晋级桥；后续优化只允许提升调度质量和可解释性，不允许把它变成硬漏斗或绕过风险门控。

### 运行互动边界

2026-06-21 最新校准：旧 S680/旧宠物事实源已失效；当前以 v0 前端里的宠物小人系统为展示事实源。宠物互动只允许服务真实系统状态、风险提醒、数据新鲜度和复盘动作，不影响扫描、评分、风控和策略判断。

允许保留或新增：

- 扫描心跳、倒计时、队列变化、候选池变化、数据新鲜度、stale 降级。
- 交易所、CoinGlass、Postgres、Redis、Worker 的运行状态提示。
- 高风险、数据异常、扫描失败、复盘到期、深扫排队等真实系统事件提示。
- 用户主动开启的提示音、浏览器通知和静默时段设置。

禁止新增：

- 与真实扫描、证据、风险、复盘无关的装饰性互动。
- 任何会制造 FOMO、暗示收益、替代策略判断或遮挡核心数据的互动。
- 任何只为了热闹但不能解释“系统正在做什么、数据是否可靠、信号为何成立或为何不能做”的动效。

## 版本与长期迭代规则

V3.0 不定义为最终版，而定义为 **专业稳定底座版**。

到 V3.0 时，系统应该具备稳定的核心市场雷达能力、清晰的模块边界、可验证的分析逻辑、可持久化的复盘闭环、可控的告警系统和可继续扩展的 UI 架构。V3.0 之后，项目进入长期迭代阶段，而不是停止开发。

后续版本规则：

- `V3.x`：在稳定底座上做小功能增强、体验优化、提示音包、图表细节、数据展示优化。
- `V4.0`：用于明显改变产品形态的大功能，例如登录系统、个人 watchlist、私有交易日记、用户设置和个人化告警。
- `V5.0+`：用于更高阶的策略管理、更多数据源体系或其它需要重新设计边界的大升级。

长期迭代必须遵守：

- 新增、优化或删除功能前，先按工程章程判断是否服务核心闭环、属于哪一层、是否破坏边界、需要什么验证。
- 任何新讨论或优化方案必须先做“现有系统映射”：列出它会复用哪些已落地模块、补齐哪些蓝图未完成模块、替换或删除哪些旧能力、会不会影响 Evidence / Risk Gate / 复盘闭环。
- 任何新方案都必须先说明与现有 v2/v3 分析链路的关系：数据从哪里来、进入哪个 Evidence Family、是否影响评分、是否经过 Risk Gate、如何展示、如何复盘。
- 如果一个想法暂时无法接入现有扫描、分析、策略或复盘闭环，只能进入需求池或实验层，不能直接进入主路线。
- 新想法先进入需求池，先判断属于立即做、预留接口、V2/V3/V3.x/V4 还是暂缓。
- 每个阶段完成后，先复核真实完成度、未完成缺口、免费套餐限制和最新风险，再决定下一阶段；路线图可以调整，但核心闭环不能偏移。
- 新功能不能直接堆进页面，必须有明确模块归属和接口边界。
- 分析逻辑、复盘、告警、数据库和数据源相关改动必须有测试。
- 数据库结构变化必须通过迁移方式处理，不能随手改表。
- 每次上线前必须通过本地验证、构建验证和腾讯云生产健康检查；Vercel 预览只作为旧回滚路径验证，不再作为主生产上线门禁。
- 如果一个功能会破坏核心市场分析稳定性，必须延期或拆小，不能为了好玩牺牲专业性。

## 交付节奏原则

后续搭建默认使用 **大块交付模式**，减少反复切换和碎片化等待：

- 一轮交付应围绕一个明确业务目标，而不是一个按钮、一个字段或一小段样式。
- 每轮开始前说明：当前阶段、本轮目标、本轮包含哪些小项、为何现在做它。
- 每轮结束后说明：本轮完成、验证结果、Git 提交 Summary、下一轮正确顺序、剩余大项。
- 代码提交、推送、测试、文档和本地/生产验证默认由搭建流程负责；只有外部账号内必须人工确认、密钥录入、支付、短信/扫码、被工具安全策略禁止的网页控制动作，才由用户手动完成。
- 测试、类型检查、lint、生产构建和关键 UI 浏览器检查是质量底线，不能为了提速省掉。
- 蓝图只固化核心原则、模块边界、路线变化和重大决策，不记录每个小按钮的施工细节。

速度与质量交付规则：

- 每轮交付必须是“一个业务闭环”，不能长期停留在只改一个字段、一个按钮或一小块半成品。
- 每轮开始前必须明确：本轮解决什么问题、包含什么、不包含什么、完成后怎么验收。
- 每轮完成前必须按改动类型跑对应检查：文档检查、单元测试、类型检查、lint、生产构建、Docker/健康检查、页面可读性检查或数据写入检查。
- 生产相关改动必须有回滚路径；没有回滚路径的改动只能进实验层，不能直接进主生产。
- 发现一个问题时，必须顺手检查同类问题，不能只修用户指出的表面点。
- 提速优先靠工具：一键部署、一键诊断、一键回滚、日志打包、数据库备份、部署流水线和固定汇报模板。
- 汇报必须说清楚：完成了什么、没完成什么、验证了什么、哪里还有风险、下一步应该做什么。
- 禁止为了显得快而省略验证、隐藏失败、使用 mock 冒充真实、用旧缓存冒充新扫描，或把“能启动”说成“已稳定生产”。

## 生产发布流程硬规则

2026-06-22 起，项目正式采用 **GitHub 作为代码正本、腾讯云作为运行环境** 的发布方式。服务器不是写代码的地方，服务器只负责拉取已验证代码、构建容器和运行服务。

标准发布顺序固定为：

```text
本地改代码
-> 本地测试和构建
-> 提交并推送到 GitHub main
-> 腾讯服务器 git pull origin main
-> docker compose build/up 重启
-> 服务器健康检查和页面/API 验收
```

硬规则：

- **GitHub 是唯一代码正本**：后续业务代码、配置模板、部署脚本、测试和文档都以 GitHub `main` 为准。
- **腾讯服务器禁止直接改业务代码**：不能把服务器当开发机。服务器上临时改代码会造成 GitHub、服务器和本地三方不一致，后续 `git pull` 可能覆盖或混乱。
- **紧急修复例外**：如果必须在服务器临时修复生产故障，修完后必须立刻把同样改动同步回本地/GitHub，并记录原因和回滚点。
- **本地验证先行**：至少按改动类型运行 `npm run typecheck`、`npm run test:market`、`npm run lint`、`npm run build` 中对应项；扫描、数据库、Worker 或 Docker 改动还必须补服务器健康检查。
- **SSH 优先、OrcaTerm 兜底**：生产部署必须优先使用本机 SSH 和自动化脚本。OrcaTerm 只能作为 SSH 不通时的临时兜底，不能作为长期部署主流程。
- **一键脚本优先**：腾讯云发布默认使用 `npm run production:deploy`；只检查 SSH 使用 `npm run production:ssh-check`；只做公网验收使用 `npm run production:smoke`。
- **服务器发布命令固定**：
  ```bash
  cd /home/ubuntu/apps/chuan-market-radar
  git pull origin main
  sudo docker compose --env-file .env.production up -d --build
  sudo docker compose --env-file .env.production ps
  curl http://127.0.0.1:3000/api/health
  ```
- **提交一致性检查**：服务器发布后必须确认服务器 `git rev-parse HEAD` 与 GitHub `origin/main` 提交号一致；不一致不能说“已同步”。
- **部署验收不只看容器启动**：必须看 `web` 是否 healthy、Postgres/Redis 是否 healthy、Worker 是否持续运行、`/api/health` 是否 ready、前端合同接口是否能读到后端数据。
- **公网验收必须查业务合同**：生产验收必须至少检查 `/api/health`、`/api/frontend/radar-contract`、`/api/frontend/leaderboard?kind=volume`、`/api/frontend/review-contract` 和 `/api/radar/backend-contract`。如果页面能打开但 contract 空、榜单空、深扫状态不可信，不能说部署完成。
- **回滚路径**：生产发布失败时，优先回到上一个已知可用 Git 提交并重建容器；不得在服务器上边猜边改。
- **当前部署自动化状态（2026-06-24）**：发布主流程仍是 GitHub -> 腾讯云 pull/build/up，但本机到 GitHub 和腾讯云 SSH 链路存在网络/握手不稳定；OrcaTerm 仍是临时兜底。后续必须把 GitHub 远端检查、SSH 连接、服务器提交号核对、日志打包和回滚脚本继续做成稳定自动化，不能把“手动能部署”说成“一键部署已完全可靠”。

## 沟通规则

后续与用户沟通默认使用中文和大白话。能用中文表达的，不用英文术语堆砌；必须使用技术词时，要顺手解释它等于什么、用来干什么、为什么现在需要。

- 默认中文回答，除非代码、命令、环境变量、接口名或第三方产品名必须保留英文。
- 默认大白话解释，先讲结论和影响，再讲技术细节。
- 遇到 Docker、Redis、Postgres、Worker、Runner、CDN、Nginx/Caddy、CI/CD、Webhook、Token bucket 等术语时，必须用一句话解释成用户能理解的说法。
- 方案汇报要明确“这一步解决什么问题、会改变什么、不改变什么、怎么验证、出问题怎么回滚”。
- 不用装饰性套话，不把半成品说成完成，不把旧数据/缓存/兜底说成真实新数据。

## 当前技术栈

- 前端与后端：Next.js App Router
- 当前生产主线部署：腾讯云香港单机 Docker Compose
- 当前生产数据库：腾讯云单机 PostgreSQL
- 当前生产缓存/队列底座：腾讯云单机 Redis
- 当前代码正本：GitHub `main`
- 当前线上回滚部署：Vercel
- 当前线上回滚数据库：Neon Postgres
- 本机缓存/队列底座：Redis
- 数据源：Binance public data + OKX public data 负责全市场轻扫和交叉验证，CoinGlass 业余会员 API 负责候选深扫和资金质量确认
- 公开图表：TradingView 站内主图嵌入 + 外部 TradingView 链接入口
- 语言：TypeScript
- 测试：Node test + TypeScript 编译测试
- 当前验证命令：
  - `npm run test:market`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

## 资源预算原则

2026-06-20 起，项目进入 **腾讯云香港单机生产主线阶段**。旧 Vercel + Neon 仍作为回滚路径保留，不再作为新功能设计的默认资源上限。

当前目标资源基线：

- 腾讯云香港轻量服务器：4 核 CPU / 8GB 内存 / 120GB SSD / 200Mbps 峰值带宽。
- 单机 Docker Compose：`web`、`postgres`、`redis`、`scanner-worker`、`coinglass-worker`、`signal-worker`、`dynamic-scan-scheduler`、`caddy`。
- PostgreSQL 与 Redis 先部署在同一台服务器；后续只有当真实瓶颈出现时，才评估 TencentDB 或独立缓存。
- CoinGlass 仍是硬限速来源，服务器升级不代表可以无限制深扫全市场。
- Binance/OKX public data 成为全市场快速发现主力；优先使用 REST 稳定落地，后续可升级 WebSocket 降低 REST 轮询压力。
- 单机环境允许常驻 Worker、扫描心跳、队列调度、复盘 executor、后台诊断和本地日志，不再把每个后台动作都压缩成 Vercel 短函数。
- 4C/8G 当前足够支撑个人使用场景下的全市场轻扫、候选深扫、Postgres、Redis、Next.js 和多个低频 Worker；真正瓶颈优先看 CoinGlass 限速、交易所限速、数据库写入策略和扫描算法，而不是先买更多云产品。
- 服务器新能力必须优先用来增强“全市场发现、动态候选池、复盘进化、可观测性和前端运行感”，不能优先堆无关装饰功能。

旧 Vercel/Neon 回滚环境约束继续保留：

- 主生产按腾讯云单机能力设计；只有临时回滚到 Vercel/Neon 时，才启用低频、分批、缓存、可降级边界。
- CoinGlass Hobbyist 始终必须控制请求范围和请求次数，优先分层候选、分批扫描、复用缓存和展示覆盖率。
- 旧 Neon 回滚库必须控制表结构、索引、写入频率和 payload 体积；能按快照/摘要保存就不做无边界明细流水。
- 旧 Vercel 回滚部署不能依赖高频内置 Cron 或长时间后台任务；需要定时刷新时优先 GitHub Actions 外部 cron 请求受保护 API。
- 如果某个功能必须升级云资源才能稳定运行，先做开关、降级和健康提示，再由用户决定是否升级。

单机生产与回滚硬规则：

- 回滚资源完整退役前，不删除 `vercel.json`、Neon adapter、GitHub Actions workflow 或旧环境变量文档。
- 迁移先新增普通 PostgreSQL client 和单机部署骨架，再切换运行环境；不能重写交易/扫描核心来冒充迁移。
- Redis 第一阶段作为缓存/锁/队列底座部署，但业务逻辑未接入前不得在 UI 上宣称 Redis 已承担调度决策。
- Worker 第一阶段先调用现有受保护 API，跑稳后再逐步拆为直接调用库函数的独立 worker。
- `.env.example` 只能放占位符；真实 `.env.production` 只存在服务器，不进 Git。
- 任何部署改造不得添加自动下单，不得连接交易所下单 API。
- 新服务器验收必须包含：容器健康、`/api/health`、数据库迁移、Redis 连通、主扫描 Worker、CoinGlass 深扫 Worker、动态调度 Worker、日志、备份和回滚。
- 后续提速优先建设自托管部署流水线、诊断脚本和回滚脚本；不能依赖用户反复手动复制命令排错。
- Vercel/Neon 到腾讯云的迁移与回归验收属于阶段 0/1 的核心工作，不是可选项。验收范围包括：Next.js 前端/API 运行环境在腾讯云 `web` 容器运行，Neon Postgres 关键数据已导入腾讯云本机 PostgreSQL，受保护 admin/scan/review worker 从外部 cron 切到单机 Worker，环境变量从 Vercel/Neon 面板迁到服务器 `.env.production`。
- 数据迁移不能只看“容器能启动”。必须验证旧 Neon 表结构、关键表行数、最近 scan archive、journal events、v3 forward map snapshots、daily mover reviews、rank profile 和 outcome/review 样本是否能在腾讯云 Postgres 读到。
- 腾讯云已经是当前主生产后，Vercel/Neon 只能保留只读或回滚状态；任何回滚演练都必须说明数据源、提交号、健康检查和恢复路径。

## 当前阶段状态总览

> 这里区分“基础能力已落地”和“完整专业能力已完成”。基础能力可用不等于生产级闭环已经完成。

| 阶段 | 当前状态 | 还差什么 |
| --- | --- | --- |
| 阶段 1：蓝图固化 | 已完成 | 后续每轮继续维护本文，防止上下文压缩造成遗漏 |
| 阶段 2：真正多周期分析引擎 | 基础已落地，受限主候选已接入真实多周期 OHLCV profile、指标矩阵摘要、基础指标/周期校准、只读权重回测校准 MVP、只读权重变更审计、人工执行记录写入入口、只读 registry 和影子策略权重层 | 尚未完成真实权重生效、交互式多周期图表和全量候选覆盖 |
| 阶段 3：合约 universe registry | 基础、三交易所自动发现、静态兜底池、免费 public light scan、分层币池、低频轮转、覆盖差异、quota 护栏、动态优先级、repository hints、扫描经济前端面板、高优先级候选可观测、交易所覆盖钻取、状态池调度 MVP、深扫容量证明、复活观察/冷门探索展示、v2/v3 只读晋级桥、结构化扫描诊断、后端扫描契约出口和二段深扫分配证明已落地 | 尚未完成状态池历史胜率排序、长周期漏网统计和长期 outcome 样本后的自动调度校准 |
| 阶段 4：OHLCV、盘面结构与技术指标 | 基础已落地，受限主候选已接入 `1m/5m/15m/30m/1h/4h/1d/1w` candles、MACD、近似成交量分布、指标矩阵摘要、策略卡前端矩阵基础展示、基础指标/周期权重校准、只读权重回测校准 MVP、只读权重变更审计、人工执行记录写入入口、只读 registry 和影子策略权重层；v3 KeyLevel/ForwardMap/Pattern Library 已复用既有 OHLCV 接入 Signal Dossier；Fibonacci 回撤已作为位置/RR 辅助上下文接入 | 尚未完成真实权重生效、交互式多周期图表、更专业的成交量分布模型、完整 Market Reading Engine、谐波辅助层 |
| 阶段 4V3：Altcoin Trend Radar v3 | 定位已确认为“全市场山寨币趋势切换雷达”；Strategy Engine v2 已形成证据、评分、风险门控和报告底座；v3 类型、Key Level Engine MVP、Forward Level Map MVP、forward map review hook、Forward Map 持久化 MVP、Forward Map review executor MVP、系统健康摘要、Market Reading MVP、结构事实驱动阶段切换、位置/RR 只读门控、回踩/反抽质量、趋势完整度、v3 只读 Trade Plan 草案、Pattern Library MVP、三角压缩/旗形/头肩/Fibonacci 低权重辅助、复盘标签、形态/计划复盘统计、bucket 样本追溯、Forward Map review 事件联动、系统级 `v3StrategyLoop` 闭环健康摘要、v3 readiness bucket、`strategyEvolutionLoop` 只读进化闭环总控和单信号后端档案 API 已完成 | v0 前端 UI 已恢复为当前展示壳，后续需要继续把更多模块从 mock 切到 `/api/frontend/*` 和后端只读契约；仍需补齐谐波低权重提示和长期样本后的真实回滚验证 |
| 阶段 5：AI 反证复核 | 边界已落地 | 尚未配置生产模型、多模型对照、成本统计和复盘校准 |
| 阶段 6：自我提升复盘 | 基础已落地，outcome executor MVP、受保护 API、腾讯云 `signal-worker` 主线低频触发、GitHub Actions 回滚触发保留、已关闭信号去重、结果覆盖率、执行批次统计、跳过原因分层、复盘面板执行批次详情、样本质量分层、手动校准准入门槛、只读校准流、阻断解释、样本明细、阈值层、人工回滚计划、只读策略权重回测校准、只读权重变更审计、人工执行记录写入入口、只读 registry、影子策略权重层、影子表现评估、v3 trade/pattern 复盘标签、形态/计划复盘统计面板、真实权重启用门禁和策略进化闭环总控已落地 | 尚未完成真实权重接入扫描引擎、真实权重生效和真实回滚验证 |
| 阶段 6B：每日异动归因复盘 | 逻辑、数据源适配器、抓取写入服务、受保护 API、公开只读 API、腾讯云 Worker 主线触发、外部 cron 回滚策略、schema、repository、公开复盘面板、历史样本选择、单样本详情、只读关联摘要、规则校准建议、校准候选入复盘队列、按 tag 汇总的只读校准反馈趋势、人工回测候选链路、历史样本验证层、策略版本草案链路、人工确认记录、确认后表现反馈基础、策略版本长周期表现/回滚边界、阈值画像、手动回滚计划、K 线回测低成本计划边界、K 线缓存持久化、受保护低频填充 MVP、缓存 K 线验证结果、observedAt 事件窗口回测、outcome executor 复盘写回基础、只读权重变更审计、人工执行记录写入入口、只读 registry、影子策略权重层、影子表现评估和真实权重启用门禁已落地 | 尚未完成自动权重调整；自动调整必须等待更多 outcome 样本、真实权重接入扫描引擎和真实回滚验证更成熟 |
| 阶段 7：告警系统 | 网页内基础、站内事件、重复抑制、静默时段、浏览器通知、提示音、Settings 抽屉本地告警控制、站内告警历史筛选、已读、归档、恢复和信号档案告警联动已落地；明确不接 Telegram/Webhook | 尚未完成告警历史持久化和更细提示音音色 |
| 阶段 8：前端融合 | v0 前端 UI 已作为当前展示事实源接入；旧首页占位页已被替换；已新增 `/api/frontend/radar-contract`、`/api/frontend/token-dossier`、`/api/frontend/leaderboard`、`/api/frontend/review-contract`、`/api/frontend/kline-contract` 五个前端只读适配接口；已新增 `/api/frontend/journal-contract` 前端读写合同；Token 详情页 K 线面板已接真实 OHLCV 合同并禁止生成模拟蜡烛；交易日记抽屉已从 localStorage-only 升级为 Postgres-backed、localStorage 兜底；2026-06-23 已补榜单事实源/排序/来源说明、K 线多源级联失败边界、上游请求超时护栏、分析报告分层和 evidence sourceId；2026-06-23 继续修复榜单跨交易所口径：涨幅榜取同币种最高 24h 涨幅、跌幅榜取同币种最低 24h 涨幅、成交额榜聚合跨交易所 24h 成交额；Token Dossier 汇报已扩展到关键位、Forward Map、趋势分数、位置/RR、回踩/反抽、趋势完整度、确认清单和人工复核边界；K 线合同已新增只读 overlay，能输出/绘制后端 v3 关键位、Forward Map、结构止损和 TP 目标线；2026-06-23 已完成 active frontend mock 事实源清理：活跃页面/组件不再从 `mock-data.ts` 导入市场事实或 UI 类型，`frontend-market-types.ts` 承接展示类型，`sniper-data.ts` 仅保留类型/显示 helper，旧 `ReviewCenter` 和 `SystemCenter` mock 面板已删除，并新增仓库卫生测试防回归；腾讯服务器内部和服务器公网侧已验证 leaderboard 与 K 线合同可返回 | 仍需前端继续消费更多真实字段：资金流、更多复盘统计、TradingView 兜底和更高级图表交互；本机直连公网 IP 偶发超时和 Caddy 重启期 Docker DNS 短暂 502 需继续纳入生产稳定性观察；保证 UI 1:1 不被重写 |

## 2026-06-24 当前生产事实与未完成总控

本节是当前继续搭建的优先事实源，优先级高于历史阶段记录。历史阶段只作为施工索引；实际下一步以本节 P0/P1/P2 为准，避免长上下文导致重复做、漏做或把旧问题当新问题。

### 当前已验收生产事实

- 公网生产 smoke 已通过：`/`、`/dashboard`、`/signals`、`/leaderboard`、`/market`、`/review`、`/system` 均返回 200。
- `/api/health` 当前为 `ready`，数据源为 `coinglass`，数据库为 `ready`，扫描新鲜度为 `fresh`。
- 全市场轻扫当前覆盖 `593/593`，`scanProof.coverage=100`；这表示公开轻扫覆盖，不等于 CoinGlass 已深扫全市场。
- CoinGlass 深扫当前恢复可用：生产 smoke 显示 `planned=24`、`rawRows=594`、`cleanRows=45`、`failureSample=[]`。
- 当前深扫证明显示 `deepScanned=45`、`awaitingDeepScan=548`；深扫是轮转确认层，不是一次性全市场重扫。
- `/api/frontend/leaderboard?kind=volume/gainers/losers` 当前均返回 `live` 且 50 行 public ticker 结果，行内带 `source/sourceLabel/venueScope/sortKey/rankingScope/updatedAt`。
- `/api/frontend/review-contract` 当前可返回，但真实生命周期样本、策略分型胜率和进化统计仍处在样本收集阶段，不等于复盘进化已成熟。

### P0：必须先根治的问题

1. **总控与单币档案状态一致性**：2026-06-24 已完成代码层修复。`TRADE_PLAN_READY` 只能由当前规则重新计算产生，且必须满足 v3 结构化交易计划 `status=READY_LONG/READY_SHORT`、`isPlanEligible=true`、RR 不低于 `3:1`、风险门控和多周期门控通过；旧快照、旧 journal 或手写 `maturity` 字段不能覆盖当前规则。`RadarContract`、AI 复核入口、Journal lifecycle 和 Snapshot maturity 都必须重新计算成熟度，避免总控显示“计划就绪”而 Token Dossier `tradePlan=null`。本地验证：`npm run test:market` 616/616 + worker 11/11 通过，`npm run typecheck` 通过。下一步是部署后用生产真实信号再次验收 `radar-contract` 与 `/api/frontend/token-dossier?symbol=...` 对同一 symbol 的成熟度、Risk Gate 和 tradePlan 一致。
2. **个人仓位镜头线上展示未完全验收**：本地已实现 `positionLens`，测试、typecheck、build 已通过；但生产单币档案只有在真实 `tradePlan` 存在时才能展示。修复 P0-1 后，必须用一个真实 `TRADE_PLAN_READY` 标的验收 `tradePlan.positionLens` 是否稳定输出；如果生产暂时没有计划就绪标的，前端必须显示 waiting/blocked 原因，不能伪造 position lens。

### P1：当前未完成清单

- **前端合同一致性验收**：`RadarContract`、`TokenDossier`、`Leaderboard`、`ReviewContract` 对同一 symbol 的状态、价格、成熟度、Risk Gate、tradePlan 和 freshness 必须一致，不能各自解释。
- **真实复盘样本闭环**：当前 outcome、signal lifecycle、strategy archetype 仍缺真实样本；系统只能说“复盘框架已落地，样本收集中”，不能说已经完成自我进化。
- **AI 生产复核**：AI evidence-id bound 边界已完成，但生产模型、多模型对照、成本统计和复盘校准未完成；当前 AI disabled 不能包装成已运行能力。
- **合法外部事件情报层**：第一到第三档合法数据源已进入蓝图，但 `ExternalEvent`、`SourceFetchRun`、DEX Screener collector、交易所公告 collector、token identity collector、链上低频 collector 和事件转 Evidence/Risk 仍未实现。
- **部署自动化稳定性**：GitHub 远端检查和 SSH 自动部署仍受本机网络/服务器 SSH 握手影响；OrcaTerm 能兜底，但不能替代长期自动部署。
- **资金流与主动买卖流**：稳定 CVD、taker buy/sell、真实资金流数据源仍未完整接入；未稳定前只能显示 partial/waiting。
- **图表与 logo 最终验收**：TradingView 主图、K 线 overlay、真实 token logo、fallback 和多周期交互仍需逐页验收，不能只看 API 有字段。

### P2：后续增强但不能抢 P0/P1 优先级

- 交互式多周期图表、更专业成交量分布、谐波低权重提示、长期状态池胜率排序、自动调度校准、告警历史持久化和提示音细化。
- 这些增强必须复用现有 Evidence / Risk Gate / Review / Frontend Contract，不允许另起一套平行逻辑。

## 当前已落地模块

### 已落地：公开网站基础

- Next.js 项目结构已建立。
- GitHub 仓库已作为代码正本；所有生产改动先进入 GitHub `main`。
- 腾讯云单机 Docker Compose 是当前生产运行主线；生产访问以服务器、Caddy 和 `/api/health` 验收为准。
- Vercel 项目连接 GitHub 仅保留为旧线上回滚路径。
- v0 前端 UI 已作为当前展示事实源接入，首页、Dashboard、Signals、Market、Leaderboard、Review、System、Token Dossier 和宠物小人壳保留 1:1 视觉。
- 后端事实出口已落地：`GET /api/radar/backend-contract` 输出扫描证明、轻扫全市场状态、深扫候选、状态池分配、轮转健康审计、数据质量、v3 覆盖和进化闭环边界；`GET /api/radar/dossier?symbol=SYMBOL` 输出单标的 TradingView 外链、可用周期、v3 关键位/Forward Map、Evidence 和 Journal 样本。
- 前端专用适配出口已落地：`GET /api/frontend/radar-contract`、`GET /api/frontend/token-dossier?symbol=SYMBOL`、`GET /api/frontend/leaderboard?kind=KIND`、`GET /api/frontend/review-contract`、`GET /api/frontend/kline-contract?symbol=SYMBOL&tf=TF`、`GET/POST /api/frontend/journal-contract`。后续前端融合必须优先消费这些契约，避免绕开扫描、分析和复盘主链路形成“两张皮”。
- 2026-06-22 已新增 `GET /api/frontend/kline-contract?symbol=SYMBOL&tf=4h` 和页面侧 `getKlineContractForPage()`：Token 详情页 K 线使用公开 OHLCV/cache 转换后的真实 `t/o/h/l/c/v`，无数据时显示真实空状态，不允许生成模拟 K 线冒充真实行情。
- 2026-06-22 已新增 `GET/POST /api/frontend/journal-contract`：交易日记抽屉写入 `manual_trade` journal event，使用 append-only/tombstone 方式重建前端状态；`rankDelta=0`、`allowedUse=research_only`、`canAutoAdjustWeights=false`，不允许手动日记自动改变实时策略权重。

### 2026-06-23 用户发现的前端真实数据缺口

这些问题必须进入未完成项目，不能被当作单次 UI 反馈处理：

1. **涨幅榜/跌幅榜真实性缺口**：当前前端涨幅榜和跌幅榜与用户对照的真实市场榜单不一致。后续必须明确榜单事实源、排序口径、交易所范围、过滤规则、更新时间和 partial 状态；不能把候选池、轻扫候选或内部排序直接伪装成“全市场真实涨跌幅榜”。
   - 2026-06-23 已完成合同修复：`/api/frontend/leaderboard` 对 `gainers/losers/volume` 优先读取 public market ticker；同一币种跨交易所重复时，`gainers` 取最高 24h 涨幅，`losers` 取最低 24h 涨幅，`volume` 聚合跨交易所 24h 成交额并使用主成交场价格；每行输出 `source/sourceLabel/venueScope/sortKey/rankingScope/updatedAt`。如果 public ticker 不可用，降级为 scanner snapshot 或 light-scan candidate，并在 `reason` 中明确“不能当作真实全市场涨跌幅榜”。
   - 2026-06-23 腾讯服务器生产验证：`/api/frontend/leaderboard?kind=volume/gainers/losers` 均可返回 `live`、50 行 public ticker 结果；榜单行已带来源和排序口径。后续仍需与指定外部参考榜在同一时间戳做抽样对账，确认交易所口径差异。
2. **实时展示边界缺口**：前端需要明确哪些区域可以实时展示，哪些只能准实时或缓存展示。可实时展示的区域必须来自 WebSocket/SSE/Redis 最新快照或明确的 runtime heartbeat；不能用定时动画、跳动数字或旧缓存冒充实时。
   - 2026-06-23 已完成第一轮合同修复：榜单和 K 线面板开始展示 `StatusBadge` 与 `FreshnessTag`；K 线失败、partial、empty 会显示 `DegradeNotice`，不再用假蜡烛填充。
   - 2026-06-23 已完成上游超时护栏：public light scan 默认 4 秒请求超时，K 线 OHLCV 默认 4 秒请求超时；可用 `PUBLIC_LIGHT_SCAN_REQUEST_TIMEOUT_MS` 和 `PUBLIC_OHLCV_REQUEST_TIMEOUT_MS` 调整。上游慢或卡死时必须返回 partial/failed，不允许拖死页面。
3. **K 线图专业度缺口**：当前 K 线已经禁止模拟蜡烛，但展示仍不够专业。后续要补齐多周期切换、真实 OHLCV 新鲜度、成交量、关键位/Forward Map 叠加、支撑压力区、失效线、目标区、数据缺口提示和 TradingView 外链兜底。
   - 2026-06-23 已完成数据源底座修复：公开 OHLCV provider 从单一 Binance 升级为 Binance -> OKX -> Bybit 级联；三者都失败时返回 `public-exchange-ohlcv` typed failure，错误原因可追踪，不允许回落到 mock K 线。后续专业图表层继续补 overlay 和更完整交互。
   - 2026-06-23 已完成 overlay 第一轮修复：`/api/frontend/kline-contract` 在保持 `data` 蜡烛数组兼容的前提下新增 `overlays/overlayStatus/tradingView`；overlay 只来自后端 `SignalBackendDossier.strategyV3`，覆盖 key levels、Forward Map、结构止损和 TP1-TP3，不在前端生成交易判断。`KlineChart` 会用同一画布绘制可选关键线和区间，不改变现有 UI 架构。
   - 2026-06-23 腾讯服务器生产验证：web 容器内部请求 `/api/frontend/kline-contract?symbol=BTC&tf=1h&limit=20` 返回 200 且耗时约 57ms；服务器公网侧 `/api/health` 可经 Caddy 返回。当前本机直连公网 IP 的部分 API curl 仍可能超时，归入生产网络路径和 Caddy/SSE 稳定性观察，不得当作 K 线合同已完全完成。
4. **分析推理报告展示缺口**：前端关于分析、推理、反证、风险门控和交易计划的展示过于简陋，不能体现后端 Evidence / Market Reading / Key Level / Forward Map / Risk Gate / Review 的能力。后续必须把“事实、证据、推理、阻断、计划、复盘反馈”分层展示，并保证每条中文解释可追溯到后端 EvidenceItem 或只读 review 样本。
   - 2026-06-23 已完成第一轮合同修复：Token Dossier 新增 `reportSections`，按事实、支持证据、反证、风险门控、交易计划、复盘边界分层；`evidence` 和 `counter` 都带 `sourceId`，前端展示必须可追溯。
   - 2026-06-23 已完成第二轮合同修复：`reportSections` 继续纳入 v3 关键位、Forward Map 前方反应区、趋势状态机、五类趋势分数、位置/RR、回踩/反抽质量、趋势完整度、Trade Plan 确认清单、分批止盈和“不自动下单/人工复核”边界；Token Dossier 单节展示上限从 4 条提高到 8 条，避免后端分析结果被前端截断得过于简陋。

### 已落地：CoinGlass 数据接入骨架

- `MARKET_DATA_PROVIDER=coinglass` 且 `COINGLASS_API_KEY` 存在时启用 CoinGlass provider。
- `COINGLASS_BASE_ASSETS` 控制扫描资产白名单。
- `COINGLASS_BATCH_SIZE` 控制每轮请求数量。
- `COINGLASS_DAILY_REQUEST_BUDGET` 控制主扫描每日 CoinGlass 请求预算。基于当前 Hobbyist `30 调用/分钟` 边界，默认改为 `3000`，配合 `COINGLASS_BATCH_SIZE=24` 约使用 `2304` 次/日，保留失败重试和手动刷新余量。
- `COINGLASS_MAX_CONCURRENCY` 控制 CoinGlass 主扫描受控并发，默认 `6`，避免 24 个币串行拖慢主扫描，同时低于 30/min 限速。
- `COINGLASS_MINUTE_REQUEST_LIMIT` 控制 CoinGlass 分钟级令牌桶，Hobbyist 默认 `30`；`SCAN_LOCK_TTL_SECONDS` 控制扫描锁过期，默认 `600` 秒。
- 15 分钟 cadence 下分批扫描，降低触发业余会员限速的概率。
- 生产环境默认接入 Binance public futures、OKX SWAP、Bybit linear 24h ticker 作为免费全市场轻扫层；轻扫结果会补充 universe、生成深扫优先级提示并写入 `metadata.lightScan`，但不直接生成交易信号。
- Provider 失败时可以使用缓存并显示 stale 状态。
- 主扫描已加强数据清洗：拒绝 UNKNOWN 交易所、拒绝非 USDT 或报价字段冲突的合约行，并按同币种选择主交易所输出，避免重复信号刷屏。
- 主扫描已输出数据质量审计样本：metadata notes 会记录原始拒绝样本、重复币种聚合组数、主信号选择规则和样本，如 `TIAUSDT selected BINANCE over OKX/BYBIT by exchange_priority_then_volume_oi`。
- 扫描 metadata notes 会显示 raw、clean、primary 数量，以及 unsupported exchange、unsupported quote、duplicate symbol 等过滤原因。
- 扫描 metadata 已新增结构化诊断：`diagnostics.discovery`、`diagnostics.requests`、`diagnostics.v3Coverage` 和 `runtime`，用于排查发现源是否失败、是否启用兜底、CoinGlass 是否空返回、OHLCV/v3 是否缺失、当前结果来自 cron/页面/API/缓存还是新扫描。
- 2026-06-20 已完成 CoinGlass Hobbyist 官方能力梳理并写入蓝图：可用能力包括 supported exchanges/pairs/coins、pairs markets、OI、Funding、Taker Buy/Sell、Long/Short、BTC/ETH ETF、恐惧贪婪、交易所资产/余额；不支持或禁用能力包括 CoinGlass 全市场涨跌幅、CoinGlass 指标接口、News、CVD、NetFlow、Net Position、Altcoin Season、Bitcoin Dominance、Token Unlock/Vesting 和 Liquidation Heatmap/Map/Max Pain。
- 2026-06-20 已完成代码级能力白名单 MVP：`buildDataSourceCapabilityPlan()` 会输出 CoinGlass Hobbyist 支持/不支持/蓝图禁用端点、`30 调用/分钟` 边界、可视化契约和三源职责；`/api/health` 与 `/api/radar/backend-contract` 会暴露同一份 `dataSourceCapabilities`，前端必须显示 `supported_by_hobbyist`、`unsupported_by_hobbyist`、`disabled_by_blueprint`、`partial` 和 `stale`，防止误接不支持接口或静默隐藏。
- 2026-06-21 已完成扫描轮转健康审计 MVP：`planUniverseScan()` 会生成 `rotationAudit`，`/api/health.fullMarketCoverage.rotationAudit` 与 `/api/radar/backend-contract.scanProof.rotationAudit` 会暴露锚点槽、山寨轮转槽、动态优先级槽、长尾探索槽、排队高优先级资产、预计完整轮转时间和饥饿风险。该能力用于根治“只看到 BTC、ETH、少数山寨就误以为只扫这些”的问题。

### 已落地：Postgres 持久化骨架

- `journal_events`：复盘日记、纸面跟踪、拒绝追单、失效记录。
- `scan_archives`：扫描快照、回放 frame、最近扫描对比。
- `v3_forward_map_snapshots`：随扫描归档保存的 v3 Key Level / Forward Map 只读快照，用于复盘验证事前地图是否命中；该表不允许驱动实时排序或自动调权。
- `rank_profiles`：段位、XP、纪律分和复盘行为状态。
- `daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`：每日涨跌幅榜归因复盘样本。
- `DATABASE_DRIVER=neon` 且存在 `DATABASE_URL` 时可创建 Neon SQL client。
- `DATABASE_DRIVER=postgres` 且存在 `DATABASE_URL` / `POSTGRES_URL` 时可创建普通 PostgreSQL SQL client，用于腾讯云单机部署。
- 管理迁移接口受 `CRON_SECRET` 保护。
- 2026-06-19 已统一 admin 执行入口鉴权：迁移、部署检查、每日异动抓取、K 线缓存填充、outcome executor、v3 Forward Map review 和策略权重执行记录都必须使用共享 `isCronRequestAuthorized(..., { requireSecret: true })`，避免各模块手写 Bearer 校验造成权限边界分叉。

### 已落地：初版规则分析引擎

- 初版分析包含：
  - 数据质量
  - 市场环境
  - 结构位置
  - 量价行为
  - 合约衍生品
  - 技术指标层占位
  - 赔率风控
  - 灵活性校验
  - AI 反证复核占位
  - 生命周期复盘占位
- 已接入 BTC/ETH 市场锚点降权逻辑。
- 已避免把环境逆风做成一刀切否定。

### 已落地：TradingView 全周期入口

当前类型与 TradingView interval 支持：

- `1m`
- `5m`
- `15m`
- `30m`
- `1h`
- `4h`
- `1d`
- `1w`

这只是图表入口完整，不代表分析引擎已经完成多周期融合。

### 已落地：多周期 Profile 基础

- 已新增多周期角色表：
  - `1m/5m`：execution。
  - `15m/30m`：anomaly。
  - `1h/4h`：structure。
  - `1d/1w`：regime。
- 已新增 `buildTimeframeProfile()` 和 `summarizeTimeframeAgreement()`。
- 分析引擎已支持 `timeframeProfile` 输入。
- 信号输出已支持：
  - `timeframeProfile`
  - `timeframeAgreement`
  - `timeframeConflicts`
- 多周期支持会加权加分。
- 多周期冲突会降权。
- `1h/4h` 结构冲突会把高分信号压回 `waiting_confirmation`，不会直接一刀切为 `no_trade`。
- BTC/ETH 逆风和多周期冲突可以共同降权，但不能把信号硬杀。
- 基础指标/周期校准已接入：当指标矩阵与 `1h/4h` 结构冲突时额外降权并写入反证 evidence；当指标矩阵与结构同向时只做小幅加权，不能单独制造交易触发。

### 已落地：公开 OHLCV Provider 边界

- 已新增公开 K 线数据类型：
  - `Candle`
  - `OhlcvInterval`
  - `OhlcvRequest`
  - `OhlcvProvider`
  - `OhlcvProviderResult`
- 已新增 Binance public futures K 线 provider 边界。
- 已支持 `1m/5m/15m/30m/1h/4h/1d/1w` 到 Binance interval 的映射。
- 已支持 Binance kline array 到内部 Candle 的规范化。
- 上游返回 500、网络异常或 payload 异常时，OHLCV provider 返回 typed failure，不抛崩扫描流程。
- CoinGlass provider 已保留可选 `ohlcvProvider` 接口。
- 当可选 OHLCV 数据源失败时，CoinGlass 衍生品扫描继续运行，并在信号证据中加入 `OHLCV 数据缺失` 数据质量提示。
- CoinGlass provider 会对受限主候选低频拉取 `1m/5m/15m/30m/1h/4h/1d/1w` candles，默认最多处理 8 个主候选，避免免费套餐阶段出现公开 K 线请求尖峰。
- CoinGlass provider 已能把成功获取的多周期 candles 转换成 `timeframeProfile`，并把多周期支持、冲突、缺失角色写入信号证据。
- 每个周期 OHLCV 获取失败时只记录对应周期缺口，不拖垮 CoinGlass 衍生品扫描；metadata notes 会输出 `ohlcv multi-timeframe` 和 `ohlcv unavailable`，便于线上检查。
- 当可选 OHLCV 数据源成功时，CoinGlass provider 已能把 candles 转换为技术指标证据，并输出多周期指标矩阵摘要；它仍是证据层，不等于完整交互式指标图表。

### 已落地：技术指标证据基础

- 已新增纯 TypeScript 技术指标模块，不依赖外部 TA 库。
- 已支持：
  - EMA
  - RSI
  - ATR
  - Bollinger Band
  - VWAP
  - Swing High/Low
- 已新增 `buildTechnicalEvidence()`，把 K 线转换成 evidence layer。
- 指标证据只进入证据链，不直接触发交易信号。
- 分析引擎已支持 `indicatorEvidence` 输入。
- 策略卡会优先展示部分指标证据；当存在多周期指标矩阵摘要时，会渲染紧凑前端矩阵，方便用户快速看到 K 线侧依据。
- CoinGlass provider 在可选 OHLCV provider 成功时，会把多周期 K 线传入指标证据构建器；当前 `buildTechnicalEvidence()` 会优先选择 `15m/30m/1h/4h/5m/1m/1d/1w` 中样本充足的周期输出基础证据，并额外输出多周期指标矩阵摘要。

### 已落地：合约 Universe Registry 基础

- 已新增合约资产注册表模块。
- 已支持 `BTC`、`BTCUSDT`、`BTC/USDT` 等输入格式规范化。
- 已支持配置资产和已观测合约资产合并去重。
- BTC 和 ETH 会固定作为市场锚点资产，避免山寨币扫描缺少大盘环境。
- 已支持按锚点、配置顺序和观测流动性生成优先级。
- 已支持当前批次扫描计划：
  - scanned assets
  - pending assets
  - batch index
  - next batch
  - requests planned
- 已支持覆盖率报告：
  - total
  - eligible
  - scanned
  - pending
  - skipped
  - coverage percent
- CoinGlass provider 已把 universe coverage 写入 `metadata.coverage`。
- 系统状态面板已显示扫描覆盖摘要。
- 系统健康报告已新增 `scanEconomy`，把 `metadata.quota` 与 `metadata.coverage` 汇总成今日预算、预估请求/轮、预估日请求、剩余额度、批次压缩、层级覆盖、下轮重点和只读护栏。
- 系统状态面板已新增“扫描经济”区块，显示今日预算、剩余额度、请求/轮、批次上限、锚定/核心山寨/热门资产/长尾轮转/跳过覆盖；该区块只复用 scan metadata，不会增加 CoinGlass 请求，也不会从前端触发额外扫描。
- 已新增 Binance public futures `exchangeInfo` 自动发现入口，筛选 `TRADING`、`PERPETUAL`、`USDT` 合约。
- 已新增 OKX public instruments 自动发现入口，筛选 `SWAP`、`linear`、`live`、`USDT` 合约。
- 已新增 Bybit V5 public instruments 自动发现入口，筛选 `linear`、`LinearPerpetual`、`Trading`、`USDT` 合约，并支持 cursor 分页。
- CoinGlass provider 会把 Binance/OKX/Bybit 发现到的 USDT 永续合约并入 universe scan plan；某个交易所发现失败时不会拖垮整个扫描，所有交易所都失败时才回退到配置白名单并在 metadata notes 中显示原因。
- 已支持分层币池：BTC/ETH 为 anchor，配置白名单和高流动性币为 core，中等流动性币为 active，仅被发现但未验证流动性的币先归为 long_tail。
- 已支持长尾低频抽样轮转：旧版 `COINGLASS_BATCH_SIZE=3` 会导致 BTC/ETH 固定后只剩 1 个山寨深扫位，已经判定为不符合“全市场山寨雷达”的根因配置。当前默认改为 `COINGLASS_BATCH_SIZE=24`，BTC/ETH 固定保留，剩余约 22 个槽位用于 core / active / long_tail / dynamic priority 轮转。2026-06-23 根据生产 `long_cycle` 诊断，把 long_tail 默认从每 8 个扫描窗口提高到每 4 个扫描窗口抽样一次；这不增加 CoinGlass 请求数，只提高冷门/新山寨被验证或排除的速度。
- 已支持多交易所覆盖差异分类：`major_three`、`multi_exchange`、`single_exchange`、`unlisted`。
- `metadata.coverage.exchangeCoverage` 会记录每个币种在哪些交易所有 USDT 永续，`exchangeCoverageSummary` 会输出覆盖质量汇总。
- 已支持交易所覆盖钻取：`/api/health.fullMarketCoverage.exchangeDrilldown` 会把三所共振、多所覆盖、单所观察和发现缺口拆成只读行，输出样本、动作建议、过滤样本和“不会触发额外请求”的护栏；健康面板已展示该钻取区块。
- 已支持 API quota 消耗估计：每轮 CoinGlass 请求数、每日 CoinGlass 预估请求数、剩余请求估算、public discovery 预估请求数、预算使用率和状态。
- 已支持扫描预算护栏：当 `COINGLASS_BATCH_SIZE` 超过每日预算允许值时，自动压缩为安全批次；若预算低于 BTC/ETH 锚点最低扫描需求，会标记 `over_budget`，但不破坏锚点扫描。
- 已支持动态优先级基础：universe scan plan 可接收 `priorityHints`，按异常分、历史胜率样本、近期信号、流动性和交易所覆盖质量生成动态分数；动态候选只能占用非 anchor 轮转槽，不能挤掉 BTC/ETH，也不能突破 quota 批次。
- 2026-06-19 新增硬规则：当小批次扫描只剩 1 个非 anchor 轮转槽时，动态优先级不得占用该唯一槽位，必须让 core/long_tail 正常轮转；只有非 anchor 轮转槽大于 1 时，动态优先级才允许使用部分额外容量，避免 BTC/ETH 固定后山寨位长期被单一热门币锁死。
- 已支持高优先级候选可观测：`dynamicPriority` 会输出候选数、可用槽位、已用槽位、选中/排队状态和原因计数；`/api/health.fullMarketCoverage.highPriority` 与健康面板会显示高优先级槽位、选中标的、排队标的和证据来源。该能力只复用扫描 metadata，不增加 CoinGlass 请求量。
- 已支持 repository priority hints 基础：扫描归档 top symbols 提供近期热度，复盘 journal outcome 提供历史有效性，每日异动归因样本提供 learnable 异常热度，v3 trend review / missed review 样本提供漏判复查和冷却复盘压力；默认 CoinGlass provider 创建前会从 repository 读取这些样本并注入 `priorityHints`。
- 2026-06-21 已落地候选池持久化轮换状态 MVP：新增 `scan_asset_states`，记录每个币上次深扫时间、上次轻扫时间、连续跳过次数、1h/24h 深扫次数、当前状态池、层级、动态优先级分、轮换优先级分、是否被动态优先级挤掉、选中/跳过原因和最近深扫时间窗口。该表只用于深扫调度公平性和可观测性，不生成交易信号，不绕过 Evidence / Risk Gate。
- 2026-06-21 已把持久化轮换状态接入 repository priority hints：连续跳过过久的币会生成 `rotation_age` 加分，近期频繁深扫的币会生成 `recent_deep_scan` 降权，防止固定热门币长期霸占深扫名额。该逻辑只影响“谁进入 CoinGlass 深扫队列”，不影响交易方向和策略结论。
- 2026-06-21 已落地信号成熟度分层 MVP：扫描快照会给每条 signal 标注 `maturity`，`metadata.signalMaturity`、`/api/health.signalMaturity` 和 `/api/radar/backend-contract.analysis.signalMaturity` 会输出轻扫标记、深扫候选、证据融合信号和交易计划就绪数量。硬规则：`LIGHT_SCAN_MARK` 只用于后台发现和调度，不进入主信号；`DEEP_SCAN_CANDIDATE` 只能进入“验证中/候选”区域；只有 `EVIDENCE_SIGNAL` 和 `TRADE_PLAN_READY` 能进入主信号区；只有 `TRADE_PLAN_READY` 可以附带结构化交易计划。
- 2026-06-21 已落地多周期硬门控 MVP：`1h/4h` 结构压力或冲突未解除时，低周期多头只能输出 `WAIT_HIGH_TIMEFRAME_BREAK`，不得生成可执行交易计划；`1d/1w` 同时冲突时只能输出 `WATCH_ONLY`，不得用 15m/30m 强势覆盖大周期风险。扫描信号会保留 `timeframeGate`，扫描回放、单币 dossier 和 `/api/radar/backend-contract.analysis.timeframeGate` 会输出被拦截标的、冲突周期和拦截原因。该门控优先于信号成熟度晋级，任何被门控拦截的信号不能升级为 `TRADE_PLAN_READY`。
- 2026-06-21 已落地轻扫候选防追涨排序 MVP：public light scan 的 24h 涨跌幅贡献已封顶，超过 15% 且贴近 24h 极值的延展行情会打上 `overextended_move_capped` 并降权；低波动、成交额足够、靠近 24h 边缘的压缩候选会打上 `compression_priority` 并提高优先级。该规则只影响“谁进入 CoinGlass 深扫”，不直接生成交易方向；真实 15m WebSocket 成交量 z-score 仍属于后续 P2，不得把当前 REST 轻扫冒充为秒级/分钟级流式检测。
- 2026-06-21 已落地 CoinGlass 请求 pacing MVP，并在 2026-06-23 生产复测后把默认值从 `500ms` 加固到 `2200ms`。原因是 Hobbyist 为 `30 调用/分钟`，`500ms` 对 24 个候选会形成过高瞬时速率并触发 `429 Too Many Requests`。主深扫、能力探针和 daily mover 的 CoinGlass 请求必须按间隔排队；该 pacing 只服务稳定性，不提高策略信号等级，也不绕过每日预算、分钟限速、缓存和失败降级。
- 2026-06-21 已落地复盘命中标准 MVP：outcome tracker 改为按信号周期使用验证窗口，`15m/30m` 等短周期默认看 `4h`，`1h` 默认看 `24h`，`4h+` 默认看 `4d`；生命周期事件会写入 `outcomeMetrics`，包括 entry、stop、TP1、MFE、MAE、评估 K 线数量和验证窗口。只有 `EVIDENCE_SIGNAL` 与 `TRADE_PLAN_READY` 的 outcome 样本进入人工校准统计；`LIGHT_SCAN_MARK`、`DEEP_SCAN_CANDIDATE` 和缺成熟度旧样本不能污染胜率。
- 2026-06-21 已落地 WebSocket 轻扫常驻 worker MVP：新增 `deploy/workers/ws-light-scan-worker.mjs`，支持 Binance USD-M 全市场 ticker、OKX USDT SWAP ticker、Bybit linear USDT ticker，事件进入 15m 滑动窗口后生成成交额 z-score、价格脉冲、压缩放量候选，并按 `WS_LIGHT_SCAN_SNAPSHOT_INTERVAL_SECONDS` 写入 Redis 快照。主扫描配置层会优先读取 Redis WebSocket 快照，快照缺失或过期时回退到 REST public light scan。该能力只负责全市场候选发现和 CoinGlass 深扫排序，不直接生成 EvidenceItem、交易方向或交易计划。
- 2026-06-21 已落地 BTC.D / TOTAL2 / TOTAL3 宏观锚点 MVP：Macro Weather 支持 `altcoinMacro` 输入，计算 BTC Dominance 趋势、TOTAL2、TOTAL3、24h 变化和山寨环境顺逆风。该锚点只解释山寨资金环境，BTC.D 上行时提高风险提示，BTC.D 下行且 TOTAL2/TOTAL3 扩张时解释顺风；不得降低 `3:1` 最低赔率，不得直接生成买卖方向。
- CoinGlass provider 已在 metadata notes 中输出每个 discovery source、tiered universe、exchange coverage、quota、repository priority hints、dynamic priority 和 tier policy，便于线上检查当前币池结构。

### 已落地：AI 反证复核边界

- 已新增模型无关的 AI 复核模块。
- 已支持 OpenAI-compatible chat completions 请求格式。
- 已支持 `AI_REVIEW_ENABLED`、`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`、`AI_REVIEW_MAX_SIGNALS`、`AI_REVIEW_MAX_PROMPT_CHARS`。
- AI 输入会被白名单化，只包含结构化 signal、evidence 和 snapshot metadata。
- Prompt 明确要求先找反证，再给结论。
- AI 输出会解析为：
  - 事实
  - 推理
  - 判断
  - 策略
  - 失败路径
  - 不确定性
- 缺少 API Key、未启用、模型请求失败、解析失败或超过 prompt budget 时，系统会回落到 disabled/fallback 状态，不影响规则引擎和页面可用性。
- Snapshot builder 已把 AI 复核状态挂到每个信号。
- AI 复核受信号成熟度门控：只复核 `EVIDENCE_SIGNAL` 和 `TRADE_PLAN_READY`，不会把模型预算花在 `LIGHT_SCAN_MARK` 或 `DEEP_SCAN_CANDIDATE` 上。
- 策略卡已显示 AI 反证状态、核心反证、判断和失败路径。

## 当前未完整落地模块

### 未完整落地：真正的多周期融合分析

当前已经完成多周期 Profile 基础、分析引擎接入口、公开 OHLCV provider 边界，以及受限主候选的 `1m/5m/15m/30m/1h/4h/1d/1w` candles 接入。CoinGlass provider 已能把这些 candles 同时喂给 technical indicators 和 timeframe profile。

但这仍不等于完整多周期融合：当前只覆盖受限主候选，指标矩阵仍是摘要型 evidence，基础校准也只是规则级加权/降权。后续必须补齐交互式 UI 展示、复盘/回测权重校验和更细的候选分层策略，才能算完整专业闭环。

多周期角色必须固定如下：

| 周期 | 角色 | 用途 |
| --- | --- | --- |
| `1m` | 执行噪声层 | 只看短线触发、盘口冲击、是否过热，不单独给方向 |
| `5m` | 执行确认层 | 判断触发是否连续、是否假突破、是否急拉追高 |
| `15m` | 异动发现层 | 主扫描周期之一，用于发现量价、OI、Funding、成交主动性和杠杆风险变化 |
| `30m` | 异动稳定层 | 过滤 15m 假信号，判断是否开始形成结构 |
| `1h` | 结构判断层 | 判断趋势、箱体、关键位、失败路径 |
| `4h` | 大结构层 | 判断行情是否处于关键供需、突破边缘或中部噪音 |
| `1d` | 环境边界层 | 判断大方向、波动阶段、是否处于大级别风险区 |
| `1w` | 宏观边界层 | 只用于大背景，不用于短线触发 |

核心规则：低周期负责触发，高周期负责边界，中周期负责发现异动。任何单周期都不能独立决定交易。已新增硬门控：`1h/4h` 未突破关键压力时，低周期异动只能等待高周期突破或回踩确认；`1d/1w` 双冲突时，多头降级为只观察。

### 部分落地：全市场合约覆盖

当前已经有 universe registry、覆盖率、锚点固定、轮转扫描计划、主扫描质量过滤、Binance/OKX/Bybit public USDT 永续自动发现、分层币池、长尾低频轮转、多交易所覆盖差异、API quota 护栏、动态优先级基础、repository priority hints、持久化轮换状态、信号成熟度分层、多周期硬门控、轻扫防追涨排序、CoinGlass 请求 pacing、统一 outcome 验证窗口、WebSocket 轻扫常驻 worker 和 BTC.D/TOTAL2/TOTAL3 宏观锚点。资产池已不只依赖 `COINGLASS_BASE_ASSETS`；Phase 3.10 已把全市场覆盖深度、当前批次、预计轮转周期、三所覆盖质量、已扫/待轮转样本和只读边界接入 `/api/health` 与健康面板；Phase 3.11 已把 raw / clean / primary、UNKNOWN、非 USDT、重复币种、流动性门槛、过滤样本和质量分结构化为 `marketDataQuality`；Phase 3.12 已把高优先级候选槽位、选中/排队状态和原因计数接入扫描 metadata、`/api/health` 与健康面板；Phase 3.13 已把三所共振、多所覆盖、单所观察、发现缺口、过滤样本和覆盖动作接入 `/api/health.fullMarketCoverage.exchangeDrilldown` 与健康面板；Phase 3.14 已把 CoinGlass 原始拒绝样本、重复币种聚合组、主信号选择规则和聚合样本接入 `marketDataQuality.primarySelection` / `rejectedRowSamples` 与健康面板；Phase 3.15 已把状态池调度 MVP、深扫容量证明、复活观察、冷门探索和下一批样本接入 `coverage.statePool` 与健康面板；Phase 3.16 已把每日异动宽覆盖从固定少量币扩展到配置资产 + 公开合约 universe 低频轮转；Phase 3.17 已把 v2/v3 只读晋级桥接入状态池，解释作战、观察、冷却和赔率/冲突阻断；Phase 3.18 已把扫描证明、轻扫/深扫、状态池分配、数据质量和 v3 覆盖合并为 `/api/radar/backend-contract`，作为后续 UI 重建和运维诊断的统一事实出口；Phase 3.19 已把二段深扫分配证明接入扫描计划和后端契约，明确锚点、动态优先级、常规轮转、冷门探索保底和排队优先级资产；Phase 3.20 已把公共轻扫升级为 Binance+OKX 组合轻扫，并在后端契约加入 `sourceAudit`，展示 public discovery、public light scan 和 CoinGlass deep scan 三层状态；Phase 3.21 已把扫描轮转健康审计接入 `coverage.rotationAudit`、`/api/health.fullMarketCoverage.rotationAudit` 和 `/api/radar/backend-contract.scanProof.rotationAudit`，用于检查非锚点深扫槽、动态优先级挤占、长尾探索保底、排队高优先级资产和完整轮转周期；Phase 3.22 已新增 `scan_asset_states` 持久化轮换账本并接入下一轮 priority hints，用 `rotation_age` 与 `recent_deep_scan` 防止固定币长期霸占深扫位；Phase 3.23 已新增 `signalMaturity`，把轻扫标记、深扫候选、证据信号和交易计划就绪分开，防止轻扫标记被误展示成交易信号；Phase 3.24 已新增 `timeframeGate`，把 `1h/4h` 结构冲突和 `1d/1w` 双冲突做成交易计划前的硬拦截；Phase 3.25 已新增 public light scan 防追涨排序，把 24h 涨跌幅封顶、延展行情降权和压缩候选加权接入 CoinGlass 深扫候选入口；Phase 3.26 已新增 CoinGlass pacing、outcome 量化验证窗口、WebSocket 轻扫滑动窗口核心和 BTC.D/TOTAL2/TOTAL3 宏观锚点；Phase 3.27 已新增真实 WebSocket 轻扫常驻 worker、Redis 快照和扫描入口回退链路；Phase 3.28 已把 Binance/OKX/Bybit WebSocket 轻扫改为交易所元数据允许列表过滤，Bybit 明确拒绝 stock/commodity，Binance 使用 `underlyingType=COIN` 允许列表，避免股票、商品、预市场和同名非加密合约污染全市场山寨雷达。当前仍未完成长期状态池胜率排序、依赖更多 outcome 样本的自动调度校准，以及 WebSocket worker 生产运行后的长期覆盖率观察。

后续需要：

- Binance/OKX/Bybit 支持合约交易币种列表已具备自动发现基础。
- 多交易所覆盖状态已具备基础分类和 metadata 输出。
- API quota 消耗估计和批次护栏已具备基础实现。
- 将主扫描的质量分类器复用到每日异动、全市场发现和后续扩展池。
- 低优先级币种更长期轮转扫描已具备基础策略，动态优先级接口和 repository hints 已具备，后续需要在 outcome executor 完成后继续提高历史胜率样本质量。
- 高优先级候选的 quota-safe 插队和页面解释已具备；Phase 3.19 已加二段深扫分配证明：当轮转名额充足且存在长尾资产时，动态优先级不能吃光全部轮转名额，系统会保留冷门探索位。
- 二段深扫只分配本轮 CoinGlass 深扫名额，不代表最终淘汰。排队优先级资产必须在契约中可见，继续留在 priority queue、rotation pool、revive watch 或 cold exploration pool。
- 不同交易所同一币种的覆盖数量、UNKNOWN、非 USDT、重复币种、基础过滤原因、原始拒绝样本、主信号聚合原因和覆盖动作已在健康面板展示。
- 状态池调度、复活观察、冷门探索和深扫容量证明已具备 MVP；后续重点是用更多 outcome、daily mover 和 forward-map review 样本提升状态池排序质量，而不是单纯提高批次数量。
- `/api/radar/backend-contract` 是扫描后端契约：它只读复用已有 snapshot 和 health，不新增 CoinGlass 请求，不写数据库，不生成交易信号。前端若空间有限，必须用分页、滚动、筛选或数量提示承接候选，不允许静默隐藏候选导致“扫到了但看不见”。
- `scanProof.rotationAudit` 是“扫描有没有卡死在少数币”的硬证明。前端必须展示锚点槽、山寨轮转槽、动态优先级槽、长尾探索槽、排队候选、预计完整轮转时间和饥饿风险；不允许只展示本轮少数深扫币，导致用户误判系统没有全市场轻扫。
- `analysis.signalMaturity` 是“这条信息成熟到哪一步”的硬证明。前端主信号区必须只读取 `mainSignalSymbols` 或 maturity 为 `EVIDENCE_SIGNAL / TRADE_PLAN_READY` 的信号；`DEEP_SCAN_CANDIDATE` 必须放进候选验证区并标注“验证中”；`LIGHT_SCAN_MARK` 只能用于覆盖证明、调度说明和数量统计，不得做成交易卡片。

### 未完整落地：合法外部事件情报层

当前只完成了蓝图规则和数据源分档，尚未实现业务代码。该层后续必须按“先安全、再稳定、再有交易意义”的顺序接入，不能把网页爬虫当作绕过数据权限的工具。

必须新增或复用的对象：

- `RawSource`：合法来源注册，记录来源类型、授权方式、robots/terms 状态、频率限制和能否保存内容。
- `SourceFetchRun`：每次采集运行记录，保存请求时间、结果、错误、行数、延迟和是否 partial。
- `ExternalEvent`：标准化事件，如 `LISTING_EVENT`、`DELIST_RISK`、`DEX_VOLUME_SPIKE`、`LIQUIDITY_CHANGE`、`WHALE_FLOW`、`UNLOCK_EVENT`、`SECURITY_RISK`、`NARRATIVE_CATALYST`。
- `EvidenceItem / RiskEvent` 映射：所有事件必须先转成证据或风险背景，再进入 Evidence Fusion / Strategy Engine / Risk Gate / Review。

未完成采集器：

- DEX Screener collector：新 pair、新币、DEX 成交量、流动性变化、买卖压力、profile/logo。
- Exchange Announcement collector：Binance/OKX/Bybit 上币、上合约、下架、维护、暂停充提、杠杆调整和规则变化。
- Token Identity collector：CoinGecko、Token Lists、Trust Wallet Assets 等 logo、名称、链、合约地址和同名币去污染。
- Macro/On-chain low-frequency collector：DefiLlama、CoinGecko global、区块浏览器 API 的稳定币、TVL、BTC.D/TOTAL2/TOTAL3、巨鲸/供应/LP 风险。
- Project/Public Risk collector：项目官方 RSS/GitHub release、安全公告和已确认风险事件。

验收标准：

- 不接第四档高风险爬虫，不爬 CoinGlass 网页清算图，不爬 TradingView/X/Telegram/Discord 非授权内容，不保存付费全文或个人隐私。
- 所有事件在前端必须显示来源、时间、新鲜度、可信度和是否只做风险/催化剂背景。
- 事件不能直接生成交易计划；没有结构、量能、衍生品、RR 和 Risk Gate 支持时，只能输出观察、等待或风险提示。
- 当 CoinGlass 深扫端点返回套餐限制、401、空结果或全部请求失败时，前端不得空白，也不得把轻扫候选包装成策略信号。正确做法是把 public light scan Top 候选映射为 `DEEP_SCAN_CANDIDATE / 验证中`，明确 `whyBlocked=等待深扫、结构、Evidence/Risk Gate`，不展示入场、止损、目标位和 AI 复核结论。
- 前端合同里的 `scanProof.coverage` 只允许表示“全市场轻扫覆盖率”，不能再用 CoinGlass 深扫比例冒充全市场覆盖；CoinGlass 深扫比例必须单独走 `scanProof.deepCoverage`、`deepScanned`、`awaitingDeepScan` 和 scan stability 文案。页面允许同时展示“轻扫已覆盖全市场”和“深扫因套餐/配额/端点返回而 partial”，两者不能混为一个数字。
- `analysis.timeframeGate` 是“为什么这条信号不能交易”的硬证明。前端必须把 `WAIT_HIGH_TIMEFRAME_BREAK` 显示为等待高周期突破/回踩确认，把 `WATCH_ONLY` 显示为只观察，不允许把被硬门控拦截的信号包装成可执行计划。

### 部分落地：技术指标引擎

当前已具备基础技术指标计算，并已把受限主候选的多周期 candles 传入指标证据构建器。当前输出已经包含多周期指标矩阵摘要、MACD 动能和近似成交量分布，策略卡已能展示紧凑前端指标矩阵，分析引擎已能对指标矩阵与 `1h/4h` 结构 profile 做基础加权/降权校验；但它仍是规则级 evidence 摘要，不是完整交互式指标图表、专业成交量分布系统或回测权重闭环。后续必须补齐结构确认能力、权重回测校准和更专业的成交量分布模型。

已落地第一批指标：

- EMA：趋势方向和均线结构。
- RSI：强弱和过热。
- ATR：波动率和止损距离。
- Bollinger Band：压缩与突破。
- VWAP：日内资金均价。
- Swing High/Low：结构高低点。
- MACD：动能切换。
- 近似 Volume Profile：用 K 线 close price bucket 估算高成交量价格节点和价值区。
- 多周期指标矩阵摘要：按周期记录 EMA、RSI、MACD 和成交量节点状态，只做证据摘要。
- 基础指标/周期权重校准：矩阵与结构 profile 同向时小幅加权，冲突时额外降权并生成反证 evidence。

仍未完整落地：

- 更专业的 Volume Profile：需要更细成交分布或盘口/逐笔数据支持。
- 完整交互式多周期指标图表：在当前紧凑矩阵基础上，继续补齐同币种指标趋势、周期切换和更细粒度证据查看。
- 完整回测权重校准：当前只有规则级基础校准，仍缺历史命中率、策略版本和复盘样本反向修正。

指标不能直接变成买卖信号，只能变成证据层。

### 已部分落地：盘面结构与形态库

盘面结构是后续分析能力的核心增强方向。系统不能只依赖 CoinGlass 数据、指标矩阵或多周期涨跌幅；必须识别真实盘面结构、关键位、形态位置和失效路径，尤其面向山寨币爆发前的布局机会。

2026-06-17 已新增 **Evidence-Based Altcoin Strategy Engine v2** 规格文档，后续进入 Phase 4C/4D 前必须先读取：

- `docs/CORE_STRATEGY_SPEC.md`
- `docs/EVIDENCE_ENGINE_SPEC.md`
- `docs/INDICATOR_RULES.md`
- `docs/DATA_RULES.md`
- `docs/GOLDEN_CASES.md`

v2 硬边界：不接入清算热力图，不构建清算区模块，不把潜在清算区作为目标位、入场位、止损位或方向依据；常规杠杆风险统计最多作为风险背景，不能单独进入方向判断。

后续新增 **Market Structure Engine / Pattern Library** 时必须遵守：

- 先结构，后指标；先位置，后方向；先盈亏比，后形态名称。
- 结构和关键位优先级高于指标，指标只做确认或反证，不能单独触发交易结论。
- 形态必须绑定位置和确认条件；同一个 K 线形态在箱体中部无效，在前高/前低/sweep 后才有意义。
- 复杂形态不能平权参与主评分，避免系统“会很多但互相矛盾”。
- 任何形态输出都必须带 `requiredConfirmation`、`invalidation`、`danger/noChase`，不能只输出看多/看空。

形态库优先级：

| 等级 | 类型 | 用途 | 评分边界 |
| --- | --- | --- | --- |
| A | HH/HL、LH/LL、前高前低、箱体、突破/跌破、sweep、假突破 | 判断市场结构、关键位和失败路径 | 可进入主评分 |
| A | 压缩三角、收敛、横盘吸筹/派发、区间上下沿 | 判断爆发前结构 | 可进入主评分 |
| B | 双顶、双底、头肩顶、头肩底、圆弧顶/底 | 判断反转风险 | 需要颈线/关键位确认 |
| B | 旗形、楔形、通道、杯柄、平台整理 | 判断趋势延续或失败 | 半主评分，必须结合量能和位置 |
| C | Fibonacci 回撤、扩展、黄金分割区 | 判断回撤位置、目标区和盈亏比 | 辅助评分 |
| C | Gartley、Bat、Crab、Butterfly 等谐波 | 判断潜在反转区 | 只做提示，不做主触发 |
| C | 吞没、Pin Bar、锤子线、射击之星、十字星等 K 线组合 | 判断短线触发 | 只在关键位附近有效 |
| D | 过度主观、低样本、低胜率形态 | 观察和教学 | 不进主评分 |

当前落地状态：

- Market Reading MVP 已识别 swing high/low、HH/HL、LH/LL、BOS、CHoCH、假突破和假跌破，并把结果作为 `marketReadings` 接入 v3 趋势状态机。
- Key Level / Forward Map 已从既有 OHLCV 生成只读关键位、失效位和前方位，不新增 CoinGlass 请求。
- Pattern Library 已从仅双顶/双底扩展到双顶、双底、上升三角、下降三角、牛旗、熊旗、头肩顶、反头肩和 Fibonacci 回撤。
- Pattern Library 固定 `maxWeightPercent=10`、`hasTradeSignal=false`、`canMutateLiveRanking=false`，只作为低权重上下文，不能覆盖 Market Reading、Key Level、位置/RR、回踩/反抽、趋势完整度或 Risk Gate。
- 后端会输出中文形态名、置信度、权重上限、第一条证据和失效提示；后续新前端只能通过 API 只读展示这些结构事实。
- 谐波形态暂不实现自动识别。Gartley、Bat、Crab、Butterfly 等需要更严格 swing 点质量和历史样本验证，当前只保留为后续低权重提示项，避免“会很多但互相矛盾”。

建议后续阶段拆分：

1. **Market Structure Engine**：识别 swing high/low、HH/HL/LH/LL、趋势/箱体/中部噪音、breakout/breakdown/sweep/假突破。
2. **Key Level Engine**：识别前高、前低、区间上下沿、结构颈线、供需区、触发位、失效位和目标区。
3. **Pattern Library 扩展**：后续继续补楔形、通道、杯柄和更精确的箱体阶段，但必须先进入只读证据，不直接驱动交易结论。
4. **Fibonacci And Harmonic 辅助层**：Fibonacci 回撤已完成只读位置辅助；扩展、目标投射和谐波只作为位置、目标和潜在反转区提示，不能单独生成交易信号。
5. **结构复盘校准**：把每类结构形态的命中、失败、追高、假突破和失效样本写入复盘统计，再决定是否调整权重。

全市场扫描与盘面结构的关系：

- 全市场先做轻扫描：交易所覆盖、流动性、价格/量能变化、OI/funding 可用字段、每日异动和动态优先级。
- 轻扫描筛出候选后，再对候选做重分析：多周期 K 线、Market Structure、Pattern Library、指标矩阵和策略计划。
- 高优先级候选提高频率，长尾币低频轮转；每日异动用于补漏和提权，不直接制造交易信号。
- 这样才能实现“全市场覆盖 + 重点候选深度分析”，同时不打爆 CoinGlass 业余会员 API。

### 未完整落地：AI 复核链路

当前已经完成 AI 复核边界、输入白名单、OpenAI-compatible 请求、失败降级、预算护栏、UI 状态展示和生产边界字段；但生产环境还没有实际配置模型 API，也没有做多模型对照、每日成本统计和长期复盘校准。

AI 复核必须遵守：

- 输入只能来自结构化数据和规则引擎输出。
- AI 必须先找反证，再给结论。
- AI 不能编造链上数据、新闻或未接入的数据源。
- AI 输出必须标明：
  - 事实
  - 推理
  - 判断
  - 策略
  - 失败路径
  - 不确定性
- AI 只能做复核和解释，不做最终单点裁决。
- 每条 `aiReview` 必须带 `boundary`，明确 `counter_evidence_review_only`、不能覆盖规则引擎、不能改 live ranking、不能生成交易信号、不能自动执行。
- AI 可以输出不确定性和复盘校准 tag，但只能进入人工复盘，不能自动调权。

可接入模型：

- OpenAI GPT 系列。
- DeepSeek 系列。
- 其它兼容 OpenAI API 格式的模型。

模型选择原则：

- 市场分析不是刚好能用就行，优先稳定、推理、可控、可审计。
- 成本必须有 budget guard。
- 失败时系统必须回落到规则引擎，不允许页面崩溃。
- 超过 `AI_REVIEW_MAX_PROMPT_CHARS` 或 `AI_REVIEW_MAX_SIGNALS` 时必须返回可见 disabled/fallback 边界，不能静默缺失。

仍未完整落地：

- 生产环境真实模型配置。
- OpenAI/DeepSeek 多模型切换对照。
- 每日/每轮成本统计。
- AI 复核结果进入后续复盘评分。
- AI 复核质量的长期自我校准。

### 部分落地：复盘自我提升

当前已有日记、段位和信号生命周期复盘基础层：

- 新信号进入跟踪/纸面跟踪时，会自动挂上 `1h / 4h / 24h` 复查节点。
- `outcome-tracker` 可以根据后续 K 线判断：
  - 首目标先到：记为 `partial_win`。
  - 触发前先失效：记为 `saved`，奖励纪律。
  - 触发后先失效：记为 `loss`。
  - 24h 后仍未触发：记为 `expired`，不奖励段位。
- 复盘结果会进入 journal payload，并通过 `outcome_status` 支持数据库查询。
- 日记面板会展示当前 outcome、下一次复查时间、触发/失效/首目标命中状态和 lesson tags。
- `runOutcomeExecutor()` 已能读取数据库中的待复查 tracking journal，按 checkpoint 使用公开 OHLCV 评估信号生命周期，并写回 lifecycle journal event。
- `POST /api/admin/outcomes/run` 已通过 `CRON_SECRET` 保护；当前腾讯云单机生产主线由 `signal-worker` 低频触发 outcome executor。`.github/workflows/chuan-outcome-executor.yml` 仅保留为 Vercel 回滚路径的外部 cron 方案，不再作为主生产执行方式。
- outcome executor 使用公开 OHLCV provider，不占用 CoinGlass 请求预算；输出保持 `allowedUse: "research_only"` 和 `canAutoAdjustWeights: false`。
- outcome executor 已具备基础重复执行保护：同一 signal 只要已经存在 closed lifecycle outcome，旧 tracking entry 不会再次触发公开 K 线请求。
- 系统健康报告和系统状态面板已展示自动复盘基础状态：覆盖率、待复查数、到期数、最近写回时间、最近执行批次、写回数、跳过数、失败数、失败原因摘要、样本质量分层、手动校准准入门槛、只读校准流、阈值层、人工回滚计划和研究用途边界。
- outcome executor 每次运行会写入一条 `outcome_executor_run` journal 审计事件，记录扫描数、到期数、写回数、跳过数、失败数、拉取 K 线数量、失败摘要和跳过原因分层；该事件不参与 XP、tracking 计数或自动调权。
- 日记面板已能把 `outcome_executor_run` 展示为只读执行批次，显示扫描、到期、写回、跳过、失败、K 线数量和跳过原因，不把它包装成交易复盘。
- outcome 样本准入基础已落地：系统会把已关闭 outcome 样本按有效、反证、过期和待复查计数，输出 `ready / collecting / blocked` 准入状态、准入分、阻断项和下一步建议；该输出只服务人工校准和回滚复核，`canAutoAdjustWeights` 固定为 `false`。
- outcome 只读校准流基础已落地：`buildOutcomeCalibrationFlow()` 会从现有 `journal_events` 汇总样本准入、`calibration_review`、`strategy_confirmation` 和确认后回滚观察，输出 `collecting_samples / awaiting_manual_confirmation / confirmed_observation / rollback_watch / blocked`，健康面板显示校准流、人工确认、回滚观察、待校准数量、阻断解释、样本分布、最近样本明细、阈值层和人工回滚计划；该输出只用于人工确认和回滚边界，不写策略权重。
- 只读策略权重回测校准 MVP 已落地：`buildStrategyWeightCalibrationReport()` 会从现有 `journal_events` 的 `calibration_review` 和 `strategy_confirmation` 汇总人工候选，输出升权候选、降权候选、隔离候选和继续观察候选；系统健康面板展示候选分布和明细，但 `allowedUse` 固定为 `research_only`，`canAutoAdjustWeights` 固定为 `false`。
- 只读策略权重变更审计 MVP 已落地：`buildStrategyWeightChangeAuditReport()` 会从策略权重回测校准候选生成只读人工审计包，区分可审计、需回滚验证、样本不足、待确认和隔离阻断；系统健康面板展示审计候选、可审计、需回滚和阻断审计数量，但 `allowedUse` 固定为 `research_only`，`canAutoAdjustWeights` 和 `canExecuteWeightChange` 固定为 `false`，不执行真实权重变更。
- 影子策略权重层已落地：`buildStrategyWeightShadowReport()` 从已审批的 `strategy_weight_change_execution` journal 事件生成当前权重、建议影子权重和差异，只读展示在系统健康面板；`allowedUse` 固定为 `research_only`，`canAutoAdjustWeights` 和 `canAffectLiveSignals` 固定为 `false`，不影响真实扫描、真实评分或真实策略权重。
- 影子表现评估已落地：`buildStrategyWeightShadowEvaluationReport()` 只读取审批后的 `calibration_review`、`strategy_confirmation` 和人工执行记录，输出 `insufficient_samples / improving / mixed / rollback_watch / blocked`、样本数、有效/反证比例和回滚压力；系统健康面板展示“影子表现”，但该层只读、不新增表、不触发外部请求、不执行真实权重。
- 真实权重启用门禁已落地：`buildStrategyWeightActivationGate()` 会读取影子权重、影子表现和人工执行记录，按 `STRATEGY_WEIGHT_ACTIVATION_MODE=disabled|shadow|manual` 输出 `active_disabled_by_config / blocked / eligible_for_manual_activation`、启用模式、通过项、阻断项、样本门槛和下一步；默认 `disabled`，系统健康面板展示“真实权重门禁”，但 `canAffectLiveSignals` 与 `canWriteRuleWeights` 固定为 `false`，不接入扫描引擎。
- 真实权重启用安全摘要已落地：真实权重门禁新增 `safetySummary`，把启用阻断项、审批后最低样本数、样本不足 tag、回滚高压/阻断数量和回滚样本 tag 单独上屏；该摘要只用于人工复核，不会自动写权重、不改变 live ranking。
- 人工权重变更执行记录写入入口和只读 registry 已落地：`POST /api/admin/strategy-weights/executions/record` 通过 `CRON_SECRET` 保护，允许在系统健康面板用管理密钥把人工审批状态、版本标签、回滚触发器和观察窗口写入 `strategy_weight_change_execution` journal 事件；`buildStrategyWeightChangeExecutionReport()` 会把这些记录汇总到 `/api/health`，系统健康面板展示执行记录、已记录、待审批、回滚/阻断和不可写权重边界。该层只保存审计账本，`canAutoAdjustWeights`、`canExecuteWeightChange` 和 `canWriteRuleWeights` 固定为 `false`，不让记录自动生效到规则权重。
- 规则调整已有基础函数：
  - 有效标签进入 promote。
  - 重复失败标签进入 demote。
  - 未充分验证标签留在 experiment。

后续需要：

- 继续把只读阈值层、权重回测候选、权重变更审计、执行记录 registry、影子表现和启用门禁接入更长周期、更大规模的真实样本，但不能绕过人工确认直接自动调权。
- 继续补齐真实权重接入扫描引擎的隔离层和真实回滚验证；人工执行记录入口与启用门禁仍只能保存/解释审批账本，不能绕过隔离层直接改权重。
- 阈值校准：
  - 哪些因子经常误报就降权。
  - 哪些因子连续有效就升权。
  - 未验证规则进入实验区。
  - 坏规则从决策逻辑删除，只保留反面样本。

### 部分落地：每日异动归因复盘

每日异动归因复盘用于把合约涨幅榜和跌幅榜转成可学习样本，回答“为什么涨跌、涨跌前发生了什么、雷达是否提前发现、漏判原因是什么”。

当前已经完成：

- 纯逻辑底座：`DailyMover`、`PreMoveWindow`、`MoverAttribution`、`RadarMoverReview`、`DailyMoverSnapshot`。
- CoinGlass 榜单行适配器：可把合约 market rows 标准化为 `DailyMoverSnapshot`。
- CoinGlass 每日异动抓取服务：按配置资产低频请求榜单、构建快照并写入 repository。
- 受保护 API 入口：`POST /api/admin/daily-movers/ingest`，必须带 `Authorization: Bearer <CRON_SECRET>`。
- 公开只读 API：`GET /api/daily-movers` 可读取最新样本、按 `id` 查询历史样本，并输出轻量摘要列表。
- 腾讯云单机生产主线由 `coinglass-worker` / 后台 Worker 低频触发每日异动归因；`.github/workflows/chuan-daily-movers.yml` 仅保留为 Vercel 回滚路径外部 cron。
- 持久化 schema：`daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`。
- repository 写入和查询：`addDailyMoverSnapshot()`、`listDailyMoverSnapshots()`、`getDailyMoverSnapshot()`。
- 公开只读能力入口：每日异动能力保留为 Review / Evolution / 功能抽屉 / Signal Dossier 的研究入口；完整 `后续新前端` 不再常驻首页右侧信息栈，避免首页重新变成全功能堆叠。
- 只读关联摘要：`GET /api/daily-movers` 会为选中样本生成 `selectedCorrelation`，把每日异动 review 与最近扫描归档、扫描 replay signal、复盘日记做 bounded 关联，输出 `caught_with_journal`、`caught_unreviewed`、`missed_with_evidence`、`not_learnable`、`unlinked` 等状态。
- 关联摘要：每日异动关联状态继续作为复盘/进化层能力，后续应在二级页面或信号档案中展示扫描关联、日记关联、校准候选数量，以及命中已复盘、命中待复盘、漏判有证据、不可学习等状态。
- 历史样本和单样本详情：完整历史样本切换、选中样本详情和“为什么漏判/下一步复核”的只读说明，应放在 Review/Evolution 二级页面或抽屉中，不回到首页常驻。
- v3 漏判复盘 MVP：`GET /api/daily-movers` 会把选中每日异动样本中的漏判样本与已保存的 `v3_forward_map_snapshots` 做只读关联，生成 `missed_altcoin_review`；前端展示必须强调事前 v3 地图证据、证据 id 数量和不改权重边界。该层不新增 CoinGlass 请求、不新增写入、不自动调权。
- 只读规则校准建议：`missed_with_evidence` 已聚合为校准候选建议，并在 UI 中明确“不自动改权重”。
- 校准候选入复盘队列：受保护复盘入口可把校准候选以 `calibration_review` 写入 `journal_events`；该事件进入跟踪队列、记录 `calibrationTag` 和样本币种，但 rank 分数保持 0，不能自动调整策略权重。
- 只读校准反馈趋势：`GET /api/daily-movers` 会从 bounded `journal_events` 中汇总 `calibration_review`，按 `calibrationTag` 输出待复查、有效、反证、过期样本数；后续新前端只读展示，不提供自动调权重入口。
- 人工回测候选链路：`GET /api/daily-movers` 会从 `calibrationFeedback` 派生 `backtestCandidates`，按 `ready / collecting / blocked` 标记是否具备人工回测条件；后续新前端只读展示候选样本、有效/反证统计和人工确认边界，`allowedUse` 保持 `research_only`，`canAutoAdjustWeights` 固定为 `false`。
- 历史样本验证层：`GET /api/daily-movers` 会从 `backtestCandidates` 和已存 `DailyMoverSnapshot` 派生 `backtestValidations`，输出日记验证数、历史样本数、有效率、抓到率、结论和限制说明；这只是已存样本验证，不是完整 K 线回测，`canAutoAdjustWeights` 固定为 `false`。
- 策略版本草案链路：`GET /api/daily-movers` 会从 `backtestValidations` 派生 `strategyDrafts`，记录候选规则、验证结果、限制条件、草案版本名和人工确认状态；后续新前端只读展示策略草案，不自动调整权重。
- 策略版本人工确认记录：受保护复盘入口可把 `manual_review_required` 草案以 `strategy_confirmation` 写入现有 `journal_events`，`GET /api/daily-movers` 会汇总 `strategyConfirmations` 并把匹配草案标记为已确认；该记录是低写入审计链路，不新增表、不触发 CoinGlass 请求、不改变规则权重。
- 策略确认后表现反馈：`GET /api/daily-movers` 会从 `strategyConfirmations` 和确认后的 `calibration_review` 日记派生 `strategyPerformanceFeedback`，统计后续样本、有效、反证、待复查和只读状态；后续新前端可展示“确认后表现”，不新增表、不触发 CoinGlass 请求、不自动调整权重。
- 策略版本长周期表现/回滚边界：`GET /api/daily-movers` 会从 `strategyPerformanceFeedback` 派生 `strategyVersionPerformance`，输出版本名、确认时间、后续样本窗口、已验证样本数、有效率、反证率、待复查数、阈值画像、手动回滚计划和 `awaiting_samples / retain_observation / manual_review_required / rollback_watch` 状态；后续新前端可展示“版本表现”“阈值画像”“回滚边界”和“回滚计划”，仍只读、不新增写入、不自动改权重。
- K 线回测计划边界：`GET /api/daily-movers` 会输出 `klineBacktestPlan`，从 `backtestCandidates` 和已存每日异动样本生成 planning-only 的缓存计划，包含候选状态、计划币种、周期、缓存键、预算封顶和 deferred symbols；`canFetchExternalCandles` 固定为 `false`，`requiresCacheBeforeExecution` 固定为 `true`，数据源策略固定为 `public_ohlcv_cache_only_no_coinglass`。
- K 线缓存持久化：新增 `ohlcv_candle_cache` 表、repository 读写方法和内存/Neon 双路径实现，用 `scope + symbol + interval` 做缓存键，保存公开 OHLCV candles、来源、拉取时间和样本边界。
- 低频 K 线缓存填充 MVP：新增 `runDailyMoverKlineCacheFill()` 和 `POST /api/admin/daily-movers/klines/fill`，必须带 `Authorization: Bearer <CRON_SECRET>`；默认从 repository 生成计划，只拉公开 Binance Futures OHLCV，不占用 CoinGlass 请求，跳过已有缓存，并受 `KLINE_BACKTEST_DAILY_REQUEST_BUDGET` 和 `KLINE_BACKTEST_MAX_SYMBOLS_PER_RUN` 封顶。
- 缓存 K 线验证结果：`GET /api/daily-movers` 会输出 `klineBacktestResults`，只读取 bounded `ohlcv_candle_cache`，计算缓存覆盖率、周期涨跌幅、最大冲高、最大回撤和量能变化；结果保持 `cached_kline_validation`、`research_only`、`canAutoAdjustWeights: false`，不触发外部请求。
- observedAt 事件窗口回测：`klineBacktestResults.eventWindowResults` 会按每日异动样本的 `observedAt` 把已缓存 candles 拆成 pre/post 窗口，输出样本方向、pre/post K 线数量、post 回撤/冲高、量能扩张和 `post_move_confirmed / pre_move_evidence / neutral / window_missing` 判定；该结果仍只读、不触发外部请求、不自动调权重。
- 免费套餐护栏：关联摘要最多读取 12 个扫描归档和 80 条日记，只做只读聚合，不新增表、不增加 CoinGlass 请求、不增加数据库写入频率。
- outcome executor 复盘写回基础：待复查 journal 由腾讯云 `signal-worker` 主线低频触发受保护 API；外部 GitHub Actions 仅作为 Vercel 回滚路径触发方案。该链路使用公开 OHLCV 评估 partial win、saved、loss、expired，并把结果写回 journal/rank；健康面板已展示覆盖率、待复查、到期、最近写回、最近执行批次、失败原因摘要、样本质量分层、只读阈值层、人工回滚计划、策略权重回测候选、只读权重变更审计、人工执行记录写入入口和 registry；该链路不占用 CoinGlass 请求预算，不自动改权重。
- 安全边界：输出必须保持 `allowedUse: "research_only"`，只能用于归因复盘、样本库和规则校准。

后续需要：

- 自动权重调整仍需单独准入、测试和回滚设计，不能因为人工确认记录或版本表现存在就直接开启。
- 自动权重调整前，应继续积累 outcome executor 写回样本，并把误报、漏判、有效样本接入更严格的回滚准入。
- UI 不能把涨跌幅榜包装成交易信号。

### 部分落地：告警系统

当前已经完成网页内基础告警策略和站内本地设置：

- `near_trigger` 会生成 high 级别告警。
- `triggered` 会生成 critical 级别告警。
- stale/failed 扫描会生成系统运维告警。
- 同币种同状态在去重窗口内会被抑制，避免重复刷屏。
- 静默时段会关闭声音，但事件仍进入事件中心。
- 浏览器 Notification API 只会在用户主动开启告警后请求权限，不会首屏打扰。
- 事件中心会把 signal alert、system stale、system failed 和扫描事件合并展示。
- `buildAlertControlReport()` 可输出最低信号等级、提示音、浏览器通知、静默时段和 5m/8m/15m 去重窗口配置边界。
- `buildAlertHistoryReport()` 已新增站内本地历史：支持 active/unseen/all/archived 筛选、已读、归档、恢复、本地保留上限和不接外部通道边界。
- 告警事件可按同标的关联到后端档案数据，避免告警、策略和复盘上下文脱钩。
- `buildAlertControlReport()` 固定输出 `allowedUse: "in_app_only"`，`canUseTelegram=false`，`canUseWebhook=false`，避免后续把外部推送误当作当前阶段目标。

后续需要：

- 告警历史持久化。
- 提示音音色、音量和更多静默规则细化。

### v0 前端 UI 接入与真实数据融合

2026-06-21 最新校准：v0 前端 UI 作为当前展示事实源。旧 UI 占位页不再作为当前状态；视觉、布局、动效、宠物小人、文案和组件结构必须尽量 1:1 保留。

当前状态：

- 首页、Dashboard、Signals、Market、Leaderboard、Review、System、Token Dossier 和宠物小人壳已恢复为 v0 前端 UI。
- 后端 API、扫描、数据库、复盘、分析引擎、告警策略和 Worker 保留。
- 已新增前端专用适配接口：`/api/frontend/radar-contract`、`/api/frontend/token-dossier`、`/api/frontend/leaderboard`、`/api/frontend/review-contract`。
- `lib/radar-contract.ts` 的组合 getter 已具备调用前端专用接口的入口；活跃页面必须优先消费后端前端合同。旧 mock 文件只允许保留为类型参考、离线预览或测试边界，不能作为线上事实源。
- 后续前端融合必须优先消费后端只读契约，不能让 UI 复制临时业务逻辑。
- TradingView 图表必须作为 Token Dossier 主图优先展示；自绘 K 线只能作为 TradingView 不可用时的只读降级展示，不能伪装成真实交易图表。
- 币种 logo 必须优先使用真实可追溯来源；缺失时显示 fallback 图形，不得用假 logo 伪装。
- 榜单或信号价格缺失时必须显示“等待价格/数据待补齐”这类明确状态，禁止把缺失值展示成 `$0` 或错误排名。
- 前端实时流必须优先消费后端 SSE/live store；SSR 初始卡片只能作为首屏兜底，不得让页面长期静态假装实时。
- 宏观页如果展示的是系统推导值，必须命名为“山寨温度/市场温度”等内部指标；除非接入真实 Fear & Greed 数据源，否则不得叫“贪婪指数”。

后续前端真实数据融合前，必须先确认：

- 哪些 API 是事实源。
- 哪些数据必须首屏可见。
- 哪些信息允许折叠，但必须显示总量和入口。
- 哪些交互只是展示，不能影响扫描、评分、风控和复盘。

## 分析逻辑总框架

每个信号必须经过九层检查：

1. 数据质量：字段是否足够、是否新鲜、是否来自真实 provider。
2. 市场锚点：BTC/ETH 是顺风、逆风、震荡还是未知。
3. 多周期结构：低周期触发是否被高周期位置支持。
4. 量价行为：放量、缩量、异常成交、突破或假突破。
5. 合约衍生品：OI、资金费率、多空比、taker flow、持仓拥挤和杠杆风险背景。
6. 技术指标：EMA、RSI、MACD、ATR、Bollinger、VWAP 等证据。
7. 赔率风控：入场、失效、目标、R 倍数。
8. 灵活性校验：不一刀切，允许逆风降权、观察和等待确认。
9. AI 反证复核：优先找错，再解释为什么可观察或不可参与。

## 信号输出标准

每个候选必须输出：

- 币种。
- 方向倾向：long、short、neutral。
- 状态：
  - no_trade
  - insufficient_data
  - abnormal_watch
  - normal_watch
  - waiting_confirmation
  - near_trigger
  - triggered
  - invalidated
  - reviewed
- 主周期。
- 多周期证据摘要。
- BTC/ETH 环境。
- 置信度。
- 风险等级。
- 支持证据。
- 反对证据。
- 入场条件。
- 禁止追单条件。
- 失效条件。
- 止损逻辑。
- 止盈计划。
- 复盘时间。

## 数据源策略

### 主要数据源

CoinGlass 业余会员 API：

- 用于合约市场、OI、资金费率、成交量、多空比、taker flow 和杠杆风险背景等衍生品相关字段。
- 必须低频分批。
- 必须显示覆盖率和新鲜度。
- 不能为了全市场覆盖一次性打满请求；先覆盖核心白名单，再逐步扩展。

### 免费公共数据源

公开交易所行情不再只是“补充”，而是全市场轻扫主力：

- Binance public futures exchangeInfo / 24h ticker / klines / funding / OI / taker 等可用公开端点。
- OKX public instruments / tickers / candles / funding 等可用公开端点。
- Bybit public market data 继续作为可选补充或兜底，不作为当前必须完成主线。

这些公开数据主要用于 universe、全市场轻扫、OHLCV、多周期 K 线、技术指标、市场宽度和交易所交叉验证。它们可以承担第一层发现和结构预筛，但不能替代 CoinGlass 深扫中的多交易所资金质量确认；也不能绕过 Evidence Engine、Risk Gate 或复盘验证。

### 合法外部事件情报源（未完成）

后续只接入以下三档合法、稳定且对核心目标有实际意义的数据。它们必须服务“提前发现山寨机会、解释催化剂、识别风险、辅助复盘”，不能成为孤立资讯面板。

第一档：必做数据，直接服务扫描和分析底座：

- Binance / OKX / Bybit 官方公开 API 或 WebSocket：全市场合约 ticker、K 线、交易对列表、funding、OI、可用 taker 主动成交数据。用途是全市场轻扫、真实涨跌榜、多周期结构、成交量异动、资金费率和持仓变化。
- CoinGlass 官方 API：只接当前套餐允许的 OI、funding、多空比、合约市场、supported pairs、supported exchanges、账户能力和可用的衍生品端点。用途是候选深扫、资金质量确认和拥挤风险解释；不能爬 CoinGlass 网页绕过套餐。
- Token identity 数据：CoinGecko、DEX Screener、Token Lists、Trust Wallet Assets 等合法来源。用途是 logo、名称、链、合约地址、交易所映射和同名币去污染。

第二档：强烈建议数据，用于提前发现山寨和催化剂：

- DEX Screener 官方 API：新 pair、新币、DEX 成交量、流动性变化、买卖压力和 boosted/profile 信息。用途是发现链上先动、合约后动的山寨机会。
- 交易所官方公告 / RSS / 公开页面：上币、上合约、下架、维护、暂停充提、杠杆调整、资金费率规则变化。用途是事件催化剂和风险拦截。
- DefiLlama / CoinGecko global 等宏观公开 API：稳定币流入流出、BTC.D、ETH.D、TOTAL2、TOTAL3、TVL 和市场宽度。用途是山寨季顺逆风锚点，不降低 `3:1` RR 门槛。

第三档：可做但低频，只做辅助和风险背景：

- 项目官网 blog、Medium RSS、GitHub release、官方文档更新：只抓标题、时间、URL、摘要和标签，不保存全文。用途是项目催化剂和活跃度背景。
- Etherscan / BscScan / Arbiscan 等区块浏览器 API：大额转账、CEX 入金/出金、合约创建、mint、供应变化、LP 增减和解锁相关线索。用途是巨鲸/供应/流动性风险，不直接决定方向。
- 安全事件和公开风险源：官方安全公告、审计方公开 RSS、已确认漏洞事件。用途是 `SECURITY_RISK` 或 `BLOCKING` 证据。

明确不进入搭建计划的第四档：

- CoinGlass 网页清算热力图截图/DOM 爬取、TradingView 网页数据爬取、X/Twitter 网页爬取、Telegram/Discord 非授权爬取、付费新闻全文、会员墙内容、个人隐私数据和任何绕过防爬/登录/验证码的抓取。
- 若未来确实需要 CoinGlass liquidation heatmap，只能在官方 API 和套餐权限允许后，作为“流动性风险辅助层”重新设计；仍不能作为目标位、方向依据或交易计划主依据。

外部事件进入系统的固定链路：

```text
RawSource
-> SourceFetchRun
-> ExternalEvent
-> EvidenceItem / RiskEvent
-> Evidence Fusion
-> Strategy Engine / Risk Gate
-> Report
-> Review Outcome
```

## 单机部署与稳定性原则

- 腾讯云单机生产目标使用 `docker-compose.yml` 编排 `web`、`postgres`、`redis`、`scanner-worker`、`coinglass-worker`、`signal-worker`、`dynamic-scan-scheduler` 和 `caddy`。
- `web` 继续承载 Next.js 前端和 API，避免迁移第一阶段同时重写业务边界。
- `scanner-worker` 每 15 分钟调用受保护 `POST /api/scan`，替代 GitHub Actions 主扫描 cron。
- `coinglass-worker` 低频调用每日异动归因和 K 线缓存受保护入口，不直接生成交易建议。
- `signal-worker` 低频调用 outcome executor 和 v3 Forward Map review，不自动改权重、不自动下单。
- `dynamic-scan-scheduler` 第一阶段只做健康巡检，后续再升级为 Redis 队列调度器。
- Caddy 无域名阶段先使用 `:80` HTTP；绑定域名后再自动启用 HTTPS。
- PostgreSQL 通过 `DATABASE_DRIVER=postgres` 和 `DATABASE_URL` 接入；Neon adapter 保留作为旧线上回滚路径。
- Redis 通过 `REDIS_URL` 接入主扫描锁和 CoinGlass 分钟级令牌桶；完整 Redis 队列调度仍是后续项，不能提前宣称完成。
- 后续单机生产目标需要把 Worker 从“调用受保护 API”逐步升级为“直接调用内部服务 + Redis 调度 + Postgres 审计”，但每次拆分必须保证同一套 Evidence / Risk Gate / Repository 合同，不允许复制一套平行逻辑。
- 部署自动化优先级提升：已补齐基础远程部署、SSH 检查和公网 smoke 脚本；后续继续补失败回滚、日志打包和更细的数据合同诊断，减少 OrcaTerm 手动步骤。

## Vercel / Neon 旧回滚原则

- Vercel/Neon/GitHub Actions cron 只作为旧线上回滚路径保留，不再作为新功能设计和生产部署的默认主线。
- 如果临时回滚到 Vercel，不依赖 Vercel 15 分钟内置 Cron。
- 回滚到 Vercel 时，可使用 GitHub Actions 外部 cron 请求 `/api/scan`、`/api/admin/daily-movers/ingest`、`/api/admin/daily-movers/klines/fill` 等受保护入口；该模式必须保持低频、小预算、缓存优先，不占用额外 CoinGlass 请求。
- API 层必须缓存。
- 页面刷新不等于每次重新打 CoinGlass。
- Vercel 回滚路径中的后台任务必须短、可重试、可降级，不能假设免费套餐有长时间常驻 worker。
- 上游失败时展示 stale，而不是假装 ready。
- 健康状态必须展示：
  - provider
  - scan freshness
  - scan coverage
  - database mode
  - archive availability
  - rate limit
  - last successful scan
  - last failed scan

## 后续搭建顺序

2026-06-20 之后的当前主顺序，以腾讯云香港单机生产和三源数据体系为默认前提：

```text
0. 生产部署稳定化与老系统迁移
   -> Vercel/Neon 旧运行和旧数据迁到腾讯云，Docker Compose、Postgres、Redis、Caddy、Worker、迁移、健康检查、日志、备份、回滚

1. 部署自动化与诊断提速
   -> prod deploy / diagnose / rollback 脚本，自托管或等效部署流水线，减少 OrcaTerm 手动复制

2. 数据归类与数据库治理
   -> universe/light_scan/state_pool/deep_scan/structure/indicator/evidence/strategy/review/system/ui_cache 分表或分层，防止旧数据覆盖新数据

3. Binance + OKX 全市场公共轻扫
   -> universe、ticker、成交额、波动、价格速度、交易所交叉验证、扫描证明

4. 动态状态池与防漏网调度
   -> COLD/WARM/HOT/CANDIDATE/DEEP_QUEUE/BATTLE/REVIVE 的状态迁移、复查时间和配额解释

5. 结构、关键位、赔率和技术指标候选预筛
   -> Market Reading、Key Level、Forward Map、位置/RR、回踩/反抽、趋势完整度、EMA/RSI/MACD/Bollinger/ATR/VWAP/ADX/Volume/OBV-CVD/Fibonacci 辅助证据

6. CoinGlass Hobbyist 能力白名单与深扫价值最大化
   -> 先固化官方支持/不支持清单，再做令牌桶、深扫优先级、防漏网配额、资金质量验证、拥挤/假突破风险；禁止接入 Hobbyist 不支持端点

7. 合法外部事件情报层
   -> 接入第一到第三档合法数据源：交易所公开数据、CoinGlass 官方 API、DEX Screener、交易所公告、CoinGecko/Token Lists、DefiLlama、区块浏览器 API、项目官方 RSS/GitHub release；全部转为 ExternalEvent/Evidence/Risk，不直接喊单，不接第四档高风险爬虫

8. 数据可视化契约与前端承接
   -> Scan Proof、Source Status、Candidate Deep Scan、Signal Dossier Evidence、Macro Weather、Review Evolution 六类可视化，确保后端数据不被首页 Top N 静默隐藏

9. Evidence / Strategy / Risk Gate 实战闭环
   -> 所有数据转 EvidenceItem，最终由 Strategy/Risk Gate 生成条件化计划或不参与原因

10. 复盘进化闭环
   -> outcome、missed opportunity、每日异动、Forward Map review、人工校准、策略版本审计

11. 新前端与真实数据融合
   -> 重新设计首页和功能区，消费统一后端契约，不使用旧前端或 mock 业务逻辑

12. 运行互动、提示音和 DIY 设置
   -> 只保留真实运行状态、扫描动效、数据新鲜度、提示音、静默时段和可关闭设置

13. 长期运维、监控、备份和性能优化
   -> Postgres 备份、日志归档、Worker 心跳、Redis 队列监控、资源水位、错误告警、部署回滚和容量复盘
```

以下历史阶段顺序从 2026-06-14 代码状态出发，保留为累计施工记录和完成度索引；已经完成的基础层不再按“从零搭建”理解。后续工作必须优先服从上面的 2026-06-20 当前主顺序，再回看历史阶段是否有未补齐的小项。

本顺序是活路线图，不是死清单。每完成一个阶段，都要先把“已落地、未完整落地、风险、套餐限制、验证结果”对齐到当前真实状态，再判断下一步是否仍然正确；如果下一步已被当前阶段部分覆盖，必须合并、改名、延期或替换。

### 阶段 1：蓝图固化

目标：把当前讨论结果写入仓库，成为后续开发事实源。

当前状态：已完成。

后续维护：

- 存在本蓝图。
- 存在后续执行计划。
- 后续对话先对照蓝图再继续开发。
- 每完成新流程，都把“已落地”和“未完整落地”同步更新。

### 阶段 2：真正多周期分析引擎

目标：让系统不是只显示多周期，而是真正用多周期做判断。

当前状态：基础已完成，受限主候选多周期 candles 接入、指标矩阵摘要、前端紧凑矩阵和基础指标/周期校准已完成，完整多周期融合未完成。

已具备：

- `1m/5m/15m/30m/1h/4h/1d/1w` 都有角色定义。
- 单个币种可以生成多周期 profile。
- 信号输出显示多周期一致、冲突或等待确认。
- BTC/ETH 逆风只降权，不一刀切否定。

下一步深化：

- 继续把多周期 candles 从受限主候选扩展到更清晰的候选分层策略，不能突破免费套餐请求节奏。
- 多周期 candles 已同时进入 technical indicators 和 timeframe profile，并能输出指标矩阵摘要；基础指标/周期校准已能小幅加权或额外降权。后续要补齐交互式矩阵展示和复盘/回测权重校验。
- UI 需要把多周期矩阵做成更紧凑的可视化。

### 阶段 3：合约 universe registry

目标：管理所有支持合约交易的币种，并显示扫描覆盖率。

当前状态：基础已完成，Binance/OKX/Bybit USDT 永续自动发现已完成，分层币池、长尾低频轮转、多交易所覆盖差异、API quota 护栏、动态优先级基础、repository hints 基础和扫描经济前端面板已完成。

已具备：

- 有资产注册表。
- 有扫描优先级。
- 有覆盖率展示。
- 有未扫描原因。
- 有 Binance public futures exchangeInfo 自动发现。
- 有 OKX public instruments 自动发现。
- 有 Bybit V5 public instruments 自动发现和分页读取。
- 有 anchor/core/active/long_tail 分层。
- 有 long_tail 低频抽样轮转策略。
- 有 major_three/multi_exchange/single_exchange/unlisted 覆盖质量分类。
- 有 `metadata.coverage.exchangeCoverage` 和 `exchangeCoverageSummary`。
- 有 `metadata.quota` 和 quota guard notes。
- 有 `COINGLASS_DAILY_REQUEST_BUDGET` 环境变量，默认 `3000` 请求/日；旧值 `300` 会把 15m 主扫描压成每轮 3 个请求，属于本项目已识别的全市场覆盖根因问题，不再作为推荐配置。
- 有 `/api/health` 的 `scanEconomy` 只读摘要：今日预算、预估请求/轮、预估日请求、剩余额度、批次压缩、层级覆盖和下轮重点。
- 有系统状态面板“扫描经济”区块，解释为什么 CoinGlass 业余会员阶段不能每 15 分钟全市场全扫。
- 有 `priorityHints` 动态优先级入口，可按异常程度、历史有效性、近期信号、流动性和交易所覆盖质量提升非 anchor 轮转币优先级。
- 有 repository hints 汇总器，可从扫描归档、复盘 outcome 和每日异动归因样本生成 `priorityHints`。
- 有 dynamic priority metadata notes，便于线上检查本轮是否发生动态插队。

下一步深化：

- 阶段 3 暂时不继续盲目扩请求频率；在腾讯云单机生产和 CoinGlass Hobbyist 限速边界下，已优先进入阶段 4A，把多周期 OHLCV candles 接入受限主候选，提高信号证据质量。后续阶段 3 的正确方向不是简单加大请求，而是补齐状态池调度、深扫配额、复活观察、冷门探索、扫描证明和漏判反哺，再根据真实 health 数据逐步提高动态优先级质量。

### 阶段 4：OHLCV 与技术指标

目标：接入免费 K 线数据并计算技术指标。

验收：

- 已部分完成：指标来自可选 OHLCV provider 的真实 candles。
- 已完成：受限主候选会拉取 `1m/5m/15m/30m/1h/4h/1d/1w` candles 并生成 timeframe profile。
- 已完成：MACD 动能、近似成交量分布和多周期指标矩阵摘要进入 evidence layer。
- 已完成：指标进入 evidence layer。
- 已完成：策略卡前端紧凑指标矩阵基础展示。
- 已完成：指标矩阵与多周期 Profile 的基础权重校准，冲突降权、同向小幅加权，并保留 evidence。
- 已完成：策略不直接由单指标触发。
- 未完成：回测级权重校准、交互式多周期图表、更专业的成交量分布模型。

### 阶段 5：AI 反证复核

目标：接入可配置模型，对规则引擎结果进行反证和解释。

当前状态：服务端边界已完成，生产模型接入和质量校准未完成。

已具备：

- 已完成：AI 有输入边界。
- 已完成：AI 有成本限制。
- 已完成：AI 失败不影响规则引擎。
- 已完成：AI 输出明确区分事实、推理、判断、策略。
- 未完成：生产环境真实模型配置、多模型对照和复盘校准。

### 阶段 6：自我提升复盘

目标：自动追踪信号结果，并让系统从复盘中校准。

当前状态：生命周期、评分基础、outcome executor MVP、健康面板基础状态展示和复盘面板执行批次展示已完成；执行器已能低频读取待复查 journal、拉公开 OHLCV、写回复盘结果，系统状态和复盘面板已能显示最近执行批次、失败摘要、跳过原因分层、样本质量分层、手动校准准入门槛、只读校准流、阈值层、人工回滚计划、策略权重回测候选、只读权重变更审计、人工执行记录写入入口、registry、影子权重差异、真实权重启用门禁和策略进化闭环总控，但还不是完整自动调权系统。

已具备：

- 信号进入 journal 时会带 `1h / 4h / 24h` 复查节点。
- outcome-tracker 已能根据后续 K 线判断 partial win、saved、loss、expired。
- journal 已支持记录 outcome。
- rank 已能根据纪律和结果变化。
- outcome executor 已能从 repository 读取待复查 journal，使用公开 OHLCV 评估结果，并写回 lifecycle journal event。
- `POST /api/admin/outcomes/run` 已受 `CRON_SECRET` 保护。
- `.github/workflows/chuan-outcome-executor.yml` 已支持每小时外部低频触发，并复用已有 `CHUAN_SCAN_URL` 推导 outcome executor URL，不需要新增 GitHub secret。
- 已关闭 lifecycle outcome 会阻止同一旧 tracking entry 重复触发公开 K 线请求。
- 系统健康报告和系统状态面板已展示 outcome 覆盖率、待复查样本、到期样本、最近写回时间、最近执行批次、写回数、跳过数、失败数、失败原因摘要、样本质量分层、手动校准准入门槛、只读校准流、阻断解释、样本明细、阈值层、人工回滚计划、策略权重回测候选、权重变更审计、人工执行记录入口、影子权重差异、影子表现评估、真实权重启用门禁、安全摘要和策略进化闭环总控。
- outcome executor 已把 `not_due`、`closed_duplicate`、`missing_signal_context`、`ohlcv_unavailable` 和 `outcome_pending` 汇总成跳过原因分层。
- 日记面板已展示 outcome executor 执行批次详情和跳过原因，且保持“只读审计 / 不改权重”。
- outcome 样本准入门槛已落地：`buildOutcomeCalibrationAdmission()` 会输出 `manual_calibration_gate`，按已关闭样本量、有效率、反证占比和亏损聚集判断 `ready / collecting / blocked`，并在健康面板显示准入门槛、准入分、阻断项和“不改权重”。
- outcome 只读校准流已落地：`buildOutcomeCalibrationFlow()` 会把样本准入、人工确认、确认后样本和回滚观察串成健康摘要，并输出阻断项解释、样本分布、最近校准样本明细、阈值层和人工回滚计划；状态只用于人工校准和回滚复核，`canAutoAdjustWeights` 固定为 `false`。
- 只读策略权重回测校准 MVP 已落地：`buildStrategyWeightCalibrationReport()` 会按校准 tag 汇总已关闭样本、有效率、反证率和人工确认版本，输出升权、降权、隔离和继续观察候选；健康面板只读展示候选分布与明细，不写策略权重。
- 只读策略权重变更审计 MVP 已落地：`buildStrategyWeightChangeAuditReport()` 会把权重回测候选转成只读人工审计包和回滚验证要求；健康面板展示审计候选、可审计、需回滚和阻断审计，并明确 `canExecuteWeightChange` 为 `false`。
- 人工权重变更执行记录写入入口和 registry 已落地：`POST /api/admin/strategy-weights/executions/record` 通过 `CRON_SECRET` 保护，系统健康面板可用管理密钥把审批状态、版本标签、回滚触发器和观察窗口写入 `strategy_weight_change_execution` journal 事件；`buildStrategyWeightChangeExecutionReport()` 汇总这些记录并展示审批状态和不可写权重，但不写策略权重。
- 影子策略权重层已落地：`buildStrategyWeightShadowReport()` 从已审批的人工执行记录生成 `baseWeights`、`shadowWeights` 和 `diffs`，系统健康面板展示“影子权重 / 当前权重 / 建议权重 / 差异 / 不影响实盘判断”；该层只读、不新增表、不新增外部请求、不改变真实扫描或策略权重。
- 影子表现评估已落地：`buildStrategyWeightShadowEvaluationReport()` 用审批后的校准样本和人工确认记录评估影子差异，输出样本数、有效/反证、回滚压力和下一步，只服务人工复核，不执行真实权重。
- 真实权重启用门禁已落地：`buildStrategyWeightActivationGate()` 在系统健康面板展示“真实权重门禁 / 启用模式 / 通过项 / 阻断项 / 样本门槛 / 安全摘要 / 不接入扫描”，默认 `STRATEGY_WEIGHT_ACTIVATION_MODE=disabled`；即使未来设为 `manual`，当前也只生成候选说明，不写真实权重。
- 真实权重启用安全摘要已落地：`strategyWeightActivationGate.safetySummary` 会把启用阻断项、最低审批后样本数、样本不足 tag、回滚高压/阻断数量和回滚样本 tag 输出到健康面板。该摘要只用于人工复核，仍固定 `canAutoAdjustWeights=false`、`canAffectLiveSignals=false`、`canWriteRuleWeights=false`。
- 策略进化闭环总控已落地：`strategyEvolutionLoop` 会把 v3 实时样本、outcome 复盘、人工审计、人工记录、影子观察和真实启用门禁串成只读链路，输出准备度、阶段状态、阻断项和下一步；该层固定 `allowedUse=research_only`，`canAutoAdjustWeights=false`，`canMutateLiveRanking=false`，`canWriteRuleWeights=false`。
- outcome executor 运行审计事件保持 `research_only`，不参与段位 XP、tracking 计数或自动调权。
- 规则调整已有 promote、demote、experiment 基础函数。

下一步深化：

- 继续积累更长期、更大样本的真实回滚验证，让 `strategyEvolutionLoop` 服务规则复核而不是自动调权。
- 补齐真实权重接入扫描引擎的隔离层和回滚验证方案；人工执行记录入口与启用门禁只保存/解释审批账本，不能直接改变规则权重。
- 反复误报的规则必须进入降权、隔离或删除流程。

### 阶段 7：告警系统

目标：让重要异动有可控提醒。

当前状态：网页内基础告警、站内本地设置、站内告警历史筛选、已读、归档、恢复、信号档案告警联动和不接外部推送边界已完成，持久化未完成。

已具备：

- 浏览器通知。
- 声音级别。
- 重复抑制。
- 静默时段。
- Settings 抽屉里的站内告警控制：最低等级、提示音、浏览器通知、静默时段、去重窗口。
- 外部推送边界：当前不接 Telegram/Webhook。
- 系统异常告警。
- 事件中心合并展示。
- 站内告警历史筛选：active / unseen / all / archived。
- 已读、归档和恢复本地动作。
- 信号档案相关告警联动。

下一步深化：

- 告警历史持久化。
- 提示音细节和浏览器通知开关优化。

### 阶段 8：前端融合与真实数据接线

目标：保留用户提供的 v0 前端视觉，全面接入后端真实数据合同，禁止 mock 冒充真实。

当前状态：

- v0 前端 UI 是当前展示事实源，视觉、布局、动效、宠物小人和文案风格必须 1:1 保留。
- 首页、Dashboard、Signals、Market、Leaderboard、Review、System、Token Dossier 已接后端前端合同。
- 活跃前端文件不再从 `mock-data.ts` 导入市场事实或 UI 类型。
- `src/lib/frontend-market-types.ts` 承接 UI 展示类型；`src/lib/sniper-data.ts` 只允许保留类型和纯显示 helper。
- 旧 `ReviewCenter`、`SystemCenter` 大型 mock 面板已删除，避免旧样本和假健康状态污染真实页面。
- 交易日记抽屉使用 `ManualJournal` + `/api/frontend/journal-contract`，localStorage 只作为接口失败兜底。
- 复盘页 `strategyArchetypes` 不能把业务能力分数伪装成策略胜率；没有真实分型 outcome 样本时，`winRate/avgRR` 必须为 `null`，前端显示“样本收集中/待统计”。
- Token Dossier 主图区已接 `tradingView` 合同：优先嵌入 TradingView，关键位、证据链和交易计划仍由后端提供。
- 币种头像改为通用真实 logo 查询 + fallback，避免固定白名单导致大多数山寨币显示假状态。
- Leaderboard 对缺失价格显示“等待价格”，不得把缺失价格渲染为 `$0`。
- 实时推送区优先读取后端 SSE/live feed，只有没有事件时才显示合同内首屏事件。
- Market 概览的推导温度已从“贪婪指数”改为“山寨温度”；真实 Fear & Greed 如需展示，必须另接真实数据源。

后续验收：

- 前端必须能解释系统正在扫什么、扫到什么、为什么候选成立或不成立。
- 前端不能静默隐藏候选、证据、风险、关键位或复盘样本。
- 前端不能自动下单，不能伪造图表，不能把研究信息包装成确定交易信号。
- 任何新增页面不得重新导入 `mock-data.ts` 作为事实源；仓库卫生测试必须继续覆盖这一点。
- 仍未完成的前端数据能力：稳定 CVD/taker 主动买卖流、真实资金流、真实 Fear & Greed、Token Dossier 更细的分析报告可视化、长期样本后的策略分型胜率展示。

6. **Phase 3.11：Data Quality Cleaning And Coverage Quality Explanation**
   - 当前状态：已完成并增强。`/api/health` 已新增 `marketDataQuality`，会从主扫描 metadata 和 instrument pool 汇总 raw / clean / primary、UNKNOWN、非 USDT、重复币种、流动性门槛、过滤样本、质量分和只读边界。
   - Phase 3.14 已增强数据质量解释：CoinGlass provider 会写入 `quality rejected samples`、`quality aggregation summary` 和 `quality aggregation` notes；`marketDataQuality.primarySelection` 会展示重复组数、主信号选择规则和样本，`rejectedRowSamples` 会展示原始拒绝行样本。
   - 健康面板已新增“数据质量”卡片，直接展示原始行、清洗后、主信号、可用池、UNKNOWN、非 USDT、重复/去重、流动性门槛、主信号聚合解释、原始拒绝样本和过滤样本。
   - 该阶段不改变 CoinGlass 请求、不改变实时排序、不生成交易方向；数据质量层只能阻断、降级或解释候选。
   - 下一步应进入 v3 策略引擎实战闭环只读接入，把现有 v3 Key Level / Forward Map / Pattern / Trade Plan 结果更明确地串到复盘与候选解释里。

7. **Phase 3.19：Two-Stage Deep Scan Allocation Proof**
   - 当前状态：已完成。扫描计划会输出 `twoStageAllocation`，解释本轮 CoinGlass 深扫名额如何分给 BTC/ETH 锚点、动态优先级、常规轮转和冷门探索保底。
   - 当轮转名额不少于 3 且 universe 存在长尾资产时，动态优先级名额会给冷门探索预留至少 1 个位置，避免高优先级提示把未知山寨币永久挤出深扫。
   - `queuedPriorityAssets` 必须显式展示高优先级但本轮未进入深扫的资产；它们不是淘汰，而是等待后续批次、复活观察或轮转扫描。
   - 该阶段不新增 CoinGlass 请求、不放宽风险门控、不把 light scan 直接升级为交易信号。

8. **Phase 3.9+：BTC ETH Macro Radar**
   - BTC/ETH/ETF/OI/funding/杠杆拥挤背景作为大盘天气，不抢山寨主线。
   - 输出顺风、逆风、拥挤、去杠杆、假突破风险等环境层，影响机会排序和策略解释。
   - 当前状态：已完成 BTC/ETH Macro Weather 第一版，并新增 BTC.D / TOTAL2 / TOTAL3 `altcoinMacro` 输入合同；它复用已有输入，不新增请求，不修改真实权重。ETF 专项端点仍需等 CoinGlass Hobbyist 可用性和 quota 先验证后再接入。BTC.D 只做山寨环境顺逆风锚点，不降低 `3:1` 赔率门槛，不直接生成方向。

6. **Phase 4C-0：Strategy Engine v2 Guard Rails**
   - 下一步正确搭建项：先加 repository hygiene 测试，强制 v2 五份规格文档存在，并禁止源码新增清算热力图、清算区、heatmap provider 等模块。
   - 目的：把 Evidence-first、禁用清算热力图、report 不能重新判断行情、盈亏比低于 3:1 禁止交易信号等规则变成测试护栏。
   - 当前状态：已完成；v2 护栏现在作为 v3 的底层安全边界继续保留。

7. **Phase 4C-1：Evidence Types And Evidence Ledger**
   - 建立 `EvidenceItem`、`EvidenceFamily`、`EvidenceDirection`、证据账本、同源去重、证据追溯。
   - 所有结构、指标、OI、Funding、相对强弱和大盘天气都必须先转 EvidenceItem，不能直接进入交易判断。
   - 当前状态：已完成；后续 v3 在此基础上扩展 `KEY_LEVEL` 家族和趋势切换字段。

8. **Phase 4C-2：Market Structure Facts**
   - 从缓存多周期 K 线识别 swing high/low、HH/HL、LH/LL、range、breakout、breakdown、sweep、failed breakout、前高/前低/区间高低。
   - 该层只提取事实，不输出交易结论；结构事实后续进入 evidence_builder。
   - 当前状态：v2 基础结构事实已完成；v3 还需要扩展为完整 Market Reading Engine，覆盖 BOS、CHoCH、突破/跌破、回踩/反抽和趋势完整度。

9. **Phase 4C-3：Location / RR / Risk Gate**
   - 识别位置质量、止损距离、目标距离、盈亏比、箱体中部、追高区、低位追空区。
   - 盈亏比不足 `3:1`、RiskScore 过高或结构失效时，必须输出观察、等待、冲突或失效。
   - 当前状态：v2 Location/RR/Risk Gate 已完成；v3 还需要加入 Key Level、Forward Map、结构止损意义、流动性和多空双向追高/追空门控。

10. **Phase 4C-4：Indicator And Derivatives Interpreters**
   - RSI、MACD、Bollinger、ATR、EMA/VWAP、ADX、Volume/OBV/CVD proxy、OI、Funding、多空比、taker flow 都只转 EvidenceItem。
   - 技术指标总权重不能超过 `10%-15%`；Funding 高解释为拥挤风险，不解释为强势。
   - 当前状态：v2 指标和衍生品解释器已完成；v3 继续补齐多空趋势场景解释和 `KEY_LEVEL` 证据融合。

11. **Phase 4C-5：Scoring Engine**
   - 实现 `PreMoveScore`、`EnergyScore`、`RiskScore`、`TrendHoldScore`、`EnergyDecayScore`。
   - scoring 只算分，不输出最终交易决策。
   - 当前状态：v2 scoring 已完成；v3 需要升级为 `PreTrendScore`、`TrendEnergyScore`、`RiskScore`、`TrendHoldScore`、`ExhaustionScore`，并支持多空方向拆分。

12. **Phase 4C-6：Strategy State Machine And Decision Engine**
   - 输出 `IDLE`、`COMPRESSION`、`ACCUMULATION`、`PRE_BREAKOUT`、`BREAKOUT_CONFIRM`、`TREND_ACCELERATION`、`EXHAUSTION_RISK`、`INVALIDATED`、`CONFLICT`。
   - 最终决策必须经过 evidence fusion、conflict detector、risk gate 和 invalidation rules。
   - 当前状态：v2 state machine 和 decision engine 已完成；v3 需要扩展为 RANGE/TREND、多空双向趋势状态和 v3 决策枚举。

13. **Phase 4C-7：Report And Read-Only UI Integration**
   - `report_generator` 只翻译结构化结果，不重新判断行情。
   - 先把 v2 输出以只读方式接入 Signal Dossier 和机会板解释，不立即改变现有排序和真实权重。
   - 当前状态：v2 report 和只读 UI 接入已完成；v3 `strategyV3` 已将 Key Level Map 和 Forward Map 接入 Signal Dossier，只读展示且不改变 live ranking。后续 v3 报告还需要补充完整多周期结构、数据面、技术辅助、不交易原因和复盘验证入口。

14. **Phase 4V3-1：v3 Signal Dossier 接入**
   - `buildSignalTrendRadarV3Dossier` 复用 CoinGlass provider 已经拉取的 OHLCV candles，生成只读 `strategyV3`。
   - Signal Dossier 已展示关键位地图和 Forward Map，包含来源周期、区域价格、支撑/压力、失效位、趋势切换位和只读 guardrail。
   - 该阶段不新增 CoinGlass 请求，不写真实权重，不改变候选排序，不自动生成交易结论。
   - 当前状态：已完成 MVP。

15. **Phase 4V3-2：v3 Forward Map 持久化**
   - 新增 `V3ForwardMapSnapshot` 和 `v3_forward_map_snapshots`，保存 `scanId`、`signalId`、`symbol`、生成时间、关键位数量、Forward Map 数量、来源周期和只读 payload。
   - `createReplayFrame` 会保留已有 `strategyV3`，repository 的 `addScanArchive()` 会在写入扫描归档时同步提取 v3 快照。
   - Memory 和 Neon/Postgres repository 都支持 `listV3ForwardMapSnapshots()` 与 `getV3ForwardMapSnapshotsForScan()`，用于后续复盘执行器按扫描批次回看。
   - 该阶段不新增 CoinGlass 请求，不新增交易结论，不改变 live ranking，不自动调权。
   - 当前状态：已完成 MVP。

16. **Phase 4V3-3：v3 Forward Map Review Executor**
   - 新增 `runForwardMapReviewExecutor`，读取 `v3_forward_map_snapshots`，按保存时间过滤后续 candles，验证事前 Forward Map 和关键位区域是否出现反应、失效或仍需观察。
   - 写入 `trend_radar_review` journal 事件，payload 保存 `TrendRadarReview`，类型覆盖 `forward_map_review` 和 `key_level_reaction_review`。
   - 写入 `trend_radar_review_run` 执行批次，记录扫描快照数、完成数、写回数、跳过原因、失败数和 K 线数量。
   - 新增受保护接口 `POST /api/admin/v3/forward-map-reviews/run`，继续使用 `CRON_SECRET`，不暴露公开写入入口。
   - 复盘面板和 Signal Dossier 已识别 v3 review action，展示只读复盘、不改权重和 evidence 数量，避免被当成普通交易复盘。
   - `/api/health` 和系统健康面板已展示 `v3ForwardMapReviews`，包含事前地图、最近执行、完成快照、跳过原因、失败数、最近样本时间和 `v3_forward_map_snapshots` 存储迁移状态。
   - 如果当前生产 Postgres 或旧 Neon 回滚库还没有执行最新迁移，健康面板显示待迁移，首页仍必须可加载。
   - 当前腾讯云单机生产主线由 `signal-worker` 低频触发 v3 Forward Map Review。`.github/workflows/chuan-v3-forward-map-review.yml` 仅作为 Vercel 回滚路径的低频触发方案保留，复用 `CHUAN_SCAN_URL` 和 `CHUAN_CRON_SECRET`，不作为主生产执行方式。
   - 当前状态：已完成 MVP。

17. **Phase 4V3-4：missed_altcoin_review 与每日异动复盘融合**
   - `GET /api/daily-movers` 会从选中每日异动样本的漏判样本中，寻找 `observedAt` 之前已经保存的 v3 Forward Map / Key Level Map。
   - 只在 `radarStatus === "missed"`、样本可学习且存在改进标签或校准候选时生成 `missed_altcoin_review`。
   - `missed_altcoin_review` 只作为人工复盘证据，输出 `allowedUse: "research_only"`、`canAutoAdjustWeights: false` 和可追溯 `evidenceIds`。
   - 后端已输出“v3 漏判复盘 / 事前地图”，显示证据数、只读用途和不改权重边界。
   - 该阶段不新增外部请求、不增加 CoinGlass 消耗、不改变 live ranking、不写真实权重。
   - 当前状态：已完成 MVP。

18. **Phase 4V3-5：v3 多周期趋势上下文只读接入**
   - `StrategyV3Dossier` 新增兼容旧快照的可选 `trendContext`，新生成的 dossier 会输出多周期结构、趋势状态、v3 决策、五类趋势分数、冲突原因和下一步。
   - `trendContext` 只使用本轮已有 OHLCV，不新增 CoinGlass 请求，不改变 live ranking，不自动写入权重。
   - 高低周期结构冲突时输出 `CONFLICT / CONFLICT_WAIT`，明确“低周期不能推翻高周期”。
   - Signal Dossier 已展示“趋势上下文 / 多周期结构 / v3 trend scores / timeframe structures”，让前端能看到 v3 是否在运转，而不是只看静态关键位。
   - 当前状态：已完成 MVP。

19. **Phase 4V3-6：v3 Risk Gate 与不参与原因上屏**
   - `StrategyV3TrendContext` 新增只读 `riskGate` 和 `noParticipationReasons`，由冲突、过高风险、压缩未突破、结构优势不足、结构失效等原因生成。
   - 机会板会展示 v3 趋势状态、v3 决策、v3 风控门控和第一条不参与原因，让“为什么不能参与”在主界面可见。
   - 该门控只解释当前 v3 只读判断，不改变 live ranking，不改真实权重，不把观察状态升级成交易信号。
   - 低周期与高周期冲突时，必须保留 `CONFLICT / CONFLICT_WAIT` 与“低周期不能推翻高周期”的约束。
   - 当前状态：已完成 MVP。

20. **Phase 4V3-7：Market Reading Engine 结构事实 MVP**
   - 新增 `buildMarketReadingContext()`，从已有 OHLCV 提取 swing high/low、`HH`、`HL`、`LH`、`LL`、`BOS_UP`、`BOS_DOWN`、`CHOCH_UP`、`CHOCH_DOWN`、假突破和假跌破等盘面结构事实。
   - 该模块只输出 `research_only` 结构事实、区间高低、事件列表和摘要，不输出买卖建议，不直接改变趋势状态机、live ranking 或权重。
   - `StrategyV3TrendContext.marketReadings` 已接入 Signal Dossier，前端展示“盘面结构”，让前高/前低、结构序列和假突破风险可检查。
   - 当前状态：已完成 MVP。

21. **Phase 4V3-8：Market Reading Facts 驱动只读阶段切换**
   - v3 趋势状态机开始消费 `marketReadings`：`BOS_UP / CHOCH_UP` 输出 `LONG_BREAKOUT / WAIT_LONG_PULLBACK`，`BOS_DOWN / CHOCH_DOWN` 输出 `SHORT_BREAKDOWN / WAIT_SHORT_RETEST`。
   - 上影线假突破输出 `LONG_EXHAUSTION / AVOID_CHASE_LONG`，下影线假跌破输出 `SHORT_EXHAUSTION / AVOID_CHASE_SHORT`，并进入 `noParticipationReasons` 与只读 `riskGate` 阻断。
   - 该阶段仍只做结构阶段解释，不输出执行订单，不改变机会板排序，不写真实权重，不自动调参。
   - 当前状态：已完成 MVP。

22. **Phase 4V3-9：Key Level + RR/位置质量接入 v3 Risk Gate**
   - 新增 `evaluateV3LocationRiskReward()`，从当前价格、信号方向和 v3 Key Levels 计算结构止损、最近目标、止损距离、目标距离、位置质量、RR 和阻断标签。
   - 多头使用下方结构支撑作为止损、上方压力作为目标；空头使用上方结构压力作为止损、下方支撑作为目标。缺止损、缺目标、RR 低于 `3:1`、止损距离过远或偏追时，进入 `riskGate.blockedBy` 和 `noParticipationReasons`。
   - Signal Dossier 已展示“位置/RR”、结构止损、最近目标、止损距离、位置质量、阻断标签和只读摘要。
   - 该阶段仍不输出执行订单、不改变机会板排序、不写真实权重、不自动调参。
   - 当前状态：已完成 MVP。后续正确搭建项是补齐回踩/反抽质量、趋势完整度和二次确认，让系统区分“突破后等回踩”“反抽后等承压”“趋势可持有”和“衰竭退出”。

23. **Phase 4V3-10：Pullback / Retest Reaction Quality MVP**
   - 新增 `evaluateV3ReactionQuality()`，从当前方向、最近 K 线和 v3 Key Levels 判断多头回踩承接、空头反抽承压、支撑失守、压力收复、未触达和无可验证关键位。
   - 该模块只输出 `research_only` 事实上下文：`status`、`qualityScore`、`touchedLevelId`、`riskFlags`、`evidence` 和摘要，不输出买卖建议，不改变 live ranking，不自动调参。
   - `buildStrategyV3TrendContext()` 已接入 `reactionQuality`；只有 `support_lost` 和 `resistance_reclaimed` 这类硬失败进入只读 Risk Gate，避免把“未触达/等待回踩”误判成强行交易信号。
   - Signal Dossier 已展示“回踩/反抽”、状态、质量分、触达关键位、只读用途、摘要和风险标签。
   - 当前状态：已完成 MVP。后续正确搭建项是补齐趋势完整度 `Trend Integrity`，判断 HH/HL 或 LH/LL 序列是否仍健康、回调是否缩量、突破后是否加速或开始衰竭。

24. **Phase 4V3-11：Trend Integrity 趋势完整度 MVP**
   - 新增 `evaluateV3TrendIntegrity()`，从 Market Reading 事件、周期方向和最近 K 线判断 HH/HL 或 LH/LL 序列是否仍健康、结构是否被破坏、假突破/假跌破是否提示衰竭风险。
   - 多头方向下 `LL / BOS_DOWN / CHOCH_DOWN` 会标记 `bull_structure_broken`；空头方向下 `HH / BOS_UP / CHOCH_UP` 会标记 `bear_structure_broken`。假突破和上影线只标记追高衰竭风险，不反向生成做空信号；假跌破和下影线只标记追空衰竭风险，不反向生成做多信号。
   - `buildStrategyV3TrendContext()` 已接入 `trendIntegrity`；硬结构破坏和衰竭风险进入只读 Risk Gate 与不参与原因。
   - Signal Dossier 已展示“趋势完整度”、状态、完整度分、方向、是否影响排序、摘要和风险标签。
   - 当前状态：已完成 MVP。后续正确搭建项是 v3 Trade Plan，只允许在结构、位置/RR、回踩/反抽、趋势完整度同时满足时生成只读计划草案，仍不自动下单、不直接改变 live ranking。

25. **Phase 4V3-12 到 Phase 4V3-25：v3 分析、复盘和进化闭环**
   - 已完成 v3 只读交易计划、低权重形态辅助、形态/计划复盘标签、形态/计划只读统计、bucket 样本追溯、v3 readiness bucket、AI 反证生产边界和策略进化闭环总控。
   - 当前这些能力全部视为后端分析与复盘能力，不能被描述成旧前端组件能力。
   - 前端展示层已清空；后续新前端只能通过稳定 API 契约重新展示这些结果。

26. **Phase 7：站内告警与事件历史**
   - buildAlertHistoryReport()、buildAlertControlReport() 和相关告警策略保留为后端/应用层能力。
   - 告警系统固定 in_app_only，不接 Telegram/Webhook，不自动下单，不改变 live ranking。
   - 前端展示层已清空；后续需要重新设计告警展示、静默时段和提示音控制。

27. **Phase Backend-1：后端事实契约与单信号档案 API（已落地）**
   - docs/BACKEND_API_CONTRACT.md 规定后续前端重建必须消费统一只读后端契约，不能从零散字段猜测系统状态。
   - GET /api/radar/backend-contract 聚合 source、runtime、全市场 coverage、public light scan、CoinGlass deep scan、状态池 allocation、数据质量、v3 覆盖、v3StrategyLoop 和 strategyEvolutionLoop。
   - GET /api/radar/dossier?symbol=SYMBOL 按标的输出当前信号、TradingView 外链、可用周期、v3 key levels、Forward Map、trade plan、Evidence 和 Journal 样本。
   - 这些 API 是后续新前端的事实源。

28. **Phase Backend-2：腾讯云单机后端运行闭环（已落地）**
   - 新增 `macro_market_snapshots` 持久化表，用于保存 CoinGecko global 的 BTC.D、ETH.D、TOTAL2、TOTAL3 和总市值快照。
   - 新增 `POST /api/admin/macro/ingest`，由 `CRON_SECRET` 保护，只写宏观环境快照，不生成交易信号。
   - CoinGlass provider 会从 repository 读取宏观快照，并把 BTC.D/TOTAL2/TOTAL3 注入 Macro Weather；该结果只能作为山寨大盘顺逆风解释，不能降低 `3:1` 最低 RR，不能绕过 Evidence/Risk Gate。
   - `/api/health` 新增 `macroMarket`，展示宏观快照状态、来源、新鲜度、BTC.D、TOTAL2、TOTAL3 和只读边界。
   - `/api/radar/backend-contract` 新增 `sourceAudit.macroMarket`，供新前端直接展示宏观环境锚点。
   - 单机部署新增 `macro-worker`，默认每 3600 秒调用一次宏观 ingest。
   - 新增 `deploy/scripts/production-verify.sh` 和 `deploy/scripts/production-observe.sh`，用于服务器验收、扫描证明、宏观快照证明、backend contract 证明和 worker 日志观察。
   - 当前状态：已完成后端 MVP；本地无法运行 Docker 时只能做脚本语法验证，服务器端必须执行验收脚本确认容器真实状态。

29. **阶段 8：前端重建与后端合同接入**
   - 旧自研前端不再作为设计依据，旧视觉稿、旧 QA 记录和旧沟通方向不得反向污染当前前端。
   - 当前前端以用户提供的 v0/外部 AI 前端为展示壳，工程侧只负责把真实后端合同接进去，不能擅自重写 UI、文案、动画和样式。
   - 新前端不得使用 mock 排名、mock 大盘、mock 复盘、mock 信号冒充真实数据；当后端没有合格数据时，必须显示空态、partial、waiting、blocked 或 unavailable。
   - 前端显示“系统在运转”必须依赖 `/api/health`、`/api/radar/backend-contract`、`/api/frontend/radar-contract`、runtime heartbeats、scan proof 和 scan stability，不得只靠动画制造实时感。

30. **Phase Backend-3：前端数据观测与事件合同（已落地）**
   - 新增 Redis-backed `api-observability`：CoinGlass 每次真实请求写入日内调用计数，CoinGlass/Binance/OKX/Bybit 写入数据源延迟探针。
   - `/api/health.apiUsage`、`/api/health.dataSourceLatency`、`/api/radar/backend-contract.runtime.apiUsage`、`/api/radar/backend-contract.runtime.sourceLatency` 和 `RadarContract.apiUsage/dataSources` 必须读取这些真实观测；未配置 Redis 时只能显示 unconfigured/partial，严禁用本轮计划请求数或 `0ms` 冒充真实状态。
   - 新增 `GET /api/frontend/live-events`，只读取扫描归档和 runtime 心跳，输出 scan heartbeat、signal change、candidate change 和 system status 事件；该接口不得触发扫描、不得调用 CoinGlass。
   - AI 反证复核升级为 evidence-id bound：prompt 必须包含 `trace.signalId` 和 `trace.evidenceIds`；模型反证若引用 payload 外 evidenceId，必须 fallback，不能进入 reviewed。AI 仍只做反证复核，不能覆盖规则引擎、不能生成交易信号、不能改排序。

31. **Phase Backend-4：前端 UI 状态持久化与私有访问边界（已落地）**
   - 新增 `frontend_ui_states` 持久化表，用于宠物进度、彩蛋进度和 UI 偏好；该表的 `allowedUse` 固定为 `ui_state_only`，`canCreateTradeSignal`、`canMutateLiveRanking`、`canAutoAdjustWeights` 固定为 `false`。
   - 新增 `GET/POST /api/frontend/ui-state`，只读写 UI 状态，不触发扫描、不写交易日记、不进入 Evidence、Signal Maturity、Universe Priority、Risk Gate 或权重系统。
   - `pet-store` 和 `egg-store` 已接入服务器同步：先读 localStorage 保证前端不卡，再后台读写 `/api/frontend/ui-state`；接口失败时只能降级为本地缓存，不能假称已跨设备保存。
   - 新增 `GET/POST/DELETE /api/auth/session` 和 `middleware.ts` 私有模式边界。`CHUAN_PRIVATE_MODE_ENABLED=false` 时默认放行；开启后使用 HTTP-only 签名 cookie 保护页面、前端合同和读写型前端 API。
   - `.env.example` 只允许使用占位符：`CHUAN_SESSION_PASSWORD`、`CHUAN_SESSION_SECRET`、`CHUAN_SESSION_TTL_SECONDS`、`FRONTEND_UI_STATE_*`。真实密码、API key 和 session secret 不得写入仓库。
   - 私有登录不是交易权限，不接交易所下单 API，不做自动交易；它只保护个人站点访问。

32. **Phase Backend-5：九阶段后端对接、稳定性和生产验收合同（已落地）**
   - 新增 `ScanStabilityReport`，从扫描归档、覆盖率、Redis 状态和 worker 心跳生成扫描稳定性诊断；该报告只能用于运维和排错，不能直接生成交易信号。
   - `/api/health`、`/api/radar/backend-contract` 和 `RadarContract.scanStability` 必须暴露扫描稳定性状态、分数、问题列表和只读边界。前端如果显示“系统在运转”，必须优先使用这些字段，而不是动画或静态文案。
   - 新增 `ReviewStatisticsReport`，从真实 `journal_events` outcome 样本统计样本数、已关闭样本、待跟踪样本、MFE/MAE、胜率和样本状态；样本少时必须输出 `empty/collecting/statistically_thin`，不能假装已经具备稳定胜率。
   - `ReviewContract.reviewStats` 和 `ReviewContract.aiReviewStats` 已接入；复盘统计只用于人工研究和回滚验证，`canAutoAdjustWeights=false`、`canMutateLiveRanking=false` 固定不变。
   - `RadarContract.fundFlow` 固定为诚实 partial/waiting 合同：当前只承认 OI、Funding、Long/Short 等已接衍生品上下文，未接入 taker buy/sell、CVD 或真实资金流源时必须明确标注，不能用 mock 数字补位。
   - 新增 `GET /api/frontend/live-events/stream`，使用 SSE 输出与 `/api/frontend/live-events` 相同的只读事件合同；该接口不得触发扫描、不得调用 CoinGlass、不得读取 provider secret。
   - 单机部署环境变量、`docker-compose.yml` 和 `deploy/scripts/bootstrap-prod-env.sh` 必须同步私有模式、前端 UI 状态、实时事件限流、worker 心跳、AI/扫描相关变量。真实密钥只写服务器 `.env.production`，不得写入仓库。
   - 新增生产全量验收脚本 `deploy/scripts/production-full-verify.sh`，统一检查 compose、迁移、健康、前端合同、只读事件、UI 状态、扫描触发、公开 smoke、worker 日志和备份 dry run。
   - 新增 PostgreSQL 恢复脚本 `deploy/scripts/restore-postgres.sh`，必须显式设置 `CONFIRM_RESTORE=yes` 才能恢复，避免误覆盖生产数据。
   - 当前九阶段结论：后端合同、扫描稳定性、复盘统计、AI 统计、事件流、单机验收和恢复路径已形成闭环；剩余业务事实缺口是稳定资金流源。没有稳定来源前，前端只能显示 partial/waiting。

33. **Phase Backend-6：生产根因治理与数据污染防线**
   - 生产发布脚本必须在 `docker compose up -d --build` 后自动调用 `/api/admin/persistence/migrate`；数据库迁移是发布流程的一部分，不能靠手动记忆。
   - 长间隔 worker 在任务睡眠期间必须按 `WORKER_IDLE_HEARTBEAT_SECONDS` 上报空闲心跳，避免 daily mover、signal、macro 这类低频任务被误判为 down。
   - public light scan、universe registry 和 CoinGlass mapper 必须过滤已知非加密底层资产、股票、ETF、指数和贵金属类污染标的；这些资产不能进入山寨币深扫槽位。
   - 如果 CoinGlass deep scan 出现 `Invalid API key`、`Upgrade plan`、接口成功但 `data=[]`、0 clean rows 或 24/24 failed，系统必须保留 public light scan，但必须把深扫状态标成 partial/watch，不能把它解释成“市场没有机会”。
   - CoinGlass API key、账号等级和端点权限属于外部事实；代码只能做诊断和降级，不能伪造深扫成功。

34. **Phase Backend-7：CoinGlass 合约深扫能力体检与运行态合同（已落地）**
   - 新增受保护只读入口 `POST /api/admin/coinglass/capability`，必须带 `Authorization: Bearer <CRON_SECRET>`，只用于少量白名单端点能力体检；它不写数据库、不生成信号、不暴露 API key。
   - 新增 `CoinGlassRuntimeCapabilityReport`，区分官方白名单和生产运行态：`ready`、`upgrade_required`、`auth_error`、`rate_limited`、`param_error`、`empty`、`failed`、`not_configured`、`not_requested` 必须分别显示，不能合并成“可用/不可用”两种粗糙状态。
   - `/api/health.coinGlassRuntimeCapability` 和 `/api/radar/backend-contract.sourceAudit.coinGlassCapability` 必须复用本轮扫描诊断，不得在普通页面刷新时额外消耗 CoinGlass 额度。
   - `RadarContract.dataSources` 必须读取 `sourceAudit.coinGlassCapability.deepScanStatus`，当出现 `Upgrade plan`、鉴权失败、限速、参数错误或空返回时显示 partial/failed，并明确“公共轻扫继续运行，但不能生成 CoinGlass 衍生品证据”。
   - Provider 展示命名统一为 `CoinGlass Contract Provider` 和“合约深扫”，避免把用户误导成传统期货业务或把公共交易所数据冒充 CoinGlass 付费数据。

35. **Phase Backend-8：生产 CoinGlass key 安全更新与端点依赖体检（已落地）**
   - 新增 `npm run production:update-coinglass-key`，通过隐藏输入、`COINGLASS_API_KEY`、`COINGLASS_API_KEY_FILE` 或显式剪贴板读取来更新腾讯服务器 `.env.production`；脚本只写服务器环境文件，不把真实 key 写入仓库、聊天、日志或命令输出。
   - 更新前必须校验 key 非空、非占位符、长度合理且不含空白；服务器会自动备份旧 `.env.production`，权限保持 `600`。
   - 更新后默认强制重建 `web`、`scanner-worker`、`coinglass-worker`、`signal-worker`、`dynamic-scan-scheduler`、`macro-worker`，确保新环境变量真正进入容器；仅 `docker restart` 不算完成，因为它可能继续使用旧 env。
   - 更新后自动调用 `POST /api/admin/coinglass/capability` 做受保护体检，只输出 `deepScanStatus`、`providerCanFetchPairMarkets`、`availableDeepEndpointIds`、`blockedDeepEndpointIds` 和 operator hint，不输出任何 secret。
   - 运行态体检必须区分“辅助端点可用”和“当前深扫引擎可用”：当前 provider 依赖 `futures_pairs_markets`，只有该端点 ready 时 `providerCanFetchPairMarkets=true` 且 `canCreateDerivativeEvidence=true`；OI/Funding/Taker 单独 ready 只能作为后续适配候选，不能冒充当前深扫已经可生成交易计划。

36. **Phase Backend-9：前端只读合同缓存与 CoinGlass 全局请求节流（已落地）**
   - 前端 SSR 页面和 `/api/frontend/radar-contract`、`/api/frontend/review-contract` 读取后端合同时，`readPageBackend` 默认使用 `FRONTEND_BACKEND_CONTRACT_CACHE_TTL_MS=5000` 的短缓存和 in-flight 合并，避免 dashboard、signals、home、system、review 等页面和前端 API 在同一次导航里重复读取同一份 snapshot 和 health。
   - 前端全市场公开榜单和 `/api/frontend/leaderboard` 默认使用 `FRONTEND_PUBLIC_MARKET_CACHE_TTL_MS=15000` 的短缓存和 in-flight 合并，避免页面切换时反复拉 Binance/OKX/Bybit public ticker。该缓存只服务页面展示，不是事实源，不写数据库，不改变扫描结果。
   - 新增全局 CoinGlass request pacing：所有 `requestCoinGlass` 调用统一进入进程级队列并遵守 `COINGLASS_REQUEST_INTERVAL_MS`，防止扫描、能力体检、健康探针或 worker 并发时撞穿 Hobbyist 限速。
   - 新增全局 `app/loading.tsx`，页面切换期间明确显示“正在读取后端真实合同，不触发额外 CoinGlass 深扫”，避免用户误以为页面卡死。
   - 已验证：新增 pacing 单测，后续改 CoinGlass client 时必须保持并发请求按间隔串行化。

## 每次继续开发必须遵守

1. 每完成一个阶段向用户汇报：
   - 本阶段是否成功。
   - 改了哪些文件。
   - 验证了什么。
   - 基于当前真实状态，旧计划是否需要调整。
   - 下一阶段是什么，以及为什么现在做它。
2. 能预览就让用户预览。
3. 任何“已完成”必须有验证证据。
4. 不能把骨架说成完整能力。
5. 不能因为上下文压缩丢掉本文约束。
6. 前端大改必须先重新确认信息架构、数据契约和验收标准，再进入实现。
7. 本地预览和浏览器检查需要权限时，先请求授权；未获得授权不能假装已经看过页面。
8. 每次阶段收尾都要清理蓝图：把已经验证完成的条目移出未完成清单；把仍未完成的条目保留原因、下一步和验收方式；如果新方案覆盖旧方案，必须删除或改写旧描述，防止后续按过时计划返工。
