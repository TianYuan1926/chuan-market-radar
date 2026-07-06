# Market Radar 项目总览交接文件

生成日期：2026-07-05  
用途：给外部架构审计员 / ChatGPT 快速理解项目全景、边界、生产状态、代码结构、测试状态、未解决问题和下一步方向。  
敏感信息策略：所有密钥、连接串、服务器密码、cookie、token、私钥均视为 `[REDACTED]`。本文不包含真实 secret。

## 1. 项目一句话定义

Market Radar 是一个面向山寨币合约市场的雷达系统，用于快速全市场扫描，发现山寨币机会，给出策略，并通过复盘持续自我提升。

## 2. 项目唯一核心目标

唯一核心目标：

```text
快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。
```

四个核心能力：

1. **快速全市场覆盖扫描**：尽快覆盖 Binance / OKX / Bybit 等公开合约市场，发现哪些币开始异常波动。
2. **发现真正有价值的机会**：从涨跌幅、成交、压缩、相对强弱、关键位、衍生品验证中筛出值得继续深扫的标的。
3. **给出可执行、可解释、可失效的策略**：明确为什么看、能不能做、触发条件、止损、目标、结构盈亏比、失效条件。
4. **通过复盘持续自我提升**：追踪命中、失败、超时、漏判、错判、策略分型表现，避免系统只会展示而不能进化。

当前必须诚实说明：系统已具备可运行的扫描、展示、生产部署和部分复盘基础，但仍不能写成“实战成熟交易系统”。

## 3. 核心链路

固定链路：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

### 3.1 全市场发现

- 环节：全市场发现
- 负责目录：`src/lib/market`、`deploy/workers`
- 关键文件：`src/lib/market/universe-registry.ts`、`src/lib/market/providers/public-futures-universe-discovery.ts`、`src/lib/market/providers/public-light-scan.ts`、`src/lib/market/ws-light-scan.ts`、`deploy/workers/ws-light-scan-worker.mjs`
- 输入：Binance / OKX / Bybit public universe、public ticker、WebSocket 轻扫数据、Redis 轻扫快照
- 输出：可扫描 universe、轻扫覆盖数、轻扫候选、实时能力状态、扫描证明
- 当前状态：生产 smoke 显示 totalMonitored=593、scannable=593、lightScanned=593、coverage=100；WebSocket secondLevelOnline=true
- 主要风险：轻扫只能发现异常，不能生成交易计划；WebSocket 快照 stale 时必须明确降级；全市场覆盖成功不等于机会筛选成熟

### 3.2 候选筛选

- 环节：候选筛选
- 负责目录：`src/lib/market`、`src/lib/api`
- 关键文件：`src/lib/market/scan-state-pool.ts`、`src/lib/market/scan-coordinator.ts`、`src/lib/market/universe-priority-hints.ts`、`src/lib/api/backend-contract.ts`
- 输入：轻扫候选、状态池、历史 hints、daily mover 样本、候选轮换状态
- 输出：深扫排队、当前批次、长时间未扫资产、候选分层、rotation audit
- 当前状态：已有状态池、两阶段 allocation、rotation audit；第一轮修复了 `WARM` 资产深扫排队证明边界
- 主要风险：候选排序主干仍需长期验证，不能让少数热门币长期霸占 Top10；候选不能冒充信号

### 3.3 深扫验证

- 环节：深扫验证
- 负责目录：`src/lib/market/providers`、`deploy/workers`
- 关键文件：`src/lib/market/providers/coinglass-provider.ts`、`src/lib/market/providers/coinglass-client.ts`、`src/lib/market/providers/coinglass-capability-probe.ts`、`deploy/workers/protected-api-worker.mjs`
- 输入：深扫候选、CoinGlass Hobbyist 可用端点、公开交易所衍生品补充数据
- 输出：OI、Funding、pairs markets、CoinGlass capability、深扫 cleanRows/rawRows/failures
- 当前状态：第二轮生产 smoke 显示后端深扫 planned=24、rawRows=624、cleanRows=45、failureSample=[]；CoinGlass 核心深扫可用，但 Taker/CVD 类能力仍需标注 partial/unavailable
- 主要风险：CoinGlass Hobbyist 有限速和端点边界；CoinGlass 失败不能写成市场无机会；公开交易所深扫不能冒充 CoinGlass

### 3.4 结构分析

- 环节：结构分析
- 负责目录：`src/lib/analysis`、`src/lib/analysis/v3`
- 关键文件：`src/lib/analysis/v3/market-reading-engine.ts`、`src/lib/analysis/v3/key-level-engine.ts`、`src/lib/analysis/v3/forward-level-map.ts`、`src/lib/analysis/v3/pattern-library.ts`、`src/lib/analysis/v3/current-signal-dossier.ts`
- 输入：OHLCV、关键位、趋势完整度、形态、技术指标辅助、宏观锚点、衍生品证据
- 输出：结构判断、关键位、Forward Map、证据链、反证链、成熟度
- 当前状态：已有 v3 结构分析骨架和测试；TradingView/Kline 合同已有基础；但分析报告可读性和实战稳定性仍需要专业回测继续校验
- 主要风险：技术指标不能单独给结论；低周期不能推翻高周期；大涨后看多/大跌后看空容易晚到

### 3.5 风险赔率

- 环节：风险赔率
- 负责目录：`src/lib/analysis/v3`、`src/lib/risk`
- 关键文件：`src/lib/analysis/v3/trade-plan.ts`、`src/lib/analysis/v3/forward-level-map.ts`、`src/lib/risk/personal-position-lens.ts`
- 输入：入场触发、止损、目标、关键位、结构空间、个人杠杆展示参数
- 输出：结构盈亏比、风控门禁、是否允许生成计划
- 当前状态：最低结构盈亏比 3:1 是硬下限；个人仓位镜头用于展示风险，不允许改变结构 RR 逻辑
- 主要风险：策略层容易卡死或过松；止损/目标位必须更聪明而不是单纯放宽；杠杆展示不能绕过风控门禁

### 3.6 交易计划

- 环节：交易计划
- 负责目录：`src/lib/analysis/v3`、`src/lib/api`、`src/components/token`
- 关键文件：`src/lib/analysis/v3/trade-plan.ts`、`src/lib/market/signal-backend-dossier.ts`、`src/app/api/frontend/token-dossier/route.ts`、`src/components/token/token-dossier.tsx`
- 输入：证据融合、结构分析、风险赔率、风控门禁、成熟度
- 输出：可执行计划、等待条件、失效条件、分批止盈、不可交易原因
- 当前状态：已有 token dossier 和 strategyV3 输出基础；计划复核区只允许后端事实源确认的 `TRADE_PLAN_READY`
- 主要风险：前端不能编计划；`WAIT` 不能冒充 `READY`；没有计划就绪时宁可空，不允许候选补位

### 3.7 复盘进化

- 环节：复盘进化
- 负责目录：`src/lib/analysis/v3`、`src/lib/market`、`src/lib/api`、`src/app/review`
- 关键文件：`src/lib/analysis/v3/forward-map-review.ts`、`src/lib/analysis/v3/forward-map-review-executor.test.ts`、`src/lib/market/daily-mover-ingest.ts`、`src/lib/market/daily-mover-kline-backtest.ts`、`src/app/api/frontend/review-contract/route.ts`
- 输入：信号生命周期、daily movers、后续价格路径、MFE/MAE、命中/失败/超时、漏判样本
- 输出：复盘报告、策略分型统计、错判/漏判归因、下一步规则建议
- 当前状态：已有 review contract、daily mover、outcome、forward map review 基础；但样本和能力验收仍不足
- 主要风险：回测 future outcome 不得污染 production score；复盘结论不能自动改生产权重；当前系统仍需要更多真实样本验证

## 4. 当前技术架构

- 前端：Next.js App Router + React + TypeScript + Tailwind，页面位于 `src/app`，组件位于 `src/components`
- 后端：Next.js Route Handlers，核心 API 位于 `src/app/api`，业务逻辑主要位于 `src/lib`
- 数据库：PostgreSQL，生产由 Docker Compose `postgres` 服务提供，持久化通过 repository 层访问
- 缓存：Redis，生产由 Docker Compose `redis` 服务提供，用于 WebSocket 轻扫快照、运行状态等
- worker：Docker Compose worker 服务，包括 scanner、websocket light scan、coinglass、signal、dynamic scheduler、macro
- 反代：Caddy，配置位于 `deploy/caddy/Caddyfile`
- 部署：Docker Compose 单机部署
- 代码正本：GitHub `main`
- 生产服务器：腾讯云香港单机
- reports volume：Docker volume `reports-data`，挂载到 `/app/reports`
- 重要边界：Vercel / Neon 已不再是主部署路线，但旧配置未必全部删除；当前生产主线是腾讯云香港单机

## 5. Docker 服务清单

| 服务名 | 作用 | 启动命令 | 依赖 | 是否核心 | 当前风险 |
|---|---|---|---|---|---|
| `web` | Next.js 前端和 API 服务 | Dockerfile 默认启动 `npm run start` | postgres、redis | 是 | Web 健康依赖 `/api/health`，如果只页面 200 不代表业务实战成熟 |
| `caddy` | 公网 HTTP/HTTPS 入口和反向代理 | `caddy run --config /etc/caddy/Caddyfile` | web healthy | 是 | Caddy 正常只能证明入口可访问，不能证明分析能力 |
| `postgres` | 生产关系数据库 | postgres 官方镜像 entrypoint | 无 | 是 | 不允许在普通轮次清表/迁移；备份恢复演练仍应持续验证 |
| `redis` | 缓存、WebSocket 轻扫快照、运行状态 | `redis-server --appendonly yes` | 无 | 是 | Redis 正常不代表快照新鲜，必须看 stale/age |
| `scanner-worker` | 定时触发 `/api/scan` | `node deploy/workers/protected-api-worker.mjs scanner` | web healthy | 是 | CRON_SECRET 错误会导致扫描停摆；served_cache 不能冒充 updated |
| `websocket-light-worker` | Binance/OKX/Bybit WebSocket 秒级轻扫 | `node deploy/workers/ws-light-scan-worker.mjs` | redis、web | 是 | 秒级轻扫只做发现和调度，不能直接生成交易计划 |
| `coinglass-worker` | daily mover ingest 和 K 线缓存填充 | `node deploy/workers/protected-api-worker.mjs coinglass` | web healthy | 是 | CoinGlass 限速/端点不可用必须 partial/unavailable，不可静默降级成假数据 |
| `signal-worker` | outcome、forward map review、shadow tracker | `node deploy/workers/protected-api-worker.mjs signal` | web healthy | 是 | 复盘结果不能污染生产排序或实时评分 |
| `dynamic-scan-scheduler` | health watch 和动态扫描调度辅助 | `node deploy/workers/protected-api-worker.mjs dynamic` | web healthy | 是 | 只能调度/观察，不能绕过扫描链路边界 |
| `macro-worker` | 宏观环境采集 | `node deploy/workers/protected-api-worker.mjs macro` | web healthy | 辅助核心 | 宏观环境只能做顺风/逆风背景，不能直接给个币方向 |

## 6. 主要页面说明

| 页面 | 页面作用 | 主要 API / 数据入口 | 展示什么 | 不能展示什么 | 是否可能误导用户 | 当前状态 |
|---|---|---|---|---|---|---|
| `/dashboard` | 雷达总控 | `getRadarContractForPage`、`getLeaderboardContractForPage`、`/api/frontend/radar-contract` | 系统状态、覆盖率、候选池摘要、轻扫/深扫、数据源、大盘环境 | 不能把候选当交易推荐 | 是，如果只看卡片不看成熟度 | 可访问；production smoke 200 |
| `/signals` | 候选验证台 | `getRadarContractForPage`、`getLeaderboardContractForPage` | 验证成熟度池、计划复核区、异动候选明细 | 轻扫标记不能进主信号区；WAIT 不能进计划复核区 | 是，尤其候选/观察项/计划边界 | 可访问；需继续审计展示是否强于后端 |
| `/leaderboard` | 每日异动复盘榜 | `getAllLeaderboardContractsForPage`、`/api/frontend/leaderboard` | 涨跌幅、成交额、强弱、衍生品排行和候选标记 | 榜单不能冒充推荐 | 是，榜单天然容易诱导追涨杀跌 | 可访问；production smoke 显示榜单 live |
| `/market` | 大盘环境与市场数据 | `getRadarContractForPage`、leaderboard contracts | BTC/ETH、BTC.D/TOTAL2/TOTAL3、衍生品/宏观环境 | 宏观不能直接给个币方向 | 中等，需明确 context-only | 可访问 |
| `/token/[id]` | 单币档案 | `getTokenDossierContractForPage`、`getKlineContractForPage`、leaderboards | TradingView/K线合同、证据链、关键位、风控、计划状态、历史样本 | 前端不能编交易计划；无后端证据不能显示 READY | 高，是交易决策核心页 | 可访问；需要重点审计实战可读性 |
| `/review` | 复盘进化中心 | `getReviewContractForPage`、`/api/frontend/review-contract` | daily mover、扫描帧、交易日记、样本归因、回测/复盘状态 | 不能把回测结论写进生产排序 | 高，future outcome 污染风险 | 可访问；需要持续样本验证 |
| `/system` | 系统中心 | `getRadarContractForPage` | 服务健康、数据源、扫描稳定性、告警/偏好 | 不能把系统健康等同于交易能力健康 | 中等 | 可访问 |
| `/login` | 身份核验入口 | `src/components/auth/login-terminal.tsx`、auth middleware/config | 私有模式下的登录入口 | 不能泄露服务端数据 | 中等；取决于私有模式配置 | 页面存在，需单独审计 session/路由级鉴权 |

页面硬规则：

- 候选不能冒充信号。
- WAIT 不能冒充 READY。
- 榜单不能冒充推荐。
- 前端不能编交易计划。

## 7. API 合同说明

| API | 作用 | 是否公开 | 是否需要 CRON_SECRET | 是否读 DB | 是否写 DB | 是否读 Redis | 是否调用外部 API | 是否给前端展示 | 风险 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `/api/health` | 系统健康、数据源、持久化、扫描、worker heartbeat | 是 | 否 | 是 | 否 | 可能 | 否 | 是 | ready/fresh 只能证明运行状态，不等于实战能力成熟 |
| `/api/scan` | GET 读扫描摘要；POST 触发扫描刷新 | GET 公开，POST 受保护 | POST 是 | 是 | POST 可能写归档/状态 | 可能 | POST 可能调用 | 部分 | served_cache 不能冒充 updated；POST 未授权必须失败 |
| `/api/archive` | 扫描回放归档读取 | 是 | 否 | 是 | 否 | 否 | 否 | 是 | 归档为空或旧数据时必须明确 |
| `/api/frontend/radar-contract` | 前端雷达总控合同 | 是 | 否 | 是 | 否 | 可能 | 间接读取缓存 | 是 | 前端主事实源，不能静默补假数据 |
| `/api/frontend/leaderboard` | 前端榜单合同 | 是 | 否 | 是/可能 | 否 | 可能 | 可能调用公开市场数据 | 是 | 榜单只做观察和复盘，不可推荐交易 |
| `/api/frontend/token-dossier` | 单币档案合同 | 是 | 否 | 是 | 否 | 可能 | 否/间接 | 是 | 交易计划必须来自后端 dossier，前端不能编 |
| `/api/frontend/kline-contract` | K线/TradingView/关键位合同 | 是 | 否 | 是 | 否 | 否 | 否/间接 | 是 | K线缺失时必须 waiting/unavailable，不可用 mock 伪装 |
| `/api/frontend/review-contract` | 复盘中心合同 | 是 | 否 | 是 | 否 | 可能 | 否 | 是 | 复盘样本不能污染生产排序 |
| `/api/radar/backend-contract` | 后端总事实合同 | 是 | 否 | 是 | 否 | 可能 | 否/间接 | 给前端和审计 | 合同字段多，前端不能只取好看的字段 |
| `/api/radar/business-capability` | 业务能力状态合同 | 是 | 否 | 是 | 否 | 可能 | 否 | 是/审计 | readiness 不是收益能力证明 |
| `/api/admin/*` | 生产运维、ingest、outcome、migration、capability 等 | 否 | 是 | 视接口而定 | 视接口而定 | 视接口而定 | 视接口而定 | 否 | 必须严格鉴权；不得泄露 secret；普通轮次不得随意迁移/清表 |

## 8. 数据源说明

| 数据源 | 用途 | 是否秒级 | 是否能生成交易计划 | 失败时如何展示 | fallback | 当前边界 |
|---|---|---:|---:|---|---|---|
| Binance | USDT 永续 universe、ticker、K线、部分 public 衍生品、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否，只能参与发现/验证 | partial/stale/failed | OKX/Bybit/public REST | 交易所数据不能单独给策略 |
| OKX | universe、ticker、K线、public swap 数据、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否 | partial/stale/failed | Binance/Bybit | symbol 格式和合约口径需清洗 |
| Bybit | universe、ticker、public linear 数据、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否 | partial/stale/failed | Binance/OKX | 只能做交叉验证/轻扫补充 |
| CoinGlass Hobbyist | OI、Funding、pairs markets、深扫验证、daily movers | 否，受 30 调用/分钟和端点限制 | 否，必须经过结构分析和风控后才可能形成计划 | partial/unavailable/upgrade_required/auth_error/rate_limited | 公开交易所衍生品补充，但不能冒充 CoinGlass | Taker/CVD 类能力不能写成完整可用 |
| CoinGecko | BTC.D、TOTAL2/TOTAL3、trending、market context | 否 | 否 | partial/stale/unavailable | DefiLlama/公开源 | 宏观和榜单 context-only |
| DefiLlama | 宏观/链上/TVL/稳定币等 context | 否 | 否 | partial/stale/unavailable | CoinGecko/其它公开源 | 不能直接给个币方向 |
| DEX Screener | DEX 新币观察、流动性、热度、外部事件 | 接近实时但非交易所秒级 | 否 | context-only/partial | CoinGecko trending/external intel | 只做早期观察，不直接进合约交易计划 |
| 其它 external intel | 情报、事件、logo/身份映射、新闻背景 | 否 | 否 | context-only/partial/unavailable | 无或人工复核 | 外部情报不能喊单，不能绕过证据链 |

必须明确：

- WebSocket 轻扫不能生成交易计划。
- 榜单不能生成交易计划。
- CoinGlass 失败不能写成市场无机会。
- 外部情报不能直接喊单。
- 宏观环境不能直接给个币方向。

## 9. Scan / Analysis / Strategy / Backtest 边界

固定职责：

- SCAN 只负责发现。
- ANALYSIS 只负责判断结构和机会质量。
- STRATEGY 只负责是否可交易。
- BACKTEST 只负责评价和归因。

红线：

- backtest future outcome 不得污染 production score。
- MFE / MAE / qualityHit 不得进入生产排序。
- strategy blocker 不得过早压死 scan candidate。
- WAIT / WATCH 不得进入计划复核区。
- 轻扫标记不允许附带完整交易计划。
- 深扫候选可以展示“验证中”，但不能包装成“计划就绪目标”。
- `TRADE_PLAN_READY` 才允许进入计划复核区。

## 10. 当前测试体系

| 命令 | 用途 | 什么时候跑 | 是否每次必须跑 | 是否当前通过 | 最近一次结果 |
|---|---|---|---:|---:|---|
| `npm run typecheck` | TypeScript 类型检查 | 每次代码改动后 | 是 | 是 | 第四轮证据：exit=0 |
| `npm run lint` | ESLint 检查 | 每次代码改动后 | 是 | 是 | 第四轮证据：exit=0；有 1 个既有 warning：`priorityReasons` 未使用 |
| `npm run test:market` | 市场、worker、历史回测 smoke 单元测试 | 扫描/分析/worker 改动后 | 是 | 是 | 第四轮证据：exit=0，769 + 17 + 4 全部通过 |
| `npm run build` | Next.js 生产构建 | 推送/部署前 | 是 | 是 | 第四轮证据：exit=0 |
| `npm run backtest:golden` | Golden cases 验证 | 分析规则/边界改动后 | 是 | 是 | 第四轮证据：exit=0，16/16 |
| `npm run backtest:formal` | 正式能力验收回测 | 只在能力验收轮跑 | 否 | 已运行，但业务能力不通过 | 第五轮证据：exit=2；程序完成，裁判发现高优先级能力阻断 |
| `npm run production:smoke` | 生产公网页面/API/合同 smoke | 部署后、生产证据轮 | 是，生产变更后 | 是 | 第三轮前置门禁：exit=0 |

说明：`formal` 不是普通测试，只能在能力验收轮跑，不能在普通证据轮或修复轮随手运行。

## 11. 当前生产部署流程

当前实际部署方式：

```text
本地 / Codex 修改代码
-> 测试
-> commit
-> push GitHub 安全分支
-> GPT / 用户验收
-> 明确授权后合并 main
-> 明确授权后腾讯云服务器同步 main
-> 明确授权后 docker compose build/up
-> production smoke / evidence
```

当前状态：

- GitHub `main` 是代码正本。
- 腾讯云香港单机是当前生产主线。
- Docker Compose 负责 web、caddy、postgres、redis、workers。
- 第二轮生产证据中，production smoke 通过。
- SSH/scp 直连在第二轮仍不可用，OrcaTerm 可用；这会影响自动化效率。
- 第 4 步后，`production.yml` 不再监听 `push main` 自动生产部署；默认只手动触发 dry-run 质量门禁和证据包。
- `npm run production:deploy` / `npm run production:rollback` 默认 dry-run；真实生产动作必须使用显式 manual 命令并获得用户授权。

GitHub Actions / self-hosted runner：

- 当前是否已实现：已建立第 4 步生产观测 dry-run workflow 和证据 artifact 基础。
- 还差什么：真实腾讯云自动部署仍需单独授权、生产 runner/SSH 安全环境和部署验收轮。
- 是否还依赖手动执行：是。真实部署仍不能默认自动执行。

## 12. 当前项目真实状态

- 当前是否空壳：不是空壳。已有生产部署、真实 API、数据库、Redis、worker、公开交易所轻扫、CoinGlass 深扫基础、前端合同和生产 smoke。
- 当前是否可运行：可运行。第二轮生产证据显示生产页面/API 200、Docker 服务正常、worker heartbeat 正常。
- 当前是否完整：不完整。扫描、分析、策略、复盘都有基础，但仍需要专业能力验收。
- 当前是否支撑实战：**当前系统仍不能支撑实战。**
- 当前最大短板：
  1. 第五轮 formal 中 `TRADE_PLAN_READY=0`，策略分数从第三轮 `28.61` 降到 `22.48`，第四轮策略计划层整改没有转化为能力提升。
  2. 第五轮 formal 中 WAIT 有效率仍为 `0%`，WAIT bad rate 从 `8.33%` 升至 `25%`；诊断更细，但等待计划仍无效。
  3. 第五轮 formal 中 RR、止损、目标问题更重：`reward_risk_below_minimum` 从 `27` 增至 `33`，目标过远或不现实成为新暴露问题。
  4. 分析判断有效率不足：第五轮 formal 中被选中节点真正不晚到且事后有效比例为 `21.43%`。
  5. 扫描提前发现能力不足：第五轮 formal 中结构可行动机会 TopN 捕获率为 `26.42%`，启动前捕获率为 `23.53%`。
  6. 生产服务器尚未同步第四轮提交：本地 HEAD `dc22fda6`，腾讯云只读检查 HEAD `a76010223`；第五轮 formal 是本地第四轮代码验收，不是生产第四轮代码验收。
  6. 回测/复盘和生产评分边界必须持续防污染。

不能把“页面可访问”写成“系统可实战”。当前更准确状态是：**可运行但不完整，具备继续审计和能力验证的基础。**

## 13. 最近三轮关键事件

### 第二轮

- 目标：证明线上生产环境真实、安全、新鲜、可访问。
- 改了什么：未改业务代码；轮换生产 CRON_SECRET；重启必要服务；采集生产证据；生成第二轮脱敏证据包。
- 测试结果：
  - 无 secret admin：401。
  - 旧 secret admin：401。
  - 新 secret admin：200。
  - `/api/scan?force=1`：status=updated。
  - `/api/health`：ready/fresh。
  - Docker：10 个服务，异常 0。
  - worker：6/6 healthy。
  - Redis：PONG。
  - Postgres：accepting connections。
  - production smoke：exit=0。
  - typecheck/lint/test:market/build/backtest:golden：全部通过。
- 是否通过：通过。
- 遗留问题：SSH/scp 直连仍不可用，本机无法直接拉取服务器完整 zip；业务实战能力仍未通过 formal 能力验收。
- 下一轮：可进入第三轮生产/业务链路审计，但不得把生产可用等同于实战成熟。

### 第三轮

- 目标：正式能力回测轮，验证系统是否真正具备“快速全市场扫描、发现机会、给出策略、自我提升”的核心能力。
- 改了什么：未改业务代码、未改 UI、未调策略、未改扫描排序、未改回测逻辑、未提交、未部署、未迁移数据库；只采集前置门禁、运行 formal、生成报告和证据包。
- 测试结果：
  - 前置 API 门禁：通过，`/api/health` 为 ready/fresh，Redis healthy，worker 6/6 healthy。
  - production smoke：exit=0。
  - typecheck/lint/test:market/build/backtest:golden：全部 exit=0。
  - formal：exit=2；程序完成，但裁判系统发现高优先级能力阻断。
  - formal 报告：`reports/professional-backtest-audit/2026-07-05T025649-925Z`。
- 是否通过：生产前置门禁通过；正式能力验收不通过。
- 关键结论：
  - 总判定：当前系统仍不能支撑实战。
  - 扫描：不合格，分数 `50.88`，通过率 `7.69%`。
  - 分析：不合格，分数 `48.05`，通过率 `23.81%`。
  - 策略：不合格，分数 `28.61`，通过率 `0%`。
  - `TRADE_PLAN_READY=0`。
  - WAIT 有效率 `0%`。
- 遗留问题：策略计划层是最大短板；WAIT/RR/止损/目标需要专项整改；不能为了提高 READY 数量降低风控门槛。
- 下一轮：进入第四轮整改，但只能做策略计划层专项整改，不建议新增功能或 UI。

### 第四轮

- 目标：策略计划层专项整改，只修 WAIT / RR / 止损 / 目标 / 关键位投射 / 触发确认。
- 改了什么：
  - `StrategyV3TradePlan` 增加可选结构化等待字段：等待区、触发条件、二次确认、等待原因、当前为什么不能做。
  - `buildV3TradePlan` 输出更清楚的 WAIT 结构，不把 WAIT 升级 READY。
  - `structure_repair_pending` 拆成建设性修复等待、失败阻断、普通观察。
  - WAIT 后验诊断新增：`trigger_not_reached`、`structure_invalidated_before_trigger`、`stop_too_close_to_entry`、`target_too_far_or_unrealistic`。
  - 修正 WAIT 诊断内部价格距离百分比计算，避免误用数量占比函数。
- 测试结果：
  - 定向测试通过：`trade-plan` 13/13、`location-rr` 11/11、`trend-integrity` 8/8、`professional-audit-round` 57/57。
  - `npm run typecheck`：通过。
  - `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
  - `npm run test:market`：通过，769 + 17 + 4 全部通过。
  - `npm run build`：通过。
  - `npm run backtest:golden`：通过，16/16。
- 是否通过：第四轮基础门禁通过；未跑 formal。
- 遗留问题：不能宣称实战可用；第四轮没有验证 formal 能力是否改善。
- 下一轮：第五轮正式回归验收，重点看策略分数、WAIT 有效率、`TRADE_PLAN_READY` 是否仍为 0。

### 第五轮

- 目标：正式回归验收第四轮策略计划层整改是否有效。
- 改了什么：未改业务代码、未改 UI、未改扫描/分析/策略/回测规则、未部署、未动数据库、未提交 Git；只运行前置门禁、formal 回归、生成第五轮报告和脱敏证据包。
- 测试结果：
  - 生产公网从本地 shell 访问 43.161.202.227:80/443 超时；通过 SSH 只读检查服务器本机 health 为 ready/fresh。
  - 生产服务器 HEAD 为 `a76010223`，本地第四轮 HEAD 为 `dc22fda6`，生产尚未同步第四轮。
  - `npm run typecheck`：通过。
  - `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
  - `npm run test:market`：通过。
  - `npm run build`：通过。
  - `npm run backtest:golden`：通过。
  - `npm run backtest:formal`：直连 Binance 首次失败；使用 `BACKTEST_CURL_PROXY=socks5h://127.0.0.1:7892` 后完整跑完，exit=2。
  - formal 报告：`reports/professional-backtest-audit/2026-07-05T043726-668Z`。
- 是否通过：formal 有效生成，但业务能力不通过。
- 核心结果：
  - 总判定：当前系统仍不能支撑实战。
  - 高优先级问题：第三轮 `60` -> 第五轮 `65`，退步。
  - 扫描：`50.88` -> `50.74`，退步。
  - 分析：`48.05` -> `46.57`，退步。
  - 策略：`28.61` -> `22.48`，退步。
  - `TRADE_PLAN_READY`：仍为 `0`。
  - WAIT 有效率：仍为 `0%`。
  - WAIT bad rate：`8.33%` -> `25%`，退步。
- 遗留问题：第四轮 WAIT 文案和诊断变细，但策略计划能力没有改善；RR/止损/目标和 WAIT 触发质量仍是最大短板。
- 下一轮：第六轮只建议做“关键位/RR/目标投射与 WAIT 触发质量专项审计整改”，不建议新增功能或 UI。

## 14. 当前 P0 / P1 / P2 风险

## 13.1 当前收敛状态补充（2026-07-06）

第 2.1 步补充收敛整改已把以下事实写入当前代码和测试边界：

- Token 单币档案不能再根据 v3 交易计划草案自行升级为 `TRADE_PLAN_READY`；必须同时满足后端 `SignalBackendDossier.signal.maturity.stage === TRADE_PLAN_READY`、完整 trade plan 和 risk gate 放行。
- `/dashboard` 已引入统一四层信息结构：L1 决策层、L2 中文解释层、L3 结构化证据层、L4 折叠技术层。
- `/signals` 用户可见措辞收敛为“验证候选 / 证据观察 / 计划复核区 / 后端计划门禁”，避免把候选、WAIT、EVIDENCE_SIGNAL 写成可执行信号。
- market provider registry 在真实 provider 未配置时 fail-closed 到 `unconfigured`，不再静态导入 mock provider 作为生产兜底。
- CI guard 已覆盖审计包、证据包、zip/log/raw/env 和 secret pattern 检查；文档里的连接串示例统一改为 `[REDACTED]`。
- 本轮不改变最低 `3:1` 结构 RR，不新增自动下单，不让 review/backtest 影响 production ranking，不部署腾讯云，不运行 formal。

当前真实状态仍是：**可运行但不完整，不能支撑实战。**

## 14. 当前 P0 / P1 / P2 风险

### P0 风险

1. 问题：前端把候选、WAIT、WATCH、榜单包装成交易机会。
   - 影响核心链路哪一环：候选筛选、交易计划。
   - 证据：蓝图和 API 合同反复强调候选不能冒充信号、WAIT 不得进入狙击榜。
   - 当前状态：已有成熟度分层，但仍需页面级审计。
   - 下一步：逐页检查 `/signals`、`/dashboard`、`/token/[id]`，确认展示文案和排序不越权。

2. 问题：backtest future outcome 污染 production score。
   - 影响核心链路哪一环：候选筛选、复盘进化、生产排序。
   - 证据：第一轮专门修复生产排序测试边界。
   - 当前状态：测试已补强，但需要继续审计数据流。
   - 下一步：审计所有 ranking reasons、priority hints、review outcome 到 production ranking 的路径。

3. 问题：secret / admin 鉴权风险。
   - 影响核心链路哪一环：生产安全。
   - 证据：第二轮已轮换生产 CRON_SECRET 并验证 401/200。
   - 当前状态：第二轮通过。
   - 下一步：继续保持证据包不含 raw secret，推动自动化部署也必须脱敏。

### P1 风险

1. 问题：扫描排序主干不够强，优质机会未必稳定进入 Top10。
   - 影响核心链路哪一环：全市场发现、候选筛选。
   - 证据：长期讨论和回测反馈集中在“提前性”和“优质机会进入候选”的稳定性。
   - 当前状态：有状态池、轻扫、深扫 allocation，但仍需 formal 能力验收。
   - 下一步：用 formal 能力回测专门测试“启动前识别”和“候选召回率”。

2. 问题：分析推理报告可读性和实战解释力不足。
   - 影响核心链路哪一环：结构分析、交易计划。
   - 证据：用户反馈分析报告乱、看不懂、无法直接实战参考。
   - 当前状态：有 v3 dossier/forward map，但仍需业务表达重构和验收。
   - 下一步：按“为什么看、为什么不看、怎么错、怎么等”重构报告合同。

3. 问题：CoinGlass 与公开衍生品数据边界容易被误解。
   - 影响核心链路哪一环：深扫验证。
   - 证据：Hobbyist 支持范围和 Taker/CVD partial 需要明确展示。
   - 当前状态：第二轮深扫可用，但不是所有衍生品维度都完整。
   - 下一步：继续在 sourceAudit/dataSourceCapabilities 中区分 live/partial/unavailable。

### P2 风险

1. 问题：SSH/scp 自动化链路不稳定。
   - 影响核心链路哪一环：生产部署、证据采集。
   - 证据：第二轮本机无法直接 scp 拉取服务器完整 zip，只能通过 OrcaTerm 操作。
   - 当前状态：未根治。
   - 下一步：修复 SSH 公钥或建立受控 CI/CD，不要依赖手动浏览器终端。

2. 问题：页面 200 和健康 ready 可能被误读为能力成熟。
   - 影响核心链路哪一环：全链路验收。
   - 证据：第二轮只证明生产真实、安全、新鲜、可访问，不证明实战能力。
   - 当前状态：已在报告中标明；第三轮 formal 也证明当前仍不能支撑实战。
   - 下一步：第五轮跑正式回归验收，不要继续堆功能。

3. 问题：旧演示/legacy 文件仍存在但已降级。
   - 影响核心链路哪一环：前后端一致性、数据真实性。
   - 证据：`src/lib/radar-contract.ts` 保留旧同步 getter，但返回 empty/disabled，避免 mock 冒充真实。
   - 当前状态：兼容层可接受，但需要防止新页面误用旧 getter。
   - 下一步：检索所有页面数据入口，禁止直接读取旧 mock 数据。

## 15. 给 ChatGPT 的审计重点

请优先审计：

1. 核心链路是否自洽。
2. scan / analysis / strategy / backtest 是否互相污染。
3. 前端是否展示强于后端。
4. 是否存在 mock / fallback / stale cache 冒充真实。
5. WAIT / WATCH / EVIDENCE_SIGNAL 是否容易误导。
6. 是否有生产安全风险。
7. 测试是否真的证明了当前能力。
8. 下一轮最应该做什么。

建议 ChatGPT 不要只看“功能多不多”，而要看系统是否真正围绕：

```text
快速发现 -> 候选筛选 -> 深扫验证 -> 结构分析 -> 风险赔率 -> 交易计划 -> 复盘进化
```

## 16. 当前用户工作方式

- 用户不写代码。
- 用户只提出产品想法、交易逻辑观点和最终决策。
- Codex 负责执行工程实现。
- ChatGPT 负责架构审计、任务拆解、交易逻辑边界、验收标准和风险判断。

协作要求：

- 对用户尽量用中文和大白话。
- 不能把“能跑”说成“完整完成”。
- 不能用旧数据、mock、缓存或 fallback 冒充真实能力。
- 涉及网站核心能力时，必须先对照蓝图和核心链路。

## 17. 后续协作规则

每轮 Codex 必须输出：

1. 修改文件清单。
2. 每个文件为什么改。
3. 执行命令。
4. 测试结果。
5. 是否影响核心链路。
6. 是否影响 scan / analysis / strategy / backtest 边界。
7. 是否有新风险。
8. 是否可以进入下一轮。

每轮还必须说明：

- 是否改业务代码。
- 是否部署。
- 是否跑 formal。
- 是否动数据库。
- 是否包含 secret。
- 是否存在不能支撑实战的边界。

## 18. 第六轮全站逐数字 + 后端全链路审计状态

本节记录 2026-07-05 第六轮审计状态。该轮只做证据采集和审计包生成，不修改业务代码、不部署、不提交 Git、不运行 formal、不动数据库。

审计结论：

- 当前系统仍不能支撑实战。
- 本轮发现 P0：是。
- P0 数量：2。
- P1 数量：4。
- P2 数量：4。
- 当前不允许直接开始优化。

阻断原因：

1. 生产运行态事实源不可采集：公网 `/api/health` HTTP/HTTPS 超时；SSH 经 SOCKS TCP 可达，但认证阶段被关闭；本地 3000 未运行，本地也没有可用 Docker 命令。
2. 生产 HEAD 与 GitHub main / 本地 HEAD 一致性本轮不可复核。第五轮曾记录生产 HEAD 落后本地，本轮不能重新确认。

本轮能证明的正向事实：

- 静态代码显示狙击榜入口只允许 `TRADE_PLAN_READY`、`RR >= 3`、且无 `whyBlocked` 的信号进入。
- 榜单 fallback 投影候选时已有“候选不等于交易计划”的保护边界。
- `useLiveNumber` 当前不再随机制造数字漂移。
- 最近 formal 报告仍明确显示系统不能支撑实战：`TRADE_PLAN_READY=0`，WAIT 有效率为 0%，高优先级问题 65。

本轮不能证明的事实：

- 不能证明生产页面逐数字真实。
- 不能证明生产 API 合同字段和前端展示一致。
- 不能证明 Postgres、Redis、worker heartbeat、scan lock、reports volume 正常。
- 不能证明 CoinGlass、WebSocket 轻扫和公开交易所深扫当前真实工作。

下一轮优先级：

先做“生产事实源恢复与逐数字验收轮”，恢复只读 SSH / API / Docker / DB / Redis 证据采集。P0 未关闭前，不应进入扫描排序、策略、UI 或业务能力优化。

## 2026-07-06 第 2 步最终复查 + 中文命名体系收口

本节记录 2026-07-06 本地最终复查状态。该轮只做中文命名体系、状态语义、单一事实源、前端四层结构、review research-only、Git/CI 安全和测试验证收口；不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 阻断型 P1：无。
- 是否可进入第 3 步实战能力提升：可以。
- 是否可 push main：否。
- 是否可部署腾讯云：否。

本轮已验证：

- `TRADE_PLAN_READY` 仍是计划就绪区唯一入口。
- `TRADE` 只是 L1 决策状态，不进入计划就绪区。
- 候选观察、证据观察、等待条件、风控阻断和计划就绪的中文语义已收口。
- 前端核心展示不再使用 `n/a` 或 `0` 冒充未知值。
- Review / backtest 仍为 research-only，不污染 production ranking。
- 基础门禁通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns。

仍需说明：

- 本轮不是生产验证轮，不能证明腾讯云当前已同步。
- 本轮不是 formal 能力验收轮，不能证明扫描、分析、策略已经支撑实战。
- 历史 `SniperTarget` 类型仍保留 entry/stop/target 字段，当前 UI 不用它生成计划，但后续应单独清理。

下一轮优先级：

进入第 3 步实战能力提升，只围绕扫描、分析、策略三大核心做正式样本验证和能力提升。

## 2026-07-06 第 3 步实战能力提升

本节记录 2026-07-06 本地能力提升状态。该轮只做后端能力基础件和测试保护；不改 UI、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 是否 push main：否。
- 是否部署腾讯云：否。
- 是否可进入下一步受控接线：可以。

本轮已完成的本地能力基础：

- 深扫队列和候选质量证明增强：`deepScanCoveragePercent`、`pendingCount`、`oldestPendingAge`、`estimatedCycleMinutes`、`highPriorityPendingCount`、`skippedLowPriorityCount`、`priorityReason`。
- 统一决策引擎：把后端 v3 trade plan 归一化为 `OBSERVE / WAIT / BLOCKED / TRADE_PLAN_READY`，并要求 READY 必须满足后端 maturity、结构止损、目标、入场、RR >= 3 和无 blocker。
- 市场状态识别：新增 `TREND_UP / TREND_DOWN / RANGE / HIGH_VOLATILITY / LOW_LIQUIDITY / RISK_OFF / ALT_ROTATION / UNKNOWN`，只作为 `market_context_only`。
- 错失机会复盘：新增 research-only missed opportunity 归因，覆盖 scan、light scan、deep scan、analysis、strategy、data source、market regime、frontend 等错失原因。
- 机会生命周期：新增 research-only lifecycle，从 `DISCOVERED` 到 `OUTCOME_REVIEWED`，禁止 outcome 回写 production ranking。
- 账户级风险模拟器：按 1500 USDT、3% 初始保证金、BTC/ETH 150x、山寨币交易所最高杠杆做只读风险镜头，不改变结构 RR 和策略门禁。

测试结果：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

仍需说明：

- 本轮新增能力多为后端基础件，尚未接入生产 API / 前端展示。
- 本轮不证明真实市场样本下的候选 Top10、WAIT 转 READY 或策略命中能力。
- 本轮不证明腾讯云生产已同步。

下一轮优先级：

进入第 3.1 步：把统一决策引擎接入 radar signal、signals/sniper 可见状态和 token dossier 合同，作为计划状态的唯一后端出口；仍不改 UI 美观、不改 scan 排序、不部署。

## 2026-07-06 第 3.1 步统一决策引擎主链路接线与合同验收

本节记录 2026-07-06 本地合同接线状态。该轮只做统一决策引擎到 radar signal、signals/sniper 可见状态和 token dossier 主链路的接线；不改 scan 排序、不改 RR 门槛、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 是否 push main：否。
- 是否部署腾讯云：否。
- 是否可进入 3.1 验收复查：可以。

本轮已完成的本地合同接线：

- radar signal 和 `buildFrontendTokenDossierContract()` 均调用统一决策链路。
- radar signal / token dossier 合同新增 `unifiedDecision`，包含 `decision`、`decisionLabel`、`source=unified_decision_engine`、`canTradeNow`、`blockerReasons`、`waitPlanReady`、`readyPlan`。
- token dossier 前端 L1 决策只读 `unifiedDecision.decision`，不再用页面局部逻辑推导 TRADE / WAIT / BLOCKED。
- signals / anomaly / sniper 可见状态不再用前端 category、odds、候选数量或计划数量自行推断 READY。
- dashboard L1 只表达系统运行状态，不再把候选数量或计划数量包装成交易结论。
- `tradePlan` 只在 `unifiedDecision.canTradeNow=true` 时暴露。
- WAIT 只展示等待条件，不生成入场、止损、目标。
- 修复 stale READY 风险：后端 maturity 残留为 `TRADE_PLAN_READY` 但没有完整后端计划时，token dossier 不再保留 visible `TRADE_PLAN_READY`。
- READY 硬门槛 blocker 增加 severity，缺入场、缺结构止损、缺目标、RR 不足、plan blocker 等均为 critical。

测试结果：

- 定向合同/展示/guard 测试：52/52 通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 807 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

仍需说明：

- 本轮只证明 radar signal、signals/sniper 可见状态和 token dossier 决策出口已接入统一决策链路。
- Kline readonly overlays 仍需单独审计，避免图表视觉层比决策合同更强。
- 本轮不证明腾讯云生产已同步。

下一轮优先级：

进入 3.1 验收复查，随后做 Kline / TradingView readonly overlay 边界审计，防止图表视觉层看起来强于统一决策合同。

## 2026-07-06 第 3.2 步图表叠加层与严格单一事实源最终收口

本节记录 2026-07-06 本地图表合同收口状态。该轮只修 Kline / TradingView overlay 与统一决策事实源的错位；不改 scan 排序、不改策略规则、不降低 RR、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮修复前发现 P0：Kline overlay 会把非 READY 的 v3 trade plan 草案显示成“结构止损 / TP”视觉线，可能与右侧“不能交易”结论冲突。
- 本轮本地修复后：Kline overlay 的交易计划线只允许来自 `unified_decision_engine` 的 `readyPlan`。
- 是否 push main：否。
- 是否部署腾讯云：否。

本轮已完成的本地合同收口：

- `KlineOverlay` 增加 `semanticRole`、`allowedUse`、`sourceDecision`。
- `target/stop` overlay 必须满足 `semanticRole=ready_trade_plan`、`allowedUse=ready_trade_plan_only`、`sourceDecision=unified_decision_engine` 才可渲染。
- `buildFrontendKlineContract()` 不再无条件从 `dossier.strategyV3.tradePlan` 输出止损/TP。
- 非 READY：只允许显示支撑、压力、前方结构、失效观察等结构参考。
- WAIT：只允许显示“等待触发区 / 等待失效参考”，不得显示为入场、止损或 TP。
- stale / partial / cached Kline 数据不允许显示 ready trade plan overlay。
- `chartIntegrity.overlaySource` 不再把 v3 草案标记为 trade plan overlay；READY 图表计划线来源改为 `v3_key_levels_forward_map_unified_ready_plan`。

定向验证：

- `npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js`：通过，32/32。
- `npm run typecheck`：通过。
- 完整基础门禁仍需在本轮最终报告中记录。

仍需说明：

- 本轮不证明腾讯云生产已同步。
- 本轮不证明策略命中率或实战能力达标。
- 后续能力提升仍需围绕扫描提前性、分析准确性、策略有效性和复盘闭环继续验收。

## 附录 A：核心相关文档清单

建议外部审计员优先阅读这些文档，而不是一次性读完整 docs：

- `docs/chuan-market-radar-blueprint.md`：长期事实源、核心目标、边界和不做什么。
- `docs/chuan-market-radar-engineering-charter.md`：长期工程准入、分层、删除、验证规则。
- `docs/BACKEND_API_CONTRACT.md`：后端合同、前端消费边界、核心 API 语义。
- `docs/frontend-data-truth-contract.md`：前端数据真实性边界。
- `docs/frontend-backend-field-map.md`：前后端字段映射。
- `docs/CORE_STRATEGY_SPEC.md`：策略系统目标、非目标、阶段和决策枚举。
- `docs/EVIDENCE_ENGINE_SPEC.md`：证据项、证据族、权重和可追溯边界。
- `docs/DATA_RULES.md`：OI、Funding、多空、主动买卖、相对强弱规则。
- `docs/INDICATOR_RULES.md`：RSI/MACD/Bollinger/ATR/EMA/VWAP/ADX 等技术指标边界。
- `docs/MARKET_READING_SPEC.md`：市场阅读和结构分析规范。
- `docs/RISK_GATE_SPEC.md`：风险门禁。
- `docs/KEY_LEVEL_ENGINE_SPEC.md`：关键位和结构位。
- `docs/backtest-v2/PROFESSIONAL_BACKTEST_AUDIT_SPEC.md`：专业回测审计目标。
- `docs/backtest-v2/BACKTEST_TEST_PLAN.md`：回测测试方案。
- `docs/single-server-deployment.md`：腾讯云单机部署。
- `docs/deployment-checklist.md`：部署检查清单。
- `audit-round-2/ROUND_2_PRODUCTION_EVIDENCE_REPORT.md`：最近一轮生产证据报告。

## 附录 B：打包说明

`project-context-for-chatgpt.zip` 应只包含：

- `PROJECT_CONTEXT_FOR_CHATGPT.md`
- 核心相关文档清单
- `package.json`
- `docker-compose.yml`
- 部署脚本清单
- 最近一轮 ROUND 报告的脱敏副本

不得包含：

- `.env`
- `.env.*`
- audit zip
- raw logs
- `node_modules`
- `.next`
- `dist`
- `build`
- 真实数据库数据
- 真实密钥

## 2026-07-06 第 4 步生产观测闭环补充

本节记录本地第 4 步事实：本轮只建设生产观测、dry-run 证据、GitHub Actions 手动门禁和回滚 dry-run，不部署腾讯云，不运行 formal，不动数据库 / Redis / volume。

- 安全分支：`phase4-production-observability`。
- workflow：`.github/workflows/production.yml` 已改为手动 `workflow_dispatch`，不再监听 `push main` 自动生产部署。
- 生产观测脚本：`scripts/production/observability.mjs`。
- dry-run 命令：`npm run production:health -- --dry-run`、`npm run production:smoke -- --dry-run`、`npm run production:status -- --dry-run`、`npm run production:evidence -- --dry-run`。
- 部署脚本：`npm run production:deploy` 默认 dry-run；真实部署需要显式 manual 命令和用户授权。
- 回滚脚本：`npm run production:rollback` 默认 dry-run；真实回滚需要显式 manual 命令和用户授权。
- 证据目录：`phase4-production-observability/`。
- 证据包：`phase4-production-observability.zip` 和目录内 `production-evidence.zip` 只用于用户/GPT 审计，不应进入 Git。
- 当前真实状态：本轮只能证明本地工程观测链路可执行，不能证明腾讯云已部署新代码，也不能证明系统支撑实战交易。
