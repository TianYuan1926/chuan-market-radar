# Market Radar V2 M1.1B0 腾讯实时来源一致性固定派发合同 v1

状态：`LIVE_ATTEMPT_1_BLOCKED_BEFORE_BUSINESS_RESULT / ROOT_CAUSE_CLASS_IDENTIFIED / R1_DIRECTED_22_OF_22_PASS / PRODUCTION_CODE_AND_CONTAINER_IDENTITY_MATCH_BASELINE`

日期：2026-07-23

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 目的

M1.1B0 把已经完成本地测试的 15 个来源探针做成可由腾讯生产固定派发通道执行的一次性只读包，回答三个问题：

1. 腾讯网络环境当前能否真实访问 Binance、OKX、Bybit、Bitget 的时间、合约目录、现货目录和上新公告。
2. CoinGlass Hobbyist 生产 key 当前能否读取已登记的 supported-coins 能力。
3. 返回结构、分页、时钟、目录非空和套餐能力是否与本地合同一致。

本包只形成来源一致性证据。它不生成 Market Fact、Candidate、Signal、Strategy、READY，不修改任何业务服务，也不授权 M1.4B 以外的下游能力。

## 2. 固定分母

```text
MULTI_ASSET_IDENTITY = 8
LISTING_INTELLIGENCE = 6
COINGLASS_CONTEXT = 1
TOTAL = 15
```

四个 Venue 是正式分母：

```text
BINANCE_FUTURES
OKX_SWAP
BYBIT_DERIVATIVES
BITGET_FUTURES
```

Bitget 不能作为可选加分项。任何一个 Venue 的身份探针失败，Identity Gate 必须 `BLOCKED`。

上新范围固定为：

- Binance、OKX、Bybit、Bitget 现货目录。
- Bybit `type=new_crypto` 的最新两页有界一致性窗口；到达窗口边界时必须记录 `BOUNDED_COMPLETE`，不得冒充完整历史回填。
- Bitget `annType=coin_listings` 的官方一个月公告范围及完整 cursor 分页。

股票合约本包只验证可承载其身份的合约目录。单股、ETF/指数、session、corporate action 和 jurisdiction 能力仍由后续独立 Gate 决定，目录可达不能冒充股票实战能力。

Bybit 完整公告历史不再塞入 85 秒一致性探针。它必须在 M1.4B 上市情报运行时通过一次性 bootstrap backfill、持久 checkpoint、缺口检测和后续增量页收口；B0 只证明最新入口、结构和有界翻页当前可用。

## 3. 有界并发

同一来源的探针严格串行，避免制造 provider burst 和同源竞态；五个来源组可并行：

```text
perSourceConcurrency = 1
crossSourceConcurrency = 5
requestTimeout = 12 seconds per page
responseLimit = 8 MiB per page
probeProcessDeadline = 85 seconds
fixedDispatchRuntime = 100 seconds
```

公告分页过滤属于探针定义和 `probePlanDigest`。改变过滤条件、最大页数、官方 host 或执行策略都会改变摘要，旧现场证据不能继续证明新计划。

## 4. 唯一实现

- `src/v2/modules/source-conformance/adapters/exact-source-conformance-runner.ts`
- `src/v2/modules/source-conformance/source-conformance-contract.ts`
- `scripts/v2/production/m1-source-conformance-live-bundle.mjs`
- `scripts/v2/production/m1-source-conformance-live-runner.mjs`
- `scripts/v2/production/m1-source-conformance-live-entrypoint.sh`
- `tsconfig.m1-source-conformance-package.json`
- `tsconfig.m1-source-conformance-test.json`

定向验证：

```bash
npm run test:v2-m1-source-conformance-live-package
```

生产 bundle 构建：

```bash
npm run v2:m1:source-conformance:bundle -- \
  --source-ref refs/heads/codex/market-radar-v2-implementation \
  --dispatch-id <exact-id> \
  --expected-production-head <40-hex> \
  --expected-container-ids <sorted-comma-separated-ids> \
  --issued-at <iso-time> \
  --expires-at <iso-time-within-90-minutes> \
  --revocation-epoch <integer> \
  --runner-unit-name <exact-unit> \
  --output-directory <outside-worktree>
```

## 5. 源码与制品绑定

构建器必须证明：

- `sourceCommit` 是当前完整 Git commit。
- `sourceTree` 与 commit 精确匹配。
- source ref 的远端 SHA 等于 `sourceCommit`。
- runner、entrypoint、tsconfig、package/lock 和 15 个运行时源码文件与 commit 字节一致。
- TypeScript 使用独立最小编译入口，不读取暂停的 M3.4 草稿。
- 运行包只包含 15 个所需编译模块、Zod CJS 最小运行树、runner、entrypoint 和 manifest。
- Zod version、lock digest、107 文件运行树摘要和每个文件 SHA-256 全部固定。
- gzip 使用 `-n`，tar 使用固定 epoch、uid/gid、顺序和 mode，重复构建必须得到相同 bundle digest。

包内不得出现 `.env`、API key、Token、数据库 URL、私钥、生产业务数据或任意命令。

## 6. CoinGlass 密钥边界

CoinGlass Hobbyist key 不经过 Git、bundle、approval request、dispatch envelope、stdout、stderr、artifact 或 result。

runner 只允许从以下目标机固定文件读取一个精确键：

```text
/home/ubuntu/apps/chuan-market-radar/.env.production
COINGLASS_API_KEY
```

强制条件：

- 文件必须是 regular file 且不是 symlink。
- owner 必须是当前 `ubuntu` runner。
- group/other 权限必须为 0。
- 只允许一条 `COINGLASS_API_KEY=`。
- value 长度 20-256、无空白、引号或 placeholder。
- key 只通过一次性 child environment 进入探针进程。
- child 退出和 staging 清理后不保留副本。

缺 key、重复 key、权限过宽或 placeholder 均失败关闭；不能退回旧 key、缓存响应或公开接口替代。

## 7. 生产零变更证明

执行前后都必须捕获并比较：

- production Git HEAD。
- production worktree clean。
- 排序后的 11 个容器 ID。
- TCP listener digest。
- fixed dispatch timer enabled/active。
- `/api/health` 的 ready、scan ready/fresh 和 persistence ready。

允许写入范围只有：

```text
temporary signed-dispatch staging
sanitized content-addressed artifact
sanitized result
fixed-dispatch claim/result/cursor
```

禁止：

- checkout、fetch 或修改生产应用仓库。
- Docker create/recreate/restart/build。
- PostgreSQL、Redis、migration、env、Feature Flag 或 Worker 变更。
- 生产 API 写请求。
- Candidate、Signal、Strategy 或 READY authority。

staging 必须在退出时按精确目录边界删除；脱敏 evidence 保留在 fixed-dispatch state root。

## 8. 证据与 Gate

artifact 必须通过原 `M1SourceConformanceArtifactSchema`，并满足：

```text
evidenceClass = LIVE_READ_ONLY
networkEnvironment = TENCENT_ISOLATED_READ_ONLY
releaseId = exact sourceCommit
registryDigest = exact registry digest
probePlanDigest = exact probe plan digest
expectedProbeCount = observedProbeCount = 15
rawBodyRetained = false for every probe
secretMaterialPresent = false
productionChanged = false
```

总包只有在以下条件同时满足时 PASS：

```text
identityGateStatus = PASS
listingGateStatus = PASS
coinGlassGateStatus = PASS
passCount = 15
failCount = 0
notRunCount = 0
before production identity = after production identity
```

任何 Gate 失败仍保存脱敏 artifact/result，但 fixed dispatch 不输出成功标记，状态为 `BLOCKED_TENCENT_LIVE_READ_ONLY_SOURCE_CONFORMANCE`。

若在 artifact 形成前发生 request、bundle、runtime、生产身份、凭证、子进程或 evidence 异常，runner 必须额外保存独立失败结果：

```text
schemaVersion = market-radar-v2-m1-source-conformance-live-failure-result.v1
failurePhase = bounded phase code
failureReason = bounded sanitized reason code
productionMutationAttempted = false
productionIdentityUnchangedVerified = true only when both snapshots exist and match
secretMaterialPresent = false
```

不得再只留下 stderr hash，也不得在缺少 after snapshot 时宣称完整零漂移。

## 9. 首次生产尝试与路线纠正

首次派发 `m1b0-live-source-20260723t141526z` 被固定通道真实领取，但入口以 `dispatch_entrypoint_launch_failed` 关闭，未形成业务 artifact/result；staging 已清理。现场复核确认 exact production HEAD、clean worktree、11 个容器 ID、timer、health 及 CoinGlass 文件权限/键形状均符合合同。

同一现场查询显示 Bybit `new_crypto` 当前 `total=1617`，需要 81 页；原计划同时要求“全分页”、`maxPages=64` 和 85 秒总 deadline，合同不可能取得完整 PASS，且前 artifact 失败没有可读原因码。该尝试永久记为：

```text
BLOCKED_ATTEMPT_NOT_COUNTED_AS_LIVE_B0_PASS
```

R1 同时修复有界职责分离和失败证据，不原样重试旧 dispatch。

## 10. 完成边界

本地包测试通过只能说：

```text
M1.1B0 no-secret fixed-dispatch package is locally executable and fail closed.
```

腾讯执行 15/15 PASS 后才能说：

```text
M1.1B0 Tencent live source conformance PASS for the exact release and probe plan.
```

即使 M1.1B0 PASS，仍不能说 Bitget、上新币或股票合约已经进入生产扫描。只有 live-passed capability 才能进入：

```text
M1.4B endpoint batching/runtime Adapter
-> M1.5C Four-Venue Multi-Asset Shadow
-> M1.6-D1 Expanded-Scope Capacity Proof
```

生产 P0R 继续是独立第一关键路径，密钥与恢复权限边界不得与本包合并。
