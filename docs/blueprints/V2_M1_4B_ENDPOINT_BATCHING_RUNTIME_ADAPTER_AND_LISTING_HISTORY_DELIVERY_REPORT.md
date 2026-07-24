# V2 M1.4B 端点批处理、Runtime Adapter 与上新历史派发包交付报告

日期：2026-07-24

状态：`LOCAL_ENGINEERING_AND_EXACT_DISPATCH_PACKAGE_FULL_CI_PASS / TENCENT_BOOTSTRAP_AND_CHECKPOINT_BOUND_RESUME_PASS / NO_RUNTIME_AUTHORITY / PRODUCTION_APPLICATION_UNCHANGED`

## 1. 本包完成什么

本包完成 M1.4B 的本地核心与精确现场派发工程：

- 从 exact live conformance artifact 生成内容寻址 Runtime Adapter Profile。
- 将 M1.4A 的逐标的 ready intent 合并为 source-capability endpoint batch。
- 分离 snapshot batching 与 listing-history checkpoint 两类请求预算。
- 建立 Bybit provider-available history 与 Bitget 官方一个月窗口的 bootstrap、resume、gap、incremental 状态机。
- 将 Bitget Venue、Listing Lifecycle、Equity Asset Domain 和 Data Maximization 作为独立且可重叠的验收轴。
- 明确阻断 R3 已探测通过但 registry 仍未采纳的 Binance spot route。
- 新增无 secret 固定 Bundle、Runner 与 Entrypoint，只执行 14 个 route-eligible Profile，并绑定 R3 artifact、源提交、生产 HEAD、容器、listener、timer 和 health。
- 新增包级 dispatch 跨层预检，在上传前精确比对 approval request、dispatch envelope 与 bundle；错误 source ref、commit、hash、entrypoint、staging 或运行时限均本地失败关闭。
- blocked segment 不晋级 checkpoint；续跑 checkpoint 必须绑定原精确 `PASS` result 与文件 SHA-256。

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
fixed dispatch package = local PASS
Tencent bootstrap dispatch = PASS
Tencent checkpoint-bound resume dispatch = PASS
Fact/Candidate/Strategy/READY authority = false
production application mutation = false
```

R3 的 15/15 证明精确 endpoint conformance；两次 M1.4B 现场运行证明当前 14 条
route-eligible Profile 可在绑定 release 下执行。Binance spot registry row 仍为
`UNAVAILABLE`，所以它继续保持 registry-blocked 和零请求，不能进入 batch 或
no-authority Shadow。

### 2.1 成功前的拒绝记录

```text
m1-4b-runtime-live-20260723t230536z
signed dispatch commit = dc472c3550dc132b99b4288af7f7c9bae83caa58
status = BLOCKED_PRE_LAUNCH
reason = dispatch_source_ref_not_allowed

m1-4b-runtime-live-20260723t231943z
signed dispatch commit = b741f6adc9b3e6afed8e30e6099fa057dcc9738a
status = BLOCKED_PACKAGE_BINDING_VALIDATION
reason = runtime_dispatch_binding_invalid
detail = outer runtime 5400 exceeded package maximum 1860
```

两次拒绝都发生在业务网络运行前，生产应用、数据库、Redis、Worker 和 authority
均未改变。最终成功不覆盖这两个失败事实；新增跨层预检把同类错误提前到本地。

## 3. 新增范围没有混账

- Bitget：独立 Venue 轴，其他 Venue 不能借 PASS。
- 上新：spot catalog、announcement、history window、checkpoint 和 gap 独立核算；事件不产生方向。
- 股票：当前只进入 catalog accounting，tradable Fact batch 为 0；session、公司行动、FX 和 basis 继续 blocked。
- 数据最大化：只开放经过 registry、权利、live conformance、Adapter、Shadow、质量和容量门禁的 capability。

## 4. 验证

```text
M1.1B regression: 26/26 PASS
M1.4A regression: 28/28 PASS
M1.4B core directed: 23/23 PASS
M1.4B Tencent fixed-dispatch package: 9/9 PASS
M1.4B dispatch cross-layer preflight: PASS
M1.4B Tencent bootstrap: 14/14 PASS / 0 failed / 1 registry blocked
M1.4B Tencent checkpoint-bound resume: 14/14 PASS / 0 failed / 1 registry blocked
V2 Foundation: 488 PASS / 6 explicit skip / 494 total
V2 Ops: 131/131 PASS
M0 machine exit: 11/11 PASS
Next production build: PASS
Golden cases: 16/16 PASS
Security check: PASS
full ci:production: PASS
```

覆盖：

- test-only 零 runtime Profile。
- live capability 失败后 Profile absent。
- 400 intent 精确一次核算与四 endpoint batch。
- snapshot 与 listing-history 两本预算。
- Bitget/Listing/Equity/Data Maximization 四轴独立断言。
- Bybit bootstrap、分段续跑、增量重叠和完整历史边界。
- Bitget cursor 与一个月窗口边界。
- token/ordinal/segment 上限、内容冲突、future knowledge 和 checkpoint 防篡改。
- 14/14 route 执行、blocked Binance spot 零请求、同源并发 1 和跨来源并行。
- Bundle 无 secret、额外 payload 拒绝、staging 精确清理和生产身份前后不变。
- request/envelope/bundle 跨层预检明确拒绝 5400 秒外层窗口和错误 source ref，避免到目标机才发现包级绑定错误。
- blocked segment 零 checkpoint 晋级；续跑只接受绑定精确 `PASS` result 的 checkpoint。

现场证据：

```text
source commit = 3c21a75009aeb4f4f7d9fd8954245238c38d9636
source tree = 26852907b4e53be1b339f80302ccbb1d2bcd2323
production HEAD = cec0b6572bb09ae91ff9e013f8bb160f73c045e2
container set sha256 = b7ace09c4f97b505e8ab308fcbe9b6ca669331ab50add97a8433b66e5363079b
listener sha256 = b6461e8061e91d27c4d62447c3b93e077685003b85188d6c203c20e896ee759c
transport bundle sha256 = 7313196e29704df4ae72fc282a495a07e2dc60b7f2f5d60d79e517c15efab38e
artifact manifest sha256 = 3240a0eec10015c9514b49fc94048fa329ebd970f7d3cef50c0bcf61b2eb3e41
bootstrap artifact file sha256 = a56b24dd1e16da3bb5fc28e7f1577d87a2729dedaab968d364fceba18334234b

bootstrap dispatch = m1-4b-runtime-live-20260723t232457z
bootstrap signed dispatch commit = e20125652f179627cc25f09d9edfd29a74bf3684
bootstrap result sha256 = 1e185b10af05a3098d53534b79c5f6fdc64dc8582a3d75fbc0778a9dd7a6925d
bootstrap request token budget / attempts = 203 / 80
bootstrap listing gaps / committed checkpoints = 0 / 2

resume dispatch = m1-4b-runtime-live-20260723t233213z
resume signed dispatch commit = 2b42338156d0694fb3b953ece889eac8012b3878
resume result sha256 = fd245a88b362a423a8a5cadf87f6c2fc16d1ea76436912e909c212285dd4eb3f
resume request token budget / attempts = 203 / 80
resume listing gaps / committed checkpoints = 0 / 2

acceptance axes = BITGET_VENUE PASS / LISTING_LIFECYCLE PASS /
                  EQUITY_ASSET_DOMAIN PASS / DATA_MAXIMIZATION PASS
productionChanged = false
secretMaterialPresent = false
staging cleanup = PASS for both counted runs
```

Bootstrap checkpoints:

```text
BITGET_FUTURES = listing-history-checkpoint:BITGET_FUTURES:db234d146c426d76
BITGET_FUTURES content = sha256:db234d146c426d76215e0e417ad7b45ef9ddc033568c47dbbd9960d12beadc35
BYBIT_DERIVATIVES = listing-history-checkpoint:BYBIT_DERIVATIVES:8f46eb81f10b008b
BYBIT_DERIVATIVES content = sha256:8f46eb81f10b008b43e58bdbe29db46281e7f89909e1a2cc6b94d82b94f3e608
```

Checkpoint-bound resume produced new content-addressed checkpoints:

```text
BITGET_FUTURES = listing-history-checkpoint:BITGET_FUTURES:a72beee67dfe9e6c
BITGET_FUTURES content = sha256:a72beee67dfe9e6c797f1b7f98756b6ab8066255e3f1fac8f8f986adab1ccc5d
BYBIT_DERIVATIVES = listing-history-checkpoint:BYBIT_DERIVATIVES:8e9884e65e45ef19
BYBIT_DERIVATIVES content = sha256:8e9884e65e45ef19c1db5b6869fa6fcc75a88641d82cef1d756c1d372d6f0aac
```

## 5. 生产影响

```text
production services: unchanged
production database: unchanged
Redis and workers: unchanged
env and feature flags: unchanged
production repository: unchanged
runtime authority: unchanged
sanitized evidence/checkpoints: added under fixed dispatch state root
```

## 6. 尚未完成

- Binance spot registry 修订及绑定新 digest 的 live conformance。
- M1.5C 四 Venue 多资产 Shadow 和 M1.6-D1 扩展容量。
- 股票 session、公司行动、FX、reference/basis、费用和分域事实仍未打通。
- M2.3/M2.4 真实 Detector、cohort、untouched holdout 和分域校准。

M1.4B 的腾讯隔离 no-authority runtime、真实 bootstrap、持久 checkpoint、完整
route 分母和 checkpoint-bound resume 已通过，因此本工作包可以关闭。它只关闭
M1.4B，不关闭 M1，也不能支撑生产 Fact、Candidate、股票交易能力或交易计划。

## 7. 下一入口

M1.4B 已取得本地、GitHub 和腾讯现场出口。Scope V2 下一入口固定为：

```text
M1.5C Four-Venue Multi-Asset Shadow
-> M1.6-D1 Expanded-Scope No-Cost Capacity Proof
```

独立生产第一关键路径保持：

```text
P0R fresh exact-plan 7200-second STS
-> encrypted backup
-> exact version retrieval
-> isolated PostgreSQL 16 restore
-> cleanup
```
