# Market Radar 外部审计变更日志

用途：给外部架构审计员 / ChatGPT 快速了解最近轮次发生了什么。本文只记录事实，不包含密钥、连接串、服务器密码、cookie、token 或私钥。

## 2026-07-07 - 第 5.1 步 Shadow Tracking v1 存储基线与 run manifest

### 本轮目标

建立 Shadow Tracking v1 的文件存储基线、run manifest、事件 JSONL、去重/迁移记录、1h/4h/24h checkpoint plan、latest.json/latest.md 和证据包。本轮不是启动 7-14 天长期 Shadow Tracking，不是策略优化，不是 UI 调整，不是生产部署。

### 修改范围

- `.gitignore`：补充 phase5 证据目录、Shadow JSONL/NDJSON/status 文件防误提交规则。
- `scripts/ci/check-forbidden-files.sh`：补充 phase5 证据包和 Shadow 运行文件的禁止跟踪规则。
- `package.json`：新增 `shadow:baseline`、`shadow:status`、`shadow:validate`、`shadow:report`。
- `tsconfig.market-test.json`：把 `src/lib/shadow/**/*.ts` 纳入 market CLI/test 编译。
- `src/lib/shadow/storage.ts`：新增 Shadow baseline storage 纯函数、去重、状态迁移、checkpoint plan、latest/report 和 validator。
- `src/lib/shadow/storage.test.ts`：新增 Shadow storage 边界测试。
- `src/scripts/shadow/shadow-tracking.ts`：新增 Shadow Tracking CLI。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：更新第 5.1 当前事实。
- `CHANGELOG_FOR_CHATGPT.md`：记录本轮。
- `docs/chuan-market-radar-blueprint.md`：更新当前阶段与 Shadow Tracking v1 边界。
- `phase5-1-shadow-storage-run-manifest/`：本轮证据目录，不应提交 main。

未修改 scan / analysis / strategy / UI 交易逻辑。未修改数据库 schema。未部署生产。未运行 formal。

### 核心链路影响

- 全市场发现：未改生产扫描逻辑，只从生产 `/api/scan` 捕获 baseline。
- 候选筛选：未改生产排序，只把生产信号写入 research-only Shadow 事件。
- 深扫验证：未改 CoinGlass 逻辑；production evidence validate 为 pass。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改；READY 不足时不做提升。
- 复盘进化：新增 Shadow Tracking v1 存储基线，用于后续 1h/4h/24h 结果追踪；当前不回写生产。

### 测试结果

- `shadow:baseline`：pass，runId `shadow-20260707T134822Z`。
- `shadow:status`：pass，`canStartShadowV1=true`，`shadowTrackingStarted=false`。
- `shadow:validate`：pass，errors=[]，warnings=[]。
- `shadow:report`：pass。
- Shadow baseline：24 个事件、24 个唯一币种、72 个 pending checkpoint、READY=0、OBSERVE=16、WAIT=1、BLOCKED=7。
- production evidence validate：pass，real_production，errors=[]，warnings=[]。
- `typecheck`：pass。
- `lint`：pass。
- `test:market`：pass，market 817 pass、worker 17 pass、historical smoke 4 pass。
- `build`：pass。
- `backtest:golden`：pass，16/16。
- `ci:forbidden-files`：pass。
- `ci:secret-patterns`：pass。
- `security:check`：pass。
- `test:production-evidence`：pass，9/9。
- `backtest:formal`：未运行。

### 是否部署

未部署。未 push main。未运行 migration，未动 Postgres / Redis / Docker volume，未清 Redis，未自动下单。

### 风险与遗留问题

- P1：第 5.1 只建立 baseline readiness；长期 7-14 天 Shadow Tracking 尚未启动。
- P1：当前 baseline READY=0，不能包装成可交易信号已经成熟。
- P2：生产 `/api/scan` 快照来自本轮单次采集；正式 Shadow Tracking 启动后需要持续追加事件和 checkpoint outcome。
- P2：phase5 证据目录必须保持 ignored/untracked，提交时不能 `git add .`。
- 当前系统仍不能写成支撑实战交易。

### 下一轮建议

只做一个方向：把第 5.1 证据包交给 GPT 审计；确认后再进入第 5.1-R 正式启动长期 Shadow Tracking。

## 2026-07-07 - 第 5.0-R 步 CoinGlass 修复后的 Shadow Tracking 启动前生产基线复查

### 本轮目标

复查第 5.0.1 修复 CoinGlass key 后，腾讯云生产环境是否已经具备进入第 5.1 Shadow Tracking v1 的条件。本轮不是启动 Shadow Tracking，不是策略优化，不是 UI 调整，不是自动交易。

### 修改范围

- `PROJECT_CONTEXT_FOR_CHATGPT.md`：补充第 5.0-R 最新生产基线事实。
- `CHANGELOG_FOR_CHATGPT.md`：记录本轮复查结果。
- `phase5-0-rerun-after-coinglass-fix/`：本轮本地证据目录，不应提交到 main。

未修改 scan / analysis / strategy / backtest 业务逻辑。未修改 UI。未修改数据库 schema。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：生产基线复查显示 CoinGlass invalid key 未复现，3 轮扫描均 `scannedCount > 0`。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。

### 测试结果

- 生产 HEAD：`ae6852cfa2a2c9c09faa5d41ae6f5c886f023679`。
- 生产 API：`/api/health`、`/api/scan`、`/api/frontend/radar-contract`、`/api/radar/backend-contract`、`/api/frontend/review-contract` 均在 3 轮观测中 HTTP 200。
- `/api/frontend/kline-contract`：首次用错误参数 `interval=15` 返回 400；按路由实际参数 `tf=4h` 复核 HTTP 200，status `live`，source `binance-public-futures`。
- 连续扫描观测：3 轮 `scannedCount=28`，`candidateCount=23`，`anomalyCount=23`，`radarSignals=23`。
- CoinGlass：invalid_key 0，429 0。
- production smoke/status：pass。
- 本地基础门禁：typecheck / lint / test:market / build / backtest:golden / ci:forbidden-files / ci:secret-patterns / security:check 均通过。
- `backtest:formal`：未运行。

### 是否部署

未部署。未 push main。未运行 migration，未动 Postgres / Redis / Docker volume，未清 Redis，未自动下单。

### 风险与遗留问题

- P1：Shadow Tracking 专用 `reports/shadow-tracking/latest.json`、`latest.md`、`events/`、run manifest、1h/4h/24h 专用报告和 candidate status transition history 尚未完整，不能直接启动长期 Shadow Tracking。
- P2：第 5.0.1 曾出现过单 symbol CoinGlass 429，本轮未复现，但后续仍需保留 pacing 观测。
- P2：本轮 phase5 证据目录未专项 ignore，后续提交必须精确 stage，不能 `git add .`。
- 当前系统仍不能写成支撑实战交易。

### 下一轮建议

只做一个方向：第 5.1 先做 Shadow Tracking v1 存储基线与 run manifest，继续保持 research-only，不做策略优化、不做 UI、不做实盘。

## 2026-07-07 - 第 5.0.1 步腾讯云生产 CoinGlass API Key 注入 / 服务读取范围修复

### 本轮目标

修复第 5.0 基线发现的生产 CoinGlass 深扫鉴权失败问题。目标不是优化策略，也不是新增功能，而是确认生产 `.env.production`、Docker Compose、运行中容器和 CoinGlass capability probe 的真实链路一致。

### 修改范围

- `PROJECT_CONTEXT_FOR_CHATGPT.md`：补充第 5.0.1 最新生产事实快照。
- `CHANGELOG_FOR_CHATGPT.md`：记录本轮生产根因、操作、验证结果和剩余风险。
- `phase5-0-1-coinglass-prod-key-injection/`：本轮本地证据目录，不应提交到 main。

未修改 scan / analysis / strategy / backtest 业务逻辑。未修改 UI。未修改数据库 schema。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：生产 CoinGlass 鉴权从 `auth_error` 恢复为 `ready`；深扫重新出现真实 `scannedCount`。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。

### 测试结果

- 生产 SSH：通过 SOCKS 代理连接腾讯云。
- 生产 HEAD：`ae6852cfa2a2c9c09faa5d41ae6f5c886f023679`。
- 生产 tracked 工作区：干净。
- 重建前证据：服务器 `.env.production` 的 CoinGlass key 指纹与运行中容器指纹不一致；容器仍读旧 key，capability 为 `auth_error`。
- 操作：只重建 app 容器 `web`、`scanner-worker`、`coinglass-worker`、`websocket-light-worker`、`signal-worker`、`dynamic-scan-scheduler`、`macro-worker`；未重建或删除 Postgres / Redis / volume。
- 重建后证据：上述服务读取同一 CoinGlass key 指纹，真实 key 值未输出。
- CoinGlass capability：HTTP 200，`deepScanStatus=ready`，可用端点包括 `futures_pairs_markets`、`open_interest_current`、`funding_current`，`taker_buy_sell_current` 仍不可用。
- 生产 scan 基线：出现 `scannedCount=31`，不再是 invalid key 导致的 0 深扫。
- `backtest:formal`：未运行。

### 是否部署

本轮没有 push main，没有同步新代码到生产。执行的是腾讯云生产 app 容器重建，让运行中服务读取现有 `.env.production`。未运行 migration，未动 Postgres / Redis / Docker volume，未清 Redis，未自动下单。

### 风险与遗留问题

- P1：最新一轮 scan 仍出现单个 CoinGlass `429 Too Many Requests`，导致 scan 可为 `partial`；这是限速/节流风险，不是 key 鉴权失败。
- P1：`COINGLASS_MAX_CONCURRENCY=6` 与多服务触发 CoinGlass 能力/扫描时，仍需继续观察是否会放大 429。
- P2：`COINGLASS_API_KEY` 目前通过共享 app env 注入到多个服务，虽然服务读取一致，但后续可收敛为最小必要注入范围。
- P2：生产主机本身没有 `node`，生产证据脚本应优先在容器内执行或使用 Caddy/API 入口，不能再依赖 host `127.0.0.1:3000`。
- 当前系统仍不能写成支撑实战交易；只能说 CoinGlass 鉴权断层已恢复，仍需完成 Shadow Tracking 前基线验收。

### 下一轮建议

只做一个方向：基于第 5.0.1 证据复跑 Shadow Tracking 启动前基线检查，重点观察 CoinGlass 429 是否持续、scan 是否能稳定 `ready/fresh/scannedCount>0`。

## 2026-07-06 - 第 4.3 步真实腾讯云部署执行与生产 Evidence 首包

### 本轮目标

在用户明确授权后，把腾讯云生产服务器同步到安全分支 `phase4-2-tencent-deploy-readiness` 的目标 commit `953def3363ec64efb8a859e7772c55e9a51f175c`，执行 Docker Compose build/up，并生成第一份真实生产 evidence。

### 修改范围

本轮没有修改业务代码。仅新增本地证据目录和防误提交规则：

- `.gitignore`：新增 `phase4-3-production-deploy-first-evidence/` 和 zip 防误提交规则。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：补充第 4.3 真实生产部署事实。
- `CHANGELOG_FOR_CHATGPT.md`：记录本轮部署事实。
- `phase4-3-production-deploy-first-evidence/`：本地 evidence artifact，不进入 Git。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。
- 工程部署链路：真实部署已执行，生产 health/API 已验证，production evidence 首包已生成。

### 测试结果

- Docker Compose build/up：通过。
- 腾讯云生产 HEAD：`953def3363ec64efb8a859e7772c55e9a51f175c`，已对齐目标 commit。
- `/api/health`：HTTP 200，最终 `ready / fresh`。
- `/api/scan`：HTTP 200。
- `/api/frontend/radar-contract`：HTTP 200。
- `/api/radar/backend-contract`：HTTP 200。
- `/api/frontend/kline-contract`：HTTP 200。
- `/api/frontend/review-contract`：HTTP 200。
- `production:evidence`：已通过 SSH tunnel 访问真实腾讯云 Caddy API 生成 `production-evidence.zip`。
- `production:evidence:validate`：失败，原因是 validate 脚本仍要求第 4.1 dry-run 字段 `dry_run_only=true`，不适配第 4.3 真实生产 evidence。
- `backtest:formal`：未运行。

### 是否部署

已部署腾讯云生产服务器，但未 push main。部署目标是安全分支 `phase4-2-tencent-deploy-readiness`。未运行 migration，未动 Postgres / Redis / Docker volume，未清 Redis，未运行 formal。

### 风险与遗留问题

- P1：生产镜像未包含 `scripts/production/observability.mjs`，容器内 production evidence 脚本无法直接运行。
- P1：`production:evidence:validate` 仍是第 4.1 dry-run 口径，需要适配第 4.3 真实生产 evidence。
- P1：`npm run security:check` 存在源码正则误报，安全总门禁不能写成全绿。
- P2：本地直连腾讯云公网 IP 超时，本轮通过 SSH tunnel 采集真实生产 API；后续需单独确认用户公网访问稳定性。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。

### 下一轮建议

只做一个方向：修复 production evidence 工程链路，让生产镜像或专用 evidence runner 能直接生成并验证第 4.3 真实 production evidence。

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

## 2026-07-06 - 第 4 步生产级自运行与观测闭环系统

### 本轮目标

建立生产观测 dry-run、生产 smoke/status/evidence 脚本、GitHub Actions 手动门禁、回滚 dry-run 和 GPT 交接证据包。核心目标是让系统可验证、可追踪、可审计，而不是新增交易功能。

### 修改范围

- `.github/workflows/production.yml`：取消 `push main` 自动生产部署，改为手动 `workflow_dispatch`；默认只跑质量门禁和 dry-run 证据包。
- `scripts/production/observability.mjs`：新增 health / smoke / status / evidence 统一生产观测脚本。
- `scripts/deploy/auto-deploy.sh`：默认 dry-run；真实部署必须显式 `DEPLOY_MODE=production_deploy CONFIRM_DEPLOY=true`。
- `scripts/deploy/rollback.sh`：默认 dry-run；真实回滚必须显式 `ROLLBACK_MODE=production_rollback CONFIRM_ROLLBACK=true`。
- `package.json`：新增 `production:health`、`production:status` 等脚本；危险部署/回滚入口改为默认 dry-run。
- `docs/deployment/PRODUCTION_OBSERVABILITY.md`、`docs/deployment/ROLLBACK_PLAN.md`：新增生产观测和回滚运行手册。
- `docs/chuan-market-radar-blueprint.md`、`PROJECT_CONTEXT_FOR_CHATGPT.md`：更新部署治理事实，删除默认 push main / 默认腾讯云部署旧规则。
- `phase4-production-observability/**`：生成第 4 步 Agent 报告和 dry-run 证据。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改，3:1 结构盈亏比门槛不变。
- 交易计划：未改；production smoke 新增 unifiedDecision / readyPlan / overlay 防误导检查。
- 复盘进化：未改，保持 research-only。

### 测试结果

本轮应跑完整门禁：

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- `npm run production:health -- --dry-run`
- `npm run production:smoke -- --dry-run`
- `npm run production:status -- --dry-run`
- `npm run production:evidence -- --dry-run`

最终结果以 `phase4-production-observability/test-results.md` 和本轮交付报告为准。

### 是否部署

未部署。未 push main，未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume，未运行 formal。

### 风险与遗留问题

- 本轮修复了 workflow 旧风险：`push main` 不再自动真实部署。
- 当前仍不能说系统支撑实战交易；本轮只建设生产观测和证据链。
- 真实腾讯云自动部署仍需用户单独授权和生产部署验收轮。

### 下一轮建议

先把第 4 步交给 GPT 做验收复查；通过后再决定是否进入真实腾讯云部署验证。

## 2026-07-06 - 第 4.1 步证据包自包含性、Commit 对齐与部署授权前收口

### 本轮目标

修复第 4 步生产证据链的自证缺口：`production-evidence.zip` 必须自包含，证据内的 branch / commit / worktree 状态必须指向最终安全分支 HEAD，并新增证据验证入口。

### 修改范围

- `scripts/production/observability.mjs`：重写 evidence 生成和 validate 流程，生成完整 handoff、部署报告、rollback plan、测试结果、grep 证据、风险、下一步、summary、manifest 和 agent 报告。
- `package.json`：新增 `production:evidence:validate`。
- `.gitignore` 与 `scripts/ci/check-forbidden-files.sh`：补充第 4.1 evidence artifact 防误提交规则。
- `docs/DEPLOYMENT_AUTHORIZATION_CHECKLIST.md`：新增部署授权前长期检查清单。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`docs/chuan-market-radar-blueprint.md`：更新 4.1 证据链事实和部署边界。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。
- 工程证据链：增强，防止 dry-run evidence、commit、handoff、部署报告互相不一致。

### 测试结果

本轮必须跑：

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- `npm run security:check`
- `npm run production:health -- --dry-run`
- `npm run production:smoke -- --dry-run`
- `npm run production:status -- --dry-run`
- `npm run production:evidence -- --dry-run`
- `npm run production:evidence:validate -- --zip <production-evidence.zip>`

最终结果以第 4.1 交付报告和证据包为准。

### 是否部署

未部署。未 push main，未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume，未运行 formal。

### 风险与遗留问题

- 本轮只证明本地证据链和 dry-run 可审计，不证明生产部署成功。
- 真实腾讯云部署仍需用户明确授权和单独生产验收。
- 当前系统仍不能写成支撑实战交易。

### 下一轮建议

先把第 4.1 证据包交给 GPT 做验收复查；通过后再由用户决定是否进入腾讯云生产部署授权审查。

## 2026-07-06 - 第 4.2 步腾讯云部署授权审查与真实生产部署准备

### 本轮目标

完成真实腾讯云部署前的授权审查和部署准备：确认推荐部署路径、Secrets / Runner 边界、服务器目标目录、部署前备份、部署后验证、回滚失败处理、证据包和防误提交规则。本轮不是部署轮。

### 修改范围

- `scripts/production/deploy-readiness.mjs`：新增第 4.2 部署准备证据生成和校验入口。
- `package.json`：新增 `production:deploy-readiness` 和 `production:deploy-readiness:validate`。
- `.gitignore`：补充第 4.2 evidence 目录和 zip 防误提交规则。
- `scripts/ci/check-forbidden-files.sh`：阻断第 4.2 evidence artifact 被 Git 跟踪。
- `docs/AUTO_DEPLOY_EVIDENCE_CHAIN.md`：明确当前不再默认 push main 自动部署，4.2 只做授权准备。
- `docs/TENCENT_RUNNER_SETUP.md`：明确 self-hosted runner 尚未安装，本轮只列 secret 名称和权限边界。
- `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`：明确真实部署必须单独授权，推荐服务器自拉 main + Docker Compose。
- `docs/deployment/PRODUCTION_OBSERVABILITY.md`：补充 4.2 部署准备证据命令。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`docs/chuan-market-radar-blueprint.md`：更新 4.2 当前事实和边界。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。
- 工程部署链路：增强，补齐真实部署前授权审查、Runbook、备份、验证、回滚和证据包。

### 测试结果

本轮必须跑：

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- `npm run security:check`
- `npm run production:health -- --dry-run`
- `npm run production:smoke -- --dry-run`
- `npm run production:status -- --dry-run`
- `npm run production:evidence -- --dry-run`
- `npm run production:evidence:validate -- --zip <production-evidence.zip>`
- `npm run production:deploy-readiness`
- `npm run production:deploy-readiness:validate`

最终结果以第 4.2 交付报告和 `phase4-2-tencent-deploy-readiness/` 证据包为准。

### 是否部署

未部署。未 push main，未同步腾讯云，未运行 migration，未动 Postgres / Redis / volume，未运行 formal。

### 风险与遗留问题

- 本轮只证明部署准备和授权审查完整，不证明生产已经同步。
- self-hosted runner 尚未安装和验收；真实自动部署仍需单独任务。
- 真实腾讯云部署前必须由用户明确授权，并现场确认服务器目标目录、生产 HEAD、Docker Compose、`.env.production`、Caddy、Postgres、Redis、worker 和 reports volume。
- 当前系统仍不能写成支撑实战交易。

### 下一轮建议

先把第 4.2 证据包交给 GPT 做验收复查；通过后再由用户明确决定是否进入真实腾讯云部署执行任务。

## 2026-07-06 - 第 4.3.1 步生产 Evidence 真实口径修复

### 本轮目标

修复第 4.3 暴露的生产 evidence 工具链问题：`production:evidence:validate` 仍套用第 4.1 dry-run 口径，以及生产 Docker runner 镜像未包含 `scripts/production/*.mjs`。本轮只修 evidence / validator / Docker 工具链，不改扫描、分析、策略、前端交易逻辑、数据库或 Redis。

### 修改范围

- `scripts/production/observability.mjs`：新增 `dry_run` / `real_production` 双模式；real production 使用 `phase4-3-1-summary.json`，并按真实生产字段校验 health、smoke、status、evidence、guard 和“仍不能实战”的边界。
- `Dockerfile`：runner 阶段只复制 `scripts/production`，并安装 `zip/unzip`，使生产容器内可以生成和验证 evidence。
- `scripts/verify/security-check.sh`：修复安全检查把源码中 `SECRET_RE` 正则定义误判成真实 secret 的问题。
- `.gitignore`：补充第 4.3 / 4.3.1 evidence 目录和 zip，防止证据包误提交。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：补充第 4.3.1 的当前事实。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。
- 工程证据链：增强，真实生产 evidence 不再混用 dry-run 口径。

### 测试结果

本地已通过：

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`：810 market + 17 worker + 4 historical smoke
- `npm run build`
- `npm run backtest:golden`：16/16
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- `npm run security:check`
- `npm run production:evidence -- --dry-run`
- `npm run production:evidence:validate -- --zip <dry-run production-evidence.zip>`

### 是否部署

本地修复已完成，尚未在本段记录腾讯云最终 web-only 重建结果。第 4.3.1 后续必须只重建 `web`，不动 Postgres / Redis / volume，不运行 migration，不运行 formal，不 push main。

### 风险与遗留问题

- 真实 production evidence 必须在腾讯云 web 镜像重建后重新生成并 validate pass。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。
- 本轮不允许把 evidence 工具链修复包装成交易能力提升。

### 下一轮建议

继续第 4.3.1 的腾讯云 web-only 重建、真实生产 evidence 生成和最终只读审计。

## 2026-07-07 - 第 4.3.2 步生产 Evidence 一致性与验证严格性最终收口

### 本轮目标

修复第 4.3.1 真实 production evidence 的附属证据不一致问题：`grep-evidence.md` 出现命令缺失文本、validator 未识别命令失败、`rollback-plan.md` 残留部署前旧口径、`production-evidence-validate-result.json` 非纯 JSON、`changed-files.txt` 不准，以及内外层 evidence 口径需统一。

### 修改范围

- `scripts/production/observability.mjs`：新增第 4.3.2 evidence phase；`grep-evidence` 改为 Node.js 内置文本扫描；`changed-files` 增加基线/当前 commit/已提交差异/未提交 tracked/未跟踪 artifact 分区；真实生产 rollback plan 改为部署后回滚口径；validator 增加 command failure、占位、非法 JSON、changed-files、rollback、4.3.2 summary 和多 summary 冲突检查；validate 支持 `--json-out` 生成纯 JSON；生产扫描 `partial` 时如实保留 partial，不误判成系统失败，也不冒充 pass；secret 检查改为逐行判断，避免把 evidence 中的规则名称误判为真实密钥；追加修复 `grep-evidence.md` 同一行多个 secret 检测模式只脱敏第一个的问题。
- `scripts/production/observability.test.mjs`：新增 production evidence validator fixture 测试，覆盖 4.3.2 partial 口径、真实 secret-like 文本拦截，以及生成的 grep evidence 不残留 `DATABASE_URL=` / `CRON_SECRET=` / `COINGLASS_API_KEY=` 字段模式。
- `package.json`：新增 `npm run test:production-evidence`。
- `scripts/ci/check-secret-patterns.sh`、`scripts/verify/security-check.sh`：过滤源码里的 secret 检测正则定义误报，不放过真实 secret 文本。
- `.gitignore`：补充第 4.3.2 evidence 目录和 zip，防止证据包误提交。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：补充第 4.3.2 当前事实。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。
- 工程证据链：增强，生产 evidence 的一致性和 validator 严格性提高。

### 测试结果

本地已通过：

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`：810 market + 17 worker + 4 historical smoke
- `npm run build`
- `npm run backtest:golden`：16/16
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- `npm run security:check`
- `npm run test:production-evidence`：9/9，追加修复后通过
- 追加修复后重新验证：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns、security-check 均通过；formal 未运行。
- dry-run `production:evidence` + `production:evidence:validate`：pass

### 是否部署

本段记录本地修复与门禁结果。追加修复前，腾讯云真实 evidence validate 已确认 `production_health` / `production_status` partial 口径可通过，但 `grep-evidence.md` 中源码 secret 检测规则文本仍被误判。追加修复后仍需重新跑本地门禁，并在腾讯云只重建 `web` 后重新生成真实 production evidence；不允许动 Postgres / Redis / volume，不运行 migration，不运行 formal，不 push main。

### 风险与遗留问题

- 真实 production evidence 必须在腾讯云 web-only 重建后重新生成并 validate pass。
- 第 4.3.2 完成后只能交给 GPT 做最终生产 evidence 审计，不能直接进入 shadow tracking。
- 当前系统仍不能写成支撑实战交易。

### 下一轮建议

只做一个方向：在腾讯云只重建 `web`，生成第 4.3.2 real production evidence，验证通过后交给 GPT 做最终生产 evidence 审计。

## 2026-07-07 - 第 5.1-R 步 Shadow Tracking v1 正式启动 PARTIAL

### 本轮目标

正式启动 Shadow Tracking v1：把生产 scan / analysis / strategy 输出写入 research-only 长期观察文件系统，生成 run manifest、first capture、checkpoint plan、runner lock/heartbeat、daily summary，并确保不影响生产排序、策略权重、前端 READY 或交易计划。

### 修改范围

- `src/lib/shadow/storage.ts`：支持第 5.1 baseline 与第 5.1-R live observation 双模式；新增 enrichment source/status/warnings 字段；保持 research-only、no live trading、no production mutation 边界。
- `src/lib/shadow/enrichment.ts`：新增 unifiedDecision enrichment gate，要求整体覆盖率至少 80%，WAIT/BLOCKED/READY 细节覆盖 100%。
- `src/scripts/shadow/shadow-tracking.ts`：新增 `start / stop / pause / resume / status / capture / checkpoint / daily-summary` CLI；`start` 必须先过 production health、production evidence、enrichment gate，失败时只写 preflight 证据，不启动假 run。
- `src/lib/shadow/storage.test.ts`：覆盖 baseline fake start 被拒绝、5.1-R live manifest 合法。
- `src/lib/shadow/enrichment.test.ts`：覆盖 scan embedded 优先、production contract enrichment、80% 覆盖门槛、非 OBSERVE 100% 细节门槛。
- `package.json`：新增 Shadow runner 脚本入口。

### 核心链路影响

- 全市场发现：未改生产扫描。
- 候选筛选：未改生产排序。
- 深扫验证：未改 CoinGlass 或公开交易所数据源。
- 结构分析：未改分析规则。
- 风险赔率：未改 RR / 止损 / 目标。
- 交易计划：未改 READY / WAIT / BLOCKED 生产逻辑。
- 复盘进化：增强 Shadow Tracking 研究观察入口，但未成功启动长期样本采集。

### 测试结果

- `npm run typecheck`：pass
- `npm run lint`：pass
- `npm run test:market`：pass，市场核心 821 pass，worker 17 pass，historical smoke 4 pass
- `npm run build`：pass
- `npm run backtest:golden`：pass，16/16
- `npm run ci:forbidden-files`：pass
- `npm run ci:secret-patterns`：pass
- `npm run security:check`：pass
- `npm run test:production-evidence`：pass
- `npm run shadow:validate`：pass

### 是否部署

未部署腾讯云，未 push main，未运行 formal，未动 Postgres / Redis / Docker volume。

### 风险与遗留问题

- 5.1-R 启动命令已执行，但结果为 `PARTIAL / preflight_failed`。
- 阻断原因：当前执行环境访问生产公网入口失败，出现 `production_health_fetch_failed:fetch failed` 与 `enrichment_preflight_failed:fetch failed`。
- 本轮没有生成 live run manifest，没有 first capture，没有 checkpoint plan，没有长期 runner lock/heartbeat；`shadowTrackingStarted=false`。
- 不能把本轮写成“Shadow Tracking 已启动”，不能写成系统支撑实战交易。

### 下一轮建议

只做一个方向：第 5.1.1 在腾讯云服务器侧或稳定生产访问通道中启动 Shadow Runner，生成真实 lock、heartbeat、first capture、checkpoint plan 和 daily summary 证据。
