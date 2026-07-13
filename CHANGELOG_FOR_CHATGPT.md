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

## 2026-07-11 / WP-G0.2 Production Identity and Runner Remediation

### 本轮目标

把生产应用从唯一 PostgreSQL 超级 LOGIN 切换到独立最小权限 Runtime，建立独立 Migration LOGIN、NOLOGIN owner、受控 Break-glass 和显式双身份 Runner，并完成生产 dry-run 与 30 分钟稳定性观察。

### 修改范围

- 新增 `scripts/production/migration-runner/` 下的身份审计/切换、Runner、artifact、Worktree Guard、隔离演练和生产编排。
- 增加 Runner package scripts 与 lint worktree ignore；未修改锁定 Candidate migration 文件、scan/analysis/strategy/frontend。
- 更新 context、changelog、traceability、V3/current-state 和兼容蓝图；生成本轮脱敏报告包。

### 核心链路影响

- 候选筛选 / 复盘进化：关闭未来生产加表的超级权限和隐式 Runner 前置风险；Candidate authority 仍未进入生产。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：运行行为和排序未变。

### 测试结果

- Runner targeted：43/43 pass；隔离角色拓扑、最小权限、credential cutover、rollback、DDL/role deny 和锁定 8-file rehearsal pass。
- `npm run typecheck`、`npm run lint`、`npm run build`：pass。
- `npm run test:market`：924 pass / 1 isolated DB skip；worker 17/17；historical 4/4。
- `npm run backtest:golden`：16/16；forbidden-files / secret-patterns / security-check：pass。
- 生产 Runner plan/preflight/dry-run/verify：pass；Candidate SQL execute=false。
- 生产 detached observation：7/7 samples、>=30 分钟 pass；formal 未运行且禁止。

### 是否部署

已推功能分支；未部署生产应用代码，生产应用 HEAD/image 未变。仅原子切换数据库 credential，recreate 8 个 credential-bearing 容器；Postgres、Redis、Caddy 未重启，Candidate schema/data/flags 未改变。

### 风险与遗留问题

- P0：Candidate authority schema 仍 absent；WP-G0.2/G0 未完成。
- P0：公网 HTTP 仍未处理。
- P0：下一次加表前仍需证明 full encrypted backup、external restore 和 WAL/disk headroom；当前磁盘容量 Gate 仅 partial。
- P1：Runner 只证明 production dry-run；execute 仍未授权。

### 下一轮建议

只在用户再次明确批准后，从 Step 0 进入 `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA-RERUN`；不得自动进入 Shadow write、backfill、read cutover、G1、R4 或实盘。

## 2026-07-11 / WP-ACCEL-01 Safe Delivery Acceleration and Capacity Gate

### 本轮目标

把用户批准的“不降低质量提速方案”落成双车道执行覆盖层和 fail-closed 的 Candidate Migration 容量/恢复门禁，先关闭 Add Schema rerun 的容量前置风险。

### 修改范围

- 新增 `MARKET_RADAR_ACCELERATED_DELIVERY_PLAN_V1.md`，固定 Production WIP=1、Local Preparation WIP=1、证据窗口重叠规则、不可压缩项和当前关键路径。
- 新增 `migration-capacity-gate.mjs` 与 16 个测试，验证磁盘、backup、外部 restore、RPO/RTO 和证据时效；工具不连接生产、不执行 backup/restore/migration。
- 增加三个 package scripts；同步蓝图目录、工程蓝图、V3、current-state matrix、traceability、兼容蓝图和 context。
- 修正 V3/兼容蓝图仍显示应用超级权限和旧 Add Schema 状态的治理漂移。

### 核心链路影响

- 候选筛选 / 复盘进化：为 Candidate Episode/Outcome production schema 的安全实施增加可执行容量 Gate；生产 schema 和读写路径未改变。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：未改。

### 测试结果

- `npm run test:migration-capacity`：16/16 pass；空模板和缺失数字 fail closed。
- `npm run migration:runner:test`：43/43 pass。
- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：924 pass / 1 isolated DB skip；worker 17/17；historical 4/4。
- `npm run build`：pass。
- `npm run backtest:golden`：16/16 pass。
- `npm run ci:forbidden-files`、`npm run ci:secret-patterns`、`npm run security:check`：pass。
- `npm run backtest:formal`：未运行且本轮禁止。

### 是否部署

未部署；未连接生产；未执行 DDL/DML、backup、restore、migration、Feature Flag 或服务重启。

### 风险与遗留问题

- 本工作包实现与治理范围 PASS，但真实生产 capacity/off-host restore Gate 仍为 `BLOCKED_UNPROVED`。
- 最近生产证据仍是磁盘 85%；预计磁盘 <=70%、fresh 加密异地备份、外部隔离 restore 和 WAL headroom 尚未形成真实 PASS 证据。
- Candidate schema 仍不存在，WP-G0.2/G0 仍未完成，系统仍为 R1、不能支撑实战。

### 下一轮建议

仅建议独立审批 `PRODUCTION-CAPACITY-OFFHOST-RESTORE-REMEDIATION`；容量 Gate PASS 后，再单独申请 `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA-RERUN`，不得合并授权。

## 2026-07-11 / Production Capacity, Encrypted Off-Host Backup and Restore Remediation

### 本轮目标

关闭 Candidate Add Schema rerun 之前的真实生产磁盘、加密离机备份、外部隔离恢复和 RPO/RTO 容量前置风险。

### 修改范围

- 新增生产加密备份脚本、本地隔离恢复脚本、10 个定向测试、运行说明和三个 package 命令。
- 生产仅清理未使用 Docker build cache，创建 root-only PostgreSQL custom dump、公钥加密件和脱敏 manifest；未 prune image/container/volume。
- 私钥只保存在本机安全目录，从未上传生产；离机只传输加密备份、manifest 和公钥。
- 更新 context、提速计划、V3、current-state matrix 和 traceability；未修改 scan/analysis/strategy/backtest/frontend/API 业务逻辑。

### 核心链路影响

- 候选筛选 / 复盘进化：关闭未来 Candidate authority schema 加表前的容量与恢复前置风险，但未创建 Candidate schema。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：运行行为未改变。

### 测试结果

- 定向脚本测试：10/10 pass；Bash 语法和 ESLint pass。
- 合成 encrypted-only PostgreSQL 16 restore：pass，退出后明文/集群/socket 残留 0。
- 真实生产备份外部隔离恢复：pass，12 个用户表、1 个用户 schema、RPO 14 分钟、RTO 53 秒，未输出业务行。
- 容量 validator：14/14 pass，预计磁盘 18%，`canRequestAddSchemaApproval=true`，但 `authorizesMigration=false`。
- 基础门禁结果见本轮交付报告；formal 未运行且禁止。

### 是否部署

未部署应用代码，未改变生产 release/image/schema/Feature Flag。生产 HEAD 仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13`，worktree clean，health HTTP 200 / ready / database，11 个容器继续运行。

### 风险与遗留问题

- Candidate schema 仍不存在，migration、writer、backfill 和 read cutover 仍未获授权。
- 本轮证明的是一次生产规模离机恢复；自动备份调度、保留轮换和周期性 restore drill 仍属于 G1。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只建议独立审批 `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA-RERUN`；不得把本轮 PASS 解释成 migration 已授权。

## 2026-07-12 / WP-G0.2 Production Add Schema Rerun and Manual Audit

### 本轮目标

在明确的 Add Schema-only 90 分钟窗口内执行 dormant Candidate authority schema，并在任何失败后停止自动动作、完成只读人工审计。

### 修改范围

- 创建 fresh 加密生产备份并完成离机 checksum/archive 校验；重新通过 14/14 容量 Gate。
- 生产 runner 只执行一次 plan/preflight/execute/verify；未启用 writer、backfill、read cutover 或 Feature Flag。
- 自动 verify 失败后未自动重跑，改为只读 catalog、权限和 30 分钟运行观察。
- 仅更新 context/changelog 和脱敏报告；生产应用 worktree、scan、analysis、strategy、frontend、worker 未修改。

### 核心链路影响

- 候选筛选 / 复盘进化：Candidate authority 8 表、151 字段、20 函数、14 trigger event rows、7 角色和 8 条 ledger 已进入生产，但仍 dormant。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：无行为变化。

### 测试结果

- migration runner 43/43 pass；capacity 16/16 pass。
- typecheck / lint / build：pass。
- test:market：924 pass / 1 isolated DB skip；worker 17/17；historical 4/4。
- backtest:golden：16/16 pass。
- secret-patterns：pass；forbidden-files / security-check：fail，原因是当前 HEAD 已跟踪上一容量包的 report/evidence/zip，本轮未删除或新增这些历史工件。
- production execute：pass，8 applied / 0 skipped。
- production verify：fail，`42501 permission denied for schema candidate_authority`。
- manual catalog：schema=1、tables=8、columns=151、functions=20、trigger objects=10、trigger event rows=14、roles=7、ledger=8；锁与长事务均为 0。
- 30 分钟 production observation：pass，17:57:46Z 至 18:27:50Z，7/7；Web/Postgres/Redis healthy，四项事务/锁计数始终为 0。
- formal：未运行且禁止。

### 是否部署

未部署应用代码。生产只发生批准的 additive schema DDL；应用 release 仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13`，worktree clean，Feature Flag=0。

### 风险与遗留问题

- 本包状态为 `PARTIAL_SCHEMA_APPLIED_VERIFY_FAILED`，不是 PASS。
- 根因是 NOINHERIT migration login 的 post-schema verify 未显式 `SET ROLE`；现有 43 个测试未覆盖该路径。
- Repository hygiene 仍被既有 tracked capacity report/zip 阻断，因此本轮不能 commit/push 并声称所有门禁通过。
- Candidate runtime 仍未接入，WP-G0.2/G0 未完成，系统仍为 R1、不能支撑实战。

### 下一轮建议

只建议独立审批 `WP-G0.2-MIGRATION-RUNNER-POST-SCHEMA-VERIFY-FIX`；修复并审计后只跑 verify-only，禁止再次 execute migration。

## 2026-07-12 / WP-AUTO-01 全自动工程控制层与质量锁

### 本轮目标

建立后续全自动搭建的机器状态、范围锁、质量锁、生产审批锁和门禁新鲜度证明，防止越界施工、降低标准、旧测试冒充新测试或失败后自动前进。

### 修改范围

- 新增 `AUTONOMOUS_ENGINEERING_STATE.json`、自动工程协议、控制器和防绕过测试；提交前发现并修复 Git 暂存状态导致门禁指纹误判 stale 的问题，新增 stage-invariant 回归覆盖。
- `package.json` 增加 status、gate、verify 和 targeted test 命令；`.gitignore` 忽略本地 gate result。
- 更新蓝图索引、提速执行计划和 traceability，将旧的“Candidate schema 不存在”改为“schema 已应用但 verify 失败、runtime disabled”。
- 历史容量证据目录只从 Git 索引取消跟踪，本地报告、证据 JSON 和 ZIP 均保留。
- 未修改 `src/**`、migration、生产脚本、部署、数据库、Redis、worker、前端或交易逻辑。

### 核心链路影响

- 支撑治理 / 发布安全 / 证据真值：新增可执行的自动停止和门禁证明。
- 全市场发现、候选筛选、深扫验证、结构分析、风险赔率、交易计划、复盘进化：运行能力均未改变。

### 测试结果

- `npm run test:autonomy`：16/16 pass。
- `npm run typecheck`：pass。
- `npm run lint`：pass。
- `npm run test:market`：924 pass / 0 fail / 1 isolated DB skip；worker 17/17；historical smoke 4/4。
- `npm run build`：pass。
- `npm run backtest:golden`：16/16 pass。
- `npm run ci:forbidden-files`、`npm run ci:secret-patterns`、`npm run security:check`：pass。
- `npm run backtest:formal`：未运行且控制器禁止自动运行。

### 是否部署

未部署，未连接腾讯云生产，未执行 DDL/DML、migration、Feature Flag、服务重启或 production verify。

### 风险与遗留问题

- 本包是工程治理底座，不是业务能力完成；系统仍为 R1、不能支撑实战。
- Candidate schema 自动 verify 的 42501 根因尚未修复，WP-G0.2/G0 未完成。
- production verify-only 仍需新的独立明确审批，shadow writer 继续禁止。

### 下一轮建议

只执行 `WP-G0.2-MIGRATION-RUNNER-POST-SCHEMA-VERIFY-FIX` 本地包，补齐 NOINHERIT login 显式 `SET ROLE` 路径和定向测试；不得再次 execute migration。

## 2026-07-12 / WP-G0.2 Migration Runner Post-Schema Verify Fix

### 本轮目标

只修复 production Add Schema 后 NOINHERIT migration login 读取 Candidate schema 边界时缺少显式 owner role 激活导致的 PostgreSQL 42501，并补足可直接复现的回归测试。

### 修改范围

- `migration-runner.mjs`：新增可测试的 migration identity verification 路径；owner membership 为真后 `SET ROLE candidate_migration_role`，边界读取后 `RESET ROLE`。
- `migration-runner.test.mjs`：新增成功、异常清理和无 membership 三个场景。
- 更新自动工程状态、提速计划、traceability、context 和本 changelog。
- 未修改 migration SQL、角色定义、Candidate runtime、业务代码、API、前端、Redis、worker、部署或 secret。

### 核心链路影响

- 候选筛选 / 复盘进化：修复 Candidate authority schema 的验证工具，不启用任何读写路径。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：无运行行为变化。

### 测试结果

- `npm run migration:runner:test`：46/46 pass。
- `npm run test:autonomy`：16/16 pass。
- `npm run typecheck`、`npm run lint`：pass。
- `npm run test:market`：924 pass / 0 fail / 1 isolated DB skip；worker 17/17；historical smoke 4/4。
- `npm run build`：pass。
- `npm run backtest:golden`：16/16 pass。
- `npm run ci:forbidden-files`、`npm run ci:secret-patterns`、`npm run security:check`：pass。
- `npm run backtest:formal`：未运行且禁止。

### 是否部署

未部署，未连接腾讯云生产，未执行 verify、migration、DDL/DML、Feature Flag 或服务重启。

### 风险与遗留问题

- 本地修复通过不等于生产 verify PASS；原生产包状态尚未晋级。
- production verify-only 必须绑定新 commit/checksum、fresh 只读 preflight 和新的独立明确审批。
- 再次 execute migration、writer、backfill、read cutover 和 shadow writer 继续禁止。

### 下一轮建议

全部本地门禁 PASS 后，只申请 `WP-G0.2-PRODUCTION-VERIFY-ONLY` 的独立只读审批；审批前不执行生产动作。

## 2026-07-12 / WP-G0.2 Production Verify-Only

### 本轮目标

使用已修复并锁定 commit 的 Migration Runner，对已存在 Candidate authority schema 只执行一次生产只读验证，关闭原 42501 验证缺口。

### 修改范围

- 新增 fail-closed `production-verify-only.sh` 及 3 个静态防绕过测试；脚本没有 migration execute、Docker Compose 重启或 Feature Flag 开启路径。
- 生产只 fetch `origin/main` 对象，checked-out application HEAD、image、worktree 和服务均未改变。
- 在独立 ops 目录复制既有 0600 credential 文件供一次性容器读取；未输出或提交凭据内容。
- 更新自动工程状态、蓝图、traceability、context、changelog 和 ignored 脱敏证据。

### 核心链路影响

- 候选筛选 / 复盘进化：Candidate authority schema 从 applied_verify_failed 晋级为 applied_verified_dormant。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：运行行为无变化。

### 测试结果

- Migration Runner：49/49 pass。
- 自动控制器：16/16 pass。
- typecheck、lint、build：pass。
- test:market：924 pass / 0 fail / 1 isolated DB skip；worker 17/17；historical smoke 4/4。
- backtest:golden：16/16 pass。
- forbidden-files、secret-patterns、security-check：pass。
- production verify-only：PASS，execute=false、schemaChanged=false、catalog/health/worktree/image/flags/runtime boundary 全部通过。
- formal：未运行且禁止。

### 是否部署

未部署应用。GitHub main 包含只读 Runner，腾讯生产 checked-out HEAD 仍为 `0599f802...`；只执行隔离 production verify-only。

### 风险与遗留问题

- Candidate runtime 仍 disabled，WP-G0.2/G0 未完成，系统不能支撑实战。
- 两个失败准备 ops 目录保留待审计，未自动删除。
- shadow_capture writer、backfill、dual read 和 read cutover 均未获授权。

### 下一轮建议

只执行 `WP-G0.2-SHADOW-CAPTURE-DESIGN-AND-VALIDATION` 本地包；production shadow writer 必须另行明确审批。

## 2026-07-12 / WP-G0.2 Shadow Capture Design and Validation

### 本轮目标

只在本地把 shadow_capture 的 authority、事务、幂等、失败隔离、时限、观测和审批边界变成机器合同与 fail-closed 验证，并识别生产接入前的真实缺口。

### 修改范围

- 新增 shadow_capture JSON 合同、中文工程说明、repository 事实校验器和防降质测试。
- 新增两个 npm 定向命令，更新自治状态、提速队列、traceability、context 和 changelog。
- 未修改 `src/**`、migration、部署、API、前端、worker、scan、analysis、strategy、backtest 或生产环境。

### 核心链路影响

- 候选筛选 / 复盘进化：冻结未来旁路采集的事实边界和失败语义。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：无运行行为变化。

### 测试结果

- `npm run test:candidate-shadow-capture`：4/4 pass，包含 17 类合同降质变体。
- `npm run candidate:shadow-capture:validate`：`PASS_LOCAL_DESIGN / BLOCKED_NOT_AUTHORIZED`。
- `npm run test:autonomy`：16/16 pass。
- 基础和安全门禁结果在本轮交付报告中记录；`backtest:formal` 禁止运行。

### 是否部署

未部署，未连接生产，未执行 DDL/DML、migration、Feature Flag、backfill、dual read、read cutover 或服务重启。

### 风险与遗留问题

- 旧权威事务尚未原子插入 Candidate Outbox。
- Outbox 尚无数据库级重试耗尽 quarantine/failed 终态。
- production runtime wiring 未实现，隔离 PostgreSQL 16 演练未通过。
- 新的 production shadow_capture 独立限时审批不存在。
- 当前仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只执行 `WP-G0.2-SHADOW-CAPTURE-LOCAL-IMPLEMENTATION-AND-POSTGRES-REHEARSAL`；本地实现与隔离演练通过前不得申请生产开启。

## 2026-07-12 / WP-G0.2 Shadow Capture Local Implementation and PostgreSQL Rehearsal

### 本轮目标

在本地实现 Candidate shadow_capture source transaction、Outbox 失败隔离和未接生产入口的 consumer，并用临时 PostgreSQL 16 集群验证空库、1-8 upgrade、原子性、并发、故障和恢复。

### 修改范围

- 新增 additive migration 009、source writer、consumer、v2 Outbox service 和 PG16 rehearsal。
- 更新 Candidate schema registry/contract/tests、自治状态、蓝图、context 和 changelog。
- 未修改 scan ranking、analysis、strategy、RR、READY、frontend、production API/worker、Redis、部署或 secret。

### 核心链路影响

- 候选筛选：建立 first-seen/source provenance 的原子旁路基础。
- 复盘进化：建立后续权威 Episode/Outcome 的入口基础。
- 其它核心环节无生产行为变化。

### 测试结果

- shadow contract：4/4 pass。
- Candidate：97 pass / 0 fail / 2 explicit-DB skip；本包 PG16 测试另行真实执行。
- PG16 upgrade：baseline 1-8、只升级 009、repeat 9 skipped、legacy hash preserved。
- PG16 empty：1-9 applied，8 tables / 155 columns / 24 functions。
- PG16 shadow scenarios：1/1 pass，覆盖原子性、hash、lease/fencing、8-attempt quarantine、phase/deadline 和 epoch race。
- 基础、安全和自治总门禁结果记录在本轮报告；formal 禁止运行。

### 是否部署

未部署，未连接生产，未执行 production migration/DDL/DML、Feature Flag、backfill、dual read、read cutover 或服务重启。

### 风险与遗留问题

- 生产仍是 Candidate migration 1-8；009 尚未审批/应用。
- Quarantine resolution ledger/workflow 尚未实现，当前 unresolved quarantine 会永久阻断晋级。
- Production runtime wiring 未实现，Candidate Feature Flag 保持关闭。
- 新的 production shadow_capture 审批不存在。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只执行 `WP-G0.2-SHADOW-CAPTURE-PRODUCTION-READINESS-AND-APPROVAL-PACKET`；不得直接执行 production migration 或 shadow writer。
## 2026-07-12 / WP-G0.2 Shadow Capture Production Readiness and Approval Packet

### 本轮目标

在不连接生产的前提下，收口 Shadow Capture 的 quarantine resolution、runtime fail-closed gate、migration 009 checksum/权限/监控/回退和 schema-only 生产审批包。

### 修改范围

- Migration 009 新增 immutable resolution ledger、数据库时钟 lifecycle、审批化 replay/exclude 和严格 phase state machine。
- 新增 quarantine resolution service、canonical venue mapper、runtime gate、只读 monitor 及测试。
- 新增 readiness 机器合同、validator、防降质测试、中文准入说明和生产审批包。
- 更新 PG16/permission rehearsal、schema registry、自治状态、加速计划、traceability、context 和本 changelog。
- 未连接腾讯云，未修改生产 API/worker、scan ranking、analysis、strategy、RR、READY、frontend、Redis、部署或 secret。

### 核心链路影响

- 候选筛选：补齐 canonical identity mapping、失败隔离决议和未完成队列阻断。
- 复盘进化：避免 quarantined 样本被静默丢弃或改写。
- 其它核心链路生产行为无变化。

### 测试结果

- old shadow contract 4/4；readiness contract 4/4；readiness validator PASS。
- Candidate 105 pass / 0 fail / 2 explicit-DB skip。
- PG16 1-8 upgrade、空库 1-9、shadow resolution/crash/phase 场景 1/1、permission recovery 4/4 PASS。
- autonomy 16/16、typecheck、lint、build PASS。
- test:market 941 pass / 0 fail / 2 explicit-DB skip；worker 17/17；historical smoke 4/4。
- backtest:golden 16/16；forbidden-files、secret-patterns、security-check PASS。
- formal 未运行且禁止；production smoke 未运行且本包禁止。

### 是否部署

未部署，未连接腾讯云生产，未执行 migration/DDL/DML、Feature Flag、control lifecycle、服务重启或 runtime wiring。

### 风险与遗留问题

- Production 仍只有 Candidate migration 1-8 verified dormant；009 未应用。
- Production composition/API/worker 尚未接线，代码授权和五个 Candidate Feature Flag 仍关闭。
- 新的 schema-only 生产审批不存在，productionMutationAllowed=false。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只在最终自治总门禁 PASS 后申请 `WP-G0.2-SHADOW-CAPTURE-PRODUCTION-ADD-SAFETY-SCHEMA` 的独立 90 分钟审批；不得合并 runtime 部署或 Shadow Writer 激活。

## 2026-07-12 / WP-G0.2 Shadow Capture Production Add Safety Schema

### 本轮目标

在用户独立批准的 90 分钟窗口内，只把 Migration 009 安全结构增量应用到生产 Candidate schema，并证明 runtime、Feature Flag 和 control lifecycle 仍保持关闭。

### 修改范围

- 生产只执行 `009_candidate_shadow_capture_safety`；001-008 均为 skipped。
- 执行前完成 fresh 加密备份、离机 checksum 和 14/14 容量门禁。
- 更新项目 context、加速队列、traceability、本 changelog 和 ignored 中文交付/脱敏证据。
- 未部署 runtime，未修改 API、frontend、worker、Redis、scan、analysis、strategy、backtest、RR、READY 或 secret。

### 核心链路影响

- 候选筛选 / 复盘进化：生产已具备 shadow_capture quarantine resolution、phase/epoch/deadline 和 v2 procedure 的 dormant schema 基础。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：运行行为无变化。

### 测试结果

- 生产 runner 最终状态：`PASS_PRODUCTION_ADD_SAFETY_SCHEMA`。
- Catalog：8 tables / 151 columns / 20 functions / 10 trigger objects / 14 trigger event rows / ledger 8，增量到 9 / 166 / 26 / 11 / 16 / ledger 9。
- roles=7、control rows=0、resolution table=true、Feature Flag enabled=0。
- 本轮 runner 分支在生产前已通过 59/59 定向测试、PostgreSQL 16 rehearsal、typecheck、lint、test:market、build、backtest:golden 和安全门禁；formal 未运行且禁止。
- 文档更新后复跑：runner 59/59、typecheck、lint、build、backtest:golden 16/16、forbidden-files、secret-patterns、security-check 全部 pass；test:market 为 941 pass / 0 fail / 2 explicit DB skip，worker 17/17，historical 4/4。

### 是否部署

未部署应用。生产应用 release/worktree/image 未切换，仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13`；只执行 schema-only Migration 009。

### 风险与遗留问题

- Candidate runtime 仍 disabled；WP-G0.2/G0 未完成，系统仍不能支撑实战。
- 第一次 execute 尝试因 capacity gate 文件未落盘被 runner fail closed；schema 当时保持 ledger 8。有效 execute 使用新的 fresh 备份后才运行。
- 证据打包时 5 个无 secret JSON 副本误落服务器根目录；源证据、数据库和服务未受影响，但删除必须等用户明确批准。
- runtime wiring、dormant deploy、activation/observation、writer、backfill、dual read 和 read cutover 均未授权。

### 下一轮建议

先获得明确批准，只删除 5 个已列明的根目录证据副本并复核；随后才进入本地 `WP-G0.2-SHADOW-CAPTURE-PRODUCTION-COMPOSITION-WIRING`。

## 2026-07-12 / WP-G0.2 Shadow Capture Production Composition Wiring

### 本轮目标

在不连接或部署生产的前提下，把已验证的 Candidate source writer、Outbox consumer、Episode service、runtime gate 和 monitor 接入真实应用 composition，并补齐 profile 隔离 worker 生命周期。

### 修改范围

- 权威应用 scan archive 调用点接入 Candidate composition；测试和显式 repository 注入路径保持原状。
- 新增 Source Writer、Shadow Executor、只读 Monitor 三条独立 Candidate 数据库身份通道；禁止回退复用 legacy 应用 `DATABASE_URL`，并新增受 Bearer 保护的 Candidate Shadow API。
- 新增默认不启动的 `candidate-shadow-runtime` Compose profile、条件 heartbeat、SIGTERM 停止新任务、在途请求 drain 和 shutdown heartbeat。
- Gate/consumer 时间改用 PostgreSQL `clock_timestamp()`；五个 Candidate Feature Flag 和代码授权继续默认关闭。
- 新增机器合同、中文治理合同、composition 定向/worker/PG16 测试，并更新 context、加速计划和 traceability。
- 未修改 frontend、scan ranking、analysis、strategy、RR、READY、Migration 009、backtest 权重、Redis 正确性边界或 secret。

### 核心链路影响

- 全市场发现 -> 候选筛选：未来获批激活时，scan archive 与 source Outbox 可在同一事务写入；当前休眠时仍只走 legacy archive。
- 复盘进化：Candidate Episode 投影链已在隔离 PG16 中贯通，但生产未开始积累新 Episode/Outcome。
- 深扫验证、结构分析、风险赔率、交易计划：无行为变化。

### 测试结果

- Composition 定向套件 28/28 PASS。
- 隔离 PostgreSQL 16：upgrade、空库 migration 1-9、原有 shadow safety、完整 composition archive/outbox/consumer/monitor 和 permission recovery 4/4 PASS；`productionConnected=false`。
- typecheck、lint、build PASS。
- test:market 950 pass / 0 fail / 3 explicit DB skip；worker 18/18；historical 4/4。
- backtest:golden 16/16；forbidden-files、secret-patterns、security-check PASS。
- Docker CLI 本机不可用，因此未声称执行 `docker compose config`；Compose YAML 使用 `js-yaml` 结构化解析并由治理测试验证 profile/默认开关。
- formal 未运行且禁止；production smoke 未运行且本包禁止。

### 是否部署

未部署，未连接腾讯云生产，未启动 Candidate worker，未启用代码授权/Feature Flag/control lifecycle，未执行生产 DDL/DML。

### 风险与遗留问题

- 本地 wiring PASS 不等于 production runtime 已部署或 Shadow 已开始。
- 生产仍由 legacy write/read authority 接管；Candidate schema 保持 dormant。
- 下一包是生产 dormant deploy，必须独立审批；activation/observation 仍是更后的独立 Gate。
- 当前生产尚未配置三条 Candidate runtime identity；least-privilege active composition 未证明，Dormant deploy 后必须先完成 Runtime Identity and Permission 包。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只申请 `WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY` 的独立生产审批；部署后仍保持代码授权、五个 Feature Flag、三条 Candidate 数据库 URL 和 control lifecycle 关闭。

## 2026-07-12 / WP-G0.2 Dormant Runtime Deploy Preparation

### 本轮目标

在不连接生产的前提下，锁定 Candidate dormant runtime 的 web-only 发布范围、审批绑定、休眠环境门禁、即时验收、回滚和最终观察条件。

### 修改范围

- 新增机器合同、中文运行合同、fail-closed validator、默认 dry-run 的专用发布 runner 和 7 项定向测试。
- runner 只允许 build/recreate `web`，禁止 Compose profile、Candidate worker、`--remove-orphans`、migration/DDL/DML、Candidate 身份/URL、Feature Flag 和 control lifecycle。
- artifact 锁定 12 个运行文件，SHA-256=`254221bbfd75c0d6c0e02030713c075583d76f94526bfab0eb8c34ace5bce1ba`。
- 更新自治状态、加速计划、traceability、context 和本 changelog。
- 未修改 frontend、scan、analysis、strategy、RR、READY、backtest、数据库 schema/data、Redis、生产环境或 secret。

### 核心链路影响

候选筛选和复盘进化的 dormant runtime 安装路径具备 web-only、可回滚、可审计的发布入口；生产数据行为仍为 legacy-only。

### 测试结果

- Dormant validator：PASS，productionMutationAllowed=false。
- Dormant 定向测试：7/7 PASS；dry-run 实跑确认零生产变更。
- deploy-safety：5/5 PASS。
- Composition 回归：28/28 PASS。
- typecheck、lint、build PASS。
- test:market：950 pass / 0 fail / 3 explicit DB skip；worker 18/18；historical 4/4。
- backtest:golden：16/16 PASS；forbidden-files、secret-patterns、security-check PASS。
- formal 和 production smoke 禁止运行。

### 是否部署

未部署，未连接腾讯云，未启动/重启任何服务，未执行 DDL/DML、migration、Feature Flag、control lifecycle、Candidate URL 配置或生产观察。

### 风险与遗留问题

- 生产仍是旧 release，Candidate runtime 未部署。
- Dormant Deploy 仍缺 exact commit + checksum + rollback commit + web-only + 90 分钟明确审批。
- 即时检查不等于整包 PASS；还必须完成 ledger/control 只读核验和 30-60 分钟观察。
- Dormant Deploy PASS 后仍需独立 Runtime Identity and Permission 包，不能直接 activation。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只申请并执行 `WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY` 的 web-only 生产包；不得合并身份、权限或 activation。

## 2026-07-12 / WP-G0.2 Dormant Runtime Deploy Production Preflight and Env Fix

### 本轮目标

通过 Microsoft Edge / OrcaTerm 对 Dormant Deploy 做严格生产只读预检，并在申请部署前关闭预检发现的 runner 环境文件不兼容问题。

### 修改范围

- 生产只读核验 HEAD/branch/worktree、GitHub main、运行容器、Candidate 休眠环境、health 和三份核心合同。
- `candidate-dormant-deploy.sh` 改为按 `.env` -> `.env.production` 加载 Compose，并分别验证两个文件的 Candidate 休眠边界。
- `production-check.sh` 使用相同双文件顺序，避免部署成功后验收因旧单文件假失败。
- 将共享 production check 纳入锁定 artifact，artifact 从 12 文件更新为 13 文件。
- 更新合同、测试、加速路线、traceability、自治状态、context 和 changelog。
- 未执行 git pull/merge、Docker build/up/restart、migration、DDL/DML、Feature Flag、Candidate URL、身份/权限或 activation。

### 核心链路影响

候选筛选旁路的生产安装入口从“本地看起来可用但生产必然 fail closed”修正为与真实生产环境模型一致；Candidate 数据行为仍未改变。

### 测试结果

- 生产只读双 env-file `config --services`：PASS，默认 11 服务且无 Candidate worker。
- Dormant validator：PASS，13 文件 checksum=`c5ec5fae284b0f26ae5e7e5635a2e9a370d791a07aba2176d6e39d5b2ef4d3a4`。
- Dormant 定向：8/8 PASS；deploy-safety：5/5 PASS。
- typecheck、lint、build PASS；test:market 950 pass / 0 fail / 3 explicit DB skip；worker 18/18；historical 4/4。
- backtest:golden 16/16；forbidden-files、secret-patterns、security-check PASS。
- formal 与 production smoke 未运行。

### 是否部署

未部署。生产仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13`，worktree clean；本轮只读预检未改变服务器 Git、容器、数据库、Redis 或环境文件。

### 风险与遗留问题

- 单 env-file runner 问题是部署直接阻断，已立即修复，未后置。
- Dormant production deploy 仍缺绑定新 exact commit、checksum、rollback commit、web-only 和 90 分钟窗口的明确审批。
- 公网 HTTP 等既有问题继续属于 G0.3，不在本包扩大修改。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

在全部本地门禁和 GitHub main 同步后，只申请 web-only Dormant Runtime Deploy；不得合并身份、权限或 activation。

## 2026-07-12 / WP-G0.2 Dormant Runtime Deploy Isolated Execute and Rollback Rehearsal

### 本轮目标

在不连接生产的隔离环境中真实执行专用 runner 的成功和失败路径，关闭 Bash 版本兼容与“只有静态检查、没有跑过回滚”的证据缺口。

### 修改范围

- runner 请求解析从 Bash 4 专属 `readarray` 改为 Bash 3.2 可执行的单行结构化读取。
- 新增 fake Git、fake Docker 和本地 health/contract API 的隔离执行演练。
- 成功路径证明只 build/recreate `web`；失败路径证明即时 health 降级会恢复 rollback commit 和旧 Web 镜像。
- artifact 保持 13 文件，runner 变更后 SHA-256=`8a0294b924936436f87c721319ef0435f532ce12da5e555900a3383051bfba08`。
- 更新治理合同、加速路线、traceability、自治状态、context 和交付报告。
- 未修改生产、数据库、Redis、Candidate Flag/URL/身份、control lifecycle、scan、analysis、strategy、frontend 或 backtest。

### 核心链路影响

候选筛选与复盘进化旁路代码的安装/回滚路径获得真实控制流证据；生产仍为 legacy-only，Candidate runtime 未部署。

### 测试结果

- Dormant Deploy 定向：9/9 PASS，包含 Bash 3.2 成功路径和自动回滚路径。
- Deploy Safety 5/5、Autonomy 16/16、Composition 28/28 PASS。
- typecheck、lint、build PASS；test:market 950 pass / 0 fail / 3 explicit DB skip；worker 18/18；historical 4/4。
- golden 16/16；forbidden-files、secret-patterns、security-check PASS。
- 曾因错误并行运行 typecheck 与 Next build 造成 `.next/types` 竞争和一次 TS6053 假失败；改为正确顺序后两项均独立 PASS，没有改代码或降低门禁掩盖失败。
- production smoke 与 formal 未运行。

### 是否部署

未部署、未连接腾讯云、未执行生产 Git/Docker/数据库/Redis/环境变更。

### 风险与遗留问题

- 隔离演练不是生产 PASS，仍缺独立 exact approval。
- 即时部署成功后仍需 ledger/control 只读核验和 30-60 分钟观察。
- Dormant Deploy PASS 后仍需 Runtime Identity and Permission，不能直接 activation。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

全部本地门禁和 GitHub main 同步后，只申请 web-only Dormant Runtime Deploy；不得合并身份、权限或 activation。

## 2026-07-12 / WP-G0.2 Runtime Identity and Permission Local Preparation

### 本轮目标

关闭 source/consumer/monitor 三条 Candidate URL 在 NOINHERIT LOGIN 下没有显式能力角色切换的真实缺口，并建立最小权限隔离 PG16 证据。

### 修改范围

- 事务适配器支持固定、安全校验的 `SET LOCAL ROLE`；source/consumer/monitor 分别映射 writer/executor/audit。
- source 的 atomic legacy archive + Candidate outbox 只补 `scan_archives` SELECT/INSERT；UPDATE/DELETE/DDL 仍拒绝。
- 新增 3 个临时 NOINHERIT LOGIN 的 PostgreSQL 16 演练，验证单 membership、危险属性关闭、允许路径、直接 DML/DDL 和跨角色拒绝。
- 新增机器合同、validator、中文运行合同和交付报告。
- 更新自治状态、加速路线、traceability 和项目 Context。
- 未连接生产，未创建生产 LOGIN，未配置 Candidate URL，未改 Feature Flag/control lifecycle/migration/Compose/前端/交易逻辑。

### 核心链路影响

候选筛选与复盘进化的未来生产身份边界从“URL 分开但实际会 42501”修复为显式角色切换和数据库可证明的最小权限模型；生产行为仍未改变。

### 测试结果

- Runtime Identity 定向 14/14 PASS；独立 PG16 1/1 PASS。
- Composition 28/28 PASS；原完整 PG16 upgrade/atomic/composition/permission 4/4 全 PASS。
- typecheck、lint、build PASS；test:market 952 pass / 0 fail / 4 explicit DB skip，新增身份 DB 测试已由独立 PG16 Gate 真实 1/1 PASS。
- worker 18/18、historical 4/4、golden 16/16 和三项安全门禁 PASS。
- Autonomy 14/14 Gate PASS，worktree unchanged，`canAutoCommit=true`、`canAutoDeploy=false`。
- production smoke 和 formal 未运行。

### 是否部署

未部署、未连接腾讯云、未执行生产角色/GRANT/环境/服务/数据库/Redis 变更。

### 风险与遗留问题

- 本轮不含生产身份 runner；production identity 仍未 provision。
- Dormant Deploy 仍未授权和执行，必须先于生产身份包 PASS。
- Runtime Identity production runner 必须补 credential 与 Web 自动回滚并另获精确审批。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

继续本地准备 Runtime Identity production runner；生产顺序仍先 Dormant Deploy，不能直接创建身份或 activation。

## 2026-07-12 / WP-G0.2 Runtime Identity Production Runner Preparation

### 本轮目标

把 Runtime Identity 的角色创建、权限应用、三 URL 环境切换、Web recreate 和失败回滚做成精确审批、可审计、默认 dry-run 的生产 runner。

### 修改范围

- 新增 request/credential/env/provision/rollback runner 核心与 web-only shell。
- 审批绑定 exact commit、8 文件 artifact、access SQL、fresh Dormant final PASS 和 90 分钟窗口。
- secret 文件必须 0600；口令仅允许高强度 base64url，日志不输出 login/password/URL。
- 成功只创建 3 LOGIN/3 membership、配置 3 URL、recreate Web；失败恢复 env/旧 Web 并撤销 DB 身份/权限。
- 新增 fake execute 成功/失败回滚和真实 PG16 provision/rollback。
- 未连接生产、未改业务代码/migration/Compose/Flag/release/worker/control/交易逻辑。

### 核心链路影响

候选筛选和复盘进化的身份部署路径具备明确变更面和自动回滚；生产数据行为仍未改变。

### 测试结果

- Runner 定向 8/8 PASS；dry-run PASS。
- PG16 provision 3 / rollback 3，最终 LOGIN=0、writer archive privilege=0；原身份最小权限 1/1 PASS。
- Runtime Identity 14/14、Composition 28/28 PASS。
- typecheck、lint、build PASS；test:market 952 pass / 0 fail / 4 explicit DB skip，身份 DB 测试由独立 PG16 Gate 实跑。
- worker 18/18、historical 4/4、golden 16/16 和三项安全门禁 PASS。
- Autonomy 16/16 Gate PASS，worktree unchanged，`canAutoCommit=true`、`canAutoDeploy=false`。
- production smoke/formal 未运行。

### 是否部署

未部署、未连接腾讯云、未执行生产角色/权限/env/Web/数据库/Redis 变更。

### 风险与遗留问题

- Dormant Deploy 尚未 final PASS，生产身份 runner 被硬阻断。
- 实际身份包仍需新的 exact approval 和 30-60 分钟观察。
- Activation 继续禁止。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

生产只申请 Dormant Runtime Deploy；不得把 runner 本地 PASS 解释为身份已部署。

## 2026-07-12 / WP-G0.2 Dormant Artifact Refresh After Identity Hardening

### 本轮目标

修复 Runtime Identity 加固后 Dormant deploy artifact 的 checksum drift，并把安全关键事务适配器纳入完整传递依赖锁定，防止旧制品被误批准到生产。

### 修改范围

- current Dormant artifact 从 13 文件刷新为 14 文件，新增锁定 `src/lib/candidate-episode/transaction-adapter.ts`。
- current artifact SHA-256 更新为 `43e9deaef51e0c0408acb3c449a5cf92577181e66a14adaff958d669d3435f52`。
- validator 回归强制文件数为 14 且必须包含事务适配器。
- 更新部署合同、加速路线、traceability、自治状态、项目 Context 和本轮交付报告。
- 未修改业务运行代码、migration、Compose、环境文件、数据库、Redis、Feature Flag、control lifecycle、前端或交易逻辑。

### 核心链路影响

候选筛选与复盘进化旁路的休眠部署制品现在完整覆盖身份加固后的事务角色行为；这只提高部署完整性，不代表 Candidate runtime 已部署、激活或接管权威链。

### 测试结果

- Dormant validator、dry-run 与定向 9/9：PASS。
- Runtime Identity foundation validator、runner validator/8 of 8 和 Composition 28/28：PASS。
- Autonomy 16/16、typecheck、lint、build：PASS。
- test:market 952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4：PASS。
- backtest:golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- production smoke 与 formal：未运行。

### 是否部署

未部署、未连接腾讯云、未执行生产 Git/Docker/角色/权限/env/Web/数据库/Redis 变更。

### 风险与遗留问题

- 旧 13 文件 SHA-256 只保留为历史证据，禁止再用于生产审批。
- Dormant production deploy 仍缺新的 exact commit + current checksum + web-only + 90 分钟明确审批。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

本轮全部门禁和 GitHub main 同步后，只申请 14 文件 current artifact 的 Dormant Runtime Deploy；不得合并 Runtime Identity 或 activation。

## 2026-07-12 / WP-G0.2 Dormant Release Diff Guard and Approval Refresh

### 本轮目标

关闭 Dormant 部署只校验 14 文件、无法证明完整 Web release 范围的 P1；同时修复跨分支已编译测试残留和 0 核心测试仍可绿灯的 P1 门禁污染。

### 修改范围

- Dormant validator 新增 rollback/approved/base 祖先关系、149 个 A/M 路径、path-set SHA-256、allowlist/forbidden 和审批 diff 字段校验。
- Review、Canonical read、activation、reconciliation 或非 allowlist 路径混入时 fail closed。
- Dormant artifact 刷新为 `78f1e3fa...`；Runtime Identity 传递 artifact 刷新为 `855f8e0d...`，旧值失效。
- `build:market-cli` 每次清理输出；market test tsconfig 禁用 incremental；`test:market` 强制核心测试数大于 0。
- 新增 sentinel 删除、当前测试 JS 重建、release 污染和审批 checksum 反例。
- 未修改业务 UI/API、Candidate runtime、Compose、migration、DB、Redis、worker、Feature Flag、control 或生产。

### 核心链路影响

加强 Candidate 生命周期基础的发布真实性和测试证据可靠性；不改变发现、分析、策略、风险或复盘业务行为。

### 测试结果

- Dormant 11/11、deploy safety 5/5：PASS。
- Runtime Identity Runner 8/8、Composition 28/28、Autonomy unit 16/16：PASS。
- typecheck、lint、build：PASS。
- 清理后的真实 test:market 952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4：PASS。
- backtest:golden 16/16 与三项安全门禁：PASS。
- 自治总门禁 13/13：PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。
- 自治总门禁 17/17：PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。
- production smoke/formal：未运行，本轮禁止。

### 是否部署

未部署、未连接腾讯生产、未执行 Git/Docker/身份/env/API/数据库/Redis/Feature Flag/control 变更。

### 风险与遗留问题

- 旧 14 文件 checksum 不能证明整包 release 范围，已失效。
- 之前跨分支 993 测试计数属于陈旧编译产物污染；真实当前分支基线为 952/4 skip。
- 首次只清输出目录后暴露增量缓存可造成 0 核心测试绿灯；已关闭并回归。
- 首次提交后自校验发现 Dormant 测试把 approved commit 写死为 release base，导致新 HEAD 下 10/11；已改为读取实际 Git HEAD，并从定向与自治门禁重新验证，不把该失败包装为 PASS。
- 最终修复 commit 尚需推 GitHub main，再生成精确审批文本；生产仍未授权。

### 下一轮建议

提交并推送本修复到 GitHub main 后，重新只读核对生产 rollback，再申请唯一的 Dormant Web-only 90 分钟生产审批。

## 2026-07-12 / WP-G0.2 Dormant Runtime Deploy Readiness Remediation

### 本轮目标

执行获批的 Web-only Dormant Runtime Deploy；在自动回滚后修复 Web readiness 启动竞态和回滚后误用旧 verification script 的 P1。

### 修改范围

- 生产按 exact commit=`a8dd5195...`、artifact=`78f1e3fa...`、release diff 149/`f39c8a26...`、rollback=`0599f802...` 执行 Web-only build/recreate。
- 新 Web 内部 API 尚未监听即被检查，返回 `ECONNREFUSED`；runner 自动恢复旧 Web 镜像和 rollback HEAD。
- 本地 runner 增加有限 Web readiness 等待；回滚改用批准源码中的双 env production-check，并显式验证生产根目录。
- readiness 演练覆盖首次失败后重试成功；旧 artifact 失效，新 14 文件 artifact=`e56d37ff17a34b60e65bdfdb86865691e9b91cdb160b5afaa7940a027deb2b0a`。
- 未修改 scan、analysis、strategy、backtest、frontend、DB、Redis、worker、secret、Feature Flag、control lifecycle 或 activation。

### 核心链路影响

提高 Candidate 生命周期旁路的发布和自动回滚可靠性；不改变发现、筛选、深扫、结构、风险、交易计划或复盘业务逻辑。

### 测试结果

- Dormant 11/11、deploy safety 5/5、Runtime Identity Runner 8/8、Composition 28/28、Autonomy unit 16/16：PASS。
- typecheck、lint、build：PASS。
- test:market 952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4：PASS。
- backtest:golden 16/16、三项安全门禁：PASS。
- Autonomy gates 17/17：PASS。
- production smoke：新 Web 即时检查失败后自动回滚，不能计为 PASS。
- formal：未运行，本轮禁止。

### 是否部署

生产尝试已执行但自动回滚，当前未部署新 Web。生产仍为 `main`/`0599f802...`/clean，Candidate runtime disabled。

### 风险与遗留问题

- 当前生产 DB ready、Redis 和六个 worker healthy、scan fresh，但 `marketDataQuality.status=degraded`，总 health 仍 degraded。
- 旧审批和 `78f1e3fa...` checksum 已消耗且失效，严禁复用。
- 新修复必须提交、推 GitHub main、以最终 commit 重跑门禁并重新生成审批。
- Runtime Identity、activation、writer、backfill、dual read 和 read cutover 继续禁止。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

等待生产 health ready；随后只申请绑定新 commit、`e56d37ff...` artifact、149/`f39c8a26...` release diff 和 `0599f802...` rollback 的 Dormant Web-only 新审批。

## 2026-07-13 / WP-G0.2 Dormant Runtime Identity Override Preservation

### 本轮目标

修复 Dormant Web-only 部署与自动回滚未保留外部最小权限身份 override、造成生产 Web 持久化认证失败的问题。

### 修改范围

- 生产只读审计确认数据库 ready，但 Web 读取 `scan_archives` 与 `journal_events` 时使用错误身份并认证失败。
- 部署审批新增 `identityOverrideSha256`；外部 override 必须是绝对路径普通文件、权限精确 `0600`。
- 正常 build/up 与自动回滚复用 base Compose + 同一 identity override。
- Web 启动后比较 Compose 预期 `DATABASE_URL` 指纹和容器实际指纹，全程不输出连接串。
- checksum 漂移在生产 Git/Docker mutation 前 fail closed。
- Dormant artifact 刷新为 `a82ed943...`；Runtime Identity 传递 artifact 刷新为 `95c50a23...`，旧值失效。
- 未修改交易逻辑、migration、DB、Redis、worker、Feature Flag、control 或 secret，未执行生产 mutation。

### 核心链路影响

提高候选筛选与复盘进化底层持久化身份的部署/回滚可靠性；不改变市场发现、深扫、结构、风险或交易计划。

### 测试结果

- Dormant 12/12、Runtime Identity Runner 8/8、deploy safety 5/5、Composition 28/28：PASS。
- typecheck、lint、build：PASS。
- test:market 952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4：PASS。
- backtest:golden 16/16 与三项安全门禁：PASS。
- production smoke 未运行；formal 未运行且本轮禁止。

### 是否部署

未部署、未恢复生产。当前生产应用仍为 `0599f802...`，Web 持久化读取仍 degraded；数据库、scan、Redis 和六个 worker 未变更。

### 风险与遗留问题

- 上一轮把总 health 降级归因于 market data quality 的结论已纠正；真实根因是 Web 身份 override 丢失。
- market data quality 仍 degraded，但属于独立数据质量问题。
- 生产只重建旧 Web 恢复身份也属于生产 mutation，必须单独精确批准。
- Dormant 新发布仍需最终 commit/main、artifact、release diff、identity override checksum 和新 90 分钟审批。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只执行既有旧 Web 的最小权限身份恢复与 health 验证；不得同时部署新 Dormant release。

## 2026-07-13 / WP-G0.2 Production Web Identity Recovery Runner

### 本轮目标

为生产 Web 持久化认证降级建立独立、精确审批、Web-only、no-build 和原基线自动回滚 runner。

### 修改范围

- 审批绑定生产 HEAD、Recovery artifact/逐文件 checksum、identity override、root-owned wrapper、生产 Compose、两份 env 与当前 Web image 指纹。
- 唯一 mutation 是 identity wrapper 的 no-build/no-deps force-recreate Web。
- 成功检查身份指纹、health ready/fresh、持久化、合同、Postgres/Redis、Candidate dormant 和其它容器 ID。
- 失败使用原 base Compose 恢复执行前 Web 基线，不把 degraded 回滚包装成恢复成功。
- 宿主机无 Node 时使用当前 Web 容器 Node 验证同一 exact base64 request/contract。
- 未修改业务代码、migration、DB、Redis、worker、env、Feature Flag、control 或 secret；未执行生产恢复。

### 核心链路影响

加强候选筛选与复盘进化的持久化运行底座；不改变发现、分析、风险或交易计划逻辑。

### 测试结果

- Recovery 7/7、deploy safety 5/5：PASS。
- typecheck、lint、build：PASS。
- test:market 952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4：PASS。
- backtest:golden 16/16 与三项安全门禁：PASS。
- production smoke 未运行；formal 未运行且禁止。

### 是否部署

未部署、未恢复生产。生产仍为 `0599f802...`、worktree clean、Web persistence auth degraded。

### 风险与遗留问题

- 本地 runner PASS 不能证明生产恢复。
- exact request 仍缺审批时实时重取的 Web image 与两份 env 指纹。
- 生产恢复后仍需重新生成 health/contract 证据；Dormant 发布必须另行审批。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只读锁定动态指纹并申请 Web Identity Recovery exact approval，不合并 Dormant 发布。

## 2026-07-13 / WP-G0.2 Production Web Identity Recovery Verified Transport

### 本轮目标

关闭生产仓库禁止 source sync 后恢复 runner 无法安全到达、临时 runner/archive/request 可能污染服务器的执行缺口。

### 修改范围

- Recovery artifact 从两文件扩为 entrypoint、validator、recovery shell 三文件；生产只读预检发现 scan aging 错误回滚与 signal-trap 测试竞态后刷新 SHA-256=`7680f565ea44ab8a2ec089cf9a9ef67ddc27f9ecd9f94c5fe3acb9afa4d9653d`。
- 新增本地脱敏 bundle 生成器；bundle 只含合同和三份 runner，不读取或携带 env、连接串、token、日志或业务数据。
- exact request 新增最终 runner commit、合同 checksum、bundle checksum、固定仓库外 staging 路径、transport method、生产仓库禁止写入和清理要求。
- entrypoint 只接受批准路径、`0700` staging、`0600` request 与 bundle marker；成功、失败和回滚后删除整个 staging。
- 生产只读预检确认当前 health degraded、scan aging、DB probe ready、持久化认证失败；旧 runner 会在身份已修复但 scan 尚未刷新时错误回滚到坏身份。现增加 persistence recovery barrier：身份/持久化失败才回滚；持久化恢复但 scan 在固定 20 分钟内未 fresh 时保留正确身份、返回明确 PARTIAL 并阻断后续。
- production repository fetch/pull/checkout/write、Web 以外服务、build、DB/Redis、env、Flag、migration 和 Dormant release 继续禁止。

### 核心链路影响

使候选筛选与复盘持久化身份恢复包具备真实生产可执行通道；不改变全市场发现、深扫、结构、风险赔率、交易计划或复盘算法。

### 测试结果

- Recovery 11/11、deploy safety 5/5：PASS；覆盖 dirty worktree 只能生成不可审批模板，以及 SIGTERM 非零退出后仍清理 staging。
- typecheck、lint、test:market 952 pass/0 fail/4 explicit DB skip、worker 18/18、historical 4/4、build、backtest:golden 16/16：PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- 自治总门禁：14/14 PASS，`worktreeUnchanged=true`。
- production smoke：未运行，生产 mutation 未授权。
- formal：未运行，本轮禁止。

### 是否部署

未部署、未上传、未创建生产 staging、未重建 Web。生产仍记录为 `0599f802...`/clean、Web persistence auth degraded。

### 风险与遗留问题

- bundle 上传属于生产服务器文件变更，必须纳入下一份 exact approval；不得把本地 bundle PASS 当成生产恢复。
- dynamic Web image、两份 env checksum、当前 HEAD/worktree/health 仍需 Microsoft Edge 只读重取。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

完成自治门禁和最终 commit/main 后生成最终 bundle，再只读生成精确审批包；不得合并 Dormant Deploy。

## 2026-07-13 / WP-G0.2 Production Web Identity Recovery Fingerprint Truth Remediation

### 本轮目标

对 Production Web Identity Recovery 做最终动态只读预检，并修复会让生产 runner 永远 fail closed 的身份文件 SHA 人工转录错误。

### 修改范围

- Microsoft Edge OrcaTerm 只读刷新生产 HEAD、branch、worktree、Compose、两份 env、Web image、身份文件、wrapper 功能、health 和 Candidate worker 边界。
- 更正 recovery validator、JSON/中文合同和蓝图追踪中的 identity override/wrapper SHA。
- Recovery artifact 刷新为 `340ab9dbc6850b9fbe648f52981b9c6f2f7e36d4d23926c0c51535d1fd5a5a42`，contract SHA-256=`9a161f7e2929060dfb1bbdecf3d4a01aa023e15fa97b1050875c5ec5dfb54925`。
- 增加旧误抄 SHA 必须拒绝的回归；旧 Recovery=`7680f565...`、旧 contract checksum 与旧 bundle=`287462ff...` 全部失效。
- 未修改 frontend、业务 API、scan、analysis、strategy、backtest、DB、Redis、worker、Feature Flag、env、secret 或生产 runtime。

### 核心链路影响

修复候选筛选与复盘进化底层持久化恢复包的审批真值；不改变全市场发现、深扫、结构、风险赔率或交易计划逻辑。

### 测试结果

- Recovery 定向：12/12 PASS。
- deploy safety：5/5 PASS。
- typecheck / lint / build：PASS。
- test:market：952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- 自治总门禁：14/14 PASS，`worktreeUnchanged=true`；`autonomy:verify` 为 `canAutoCommit=true`、`canAutoDeploy=false`。
- formal：未运行，本轮禁止。
- production smoke：未运行，生产 mutation 未授权。

### 是否部署

未部署、未上传、未创建生产 staging、未重建 Web。生产仍为 `0599f802...`/main/clean，health degraded、scan fresh、DB ready、持久化认证失败、Candidate worker count=0。

### 风险与遗留问题

- 人工抄写完整 hash 会造成审批证据污染；本轮通过分组 SHA、精确布尔比较、文件元数据和旧值拒绝回归纠正。
- 两个生产身份文件自 2026-07-11 创建后未改变，权限与 owner 正确；该事件不是生产篡改或 secret 变更。
- 当前修改尚需最终 commit/main；dirty worktree 只能生成 `approvalEligible=false` 模板，不能用于生产。
- 即使 final bundle 完成，生产恢复仍必须获得独立 exact approval；Dormant Deploy 继续禁止合并。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

提交并推送本修复，生成绑定 clean commit 的 final bundle；执行前再次只读确认动态指纹，然后只申请 Web-only Identity Recovery 审批。

## 2026-07-13 / WP-G0.2 Production Web Identity Recovery Deterministic Transport

### 本轮目标

关闭同一 clean commit 重复生成 transport bundle 时 checksum 漂移的 P1 证据污染，确保 exact approval 绑定的是可重复、可审计的二进制产物。

### 修改范围

- `web-identity-recovery-bundle.mjs` 固定 payload 文件顺序、uid/gid、mtime epoch 和 ustar 格式，并使用 `gzip -n -9` 去除 gzip 时间头。
- transport manifest、机器合同和生产 runner 同时锁定 `reproducibleArchive=true`、`archiveFormat=ustar+gzip-n`、`sourceDateEpoch=946684800`。
- 新增同一 payload 两次构建 SHA 与 bytes 完全相等的回归，并让旧 manifest 缺字段时 fail closed。
- Recovery artifact 刷新为 `cb81523b21018868a81b21d42a195574a5a3c2695b2090fc9c770a9002b58a79`，contract SHA-256=`10be74155f464285e9369b93e0ea9682ca8c7c736d7b3027f348a899d7b08265`。
- 旧 commit=`9d6a5fea...` 的 Recovery=`340ab9db...`、contract=`9a161f7e...`、bundle=`6285244a...` 全部失效，本地旧 bundle 已删除。
- 未修改 frontend、业务 API、scan、analysis、strategy、backtest、DB、Redis、worker、Feature Flag、env、secret 或生产 runtime。

### 核心链路影响

提高候选生命周期持久化恢复包的发布证据可重复性；不改变发现、候选排序、深扫、结构、风险赔率、交易计划或复盘算法。

### 测试结果

- bundle 漂移失败基线：同 commit 两次 SHA 不同，已真实复现。
- deterministic proof：跨 1.1 秒两次独立构建 SHA 与 bytes 完全一致。
- Recovery 定向：13/13 PASS。
- deploy safety：5/5 PASS。
- typecheck / lint / build：PASS。
- test:market：952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- 自治总门禁：14/14 PASS，`worktreeUnchanged=true`；`canAutoCommit=true`、`canAutoDeploy=false`。
- formal：未运行，本轮禁止。
- production smoke：未运行，生产 mutation 未授权。

### 是否部署

未部署、未上传、未创建生产 staging、未重建 Web。生产状态未改变。

### 风险与遗留问题

- 当前修改仍需新 clean commit/main；旧 `9d6a5fea...` 审批材料不可复用。
- 最终 bundle 只能在 commit 后生成一次并锁定；虽然重复生成应同 SHA，审批后仍禁止无意义重建。
- 生产执行继续要求独立 exact approval，Dormant Deploy 不得合并。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

提交并推送 deterministic transport 修复，生成绑定新 commit 的唯一 final bundle；执行前重新只读核对生产动态指纹，再申请 Web-only Identity Recovery 审批。

## 2026-07-13 / WP-G0.2 Dormant Release Diff Refresh After Web Identity Recovery

### 本轮目标

在不放宽 Dormant 发布边界的前提下，把 Web Identity Recovery 的合法传递依赖纳入完整 release-diff 证据，阻止历史审批材料被错误复用。

### 修改范围

- Dormant release validator/合同从历史 149/`f39c8a26...` 刷新为当前 156/`8aa96737...`。
- 14 文件 Dormant artifact 刷新为 `b4fce8a6...`，8 文件 Runtime Identity artifact 传递刷新为 `d3b4f015...`；文件数均未扩大。
- execute/rollback 演练 fixture 改为使用 rollback..HEAD 的当前 path-set，并在执行 runner 前独立校验 count/hash。
- 新增历史 149/`f39c8a26...` 合同拒绝回归。
- 未修改部署 shell、Compose、Candidate runtime、frontend、业务 API、scan、analysis、strategy、backtest、DB、Redis、Worker、Feature Flag、migration、env 或 secret。

### 核心链路影响

加强候选生命周期和 Shadow Runtime 的发布范围真值；不改变扫描、候选排序、分析、策略或复盘算法。

### 测试结果

- 红灯基线：当前 main 被旧合同正确拒绝为 `release_diff_file_count_mismatch`。
- 首次 artifact 传递红灯：Dormant 10/12，2 个 `artifact_checksum_mismatch`；Runtime Identity validator `artifact_checksum` FAIL。
- 修复后 Dormant：12/12 PASS；Runtime Identity Runner：8/8 PASS。
- deploy safety：5/5 PASS；Composition：28/28 PASS；Autonomy unit：16/16 PASS。
- typecheck / lint / build：PASS。
- test:market：952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- 自治总门禁：17/17 PASS，`worktreeUnchanged=true`；`canAutoCommit=true`、`canAutoDeploy=false`。
- formal：未运行，本轮禁止。
- production smoke：未运行，本轮未连接或改变生产。

### 是否部署

未部署。Web Identity Recovery 仍等待独立 exact approval，Dormant Deploy 继续禁止。

### 风险与遗留问题

- 历史 149/`f39c8a26...`、Dormant `a82ed943...`、Runtime Identity `95c50a23...` 全部失效，不得用于新审批。
- 当前 156 路径只证明截至最终 commit 的 path-set；本轮提交如只修改已有路径则 count/hash 不变，但仍须在 clean commit 后重新验证。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

先完成 Web Identity Recovery；health ready/fresh 后再为 Dormant Deploy 生成绑定新 clean commit、156/`8aa96737...` 与两项新 artifact 的独立审批。

## 2026-07-13 / WP-G0.2 Production Web Identity Recovery Execution and Closeout

### 本轮目标

在不再次改变生产服务或改写已批准合同的前提下，记录 exact-approved Web-only 身份恢复结果，清理本轮精确临时污染，并把自治路线切换到 Dormant Runtime Deploy 前的完整 closeout。

### 修改范围

- 生产执行只 no-build/no-source-sync/no-deps force-recreate Web；没有修改生产 Git、镜像、数据库、Redis、Worker、Caddy、env、Feature Flag、migration 或 Dormant release。
- 本地只更新自治状态、提速路线、traceability、Context、Changelog 和忽略的中文交付报告；已批准合同和 runner 保持原 checksum。
- 批准 staging 已由 entrypoint 自动删除；本地 transport 临时副本已删除。远端12个审批/分块文件和4个 `/tmp` 后验证文件已按用户即时确认精确删除；两组 `ls -ld` 对16条路径逐项返回 `No such file or directory`，批准 staging 路径也再次确认不存在。
- 提速组织由双车道扩展为生产串行、下一 Gate 本地准备、自动持续观察、自动证据收口四车道；Gate 顺序和质量门槛不变。

### 核心链路影响

恢复候选筛选与复盘进化依赖的 Web 持久化身份和读取基础；不改变全市场发现、候选排序、深扫、结构分析、风险赔率、交易计划或回测算法。

### 测试结果

- 生产 runner：`PASS_PRODUCTION_WEB_IDENTITY_RECOVERY`，无 PARTIAL、无 rollback。
- production smoke：health ready、scan fresh、persistence ready，三份合同、Redis、runner 内 Postgres readiness、Candidate dormant 和非 Web 容器身份检查通过。
- 持续健康复查：捕获一次 `health.level=degraded` / scan=`aging`，persistence 始终 ready；新 snapshot 后恢复 ready/fresh。代码证明 fixed-delay worker 把75-112秒任务耗时叠加到900秒睡眠；多个 read 路由还可能在 cadence 边界主动刷新并争抢 Redis scan lock，`POST /api/scan` 的 `served_cache` 仍会被通用 Worker 仅凭 HTTP 200 记为 `task-ok`。freshness 又以扫描开始时间计龄，因此单改 fixed-rate 仍会在扫描执行期间留下短暂 aging。生产短任务与 lock contention 的逐条对应尚缺机器状态字段，不能包装成已经完全实证。
- closeout 定向：Recovery 13/13、Deploy Safety 5/5、Dormant 12/12、Runtime Identity 8/8、Composition 28/28、Autonomy unit 16/16 PASS。首次并行 Composition 与另一份 market build 争用 `.tmp/market-tests` 报 `ENOTEMPTY`；改为串行后 28/28 PASS，未改代码掩盖该调度竞态。
- typecheck / lint / build：PASS。
- test:market：952 pass / 0 fail / 4 explicit DB skip；worker 18/18；historical 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- 自治总门禁与 verify：PASS，`canAutoCommit=true`、`canAutoDeploy=false`。
- formal：未运行，本轮禁止。

### 是否部署

已在用户 exact approval 窗口内只重建生产 Web；生产 HEAD 仍为 `0599f802...`/main/clean，Web image 不变。当前没有新的 GitHub 提交或 Dormant 部署。

### 风险与遗留问题

- 远端16个精确临时文件已删除并逐项复核 absent；closeout 定向、完整、安全和自治门禁已通过，当前只待提交推送。Dormant Deploy 仍被独立 P1 阻断。
- P1：scan cadence、read/write 边界、锁竞争/旧缓存成功语义和 completion freshness 合同共同允许短暂 aging/degraded 与假 `task-ok`；身份恢复 PASS 不等于持续健康 PASS。该问题完成本地修复、按实际变更面独立部署 Web 与 scanner-worker、并至少两个 cadence 周期观察前，Dormant Deploy 继续禁止；不得为了沿用旧计划把 API/Web 合同变化伪装成 scanner-worker-only。
- Candidate runtime 仍 disabled，WP-G0.2/G0 未完成；系统仍为 R1、可运行但不完整、不能支撑实战。
- 公网明文 HTTP 仍是后续 G0.3 的 P0，不能因 Web health 恢复而关闭。

### 下一轮建议

完成本轮完整门禁、报告和提交收口；随后只执行 `WP-G0.2-SCAN-CADENCE-CACHE-AND-FRESHNESS-SUSTAINED-HEALTH-REMEDIATION`，不得直接申请 Dormant Runtime Deploy。

## 2026-07-13 / WP-G0.2 Scan Cadence Cache and Freshness Sustained Health Remediation

### 本轮目标

只修复 scanner 周期性 aging/degraded 与假 `task-ok` 的四个联合根因：fixed-delay 漂移、read 路由刷新争锁、旧缓存成功语义和 start-time freshness。

### 修改范围

- scanner worker 改为以计划时点为锚的串行 fixed-rate，错过周期直接跳过，不重叠、不突发追赶；只有响应 body `status=updated` 才能记录成功 heartbeat。
- readable snapshot 入口结构性 no-refresh；只有受保护 refresh action 可调用 provider。
- scan coordination 增加 `scan_in_progress` / `budget_exhausted` 机器 code；lock contention 返回 `in_progress`。
- `POST /api/scan` 只有 `updated` 返回 HTTP 2xx/`ok=true`，`in_progress`、`served_cache`、`failed` 全部 fail closed。
- 成功扫描记录 started/completed/duration，health 从成功完成时间计龄；失败、缓存、锁竞争不刷新成功时间。
- 锁释放失败只执行一次，返回 failed 且不写入未闭环缓存。
- 未修改 analysis、strategy、RR、交易计划、backtest、Candidate 数据、DB、Redis、migration、env、secret、Feature Flag 或生产 runtime。

### 核心链路影响

影响全市场发现、候选筛选的新鲜度、刷新所有权和运行真值；不改变候选排序算法，不增加交易权限。

### 测试结果

- 红灯基线：首次编译14个预期缺口；首次实现后2个断言差异，均真实记录并逐项修正。
- sustained-health 定向：55/55 PASS；worker：23/23 PASS。
- deploy safety：5/5 PASS；autonomy unit：16/16 PASS。
- typecheck / lint / build：PASS。
- test:market：960 pass / 0 fail / 4 explicit DB skip；historical 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- 自治总门禁：12/12 PASS，`worktreeUnchanged=true`；verify=`canAutoCommit=true`、`canAutoDeploy=false`。
- formal：未运行，本轮禁止。
- production smoke：未运行，本轮未部署且无生产授权。

### 是否部署

未部署、未连接生产、未改变 Web、scanner-worker、数据库、Redis 或生产仓库。当前只能写本地修复候选，不能写生产 P1 已关闭。

### 风险与遗留问题

- API 合同和 worker 同时改变，后续生产发布必须是 Web + scanner-worker 的精确变更面，不得伪装成 worker-only。
- 仍需 commit/main、独立 exact approval、生产部署和至少两个 cadence 周期无 aging/degraded/假 `task-ok` 观察。
- Dormant Deploy 在上述证据完成前继续禁止。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

完成 commit/main 后，只生成 scanner sustained-health 的 Web + scanner-worker 独立生产审批包。
## 2026-07-14 / WP-G0.2 Scan Sustained Health Production Release Packet

### 本轮目标

把基于生产 `0599f802...` 的最小扫描修复 release `70722ea...` 固化为精确批准、Web + scanner-worker 双镜像自动回滚和两个 cadence 周期持续观察执行包；本轮不执行生产发布。

### 修改范围

新增 release 机器合同、中文治理说明、validator、runner、repository-external entrypoint、可复现 bundle builder、合同/transport 测试和完整成功/失败回滚假生产演练；更新 `package.json`、自治状态、项目上下文、加速蓝图和 traceability。

没有修改 scan/analysis/strategy/backtest/frontend/API 业务代码、migration、docker-compose、数据库、Redis、worker 业务实现、环境文件、Feature Flag、Candidate runtime 或 secret。

### 核心链路影响

影响全市场发现、候选筛选的新鲜度和生产持续健康证明。发布器只允许 `web` 与 `scanner-worker`，禁止 GitHub main 直接进入生产；其它核心链路不变。

### 测试结果

- production release validator：pass；精确 target=`70722ea...`、parent=`0599f802...`、16文件 diff SHA=`80bab7d...`、artifact 与 runner guards。
- 定向 release + execute rehearsal：12/12 pass；成功路径和观察失败双镜像/Git 回滚均通过。
- typecheck / lint / build：pass。
- test:market：960 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical smoke 4/4。
- backtest:golden：16/16 pass。
- forbidden-files / secret-patterns / security-check：pass。
- autonomy 总门禁：11/11 pass，`worktreeUnchanged=true`，`canAutoCommit=true`，`canAutoDeploy=false`。
- production smoke：未运行，本轮没有部署。
- formal：未运行，按规则禁止。

### 是否部署

未部署。生产仍为 `main@0599f802...`，Candidate runtime disabled，数据库、Redis、服务、环境和 Feature Flag 未改变。

### 风险与遗留问题

- P1：scanner 持续健康尚未生产发布和观察，不能写已关闭。
- 当前 main 含未获准 Candidate/Dormant 代码，只能部署专用单父 release；runner 已 fail closed 禁止 pull main。
- 生产动态镜像/env 指纹、final bundle、exact approval 均尚未生成。

### 下一轮建议

只完成本包基础/安全/自治门禁、提交和 final reproducible bundle；随后用 Microsoft Edge 做动态只读生产预检并申请新的90分钟 exact approval。

## 2026-07-14 / WP-G0.2 Scan Sustained Health Emergency Baseline Recovery

### 本轮目标

在 sustained-health 生产 runner 因 OrcaTerm 前台会话断开而终止后，只恢复批准的生产基线，避免把未完成的持续观察或不确定回滚包装成发布成功。

### 修改范围

- 生产仓库仅 checkout 到 clean `main@0599f802f261fe8e3c1982a07106f362bd62ac13`。
- 恢复旧 Web 镜像 `sha256:d51215624bd9e0a0ffc0138a20e9c1a4bf898f540be7528c01fef28fa5799800`。
- 历史 scanner-worker 镜像已丢失，从精确 baseline 源码仅重建 scanner-worker，得到 `sha256:bd01f60c83bdc0950659989fd243946a3343c0aad1ea8d31e1f1ab5cbbb97939`。
- 仅 force-recreate Web 与 scanner-worker，并执行只读生产验证。
- 本地只更新项目上下文、变更日志、交付报告和脱敏证据；没有业务代码改动。

### 核心链路影响

恢复全市场发现和候选筛选所依赖的生产 Web/scanner 基线与健康状态；不改变扫描排序、深扫、结构分析、风险赔率、交易计划或复盘算法。

### 测试结果

- 生产：HEAD/branch/worktree、目标镜像、非目标容器、Candidate absent、Postgres、Redis、health、scanner heartbeat、三份合同和 Web/scanner 身份指纹检查通过。
- scanner 重建摘要与历史摘要不一致，按批准规则标记 `RECOVERED_BASELINE_REBUILT_NOT_IDENTICAL`，不得标记发布 PASS。
- 本地 typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip，worker 23/23，historical smoke 4/4；backtest:golden 16/16；forbidden-files、secret-patterns、security-check 全部 PASS。
- formal：未运行，本轮禁止。

### 是否部署

已执行紧急基线恢复，仅重建 scanner-worker 镜像并重建 Web 与 scanner-worker 容器。没有数据库、Redis、migration、env、Feature Flag、Candidate runtime、其它服务或 GitHub 变更。

### 风险与遗留问题

- 原 sustained-health 发布没有完整观察总结，不是 PASS；该 P1 仍未关闭。
- scanner-worker 是从同一 baseline 源码重建的恢复镜像，但字节摘要不等于历史镜像，不能声称完全相同回滚。
- 浏览器前台会话可以终止当前 runner，且历史回滚镜像可能被构建清理；两项都必须在再次发布前修复。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`，Dormant Runtime Deploy 继续阻断。

### 下一轮建议

只加固 sustained-health 生产 runner 的会话独立性和回滚镜像留存/预检，然后重新执行完整本地演练与基础门禁。

## 2026-07-14 / WP-G0.2 Scan Sustained Health Runner Recovery Hardening

### 本轮目标

只修复上轮生产发布暴露的两个工程缺口：runner 依赖 OrcaTerm 前台会话，以及旧 Web/scanner-worker 镜像未在 mutation 前保留为可验证的回滚引用。

### 修改范围

- sustained-health 入口改为只通过 transient systemd unit 启动 detached worker；禁止前台 fallback，并转发 HUP/TERM/INT 以等待自动回滚完成。
- 发布 runner 在 checkout/build/recreate 前为当前 Web 和 scanner-worker 建立确定性 rollback refs，并在关键 mutation 边界重复验证。
- 失败回滚改为从已保留 refs 恢复双镜像和 baseline Git；成功后也保留 refs，清理需要独立批准。
- 扩展生产合同、validator、bundle manifest、成功/失败演练和治理文档。
- 未修改 scan、analysis、strategy、backtest、frontend、业务 API、数据库、Redis、migration、env、Feature Flag 或 Candidate runtime。

### 核心链路影响

只强化全市场发现与候选筛选所依赖的 scanner 发布可靠性和恢复能力；不改变扫描排序、结构判断、风险赔率、交易计划或复盘逻辑。

### 测试结果

- 红灯基线：12 项中 6 pass / 6 fail，失败精确覆盖旧审批键、缺少会话独立合同、未使用 systemd 和没有 rollback image retention。
- 定向 release/execute rehearsal：12/12 pass；证明 launcher 退出后 worker 仍完成、保留 refs 先于 checkout/build、观察失败恢复双镜像与 baseline Git、保留验证失败在 mutation 前拒绝。
- deploy-safety 5/5、autonomy unit 16/16：pass。
- typecheck、lint、build：pass。
- test:market：960 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical smoke 4/4。
- backtest:golden：16/16 pass；formal 未运行。
- forbidden-files、secret-patterns、security-check：pass。
- autonomy 总门禁：11/11 pass；`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。

### 是否部署

未部署、未连接生产、未执行 migration、未重启服务。当前生产仍保持紧急恢复后的 baseline 状态。本轮新 3 文件 artifact SHA-256=`6af759ceee3aa4a97ce22f92db28cbef31ebade519b57a088900278e1655eb69`；旧 artifact=`5dc432045b3e0ebdf9bd83b90dd3b720a024544da2c46872dc6ef4898892c7c5` 和历史 bundle/approval 均已失效。clean Git 收口与绑定最终 clean HEAD 的可复现 bundle 已完成，精确 commit/bundle 指纹记录在本轮交付报告。

### 风险与遗留问题

- 本地加固 PASS 不等于 sustained-health 生产发布 PASS；P1 仍需重新发布和连续1800秒观察关闭。
- final bundle 已从 clean commit 两次独立生成并通过字节级一致性校验；仍须重新绑定当前生产动态指纹和新的 exact approval。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`；WP-G0.2 与 G0 均未完成。

### 下一轮建议

只用 Microsoft Edge 做动态只读生产预检并申请新的 Web + scanner-worker 精确发布批准；不得夹带 Dormant Runtime、数据库或 Candidate activation。
