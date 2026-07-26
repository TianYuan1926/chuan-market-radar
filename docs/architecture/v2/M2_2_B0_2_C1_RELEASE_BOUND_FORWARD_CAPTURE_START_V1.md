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

### 2.1 资产域语义修正

`CANONICAL_TARGET` 只表示旧 C1 合约形状与身份字段足以形成稳定 fingerprint：目标 Venue、线性合约机制、结算资产和 instrument identity 可核算。它不证明该标的是加密资产，不证明可交易资格，也不携带 Candidate、Strategy 或 READY authority。

Scope V2 必须把保留的原始目录重新送入独立的多资产归一化器，分别输出 `CRYPTO_LINEAR_PERPETUAL`、`EQUITY_SINGLE_NAME_PERPETUAL`、`EQUITY_INDEX_ETF_PERPETUAL`、`OTHER_RWA_DERIVATIVE` 或 `UNRESOLVED`。Bybit 的广义 `stock` 类别不能自行证明单股或 ETF；没有官方 mapping 时必须保留广义 RWA 与原因码，禁止按 symbol 外观猜测。

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

正式只读复核命令：

```bash
npm run v2:m2:forward-instrument:verify -- \
  --evidence-root <absolute-existing-evidence-root> \
  --repository-root <absolute-repository-root> \
  --expected-evidence-release-id <exact-evidence-commit>
```

验证器必须绑定自己的 clean tracked HEAD，并证明证据 release 是仓库中的 commit。它读取但不创建、补写或修复 evidence root，逐条验证完整 journal、全部引用对象、raw bytes、精确目录/文件集合和限制权限；任何 orphan、missing、symlink、partial、lock、哈希漂移或链漂移均 fail closed。证据 release 与 verifier release 必须分别报告，不能把后验验证器伪装成原始采集实现。

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

### 7.1 2026-07-27 最新刷新

历史起点不变。后续 release-bound 根在 evidence release parts `a02aecbbf8b289e409fd + e33b150fb55cb62ef3f0` 下新增四轮完整捕获，并由 clean verifier release parts `be5c0c9682cd8f503679 + 7d52d426783eb0f6615f` 使用正式命令复核：

```text
integrity=PASS_FORWARD_EVIDENCE_INTEGRITY_AUDIT
completeBatch=4/4
artifactReference=28 / uniqueArtifactObject=28
rawReference=12 / uniqueRawObject=8
retainedFile=37 / exactFileSet=true
journalHead=sha256:36b8513fee75f415c745efe5f7132e8d9e4c6667c27265997fe279e39c010e1b
Binance=4/4 complete / 845 rows / span 998704 ms / gap 0
OKX=4/4 complete / 426 rows / span 998708 ms / gap 0
Bybit=4/4 complete / 757 rows / span 998531 ms / gap 0
operationalForwardOnlyReady=true
```

最新 raw 的 Scope V2 域重放为：

| Provider | Crypto | 单股 | 指数/ETF | 其他 RWA | Unresolved | Normalization |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Binance | 698 | 125 | 3 | 8 | 11 | `PARTIAL` |
| OKX | 287 | 131 | 0 | 8 | 0 | `PARTIAL` |
| Bybit | 620 | 0 | 0 | 137 | 0 | `PARTIAL` |

Bybit 137 个广义 RWA 中有 133 个携带“`stock` 类别不能区分单股与 ETF”的明确原因；Binance、Bybit、OKX 分别有 192、36、15 行不满足目标合约机制。该重放证明真实目录能够失败关闭地隔离资产域，也证明旧 `CANONICAL_TARGET` 不能解释为“加密币”。它没有官方 mapping 完整性、Bitget、持续 Scope V2 Shadow、Fact、Candidate、Strategy 或 READY 权限。

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

C1 已是并行研究证据线，不再决定当前总工程入口。当前关键路径仍由权威施工顺序控制：

```text
V2-M1.6-P0R-R0-READ-ONLY-SOURCE-REBIND
-> A0 total Gate
-> same-release M1.5C Four-Venue Multi-Asset Shadow
   + M1.5D Adaptive Microstructure Forward Shadow
```

B0.2-B 外部来源权利与历史身份门继续并行等待，不能由 Agent 自批；C1 的四轮刷新不能替代 P0R、A0、Bitget、长期 Shadow、历史来源或真实 cohort。
