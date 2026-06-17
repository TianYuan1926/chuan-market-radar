# Evidence-Based Altcoin Strategy Engine v2 - Evidence Engine Spec

本文定义证据层。任何行情结论、评分和中文解释都必须先转化为 EvidenceItem，再进入 Strategy Engine。

## 0. Strategy Engine v2 禁用边界

- 本证据层不接入清算热力图。
- 不使用 Liquidation Heatmap。
- 不构建 LiquidationZone。
- 不构建 heatmap provider。
- 不把潜在清算区作为目标位、入场位、止损位或方向依据。
- EvidenceItem 可以记录常规衍生品风险背景，但不能把清算热力图或清算区转成方向证据。
- report_generator / 报告层只能翻译 Strategy Engine 的结构化结果，不能绕过 EvidenceItem 重新判断行情。

## 1. EvidenceItem 数据结构

```ts
export type EvidenceFamily =
  | "PRICE_STRUCTURE"
  | "LOCATION_RR"
  | "VOLUME_VOLATILITY"
  | "DERIVATIVES"
  | "RELATIVE_STRENGTH"
  | "MARKET_REGIME"
  | "TECHNICAL_INDICATOR";

export type EvidenceDirection =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "RISK"
  | "CONFLICT";

export type EvidenceItem = {
  id: string;
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
  family: EvidenceFamily;
  source:
    | "market_structure"
    | "level_detector"
    | "range_compression"
    | "breakout_quality"
    | "pullback_quality"
    | "fakeout_risk"
    | "trend_integrity"
    | "location_rr"
    | "indicator_interpreter"
    | "oi_interpreter"
    | "funding_interpreter"
    | "long_short_interpreter"
    | "taker_flow_interpreter"
    | "market_context";
  label: string;
  direction: EvidenceDirection;
  strength: number;
  confidence: number;
  weightHint: number;
  dataFreshness: "fresh" | "stale" | "missing" | "partial";
  fact: string;
  reasoning: string;
  invalidates?: string[];
  conflictsWith?: string[];
  relatedLevel?: number;
  relatedRange?: {
    high: number;
    low: number;
  };
  createdAt: string;
};
```

字段规则：

- `strength` 表示证据本身强弱，范围 `0-100`。
- `confidence` 表示数据可信度，范围 `0-100`。
- `weightHint` 是融合层可参考的建议权重，不是最终分数。
- `fact` 必须是可观察事实。
- `reasoning` 必须解释为什么这个事实属于该方向或风险。
- `label` 必须可读，不允许只有指标名。

## 2. EvidenceFamily 枚举

```ts
export type EvidenceFamily =
  | "PRICE_STRUCTURE"
  | "LOCATION_RR"
  | "VOLUME_VOLATILITY"
  | "DERIVATIVES"
  | "RELATIVE_STRENGTH"
  | "MARKET_REGIME"
  | "TECHNICAL_INDICATOR";
```

家族定义：

| 家族 | 作用 | 示例 |
| --- | --- | --- |
| `PRICE_STRUCTURE` | 判断阶段、方向、关键位和失效 | HH/HL、LH/LL、突破、跌回箱体 |
| `LOCATION_RR` | 判断位置和盈亏比 | 前高附近、箱体中部、止损过远 |
| `VOLUME_VOLATILITY` | 判断能量、压缩、抛压 | 放量突破、缩量回踩、ATR 收缩 |
| `DERIVATIVES` | 判断资金质量和拥挤 | OI、Funding、多空比、Taker flow |
| `RELATIVE_STRENGTH` | 判断个币相对 BTC/ETH 强弱 | BTC 横盘时个币走强 |
| `MARKET_REGIME` | 判断大盘顺逆风 | BTC/ETH Macro Weather |
| `TECHNICAL_INDICATOR` | 辅助趋势、动能、波动和衰竭 | RSI、MACD、EMA、VWAP、ADX |

## 3. EvidenceDirection 枚举

```ts
export type EvidenceDirection =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "RISK"
  | "CONFLICT";
```

方向定义：

- `BULLISH`：支持多头假设或上涨延续。
- `BEARISH`：支持空头假设或下跌延续。
- `NEUTRAL`：只说明状态，不支持方向。
- `RISK`：说明拥挤、追高、衰竭、假突破或风控风险。
- `CONFLICT`：和高权重证据冲突，必须进入冲突处理。

## 4. 证据家族权重上限

默认上限：

| 家族 | 单家族最高占比 |
| --- | --- |
| `PRICE_STRUCTURE` | 35% |
| `LOCATION_RR` | 20% |
| `VOLUME_VOLATILITY` | 20% |
| `DERIVATIVES` | 20% |
| `RELATIVE_STRENGTH` | 15% |
| `MARKET_REGIME` | 15% |
| `TECHNICAL_INDICATOR` | 10%-15% |

规则：

- `PRICE_STRUCTURE` 是第一优先级。
- `TECHNICAL_INDICATOR` 不能超过总证据权重的 `10%-15%`。
- 市场状态不允许由技术指标单独决定。
- 如果结构、位置、风险门控不支持，指标共振也不能生成交易结论。

## 5. 同源指标不得重复计分

同源重复定义：

- RSI、Stochastic、CCI 都属于震荡/动能类，不得全额重复计分。
- EMA20、EMA50、EMA200 属于均线结构，不得拆成三个独立强证据。
- MACD 金叉、柱体转正、DIF 上穿属于同一 MACD 证据簇。
- Bollinger 收窄和 ATR 收缩都属于波动压缩，不得重复放大。

融合规则：

- 同源证据保留最有解释力的一条为主证据。
- 其余同源证据可作为 `supportingDetails`，不得重复加权。
- 若同源指标互相矛盾，生成 `CONFLICT` 或降低该证据簇置信度。

## 6. 技术指标总权重不能超过 10%-15%

技术指标用途：

- 辅助判断趋势。
- 辅助判断动能。
- 辅助判断波动。
- 辅助判断衰竭。

禁止用途：

- 单独决定方向。
- 单独触发入场。
- 单独生成目标位。
- 单独推翻高周期结构。

## 7. 盘面结构优先于技术指标

优先级：

```text
PRICE_STRUCTURE
-> LOCATION_RR
-> VOLUME_VOLATILITY / DERIVATIVES / RELATIVE_STRENGTH
-> MARKET_REGIME
-> TECHNICAL_INDICATOR
```

示例：

- RSI 超买但 HH/HL 完整、回调缩量、Funding 中性：优先解释为趋势健康，同时增加追高风险。
- MACD 金叉但价格在箱体中部：输出观察，不生成突破计划。
- Bollinger 收窄只代表压缩，不代表方向。

## 8. 低周期不能推翻高周期

规则：

- `1m/5m/15m` 只能作为执行和触发周期。
- `30m/1h` 用于主要结构确认。
- `4h/1d` 用于压力、趋势和风险背景。
- 小周期看多但高周期在强压力下，只能输出 `WATCH_ONLY`、`WAIT_PULLBACK` 或 `CONFLICT`。

例外：

- 小周期强势可以提示“早期候选”，但必须等待高周期压力被突破或回踩确认。

## 9. 所有结论必须能追溯到 EvidenceItem

要求：

- 每个 score 必须引用参与计算的 EvidenceItem id。
- 每个 decision 必须引用核心支持证据和核心反证。
- 每段中文解释必须能追溯到 EvidenceItem 的 `fact` 和 `reasoning`。
- 如果无法追溯，报告只能输出“数据不足”或“等待确认”。

## 10. report_generator 禁止直接做交易判断

`report_generator` 允许：

- 翻译市场阶段。
- 翻译最终决策。
- 展示支持证据。
- 展示反证和冲突。
- 展示入场、止损、目标、失效和等待条件。

`report_generator` 禁止：

- 自己重新判断行情。
- 根据自然语言追加新方向。
- 根据用户偏好修改 Strategy Engine 决策。
- 把观察状态写成交易机会。
- 删除冲突或失效信息。
