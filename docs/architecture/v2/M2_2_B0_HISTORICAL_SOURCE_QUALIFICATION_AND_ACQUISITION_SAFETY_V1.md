# M2.2-B0 历史来源资格与采集安全合同 v1

状态：`LOCAL_SOURCE_GATE_PASS / TECHNICAL_PILOT_PASS / BULK_ACQUISITION_BLOCKED / REAL_COHORT_BLOCKED / PRODUCTION_UNCHANGED`

核验日期：2026-07-20。本合同只证明来源准入与一文件技术链路，不证明来源权利已批准，不证明真实 cohort 已形成，也不改变任何 Detector 生命周期。

## 1. 目的

M2.2-B0 解决“数据能下载”和“数据有资格成为研究证据”被混为一谈的问题。任何真实 historical cohort 在下载前必须分别通过：

```text
来源权利
-> point-in-time 合约身份
-> 数据能力覆盖
-> event/knowledge 时间语义
-> 精确对象与官方 checksum
-> 容量预算
-> Git 外原始区
-> 不可变采集索引
```

任一项不足时，系统必须停在 `BLOCKED`，不得用公开可访问、当前 exchangeInfo、归档文件存在或合成 fixture 替代。

## 2. 已实现合同

- `historical-source-qualification.ts`：严格区分人工权利审查、技术可达性、历史合约身份、knowledge time 和逐 Detector 数据覆盖。
- `historical-acquisition-contract.ts`：精确 HTTPS host allowlist、逐对象 URL/checksum/大小、磁盘保留量、工作区外路径和 source identity 绑定。
- `historical-acquisition-pilot.ts`：限制为单对象技术验证，支持受校验的断点续传、重定向 allowlist、大小上限、官方 SHA-256、原子临时文件和验证后强制删除原始字节。
- `m2-historical-source-pilot.ts`：只提供 `preflight` 与 `verify` 两个本地入口，不提供 bulk 下载旁路。

所有 artifact 都有稳定内容哈希；证据、计划、preflight 和执行时间禁止倒置。

## 3. 来源核验

### 3.1 Binance Vision

[Binance 官方 public-data 仓库](https://github.com/binance/binance-public-data)说明公开归档、日/月文件和 checksum；仓库显示 MIT License。但仓库许可证是否明确覆盖市场数据本身，当前没有人工权利结论，因此：

```text
rightsReview=PENDING_HUMAN_REVIEW
retentionRight=UNKNOWN
replayRight=UNKNOWN
bulkAcquisitionAllowed=false
cohortFreezeAllowed=false
```

不能因为文件公开下载或仓库带 MIT 文件，就由工程 Agent 自动写成 `APPROVED`。

### 3.2 备选来源

- [OKX Historical Data](https://www.okx.com/historical-data)提供历史成交、Kline、Funding 和 L2；其[历史数据条款](https://www.okx.com/en-gb/help/historicaldata-terms-and-conditions)对个人策略研究更明确，但本机通道未完成技术资格，Agent 也没有代表账户接受新条款。
- [Bybit 官方文档](https://bybit-exchange.github.io/docs/)指向公开 historical CSV，但当前权利证据还不足以直接批准长期保留与回放，且本机探测超时。

因此当前没有任何来源被标记为 bulk-ready。

## 4. 真实技术验证

唯一对象：

```text
BTCUSDT-1m-2026-06.zip
provider bytes: 1,838,455
provider SHA-256: 9b214199eb5063585c7ed0f59ba19323326d68ac024b85106713989399204490
actual SHA-256:   9b214199eb5063585c7ed0f59ba19323326d68ac024b85106713989399204490
plan digest:      sha256:b2a5baf7b3ad0f052be247efcee8bd083baa7d473e04aa63f75aaf22e32d0a81
preflight digest: sha256:365636b82110d4de1075bb6469e62f76a8e9d9c4dc71d2efd7b5f362b5dee130
result digest:    sha256:7967763a6ef4ddde0d9e32c7f906f21197b26ec7c251f5da237ea53508438527
result: VERIFIED_AND_RAW_DELETED
```

本地磁盘预检：`232,554,672,128` available bytes，试点冻结要求 `100,019,000,000` bytes。执行时间 `2026-07-20T08:28:03.667Z`，原始字节删除后的完成时间 `2026-07-20T08:28:15.897Z`。验证后只保留 digest 命名且 create-new-only 的 preflight 与 result JSON，ZIP、partial 和 verified 临时文件均不存在。

这证明精确文件验证链可用，不批准数据长期留存，也不代表批量容量已经测量。

## 5. 已发现的真实阻断

### P0：来源权利未批准

公开可访问不等于 retention/replay right 已授予。必须由账户所有者或合格法律审查者绑定官方条款的不可变内容证据后，才能开放 bulk acquisition。

### P0：历史合约身份不完整

Binance 归档中同时存在已结算、下架和非加密标的。归档出现过某个 symbol 不能证明当时它是合格线性稳定币永续合约。真实 cohort 必须有 point-in-time onboard、delist、contract type、settlement asset、underlying class 和 trading status；当前 archive-presence-only 全部不合格。

### 已收口：Detector 排序强度合同

M2.2-B0.1 已增加 target-blind、可复现的 relative-rule-margin diagnostic strength、固定 Detector 分母和稳定 Top20 排序合同。它仍不是胜率、等级或 Candidate 权威；真实 Top20 必须等待合格 cohort，不能用合成 fixture 代替。

### P1：L2 能力不完整

月度 Kline 可支持 Compression、Kline 近似 Flow、Breakout Edge 和 Role-Flip Retest 的输入建设；它不能重建 Liquidity Shift 所需的 L2 depth。该 Detector 必须保持 unsupported，除非独立 L2 来源通过相同资格 Gate。

### P1：knowledge time 是模型值

历史归档没有当时的本系统 `receivedAt`。当前只允许把完整闭合 Kline 的 close time 加冻结保守延迟作为 modeled knowledge time，必须持续显示 `modeled_not_observed`，不得用下载时间冒充历史可知时间。

## 6. 调整后的正确顺序

M2.2-B 原有范围不删除，显式拆成以下证据出口：

1. `B0 Source Qualification + Acquisition Safety`：本包，已本地通过；bulk 与 cohort 仍 blocked。
2. `B0.1 Target-Blind Diagnostic Strength + Construction Policy Freeze`：已本地通过，已冻结 Detector 强度、ranking、训练专用标签阈值、匹配、完整背景、regime/liquidity 和 trial registry 身份；未形成真实 cohort。
3. `B0.2 Rights + Point-in-Time Instrument Metadata Resolution`：获得可审计人工权利结论和历史合约身份；未通过不得批量下载。
4. `B1 Immutable Raw Archive Acquisition`：按精确对象清单、逐文件 checksum、断点续传和 Git 外不可变索引采集。
5. `B2 Cohort Construction`：只用 train 拟合事件阈值，生成同一 Detector 分母上的 observations、event、matched non-event 和完整背景。
6. `B3 Split + Sealed Holdout Freeze`：冻结 train/validation、purge/embargo、symbol/regime assignment 和物理隔离 holdout commitment；仍不打开 holdout。
7. `C Registered Replay + Single-Use Holdout`：最后才运行预登记 validation/sensitivity 和一次 untouched holdout。

这不是增加工作，而是把原本隐藏在“获取真实数据”里的准入条件显式化，避免下载几十 GB 后才发现数据不能合法留存、标的范围污染或无法生成有效 Top20。

## 7. 永久边界

- 不连接生产，不读取 secret，不修改 DB/Redis/Worker/Feature Flag。
- 不生成 Candidate、Signal、等级、入场、止损、目标或 Plan。
- 不打开 holdout，不运行 formal，不改 Detector 生命周期。
- 原始历史数据不得进入 Git、证据 zip、日志或前端。
- 本包结束状态只能是技术来源 Gate 通过；真实 M2.2 Gate 继续 `INSUFFICIENT`。
