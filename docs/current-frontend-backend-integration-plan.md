# 当前施工方案：前端 UI 与后端真实数据全量对接

> 状态：生效中。
> 生效范围：约束“后端真实数据接入当前 v0 前端 UI”的全部搭建。
> 详细字段地图：见 `docs/frontend-backend-field-map.md`。
> 取消条件：全部活跃页面不再依赖 mock/伪实时/本地假样本展示市场事实，并完成本地与生产验证。

## 核心目标

把现有后端真实数据完整接入当前已恢复的前端 UI。

本轮不做前端重设计，不做业务能力扩展，不改变交易分析逻辑。

当前已经完成的基础：

- 活跃页面已通过 `src/lib/frontend-contract-server.ts` 读取前端专用后端合同。
- 已落地五个前端只读合同接口：`/api/frontend/radar-contract`、`/api/frontend/leaderboard`、`/api/frontend/token-dossier`、`/api/frontend/review-contract`、`/api/frontend/kline-contract`。
- 已落地一个前端读写合同接口：`/api/frontend/journal-contract`，用于交易日记抽屉读写真实 `journal_events`，localStorage 仅作兜底。
- 已切断活跃页面上的随机信号、随机行情、假交易日记和 mock 补位。
- 未接真实数据的区域必须显示真实空状态或 partial 状态，不能用 mock 填满。

## 总原则

1. UI 1:1 保留，不改布局、动画、颜色、文案风格。
2. 前端不能假满，也不能假空。
3. mock 数据不能冒充真实数据。
4. 空状态必须说明原因：未扫到、未达标、数据过期、接口失败或系统未运行。
5. 所有展示数据必须能追溯到后端真实来源。
6. 本轮只做数据对接，不新增业务功能。

## 阶段 0：固定当前前端版本

目标：把用户提供的前端源版本锁定为当前 UI 基准。

要求：
- 确认 `/Users/chuan/Downloads/zip/` 与当前 `src/app`、`src/components`、`src/lib` 中对应前端文件一致。
- 跑 `npm run typecheck`。
- 提交一个前端恢复点。

建议提交名：

```text
restore frontend source from user ui package
```

## 阶段 1：数据契约审计

目标：确认前端每个页面需要什么数据。

检查范围：
- `src/lib/radar-contract.ts`
- `/dashboard`
- `/signals`
- `/leaderboard`
- `/market`
- `/token/[id]`
- `/review`
- `/system`

输出对照：

```text
前端字段 -> 后端已有来源 -> mapper 转换方式 -> 空状态规则
```

当前审计基线：

- 详见 `docs/frontend-backend-field-map.md`。
- 已接：扫描证明、深扫队列、候选/成熟信号、榜单、宏观环境、衍生品聚合、系统基础健康、复盘基础合同、单币证据链、API 用量、数据源延迟、规则反证 evidence-id 绑定复审。
- 已接：复盘样本统计合同、规则反证统计合同、扫描稳定性合同。
- 半接：主力资金流。当前只展示 OI/Funding/多空比上下文和 taker/CVD 未接入状态，不能伪装成真实资金流。
- 已接：UI 偏好可通过 `/api/frontend/ui-state?kind=ui_preferences` 写入 `frontend_ui_states`；真实登录鉴权通过 `/api/auth/session` 和可选私有模式完成。

## 阶段 2：后端接口对齐

优先使用已有后端接口，不乱加新接口。

优先对接：
- `/api/frontend/radar-contract`
- `/api/frontend/leaderboard`
- `/api/frontend/token-dossier`
- `/api/frontend/review-contract`
- `/api/health`
- `/api/archive`
- `/api/journal`

如果字段不够，只补只读字段，不改 UI。

已补齐的只读合同：

- 扩展 radar contract：暴露 API 日内计数和数据源延迟。
- `/api/frontend/live-events`：只读事件合同，前端可轮询。
- `/api/frontend/live-events/stream`：同一只读事件合同的 SSE 传输；不得触发扫描、不得调用 CoinGlass。
- `/api/frontend/ui-state`：宠物、彩蛋和 UI 偏好状态，UI-only，不进入交易判断。
- `/api/auth/session`：可选私有登录，默认关闭，开启后使用服务端签名会话。
- `/api/frontend/kline-contract?symbol=...&tf=...`：给 Token 详情页真实 K 线；页面侧通过 `getKlineContractForPage()` 直接读取同一合同，不再生成模拟蜡烛。
- `/api/frontend/journal-contract`：给交易日记抽屉读取/写入真实 Postgres 日记；写入 `manual_trade` 事件，`rankDelta=0`，不自动调权。
- `/api/admin/runtime/heartbeat` + `RadarContract.serviceNodes`：worker 通过受保护接口写 Redis 心跳，系统页读取真实 Redis/worker 运行探针，不再硬写在线状态。
- `RadarContract.scanStability`：从扫描归档、覆盖率、Redis 和 worker 心跳生成扫描稳定性诊断；只做运维诊断，不能生成交易信号。
- `ReviewContract.reviewStats`：从真实 journal outcome 样本生成复盘统计；样本不足时必须显示 collecting/empty，不能自动调权。
- `ReviewContract.aiReviewStats`：字段名保留兼容；统计 evidence-id 绑定的规则反证状态，规则反证不能替代规则引擎。
- `/api/frontend/leaderboard`：public market ticker 模式下，`gainers` 取同币种最高 24h 涨幅，`losers` 取同币种最低 24h 涨幅，`volume` 聚合同币种跨交易所 24h 成交额；每行必须带 `source/sourceLabel/venueScope/sortKey/rankingScope/updatedAt`。
- `/api/frontend/token-dossier`：`reportSections` 已纳入 v3 关键位、Forward Map、趋势状态、趋势分数、位置/RR、回踩/反抽质量、趋势完整度、交易计划确认清单、分批止盈和人工复核边界。
- `/api/frontend/kline-contract`：在保持 `data` 为真实蜡烛数组的前提下，新增只读 `overlays/overlayStatus/tradingView`，把后端 v3 关键位、Forward Map、结构止损和目标位提供给图表层。

下一批需要补强的合同：

- 主力资金流：需要确认可免费稳定获取的数据源后再接入。
- 前端消费补齐：如果 UI 有对应位置，应读取 `fundFlow`、`scanStability`、`reviewStats`、`aiReviewStats`，没有位置时保留合同，不为了展示硬改 UI。

## 阶段 3：统一 mapper 层

后端数据和前端字段不一致时，只在中间转换。

主要转换：
- 扫描状态 -> 雷达总控
- 达标信号 -> 信号池
- 高成熟度信号 -> 狙击榜
- 候选池 / 市场数据 -> 榜单
- 单币证据链 -> 代币详情
- 扫描归档 -> 复盘中心
- 健康状态 -> 系统页

mapper 硬规则：

- 前端字段名保持不变。
- 交易结论、方向、RR、Risk Gate、成熟度和证据链只能来自后端合同或后端 mapper。
- 榜单候选可以用于展示“候选/等待验证”，不能在前端升级成交易计划。
- Token 详情不得用前端价格推导伪造完整交易计划；精确交易计划必须来自 `strategyV3.tradePlan`，缺失或被阻断时显示无交易计划。
- 资金流缺 taker/CVD 时必须显示 partial/waiting，不能用 `0`、随机数或旧 mock 当真实数据。
- 扫描稳定性、复盘统计、规则反证统计只能解释系统状态，不能改变候选排序、Risk Gate 或交易计划。

## 阶段 4：逐页对接

按页面验收，不按零散组件乱修。

### `/dashboard`

- 展示真实系统状态。
- 展示扫描覆盖、数据源、更新时间。
- 没有达标信号时显示真实空状态。

### `/signals`

- 狙击榜只展示符合条件的标的。
- 信号池只展示成熟度达标的信号。
- 异动表格展示轻扫、候选或异动记录。
- 没有数据时说明原因和扫描状态。

### `/leaderboard`

- 展示真实候选榜、涨跌幅榜、成交量榜。
- 没有榜单数据时显示数据源状态，不用 mock 填充。
- 涨幅榜、跌幅榜、成交额榜必须按后端合同的 public ticker 口径展示，不允许前端按候选池二次排序伪造成市场榜。
- 外部平台榜单对不上时，先检查交易所范围、时间戳、是否合并同币种多交易所、是否含非永续/非 USDT 标的，不能直接认定后端错误或前端正确。

### `/market`

- 展示真实 BTC / ETH / 山寨环境。
- 展示 CoinGlass、交易所、宏观状态。
- 数据缺失时标清楚。

### `/token/[id]`

- 展示真实单币档案。
- 包括证据链、关键位、策略计划、风险说明。
- 后端没有该币时显示未覆盖，不生成假档案。
- 分析汇报必须优先展示后端 `reportSections`，不能只展示一句简略总结；如果 UI 空间不足，也要保留可展开或分层查看入口。
- K 线图只能画真实 OHLCV；关键线只能来自后端 v3 overlay，不能由前端自己推导支撑压力、止损或目标。

### `/review`

- 展示真实扫描回放、复盘、命中统计。
- 没有复盘记录时显示暂无复盘样本。

### `/system`

- 展示真实服务健康、数据库、Redis、worker、扫描状态。
- Redis 和 worker 状态必须来自 runtime heartbeat / Redis probe；不能硬写 healthy。

## 阶段 5：清理假数据入口

目标：不让 mock 混进真实展示。

重点处理：
- `sniper-data.ts`
- `signal-feed.ts`
- `live-store.ts`

处理方式：
- 不再保留旧前端 mock 市场事实文件作为开发预览。
- 真实页面不能默认读它们。
- 没有数据时显示空状态，不 fallback 到假数据。

当前保留原因：

- 旧前端 mock 市场事实文件已物理删除，不能再作为隔离预览或测试辅助恢复。
- UI 展示类型已拆到 `src/lib/frontend-market-types.ts`。
- `sniper-data.ts` 只保留类型和纯显示 helper，不能生成狙击目标、入场价、止损、目标位、随机结局或复盘样本。
- 宠物、彩蛋、声音和训练引擎相关前端状态已从生产主线删除；`/api/frontend/ui-state` 只保留 `ui_preferences`。
- `journal-store.ts` 已接 `/api/frontend/journal-contract`，localStorage 只作为失败兜底。

已完成清理：

1. 活跃页面和组件不再从旧 mock 市场事实文件导入市场事实或展示类型。
2. `sniper-data.ts` 已移除 `getSniperTargets()`、随机目标、随机策略和 mock outcome。
3. 旧 `ReviewCenter` / `SystemCenter` 大型 mock 面板已删除。
4. 已新增 repository hygiene 测试，阻止旧 mock 市场事实文件恢复并进入活跃前端。

仍保留边界：

1. 任何新 UI 页面如果需要展示类型，必须从 `frontend-market-types.ts` 或后端 contract 类型读取，不能回头依赖 mock 市场事实源。

## 阶段 6：真实空状态验收

正确标准：

```text
有达标数据 -> 展示真实数据
没有达标数据 -> 展示真实空状态
接口失败 -> 展示错误状态
数据过期 -> 展示过期状态
系统运行中 -> 展示扫描证明
```

错误标准：

```text
没有数据却塞 mock
后端有数据但前端空
轻扫标记冒充交易信号
旧缓存冒充实时数据
空白页面没有解释
```

## 阶段 7：测试和页面检查

必须跑：

```bash
npm run typecheck
npm run test:market
npm run lint
npm run build
```

浏览器检查：
- `/dashboard`
- `/signals`
- `/leaderboard`
- `/market`
- `/review`
- `/system`
- `/token/真实币种`

## 阶段 8：腾讯云部署验证

本地通过后再部署。

检查：
- 容器是否健康。
- `/api/health` 是否正常。
- worker 是否继续扫描。
- Postgres 是否写入。
- Redis 是否正常。
- 前端页面是否能读到真实数据。

## 最终完成标准

```text
系统真实运行；
数据真实接入；
有机会就展示机会；
没机会就说明没机会；
前端不假装；
后端不脱钩；
UI 保持用户提供的设计。
```
