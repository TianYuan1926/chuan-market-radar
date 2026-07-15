# 本轮交付报告

## 1. 本轮目标

把 2026-07-12 的 Activation/Observation 本地准备实现移植到当前 `main`，并按现行生产标准补齐 session-independent 执行、仓库外 lease/fencing、clean detached Git、精确旧 Web 镜像留存、24 小时 revocation 感知观察和自动回滚。当前源码授权继续为 `false`，本轮不激活生产 Candidate runtime。

## 2. 范围边界

只修改 Candidate Activation/Observation runner、治理合同、外部 lease 观察语义、隔离演练、自治状态、蓝图追踪和交接文档。未修改 scan、analysis、strategy、RR、Risk Gate、backtest 逻辑、frontend、业务 API、Compose、migration、Candidate 业务实现、数据库、Redis、生产 env、Feature Flag 或 secret；未连接或修改生产。

## 3. 修改文件清单

- `scripts/production/candidate-activation/`：重建生产入口、激活 runner、观察器、请求 validator、成功/失败/观察回归和 PG16 集成演练。
- `scripts/governance/candidate-activation-runner.mjs` 及测试：锁定 4 文件 runner、16 文件 release、systemd、lease、detached Git、回滚镜像和禁止命令。
- `scripts/governance/autonomy-production-lease*.mjs` 及自治测试：新增 `observation-checkpoint`；只容忍自然到期，不容忍 revocation。
- `scripts/rehearsal/candidate-activation-postgres16.sh`：本地 PostgreSQL 16 lifecycle 演练。
- 两份 Activation/Observation 人机合同：同步现行生产边界与 artifact checksum。
- `package.json`：增加 validator、定向测试和 PG16 rehearsal 命令。
- `AUTONOMOUS_ENGINEERING_STATE.json`、traceability、Context、Changelog：同步当前真值和下一生产顺序。

## 4. 对核心链路的影响

服务“候选筛选”和“复盘进化”的 Candidate Episode 真实采集地基。它只建立未来 Shadow Capture 的可回滚激活与观察能力，不改变全市场发现、深扫、结构分析、风险赔率或交易计划，也不产生生产 Episode/Outcome。

## 5. 分层边界影响

- scan / analysis / strategy / backtest / frontend / API：无运行行为修改。
- DB：仅隔离 PostgreSQL 16 中启动一次 control 并回滚；`productionConnected=false`。
- Redis / worker / deployment：只准备未来 Web + candidate-shadow-worker runner；生产未执行。
- secret：测试仅使用无效占位值；真实 env、URL、token、密码未读取、未打印、未提交。
- Candidate authority：当前代码常量仍为 `false`，生产 Candidate runtime 仍 disabled。

## 6. 风险说明

- Runtime Identity 尚未生产 PASS，旧 90 分钟请求已过期；Activation 生产继续硬阻断。
- 未来激活必须另建 code constant=`true` 的 exact release，并绑定新 commit、artifact、request、当前环境/Compose/身份包装器和旧 Web image ID。
- 24 小时观察不可压缩：至少 289 个 5 分钟样本、最大间隔 600 秒。自然审批到期可继续既有观察，但 revocation 必须回滚。
- `10,000 compared writes` 仍属于下一 Shadow Verify/Reconciliation Gate；本 runner 不自动推进 phase。

## 7. 执行命令

- `npm run candidate:activation-runner:validate`
- `npm run test:candidate-activation-runner`
- `npm run candidate:activation-runner:pg16-rehearsal`
- `npm run test:autonomy`
- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- `npm run security:check`
- `npm run autonomy:status`

## 8. 测试结果

- Activation validator：PASS，violations=`[]`。
- Activation 定向：17/17 PASS。
- Autonomy/lease：31/31 PASS。
- PostgreSQL 16：PASS；migration=9、control start=1、rollback=1、final=`legacy / epoch 2 / write_frozen=true`、productionConnected=false。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：960 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical smoke 4/4。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- runner artifact：`55da1aa7c6094e2b8799d68481fe641ff546f5a10eb47f7cb6cb242c6f368bcd`，4 文件。
- current Dormant release artifact：`b0baa1c09da2e8062aee0fe0c96676ce9a53dfefedff5d5ab54de6c7725a9864`，16 文件。
- production smoke：未运行，本轮禁止连接生产。
- formal：未运行，依规则禁止擅自运行。

## 9. 失败项

- 初始 validator 真实拦截旧实现的 `git merge`、生产 `main` 改写、`nohup`、缺少 lease、缺少 rollback image retention 和缺少 detached 边界；均已由新实现和回归测试关闭。
- 请求 exact-key 测试最初因新增生产身份字段失败；补齐 path/hash/unit/staging/evidence 绑定后通过。
- 构建失败 rehearsal 的旧断言错误要求未启动 control 也执行 control rollback；已改为明确禁止无意义数据库 control 写入。
- 最终审阅发现 lease 已获取但尚未消费时的失败会被错误记录为 `ROLLBACK_PASS`；现改为 `SAFE_STOP_PRE_MUTATION`。只有授权已消费或突变已开始才进入回滚结果。
- 最终审阅发现观察 PASS 后单纯清理失败可能触发健康生产回滚，且自动回滚失败仍会删除诊断现场；现改为 lease closeout 后关闭回滚 trap、清理成功后才输出 PASS，回滚失败保留现场并返回独立失败。
- 最终门禁无失败项；4 个 DB 测试为项目既有显式环境跳过，未包装成 PASS。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以结束本地准备并提交推送。不能直接执行 Activation；下一生产动作仍必须先完成 Runtime Identity 精确生产身份事务和只读验收。

## 13. 下一轮建议

只恢复 Microsoft Edge / OrcaTerm 登录，刷新 Runtime Identity 动态事实并生成唯一新的 90 分钟 exact request，执行 Runtime Identity production provision；Activation 继续保持关闭。
