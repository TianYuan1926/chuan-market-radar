# 前端 UI 与后端数据契约审计

> 状态：阶段 1 审计结果。  
> 目标：现有后端数据先全部接入已恢复的前端 UI；后续再做精细化。  
> 边界：不改 UI 视觉，不新增业务功能，不用 mock 冒充真实数据。

## 当前结论

前端恢复后，当前页面重新回到了两类 mock 数据入口：

1. 页面直接读 `src/lib/mock-data.ts`。
2. 组件读 `src/lib/radar-contract.ts` 中的同步 mock getter。

后端已经具备可用的前端契约构建层和接口：

- `src/lib/api/frontend-contract.ts`
- `src/lib/frontend-contract-server.ts`
- `/api/frontend/radar-contract`
- `/api/frontend/leaderboard`
- `/api/frontend/token-dossier`
- `/api/frontend/review-contract`

正确对接方式不是重写 UI，而是：

```text
后端快照/健康/归档/日记
-> src/lib/api/frontend-contract.ts mapper
-> src/lib/frontend-contract-server.ts 页面取数
-> 页面把 contract 传给现有组件
-> 组件按原 UI 展示真实数据或真实空状态
```

## 前端数据入口对照

| 页面 / 组件 | 当前入口 | 后端已有来源 | 对接方式 | 空状态规则 |
| --- | --- | --- | --- | --- |
| `/dashboard` | `getTokens()` / `getSignalCards()` / `getScanState()` / `getMarketEnv()` | `getRadarContractForPage()` + leaderboard contract | 页面改为 async，读取 radar contract 和榜单，再用 adapter 转成当前 UI 所需 tokens/cards | 无达标候选时展示扫描证明和“暂无达标候选”，不塞 mock |
| `/signals` | `getTokens()` / `getSignalCards()` | `getRadarContractForPage()` + `getLeaderboardContractForPage('volume')` | 页面读取真实 signals 和候选榜，传给 `SniperBoard`、`SignalMaturityPool`、`AnomalyBoard`、`LiveFeed`、`MarketHeatmap` | 无证据融合信号时说明“当前无达标信号”，但展示扫描覆盖 |
| `/leaderboard` | `getTokens()` | `getAllLeaderboardContractsForPage()` | 页面读取 7 类榜单，传给榜单组件；基础表格用真实 leaderboard 转 token | 无榜单行时展示数据状态和原因 |
| `/market` | `getMarketEnv()` / `getDataQuality()` / `getCoinglass()` | `getRadarContractForPage()` | 页面读取 `macroAltEnv`、`derivatives`、`dataSources`、`apiUsage` | 宏观或衍生品缺失时展示 partial/empty，不生成假指标 |
| `/token/[id]` | `getToken()` / `getTokens()` / `getSignals()` | `getRadarContractForPage()` + `getTokenDossierContractForPage()` | 用真实榜单/信号定位 token；dossier 走后端单币接口 | 后端未覆盖该币时显示未覆盖或 404，不生成假档案 |
| `/review` | `ReviewCenter` 内部 mock + `ReviewEvolution` 的 `radar-contract` mock | `getReviewContractForPage()` + `/api/archive` + `/api/journal` | 先接 `ReviewEvolution` 的 lifecycle/archetype/missed/suggestions；再逐步接旧 `ReviewCenter` | 无复盘样本时显示暂无样本，不造历史 |
| `/system` | `SystemCenter` 内部 mock + `SystemStatus` 的 `radar-contract` mock | `getRadarContractForPage()` + `/api/health` | 先接 `SystemStatus`；再把 `SystemCenter` 告警/服务状态接真实 health | 后端健康异常时展示异常，不隐藏 |
| `ScanProof` | `mock-data.ts` | `radar.scanProof` | 接收 `Resource<ScanProofData>` prop | 无扫描帧时展示 empty 和原因 |
| `DashboardRadarControl` | `radar-contract.ts` mock getter | `radar` contract | 接收 `contract` prop；内部不再自行读 mock getter | 按 ResourceBoundary 展示 |
| `SignalMaturityPool` | `getRadarSignals()` mock getter | `radar.radarSignals` | 接收 `signals` prop | 允许为空，但显示真实空状态 |
| `SniperBoard` | `getSniperTargets()` mock | `radarSignalsToSniperTargets()` | 接收 `targets` prop | 只展示达标狙击标的；无达标时显示真实空 |
| `MarketLeaderboards` | `getLeaderboard(kind)` mock getter | `getAllLeaderboardContractsForPage()` | 接收 `leaderboards` prop | 每个榜单单独显示 Resource 状态 |
| `MarketMacroDerivatives` | `getMacroAltEnv()` / `getDerivatives()` / `getApiUsage()` mock getter | `radar.macroAltEnv` / `radar.derivatives` / `radar.apiUsage` | 接收 `contract` prop | 缺失时展示 partial/empty |
| `TokenDossier` | `getTokenDossier()` mock getter | `getTokenDossierContractForPage()` | 接收 `dossier` prop | 未找到时显示后端未覆盖 |
| `ReviewEvolution` | `getSignalLifecycles()` 等 mock getter | `reviewContract` | 接收 `contract` prop | 无样本显示暂无 |
| `SystemStatus` | `getServiceNodes()` / `getDataPipeline()` / `getApiUsage()` mock getter | `radar.serviceNodes` / `radar.dataPipeline` / `radar.apiUsage` | 接收 `contract` prop | 服务异常如实展示 |

## 现有后端契约覆盖情况

| 前端字段组 | 后端已有能力 | 当前状态 |
| --- | --- | --- |
| `scanProof` | `buildFrontendRadarContract()` 已构建 | 可直接接 |
| `deepScanQueue` | `buildFrontendRadarContract()` 已构建 | 可直接接 |
| `capabilityStages` | `businessCapability` 已映射 | 可直接接 |
| `dataSources` | public discovery + CoinGlass deep scan audit | 可直接接，但 latency 目前是 0 占位 |
| `apiUsage` | 基于本轮 plannedRequests 和 env 预算 | 可接，日内真实计数后续精细化 |
| `dataPipeline` | snapshot metadata + persistence 状态 | 可直接接 |
| `petBackendStatus` | contract 已构建 | 可接，但宠物行为后续精细化 |
| `radarSignals` | snapshot.signals -> RadarSignal | 可直接接 |
| `macroAltEnv` | macroMarket -> MacroAltEnv | 可接，TOTAL2/TOTAL3 有则显示 |
| `derivatives` | snapshot.derivatives 聚合 | 可接，takerBuySell 当前为 0 占位 |
| `serviceNodes` | health / persistence / scan 状态 | 可直接接 |
| `leaderboard` | `buildFrontendLeaderboardContract()` | 可直接接 |
| `tokenDossier` | `buildSignalBackendDossier()` + frontend mapper | 可直接接 |
| `reviewContract` | `buildFrontendReviewContract()` | 可接，样本多少取决于后端归档/复盘数据 |

## 第一批必须修的 mock 入口

优先级按“用户最容易误解系统是否运行”排序：

1. `/signals`
   - `getTokens()`
   - `getSignalCards()`
   - `SniperBoard()` 默认 mock
   - `SignalMaturityPool()` 默认 mock

2. `/leaderboard`
   - `getTokens()`
   - `MarketLeaderboards()` 默认 mock

3. `/dashboard`
   - `getTokens()`
   - `getSignalCards()`
   - `getScanState()`
   - `getMarketEnv()`
   - `ScanProof()` 默认 mock
   - `DashboardRadarControl()` 默认 mock

4. `/token/[id]`
   - `getToken()`
   - `getTokens()`
   - `getSignals()`
   - `TokenDossier()` 默认 mock
   - `SignalArchive()` 默认 mock

5. `/market`
   - `getMarketEnv()`
   - `getDataQuality()`
   - `getCoinglass()`
   - `MarketMacroDerivatives()` 默认 mock

6. `/review` 和 `/system`
   - 先接后端承载位组件。
   - 旧的大型 mock 面板后续逐块接，不能一次硬拆导致 UI 崩。

## 对接执行顺序

### 第一步：保留 UI，恢复真实 server contract 入口

- 页面层使用 `src/lib/frontend-contract-server.ts`。
- 不在组件里直接 fetch。
- 不改变视觉结构。

### 第二步：组件增加可选真实数据 prop

示例原则：

```text
组件收到真实 prop -> 展示真实 prop
组件未收到 prop -> 开发预览可以用 mock
真实页面必须传 prop，不能依赖 mock fallback
```

后续阶段 5 再清理真实页面的 mock fallback。

### 第三步：逐页替换

顺序：

1. `/signals`
2. `/leaderboard`
3. `/dashboard`
4. `/market`
5. `/token/[id]`
6. `/review`
7. `/system`

理由：

- `/signals` 和 `/leaderboard` 最能暴露“前后端是否脱钩”。
- `/dashboard` 负责证明系统在运行。
- `/market`、`token`、`review`、`system` 依赖更多细节，后接更稳。

## 不允许出现的情况

1. 后端有候选，但前端因为 Top 固定或字段错位看不到。
2. 没有达标标的，却用 mock 填满狙击榜。
3. 轻扫标记被展示成交易计划。
4. 旧缓存不标注状态就冒充实时数据。
5. 页面空白但没有解释系统是否在运行。
6. 为了对接数据修改 UI 视觉。

## 阶段 1 审计结论

当前后端契约基础是够的，不需要先新增大功能。

下一步应直接进入阶段 2 和阶段 3 的合并执行：

```text
把现有 server contract 接回页面；
给关键组件加真实数据 prop；
先让 /signals 与 /leaderboard 正确展示真实数据或真实空状态。
```

