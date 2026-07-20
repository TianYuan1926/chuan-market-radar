# M2.2-B0.2 权利与历史合约身份真值门禁 v1

状态：`LOCAL_EVIDENCE_GATE_PASS / EXTERNAL_RIGHTS_REVIEW_PENDING / QUALIFIED_HISTORICAL_INSTRUMENT_SOURCE_MISSING / BULK_BLOCKED / COHORT_BLOCKED / PRODUCTION_UNCHANGED`

核验日期：2026-07-20。本合同只证明系统能够拒绝不合格证据，不证明任何来源已取得使用权，也不证明真实历史 Universe 已形成。

## 1. 目的

B0.2 解决两个会让历史回放失真的根问题：

1. 公开可下载不等于允许长期留存、批量回放或用于网站。
2. 今天能查到某个 symbol，不等于它在任意历史时点都是合格、可交易的目标永续合约。

正确依赖保持：

```text
外部人工权利结论
-> 完整 point-in-time instrument evidence
-> B1 immutable raw acquisition
-> B2 real cohort construction
-> B3 split + sealed holdout
-> C registered replay
```

任一前置失败，后续不得用下载量、合成 fixture、当前快照或推断补位。

## 2. B0.2 拆分

### B0.2-A：机器证据门禁

本包已完成：

- 权利证据、exact source/operator、双数据范围、审查者、适用账户/司法范围、有效期、撤销处置和内容哈希合同；
- 历史 instrument source capability/provider、identity epoch、状态区间、knowledge time 和完整分母合同；
- 当前 snapshot、archive presence、区间缺口、晚到状态、symbol reuse、未留存哈希和过期审查的拒绝测试；
- 来源资格评估 v2，B0.2 未通过时同时禁止 bulk acquisition 和 cohort freeze。

### B0.2-B：外部事实解决

仍未完成：

- 账户所有者或合格法律审查者对准确来源、用途、账户和适用条款的结论；
- 可审计且覆盖目标窗口的完整历史合约身份来源；
- 对所选来源逐 Venue、逐字段、逐历史区间的真实覆盖验证；
- 若选商业来源，其合同/SLA、许可、成本、留存和撤销义务。

Agent 不能替代 B0.2-B，也不能把 B0.2-A 的测试通过写成来源获批。

## 3. 权利审查合同

权利产物必须绑定：

```text
exact source registry id
exact source operator
exact intended use
single-owner private audience
official terms/license/data agreement
historical market data + instrument reference scope
captured content digest + byte count
external content-addressed evidence retention
retention right
replay right
redistribution boundary
reviewer type and identity
account and jurisdiction scope
review time and bounded expiry
reviewer attestation digest
revocation deletion disposition
```

只有 `ACCOUNT_OWNER` 或 `QUALIFIED_LEGAL_COUNSEL` 可以形成外部完成记录。`Agent`、自动化系统和合成 fixture 不在 reviewer enum 内。完成记录若不是 exact operator、未同时覆盖历史行情与 instrument reference、引用未哈希条款、没有外部留存、缺少 attest、超过有效期或范围不匹配，一律 `BLOCKED`。

原始条款不进入 Git。可复核抓取存放在工作区外内容寻址证据库，仓库只保存 URL、时间、hash、bytes 和留存分类。条款或用途变化必须重新审查；权利撤销后删除获批 raw 数据并撤销 derived access。

## 4. 历史合约身份合同

每个历史 instrument epoch 至少记录：

```text
provider + venue
provider instrument key + symbol
historical instrument id + identity epoch
runtime canonical mapping
base / quote / settlement asset
settlement class
contract class + contract size
underlying class
onboardAt
delist state + delistAt
identityKnownAt
record coverage end
source record ids + evidence digests
ordered status intervals
status effectiveFrom/effectiveTo/knowledgeAt
```

`delistAt=null` 不再同时表示“仍在线”和“未知”；两者由 `delistState` 分开。相同 provider symbol 被重新使用时必须建立不同 identity epoch，时间重叠或 identity 冲突直接阻断。

## 5. Point-in-Time 解析规则

某时点只有同时满足以下条件才可标记 `ELIGIBLE`：

1. capability、coverage、record 与 qualification 的 provider 身份完全一致，cutoff 位于来源与 record 的已证明覆盖区间。
2. onboard、身份和适用状态在 cutoff 时已经可知。
3. contract 为线性稳定币结算永续，settlement 为稳定币，underlying 为加密资产。
4. 唯一覆盖 cutoff 的状态区间是 `TRADING`。
5. 没有区间缺口、UNKNOWN、重叠 epoch 或未来知识回填。

非目标合约或明确非交易状态可为 `INELIGIBLE`。缺字段、缺区间、晚到知识、来源不合格或超出覆盖范围只能为 `UNRESOLVED`，不能默认为 false、0 或 eligible。

## 6. 完整分母

只有 `FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST` 可以开放 cohort。以下都不够：

- 当前在线 symbol 列表；
- 历史 Kline/交易文件目录；
- 归档里出现过的 symbol；
- 技术试点的一个对象；
- 只保留成功交易或后来仍存续的标的；
- 厂商声称“历史覆盖”但未证明字段、区间和 symbol reuse。

Coverage artifact 必须满足：

```text
expected = resolved + unresolved
unresolved = 0
denominator manifest has immutable digest
every expected key has one bound record
source provider matches qualification provider
source window covers requested window
identity and status intervals have no gaps
knowledge time does not look ahead
```

## 7. 一手资料核查结论

### Venue 官方接口

- [Binance USD-M exchange information](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data#exchange-information) 明确描述为 current exchange trading rules；虽有 onboard、contract、status 和 underlying 字段，但不是历史状态档案。
- [Bybit instruments info](https://bybit-exchange.github.io/docs/v5/market/instrument) 查询 online trading pairs，返回 launch、delivery、contract、status 和 settleCoin；当前响应不能倒推完整历史状态。
- [OKX instruments change log](https://www.okx.com/docs-v5/log_en/) 说明 listing/delisting 公告后会更新 listTime/expTime，适合从现在起连续捕获；[OKX historical data](https://www.okx.com/historical-data) 当前列出的历史下载类型不包含 instrument snapshot archive。

因此三家当前接口都只能作为前向连续 capture 的输入或当前真值，不能单独解锁过去窗口。

### 历史/商业候选

- [Tardis instruments metadata](https://docs.tardis.dev/api/instruments-metadata-api) 是候选，但其文档说明部分 changes 为 best effort、availableTo 可晚于真实退市，且 symbol 可复用；仍缺精确 SLA、完整状态区间和权利结论。
- [Kaiko reference instruments](https://docs.kaiko.com/rest-api/data-feeds/reference-data/basic-tier/exchange-trading-pair-codes-instruments) 提供 trade start/end 和 instrument codes；trade availability 不能自动等同 onboard/delist/trading status。

这两项均登记为 `RESEARCH_ONLY`，未采购、未调用付费 API、未批准。

## 8. 当前机器真值

```text
rightsReview=PENDING_HUMAN_REVIEW
externalHumanRightsEvidence=false
qualifiedHistoricalInstrumentSourceCount=0
registeredSourceCandidateCount=5
allRegisteredCandidates=RESEARCH_ONLY
metadataProbeAllowed=true
bulkAcquisitionAllowed=false
cohortFreezeAllowed=false
realCohortCount=0
detectorLifecycle=DRAFT
candidateEmissionAllowed=false
productionMutation=0
```

三份公开能力文档抓取已在工作区外内容寻址证据库保留并复核 hash/bytes；Binance/OKX 页面抓取未形成可留存内容，因此保持 `REFERENCE_ONLY_UNHASHED`，没有包装为 evidence captured。

## 9. 最短不降质解决路径

1. 先选一个具体历史来源和精确研究窗口，不同时采购多个来源。
2. 要求来源方用合同/SLA逐项确认完整分母、已退市标的、onboard/delist、contract、settlement、underlying、status interval、symbol reuse 和可用时间范围。
3. 账户所有者/法律审查者只针对该 exact source、账户、司法范围和 private use 给出有期限的结论。
4. 用极小 metadata sample 做逐字段和历史公告交叉核验；provider、knowledge-time 或任一必填项不足就拒绝，不进入 bulk。
5. 同时建设三 Venue 前向 instrument capture，防止未来继续产生历史缺口；该数据不能冒充过去回填。
6. 两个 Gate 都 READY 后才生成 B1 exact-object manifest 和容量预算。

## 10. 禁止事项

- 不自动批准法律权利，不把本文当法律意见。
- 不以 MIT repository license 推导 market data license。
- 不以 current status、latest metadata 或 archive presence 回填历史。
- 不从 Kline 首尾时间推断完整 onboard/delist/status。
- 不隐藏 unresolved 分母，不删除已退市/失败标的。
- 不打开 bulk、cohort、holdout、Detector lifecycle 或 Candidate runtime。
- 不改 Legacy、M1 runtime、前端、API、DB、Redis、Worker、migration、secret 或生产。

## 11. 出口

B0.2-A 本地出口是“错误证据无法通过”，不是“正确外部证据已经取得”。B0.2 总包只有在外部人工权利 assessment=`READY`、历史 capability=`HISTORICAL_READY` 且 coverage artifact=`READY/unresolved=0` 后才能减数。当前必须继续显示 `B0.2_EXTERNAL_RESOLUTION_BLOCKED`。
