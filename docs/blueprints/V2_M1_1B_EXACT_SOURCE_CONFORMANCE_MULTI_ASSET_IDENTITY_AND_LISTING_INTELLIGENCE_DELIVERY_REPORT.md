# V2 M1.1B Exact Source Conformance + Multi-Asset Identity + Listing Intelligence 交付报告

状态：`LOCAL_IMPLEMENTATION_PASS / TEST_ONLY_CONFORMANCE_PASS / FULL_CI_PASS / LIVE_B0_NOT_RUN / PUSH_PENDING / PRODUCTION_UNCHANGED`

日期：2026-07-23

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 本包目标

把新增的 Bitget、上新币种和股票类合约放进正确的 V2 数据地基层，而不是继续扩写旧三 Venue 加密模型。实现必须同时满足：

1. 来源是否真的可用由独立 B0 Gate 决定。
2. 资产身份不能靠 symbol、`isRwa` 或模糊产品分组猜测。
3. 上新、维护、限制和下架必须有 point-in-time 生命周期证据。
4. 本包不能越权生成 Fact、Candidate、Signal、Strategy 或 READY。

## 2. 已实现文件

### 精确来源一致性

- `src/v2/modules/source-conformance/source-conformance-contract.ts`
- `src/v2/modules/source-conformance/adapters/exact-source-conformance-runner.ts`
- `src/v2/entrypoints/m1-exact-source-conformance.ts`
- `src/v2/modules/source-conformance/source-conformance-contract.test.ts`

### 多资产身份与上新生命周期

- `src/v2/modules/multi-asset-universe/multi-asset-identity-contract.ts`
- `src/v2/modules/multi-asset-universe/listing-lifecycle-contract.ts`
- `src/v2/modules/multi-asset-universe/adapters/four-venue-multi-asset-catalog.ts`
- `src/v2/modules/multi-asset-universe/adapters/bybit-bitget-listing-announcements.ts`
- `src/v2/modules/multi-asset-universe/multi-asset-universe-contract.test.ts`

### 权威合同与入口

- `docs/architecture/v2/M1_1B_EXACT_SOURCE_CONFORMANCE_MULTI_ASSET_IDENTITY_AND_LISTING_INTELLIGENCE_V1.md`
- `npm run test:v2-m1-source-conformance-multi-asset`
- `npm run v2:m1:source-conformance -- <exact options>`

## 3. B0 精确探针

固定分母：

```text
identity gate probes = 8
listing gate probes = 6
CoinGlass gate probes = 1
total = 15
```

强制边界：

- HTTPS + exact host + GET。
- 无 redirect、12 秒 timeout、每页 8 MiB。
- response 只保存 digest、bytes、schema keys 和计数，不保存 raw。
- CoinGlass key 只用于 `CG-API-KEY`，不进入 artifact。
- fixture fetch 自动降为 `TEST_ONLY / TEST_HARNESS`。
- TEST_ONLY 全部通过也只能 `NOT_EVALUATED_TEST_ONLY`。
- 空必需目录、时钟偏差大于 30 秒、分页不完整、schema drift、401/403、429 和非 2xx 全部 fail closed。
- clean release、full 40-hex commit 和 network environment 必须精确绑定。

## 4. B1 多资产身份

四个 Venue 都有独立 normalizer：

```text
BINANCE_FUTURES
OKX_SWAP
BYBIT_DERIVATIVES
BITGET_FUTURES
```

每条身份绑定：

```text
source + venue instrument + asset domain + mechanism
+ settlement + listing epoch + identity epoch
```

官方 underlying mapping 必须带 source、exact instrument、asset domain、underlying reference、evidence IDs、reviewed time 和 expiry。过期、冲突或同一 instrument 多个有效 mapping 都保持 unresolved。

## 5. 股票与 RWA 防误判

### Binance

只有明确 provider category 或官方 mapping 才分类；股票外观 symbol 不提供身份权威。

### OKX

按官方 `instCategory` 使用 crypto、stocks、commodities、forex、bonds 分类；非股票 RWA 不混入股票域。

### Bybit

按官方 `symbolType=stock/commodity/forex` 分类。`stock` 仍不能区分单股和 ETF，所以先记 broad RWA，再由官方 mapping 细分。

本包在官方复核中根治了一个错误假设：

```text
G9 = fee group
G9 != instrument symbolType
```

### Bitget

```text
isRwa=NO  -> crypto
isRwa=YES -> broad RWA only
```

`isRwa=YES` 不能直接证明股票、ETF、指数、商品或外汇。

## 6. 上新生命周期

已实现：

- provider listing time 与 provisional first-observed epoch。
- provider 缺 listing time 时跨 release 保持同一 provisional epoch。
- 更晚 listing time 触发新 epoch，防止 symbol reuse 污染。
- Bybit/Bitget 官方 announcement normalizer。
- announcement title 只保存 digest，不从标题提取 symbol。
- structured instrument ID 缺失时保持 unlinked。
- 完整目录缺失只记 unresolved，不推断 delisting。
- provider status、delist time 或结构化公告才能形成 delisting 证据。

## 7. 定向验证

当前全新隔离工作区结果：

```text
TypeScript compile = PASS
directed tests = 22
pass = 22
fail = 0
```

覆盖：

- 四 Venue 加密身份。
- 股票 symbol 与 Bitget `isRwa` 防猜测。
- 有效、过期、冲突和多重 official mapping。
- OKX/Bybit 分类边界。
- 四 Venue deterministic snapshot。
- 公告标题不提取 symbol。
- 目录缺失不推断 delisting。
- listing epoch reuse 与 provisional continuity。
- duplicate identity 与 snapshot digest tamper。
- 15 探针完整分母。
- TEST_ONLY authority 隔离。
- Hobbyist key 缺失显式 NOT_RUN。
- 重复 cursor。
- 空必需目录。
- envelope 正常但 adapter row schema 漂移。
- source clock drift。
- entrypoint release binding。
- 重新摘要后的计数和 Gate 权威篡改。

完整 `npm run ci:production` 已在只包含本包写入集、排除冻结 M3.4 草稿的全新隔离快照通过，退出码为 0。覆盖 forbidden-file、secret-pattern、recurrence、production-dispatch、typecheck、lint、Legacy 回归、V2 Foundation 396 项、V2 Ops 115 项、M0 zero-drift、Next production build、Golden 16/16 和 security check。

## 8. 未改变范围

本包没有：

- 部署或修改腾讯生产。
- 修改 PostgreSQL、Redis、任何 Worker、env 或 Feature Flag。
- 执行 migration。
- 读取或保存真实 CoinGlass key。
- 修改旧 V1 eligibility、Fact 或 Collector authority。
- 生成 Candidate、Signal、Strategy、READY 或页面数据。
- 修改或提交冻结的 M3.4 草稿。
- 删除 Legacy。

生产业务、数据和 authority mutation 均为 0。

## 9. 当前完成边界

可以说：

```text
Bitget、股票类合约和上新生命周期已经进入正确的 Scope V2 本地数据合同。
四 Venue 资产身份不会静默按 symbol 或宽泛 RWA 标记误分类。
15 个来源探针已经可执行且测试证据不能伪装成 live。
```

不能说：

```text
四 Venue live B0 已通过。
Bitget 或股票已进入生产扫描。
上新币已能提前发出信号。
CoinGlass Hobbyist 所有能力已验证。
M1.4B runtime Adapter、Shadow、容量或校准已完成。
```

## 10. 下一硬入口

本包提交并推送后，使用 exact clean release 在腾讯隔离环境执行：

```text
V2-M1.1B0-TENCENT-ISOLATED-LIVE-SOURCE-CONFORMANCE
```

M1.4A capability-independent scheduler contract 已独立完成，但没有 runtime authority。只有 `LIVE_READ_ONLY` 的 identity、listing 和 CoinGlass Gate 实际 PASS，相关 capability 才能进入 M1.4B runtime Adapter。失败项保持 unavailable，不允许 stale、mock、其他语义来源或旧 V1 PASS 补位。

生产 P0R 继续作为独立第一关键路径。M3.4 旧范围草稿继续冻结，等待 Scope V2 rebase。
