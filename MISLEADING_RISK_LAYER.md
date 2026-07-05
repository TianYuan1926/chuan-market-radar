# MISLEADING_RISK_LAYER

本文件列出 Market Radar 必须主动隔离的误导风险。

## P0 风险

| 风险 | 典型表现 | 必须处理方式 |
| --- | --- | --- |
| 候选冒充信号 | `DEEP_SCAN_CANDIDATE` 出现在狙击榜或显示为 Alpha | 只能进入验证中区域，必须写明不能交易 |
| 证据观察冒充交易信号 | `EVIDENCE_SIGNAL` 显示为“买/卖信号”或附完整计划 | 统一显示“证据观察”，不能进狙击榜 |
| WAIT 冒充 READY | 等待回踩/反抽被写成已触发 | 显示“等待确认”，不能附交易许可 |
| 榜单冒充推荐 | 涨幅榜/跌幅榜被包装成推荐 | 显示市场观察和复盘价值，不能给计划 |
| 缓存冒充实时 | `cached/stale` 数据显示为 live | 必须显示缓存或旧数据标签 |
| 前端补交易计划 | 前端自己编入场、止损、目标 | 禁止；没有后端计划就显示未生成 |

## UI 显示隔离

- 狙击榜：只允许 `TRADE_PLAN_READY`。
- 主信号区：允许 `EVIDENCE_SIGNAL`，但必须显示不可交易原因。
- 候选池：允许 `LIGHT_SCAN_MARK` 和 `DEEP_SCAN_CANDIDATE`，但必须显示验证中。
- 榜单页：可以展示涨跌和成交排行，但不能显示为推荐。
- 单币档案：可以展示条件计划、证据链和反证，但完整计划必须来自后端策略层。
- 复盘页：可以展示后验表现，但不能反向修改生产分数。

## 文案规则

- `EVIDENCE_SIGNAL` 对用户显示为“证据观察”。
- `TRADE_PLAN_READY` 对用户显示为“交易计划就绪”。
- `Risk Gate` 对用户显示为“风控门禁”。
- `RR` 对用户显示为“结构盈亏比”。
- `LIGHT_SCAN_MARK` 对用户显示为“轻扫发现”。
- `DEEP_SCAN_CANDIDATE` 对用户显示为“深扫候选”。

## 工程检查点

- 状态定义只从 `src/lib/signal-state-semantics.ts` 读取。
- 前端适配器不得把 `row.inCandidatePool` 转成 `Alpha` 标签。
- API 合同不得给非 `TRADE_PLAN_READY` 输出 `canTrade=true`。
- `whyBlocked` 为空只允许发生在真实 `TRADE_PLAN_READY` 且 RR/风控/计划完整时。
- 空狙击榜是合法状态，不能用候选填充。
