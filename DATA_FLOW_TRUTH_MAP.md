# DATA_FLOW_TRUTH_MAP

本文件定义 Market Radar 数据链路的真实流向和禁止回流边界。

## 标准链路

```text
Data Source
-> Scan
-> Analysis
-> Strategy
-> Frontend
-> Review / Backtest
```

## 链路职责

| 环节 | 输入 | 输出 | 是否允许回流 | 是否允许覆盖 | 是否允许缓存替换真实 |
| --- | --- | --- | --- | --- | --- |
| Data Source | Binance / OKX / Bybit / CoinGlass / CoinGecko / DefiLlama / DEX Screener | 原始行情、衍生品、宏观和外部观察数据 | 否 | 否 | 否 |
| Scan | 行情、成交、盘口、覆盖池、候选池状态 | 轻扫标记、深扫候选、覆盖证明 | 否 | 只能更新扫描状态 | 否，缓存必须标注 |
| Analysis | K 线结构、关键位、量能、衍生品、相对强弱 | 证据、反证、结构判断、机会质量 | 否 | 不能覆盖扫描事实 | 否 |
| Strategy | Analysis 输出、RR、风控门禁、触发/失效条件 | WAIT / BLOCKED / TRADE_PLAN_READY 等策略状态 | 否 | 不能改扫描排序 | 否 |
| Frontend | `/api/frontend/*` 和 `/api/radar/*` 合同 | 只读展示 | 否 | 不能自己补逻辑 | 否 |
| Review / Backtest | 历史回放、生产影子样本、复盘事件 | 命中、失败、漏判、归因 | 禁止污染生产排序 | 不能改生产分数 | 不适用 |

## 数据状态显示规则

- `live`：可以显示为实时或当前数据。
- `cached`：必须显示缓存可用，不能写成实时。
- `stale`：必须显示旧数据或过期风险。
- `partial`：必须说明缺哪些数据。
- `empty`：必须允许页面为空，不能用假数据补齐。
- `failed` / `error`：必须显示失败原因，不能写成市场没有机会。

## 不可误导规则

- WebSocket 轻扫只能发现异常，不能生成交易计划。
- 榜单只能提供市场观察，不能生成交易计划。
- CoinGlass 失败只能表示确认层不可用，不能写成市场无机会。
- 宏观环境只能做顺风/逆风背景，不能直接决定个币方向。
- 外部情报只能进入观察/证据候选，不能直接喊单。
- Backtest 的未来结果只能进入复盘，不得进入生产评分。

## API 归一化规则

- 前端显示必须来自后端 API 合同。
- API 对 `TRADE_PLAN_READY` 做二次防御：RR 不足、存在阻断原因或缺完整计划时，必须输出不可交易原因。
- 所有非交易状态都必须有 `noTradeReason` 或 `whyBlocked` 说明。
- 狙击榜只读取 `TRADE_PLAN_READY + RR >= 3 + no blocker`。
