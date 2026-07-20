# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

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

## 2026-07-20 / V2 M1.3 Store, Replay Manifest and Runtime Truth Rehearsal

### 本轮目标

把冻结 M1 authority artifact 真实写入隔离 PostgreSQL 16 append-only 账本，按 event/knowledge 双 cutoff 从账本重放，并用独立证据区分进程、依赖、业务、数据和发布真值。

### 修改范围

- 新增六类 M1 artifact 的原子 Store、strict STORAGE decoder、semantic hash/full payload digest、幂等冲突、retention metadata 和无 memory fallback 连接合同。
- 新增 `v2-m1-artifact-store.v1` PostgreSQL schema、迁移 checksum guard、UPDATE/DELETE trigger 和 migration/writer/reader/replay/audit 五类 NOLOGIN capability role。
- 新增 `v2-m1-replay-manifest.v1`，同时冻结 event cutoff 与 knowledge cutoff，从账本执行两次独立 replay 并生成 parity/determinism 证据。
- Runtime Truth 升为 v2；固定 M1 required-check profile，Rehearsal 即使全部技术检查通过也只能 `businessReadiness=PARTIAL`。
- 新增隔离 PG16 演练脚本和当前合同/报告；未修改 Legacy 或生产。

### 核心链路影响

完成 `Universe/Fact/Feature artifact -> durable store -> cutoff-safe replay -> parity evidence -> Runtime Truth` 本地闭环，为全市场 Collector 和 Detector 提供不会静默回退内存的事实地基。本轮没有增加 Candidate、信号、方向或交易计划能力。

### 测试结果

- `test:v2-m1-store-replay`：12/12 PASS。
- 隔离 PostgreSQL 16 integration：1/1 PASS；8 artifact、原子写入、幂等冲突、权限、append-only、强制污染检测、双 replay 和 Runtime Truth 通过。
- `test:v2-foundation`：96 pass / 0 fail / 1 explicit PG integration skip；独立 PG16 演练 1/1 PASS。
- Legacy 核心 965 pass / 0 fail / 4 skip；workers 23/23；historical 4/4；M0 10/10；build、golden 16/16、forbidden/secret/security PASS。
- 最终单实例 `ci:production`：`exit_code=0`。
- `backtest:formal` 与 production smoke 未运行；生产零变更。

### 是否部署

未部署。临时 PostgreSQL 16 cluster 退出后已销毁；未连接腾讯云、生产数据库、Redis、Worker、Compose、env、secret 或 GitHub main。

### 风险与遗留问题

- 当前只证明冻结 BTC 三 Venue artifact，不证明 live ingestion、全 eligible Universe、连续采集、容量、备份、恢复、retention purge 或生产 SLO。
- 生产 migration、生产 runtime identity 和 authority 切换均未发生；Runtime Truth 明确为 `REHEARSAL/PARTIAL`。

### 下一轮建议

只执行 `V2-M1.4 Full Eligible Universe and Collector Runtime`，先扩大覆盖与采集运行地基，不越过 M1 做 Detector。

## 2026-07-20 / V2 M1.2 Point-in-Time Feature and Context Local Slice

### 本轮目标

只读取 M1.1 冻结 Point-in-Time Fact，用同一纯函数建立首个跨三 Venue Feature、独立 online/replay 证明、FeatureQuality 和不产生方向的最小 Market Context。

### 修改范围

- 把跨 Venue Feature subject 从单一 instrument 修正为 `UNDERLYING_GROUP`，并升级 FeatureSet、FeatureQuality、MarketContext strict schema。
- 新增精确十进制 `(max-min)/median` 价格分散计算；缺失、重复、stale、future-produced 或 later-cutoff Fact 均 fail closed。
- FeatureSet 记录 ONLINE/REPLAY mode、独立 run ID 和 engine version；FeatureQuality 记录三份 snapshot/run/semantic hash，拒绝同对象、同 run、parity mismatch 和 replay nondeterminism。
- Market Context 只在 fresh parity evidence 下识别 `FRAGMENTED`；低分散不写 `HEALTHY`，不推断 regime、volatility、breadth、correlation 或方向。
- 更新 M1 合同、施工顺序、蓝图、机器矩阵、Context 与交付材料；未修改 Legacy 运行逻辑或生产。

### 核心链路影响

完成 `Point-in-Time Fact -> FeatureSet + FeatureQuality -> minimal MarketContext` 的首个本地纵切，为后续发现层提供可回放特征地基。本轮没有 Candidate、信号等级、Analysis、Strategy、交易计划或 READY。

### 测试结果

- `test:v2-m1-feature-context`：17/17 PASS。
- `test:v2-foundation`：84/84 PASS。
- `test:market`：核心 965 pass / 0 fail / 4 explicit skip；workers 23/23；historical 4/4。
- M0 机器出口 10/10、`typecheck`、`lint`、`build`、`backtest:golden` 16/16、forbidden/secret/security：PASS。
- 完整 `ci:production` 退出码 0；`backtest:formal` 和 production smoke 未运行。

### 是否部署

未部署。未修改数据库、Redis、Worker、API、页面、Compose、env、secret、GitHub main 或腾讯云；生产继续 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。

### 风险与遗留问题

- 目前只实现一个冻结 BTC 三 Venue 价格分散 Feature，不代表全市场 Feature、Detector 或提前发现能力已经形成。
- online/replay 当前是本地独立 run artifact 证明，尚无持久化 Store、跨进程 replay manifest、live input 或生产 SLO。

### 下一轮建议

只执行 `V2-M1.3 Fact Store, Replay Manifest and Runtime Truth Rehearsal`，先在隔离本地环境证明 append-only、幂等、完整性、回放和五类运行真值，不执行生产 migration。

## 2026-07-20 / V2 M1.1 Three-Venue Identity and Fact Local Slice

### 本轮目标

在不接 Legacy、不写数据库、不改生产的前提下，贯通 Binance USD-M、OKX SWAP、Bybit Linear 的公开合约身份与 `LAST_PRICE` 真值纵切，并对失败、时间和覆盖分母 fail closed。

### 修改范围

- 新增 HTTPS allowlist、无凭证 GET、timeout、响应体上限和固定错误分类的公开 JSON Transport。
- 新增三家 catalog/ticker Adapter、稳定 canonical identity/underlying group/observation ID、Bybit 完整分页和 100% observed accounting。
- 新增 EligibleInstrumentSnapshot、PointInTimeMarketFact、FactQualitySnapshot builder；未解析记录保留在分母，未持久化明确为 null，provider 失败不补 0 或 event time。
- 新增 duplicate provider row、duplicate/out-of-order/gap/stale/future cutoff/recovery 评估，测试支持目录与 production import fence。
- 修正 SourceLineage 和 InstrumentAccountingRecord runtime schema，使 transport failure、unresolved row 和本地未持久化事实可以诚实表达。

### 核心链路影响

完成 `Universe Registry -> Market Fact + Quality` 的首个本地纵向切片，为全市场发现提供可信身份和事实地基。本轮没有 Candidate、方向、评分、Signal、交易计划或 READY 能力。

### 测试结果

- `test:v2-foundation`：67/67 PASS，其中新增 M1.1 正常、失败、分页、时序、恢复、运行时不可变和确定性场景。
- `test:v2-m1-identity-fact`：27/27 PASS。
- `test:market`：核心 965 pass / 0 fail / 4 explicit skip；workers 23/23；historical 4/4。
- M0 机器出口 10/10、`typecheck`、`lint`、`build`、`backtest:golden` 16/16、forbidden/secret/security：PASS。
- 完整 `ci:production` 最终退出码 0；`backtest:formal` 和 production smoke 未运行。

### 是否部署

未部署。未修改 Legacy、数据库、Redis、Worker、API、页面、Compose、secret 或腾讯云；生产继续 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。

### 风险与遗留问题

- 当前环境对六个公开 endpoint 的只读探测均未取得响应，因此只证明官方合同形状和冻结 provider fixture，不证明 live connectivity 或真实全市场数据。
- M1.1 不含持久化、采集 Worker、全 eligible Universe、Feature、Context 或 Runtime Truth。

### 下一轮建议

只执行 `V2-M1.2 Point-in-Time Feature and Context Slice`，让在线与 replay 调用同一纯函数，不接入 Candidate 或方向判断。
