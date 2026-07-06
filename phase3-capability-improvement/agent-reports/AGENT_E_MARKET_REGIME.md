# Agent E 市场状态识别报告

## 结论

通过。新增市场状态识别模块，用于给个币分析提供市场背景，不直接生成交易计划、不改变实时排序。

## 修改范围

- `src/lib/market-regime/market-regime.ts`
- `src/lib/market-regime/market-regime.test.ts`
- `docs/MARKET_REGIME.md`
- `tsconfig.market-test.json`

## 输出状态

- `TREND_UP`
- `TREND_DOWN`
- `RANGE`
- `HIGH_VOLATILITY`
- `LOW_LIQUIDITY`
- `RISK_OFF`
- `ALT_ROTATION`
- `UNKNOWN`

## 核心边界

- `allowedUse=market_context_only`
- `canCreateTradePlan=false`
- `canMutateLiveRanking=false`
- 数据不足时输出 `UNKNOWN/PARTIAL`
- 市场状态只能解释顺风/逆风，不能代替个币结构、RR、深扫验证。

## 验证

- 定向测试已纳入 `npm run test:market`。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run backtest:golden`：通过，16/16。

## 风险

市场状态容易被误用为交易许可。本轮已在类型和测试中锁定 context-only，后续接线时仍需避免 UI 把 `ALT_ROTATION` 等状态包装成买入理由。
