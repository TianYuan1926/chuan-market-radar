# 川 Market Radar 固化蓝图

> 本文是本项目的长期事实源。后续继续搭建、重构、接入数据源、调整 UI、加入 AI 或登录系统时，先检查本文，避免聊天上下文过长导致遗漏或逻辑漂移。

> 长期工程搭建、文档分级、功能准入、删除和验证规则见 `docs/chuan-market-radar-engineering-charter.md`。蓝图只记录产品定位、长期原则、核心边界和重大路线，不作为普通迭代施工日志。

## 一句话定位

川 Market Radar 是一个公开访问的 **Altcoin Trend Radar v3 全市场山寨币趋势切换雷达**，用于从支持合约交易的山寨币中识别震荡压缩、趋势前夜、突破/跌破确认、回踩/反抽确认、趋势加速和衰竭风险，并在好位置、好价格、好盈亏比时给出证据分层、策略计划、失败路径、复盘记录和系统自我进化反馈。

## 不做什么

- 当前不做登录系统。
- 当前不做自动下单。
- 当前不接交易权限，不做自动交易系统。
- 当前不做普通行情站、指标信号站或单纯涨跌幅榜。
- 当前不承诺实时秒级行情。
- 当前不把单一指标当作买卖信号。
- 当前不把 AI 输出当作最终裁决。
- 当前不接入清算热力图，不实现清算区、heatmap provider 或潜在清算区交易模块。
- 当前不把演示数据、缓存数据或缺字段数据说成真实生产级数据。
- 当前不做中国大陆访问专项优化，不做 ICP 备案、大陆云服务器或大陆 CDN 路线；站点继续按 Vercel/海外可访问方案推进，后续最多预留海外/香港镜像作为可选稳定性方案。

## 产品原则

0. **核心目标不可偏移**：网站的一切搭建都必须服务“提前发现山寨币从震荡切换成趋势的机会、解释证据、给出多空策略、管理买卖/失效条件、复盘学习并逐步提高稳定性”这条主线。任何 UI、宠物、彩蛋、AI、告警或数据展示，如果不能增强“扫描 -> 读盘 -> 关键位 -> 证据 -> 风控 -> 策略 -> 复盘 -> 学习”闭环，就必须降级、后置或删除。
1. **专业优先**：市场分析必须区分事实、推理、判断和策略，不能把结论写成玄学。
2. **灵活优先**：BTC 下跌、资金费率偏高、成交量不足等因素只能降权或进入观察，不能一刀切否定所有币种。
3. **证据优先**：每个信号必须能解释为什么出现、为什么不能追、什么条件失效。
4. **稳定优先**：业余版 CoinGlass API 需要低频、缓存、分批、降级和健康状态展示。
5. **可扩展优先**：数据源、分析引擎、AI 复核、复盘、告警、UI 模块必须保持边界清楚，方便后期替换。
6. **公开站点优先**：未登录阶段所有数据使用公共 scope，未来再扩展用户账户、个人 watchlist 和私有日记。
7. **有生命感**：网站可以有像素副驾驶、段位、装备、彩蛋、声音、动画和幽默反馈，但市场判断区域必须严肃；角色反馈只能做情绪、纪律和复盘陪跑，不能替代信号判断。
8. **长期迭代优先**：V3.0 不是最终版，而是专业稳定底座版；后续新增功能、优化功能、替换数据源、调整 UI 或加入登录系统时，必须通过模块边界、测试、迁移和预览验证继续迭代，不能靠堆代码硬加。
9. **路线动态校准**：每完成一个阶段后，必须基于当下真实代码、数据源、验证结果和线上约束重新判断后续顺序；如果旧计划已被部分覆盖、优先级变化或出现更关键风险，后续计划要良性调整，不能机械照搬历史清单。
10. **前端展示优先**：凡是能帮助用户理解“发现了什么、为什么值得看、现在能不能做、还差什么确认、怎么失效、如何复盘”的信息，优先在前端以清晰层级展示；不能只把关键判断藏在后端日志或纯文本里。
11. **v3 趋势切换优先**：后续分析升级优先围绕 Market Reading Engine、Key Level Engine、Forward Level Map、多空双向状态机和复盘验证展开；普通指标、宠物动效、AI 润色和视觉细节不能排在趋势切换能力之前。
12. **系统融合硬规则**：以后所有关于网站搭建、扫描顺序、分析能力、UI 展示、复盘进化、告警、数据源、部署和优化调整的讨论，必须先对照已经搭好的分析板块和蓝图里未完成的分析板块，再决定新增、修改、删除或后置。严禁提出与现有 v2/v3 Evidence、Market Reading、Key Level、Forward Map、Risk Gate、Trade Plan、复盘进化、Universe Registry、Scan Economy 脱节的新方案；严禁让新方案和现有系统“两张皮”。

## 不可偏移核心目标

川 Market Radar 的核心目标不是做一个炫酷面板、宠物小游戏或普通行情站，而是做一个 **合约机会操作系统**：

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

2026-06-17 最新路线：当前项目正式升级为 **Altcoin Trend Radar v3：全市场山寨币趋势切换雷达系统**。这不是推翻现有系统，而是在当前扫描、CoinGlass、Neon、日记、每日异动、outcome executor、Strategy Engine v2 和 Signal Dossier 的基础上继续升级。

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

- 继续使用 Next.js App Router、Vercel、Neon、TypeScript、Node test。
- 继续使用 CoinGlass Hobbyist 低频、分批、缓存、预算保护和失败降级。
- 继续使用公开 OHLCV 源承担 K 线、成交量和基础市场数据，避免浪费 CoinGlass 请求。
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

7. **复盘进化接入**
   - 复盘不只验证交易盈亏，还要验证趋势切换、关键位地图、Forward Map、Risk Gate 和漏判原因。
   - 新增复盘对象：`trend_switch_review`、`forward_map_review`、`key_level_reaction_review`、`risk_gate_review`、`missed_altcoin_review`。
   - 这些复盘样本先进入人工确认和只读校准，不允许自动改真实权重。
   - 2026-06-17 已完成 MVP：`runForwardMapReviewExecutor` 可读取已保存的 v3 事前地图，拉取后续公开 OHLCV，写入 `forward_map_review` 和 `key_level_reaction_review` journal 事件，并记录受保护执行批次；该链路只读，不自动改权重。
   - 2026-06-17 已完成健康摘要 MVP：`/api/health` 现在暴露 `v3ForwardMapReviews`，系统健康面板展示事前地图数量、最近执行、完成/跳过/失败分布、存储迁移状态和只读边界，用于判断 v3 复盘引擎是否真的在运转。若 Neon 还没有迁移 `v3_forward_map_snapshots`，首页必须降级提示“待迁移”，不能 500。

### v3 必须剔除或降级的旧方向

- 剔除“普通行情站/指标信号站/涨跌幅榜网站”定位。
- 剔除“异常数据一出现就给方向”的路径；异常必须进入结构和关键位上下文。
- 剔除清算热力图、清算区、heatmap provider 和潜在清算区交易逻辑。
- 剔除 report generator 自行判断行情。
- 剔除 S680 作为默认宠物、座驾、装备或彩蛋方向；后续组件命名应迁移到像素男性副驾驶。
- 降级所有只增加视觉热闹但不增强扫描、证据、策略、复盘的 UI 或彩蛋。
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

全市场扫描必须分两层：轻扫描覆盖全市场，深扫描只分析候选池。任何全市场深扫、全市场高频 K 线重算或无边界 CoinGlass 请求，都违背 Hobbyist 预算和 Vercel/Neon 免费套餐约束。

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

CoinGlass 深扫不是全市场扫描器，而是资金质量确认器和风险排雷器。每轮深扫名额必须保留防漏网配额，不能全部给已经涨起来的热门币。当前 Vercel/Neon/CoinGlass Hobbyist 边界下，默认建议把深扫名额分配为：BTC/ETH 锚定、作战池跟踪、HOT 明显异动、PRE_TREND 压缩临界、回踩/反抽复活观察、每日异动/漏判复查和冷门探索轮转。具体数量由 `COINGLASS_BATCH_SIZE` 和预算健康动态决定。

当前云端资源只承载“轻扫全市场 + 深扫候选 + 摘要入库”的版本。禁止把系统做成“全市场每个币多周期 K 线 + CoinGlass 深度数据 + 全量原始历史长期入库”的重型数据仓库。Neon 只保存扫描摘要、状态变化、候选晋级原因、Evidence、作战池计划、Forward Map 快照、outcome 结果、missed opportunity 复盘和人工校准记录；无价值原始脏数据、重复快照和全市场分钟级完整历史必须缓存、降采样、过期或不入库。

前端必须展示扫描证明，而不是只展示最终几个币：全市场池数量、各状态池数量、本轮轻扫数量、深扫队列、作战池、复活观察、冷门探索、下一轮深扫计划、被降频/阻断原因和最近漏判复盘结论都应逐步可见。

## 长期运营工程原则

这是长期运营网站，不是一次性页面。后续所有拓展必须保证稳定、流畅、可 DIY、可关闭、可继续优化：

- **稳定优先**：CoinGlass、AI、宠物、彩蛋、声音、动画、浏览器通知任一模块失败，都不能拖垮主雷达、策略判断、复盘写入、系统健康或页面加载。
- **流畅优先**：核心面板先显示，次要模块可延迟、缓存或降级；动效要低负载，遵守 `prefers-reduced-motion`。
- **可 DIY**：扫描频率、扫描币池、告警阈值、静默时段、提示音、副驾驶话痨程度、UI 密度、AI 复核开关、风险偏好和策略观察项，后续应逐步进入配置中心。
- **可关闭**：动效、声音、彩蛋、副驾驶、AI 复核、浏览器通知和实验性策略必须能按模块关闭或降级。
- **模块边界清楚**：数据源层、扫描层、分析层、策略层、复盘层、告警层、UI 展示层、角色/彩蛋层和配置层保持解耦。
- **功能开关优先**：实验性功能先通过 feature flag 或配置边界接入，避免新功能崩掉主线。
- **前端展示不等于前端乱塞**：能展示的要展示，但按决策路径渐进展开：首页显示最该注意的东西，信号档案显示完整证据链，展开层显示细节和历史，复盘层显示学习与策略变化。

## 体验系统原则

后续 UI 不是传统 dashboard，而是 **Living Radar UI 活体雷达界面**：像素情报室、合约雷达台、交易复盘舱的结合体。它要动态、有交互、有可玩性，但所有动态都服务识别机会和理解风险。

### 高级活体雷达控制台

2026-06-16 路线校准：当前前端不是继续小修，而是重建为 **高级活体雷达控制台**。目标不是把所有功能堆在一个页面里，而是让首页成为“正在运转的合约机会控制台”：第一眼看得到系统在扫、扫到了什么、哪些山寨币值得盯、BTC/ETH 大盘天气是否顺风、当前信号离可执行还差什么。

2026-06-17 进一步校准：这次前端工作定义为 **UI Reset**，不是在旧页面上继续加样式类名。后端能力、API、CoinGlass、Neon、扫描、日记、段位、回放和规则引擎保留；首页信息架构、视觉系统、组件壳、动效反馈、像素副驾驶呈现、响应式布局和 CSS 组织重建。正式设计依据见 `docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md`。

2026-06-18 最新校准：用户选定浅色专业工作台参考图作为正式首屏方向。当前 UI Reset 不再追求“像素二次元全屏风格”，而是以 **Light Liquid-Glass Radar Workstation** 为主：银白/冰蓝/深蓝信息工作台、顶部“川 Market Radar”品牌 banner、液态玻璃雷达之眼、运行状态条、市场 ticker、2 : 6 : 2 主 cockpit、中心 Signal Arena、右侧 Action Rail 和小型像素副驾驶 dock。旧的“一页展示所有功能”方向删除，Daily Mover、Journal、Replay、Rank/Evolution 等进入导航、功能抽屉、信号档案或二级页面。

新 UI 骨架规则：

- 技术方向必须真实接入 **Tailwind CSS + daisyUI** 后才能宣称使用；Element UI / Element Plus 只作为组件参考，不作为主实现栈，因为当前项目是 Next.js / React。
- 顶部使用 **Live Navbar / Banner**，承载“川”品牌、扫描心跳、当前市场时段、数据新鲜度、扫描倒计时和关键系统状态。
- 首页主体使用一个融合式 **Cockpit Card**，不是散落卡片墙；桌面端宽度按 **左 / 中 / 右 = 2 : 6 : 2** 组织。
- 左栏承载系统运行、扫描经济、市场时钟、事件流和配置入口；中栏承载机会雷达、Altcoin Opportunity Board、当前选中信号、策略计划和多周期证据；右栏承载 Macro Radar、Signal Lifecycle Tracker、复盘/副驾驶入口和风险边界。
- 用户提供的视觉图作为 **雷达之眼 / Crystal Lens** 方向使用：可以裁切成顶部视觉、启动动画镜头、信号档案封面或微弱材质层；不能整张铺成壁纸，不能压住行情信息，不能把网站变成纯插画页。
- 参考图应体现为顶部品牌镜头和材质系统，不作为全屏背景；首屏必须优先保证行情、信号、关键位、策略和运行状态可读。
- “川”必须是核心品牌符号：logo、启动动画、水印、favicon、雷达刻印或控制台铭牌都要逐步体现，而不是只出现在导航小字里。
- 打开网站可有启动动画和介绍 briefing，但必须短、可跳过、可降级；它解释网站定位、当前扫描状态和风险边界，不做营销页。
- 背景音乐删除：不做常驻背景音乐。后续只保留用户主动开启的提示音/告警音，且必须尊重静默时段、mute 和 `prefers-reduced-motion`。
- 前端要有“活着”的运行反馈：扫描心跳、倒计时、数据闪烁、候选变化、stale 降级、事件流滚动和 session clock。动效只表达状态，不做无意义装饰。
- 首页不承载所有细节。深层证据、日记历史、涨跌榜归因、K 线验证、AI 反证和策略生命周期进入 Signal Dossier、Altcoin Opportunity Board、Macro Radar、Signal Lifecycle Tracker 等专门区域。
- 首页首屏禁止重新堆满 `DailyMoverPanel`、`JournalPanel`、`ReplayPanel`、`RankPanel` 这类完整模块；允许保留聚合入口、摘要数字和打开档案/抽屉的动作。
- 中国大陆访问不作为当前交付目标；不引入 ICP、内地云服务或内地 CDN 约束，避免把 UI 重建和访问合规问题混在一起。

新版首页的最低交付标准：

```text
Live Navbar / Banner
-> Cockpit Card
   -> 左栏：运行状态 / 扫描经济 / 时段时钟 / 事件流
   -> 中栏：Altcoin Opportunity Board / 机会雷达 / 选中信号策略
   -> 右栏：Macro Radar / Signal Lifecycle Tracker / 复盘与副驾驶
-> Signal Dossier 深挖
```

### Signal Dossier 信号档案

信号档案是后续前端融合的核心对象。用户选中一个币或信号后，相关模块围绕同一个上下文联动：

```text
雷达高亮
-> 策略卡切换
-> 图表/TradingView 切换
-> 日记历史聚合
-> 每日异动归因关联
-> 告警状态显示
-> 像素副驾驶反馈
```

打开规则：

- 点击任意信号卡打开完整信号档案。
- 点击像素副驾驶打开当前关注对象或最近异常档案。
- 高级告警只能露出小提示，不自动弹大面板。
- 桌面端使用右侧抽屉，手机端使用底部上滑面板。

信号档案应展示：当前信号状态、多周期证据、v2 证据审计、v3 关键位地图、Forward Map、CoinGlass 衍生品证据、TradingView/K 线入口、日记历史、涨跌榜归因记录、告警状态和副驾驶反馈。

### Scan Economy 扫描经济系统

CoinGlass 业余会员 API 要精打细算地用满：不乱打、不浪费、不省到失去价值。每一次 CoinGlass 请求都必须有用途、有缓存、有复用、有优先级。

- CoinGlass 优先用于最有价值的合约数据：OI、资金费率、合约市场、涨跌榜、爆仓/多空相关数据。
- K 线和基础 OHLCV 优先使用免费公开源，避免浪费 CoinGlass 请求。
- BTC/ETH 锚定币每轮优先，核心山寨较高频，长尾低频轮转。
- 涨跌榜、扫描异常、日记复盘中频繁出现的币可以动态提权。
- 扫描调度采用状态池，不采用硬漏斗；前置层只调整 COLD/WARM/HOT/CANDIDATE/DEEP_QUEUE/BATTLE/COOLDOWN/REVIVE_WATCH 状态、扫描频率和复查条件。
- CoinGlass 深扫必须预留 HOT、PRE_TREND、REVIVE_WATCH、missed opportunity 和冷门探索名额，避免热门币耗尽所有预算导致漏网。
- 同一份扫描结果要复用到雷达、信号档案、告警、日记、复盘和副驾驶反馈，不能各模块重复请求。
- 前端要逐步展示今日请求预算、已用/预计、覆盖率、状态池数量、下一轮扫描计划、当前币池结构和深扫配额去向。

### 像素副驾驶与彩蛋边界

宠物主角确定为 **川的像素男性副驾驶**，气质为“毒舌但靠谱的交易老哥 + 幽默话唠的合约搭子 + 专业雷达员”。它不是图片，而是状态机、台词系统、装备系统和信号联动入口。

- 视觉方向：黑外套、BTC 项链、成熟短发，装备可逐步解锁耳机、扫描眼镜、多屏桌面等。
- S680 从常规宠物和常规 UI 主线删除；除非用户后续重新指定，不再作为默认宠物主体、座驾或装备方向。
- 平时不占空间，作为小头像或轻量入口存在；关键交互时进入信号档案联动。
- 角色台词必须中文、短句、有梗但不幼稚；不喊单、不制造 FOMO、不替代规则引擎。

副驾驶第一版状态机：

```text
idle：待机，呼吸/眨眼
scanning：扫描中，戴耳机看雷达
alert：发现异动，眼睛亮、BTC 项链闪
skeptical：证据不足，斜眼/皱眉
serious：风险高，表情变冷
celebrate：复盘命中，装备闪光
facepalm：追单/无计划，扶额吐槽
sleepy：市场无聊，摸鱼嘴碎
upgrade：段位/装备升级，小动画
```

彩蛋系统第一版必须轻量、可控、跟纪律和市场事件绑定：

- 连续 3 次拒绝追单 -> 纪律台词 + BTC 项链闪。
- 连续 3 次完成复盘 -> 解锁桌面小设备或装备光效。
- 高风险市场 -> 背景轻微警戒动画，副驾驶进入 serious。
- 长时间无高质量机会 -> sleepy 摸鱼台词。
- 段位升级 -> upgrade 动画和装备强化。
- 某币连续多轮异常 -> 信号档案出现“盯紧模式”提示。

彩蛋不能喊单、不能制造 FOMO、不能自动弹大面板、不能干扰主雷达阅读，只能增强纪律、复盘和状态感。

## 版本与长期迭代规则

V3.0 不定义为最终版，而定义为 **专业稳定底座版**。

到 V3.0 时，系统应该具备稳定的核心市场雷达能力、清晰的模块边界、可验证的分析逻辑、可持久化的复盘闭环、可控的告警系统和可继续扩展的 UI 架构。V3.0 之后，项目进入长期迭代阶段，而不是停止开发。

后续版本规则：

- `V3.x`：在稳定底座上做小功能增强、体验优化、提示音包、宠物动作、图表细节、数据展示优化。
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
- 每次上线前必须通过本地验证、构建验证和 Vercel 预览或生产健康检查。
- 如果一个功能会破坏核心市场分析稳定性，必须延期或拆小，不能为了好玩牺牲专业性。

## 交付节奏原则

后续搭建默认使用 **大块交付模式**，减少反复切换和碎片化等待：

- 一轮交付应围绕一个明确业务目标，而不是一个按钮、一个字段或一小段样式。
- 每轮开始前说明：当前阶段、本轮目标、本轮包含哪些小项、为何现在做它。
- 每轮结束后说明：本轮完成、验证结果、GitHub Desktop Summary、下一轮正确顺序、剩余大项。
- 用户默认负责 GitHub Desktop commit/push 和外部账号内必须人工点击的动作；其余本地代码、测试、文档、预览验证由搭建流程完成。
- 测试、类型检查、lint、生产构建和关键 UI 浏览器检查是质量底线，不能为了提速省掉。
- 蓝图只固化核心原则、模块边界、路线变化和重大决策，不记录每个小按钮的施工细节。

## 当前技术栈

- 前端与后端：Next.js App Router
- 部署：Vercel
- 数据库：Neon Postgres
- 数据源：CoinGlass 业余会员 API 为主
- 公开图表：TradingView 链接入口
- 语言：TypeScript
- 测试：Node test + TypeScript 编译测试
- 当前验证命令：
  - `npm run test:market`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

## 资源预算原则

当前默认按 **CoinGlass 业余会员 + Neon 免费套餐 + Vercel 免费套餐** 设计和搭建。

- 功能优先做低频、分批、缓存、可降级版本，不能默认依赖高频扫描、重计算或大量数据库写入。
- CoinGlass 业余会员阶段必须控制请求范围和请求次数，优先白名单资产、分批扫描、复用缓存和展示覆盖率。
- Neon 免费阶段必须控制表结构、索引、写入频率和 payload 体积；能按快照/摘要保存就不做无边界明细流水。
- Vercel 免费阶段不能依赖高频内置 Cron 或长时间后台任务；需要定时刷新时优先外部 cron 请求受保护 API。
- 如果某个功能必须升级付费套餐才能稳定运行，先做开关、降级和健康提示，再由用户决定是否升级。

## 当前阶段状态总览

> 这里区分“基础能力已落地”和“完整专业能力已完成”。基础能力可用不等于生产级闭环已经完成。

| 阶段 | 当前状态 | 还差什么 |
| --- | --- | --- |
| 阶段 1：蓝图固化 | 已完成 | 后续每轮继续维护本文，防止上下文压缩造成遗漏 |
| 阶段 2：真正多周期分析引擎 | 基础已落地，受限主候选已接入真实多周期 OHLCV profile、指标矩阵摘要、基础指标/周期校准、只读权重回测校准 MVP、只读权重变更审计、人工执行记录写入入口、只读 registry 和影子策略权重层 | 尚未完成真实权重生效、交互式多周期图表和全量候选覆盖 |
| 阶段 3：合约 universe registry | 基础、三交易所自动发现、分层币池、低频轮转、覆盖差异、quota 护栏、动态优先级、repository hints、扫描经济前端面板、高优先级候选可观测和交易所覆盖钻取已落地 | 尚未完成状态池调度、二段深度扫描配额、复活观察、冷门探索和完整胜率闭环 |
| 阶段 4：OHLCV、盘面结构与技术指标 | 基础已落地，受限主候选已接入 `1m/5m/15m/30m/1h/4h/1d/1w` candles、MACD、近似成交量分布、指标矩阵摘要、策略卡前端矩阵基础展示、基础指标/周期权重校准、只读权重回测校准 MVP、只读权重变更审计、人工执行记录写入入口、只读 registry 和影子策略权重层；v3 KeyLevel/ForwardMap/Pattern Library 已复用既有 OHLCV 接入 Signal Dossier；Fibonacci 回撤已作为位置/RR 辅助上下文接入 | 尚未完成真实权重生效、交互式多周期图表、更专业的成交量分布模型、完整 Market Reading Engine、谐波辅助层 |
| 阶段 4V3：Altcoin Trend Radar v3 | 定位已确认为“全市场山寨币趋势切换雷达”；Strategy Engine v2 已形成证据、评分、风险门控、报告和只读 UI 接入底座；v3 类型、Key Level Engine MVP、Forward Level Map MVP、forward map review hook、`strategyV3` 只读 Signal Dossier 接入、Forward Map 持久化 MVP、Forward Map review executor MVP、系统健康摘要、Market Reading MVP、结构事实驱动阶段切换、位置/RR 只读门控、回踩/反抽质量、趋势完整度、v3 只读 Trade Plan 草案、Pattern Library MVP、三角压缩/旗形/头肩/Fibonacci 低权重辅助、前端展示、复盘标签、形态/计划复盘统计面板、bucket 样本追溯、ChartPanel 多周期只读上下文、关键位/事前位 drilldown、形态上下文上屏、图表复盘样本联动、Forward Map review 事件联动、系统级 `v3StrategyLoop` 闭环健康摘要和 `strategyEvolutionLoop` 只读进化闭环总控已完成 | 需要补齐更细的图表交互选中态、谐波低权重提示和长期样本后的真实回滚验证 |
| 阶段 5：AI 反证复核 | 边界已落地 | 尚未配置生产模型、多模型对照、成本统计和复盘校准 |
| 阶段 6：自我提升复盘 | 基础已落地，outcome executor MVP、受保护 API、GitHub Actions 外部低频触发、已关闭信号去重、结果覆盖率、执行批次统计、跳过原因分层、复盘面板执行批次详情、样本质量分层、手动校准准入门槛、只读校准流、阻断解释、样本明细、阈值层、人工回滚计划、只读策略权重回测校准、只读权重变更审计、人工执行记录写入入口、只读 registry、影子策略权重层、影子表现评估、v3 trade/pattern 复盘标签、形态/计划复盘统计面板、真实权重启用门禁和策略进化闭环总控已落地 | 尚未完成真实权重接入扫描引擎、真实权重生效和真实回滚验证 |
| 阶段 6B：每日异动归因复盘 | 逻辑、数据源适配器、抓取写入服务、受保护 API、公开只读 API、外部 cron 策略、schema、repository、公开复盘面板、历史样本选择、单样本详情、只读关联摘要、规则校准建议、校准候选入复盘队列、按 tag 汇总的只读校准反馈趋势、人工回测候选链路、历史样本验证层、策略版本草案链路、人工确认记录、确认后表现反馈基础、策略版本长周期表现/回滚边界、阈值画像、手动回滚计划、K 线回测低成本计划边界、K 线缓存持久化、受保护低频填充 MVP、缓存 K 线验证结果、observedAt 事件窗口回测、outcome executor 复盘写回基础、只读权重变更审计、人工执行记录写入入口、只读 registry、影子策略权重层、影子表现评估和真实权重启用门禁已落地 | 尚未完成自动权重调整；自动调整必须等待更多 outcome 样本、真实权重接入扫描引擎和真实回滚验证更成熟 |
| 阶段 7：告警系统 | 网页内基础、站内事件、重复抑制、静默时段、浏览器通知、提示音和 Settings 抽屉本地告警控制已落地；明确不接 Telegram/Webhook | 尚未完成告警历史持久化、站内事件中心筛选归档和更细提示音音色 |
| 阶段 8：UI 质感深化 | 第一轮、Living Radar 第二轮、Tailwind/daisyUI 基础、2026-06-18 Light Liquid-Glass Radar Workstation 首屏重构、Phase 8.2f Functional Navigation / Drawers、Phase 8.2g Startup Briefing / Brand Motion、Phase 8.2h Signal Dossier Visual Upgrade、Phase 8.2i Pixel Copilot Motion And Equipment、Phase 8.2j ChartPanel Professional Visual Interaction 和 Phase 8.2k Chart Realism And Key-Level Drilldown 已落地；顶部品牌 banner、雷达之眼、运行状态条、ticker、2 : 6 : 2 cockpit、Signal Arena、候选横条、首屏主图、Action Rail、真实导航抽屉、启动 briefing、证据室式信号档案、紧凑像素副驾驶 dock、主图焦点交互和只读 K 线真实感层已接入；桌面 1536x1024 与移动 390x844 生产模式浏览器 QA 已通过；隐藏抽屉、隐藏档案和装饰扫描光束不再制造横向滚动；旧 S680 可见方向和首屏全功能堆叠已剔除 | 阶段 8 已收束，后续 UI 只做跟随核心功能的必要精修，主线优先回到全市场扫描、数据质量、策略引擎和复盘闭环 |

## 当前已落地模块

### 已落地：公开网站基础

- Next.js 项目结构已建立。
- Vercel 项目已连接 GitHub 仓库。
- 生产访问地址已生成。
- 页面首屏现在以主雷达工作台为核心：顶部品牌/运行状态、市场 ticker、左侧雷达控制台、中央信号竞技场、候选横条、主图/策略计划、右侧行动栏、功能抽屉、Macro Weather、生命周期预览和紧凑像素副驾驶 dock。复盘日记、段位、扫描回放、每日异动归因等完整模块不再全部堆在首屏，而是通过导航、功能抽屉、信号档案或二级页面承接。
- 信号档案基础已落地：点击候选池、信号地图、热区匹配项或像素副驾驶可打开同一标的档案；桌面为右侧抽屉，移动端为底部上滑面板；档案复用现有扫描、日记、每日异动、告警、TradingView 链接和 v3 关键位地图，不新增 CoinGlass 请求。

### 已落地：CoinGlass 数据接入骨架

- `MARKET_DATA_PROVIDER=coinglass` 且 `COINGLASS_API_KEY` 存在时启用 CoinGlass provider。
- `COINGLASS_BASE_ASSETS` 控制扫描资产白名单。
- `COINGLASS_BATCH_SIZE` 控制每轮请求数量。
- `COINGLASS_DAILY_REQUEST_BUDGET` 控制主扫描每日 CoinGlass 请求预算，默认按业余会员阶段保守值 `300` 估算。
- 15 分钟 cadence 下分批扫描，降低触发业余会员限速的概率。
- Provider 失败时可以使用缓存并显示 stale 状态。
- 主扫描已加强数据清洗：拒绝 UNKNOWN 交易所、拒绝非 USDT 或报价字段冲突的合约行，并按同币种选择主交易所输出，避免重复信号刷屏。
- 主扫描已输出数据质量审计样本：metadata notes 会记录原始拒绝样本、重复币种聚合组数、主信号选择规则和样本，如 `TIAUSDT selected BINANCE over OKX/BYBIT by exchange_priority_then_volume_oi`。
- 扫描 metadata notes 会显示 raw、clean、primary 数量，以及 unsupported exchange、unsupported quote、duplicate symbol 等过滤原因。

### 已落地：Neon 持久化骨架

- `journal_events`：复盘日记、纸面跟踪、拒绝追单、失效记录。
- `scan_archives`：扫描快照、回放 frame、最近扫描对比。
- `v3_forward_map_snapshots`：随扫描归档保存的 v3 Key Level / Forward Map 只读快照，用于复盘验证事前地图是否命中；该表不允许驱动实时排序或自动调权。
- `rank_profiles`：段位、XP、纪律分、宠物状态。
- `daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`：每日涨跌幅榜归因复盘样本。
- `DATABASE_DRIVER=neon` 且存在 `DATABASE_URL` 时可创建 Neon SQL client。
- 管理迁移接口受 `CRON_SECRET` 保护。

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
- 已支持长尾低频抽样轮转：在 `COINGLASS_BATCH_SIZE=3` 这类小批次下，BTC/ETH 固定保留，core 优先轮转，long_tail 默认每 8 个扫描窗口抽样一次，避免 CoinGlass 业余会员被全市场发现打爆。
- 已支持多交易所覆盖差异分类：`major_three`、`multi_exchange`、`single_exchange`、`unlisted`。
- `metadata.coverage.exchangeCoverage` 会记录每个币种在哪些交易所有 USDT 永续，`exchangeCoverageSummary` 会输出覆盖质量汇总。
- 已支持交易所覆盖钻取：`/api/health.fullMarketCoverage.exchangeDrilldown` 会把三所共振、多所覆盖、单所观察和发现缺口拆成只读行，输出样本、动作建议、过滤样本和“不会触发额外请求”的护栏；健康面板已展示该钻取区块。
- 已支持 API quota 消耗估计：每轮 CoinGlass 请求数、每日 CoinGlass 预估请求数、剩余请求估算、public discovery 预估请求数、预算使用率和状态。
- 已支持扫描预算护栏：当 `COINGLASS_BATCH_SIZE` 超过每日预算允许值时，自动压缩为安全批次；若预算低于 BTC/ETH 锚点最低扫描需求，会标记 `over_budget`，但不破坏锚点扫描。
- 已支持动态优先级基础：universe scan plan 可接收 `priorityHints`，按异常分、历史胜率样本、近期信号、流动性和交易所覆盖质量生成动态分数；动态候选只能占用非 anchor 轮转槽，不能挤掉 BTC/ETH，也不能突破 quota 批次。
- 已支持高优先级候选可观测：`dynamicPriority` 会输出候选数、可用槽位、已用槽位、选中/排队状态和原因计数；`/api/health.fullMarketCoverage.highPriority` 与健康面板会显示高优先级槽位、选中标的、排队标的和证据来源。该能力只复用扫描 metadata，不增加 CoinGlass 请求量。
- 已支持 repository priority hints 基础：扫描归档 top symbols 提供近期热度，复盘 journal outcome 提供历史有效性，每日异动归因样本提供 learnable 异常热度；默认 CoinGlass provider 创建前会从 repository 读取这些样本并注入 `priorityHints`。
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
| `15m` | 异动发现层 | 主扫描周期之一，用于发现量价/OI/清算变化 |
| `30m` | 异动稳定层 | 过滤 15m 假信号，判断是否开始形成结构 |
| `1h` | 结构判断层 | 判断趋势、箱体、关键位、失败路径 |
| `4h` | 大结构层 | 判断行情是否处于关键供需、突破边缘或中部噪音 |
| `1d` | 环境边界层 | 判断大方向、波动阶段、是否处于大级别风险区 |
| `1w` | 宏观边界层 | 只用于大背景，不用于短线触发 |

核心规则：低周期负责触发，高周期负责边界，中周期负责发现异动。任何单周期都不能独立决定交易。

### 未完整落地：全市场合约覆盖

当前已经有 universe registry、覆盖率、锚点固定、轮转扫描计划、主扫描质量过滤、Binance/OKX/Bybit public USDT 永续自动发现、分层币池、长尾低频轮转、多交易所覆盖差异、API quota 护栏、动态优先级基础和 repository priority hints。资产池已不只依赖 `COINGLASS_BASE_ASSETS`；Phase 3.10 已把全市场覆盖深度、当前批次、预计轮转周期、三所覆盖质量、已扫/待轮转样本和只读边界接入 `/api/health` 与健康面板；Phase 3.11 已把 raw / clean / primary、UNKNOWN、非 USDT、重复币种、流动性门槛、过滤样本和质量分结构化为 `marketDataQuality`；Phase 3.12 已把高优先级候选槽位、选中/排队状态和原因计数接入扫描 metadata、`/api/health` 与健康面板；Phase 3.13 已把三所共振、多所覆盖、单所观察、发现缺口、过滤样本和覆盖动作接入 `/api/health.fullMarketCoverage.exchangeDrilldown` 与健康面板；Phase 3.14 已把 CoinGlass 原始拒绝样本、重复币种聚合组、主信号选择规则和聚合样本接入 `marketDataQuality.primarySelection` / `rejectedRowSamples` 与健康面板。当前仍未完成状态池调度模型、预算稳定后的二段深度扫描配额、复活观察、冷门探索，以及依赖自动 outcome executor 的完整胜率闭环。

后续需要：

- Binance/OKX/Bybit 支持合约交易币种列表已具备自动发现基础。
- 多交易所覆盖状态已具备基础分类和 metadata 输出。
- API quota 消耗估计和批次护栏已具备基础实现。
- 将主扫描的质量分类器复用到每日异动、全市场发现和后续扩展池。
- 低优先级币种更长期轮转扫描已具备基础策略，动态优先级接口和 repository hints 已具备，后续需要在 outcome executor 完成后继续提高历史胜率样本质量。
- 高优先级候选的 quota-safe 插队和页面解释已具备；更高频或更深度的二段扫描需要在外部 cron、预算监控和失败回退稳定后按预算打开。
- 不同交易所同一币种的覆盖数量、UNKNOWN、非 USDT、重复币种、基础过滤原因、原始拒绝样本、主信号聚合原因和覆盖动作已在健康面板展示；后续重点转向状态池调度、二段深度扫描边界、深扫配额、复活观察、冷门探索与历史胜率闭环。
- 状态池调度、复活观察、冷门探索和深扫配额尚未完整落地；后续必须先把“降频不删除、强异常插队、漏判样本复活、热门不独占预算”作为扫描调度核心，而不是单纯提高批次数量。

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

v2 硬边界：不接入清算热力图，不构建清算区模块，不把潜在清算区作为目标位、入场位、止损位或方向依据；常规清算统计最多作为风险背景，不能单独进入方向判断。

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
- Signal Dossier 会展示中文形态名、置信度、权重上限、第一条证据和失效提示；ChartPanel 会在主图上下文里显示主形态、权重边界和第一条证据，让前端能确认盘面结构层正在运转。
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

当前已经完成 AI 复核边界、输入白名单、OpenAI-compatible 请求、失败降级、预算护栏和 UI 状态展示；但生产环境还没有实际配置模型 API，也没有做多模型对照、成本统计和复盘校准。

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

可接入模型：

- OpenAI GPT 系列。
- DeepSeek 系列。
- 其它兼容 OpenAI API 格式的模型。

模型选择原则：

- 市场分析不是刚好能用就行，优先稳定、推理、可控、可审计。
- 成本必须有 budget guard。
- 失败时系统必须回落到规则引擎，不允许页面崩溃。

仍未完整落地：

- 生产环境真实模型配置。
- OpenAI/DeepSeek 多模型切换对照。
- 每日/每轮成本统计。
- AI 复核结果进入后续复盘评分。
- AI 复核质量的自我校准。

### 部分落地：复盘自我提升

当前已有日记、段位和宠物，并已完成信号生命周期复盘基础层：

- 新信号进入跟踪/纸面跟踪时，会自动挂上 `1h / 4h / 24h` 复查节点。
- `outcome-tracker` 可以根据后续 K 线判断：
  - 首目标先到：记为 `partial_win`。
  - 触发前先失效：记为 `saved`，奖励纪律。
  - 触发后先失效：记为 `loss`。
  - 24h 后仍未触发：记为 `expired`，不奖励段位。
- 复盘结果会进入 journal payload，并通过 `outcome_status` 支持数据库查询。
- 日记面板会展示当前 outcome、下一次复查时间、触发/失效/首目标命中状态和 lesson tags。
- `runOutcomeExecutor()` 已能读取数据库中的待复查 tracking journal，按 checkpoint 使用公开 OHLCV 评估信号生命周期，并写回 lifecycle journal event。
- `POST /api/admin/outcomes/run` 已通过 `CRON_SECRET` 保护；`.github/workflows/chuan-outcome-executor.yml` 会每小时低频触发该入口，并从已有 `CHUAN_SCAN_URL` 推导 outcome executor URL，适配 Vercel 免费套餐不能依赖高频内置 Cron 的边界，也避免新增 GitHub secret。
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
- CoinGlass 榜单行适配器：可把 futures market rows 标准化为 `DailyMoverSnapshot`。
- CoinGlass 每日异动抓取服务：按配置资产低频请求榜单、构建快照并写入 repository。
- 受保护 API 入口：`POST /api/admin/daily-movers/ingest`，必须带 `Authorization: Bearer <CRON_SECRET>`。
- 公开只读 API：`GET /api/daily-movers` 可读取最新样本、按 `id` 查询历史样本，并输出轻量摘要列表。
- GitHub Actions 外部 cron：`.github/workflows/chuan-daily-movers.yml` 每日低频触发受保护 API。
- 持久化 schema：`daily_mover_snapshots`、`daily_mover_assets`、`mover_attribution_reviews`、`radar_miss_reviews`。
- repository 写入和查询：`addDailyMoverSnapshot()`、`listDailyMoverSnapshots()`、`getDailyMoverSnapshot()`。
- 公开雷达 UI 入口：每日异动能力保留为 Review / Evolution / 功能抽屉 / Signal Dossier 的研究入口；完整 `DailyMoverPanel` 不再常驻首页右侧信息栈，避免首页重新变成全功能堆叠。
- 只读关联摘要：`GET /api/daily-movers` 会为选中样本生成 `selectedCorrelation`，把每日异动 review 与最近扫描归档、扫描 replay signal、复盘日记做 bounded 关联，输出 `caught_with_journal`、`caught_unreviewed`、`missed_with_evidence`、`not_learnable`、`unlinked` 等状态。
- 关联摘要 UI：每日异动关联状态继续作为复盘/进化层能力，后续应在二级页面或信号档案中展示扫描关联、日记关联、校准候选数量，以及命中已复盘、命中待复盘、漏判有证据、不可学习等状态。
- 历史样本和单样本详情：完整历史样本切换、选中样本详情和“为什么漏判/下一步复核”的只读说明，应放在 Review/Evolution 二级页面或抽屉中，不回到首页常驻。
- v3 漏判复盘 MVP：`GET /api/daily-movers` 会把选中每日异动样本中的漏判样本与已保存的 `v3_forward_map_snapshots` 做只读关联，生成 `missed_altcoin_review`；前端展示必须强调事前 v3 地图证据、证据 id 数量和不改权重边界。该层不新增 CoinGlass 请求、不新增写入、不自动调权。
- 只读规则校准建议：`missed_with_evidence` 已聚合为校准候选建议，并在 UI 中明确“不自动改权重”。
- 校准候选入复盘队列：`DailyMoverPanel` 可把校准候选以 `calibration_review` 写入 `journal_events`；该事件进入跟踪队列、记录 `calibrationTag` 和样本币种，但 rank 分数保持 0，不能自动调整策略权重。
- 只读校准反馈趋势：`GET /api/daily-movers` 会从 bounded `journal_events` 中汇总 `calibration_review`，按 `calibrationTag` 输出待复查、有效、反证、过期样本数；`DailyMoverPanel` 只读展示，不提供自动调权重入口。
- 人工回测候选链路：`GET /api/daily-movers` 会从 `calibrationFeedback` 派生 `backtestCandidates`，按 `ready / collecting / blocked` 标记是否具备人工回测条件；`DailyMoverPanel` 只读展示候选样本、有效/反证统计和人工确认边界，`allowedUse` 保持 `research_only`，`canAutoAdjustWeights` 固定为 `false`。
- 历史样本验证层：`GET /api/daily-movers` 会从 `backtestCandidates` 和已存 `DailyMoverSnapshot` 派生 `backtestValidations`，输出日记验证数、历史样本数、有效率、抓到率、结论和限制说明；这只是已存样本验证，不是完整 K 线回测，`canAutoAdjustWeights` 固定为 `false`。
- 策略版本草案链路：`GET /api/daily-movers` 会从 `backtestValidations` 派生 `strategyDrafts`，记录候选规则、验证结果、限制条件、草案版本名和人工确认状态；`DailyMoverPanel` 只读展示策略草案，不自动调整权重。
- 策略版本人工确认记录：`DailyMoverPanel` 可把 `manual_review_required` 草案以 `strategy_confirmation` 写入现有 `journal_events`，`GET /api/daily-movers` 会汇总 `strategyConfirmations` 并把匹配草案标记为已确认；该记录是低写入审计链路，不新增表、不触发 CoinGlass 请求、不改变规则权重。
- 策略确认后表现反馈：`GET /api/daily-movers` 会从 `strategyConfirmations` 和确认后的 `calibration_review` 日记派生 `strategyPerformanceFeedback`，统计后续样本、有效、反证、待复查和只读状态；`DailyMoverPanel` 展示“确认后表现”，不新增表、不触发 CoinGlass 请求、不自动调整权重。
- 策略版本长周期表现/回滚边界：`GET /api/daily-movers` 会从 `strategyPerformanceFeedback` 派生 `strategyVersionPerformance`，输出版本名、确认时间、后续样本窗口、已验证样本数、有效率、反证率、待复查数、阈值画像、手动回滚计划和 `awaiting_samples / retain_observation / manual_review_required / rollback_watch` 状态；`DailyMoverPanel` 展示“版本表现”“阈值画像”“回滚边界”和“回滚计划”，仍只读、不新增写入、不自动改权重。
- K 线回测计划边界：`GET /api/daily-movers` 会输出 `klineBacktestPlan`，从 `backtestCandidates` 和已存每日异动样本生成 planning-only 的缓存计划，包含候选状态、计划币种、周期、缓存键、预算封顶和 deferred symbols；`canFetchExternalCandles` 固定为 `false`，`requiresCacheBeforeExecution` 固定为 `true`，数据源策略固定为 `public_ohlcv_cache_only_no_coinglass`。
- K 线缓存持久化：新增 `ohlcv_candle_cache` 表、repository 读写方法和内存/Neon 双路径实现，用 `scope + symbol + interval` 做缓存键，保存公开 OHLCV candles、来源、拉取时间和样本边界。
- 低频 K 线缓存填充 MVP：新增 `runDailyMoverKlineCacheFill()` 和 `POST /api/admin/daily-movers/klines/fill`，必须带 `Authorization: Bearer <CRON_SECRET>`；默认从 repository 生成计划，只拉公开 Binance Futures OHLCV，不占用 CoinGlass 请求，跳过已有缓存，并受 `KLINE_BACKTEST_DAILY_REQUEST_BUDGET` 和 `KLINE_BACKTEST_MAX_SYMBOLS_PER_RUN` 封顶。
- 缓存 K 线验证结果：`GET /api/daily-movers` 会输出 `klineBacktestResults`，只读取 bounded `ohlcv_candle_cache`，计算缓存覆盖率、周期涨跌幅、最大冲高、最大回撤和量能变化；结果保持 `cached_kline_validation`、`research_only`、`canAutoAdjustWeights: false`，不触发外部请求。
- observedAt 事件窗口回测：`klineBacktestResults.eventWindowResults` 会按每日异动样本的 `observedAt` 把已缓存 candles 拆成 pre/post 窗口，输出样本方向、pre/post K 线数量、post 回撤/冲高、量能扩张和 `post_move_confirmed / pre_move_evidence / neutral / window_missing` 判定；该结果仍只读、不触发外部请求、不自动调权重。
- 免费套餐护栏：关联摘要最多读取 12 个扫描归档和 80 条日记，只做只读聚合，不新增表、不增加 CoinGlass 请求、不增加数据库写入频率。
- outcome executor 复盘写回基础：待复查 journal 可经受保护 API 和外部 GitHub Actions 低频触发，使用公开 OHLCV 评估 partial win、saved、loss、expired，并把结果写回 journal/rank；健康面板已展示覆盖率、待复查、到期、最近写回、最近执行批次、失败原因摘要、样本质量分层、只读阈值层、人工回滚计划、策略权重回测候选、只读权重变更审计、人工执行记录写入入口和 registry；该链路不占用 CoinGlass 请求预算，不自动改权重。
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
- Settings 抽屉已新增 `AlertControlPanel`，可在站内切换最低信号等级、提示音、浏览器通知、静默时段和 5m/8m/15m 去重窗口。
- `buildAlertControlReport()` 固定输出 `allowedUse: "in_app_only"`，`canUseTelegram=false`，`canUseWebhook=false`，避免后续把外部推送误当作当前阶段目标。

后续需要：

- 告警历史持久化。
- 站内事件中心筛选与归档。
- 提示音音色、音量和更多静默规则细化。

### 未完整落地：UI 精细化

当前 UI 方向已经比早期更接近像素二次元风格，但还不是最终质感。2026-06-14 已完成第一轮质感深化：加入页面扫描网格、候选信号节奏条、早期像素 telemetry 仪表，并保留 `prefers-reduced-motion` 降级。

2026-06-14 V1.6 已继续完成第一轮中文化和早期宠物基础重画：

- 雷达面板、策略、系统状态、事件中心、复盘、回放、段位和宠物的主要 reader-facing 控件改为中文优先。
- 复盘面板未选中标的时显示“未选择”，不再显示英文空态。
- 早期宠物不使用普通图片，继续由 CSS 像素结构绘制，并新增角色脸、眼睛和地面影子。
- 新增 repository hygiene 测试约束中文化锚点和像素结构件，避免后续回退。

2026-06-14 新增角色方向：宠物本体从早期车辆方向升级为 **川的像素男性副驾驶**。2026-06-16 已进一步确认：S680 从常规宠物和常规 UI 主线删除，除非用户后续重新指定，不再作为默认宠物主体、座驾或装备方向。新角色方向如下：

- 男性像素小人，中文语境下像“坐在交易桌旁的话唠队友”，不是幼稚吉祥物。
- 核心识别物是一颗 BTC 项链，初始装备必须能一眼看出加密市场属性。
- 角色可以随着段位和 XP 提升获得装备，类似打怪升级：
  - 初始：短发或像素帽、黑色外套、BTC 项链。
  - 进阶：耳机、手套、战术背心、段位徽章、屏幕眼镜。
  - 高阶：金色项链强化、披风、专属扫描仪、冠军外套、多屏桌面。
- 角色必须有情绪状态：巡航、警戒、刹车、兴奋、复盘、数据延迟、纪律表扬。
- 角色是幽默话唠，但必须服务纪律提醒和复盘反馈；不能喊单、不能替代规则引擎、不能在严肃市场判断区抢戏。
- 角色台词风格：中文、短句、毒舌但不冒犯、像纪律教练。例如“别硬开，市场不是你家提款机”“你这不是进场，是给别人结账”“情报断了，先别装诸葛亮”。

2026-06-17 V1.8 已落地像素副驾驶 MVP，并完成 S680 可见方向剔除：

- `PixelCopilot` 作为正式组件边界，宠物主角为男性像素副驾驶；正常 UI 不再导入或展示旧 S680 座驾方向。
- 初版已包含 BTC 项链、基础装备条、巡航/警戒/刹车 3 个情绪状态和纪律型话唠台词。
- S680 不再作为默认宠物、座驾、装备、皮肤或彩蛋方向；后续如果重新启用，必须由用户明确指定并作为独立可关闭实验项。
- 新增测试约束副驾驶结构、中文标签和禁止喊单边界，避免后续回退。

2026-06-18 已按用户选定参考图完成首屏 UI Reset 基础版，并完成 Product Design QA：

- 顶部 `TopRadarBar` 改为浅色 Live Navbar / Banner，包含“川 Market Radar”、液态玻璃雷达之眼、主导航、扫描倒计时、数据新鲜度、市场时段、请求预算、ticker 和运行矩阵。
- `radar-workspace.tsx` 不再把 DailyMover、Replay、Journal、Rank 等完整模块堆在首屏；首页改为左侧雷达控制台、中央信号竞技场、候选横条、首屏主图、右侧 Action Rail 和功能抽屉。
- `PixelCopilot` 改为紧凑 companion dock，只作为右侧轻量助手入口，不再占用大面积面板。
- `TopRadarBar` 的雷达之眼图片按首屏 LCP 处理为 `priority + loading="eager"` 资源；桌面 1536x1024 与移动 390x844 已用浏览器截图检查，无控制台错误、无 LCP warning、无候选文字遮挡。

2026-06-18 Phase 8.2f 已完成 Functional Navigation And Drawers：
- `TopRadarBar` 的 Radar / Signals / Review / Journal / Evolution / Settings 已从静态按钮升级为真实导航状态；Radar 关闭抽屉回主控台，其余入口打开对应工作区抽屉。
- 右侧 Action Rail 的功能抽屉入口已可点击，并与顶部导航共享同一 `activeSection`。
- Signals 抽屉承接候选池、信号档案入口和当前策略卡；Review 抽屉承接扫描回放与每日异动复盘；Journal 抽屉承接交易日记和形态复盘统计；Evolution 抽屉承接段位、策略校准和每日异动策略版本表现；Settings 抽屉承接系统健康状态。
- `DailyMoverPanel` 的人工校准入队和策略草案人工确认已接入现有 `/api/journal`，只写入复盘/确认记录，不自动交易、不自动改权重、不改变实时排序。
- 完整 DailyMover / Replay / Journal / Rank / SystemHealth 能力不再常驻首页首屏，而是通过 drawer 按需打开，避免 UI 回到“一页堆满所有功能”的旧问题。

2026-06-18 Phase 8.2g 已完成 Startup Briefing And Brand Motion：
- `RadarBootBriefing` 从旧的小提示条升级为首访启动 briefing：使用液态玻璃雷达之眼资产、`川` 品牌标识、短扫描动效和真实运行状态，解释“全市场山寨趋势切换雷达”的定位。
- 启动层展示当前数据源、扫描状态、覆盖率、候选数、扫描 cadence、下轮扫描时间、市场时段、请求预算和系统健康；不新增 CoinGlass 请求。
- 启动层支持 `localStorage` 记住跳过状态，提供“进入雷达 / 查看信号池 / 看复盘链路”三个功能入口，且入口会联动现有 drawer。
- 动效遵守全局 `prefers-reduced-motion` 降级；继续明确不做背景音乐、不做喊单、不自动下单。
- 当前已经通过 `npm run test:market`、`npm run lint`、`npm run build` 和单独 `npm run typecheck`；`design-qa.md` 记录本轮视觉验收，最终结果为 `passed`。后续还需要继续做 Signal Dossier 视觉精修、像素副驾驶装备动效和更专业的真实图表表现。

2026-06-18 Phase 8.2h 已完成 Signal Dossier Visual Upgrade：
- `SignalDossier` 从旧式竖向资料堆叠升级为浅色液态玻璃证据室：顶部新增决策总览、策略状态速览、v3 证据路径和计划边界，方便先看“能不能做、为什么、还差什么确认”。
- v3 关键位地图、Forward Map、趋势上下文、位置/RR、回踩/反抽、趋势完整度、计划草案和形态辅助继续保持只读展示，不新增 CoinGlass 请求、不改变 live ranking、不自动交易。
- 执行策略、证据链、每日异动关联、复盘记录、告警状态和副驾驶纪律被分成更清晰的功能区，继续围绕同一标的上下文联动，避免首页重新堆满细节。
- 移动端继续保持底部上滑档案形态；桌面端保持右侧深挖抽屉。后续正确顺序转为 Phase 8.2i 像素副驾驶装备/动效，再推进更专业图表和交互式关键位选中态。

2026-06-18 Phase 8.2i 已完成 Pixel Copilot Motion And Equipment：
- `PixelCopilot` 保持右侧紧凑 dock，不扩张成大宠物面板；新增动作状态条、装备槽、雷达点、mini desk、“川”刻印和 BTC 项链发光。
- 动效只表达运行状态：低噪巡航、异动侦测、纪律制动、眨眼、呼吸、轻微操作动作；不表达收益承诺、不替代信号判断、不输出买卖方向。
- 装备解锁由段位/XP 驱动，服务纪律反馈和复盘陪跑；锁定装备明确显示为成长路径，避免一次性堆满皮肤。
- 样式继续遵守 `prefers-reduced-motion`；移动端保持小尺寸，不遮挡候选池、图表和行动栏。后续正确顺序转为更专业的 ChartPanel 真实图表表现和关键位交互选中态。

2026-06-18 Phase 8.2j 已完成 ChartPanel Professional Visual Interaction：
- `ChartPanel` 新增盘面焦点切换：走势、关键位、前方位、复盘样本，允许用户在同一主图里聚焦当前关键位、Forward Map 和复盘样本。
- 新增只读 overlay：关键位线、前方位线、复盘点和焦点提示，帮助判断系统是否在运转，而不是只看静态示意图。
- v3 key level 和 forward level 卡片变为可点击焦点入口；review sample 也可以切换到复盘焦点，但只做人工复核入口。
- 该阶段不新增 CoinGlass 请求、不自动下单、不改排序、不自动调权。后续正确顺序是继续提升图表真实感：更密 K 线、成交量质量、关键位与复盘样本 drilldown。

2026-06-18 Phase 8.2k 已完成 Chart Realism And Key-Level Drilldown：
- `ChartPanel` 新增只读 K 线预览层、成交量质量层、POC / VOL / FLOW 体感指标和图上关键位标签，让首页主图不再只是静态折线。
- 关键位和 Forward Map 的图上标签继续复用现有 v3 上下文；没有真实 v3 样本时显示“等待样本”，不伪造关键位。
- 该层只增强前端阅读体验，不替代 TradingView、不新增 CoinGlass 请求、不自动生成交易指令、不改变 live ranking。
- UI 方向阶段性收束。后续正确顺序切回核心能力：全市场扫描深化、数据质量清洗、v3 实战闭环、复盘进化和站内告警设置。

2026-06-18 Phase 8 Final Acceptance Closeout 已完成：
- 第 8 步已按生产模式完成阶段收口验收：`next build --webpack` 后用 `next start --port 3002` 验证桌面 1536 x 1024 和移动 390 x 844。
- 桌面验收覆盖：启动介绍、`川` 品牌、顶部雷达 banner、运行状态层、Settings 抽屉、Signals 抽屉和横向溢出检查。
- 移动验收覆盖：启动介绍持久化、Settings 抽屉、Signal Dossier bottom sheet、`川` 品牌和横向溢出检查。
- 已修复隐藏 UI 层验收问题：关闭态 workspace drawer、关闭态 Signal Dossier 和装饰扫描光束不再撑大 `body.scrollWidth`。
- 第 8 步关闭后，UI 只跟随核心功能做必要精修；不再把视觉打磨放在全市场扫描、数据质量、策略引擎和复盘闭环之前。

最终 UI 方向：

- 主视觉是浅色专业液态玻璃雷达工作台，不是传统后台表格，也不是低龄像素游戏页。
- “川”是核心品牌符号，顶部、启动动画、favicon、雷达刻印和关键入口都应逐步体现。
- 用户提供的液态玻璃图像用于雷达之眼、启动镜头或材质层，不能铺满成壁纸、遮挡行情或削弱专业度。
- 首页必须有运行感：心跳、倒计时、ticker、数据新鲜度、候选变化、stale 降级和 session clock。
- 首页不展示所有功能；完整复盘、每日异动、段位、回放、AI 反证和策略进化进入导航、功能抽屉、信号档案或二级页面。
- 宠物主角是男性像素副驾驶，以 BTC 项链、装备升级、情绪话唠和纪律反馈为核心；它是互动层，不是主信息架构。
- S680 从常规 UI 主线删除，不作为默认宠物、座驾、装备或皮肤方向。
- 严肃区域严肃，彩蛋区域有趣；任何动效必须服务状态理解或纪律反馈。

后续前端 UI 工作原则：

- 进入前端 UI 设计、重构或大视觉改动前，默认使用 Product Design 工作流。
- Product Design 先确认设计简报，再做视觉方案或三种方向探索；方向确认后再进入实现。
- 如果是小范围文案、bug 或样式修补，可以直接按现有设计系统修，不必重新发散。
- UI 改动必须本地预览，优先用 Browser/Playwright 检查桌面和移动端；若权限阻断，必须在汇报中说明。
- UI 不能为了角色趣味破坏核心市场分析稳定性、可读性和状态边界。

## 分析逻辑总框架

每个信号必须经过九层检查：

1. 数据质量：字段是否足够、是否新鲜、是否来自真实 provider。
2. 市场锚点：BTC/ETH 是顺风、逆风、震荡还是未知。
3. 多周期结构：低周期触发是否被高周期位置支持。
4. 量价行为：放量、缩量、异常成交、突破或假突破。
5. 合约衍生品：OI、资金费率、清算、持仓拥挤。
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

- 用于合约市场、OI、资金费率、清算、成交量等衍生品相关字段。
- 必须低频分批。
- 必须显示覆盖率和新鲜度。
- 不能为了全市场覆盖一次性打满请求；先覆盖核心白名单，再逐步扩展。

### 免费补充数据源

可优先接入公开交易所行情：

- Binance public futures klines。
- Binance public 24h ticker。
- OKX public market candles。
- Bybit public market candles。

这些免费数据主要用于 OHLCV、多周期 K 线和技术指标，不替代 CoinGlass 衍生品数据。

## Vercel 与稳定性原则

- 免费阶段不依赖 Vercel 15 分钟内置 Cron。
- 使用外部 cron 请求 `/api/scan`。
- 使用外部 cron 每日低频请求 `/api/admin/daily-movers/ingest`。
- K 线缓存填充只通过受保护入口 `/api/admin/daily-movers/klines/fill` 低频触发，默认小预算、缓存优先，不占用 CoinGlass 请求。
- API 层必须缓存。
- 页面刷新不等于每次重新打 CoinGlass。
- 后台任务必须短、可重试、可降级，不能假设免费套餐有长时间常驻 worker。
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

以下顺序从 2026-06-14 当前代码状态出发。已经完成基础层的阶段不再按“从零搭建”理解，后续工作应围绕深化、接入真实数据、生产稳定性和 UI 精细化继续推进。

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
- 有 `COINGLASS_DAILY_REQUEST_BUDGET` 环境变量，默认 `300` 请求/日。
- 有 `/api/health` 的 `scanEconomy` 只读摘要：今日预算、预估请求/轮、预估日请求、剩余额度、批次压缩、层级覆盖和下轮重点。
- 有系统状态面板“扫描经济”区块，解释为什么 CoinGlass 业余会员阶段不能每 15 分钟全市场全扫。
- 有 `priorityHints` 动态优先级入口，可按异常程度、历史有效性、近期信号、流动性和交易所覆盖质量提升非 anchor 轮转币优先级。
- 有 repository hints 汇总器，可从扫描归档、复盘 outcome 和每日异动归因样本生成 `priorityHints`。
- 有 dynamic priority metadata notes，便于线上检查本轮是否发生动态插队。

下一步深化：

- 阶段 3 暂时不继续扩请求频率；在 CoinGlass 业余会员、Neon 免费和 Vercel 免费约束下，已优先进入阶段 4A，把多周期 OHLCV candles 接入受限主候选，提高信号证据质量。后续阶段 3 的正确方向不是简单加大请求，而是补齐状态池调度、深扫配额、复活观察、冷门探索、扫描证明和漏判反哺，再根据真实 health 数据逐步提高动态优先级质量。

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
- 系统健康报告和系统状态面板已展示 outcome 覆盖率、待复查样本、到期样本、最近写回时间、最近执行批次、写回数、跳过数、失败数、失败原因摘要、样本质量分层、手动校准准入门槛、只读校准流、阻断解释、样本明细、阈值层、人工回滚计划、策略权重回测候选、权重变更审计、人工执行记录入口、影子权重差异、影子表现评估、真实权重启用门禁和策略进化闭环总控。
- outcome executor 已把 `not_due`、`closed_duplicate`、`missing_signal_context`、`ohlcv_unavailable` 和 `outcome_pending` 汇总成跳过原因分层。
- 日记面板已展示 outcome executor 执行批次详情和跳过原因，且保持“只读审计 / 不改权重”。
- outcome 样本准入门槛已落地：`buildOutcomeCalibrationAdmission()` 会输出 `manual_calibration_gate`，按已关闭样本量、有效率、反证占比和亏损聚集判断 `ready / collecting / blocked`，并在健康面板显示准入门槛、准入分、阻断项和“不改权重”。
- outcome 只读校准流已落地：`buildOutcomeCalibrationFlow()` 会把样本准入、人工确认、确认后样本和回滚观察串成健康摘要，并输出阻断项解释、样本分布、最近校准样本明细、阈值层和人工回滚计划；状态只用于人工校准和回滚复核，`canAutoAdjustWeights` 固定为 `false`。
- 只读策略权重回测校准 MVP 已落地：`buildStrategyWeightCalibrationReport()` 会按校准 tag 汇总已关闭样本、有效率、反证率和人工确认版本，输出升权、降权、隔离和继续观察候选；健康面板只读展示候选分布与明细，不写策略权重。
- 只读策略权重变更审计 MVP 已落地：`buildStrategyWeightChangeAuditReport()` 会把权重回测候选转成只读人工审计包和回滚验证要求；健康面板展示审计候选、可审计、需回滚和阻断审计，并明确 `canExecuteWeightChange` 为 `false`。
- 人工权重变更执行记录写入入口和 registry 已落地：`POST /api/admin/strategy-weights/executions/record` 通过 `CRON_SECRET` 保护，系统健康面板可用管理密钥把审批状态、版本标签、回滚触发器和观察窗口写入 `strategy_weight_change_execution` journal 事件；`buildStrategyWeightChangeExecutionReport()` 汇总这些记录并展示审批状态和不可写权重，但不写策略权重。
- 影子策略权重层已落地：`buildStrategyWeightShadowReport()` 从已审批的人工执行记录生成 `baseWeights`、`shadowWeights` 和 `diffs`，系统健康面板展示“影子权重 / 当前权重 / 建议权重 / 差异 / 不影响实盘判断”；该层只读、不新增表、不新增外部请求、不改变真实扫描或策略权重。
- 影子表现评估已落地：`buildStrategyWeightShadowEvaluationReport()` 用审批后的校准样本和人工确认记录评估影子差异，输出样本数、有效/反证、回滚压力和下一步，只服务人工复核，不执行真实权重。
- 真实权重启用门禁已落地：`buildStrategyWeightActivationGate()` 在系统健康面板展示“真实权重门禁 / 启用模式 / 通过项 / 阻断项 / 样本门槛 / 不接入扫描”，默认 `STRATEGY_WEIGHT_ACTIVATION_MODE=disabled`；即使未来设为 `manual`，当前也只生成候选说明，不写真实权重。
- 策略进化闭环总控已落地：`strategyEvolutionLoop` 会把 v3 实时样本、outcome 复盘、人工审计、人工记录、影子观察和真实启用门禁串成只读链路，输出准备度、阶段状态、阻断项和下一步；该层固定 `allowedUse=research_only`，`canAutoAdjustWeights=false`，`canMutateLiveRanking=false`，`canWriteRuleWeights=false`。
- outcome executor 运行审计事件保持 `research_only`，不参与段位 XP、tracking 计数或自动调权。
- 规则调整已有 promote、demote、experiment 基础函数。

下一步深化：

- 继续积累更长期、更大样本的真实回滚验证，让 `strategyEvolutionLoop` 服务规则复核而不是自动调权。
- 补齐真实权重接入扫描引擎的隔离层和回滚验证方案；人工执行记录入口与启用门禁只保存/解释审批账本，不能直接改变规则权重。
- 反复误报的规则必须进入降权、隔离或删除流程。

### 阶段 7：告警系统

目标：让重要异动有可控提醒。

当前状态：网页内基础告警、站内本地设置和不接外部推送边界已完成，持久化未完成。

已具备：

- 浏览器通知。
- 声音级别。
- 重复抑制。
- 静默时段。
- Settings 抽屉里的站内告警控制：最低等级、提示音、浏览器通知、静默时段、去重窗口。
- 外部推送边界：当前不接 Telegram/Webhook。
- 系统异常告警。
- 事件中心合并展示。

下一步深化：

- 告警历史持久化。
- 站内事件中心筛选与归档。
- 提示音细节和浏览器通知开关优化。

### 阶段 8：UI 质感深化

目标：从“可用模板”升级为“川自己的风格”。

验收：

- 第一轮已落地：早期像素宠物状态仪表更完整。
- 第一轮已落地：候选信号节奏条让数据可视化更紧凑。
- 第一轮已落地：页面扫描网格和低干扰动画增强整体生命感。
- V1.6 已落地：主要面板中文优先，早期宠物增加角色化脸部、眼睛和地面影子。
- V1.8 已落地：`PixelCopilot` 作为正式像素男性副驾驶组件，包含 BTC 项链、基础装备条和禁止喊单测试；S680 可见方向已从正常 UI 剔除。
- Phase 8.2 已落地：主界面加入雷达节拍条，展示扫描节拍、信号脉冲、风险/延迟和覆盖密度；信号节奏条与地图节点根据选中、高风险、接近触发状态产生功能性动效。
- 2026-06-16 已重新校准路线：当前 UI 被用户判定为“像一张纸、没有运行感、美感不足”，后续不再继续表层小修，改为 Tailwind CSS + daisyUI 的高级活体雷达控制台重构。
- Phase 8.2b 旧壳试探已完成：顶部 Live Navbar / Banner、雷达之眼 / Crystal Lens 视觉槽位、Cockpit Card、桌面 **左 / 中 / 右 = 2 : 6 : 2** 三栏、Altcoin Opportunity Board 锚点、Macro Radar 预览和 Signal Lifecycle Tracker 预览已接入。但它仍属于旧页面上的结构试探，不等于正式 Tailwind CSS + daisyUI UI Reset；浏览器桌面/移动视觉 QA 也仍需在本地端口权限可用后补做。
- 2026-06-17 已确定：下一阶段以 `docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md` 为正式依据，先真实接入 Tailwind CSS + daisyUI，再重建 AppShell、Live Navbar、启动 briefing、统一 cockpit、移动端 tabs/drawer 和模块联动。
- Phase 8.2b-R 已落地：Tailwind CSS、daisyUI、PostCSS、`postcss.config.mjs`、`globals.css` 入口和 webpack 生产构建路径已接入，Element Plus 继续保持参考-only。
- Phase 8.2c 已落地：新增 `TopRadarBar`、`RadarBootBriefing`、`RadarCockpitShell` 和 `OpsAndFilterPanel`，`radar-workspace.tsx` 改为组合新 AppShell；桌面 2 : 6 : 2、移动 tabs、机会区优先、候选池文字不遮挡已通过本地浏览器 QA。
- Phase 8.2d 已落地：顶部常驻运行反馈层加入扫描心跳、下次扫描倒计时、数据新鲜度、市场时段时钟、CoinGlass/Neon/归档/Cron 状态矩阵和 stale/degraded 色阶；背景音乐继续删除，只保留用户主动开启的提示音边界。桌面 1440x1000 与移动 390x844 已通过本地生产构建浏览器 QA，无横向溢出，候选行不遮挡。
- Phase 3.8 已落地：中栏新增 `AltcoinOpportunityBoard` 作为山寨机会主筛选面，把现有扫描信号和每日异动复盘上下文分组为接近触发、多头升温、空头升温、过热勿追、新币/长尾和数据观察；该面板不新增 CoinGlass 请求，不把每日异动直接升级为交易信号，点击扫描信号会联动 Signal Dossier。
- Phase 3.9 已落地：右栏新增 `MacroWeatherPanel`，用现有扫描快照中的 BTC/ETH ticker、funding、OI、清算字段和扫描状态生成顺风、逆风、震荡、杠杆拥挤、去杠杆、波动扩张、未知等天气层；该层只用于解释山寨候选的顺逆风和风险环境，不新增 CoinGlass 请求，不修改真实策略权重。
- Phase 8.2e 已落地：按用户选定浅色专业工作台参考图重建首屏信息架构。`TopRadarBar` 统一品牌 banner、液态玻璃雷达之眼、主导航、运行状态条和 ticker；`RadarWorkspace` 首屏保留左侧雷达控制台、中央信号主舞台、候选横条、首屏 Chart/Strategy 和右侧 Action Rail；Altcoin Opportunity Board 下沉为主图后的辅助筛选区；完整 DailyMover/Journal/Replay/Rank 不再常驻首页，而是进入功能抽屉、信号档案或二级页面；`PixelCopilot` 收敛为紧凑 companion dock。
- Phase 8.2e-QA 已落地：已按 Product Design image-to-code / design QA 流程对选定参考图做桌面 1536x1024 与移动 390x844 检查；最新控制台无错误，旧 LCP warning 已通过 `priority + loading="eager"` 修复；移动端运行状态区已压缩为两列，避免主雷达内容过度下沉；QA 记录保存为 `design-qa.md`。
- 移动端不挤压、不重叠；后续仍应升级为更明确的 tab/drawer 移动导航。

后续正确 UI 搭建顺序：

1. **Phase 8.2h：Signal Dossier Visual Upgrade**
   - 当前状态：已完成。信号档案已按浅色工作台风格升级为证据室，关键位、Forward Map、证据链、交易计划、复盘关联和副驾驶纪律同一上下文联动。
   - 深层证据继续放档案，不回到首页堆叠。

2. **Phase 8.2i：Pixel Copilot Motion And Equipment**
   - 当前状态：已完成。紧凑 dock 已增加眨眼、呼吸、BTC 项链闪光、警戒/刹车状态、装备解锁槽、mini desk 和“川”刻印。
   - 副驾驶只做纪律反馈、状态提示和档案入口，不能喊单、不能抢主信息层。

3. **Phase 8.2j：ChartPanel Professional Visual Interaction**
   - 当前状态：已完成。主图新增走势 / 关键位 / 前方位 / 复盘四类焦点、只读 overlay、可点击 key level / forward level / review sample。
   - 不新增 CoinGlass 请求，优先复用现有 OHLCV / v3 / journal / review 数据。

4. **Phase 8.2k：Chart Realism And Key-Level Drilldown**
   - 当前状态：已完成。主图已加入只读 K 线预览、成交量质量、图上关键位标签和 Forward Map 体感层。
   - 继续只读展示，不替代 TradingView，不自动生成交易指令。

5. **Phase 3.10：Full-Market Scan Depth And Coverage**
   - 当前状态：已完成。`/api/health` 已新增 `fullMarketCoverage`，健康面板已展示全市场覆盖深度、当前批次、预计轮转周期、三所覆盖质量、已扫/待轮转样本和只读边界。
   - 该阶段不新增 CoinGlass 请求，不做一次性全市场深扫；它把现有 universe registry、三交易所发现、低频轮转和 quota guard 解释给前端和运维层。
   - 已进入 Phase 3.11 数据质量清洗与覆盖质量解释。

6. **Phase 3.11：Data Quality Cleaning And Coverage Quality Explanation**
   - 当前状态：已完成并增强。`/api/health` 已新增 `marketDataQuality`，会从主扫描 metadata 和 instrument pool 汇总 raw / clean / primary、UNKNOWN、非 USDT、重复币种、流动性门槛、过滤样本、质量分和只读边界。
   - Phase 3.14 已增强数据质量解释：CoinGlass provider 会写入 `quality rejected samples`、`quality aggregation summary` 和 `quality aggregation` notes；`marketDataQuality.primarySelection` 会展示重复组数、主信号选择规则和样本，`rejectedRowSamples` 会展示原始拒绝行样本。
   - 健康面板已新增“数据质量”卡片，直接展示原始行、清洗后、主信号、可用池、UNKNOWN、非 USDT、重复/去重、流动性门槛、主信号聚合解释、原始拒绝样本和过滤样本。
   - 该阶段不改变 CoinGlass 请求、不改变实时排序、不生成交易方向；数据质量层只能阻断、降级或解释候选。
   - 下一步应进入 v3 策略引擎实战闭环只读接入，把现有 v3 Key Level / Forward Map / Pattern / Trade Plan 结果更明确地串到复盘与候选解释里。

7. **Phase 3.9+：BTC ETH Macro Radar**
   - BTC/ETH/ETF/OI/funding/liquidations 作为大盘天气，不抢山寨主线。
   - 输出顺风、逆风、拥挤、去杠杆、假突破风险等环境层，影响机会排序和策略解释。
   - 当前状态：已完成 BTC/ETH Macro Weather 第一版；它复用现有扫描快照，不新增请求，不修改真实权重。ETF 专项端点仍需等 CoinGlass Hobbyist 可用性和 quota 先验证后再接入。

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
   - 如果 Neon 还没有执行最新迁移，健康面板显示待迁移，首页仍必须可加载。
   - GitHub Actions 低频触发已落地：`.github/workflows/chuan-v3-forward-map-review.yml` 每 6 小时请求一次受保护入口，复用 `CHUAN_SCAN_URL` 推导目标 URL，复用 `CHUAN_CRON_SECRET` 鉴权，不新增 GitHub secret。
   - 当前状态：已完成 MVP。

17. **Phase 4V3-4：missed_altcoin_review 与每日异动复盘融合**
   - `GET /api/daily-movers` 会从选中每日异动样本的漏判样本中，寻找 `observedAt` 之前已经保存的 v3 Forward Map / Key Level Map。
   - 只在 `radarStatus === "missed"`、样本可学习且存在改进标签或校准候选时生成 `missed_altcoin_review`。
   - `missed_altcoin_review` 只作为人工复盘证据，输出 `allowedUse: "research_only"`、`canAutoAdjustWeights: false` 和可追溯 `evidenceIds`。
   - `DailyMoverPanel` 已展示“v3 漏判复盘 / 事前地图”，显示证据数、只读用途和不改权重边界。
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

25. **Phase 4V3-12：Readonly v3 Trade Plan 草案**
   - 新增 `buildV3TradePlan()`，只在方向明确、位置/RR 合格、回踩/反抽确认、趋势完整度健康、Risk Gate 通过时生成 `READY_LONG / READY_SHORT` 只读计划草案。
   - 计划草案包含入场上下文、结构失效位、第一目标、赔率、确认清单、仓位边界和阻断原因；`hasAutoExecution=false`、`manualReviewRequired=true`、`canMutateLiveRanking=false`，不自动下单，不预测必涨必跌。
   - RR 不足、Risk Gate 阻断或结构破坏时输出 `BLOCKED`；回踩/反抽未确认时输出 `WAIT_PULLBACK / WAIT_RETEST`；衰竭风险只输出 `WATCH_ONLY`，不反向生成对手方向信号。
   - Signal Dossier 已展示“v3 计划草案”、状态、赔率、失效位、目标、自动执行边界、摘要和确认/阻断标签。
   - 当前状态：已完成 MVP。后续正确搭建项是 Pattern Library，把常见盘面形态转成低权重、可追溯的结构辅助证据，不能覆盖 Market Reading、Key Level、RR 和 Risk Gate。

26. **Phase 4V3-13：Pattern Library 低权重形态辅助 MVP**
   - 新增 `buildV3PatternLibrary()`，输出 `research_only` 形态上下文、置信度、证据、失效提示和摘要。
   - 2026-06-19 已扩展形态识别：`DOUBLE_BOTTOM`、`DOUBLE_TOP`、`ASCENDING_TRIANGLE`、`DESCENDING_TRIANGLE`、`BULL_FLAG`、`BEAR_FLAG`、`HEAD_AND_SHOULDERS`、`INVERSE_HEAD_AND_SHOULDERS` 和 `FIBONACCI_PULLBACK`。
   - 形态库 `maxWeightPercent=10`，`hasTradeSignal=false`，`canMutateLiveRanking=false`，不能覆盖 Market Reading、Key Level、位置/RR、回踩/反抽、趋势完整度或 Risk Gate。
   - Signal Dossier 已展示“形态辅助”、中文主形态、置信度、权重上限、交易信号边界、摘要、首条证据和失效提示；ChartPanel 已展示主图形态上下文、权重边界和首条证据。
   - 谐波形态暂不自动识别，只保留为后续低权重提示项。原因是谐波对 swing 点质量要求高，当前样本不足时强行上线会增加误判和自相矛盾。
   - 当前状态：已完成扩展 MVP。后续正确搭建项是把 v3 readiness 更清楚地接入候选解释与 Signal Dossier，让“能不能进入实战复核”可见。

27. **Phase 4V3-14：Pattern / Trade Plan 复盘标签**
   - `buildJournalEntryFromSignal()` 已把 v3 只读交易计划状态写入 `lessons`：`v3_trade_<status>`。
   - 当 Signal Dossier 带有低权重形态上下文时，同时写入 `v3_pattern_context` 和 `v3_pattern_<type>`，用于后续按形态统计样本表现。
   - 这些标签只用于复盘归因和人工校准，不改变 live ranking、不自动改权重、不让形态直接产生交易信号。
   - 当前状态：已完成 MVP。后续正确搭建项是形态复盘统计面板，把 tagged journal/outcome 样本按 pattern/trade status 聚合成只读表现摘要。

28. **Phase 4V3-15：Pattern / Trade Plan 只读复盘统计面板**
   - 新增 `buildV3PatternReviewStats()`，从 `JournalEvent.lessons` 聚合 `v3_pattern_<type>` 与 `v3_trade_<status>`，统计样本数、关闭样本、待复查、有效、反证、有效率和 bucket 状态。
   - 统计报告固定 `allowedUse=research_only`、`canAutoAdjustWeights=false`，只能用于人工归因，不能自动改权重、不能改变实时排序、不能直接生成交易信号。
   - `JournalPanel` 已展示“形态复盘统计”，包含样本、关闭、待复查、主形态和前几类 pattern/trade bucket；空样本时保持收集状态，不伪造结论。
   - 当前状态：已完成 MVP。后续正确搭建项是更细的多周期图表交互和样本 drilldown，让每个统计 bucket 能追溯到具体信号、K 线窗口和复盘事件。

29. **Phase 4V3-16：Pattern / Trade Plan bucket 样本追溯**
   - `V3PatternReviewBucket` 已新增 bounded `samples` 明细，保留最近少量样本的 `id`、`signalId`、`symbol`、`result`、`outcomeStatus`、`reviewStatus`、`createdAt` 和归类后的 `outcome`。
   - `JournalPanel` 已在每个形态/计划 bucket 下展示最多 3 个样本 chip，帮助从统计结果回看具体标的表现。
   - 样本追溯仍是只读 UI 和本地报告层，不新增数据库表，不新增 CoinGlass 请求，不自动改权重，不改变实时排序。
   - 当前状态：已完成 MVP。后续正确搭建项是多周期图表交互，让选中信号能在前端更清楚地查看关键位、形态上下文、回踩/反抽和计划区间。

30. **Phase 4V3-17：ChartPanel active timeframe v3 context**
   - `ChartPanel` 已读取选中信号的 `strategyV3` 与当前 `activeTimeframe`，在主图下方展示“v3 多周期上下文”。
   - 前端已展示当前周期结构、压缩分、只读 Risk Gate、当前周期关键位、v3 计划草案、赔率和事前位数量。
   - 该面板只做前端解释和图表上下文，不替换 TradingView 外链，不新增市场数据请求，不改变实时排序，不自动生成交易信号。
   - 当前状态：已完成 MVP。后续正确搭建项是更细的关键位/事前位 drilldown，让用户能从图表上下文跳到 Signal Dossier、Forward Map 和复盘样本。

31. **Phase 4V3-18：ChartPanel key-level / forward-map drilldown**
   - `ChartPanel` 已默认展开当前周期最相关关键位和下一前方位，显示价格区间、原因、确认条件和失效条件。
   - 新增 `chart-v3-drilldown`、`chart-v3-forward-drilldown` 和 `chart-v3-manual-review` 前端锚点，明确这些信息仅用于人工只读复核。
   - 该阶段不新增数据库表、不新增 CoinGlass 请求、不改扫描排序、不自动调权、不自动下单。
   - 当前状态：已完成 MVP。后续正确搭建项是把复盘样本、Forward Map review 事件和图表关键位做更直接的可追溯联动。

32. **Phase 4V3-19：ChartPanel journal review sample linkage**
   - `RadarWorkspace` 已为主图选中信号独立计算 `chartJournalMatches`，避免抽屉信号和主图信号互相污染。
   - `ChartPanel` 已展示最近复盘样本、`plannedReviewAt`、复盘结果、review 状态，以及 `v3_pattern_` / `v3_trade_` 标签摘要。
   - 该联动只读展示已有 journal 样本，不新增写入、不改变段位计算、不自动调参、不生成交易信号。
   - 当前状态：已完成 MVP。后续正确搭建项是把 Forward Map review executor 写入的事件也按关键位关联到图表上下文。

33. **Phase 4V3-20：ChartPanel Forward Map review event linkage**
   - `ChartPanel` 已从当前选中信号的 journal 样本中提取 `trendRadarReview` 事件，单独展示 `forward_map_review` 与 `key_level_reaction_review`。
   - 前端展示事件类型、verdict、生成时间、detail 和 `evidenceIds`，用于把事前关键位与事后复核结果接起来。
   - 该阶段只消费已有 review executor 事件，不新增 executor 频率、不新增 CoinGlass 请求、不自动改权重、不影响 live ranking。
   - 当前状态：已完成 MVP。后续正确搭建项是图表交互选中态：允许用户在关键位、事前位、复核事件之间切换焦点。

34. **Phase 4V3-21：v3 Strategy Loop Health Summary**
   - `/api/health` 已新增 `v3StrategyLoop`，聚合当前 live 信号里的 v3 覆盖、关键位数量、Forward Map 数量、计划草案、Risk Gate 阻断、结构冲突和 v3 pattern/trade 复盘样本。
   - 系统健康面板已展示 v3 Strategy Loop、v3 覆盖、关键位/前方位、计划/阻断、Risk Gate、复盘样本、主计划和候选下一步。
   - 该阶段只读聚合 live 信号、Forward Map 和 journal 样本；不能自动下单，不能自动改权重，不能改变实时排序。
   - 当前状态：已完成。下一步应进入站内告警与设置基础；不做 Telegram/Webhook。

35. **Phase 4V3-22：Strategy Evolution Loop Control**
   - `/api/health` 已新增 `strategyEvolutionLoop`，把 v3 live 样本、outcome 复盘、人工审计、人工执行记录、影子观察和真实权重启用门禁串成一个只读总控。
   - 系统健康面板已展示 Evolution Loop、准备度、就绪阶段、阻断项、阶段状态和下一步动作。
   - 该阶段不新增 CoinGlass 请求、不新增数据库表、不写策略权重、不改变实时排序，只用于解释当前“学习闭环”推进到哪一层。
   - 当前状态：已完成。下一步应进入站内告警与设置基础，先做站内可控提醒、静默/阈值边界和本地设置，不接 Telegram/Webhook。

36. **V1.7：Product Design 简报与角色设定固化**
   - 确认像素男性副驾驶的视觉关键词、装备等级、情绪状态和台词边界。
   - 明确 S680 从常规 UI 主线删除，不再作为默认座驾/装备/彩蛋。
   - 先出 3 个角色视觉方向，再选一个实现，不直接盲改。

37. **V1.8：像素副驾驶 MVP（已落地）**
   - 已用 `PixelCopilot` 替换旧车辆命名组件的正常 UI 边界。
   - 初版只做一个男性像素小人、BTC 项链、3 个情绪状态和基础台词。
   - 保留 rank profile、纪律分、动量、热度等现有数据入口。
   - 为角色结构、中文台词和禁止喊单边界增加测试。

38. **V1.9：装备与段位联动**
   - 根据 XP、段位、纪律分解锁装备。
   - 初始只做 3-5 个装备层级，避免一次性堆太多皮肤。
   - 装备只能表达成长和纪律，不表达收益承诺。

39. **V2.0：主界面层级重排**
   - 弱化营销式 hero，强化当前选中信号工作区。
   - 建立 Command / Signal / System / Copilot 四类模块等级。
   - 让图表、多周期、策略计划和 AI 反证的视觉层级更清楚。

40. **V2.1：移动端交易操作流**
   - 移动端按“候选池 -> 信号详情 -> 策略计划 -> 复盘/副驾驶”顺序组织。
   - 优先保证不挤压、不重叠、关键操作一屏可理解。

41. **V2.2：动效与声音**
   - 只给状态变化加动效：新异动、接近触发、数据延迟、复盘完成、升级。
   - 遵守 `prefers-reduced-motion`，声音默认由用户主动开启。

42. **V2.3：视觉验收和部署**
   - 本地跑 `npm run dev`，用 Browser/Playwright 检查桌面和移动端。
   - 跑 `npm run test:market`、`npm run typecheck`、`npm run lint`、`npm run build`。
   - commit 后 push 到 GitHub，等待 Vercel 部署成功，部署绿了才算网页应用新版本。

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
6. 前端 UI 大改默认走 Product Design：确认简报、选择方向、实现、浏览器检查、测试构建、再推送。
7. 本地预览和浏览器检查需要权限时，先请求授权；未获得授权不能假装已经看过页面。
