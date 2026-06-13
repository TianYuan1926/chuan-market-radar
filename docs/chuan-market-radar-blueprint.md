# 川 Market Radar 固化蓝图

> 本文是本项目的长期事实源。后续继续搭建、重构、接入数据源、调整 UI、加入 AI 或登录系统时，先检查本文，避免聊天上下文过长导致遗漏或逻辑漂移。

## 一句话定位

川 Market Radar 是一个公开访问的合约市场雷达网站，用于扫描加密市场中支持合约交易的币种，提前发现上涨或下跌前的异常迹象，并给出证据分层、策略计划、失败路径、复盘记录和系统自我进化反馈。

## 不做什么

- 当前不做登录系统。
- 当前不做自动下单。
- 当前不承诺实时秒级行情。
- 当前不把单一指标当作买卖信号。
- 当前不把 AI 输出当作最终裁决。
- 当前不把演示数据、缓存数据或缺字段数据说成真实生产级数据。

## 产品原则

1. **专业优先**：市场分析必须区分事实、推理、判断和策略，不能把结论写成玄学。
2. **灵活优先**：BTC 下跌、资金费率偏高、成交量不足等因素只能降权或进入观察，不能一刀切否定所有币种。
3. **证据优先**：每个信号必须能解释为什么出现、为什么不能追、什么条件失效。
4. **稳定优先**：业余版 CoinGlass API 需要低频、缓存、分批、降级和健康状态展示。
5. **可扩展优先**：数据源、分析引擎、AI 复核、复盘、告警、UI 模块必须保持边界清楚，方便后期替换。
6. **公开站点优先**：未登录阶段所有数据使用公共 scope，未来再扩展用户账户、个人 watchlist 和私有日记。
7. **有生命感**：网站可以有像素宠物、段位、彩蛋、声音、动画和幽默反馈，但市场判断区域必须严肃。

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

## 当前已落地模块

### 已落地：公开网站基础

- Next.js 项目结构已建立。
- Vercel 项目已连接 GitHub 仓库。
- 生产访问地址已生成。
- 页面有主雷达、策略卡、图表入口、事件中心、系统状态、复盘日记、段位、像素宠物、声音开关。

### 已落地：CoinGlass 数据接入骨架

- `MARKET_DATA_PROVIDER=coinglass` 且 `COINGLASS_API_KEY` 存在时启用 CoinGlass provider。
- `COINGLASS_BASE_ASSETS` 控制扫描资产白名单。
- `COINGLASS_BATCH_SIZE` 控制每轮请求数量。
- 15 分钟 cadence 下分批扫描，降低触发业余会员限速的概率。
- Provider 失败时可以使用缓存并显示 stale 状态。

### 已落地：Neon 持久化骨架

- `journal_events`：复盘日记、纸面跟踪、拒绝追单、失效记录。
- `scan_archives`：扫描快照、回放 frame、最近扫描对比。
- `rank_profiles`：段位、XP、纪律分、宠物状态。
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
- 当可选 OHLCV 数据源成功时，CoinGlass provider 已能把 `15m` candles 转换为技术指标证据。

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
- 策略卡会优先展示部分指标证据，方便用户快速看到 K 线侧依据。
- CoinGlass provider 在可选 OHLCV provider 成功时，会把 `15m` K 线指标写入信号证据。

## 当前未完整落地模块

### 未完整落地：真正的多周期融合分析

当前已经完成多周期 Profile 基础、分析引擎接入口、公开 OHLCV provider 边界，以及 `15m` 技术指标证据接入。但 CoinGlass provider 还没有把真实 OHLCV 多周期 candles 转换成每个币种的 `1m/5m/15m/30m/1h/4h/1d/1w` profile。后续必须把多周期 OHLCV candles 同时喂给 technical indicators 和 timeframe profile，才能算完整多周期融合。

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

当前依赖 `COINGLASS_BASE_ASSETS` 白名单，不是自动发现所有支持合约交易的币种。

后续需要：

- 资产 universe registry。
- 支持合约交易币种列表。
- 交易所覆盖状态。
- 当前扫描覆盖率。
- 未扫描原因。
- API quota 消耗估计。
- 低优先级币种轮转扫描。
- 高优先级币种加密扫描。

### 未完整落地：技术指标引擎

当前已具备基础技术指标计算和 `15m` 指标证据接入，但还不是完整指标引擎。后续必须扩展到多周期 candles，并补齐动能切换、成交量分布和结构确认能力。

已落地第一批指标：

- EMA：趋势方向和均线结构。
- RSI：强弱和过热。
- ATR：波动率和止损距离。
- Bollinger Band：压缩与突破。
- VWAP：日内资金均价。
- Swing High/Low：结构高低点。

仍未完整落地：

- MACD：动能切换。
- Volume Profile 或近似成交量分布：支撑阻力。
- 多周期指标矩阵：`1m/5m/15m/30m/1h/4h/1d/1w` 同币种指标证据。
- 指标证据与多周期 Profile 的统一权重校验。

指标不能直接变成买卖信号，只能变成证据层。

### 未完整落地：AI 复核链路

当前只有环境变量预留和 `ai_review` layer，占位还没有真正接入。

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

### 未完整落地：复盘自我提升

当前已有日记、段位和宠物，但还没有完整自动追踪信号结果。

后续需要：

- 信号生命周期：
  - born
  - watching
  - near_trigger
  - triggered
  - invalidated
  - expired
  - reviewed
- 自动 outcome tracking：
  - 1h 后检查是否误报。
  - 4h 后检查是否触发。
  - 24h 后检查是否达到目标或失效。
- 复盘结果写入 journal。
- 阈值校准：
  - 哪些因子经常误报就降权。
  - 哪些因子连续有效就升权。
  - 未验证规则进入实验区。
  - 坏规则从决策逻辑删除，只保留反面样本。

### 未完整落地：告警系统

当前只有网页内提示音。

后续需要：

- 浏览器 Notification API。
- 声音级别：
  - 普通观察
  - 接近触发
  - 已触发
  - 系统异常
- 重复告警抑制。
- 静默时段。
- Telegram 或 Webhook。
- 告警日志。

### 未完整落地：UI 精细化

当前 UI 方向已经比早期更接近像素二次元风格，但还不是最终质感。

最终 UI 方向：

- 像素二次元。
- 不幼稚。
- 有数据密度。
- 有动画和互动。
- 不走传统后台表格感。
- 不走冷酷科幻风。
- 网站命名为“川”。
- 宠物以迈巴赫 S680 为参考，但必须像素化、角色化、状态化，不能只是一张普通图片。
- 严肃区域严肃，彩蛋区域有趣。

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
- API 层必须缓存。
- 页面刷新不等于每次重新打 CoinGlass。
- 上游失败时展示 stale，而不是假装 ready。
- 健康状态必须展示：
  - provider
  - scan freshness
  - database mode
  - archive availability
  - rate limit
  - last successful scan
  - last failed scan

## 后续搭建顺序

### 阶段 1：蓝图固化

目标：把当前讨论结果写入仓库，成为后续开发事实源。

验收：

- 存在本蓝图。
- 存在后续执行计划。
- 后续对话先对照蓝图再继续开发。

### 阶段 2：真正多周期分析引擎

目标：让系统不是只显示多周期，而是真正用多周期做判断。

验收：

- `1m/5m/15m/30m/1h/4h/1d/1w` 都有角色定义。
- 单个币种可以生成多周期 profile。
- 信号输出显示多周期一致、冲突或等待确认。
- BTC/ETH 逆风只降权，不一刀切否定。

### 阶段 3：合约 universe registry

目标：管理所有支持合约交易的币种，并显示扫描覆盖率。

验收：

- 有资产注册表。
- 有扫描优先级。
- 有覆盖率展示。
- 有未扫描原因。

### 阶段 4：OHLCV 与技术指标

目标：接入免费 K 线数据并计算技术指标。

验收：

- 已部分完成：指标来自可选 OHLCV provider 的真实 candles。
- 已完成：指标进入 evidence layer。
- 已完成：策略不直接由单指标触发。
- 未完成：多周期 candles 全量接入。
- 未完成：MACD 与成交量分布。

### 阶段 5：AI 反证复核

目标：接入可配置模型，对规则引擎结果进行反证和解释。

验收：

- AI 有输入边界。
- AI 有成本限制。
- AI 失败不影响规则引擎。
- AI 输出明确区分事实、推理、判断、策略。

### 阶段 6：自我提升复盘

目标：自动追踪信号结果，并让系统从复盘中校准。

验收：

- 信号结果自动检查。
- journal 记录结果。
- rank 根据纪律和结果变化。
- 错误规则进入降权或删除流程。

### 阶段 7：告警系统

目标：让重要异动有可控提醒。

验收：

- 浏览器通知。
- 声音级别。
- 重复抑制。
- 外部通知预留。

### 阶段 8：UI 质感深化

目标：从“可用模板”升级为“川自己的风格”。

验收：

- 像素 S680 宠物状态更完整。
- 数据可视化更紧凑。
- 动画更自然。
- 移动端不挤压、不重叠。

## 每次继续开发必须遵守

1. 每完成一个阶段向用户汇报：
   - 本阶段是否成功。
   - 改了哪些文件。
   - 验证了什么。
   - 下一阶段是什么。
2. 能预览就让用户预览。
3. 任何“已完成”必须有验证证据。
4. 不能把骨架说成完整能力。
5. 不能因为上下文压缩丢掉本文约束。
