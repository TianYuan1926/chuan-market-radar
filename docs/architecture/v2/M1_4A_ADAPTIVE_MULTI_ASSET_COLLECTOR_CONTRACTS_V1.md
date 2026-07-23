# Market Radar V2 M1.4A 自适应多资产采集调度合同 v1

状态：`LOCAL_CONTRACT_AND_FULL_CI_PASS / LIVE_CAPABILITY_DEPENDENT / NO_RUNTIME_EXECUTION_AUTHORITY / PRODUCTION_UNCHANGED`

冻结日期：2026-07-23

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 唯一职责

M1.4A 把 M1.1A 的来源能力矩阵与 M1.1B 的四 Venue 多资产身份结果，转换成一个有界、可审计、失败关闭的采集意图计划。

本包只回答：

```text
在当前 release、source cutoff、身份分母、live capability、
权利、套餐、地区、配额、checkpoint 和背压约束下，
哪些 source-capability-subject-tier 组合可以交给未来 runtime Adapter？
```

本包不访问网络、不调用 Provider、不写数据库、不启动 Worker、不生成 Market Fact、Candidate、Signal、Strategy 或 `TRADE_PLAN_READY`。`READY_FOR_RUNTIME_ADAPTER` 只表示合同前置条件通过，所有意图仍固定：

```text
runtimeExecutionAllowed = false
factAuthorityGranted = false
candidateAuthorityGranted = false
strategyAuthorityGranted = false
readyAuthorityGranted = false
productionChanged = false
```

## 2. 新增范围如何进入同一计划

新增范围不是三个散落的功能开关，而是三个独立且可追踪的分母。

### 2.1 Bitget

- `BITGET_FUTURES` 是第四个正式 Venue source，不是 Binance 数据的别名。
- Bitget 标的必须带自己的 `sourceId`、`venueInstrumentId`、listing epoch、identity epoch 和 capability grant。
- 任何 Bitget capability 未经 exact clean release 的腾讯隔离 live B0 证明时，保持 `CAPABILITY_NOT_LIVE` 或更具体的失败状态。
- Binance、OKX、Bybit 的旧 PASS 不能替代 Bitget PASS。

### 2.2 上新与尚无支持合约的资产

- 新合约、预上线、交易 warm-up、维护、限制和下架进入版本化 lifecycle。
- 只有现货或资产目录出现、但尚无合格合约的对象进入 `ASSET_LISTING_WATCH`。
- Watch 对象只进入 T0 catalog/event 分母，不能伪装成 derivative、Candidate 或深扫对象。
- catalog 缺失、公告文本或 symbol 外观不能单独证明 delisting、资产身份或方向。

### 2.3 股票类合约

- `EQUITY_SINGLE_NAME_PERPETUAL`、`EQUITY_INDEX_ETF_PERPETUAL` 独立于加密资产域。
- `EQUITY_CFD` 与 `OTHER_RWA_DERIVATIVE` 先完整记账，默认不自动 eligible。
- 股票外观 symbol、Bitget `isRwa` 或宽泛的 stock 标签不能静默证明单股、ETF 或指数身份。
- T1 以上必须同时具备有效的交易时段与公司行动 capability；当前 registry 中这些能力仍为 blocked/unavailable，因此股票采集不会被伪造为 runtime-ready。
- 股票与加密不得在 Portfolio Risk 之前共用 Context、Detector、阈值、评级、校准或 Strategy。

## 3. 四级采集分层

| Tier | 分母 | 目的 | 不得发生 |
| --- | --- | --- | --- |
| T0 Catalog/Event | 全部 observed derivative 与 listing watch | 目录、状态、公告、身份和生命周期 | 因没有 Candidate 而被丢弃 |
| T1 Wide Market | exact、eligible、warm-up/established derivative | 低成本全市场基础事实 | 被 T2/T3 抢光基础保留位 |
| T2 Candidate Burst | established P0/P1 Candidate 与 matched control | 盘口、成交、短时流和候选加密采样 | 无对照单边采样 |
| T3 Deep Validation | deep-validation Candidate 与同能力对照 | 衍生品、跨市场和深验上下文 | 用 CoinGlass 或外部数据直接生成结论 |

Candidate 和 matched control 必须是 exact、eligible、established derivative。无对应 Episode、身份域不一致或对照能力未就绪时，计划显式失败，不从分母中消失。

## 4. Live capability 硬门槛

一个意图只有同时满足以下条件，才可得到 `READY_FOR_RUNTIME_ADAPTER`：

1. source-capability-assetDomain 存在于 M1.1A registry，且 disposition 为 `ADOPTED_AS_FACT` 或 `DERIVED_WITH_LINEAGE`。
2. capability grant 绑定同一 `scopeEpoch` 和 exact 40-hex release。
3. evidence class 为 `LIVE_READ_ONLY`，环境为 `TENCENT_ISOLATED_READ_ONLY`。
4. live conformance 为 PASS，证据未过期，且没有 synthetic/stale fallback。
5. 外部人工权利审查完整、仍在有效期内，并有内容摘要。
6. Venue public entitlement 或 CoinGlass Hobbyist entitlement 与来源一致。
7. 当前司法区域可用。
8. 同 source-capability 的 live quota window 当前有效，且没有 401/403、429、source unavailable 或预算耗尽。
9. checkpoint 已到期、没有 active lease、没有 retry backoff 或 open circuit。
10. 全局、逐来源、逐标的 burst 和配额上限仍有空间。

fixture、test harness、官方文档、历史 V1 PASS、旧缓存或失败前数据均不能生成 live-ready 意图。

## 5. CoinGlass Hobbyist

CoinGlass 被视为独立受保护来源：

- entitlement 必须是 `HOBBYIST_CONFIRMED`。
- 权利必须是 `HOBBYIST_PERSONAL_ANALYTICS_ALLOWED`，并绑定外部人工复核证据和有效期。
- 429、套餐缺字段、鉴权失败或 quota 不可验证时显式降级。
- 不允许 stale fallback、跨套餐推断或把 supported-coins 冒充衍生品事实。
- 当前每个意图按一个 request token 做保守上界；真实 endpoint batching profile 由后续 M1.4B 在 live Adapter 证据后冻结。

## 6. 公平、配额与背压

- `maxIntentRows` 限制完整计划体积；超限必须失败，禁止静默截断分母。
- `baselineReservedSlots` 在跨来源轮转前先为 T0/T1 保留容量。
- 剩余容量按固定 fairness cursor 在 source 间轮转。
- `maxReadyIntentsPerSource` 防止单一来源垄断。
- `maxBurstIntentsPerSubject` 防止单一候选吞噬深扫资源。
- quota 在选择意图时原子扣减计划 token；耗尽后继续检查其他来源，不制造全局停摆。
- 未选意图保留为 `BACKPRESSURE_DEFERRED`，不得删除或伪装成功。
- Candidate 的 T2/T3 意图没有同 tier、同 capability 的 ready matched control 时，固定为 `CONTROL_MISSING` 或 `CONTROL_NOT_READY`。

## 7. 内容寻址与 point-in-time

计划必须绑定：

```text
releaseId
generatedAt
sourceCutoff
registryDigest
identitySnapshotHash
subjectInputHash
capabilityGrantSetHash
quotaStateSetHash
checkpointSetHash
policyHash
```

subjects、grants、quota、checkpoint 和 policy 先以稳定顺序形成 digest。任何证据、权利、配额、checkpoint、标的状态或策略变化都会改变计划内容摘要和 plan id。

所有 subject/grant/quota 知识时间不得晚于 source cutoff；future checkpoint history、跨 release grant/quota、重复身份、重复 quota、孤立 control 和摘要篡改全部拒绝。

## 8. 权威实现

```text
src/v2/modules/collector/adaptive-collector-contract.ts
src/v2/modules/collector/adaptive-collector-contract.test.ts
```

定向验证：

```bash
npm run test:v2-m1-adaptive-collector
```

## 9. 当前验收事实

本地 directed contract：

```text
28 pass / 0 fail
```

覆盖四 Venue、400 subject 全量 T0/T1 accounting、Bitget、listing watch、股票前置阻断、CoinGlass Hobbyist、live/test evidence、权利、地区、配额、429、checkpoint、退避、circuit、基础保留位、公平、背压、matched control、输入 lineage、确定性和防篡改。

完整 `ci:production` 已在排除用户未提交 M3.4 草稿、保持正确实施分支身份的独立 Git clone 中通过。

## 10. 后续正确顺序

```text
M1.1B0 Tencent isolated live source conformance
-> 只为实际 PASS 的 capability 签发短期 grant
-> M1.4B endpoint batching + runtime Adapter profiles
-> M1.5C four-venue multi-asset no-authority Shadow
-> M1.6-D1 expanded-scope no-cost capacity/recovery proof
-> domain-separated calibration and cutover
```

P0R 生产恢复仍是独立的生产第一关键路径。M1.4A 本地合同 PASS 不替代 STS、真实备份恢复、fresh P0、live B0、Shadow、容量或生产 authority。
