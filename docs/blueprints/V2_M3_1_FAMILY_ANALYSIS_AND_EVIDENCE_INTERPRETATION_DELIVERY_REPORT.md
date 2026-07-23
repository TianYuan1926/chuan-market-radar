# 本轮交付报告

任务：`V2-M3.1-FAMILY-ANALYSIS-AND-EVIDENCE-INTERPRETATION`

状态：`LOCAL_CONTRACT_PASS / SIX_FAMILIES_LONG_SHORT_AND_INVALIDATION_PASS / TEST_ONLY_UNCALIBRATED / NO_STRATEGY_AUTHORITY / PRODUCTION_UNCHANGED`

日期：2026-07-22

## 1. 本轮目标

为六类机会建立互相独立、point-in-time、可审计的 Analysis/Evidence 解释合同，把 Opportunity Thesis、完整 Evidence Package、Market Context 与事实支撑结构位转换为 `AnalysisSnapshot v2`。

本包只解释证据，不做评级、策略或生产决策；不能把 test fixture、未校准规则或本地 PASS 包装成实战能力。

## 2. 范围边界

本轮只新增 `src/v2/modules/analysis` 下的 M3.1 policy、合同与测试，增强 AnalysisSnapshot runtime schema 和 M3.0 对 evidence completeness / analysis authority 的校验，并同步权威文档。

未修改 Legacy、M1 Collector/Store、M2 Detector 阈值或 lifecycle、真实 Deep Validation、Qualification、Strategy、Personal/Portfolio Risk、Backtest、前端、API、数据库、Redis、Worker、migration、env、Feature Flag、secret 或生产服务。

## 3. 修改文件清单

- `src/v2/modules/analysis/m3-family-analysis-policy.ts`：六族 observation dictionary、pattern 必需类别、family resolution、硬失效和 analyzer identity。
- `src/v2/modules/analysis/m3-family-analysis-contract.ts`：strict 输入、同 release/id/time 谱系、EvidenceItem 一对一解释、结构位来源、缺失/stale/冲突降级、AnalysisSnapshot v2 和不可变结果。
- `src/v2/modules/analysis/m3-family-analysis-contract.test.ts`：21 个顶层测试，覆盖六族 long/short/失效及污染、防未来、确定性边界。
- `src/v2/domain/contracts.ts`、`src/v2/runtime-schema/decision-schemas.ts`、`src/v2/runtime-schema/schema-versions.ts`：AnalysisSnapshot v2 的 evidence ids、Market Context id 与校准 authority。
- `src/v2/runtime-schema/runtime-schema-registry.test.ts`：更新唯一 AnalysisSnapshot canonical fixture。
- `src/v2/modules/decision/m3-final-decision-contract.ts` 与测试：要求 evidence 全核算，并拒绝 scope 不匹配的未校准 Analysis；M3.0 回归扩至 17 项。
- `package.json`：新增 `test:v2-m3-family-analysis`。
- `docs/architecture/v2/M3_1_FAMILY_ANALYSIS_AND_EVIDENCE_INTERPRETATION_CONTRACT_V1.md`：冻结 M3.1 职责、六族规则和未完成边界。
- 活跃蓝图、机器矩阵、施工顺序、Context、Changelog 与索引：同步唯一当前事实。

## 4. 对核心链路的影响

本轮加固：

```text
深扫验证
-> 六族结构分析
-> 后续 Evidence/Setup 评级的输入边界
```

它提高了反证保全、来源追踪和越权防线，但不证明发现率、提前率、真实策略质量或盈利能力。

## 5. 分层边界影响

- `scan / M2`：不修改，Detector 仍 DRAFT、Candidate 禁发。
- `analysis`：新增六族 test-only uncalibrated 解释层。
- `strategy`：不生成价格、RR、计划或 Action State；M3.0 只加强拒绝条件。
- `backtest`：不读取 Outcome/MFE/MAE，不修改生产排序。
- `frontend / API`：未接入，页面无权消费为交易计划。
- `DB / Redis / worker / deployment / secret`：未修改，生产零变更。

## 6. 风险说明

1. observation dictionary 与 family resolution 尚未用真实 cohort 校准，当前 authority 固定为 `TEST_ONLY_UNCALIBRATED`。
2. Evidence Package 生产链尚未建立；测试中的证据只证明合同边界。
3. Analysis 不负责 Evidence/Setup grade、执行成本、止损目标或 READY；这些缺失不能由下游 fixture 或前端补齐。
4. AnalysisSnapshot v2 是有意的 breaking schema upgrade；当前没有 V2 生产 consumer，后续任何 consumer 必须显式迁移，禁止兼容性静默降级。

## 7. 执行命令

```bash
npm run test:v2-m3-family-analysis
npx eslint src/v2/modules/analysis/m3-family-analysis-policy.ts src/v2/modules/analysis/m3-family-analysis-contract.ts src/v2/modules/analysis/m3-family-analysis-contract.test.ts src/v2/modules/decision/m3-final-decision-contract.ts src/v2/modules/decision/m3-final-decision-contract.test.ts --max-warnings=0
npm run test:v2-foundation
npm run ci:production
npm run v2:m0:verify
git diff --check
```

## 8. 测试结果

- M3.1 定向：21/21 PASS。
- M3.0 回归：17/17 PASS；合计 M3：38/38 PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：PASS；本轮压缩输出未单独保存精确计数，不伪造数字。
- 全 V2：323 total / 317 pass / 0 fail / 6 explicit external-dependency skip。
- V2 ops：115/115 PASS，Go helper PASS。
- M0：11/11 PASS。
- production build：PASS。
- Golden：16/16 PASS。
- security：PASS。
- `backtest:formal`：未运行，本轮不应运行。
- production smoke：未运行，本轮未部署。

## 9. 失败项

首次编译暴露两处旧 AnalysisSnapshot fixture 不满足 v2 新字段；已升级 canonical 与 M3 fixture，没有放宽 schema。重构前实现文件职责过宽，已拆分为独立 policy 与 contract；最终定向和完整 CI 均无失败。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：新增 M3.1 local contract truth，并明确真实校准、Qualification、Strategy、runtime 和生产 authority 仍未完成。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并继续只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以继续 `M3.2-EVIDENCE-AND-SETUP-QUALIFICATION-CONTRACT` 的本地工程；不可以进入 M3 runtime、页面、生产 READY 或 authority 切换。

生产串行线仍只能在动作时点确认后执行 exact-plan STS、受限上传、真实 P0R-C 与 cleanup；随后才可刷新 topology 并重跑 fresh P0。

## 13. 下一轮建议

本地工程只进入 M3.2 Evidence/Setup 双评级与校准资格合同；生产线保持 P0R 单一 WIP，禁止跨过 fresh P0 启动 migration。

## 14. 后续 schema 说明

M3.2 已把 Evidence Package 升级到 v2、Analysis Snapshot 升级到 v3，并加入 required/supplemental evidence、independence groups 和 `spaceQuality`。本报告保留 M3.1 当时的 v2 交付事实；当前 consumer 必须服从最新 runtime schema，不得继续生成旧 v2 Analysis。
