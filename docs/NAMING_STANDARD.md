# Market Radar 中文命名标准

本文件定义用户可见命名。内部 TypeScript enum、API 字段、数据库字段和测试字段可以保留英文，但普通用户页面、按钮、卡片、状态标签、说明文案必须使用本文件和 `src/lib/ui-schema/display-names.ts` 的中文命名。

## 1. 总原则

- 内部英文名保持稳定，用户可见层中文化。
- 候选、观察、等待、阻断和计划就绪必须严格区分。
- 榜单只表示强弱观察，不表示推荐。
- 轻扫、WebSocket、榜单和外部情报只服务发现层，不能直接生成交易计划。
- 前端不能补写入场、止损、目标、结构盈亏比或交易计划。

## 2. 页面命名

| 内部名称 | 用户可见名称 |
|---|---|
| Dashboard | 雷达驾驶舱 |
| Signals | 机会观察池 |
| Leaderboard | 强弱观察榜 |
| Market | 全市场扫描 |
| Token Dossier | 单币档案 |
| Review | 复盘中心 |
| System | 系统健康中心 |
| Login | 登录 |

## 3. 核心模块命名

| 内部名称 | 用户可见名称 |
|---|---|
| Scan System | 全市场发现系统 |
| Light Scan | 快速轻扫 |
| Deep Scan | 深度确认 |
| Analysis System | 结构分析系统 |
| Strategy System | 策略守门系统 |
| Review System | 复盘系统 |
| Evolution System | 复盘进化系统 |
| Lifecycle | 生命周期追踪 |
| Outcome | 结果追踪 |
| Research-only | 研究隔离 / 仅研究模式 |
| Candidate Pool | 候选观察池 |
| Sniper Board | 计划就绪区 |

## 4. 状态命名

| 内部状态 | 用户可见名称 | 可交易 | 可进入计划就绪区 |
|---|---|---:|---:|
| LIGHT_SCAN_MARK | 快速轻扫 | 否 | 否 |
| DEEP_SCAN_CANDIDATE | 深度确认 | 否 | 否 |
| CANDIDATE | 候选观察 | 否 | 否 |
| EVIDENCE_SIGNAL | 证据观察 | 否 | 否 |
| WAIT | 等待条件 | 否 | 否 |
| OBSERVE / WATCH | 仅观察 | 否 | 否 |
| BLOCKED | 风控阻断 | 否 | 否 |
| TRADE_PLAN_READY | 交易计划就绪 | 是，仍需人工复核 | 是 |

## 5. 数据状态命名

| 内部状态 | 用户可见名称 |
|---|---|
| served_cache / cached | 缓存快照 |
| stale | 数据过期 |
| partial | 部分可用 |
| degraded | 降级运行 |
| failed / error | 数据失败 |
| rate_limited | 接口限流 |
| timeout | 请求超时 |
| empty | 暂无数据 |
| unknown | 状态未知 |
| not_configured | 未配置 |

## 6. 禁止用户可见词

用户可见页面不得出现以下表达：

- 新信号
- 证据信号
- 信号详情
- 高置信信号
- 交易信号
- 推荐榜
- 狙击榜
- 狙击席
- 可交易候选
- 立即入场
- 直接交易
- 高胜率信号
- 强推荐

替换规则：

- 新信号 -> 新候选观察
- 证据信号 -> 证据观察
- 信号详情 -> 观察详情
- 交易信号 -> 交易计划就绪 / 执行依据
- 推荐榜 -> 强弱观察榜
- 狙击榜 -> 计划就绪区
- 狙击席 -> 计划就绪区
- 可交易候选 -> 候选观察
- 立即入场 / 直接交易 -> 人工复核后再决定

## 7. 特别边界

- `EVIDENCE_SIGNAL` 只能展示为“证据观察”，不能展示为交易计划。
- `WAIT` 只能展示为“等待条件”，不能展示为计划就绪。
- `CANDIDATE` 只能展示为“候选观察”，不能展示为可交易候选。
- `TRADE_PLAN_READY` 是唯一允许进入计划就绪区的状态。
- 没有后端 trade plan 时，单币档案不能展示建议入场、止损、目标位、失效位或计划草案。
