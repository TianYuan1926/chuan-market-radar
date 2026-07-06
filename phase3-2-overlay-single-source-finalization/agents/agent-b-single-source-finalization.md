# Agent B - 严格单一事实源收口

## 修改范围

本 Agent 的收口由主集成实现，涉及：

- `src/lib/api/frontend-contract.ts`
- `src/lib/api/system-health.ts`
- `src/lib/radar-contract.ts`
- `src/lib/api/frontend-contract.test.ts`

## 收口结果

PASS。

### 已完成

1. 新增 `buildDossierUnifiedDecision()`，Kline 和 Token 图表完整复用统一决策引擎。
2. `chartIntegrity.overlaySource` 拆成：
   - `v3_key_levels_forward_map`
   - `v3_key_levels_forward_map_unified_ready_plan`
   - `none`
3. 系统健康里的 `readyPlans` 不再只看 `strategyV3.tradePlan.isPlanEligible`，改为检查：
   - `maturity.stage === TRADE_PLAN_READY`
   - plan status 为 `READY_LONG / READY_SHORT`
   - `isPlanEligible === true`
   - `blockedBy` 为空
   - entry / stop / target / RR 完整
   - RR >= 3
4. 缺少统一就绪事实时，只能进入 blocked / wait / observe 类展示，不允许 READY。

## 保留路径说明

- `strategyV3.tradePlan` 仍是后端计划草案来源，但用户可见完整交易计划必须经过 `unifiedDecision` 读取。
- `keyLevels / forwardLevels` 继续作为结构参考，不携带 READY 权限。

## 剩余风险

无新增 P0。剩余 P2 是历史文档和 guard 测试中仍会命中旧词，但它们不是 production display path。

