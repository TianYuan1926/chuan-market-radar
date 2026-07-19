# 本轮交付报告

## 1. 本轮目标

修复 Current-Cycle Lineage/Reconciliation 执行链中残留的 Cycle-6/6-window 检查，使当前 G0.2 前置证据链与 Cycle-7/7-window 合同一致。

## 2. 范围边界

本轮只做本地 validator、生产 shell 输出门槛、测试和合同 hash 更新。未连接、上传或修改生产；未执行 Lineage/Reconciliation；未修改数据库、Redis、Feature Flag、scan、analysis、strategy、backtest 或前端展示。

## 3. 修改文件清单

- `scripts/governance/candidate-lineage-capture.mjs`：当前周期验证改为 Cycle-7/7-window。
- `scripts/governance/candidate-lineage-capture.test.mjs`：更新正向与旧 Cycle-6 负向测试。
- `scripts/governance/candidate-reconciliation-runner.mjs`：Lineage 边界和 rehearsal 事实改为 Cycle-7/7-window。
- `scripts/governance/candidate-reconciliation-runner.test.mjs`：更新正向与旧 Cycle-6 负向测试。
- `scripts/production/candidate-lineage/production-runner.sh`：生产输出必须为 sourceReleaseCount=7、validationCycle=7、sourceReleaseWindows length=7。
- `scripts/production/candidate-lineage/production-boundary.test.mjs`：更新生产 shell 边界测试。
- `scripts/production/candidate-reconciliation/production-runner.sh`：生产输出必须为 sourceReleaseCount=7。
- `docs/governance/wp-g0-2-current-cycle-unified-lineage-refresh-local-superpackage.v4.json`：更新 local rehearsal 和 runnerArtifact。
- `docs/governance/wp-g0-2-current-cycle-unified-lineage-capture-production-packet.v4.json`：更新 runnerArtifact。
- `docs/governance/wp-g0-2-current-cycle-unified-reconciliation-refresh-local-superpackage.v4.json`：更新 local rehearsal 和 runnerArtifact。
- `docs/governance/wp-g0-2-current-cycle-unified-reconciliation-production-packet.v4.json`：更新 runnerArtifact。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：记录真实状态。

## 4. 对核心链路的影响

影响候选筛选与复盘进化。它修复的是当前周期只读证据链的执行前置，不新增候选、不改变扫描排序、不生成交易计划。

## 5. 分层边界影响

- scan：未修改。
- analysis：未修改。
- strategy：未修改。
- backtest：未修改。
- frontend：未修改。
- API：未修改。
- DB / Redis / worker / deployment / secret：未修改生产；只改本地生产包脚本的只读结果门槛。

## 6. 风险说明

本轮是本地修复 PASS，不是生产 PASS。Lineage/Reconciliation 仍需等待 Cycle-7 final 后，在生产上独立只读执行并生成证据；不能减少 G0 主步骤。

## 7. 执行命令

- `npm run test:candidate-lineage-capture`
- `npm run candidate:lineage-capture:validate`
- `npm run test:candidate-lineage-production-packet`
- `npm run candidate:lineage-production:validate`
- `npm run test:candidate-reconciliation-runner`
- `npm run candidate:reconciliation-runner:validate`
- `npm run test:candidate-reconciliation-production-packet`
- `npm run candidate:reconciliation-production:validate`

## 8. 测试结果

- `npm run test:candidate-lineage-capture`：PASS，7/7。
- `npm run candidate:lineage-capture:validate`：PASS。
- `npm run test:candidate-lineage-production-packet`：PASS，10/10。
- `npm run candidate:lineage-production:validate`：PASS。
- `npm run test:candidate-reconciliation-runner`：PASS，16/16。
- `npm run candidate:reconciliation-runner:validate`：PASS。
- `npm run test:candidate-reconciliation-production-packet`：PASS，11/11。
- `npm run candidate:reconciliation-production:validate`：PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：PASS，1027 pass / 0 fail / 7 explicit DB skip；workers 23/23；historical 4/4。
- `npm run build`：PASS。
- `npm run backtest:golden`：PASS，16/16。
- `npm run ci:forbidden-files`：PASS。
- `npm run ci:secret-patterns`：PASS。
- `npm run security:check`：PASS。
- production smoke：未运行。

## 9. 失败项

首次验证暴露 Lineage/Reconciliation 本地与生产包 runnerArtifact hash 过期；已用当前真实文件字节更新合同 hash。测试中保留历史 Cycle-6 夹具用于旧证据拒绝，不作为当前 PASS 条件。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入下一轮本地准备；不可以执行生产 Lineage/Reconciliation 或减少 G0 主步骤。

## 13. 下一轮建议

继续扫描 G0.2 当前执行路径旧周期绑定，优先修复会阻断生产执行的 shell/runner/validator。
