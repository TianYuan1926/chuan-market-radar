# Evidence-Based Altcoin Strategy Engine v2 - Data Rules

本文定义常规数据面解释规则。数据面用于验证资金质量、拥挤程度、相对强度和风险，不允许单独生成交易结论。

## 1. OI 规则

硬规则：

- OI 上升不能单独看涨。
- OI 下降不能单独看跌。
- OI 必须结合价格行为、成交量、Funding 和位置解释。

解释规则：

| 场景 | 解释 | EvidenceDirection |
| --- | --- | --- |
| 价格上涨 + OI 温和上升 + Funding 中性 | 健康增仓 | `BULLISH` |
| 价格上涨 + OI 暴涨 + Funding 极高 | 拥挤风险 | `RISK` |
| 价格上涨 + OI 下降 | 可能是空头回补，持续性打折 | `CONFLICT` 或 `RISK` |
| 价格横盘 + OI 缓慢上升 + Funding 中性 | 可能有资金埋伏 | `NEUTRAL` 或 `BULLISH` |
| OI 暴涨 + 价格滞涨 | 杠杆拥挤风险 | `RISK` |
| 跌破结构 + OI 上升 | 空头增仓或多头被动扛单，需结合 Funding | `BEARISH` 或 `RISK` |

阈值原则：

- “温和上升”和“暴涨”必须按品种波动、周期和历史分位动态判断。
- 缺历史分位时使用保守阈值，并降低 confidence。

## 2. Funding 规则

硬规则：

- Funding 高不是强势，而是拥挤风险。
- 爆发前 Funding 中性更健康。
- Funding 极高 + 价格滞涨 = 衰竭风险。
- Funding 低或负值不等于必涨，只说明多头拥挤较低或空头成本变化。

解释规则：

| 场景 | 解释 | EvidenceDirection |
| --- | --- | --- |
| Funding 中性 + 结构压缩 | 更健康的爆发前状态 | `NEUTRAL` 或 `BULLISH` |
| Funding 高 + 价格加速 | 趋势强但追高风险上升 | `RISK` |
| Funding 极高 + 价格滞涨 | 拥挤和衰竭风险 | `RISK` |
| Funding 偏低 + 相对强势 | 低拥挤强势，候选加分 | `BULLISH` |

Funding 只改变风险和质量判断，不能单独决定方向。

## 3. Long / Short Ratio 规则

硬规则：

- 多空比极端只能作为拥挤证据。
- 不能单独决定方向。
- 多空比需要和价格、OI、Funding 同时解释。

解释规则：

| 场景 | 解释 | EvidenceDirection |
| --- | --- | --- |
| 多头比例极高 + Funding 高 + 价格滞涨 | 多头拥挤风险 | `RISK` |
| 空头比例极高 + 结构抗跌 + Funding 中性 | 潜在挤空背景，但不是入场信号 | `NEUTRAL` |
| 多空比正常 + OI 温和上升 | 拥挤风险较低 | `NEUTRAL` |

## 4. Taker Buy/Sell / CVD 规则

硬规则：

- 主动买入增强支持能量增强。
- 价格上涨但主动买入下降，说明上涨质量存疑。
- 价格创新高但主动买入不创新高，支持衰竭风险。
- 无真实逐笔或主动买卖数据时，不得声称拥有真实 CVD。

解释规则：

| 场景 | 解释 | EvidenceDirection |
| --- | --- | --- |
| 突破时主动买入增强 + 收盘强 | 突破质量增强 | `BULLISH` |
| 价格上涨但主动买入下降 | 上涨质量存疑 | `CONFLICT` |
| 价格创新高但主动买入不创新高 | 衰竭风险 | `RISK` |
| 下跌中主动卖出衰减 + 结构守住 | 卖压减弱，等待确认 | `NEUTRAL` |

## 5. Relative Strength 规则

硬规则：

- BTC 横盘时个币走强，加分。
- BTC 下跌时个币抗跌，加分。
- BTC 反弹时个币弱于大盘，降权。
- 相对强度不能替代结构突破。

解释规则：

| 场景 | 解释 | EvidenceDirection |
| --- | --- | --- |
| BTC 横盘，个币放量上行 | 独立强势 | `BULLISH` |
| BTC 下跌，个币守住区间且回调缩量 | 抗跌 | `BULLISH` |
| BTC 反弹，个币不跟涨 | 弱于大盘 | `RISK` 或 `CONFLICT` |
| BTC/ETH 逆风但个币强势 | 降低大盘负面影响，不直接追入 | `BULLISH` + risk note |

## 6. Market Regime 规则

BTC/ETH Macro Weather 只解释大盘环境，不抢山寨主线。

规则：

- 顺风：提高候选解释质量，但不能绕过结构确认。
- 逆风：提高风险门槛，但不能一刀切否定独立强势山寨。
- 震荡：更重视个币独立强弱和结构位。
- 杠杆拥挤：增加 RiskScore，禁止追高。
- 去杠杆：优先防守，等待结构恢复。
- 未知：不参与加权，只显示数据边界。

## 7. 清算数据边界

禁止：

- 不接入清算热力图。
- 不使用 Liquidation Heatmap。
- 不构建清算区模块。
- 不构建 heatmap provider。
- 不把潜在清算区作为目标位、方向依据、止损依据或入场依据。

允许：

- 若已有常规字段 `liquidationUsd24h`，只能作为风险背景或宏观波动提示。
- 常规清算统计不得单独进入方向评分。
- 常规清算统计不得生成目标位。

## 8. 数据新鲜度和缺失规则

数据状态：

- `fresh`：可参与主要证据。
- `partial`：可参与辅助证据，降低 confidence。
- `stale`：只做背景，不生成交易方向。
- `missing`：输出数据不足或等待。

如果核心字段缺失：

- 缺 K 线结构：不能生成结构阶段。
- 缺 OI/Funding：不能判断衍生品质量，只输出数据边界。
- 缺 BTC/ETH：Macro Weather 为 unknown。
- 缺成交量：不能确认突破质量。

## 9. 数据输出格式

所有数据解释器输出 EvidenceItem，不输出交易决策。
report_generator / 报告层只能翻译结构化结果，不能从数据规则直接生成交易判断。

```ts
type DataInterpretation = {
  evidence: EvidenceItem[];
  dataIssues: Array<{
    field: string;
    severity: "info" | "warning" | "blocking";
    message: string;
  }>;
};
```
