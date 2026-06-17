# Evidence-Based Altcoin Strategy Engine v2 - Golden Cases

本文定义 Strategy Engine v2 的黄金测试场景。后续实现必须把这些场景转化为测试，防止系统变成单指标喊单器。

每个场景至少需要验证：

- 输入事实。
- 生成的 EvidenceItem 家族和方向。
- 市场阶段。
- 五个核心分数的大致区间。
- 最终决策。
- 禁止输出项。
- report_generator / 报告层不得改变 Strategy Engine 的最终决策。

## 1. 压缩但未突破

输入事实：

- 价格在 1h 箱体内横盘。
- Bollinger Width 收窄。
- ATR 下降。
- OI 温和上升。
- Funding 中性。
- 价格仍未突破箱体上沿。

期望证据：

- `PRICE_STRUCTURE / NEUTRAL`：箱体未突破。
- `VOLUME_VOLATILITY / NEUTRAL`：波动压缩。
- `DERIVATIVES / NEUTRAL`：资金埋伏可能。

期望输出：

- `MarketStage = COMPRESSION`
- `StrategyDecision = WATCH_ONLY` 或 `WAIT_BREAKOUT`
- 禁止输出直接做多。

## 2. 疑似吸筹

输入事实：

- 价格横盘，低点不再降低。
- 回调缩量。
- OI 缓慢上升。
- Funding 中性。
- BTC 横盘，个币相对强。

期望证据：

- `PRICE_STRUCTURE / NEUTRAL`：结构趋稳。
- `VOLUME_VOLATILITY / BULLISH`：回调缩量。
- `DERIVATIVES / BULLISH`：健康资金埋伏。
- `RELATIVE_STRENGTH / BULLISH`：相对强。

期望输出：

- `MarketStage = ACCUMULATION`
- `StrategyDecision = WATCH_ONLY` 或 `PREPARE_LONG`
- 必须要求突破或回踩确认。

## 3. 突破前临界

输入事实：

- 价格接近区间上沿。
- 压缩时间足够。
- 成交量开始放大但未爆量。
- OI 温和增加。
- Funding 中性。
- BTC/ETH 大盘天气非逆风。

期望输出：

- `MarketStage = PRE_BREAKOUT`
- `PreMoveScore >= 60`
- `RiskScore < 55`
- `StrategyDecision = WAIT_BREAKOUT`
- 禁止提前假定突破成功。

## 4. 优质突破

输入事实：

- 价格突破区间上沿并收盘站稳。
- 成交量明显放大。
- 收盘接近高点。
- OI 温和上升。
- Funding 中性或轻微偏高。
- 止损位清晰，盈亏比大于等于 3:1。

期望输出：

- `MarketStage = BREAKOUT_CONFIRM`
- `EnergyScore >= 65`
- `RiskScore < 60`
- `StrategyDecision = BREAKOUT_CONFIRM_LONG` 或 `WAIT_PULLBACK`
- 必须包含结构止损和失效条件。

## 5. 高风险突破

输入事实：

- 价格突破后快速远离区间。
- OI 暴涨。
- Funding 极高。
- 成交量过热。
- 止损位过远，盈亏比不足。

期望输出：

- `MarketStage = EXHAUSTION_RISK` 或 `BREAKOUT_CONFIRM` with high risk
- `RiskScore >= 70`
- `StrategyDecision = AVOID_CHASE` 或 `WAIT_PULLBACK`
- 禁止输出追多信号。

## 6. RSI 超买但趋势健康

输入事实：

- RSI > 75。
- 1h 结构 HH/HL 完整。
- 回调缩量。
- EMA/VWAP 承接。
- Funding 未极端。

期望输出：

- RSI 生成 `TECHNICAL_INDICATOR / RISK` 或动能说明，不生成做空。
- `TrendHoldScore >= 65`
- `StrategyDecision = TREND_HOLD`
- 禁止因 RSI 超买直接做空。

## 7. OI 暴涨但价格滞涨

输入事实：

- OI 快速上升。
- 价格没有突破关键位。
- Funding 偏高。
- K 线出现上影或横盘。

期望输出：

- `DERIVATIVES / RISK`
- `RiskScore >= 65`
- `MarketStage = EXHAUSTION_RISK` 或 `CONFLICT`
- `StrategyDecision = WATCH_ONLY`、`AVOID_CHASE` 或 `CONFLICT`
- 禁止输出突破确认。

## 8. 盈亏比不足

输入事实：

- 结构方向看多。
- 入场点距离止损过远。
- 第一目标太近。
- 预估盈亏比 < 3:1。

期望输出：

- `LOCATION_RR / RISK`
- `StrategyDecision = WATCH_ONLY` 或 `NO_SETUP`
- 禁止输出交易信号。

## 9. 突破后跌回箱体

输入事实：

- 价格突破箱体上沿。
- 随后收盘跌回箱体内。
- 成交量放大。
- 回踩失败。

期望输出：

- `PRICE_STRUCTURE / RISK` 或 `BEARISH`
- `MarketStage = INVALIDATED`
- `StrategyDecision = INVALIDATED`
- 必须移出可交易候选，保留复盘样本。

## 10. 高位衰竭

输入事实：

- 价格持续上涨后接近高周期阻力。
- 创新高但成交量、OBV 或 CVD 代理不创新高。
- Funding 极高。
- 长上影增加。
- OI 高位继续扩张。

期望输出：

- `MarketStage = EXHAUSTION_RISK`
- `EnergyDecayScore >= 70`
- `StrategyDecision = TAKE_PROFIT_MANAGE` 或 `EXIT_RISK`
- 禁止输出新增追多。

## 11. 小周期看多但大周期压力

输入事实：

- 15m 突破小区间。
- 1h/4h 靠近前高或强阻力。
- 大周期仍未突破。
- 盈亏比不足或确认不够。

期望输出：

- `PRICE_STRUCTURE / CONFLICT`
- `LOCATION_RR / RISK`
- `StrategyDecision = CONFLICT` 或 `WAIT_PULLBACK`
- 禁止小周期推翻高周期。

## 12. BTC 下跌但山寨独立抗跌

输入事实：

- BTC/ETH Macro Weather 逆风。
- 个币不破区间低点。
- 成交量未明显放大砸盘。
- OI 温和上升，Funding 中性。
- 相对强度明显高于 BTC。

期望输出：

- `MARKET_REGIME / RISK`
- `RELATIVE_STRENGTH / BULLISH`
- `MarketStage = ACCUMULATION` 或 `PRE_BREAKOUT`
- `StrategyDecision = WATCH_ONLY` 或 `WAIT_BREAKOUT`
- 禁止因 BTC 下跌一刀切否定，也禁止直接追入。

## 13. 数据过期或缺字段

输入事实：

- K 线数据 stale。
- OI/Funding 缺失。
- BTC/ETH 锚点 unknown。

期望输出：

- `MarketStage = IDLE`
- `StrategyDecision = WATCH_ONLY` 或 `NO_SETUP`
- 所有解释必须显示数据边界。
- 禁止伪装成完整分析。

## 14. 清算热力图禁用场景

输入事实：

- 外部数据源提供潜在清算热力图或清算区。

期望输出：

- 系统不得创建 `LiquidationHeatmap`、`LiquidationZone` 或 heatmap provider。
- 不得使用清算区作为目标位、方向依据、止损依据或入场依据。
- 若存在常规 `liquidationUsd24h`，最多作为风险背景，不进入方向判断。
