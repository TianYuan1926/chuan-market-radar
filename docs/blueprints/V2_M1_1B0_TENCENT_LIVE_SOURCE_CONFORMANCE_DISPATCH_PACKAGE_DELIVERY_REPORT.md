# V2 M1.1B0 腾讯实时来源一致性固定派发包交付报告

日期：2026-07-24

状态：`ATTEMPT_1_BLOCKED_NOT_COUNTED / R1_LIVE_0_OF_15_PASS_15_OF_15_COMMON_TRANSPORT_FAILURE / JITLESS_WEB_FETCH_ROOT_CAUSE_PROVEN / R2_NODE_HTTPS_DIRECTED_AND_FULL_CI_PASS / COMMIT_AND_NEW_DISPATCH_PENDING / PRODUCTION_UNCHANGED`

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 本包目标

把 M1.1B 已冻结的 15 个来源探针转换成可由腾讯固定生产派发通道执行的无密钥、内容寻址、失败关闭的一次性只读包。

本包只验证：

- Binance、OKX、Bybit、Bitget 的服务时间、合约目录和现货目录。
- Bybit `type=new_crypto` 最新两页的一致性窗口，以及 Bitget `annType=coin_listings` 官方一个月完整 cursor 范围。
- CoinGlass Hobbyist `supported-coins` 的精确只读能力。

它不采集生产 Market Fact，不写 Candidate，不生成信号、等级、入场计划或 READY。

## 2. 固定分母与执行策略

```text
Multi-Asset Identity = 8
Listing Intelligence = 6
CoinGlass Context = 1
Total = 15
```

五个来源组跨来源并行，同一来源内严格串行：

```text
per-source concurrency = 1
cross-source concurrency = 5
per-page timeout = 12 seconds
per-page response limit = 8 MiB
probe process deadline = 85 seconds
fixed dispatch runtime = 100 seconds
live transport = Node core HTTPS, TLS verified, no redirect, jitless compatible
```

过滤、分页、并发和边界全部进入 `probePlanDigest`。Bybit 两页窗口必须标记 `BOUNDED_COMPLETE`，其完整历史由 M1.4B bootstrap/checkpoint/gap detection/incremental runtime 承担。Bitget 是第四 Venue 的硬分母；股票类合约在本包只验证身份目录承载，不能把目录可达误写成股票实战能力。

## 3. 实现范围

- `scripts/v2/production/m1-source-conformance-live-bundle.mjs`
- `scripts/v2/production/m1-source-conformance-live-runner.mjs`
- `scripts/v2/production/m1-source-conformance-live-entrypoint.sh`
- `scripts/v2/production/m1-source-conformance-live-bundle.test.mjs`
- `scripts/v2/production/m1-source-conformance-live-runner.test.mjs`
- `tsconfig.m1-source-conformance-package.json`
- `tsconfig.m1-source-conformance-test.json`
- M1.1B exact runner 与合同测试加固。

独立 TypeScript 配置只遍历本包依赖，不读取暂停的 M3.4 草稿。

## 4. Bundle 真值

本地 rehearsal 形成：

```text
bundle files = 125
compiled runtime modules = 15
Zod runtime files = 107
approximate archive bytes = 187404
archive format = deterministic tar + gzip -n
```

构建器绑定 exact source commit/tree/ref、全部文件 SHA-256、dependency lock、Zod 版本与运行树摘要。正式构建要求远端 ref 与当前完整 commit 精确一致，未提交或未推送源码不能生成生产 approval package。

Bundle、approval request 和 dispatch envelope 均不包含 CoinGlass key、`.env`、数据库 URL、Token、私钥或生产业务数据。

## 5. 密钥与生产边界

CoinGlass key 只允许目标机 runner 从固定生产 env 文件读取。文件必须是非 symlink regular file、归当前 `ubuntu` runner 所有且 group/other 权限为 0；只允许一条有效 `COINGLASS_API_KEY=`。key 只进入一次性探针子进程环境，不写 staging、日志、artifact 或 result。

执行前后必须比较：

- production Git HEAD 与 clean worktree。
- 精确排序后的容器 ID。
- TCP listener digest。
- fixed dispatch timer 状态。
- `/api/health`、scan freshness 与 persistence readiness。

任何生产身份变化、非 allowlist 命令、凭证异常、探针缺失或 Gate 非 PASS 都失败关闭。

## 6. 验证结果

```text
directed package tests = 24/24 PASS
deterministic bundle = PASS
fixed dispatch prepare = PASS_SIGNED_DISPATCH_PREPARED
fixed dispatch outbox = PASS_SIGNED_DISPATCH_OUTBOX
secret transport/persistence rejection = PASS
production mutation rejection = PASS
identity/window inflation rejection = PASS
blocked-result persistence = PASS
pre-artifact sanitized failure-result persistence = PASS
staging cleanup contract = PASS
independent clean-clone ci:production = PASS
Legacy market tests = 965 pass / 4 explicit skip
V2 Foundation = 420 pass / 6 explicit skip
V2 Ops = 125/125 PASS
Next production build = PASS
Golden audit = 16/16 PASS
security check = PASS
```

本地曾对 14 个公开探针做未提交诊断，全部出现连接 reset/timeout；CoinGlass 因未向本地注入生产 key 保持 `NOT_RUN`。该结果仅证明本机出站环境不可作为权威执行点：

```text
LOCAL_UNCOMMITTED_DIAGNOSTIC_NOT_AUTHORITY
```

它不能被解释为来源 API 失败，也不能替代腾讯 `LIVE_READ_ONLY` B0。

## 7. 首次腾讯执行真值

首次正式派发：

```text
dispatch = m1b0-live-source-20260723t141526z
dispatch commit = 7115feab87f31429f97c5515e5628313c770885f
launch status = FAIL_DISPATCH_NOT_REUSABLE
reason = dispatch_entrypoint_launch_failed
business artifact/result = absent
staging = cleaned
live B0 PASS count = 0
```

现场只读复核排除了生产基线和凭证边界：production HEAD 为 `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`、worktree clean、11 个容器 ID 与绑定值一致、timer enabled/active、health ready/fresh、CoinGlass 文件 owner=`ubuntu`、mode=`600`、精确键 1 条且值形状有效。

现场 Bybit 公告返回 `total=1617`，完整范围需要 81 页；旧合同只有 64 页上限并受 85 秒总 deadline 约束，因此旧方案无法满足自身“完整分页”声明。旧 runner 又只让固定通道保留 stderr hash，未在 artifact 前持久化脱敏失败码。该次尝试真实 BLOCKED，不能算 live B0，也不能原样重试。

R1 已完成两项定向修复：

- B0 只验证 Bybit 最新两页并显式标记 `BOUNDED_COMPLETE`；完整历史移交 M1.4B bootstrap 与增量账本。
- request 通过后任何前 artifact 异常都会保存 phase/reason 脱敏失败结果，不再只剩哈希。

R1 精确提交与第二次腾讯执行随后真实完成：

```text
source commit = ad38524a7e0c97f714369d6e61c4417f485b6367
dispatch = m1b0-r1-live-source-20260723t155239z
dispatch commit = a9ce83d2c90ac52df77d503ef446c974fd748325
business artifact/result = present
probe counts = 0 pass / 15 fail / 0 not-run
common failure = TRANSPORT_FAILURE_UNAVAILABLE
gate status = identity BLOCKED / listing BLOCKED / CoinGlass BLOCKED
productionChanged = false
secretMaterialPresent = false
```

固定 Node `v24.18.0` 的现场最小复现证明：`node --jitless` 下 Web Fetch
失败并给出 `WebAssembly is not defined`，同一 runtime 使用 Node core
`node:https` 可取得 HTTP 200。因而这不是五个 provider 同时不可用，而是 hardened
runtime 与 Web Fetch 的共同传输缺陷。

R2 不移除 `--jitless`，也不放宽 `MemoryDenyWriteExecute`。它将 live 默认传输
替换为 Node core `https.request`，显式保留 TLS 校验、exact host、HTTPS-only、
无重定向、超时和响应上限；Fetch 只作为 TEST_ONLY 注入适配器。传输身份进入
`probePlanDigest`，R1 artifact 不能替代 R2 现场结果。R2 当前 package 24/24、
fixed dispatch 21/21、V2 Foundation 422/428（6 项明确跳过）、V2 Ops 125/125、
M0、Next 生产构建、Golden 16/16、安全扫描与完整 `ci:production` 全部 PASS；
精确提交和新派发待完成。

## 8. 完成边界

当前可以说：

```text
M1.1B0 R2 原生 HTTPS 修复定向 24/24，可执行、可复现并失败关闭。
固定派发通道已接受同结构 rehearsal。
前两次生产尝试均已真实 BLOCKED；R1 已形成 15/15 共同传输失败证据。
当前生产代码、容器与健康身份仍匹配绑定基线。
```

当前不能说：

```text
腾讯 live B0 已通过。
15 个来源当前全部可用。
Bitget、上新币或股票合约已进入生产扫描。
M1.4B、四 Venue Shadow、扩展容量或分域校准已完成。
```

## 9. 后续硬顺序

```text
exact package-only commit and push
-> obtain fresh production HEAD/container identity
-> build exact no-secret dispatch bundle
-> Tencent isolated LIVE_READ_ONLY 15/15 B0
-> only live-passed capabilities enter M1.4B runtime Adapter
```

P0R 的 STS、COS 恢复和 fresh P0 是独立生产第一关键路径，不与本包合并，也不共享密钥运输边界。
