# 川 Market Radar 固化蓝图

> 本文是本项目的长期事实源。后续继续搭建、重构、接入数据源、调整 UI、加入 AI 或登录系统时，先检查本文，避免聊天上下文过长导致遗漏或逻辑漂移。

> 长期工程搭建、文档分级、功能准入、删除和验证规则见 `docs/chuan-market-radar-engineering-charter.md`。蓝图只记录产品定位、长期原则、核心边界和重大路线，不作为普通迭代施工日志。

## 一句话定位

川 Market Radar 是一个公开访问的合约市场雷达网站，用于扫描加密市场中支持合约交易的币种，提前发现上涨或下跌前的异常迹象，并给出证据分层、策略计划、失败路径、复盘记录和系统自我进化反馈。

## 不做什么

- 当前不做登录系统。
- 当前不做自动下单。
- 当前不承诺实时秒级行情。
- 当前不把单一指标当作买卖信号。
- 当前不把 AI 输出当作最终裁决。
- 当前不把演示数据、缓存数据或缺字段数据说成真实生产级数据。
- 当前不做中国大陆访问专项优化，不做 ICP 备案、大陆云服务器或大陆 CDN 路线；站点继续按 Vercel/海外可访问方案推进，后续最多预留海外/香港镜像作为可选稳定性方案。

## 产品原则

0. **核心目标不可偏移**：网站的一切搭建都必须服务“提前发现合约行情爆发前的异常、解释证据、给出多空策略、管理买卖/失效条件、复盘学习并逐步提高稳定性”这条主线。任何 UI、宠物、彩蛋、AI、告警或数据展示，如果不能增强“扫描 -> 证据 -> 策略 -> 复盘 -> 学习”闭环，就必须降级、后置或删除。
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

新 UI 骨架规则：

- 技术方向必须真实接入 **Tailwind CSS + daisyUI** 后才能宣称使用；Element UI / Element Plus 只作为组件参考，不作为主实现栈，因为当前项目是 Next.js / React。
- 顶部使用 **Live Navbar / Banner**，承载“川”品牌、扫描心跳、当前市场时段、数据新鲜度、扫描倒计时和关键系统状态。
- 首页主体使用一个融合式 **Cockpit Card**，不是散落卡片墙；桌面端宽度按 **左 / 中 / 右 = 2 : 6 : 2** 组织。
- 左栏承载系统运行、扫描经济、市场时钟、事件流和配置入口；中栏承载机会雷达、Altcoin Opportunity Board、当前选中信号、策略计划和多周期证据；右栏承载 Macro Radar、Signal Lifecycle Tracker、复盘/副驾驶入口和风险边界。
- 用户提供的视觉图作为 **雷达之眼 / Crystal Lens** 方向使用：可以裁切成顶部视觉、启动动画镜头、信号档案封面或微弱材质层；不能整张铺成壁纸，不能压住行情信息，不能把网站变成纯插画页。
- “川”必须是核心品牌符号：logo、启动动画、水印、favicon、雷达刻印或控制台铭牌都要逐步体现，而不是只出现在导航小字里。
- 打开网站可有启动动画和介绍 briefing，但必须短、可跳过、可降级；它解释网站定位、当前扫描状态和风险边界，不做营销页。
- 背景音乐删除：不做常驻背景音乐。后续只保留用户主动开启的提示音/告警音，且必须尊重静默时段、mute 和 `prefers-reduced-motion`。
- 前端要有“活着”的运行反馈：扫描心跳、倒计时、数据闪烁、候选变化、stale 降级、事件流滚动和 session clock。动效只表达状态，不做无意义装饰。
- 首页不承载所有细节。深层证据、日记历史、涨跌榜归因、K 线验证、AI 反证和策略生命周期进入 Signal Dossier、Altcoin Opportunity Board、Macro Radar、Signal Lifecycle Tracker 等专门区域。
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

信号档案应展示：当前信号状态、多周期证据、CoinGlass 衍生品证据、TradingView/K 线入口、日记历史、涨跌榜归因记录、告警状态和副驾驶反馈。

### Scan Economy 扫描经济系统

CoinGlass 业余会员 API 要精打细算地用满：不乱打、不浪费、不省到失去价值。每一次 CoinGlass 请求都必须有用途、有缓存、有复用、有优先级。

- CoinGlass 优先用于最有价值的合约数据：OI、资金费率、合约市场、涨跌榜、爆仓/多空相关数据。
- K 线和基础 OHLCV 优先使用免费公开源，避免浪费 CoinGlass 请求。
- BTC/ETH 锚定币每轮优先，核心山寨较高频，长尾低频轮转。
- 涨跌榜、扫描异常、日记复盘中频繁出现的币可以动态提权。
- 同一份扫描结果要复用到雷达、信号档案、告警、日记、复盘和副驾驶反馈，不能各模块重复请求。
- 前端要逐步展示今日请求预算、已用/预计、覆盖率、下一轮扫描计划和当前币池结构。

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
| 阶段 3：合约 universe registry | 基础、三交易所自动发现、分层币池、低频轮转、覆盖差异、quota 护栏、动态优先级、repository hints 和扫描经济前端面板基础已落地 | 尚未完成高优先级加密扫描和更细的交易所覆盖差异前端钻取 |
| 阶段 4：OHLCV、盘面结构与技术指标 | 基础已落地，受限主候选已接入 `1m/5m/15m/30m/1h/4h/1d/1w` candles、MACD、近似成交量分布、指标矩阵摘要、策略卡前端矩阵基础展示、基础指标/周期权重校准、只读权重回测校准 MVP、只读权重变更审计、人工执行记录写入入口、只读 registry 和影子策略权重层 | 尚未完成真实权重生效、交互式多周期图表、更专业的成交量分布模型、Market Structure Engine、Key Level Engine、Pattern Library、Fibonacci/谐波辅助层 |
| 阶段 5：AI 反证复核 | 边界已落地 | 尚未配置生产模型、多模型对照、成本统计和复盘校准 |
| 阶段 6：自我提升复盘 | 基础已落地，outcome executor MVP、受保护 API、GitHub Actions 外部低频触发、已关闭信号去重、结果覆盖率、执行批次统计、跳过原因分层、复盘面板执行批次详情、样本质量分层、手动校准准入门槛、只读校准流、阻断解释、样本明细、阈值层、人工回滚计划、只读策略权重回测校准、只读权重变更审计、人工执行记录写入入口、只读 registry、影子策略权重层、影子表现评估和真实权重启用门禁健康面板展示已落地 | 尚未完成真实权重接入扫描引擎、真实权重生效和真实回滚验证 |
| 阶段 6B：每日异动归因复盘 | 逻辑、数据源适配器、抓取写入服务、受保护 API、公开只读 API、外部 cron 策略、schema、repository、公开复盘面板、历史样本选择、单样本详情、只读关联摘要、规则校准建议、校准候选入复盘队列、按 tag 汇总的只读校准反馈趋势、人工回测候选链路、历史样本验证层、策略版本草案链路、人工确认记录、确认后表现反馈基础、策略版本长周期表现/回滚边界、阈值画像、手动回滚计划、K 线回测低成本计划边界、K 线缓存持久化、受保护低频填充 MVP、缓存 K 线验证结果、observedAt 事件窗口回测、outcome executor 复盘写回基础、只读权重变更审计、人工执行记录写入入口、只读 registry、影子策略权重层、影子表现评估和真实权重启用门禁已落地 | 尚未完成自动权重调整；自动调整必须等待更多 outcome 样本、真实权重接入扫描引擎和真实回滚验证更成熟 |
| 阶段 7：告警系统 | 网页内基础已落地 | 尚未完成站内告警历史持久化、可配置静默时段、可配置告警等级阈值和提示音细节 |
| 阶段 8：UI 质感深化 | 第一轮已落地，信号档案基础已接入候选池、信号地图、TradingView、日记、每日异动、告警和副驾驶入口；Living Radar 第二轮已接入雷达节拍条、信号脉冲、延迟/失败状态弱化、移动端检查、Altcoin Opportunity Board 和 BTC/ETH Macro Weather | 像素男性副驾驶仍需正式替换旧 S680 命名与组件边界；装备升级、图表密度、信号档案视觉精修和更完整交互动效仍需继续打磨 |

## 当前已落地模块

### 已落地：公开网站基础

- Next.js 项目结构已建立。
- Vercel 项目已连接 GitHub 仓库。
- 生产访问地址已生成。
- 页面有主雷达、策略卡、图表入口、事件中心、系统状态、复盘日记、段位、像素宠物、声音开关。
- 信号档案基础已落地：点击候选池、信号地图、热区匹配项或像素副驾驶可打开同一标的档案；桌面为右侧抽屉，移动端为底部上滑面板；档案复用现有扫描、日记、每日异动、告警和 TradingView 链接，不新增 CoinGlass 请求。

### 已落地：CoinGlass 数据接入骨架

- `MARKET_DATA_PROVIDER=coinglass` 且 `COINGLASS_API_KEY` 存在时启用 CoinGlass provider。
- `COINGLASS_BASE_ASSETS` 控制扫描资产白名单。
- `COINGLASS_BATCH_SIZE` 控制每轮请求数量。
- `COINGLASS_DAILY_REQUEST_BUDGET` 控制主扫描每日 CoinGlass 请求预算，默认按业余会员阶段保守值 `300` 估算。
- 15 分钟 cadence 下分批扫描，降低触发业余会员限速的概率。
- Provider 失败时可以使用缓存并显示 stale 状态。
- 主扫描已加强数据清洗：拒绝 UNKNOWN 交易所、拒绝非 USDT 或报价字段冲突的合约行，并按同币种选择主交易所输出，避免重复信号刷屏。
- 扫描 metadata notes 会显示 raw、clean、primary 数量，以及 unsupported exchange、unsupported quote、duplicate symbol 等过滤原因。

### 已落地：Neon 持久化骨架

- `journal_events`：复盘日记、纸面跟踪、拒绝追单、失效记录。
- `scan_archives`：扫描快照、回放 frame、最近扫描对比。
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
- 已支持 API quota 消耗估计：每轮 CoinGlass 请求数、每日 CoinGlass 预估请求数、剩余请求估算、public discovery 预估请求数、预算使用率和状态。
- 已支持扫描预算护栏：当 `COINGLASS_BATCH_SIZE` 超过每日预算允许值时，自动压缩为安全批次；若预算低于 BTC/ETH 锚点最低扫描需求，会标记 `over_budget`，但不破坏锚点扫描。
- 已支持动态优先级基础：universe scan plan 可接收 `priorityHints`，按异常分、历史胜率样本、近期信号、流动性和交易所覆盖质量生成动态分数；动态候选只能占用非 anchor 轮转槽，不能挤掉 BTC/ETH，也不能突破 quota 批次。
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

当前已经有 universe registry、覆盖率、锚点固定、轮转扫描计划、主扫描质量过滤、Binance/OKX/Bybit public USDT 永续自动发现、分层币池、长尾低频轮转、多交易所覆盖差异、API quota 护栏、动态优先级基础和 repository priority hints。资产池已不只依赖 `COINGLASS_BASE_ASSETS`，但还没有完成高优先级币种加密扫描、覆盖差异前端展示，以及依赖自动 outcome executor 的完整胜率闭环。

后续需要：

- Binance/OKX/Bybit 支持合约交易币种列表已具备自动发现基础。
- 多交易所覆盖状态已具备基础分类和 metadata 输出。
- API quota 消耗估计和批次护栏已具备基础实现。
- 将主扫描的质量分类器复用到每日异动、全市场发现和后续扩展池。
- 低优先级币种更长期轮转扫描已具备基础策略，动态优先级接口和 repository hints 已具备，后续需要在 outcome executor 完成后继续提高历史胜率样本质量。
- 高优先级币种加密扫描需要在动态优先级和外部 cron 稳定后再打开。
- 将不同交易所同一币种的覆盖和差异展示到前端。

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

### 待落地：盘面结构与形态库

盘面结构是后续分析能力的核心增强方向。系统不能只依赖 CoinGlass 数据、指标矩阵或多周期涨跌幅；必须识别真实盘面结构、关键位、形态位置和失效路径，尤其面向山寨币爆发前的布局机会。

2026-06-17 已新增 **Evidence-Based Altcoin Strategy Engine v2** 规格文档，后续进入 Phase 4C/4D 前必须先读取：

- `docs/CORE_STRATEGY_SPEC.md`
- `docs/EVIDENCE_ENGINE_SPEC.md`
- `docs/INDICATOR_RULES.md`
- `docs/DATA_RULES.md`
- `docs/GOLDEN_CASES.md`

v2 硬边界：不接入清算热力图，不实现 Liquidation Heatmap，不构建 LiquidationZone，不把潜在清算区作为目标位、入场位、止损位或方向依据；常规清算统计最多作为风险背景，不能单独进入方向判断。

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

建议后续阶段拆分：

1. **Market Structure Engine**：识别 swing high/low、HH/HL/LH/LL、趋势/箱体/中部噪音、breakout/breakdown/sweep/假突破。
2. **Key Level Engine**：识别前高、前低、区间上下沿、结构颈线、供需区、触发位、失效位和目标区。
3. **Pattern Library MVP**：先做箱体、压缩、双顶/双底、头肩、旗形、楔形、通道、杯柄等常用形态，并输出确认条件和失效路径。
4. **Fibonacci And Harmonic 辅助层**：只作为位置、目标和潜在反转区提示，不能单独生成交易信号。
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
- 公开雷达 UI 入口：`DailyMoverPanel` 已接入主工作台右侧信息栈，展示最新涨跌幅样本、抓到/漏判/可学习统计、归因驱动和历史样本摘要。
- 只读关联摘要：`GET /api/daily-movers` 会为选中样本生成 `selectedCorrelation`，把每日异动 review 与最近扫描归档、扫描 replay signal、复盘日记做 bounded 关联，输出 `caught_with_journal`、`caught_unreviewed`、`missed_with_evidence`、`not_learnable`、`unlinked` 等状态。
- 关联摘要 UI：`DailyMoverPanel` 已展示扫描关联、日记关联、校准候选数量，并对样本链显示命中已复盘、命中待复盘、漏判有证据、不可学习等状态。
- 历史样本和单样本详情：`DailyMoverPanel` 已支持历史样本切换、选中样本详情和“为什么漏判/下一步复核”的只读说明。
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

当前已经完成网页内基础告警策略：

- `near_trigger` 会生成 high 级别告警。
- `triggered` 会生成 critical 级别告警。
- stale/failed 扫描会生成系统运维告警。
- 同币种同状态在去重窗口内会被抑制，避免重复刷屏。
- 静默时段会关闭声音，但事件仍进入事件中心。
- 浏览器 Notification API 只会在用户主动开启告警后请求权限，不会首屏打扰。
- 事件中心会把 signal alert、system stale、system failed 和扫描事件合并展示。

后续需要：

- 可配置静默时段。
- 可配置告警等级阈值。
- 告警历史持久化。
- 站内事件中心筛选与归档。
- 提示音细节和浏览器通知开关优化。

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

2026-06-14 V1.8 已落地像素副驾驶 MVP：

- `PixelS680` 暂时作为历史组件边界存在，但宠物主角改为男性像素副驾驶；后续 UI 重构时应把命名和视觉方向迁移到像素副驾驶，而不是继续强化 S680。
- 初版已包含 BTC 项链、基础装备条、巡航/警戒/刹车 3 个情绪状态和纪律型话唠台词。
- S680 不再作为默认座驾、装备或彩蛋方向；后续如果重新启用，必须由用户明确指定。
- 新增测试约束副驾驶结构、中文标签和禁止喊单边界，避免后续回退。

最终 UI 方向：

- 像素二次元。
- 不幼稚。
- 有数据密度。
- 有动画和互动。
- 不走传统后台表格感。
- 不走冷酷科幻风。
- 网站命名为“川”。
- 宠物主角是男性像素副驾驶，以 BTC 项链、装备升级、情绪话唠和纪律反馈为核心。
- S680 从常规 UI 主线删除，不作为默认宠物、座驾、装备或皮肤方向。
- 严肃区域严肃，彩蛋区域有趣。

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

- 阶段 3 暂时不继续扩请求频率；在 CoinGlass 业余会员、Neon 免费和 Vercel 免费约束下，已优先进入阶段 4A，把多周期 OHLCV candles 接入受限主候选，提高信号证据质量。后续阶段 3 只在外部 cron 和 outcome executor 更稳定后继续提高动态优先级质量。

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

当前状态：生命周期、评分基础、outcome executor MVP、健康面板基础状态展示和复盘面板执行批次展示已完成；执行器已能低频读取待复查 journal、拉公开 OHLCV、写回复盘结果，系统状态和复盘面板已能显示最近执行批次、失败摘要、跳过原因分层、样本质量分层、手动校准准入门槛、只读校准流、阈值层、人工回滚计划、策略权重回测候选、只读权重变更审计、人工执行记录写入入口、registry 和影子权重差异，但还不是完整自动调权系统。

已具备：

- 信号进入 journal 时会带 `1h / 4h / 24h` 复查节点。
- outcome-tracker 已能根据后续 K 线判断 partial win、saved、loss、expired。
- journal 已支持记录 outcome。
- rank 已能根据纪律和结果变化。
- outcome executor 已能从 repository 读取待复查 journal，使用公开 OHLCV 评估结果，并写回 lifecycle journal event。
- `POST /api/admin/outcomes/run` 已受 `CRON_SECRET` 保护。
- `.github/workflows/chuan-outcome-executor.yml` 已支持每小时外部低频触发，并复用已有 `CHUAN_SCAN_URL` 推导 outcome executor URL，不需要新增 GitHub secret。
- 已关闭 lifecycle outcome 会阻止同一旧 tracking entry 重复触发公开 K 线请求。
- 系统健康报告和系统状态面板已展示 outcome 覆盖率、待复查样本、到期样本、最近写回时间、最近执行批次、写回数、跳过数、失败数、失败原因摘要、样本质量分层、手动校准准入门槛、只读校准流、阻断解释、样本明细、阈值层、人工回滚计划、策略权重回测候选、权重变更审计、人工执行记录入口、影子权重差异、影子表现评估和真实权重启用门禁。
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
- outcome executor 运行审计事件保持 `research_only`，不参与段位 XP、tracking 计数或自动调权。
- 规则调整已有 promote、demote、experiment 基础函数。

下一步深化：

- 继续把影子表现评估和真实权重启用门禁接入更长期、更大样本的真实回滚验证，让它服务规则复核而不是自动调权。
- 补齐真实权重接入扫描引擎的隔离层和回滚验证方案；人工执行记录入口与启用门禁只保存/解释审批账本，不能直接改变规则权重。
- 反复误报的规则必须进入降权、隔离或删除流程。

### 阶段 7：告警系统

目标：让重要异动有可控提醒。

当前状态：网页内基础告警已完成，站内配置和持久化未完成。

已具备：

- 浏览器通知。
- 声音级别。
- 重复抑制。
- 静默时段。
- 系统异常告警。
- 事件中心合并展示。

下一步深化：

- 可配置静默时段和告警阈值。
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
- V1.8 已落地：`PixelS680` 加入男性像素副驾驶、BTC 项链、基础装备条和禁止喊单测试。
- Phase 8.2 已落地：主界面加入雷达节拍条，展示扫描节拍、信号脉冲、风险/延迟和覆盖密度；信号节奏条与地图节点根据选中、高风险、接近触发状态产生功能性动效。
- 2026-06-16 已重新校准路线：当前 UI 被用户判定为“像一张纸、没有运行感、美感不足”，后续不再继续表层小修，改为 Tailwind CSS + daisyUI 的高级活体雷达控制台重构。
- Phase 8.2b 旧壳试探已完成：顶部 Live Navbar / Banner、雷达之眼 / Crystal Lens 视觉槽位、Cockpit Card、桌面 **左 / 中 / 右 = 2 : 6 : 2** 三栏、Altcoin Opportunity Board 锚点、Macro Radar 预览和 Signal Lifecycle Tracker 预览已接入。但它仍属于旧页面上的结构试探，不等于正式 Tailwind CSS + daisyUI UI Reset；浏览器桌面/移动视觉 QA 也仍需在本地端口权限可用后补做。
- 2026-06-17 已确定：下一阶段以 `docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md` 为正式依据，先真实接入 Tailwind CSS + daisyUI，再重建 AppShell、Live Navbar、启动 briefing、统一 cockpit、移动端 tabs/drawer 和模块联动。
- Phase 8.2b-R 已落地：Tailwind CSS、daisyUI、PostCSS、`postcss.config.mjs`、`globals.css` 入口和 webpack 生产构建路径已接入，Element Plus 继续保持参考-only。
- Phase 8.2c 已落地：新增 `TopRadarBar`、`RadarBootBriefing`、`RadarCockpitShell` 和 `OpsAndFilterPanel`，`radar-workspace.tsx` 改为组合新 AppShell；桌面 2 : 6 : 2、移动 tabs、机会区优先、候选池文字不遮挡已通过本地浏览器 QA。
- Phase 8.2d 已落地：顶部常驻运行反馈层加入扫描心跳、下次扫描倒计时、数据新鲜度、市场时段时钟、CoinGlass/Neon/归档/Cron 状态矩阵和 stale/degraded 色阶；背景音乐继续删除，只保留用户主动开启的提示音边界。桌面 1440x1000 与移动 390x844 已通过本地生产构建浏览器 QA，无横向溢出，候选行不遮挡。
- Phase 3.8 已落地：中栏新增 `AltcoinOpportunityBoard` 作为山寨机会主筛选面，把现有扫描信号和每日异动复盘上下文分组为接近触发、多头升温、空头升温、过热勿追、新币/长尾和数据观察；该面板不新增 CoinGlass 请求，不把每日异动直接升级为交易信号，点击扫描信号会联动 Signal Dossier。
- Phase 3.9 已落地：右栏新增 `MacroWeatherPanel`，用现有扫描快照中的 BTC/ETH ticker、funding、OI、清算字段和扫描状态生成顺风、逆风、震荡、杠杆拥挤、去杠杆、波动扩张、未知等天气层；该层只用于解释山寨候选的顺逆风和风险环境，不新增 CoinGlass 请求，不修改真实策略权重。
- 移动端不挤压、不重叠。

后续正确 UI 搭建顺序：

1. **Phase 8.2b-R：Tailwind And DaisyUI Foundation**
   - 真实安装并配置 Tailwind CSS、daisyUI 和 PostCSS。
   - `globals.css` 接入 Tailwind/daisyUI 入口，Element Plus 只保留为设计参考。
   - 生产构建暂时固定为 `next build --webpack`，避免 Tailwind/PostCSS 接入阶段受 Turbopack 子进程/端口权限影响；`turbopack.root` 仍保留，供本地 dev 和未来稳定后切回使用。
   - 增加 repository hygiene 测试，防止后续再次把“口头参考”误写成“实际接入”。

2. **Phase 8.2c：New AppShell And Cockpit Reset**
   - 以 spec 为准重建 `TopRadarBar`、`RadarBootBriefing`、`RadarCockpitShell`。
   - 桌面端保持 2 : 6 : 2，移动端用 tabs/drawer，不强行压缩三列。
   - 修复候选池遮挡、纸面感、静态感和模块割裂问题。
   - 当前状态：已完成第一版新壳组合；下一阶段继续增强运行感，而不是回到旧纸面结构。

3. **Phase 8.2d：Live Radar Runtime Layer**
   - 加入启动动画、介绍 briefing、市场时段时钟、扫描心跳、倒计时、数据新鲜度和事件流动效。
   - 动效必须表达系统正在运行，不能干扰信号阅读。
   - 背景音乐删除，只保留未来可选提示音。
   - 当前状态：扫描心跳、倒计时、数据新鲜度、盘区时钟和运行状态矩阵已落地；启动动画和更完整事件流动效后移，不阻塞下一阶段山寨机会板。

4. **Phase 3.8：Altcoin Opportunity Board**
   - 把山寨币机会作为首页核心，而不是只展示通用候选池。
   - 分出多头升温、空头升温、过热勿追、新币观察、长尾轮转和近期异动来源。
   - 与扫描经济、涨跌榜归因、Signal Dossier 和复盘样本互通。
   - 当前状态：已完成基础机会板；它复用现有扫描、日记和每日异动只读数据，不新增 CoinGlass 请求；后续可继续增强排序解释、更多筛选和可视化细节。

5. **Phase 3.9：BTC ETH Macro Radar**
   - BTC/ETH/ETF/OI/funding/liquidations 作为大盘天气，不抢山寨主线。
   - 输出顺风、逆风、拥挤、去杠杆、假突破风险等环境层，影响机会排序和策略解释。
   - 当前状态：已完成 BTC/ETH Macro Weather 第一版；它复用现有扫描快照，不新增请求，不修改真实权重。ETF 专项端点仍需等 CoinGlass Hobbyist 可用性和 quota 先验证后再接入。

6. **Phase 4C：Market Structure Engine**
   - 下一步正确搭建项：从缓存多周期 K 线识别 HH/HL、LH/LL、range、breakout、breakdown、sweep、failed breakout、前高/前低/区间高低。
   - 结构层作为指标和形态之前的第一价格行为证据，负责解释位置、确认、失效和禁止追单。
   - 当前状态：未开始正式实现，已有多周期 OHLCV、指标矩阵和策略卡入口可复用。

7. **V1.7：Product Design 简报与角色设定固化**
   - 确认像素男性副驾驶的视觉关键词、装备等级、情绪状态和台词边界。
   - 明确 S680 从常规 UI 主线删除，不再作为默认座驾/装备/彩蛋。
   - 先出 3 个角色视觉方向，再选一个实现，不直接盲改。

8. **V1.8：像素副驾驶 MVP（已落地）**
   - 用现有组件边界替换或重构当前 `PixelS680`。
   - 初版只做一个男性像素小人、BTC 项链、3 个情绪状态和基础台词。
   - 保留 rank profile、纪律分、动量、热度等现有数据入口。
   - 为角色结构、中文台词和禁止喊单边界增加测试。

9. **V1.9：装备与段位联动**
   - 根据 XP、段位、纪律分解锁装备。
   - 初始只做 3-5 个装备层级，避免一次性堆太多皮肤。
   - 装备只能表达成长和纪律，不表达收益承诺。

10. **V2.0：主界面层级重排**
   - 弱化营销式 hero，强化当前选中信号工作区。
   - 建立 Command / Signal / System / Copilot 四类模块等级。
   - 让图表、多周期、策略计划和 AI 反证的视觉层级更清楚。

11. **V2.1：移动端交易操作流**
   - 移动端按“候选池 -> 信号详情 -> 策略计划 -> 复盘/副驾驶”顺序组织。
   - 优先保证不挤压、不重叠、关键操作一屏可理解。

12. **V2.2：动效与声音**
   - 只给状态变化加动效：新异动、接近触发、数据延迟、复盘完成、升级。
   - 遵守 `prefers-reduced-motion`，声音默认由用户主动开启。

13. **V2.3：视觉验收和部署**
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
