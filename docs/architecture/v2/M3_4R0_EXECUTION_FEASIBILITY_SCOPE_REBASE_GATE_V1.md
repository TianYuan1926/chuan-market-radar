# Market Radar V2 M3.4-R0 执行可行性 Scope Rebase Gate v1

状态：`LOCAL_GOVERNANCE_CONTRACT_PASS / SCOPE_V2_PREREQUISITES_NOT_SATISFIED / M3.4_IMPLEMENTATION_BLOCKED / NO_FEASIBILITY_SIGNAL_STRATEGY_OR_READY_AUTHORITY / PRODUCTION_UNCHANGED`

冻结日期：2026-07-24

## 1. 唯一目标

本包不实现 Execution Feasibility，也不修补当前未提交的 M3.4 草稿。它只建立一条机器硬门禁：

```text
任何 M3.4 实现切片
-> 必须绑定 SCOPE_EPOCH_V2_MULTI_ASSET_4V
-> 必须绑定 exact Venue + assetDomain + listing lifecycle
-> 必须逐项提供不可变证据
-> 缺一项即 BLOCKED_SCOPE_REBASE
```

门禁永远只有治理权限，不能生成 Feasibility Snapshot、Signal、Strategy、交易计划或 `TRADE_PLAN_READY`。

## 2. 旧草稿审计真值

当前主工作区存在四个已修改文件和两个未跟踪 M3.4 文件。它们保持用户原样，未被本包修改、暂存或提交。

只读审计结果：

| 检查 | 当前结果 | 结论 |
| --- | --- | --- |
| TypeScript typecheck | FAIL，3 个错误 | 草稿当前不能进入可编译主线 |
| ESLint | 0 error / 1 warning | 仍有未使用 import |
| M3.4 定向测试 | 0 | 没有可审计的行为覆盖 |
| scopeEpoch | 缺失 | 仍属于旧三 Venue 范围 |
| Bitget | 旧 `TARGET_VENUES` 不含 Bitget | 无法形成第四 Venue 绑定 |
| assetDomain | 缺失 | 加密、单股、指数/ETF 无法隔离 |
| listing lifecycle | 缺失 | watch、pre-launch、warm-up 和 established 无法区分 |
| 股票执行事实 | 缺 session、underlying reference、公司行动、FX、休市 basis | 不能支撑股票执行可行性 |
| 阈值与校准 | 单套 test-only 固定阈值 | 不能跨 Venue、资产域或 warm-up 复用 |

三个 typecheck 错误分别是：

1. 引用了不存在的 `MarketContextSnapshotSchema` export。
2. required check id 的字符串推断与严格 union 不兼容。
3. 旧 runtime schema 测试 fixture 与新的 check id union 冲突。

这些错误不能通过局部类型断言掩盖，因为范围合同本身仍不成立。

## 3. 可提取与必须重写

可在后续独立数学审计和测试通过后提取：

- BigInt 定点十进制运算。
- 保守 entry、spread、adverse drift 和成本后 RR 的计算方向。
- PASS/FAIL/UNAVAILABLE fail-closed 语义。
- point-in-time、venue status、spread、depth、slippage、fee、funding、fillability、price drift、gap、stop sweep、liquidity、net RR 的检查分类。

必须在 Scope V2 输入完成后重写：

- `ExecutionFeasibilitySnapshot` 领域合同和 runtime schema。
- Venue、assetDomain、scopeEpoch、listing epoch/lifecycle 绑定。
- 加密、股票单股、股票指数/ETF 的分域成本和阈值。
- warm-up 与成熟合约的独立校准。
- 股票 session、公司行动、FX、underlying reference 和休市 basis。
- exact Fact/Evidence lineage、authority 和 runtime wiring。
- Final Decision 组合与 READY 门禁。

旧草稿不能作为新代码底座直接修补，也不能通过改名获得 Scope V2 效力。

## 4. 四条新增责任轴

门禁固定保留四条独立验收轴：

```text
BITGET_VENUE
LISTING_LIFECYCLE
EQUITY_ASSET_DOMAIN
DATA_MAXIMIZATION
```

它们不能互相借 PASS：

- Bitget proof 必须绑定 `BITGET_FUTURES`，不能借 Binance/OKX/Bybit 证据。
- Listing proof 必须证明当前 lifecycle；上新事件本身不生成方向。
- Equity proof 必须具有股票独立事实，不能借加密成本或阈值。
- Data Maximization proof 必须证明输入是 point-in-time、带 lineage、权利与容量合格的数据，不是“请求过很多 endpoint”。

## 5. 通用前置证据

任何 Venue 和资产域都必须逐项 PASS：

```text
VENUE_CAPABILITY_AND_IDENTITY
LISTING_LIFECYCLE
RUNTIME_ADAPTER
MULTI_ASSET_SHADOW
EXPANDED_SCOPE_CAPACITY
POINT_IN_TIME_FACTS
DATA_MAXIMIZATION_LINEAGE
DOMAIN_DETECTOR_COHORT
DOMAIN_UNTOUCHED_HOLDOUT
DOMAIN_ANALYSIS
DOMAIN_QUALIFICATION
DOMAIN_STRATEGY
JURISDICTION_AVAILABILITY
EXECUTION_COST_MODEL
```

每项 proof 必须绑定同一个：

```text
scopeEpoch
venue
assetDomain
lifecycleState
releaseId
evidenceId
sha256 digest
```

`PASS` 没有不可变 evidence reference 时 schema 直接拒绝。proof、input 和 evidence reference 的 release 必须一致；缺项、重复、跨 lifecycle/release 错绑、BLOCKED 或 UNAVAILABLE 均 fail closed。

## 6. 分域前置证据

### 6.1 加密线性永续

额外要求：

```text
MARK_INDEX_REFERENCE
FUNDING_FEE_SCHEDULE
DEPTH_SLIPPAGE
```

### 6.2 股票单一标的和指数/ETF 永续

额外要求：

```text
TRADITIONAL_MARKET_SESSION
UNDERLYING_REFERENCE
CORPORATE_ACTION
FX_REFERENCE
CLOSED_SESSION_BASIS
CONTRACT_SPECIFICATIONS
FUNDING_FEE_SLIPPAGE
```

单股和指数/ETF 使用相同门禁字段，但后续必须分别提供 cohort、holdout、校准和成本证据，不能合成一个总 PASS。

### 6.3 永久阻断域

当前 gate 不允许以下域进入 M3.4：

```text
EQUITY_CFD
OTHER_RWA_DERIVATIVE
ASSET_LISTING_WATCH
CROSS_MARKET_CONTEXT
```

它们可以继续 accounting、观察和研究，不能生成执行可行性或交易计划。

## 7. 上市生命周期

- `ESTABLISHED`：仍须通过全部通用和分域证据。
- `TRADING_WARMUP`：额外要求 `LISTING_WARMUP_EXECUTION_CALIBRATION`。
- `PRE_LAUNCH_OR_PREOPEN`、维护、限制、暂停、下架、离线和 unresolved：无论其他 proof 是否存在，均阻断执行切片。
- 仅上新 watch 的资产永远不能进入本 gate。

## 8. 正确施工顺序

```text
M1.4B Tencent no-authority runtime + real listing checkpoint
-> M1.5C four-Venue multi-asset Shadow
-> M1.6-D1 expanded no-cost capacity proof
-> M2.3 listing/equity event detectors
-> M2.4 domain-sealed cohort + untouched holdout
-> M3.1A-M3.3A multi-asset Analysis/Qualification/Strategy
-> M3.4-R1 domain-separated Execution Feasibility
-> M3.5 Personal/Portfolio Risk
-> M3.6 Trigger + Runtime Gate + Final Decision composition
```

P0R 继续作为独立生产第一关键路径。M3.4-R0 的本地 PASS 不允许跨过上述顺序。

## 9. 完成边界

本包可以声明：

```text
Scope V2 M3.4 前置条件已机器化。
Bitget、Listing、Equity 和 Data Maximization 四轴不会再被混成一个 PASS。
旧 M3.4 草稿已完成只读审计并继续隔离。
```

本包不能声明：

```text
M3.4 已完成。
执行成本已校准。
股票或上新标的具备交易方案。
任何 Venue/资产域具备 Feasibility、Signal、Strategy 或 READY authority。
生产已改变。
```
