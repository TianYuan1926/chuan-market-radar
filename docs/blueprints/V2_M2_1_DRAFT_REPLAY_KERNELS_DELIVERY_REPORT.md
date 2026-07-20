# 本轮交付报告

状态：`M2.1_LOCAL_DRAFT_KERNEL_PASS / FULL_CI_PASS / NO_CANDIDATE_EMISSION / M1_RUNTIME_BLOCKED / PRODUCTION_UNCHANGED`

## 1. 本轮目标

实现 Pre-Move 与 Breakout/Retest 的五个独立 DRAFT 纯函数回放内核，证明 point-in-time 输入、方向非对称、veto、缺失降级、确定性和篡改防线，不夸大为已验证 Detector 或 Candidate 能力。

## 2. 范围边界

只修改 V2 Detection 的 DRAFT replay 合同/内核/测试、测试脚本和权威文档。未读取 M1 runtime，未修改 Legacy、Deep、Analysis、Qualification、Strategy、Risk、Outcome、前端、API、DB、Redis、Worker、Docker、secret 或生产。

## 3. 修改文件清单

- `draft-replay-contract.ts`：五个 Detector 注册、未校准规则版本、strict 输入/输出、双 cutoff、lineage、digest 和身份防线。
- `draft-replay-kernels.ts`：三个 Pre-Move 与两个 Breakout/Retest DRAFT 纯函数内核、方向分支和全族 veto。
- `draft-replay-kernels.test.ts`：黄金 case、长短非对称、UNKNOWN/冲突、阈值边界、late/noise/fakeout、unavailable、篡改和确定性负例。
- `package.json`：M2.1 定向测试入口。
- M2.1 合同、蓝图、机器矩阵、Context、Changelog、README、施工顺序和本报告：同步真实状态与下一门禁。

## 4. 对核心链路的影响

在 `Multi-Opportunity Detection` 内建立最早两类机会的 DRAFT 计算内核。它只输出无权威诊断，不产生 Candidate、Signal、等级、READY 或交易计划，也不证明真实市场发现率。

## 5. 分层边界影响

- `scan`：增加 test/replay-only DRAFT 内核；candidate emission 固定 false。
- `analysis / strategy / backtest / outcome`：零生产逻辑变更，禁止输入。
- `frontend / API / DB / Redis / worker / deployment / secret`：零变更。
- Detector lifecycle：仍为 DRAFT；没有升级到 REPLAY_VALIDATED。

## 6. 风险说明

- 当前阈值未校准，不能部署、不能发 Candidate、不能据此交易。
- 合成黄金样本与新增边界负例可能验证实现，但不能替代真实历史事件和非事件对照。
- 一个方向匹配而另一方向缺数据时只形成部分草案诊断；后续评估必须单独统计覆盖缺口。
- M1.5-B1/M1.7 未通过，M1 runtime 和 live Detector 仍被阻断。

## 7. 执行命令

```text
npm run test:v2-m2-replay-kernels
npm run test:v2-m2-discovery-contracts
npm run typecheck
npm run lint
npm run test:v2-foundation
npm run ci:production
git diff --check
```

未执行 `backtest:formal`、live provider、Shadow、production smoke、Docker、migration 或任何生产命令。

## 8. 测试结果

- `test:v2-m2-replay-kernels`：PASS，10/10。
- `test:v2-m2-discovery-contracts`：PASS，16/16。
- `typecheck`、`lint`：PASS，lint 0 error / 0 warning。
- `test:v2-foundation`：172 tests / 167 pass / 0 fail / 5 explicit external-dependency skips。
- 完整 `ci:production`：PASS，`exit_code=0`；Legacy market 969 tests / 965 pass / 0 fail / 4 skip，Worker 23/23，历史回测 4/4，全 V2 172 tests / 167 pass / 0 fail / 5 explicit external-dependency skips，M0 10/10、生产 build、golden 16/16、forbidden files、secret patterns 与 security 全部通过。
- production smoke、`backtest:formal`：未运行，范围不允许。

## 9. 失败项

1. 首次 typecheck 拒绝通用 probe 的 `number | boolean` 联合比较；已拆成数值 probe 与布尔+数值 probe，保留类型边界，没有使用 `any` 或关闭检查。
2. 初次实现后反审计发现 evaluation digest 由 builder 生成但 decoder 未重算，且 Detector identity 未锁注册表；已增加内容哈希、ID、detector/version/family/pattern 联合校验和重哈希篡改负例。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新为 M2.1 本地 DRAFT kernel PASS、Detector 未校准/Candidate 禁发和 M2.2 下一门禁，不改写 M1 外部门禁。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以将 M2.1 计为本地 DRAFT kernel 完成，并进入 historical replay/lifecycle Gate。不可以把 Detector 升为 REPLAY_VALIDATED，不可以发 Candidate、启动 runtime 或声明真实市场发现能力。

## 13. 下一轮建议

只执行 `V2-M2.2-HISTORICAL-REPLAY-AND-DETECTOR-LIFECYCLE-GATE`，先建立真实冻结 cohort、三分母、分层指标和 untouched holdout；合成样本不得作为升级证据。
