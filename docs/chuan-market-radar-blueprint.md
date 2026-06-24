# 川 Market Radar 核心蓝图

> 本文是 `/Users/chuan/Documents/web` 的长期事实源。后续新增、删除、优化、重构、部署、前端接线和数据源接入，都必须先对照本文。本文不再保存历史施工流水账；历史细节看 Git history 和专项文档。

> 最后整理日期：2026-06-24。当前阶段：腾讯云香港单机生产主线，GitHub `main` 为代码正本。

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

## 2. 不做什么

硬禁止：

- 不自动下单。
- 不接交易所下单 API。
- 不把 AI 当最终裁决。
- 不让前端编入场、止损、目标、方向或 RR。
- 不用 mock、旧缓存、0 值、动画或跳动数字冒充真实数据。
- 不把轻扫标记当交易信号。
- 不把榜单当推荐。
- 不把 CoinGlass 失败写成“市场无机会”。
- 不接入清算热力图，不实现 liquidation heatmap、liquidation zone、heatmap provider，不把潜在清算区作为方向或目标位依据。
- 不绕过付费套餐、登录、验证码、Cloudflare、防爬、会员墙、robots.txt 禁止路径。
- 不做中国大陆访问专项优化；当前主线是腾讯云香港。

允许保留但必须降级：

- 首页介绍：只说明网站是什么，不承载交易判断。
- 榜单：只做市场观察，不等于机会。
- 大盘环境：只做顺风/逆风背景，不直接给个币方向。
- 外部资讯：只做事件背景和风险输入，不直接喊单。
- AI 反证：只审查成熟候选，不扫描全市场，不绕过 Risk Gate。
- 告警：只提醒状态变化，不制造交易结论。
- 宠物、段位、彩蛋：只做纪律反馈、复盘反馈和系统状态提示，不能抢主线。

## 3. 信号成熟度

所有币必须分层展示，不能混在一起。

| 层级 | 含义 | 能否进主信号区 | 能否进狙击榜 | 能否出交易计划 |
| --- | --- | --- | --- | --- |
| `LIGHT_SCAN_MARK` | 轻扫发现异常 | 否 | 否 | 否 |
| `DEEP_SCAN_CANDIDATE` | 值得深扫验证 | 候选区 | 否 | 否 |
| `EVIDENCE_SIGNAL` | 已有结构和数据支持 | 是 | 否 | 仍需 Risk Gate |
| `TRADE_PLAN_READY` | 证据、结构、RR、风控都通过 | 是 | 是 | 是 |
| `BLOCKED` | 被 Risk Gate 拦截 | 可说明 | 否 | 否 |
| `INVALIDATED` | 结构失效 | 可归档 | 否 | 否 |
| `COOLDOWN` | 冷却观察 | 可说明 | 否 | 否 |

狙击榜只允许 `TRADE_PLAN_READY`。没有就空着，不能用候选补位。

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
-> RR 是否至少 3:1
-> Risk Gate 是否放行
-> 是否生成交易计划并进入复盘追踪
```

硬规则：

- 盘面结构优先于技术指标。
- 低周期不能推翻高周期。
- 技术指标只能辅助趋势、动能、波动、位置和衰竭判断。
- 单一指标、单一 K 线、单一数据源不能直接生成交易结论。
- Funding 高不是强势，优先解释为拥挤风险。
- OI 上升不能单独看涨。
- RSI 超买不等于做空，RSI 超卖不等于做多。
- RR `3:1` 是最低结构赔率下限，不是固定目标。
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
- 不能绕过 Evidence / Risk Gate 直接生成交易计划。
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
-> Evidence Fusion
-> Strategy Engine / Risk Gate
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

不能用动画替代运行证明。

### `/signals` 候选池与狙击榜

必须区分：

- 轻扫异常。
- 深扫候选。
- 证据信号。
- 计划就绪。
- 被拦截。
- 已失效。

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
- Risk Gate 为什么放行或拦截。
- 入场触发条件是什么。
- 止损在哪里。
- 目标在哪里。
- RR 是否达标。
- 分批止盈怎么做。
- 判断错了在哪里失效。
- 后续如何复盘。

没有后端结构化计划时，前端不得补交易计划。

### `/review` 复盘进化

必须回答：

- 哪类信号有效。
- 哪类信号坑人。
- 哪些币漏掉了。
- 哪些规则该增强。
- 哪些规则该降权。
- 当前样本有没有统计意义。
- AI 反证是否真的绑定证据。

样本不足必须显示 collecting / statistically thin，不能宣传稳定胜率。

### `/leaderboard` 榜单

只做观察，不做推荐。

必须显示：

- 榜单来源。
- 交易所范围。
- 排序口径。
- 更新时间。
- 是否候选。
- 是否深扫。
- 是否已有信号。

### `/market` 大盘环境

只做山寨顺风/逆风背景：

- BTC / ETH。
- BTC.D。
- TOTAL2 / TOTAL3。
- Funding / OI 背景。
- ETF / fear & greed 如真实接入才展示。

不能直接给个币买卖方向，不能降低 RR 门槛。

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
- RR / Risk Gate。
- TradingView 主图合同。
- 前端合同：radar、leaderboard、token dossier、review、journal、kline、external intel。
- `coreChainGovernance` 后端和前端合同。
- `/dashboard` 已展示 `coreChainGovernance` 核心链路体检面板。
- `/dashboard` 系统运行状态来自后端合同状态，不允许硬写“正常”。
- 全市场扫描证明头部状态来自 `scanProof.status`，不允许硬显示绿色健康。
- 复盘 outcome、missed opportunity、daily mover、forward map review 基础。
- AI 反证边界。
- 个人仓位镜头。
- 生产部署脚本和 smoke。

### 最近一次生产验收样本

最近一次已验证生产状态：

- GitHub 与腾讯服务器提交一致：`c58cb59`。
- `/api/health` 为 `ready`。
- 数据源为 `coinglass`。
- 数据库为 `ready`。
- 扫描为 `fresh`。
- 页面 `/`、`/dashboard`、`/signals`、`/leaderboard`、`/market`、`/review`、`/system` 返回 200。
- `/api/frontend/radar-contract` 返回 `core-chain-governance.v1`。
- `/api/radar/backend-contract` 返回 `core-chain-governance.v1`。
- 生产 smoke 显示 public leaderboards live，token dossier 图表 `canUseMockCandles=false`。

这些数字会随市场和扫描轮次变化；以最新 health、backend-contract、radar-contract 和 production smoke 为准。

## 8. 当前未完成

只列真实还需要做的核心工作，不列装饰性想法。

### P0：核心链路可见化与清理

- 全站页面、组件、接口逐项标记：核心 / 辅助 / 降级 / 合并 / 重构 / 删除。
- 删除或降级不服务核心链路的展示。
- 防止前端展示能力强于后端真实能力。

### P1：快速全市场扫描继续增强

- 验证 WebSocket 长期覆盖率和稳定性。
- 防止固定币长期霸占深扫位。
- 强化长尾冷门探索。
- 增强状态池历史表现排序。
- 增加长周期漏网统计。
- 继续最大化 Binance / OKX / Bybit public data。
- 继续最大化 CoinGlass Hobbyist 请求价值，但不能突破套餐限制。

### P2：机会发现质量增强

- 候选排序继续减少追涨浪费。
- 波动率压缩、量能启动、相对强弱、关键位接近度继续提高权重。
- 榜单、轻扫、深扫、证据、计划必须继续分层。
- 每个未进入下一层的币需要能解释原因。

### P3：策略输出增强

- 单币档案继续做强。
- 多周期结构展示继续细化。
- 关键位、Forward Map、支撑压力、失效线、目标区继续增强。
- 技术指标解释继续保持低权重辅助。
- 资金流、Taker、CVD proxy 未稳定前继续显示 partial。
- TradingView 与后端关键位/计划展示继续明确边界。

### P4：复盘进化增强

- 积累真实 outcome 样本。
- 完整统计 MFE / MAE / TP first / SL first / timeout。
- 强化 missed opportunity。
- 策略分型表现统计。
- 人工校准和回滚验证。
- 真实权重建议只能人工确认后生效，不能自动改实时权重。

### P5：合法外部情报

- 接 DEX Screener 官方 API 作为早期观察池。
- 接交易所官方公告和 RSS。
- 接 Token identity / logo / symbol mapping 数据源。
- 接宏观公开 API：BTC.D、TOTAL2、TOTAL3、稳定币流动性等。
- 所有外部事件必须转成 Evidence / Risk / Review，不能直接生成交易结论。

### P6：生产运维

- 继续稳定 GitHub -> 腾讯云自动发布。
- 补齐回滚脚本。
- 补齐日志打包。
- 补齐 Postgres 备份和恢复演练。
- 补齐 worker 长期异常告警。
- 持续检查服务器 HEAD 与 GitHub main 一致。

### P7：前端统一打磨

等核心链路稳定后再统一精修。

重点不是“更花”，而是：

- 信息密度更高。
- 运行状态更清楚。
- 分层更明确。
- 不隐藏候选。
- 不截断关键解释。
- 不把 partial 伪装成 ready。
- 动效只服务运行感。

## 9. 个人仓位镜头

本网站是为用户本人定制的合约雷达。

个人展示假设：

- BTC / ETH：固定 `150x`。
- 其他山寨币：按交易所允许最高杠杆换算。
- 仓位语境：全仓风险提示。
- 初始入场保证金：总资金 `0.3%`。

硬边界：

- 这只用于交易计划生成后的保证金、名义仓位、ROE、止损亏损和目标收益展示。
- 不改变 Evidence。
- 不改变 Risk Gate。
- 不改变 `3:1` 结构 RR。
- 不改变趋势阶段。
- 不新增自动下单权限。
- 如果山寨最高杠杆未知，必须显示 `waiting/unavailable`，不能臆造。

正确顺序：

```text
先有结构计划
-> 再算结构 RR
-> 再过 Risk Gate
-> 最后套个人仓位镜头做展示换算
```

## 10. AI 边界

AI 只能做：

- 找反证。
- 找逻辑漏洞。
- 把证据链解释得更清楚。
- 复盘归因。
- 生成更易读的中文报告。

AI 不能做：

- 全市场扫描。
- 直接喊买卖。
- 自动改权重。
- 绕过 RR。
- 绕过 Risk Gate。
- 绕过结构失效。
- 凭空新增事实。

AI 输出必须绑定 EvidenceItem、signal id、review sample 或已知后端事实。

## 11. 测试和验收

每次重要搭建至少按改动类型运行：

- `npm run typecheck`
- `npm run test:market`
- `npm run lint`
- `npm run build`

涉及生产时还要运行：

- `npm run production:deploy`
- `npm run production:smoke`

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

开始前：

1. 先读本蓝图。
2. 判断本轮改动服务四大核心能力中的哪一个。
3. 判断它进入核心链路哪一环。
4. 判断是否会引入假数据、旧数据、重复展示或误导。

开发中：

1. 优先复用现有后端合同、Evidence、Risk Gate、Review 和 Repository。
2. 不新建平行逻辑。
3. 不让 UI 自己推导交易判断。
4. 发现垃圾代码、死代码、重复文档、旧规则，直接清理。
5. 发现同类隐患，连同当前问题一起处理。

收尾时：

1. 跑对应测试和构建。
2. 更新蓝图：已完成移出未完成，旧规则删除或替换。
3. 提交到 GitHub。
4. 需要上线时按生产发布流程部署到腾讯云。
5. 汇报完成了什么、验证了什么、发现了什么、剩余什么。
