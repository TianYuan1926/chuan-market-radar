# Market Radar 第 3 步实战能力提升报告

## 1. 本轮目标

围绕核心链路提升扫描、分析、策略、复盘的基础能力。不是 UI 美化，不是生产部署，不是正式能力回测，不是自动下单。

核心目标对应：

- 快速全市场覆盖扫描：增强深扫队列证明和候选质量解释。
- 发现真正有价值的机会：保留 pending / priorityReason / low priority skipped 等可观测信息。
- 给出可解释、可失效的策略：新增统一决策引擎，锁定 WAIT / READY / BLOCKED 边界。
- 通过复盘持续自我提升：新增 missed opportunity 和 opportunity lifecycle 的 research-only 基础模块。

## 2. 分支与推送策略

- P1 收敛基线分支：`p1-convergence-final-validation`
- P1 基线提交：`04363d58675c5fcf1439c208562e924532dc8244`
- 第 3 步工作分支：`phase3-capability-improvement`
- 是否推送 GitHub 安全分支：是，`origin/phase3-capability-improvement`
- push main：否
- 腾讯云部署：否
- migration / DB / Redis / volume：否
- formal：否

## 3. 修改文件清单

### 深扫优先级与候选质量

- `src/lib/market/scan-state-pool.ts`
- `src/lib/market/scan-state-pool.test.ts`
- `src/lib/market/types.ts`
- `src/lib/api/backend-contract.test.ts`
- `src/lib/market/scan-asset-state.test.ts`

原因：补齐深扫 pending、coverage、cycle、priorityReason 等只读证明，防止未深扫资产被误读成计划就绪。

### 统一决策 / WAIT 质量

- `src/lib/decision/unified-decision-engine.ts`
- `src/lib/decision/unified-decision-engine.test.ts`
- `docs/UNIFIED_DECISION_ENGINE.md`

原因：统一 `OBSERVE / WAIT / BLOCKED / TRADE_PLAN_READY` 的后端决策出口，防止 WAIT 或候选被误读为 READY。

### 市场状态识别

- `src/lib/market-regime/market-regime.ts`
- `src/lib/market-regime/market-regime.test.ts`
- `docs/MARKET_REGIME.md`

原因：增加 `RISK_OFF / ALT_ROTATION / RANGE / TREND_UP / TREND_DOWN` 等市场背景判断，但限定为 context-only。

### 错失机会复盘

- `src/lib/review/missed-opportunity/types.ts`
- `src/lib/review/missed-opportunity/review.ts`
- `src/lib/review/missed-opportunity/index.ts`
- `src/lib/review/missed-opportunity/review.test.ts`
- `docs/MISSED_OPPORTUNITY_REVIEW.md`

原因：建立 missed opportunity 归因基础，反查机会错失在哪一环，但不改变 production ranking。

### 机会生命周期

- `src/lib/lifecycle/types.ts`
- `src/lib/lifecycle/opportunity-lifecycle.ts`
- `src/lib/lifecycle/index.ts`
- `src/lib/lifecycle/opportunity-lifecycle.test.ts`
- `docs/OPPORTUNITY_LIFECYCLE.md`

原因：记录机会从发现到复盘的状态链路，保持 research-only。

### 账户级风险模拟器

- `src/lib/risk/account-risk-types.ts`
- `src/lib/risk/account-risk-simulator.ts`
- `src/lib/risk/account-risk-simulator.test.ts`
- `docs/ACCOUNT_RISK_SIMULATOR.md`

原因：按用户个人仓位规则给出只读风险镜头，不改变结构 RR 和交易计划门禁。

### 测试配置与上下文

- `tsconfig.market-test.json`
- `PROJECT_CONTEXT_FOR_CHATGPT.md`
- `CHANGELOG_FOR_CHATGPT.md`
- `phase3-capability-improvement/**`

原因：把新增模块纳入市场测试编译范围，并更新交接上下文和本轮证据。

## 4. 对核心链路的影响

| 核心链路 | 本轮影响 |
|---|---|
| 全市场发现 | 不改 WebSocket / universe / scan provider；保持发现层边界。 |
| 候选筛选 | 增加深扫队列可观测字段和 priorityReason，避免候选误读。 |
| 深扫验证 | 不增加 API 请求；增强深扫 coverage / pending / cycle 证明。 |
| 结构分析 | 新增 market regime context 基础件，但不直接改原结构分析。 |
| 风险赔率 | 新增账户风险镜头；不改变 3:1 结构 RR。 |
| 交易计划 | 新增统一决策引擎，锁定 READY / WAIT / BLOCKED。 |
| 复盘进化 | 新增 missed opportunity 和 lifecycle research-only 基础。 |

## 5. 分层边界影响

- scan：只增强状态池证明，不生成计划。
- analysis：新增市场状态 context，不给个币直接方向。
- strategy：新增统一决策出口，不改原 v3 策略逻辑。
- backtest/review：新增 research-only 模块，不回写 production。
- frontend：未改 UI。
- API：未接入新生产 API。
- DB / Redis / worker / deployment / secret：未涉及。

## 6. 测试结果

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test:market` | pass，市场核心 803 pass，worker 17 pass，historical smoke 4 pass |
| `npm run build` | pass |
| `npm run backtest:golden` | pass，16/16 |
| `npm run ci:forbidden-files` | pass |
| `npm run ci:secret-patterns` | pass |

未运行：

- `npm run backtest:formal`：本轮禁止。
- production smoke：本轮未部署。

## 7. grep 证据结论

- `auto-execute-risk-grep.txt`：命中均为 `canAutoExecute=false`、guard、测试和文档边界；未发现下单实现。
- `state-boundary-grep.txt`：存在大量状态边界命中，属于状态词典、合同、测试和 UI 显示边界。
- `review-production-boundary-grep.txt`：命中 review/backtest/outcome 字段，新增模块均固定 research-only。
- `decision-risk-grep.txt`：命中 RR/entry/stop/target/whyNotNow 相关逻辑，新增统一决策引擎要求这些字段来自后端。
- `tracked-artifact-risk.txt`：命中正式源码/文档中包含 audit/evidence/secret 字样的文件名；未发现 audit zip、raw log、exitcode 被跟踪。

## 8. 是否发现新 P0

否。

## 9. 当前真实状态

当前系统仍不能支撑实战交易。

本轮证明的是：

- 第 3 步基础能力模块已完成本地实现和测试。
- 没有降低 RR。
- 没有引入自动下单。
- 没有让 review/backtest 污染 production。
- 没有部署生产。

本轮没有证明：

- 腾讯云生产已同步。
- 实战能力已经达标。
- 候选 Top10 已长期稳定。
- WAIT 转 READY 已在真实样本中有效。

## 10. 是否可以进入下一轮

可以进入第 3.1 步：把统一决策引擎作为 token dossier 后端合同的只读决策出口。

不建议直接进入 UI 打磨或生产部署。
