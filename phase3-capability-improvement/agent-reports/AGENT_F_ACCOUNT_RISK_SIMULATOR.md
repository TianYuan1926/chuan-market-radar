# Agent F 账户级风险模拟器报告

## 结论

通过。新增账户级风险模拟器，按用户个人仓位镜头展示风险，但不改变结构 RR、不放宽风控、不生成交易计划。

## 修改范围

- `src/lib/risk/account-risk-types.ts`
- `src/lib/risk/account-risk-simulator.ts`
- `src/lib/risk/account-risk-simulator.test.ts`
- `docs/ACCOUNT_RISK_SIMULATOR.md`
- `tsconfig.market-test.json`

## 默认规则

- 账户权益：1500 USDT
- 初始保证金：总资金 3%
- BTC/ETH：150x
- 山寨币：需要输入交易所最高杠杆；未知时显示 unavailable，不伪造
- 保证金模式：cross
- 结构盈亏比门槛：仍为 3:1

## 边界

- 只读账户风险镜头。
- 不提供交易所精确强平价。
- 不改变后端结构计划。
- 不绕过 `TRADE_PLAN_READY` 门槛。

## 验证

- 定向测试已纳入 `npm run test:market`。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。

## 风险

山寨币最高杠杆未知时，本模块会拒绝伪造名义仓位、保证金和止损亏损。后续若接入前端，必须显示 waiting/unavailable，而不是填 0。
