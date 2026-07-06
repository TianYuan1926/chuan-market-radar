# 第 3.2 步测试结果

## 定向测试

```bash
npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js
```

结果：32/32 pass。

覆盖：

- READY overlay 必须来自 `unifiedDecision.readyPlan`。
- 非 READY 不暴露 plan stop / target。
- WAIT overlay 只显示等待条件。
- stale Kline 不显示 ready plan overlay。

## 基础门禁

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test:market` | pass，market core 810 / worker 17 / historical smoke 4 |
| `npm run build` | pass |
| `npm run backtest:golden` | pass，16/16 |
| `npm run ci:forbidden-files` | pass |
| `npm run ci:secret-patterns` | pass |

## 未运行

- `npm run backtest:formal`：本轮禁止运行。
- production smoke：本轮不部署，不做生产验证。

