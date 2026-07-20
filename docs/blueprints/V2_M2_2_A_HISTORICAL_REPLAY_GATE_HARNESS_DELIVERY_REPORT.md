# 本轮交付报告

任务：`V2-M2.2-A-HISTORICAL-REPLAY-CONTRACT-AND-LIFECYCLE-GATE-HARNESS`
日期：2026-07-20
状态：`LOCAL_HARNESS_PASS / REAL_COHORT_MISSING / GATE_INSUFFICIENT / DETECTORS_DRAFT / PRODUCTION_UNCHANGED`

## 1. 本轮目标

建立不会用合成样本自批 Detector 晋级的历史回放数据合同、target-blind replay evaluator、统计指标和生命周期提案 Gate，并盘点当前仓库是否存在可接纳的真实历史 cohort。

## 2. 范围边界

本轮只修改 V2 research 合同/纯函数、M0 当前入口字符串、定向测试、测试命令和权威文档。

明确未修改：M2.1 阈值与 Detector 规则、M1 runtime、Legacy 运行代码、Frontend/API、Candidate Store、DB/Redis/Worker/Docker、Feature Flag、secret、migration、生产配置和生产数据。

## 3. 修改文件清单

- `src/v2/research/historical-replay-contract.ts`：真实数据来源权利、完整背景窗口、固定 Detector 分母、split/purge/embargo、物理分离 holdout custody、cohort record、experiment/trial 和 dataset identity 合同。
- `src/v2/research/historical-replay-gate.ts`：target-blind 首次发现、按 knowledge cutoff 计时、sealed holdout 单次绑定、三业务分母与背景误报、family/direction/regime/liquidity 逐层指标/CI 与门槛、PASS/FAIL/INSUFFICIENT/INVALID 和无自动晋级 Gate。
- `src/v2/research/historical-replay-gate.test.ts`：十三项合成 contract-only 防线测试。
- `src/v2/governance/m0-exit-validator.ts`：机器报告唯一下一入口更新为 M2.2-B；未改变 M0 判定逻辑。
- `package.json`：新增 M2.2-A 定向测试入口。
- `docs/architecture/v2/M2_2_HISTORICAL_REPLAY_AND_LIFECYCLE_GATE_CONTRACT_V1.md`：本轮权威合同和当前证据缺口。
- V2 蓝图、机器追踪矩阵、README、施工顺序、Context、Changelog 和本报告：同步当前事实与下一入口。

## 4. 对核心链路的影响

本轮强化 `全市场发现 -> 候选筛选` 的研究验收边界：以后 Detector 必须在完整市场背景、全部事件和匹配非事件上证明提前发现能力，不能只挑成功图形回放。

本轮不生成 DiscoveryCandidate，不进入深扫、结构分析、风险赔率、交易计划或前端展示。

## 5. 分层边界影响

- scan/detection：只评价五个 DRAFT kernel，不改规则，不开放 emission。
- analysis/strategy/backtest production：未修改。
- research/evaluation：新增独立合同与纯函数 Gate；future label 只在 Detector 输出冻结后读取。
- frontend/API：未涉及。
- DB/Redis/worker/deployment/secret：未涉及。
- production：零连接、零命令、零变更。

## 6. 风险说明

- 当前仓库没有符合 V2 合同的真实 point-in-time cohort。Legacy professional audit 只有旧引擎摘要，缺少 V2 observations、knowledge cutoff、完整背景窗口、matched control 和独立 holdout custody。
- M2.1 kernel 没有 Candidate ranking authority，因此当前没有可验证 Top20 late/noise。
- Threshold sensitivity 和真实 untouched holdout 尚未执行。
- Breakout/Retest promotion threshold 尚未由 ADR 冻结。
- 因此当前 Gate 必须是 `INSUFFICIENT`；任何 `REPLAY_VALIDATED`、Candidate emission 或实战能力声明都是错误的。

## 7. 执行命令

```bash
npm run test:v2-m2-historical-replay
npm run test:v2-m2-replay-kernels
npm run test:v2-m2-discovery-contracts
npm run test:v2-foundation
npm run ci:production
```

另外执行 `git diff --check`、JSON 解析、工作区与敏感信息检查。

## 8. 测试结果

- M2.2-A 定向：13/13 PASS。
- M2.1 回归：10/10 PASS。
- M2.0 回归：16/16 PASS。
- 全 V2：185 total / 180 pass / 0 fail / 5 explicit external-dependency skips。
- Legacy market：969 total / 965 pass / 0 fail / 4 skip。
- Workers：23/23 PASS。
- Historical backtest：4/4 PASS。
- M0 机器出口：10/10 PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- forbidden files、secret patterns、security：PASS。
- 完整 `npm run ci:production`：PASS。
- `npm run backtest:formal`：未运行；本轮不是能力验收，且真实 cohort 不存在。
- production smoke：未运行；本轮没有部署。

## 9. 失败项

工程测试无失败项。能力证据结论不是 PASS，而是 `INSUFFICIENT`：accepted real dataset=0、Top20 evidence=false、sensitivity=false、untouched holdout=false。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：记录 M2.2-A 本地出口、真实 Gate 不足、风险和 M2.2-B 唯一下一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入 `M2.2-B Real Historical Cohort Acquisition and Freeze`。

不可以进入 Detector lifecycle mutation、Candidate emission、M2 runtime、页面接入、Signal/Plan 或生产发布。

## 13. 下一轮建议

只执行 `V2-M2.2-B-REAL-HISTORICAL-COHORT-ACQUISITION-AND-FREEZE`：先确认来源权利并冻结完整真实数据集、背景分母、split 和独立 holdout artifact；本包不得打开 holdout。
