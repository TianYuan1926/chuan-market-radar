# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-21 / V2 M1.5-B1-A Reachable Docker Runner Preflight

### 本轮目标

在可达隔离 Docker Runner 构建 exact source 的 M1 no-authority image，真实验证三 Venue Collector 分母、持久化、业务 readiness、证据重算与宿主机恢复。

### 修改范围

- 将技术 Runner PASS 与业务 readiness/SLO PASS 彻底分开；technical package 不得遮蔽周期 `NOT_READY`。
- preflight evidence 升级为 v2，绑定 source/image、两周期完整分母、质量原因、SLO、NO_AUTHORITY、清理与 baseline digest。
- 增加 incomplete collection、partial freshness、缺失 NOT_READY 原因和 SLO FAIL 被弱化的 anti-inflation 测试。

### 核心链路影响

加固 `全市场发现 -> Market Fact + Quality` 的 live 运行证据；未生成 Candidate、Analysis、Strategy、Backtest、页面或生产 authority。

### 测试结果

- 腾讯隔离 Runner technical PASS；exact source `97f10e75ce296b07d933e9c362c40ba2be0997ea`，evidence `sha256:a44cab89b8a4bf291e7c8f67eb6de2b76f2637f4f8265d91ebb8f1224d2a40c2` 独立重算 PASS。
- 两周期 eligible/collected 均 1,444/1,444，fresh 1,441 与 1,274，READY 0/2；业务 SLO 正确为 FAIL。
- host cleanup PASS：11 containers / 4 networks / 5 volumes 的 baseline 与 post-cleanup digest 完全一致。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 267/0/5 explicit skip、M0 11/11、build、Golden 16/16、security PASS。

### 是否部署

未部署。使用生产宿主机隔离临时 Runner，但生产服务、数据、DB、Redis、env、migration、Feature Flag、Candidate runtime 和 authority 零变更；临时执行资源已清理。

### 风险与遗留问题

- B1-A 只证明 Runner 技术链路，业务 readiness 明确 FAIL；不得宣称 M1.5-B1 或全市场健康完成。
- Binance 暴露逐 row stale/duplicate 与第二周期 fresh ratio 约 67.92%，固定节拍还有 missed start；需要 31 周期证据定性，不能先放宽门槛。
- 生产应用健康仍未做新鲜只读验证，保持 UNKNOWN。

### 下一轮建议

只执行 `V2-M1.5-B1-B0-EARLY-SHADOW-EVIDENCE-CONTRACT`：冻结 31 周期完整证据、独立业务 Gate、可恢复 Runner 与宿主机精确清理，再按原门槛实测。

## 2026-07-20 / V2 M2.2-B0.2-C1 Release-Bound Forward Capture Start

### 本轮目标

恢复可信公开市场 egress，修正真实目录暴露出的 identity/证据绑定缺口，并用同一冻结 release/config 建立两轮三 Venue 前向合约目录捕获起点。

### 修改范围

- Unicode provider identity 使用 NFC 与确定性 ASCII uppercase，不再把真实目标合约误判为 unresolved。
- identity evidence 分为 canonical target、provider-native out-of-scope 和 unresolved；范围外 row 保留全分母但不阻断目标范围连续性。
- Raw/Snapshot/Batch/Continuity/Artifact Reference/Journal 全部绑定 exact clean Git release 与冻结 config；runner 在请求前验证完整 journal chain 和 head artifact。

### 核心链路影响

加固 `全市场发现 -> Universe Registry` 的实时合约范围真值。没有进入 Candidate、Analysis、Strategy、Backtest、页面或生产 authority。

### 测试结果

- C1 定向：34/34 PASS。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 267/0/5 explicit skip、M0 10/10、build、Golden 16/16、禁文件/secret/security 全部通过。
- release `4139cc631d3d760876c3e39404c494462541a910` 两轮 Batch 均 COMPLETE；Binance/OKX/Bybit 各 2/2 complete、跨度约 368.5 秒、gap/unresolved/conflict/blocker=0，全部 `FORWARD_ONLY_READY`。
- 全链复核 14 个 normalized artifact、6 个 raw reference、5 个唯一 raw object，无 lock/partial 残留。

### 是否部署

未部署。代码已推 V2 实施分支；生产、DB、Redis、Worker、migration、env、Feature Flag、Candidate authority 和 secret 均未修改。

### 风险与遗留问题

- C1 只通过 forward capture start，不回填历史，不等于长期 SLO、historical source、Detector 或实战能力。
- B0.2-B 外部人工权利与合格历史来源仍 blocked，bulk/cohort 仍关闭。
- 本机无 Docker CLI；M1.5-B1 需在独立可达 runner 证明 exact image、Collector 四分母与有界 Shadow。

### 下一轮建议

只执行 `V2-M1.5-B1-A-REACHABLE-DOCKER-RUNNER-PREFLIGHT`：使用 branch-scoped GitHub-hosted no-authority runner 构建 exact source image 并验证三家 live Collector 四分母；PASS 后再单独启动固定 31 周期 Shadow。

## 2026-07-20 / V2 M2.2-B0.2-C First-Party Forward Instrument Capture

### 本轮目标

从真实捕获时刻起，为 Binance Futures、OKX Swap 和 Bybit Linear Perpetual 建立可审计的前向 instrument truth；明确只改善未来，不能回填历史或解锁 Detector。

### 修改范围

- 扩展现有 GET-only transport 的显式 opt-in raw bytes 捕获；默认 M1 调用不保留 raw，也不增加 SHA 开销。
- 新增三 Venue Snapshot/Batch、完整分母、identity epoch、持续缺席非 delist、coverage gap、链式 continuity checkpoint、工作区外 content-addressed store 和单写 append-only journal。
- 新增 no-authority CLI 与 anti-backfill、partial denominator、identity reuse、tamper、symlink/path escape 和 stale concurrent append 测试。

### 核心链路影响

加固 `全市场发现 -> 候选筛选 -> Research Governance` 的未来 Universe 真值，减少从捕获日起的幸存者偏差。未读取 M1 authority，未生成 Candidate、Signal、等级、READY 或计划。

### 测试结果

- B0.2-C 定向：28/28 PASS。
- 全 V2：266 total / 261 pass / 0 fail / 5 explicit external-dependency skips；完整 `ci:production` PASS，Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、M0 10/10、build、Golden 16/16、禁文件/secret/security 全部通过。
- 两轮真实本机捕获均写入正式外部 journal；Binance `provider_request_failed`，OKX/Bybit `provider_timeout`，三家 complete snapshot=0、captureStartedAt=null。这是 egress 阻断证据，不是 live coverage PASS。
- `backtest:formal`、production smoke、Shadow 和 holdout 未运行；本轮不是部署或能力晋级验收。

### 是否部署

未部署。未连接生产，未修改 DB、Redis、Worker、migration、env、Feature Flag、前端、API、Candidate authority 或 secret。

### 风险与遗留问题

- 本地工程链已形成，但没有任何完整三 Venue Snapshot；运行捕获起点仍 `BLOCKED_ON_EGRESS`。
- B0.2-B 的人工权利与合格 historical instrument source 仍 blocked；前向 capture 永远不能替代过去窗口。
- 真实 cohort=0、Gate=`INSUFFICIENT`、Detector=DRAFT、Candidate emission=false。

### 下一轮建议

只执行 `V2-M2.2-B0.2-C1-EGRESS-CAPABLE-FORWARD-CAPTURE-START`：恢复可信 egress，用同一 release 取得至少两轮完整三 Venue 前向证据；B0.2-B 外部门继续并行等待。

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
