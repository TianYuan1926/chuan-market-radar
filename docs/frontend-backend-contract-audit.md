# 前端 UI 与后端数据契约审计

> 状态：阶段 1 审计结果。  
> 目标：现有后端数据先全部接入已恢复的前端 UI；后续再做精细化。  
> 边界：不改 UI 视觉，不新增业务功能，不用 mock 冒充真实数据。

## 当前结论

2026-06-23 更新：第一轮前端真实数据接线已经完成，活跃页面不再直接读取旧 mock 市场事实源，也不再通过旧同步 mock getter 伪造主展示。
旧 `ReviewCenter` / `SystemCenter` 大型 mock 面板已删除，`sniper-data.ts` 已降级为
类型和纯显示 helper。

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
| `/signals` | `getTokens()` / `getSignalCards()` | `getRadarContractForPage()` + `getLeaderboardContractForPage('volume')` | 页面读取真实 signals 和候选榜，只传给 `SniperBoard`、`SignalMaturityPool`、`AnomalyBoard` 三个核心承载位；旧 `LiveFeed`、`MarketHeatmap` 已删除 | 无证据融合信号时说明“当前无达标信号”，但展示扫描覆盖 |
| `/leaderboard` | `getTokens()` | `getAllLeaderboardContractsForPage()` | 页面读取 7 类榜单，只传给 `MarketLeaderboards`；旧滚动 ticker 和第二套基础表格已删除 | 无榜单行时展示数据状态和原因 |
| `/market` | `getMarketEnv()` / `getDataQuality()` / `getCoinglass()` | `getRadarContractForPage()` | 页面读取 `macroAltEnv`、`derivatives`、`dataSources`、`apiUsage` | 宏观或衍生品缺失时展示 partial/empty，不生成假指标 |
| `/token/[id]` | `getToken()` / `getTokens()` / `getSignals()` | `getRadarContractForPage()` + `getTokenDossierContractForPage()` | 用真实榜单/信号定位 token；dossier 走后端单币接口 | 后端未覆盖该币时显示未覆盖或 404，不生成假档案 |
| `/review` | `ReviewEvolution` + manual journal drawer | `getReviewContractForPage()` + `/api/frontend/journal-contract` | 已接真实合同；旧 `ReviewCenter` mock 面板已删除 | 无复盘样本时显示暂无样本，不造历史 |
| `/system` | `SystemStatus` + backend runtime probes | `getRadarContractForPage()` + `/api/health` | 已接真实合同；旧 `SystemCenter` mock 面板已删除 | 后端健康异常时展示异常，不隐藏 |
| `ScanProof` | `radar.scanProof` | `radar.scanProof` | 接收 `Resource<ScanProofData>` prop | 无扫描帧时展示 empty 和原因 |
| `DashboardRadarControl` | `radar-contract.ts` mock getter | `radar` contract | 接收 `contract` prop；内部不再自行读 mock getter | 按 ResourceBoundary 展示 |
| `SignalMaturityPool` | `getRadarSignals()` mock getter | `radar.radarSignals` | 接收 `signals` prop | 允许为空，但显示真实空状态 |
| `SniperBoard` | `radarSignalsToSniperTargets()` | `radarSignalsToSniperTargets()` | 接收 `targets` prop；`sniper-data.ts` 不再生成 mock 目标 | 只展示达标狙击标的；无达标时显示真实空 |
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

## 第一批 mock 入口处理状态

优先级按“用户最容易误解系统是否运行”排序：

1. `/signals`
   - 已改为后端 RadarContract + leaderboard candidate 合同。
   - `SniperBoard()` 不再默认生成 mock target。
   - `SignalMaturityPool()` 只消费后端 maturity 信号。

2. `/leaderboard`
   - 已改为后端 `getAllLeaderboardContractsForPage()`。
   - market cap 未知时必须显示 `待补齐`，不允许用 mock cap。

3. `/dashboard`
   - 已改为后端 RadarContract + volume leaderboard。
   - `ScanProof()` 和 `DashboardRadarControl()` 已走真实 contract。

4. `/token/[id]`
   - 已改为榜单/信号/Token Dossier/K-line contract。
   - 未覆盖标的显示 honest empty / not found，不生成假档案。

5. `/market`
   - 已改为 RadarContract 的 macro / derivatives / dataSources / apiUsage。
   - taker/CVD 仍是明确 partial，不允许用假资金流补齐。

6. `/review` 和 `/system`
   - 旧大型 mock 面板已经删除。
   - 当前只允许通过 ReviewContract / RadarContract 展示真实样本、真实空状态或 partial。

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

当前后端契约基础已经接回主要活跃页面。下一步不再是“接回页面”，而是：

```text
1. 对外部参考榜做同时间戳对账；
2. 补 K 线交互和 TradingView 兜底；
3. 检查 Token Dossier 的丰富 reportSections 是否在 UI 中充分可见；
4. 持续验证生产服务、Redis、worker、Caddy 和 SSE；
5. 等确认稳定数据源后再补真实 taker/CVD/资金流。
```
