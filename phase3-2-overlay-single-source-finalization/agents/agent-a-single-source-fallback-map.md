# Agent A - 单一事实源与 fallback 地图

## 范围

只读审查 `unifiedDecision`、legacy / fallback、`READY`、`tradePlan`、`readyPlan` 来源。本 Agent 不改代码，不部署，不运行 formal，不动数据库 / Redis / volume。

## 审查结论

PASS，但进入实现前存在一处必须修复的用户可见风险：

- `RadarSignal`、`TokenDossier`、计划就绪区、候选池的主决策来源已由第 3.1 步接到 `unifiedDecision`。
- `SniperBoard` 计划区只读 `TRADE_PLAN_READY + readyPlan`，未发现用 count / score / category 自行生成 READY 的路径。
- `TokenDossier` 报告段落中的交易计划内容由 `unifiedDecisionRead.canTradeNow ? rawTradePlan : null` 控制，未发现非 READY 直接展示完整交易计划。
- Kline overlay 在实现前仍从 `strategyV3.tradePlan` 生成 stop / target，这是生产用户可见图表层风险，交给 Agent C 修复。

## fallback / legacy 分类

| 路径 | 分类 | 判断 |
|---|---|---|
| `strategyV3.keyLevels / forwardLevels` | B | 用户可见但只做结构参考；可保留，不能生成 READY。 |
| `strategyV3.tradePlan` 到 Token 报告 | B | 只在 `unifiedDecisionRead.canTradeNow` 后展示；可保留为后端计划来源。 |
| 旧 `trade-plan:*` sourceId | B/D | 报告证据项 sourceId，不是图表 overlay；继续由 unified decision 控制。 |
| Kline 旧 `tradePlan` overlay | A | 用户可见且像交易计划线；必须收口到 unifiedDecision.readyPlan。 |
| docs / tests 中旧词命中 | D | 文档和守卫测试命中，非 production 用户可见路径。 |

## 风险分级

- P0：Kline overlay 在实现前可绕过 unified decision 展示 stop / target。
- P1：`chartIntegrity.overlaySource` 旧口径会把结构图层和交易计划图层混在一起。
- P2：grep 中仍有历史文档 / 测试里的禁用词命中，需要报告中标记为 benign，不当作生产风险。

## 是否可推动 single source 到 pass

可。前提是：

1. 图表 stop / target overlay 必须只由 `unifiedDecision.readyPlan` 生成。
2. 非 READY 只能展示结构参考、等待条件或阻断上下文。
3. stale / partial 数据不能展示 ready plan overlay。

