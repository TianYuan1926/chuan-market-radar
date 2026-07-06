# Market Regime

生成日期：2026-07-06

## 1. 定位

Market Regime 是市场背景识别模块，只回答当前市场环境倾向。

它不生成交易计划，不生成入场、止损、目标，不提升信号成熟度，不修改扫描排序。

## 2. 状态类型

当前支持：

```text
TREND_UP
TREND_DOWN
RANGE
HIGH_VOLATILITY
LOW_LIQUIDITY
RISK_OFF
ALT_ROTATION
UNKNOWN
```

## 3. 数据状态

输出必须带数据状态：

```text
READY
PARTIAL
UNKNOWN
```

缺少 K 线或 K 线数量不足时：

- `primary=UNKNOWN`
- `dataStatus=UNKNOWN` 或 `PARTIAL`
- 必须写明数据不足
- 不能包装成“市场无机会”

## 4. 判断边界

当前模块使用有限输入做最小识别：

- K 线涨跌幅和区间宽度判断趋势、震荡、高波动。
- 山寨广度偏弱叠加下跌背景判断 `RISK_OFF`。
- 山寨广度、成交变化和 BTC.D 回落判断 `ALT_ROTATION`。
- 流动性评分过低判断 `LOW_LIQUIDITY`。

这些只作为 context，不直接影响 READY。

## 5. 硬保护字段

所有 Market Regime 输出固定：

```text
allowedUse = market_context_only
canCreateTradePlan = false
canMutateLiveRanking = false
```

这表示：

- 不能从大盘状态生成个币交易计划。
- 不能因为 `ALT_ROTATION` 放宽 RR。
- 不能因为 `TREND_UP` 把 WAIT 升级 READY。
- 不能因为 `RISK_OFF` 把缺数据写成没有机会。

## 6. 当前代码入口

- `src/lib/market-regime/market-regime.ts`
- `src/lib/market-regime/market-regime.test.ts`

## 7. 本轮验证

本轮新增 5 条 market regime 定向测试，覆盖：

- 数据不足输出 `UNKNOWN/PARTIAL`。
- 趋势上涨识别 `TREND_UP`。
- 下跌加山寨广度偏弱识别 `RISK_OFF`。
- 山寨广度、成交和 BTC.D 背景识别 `ALT_ROTATION`。
- 低流动性识别 `LOW_LIQUIDITY`，但不授予 READY 或排序权限。
