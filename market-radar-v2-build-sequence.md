# Market Radar V2 正确搭建顺序

## Goal

在不继承 Legacy 错误权威关系的前提下，先建立可信数据地基，再依次完成发现、验证、决策、工作台、学习、切换和实战准入。工程完成与时间证据分开计算，任何页面、提交或单次命中都不能冒充能力完成。

## Tasks

- [x] **M0.0 干净开工基线**：从最新 `origin/main` 建立独立 V2 实施分支，记录设计来源、排除的旧 G0 祖先、生产只读状态和永久禁区。验证：实施分支相对 `origin/main` 仅含已审查 V2 提交，生产仍为零变更。
- [x] **M0.1-M0.3 宪法、合同与隔离骨架**：冻结产品术语、18 个 Module、五维状态、四类不确定性、爆发行情标签、Legacy Capability Atlas、`src/v2` import fence、30 个权威产物 runtime schema 和第一条 M1 fixture。验证：V2 38/38、M0 十项机器出口与完整 `ci:production` PASS；Legacy 与 V2 零运行时互引，Legacy 539 个源文件已建立消费者地图，旧代码零删除，生产零变更。
- [ ] **M1 数据真值纵向切片**：按 `Universe -> Fact + Quality -> Point-in-Time Feature -> Market Context -> Runtime Truth` 建设，先贯通一个标的和三家 Venue，再扩大到全部 eligible instrument。验证：100% instrument accounting、无假 0、实时/回放同源、lineage 可追溯、故障诚实降级。
- [x] **M1.1 三 Venue Identity + Fact 本地纵切**：实现固定 HTTPS/GET Transport、Binance/OKX/Bybit catalog/ticker Adapter、完整 instrument accounting、不可变 Fact/Quality、分页/冲突/缺失/429/transport/duplicate/out-of-order/gap/stale/recovery 门禁。状态：`LOCAL_PASS_FROZEN_PROVIDER_CONTRACT / LIVE_CONNECTIVITY_UNPROVEN / PRODUCTION_UNCHANGED`。
- [x] **M1.2 Point-in-Time Feature + Context 纯函数纵切**：已实现三 Venue 同一 underlying 的精确价格分散度、带独立 ONLINE/REPLAY run 证据的 FeatureQuality，以及只在证据充分时识别价格碎片化的最小非方向性 Market Context。状态：`LOCAL_PASS_84_OF_84_V2 / PRODUCTION_UNCHANGED`；不能访问 cutoff 后数据，不输出 Candidate、方向或交易计划。
- [ ] **M1.3 Fact Store + Replay + Runtime Truth**：设计并演练 append-only Fact、去重/幂等、retention、replay manifest、最小权限 writer/read identity，以及 liveness/dependency/business/freshness/release 五类真值；migration 仍需独立批准与 rehearsal。
- [ ] **M1.4 全 eligible Universe + 采集 Worker**：从 BTC 三 Venue 扩大到版本化目标范围，做启动全量、增量更新、每日 reconciliation、容量/限速预算、背压、冷启动和恢复；必须输出 coverage 分母，不能静默丢币。
- [ ] **M1.5 M1 Shadow/SLO 出口**：在 no-authority Shadow 中证明 freshness、gap、duplicate、late、coverage、恢复、成本和资源 SLO，再决定是否允许 M2 读取 M1 authority；观察窗口可以与后续本地施工并行，但不能删减。
- [ ] **M2 发现与深验纵向切片**：先做 Pre-Move 和 Breakout/Retest，贯通 `DiscoveryCandidate -> CandidateEpisode + OpportunityThesis -> EvidencePackage`；稳定后再并行增加其余四个机会族。验证：Candidate 不带等级/计划，point-in-time replay 可复现，三分母、队列 SLA、冷启动和漂移成立。
- [ ] **M3 唯一决策纵向切片**：完成 family-specific Analysis、Evidence/Setup 双评级、StrategyDraft、Execution Feasibility 唯一终审、Personal/Portfolio Risk。验证：只有 Final Decision 能产生 READY，false READY=0，结构与净 RR 均不低于 3，所有关键缺失 fail closed。
- [ ] **M4 单一读模型与专业工作台**：先建立 DecisionSnapshot 和站内 Alert，再重建 Inbox、Token Workbench、Review、System。验证：页面零 provider/decision 调用，同一 snapshot 在所有视图一致，E2E、a11y、visual、performance 和注意力预算通过。
- [ ] **M5 结果与研究治理**：从 M2 首个 Episode 起并行采集 Outcome，但只有冻结数据成熟后才评估；Research 与 Evaluation 物理分离。验证：future leak=0、Missed Movers/对照组完整、全部试验登记、Challenger 不能自批或自动晋级。
- [ ] **M6-M7 受控切换与实战准入**：严格按 replay -> no-write shadow -> isolated write -> dual read -> read authority -> single write -> rollback retention -> Legacy retirement；最后完成 60 天 Shadow、30 天模拟决策、安全、恢复和外部审计。验证：每次只切一个 authority，R4 评分与一票否决全部过线后才允许声明“人工实战决策辅助准入”。

## Critical Path

```text
M0 contracts
-> M1 truthful data
-> M2 Pre-Move vertical slice
-> M3 strict final decision
-> M4 single read model
-> M6 controlled authority cutover
-> M7 practical-readiness gate
```

M5 的 Outcome 采集从 M2 开始并行，额外 Detector、UI fixture、Runtime/Security 可在合同冻结后并行；schema authority、production writer、holdout 验收、read cutover 和 Legacy 删除始终串行。

## Current Entry

```text
M0 engineering exit: LOCAL_PASS / PRODUCTION_UNCHANGED
Current package: V2-M1.2 Point-in-Time Feature and Context Slice
Current package status: LOCAL_PASS_REPLAY_PROVEN_FIXTURE_SLICE / LIVE_CONNECTIVITY_UNPROVEN / PRODUCTION_UNCHANGED
Next package: V2-M1.3 Fact Store, Replay Manifest and Runtime Truth Rehearsal
```

M0 的减数只代表合同、运行时输入边界、Legacy 消费者地图和隔离门禁已经形成闭环；它不代表真实 Provider、全市场扫描、Detector、交易计划、页面或生产能力已经完成。

## Done When

- [ ] 系统能证明扫描了版本化目标范围，而不是只显示很多币。
- [ ] Pre-Move 的 recall、precision、lead time、late/noise 和注意力负担使用冻结分母报告。
- [ ] 每个 READY 都有后端完整计划、执行可行性、结构来源、成本后 RR 和风险视图。
- [ ] 生产只有一个事实与决策 authority，失败时诚实 partial/stale/unavailable。
- [ ] Outcome 只评价历史，Research 只提出新版本，任何规则晋级都需独立证据和人工批准。

## Progress Rule

每个包只报告 `NOT_STARTED / LOCAL_PASS / PUSHED / SHADOWING / PRODUCTION_PASS / BLOCKED`。只有该包出口 Gate 通过才减数；文档完成、代码存在、测试单层 PASS、已上传或观察中都不能单独减数。
