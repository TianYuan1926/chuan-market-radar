# Evidence-Based Altcoin Strategy Engine v2 - Core Strategy Spec

本文定义 Evidence-Based Altcoin Strategy Engine v2 的核心策略边界。它是后续实现 Market Reading Engine、Market Structure Engine、Evidence Engine、Scoring 和 Strategy Engine 的长期事实源。

## 1. 系统目标与非目标

系统目标：

- 识别山寨币爆发前状态、突破确认状态、趋势加速状态和衰竭风险。
- 把盘面结构、常规衍生品数据、成交量、相对强度和技术指标转化为可追溯证据。
- 根据证据、冲突、盈亏比和风险门控生成结构化交易计划。
- 输出等待、观察、准备、确认、持有、止盈管理、退出风险、冲突和失效等状态。
- 为前端、Signal Dossier、Journal、Daily Mover Review 和后续复盘校准提供统一结构化结果。

明确非目标：

- 不自动下单。
- 不预测必涨必跌。
- 不使用清算热力图。
- 不使用潜在清算区。
- 不构建清算热力图、清算区、热力图 provider 或类似模块。
- 不把潜在清算区作为目标位、入场位、止损位或方向依据。
- 不让 `report_generator` 直接做交易判断。
- 不让任何单一指标、单一数据、单一 K 线形态直接生成交易结论。
- 不承诺秒级实时行情，不把缓存、缺字段或旧数据伪装成完整事实。

边界说明：

- 当前系统已有的常规清算统计字段，例如 `liquidationUsd24h`，最多只能作为系统健康、波动背景或宏观风险提示；Strategy Engine v2 不使用清算热力图，不生成清算区目标，也不因清算统计单独改变方向。
- 所有交易相关结论必须由 EvidenceItem 进入 Evidence Fusion 后再进入 Strategy Engine。

## 2. 市场阶段枚举

```ts
export type MarketStage =
  | "IDLE"
  | "COMPRESSION"
  | "ACCUMULATION"
  | "PRE_BREAKOUT"
  | "BREAKOUT_CONFIRM"
  | "TREND_ACCELERATION"
  | "EXHAUSTION_RISK"
  | "INVALIDATED"
  | "CONFLICT";
```

阶段定义：

| 阶段 | 含义 | 交易含义 |
| --- | --- | --- |
| `IDLE` | 没有有效结构或数据不足 | 不交易 |
| `COMPRESSION` | 波动压缩、区间收敛、等待方向 | 观察，不预判方向 |
| `ACCUMULATION` | 横盘或回调中出现温和资金埋伏 | 观察，等待突破或回踩确认 |
| `PRE_BREAKOUT` | 接近结构边缘，能量和相对强度改善 | 准备计划，不追 |
| `BREAKOUT_CONFIRM` | 结构突破或跌破并有质量验证 | 可进入确认决策 |
| `TREND_ACCELERATION` | 趋势加速且结构未失效 | 只管理趋势仓，不追新仓 |
| `EXHAUSTION_RISK` | 动能衰竭、拥挤、位置过高或抛压增加 | 避免追涨，管理止盈或退出风险 |
| `INVALIDATED` | 跌回箱体、破坏关键结构或触发失效条件 | 失效，不交易 |
| `CONFLICT` | 高权重证据明显冲突 | 等待或只观察 |

阶段不是方向。`COMPRESSION` 可以向上也可以向下；`BREAKOUT_CONFIRM` 必须同时携带方向字段和确认条件。

## 3. 最终决策枚举

```ts
export type StrategyDecision =
  | "NO_SETUP"
  | "WATCH_ONLY"
  | "PREPARE_LONG"
  | "WAIT_BREAKOUT"
  | "WAIT_PULLBACK"
  | "BREAKOUT_CONFIRM_LONG"
  | "AVOID_CHASE"
  | "TREND_HOLD"
  | "TAKE_PROFIT_MANAGE"
  | "EXIT_RISK"
  | "CONFLICT"
  | "INVALIDATED";
```

决策含义：

| 决策 | 允许动作 | 禁止动作 |
| --- | --- | --- |
| `NO_SETUP` | 不展示为机会 | 生成交易计划 |
| `WATCH_ONLY` | 观察、复盘、等待下一帧 | 给方向 |
| `PREPARE_LONG` | 准备多头计划和确认条件 | 直接追入 |
| `WAIT_BREAKOUT` | 等结构突破 | 提前假定突破成功 |
| `WAIT_PULLBACK` | 等回踩或反抽确认 | 远离结构位追价 |
| `BREAKOUT_CONFIRM_LONG` | 给出条件化多头计划 | 无失效条件地看多 |
| `AVOID_CHASE` | 明确过热勿追 | 新开追涨仓 |
| `TREND_HOLD` | 管理已有趋势仓 | 把持仓管理变成新开仓建议 |
| `TAKE_PROFIT_MANAGE` | 分批止盈、移动保护 | 继续加仓 |
| `EXIT_RISK` | 标记退出风险 | 硬解释为继续趋势 |
| `CONFLICT` | 等待冲突解除 | 强行给方向 |
| `INVALIDATED` | 失效、复盘、移出候选 | 保留原方向 |

## 4. 五个核心分数

分数范围统一为 `0-100`。

### PreMoveScore

衡量是否处于爆发前可关注状态。

主要输入：

- 压缩质量。
- 区间边缘接近程度。
- 吸筹或资金埋伏证据。
- 相对强度。
- 量能温和改善。
- Funding 中性程度。

解释：

- `< 40`：无明显爆发前特征。
- `40-59`：观察。
- `60-74`：进入准备区。
- `>= 75`：高优先级候选，但仍需触发确认。

### EnergyScore

衡量突破或趋势推进的能量质量。

主要输入：

- 突破时收盘强度。
- 成交量扩张。
- OI 温和扩张。
- 主动买入或 CVD 代理改善。
- BTC/ETH 大盘天气是否顺风。

解释：

- `< 45`：能量不足。
- `45-64`：普通。
- `65-79`：能量较好。
- `>= 80`：强能量，但仍需检查 RiskScore。

### RiskScore

衡量追高、拥挤、假突破、位置差和结构失效风险。

主要输入：

- Funding 极高。
- OI 暴涨但价格滞涨。
- 长上影或放量不涨。
- 远离合理止损位。
- 盈亏比不足。
- BTC/ETH 逆风。
- 大周期压力位。

解释：

- `< 35`：风险较低。
- `35-54`：普通风险。
- `55-69`：谨慎。
- `>= 70`：禁止追高，等待回踩或输出观察。

### TrendHoldScore

衡量已有趋势是否仍值得持有。

主要输入：

- 高低点是否继续抬高。
- 回调是否缩量。
- EMA/VWAP 是否承接。
- Funding 是否未极端。
- 相对强度是否继续。

解释：

- `< 45`：趋势仓质量下降。
- `45-64`：减仓或保护。
- `65-79`：可继续管理。
- `>= 80`：趋势健康，但不能作为新追入理由。

### EnergyDecayScore

衡量趋势衰竭风险。

主要输入：

- 价格创新高但成交量、OBV、CVD 代理不创新高。
- OI 暴涨但价格滞涨。
- Funding 极高。
- 长上影增加。
- RSI/MACD 背离。
- 接近高周期阻力或目标位。

解释：

- `< 35`：衰竭不明显。
- `35-54`：开始观察。
- `55-69`：需要止盈管理。
- `>= 70`：输出 `EXHAUSTION_RISK`、`TAKE_PROFIT_MANAGE` 或 `EXIT_RISK`。

## 5. 入场规则

入场必须同时满足：

1. 市场阶段为 `PRE_BREAKOUT`、`BREAKOUT_CONFIRM` 或回踩后的有效继续结构。
2. 结构方向明确，且关键位清晰。
3. 证据至少覆盖 `PRICE_STRUCTURE`、`LOCATION_RR`、`VOLUME_VOLATILITY` 三类。
4. 若使用衍生品证据，必须区分健康增仓和拥挤风险。
5. 盈亏比必须大于或等于 `3:1`。
6. `RiskScore < 70`。
7. 没有高周期强冲突。
8. 入场计划必须包含触发条件、无效条件和等待条件。

禁止入场：

- 箱体中部。
- 远离突破位后追高。
- Funding 极端且 OI 暴涨。
- 大周期压力下小周期看多。
- 结构跌回箱体。
- 证据冲突未解除。

## 6. 止损规则

止损必须来自结构，不来自主观固定百分比。

可用来源：

- 突破位下方。
- 回踩低点下方。
- 区间下沿下方。
- 前低下方。
- ATR 缓冲后的结构失效位。
- VWAP/EMA 承接失败后的结构位。

规则：

- ATR 只用于缓冲，不用于决定方向。
- 止损过远导致盈亏比小于 `3:1` 时，不允许输出交易信号。
- 失效位必须能被前端和报告解释。

## 7. 目标位生成规则

允许目标来源：

- 前高。
- 区间等幅目标。
- 结构扩展位。
- 重要成交密集区或近似 volume profile 节点。
- Fibonacci extension 作为辅助目标。
- 高周期阻力区。

禁止目标来源：

- 清算热力图。
- 潜在清算区。
- 未验证的主观价格。
- 单一指标派生目标。

目标位必须服务盈亏比和分批止盈，不代表必达。

## 8. 分批止盈规则

基础规则：

- 第一目标：前高、区间上沿或最近阻力。
- 第二目标：等幅目标或高周期阻力。
- 趋势剩余仓：仅在 TrendHoldScore 达标且结构未失效时保留。

触发止盈管理：

- EnergyDecayScore 升高。
- Funding 极端。
- OI 暴涨但价格滞涨。
- 长上影和放量抛压增加。
- 接近高周期阻力。

## 9. 趋势仓规则

趋势仓只管理已有计划，不为新追入背书。

可继续持有条件：

- 高低点继续抬高。
- 回调缩量。
- EMA/VWAP 承接。
- Funding 未极端。
- TrendHoldScore 大于等于 `65`。
- 未触发结构失效。

必须降级：

- EnergyDecayScore 大于等于 `55`。
- RiskScore 大于等于 `70`。
- 跌破关键结构。
- 高周期压力明显。

## 10. 失效条件

失效条件优先级高于方向判断。

常见失效：

- 突破后跌回箱体。
- 跌破回踩低点。
- 跌破关键趋势结构。
- 大周期压力拒绝并形成放量回落。
- 证据从支持转为冲突。
- 数据过期或关键字段缺失。

触发后输出：

- `INVALIDATED`
- 明确失效原因。
- 移出可交易候选，保留复盘样本。

## 11. 风险门控规则

风险门控在最终决策前执行。

硬门控：

- 盈亏比 `< 3:1`：禁止输出交易信号。
- `RiskScore >= 70`：禁止追高，只能等待回踩或输出观察。
- 结构失效：输出 `INVALIDATED`。
- 高权重证据冲突：输出 `CONFLICT` 或 `WATCH_ONLY`。
- 数据过期或缺失：输出 `WATCH_ONLY` 或 `NO_SETUP`。

软门控：

- BTC/ETH 逆风：降低多头置信度，但不能一刀切否定独立强势山寨。
- Funding 偏高：增加 RiskScore。
- OI 暴涨：必须结合价格行为判断健康增仓还是拥挤风险。
- 小周期看多但大周期压力：降级为等待或冲突。

## 12. 模块边界

- `features` 只提取事实，不下交易结论。
- `evidence` 只生成证据，不直接买卖。
- `scoring` 只算分。
- `strategy` 负责最终决策。
- `report` 只能翻译结构化结果。
- 所有中文解释必须能追溯到 EvidenceItem。
