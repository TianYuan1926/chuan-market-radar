# V2 M1.1B0 腾讯实时来源一致性固定派发包交付报告

日期：2026-07-23

状态：`LOCAL_IMPLEMENTATION_PASS / DIRECTED_20_OF_20_PASS / FIXED_CHANNEL_REHEARSAL_PASS / INDEPENDENT_FULL_CI_PASS / LIVE_NOT_RUN / PRODUCTION_UNCHANGED`

Scope Epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`

## 1. 本包目标

把 M1.1B 已冻结的 15 个来源探针转换成可由腾讯固定生产派发通道执行的无密钥、内容寻址、失败关闭的一次性只读包。

本包只验证：

- Binance、OKX、Bybit、Bitget 的服务时间、合约目录和现货目录。
- Bybit `type=new_crypto` 与 Bitget `annType=coin_listings` 的完整官方公告范围。
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
```

过滤、分页、并发和边界全部进入 `probePlanDigest`。Bitget 是第四 Venue 的硬分母；股票类合约在本包只验证身份目录承载，不能把目录可达误写成股票实战能力。

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
directed package tests = 20/20 PASS
deterministic bundle = PASS
fixed dispatch prepare = PASS_SIGNED_DISPATCH_PREPARED
fixed dispatch outbox = PASS_SIGNED_DISPATCH_OUTBOX
secret transport/persistence rejection = PASS
production mutation rejection = PASS
identity/window inflation rejection = PASS
blocked-result persistence = PASS
staging cleanup contract = PASS
independent clean-clone ci:production = PASS
Legacy market tests = 965 pass / 4 explicit skip
V2 Foundation = 419 pass / 6 explicit skip
V2 Ops = 124/124 PASS
Next production build = PASS
Golden audit = 16/16 PASS
security check = PASS
```

本地曾对 14 个公开探针做未提交诊断，全部出现连接 reset/timeout；CoinGlass 因未向本地注入生产 key 保持 `NOT_RUN`。该结果仅证明本机出站环境不可作为权威执行点：

```text
LOCAL_UNCOMMITTED_DIAGNOSTIC_NOT_AUTHORITY
```

它不能被解释为来源 API 失败，也不能替代腾讯 `LIVE_READ_ONLY` B0。

## 7. 完成边界

当前可以说：

```text
M1.1B0 无密钥固定派发包在本地可执行、可复现并失败关闭。
固定派发通道已接受同结构 rehearsal。
生产未变更。
```

当前不能说：

```text
腾讯 live B0 已执行或通过。
15 个来源当前全部可用。
Bitget、上新币或股票合约已进入生产扫描。
M1.4B、四 Venue Shadow、扩展容量或分域校准已完成。
```

## 8. 后续硬顺序

```text
exact package-only commit and push
-> obtain fresh production HEAD/container identity
-> build exact no-secret dispatch bundle
-> Tencent isolated LIVE_READ_ONLY 15/15 B0
-> only live-passed capabilities enter M1.4B runtime Adapter
```

P0R 的 STS、COS 恢复和 fresh P0 是独立生产第一关键路径，不与本包合并，也不共享密钥运输边界。
