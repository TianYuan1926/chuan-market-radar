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

## 产品原则

1. **专业优先**：市场分析必须区分事实、推理、判断和策略，不能把结论写成玄学。
2. **灵活优先**：BTC 下跌、资金费率偏高、成交量不足等因素只能降权或进入观察，不能一刀切否定所有币种。
3. **证据优先**：每个信号必须能解释为什么出现、为什么不能追、什么条件失效。
4. **稳定优先**：业余版 CoinGlass API 需要低频、缓存、分批、降级和健康状态展示。
5. **可扩展优先**：数据源、分析引擎、AI 复核、复盘、告警、UI 模块必须保持边界清楚，方便后期替换。
6. **公开站点优先**：未登录阶段所有数据使用公共 scope，未来再扩展用户账户、个人 watchlist 和私有日记。
7. **有生命感**：网站可以有像素副驾驶、段位、装备、彩蛋、声音、动画和幽默反馈，但市场判断区域必须严肃；角色反馈只能做情绪、纪律和复盘陪跑，不能替代信号判断。
8. **长期迭代优先**：V3.0 不是最终版，而是专业稳定底座版；后续新增功能、优化功能、替换数据源、调整 UI 或加入登录系统时，必须通过模块边界、测试、迁移和预览验证继续迭代，不能靠堆代码硬加。
9. **路线动态校准**：每完成一个阶段后，必须基于当下真实代码、数据源、验证结果和线上约束重新判断后续顺序；如果旧计划已被部分覆盖、优先级变化或出现更关键风险，后续计划要良性调整，不能机械照搬历史清单。

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
| 阶段 2：真正多周期分析引擎 | 基础已落地，受限主候选已接入真实多周期 OHLCV profile、指标矩阵摘要和基础指标/周期校准 | 尚未完成完整权重回测校准、交互式多周期图表和全量候选覆盖 |
| 阶段 3：合约 universe registry | 基础、三交易所自动发现、分层币池、低频轮转、覆盖差异、quota 护栏、动态优先级和 repository hints 基础已落地 | 尚未完成高优先级加密扫描和覆盖差异前端展示 |
| 阶段 4：OHLCV 与技术指标 | 基础已落地，受限主候选已接入 `1m/5m/15m/30m/1h/4h/1d/1w` candles、MACD、近似成交量分布、指标矩阵摘要、策略卡前端矩阵基础展示和基础指标/周期权重校准 | 尚未完成完整回测权重校准、交互式多周期图表和更专业的成交量分布模型 |
| 阶段 5：AI 反证复核 | 边界已落地 | 尚未配置生产模型、多模型对照、成本统计和复盘校准 |
| 阶段 6：自我提升复盘 | 基础已落地 | 尚未有定时 outcome executor 自动读取数据库并写回复盘 |
| 阶段 6B：每日异动归因复盘 | 逻辑、数据源适配器、抓取写入服务、受保护 API、公开只读 API、外部 cron 策略、schema、repository、公开复盘面板、历史样本选择、单样本详情、只读关联摘要、规则校准建议、校准候选入复盘队列、按 tag 汇总的只读校准反馈趋势、人工回测候选链路、历史样本验证层、策略版本草案链路、人工确认记录、确认后表现反馈基础、K 线回测低成本计划边界、K 线缓存持久化、受保护低频填充 MVP、缓存 K 线验证结果和 observedAt 事件窗口回测已落地 | 尚未完成策略表现长周期统计/版本回滚和自动权重调整 |
| 阶段 7：告警系统 | 网页内基础已落地 | 尚未有 Telegram/Webhook、持久化告警历史、多设备推送 |
| 阶段 8：UI 质感深化 | 第一轮已落地 | 像素男性副驾驶 MVP 已落地；装备升级、移动端细节、图表密度和更完整交互动效仍需继续打磨 |

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
- 已新增 Binance public futures `exchangeInfo` 自动发现入口，筛选 `TRADING`、`PERPETUAL`、`USDT` 合约。
- 已新增 OKX public instruments 自动发现入口，筛选 `SWAP`、`linear`、`live`、`USDT` 合约。
- 已新增 Bybit V5 public instruments 自动发现入口，筛选 `linear`、`LinearPerpetual`、`Trading`、`USDT` 合约，并支持 cursor 分页。
- CoinGlass provider 会把 Binance/OKX/Bybit 发现到的 USDT 永续合约并入 universe scan plan；某个交易所发现失败时不会拖垮整个扫描，所有交易所都失败时才回退到配置白名单并在 metadata notes 中显示原因。
- 已支持分层币池：BTC/ETH 为 anchor，配置白名单和高流动性币为 core，中等流动性币为 active，仅被发现但未验证流动性的币先归为 long_tail。
- 已支持长尾低频抽样轮转：在 `COINGLASS_BATCH_SIZE=3` 这类小批次下，BTC/ETH 固定保留，core 优先轮转，long_tail 默认每 8 个扫描窗口抽样一次，避免 CoinGlass 业余会员被全市场发现打爆。
- 已支持多交易所覆盖差异分类：`major_three`、`multi_exchange`、`single_exchange`、`unlisted`。
- `metadata.coverage.exchangeCoverage` 会记录每个币种在哪些交易所有 USDT 永续，`exchangeCoverageSummary` 会输出覆盖质量汇总。
- 已支持 API quota 消耗估计：每轮 CoinGlass 请求数、每日 CoinGlass 预估请求数、public discovery 预估请求数、预算使用率和状态。
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
- 规则调整已有基础函数：
  - 有效标签进入 promote。
  - 重复失败标签进入 demote。
  - 未充分验证标签留在 experiment。

后续需要：

- 信号生命周期：
  - born
  - watching
  - near_trigger
  - triggered
  - invalidated
  - expired
  - reviewed
- 自动 outcome tracking 的真实行情执行器：
  - 从数据库读取待复查 journal。
  - 按 checkpoint 拉取对应 OHLCV。
  - 写回复盘事件和 rank profile。
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
- K 线回测计划边界：`GET /api/daily-movers` 会输出 `klineBacktestPlan`，从 `backtestCandidates` 和已存每日异动样本生成 planning-only 的缓存计划，包含候选状态、计划币种、周期、缓存键、预算封顶和 deferred symbols；`canFetchExternalCandles` 固定为 `false`，`requiresCacheBeforeExecution` 固定为 `true`，数据源策略固定为 `public_ohlcv_cache_only_no_coinglass`。
- K 线缓存持久化：新增 `ohlcv_candle_cache` 表、repository 读写方法和内存/Neon 双路径实现，用 `scope + symbol + interval` 做缓存键，保存公开 OHLCV candles、来源、拉取时间和样本边界。
- 低频 K 线缓存填充 MVP：新增 `runDailyMoverKlineCacheFill()` 和 `POST /api/admin/daily-movers/klines/fill`，必须带 `Authorization: Bearer <CRON_SECRET>`；默认从 repository 生成计划，只拉公开 Binance Futures OHLCV，不占用 CoinGlass 请求，跳过已有缓存，并受 `KLINE_BACKTEST_DAILY_REQUEST_BUDGET` 和 `KLINE_BACKTEST_MAX_SYMBOLS_PER_RUN` 封顶。
- 缓存 K 线验证结果：`GET /api/daily-movers` 会输出 `klineBacktestResults`，只读取 bounded `ohlcv_candle_cache`，计算缓存覆盖率、周期涨跌幅、最大冲高、最大回撤和量能变化；结果保持 `cached_kline_validation`、`research_only`、`canAutoAdjustWeights: false`，不触发外部请求。
- observedAt 事件窗口回测：`klineBacktestResults.eventWindowResults` 会按每日异动样本的 `observedAt` 把已缓存 candles 拆成 pre/post 窗口，输出样本方向、pre/post K 线数量、post 回撤/冲高、量能扩张和 `post_move_confirmed / pre_move_evidence / neutral / window_missing` 判定；该结果仍只读、不触发外部请求、不自动调权重。
- 免费套餐护栏：关联摘要最多读取 12 个扫描归档和 80 条日记，只做只读聚合，不新增表、不增加 CoinGlass 请求、不增加数据库写入频率。
- 安全边界：输出必须保持 `allowedUse: "research_only"`，只能用于归因复盘、样本库和规则校准。

后续需要：

- 建立策略版本长周期表现统计和版本回滚边界，继续记录“候选建议 -> 样本验证 -> 人工确认 -> 后续表现”的链路。
- 自动权重调整仍需单独准入、测试和回滚设计，不能因为人工确认记录存在就直接开启。
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

- Telegram 或 Webhook。
- 可配置静默时段。
- 可配置告警等级阈值。
- 告警历史持久化。
- 多设备推送。

### 未完整落地：UI 精细化

当前 UI 方向已经比早期更接近像素二次元风格，但还不是最终质感。2026-06-14 已完成第一轮质感深化：加入页面扫描网格、候选信号节奏条、像素 S680 telemetry 仪表，并保留 `prefers-reduced-motion` 降级。

2026-06-14 V1.6 已继续完成第一轮中文化和 S680 宠物基础重画：

- 雷达面板、策略、系统状态、事件中心、复盘、回放、段位和宠物的主要 reader-facing 控件改为中文优先。
- 复盘面板未选中标的时显示“未选择”，不再显示英文空态。
- S680 宠物不使用普通图片，继续由 CSS 像素结构绘制，并新增角色脸、眼睛和地面影子。
- 新增 repository hygiene 测试约束中文化锚点和 S680 结构件，避免后续回退。

2026-06-14 新增角色方向：宠物本体从“S680 车”升级为 **川的像素男性副驾驶**。S680 不再是唯一宠物本体，而是可以保留为副驾驶的座驾、高级装备或彩蛋。新角色方向如下：

- 男性像素小人，中文语境下像“坐在交易桌旁的话唠队友”，不是幼稚吉祥物。
- 核心识别物是一颗 BTC 项链，初始装备必须能一眼看出加密市场属性。
- 角色可以随着段位和 XP 提升获得装备，类似打怪升级：
  - 初始：短发或像素帽、黑色外套、BTC 项链。
  - 进阶：耳机、手套、战术背心、段位徽章、屏幕眼镜。
  - 高阶：金色项链强化、披风或座驾 S680、专属扫描仪、冠军外套。
- 角色必须有情绪状态：巡航、警戒、刹车、兴奋、复盘、数据延迟、纪律表扬。
- 角色是幽默话唠，但必须服务纪律提醒和复盘反馈；不能喊单、不能替代规则引擎、不能在严肃市场判断区抢戏。
- 角色台词风格：中文、短句、毒舌但不冒犯、像纪律教练。例如“别硬开，市场不是你家提款机”“你这不是进场，是给别人结账”“情报断了，先别装诸葛亮”。

2026-06-14 V1.8 已落地像素副驾驶 MVP：

- `PixelS680` 继续保留现有组件边界，但宠物主角改为男性像素副驾驶。
- 初版已包含 BTC 项链、基础装备条、巡航/警戒/刹车 3 个情绪状态和纪律型话唠台词。
- S680 保留为副驾驶座驾、装备或彩蛋，不再承担全部宠物人格。
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
- S680 可以作为副驾驶座驾、装备、皮肤或彩蛋保留，但不再要求它承担全部宠物人格。
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

当前状态：基础已完成，Binance/OKX/Bybit USDT 永续自动发现已完成，分层币池、长尾低频轮转、多交易所覆盖差异、API quota 护栏、动态优先级基础和 repository hints 基础已完成。

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

当前状态：生命周期和评分基础已完成，自动执行器未完成。

已具备：

- 信号进入 journal 时会带 `1h / 4h / 24h` 复查节点。
- outcome-tracker 已能根据后续 K 线判断 partial win、saved、loss、expired。
- journal 已支持记录 outcome。
- rank 已能根据纪律和结果变化。
- 规则调整已有 promote、demote、experiment 基础函数。

下一步深化：

- 定时 executor 需要从数据库读取待复查 journal。
- executor 需要按 checkpoint 拉取未来 OHLCV，写回复盘结果。
- 反复误报的规则必须进入降权、隔离或删除流程。

### 阶段 7：告警系统

目标：让重要异动有可控提醒。

当前状态：网页内基础告警已完成，外部通知和持久化未完成。

已具备：

- 浏览器通知。
- 声音级别。
- 重复抑制。
- 静默时段。
- 系统异常告警。
- 事件中心合并展示。

下一步深化：

- 外部通知预留。
- Telegram/Webhook。
- 可配置静默时段和告警阈值。
- 告警历史持久化。

### 阶段 8：UI 质感深化

目标：从“可用模板”升级为“川自己的风格”。

验收：

- 第一轮已落地：像素 S680 宠物状态仪表更完整。
- 第一轮已落地：候选信号节奏条让数据可视化更紧凑。
- 第一轮已落地：页面扫描网格和低干扰动画增强整体生命感。
- V1.6 已落地：主要面板中文优先，S680 增加角色化脸部、眼睛和地面影子。
- V1.8 已落地：`PixelS680` 加入男性像素副驾驶、BTC 项链、基础装备条和禁止喊单测试。
- 移动端不挤压、不重叠。

后续正确 UI 搭建顺序：

1. **V1.7：Product Design 简报与角色设定固化**
   - 确认像素男性副驾驶的视觉关键词、装备等级、情绪状态和台词边界。
   - 明确 S680 作为座驾/装备/彩蛋保留，而不是宠物主角。
   - 先出 3 个角色视觉方向，再选一个实现，不直接盲改。

2. **V1.8：像素副驾驶 MVP（已落地）**
   - 用现有组件边界替换或重构当前 `PixelS680`。
   - 初版只做一个男性像素小人、BTC 项链、3 个情绪状态和基础台词。
   - 保留 rank profile、纪律分、动量、热度等现有数据入口。
   - 为角色结构、中文台词和禁止喊单边界增加测试。

3. **V1.9：装备与段位联动**
   - 根据 XP、段位、纪律分解锁装备。
   - 初始只做 3-5 个装备层级，避免一次性堆太多皮肤。
   - 装备只能表达成长和纪律，不表达收益承诺。

4. **V2.0：主界面层级重排**
   - 弱化营销式 hero，强化当前选中信号工作区。
   - 建立 Command / Signal / System / Copilot 四类模块等级。
   - 让图表、多周期、策略计划和 AI 反证的视觉层级更清楚。

5. **V2.1：移动端交易操作流**
   - 移动端按“候选池 -> 信号详情 -> 策略计划 -> 复盘/副驾驶”顺序组织。
   - 优先保证不挤压、不重叠、关键操作一屏可理解。

6. **V2.2：动效与声音**
   - 只给状态变化加动效：新异动、接近触发、数据延迟、复盘完成、升级。
   - 遵守 `prefers-reduced-motion`，声音默认由用户主动开启。

7. **V2.3：视觉验收和部署**
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
