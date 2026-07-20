# M2.2-B0.2-C 第一方前向合约目录捕获合同 v1

状态：`LOCAL_ENGINEERING_PASS / OPERATIONAL_CAPTURE_START_BLOCKED_ON_EGRESS / PRODUCTION_UNCHANGED`

日期：2026-07-20

## 1. 目标

在 B0.2-B 历史来源和权利外部门等待期间，从真实捕获日起建立 Binance Futures、OKX Swap、Bybit Linear Perpetual 的 point-in-time 合约目录证据，为未来研究减少幸存者偏差。

本包只改善未来，不回填过去，不读取 M1 authority，不写 Candidate，不生成方向、等级、Signal、READY 或交易计划。

## 2. 固定边界

```text
三 Venue 现有 catalog Adapter
-> 可选原始字节捕获 Transport
-> 工作区外 content-addressed raw evidence
-> 完整/部分/失败 Venue Snapshot
-> 三 Venue Batch
-> 链式 Continuity Checkpoint
-> append-only Journal
```

永久为 false：

```text
historicalBackfillAllowed
historicalSourceGateResolved
bulkHistoricalAcquisitionAllowed
candidateEmissionAllowed
productionAuthority
```

## 3. 原始证据

- 只有调用方显式设置 `captureBody=true` 才保留原始响应；M1 默认 Transport 行为不增加 raw retention 或 SHA-256 开销。
- SHA-256 和 byte count 对交易所返回的原始字节计算，不对重新序列化 JSON 计算。
- provider、HTTPS host、request URL、request sequence 与 request digest 精确绑定。
- raw 文件仅写入 Git 工作区外的 `raw/sha256/<digest>.json`，文件权限为 `0600`。
- 已存在对象必须按 digest/bytes 复核；损坏、符号链接替换、路径逃逸和工作区内/祖先目录均 fail closed。
- normalized artifact 同样内容寻址，并强制携带与 artifact kind 对应的自身 digest。

## 4. 快照完整性

Venue Snapshot 只有同时满足以下条件才是 `COMPLETE`：

1. Adapter 明确返回成功。
2. request count、catalog page count、raw page evidence count 完全相等。
3. request sequence 从 0 连续且无重复。
4. catalog source record ids 与全部 accounting rows 一一对应、无重复、无漏行。
5. 最后一页 raw receivedAt 等于 snapshot source cutoff。
6. provider、Venue、record key、identity fingerprint 和 raw evidence 全部同源。

外层请求失败且无 row/raw 时为 `FAILED`；拿到部分页或部分 accounting 时为 `PARTIAL`。未解析 row 必须保留在分母，可以保持 Snapshot `COMPLETE`，但会阻断 continuity readiness，不得从分母删除。

## 5. 身份和缺席语义

- identity fingerprint 绑定 canonical identity、underlying group、Venue symbol、base/quote/settlement、contract type 和 contract size。
- 同一 provider symbol 出现不同 fingerprint 时进入 `IDENTITY_CONFLICT`，建立不同 identity epoch，不能静默覆盖。
- 已知 identity 后出现不完整 identity 时进入 `IDENTITY_EVIDENCE_GAP`，不能沿用旧 identity 冒充当前已确认。
- partial/failed Snapshot 不增加 instrument absence count。
- 只有完整 Snapshot 才能增加连续缺席；冻结政策为 3 次完整缺席且至少经过 15 分钟。
- 即使达到门槛，也只能写 `MISSING_CONFIRMED`，含义是“目录中持续缺席”，永久不得从缺席推断交易所已下架。

## 6. 连续性与扩展性

- 默认期望 cadence 为 5 分钟，最大允许 gap 为 15 分钟。
- Continuity 使用不可变链式 checkpoint；每轮只保存本轮 Snapshot 引用、当前 instrument state 和上一 checkpoint digest，不反复重建全部历史。
- Journal 使用单写锁、sequence、previous digest 和内容摘要；追加前在锁内复核实际 head，拒绝并发陈旧写入。
- 第一次完整 Snapshot 之前的失败计入 `preCaptureIncompleteSnapshotCount`，保留审计但不污染 `activeCoverageGapCount`。
- 第一次完整 Snapshot 后的 partial、failed 或 cadence breach 进入 active coverage gap，并阻断当前连续链 READY。
- 只有至少两次完整 Snapshot、完整观察跨度不少于 5 分钟、active gap=0、无 unresolved/conflict 且 capture start 可测量，才可得到 `FORWARD_ONLY_READY`。
- `FORWARD_ONLY_READY` 仍只证明捕获日起的前向目录连续性，不能解锁 B0.2-B、B1、历史 cohort 或 Detector 生命周期。

## 7. 运行入口

```bash
npm run v2:m2:forward-instrument:capture -- \
  --evidence-root <absolute-path-outside-worktree> \
  --repository-root <absolute-repository-root>
```

命令只输出有界摘要。三 Venue 全部完整时 exit 0；partial/failed 时仍先写入真实证据，再以 exit 2 结束。参数错误、证据损坏、journal 竞争或旧 head 不一致时 exit 1。

## 8. 当前真实结果

2026-07-20 在本机对正式外部证据根执行两次：

```text
evidenceRoot=/Users/chuan/.cache/market-radar-v2/evidence/b0-2-c
latestJournalSequence=1
latestJournalDigest=sha256:dd48aeb382072c2ed1c4a38d194b854bdaf6df3b5bcd257e1ca5d8764ff64d11
latestBatchDigest=sha256:6d9140c1ca42f55ff604925dbff829d3b0f8d66d6186cc9021a447bbddb23d44
batchStatus=FAILED
completeSnapshotCount=0 per Venue
preCaptureIncompleteSnapshotCount=2 per Venue
activeCoverageGapCount=0 per Venue
captureStartedAt=null
```

Binance 为 `provider_request_failed`；OKX 和 Bybit 为 `provider_timeout`。这证明失败语义、外部留存和 journal chain 生效，不证明任何 live market 覆盖。由于没有成功 raw response，正式根目录当前没有 raw page 对象，只有失败 Snapshot/Batch/Continuity artifact 与 journal。

一份未定稿 schema 产生的首次失败诊断已原样隔离到 `b0-2-c-pre-release-failed-f4def88b3f19`，不进入正式 journal chain，也未删除或改写失败事实。

## 9. 出口判定

### 本地工程出口

以下全部通过后可写 `LOCAL_ENGINEERING_PASS`：合同、定向测试、全 V2 回归、M0、基础 CI、安全/secret 门禁、文档和 Git 证据。

### 运行起点出口

以下全部满足后才可写 `OPERATIONAL_CAPTURE_START_PASS`：

1. 同一 release 的三 Venue Batch 连续完整。
2. 每家至少两次完整 Snapshot，跨度达到冻结 cadence。
3. raw evidence 在外部 store 可逐对象复核。
4. `activeCoverageGapCount=0`。
5. 无 unresolved identity 和 identity conflict。
6. Journal sequence/digest 连续且没有陈旧写入。

当前运行起点出口为 `BLOCKED_ON_EGRESS`。

## 10. 下一入口

```text
V2-M2.2-B0.2-C1-EGRESS-CAPABLE-FORWARD-CAPTURE-START
```

C1 只能恢复可信 egress 并执行同一 no-authority runner，不得顺带部署 M2 runtime、修改生产服务、数据库、Redis、env、Feature Flag 或 Candidate authority。B0.2-B 外部权利与合格历史来源继续并行且仍是 B1 的硬前置。
