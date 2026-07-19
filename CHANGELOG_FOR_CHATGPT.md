# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

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

## 2026-07-20 / V2 M0 Runtime Boundary and Engineering Exit

### 本轮目标

完成 M0.3：把 Legacy Atlas 展开到真实消费者，为每个 V2 权威产物建立运行时输入边界，并用机器出口证明 M0 地基本地闭环。

### 修改范围

- 新增覆盖 22 个 Legacy capability 的 Extraction Policy 和 Consumer Map，记录 539 个源文件、273 条直接运行消费者边、118 条测试消费者边、109 个运行入口、13 个提取候选和 21 个存储对象。
- 新增 30 个 authority output 的 strict Zod schema、29 个 envelope 的精确版本注册表、统一 Registry 与跨 API/进程/存储/回放 fail-closed decoder。
- decoder 拒绝不完整 READY、WAIT 携带计划、RR 低于 3、结构几何错误、时间倒流、未知字段、负金额、恶意对象、循环/稀疏数组、过大载荷和错误 JSON，并避免回显原始敏感值。
- 新增 M0 十项出口验证器并接入 `ci:production`；未修改 Legacy 运行逻辑、数据库、Redis、Worker、前端、API 或生产配置。

### 核心链路影响

为后续 Universe、Fact、Candidate、Evidence、Decision、Risk、Outcome 和 Runtime Truth 建立同一套不可绕过的结构边界，同时把旧能力的提取、隔离和删除条件变成可审计事实。本轮不新增真实市场发现或交易计划能力。

### 测试结果

- `test:v2-foundation`：38/38 PASS。
- M0 机器出口：10/10 PASS，状态 `PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED`。
- `test:market`：核心 965 pass / 0 fail / 4 explicit skip；workers 23/23；historical 4/4。
- `typecheck`、`lint`、`build`、`backtest:golden` 16/16：PASS。
- `ci:forbidden-files`、`ci:secret-patterns`、`security:check`、完整 `ci:production`：PASS。
- `backtest:formal` 与 production smoke：未运行；本包不属于 formal 能力验收且生产零变更。

### 是否部署

未部署。未连接或修改腾讯云、数据库、Redis、Worker、Compose 或 GitHub main；生产终态继续为 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。

### 风险与遗留问题

- M0 完成的是本地工程地基，不是实战能力；V2 尚无真实 provider、Fact 流、Feature、Detector、Decision、UI 或生产 authority。
- Consumer Map 不等于允许删除 Legacy；任何删除仍要求消费者清零、replacement 稳定、absence test 和回滚证据。

### 下一轮建议

只执行 `V2-M1.1 Three-Venue Identity and Fact Slice`，先做三家 CEX 同一 BTC 线性永续的只读身份、事实与质量纵切。

## 2026-07-20 / V2 M0 Clean Foundation Start

### 本轮目标

把 V2 从设计授权推进到干净、可验证的工程起点：冻结正确搭建顺序、隔离 Legacy、建立首批领域合同和研究边界，并立即启动 M1 地基纵切契约。

### 修改范围

- 从最新 `origin/main@e5eb900` 创建 `codex/market-radar-v2-implementation`，只带入 V2 当前设计提交，未继承归档分支下的 70 个 Legacy G0 施工提交。
- 新增 M0 基线 Manifest、干净基线 ADR、Legacy Capability Atlas、事件/提前发现定义、数据能力与回放基线、M1 地基纵切契约。
- 新增 `src/v2` 产品宪法、18 Module 注册表、状态/不确定性/权威产物合同、Strategy READY 领域语义守卫、评估专用事件标签和显式 synthetic 测试 fixture。
- 增加 V2 架构边界与合同测试，并接入 `ci:production`；未修改 Legacy 运行逻辑、数据库、Redis、Worker、前端或生产配置。

### 核心链路影响

建立全市场发现之前的身份、事实、质量、特征和上下文地基，并锁死 Candidate 不等于 Signal、未来结果不进入实时链路、只有完整且净 RR 不低于 3:1 的最终决策才能 READY。本轮不声称已具备实战发现能力。

### 测试结果

- `test:v2-foundation`：18/18 PASS。
- `typecheck`、`lint`、`build`：PASS。build 首次受限网络无法读取现有 Google Fonts，开放构建网络后同一命令 PASS，未改配置规避。
- `test:market`：核心 965 pass / 0 fail / 4 explicit skip；workers 23/23；historical 4/4。首次沙箱运行只有 2 个 Worker 因本机监听 EPERM 失败，受控回环环境同一命令重跑后 PASS。
- `backtest:golden`：16/16 PASS。
- `ci:forbidden-files`、`ci:secret-patterns`、`security:check`：PASS。
- `ci:production` 聚合门禁：端到端 PASS，确认 V2 foundation 测试已进入正式流水线。
- `backtest:formal`：未运行，按规则禁止。
- production smoke：未运行，生产零变更。

### 是否部署

未部署。腾讯 OrcaTerm 当时显示 0 个已连接会话且无连接配置，因此生产状态保持 `UNKNOWN / NO_ACTIVE_READ_CHANNEL / PRODUCTION_UNCHANGED`。

### 风险与遗留问题

- 该轮结束时 M0 尚未完成；Legacy Consumer Map 和运行时 schema 边界现已由本日志最上方一轮完成，首条真实数据纵切仍待实现。
- synthetic fixture 仅用于合同测试，架构测试禁止其进入生产运行时。
- 当前无法证明腾讯云生产的 fresh health、release identity、Postgres、Redis 或 Worker 状态。

### 下一轮建议

该建议已由本日志最上方一轮执行并通过；当前下一入口以最上方记录的 `V2-M1.1` 为准。

## 2026-07-20 / Active Memory, Blueprint v1.1 and Workspace Cleanup

### 本轮目标

重构当前记忆和 V2 搭建蓝图，删除已确认的重复文档和可进入运行时的预览 mock seed，确保只有一个当前事实入口、一个活跃蓝图和一个机器矩阵。

### 修改范围

- V2 蓝图升级为 v1.1：18 个单一权威 Module、5 维状态、4 类不确定性。
- 新增 Point-in-Time Feature、Opportunity Thesis、Execution Feasibility、Portfolio Risk、Outcome/Research 分离、端到端延迟、冷启动、漂移、校准和注意力预算。
- 重写 `PROJECT_CONTEXT_FOR_CHATGPT.md`、本文件和蓝图 README，删除失效周期流水账。
- 删除被 V2 v1.1 吸收的两份未提交重复蓝图草案。
- 移除 `ENABLE_PREVIEW_SEED_DATA` 及 app repository 的 mock journal seed 入口；保留明确测试用 mock provider。
- 未修改交易逻辑、数据库 schema、Redis、Worker、Compose、Feature Flag、secret 或生产。

### 核心链路影响

建立全市场发现到复盘进化的唯一目标链，并清除可能让 mock journal 进入运行时持久化仓库的入口。本轮不提升实际发现、分析或策略能力。

### 测试结果

- 文档、JSON、链接、权威唯一性和 obsolete reference：PASS。
- 机器矩阵：18 Module / 5 state / 4 uncertainty / 6 family / 8 milestone，PASS。
- Context 332 行、Changelog 5 条，PASS。
- mock seed 定向回归：59/59 PASS。
- `typecheck`、`lint`、`build`：PASS。
- `test:market`：核心 1027 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4。沙箱首次因禁止监听本机端口导致 workers 2 个 EPERM，按同一命令在受控环境完整重跑后 PASS。
- `backtest:golden`：16/16 PASS。
- `ci:forbidden-files`、`ci:secret-patterns`、`security:check`：PASS。
- `backtest:formal`：未运行，按规则禁止。
- production smoke：未运行，本轮生产零变更。

### 是否部署

未部署。变更只进入独立 `codex/` 分支，不合入 GitHub main，不改变腾讯云。

### 风险与遗留问题

- 当前生产终态没有新鲜只读证据，保持 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。
- Legacy 代码和治理脚本只能在 Capability Atlas 与 replacement 稳定后逐项退役，不能批量删除。
- V2 仍未实施，设计完成不等于系统能力提升。

### 下一轮建议

只启动 `V2-M0.1 Product Constitution + Domain Contract + Legacy Capability Freeze`。

## 2026-07-20 / V2 Controlled Replacement Blueprint v1.0

### 本轮目标

根据用户重新确认的核心使命和全系统审计，设计提取有效地基、重建错误职责、逐 authority 切换的新 V2，而不是继续无限修补 Legacy。

### 修改范围

- 建立 V2 产品使命、目标市场范围、六个机会族、研究验证、运行安全和 M0-M7 路线。
- 建立初版 14 Module 蓝图和机器追踪矩阵。
- 未修改业务代码、数据、部署或生产。

### 核心链路影响

首次把“爆发前发现优先、其他结构机会全面覆盖、严格交易计划、真实持续进化”收敛为受控替换架构。

### 测试结果

- 初版 JSON、Markdown、链接和授权边界检查：PASS。
- 代码门禁：未运行，初版为纯设计轮。
- production smoke/formal：未运行。

### 是否部署

未部署。

### 风险与遗留问题

初版仍缺少统一特征权威、执行可行性、组合风险、评估/研究隔离和漂移治理，已在 v1.1 补齐。

### 下一轮建议

已由本日志上一轮的 v1.1 cleanup 取代。
