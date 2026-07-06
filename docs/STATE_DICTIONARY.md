# Market Radar 状态词典

本文件是前端、API、报告和审计使用的唯一状态语义说明。代码事实源为 `src/lib/ui-schema/status-dictionary.ts`。

## 总原则

- 候选不是执行依据。
- 证据观察不是交易计划。
- WAIT 只能等待条件，不可执行。
- BLOCKED 明确不可交易。
- 只有 `TRADE_PLAN_READY` 且后端风险门控通过，才允许进入计划就绪区。
- stale / partial / served_cache / failed 必须展示为数据状态，不能冒充 live。

## 状态表

| internal_status | display_cn | can_trade | can_enter_sniper | user_action | risk_level | 边界 |
|---|---:|---:|---:|---|---|---|
| TRADE | 交易计划就绪 | 是 | 是 | 人工复核后执行 | high | 只允许来自后端计划就绪样本，不允许前端生成 |
| WAIT | 等待条件 | 否 | 否 | 等触发条件 | medium | 不等于推荐，不可执行 |
| OBSERVE | 仅观察 | 否 | 否 | 继续观察 | low | 只能提示关注 |
| BLOCKED | 风控阻断 | 否 | 否 | 放弃或等待修复 | high | 风控、结构、赔率或数据失败 |
| CANDIDATE | 候选观察 | 否 | 否 | 等深扫验证 | medium | 轻扫/深扫候选，不是执行依据 |
| EVIDENCE_SIGNAL | 证据观察 | 否 | 否 | 重点观察 | medium | 有证据但未形成交易计划 |
| EVIDENCE_OBSERVE | 证据观察 | 否 | 否 | 重点观察 | medium | 等同观察层，不可交易 |
| TRADE_PLAN_READY | 交易计划就绪 | 是 | 是 | 人工复核后执行 | high | 需后端入场、止损、目标、结构盈亏比、风控闸门全部通过 |
| STALE | 数据过期 | 否 | 否 | 等新数据 | high | 不能当实时 |
| PARTIAL | 数据不完整 | 否 | 否 | 看缺失项 | medium | 只能部分参考 |
| FAILED | 数据失败 | 否 | 否 | 查数据源 | high | 不代表市场无机会 |
| SERVED_CACHE | 缓存快照 | 否 | 否 | 等更新 | medium | 不是新扫描 |
| RATE_LIMITED | 限速 | 否 | 否 | 等恢复 | medium | 不能补成 live |
| TIMEOUT | 超时 | 否 | 否 | 等重试 | medium | 不能补成 live |
| DEGRADED | 降级 | 否 | 否 | 降低信任 | medium | 必须说明降级原因 |
| EMPTY | 暂无机会 | 否 | 否 | 等下一轮 | low | 与数据缺失不同 |
| UNKNOWN | 未知 | 否 | 否 | 查链路 | high | 不可解释时不许交易 |
| NOT_CONFIGURED | 未配置 | 否 | 否 | 配置数据源 | high | 不许用 fallback 冒充 |

## 禁止文案

- `EVIDENCE_SIGNAL` 不得展示为“交易计划”或“执行依据”。
- `CANDIDATE` 不得展示为“推荐”。
- `WAIT` 不得展示为“可买/可空/可交易/计划就绪”。
- `SERVED_CACHE` 不得展示为“实时扫描”。

## 页面权限

- 计划就绪区只允许 `TRADE_PLAN_READY` / `TRADE`。
- 候选池允许 `CANDIDATE` / `EVIDENCE_SIGNAL` / `WAIT` / `BLOCKED`，但必须标注不可交易。
- 榜单只做市场观察，不进入策略推荐。
- 复盘页只读 lifecycle/outcome，不能反向修改生产排序。
