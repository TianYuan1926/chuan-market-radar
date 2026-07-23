# V2 M1.1A Four-Venue Source Capability Registry 交付报告

状态：`LOCAL_CONTRACT_PASS / OFFICIAL_DOCUMENTS_REVIEWED / FULL_CI_PASS / PUSH_PENDING / PRODUCTION_UNCHANGED`

日期：2026-07-23

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 本包目标

把 Bitget、上新/预上新、股票永续和可用外部数据正确纳入 V2 搭建计划，并建立四 Venue + CoinGlass 的穷举来源能力合同，防止后续 Adapter、Collector、Detector 和页面各自维护一份互相冲突的来源认知。

## 2. 已实现

新增：

- `src/v2/modules/source-capability/source-capability-contract.ts`
- `src/v2/modules/source-capability/adapters/four-venue-capability-registry.ts`
- `src/v2/modules/source-capability/source-capability-contract.test.ts`
- `docs/architecture/v2/M1_1A_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY_V1.md`

机器登记表固定：

```text
venue denominator = 4
source denominator = 5
capability denominator = 33
expected rows = 165
observed rows = 165
missing/duplicate rows = 0
official documented rows = 110
unavailable or unlicensed rows = 57
scope-v1 historical runtime pass rows = 6
scope-v2 runtime pass rows = 0
registry digest = sha256:45832cf889c92153a29d511582c386a9089d1eeb904a3e8ecdee5772904dfd94
```

每行完整表达 endpoint/channel、语义、鉴权/套餐、限速、分页、历史范围、推送、point-in-time/replay 适用性、权利、实现、运行证据、成本、失败和 no-stale fallback。

## 3. 新增范围如何进入计划

### Bitget

Bitget 已进入 `SCOPE_EPOCH_V2_MULTI_ASSET_4V` 的第一方 Venue 分母。contract config、spot catalog、announcement、ticker、mark/index、三类 Kline、trade、depth、OI、funding、long-short、risk/fee 和 Stock Perps 均进入登记表；Adapter 与 live probe 仍为未实现。

### 上新币种

上新不再是 symbol 列表附加项。Bybit/Bitget announcement、四 Venue contract/spot catalog 与可用 instrument stream 都进入 T0；只有资产/现货上新而无合约时固定为 `ASSET_LISTING_WATCH`，不进入合约 eligible 或交易计划。

### 股票合约

四家 Venue 均有官方股票/TradFi 永续产品证明。股票类进入两个独立资产域：

- `EQUITY_SINGLE_NAME_PERPETUAL`
- `EQUITY_INDEX_ETF_PERPETUAL`

传统市场 session、公司行动、FX、reference/index、休市 basis 和执行成本仍是独立硬门，不与加密资产共享校准。

### CoinGlass Hobbyist

用户已确认套餐为 Hobbyist，但套餐名称不等于逐 endpoint 权限。除官方页面明确支持项外，全部保持 `PLAN_ENTITLEMENT_UNVERIFIED`；Liquidation WebSocket 和 News 按官方页面拒绝为 Hobbyist-unlicensed。密钥未进入代码、文档、测试或 artifact。

## 4. 蓝图动态修正

M0.4 中 Binance 股票域的 `UNVERIFIED_UNAVAILABLE` 结论已被 2026-07-23 官方资料推翻。当前正确结论是：

```text
official stock perpetual product documented
scope-v2 identity mapping not implemented
scope-v2 adapter not implemented
live capability probe not run
jurisdiction availability unverified
```

同步更新：

- V2 唯一蓝图 v1.26。
- 机器追踪矩阵 v1.30。
- M0.4 扩展范围合同。
- 正确搭建顺序。
- 权威目录。
- 项目上下文。
- 最近变更日志。

## 5. 验证

定向合同测试：

```text
tests = 8
pass = 8
fail = 0
```

覆盖：

- 165 行完整笛卡尔积。
- 稳定摘要与不可变 artifact。
- 官方产品能力和 Adapter/live 状态分层。
- Bitget 与上新路径。
- CoinGlass Hobbyist 套餐拒绝/未知边界。
- 每行限速、历史、失败和 fallback 完整性。
- 截断、摘要篡改和越权 fail closed。
- 零 Fact/Candidate/READY authority。

完整 `npm run ci:production` 在只包含本包写入集的真实分支隔离快照执行并通过。当前主工作区未提交 M3.4 草稿没有进入测试快照，也没有被修改或伪装成 M1.1A 内容。

## 6. 未改变范围

本包没有：

- 发起任何市场数据或生产网络请求。
- 使用或修改 CoinGlass API key。
- 修改生产服务、数据库、Redis、Worker、env 或 Feature Flag。
- 执行 migration、发布或腾讯服务器操作。
- 实现 Bitget、股票或 listing Adapter。
- 发 Market Fact、Candidate、Signal、Strategy 或 READY。
- 修改或提交冻结的 M3.4 草稿。

生产业务与数据 mutation 均为 0。

## 7. 当前完成边界

```text
LOCAL_CONTRACT_PASS
OFFICIAL_DOCUMENTS_REVIEWED
SCOPE_V2_ADAPTERS_UNPROVEN
SCOPE_V2_LIVE_PROBES_UNPROVEN
PRODUCTION_UNCHANGED
```

不能把本包称为“四 Venue 已接入”或“股票合约已能扫描”。

## 8. 下一本地超级包

```text
V2-M1.1B
  B0 Exact Source Conformance
  -> B1 Multi-Asset Identity + Listing Intelligence
```

B0/B1 合并施工和完整 CI，提高效率；但保持两个独立 Gate。B0 必须真实验证四 Venue 与 CoinGlass Hobbyist 的 schema、套餐、时钟、分页、限速和失败；B1 才能实现 Bitget、股票/RWA/CFD identity、listing epoch、symbol reuse 和公告/catalog/stream reconciliation。

生产 P0R 仍是独立第一关键路径；M3.4 旧范围草稿继续冻结，等待 scope rebase。
