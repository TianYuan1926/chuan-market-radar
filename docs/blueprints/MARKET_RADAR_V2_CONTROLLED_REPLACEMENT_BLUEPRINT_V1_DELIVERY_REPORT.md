# Market Radar V2 蓝图 v1.1 与活跃记忆清理交付报告

日期：2026-07-20

## 1. 本轮目标

把项目的活跃记忆、搭建蓝图和本地工作台收口为最新单一真相：删除重复蓝图和失效施工流水账，补齐 V2 专业架构缺口，并移除可把 mock journal 注入应用持久化仓库的预览入口。

## 2. 范围边界

本轮允许：

- 重写 Context、Changelog 和蓝图索引。
- 把 V2 蓝图从 v1.0 升级为 v1.1 并同步机器矩阵。
- 删除已被 v1.1 完整吸收、没有代码消费者的两份未提交重复蓝图。
- 封存旧 G0 自动蓝图和旧机器矩阵。
- 最小删除 app repository 的 preview mock seed 运行时入口及环境开关。
- 清理本地可再生成的 `.tmp` 和 `.DS_Store`，不碰受管工作树和历史证据。

本轮禁止：

- 修改扫描、分析、策略、RR、Risk Gate、Candidate 或 Outcome 业务逻辑。
- 修改数据库 schema、migration、Redis、Worker、Compose、Caddy、Feature Flag 或 secret。
- 连接、上传、部署或修改腾讯云生产。
- 批量删除用途不明的 Legacy 代码、治理脚本、历史报告或证据。

## 3. 修改文件清单

| 文件 | 修改原因 |
| --- | --- |
| `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md` | 升级为 v1.1 当前唯一设计权威 |
| `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json` | 同步 18 Module、5 状态、4 不确定性和 M0-M7 机器合同 |
| `docs/blueprints/README.md` | 只保留一个当前权威解析入口 |
| `PROJECT_CONTEXT_FOR_CHATGPT.md` | 从 1,479 行旧流水账压缩为当前事实说明书 |
| `CHANGELOG_FOR_CHATGPT.md` | 从 7,534 行压缩为最近 5 个重要变化 |
| `docs/blueprints/MARKET_RADAR_G0_G8_AUTONOMOUS_EXECUTION_BLUEPRINT_V1.md` | 明确封存为 Legacy 历史参考 |
| `docs/blueprints/market-radar-blueprint-traceability.v1.json` | 指向当前 V2 replacement matrix |
| `src/lib/persistence/app-repository.ts` | 永久使用空初始 journal，不再读取 preview mock seed |
| `.env.example` | 删除 `ENABLE_PREVIEW_SEED_DATA` 运行时开关 |
| `src/lib/api/repository-hygiene.test.ts` | 回归保护 app repository 与 env 不再出现该入口 |
| 本报告 | 提供本轮中文证据入口 |

已删除但未进入 Git 历史的重复草案：旧 G0-G8 模块化搭建草案及其 v2 机器矩阵。两者内容已被当前 V2 v1.1 吸收，不再保留可被 authority resolver 误选的路径。

测试用 `mock-market-provider.ts` 仍保留，因为它只被测试引用，provider registry 已有防止生产导入的回归断言。未把测试夹具误删成“污染”。

## 4. 对核心链路的影响

目标链路现在明确为：

```text
Universe -> Fact -> Feature -> Context -> Detection
-> Candidate + Thesis -> Deep -> Analysis
-> Evidence/Setup Grade -> Strategy Draft
-> Execution Feasibility + Final Decision
-> Personal/Portfolio Risk -> Snapshot/Alert
-> Outcome Evaluation -> Research Governance
```

本轮只改变设计权威和 mock seed 边界，不提升生产发现率、提前率、分析质量或交易结果。

## 5. 分层边界影响

| 分层 | 本轮影响 |
| --- | --- |
| SCAN | 只更新目标合同，未改实现 |
| ANALYSIS | 只更新目标合同，未改实现 |
| QUALIFICATION | 明确 Evidence Grade 与 Setup Grade 分离 |
| STRATEGY | 拆为 Draft 与 Execution/Final Gate，未改运行代码 |
| RISK | 新增目标 Portfolio Risk，未改运行代码 |
| REVIEW/RESEARCH | 目标职责分离，未改运行代码 |
| Frontend/API | 未改页面或 API；只改 app repository 初始化 |
| DB/Redis/Worker/Deployment | 零变更 |
| Secret | 未读取、未输出、未修改真实值 |

## 6. 风险说明

- 当前生产终态没有新鲜证据，必须保持 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。
- preview mock seed 只在当前本地分支移除，尚未部署，不能声称生产已变化。
- Legacy 多路径和过宽职责仍真实存在；没有 Capability Atlas 和稳定 replacement 前不能批量删除。
- V2 v1.1 是设计权威，不是实现或盈利证明。
- Context 精简删除的是活跃记忆副本，不是 Git 历史和审计证据。

## 7. 执行命令

本轮使用：

```text
git status / diff / log / ls-files / worktree
rg / rg --files / find / sed / nl / wc / awk
Node JSON、Markdown、链接和架构矩阵检查
npm 定向测试与基础门禁
```

没有运行 SSH、OrcaTerm、migration、Docker production mutation 或 formal backtest。

## 8. 测试结果

| 检查 | 结果 |
| --- | --- |
| V2 traceability JSON 与旧矩阵 JSON | PASS |
| 18 Module / 5 state / 4 uncertainty / 6 family / 8 milestone | PASS |
| Markdown H1、围栏与本地链接 | PASS |
| Active authority 唯一性与 obsolete reference | PASS，obsolete reference=0 |
| Context <=400 行 / Changelog <=5 条 | PASS，332 行 / 5 条 |
| mock seed 定向回归 | PASS，59/59 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:market` | PASS，core 1027/0/7 explicit skip；workers 23/23；historical 4/4 |
| `npm run build` | PASS |
| `npm run backtest:golden` | PASS，16/16 |
| `npm run ci:forbidden-files` | PASS |
| `npm run ci:secret-patterns` | PASS |
| `npm run security:check` | PASS |
| `npm run backtest:formal` | 未运行，按规则禁止 |
| production smoke | 未运行，本轮生产零变更 |

## 9. 失败项

`npm run test:market` 首次在默认沙箱运行时，核心测试 1027/0/7 explicit skip 已通过，但 2 个 worker 测试因沙箱禁止监听 `127.0.0.1` 报 `EPERM`。没有改代码或放宽断言；在允许本地回环端口的受控环境用原命令完整重跑，workers 23/23 与整个 `test:market` PASS。该失败归类为执行环境限制，不包装成首轮 PASS。

第一次本地残留检查在 zsh 循环中误用特殊变量名 `path`，导致该命令后半段的 `git/rg` 未执行。没有文件被改坏；改用普通变量名后从头重跑，obsolete authority、runtime flag、generated residue、worktree prune、`git diff --check` 全部 PASS。未执行的第一次后半段没有计为 PASS。

文件暂存后第一次 `ci:secret-patterns` 将 NIST 官方网页路径中的 `sk-` 字符序列误识别为 key 前缀并 FAIL。没有修改或放宽安全脚本；蓝图改用同一官方标准的 DOI 链接，重新暂存后重跑门禁。只有重跑 PASS 才计入最终结果。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，并执行活跃记忆限长与生产未知状态规则。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入本地 `V2-M0.1`。全部本轮门禁已通过，但不自动批准 production mutation、migration、Legacy 删除或 authority 切换。

## 13. 下一轮建议

只启动 `V2-M0.1 Product Constitution + Domain Contract + Legacy Capability Freeze`。
