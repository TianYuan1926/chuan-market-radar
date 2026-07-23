# V2 M1.4B 端点批处理、Runtime Adapter 与上新历史本地交付报告

日期：2026-07-24

状态：`LOCAL_ENGINEERING_AND_DIRECTED_REGRESSION_PASS / FULL_CI_PENDING / LIVE_NO_AUTHORITY_RUNTIME_UNPROVEN / PRODUCTION_UNCHANGED`

## 1. 本包完成什么

本包完成 M1.4B 的本地核心实现：

- 从 exact live conformance artifact 生成内容寻址 Runtime Adapter Profile。
- 将 M1.4A 的逐标的 ready intent 合并为 source-capability endpoint batch。
- 分离 snapshot batching 与 listing-history checkpoint 两类请求预算。
- 建立 Bybit provider-available history 与 Bitget 官方一个月窗口的 bootstrap、resume、gap、incremental 状态机。
- 将 Bitget Venue、Listing Lifecycle 和 Equity Asset Domain 作为独立且可重叠的验收轴。
- 明确阻断 R3 已探测通过但 registry 仍未采纳的 Binance spot route。

权威合同：

```text
docs/architecture/v2/M1_4B_ENDPOINT_BATCHING_RUNTIME_ADAPTER_AND_LISTING_HISTORY_V1.md
```

## 2. 真实状态

```text
R3 live-conformant endpoint profiles = 15
current scheduler-route-eligible profiles = 14
registry-blocked profile = BINANCE_SPOT_CATALOG
WebSocket runtime profiles = 0
runtime execution = false
Fact/Candidate/Strategy/READY authority = false
production mutation = false
```

R3 的 15/15 只证明精确 endpoint conformance。Binance spot registry row 仍为 `UNAVAILABLE`，所以本包不允许它进入 batch 或 no-authority Shadow。

## 3. 新增范围没有混账

- Bitget：独立 Venue 轴，其他 Venue 不能借 PASS。
- 上新：spot catalog、announcement、history window、checkpoint 和 gap 独立核算；事件不产生方向。
- 股票：当前只进入 catalog accounting，tradable Fact batch 为 0；session、公司行动、FX 和 basis 继续 blocked。
- 数据最大化：只开放经过 registry、权利、live conformance、Adapter、Shadow、质量和容量门禁的 capability。

## 4. 验证

```text
M1.1B regression: 26/26 PASS
M1.4A regression: 28/28 PASS
M1.4B directed: 23/23 PASS
ESLint: PASS
full ci:production: PENDING
```

覆盖：

- test-only 零 runtime Profile。
- live capability 失败后 Profile absent。
- 400 intent 精确一次核算与四 endpoint batch。
- snapshot 与 listing-history 两本预算。
- Bitget/Listing/Equity 三轴独立断言。
- Bybit bootstrap、分段续跑、增量重叠和完整历史边界。
- Bitget cursor 与一个月窗口边界。
- token/ordinal/segment 上限、内容冲突、future knowledge 和 checkpoint 防篡改。

## 5. 生产影响

```text
production services: unchanged
production database: unchanged
Redis and workers: unchanged
env and feature flags: unchanged
production repository: unchanged
runtime authority: unchanged
```

## 6. 尚未完成

- 完整 `ci:production` 最终出口。
- exact commit 和 GitHub 实施分支推送。
- 腾讯隔离 no-authority runtime 执行。
- 真实 Bybit history bootstrap 和 Bitget one-month checkpoint 持久证据。
- 请求率、配额、断线恢复和完整分母现场证明。
- Binance spot registry 修订及绑定新 digest 的 live conformance。
- M1.5C 四 Venue 多资产 Shadow 和 M1.6-D1 扩展容量。

因此本包不能称为 M1.4B 完整完成，也不能支撑生产 Fact、Candidate 或交易计划。

## 7. 下一入口

本地出口：

```text
final ci:production -> commit -> push
```

Scope V2 现场出口：

```text
M1.4B Tencent isolated no-authority runtime
-> listing bootstrap/checkpoint evidence
-> M1.5C
```

独立生产第一关键路径保持：

```text
P0R fresh exact-plan 7200-second STS
-> encrypted backup
-> exact version retrieval
-> isolated PostgreSQL 16 restore
-> cleanup
```
