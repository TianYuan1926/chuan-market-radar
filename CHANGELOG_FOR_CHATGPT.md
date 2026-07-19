# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

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

## 2026-07-19 / Cycle-7 Production Start, Latest Recorded Fact

### 本轮目标

在 Cycle-6 Legacy pending drain PASS 后，以 fresh preflight 启动相邻 Cycle-7 生产观察。

### 修改范围

- 使用绑定身份、一次性 request、transport bundle 和 transient unit 启动 Cycle-7。
- observer 随后进入后台采样。

### 核心链路影响

只验证 Candidate Episode 当前周期迁移安全，不新增信号、不改变排序、不生成计划。

### 测试结果

- 即时启动：`PASS_IMMEDIATE_CYCLE_CONTINUATION_AWAITING_FRESH_ACTIVATION_AND_REAL_WRITE_ACCUMULATION`。
- 最后记录：至少 sample 3，状态仍 `IN_PROGRESS_FRESH_ACTIVATION_AND_ACCUMULATION`。
- 24 小时、289 样本、10,000 writes final：当前仓库没有终证据。

### 是否部署

已在当时腾讯云生产执行 Cycle-7 启动。该事实只描述 2026-07-19 当时，不代表当前仍运行。

### 风险与遗留问题

- 当前终态未知；下一生产动作必须 fresh read-only verify。
- 不得把即时 PASS 或 sample 3 冒充 Cycle final/G0 PASS。

### 下一轮建议

若继续 Legacy 生产线，先只读核验 Cycle-7 和当前 release，不直接复用旧身份。

## 2026-07-19 / Cycle-6 Legacy Pending Drain Production

### 本轮目标

精确清理 Cycle-6 失败后留下的 48 条 Legacy pending，恢复冻结且可审计的干净 baseline。

### 修改范围

- 只处理目标 Legacy pending；Candidate Worker 保持 absent。
- 数据库最终记录 Legacy pending/unresolved 为 0，Candidate event mirror 仍保持待后续周期处理。

### 核心链路影响

恢复 Candidate 生命周期迁移基线，不改变 scan、analysis、strategy 或前端事实。

### 测试结果

- 最终 evidence：`PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN`。
- production health、关键合同、Postgres、Redis 和租约验证在当时通过。

### 是否部署

已在当时腾讯云生产执行。

### 风险与遗留问题

该 PASS 只证明 drain，不证明 Cycle-7、Shadow Verify、Canonical、G0 或当前生产状态。

### 下一轮建议

该建议已被后续 Cycle-7 启动执行；当前只保留历史审计价值。

## 2026-07-19 / Cycle-7 Local Handoff Contract Refresh

### 本轮目标

在观察等待期把 Lineage/Reconciliation、Shadow Verify 和 Canonical Compat 的本地合同从旧 Cycle-5/6 身份刷新到 Cycle-7，避免未来现场被旧绑定阻断。

### 修改范围

- 更新 governance validator、production shell、handoff 合同和 boundary tests。
- 基础、市场、Golden 和安全门禁在当时通过。
- 未连接或修改生产。

### 核心链路影响

只准备 Candidate 生命周期后续生产 Gate，不新增信号、不改变排序、不生成计划。

### 测试结果

- 相关定向测试和 validator：PASS。
- `typecheck / lint / test:market / build / backtest:golden`：PASS。
- production smoke/formal：未运行。

### 是否部署

未部署。

### 风险与遗留问题

本地准备不能冒充生产 Gate PASS；这些 Legacy 合同现在只作历史安全参考。

### 下一轮建议

当前 V2 路线优先；只有明确继续 Legacy 生产关闭线时才重新验证这些包。
