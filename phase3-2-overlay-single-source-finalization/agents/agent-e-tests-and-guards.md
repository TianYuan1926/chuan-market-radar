# Agent E - 测试与 Guard

## 新增 / 更新测试

文件：`src/lib/api/frontend-contract.test.ts`

新增重点覆盖：

1. `buildFrontendKlineContract does not expose plan stop or targets when backend maturity is not ready`
2. `buildFrontendKlineContract marks wait overlays as wait conditions without target or stop semantics`
3. `buildFrontendKlineContract hides ready plan overlays when candles are stale`

更新既有测试：

- READY overlay sourceId 改为 `unified-decision:ready-plan:*`。
- READY overlay 必须标记 `semanticRole === ready_trade_plan`。
- READY overlay 必须标记 `sourceDecision === unified_decision_engine`。
- Token chart overlaySource 不再把结构图层和交易计划图层混写。

## 定向测试结果

命令：

```bash
npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js
```

结果：

```text
32/32 pass
```

## 全量门禁结果

全部通过：

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`：market core 810 pass，worker 17 pass，historical smoke 4 pass
- `npm run build`
- `npm run backtest:golden`：16/16
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`

## 结论

PASS。本轮 guard 证明旧 v3 plan overlay 不能绕过 unifiedDecision 直接画交易计划线。

