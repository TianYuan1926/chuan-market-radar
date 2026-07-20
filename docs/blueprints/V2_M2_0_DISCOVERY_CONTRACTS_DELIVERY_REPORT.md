# 本轮交付报告

状态：`M2.0_LOCAL_CONTRACT_PASS / FULL_CI_PASS / M1_RUNTIME_BLOCKED / PRODUCTION_UNCHANGED`

## 1. 本轮目标

冻结六类机会 taxonomy、Detector point-in-time 输入、`DiscoveryCandidate -> CandidateEpisode -> OpportunityThesis` 生命周期、去重/优先级、三层运行漏斗分母和禁止未来信息的黄金样本，为后续回放 Detector 建立不会越层的权威合同。

## 2. 范围边界

只修改 `src/v2` 的领域合同、strict runtime schema、Detection 合同、test-only fixture、定向测试、脚本和 V2 权威文档。未实现 live Detector、M1 runtime 读取、Deep Validation、Analysis、Strategy、Risk、Outcome、前端、API、数据库、Redis、Worker、Docker 或生产发布。

## 3. 修改文件清单

- `src/v2/domain/product-constitution.ts`、测试：冻结六族十四模式及 family-specific direction。
- `src/v2/domain/states.ts`：冻结 Detector emission authority 和 Candidate lifecycle transition matrix。
- `src/v2/domain/contracts.ts`：把 Candidate、Episode、Thesis 升为完整 v2 合同。
- `src/v2/runtime-schema/schema-versions.ts`、`decision-schemas.ts`、registry 测试：增加 strict v2 schema、时间/lineage/状态/refinement 门禁。
- `src/v2/modules/detection/discovery-contract.ts`、测试：Detector 输入、Candidate-input 精确核对、Episode key/关系、Bundle 和漏斗分母。
- `src/v2/modules/detection/golden-fixture-contract.ts`、测试：test-only、point-in-time、future-material 递归拒绝和六族覆盖。
- `src/v2/testing/m2-discovery-golden-fixtures.ts`：19 个显式正反例。
- `package.json`：增加 M2.0 定向测试入口。
- M2.0 合同、蓝图、机器矩阵、Context、Changelog、README、施工顺序和本报告：同步当前事实与下一入口。

## 4. 对核心链路的影响

建立 `多机会发现 -> Candidate Episode + Opportunity Thesis` 的语言、时间和生命周期边界。它让后续 Detector 能宽发现、可去重、可追溯，但本轮没有提高真实市场发现率，也没有生成 Signal、等级、READY 或交易计划。

## 5. 分层边界影响

- `scan`：只增加发现合同和 test-only 样本，不增加 live runtime。
- `analysis / strategy / backtest / outcome`：零生产逻辑变更；未来 Outcome 明确禁止进入 fixture 和 Candidate。
- `frontend / API / DB / Redis / worker / deployment / secret`：零变更。
- M1 authority：零读取；M1.5-B1/M1.7 未通过前保持 runtime blocked。

## 6. 风险说明

- 黄金样本只证明合同覆盖与反未来泄漏，不证明 Detector 精度、提前率或盈利能力。
- 三层运行漏斗不是研究评价的 candidate/event/matched-non-event 三分母；后续不得混用。
- Candidate Priority 只代表稀缺资源调度，不是证据等级、形态等级或交易建议。
- 当前仍没有 live provider、Shadow/SLO、M2 runtime、Deep Validation、页面或生产 authority 证据。

## 7. 执行命令

```text
npm run test:v2-m2-discovery-contracts
npm run test:v2-foundation
npm run typecheck
npm run lint
npm run ci:production
git diff --check
```

未执行 `backtest:formal`、live provider、production smoke、Docker、migration 或任何生产命令。

## 8. 测试结果

- `test:v2-m2-discovery-contracts`：PASS，16/16。
- `test:v2-foundation`：162 tests / 157 pass / 0 fail / 5 explicit external-dependency skips。
- `typecheck`、`lint`：PASS，lint 0 error / 0 warning。
- 完整 `ci:production`：PASS，`exit_code=0`；Legacy market 969 tests / 965 pass / 0 fail / 4 skip，Worker 23/23，历史回测 4/4，全 V2 162 tests / 157 pass / 0 fail / 5 explicit external-dependency skips，M0 10/10、生产 build、golden 16/16、forbidden files、secret patterns 与 security 全部通过。
- production smoke、`backtest:formal`：未运行，范围不允许。

## 9. 失败项

1. 首次黄金样本定向测试为 13/14：`futureMfe` 只被 strict schema 当作未知字段拒绝，未被专用 future-material 扫描分类。已扩展递归 key 规则，专用防线现在明确拒绝该类变体，没有删除测试或放宽 schema。
2. 首次最终 lint 发现一个未使用常量 import warning；已删除无效 import，最终 lint 为 0 error / 0 warning。
3. 增加 Thesis source-cutoff 负例后定向测试曾为 15/16；测试给出的 cutoff 实际仍早于检测时间，是负例本身错误。已改成真正晚于检测时间的值，schema 规则未放宽，最终 16/16 PASS。
4. 首轮完整 CI 后反审计发现，允许字段的字符串值仍可能携带 `future_outcome` 或 `quality_hit`，同时 Candidate reasons 允许重复或与 counter hints 重叠。已扩展 future-value 扫描、增加 Candidate/Episode/fixture 理由唯一性与互斥门禁，并在加固后重跑全 V2 和完整 `ci:production`，均 PASS。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新为 M2.0 本地合同 PASS、M2.1 replay-only 下一入口，并保留 M1 外部门禁和生产未知事实。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以将 M2.0 计为本地合同完成，并进入 replay-only Detector kernel。M1 未完成，M2 runtime 仍被 M1.5-B1/M1.7 阻断；不可以声明 Detector、Deep Validation、真实市场能力或生产完成。

## 13. 下一轮建议

只执行 `V2-M2.1-PRE-MOVE-BREAKOUT-REPLAY-KERNELS`：用冻结 point-in-time fixture 实现 Pre-Move 与 Breakout/Retest 的多空/未知态纯函数内核，不读取 M1 runtime、不写 Candidate Store、不生成等级或计划。
