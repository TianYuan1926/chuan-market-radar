# 本轮交付报告

任务：`V2-M3.2-EVIDENCE-AND-SETUP-QUALIFICATION-CONTRACT`

状态：`LOCAL_CONTRACT_PASS / TEST_ONLY_UNCALIBRATED / NO_DECISION_AUTHORITY / PRODUCTION_UNCHANGED`

日期：2026-07-23

## 1. 本轮目标

建立独立的 Evidence Grade 与 Setup Grade 合同，清除 Deep Validation 上游自带等级、Candidate Priority 继承、总分补偿和无样本概率等错误权威关系。

## 2. 实现内容

- `EvidencePackage v2`：删除 `tier`，新增 required/supplemental criticality 与独立来源组，严格核对 completeness 和 fresh truth。
- `AnalysisSnapshot v3`：新增显式 `spaceQuality`，六族 Analyzer 必须解释剩余空间。
- `SignalQualification v2`：新增 exact Thesis/Context/Family/Direction/Policy/Authority 谱系、独立 Evidence/Setup assessment 和双 Calibration Reference。
- 新增 M3.2 policy、strict contract、确定性内容寻址与深冻结结果。
- M3.0 新增 Qualification 身份、family、direction、scope-matched authority 和 calibration-abstain blocker。
- 校准 schema 要求 cohort、untouched holdout、至少 60 个样本、至少 3 个 regime、segment 覆盖、CI、reliability error 和无 abstain。

## 3. 核心边界

```text
Deep Validation 提供事实
-> Family Analysis 解释事实
-> M3.2 独立评估 Evidence 与 Setup
-> 后续 Strategy 才能构造计划草案
-> Final Decision 才能决定 READY
```

本包没有实现真实校准器，也没有 Strategy、执行成本、风险、runtime 或生产 authority。测试等级只属于 `TEST_ONLY_UNCALIBRATED`，不能冒充历史有效性或实战能力。

## 4. 修改范围

- `src/v2/domain/contracts.ts`
- `src/v2/runtime-schema/schema-versions.ts`
- `src/v2/runtime-schema/decision-schemas.ts`
- `src/v2/runtime-schema/runtime-schema-registry.test.ts`
- `src/v2/modules/analysis/*`
- `src/v2/modules/qualification/*`
- `src/v2/modules/decision/*`
- `package.json`
- M3 架构合同、活跃蓝图、机器矩阵、施工顺序、Context、Changelog 和索引

未修改 Legacy、M1/M2 runtime、数据库、Redis、Worker、migration、env、Feature Flag、secret、生产服务或前端。

## 5. 验证结果

- M3.2 18/18 PASS。
- M3.1 21/21 PASS。
- M3.0 18/18 PASS。
- M3 定向合计 57/57 PASS。
- `npm run typecheck`：PASS。
- 改动文件严格 ESLint：PASS，0 warning。
- 全 V2：342 total / 336 pass / 0 fail / 6 explicit external-dependency skip。
- V2 ops：115/115 PASS，Go helper PASS。
- 完整 `ci:production`：PASS。Legacy market 965/965、Worker 23/23、historical backtest、M0 11 项、Next production build、Golden 16/16 和 security 全部通过。
- 首次受限沙箱运行仅有两个 Worker 监听 `127.0.0.1` 返回 `EPERM`；未修改测试或门槛，宿主权限原样重跑 23/23 和完整 CI PASS。
- trace JSON、Context 400 行、`git diff --check`：PASS。

## 6. 风险与未完成

1. 当前 grade policy 是未校准诊断规则，不是概率模型或真实策略证明。
2. schema 接受“满足严格证据的 calibrated artifact”，但当前 builder 永远不会生成它。
3. 60 样本仅是防伪下限，不能替代分层样本充分性、holdout、漂移和独立审计。
4. M1 尚未退出，M2 Detector 仍 DRAFT/Candidate 禁发，M3 仍无 Strategy/runtime/READY authority。
5. 生产串行线仍停在 P0R fresh STS 前，生产数据、服务和权限未改变。

## 7. 下一步

本地工程只进入 `V2-M3.3-STRATEGY-CONSTRUCTION-CONTRACT`；生产线仍按 `fresh STS -> P0R restore -> fresh topology/calibration -> fresh P0` 串行推进。两条线均不得绕过各自 Gate。
