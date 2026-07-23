# V2 M1.4A 自适应多资产采集合同交付报告

日期：2026-07-23

状态：`LOCAL_CONTRACT_AND_FULL_CI_PASS / PRODUCTION_UNCHANGED`

## 1. 本包完成什么

本包把 Bitget、上新生命周期、无合约资产 watch、股票类合约和 CoinGlass Hobbyist 正确接入同一个 Scope V2 采集调度合同，同时保持各自身份域、数据权利、配额和运行证据完全分离。

权威实现：

- `src/v2/modules/collector/adaptive-collector-contract.ts`
- `src/v2/modules/collector/adaptive-collector-contract.test.ts`
- `docs/architecture/v2/M1_4A_ADAPTIVE_MULTI_ASSET_COLLECTOR_CONTRACTS_V1.md`

## 2. 已实现门禁

- T0/T1 完整分母、T2/T3 Candidate 与 matched-control 深扫分层。
- 四 Venue source identity，不允许跨 Venue 借用 PASS。
- listing watch 只进入 T0，不得产生 derivative/Candidate 语义。
- 股票类合约必须具备 exact asset identity；T1 以上缺 session/corporate-action capability 时失败关闭。
- live/test evidence、外部人工 rights review、entitlement、jurisdiction、quota、429/auth/source failure 和 checkpoint 均显式。
- baseline reserve、source fairness、per-source/per-subject 上限、bounded quota 和 backpressure。
- candidate/control 必须是 exact eligible established derivative。
- subjects、grant、quota、checkpoint 和 policy 五组输入均进入内容寻址 lineage。
- runtime、Fact、Candidate、Strategy、READY 和 production authority 全部固定为 false。

## 3. 反自欺边界

以下事实没有被标记完成：

- 腾讯隔离 live B0 未执行。
- Bitget、股票、listing、CoinGlass 的生产可用性未证明。
- 当前股票 session/corporate-action registry capability 仍 blocked/unavailable。
- 没有网络调用、Provider 数据、数据库写入、Worker、Shadow 或生产发布。
- 每意图一个 token 是保守预算上界，不是已证明的 endpoint batching 效率。
- P0R 的 STS、真实加密备份、精确取回、隔离恢复和 fresh P0 仍待执行。

## 4. 当前验证

```text
direct TypeScript compile: PASS
directed contract tests: 28/28 PASS
ESLint for new implementation: PASS
400-subject four-venue bounded accounting: PASS
full ci:production in independent Git clone: PASS
V2 Foundation: 424 total / 418 pass / 6 explicit external skips / 0 fail
V2 Ops: 115/115 PASS
M0 engineering exit: PASS
Next production build: PASS
Golden audit: 16/16 PASS
Security check: PASS
```

这些结果证明本地合同与工程回归，不证明 live capability、生产数据、Shadow、容量或业务 authority。exact commit 推送后仍须单独核对 GitHub remote identity。

## 5. 生产影响

```text
production services: unchanged
production database: unchanged
Redis: unchanged
workers: unchanged
env and feature flags: unchanged
runtime authority: unchanged
```

## 6. 下一入口

证据线：

```text
M1.1B0 Tencent isolated LIVE_READ_ONLY source conformance
```

并行本地线：

```text
M1.4B endpoint batching and runtime Adapter profiles
```

生产第一关键路径：

```text
P0R exact-plan STS -> encrypted backup -> exact retrieval
-> isolated PostgreSQL 16 restore -> cleanup -> fresh P0
```
