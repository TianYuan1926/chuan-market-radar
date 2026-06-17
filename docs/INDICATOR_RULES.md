# Evidence-Based Altcoin Strategy Engine v2 - Indicator Rules

本文定义技术指标解释规则。技术指标只能辅助判断趋势、动能、波动和衰竭，不能单独生成交易信号。

## 0. Strategy Engine v2 禁用边界

- 技术指标规则不接入清算热力图。
- 不使用 Liquidation Heatmap。
- 不构建 LiquidationZone。
- 不构建 heatmap provider。
- 不把潜在清算区作为目标位、方向依据、止损依据或入场依据。
- 技术指标解释器只能输出 EvidenceItem 或空结果，不能让 report_generator / 报告层直接做交易判断。

## 1. RSI 规则

硬规则：

- RSI 超买不等于做空。
- RSI 超卖不等于做多。
- 强趋势中 RSI 高位优先解释为动能强，同时增加追高风险。
- RSI 背离只作为衰竭风险证据，必须结合结构和成交量确认。

可生成 EvidenceItem：

- `TECHNICAL_INDICATOR / BULLISH`：趋势结构完整时，RSI 高位钝化说明动能较强。
- `TECHNICAL_INDICATOR / RISK`：高位放量长上影 + RSI 背离，说明衰竭风险上升。
- `TECHNICAL_INDICATOR / NEUTRAL`：RSI 位于中性区，只作为背景。

禁止：

- RSI > 70 直接输出做空。
- RSI < 30 直接输出做多。

## 2. MACD 规则

硬规则：

- 金叉不等于买入。
- 死叉不等于卖出。
- 必须结合结构突破解释。
- MACD 更适合辅助趋势和动能，不适合在箱体中部单独触发。

可生成 EvidenceItem：

- `TECHNICAL_INDICATOR / BULLISH`：结构突破后 MACD 柱体转强，支持突破质量。
- `TECHNICAL_INDICATOR / BEARISH`：跌破关键位后 MACD 转弱，支持下行延续。
- `TECHNICAL_INDICATOR / RISK`：价格创新高但 MACD 不创新高，支持动能衰竭风险。

禁止：

- MACD 金叉直接输出买入。
- MACD 死叉直接输出卖出。

## 3. Bollinger 规则

硬规则：

- 收窄代表压缩，不代表方向。
- 强趋势贴上轨不等于见顶。
- 下轨反弹不等于见底。
- 突破布林带必须结合结构位、收盘质量和量能。

可生成 EvidenceItem：

- `VOLUME_VOLATILITY / NEUTRAL`：带宽收窄，说明压缩。
- `VOLUME_VOLATILITY / BULLISH`：箱体上沿突破且收盘站稳，带宽扩张，支持突破质量。
- `VOLUME_VOLATILITY / RISK`：上轨外放量长上影，支持过热或抛压风险。

禁止：

- 布林带收窄直接预测方向。
- 贴上轨直接判断顶部。

## 4. ATR 规则

硬规则：

- ATR 只判断波动，不判断方向。
- ATR 可用于止损缓冲。
- ATR 扩张说明波动增强，不等于趋势健康。
- ATR 收缩说明波动压缩，不等于即将上涨。

用途：

- 判断压缩阶段。
- 判断突破后的波动扩张。
- 为结构止损添加缓冲。
- 判断追高风险是否增加。

禁止：

- ATR 单独决定多空。
- ATR 单独生成目标位。

## 5. EMA / VWAP 规则

硬规则：

- 只能辅助趋势和承接判断。
- 不能单独生成交易信号。
- EMA 多头排列不等于可以买。
- VWAP 上方不等于可以买。

可生成 EvidenceItem：

- `TECHNICAL_INDICATOR / BULLISH`：回踩 EMA/VWAP 后缩量承接，支持趋势健康。
- `TECHNICAL_INDICATOR / RISK`：跌破 VWAP 后反抽失败，说明承接减弱。
- `TECHNICAL_INDICATOR / NEUTRAL`：均线缠绕，说明趋势不清。

禁止：

- EMA 金叉直接入场。
- 站上 VWAP 直接入场。

## 6. ADX 规则

硬规则：

- ADX 只判断趋势强度，不判断方向。
- ADX 高说明趋势强，但方向必须由价格结构决定。
- ADX 低说明趋势弱或震荡，但不能单独否定爆发前压缩。

可生成 EvidenceItem：

- `TECHNICAL_INDICATOR / NEUTRAL`：ADX 低，说明趋势强度不足。
- `TECHNICAL_INDICATOR / BULLISH` 或 `BEARISH`：结构方向明确后，ADX 上升支持趋势强度。

## 7. Volume / OBV / CVD 规则

硬规则：

- 上涨放量且收盘强，支持能量增强。
- 上涨放量但长上影，支持抛压风险。
- 回调缩量，支持趋势健康。
- 价格创新高但 CVD 不创新高，支持衰竭风险。

数据边界：

- 如果没有真实逐笔主动买卖数据，不能宣称拥有真实 CVD。
- 无真实 CVD 时，只能使用 `taker_flow_proxy` 或 `volume_delta_proxy`，并标记 `dataFreshness` 和数据来源。
- OBV 只能辅助量价关系，不能单独决定方向。

可生成 EvidenceItem：

- `VOLUME_VOLATILITY / BULLISH`：突破放量、收盘接近高点、回踩缩量。
- `VOLUME_VOLATILITY / RISK`：放量长上影、价涨量弱、创新高但主动买入不跟随。
- `VOLUME_VOLATILITY / CONFLICT`：价格上行但 OBV/CVD 代理下行。

## 8. 指标输出格式

每个指标解释器必须输出 EvidenceItem 或空结果，不允许直接输出交易决策。

```ts
type IndicatorInterpretation = {
  evidence: EvidenceItem[];
  ignoredSignals: Array<{
    indicator: string;
    reason: string;
  }>;
};
```

示例：

```text
RSI 高位不输出做空。若结构仍为 HH/HL 且回调缩量，输出“动能强但追高风险上升”。
MACD 金叉不输出买入。若价格同时突破区间上沿并收盘站稳，输出“动能确认突破质量”。
```
