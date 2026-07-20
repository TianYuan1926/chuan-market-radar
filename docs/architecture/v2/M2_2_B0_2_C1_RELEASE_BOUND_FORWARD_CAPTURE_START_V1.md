# M2.2-B0.2-C1 发布绑定前向合约目录捕获起点合同 v1

状态：`OPERATIONAL_CAPTURE_START_PASS / FORWARD_ONLY / NO_AUTHORITY / PRODUCTION_UNCHANGED`

日期：2026-07-20

## 1. 目标

在可信可达网络上，用一个干净、精确、已推送的 release 建立 Binance Futures、OKX Swap 和 Bybit Linear Perpetual 的连续前向合约目录证据起点。

本出口只证明从首轮实采时刻开始能够连续、完整、可复核地记录目标 Venue 的合约目录。它不回填首轮之前的历史，不解决历史数据权利，不开放 bulk acquisition、真实 cohort、Detector、Candidate、生产 authority 或交易计划。

## 2. 本轮修正的证据缺口

首次可达实采暴露出三个不能靠文档绕过的缺口：

1. 真实 Binance 目录含 Unicode base asset 和 symbol；ASCII-only identity 会把有效目标合约错误归为 unresolved。
2. `UNSUPPORTED` 是已经识别但不在当前目标范围内的 provider row，不等于 identity unresolved；它必须留在全分母，但不能阻断目标范围连续性。
3. 旧 artifact 没有绑定精确 release 和 capture config，无法机器证明两轮来自同一实现。

修正后 identity evidence 严格分为：

```text
CANONICAL_TARGET
PROVIDER_NATIVE_OUT_OF_SCOPE
UNRESOLVED
```

只有 `UNRESOLVED` 和 identity conflict 阻断 continuity。范围外 row 仍保留 provider-native fingerprint、状态和完整 accounting，不得静默删除或伪装成目标合约。

## 3. 发布与配置绑定

每个 Raw Evidence、Snapshot、Batch、Continuity、Artifact Reference 和 Journal Entry 必须携带：

```text
releaseId=<exact 40-hex Git commit>
captureConfigDigest=<frozen capture configuration digest>
```

CLI 必须显式接收 `--release-id`，并在网络请求前验证：

1. repository HEAD 与参数完全相等。
2. tracked worktree 干净。
3. 整条 journal 的 sequence、previous digest、自身 digest、release 和 config 连续一致。
4. 上一 head Batch 与 Continuity artifact 仍通过内容和 schema 验证。

跨 release、跨 config、旧 journal schema、历史 entry 篡改、head artifact 篡改或 dirty tracked worktree 一律 fail closed。

## 4. 网络边界

- 只访问既有三家 credential-free HTTPS allowlist。
- 不读取 API key、交易账户、生产 secret 或下单权限。
- 本机直连因 DNS/路由异常不可用；Node 通过显式启用本机系统代理后的 HTTPS tunnel 成功访问三家公开接口。
- 代理只恢复网络可达性，不改变 provider host allowlist、TLS 校验、raw byte digest、request identity 或 no-authority 边界。
- 网络可达不能替代完整分母、连续性、release 或 raw integrity Gate。

## 5. 运行命令合同

```bash
npm run v2:m2:forward-instrument:capture -- \
  --evidence-root <absolute-path-outside-worktree> \
  --repository-root <absolute-repository-root> \
  --release-id <exact-clean-head-commit>
```

正式证据根必须按 release 隔离。旧 schema、未绑定 release 或失败诊断链不得并入正式 journal。

## 6. 运行出口门槛

只有全部满足才可写 `OPERATIONAL_CAPTURE_START_PASS`：

1. 同一 release/config 连续产生两个三 Venue `COMPLETE` Batch。
2. 每个 Venue 至少 2 个完整 Snapshot，观察跨度不低于 300 秒。
3. 每个 Snapshot 的 provider row、source record、accounting 和 raw page 分母完整。
4. 全部 raw bytes、byte count、SHA-256 和 normalized artifact 可复核。
5. 每个 Venue `gapCount=0`、`activeCoverageGapCount=0`、`preCaptureIncompleteSnapshotCount=0`。
6. `UNRESOLVED=0`、`IDENTITY_CONFLICT=0`、blocker 为空。
7. 三个 Continuity 均为 `FORWARD_ONLY_READY`。
8. Journal chain 完整，无 writer lock 或 partial 临时文件残留。

## 7. 已验证结果

冻结 release：

```text
4139cc631d3d760876c3e39404c494462541a910
```

冻结 capture config：

```text
sha256:6cecaf486c155721b85a4f1161b7c492e69916f27c40b4bf0bd34400d90e4a9d
```

两轮 Batch：

```text
sequence 0: COMPLETE / sha256:1a9ee6f4eacf86ca2b18bce82dc6cd358c2746bba073bb6139d7c05a7261ed7f
sequence 1: COMPLETE / sha256:6b78f520d7843e50e74f72877f299519995ca174c581de1db852fb489549bf6e
journal head: sha256:4ac46f0b8c364afb28d89fd79c1aa8019ff62f908334696f298027709021ca7b
```

每轮稳定 accounting：

| Provider | 全部 row | Canonical target | Provider-native out-of-scope | Unresolved |
| --- | ---: | ---: | ---: | ---: |
| Binance | 841 | 654 | 187 | 0 |
| OKX | 426 | 272 | 154 | 0 |
| Bybit | 746 | 642 | 104 | 0 |

连续性结果：

| Provider | 完整快照 | 观察跨度 | Gap | Identity blocker | 状态 |
| --- | ---: | ---: | ---: | ---: | --- |
| Binance | 2/2 | 368,507 ms | 0 | 0 | `FORWARD_ONLY_READY` |
| OKX | 2/2 | 368,550 ms | 0 | 0 | `FORWARD_ONLY_READY` |
| Bybit | 2/2 | 368,533 ms | 0 | 0 | `FORWARD_ONLY_READY` |

全链复核了 14 个 normalized artifact、6 个 raw reference 和 5 个唯一 raw object；无 lock/partial 残留。

## 8. 仍然关闭的能力

```text
historicalBackfillAllowed=false
historicalSourceGateResolved=false
bulkHistoricalAcquisitionAllowed=false
cohortFreezeAllowed=false
candidateEmissionAllowed=false
productionAuthority=false
automaticTradingAllowed=false
```

C1 不能替代 B0.2-B 的外部人工权利与历史 instrument capability 结论，也不能替代 M1.5-B1/M1.7 的 Docker Shadow、持续 SLO 和生产 Gate。

## 9. 下一入口

本地关键路径回到：

```text
V2-M1.5-B1-A-REACHABLE-DOCKER-RUNNER-PREFLIGHT
```

本机没有 Docker CLI，因此优先使用 GitHub-hosted、branch-scoped、no-authority runner 构建精确 source image 并证明真实四分母。预检通过后，才可单独启动固定 31 个一分钟早期 Shadow 周期。B0.2-B 外部门继续并行等待，不能由 Agent 自批。
