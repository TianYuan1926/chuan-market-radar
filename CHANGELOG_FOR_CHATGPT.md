# Market Radar 外部审计变更日志

用途：给外部架构审计员 / ChatGPT 快速了解最近轮次发生了什么。本文只记录事实，不包含密钥、连接串、服务器密码、cookie、token 或私钥。

## 2026-07-10 - Market Radar Engineering Build & Production Runtime Blueprints v1.0

### 本轮目标

在 V3 实战就绪路线图之上，建立工程搭建蓝图与生产运行蓝图，使后续建设、生产值班、事故处理和外部审计使用同一套权威合同。

### 修改范围

- 新增 `docs/blueprints/README.md`。
- 新增 `docs/blueprints/MARKET_RADAR_ENGINEERING_BUILD_BLUEPRINT_V1.md`。
- 新增 `docs/blueprints/MARKET_RADAR_PRODUCTION_RUNTIME_BLUEPRINT_V1.md`。
- 新增 `docs/blueprints/market-radar-blueprint-traceability.v1.json`。
- 新增 `docs/blueprints/MARKET_RADAR_BLUEPRINT_V1_DELIVERY_REPORT.md`。
- 将 `docs/chuan-market-radar-blueprint.md` 改为兼容总索引，同时完整保留下方历史详细事实。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md` 和本文。
- 未修改任何业务代码、页面、API、DB、Redis、worker、Docker、Caddy、策略、RR 或 READY。

### 核心链路影响

- 工程蓝图把全市场发现、候选、深扫、结构、风险、计划、复盘映射为权威领域合同和模块所有权。
- 运行蓝图定义服务依赖、稳态时钟、运行流程、状态机、SLO、降级矩阵、告警、runbook、发布和恢复。
- 机器追踪矩阵将 7 个链路环节、G0-G8、当前路径、目标合同、运行检查和证据做成可解析 JSON。
- 本轮不改变运行链路，只建立后续施工和生产验收的唯一参照。

### 测试结果

- JSON parse：pass。
- 当前路径存在性：pass，缺失 0。
- Compose 服务映射：pass，11 个。
- 核心链路/Gate：pass，7 个环节、G0-G8 共 9 个。
- Markdown H1/围栏、footnote、语义 placeholder、敏感值、diff-check：pass。
- Mermaid 静态结构：13/13 有 `accTitle/accDescr`；本地未安装 renderer，本轮未声称完成视觉渲染测试。
- `typecheck / lint / test:market / build / backtest:golden`：未运行；本轮没有代码改动，不继承为本轮 PASS。
- `backtest:formal`：未运行。

### 是否部署

未提交、未 push、未部署、未执行 migration/restore/rollback、未重启任何服务。蓝图状态为 `PROPOSED`。

### 风险与遗留问题

- 当前仍是 `R1 / 可运行但不完整 / 不能支撑实战`。
- 蓝图完成不等于系统达到蓝图。
- 公网 HTTP、前端事实污染、生命周期映射、重复 scan proof 和 release/evidence 对齐等 G0/P0 仍未修复。
- 旧蓝图历史正文很长，但已明确降为低优先级事实保留区；后续不要继续向其中追加施工流水账。

### 下一轮建议

先审计并批准双蓝图；批准后只创建并实施 `WP-G0.1 - Frontend Truth Contract` 的独立计划。

## 2026-07-10 - Market Radar Practical Readiness Master Plan v3

### 本轮目标

把第二份更全面的历史方案、第一份历史 Master Plan、v2、最新全系统审计和当前实时/代码事实合并为一份唯一、可验收、可分阶段执行的实战就绪方案，并逐项分辨已完成、部分完成、过时、延期和未开始任务。

### 修改范围

- 新增 `docs/superpowers/plans/2026-07-10-market-radar-practical-readiness-master-plan-v3.md`。
- 新增 `docs/superpowers/plans/2026-07-10-market-radar-v3-current-state-matrix.json`，清洗历史方案 46 项任务。
- 将 v2 标记为 `SUPERSEDED`，保留为审计历史。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md` 和本文。
- 没有修改业务代码、scan/analysis/strategy/backtest、前端实现、API、Postgres、Redis、worker、生产配置或策略权重。

### 核心链路影响

- 本轮不改变运行中的核心链路，只重排后续建设与验收顺序。
- G0 先处理事实污染、Outcome 生命周期、公网 HTTPS/private session 和发布证据；这些是所有实战能力的前提。
- G1-G8 再依次处理可靠性、数据质量、提前发现、策略有效性、真实 Shadow、专业工作台、R4 模拟准入和 R5 长期治理。
- CoinGlass 旧鉴权故障、worker all-down 和从零建页面已从当前主线移除；Coinalyze、截图、CSV 和外部 AI 被延期到有证据证明必要时。

### 测试结果

- 当前生产页面和 `/api/health`：通过 Microsoft Edge 只读核验；这是点样本，不是 production evidence PASS。
- v3 Markdown 结构、46/46 项 JSON 解析与编号、100 分评分权重、G0-G8 阶段门禁、133 个现有文件引用、23 个未来新增文件分类、敏感值和 `git diff --check`：pass。
- `typecheck / lint / test:market / build / backtest:golden`：本轮未运行，因为没有业务代码改动；不得继承为本轮 PASS。
- `backtest:formal`：未运行。

### 是否部署

未提交、未 push、未部署、未执行 migration、未重启服务。v3 是 `PROPOSED`，不代表已授权实施。

### 风险与遗留问题

- 当前等级仍是 `R1 / 可运行但不完整 / 不能支撑实战`。
- 新 P0：生产公网入口为明文 HTTP，浏览器标记“不安全”。
- 既有 P0：前端合成事实、unknown/null 假 0/假 long/假 timeout、重复扫描证明、release/evidence/Git 对齐未闭环。
- 当前 READY=0、有效 MFE/MAE=0、Shadow approved/evaluated=0；不能用记录数量包装效果。

### 下一轮建议

v3 经审计批准后，只实施 `WP-G0.1 - Frontend Truth Contract`；完成并验收后再进入 G0.2。

## 2026-07-10 - Market Radar Practical Readiness Master Plan v2

### 本轮目标

对照旧版 16 阶段 Master Plan 和最新全系统审计，生成一份真正以人工实战决策辅助准入为目标的详细后续建设方案。

### 修改范围

- 新增 `docs/superpowers/plans/2026-07-10-market-radar-practical-readiness-master-plan.md`。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md` 和本文。
- 没有修改业务代码、scan/analysis/strategy/backtest 实现、前端页面、API、Postgres、Redis、worker、生产配置或策略权重。
- 未提交、未 push、未部署、未运行 formal。

### 主要调整

- 历史故障编号不再作为未来主线；改为 M0-M7 八个能力阶段。
- 前端事实污染、production evidence 和 Git/content 对齐前移到 M0。
- 备份恢复、SLO、安全、E2E 和负载基线前移到 M1。
- 数据能力改为先 Quality Gateway / instrument identity / 配额调度，不默认购买新数据源。
- 扫描、分析和策略必须经两个独立 holdout，Shadow 必须至少 60 天并满足样本门槛。
- 定义 R0-R5 能力等级；R4 准入需 readiness >=85/100、单项达标且无任何硬否决项。
- 付费 CoinGlass/Coinalyze 和服务器升级只能在遥测和 Shadow A/B 证明投入价值后建议。

### 测试结果

本轮只修改文档，不重复运行上轮已通过的代码门禁。已执行计划结构、文件路径、占位符、敏感字段和 `git diff --check` 复核。

### 是否部署

未部署。新计划状态为 `PROPOSED`，待用户/外部审计批准，不代表已授权任何实施。

### 风险与遗留问题

- 当前仍是 `可运行但不完整 / 不能支撑实战`。
- 计划通过不等于任何能力已通过。
- 进入 R4 的现实日历周期估计 6-9 个月，其中大部分时间是真实证据积累，不可压缩。

### 下一轮建议

请先审计并批准 v2。批准后只实施 `WP-M0.1 - Frontend Truth Contract Repair`。

## 2026-07-10 - Market Radar Comprehensive System Audit & Enhancement Plan

### 本轮目标

以首席系统架构、CEX 量化研究系统、风险控制和产品负责人四个视角，对整个 Market Radar 做代码事实、数据流、系统行为和真实生产页面的综合审计；输出当前水平、与专业 CEX 合约雷达的差距、评分和六阶段强化路线。本轮只审计和设计，不实施强化。

### 修改范围

- 新增 `market-radar-comprehensive-system-audit/MARKET_RADAR_COMPREHENSIVE_AUDIT_REPORT.md`。
- 新增 `market-radar-comprehensive-system-audit/market-radar-comprehensive-audit-summary.json`。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md` 和本文件。
- 生成脱敏审计 zip，不包含 `.env`、secret、raw logs、业务行数据、node_modules、`.next`、dist 或 build。

未修改业务代码、scan/analysis/strategy/backtest 逻辑、前端实现、API、数据库、Redis、worker、生产配置或策略权重；未提交、未 push、未部署、未运行 formal。

### 核心链路影响

- 全市场发现：确认三所公开轻扫和生产扫描真实可运行，但 coverage denominator 和深扫时效需统一。
- 候选筛选：确认 TopN 排序和前端 candidate fallback 仍有事实污染风险。
- 深扫验证：CoinGlass 当前 ready，但 clean rate、1/3 exchange coverage、约 23 小时轮转仍不足。
- 结构分析：概念覆盖较全，但专业审计分析分 46.57，不合格。
- 风险赔率：后端 RR>=3 和状态门禁严格；前端映射存在 P0。
- 交易计划：最近专业审计 100 节点 READY=0，策略分 22.48。
- 复盘进化：Shadow/Review 框架存在，但 recorded outcome、SYSTEM/USER/HYBRID 和真实 R 统计未闭环。

### 测试结果

- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：pass，market 835/835、worker 17/17、historical 4/4。
- `npm run build`：pass。
- `npm run backtest:golden`：pass，16/16。
- `npm run test:production-evidence`：pass，15/15。
- `npm run ci:forbidden-files`：pass。
- `npm run ci:secret-patterns`：pass。
- `npm run security:check`：pass。
- `npm run backtest:formal`：未运行。

### 是否部署

未部署。未提交，未 push main，未修改腾讯云生产。本轮只通过 OrcaTerm 和 Edge 做只读生产核验。

生产点样本：health ready，scan ready/fresh，scannedCount=38，candidateCount=24，六个业务 worker 当前 healthy。上一份正式 evidence 仍为 partial，本轮未重新生成，不能写成 evidence PASS。

### 风险与遗留问题

- P0：candidate display adapter 合成 direction/freshness/age/source/score/sentiment/volMult。
- P0：Review 把 pending/unknown 映射成 timeout/0/long。
- P0：market 把 light coverage 当 data trust，并把 unavailable 衍生品显示为 0。
- P0：最终 production evidence 与 Git/content alignment 未闭环。
- P1：深扫吞吐、专业扫描/分析/策略评分、Shadow outcome、Review 三模式未达标。
- 当前综合评分 53/100，准确状态为“可运行但不完整 / 不能支撑实战”。

### 下一轮建议

只做 `Phase 1A - Frontend Truth Contract Repair`；先收口事实层和生产证据，再进入数据或策略强化。

## 2026-07-09 - 第 5.1-H.1-R.2-SCAN-FIX-PROD 生产部署与扫描稳定性观察

### 本轮目标

把上一轮本地 SCAN-FIX 修复安全部署到腾讯云生产，并完成 30 分钟生产 scan 稳定性观察。

### 修改范围

- 生成证据目录：`phase5-1-h-1-r-2-scan-fix-prod-deploy-observation/`
- 通过 Edge OrcaTerm 创建服务器外部备份、传输 bundle、校验 hash、应用 14 个 allowlist 文件。
- 只重建并启动 `web`、`scanner-worker`、`coinglass-worker`、`dynamic-scan-scheduler`。
- 生成 post-deploy validation、30 分钟 observation、production evidence validate 结果、summary JSON 和本轮报告。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`。

未修改本轮 allowlist 之外代码，未修改策略逻辑，未修改 scan / analysis / strategy / UI 交易逻辑，未 push main，未运行 formal，未动数据库 schema，未清 Redis/Postgres/volume，未自动下单，未新增交易 API。

### 核心链路影响

- 全市场发现：部署后生产 API HTTP 200，但 scan 连续 30 分钟为 partial，`scannedCount=0`。
- 候选筛选：部署后 `candidateCount=0`，没有有效候选输出。
- 深扫验证：失败点为 CoinGlass 深扫 `auth_error`，`deepScanStatus=auth_error`、`coinglassStatus=auth_error`。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改。

### 测试结果

- `node --test scripts/production/observability.test.mjs`：pass，15/15。
- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：pass，market 835/835，worker 17/17，historical smoke 4/4。
- `npm run build`：pass。
- `npm run backtest:golden`：pass，16/16。
- `npm run test:production-evidence`：pass，15/15。
- `npm run ci:forbidden-files`：pass。
- `npm run ci:secret-patterns`：pass。
- `npm run security:check`：pass。
- 本地公网 `npm run production:evidence`：fail，`fetch failed`；本地 curl 到 `43.161.202.227` 80/443 超时。
- 服务器 web 容器内 production evidence：生成 pass，validate fail；失败原因为 production health/status 非 pass、scanGate 非 ok、CoinGlass `auth_error`。
- `npm run backtest:formal`：未运行。

### 是否部署

已部署到腾讯云生产，但生产 scan health 未通过。

- 服务器备份：已创建并移动到 `/home/ubuntu/market-radar-backups/...`。
- bundle sha256：`52c072143ba9a004b5db150d9c04df5fcbe812d61b55ed9aa4f42e0fd07e3da9`。
- allowlist：14/14 文件应用成功。
- 首次 build：因备份目录在项目根导致扫描备份源码失败，已通过移出备份目录修复。
- build/up 重试：通过。
- 目标服务：`web`、`scanner-worker`、`coinglass-worker`、`dynamic-scan-scheduler` 已运行约 55 分钟；`web` healthy。

30 分钟有效观察从 `2026-07-09T15:16:27Z` 到 `2026-07-09T15:46:33Z`，7/7 样本均为 HTTP 200 但 `scanStatus=partial`、`scannedCount=0`、`candidateCount=0`、`signalsCount=0`、`scanCriticalStatus=failed`、`coinglassStatus=auth_error`。

### 风险与遗留问题

- P1：生产 CoinGlass 仍为 `auth_error`，深扫不能产出候选。
- P1：real production evidence validate 正确失败，不能进入 5.1-H.1-R.2-RERUN。
- P1：生产 API HTTP 200 容易被误读为系统正常，但 scan 主链路持续失败。
- P2：生产镜像内 current HEAD / remote commit 不可用，后续证据包仍需在安全分支发布后重新生成。

### 下一轮建议

唯一下一步：修复腾讯云生产 CoinGlass `auth_error` / 运行时 key 或 provider capability 问题，只重启必要服务，然后重跑 post-deploy validation、30 分钟观察和 real production evidence validate；不要进入 5.1-H.1-R.2-RERUN / 5.1-H / 5.2。

## 2026-07-09 - 第 5.1-H.1-R.2-SCAN-FIX 生产扫描稳定性与 CoinGlass 限流根因修复

### 本轮目标

修复第 5.1-H.1-R.2-RERUN 阻断的生产扫描稳定性问题：CoinGlass 429 触发深扫降级、scan partial / aging、production evidence validate 失败。

### 修改范围

- `src/lib/market/providers/coinglass-client.ts`：新增 provider / endpoint request budget、Retry-After cooldown、429 controlled error、circuit breaker 和 rate-limit snapshot。
- `src/lib/market/providers/coinglass-provider.ts`、`src/lib/market/types.ts`、`src/lib/market/data-source-capabilities.ts`：新增 scanHealth segmentation、controlled degraded 分类和 CoinGlass 429 证据表达。
- `src/lib/api/system-health.ts`、`scripts/production/observability.mjs`：让 health / production evidence 使用更精确 scanGate，不再只依赖粗糙 `scan.status`。
- 相关测试：补充 CoinGlass cooldown/budget、scan health、production evidence controlled rate-limit 回归保护。
- 生成证据目录：`phase5-1-h-1-r-2-scan-fix-production-scan-stability/`。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`、`docs/chuan-market-radar-blueprint.md`。

未修改交易策略逻辑、READY 规则、RR、overlay、production ranking、数据库 schema、Redis/Postgres/volume、自动下单或交易 API。未运行 formal，未 push main。

### 核心链路影响

- 全市场发现：增加 scan health 分层，公开扫描与 CoinGlass 深扫状态可区分。
- 候选筛选：未改候选排序主逻辑；低优先级 defer / request dedupe 仍为 partial，需要生产观察后继续收口。
- 深扫验证：CoinGlass 429 不再混成 auth_error 或“市场无机会”，受控 rate_limited 会带 cooldown / budget 证据。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改 Shadow outcome 逻辑。

### 测试结果

- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：pass，market core 835 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：pass。
- `npm run backtest:golden`：pass，16/16。
- `npm run test:production-evidence`：pass，15/15。
- `npm run ci:forbidden-files`：pass。
- `npm run ci:secret-patterns`：pass。
- `npm run security:check`：pass。
- `npm run backtest:formal`：未运行。

### 是否部署

未部署。当前腾讯云旧生产经代理可访问且 scan ready/fresh，但生产尚未暴露本轮新增 `scanHealth` 口径，不能证明本轮修复已生效。

### 风险与遗留问题

- P1：本轮修复未部署到腾讯云生产。
- P1：未完成任务书要求的 30-60 分钟生产稳定性观察。
- P1：生产未暴露本轮新增 scanHealth 口径，不能重跑第 5.1-H.1-R.2-RERUN。
- P2：未来多 web 实例需要 Redis 分布式 provider budget。
- P2：当前 worktree 含历史 dirty 文件，需要后续按轮次清理。

### 下一轮建议

只做一个方向：部署本轮 scan-fix 到腾讯云，只重建必要服务，不动 DB/Redis/volume；观察 30-60 分钟并重新生成 production evidence，validate pass 后再重跑第 5.1-H.1-R.2-RERUN。

## 2026-07-09 - 第 5.1-H.1-R.2 步 Checkpoint Outcome 生产口径最终验收

### 本轮目标

验证生产 live Shadow Runner 的 checkpoint outcome 回填闭环是否真实可用，并确认是否可以进入第 5.1-H 24h Shadow Health Review。

### 修改范围

- 生成证据目录：`phase5-1-h-1-r-2-checkpoint-outcome-final-validation/`
- 生成总报告、summary JSON、Agent 报告、runtime/checkpoint/runner-loop/production isolation 证据。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`、`docs/chuan-market-radar-blueprint.md`。

本轮未修改业务代码、未修改 scan / analysis / strategy / UI 交易逻辑、未修改 checkpoint outcome core code、未 push main、未运行 formal、未动数据库 schema、未清 Redis/Postgres/volume、未开启自动交易。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改；生产 CoinGlass runtime 为 ready，Hobbyist 识别正常。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：manual checkpoint 回填链路通过，但 runner loop 自动 due sweep 未通过。

### 测试结果

- `test:production-evidence`：pass，14/14。
- `ci:forbidden-files`：pass。
- `ci:secret-patterns`：pass。
- `security:check`：pass。
- `typecheck`：pass。
- `lint`：pass。
- `test:market`：pass，market 827、worker 17、historical smoke 4。
- `build`：pass。
- `backtest:golden`：pass，16/16。
- `shadow:validate`：pass。
- `shadow:daily-summary`：pass。
- `backtest:formal`：未运行。

### 是否部署

未部署。未 push main。未运行 migration，未动 Postgres / Redis / Docker volume。

### 风险与遗留问题

- P1：Shadow runner loop 未保持运行，runner lock pid 不存活且 heartbeat stale；本轮只能证明 manual checkpoint 闭环，不能证明自动 due sweep。
- P2：腾讯云服务器 worktree 仍 dirty，content hash / deploy clean 口径仍 partial。
- P2：旧 Shadow baseline 缺 `priceAtObservation`，导致到期 checkpoint 被正确标记为 `pending_with_error`，尚未产生 recorded/missed 样本。

### 下一轮建议

只做一个方向：修复 Shadow runner loop 启动/保活/自动 checkpoint due sweep，然后重跑第 5.1-H.1-R.2。

## 2026-07-08 - 第 5.1-H.1-R.1 步 Production Evidence Health / Status Partial 收口

### 本轮目标

查清 production evidence validate 因 `production_health=partial` 和 `production_status=partial` 失败的真实原因；不得伪造 pass，不得弱化 validator，不得修改 scan / analysis / strategy / UI 交易逻辑。

### 修改范围

- `scripts/production/observability.mjs`：修复 evidence 采集口径，支持本地 ops 代理只读采集；production status 每次重新采集当前 health/smoke，不再复用旧文件；拆分 `scan.status` 与 `scan.freshness`；worker heartbeat down 会导致 health/status partial。
- `scripts/production/observability.test.mjs`：新增 stale scan、worker down、stale 文件复用、summary/status 不一致等回归测试。
- `scripts/ops/*`：本轮检查涉及 ops 脚本输出脱敏口径；proxy 原值不得进入报告。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`、`docs/chuan-market-radar-blueprint.md`：更新当前真实状态。
- 生成证据目录：`phase5-1-h-1-r-1-production-evidence-health-status-fix/`。

未修改 scan 业务逻辑、analysis 业务逻辑、strategy 业务逻辑、UI 交易逻辑、READY 规则、overlay、数据库 schema、Redis、Postgres、volume 或自动交易接口。未运行 formal。未 push main。

### 核心链路影响

- 全市场发现：未改业务逻辑；生产公开发现层可访问，liveInstrumentCount=1315。
- 候选筛选：未改。
- 深扫验证：未改业务逻辑；本轮确认生产 CoinGlass 深扫实际为 `auth_error`，`cleanRows=0`，不能包装成市场无机会。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未改 checkpoint/outcome code；当前仍不能进入 5.1-H.1-R.2。

### 测试结果

- `ci:forbidden-files`：pass。
- `ci:secret-patterns`：pass。
- `security:check`：pass。
- `typecheck`：pass。
- `lint`：pass。
- `test:production-evidence`：pass，14/14。
- `test:market`：pass，market 827、worker 17、historical smoke 4。
- `build`：pass。
- `backtest:golden`：pass，16/16。
- `production:evidence:validate`：fail，且失败是正确拦截：`production_health` 与 `production_status` 仍不是 pass。
- `backtest:formal`：未运行。

### 是否部署

未部署。未 push main。未运行 migration，未动 Postgres / Redis / Docker volume，未清 Redis，未自动下单。

### 风险与遗留问题

- P1：生产 CoinGlass deep scan 鉴权失败，后端合同显示 `deepScanStatus=auth_error`，`/api/futures/pairs-markets` 返回 `Invalid API key provided`。
- P1：生产 worker heartbeat 全部 down：scanner、websocket-light、coinglass、signal、dynamic-scan-scheduler、macro 均未收到心跳。
- P1：`/api/scan` 当前 `status=partial`，`scannedCount=0`，`candidateCount=0`，`signals=0`。
- P1：production evidence validate 仍 fail，因此不能进入 5.1-H.1-R.2。
- P2：本轮未从服务器终端直接读取 server Git HEAD，只能记录为 unknown/partial。

### 下一轮建议

只做一个方向：先修复腾讯云生产 CoinGlass API key / 套餐鉴权与 worker heartbeat，然后重跑第 5.1-H.1-R.1。不要进入 5.2。

## 2026-07-08 - 第 5.1-H.1-R 步 Checkpoint Outcome 回填生产口径验证（未应用生产）

### 本轮目标

把第 5.1-H.1 本地已验证的 checkpoint outcome 回填修复，安全应用到腾讯云 live Shadow Runner，并验证生产 run `shadow-v1-20260707T182114Z` 的到期 checkpoint 是否真实转为 `recorded / missed / pending_with_error`。

### 修改范围

- 推送 GitHub 安全分支：`codex/phase5-1-h-1-r-checkpoint-outcome-production-validation`
- 安全分支 commit：`8518a14dcf03cd70e5470c3c9fd81e6e23a5dcb2`
- commit 只包含：
  - `src/lib/shadow/storage.ts`
  - `src/scripts/shadow/shadow-tracking.ts`
  - `src/lib/shadow/storage.test.ts`
- 生成证据目录：`phase5-1-h-1-r-checkpoint-outcome-production-validation/`

本轮未修改 scan / analysis / strategy / UI 交易逻辑。未 push main。未运行 formal。未动数据库 schema、Redis、Postgres 或 volume。未部署腾讯云。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：安全分支已准备 checkpoint outcome 修复，但尚未应用生产。

### 测试结果

- `typecheck`：pass。
- `lint`：pass。
- `ci:forbidden-files`：pass。
- `ci:secret-patterns`：pass。
- `security:check`：pass。
- `shadow:validate`：pass。
- `test:market`：pass，market 827、worker 17、historical smoke 4。
- `build`：pass。
- `backtest:golden`：pass，16/16。
- 服务器 `shadow:checkpoint -- --dry-run`：未运行。
- 服务器 `shadow:checkpoint`：未运行。
- 服务器 production evidence validate：未运行。
- `backtest:formal`：未运行。

### 是否部署

未部署。生产应用失败原因不是代码测试失败，而是没有可用服务器控制通道：

- 直接 SSH 到腾讯云超时。
- 通过本机代理进入 SSH 认证阶段后失败。
- Codex 内置浏览器自动化未暴露 OrcaTerm 标签。

公网 `/api/health` 经代理返回 ready/fresh，只能证明生产当前可访问，不能证明本轮修复已应用。

### 风险与遗留问题

- P1：未创建服务器备份，禁止声称生产应用完成。
- P1：未同步腾讯云 worktree，未验证 server content hash。
- P1：未执行服务器 dry-run/manual checkpoint/idempotency/runner-loop due sweep。
- P1：未验证 production ranking not mutated / research-only isolation。
- P2：安全分支已推送，但服务器仍需在可控终端中拉取并执行生产口径验证。

### 下一轮建议

只做一个方向：在可控腾讯云终端中应用安全分支并重跑第 5.1-H.1-R 服务器侧验证。不要进入 5.2。

## 2026-07-08 - 第 5.1-H.1 步 Checkpoint Outcome 回填闭环修复

### 本轮目标

修复 Shadow checkpoint 到期后只停留在 pending、不写 outcome 的闭环问题。本轮目标是让到期 checkpoint 可以按真实数据和安全边界转为 `recorded`、`missed` 或 `pending_with_error`，并保持 research-only，不污染 production。

### 修改范围

- `src/lib/shadow/storage.ts`：新增 checkpoint outcome schema、状态分布、outcome writer、missing price/data source fail/idempotency/dry-run 逻辑、latest/daily summary checkpoint 状态统计。
- `src/scripts/shadow/shadow-tracking.ts`：新增 `shadow:checkpoint -- --dry-run`、manual checkpoint 写入、Binance Futures 历史 K 线 price source adapter、atomic JSON/JSONL 写入、legacy storage 兼容、runner loop 每次 capture 后轻量 due sweep。
- `src/lib/shadow/storage.test.ts`：新增 due checkpoint recorded、missing price pending_with_error、not due pending、dry-run 不变更、idempotency、data source fail 等测试。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`、`docs/chuan-market-radar-blueprint.md`：更新当前事实与下一步边界。
- `phase5-1-h-1-checkpoint-outcome-fix/`：本轮证据目录。

未修改 scan / analysis / strategy / UI 交易逻辑。未降低 RR。未开启自动交易。未运行 formal。未动数据库 schema、Redis、Postgres 或 volume。未应用到腾讯云 Shadow Runner。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：增强 Shadow research-only checkpoint/outcome 记录闭环，为后续复盘样本提供基础；不回写生产排序，不自动调参。

### 测试结果

- 本地修复结论：`PARTIAL_LOCAL_FIX_READY`。
- 本地验证 runId：`shadow-20260707T134822Z`。
- 修复前：checkpoint total=72、due=48、duePending=48、recorded=0、missed=0、pending_with_error=0。
- 修复后：checkpoint total=72、due=48、duePending=0、pending=24、recorded=0、missed=0、pending_with_error=48，`outcomes.jsonl` 写入 48 行。
- recorded=0 的原因：本地 legacy baseline 缺少 `priceAtObservation`，系统正确标记为 `pending_with_error / MISSING_PRICE_AT_OBSERVATION`，没有伪造检测价或未来结果。
- `shadow:checkpoint -- --dry-run`：pass，dry-run 未修改 checkpoint-plan/outcomes/latest/daily-summary。
- `shadow:checkpoint`：pass，首次写入 48 行，后续重跑 `skippedExisting=48`、`outcomesWritten=0`。
- `shadow:validate`：pass。
- `shadow:daily-summary`：pass。
- Shadow storage 单测：13/13 pass。
- `typecheck`：pass。
- `lint`：pass。
- `test:market`：pass，market 827、worker 17、historical smoke 4。
- `build`：pass。
- `backtest:golden`：pass，16/16。
- `ci:forbidden-files`：pass。
- `ci:secret-patterns`：pass。
- `security:check`：pass。
- `backtest:formal`：未运行。

### 是否部署

未部署。未 push main。未同步腾讯云。未运行 migration，未动 Postgres / Redis / Docker volume，未清 Redis，未自动下单。

### 风险与遗留问题

- P1：本轮只完成本地修复，未应用到腾讯云 live Shadow Runner，因此不能写成生产 checkpoint 闭环通过。
- P1：腾讯云 live run `shadow-v1-20260707T182114Z` 仍需在应用修复后重新验证 due checkpoint 是否下降、是否正确分类。
- P1：旧 baseline 缺少 `priceAtObservation` 的 checkpoint 只能进入 `pending_with_error`，不能补算真实 outcome；未来 capture 必须保证 observation price 记录完整。
- P2：本轮引入 Binance Futures historical kline adapter，后续生产应用时需观察公开接口限速和失败重试。

### 下一轮建议

只做一个方向：进入 `5.1-H.1-R`，把修复安全应用到腾讯云 research-only Shadow Runner，并验证生产 live run 的 checkpoint outcome 回填。不要进入 5.2。

## 2026-07-08 - 第 5.1-H-R 步 Shadow Runner 24h 健康复查重跑

### 本轮目标

对第 5.1.1 已启动的 Shadow Runner 重跑 24 小时健康复查，优先使用腾讯云服务器内侧口径确认 runner、heartbeat、checkpoint、daily summary、production health 和 research-only 边界。

### 修改范围

- `phase5-1-h-r-shadow-24h-health-review/`：生成本轮 5.1-H-R 只读健康复查证据目录。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：更新 5.1-H-R 事实结论。
- `CHANGELOG_FOR_CHATGPT.md`：记录本轮。
- `docs/chuan-market-radar-blueprint.md`：更新 Shadow Tracking 当前边界。

未修改 scan / analysis / strategy / UI 交易逻辑。未修改 Shadow runner core。未修改数据库 schema。未部署生产。未运行 formal。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：只读复查 Shadow Tracking 运行证据；不回写生产排序，不自动调参，不生成交易计划。

### 测试结果

- 结论：`PARTIAL_NOT_DUE`。
- runId：`shadow-v1-20260707T182114Z`。
- startedAt：`2026-07-07T18:21:14.045Z`。
- 本轮服务器采集时间：`2026-07-08T06:25:07Z`。
- 本轮采集时已运行约 12.06 小时，未满 24 小时。
- 预计 24h 到期时间：`2026-07-08T18:21:14.045Z`。
- runner：PID 737 alive，cmdline 为 `shadow-tracking.js run-loop`，lock/runId 一致，heartbeatAt `2026-07-08T06:21:27.798Z`，heartbeat fresh。
- production API：服务器内侧 `/api/health`、`/api/scan`、`/api/radar/backend-contract` 均 HTTP 200；`/api/health` level=ready、freshness=fresh。
- enrichment：gate pass，overallCoverage=1，nonObserveCoverage=1，READY=0。
- checkpoint：pending=2436，dueCount=1323，未发现 fake outcome，但 1h/4h due checkpoint 仍 pending，outcome 回填闭环尚未证明可用。
- `typecheck`：pass。
- `lint`：pass。
- `test:market`：pass，821 + worker 17 + historical 4。
- `build`：pass。
- `backtest:golden`：pass，16/16。
- `ci:forbidden-files`：pass。
- `ci:secret-patterns`：pass。
- `security:check`：pass。
- `test:production-evidence`：pass，9/9。
- `ops:network-check`：pass under `OPS_PROXY_URL=socks5://127.0.0.1:7892`。
- `ops:node-fetch-check`：pass under explicit proxy / curlFallback；direct 仍 partial。
- `backtest:formal`：未运行。

### 是否部署

未部署。未 push main。未运行 migration，未动 Postgres / Redis / Docker volume，未清 Redis，未自动下单。

### 风险与遗留问题

- P1：Shadow run 未满 24 小时，不能完成 24h PASS 复查，不能进入 5.2。
- P1：1h/4h due checkpoint 仍为 pending，尚未形成 outcome 回填闭环。
- P1：Shadow manifest 的 production commit `45d854afafb9ba7931a30973bf8e553cd0b91f7d` 与服务器当前 HEAD `ae6852cfa2a2c9c09faa5d41ae6f5c886f023679` 不一致，后续正式 24h 验收需收口。
- P1：腾讯云服务器 tracked 工作区存在未提交变更，后续部署/证据复现需要先收口。
- P2：checkpoint plan / status 仍有“第 5.1 / 5.1-R pending checkpoint”旧文案残留，需要后续文案修复轮清理。
- P2：默认 `/app/reports/shadow-tracking` 目录为空，本轮必须显式指定 out-dir 才能看到当前 runner；后续证据脚本需要固定该口径。
- P2：服务器磁盘使用率约 84%，需要继续观察 reports/log 增长。

### 下一轮建议

只做一个方向：等 `2026-07-08T18:21:14.045Z` 之后重跑第 5.1-H；如果 checkpoint outcome 仍 pending，则先做“checkpoint outcome 闭环修复”，不要进入 5.2。

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

## 2026-07-08 - 第 5.1-H-pre 步 Checkpoint Due / Outcome 预检查

### 本轮目标

提前检查 Shadow checkpoint due / outcome 回填闭环，避免等正式 24h 后才发现 checkpoint runner 没有执行或 outcome 回填逻辑未接通。本轮不是 24h PASS，不是 5.2，不改策略、不改 UI、不部署、不跑 formal。

### 修改范围

- 生成 `phase5-1-h-pre-checkpoint-outcome-precheck/` 报告与证据包。
- 更新 `PROJECT_CONTEXT_FOR_CHATGPT.md` 和 `docs/chuan-market-radar-blueprint.md`，固化当前真实状态。
- 未修改 scan / analysis / strategy / unifiedDecision / overlay / RR / production ranking / DB schema / Redis / Postgres / volume。

### 核心链路影响

- 全市场发现：未改。
- 候选筛选：未改。
- 深扫验证：未改。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：发现 Shadow checkpoint outcome 回填闭环未接通，必须先做 5.1-H.1。

### 测试结果

- `OPS_PROXY_URL=socks5://127.0.0.1:7892 npm run ops:network-check`：pass，proxy 7/7 reachable；direct partial 不判 production fail。
- `npm run ci:forbidden-files`：pass。
- `npm run ci:secret-patterns`：pass。
- `npm run security:check`：pass。
- `npm run shadow:status`：pass，但本地默认 outDir 无当前生产 run，只能说明本地命令可执行。
- `npm run shadow:validate`：pass。
- `npm run shadow:checkpoint -- --dry-run`：fail；项目不支持 dry-run，且本地默认 outDir 缺当前生产 manifest。
- `npm run shadow:daily-summary`：fail；本地默认 outDir 缺当前生产 manifest。
- 腾讯云 web 容器显式 `--out-dir /app/reports/phase5-1-1-tencent-shadow-runner-start/shadow --run-id shadow-v1-20260707T182114Z` 执行 manual checkpoint / validate / daily-summary：可执行且安全，但只刷新 due report，不回填 outcome。
- formal：未运行。

### 是否部署

未部署，未 push main，未运行 migration，未清 Redis / Postgres / volume，未自动下单。

### 风险与遗留问题

- P0：无新增。
- P1：checkpoint outcome 闭环未实现/未证明；checkpoint total=2664、due=1464、pending=2664、recorded=0、missed=0、pending_with_error=0。
- P1：runner loop 不调用 checkpoint；manual checkpoint 只写 `checkpoint-status.json`。
- P1：`priceAtObservation` 当前缺失，`priceAtCheckpoint` 无价格源，`outcomesPath` 无实际 writer。
- P2：本地默认 outDir 与生产 runner outDir 分裂，容易误判。
- P2：checkpoint notes 仍残留旧阶段文案。

### 下一轮建议

只做一个方向：第 5.1-H.1 checkpoint outcome 回填闭环修复。修复必须保持 research-only，不得污染 production ranking，不得提前回填，不得用未来数据。

## 2026-07-09 - 第 5.1-H.1-R.2-RERUN Checkpoint Outcome 生产口径最终验收重跑

### 本轮目标

在第 5.1-H.1-R.2-FIX 修复 Shadow Runner loop 后，重跑 Checkpoint Outcome 生产口径最终验收，确认是否可以进入第 5.1-H 24h Shadow Health Review。

### 修改范围

- 未修改业务代码、策略逻辑、扫描逻辑、前端交易展示、checkpoint outcome 逻辑或 runner loop。
- 生成证据目录：`phase5-1-h-1-r-2-rerun-checkpoint-outcome-final-validation/`。
- 更新项目上下文：`PROJECT_CONTEXT_FOR_CHATGPT.md`、`docs/chuan-market-radar-blueprint.md`、`CHANGELOG_FOR_CHATGPT.md`。

### 核心链路影响

- 全市场发现：未改逻辑；本轮发现生产 scan 回退为 partial/aging。
- 候选筛选：未改。
- 深扫验证：未改；本轮证据显示 CoinGlass 429 触发 scan partial。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改。
- 复盘进化：未进入 checkpoint outcome 验收，因为 Step 0 运行健康失败。

### 测试结果

- production:evidence generate：pass
- production:evidence validate：fail，原因 `phase4-3-1-summary.json.production_status must be pass`
- test:production-evidence：pass
- ci:forbidden-files：pass
- ci:secret-patterns：pass
- security:check：pass
- typecheck / lint / test:market / build / backtest:golden：未运行，原因是任务书要求 Step 0 runtime health regression 时停止 checkpoint 验收
- formal：未运行，任务禁止

### 是否部署

未部署。未 push main，未动数据库、Redis、Postgres 或 volume。

### 风险与遗留问题

- P0：无新增。
- P1：生产 `scan.status=partial`，第二次复查 `scan.freshness=aging`；production evidence validate 失败，因此不能进入 5.1-H。
- P2：SSH/OrcaTerm 自动通道仍不可用，服务器 Git HEAD / dirty worktree / content hash 未本轮复核；本地工作区原本存在 dirty tracked changes。

### 下一轮建议

只做一个方向：先恢复生产 `scan.status=ready` 并让 production evidence validate pass，然后从 Step 0 重跑 5.1-H.1-R.2-RERUN。

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

## 2026-07-08 - 第 5.1-H.1-R.1-FIX 生产运行健康根因修复

### 本轮目标

修复第 5.1-H.1-R.1 暴露的生产运行健康问题：CoinGlass auth_error、worker heartbeat 全 down、POST `/api/scan` 401、scan partial/scannedCount=0、production evidence health/status partial。

### 修改范围

- `deploy/scripts/update-prod-coinglass-key.sh`：recreate 列表加入 `websocket-light-worker`，避免 CoinGlass key 更新后该 worker 继续使用旧环境变量。
- 腾讯云生产运行环境：安全注入新的 CoinGlass key，并重建 web 与全部 worker；未输出 key 原值。
- 证据目录：生成 `phase5-1-h-1-r-1-fix-production-runtime-health/`，包含根因报告、before/after JSON、production evidence、validate 结果、安全审计和 Agent 报告。

### 核心链路影响

- 全市场发现：恢复生产 scan 正常刷新，`scannedCount` 从 0 恢复为大于 0。
- 候选筛选：恢复候选输出；未改排序策略。
- 深扫验证：CoinGlass auth_error 解除，Hobbyist 可用深扫端点恢复。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改 READY / WAIT / BLOCKED 规则。
- 复盘进化：未改 checkpoint outcome；下一轮仍需做生产口径最终验收。

### 测试结果

- `npm run ci:forbidden-files`：pass
- `npm run ci:secret-patterns`：pass
- `npm run security:check`：pass
- `npm run test:production-evidence`：pass
- `npm run typecheck`：pass
- `npm run lint`：pass
- `npm run test:market`：pass
- `npm run build`：pass
- `npm run backtest:golden`：pass
- production health/smoke/status/evidence：pass
- production evidence validate：pass，errors=[]，warnings=[]
- formal：未运行

### 是否部署

已在腾讯云生产运行环境安全更新 CoinGlass key 并重建必要容器。未 push main，未运行 migration，未修改数据库 schema，未清 Redis/Postgres，未删除或重建 volume。

### 风险与遗留问题

- P0：无新增。
- P1：本轮 runtime health 无阻断 P1。
- P2：服务器 Git worktree 仍为 dirty，后续部署/验收前需要收口；CoinGlass Hobbyist 仍有部分端点 blocked，必须继续显示能力边界。
- 当前系统仍不能写成支撑实战交易，不能进入 5.2，不能进入实盘。

### 下一轮建议

只做一个方向：进入 `5.1-H.1-R.2 checkpoint outcome 生产口径最终验收`。

## 2026-07-09 - 第 5.1-H.1-R.2-FIX Shadow Runner Loop 根因修复

### 本轮目标

根治 Shadow Runner 自动循环不持续运行的问题：修复 supervisor、lock、heartbeat、status 假 running、capture loop、auto checkpoint due sweep。

### 修改范围

- `src/lib/shadow/runner-runtime.ts`：新增 runner 真实运行态推导。
- `src/lib/shadow/runner-runtime.test.ts`：新增 stale/dead/fresh/remote heartbeat 测试。
- `src/scripts/shadow/shadow-tracking.ts`：`run-loop` 自持锁、写 heartbeat、自动 capture + checkpoint + daily-summary；新增 stale lock cleanup、duplicate guard、`health` command。
- `docker-compose.yml`：新增 `shadow-runner` 服务，使用 `restart: unless-stopped`。
- `Dockerfile`：runner 镜像复用 deps 阶段 node_modules 后 `npm prune --omit=dev`，避免生产构建二次 `npm ci` 网络超时。
- `package.json`：新增 `shadow:prod:run-loop`、`shadow:prod:health`。
- `phase5-1-h-1-r-2-fix-shadow-runner-loop/`：生成本轮报告、summary、production evidence 和脱敏证据包。

### 核心链路影响

- 全市场发现：未改生产扫描排序或信号生成。
- 候选筛选：未改候选排序。
- 深扫验证：未改 CoinGlass / 公开交易所数据逻辑。
- 结构分析：未改。
- 风险赔率：未改 RR / 止损 / 目标。
- 交易计划：未改 READY / WAIT / BLOCKED 规则。
- 复盘进化：修复 Shadow research-only runner 的长期采样和 checkpoint due sweep 运行基础。

### 测试结果

- `npm run build:market-cli`：pass
- runner-runtime 定向测试：4 pass
- runner-runtime + shadow storage：17 pass
- `npm run typecheck`：pass
- `npm run lint`：pass
- `npm run test:market`：pass，市场核心 831 pass，worker 17 pass，historical smoke 4 pass
- `npm run build`：pass
- `npm run backtest:golden`：pass，16/16
- `npm run ci:forbidden-files`：pass
- `npm run ci:secret-patterns`：pass
- `npm run security:check`：pass
- `npm run test:production-evidence`：pass，14/14
- `shadow:prod:validate`：pass
- production smoke：pass
- production evidence validate：real_production / pass / errors=[] / warnings=[]
- formal：未运行

### 是否部署

已在腾讯云生产环境只重建并启动 `shadow-runner` 服务。未 push main，未运行 migration，未修改数据库 schema，未清 Redis/Postgres，未删除或重建 volume。

### 风险与遗留问题

- P0：无新增。
- P1：本轮只证明 runner loop 根因修复；下一步必须重跑 `5.1-H.1-R.2 checkpoint outcome 生产口径最终验收`。
- P2：服务器 Git worktree 仍有历史 dirty 状态；本轮生产侧通过文件覆盖 + `shadow-runner` 重建完成，后续需要用 Git 分支/部署链路收口。
- 当前系统仍不能写成支撑实战交易，不能进入 5.2，不能进入实盘。

### 下一轮建议

只做一个方向：重跑 `5.1-H.1-R.2 checkpoint outcome 生产口径最终验收`。

## 2026-07-09 - 第 5.1-DEPLOY-CHANNEL-FIX 腾讯云部署通道恢复诊断

### 本轮目标

恢复或诊断腾讯云部署通道，目标是至少恢复一条 Codex 可自动执行的服务器通道，并完成服务器只读 smoke。

### 修改范围

- `phase5-deploy-channel-fix/`：生成本轮部署通道诊断报告、summary、baseline、direct/SOCKS/OrcaTerm 诊断、只读 smoke 结果、已知问题、回归保护、安全审计、风险、下一步和 agent 报告。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：更新最新真实状态，明确本轮 PASS 来自 Edge OrcaTerm，不是 SSH。
- `CHANGELOG_FOR_CHATGPT.md`：追加本轮摘要。

未修改项目业务代码、scan / analysis / strategy / backtest / frontend / API 逻辑。

### 核心链路影响

- 全市场发现：未改；SCAN-FIX 仍不能写成已部署。
- 候选筛选：未改。
- 深扫验证：未改 CoinGlass 逻辑。
- 结构分析：未改。
- 风险赔率：未改。
- 交易计划：未改 READY / WAIT / BLOCKED。
- 复盘进化：未改 Shadow / backtest；本轮恢复后续生产验证所需的服务器只读/执行入口。

### 测试结果

- `npm run typecheck`：未运行，本轮未改项目代码。
- `npm run lint`：未运行，本轮未改项目代码。
- `npm run test:market`：未运行，本轮未改市场核心逻辑。
- `npm run build`：未运行，本轮未改项目代码。
- `npm run backtest:golden`：未运行，本轮未改回测或策略。
- formal：未运行，且本轮禁止。
- Chrome OrcaTerm：fail，Chrome 当前只有新标签页。
- Edge OrcaTerm：pass，用户打开后 Codex 可通过 Computer Use 控制。
- SSH direct：fail，直连 22 超时，未进入认证。
- SSH SOCKS：partial，SOCKS 代理和 TCP 22 可达，但 SSH 在 KEX/banner 前后关闭，未进入 publickey 认证。
- server readonly smoke：pass，经 Edge OrcaTerm 完成。观察到 `ubuntu@VM-0-9-ubuntu`、项目目录 `/home/ubuntu/apps/chuan-market-radar`、Docker 29.1.3、Docker Compose 2.40.3，`sudo -n docker compose ps` 显示 caddy、web、scanner-worker、coinglass-worker、dynamic-scan-scheduler、websocket-light-worker、signal-worker、macro-worker、shadow-runner、postgres、redis 等服务运行。

### 是否部署

未部署。未 push main，未同步腾讯云，未 rsync/scp，未 Docker build/up/restart，未运行 migration，未动 Postgres / Redis / volume。

### 风险与遗留问题

- P0：无新增。
- P1：SCAN-FIX 仍未部署，不能宣称 `scanHealth` / CoinGlass budget / cooldown / circuit breaker 已在生产生效。
- P1：direct SSH 超时；SOCKS TCP 22 可达但 SSH 在认证前关闭。当前恢复的是 OrcaTerm，不是 SSH。
- P1：Edge OrcaTerm 依赖用户保持页面登录态和可控状态。
- P2：Chrome 没有 OrcaTerm 标签；OrcaTerm 实际位于 Microsoft Edge。

### 下一轮建议

唯一下一步：使用当前 Edge OrcaTerm 通道重跑 `5.1-H.1-R.2-SCAN-FIX-PROD`，只部署 SCAN-FIX allowlist 文件，只重建必要服务，并做 30-60 分钟生产稳定性观察。

## 2026-07-10 / Git 工作区清理、腾讯同步与部署真值强化

### 本轮目标

清理 GitHub Desktop 混合工作区，提交应推送内容并移除生成态噪音；确认腾讯服务器同步到最新 `main`；修复真实部署中暴露的 readiness、Shadow supervisor health 和自动回滚真值缺口。

### 修改范围

- Git 清理：归档并移除工作区生成态 production JSON、临时恢复稿、空目录和可重建构建产物；保留 `.env*`、历史报告、证据包、worktree、node_modules。
- `scripts/deploy/auto-deploy.sh`：显式 production deploy 失败时向 rollback 传递 production rollback 确认。
- `scripts/verify/production-check.sh`：API readiness 600 秒、Shadow readiness 660 秒，并强制校验本容器 Shadow heartbeat。
- `docker-compose.yml`：Shadow 路径/run id 进入容器环境，runner 改为 Node PID 1。
- `src/lib/shadow/runner-runtime.ts`、`src/scripts/shadow/shadow-tracking.ts`：health 只接受本地活 PID 锁，不把 remote heartbeat 当本 supervisor healthy。
- `scripts/audit/collect-production-facts.sh`：纳入 Shadow 状态和日志。
- `scripts/deploy/deploy-safety.test.mjs`、`src/lib/shadow/runner-runtime.test.ts`：新增部署安全和本地 supervisor 真值回归测试。

### 核心链路影响

- 全市场发现：未改排序与发现逻辑；只提高部署后 scan/worker 真实可用性的验收可信度。
- 候选筛选、深扫验证、结构分析、风险赔率、交易计划：未改。
- 复盘进化：Shadow runner 运行监督与 heartbeat 验收更严格；未改变 outcome 算法。

### 测试结果

- `npm run typecheck`：pass
- `npm run lint`：pass
- `npm run test:market`：pass，836/836
- worker tests：pass，17/17
- historical smoke：pass，4/4
- `npm run build`：pass
- `npm run backtest:golden`：pass，16/16
- `npm run ci:forbidden-files`：pass
- `npm run ci:secret-patterns`：pass
- `npm run security:check`：pass
- `npm run test:deploy-safety`：pass，5/5
- `npm run test:production-evidence`：pass，15/15
- Tencent `docker compose config --quiet`：pass
- Tencent production check / Postgres / Redis / workers / Shadow local heartbeat：pass
- formal：未运行

### 是否部署

已推 GitHub 恢复分支、`codex/deploy-truth-hardening` 和 `main`。腾讯生产仓库已同步到 `main@a247b59769ee4ec39e7160f50ac6727432a891c7`；仅最终重建 `shadow-runner` 镜像与容器，未运行 migration，未修改数据库 schema，未清 Redis/Postgres，未删除或重建 volume。

### 风险与遗留问题

- P0：无活动阻断。
- P1：本轮发现的部署 false-negative、自动回滚 dry-run、Shadow remote heartbeat 假健康已修复并生产验证。
- P2：服务器仍保留热修 stash 与外置历史证据归档，作为回退审计材料；不要在未复核前删除。
- 系统仍为 `可运行但不完整 / 不能支撑实战`，不得因生产健康而宣称 G0-G9 完成。

### 下一轮建议

只进入蓝图首包 `WP-G0.1 Frontend Truth Contract`，先消除前端合成方向、伪 freshness、假 0 和未知值伪装。

## 2026-07-10 / WP-G0.1 Frontend Truth Contract

### 本轮目标

关闭前端事实污染：榜单不得升级为信号，未知值不得伪装为 0 或固定事实，扫描证明必须只有一个权威入口并明确每个分母。

### 修改范围

- 前端合同、显示适配器、Dashboard / Signals / System 数据入口、扫描证明组件和相应回归测试。
- 补充生产同形分母测试，锁定 observed / accepted / eligible / current-cycle / deep-scanned 五类数量与三类比率。
- 未改 scan 排序、analysis、strategy、RR 3:1、交易计划、backtest、DB、Redis、worker、secret 或自动下单边界。

### 核心链路影响

- 全市场发现：展示 observed、accepted、eligible、current-cycle、deep-scanned 的真实口径，不改发现算法。
- 候选筛选：榜单不再补成候选或信号；后端信号为空时前端保持空。
- 深扫验证：只展示真实深扫计数和 eligible 分母，不改 CoinGlass 扫描。
- 结构分析 / 风险赔率 / 交易计划 / 复盘进化：不改业务决策，只移除前端越权合成。

### 测试结果

- 定向前端合同与仓库真值测试：pass，96/96。
- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：pass，836/836；worker 17/17；historical smoke 4/4。
- `npm run build`：pass。
- `npm run backtest:golden`：pass，16/16。
- forbidden-files / secret-patterns / security-check：pass。
- formal：未运行。
- 腾讯 Compose config、web build/recreate、health、Postgres、Redis、workers、Shadow supervisor、扫描分母合同和浏览器视觉复核：pass。

### 是否部署

已推功能分支和 GitHub `main`，生产应用提交 `05e9530846b276cd1c56bc789b95c2540bfa83aa`。腾讯只重建 `web`，未运行 migration，未修改数据库 schema，未清 Postgres/Redis，未删除或重建 volume。生产证据目录为 `/home/ubuntu/apps/chuan-market-radar/reports/production-facts/20260710T010527Z`。

### 风险与遗留问题

- P0：公网仍为明文 HTTP，浏览器标记“不安全”；本轮按范围未混入 HTTPS/private session。
- WP-G0.1 的前端合成事实、假 0、榜单补信号、重复 scan proof 和扫描分母混用已关闭。
- 生命周期 unknown/timeout、null MFE/MAE、closed/evidence-grade/pending 分母真值尚未收口，属于 WP-G0.2。
- 当前系统仍为 `可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只做 `WP-G0.2 Candidate Lifecycle and Outcome Truth`。

## 2026-07-10 / WP-G0.2 Candidate Lifecycle and Outcome Truth Schema Stop

### 本轮目标

统一 Candidate Episode 生命周期、neutral/unknown/timeout、Shadow Outcome 五态和 Review 分母真值。

### 修改范围

- 只读审计 Candidate、Journal、Shadow、Review、Persistence、API、Frontend 和生产点样本。
- 生成真值矩阵、source-of-truth map、allowlist、迁移提案和脱敏证据包。
- 更新 context、changelog、traceability 和 V3 Work Package 状态。
- 未修改任何 runtime code、数据库 schema、Docker/worker/Caddy、scan/analysis/strategy/READY/RR/ranking。

### 核心链路影响

- 候选筛选：确认缺少权威 Candidate Episode，现有状态不能证明 active/closed/retrigger/firstSeen 真值。
- 复盘进化：确认 Outcome 五态、evidence-grade 和 Review 分母没有权威持久化闭环。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：未改。

### 测试结果

- 定向 baseline：pass，68/68。
- `npm run typecheck`：pass。
- lint/test:market/worker/historical/build/golden/forbidden/secret/security：schema stop 后未运行，不能写成通过。
- formal：未运行且禁止。

### 是否部署

未部署。生产只读点样本仍为 clean `main@0599f802f261fe8e3c1982a07106f362bd62ac13`，health ready/fresh；该健康状态不证明 Candidate/Outcome 真值。未运行 migration，未清 Redis/Postgres，未删除或重建 volume。

### 风险与遗留问题

- P0：现有 schema 无法可靠表达不可变 Episode、单活跃约束、重触发继承和单终态 Outcome。
- P0：neutral/unknown→long、null price/MFE/MAE→0、pending/error→timeout 和事件行分母污染仍存在。
- P0（既有、范围外）：公网仍为明文 HTTP。
- 当前状态：`PARTIAL_SCHEMA_MIGRATION_REQUIRED / R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只建议人工审查并批准独立的 `WP-G0.2-MIGRATION-DESIGN-AND-APPROVAL`；不得自动开始迁移、WP-G0.3、G1、R4 或实盘。

## 2026-07-10 / WP-G0.2 Migration Design and User Approval Package

### 本轮目标

冻结 CandidateEpisode、Checkpoint、Outcome、Review denominator 的权威数据模型、迁移阶段、恢复方案和用户审批决定。

### 修改范围

- 新建 10 个 PROPOSED ADR、字段 registry、不可执行 DDL 设计文本、状态机、事务/锁/幂等、legacy/backfill、cutover/rollback、rehearsal、安全恢复、API/Review/Frontend 和用户审批包。
- 更新 context、changelog、traceability、V3 和兼容蓝图索引。
- 未修改任何 runtime/frontend/API/worker/runner/scan/analysis/strategy/risk 或正式 migration 文件。

### 核心链路影响

- 候选筛选与复盘进化：只冻结未来权威模型，不改变当前运行行为。
- 全市场发现、深扫、结构分析、风险赔率、交易计划：未改。
- Outcome 继续禁止回写 production ranking/strategy/READY/RR。

### 静态验证

- 10/10 ADR 有唯一决定；三个 registry 双向覆盖 DDL 8 表 151/151 字段，双向遗漏和重复均为 0；全部 JSON 可解析；26 项 rehearsal test matrix 已定义。
- DDL 文件头为 `DESIGN DRAFT ONLY / DO NOT EXECUTE`，包含故意不可执行 placeholder，不在 migration 目录。
- runtime 测试/typecheck/build 未运行，本轮仅文档治理且合同不要求；formal 禁止且未运行。

### 是否部署

未部署；未连接数据库；未执行 DDL/migration；未修改或清理 Postgres/Redis/volume；未重建 Docker。生产运行提交和健康未在本轮刷新。

### 风险与遗留问题

- 设计状态是 `PROPOSED / READY_FOR_USER_APPROVAL`，不是 APPROVED。
- 当前 runtime 仍没有 Candidate/Outcome authority，frontend truth 仍 partial/reopened。
- 当前 transaction/migration/DB role/backup/restore 路径存在 P0 实施前置缺口。
- 正式 known-issues registry 不存在，只更新本地 risk register 和 context/changelog。

### 下一轮建议

先由 ChatGPT/用户审计 `USER_APPROVAL_PACKET.md`。只有用户明确批准后，才可创建 `WP-G0.2-MIGRATION-IMPLEMENTATION-AND-REHEARSAL`；生产 migration 和 read cutover仍需后续独立批准。

## 2026-07-10 / WP-G0.2 Migration Implementation and Isolated Rehearsal

### 本轮目标

把已冻结的 Candidate Episode / Event / Checkpoint / Outcome 设计实现为正式 additive PostgreSQL migration、dormant 服务和可重复隔离演练；只生成下一轮生产加表审批证据，不连接或修改生产数据库。

### 修改范围

- `migrations/candidate-episode/`：8 个版本化 SQL migration，覆盖批准 registry 的 8 表/151 字段、20 个函数、14 个 trigger 和 7 个 NOLOGIN 角色。
- `src/lib/candidate-episode/`：production deny guard、同连接事务 adapter、migration runner、Episode/Checkpoint/Outcome/Outbox 服务、eg.v1、Legacy dry-run/reconciliation、Review denominator 和完整测试。
- `src/scripts/candidate-episode/`、`package.json`：显式 rehearsal migration、空库/旧 schema/rollback/restore 演练和四个 synthetic legacy 命令。
- 三个 routine deploy/verify 脚本：移除隐式 persistence migration 调用，改为独立审批 runbook 提示。
- context、changelog、traceability、V3、兼容蓝图和 current-state matrix：同步 scoped PASS 与 production false 边界。

### 核心链路影响

- 候选筛选：建立 dormant Candidate Episode 单活跃、不可变 firstSeen/observation fact、retrigger/方向反转 lineage 的数据库边界；未接入生产候选读写。
- 复盘进化：建立 dormant Checkpoint/Outcome、eg.v1、null MFE/MAE、Review denominator 和 Legacy exclusion；Outcome 仍不得回写 production ranking。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：未改 scan/analysis/strategy/READY/RR/Risk Gate/ranking。

### 测试结果

- 候选域普通测试：pass，88 pass，真实 DB suite 在普通环境按设计 skip；另用显式本地 rehearsal URL 实跑 PostgreSQL/权限 5/5 pass。
- 空库、上一稳定 12 表 schema、重复 migration、checksum drift、失败 DDL rollback、restore、并发、幂等、lease/fencing、Outbox epoch：pass。
- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：pass，924 pass / 1 isolated DB skip；worker 17/17；historical 4/4。
- `npm run build`：pass。
- `npm run backtest:golden`：pass，16/16。
- `npm run ci:forbidden-files`：pass。
- `npm run ci:secret-patterns`：pass。
- `npm run security:check`：pass。
- `npm run backtest:formal`：未运行，且本轮禁止。

### 是否部署

未部署。生产数据库未连接，生产业务数据未读写，生产 migration=false，production schema changed=false，腾讯云未连接/未重启，production shadow/dual-write/canonical-read/review-read 全部 false。

### 风险与遗留问题

- P0：生产仍没有 Candidate/Outcome 权威 schema，WP-G0.2 和 G0 未完成；本轮不能支撑实战。
- P0（既有、范围外）：公网明文 HTTP 仍未在本轮处理。
- P1：隔离 restore 为小型合成数据；未证明生产权限、生产数据规模、异地加密备份和生产 RTO。
- P1：代码中的 routine deploy 隐式 migration 已移除，但本轮未部署腾讯云。

### 下一轮建议

只有再次获得用户明确批准后，才可进入 `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA`；不得自动进入 shadow writer、backfill、read cutover、G1、R4 或实盘。

## 2026-07-11 / WP-G0.2 Production Add-Schema Boundary Failure

### 本轮目标

在不改变现有应用行为的前提下，对锁定提交 `e9604336c24fdc625437c43bba4d9a7688e58cd0` 执行生产 PostgreSQL 加表前置 Gate；只有全部 Gate 通过才允许 additive migration。

### 修改范围

- 通过 Edge OrcaTerm 执行生产身份、工作树、Compose、health、worker、Shadow、Postgres/Redis 和 production evidence 只读核验。
- 执行 PostgreSQL catalog、连接、锁、事务、容量、角色能力和 Candidate schema 只读 preflight。
- 生成本地脱敏失败状态证据包并更新治理文档。
- 未创建 production staging worktree、生产备份或异地副本；未执行 restore drill、migration、backfill、Feature Flag、读写切换、应用部署或重启。

### 核心链路影响

- 候选筛选 / 复盘进化：发现 production authority schema 的 migration 身份前置条件不成立，Schema 继续缺失。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：无行为变化。

### 测试结果

- 锁定 source commit 与本地 8 个 migration checksum：pass。
- production runtime baseline：pass，工作树 clean，health/scan ready/fresh，required workers healthy，Shadow heartbeat fresh。
- production evidence validate：pass（显式对齐实际 application commit `0599f802...`）。
- PostgreSQL lock/capacity：pass，9/100 connections，0 长事务，0 lock waiter，0 ungranted lock。
- PostgreSQL migration identity Gate：fail；只有 1 个 LOGIN 角色且它是应用 SUPERUSER，独立 migration LOGIN 角色不存在。
- backup/offsite/restore/rehearsal/migration/catalog-after/30-60m observation：not run，按 preflight 阻断停止。
- formal：未运行且禁止。

### 是否部署

未部署。生产 Schema 未改变，应用 release/image 未改变，Web/Worker/Shadow/Postgres/Redis 未重启。生产 worktree 最终 clean。

### 风险与遗留问题

- P0：应用运行身份拥有完整数据库超级权限，违反最小权限边界。
- P0：没有独立 production migration LOGIN 身份，不能合规执行本包 DDL。
- P1：未建立本次 migration 所需的加密异地备份与真实 restore drill 证据。
- P0：OrcaTerm 误生成 0 字节未跟踪文件，曾使生产 worktree 变脏；文件已获批准删除且最终 clean，但合同要求总状态为 `FAIL_PRODUCTION_BOUNDARY_VIOLATION`。
- 当前状态：`FAIL_PRODUCTION_BOUNDARY_VIOLATION / migration 未执行 / R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只建议另行审批 `WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION`；先收口独立 migration 身份和 production runner，再从 Step 0 重跑 add-schema。
