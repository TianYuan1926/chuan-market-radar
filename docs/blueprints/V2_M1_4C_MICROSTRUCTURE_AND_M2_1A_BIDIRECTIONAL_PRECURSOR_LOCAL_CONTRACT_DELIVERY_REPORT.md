# V2 M1.4C Microstructure and M2.1A Bidirectional Precursor Local Contract Delivery Report

日期：2026-07-26

状态：`LOCAL_CONTRACT_EXITS_PASS / M1.4C_22_OF_22 / M2.1A_13_OF_13 / FULL_CI_PASS / NO_RUNTIME_OR_CANDIDATE_AUTHORITY / PRODUCTION_UNCHANGED`

## 1. 交付目的

把 M0.5 已冻结的市场微观结构、Market Mechanics、分层缓存和双向前兆图谱，从设计文字变成可执行、可回放、可拒绝错误输入的本地合同；同时保持真实采集、Detector、Candidate、Signal、Strategy、READY 和生产权限关闭。

## 2. M1.4C 实现

- `src/v2/modules/microstructure/m1-microstructure-contract.ts`
  - 六类事实：public trade、top of book、order-book snapshot/delta、liquidation、mark/index reference。
  - 每条事实绑定 Scope V2、Venue、instrument、source capability/grant/registry/identity digest、event/received/normalized/persisted/cutoff 时间与质量状态。
  - 缺失、partial、stale、gap、clock drift、乱序、重复、crossed book 和来源越权均 fail closed。
  - `LiquidityWallEpisode` 记录持续、成交、撤销、补单、迁移和失效，静态订单墙不能直接成为支撑/压力事实。
  - 十三项 Market Mechanics Feature 绑定精确分母与源事实；固定美元大单阈值不能成为 Detector authority。
  - ONLINE 与两个独立 REPLAY 必须具有相同语义和内容哈希。
- `src/v2/modules/microstructure/m1-microstructure-cache-contract.ts`
  - L1 process memory、L2 Redis、L3 PostgreSQL、L4 COS 共 12 行 artifact policy。
  - L1/L2 只允许有界、可重建、无权限缓存；L3 是结构化审计真值；L4 是不可变回放与恢复真值。
  - Cache key 绑定 scope/source/Venue/instrument/artifact/schema/feature/window/cutoff。
  - missing 不得变 0，stale 不得变 fresh，当前 `decisionUsable` 永远为 false。

## 3. M2.1A 实现

- `src/v2/research/m2-precursor-atlas-contract.ts`
  - 八族：Compression Energy、Quiet Accumulation/Distribution、Flow-Price Divergence/Absorption、Position Build/Unwind、Liquidity Shift、Relative/Sector Propagation、Failed Auction/Trap、Event/Listing Transition。
  - 每族分别登记 LONG、SHORT、UNKNOWN，合计 24 个 DRAFT/UNCALIBRATED 假设；LONG/SHORT 不能用同一 Feature 的符号翻转冒充两种机制。
  - Outcome 固定为 `UP_EXPANSION`、`DOWN_EXPANSION`、`NO_EXPANSION`。
  - 板块 taxonomy、membership、leader/laggard 关系必须 point-in-time；未来成员和事后关系禁止进入研究。
  - 每个 family-direction 独立要求四 Venue、至少三个 regime、至少三个 liquidity segment，并要求 matched control、三 Outcome、消融、sealed untouched holdout、forward Shadow、rights 与独立审计。
  - 历史 L2 不足时只能 forward-only；理论 Gate 即使通过也只能进入 replay validation，不能发 Candidate。

## 4. 验证结果

定向测试：

```text
M1.4C Microstructure + Cache: 22 pass / 0 fail
M2.1A Precursor Atlas:        13 pass / 0 fail
```

正式实施工作树完整 `ci:production`：

- Forbidden tracked files：PASS。
- Secret patterns：PASS。
- Recurrence root-cause gate：9/9。
- Production dispatch：21/21。
- TypeScript：PASS。
- ESLint：PASS。
- Legacy market compatibility：PASS。
- V2 Foundation：529 total / 523 pass / 6 explicit skip / 0 fail。
- V2 Ops：131/131。
- M0 engineering exit：PASS。
- Next production build：PASS。
- Golden cases：16/16。
- Security check：PASS。

既存 M3.4-R1 test-only 草稿的 import、strict enum 和 runtime fixture 编译阻断也已根治。该修复只恢复全仓兼容；M3.4-R1 自身定向测试仍为 0，不能计作 M3.4 出口。

## 5. 权限与生产边界

本包未：

- 请求 Provider、采集真实 Trade/Book/Liquidation 数据或写入生产。
- 修改生产服务、数据库、Redis、Worker、env、Feature Flag、页面或 Legacy。
- 生成真实 Detector、Candidate、Signal Grade、Strategy、Risk、READY 或交易指令。
- 声称前兆有效、概率、precision、recall、lead time、盈利能力或实战就绪。
- 修改 P0R、M1.4B 腾讯证据、GitHub main 或生产身份。

生产服务、数据和业务 authority 变更均为 0。

## 6. 未完成与下一入口

- M1.5D 真实微观结构 forward capture 尚未执行。
- 四 Venue Trade/Book coverage、gap、latency、matched-control parity、资源成本和宿主恢复尚未形成。
- 真实三 Outcome cohort、untouched holdout、跨 Venue/regime/liquidity 校准和独立审计均为 0。
- M2.3/M2.4、真实 M3.1A-M3.3D、M3.4-R1-M3.6、M4/M5 仍受上游 Gate 阻断。

下一 Scope V2 真实证据包为：

```text
M1.5C Four-Venue Multi-Asset Shadow
+ M1.5D Adaptive Microstructure Forward Shadow
same exact release / independent evidence and acceptance
-> M1.6-D1 Expanded-Scope No-Cost Capacity
-> M2.4A real cohort and sealed holdout
```

P0R 生产恢复仍是独立第一关键路径。本报告不改变 `R1 / 可运行但不完整 / 不能支撑实战` 的结论。
