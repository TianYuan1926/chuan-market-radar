# Phase 3 下一步建议

下一轮只做一个目标：

## 第 3.1 步：统一决策引擎接入 token dossier 后端合同

范围：

- 只接后端 API / contract。
- 不改 UI 美观。
- 不改 scan 排序。
- 不改原 v3 trade plan 规则。
- 不部署腾讯云。

验收：

- `TRADE_PLAN_READY` 只来自统一决策引擎。
- WAIT 必须带 trigger / invalidation / confirmation / whyNotNow。
- 缺字段时降级 BLOCKED 或 OBSERVE。
- 前端不能补 entry / stop / target。

测试：

- 定向 contract 测试。
- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
