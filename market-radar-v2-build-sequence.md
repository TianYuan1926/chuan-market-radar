# Market Radar V2 正确搭建顺序

## Goal

在不继承 Legacy 错误权威关系的前提下，先建立可信数据地基，再依次完成发现、验证、决策、工作台、学习、切换和实战准入。工程完成与时间证据分开计算，任何页面、提交或单次命中都不能冒充能力完成。

## Tasks

- [x] **M0.0 干净开工基线**：从最新 `origin/main` 建立独立 V2 实施分支，记录设计来源、排除的旧 G0 祖先、生产只读状态和永久禁区。验证：实施分支相对 `origin/main` 仅含已审查 V2 提交，生产仍为零变更。
- [ ] **M0.1-M0.3 宪法、合同与隔离骨架**：冻结产品术语、18 个 Module、五维状态、四类不确定性、爆发行情标签、Legacy Capability Atlas、`src/v2` import fence 和第一条 M1 fixture。验证：合同/架构测试通过，Legacy 与 V2 零运行时互引，旧代码零删除。
- [ ] **M1 数据真值纵向切片**：按 `Universe -> Fact + Quality -> Point-in-Time Feature -> Market Context -> Runtime Truth` 建设，先贯通一个标的和三家 Venue，再扩大到全部 eligible instrument。验证：100% instrument accounting、无假 0、实时/回放同源、lineage 可追溯、故障诚实降级。
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

## Done When

- [ ] 系统能证明扫描了版本化目标范围，而不是只显示很多币。
- [ ] Pre-Move 的 recall、precision、lead time、late/noise 和注意力负担使用冻结分母报告。
- [ ] 每个 READY 都有后端完整计划、执行可行性、结构来源、成本后 RR 和风险视图。
- [ ] 生产只有一个事实与决策 authority，失败时诚实 partial/stale/unavailable。
- [ ] Outcome 只评价历史，Research 只提出新版本，任何规则晋级都需独立证据和人工批准。

## Progress Rule

每个包只报告 `NOT_STARTED / LOCAL_PASS / PUSHED / SHADOWING / PRODUCTION_PASS / BLOCKED`。只有该包出口 Gate 通过才减数；文档完成、代码存在、测试单层 PASS、已上传或观察中都不能单独减数。
