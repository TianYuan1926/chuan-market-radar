# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-20 / V2 M2.2-B0.2-A Rights and Historical Instrument Evidence Gate

### 本轮目标

把来源权利和历史 instrument identity 从可自报布尔值升级为可审计、会过期、可核算完整分母且默认关闭的机器 Gate，并如实判断现有候选是否能解锁真实 cohort。

### 修改范围

- 新增内容寻址权利审查：仅账户所有者或合格法律审查者可作外部决定，绑定条款、账户/法域、用途、保留/回放权利、有效期、attestation 和撤销处置。
- 新增历史 instrument capability/record/coverage：绑定 onboard/delist、合约与结算属性、状态区间、knowledge time、identity epoch、symbol reuse 和完整 point-in-time 分母。
- 升级 source qualification 到 v2；历史身份未 READY 时，即使技术链和权利通过也不得 bulk acquisition 或 cohort freeze。
- 登记 Binance/OKX/Bybit 当前接口与 Tardis/Kaiko 候选；当前全部为 `RESEARCH_ONLY`，未把厂商宣传、当前 snapshot 或 archive presence 当成历史证明。

### 核心链路影响

加固 `全市场发现 -> 候选筛选 -> 复盘进化/Research Governance` 的历史 Universe 真值，防止幸存者偏差、错误合约、晚到知识和无权数据污染 Detector 验收。未新增真实发现能力，未生成 Candidate、Signal、等级或计划。

### 测试结果

- B0.2-A 定向：35/35 PASS，覆盖 Agent 自批、exact operator/双数据范围、过期权利、当前快照倒推、provider 漂移、状态缺口、晚到知识、symbol reuse、下架矛盾、unknown knowledge-time bulk 阻断和防篡改。
- 完整 `ci:production` PASS（exit 0）：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 242 total / 237 pass / 0 fail / 5 explicit skip、M0 10/10、Next build、Golden 16/16、禁文件/secret/security 全部通过。
- 第一次全 V2 回归因 Research 注册表持有 OKX provider host 而 1 fail；未加白名单，改用官方 SDK 非运行证据引用后复跑通过。
- `backtest:formal`、production smoke、live、Shadow、holdout 未运行；本轮不是能力或部署验收。

### 是否部署

未部署。未连接生产，未修改 DB、Redis、Worker、migration、env、Feature Flag、前端、API 或 secret。

### 风险与遗留问题

- 人工作源权利仍 `PENDING`，合格 point-in-time 历史来源数量仍为 0；exact operator、历史行情 + instrument reference 双范围、provider 和 knowledge-time 任一不明时，bulk/cohort 正确保持 blocked。
- 当前接口只能从捕获日起积累未来历史，不能回填过去；Tardis/Kaiko 仍需精确合同/SLA、技术抽样与权利审查。
- L2 Liquidity Shift 的历史能力仍未解决，五个 Detector 仍 DRAFT，Candidate emission=false。

### 下一轮建议

本地只执行 `V2-M2.2-B0.2-C-FIRST-PARTY-FORWARD-INSTRUMENT-CAPTURE`；外部并行解决 `B0.2-B` 的精确权利和合格历史来源，二者都不得伪装成已解锁 B1。

## 2026-07-20 / V2 M2.2-B0.1 Target-Blind Diagnostic Strength and Construction Policy Freeze

### 本轮目标

为五个 DRAFT Detector 建立不读取 target/future 的可解释相对规则强度和固定分母 Top20，并把历史 cohort 的标签、匹配、背景、分层、knowledge-time、split 与全部试验锁成不可漂移政策。

### 修改范围

- DRAFT evaluation 新增 strict diagnostic strength：组件规则边际、质量/方向乘数、veto/unavailable 不可排名、内容摘要和防篡改；明确不是概率、置信度、等级或交易结论。
- 新增 fixed-detector-denominator Top20：同 cutoff、同 identity、稳定 SHA-256 tie-break、完整分母计数，禁止 Outcome、随机数和 symbol 顺序。
- 冻结 TRAIN-only 六维 nearest-rank P99 与绝对底线、matched control、300 秒完整背景、pre-cutoff regime/liquidity、observed/modeled knowledge-time、24h purge/embargo 和 1 baseline + 4 sensitivity trial registry。
- 历史 dataset/experiment/holdout 升级到 v2，绑定全部 policy/version/digest；任意阈值、策略、trial 漏项和参数漂移 fail closed。

### 核心链路影响

加固 `全市场发现 -> 候选筛选` 的离线 Research 评价基础，防止未来信息、病例选择和临时改规则抬高 Detector 表现。未构造真实 cohort，未生成 Candidate、Signal、等级或计划。

### 测试结果

- DRAFT strength/ranking：23/23 PASS；historical construction/replay：22/22 PASS；定向合计 45/45。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 216/0/5 explicit skip、M0 10/10、Next build、Golden 16/16、禁文件/secret/security 全部通过。
- `backtest:formal`、production smoke、live、Shadow、holdout 未运行；本轮不是能力或部署验收。

### 是否部署

未部署。未连接生产，未修改 DB、Redis、Worker、migration、env、Feature Flag、前端或 API。

### 风险与遗留问题

- 真实 cohort 仍为 0；本包只证明合同和防漂移，不证明 recall、precision、lead time、Top20 质量或盈利。
- B0.2 仍缺人工 retention/replay 权利结论与 point-in-time instrument identity；B1 bulk acquisition 保持 blocked。
- Kline 仍不能支持 L2 Liquidity Shift；五个 Detector 仍 DRAFT，Candidate emission=false，M2.2 Gate=`INSUFFICIENT`。

### 下一轮建议

只进入 `V2-M2.2-B0.2-RIGHTS-AND-POINT-IN-TIME-INSTRUMENT-METADATA-RESOLUTION`；该入口受外部权利与历史身份证据阻断，Agent 不得自批。

## 2026-07-20 / V2 M2.2-B0 Historical Source Qualification and Acquisition Safety

### 本轮目标

在真实 historical cohort 下载前，把来源权利、历史合约身份、时间语义、Detector 数据覆盖、checksum、容量和原始数据边界做成 fail-closed Gate，并执行一个会自动删除原始字节的真实技术试点。

### 修改范围

- 新增严格 source qualification、source assessment、exact-object acquisition plan/preflight 和技术 pilot result 合同。
- 新增 HTTPS host allowlist、官方 SHA-256 sidecar、大小上限、受校验续传、路径逃逸、时间倒置、磁盘保留量和验证后 raw deletion 防线。
- Binance Vision 当前登记为技术 PASS、人工权利 PENDING、point-in-time instrument history 不完整；Kline 支持四个 Detector 输入建设，Liquidity Shift 因 L2 缺失保持 unsupported。
- 调整 M2.2-B 为 B0-B3 证据出口，下一本地包先补 target-blind diagnostic strength 和 cohort construction policy，不修改 Detector 生命周期。

### 核心链路影响

只加固 `复盘进化 -> Research Governance` 的真实数据入口，防止污染 Detector 评价。未生成 Candidate、Signal、等级或交易计划，未读取 Legacy/M1 runtime，未修改前端、API、DB、Redis、Worker、migration、secret 或生产。

### 测试结果

- M2.2-B0 定向合同：14/14 PASS；M2.2-A 回归 13/13 PASS。
- 真实技术 pilot：BTCUSDT 2026-06 1m 月文件 1,838,455 bytes，官方/实际 SHA-256 一致，结果 `VERIFIED_AND_RAW_DELETED`。
- 完整 `ci:production`：PASS，exit code 0；Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 194/0/5 explicit skip、M0 10/10、build、golden 16/16 和安全门禁全部通过。
- `backtest:formal`、production smoke 未运行；本轮不是能力或部署验收。

### 是否部署

未部署。原始试点数据只短暂存在于 Git 工作区外，验证后已删除；生产零连接、零命令、零变更。

### 风险与遗留问题

- retention/replay 权利仍需人工审查，不能由 Agent 根据公开可下载或仓库 MIT 文件自行批准。
- 归档 presence 不能证明历史 eligible instrument；必须补 point-in-time onboard/delist/contract/settlement/underlying/status。
- M2.1 只有 matched/no-match，没有 target-blind 强度，当前不能诚实生成 Top20 ranking。

### 下一轮建议

只执行 `V2-M2.2-B0.1-TARGET-BLIND-DIAGNOSTIC-STRENGTH-AND-CONSTRUCTION-POLICY-FREEZE`；B0.2 权利和历史合约身份可并行解决，二者都通过前禁止 bulk acquisition。

## 2026-07-20 / V2 M2.2-A Historical Replay Contract and Lifecycle Gate Harness

### 本轮目标

建立严格的真实 historical cohort 接纳、target-blind replay、统计指标和 Detector lifecycle proposal Gate，并确认当前证据能否支持晋级。

### 修改范围

- 新增来源 license/retention/replay rights、完整 Candidate 背景窗口、event/matched-control、真实 split/purge/embargo、固定 Detector 分母、holdout group isolation 与独立 custody 合同。
- 独立 custody 下主 Bundle 物理拒绝 inline holdout；Gate 只接受 digest/summary/identity 全部匹配的单次 sealed artifact。提前量改用数据真正可知的 `knowledgeCutoff`，不再用更早事件时间夸大。
- 新增每 Detector 首次发现、overall/family/detector/direction/regime/liquidity 指标、逐 stratum 门槛、Wilson CI、lead-time 秩区间、四态 Gate 和 13 项 contract-only 测试；未修改 M2.1 阈值、Legacy、M1 runtime、Frontend/API、DB/Redis/Worker、migration、secret 或生产。

### 核心链路影响

强化 `全市场发现 -> 候选筛选` 的能力验收，禁止用成功样本、病例对照采样比例、future label 或伪 holdout 抬高 Detector 表现。本轮仍不生成 Candidate、Signal 或 Plan。

### 测试结果

- M2.2-A 13/13、M2.1 10/10、M2.0 16/16 PASS。
- 全 V2：185 total / 180 pass / 0 fail / 5 explicit external-dependency skips。
- Legacy 965/0/4、Worker 23/23、Historical 4/4、M0 10/10、Build、Golden 16/16、安全和完整 `ci:production`：PASS。
- formal 与 production smoke 未运行；真实 cohort 不存在且本轮未部署。

### 是否部署

未部署。生产零连接、零命令、零变更。

### 风险与遗留问题

- accepted real cohort=0；Legacy 回测摘要不能替代 V2 point-in-time dataset。
- Top20 ranking、threshold sensitivity、真实 untouched holdout 和独立审计未完成。
- 当前 Gate=`INSUFFICIENT`，五个 Detector 继续 DRAFT，Candidate emission=false。

### 下一轮建议

只执行 `V2-M2.2-B-REAL-HISTORICAL-COHORT-ACQUISITION-AND-FREEZE`；先冻结来源权利、完整背景/事件/对照、真实 split 与独立 holdout artifact，本包不得打开 holdout。

## 2026-07-20 / V2 M2.1 Pre-Move and Breakout/Retest DRAFT Replay Kernels

### 本轮目标

实现最早两类机会的五个独立 DRAFT 纯函数内核，证明双 cutoff 输入、长短非对称、UNKNOWN/冲突、veto、缺失降级、确定性和篡改防线，同时拒绝用合成样本夸大 Detector 能力。

### 修改范围

- 新增三个 Pre-Move 内核：Compression、Flow Divergence、Liquidity Shift；新增 Breakout Edge 与 Role-Flip Retest 两个内核。
- 阈值版本固定标记 `UNCALIBRATED_DRAFT_THRESHOLDS`；Detector lifecycle=DRAFT、candidateEmissionAllowed=false、runtimeReadAllowed=false。
- 输入要求 observation 唯一、FeatureSet lineage、event cutoff 和 value-quality 一致；输出重算 digest/ID，并锁定 detector/version/family/pattern 注册身份。
- 长短规则使用独立 semantic key；late/noise/fakeout veto 优先，缺少相反方向数据不会被静默写成 NO_MATCH。
- 未修改 Legacy、M1 runtime、Deep、Analysis、Strategy、Outcome、前端、API、DB、Redis、Worker 或生产。

### 核心链路影响

在 `Multi-Opportunity Detection` 内形成 Pre-Move 与 Breakout/Retest 的 DRAFT 计算地基。本轮不发 Candidate，不产生 Signal、等级、READY 或交易计划，不证明真实市场发现率。

### 测试结果

- M2.1 定向 10/10；M2.0 回归 16/16；`typecheck`、`lint` PASS。
- 全 V2：172 tests / 167 pass / 0 fail / 5 explicit external-dependency skips。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、历史回测 4/4、全 V2 167/0/5 skip、M0 10/10、build、golden 16/16 和安全门禁全部通过。
- `backtest:formal`、live、Shadow、production smoke 和 migration 未运行。
- 首次 typecheck 拒绝通用 number/boolean probe；已拆分类型安全 probe。反审计另补 evaluation digest 重算与 Detector 注册身份防篡改。

### 是否部署

未部署。没有读取 M1 authority、写 Candidate、升级 Detector 生命周期或改变生产。

### 风险与遗留问题

- 阈值尚未在真实冻结 historical cohort 上校准，禁止部署或据此交易。
- 缺少 event/candidate/matched-non-event 三分母、regime/direction 分层指标、threshold sensitivity 和 untouched holdout。

### 下一轮建议

只执行 `V2-M2.2-HISTORICAL-REPLAY-AND-DETECTOR-LIFECYCLE-GATE`；真实 replay 未过线前保持 DRAFT 和 Candidate 禁发。
