# Market Radar 外部审计变更日志

用途：给外部架构审计员 / ChatGPT 快速了解最近轮次发生了什么。本文只记录事实，不包含密钥、连接串、服务器密码、cookie、token 或私钥。

## 2026-07-05 - 第三轮正式能力回测

本轮性质：正式能力回测轮。

本轮边界：

- 未新增功能。
- 未改 UI。
- 未优化策略。
- 未修改扫描排序。
- 未修改分析规则。
- 未修改回测逻辑。
- 未提交 Git。
- 未部署。
- 未重启服务。
- 未迁移或清理数据库。

前置门禁：

- `/api/health`：ready / fresh。
- Redis：healthy。
- worker：6 / 6 healthy。
- `npm run production:smoke`：exit=0。
- `npm run typecheck`：exit=0。
- `npm run lint`：exit=0；存在 1 个 warning：`priorityReasons` 未使用。
- `npm run test:market`：exit=0。
- `npm run build`：exit=0。
- `npm run backtest:golden`：exit=0。

formal 执行：

- 命令：`npm run backtest:formal`
- 本地直连 Binance 首次失败，原因是 Node fetch 无法直连外网；失败证据已保留。
- 通过 undici proxy preload 后 formal 完整跑完。
- formal exit code：2。
- exit code 2 含义：程序完成，但裁判系统发现高优先级能力阻断，不是程序崩溃。
- formal 报告路径：`reports/professional-backtest-audit/2026-07-05T025649-925Z`。

核心结果：

- 总判定：当前系统仍不能支撑实战。
- 回测样本：100 个 replay 节点。
- 高优先级问题：60 个。
- `TRADE_PLAN_READY`：0 个。
- WAIT 总数：24 个。
- WAIT 有效率：0%。
- WAIT 触发后先止损：2 个，占 8.33%。

三大核心能力：

| 能力 | 状态 | 分数 | 通过率 |
|---|---:|---:|---:|
| 扫描：提前发现能力 | 不合格 | 50.88 | 7.69% |
| 分析：判断机会质量 | 不合格 | 48.05 | 23.81% |
| 策略：计划可执行性 | 不合格 | 28.61 | 0% |

最大短板：

1. 策略计划层没有形成可执行样本：`TRADE_PLAN_READY=0`。
2. WAIT 条件计划后验无效：WAIT 有效率为 0%。
3. RR、止损、目标投射仍是主要阻断项。
4. 分析判断有效率不足。
5. 扫描 TopN 仍漏掉部分早期质量机会。

第四轮建议：

- 只做策略计划层专项整改。
- 重点处理 WAIT 触发质量、RR、止损、目标、关键位投射。
- 不降低 3:1 RR。
- 不把 WAIT 包装成 READY。
- 不新增 UI 或功能。
- 不让 backtest future outcome 污染 production score。

## 2026-07-05 - 第四轮策略计划层专项整改

本轮性质：整改轮，不是 formal 能力验收轮。

本轮边界：

- 未改 UI。
- 未改扫描排序。
- 未改榜单。
- 未改 WebSocket。
- 未部署。
- 未跑 `npm run backtest:formal`。
- 未动数据库。
- 未降低 3:1 RR。
- 未把 WAIT / WATCH 包装成 READY。
- 未让 future outcome 污染 production strategy。

本轮修改：

- `StrategyV3TradePlan` 增加可选结构化等待字段：等待区、触发条件、二次确认、等待原因、当前为什么不能做。
- `buildV3TradePlan` 对 WAIT 输出更清楚的结构化解释。
- `structure_repair_pending` 拆分为建设性修复等待、失败阻断、普通观察。
- WAIT 后验诊断新增：`trigger_not_reached`、`structure_invalidated_before_trigger`、`stop_too_close_to_entry`、`target_too_far_or_unrealistic`。
- 修正 WAIT 诊断内部价格距离百分比计算，避免误用数量占比函数。

本轮测试：

- `npm run build:market-cli`：通过。
- 定向测试：
  - `trade-plan.test`：13/13 通过。
  - `location-rr.test`：11/11 通过。
  - `trend-integrity.test`：8/8 通过。
  - `professional-audit-round.test`：57/57 通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
- `npm run test:market`：通过，769 + 17 + 4 全部通过。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。

本轮报告：

- `audit-round-4/strategy-root-cause-analysis.md`
- `audit-round-4/ROUND_4_STRATEGY_PLAN_FIX_REPORT.md`

当前真实结论：

- 第四轮只证明策略计划层的基础约束更清楚、更可验证。
- 当前系统仍不能支撑实战。
- 是否改善第三轮 formal 的策略分数，需要第五轮正式回归验收确认。

第五轮建议：

- 在不改规则的前提下跑 formal。
- 重点看 WAIT 有效率、TRADE_PLAN_READY 是否仍为 0、策略分数是否真实改善。

## 2026-07-05 - 第五轮正式回归验收

本轮性质：正式回归验收轮。

本轮边界：

- 未新增功能。
- 未改 UI。
- 未改扫描排序。
- 未改分析规则。
- 未改策略规则。
- 未改回测逻辑。
- 未部署。
- 未动数据库。
- 未提交 Git。
- 未降低 3:1 RR。
- 未把 WAIT / WATCH 包装成 READY。
- 未让 backtest outcome 污染 production score。

前置门禁：

- 本地 HEAD：`dc22fda6`，包含第四轮策略计划层整改。
- 腾讯云只读检查 HEAD：`a76010223`，生产尚未同步第四轮。
- 本地 shell 访问公网 `43.161.202.227:80/443` 超时。
- 通过 SSH 只读检查服务器本机 `/api/health`：HTTP 200，ready/fresh。
- `npm run typecheck`：exit=0。
- `npm run lint`：exit=0；仍有既有 warning：`priorityReasons` 未使用。
- `npm run test:market`：exit=0。
- `npm run build`：exit=0。
- `npm run backtest:golden`：exit=0。

formal 执行：

- 第一次直连：`npm run backtest:formal`，exit=1；Binance 历史 K 线拉取 `ECONNRESET`，没有生成新报告。
- 第二次代理：`BACKTEST_CURL_PROXY=socks5h://127.0.0.1:7892 npm run backtest:formal`，完整跑完。
- formal exit code：2。
- exit code 2 含义：程序完成，但裁判系统发现高优先级能力阻断，不是程序崩溃。
- formal 报告路径：`reports/professional-backtest-audit/2026-07-05T043726-668Z`。

核心结果：

- 总判定：当前系统仍不能支撑实战。
- 回测样本：100 个 replay 节点。
- 高优先级问题：65 个。
- `TRADE_PLAN_READY`：0 个。
- WAIT 总数：12 个。
- WAIT 有效率：0%。
- WAIT bad rate：25%。

与第三轮对比：

| 指标 | 第三轮 | 第五轮 | 变化 |
|---|---:|---:|---:|
| 高优先级问题 | 60 | 65 | 退步 |
| 扫描分数 | 50.88 | 50.74 | 退步 |
| 分析分数 | 48.05 | 46.57 | 退步 |
| 策略分数 | 28.61 | 22.48 | 退步 |
| `TRADE_PLAN_READY` | 0 | 0 | 持平 |
| WAIT 有效率 | 0% | 0% | 持平 |
| WAIT bad rate | 8.33% | 25% | 退步 |

本轮结论：

- 第四轮让 WAIT 结构化说明和后验诊断更细，但没有让 WAIT 变得有效。
- 第五轮新增暴露 `target_too_far_or_unrealistic`，说明目标投射和第一目标质量仍有核心问题。
- RR、止损、目标 blocker 没有下降，反而更重。
- 生产尚未同步第四轮代码，所以第五轮是本地第四轮代码回归验收，不是生产第四轮代码验收。

第六轮建议：

- 只做“关键位/RR/目标投射与 WAIT 触发质量专项审计整改”。
- 不做 UI。
- 不新增功能。
- 不降低 3:1 RR。
- 不把 WAIT / WATCH 包装成 READY。

## 2026-07-05 - 第六轮全站逐数字 + 后端全链路审计

本轮性质：只读审计轮。

本轮边界：

- 未改业务代码。
- 未修 bug。
- 未优化策略。
- 未改 UI。
- 未部署。
- 未提交 Git。
- 未跑 `npm run backtest:formal`。
- 未动数据库。
- 未运行 migration。
- 未清表、未导出生产业务数据。

本轮产物：

- `audit-round-6-full-system-audit/ROUND_6_FULL_SYSTEM_AUDIT_REPORT.md`
- `audit-round-6-full-system-audit/12_risk_register/risk-register.md`
- `audit-round-6-full-system-audit.zip`

核心结论：

- 当前系统仍不能支撑实战。
- 本轮发现 P0：是。
- P0 数量：2。
- P1 数量：4。
- P2 数量：4。
- 当前不允许直接开始优化。

P0 阻断：

1. 生产运行态事实源不可采集：公网 `/api/health` HTTP/HTTPS 超时；SSH 经 SOCKS TCP 可达，但认证阶段被关闭；本地 3000 未运行，本地没有 Docker 命令。
2. 生产 HEAD 与 GitHub main / 本地 HEAD 一致性本轮不可复核。

本轮正向静态证据：

- 狙击榜入口静态代码只允许 `TRADE_PLAN_READY + RR >= 3 + 无 whyBlocked`。
- 榜单 fallback 投影候选时已有“候选不等于交易计划”的保护边界。
- `useLiveNumber` 不再随机漂移。

本轮不能证明：

- 不能证明生产页面逐数字真实。
- 不能证明生产 API 合同字段和前端展示一致。
- 不能证明 DB / Redis / worker / reports volume 正常。
- 不能证明 CoinGlass、WebSocket 轻扫和公开交易所深扫当前真实工作。

第七轮建议：

- 不做优化。
- 先恢复生产事实源只读采集。
- 核对 GitHub main、本地 HEAD、腾讯云 HEAD 是否一致。
- 采集生产 `/api/health`、frontend contracts、backend contract、Docker 服务、DB schema/counts、Redis keyspace/heartbeat。
- 只有 P0 关闭后，才进入扫描、分析、策略或 UI 优化。

## 2026-07-06 - 第 2.1 步 P1 补充收敛整改

### 本轮目标

修复第 2 步验收复查暴露的 5 个阻断型 P1：Token READY 单一事实源不够硬、Dashboard 四层信息结构不够严格、候选池文案容易误导、CI/docs/scripts 提交范围不完整、mock provider 隔离仍是运行时 gate 而不是 import 隔离。

### 修改范围

- Token dossier 合同和后端 dossier：READY 必须来自后端 maturity fact、完整 trade plan 和 risk gate，不允许前端根据 v3 草案自行升级。
- Dashboard 与共享 UI 信息层：落地 L1/L2/L3/L4 四层结构，L1 只展示中文决策标签。
- Signals / anomaly / plan review 文案：收敛为“验证候选、证据观察、计划复核区、后端计划门禁”，避免候选或 WAIT 被读成可执行信号。
- Provider registry：真实 provider 未配置时 fail-closed 到 `unconfigured`，不再静态导入 mock provider。
- CI guard / docs / `.gitignore`：阻断 audit/evidence/zip/log/raw/env 误提交，secret pattern 扫描覆盖 Markdown 并允许 `[REDACTED]` 示例。

### 核心链路影响

- 候选筛选：候选和观察项的前端语义更清楚，不能冒充计划就绪。
- 交易计划：`TRADE_PLAN_READY` 事实源更硬，Token 页面不能自行生成或升级计划。
- 复盘进化：research-only / backtest 边界未放宽，本轮没有让复盘影响生产排序。

### 测试结果

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 777 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮不是能力验收轮。

### 是否部署

未部署。未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume。

### 风险与遗留问题

- 本轮未发现新 P0。
- 历史文档和历史回测记录里仍存在“狙击榜”等旧词，作为历史事实保留；当前可见生产语义已改为“计划复核区”。
- 当前系统仍不能支撑实战，本轮只完成语义和事实源收敛，不证明扫描、分析、策略能力达标。

### 下一轮建议

进入第 2.1 步整改后验收复查：只读验证 5 个 P1 是否真实关闭，不部署，不跑 formal，不 push main。

## 2026-07-06 - 第 2 步最终复查 + 中文命名体系收口

### 本轮目标

验证第 2.1 步 P1 补充收敛整改是否真实生效，并完成中文命名体系收口，避免候选、观察、WAIT、READY 被用户误读。

### 修改范围

- 中文命名：页面名、模块名、状态名集中到 `src/lib/ui-schema/display-names.ts` 和状态词典。
- 前端文案：Dashboard、Review、Signals、Token、Anomaly、SniperBoard 等核心展示收敛为“候选观察 / 证据观察 / 计划就绪区 / 观察生命周期”。
- 合同文案：`旧信号` 改为 `旧观察`，`RR` 在用户说明中改为 `结构盈亏比`。
- 测试保护：更新状态词典、repository hygiene、frontend contract、core governance、trade-plan 测试断言。
- Git 安全：`.gitignore` 增加 `system-convergence-final-validation/`，防止本轮证据目录进入 GitHub。

### 核心链路影响

- 候选筛选：候选和证据观察的用户语义更清楚，不能冒充计划就绪。
- 风险赔率：继续保持结构盈亏比最低 3:1，未降低门槛。
- 交易计划：`TRADE_PLAN_READY` 仍是计划就绪区唯一入口，前端不生成入场、止损、目标。
- 复盘进化：保持 research-only，未让 review/backtest 影响 production ranking。

### 测试结果

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 777 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮不是正式能力验收轮。

### 是否部署

未部署。未 push main，未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume。

### 风险与遗留问题

- 本轮未发现新 P0。
- 阻断型 P1：无。
- P2：旧 `SniperTarget` 类型仍保留 entry/stop/target 字段，当前 UI 不用它生成价格计划，但后续应单独清理。
- P2：`production.yml` push main 会尝试生产部署，本轮禁止 push main。
- 当前系统仍不能支撑实战，本轮只证明本地收敛验收通过。

### 下一轮建议

进入第 3 步：围绕扫描、分析、策略三大核心做实战能力提升和正式样本验证。

## 2026-07-06 - 第 3 步实战能力提升

### 本轮目标

围绕“快速全市场扫描、发现机会、给出策略、自我提升”提升后端能力基础，不做 UI、不部署、不跑 formal、不动数据库。

### 修改范围

- 深扫优先级与候选质量：`src/lib/market/scan-state-pool.ts`、`src/lib/market/types.ts` 及相关测试。
- 统一决策：新增 `src/lib/decision/unified-decision-engine.ts` 及测试。
- 市场状态：新增 `src/lib/market-regime/market-regime.ts` 及测试。
- 错失机会：新增 `src/lib/review/missed-opportunity/**`。
- 机会生命周期：新增 `src/lib/lifecycle/**`。
- 账户风险：新增 `src/lib/risk/account-risk-simulator.ts`、`account-risk-types.ts` 及测试。
- 文档：新增 `docs/UNIFIED_DECISION_ENGINE.md`、`docs/MARKET_REGIME.md`、`docs/MISSED_OPPORTUNITY_REVIEW.md`、`docs/OPPORTUNITY_LIFECYCLE.md`、`docs/ACCOUNT_RISK_SIMULATOR.md`。
- 证据：新增 `phase3-capability-improvement/**`。

### 核心链路影响

- 全市场发现：不改 WebSocket / universe / scan provider。
- 候选筛选：新增深扫队列可观测字段和 `priorityReason`。
- 深扫验证：不增加 API 预算，只增强 pending / coverage / cycle 证明。
- 结构分析：新增市场状态 context 基础件，不直接给交易许可。
- 风险赔率：新增账户级只读风险镜头，不改变 3:1 结构盈亏比。
- 交易计划：新增统一决策引擎，锁住 WAIT / READY / BLOCKED 边界。
- 复盘进化：新增 missed opportunity 与 lifecycle research-only 基础。

### 测试结果

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

### 是否部署

未部署。未 push main，未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume。

### 风险与遗留问题

- 本轮未发现新 P0。
- 本轮新增能力多为后端基础件，尚未接入生产 API / 前端展示。
- 深扫队列部分指标是基于当前队列和 cadence 的估算，不是数据库真实 lastDeepScannedAt。
- 当前系统仍不能支撑实战，本轮不证明候选 Top10、WAIT 转 READY 或策略命中能力已经达标。

### 下一轮建议

第 3.1 步：把统一决策引擎接入 radar signal、signals/sniper 可见状态和 token dossier 合同，作为计划状态唯一后端出口。

## 2026-07-06 - 第 3.1 步统一决策引擎主链路接线与合同验收

### 本轮目标

把第 3 步新增的统一决策引擎接入 radar signal、signals/sniper 可见状态和 token dossier 主链路，让计划就绪状态来自后端统一决策结果，而不是前端用候选数量、分数、赔率或局部状态二次推导。

### 修改范围

- `src/lib/api/frontend-contract.ts`：新增 radar signal / token dossier `unifiedDecision` 合同字段，并接入 `buildUnifiedDecision()`。
- `src/lib/radar-contract.ts`：legacy getter 增加 radar signal / token `unifiedDecision` 兼容字段。
- `src/lib/frontend-display-adapters.ts`：sniper target 只允许从 `unifiedDecision.canTradeNow + readyPlan` 生成；榜单兜底候选标记为 `frontend_candidate_guard`。
- `src/app/dashboard/page.tsx`：dashboard L1 只表达系统运行状态，不再用候选数量或计划数量推导 TRADE/WAIT。
- `src/components/anomaly-board.tsx`：异动表不再用 category/odds 本地组合推断计划就绪。
- `src/components/signals/signal-maturity-pool.tsx`：信号成熟度池计划提示读取 `unifiedDecision.canTradeNow + readyPlan`。
- `src/components/token/token-dossier.tsx`：L1 决策、等待条件、阻断原因读取 `unifiedDecision`。
- `src/lib/ui-schema-guard.ts`：信号 L1 决策优先读取 `unifiedDecision`，其次读取后端 `operatorRead.lane`，最后才使用成熟度兜底。
- `src/lib/decision/unified-decision-engine.ts`：blocker 增加 severity，READY 硬门槛失败标为 critical。
- `src/lib/api/frontend-contract.test.ts`、`src/lib/api/frontend-display-adapters.test.ts`、`src/lib/api/ui-schema-guard.test.ts`、`src/lib/decision/unified-decision-engine.test.ts`：新增 stale READY、WAIT、不伪造 trade plan、sniper 只读后端 readyPlan、blocker severity 测试。
- `phase3-1-unified-decision-contract/**`：本轮脱敏证据和报告。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：保留 3:1 结构盈亏比门槛，未降低。
- 交易计划：radar signal、sniper board 和 token dossier 的计划就绪现在必须经过统一决策引擎。
- 复盘进化：保持 research-only，未影响 production ranking。

### 测试结果

- 定向合同/展示/guard 测试：52/52 通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 807 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

### 是否部署

未部署。未 push main，未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume。

### 风险与遗留问题

- 本轮未发现新 P0。
- P1：Kline readonly overlays 需要单独审计，避免图表视觉层看起来比决策合同更强。
- P1：本分支尚未部署腾讯云，生产 API 是否呈现新合同需要后续部署轮验证。
- 当前系统仍不能支撑实战，本轮只完成统一决策合同主链路接线，不证明真实市场胜率或策略命中能力。

### 下一轮建议

先做 3.1 验收复查；通过后进入 Kline / TradingView readonly overlay 边界审计，防止图表视觉层看起来强于统一决策合同。

## 2026-07-06 - 第 3.2 步图表叠加层与严格单一事实源最终收口

### 本轮目标

修复 Kline / TradingView overlay 视觉层绕过统一决策引擎的问题，确保图表上的止损/TP 线只在后端统一决策真正输出 `TRADE_PLAN_READY` 且 Kline 数据新鲜时出现。

### 修改范围

- `src/lib/chart-types.ts`：为 `KlineOverlay` 增加语义字段和渲染过滤器，旧格式 `target/stop` 不再默认可渲染。
- `src/lib/api/frontend-contract.ts`：Kline overlay 改为读取 `unified_decision_engine` 的 `readyPlan`；非 READY 只输出结构参考或等待条件；stale/cached/partial 不输出 ready plan overlay。
- `src/components/kline-panel.tsx`：前端按数据状态过滤 overlay，非 live 不显示 ready trade plan。
- `src/components/kline-chart.tsx`：图表绘制层再次过滤不合格 target/stop overlay。
- `src/lib/radar-contract.ts`：同步 `TokenChartIntegrity.overlaySource` 类型。
- `src/lib/api/frontend-contract.test.ts`：新增非 READY、WAIT、stale 三类 Kline overlay 反向测试。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：记录 3.2 当前事实和边界。
- `phase3-2-overlay-single-source-finalization/**`：本轮报告和证据目录。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：Kline 可继续展示关键位/前方结构作为结构参考。
- 风险赔率：未降低 3:1 门槛；RR 仍只由后端计划计算。
- 交易计划：图表止损/TP 线现在必须来自统一决策引擎的 readyPlan，不能由 v3 草案直接展示。
- 复盘进化：未改，保持 research-only。

### 测试结果

- 定向：`npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js`：通过，32/32。
- `npm run typecheck`：通过。
- 其它基础门禁待本轮最终验收后补齐。
- `npm run backtest:formal`：未运行，本轮禁止。

### 是否部署

未部署。未 push main，未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume。

### 风险与遗留问题

- 本轮修复前发现的图表 overlay 误导风险已在本地代码层收口。
- 仍需跑完整基础门禁并生成 3.2 报告/证据包。
- 当前系统仍不能支撑实战；本轮只修可见图表合同边界，不证明策略有效率。

### 下一轮建议

完成 3.2 基础门禁、证据包、safe branch push 后，再进入第 3 步后续实战能力提升；不要直接部署生产，除非单独进入部署验收轮。
