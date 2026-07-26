# V2 M2.2-C1 前向证据刷新与资产域隔离交付报告

任务：`V2-M2.2-B0.2-C1-FORWARD-EVIDENCE-REFRESH-AND-DOMAIN-ISOLATION`

日期：2026-07-27

状态：`LOCAL_CODE_REAL_EVIDENCE_AUDIT_AND_EXACT_SOURCE_REMOTE_QUALIFICATION_PASS / NO_AUTHORITY / PRODUCTION_UNCHANGED`

## 1. 本轮目标

把此前依赖临时脚本的 C1 全历史检查固化为正式只读验证器；对 release-bound 真实前向证据执行完整日志链、引用对象、raw bytes、精确文件集和权限复核；再把最新 raw 送入 Scope V2 多资产归一化器，防止旧合约形状标签把股票、ETF 或其他 RWA 误写成加密资产。

## 2. 正向路线调整

原 C1 只证明两轮三 Venue 捕获起点，且 `CANONICAL_TARGET` 的名字容易被误解为资产域结论。真实目录刷新已经观察到股票、ETF 和广义 RWA，因此本轮没有继续堆叠旧语义，而是：

1. 保留 2026-07-20 两轮证据为不可覆盖的历史捕获起点。
2. 为 2026-07-27 的四轮证据新增独立刷新记录。
3. 增加 read-only existing store，验证时禁止创建或修复目录。
4. 增加全链 auditor 和 clean-HEAD CLI，拒绝篡改、缺失、孤立、符号链接、临时文件和 release/config 漂移。
5. 复用 Scope V2 正式多资产 normalizer 重放最新 raw；不新增一套平行分类规则。
6. 保持 Candidate、Strategy、READY、历史回填和生产权限全部关闭。

该调整直接服务于 `Universe Registry -> Market Fact` 的真实分母与身份地基，不改变 P0R 第一生产关键路径。

## 3. 代码范围

- `src/v2/research/forward-instrument-evidence-store.ts`
  - 增加 `READ_ONLY_EXISTING` 模式和经过内容校验的 raw 读取。
  - 只读模式拒绝 raw、artifact 和 journal 写入。
- `src/v2/research/forward-instrument-evidence-auditor.ts`
  - 验证完整 journal sequence、previous digest、release/config 和自身 digest。
  - 逐一读取 Batch、Snapshot、Continuity 与 raw 对象。
  - 核对 Batch/Snapshot、Continuity/Snapshot 和跨轮 continuity chain。
  - 精确核对目录、文件、权限和引用集合，拒绝 orphan、missing、symlink、partial 与 lock。
- `src/v2/research/forward-instrument-domain-replay.ts`
  - 从最新完整 Snapshot 的 retained raw 重放 Binance、OKX、Bybit Scope V2 多资产归一化。
  - Bybit 多页先按已验证页合并；不使用 symbol 猜测或临时 mapping。
  - 只输出有界计数、原因分类和 no-authority 边界，不输出 symbol 列表。
- `src/v2/entrypoints/m2-forward-instrument-verify.ts`
  - 强制绝对路径、clean tracked verifier HEAD 和仓库中存在的 evidence commit。
  - 分别报告 evidence release 与 verifier release。
  - integrity PASS 但连续性未就绪时返回非零 readiness 状态。
- 对应测试和 package scripts。

未修改 Legacy、页面、业务 API、数据库、Redis、Worker、migration、env、Feature Flag、生产服务或任何交易权限。

## 4. 发布身份

证据产生 release parts：

```text
a02aecbbf8b289e409fd + e33b150fb55cb62ef3f0
```

正式验证器 release parts：

```text
be5c0c9682cd8f503679 + 7d52d426783eb0f6615f
```

验证器明确输出 `sameReleaseVerifier=false`。它是后验独立复核，不冒充证据产生版本。

## 5. 正式真实证据结果

```text
status=PASS_FORWARD_EVIDENCE_INTEGRITY_AUDIT
captureConfigDigest=sha256:6cecaf486c155721b85a4f1161b7c492e69916f27c40b4bf0bd34400d90e4a9d
journalEntryCount=4
journalHeadDigest=sha256:36b8513fee75f415c745efe5f7132e8d9e4c6667c27265997fe279e39c010e1b
batchStatus=COMPLETE 4 / PARTIAL 0 / FAILED 0
artifactReferenceCount=28
uniqueArtifactObjectCount=28
rawReferenceCount=12
uniqueRawObjectCount=8
retainedFileCount=37
exactFileSetVerified=true
allReferencedObjectsVerified=true
operationalForwardOnlyReady=true
```

| Provider | 最新行数 | 完整快照 | 观察跨度 | Gap | 状态 |
| --- | ---: | ---: | ---: | ---: | --- |
| Binance | 845 | 4/4 | 998,704 ms | 0 | `FORWARD_ONLY_READY` |
| OKX | 426 | 4/4 | 998,708 ms | 0 | `FORWARD_ONLY_READY` |
| Bybit | 757 | 4/4 | 998,531 ms | 0 | `FORWARD_ONLY_READY` |

这仍只证明约 16.6 分钟内的前向目录连续性和证据完整性，不是 24 小时 SLO、价格 Fact、微观结构、历史回填或 Detector 有效性。

## 6. Scope V2 资产域重放

```text
status=PASS_LATEST_RAW_DOMAIN_REPLAY
multiAssetSeparationObserved=true
unresolvedClassificationObserved=true
officialMappingCompletenessProven=false
candidateEmissionAllowed=false
strategyAuthorityAllowed=false
readyAuthorityAllowed=false
```

| Provider | Crypto | 单股 | 指数/ETF | 其他 RWA | Unresolved | Exact/Partial/Unresolved identity | 目标机制外 | Normalization |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Binance | 698 | 125 | 3 | 8 | 11 | 653 / 181 / 11 | 192 | `PARTIAL` |
| OKX | 287 | 131 | 0 | 8 | 0 | 411 / 15 / 0 | 15 | `PARTIAL` |
| Bybit | 620 | 0 | 0 | 137 | 0 | 721 / 36 / 0 | 36 | `PARTIAL` |

Bybit 的 137 个广义 RWA 中，133 个只能证明 provider `stock` 大类，不能区分单股与 ETF。系统保留 `OTHER_RWA_DERIVATIVE` 与明确原因，没有用名称猜测。三家都保持 `PARTIAL`，没有为了好看改成 `PASS`。

## 7. 验证

- `npm run test:v2-m2-forward-instrument`：42/42 PASS。
- 新文件 ESLint：PASS。
- `npm run ci:production`：PASS。
- Market：965 pass / 4 explicit skip。
- Workers：23/23 PASS。
- Historical：4/4 PASS。
- V2 Foundation：592 pass / 6 explicit external-dependency skip。
- V2 Ops：180/180 PASS。
- M0：PASS。
- Next production build：PASS。
- Golden backtest：16/16 PASS。
- forbidden files、secret patterns、materials、security：PASS。

正式命令：

```bash
npm run v2:m2:forward-instrument:verify -- \
  --evidence-root <external-release-bound-root> \
  --repository-root /Users/chuan/Documents/web \
  --expected-evidence-release-id <exact-evidence-release>
```

本报告不记录本机代理值、raw symbol、凭证、受限路径或任何交易账户数据。

## 8. GitHub 与生产

代码检查点已推送到 `codex/market-radar-v2-implementation`。同一 verifier source parts `be5c0c9682cd8f503679 + 7d52d426783eb0f6615f` 的四条 GitHub 工作流均已完成：

| 工作流 | Run | 结果 | 关键远端证据 |
| --- | ---: | --- | --- |
| A0 Release Qualification | `30223737098` | PASS | 双 RootFS/provenance/rollback 与冻结 1,440 instrument baseline；provenance artifact `sha256:3742a013e4955a69b4f42b63a1073148f521ef29e51204baa8939d3a430ba664`；performance artifact `sha256:b5ed299109350d830da550adec34086ab64490dd93a31a2de80db4d26dd73116` |
| Full Quality and Materials | `30223737124` | PASS | exact-runtime full CI；SBOM artifact `sha256:d1106adf290c92f6bf8f9379cb054d48a7ec654ba0e3405212037a2b53522f2f` |
| Independent Security | `30223737105` | PASS | full-history secret scan、CodeQL security-extended 与 collector image HIGH/CRITICAL scan；三个 artifact digest 分别为 `sha256:d3a0e82ffa9674f1fcfefdb77b694e3291742700e7d9cc2e4e5e6ec1741b6743`、`sha256:958f41e361959d9e1e3ddaa7d367ab7cf924c0792dcef799d2089c5748fd2d48`、`sha256:486da733b3d7d21ae6e2f94ba6be03c873417748f631a4dcbb2b5973e43efcbc` |
| Signed Production Dispatch Quality | `30223737131` | PASS | signed-dispatch-quality job PASS；没有生产 dispatch 或制品 |

远端 PASS 只证明该代码检查点的可重复构建、完整质量和独立安全资格，不证明腾讯现场执行、持续采集或业务 authority。

本包没有生产派发或部署。腾讯应用、数据库、Redis、Worker、容器、env、Feature Flag、migration、COS 和业务 authority 未由本包改变。独立 P0R signed read-only rebind 已发布，但目标机 receipt 尚未读取，因此既不能宣称执行 PASS，也不能宣称生产未曾启动该只读动作。

## 9. 未完成与下一步

1. 在用户完成腾讯登录后，只读取得 P0R 目标 receipt；读取前不重发、不改生产。
2. P0R 真实 recovery 与 A0 总门禁关闭前，M1.5C/M1.5D 仍 blocked。
3. 当前域重放不含 Bitget，也没有官方 mapping 完整性、持续 Scope V2 Shadow、Fact、cohort、holdout、Detector、Candidate、Strategy 或 READY authority。

结论：本包完整完成了正式验证器、真实 C1 证据全链复核、最新 raw 的失败关闭资产域重放，以及同一代码检查点的四条 GitHub 远端资格；生产、持续 Scope V2 runtime 与实战能力均未提升为完成。
