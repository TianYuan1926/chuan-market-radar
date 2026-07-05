# Market Radar 信息架构分层规则

本文是前端信息架构的执行说明。它不改变扫描、分析、策略算法，只规定“页面如何展示后端结论”。

## 1. 四层结构

全站核心展示必须遵循：

```text
L1：决策层
L2：解释层
L3：证据层
L4：技术层
```

## 2. L1 决策层

只允许四个值：

```text
TRADE
WAIT
BLOCKED
OBSERVE
```

规则：

- `TRADE` 只用于后端确认交易计划就绪。
- `WAIT` 表示等待触发、回踩、反抽、确认或数据补齐。
- `BLOCKED` 表示风控、位置、结构、数据质量或追涨追空风险拦截。
- `OBSERVE` 表示只观察、筛选或复盘背景。

L1 不写解释，不写指标，不写证据。

## 3. L2 解释层

要求：

- 只写中文。
- 不超过 3 行。
- 解释为什么是当前决策。
- 不出现技术指标、内部枚举、英文代码词。

禁止：

- `RSI / EMA / MACD / ATR / Z-score`
- `OI / OFI / Funding / Whale / Volume / Price`
- `RR / CVD / MFE / MAE`
- `WAIT_PULLBACK / EVIDENCE_SIGNAL / TRADE_PLAN_READY`

## 4. L3 证据层

固定六个键：

```text
OFI / OI / Funding / Whale / Volume / Price
```

规则：

- 只放结构化值。
- 不写中文解释。
- 不做情绪判断。
- 缺失时写 `n/a`。

## 5. L4 技术层

可包含：

```text
RSI / EMA / MACD / Z-score / ATR / 模型评分 / 结构盈亏比 / 风险等级
```

规则：

- 默认折叠。
- 不能影响 L1。
- 不能覆盖后端策略层。

## 6. 系统守卫

事实源：

- `src/lib/ui-schema-guard.ts`
- `src/lib/api/ui-schema-guard.test.ts`
- `src/components/ui-information-layers.tsx`

守卫会阻断：

- L1 不是四个固定决策词。
- L2 混入英文、指标或内部枚举。
- L3 缺少固定证据键。
- L3 用中文解释冒充结构化证据。
- L4 未折叠。

## 7. 当前接入位置

已接入：

- 候选成熟度池
- 异动候选展开区
- 单币档案顶部决策摘要
- 雷达总控内部字段中文化

后续所有新增核心展示都必须使用同一分层规则。
