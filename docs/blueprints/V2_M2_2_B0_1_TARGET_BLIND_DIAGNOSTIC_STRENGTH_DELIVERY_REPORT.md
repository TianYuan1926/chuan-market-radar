# 本轮交付报告

任务：`V2-M2.2-B0.1-TARGET-BLIND-DIAGNOSTIC-STRENGTH-AND-CONSTRUCTION-POLICY-FREEZE`

日期：2026-07-20

## 1. 本轮目标

为五个未校准 DRAFT Detector 增加只使用 cutoff 时已知 observation 的可解释相对规则强度与固定分母 Top20，并冻结真实历史 cohort 后续必须遵守的标签、匹配、完整背景、分层、knowledge-time、split 和 trial registry，防止未来结果、样本选择或临时换规则制造虚假能力。

## 2. 范围边界

本轮只改 V2 DRAFT replay diagnostics、离线历史 Research 合同、测试和权威工程文档。未下载真实 bulk 数据、未构造真实 cohort、未打开 holdout、未改 Detector 生命周期、未写 Candidate、未接 M1/Legacy runtime，未改前端、API、DB、Redis、Worker、migration、env、Feature Flag、secret 或生产。

## 3. 修改文件清单

- `src/v2/modules/detection/draft-diagnostic-strength-contract.ts`：相对规则边际、组件重算、质量/方向乘数和不可排名语义。
- `src/v2/modules/detection/draft-diagnostic-ranking.ts`：固定 Detector 分母、同 cutoff 分组、有限共识加成、稳定 tie-break、精确 Top20 与内容寻址报告。
- `src/v2/modules/detection/draft-replay-contract.ts`：DRAFT evaluation v2 绑定 diagnostic strength 与输入摘要。
- `src/v2/modules/detection/draft-replay-kernels.ts`：五个内核生成可审计组件；veto、no-match、unavailable 永不进入排名。
- `src/v2/modules/detection/draft-replay-kernels.test.ts`、`draft-diagnostic-ranking.test.ts`：强度、长短、质量、UNKNOWN、veto、分母、Top20、确定性和防篡改回归。
- `src/v2/research/historical-cohort-construction-policy.ts`：TRAIN-only 六维事件阈值、matched/background、pre-cutoff 分层、knowledge-time、split 与 1+4 trial registry。
- `src/v2/research/historical-replay-contract.ts`：dataset/experiment/holdout v2 强制绑定全部政策和阈值 registry。
- `src/v2/research/historical-replay-gate.ts`：实验、manifest 与 sealed holdout 的构造政策一致性验证。
- `src/v2/research/historical-cohort-construction-policy.test.ts`、`historical-replay-gate.test.ts`：阈值、策略、knowledge-time 和 trial drift 反例。
- `src/v2/governance/m0-exit-validator.ts`：下一入口改为受外部证据阻断的 B0.2。
- `package.json`：定向入口包含 ranking 与 construction policy 测试。
- `docs/architecture/v2/*`：新增 B0.1 合同并更新 M2.2/B0 当前边界。
- `docs/blueprints/*`、`market-radar-v2-build-sequence.md`：蓝图 v1.3、机器矩阵 v1.5、状态、施工顺序和本报告。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：当前事实、风险、证据和下一入口。

## 4. 对核心链路的影响

加固 `全市场发现 -> 候选筛选 -> 复盘进化/Research Governance` 的离线验收基础。系统现在可以在不读取结果的前提下比较“命中规则有多深”，并预先锁死样本构造方式；但没有真实 cohort，所以没有新增真实发现能力证据。

## 5. 分层边界影响

- scan：只改 DRAFT replay diagnostic，不接生产 scan。
- analysis / strategy / backtest：未改生产逻辑；formal 未运行。
- Candidate：schema 和 runtime 均未接线，`candidateEmissionAllowed=false`。
- frontend / API：未改。
- DB / Redis / worker / deployment / secret：未涉及。
- holdout：只加强合同，未创建、未读取。
- production：零连接、零命令、零变更，当前终态仍 UNKNOWN。

## 6. 风险说明

- diagnostic strength 只是相对规则边际，不是概率、置信度、Evidence Grade、Setup Grade 或交易等级。
- 合成 fixture 只证明合同；真实 recall、precision、lead time、Top20 late/noise 和盈利均未证明。
- B0.2 仍缺人工 retention/replay 权利结论与 point-in-time onboard/delist/contract/settlement/underlying/status，B1 bulk acquisition 继续 blocked。
- Kline 仍不能支持 L2 Liquidity Shift，该 Detector 的真实来源能力保持 unsupported。
- modeled knowledge time 必须持续显示 `MODELED_NOT_OBSERVED`，不能冒充 receivedAt。

## 7. 执行命令

```bash
npm run typecheck
npx eslint <本轮 TypeScript 文件>
npm run test:v2-m2-replay-kernels
npm run test:v2-m2-historical-replay
npm run ci:production
git diff --check
node -e "JSON.parse(...)"
```

未执行 `npm run backtest:formal`、production smoke、Shadow、migration 或任何生产命令。

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- DRAFT strength/ranking：23/23 PASS。
- Historical construction/replay：22/22 PASS。
- `npm run test:market`：969 total / 965 pass / 0 fail / 4 skip。
- Worker：23/23 PASS；Legacy historical：4/4 PASS。
- `npm run test:v2-foundation`：221 total / 216 pass / 0 fail / 5 explicit external-dependency skips。
- `npm run v2:m0:verify`：10/10 PASS，nextEntry=B0.2 blocked on external evidence。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- forbidden files、secret patterns、security：PASS。
- 完整 `npm run ci:production`：exit code 0。

## 9. 失败项

最终失败项为 0。

开发中第一次 construction 定向测试为 21/22：生产代码正确拒绝缺失阈值维度，但测试断言没有包含 Zod 的 `Too small` 文案。只修正测试正则后重跑 22/22 PASS，没有放宽 schema、阈值或业务门禁。合同升级后旧合成 fixture 也曾被 typecheck 正确拒绝，随后补齐冻结政策字段，没有添加兼容旁路。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，384 行，未超过 400 行上限。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，仍只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入 B0.2 证据解决工作；不可以进入 B1 bulk acquisition、B2 cohort、holdout、Detector lifecycle、Candidate runtime 或生产发布。B0.2 目前受外部人工权利结论和历史 instrument identity 来源阻断。

## 13. 下一轮建议

只处理 `V2-M2.2-B0.2-RIGHTS-AND-POINT-IN-TIME-INSTRUMENT-METADATA-RESOLUTION`：先获得合格人工权利结论和历史合约身份来源。不得由 Agent 根据公开下载、仓库许可证、当前 snapshot 或 archive presence 自行批准。
