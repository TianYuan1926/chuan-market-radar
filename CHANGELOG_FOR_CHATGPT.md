# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-20 / V2 M2.0 Discovery Contracts and Golden Fixtures Local Exit

### 本轮目标

冻结六类机会、Detector point-in-time 输入、`DiscoveryCandidate -> CandidateEpisode -> OpportunityThesis` 生命周期、去重/资源优先级、三层运行漏斗和禁止未来数据的黄金样本。

### 修改范围

- 冻结 Pre-Move、Breakout/Retest、Trend Continuation、Reversal/Range、Relative Strength、Derivatives Flow 六族十四模式，以及每族合法方向。
- Candidate/Episode/Thesis 升为 strict v2 schema；增加 Detector emission authority、event/knowledge 双 cutoff、五类 artifact lineage、UTC Episode key、状态转换、幂等/outbox 和 Bundle 一致性。
- 建立 eligible/evaluated/unavailable 与 discovered/deep-validated/actionable 三层运行漏斗，明确不替代 early-detection 研究三分母。
- 新增 19 个 test-only point-in-time fixture，六族各含 LONG、SHORT 和反例，另含方向未决、late、noise、fakeout、unavailable；递归拒绝 Outcome/MFE/MAE 等未来材料。
- 未修改 Legacy、M1 runtime、前端、API、DB、Redis、Worker、Deep、Analysis、Strategy、Backtest 或生产。

### 核心链路影响

建立 `多机会发现 -> Candidate Episode + Opportunity Thesis` 的可回放、可追溯合同地基。它不提高已证明的真实发现率，不产生等级、Signal、READY 或交易计划。

### 测试结果

- `test:v2-foundation`：162 tests / 157 pass / 0 fail / 5 explicit external-dependency skips。
- M2.0 定向 16/16；`typecheck`、`lint` PASS，lint 0 error / 0 warning。
- 完整 `ci:production`：PASS，`exit_code=0`；Legacy market 965/0/4 skip、Worker 23/23、历史回测 4/4、全 V2 157/0/5 skip、M0 10/10、build、golden 16/16 和安全门禁全部通过。
- 首次黄金样本定向为 13/14，因为 `futureMfe` 未被专用 future-key 规则分类；已扩展递归规则，没有删除测试或降低 schema。
- 首轮完整 CI 后继续反审计并封闭 `future_outcome`/`quality_hit` 字符串绕过、Thesis emission-scope 缺口和重复/重叠理由污染；加固后完整 CI 再次 PASS。
- `backtest:formal`、production smoke、live provider、Docker 和 migration 未运行；生产零变更。

### 是否部署

未部署。没有读取 M1 authority、写 Candidate Store、执行生产命令或改变生产权威。

### 风险与遗留问题

- fixture 只证明合同和反未来泄漏，不证明真实 precision、recall、lead time 或盈利。
- M1.5-B1/M1.7 未通过，所有 Detector runtime、M1 authority 读取和 live Candidate 仍被阻断。

### 下一轮建议

只执行 `V2-M2.1-PRE-MOVE-BREAKOUT-REPLAY-KERNELS`，以 test-only fixture 实现纯函数/纯回放内核，不接 runtime、存储、页面、等级或计划。

## 2026-07-20 / V2 M1.6 Partitioned Fact Storage Local Exit

### 本轮目标

把高频 `PointInTimeMarketFact` 从不可长期清理的单表写入改为可证明的 UTC 日分区、容量水位、备份恢复与最小权限 retention 地基，不改变 Fact 语义或交易逻辑。

### 修改范围

- 新 Fact 只写无 DEFAULT 的 UTC 日分区；旧账本只兼容迁移前 Fact 读取和精确幂等重试，数据库同时拒绝新 Fact 回写旧账本与旧身份重复写入新分区。
- 建立有界活动身份注册表、不可变 CREATED/DROPPED 事件、backup evidence 和 retention run；清理时身份与分区原子收缩，已清理日期永久拒绝重建和重灌。
- Audit 只登记 restore-verified backup evidence，Retention 只调用受控 ensure/inspect/drop；Writer、Reader、Replay 均不能 DROP。
- 新增容量合同、隔离 PG16 dump/restore/replay/retention 演练及 M1.3-M1.5 数据库回归；未修改 Legacy、前端、API、Detector、Analysis、Strategy、Backtest 或生产。

### 核心链路影响

加固 `Universe -> Market Fact + Quality -> Runtime Truth` 的长期数据地基。本轮不提高机会发现率，不产生 Candidate、方向、等级、Signal、READY 或交易计划。

### 测试结果

- M1.6 定向 5/5，隔离 PostgreSQL 16 1/1 PASS；真实完成两日跨分区、17 条新 Fact、`pg_dump -> pg_restore -> replay parity PASS`、deterministic replay、保留/replay 阻断和 1 分区/2 Fact 原子 DROP。
- M1.3 Store/Replay、M1.4 Collector、M1.5 Checkpoint 三项 PG16 回归各 1/1 PASS。
- 全 V2 141 pass / 0 fail / 5 explicit external-dependency skips。
- 完整 `ci:production`：`exit_code=0`；Legacy market 965/0、Worker 23/23、历史回测 4/4、M0 10/10、生产 build、golden 16/16 与安全门禁全部通过。
- `backtest:formal`、production smoke 和 live provider 未运行；本轮不属于 formal 验收且生产零变更。

### 是否部署

未部署。未连接生产、未执行 production migration、分区预建、backup、retention、Compose、env、secret、Redis、Worker 或 GitHub main 变更。

### 风险与遗留问题

- 生产旧 V2 Fact 数量、真实写入率、WAL/磁盘、备份窗口、RTO/RPO、Docker image、live egress 和 Shadow/SLO 均未证明。
- 迁移前旧 Fact 非零时必须另做受控 backfill/retirement，不能把兼容读取当成长期迁移完成。
- 施工中真实发现并修复 SQL 名称歧义、冲突码丢失、过期 fixture、清理后错误泛化、永久身份墓碑膨胀和旧账本 SQL 旁路，未用跳过或降低门槛掩盖。

### 下一轮建议

只执行 `V2-M2.0-DISCOVERY-CONTRACTS-AND-GOLDEN-FIXTURES` 本地合同包；M1.5-B1/M1.7 外部门禁未通过前，Detector runtime 继续封闭。

## 2026-07-20 / V2 M1.5-B0 Shadow Release Safety Local Exit

### 本轮目标

在 live Shadow 前修复进程身份、secret 注入、SLO 证据和容器权限缺口，并把有限观察与长期 Fact 存储能力分开。

### 修改范围

- 入口显式假设并核验 `market_radar_v2_m1_writer/reader`，要求不同 session login、固定 host/database 和生产非空密码。
- database URL 支持两个独立 secret file；日志改为完整 strict observation envelope，增加固定 SLO JSONL CLI。
- 冻结 31 周期/30 分钟与 1441 周期/24 小时两个有限 profile，retention 最大 30 天，拒绝无限 Shadow。
- 新增只含编译后 V2 runtime 的专用 Dockerfile 和非 root/read-only/no-capability/no-port/no-Legacy-secret Compose overlay。
- 新鲜读取 Edge OrcaTerm；只确认 0 会话/无连接配置，未输入或保存凭据，生产零命令。

### 核心链路影响

加固 `Universe -> Market Fact + Quality -> Runtime Truth` 的 Shadow 运行边界，不生成 Candidate、方向、Signal、READY 或交易计划。审计发现高频 Fact 单表没有物理 purge，新增 M1.6 分区/retention 地基步骤。

### 测试结果

- `test:v2-m1-collector`：41/41 PASS。
- `typecheck`、`lint`、YAML 语法与 `git diff --check`：PASS。
- `test:v2-foundation`：136 pass / 0 fail / 4 explicit external-dependency skips；新增 V2 graph root 回归后，Legacy Consumer Map 仍为 539 个源文件。
- 隔离 PostgreSQL 16：M1.5 checkpoint restart、M1.4 collector、M1.3 store/replay 三项各 1/1 PASS。
- 完整 `ci:production`：`exit_code=0`；Legacy market 965/0、Worker 23/0、历史回测 4/0、build、golden 16/16 与 security 均通过。
- 本机无 Docker CLI，真实 image build 与 Compose merge 未运行，明确为 UNPROVEN。
- `backtest:formal` 与 production smoke 未运行；本轮不属于 formal 验收且生产零变更。

### 是否部署

未部署。未创建 OrcaTerm 连接、未执行 migration、身份创建、secret 写入、镜像构建、容器启动、数据库/Redis/Legacy 变更或 GitHub main 部署。

### 风险与遗留问题

- 本机 provider egress 不可达、OrcaTerm 0 会话且 Docker CLI 不存在；live、image 和生产事实仍未证明。
- 当前高频 Fact 单表 append-only 且没有物理 purge，只允许有限 Shadow，禁止长期一分钟全市场写入。
- 首次全 V2 门禁发现 `deploy/v2/**` 被误纳入 Legacy Consumer Map；已统一排除四个 V2 graph root 并增加回归，未通过重生成基线掩盖污染。

### 下一轮建议

只执行 `V2-M1.6-PARTITIONED-FACT-STORAGE`；外部 M1.5-B1 固定 31 周期 early Shadow 在可信通道恢复后并行，二者都通过后再做 M1.7 24 小时持续 SLO。

## 2026-07-20 / V2 M1.5-A Durable Worker, Checkpoint and SLO Local Exit

### 本轮目标

把 M1.4 Collector 组合成可重启、可停止、固定节拍且永久无读取/交易权威的 Worker，并建立 live rehearsal 和 Shadow/SLO 的诚实证据入口。

### 修改范围

- 新增独立 checksum 的 append-only collector checkpoint migration，绑定精确 Universe/FactQuality artifact、release、runtime config、sequence、schedule、cycle telemetry 和 retention；未修改 M1.3 base migration。
- 新增 PostgreSQL checkpoint store、精确 restore、错 release/config 与篡改拒绝、最小权限 reader/writer、checkpoint 不领先 artifact 和失败即停语义。
- 新增 single-use Worker、固定节拍 skip-missed、非重叠、优雅停止、强制 telemetry sink、资源采样、NO_AUTHORITY 进程入口和三态 SLO evaluator。
- 新增 live public rehearsal；未修改 Legacy、前端、API、Detector、Analysis、Strategy、Backtest、生产配置或生产数据。

### 核心链路影响

强化 `全市场发现` 前的数据运行地基：采集进程可以从可验证断点恢复，且只有新周期 artifact 与 checkpoint 均成功后才 operational READY。本轮不产生 Candidate、方向、Signal 或交易计划。

### 测试结果

- M1.5 定向：30/30 PASS；全 V2：130 pass / 0 fail / 4 explicit integration skip。
- 隔离 PostgreSQL 16：M1.5 checkpoint restart、M1.4 collector、M1.3 store/replay 三项各 1/1 PASS。
- Legacy：核心 965 pass / 0 fail / 4 skip；workers 23/23；historical 4/4；M0 10/10；golden 16/16。
- `typecheck`、`lint`、`build`、forbidden files、secret patterns、security 和完整 `ci:production`：PASS。
- live rehearsal：FAIL/UNAVAILABLE。两轮中三家 provider 均连接/请求超时，0 observed / 0 eligible / `DEGRADED`；未伪造成 PASS。
- `backtest:formal` 与 production smoke 未运行；本轮不属于 formal 能力验收且生产零变更。

### 是否部署

未部署。未执行 production migration、Worker/Compose 变更、读权威切换或 GitHub main 部署；生产终态仍为 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。

### 风险与遗留问题

- 本机没有三家 provider egress，故 live 真实规模、持续 freshness/coverage 和 SLO 尚未证明。
- checkpoint migration 与 Worker 已可发布但尚未在生产应用；任何 Shadow 必须独立绑定 release、checksum、身份、资源和回滚。

### 下一轮建议

只执行 `V2-M1.5-LIVE-SHADOW-GATE`：先在可达网络完成同一 entrypoint 的 live 四分母证明，再经独立 Gate 启动 no-authority Shadow；不进入 M2 authority。

## 2026-07-20 / V2 M1.4 Full Eligible Universe and Collector Runtime

### 本轮目标

把单 BTC 三 Venue 证据切片扩大为多标的完整 accounting 与受控 Collector Runtime，建立全量/增量 reconciliation、配额、背压、恢复、四分母和 durable Store 闭环。

### 修改范围

- 新增 21 observed / 15 eligible 的 test-only 多标的 provider fixture，以及完整 catalog、Bybit 多页、ticker 和故障 harness。
- 新增 Collector 状态机、strict telemetry、provider quota、global/per-provider concurrency、有限队列、冷启动、周期 reconciliation、Store failure 和 recovery。
- 完整成功 catalog 中消失标的保留 `DELISTING` tombstone；provider/分页失败保留为 `UNAVAILABLE`，不静默缩小 accounting denominator。
- M1 Store 允许 Universe cutoff 早于 ticker cutoff，并支持 eligible=0 的 exact empty Fact denominator；原子、幂等和 append-only 防线不变。
- 新增隔离 PostgreSQL 16 Collector 演练和 M1.4 合同/报告；未修改 Legacy 或生产。

### 核心链路影响

完成 `Universe Registry -> Market Fact + Quality -> append-only M1 Store -> Collector telemetry` 的本地多标的闭环，为后续 live 全市场发现提供可信覆盖和恢复地基。本轮没有 Candidate、方向、信号或交易计划。

### 测试结果

- M1.4 定向 14/14 PASS；全 V2 110 pass / 0 fail / 2 explicit PG skip，两项 PG integration 均已分别真实运行 1/1 PASS。
- 隔离 PostgreSQL 16 Collector integration：1/1 PASS；启动、增量和全 catalog 故障均真实落库。
- M1.3 PostgreSQL 16 Store/Replay integration：1/1 PASS，回归未破坏。
- Legacy 核心 965 pass / 0 fail / 4 skip；workers 23/23；historical 4/4；M0 10/10；build、golden 16/16、forbidden/secret/security PASS。
- 最终单实例 `ci:production`：`exit_code=0`。
- `backtest:formal` 与 production smoke 未运行；生产零变更。

### 是否部署

未部署。所有 PostgreSQL cluster 均为本机临时实例且退出后销毁；未连接腾讯云、Redis、Worker、Compose、env、secret 或 GitHub main。

### 风险与遗留问题

- 多标的数量来自确定性 fixture，不代表 live provider 的真实全市场规模。
- 尚无连续 Worker、durable restart checkpoint load、Shadow/SLO、生产 migration 或 authority 证据。

### 下一轮建议

只执行 `V2-M1.5 Live No-Authority Collector Rehearsal and Shadow/SLO Entry`，先证明 live provider、连续 coverage/freshness、资源、恢复和成本，不进入 Detector。
