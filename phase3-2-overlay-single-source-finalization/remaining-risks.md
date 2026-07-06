# 第 3.2 步剩余风险

## P0

无新增 P0。

## P1

无阻断型 P1。

## P2

1. 生产未部署：本轮仅本地安全分支验证，不能代表腾讯云生产已更新。
2. 历史文档和 guard fixture 中保留禁用词：用于防回归，不属于 production 用户可见风险。
3. 若未来新增 Kline / TradingView 图表组件，必须复用 `filterKlineOverlaysForDisplay()`，否则可能重新产生 overlay 视觉误导。

