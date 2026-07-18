# Market Radar 外部审计变更日志

用途：给外部架构审计员 / ChatGPT 快速了解最近轮次发生了什么。本文只记录事实，不包含密钥、连接串、服务器密码、cookie、token 或私钥。

## 2026-07-18 / WP-G0.2 Legacy Pending Drain 第四次失败与 jq 合同门修复

### 本轮目标

关闭第四次生产 pending-only drain 暴露的三处同类 `jq` 合同语法缺陷，使合法的 preflight、control open 和 final verify JSON 能被真实 runner 接受，同时保持数量、epoch、回滚和生产身份边界不变。

### 修改范围

- 修改 production runner，将三道 `jq` 合同冻结为单行只读过滤器。
- 修改 runner 单测、治理器及弱化测试，真实调用 `jq` 编译并拒绝旧式单引号续行。
- 更新 production packet JSON/Markdown、runner artifact、自治状态、Context 和本日志。
- 未修改 frontend、API、scan/analysis/strategy/backtest、migration、DB schema、Redis、worker 业务逻辑、env、Feature Flag、secret 或其他服务。

### 核心链路影响

只影响候选筛选与复盘进化的数据完整性地基：修复旧 Candidate pending 排空工具的结果校验，不生成候选、方向、交易计划或新信号。

### 测试结果

- production packet：22/22 PASS。
- legacy drain：12/12 PASS。
- PostgreSQL 16 成功排空与失败再冻结双路径：PASS；`sourceWritesAdded=0`、`outboxDeleted=0`、`productionConnected=false`。
- shell syntax、governance validator、`git diff --check`：PASS。
- typecheck、零 warning lint、build、三项安全门禁和 Autonomy 31/31：PASS。
- test:market：1027 pass / 0 fail / 7 explicit skip；workers 23/23、historical 4/4 PASS。
- backtest:golden：16/16 PASS。
- 完整自治总门禁：12/12 PASS，`worktreeUnchanged=true`；最终文档内容会再由提交前绑定门禁复核，不能继承过期 worktree 证据。
- formal：未运行，合同禁止。

### 是否部署

第四次生产请求已执行但失败并完整回滚；本轮 jq 修复尚未 commit、push 或部署。第四次执行使用 fencing token 17，lease 已释放，生产数据库仍为 `legacy/frozen epoch4`、pending/unresolved=2,957，Web/scanner ready/fresh。

### 风险与遗留问题

- G0 主步骤仍为 8；生产 pending 未排空，cycle-2 继续禁止。
- 本地测试成立不等于生产 drain PASS；还需完整门禁、提交、提交后门禁、新单次 request 和第五次真实执行。
- 第四次 request 已消费，不得复用。

### 下一轮建议

只完成当前 jq 修复的 commit-bound 第五次 pending-only drain；不得合并 cycle-2。

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

## 2026-07-14 / WP-AUTO-02 G0-G8 Standing Authority and Evidence Hardening

### 本轮目标

把用户对 G0-G8 连续全自动工程的直接授权固化为 fail-closed 机器合同，同时锁定唯一核心、Gate 顺序、固定质量门禁、真实观察窗口、生产单写入者和精确清污边界。

### 修改范围

- 新增 G0-G8 长期授权机器合同和全自动执行蓝图。
- 强化自治控制器的固定基础/安全门禁、commit/tree/artifact/scripts/policy 证据绑定和两小时新鲜度。
- 新增仓库外生产租约、递增 fencing token、一次性授权消费和撤销 epoch。
- 新增 G9 越界、降质、破坏性动作、超时窗口、假哈希、假门禁、证据漂移、授权重放、生产并发和撤销攻击性测试。
- 更新加速计划、traceability、Context 和中文交付报告。
- 未修改 scan、analysis、strategy、backtest、frontend、API、DB、Redis、worker、Compose、migration、env、Feature Flag 或 secret。

### 核心链路影响

为全市场发现、候选筛选、深扫验证、结构分析、风险赔率、交易计划和复盘进化提供连续施工和证据真值控制；不改变业务算法或交易判断。

### 测试结果

- test:autonomy：26/26 PASS；新增核心目标偏移和 production commit/tree/policy/gate-evidence 不匹配拒绝测试。
- 首次扩展后的 `autonomy:status` 暴露命名冲突并真实 FAIL；最小修复和 repository inspection 回归后已恢复执行。
- 首轮自治总门禁：9/9 PASS，`worktreeUnchanged=true`。
- typecheck / lint / build：PASS。
- test:market：960 pass / 0 fail / 4 explicit skip；worker 23/23；historical 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- formal：未运行，本轮禁止。
- production smoke：未运行，本轮未连接生产。

### 是否部署

未部署、未连接腾讯云生产。控制包已提交为 `386bf32be5d6d6106ce608a585d9a227a759ba35` 并 fast-forward 推送 GitHub main；当前生产和 Scanner sustained-health P1 状态不变。

### 风险与遗留问题

- 长期授权不等于生产 PASS；每个 mutation 仍需逐包精确记录、动态预检、外部租约和回滚。
- 7/14/30/60/180 天及 holdout/sample 门槛不能压缩。
- 报告与状态冻结后的最终自治门禁已再次 PASS；旧 gate evidence 在进入 Scanner 包后不复用。
- 系统仍为 R1、可运行但不完整、不能支撑实战。

### 下一轮建议

只恢复 Scanner sustained-health Web+scanner-worker 精确生产包，先接入 standing authorization 与 runtime lease，再做动态生产预检。

## 2026-07-14 / WP-G0.2 Scanner Sustained Health Production Pass and Lease Evidence Closeout

### 本轮目标

只完成 Scanner sustained-health 的精确 Web + scanner-worker 生产重发、1800 秒持续观察、生产真值收口，以及生产后发现的 lease execution 快照一致性缺陷修复。

### 修改范围

- 生产只构建/recreate Web 与 scanner-worker，生产仓库切到 clean detached `70722ea...`；其它容器、Candidate runtime、数据库、Redis、env、Feature Flag 和 GitHub main 不变。
- 本地 lease CLI 在 consume/release 后原子持久化 execution snapshot；定向测试锁定 `active_consumed` 与 `released` 生命周期。
- 更新自治状态、项目 Context、traceability、治理说明、当前 artifact 和中文交付报告；新增脱敏生产证据。
- 精确删除 4 个失效/已消费 bundle、1 个 request 和 1 个仓库外单次 approval；保留服务器原始 evidence、consumed/released ledger 与两个 rollback refs。
- 未修改 scan、analysis、strategy、backtest、frontend、业务 API、DB schema、Redis、worker 业务代码、Compose 或 secret。

### 核心链路影响

- 全市场发现：生产 scanner 不再因任务时长发生 cadence 漂移，持续完成时间已真实推进。
- 候选筛选：freshness 与 scanner heartbeat 在两个后续 cadence 内持续通过。
- 深扫验证、结构分析、风险赔率、交易计划、复盘进化：本轮未修改业务逻辑。

### 测试结果

- 生产：`PASS_PRODUCTION_SCAN_SUSTAINED_HEALTH_TWO_CADENCE_OBSERVATION`；1800 秒、59 样本、2 completion advances、3 updated-only successes，最终 ready/fresh/heartbeat healthy。
- lease 快照红灯：新增断言后 0/1，actual=`active_unconsumed`、expected=`active_consumed`。
- 修复后单测：1/1 PASS。
- artifact 防线：CLI 修改后 release 套件真实 9/15、6 项 checksum 失败；刷新未部署的事后 closeout artifact 后 15/15 PASS。
- autonomy：29/29 PASS。
- typecheck / lint / build：PASS。
- test:market：960 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical smoke 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- 最终冻结 autonomy 总门禁：10/10 PASS，`worktreeUnchanged=true`；本节、Context、traceability 与交付报告已纳入同一工作树指纹，旧 gate evidence 不复用。
- backtest:formal：未运行，本轮禁止。

### 是否部署

已部署腾讯云生产，仅 Web 与 scanner-worker。当前生产为 clean detached `70722ea...`；新 Web=`sha256:6d02c759...`、scanner-worker=`sha256:b11c0cec...`。没有数据库、Redis、migration、env、Feature Flag、Candidate runtime 或其它服务变更。GitHub main 在生产执行前已包含 runner closeout提交，本轮事后 CLI 修复尚待 commit/push，且未重新部署。

### 风险与遗留问题

- 原 production execution snapshot 陈旧，但 append-only events、external consumed ledger、released history 和 active lease count=0 一致证明 lease 已 `released/PASS`；原文件保留并新增四源脱敏 reconciliation。
- Scanner P1 已关闭，但 WP-G0.2/G0 未完成，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
- 旧 Dormant Deploy 合同绑定旧 release diff/rollback 和旧逐次审批模型，且缺少当前 session-independent runner/rollback retention 集成，不能直接执行。

### 下一轮建议

只做 `WP-G0.2-DORMANT-RUNTIME-DEPLOY-STANDING-AUTHORITY-AND-RUNNER-REFRESH`，绑定当前生产 target、standing authorization、外部 lease/fencing、session-independent runner、Web rollback retention 和完整隔离演练；通过后才允许 web-only dormant 生产重试。

## 2026-07-14 / WP-G0.2 Scanner Sustained Health Standing Authorization Integration

### 本轮目标

把 Scanner sustained-health 生产 runner 接入 G0-G8 常驻授权、仓库外全局租约、一次性授权消费和递增 fencing；修复静态授权预填 runtime lease 导致 commit/tree/gate 自失效的问题，并保持仅 Web + scanner-worker 的原发布边界。

### 修改范围

- 将 package authorization 与 runtime lease execution record 分离；当前 standing approval 必须位于仓库外、为 `0600` 普通文件。
- 新增 lease CLI，原子 acquire、checkpoint、consume、release，并拒绝路径穿越、重放、旧 fencing、过期和撤销后的正向写入。
- Scanner runner 在 rollback retention、checkout、build、两次 recreate、首次扫描等待、每次观察采样和回滚/成功收口前重验 lease。
- transport manifest 新增 runner source parent/commit/tree/diff/path-set、policy 与 gate evidence 绑定。
- 更新机器合同、执行说明、自治控制器、Context、traceability 和本轮报告。
- 未修改 scan 算法、analysis、strategy、backtest、frontend、业务 API、DB、Redis、worker 业务代码、Compose、migration、env、Feature Flag、Candidate runtime 或 secret。

### 核心链路影响

- 全市场发现：防止 Scanner 发布因浏览器断开、并发旧 runner 或证据漂移而形成假持续健康。
- 候选筛选：1800 秒观察必须连续 fresh、heartbeat healthy 且至少两个真实 completion advances。
- 深扫验证、结构分析、风险赔率、交易计划、复盘进化：本轮不修改。

### 测试结果

- test:autonomy：29/29 PASS。
- production release / execute / lease CLI：15/15 PASS；除成功、观察失败双镜像+Git 回滚、retention 缺失、manifest tree 漂移、重放、撤销和安全 closeout 外，新增干净克隆真实执行 Bundle CLI 的回归证明。
- 第一轮基础门禁：typecheck、lint、build、test:market 960/0/4 explicit skip、worker 23/23、historical 4/4、Golden 16/16 全部 PASS。
- 安全门禁：forbidden-files、secret-patterns、security-check 全部 PASS。
- 提交前 autonomy 总门禁：10/10 PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`；结果回填后将再次运行最终冻结门禁，旧 gate evidence 不复用。
- backtest:formal：未运行，继续禁止。

### 是否部署

未部署、未连接生产、未重启服务、未执行 migration。旧 artifact、approval、gate evidence 和 bundle 全部失效；当前六文件 artifact SHA-256=`5937a72025173ffd703bbaa2034159ae0e89326b635423e3685be53bec013cd8`。首个 clean commit `039eb09baf09914a5b204047045a17113f01e783` 的提交后门禁 10/10 PASS，但正式 Bundle 构建前复核发现 CLI 默认文件名引用已删除变量；该提交的 gate evidence 随修复失效，禁止复用，修复提交、当前 gate evidence 与 final bundle 尚未生成。

### 生产 Gate 转换

- 修复提交 `6b33a78c8c4a68276a1aadb3be2148a122114782` 已推送工作分支和 GitHub main；提交后自治门禁 10/10 PASS，gate evidence=`772d5e08679a9a386cb4107f52300f99c835b41f57bf99159e03a376b657692a`。
- 同一提交的正式 Bundle 与复核副本逐字节一致，SHA-256=`d9f170a80faf5ebbcac227ed67467cee7e4170ae478073e63910b98af2a99737`；复核副本已精确删除。因本次状态从 localPreparation 转为 production，该 Bundle 和 gate evidence 立即转为历史证明，禁止直接执行。
- Microsoft Edge/OrcaTerm 动态只读预检证明：生产 clean `main@0599f802...`、target=`70722ea...`、Compose=`2749a24...`、base env=`763b46f...`、production env=`4cafabd...`、wrapper=`fb473dc...`/root:0700、override=`1b7f8ba...`/root:0600；Web image=`sha256:d5121562...` healthy，scanner image=`sha256:bd01f60c...` running，Candidate count=0，Postgres ready，Redis PONG，无活动生产 lease。
- health 为 ready/fresh 且 scanner heartbeat healthy，但 baseline `scan.completedAt=null`；不得把这写成 sustained-health PASS。目标发布必须出现首次新 completedAt，并在连续 1800 秒内再推进至少两次，否则自动恢复双镜像与 `main@0599`。
- 状态已切换为 `production / productionMutation=true / requiresExplicitApproval=true / ready_for_gate`；同时纠正原 `updatedAt=06:02+08:00` 晚于真实当前时间的记录污染。

### 风险与遗留问题

- 本地 runner 加固不等于生产 sustained-health PASS，P1 与 G0 仍未关闭。
- 首次新增 CLI 回归测试时断言误写为 `PASS_LOCAL...`，实际制品正确返回 `PASS_FINAL...`；测试曾 14 pass / 1 fail，修正测试期望后 15/15 PASS。该失败未被包装为首次通过。
- 完整门禁、clean commit、当前 gate evidence、动态生产指纹、外部 approval 和 final bundle 缺一不可执行。
- 当前系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

冻结本包事实并完成完整门禁、commit/push；随后只做 Scanner 动态只读生产预检和 exact Web + scanner-worker 发布。

## 2026-07-14 / WP-G0.2 Dormant Runtime Deploy Standing Authority and Runner Refresh

### 本轮目标

把历史上已自动回滚的 Dormant Web-only 发布包刷新到当前生产 target、G0-G8 standing authorization、仓库外单次租约、递增 fencing、session-independent runner、精确单父 release 和成功后 rollback image 留存，同时保持 Candidate 完全休眠。

### 修改范围

- 从生产 target `70722ea...` 建立精确单父 18 文件 release `cec0b657...`，不部署 GitHub main 宽差异。
- 重写 Dormant validator、Web-only runner、攻击性测试和隔离成功/失败演练；新增 transient systemd 入口与可复现脱敏 Bundle builder。
- runner 只允许 Web build/force-recreate，接入仓库外 approval/lease/fencing/checkpoint；旧 Web image 在 mutation 前保留，失败恢复 baseline Git 和旧 image。
- 更新机器合同、中文运行合同、自治状态、traceability、Context 和本轮交付报告。
- 未修改 Candidate 业务实现、Compose、scan、analysis、strategy、backtest、frontend、API、数据库、Redis、worker、migration、env、Feature Flag 或 secret。

### 核心链路影响

为候选筛选与复盘进化提供可部署但完全休眠的运行地基；不生成候选、信号、方向、止损、目标、RR 或交易计划。

### 测试结果

- 红灯基线：16 项中 10 PASS / 6 FAIL，真实暴露旧 release/artifact、standing authority、lease/fencing、transient entrypoint 和 Bundle 缺口。
- test:candidate-dormant-deploy：12/12 PASS，包含真实脚本 Web-only 成功与观察故障后 Git+旧 Web image 自动回滚。
- test:autonomy：29/29 PASS；test:deploy-safety：5/5 PASS。
- typecheck / lint / build：PASS。
- test:market：960 pass / 0 fail / 4 explicit skip；worker 23/23；historical smoke 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files / secret-patterns / security-check：PASS。
- 首轮自治总门禁：11/11 PASS，`worktreeUnchanged=true`；事实回填后必须再跑最终冻结门禁，旧 gate evidence 不复用。
- Microsoft Edge/OrcaTerm 动态只读预检：生产 clean detached `70722ea...`、remote target=`cec0b657...`、health ready/fresh、scanner healthy、Candidate dormant/absent、schema=`9|0`、身份文件权限正确、Postgres/Redis/三份合同通过、active lease absent；生产未改变。
- 动态预检真实发现宿主 Node 缺失；旧 runner 在 mutation 前保持阻断。新增当前 Web 容器 stdin/base64 validator 和 network-none/read-only/cap-drop-all lease fallback，Dormant 定向测试由 12/12 增至 13/13并强制走容器路径；完整门禁须重新运行，旧提交 `cda97c1` 与 gate evidence 不得用于生产。
- backtest:formal：未运行，本轮禁止。

### 是否部署

未部署、未连接腾讯云生产、未上传 Bundle、未创建生产 approval/lease、未重启服务、未执行 migration。release target 仅存在独立本地分支，尚待推送；当前生产事实仍以 clean detached `70722ea...` 为执行前预期，必须动态复核。

### 风险与遗留问题

- 本地 PASS 不等于生产 Dormant PASS；当前没有 1800 秒生产观察证据。
- 历史 `a8dd519...`/`78f1e3fa...`/149/156 路径制品和审批全部失效，禁止复用。
- Runtime Identity、Candidate activation、control lifecycle、worker 和数据写入继续阻断。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`，WP-G0.2/G0 未完成。

### 下一轮建议

冻结提交并推送 runner 与精确 release 分支；随后只做当前生产动态只读预检和绑定后的 Web-only Dormant 生产执行。

### 生产 Gate 转换

- runner 修复提交 `cf332e8a7ccee1bea35cabe8c504463fd9cdd68f` 已推送工作分支和 GitHub main；精确 release `cec0b6572bb09ae91ff9e013f8bb160f73c045e2` 已单独推送，禁止把该 release 分支合并进 main。
- `cf332e8...` 上自治总门禁 11/11 PASS、`worktreeUnchanged=true`，其中 Dormant 13/13、autonomy 29/29、deploy safety 5/5、market 960/0/4 explicit skip、Golden 16/16；该证据只绑定转换前 `localPreparation` 状态。
- Microsoft Edge/OrcaTerm 在 `2026-07-13T22:47:34Z` 完成动态只读预检：生产 clean detached `70722ea...`、target `cec0b657...`、Web image `sha256:6d02c759...`、Compose/env/identity 精确匹配、Candidate 完全休眠且 worker absent、schema=`9|0`、health ready/fresh/scanner healthy、Postgres/Redis/三份合同通过、active lease absent。
- 当前包已切换为 `production / productionMutation=true / requiresExplicitApproval=true / ready_for_gate`。这次状态变更使 `cf332e8...` 的旧 gate evidence 失效；必须在新的状态提交上重新运行全部 11 项门禁，再生成绑定同一 commit/tree/gate/policy 的仓库外单次 approval 和可复现 Bundle。
- 当前仍未上传 Bundle、未创建或消费生产 lease、未 fetch/checkout/build/recreate、未开始 1800 秒观察；不得写成生产 PASS。
- 首次正式 Bundle 绑定时发现 fail-closed 身份矛盾：自治控制器要求外部 approval 的 `packageId/scope` 等于当前 active package，但 Dormant request/validator/shell 仍锁定历史 packageId；生产未触碰，首个 `1cf24c7...` gate 与 Bundle 立即作废。当前修复把 request、authorization、contract、Bundle、shell summary 和 lease package identity 统一到 active package，并新增跨控制面回归测试；修复后必须重新提交、跑全门禁并重建 Bundle。

## 2026-07-14 / WP-G0.2 Dormant Runtime 真实观察失败与回滚验收修复

### 本轮目标

保留真实生产失败与自动回滚事实，修复旧 runner 无法指出 observation 具体失败项、回滚后 health 恢复竞态被过早判失败的问题；不放宽目标 1800 秒观察。

### 修改范围

- `candidate-dormant-deploy.sh`：新增分阶段、分检查项错误证据；rollback 静态检查拆分；仅回滚后的 ready/fresh 在原 240 秒上限内等待。
- Dormant 两份测试：新增错误归因和 rollback health 延迟恢复隔离演练。
- Context、traceability、自治状态和本轮报告：记录生产失败、自动回滚与当前真实基线。
- 未修改 scan、analysis、strategy、backtest、frontend、API、DB、Redis、worker、Compose、migration、env、Feature Flag 或 secret。

### 核心链路影响

- 候选筛选 / 复盘进化：加强 Dormant 运行地基的生产失败归因和恢复证明。
- 全市场发现、深扫验证、结构分析、风险赔率、交易计划：业务逻辑未改。

### 测试结果

- Dormant：14/14 PASS；Autonomy：29/29 PASS；Deploy Safety：5/5 PASS。
- typecheck、lint、build、三项安全检查：PASS。
- market：960 pass / 0 fail / 4 explicit skip；worker 23/23；historical 4/4；Golden 16/16。
- formal：未运行，禁止。

### 是否部署

本次生产尝试失败并自动回滚，不能写部署 PASS。目标 Web 通过 3 个 observation 样本后在第 4 个 checkpoint 失败；旧 runner 未精确归因。当前生产已只读证明回到 clean detached `70722ea...` 和旧 Web `sha256:6d02c759...`，health/database/scan/scanner 均正常，Candidate absent。修复代码尚待 clean commit、冻结门禁、新 approval、Bundle 与生产重试。

### 风险与遗留问题

- 旧 runner 的本次具体失败检查项无法事后证明，只能保留 unclassified 真值；不得猜测成 health 或其它门禁。
- `rollbackVerified=false` 是回滚后即时 health 尚未恢复时的真实记录；后续人工健康不改写历史证据。
- WP-G0.2/G0 未完成，Runtime Identity、Activation 和 G1-G8 生产推进继续阻断。

### 下一轮建议

冻结本轮 remediation clean commit，重跑自治总门禁并生成新的单次绑定；然后只重试 Web-only Dormant 1800 秒生产观察。

## 2026-07-15 / WP-G0.2 Dormant Runtime Web-only 生产 PASS

### 本轮目标

用新的精确 request、仓库外单次 approval、lease/fencing 和 session-independent transient unit，重试 Dormant Web-only 发布并完成真实 1800 秒观察；Candidate 必须全程休眠。

### 修改范围

- 生产只切换 clean detached Git target 和 Web image。
- 更新自治状态、traceability、Context、Changelog 和本轮交付报告。
- 未修改或重建数据库、Redis、Worker、Compose、migration、env、Feature Flag、Candidate runtime、scan、analysis、strategy、backtest、frontend 或 API 业务逻辑。

### 核心链路影响

- 候选筛选 / 复盘进化：Dormant 运行地基通过真实生产持续观察。
- 全市场发现 / 深扫验证 / 结构分析 / 风险赔率 / 交易计划：业务逻辑未改。

### 测试结果

- 自治总门禁：11/11 PASS，`worktreeUnchanged=true`；Dormant 14/14、Autonomy 29/29、Deploy Safety 5/5。
- typecheck、lint、build、forbidden-files、secret-patterns、security-check：PASS。
- test:market：960 pass / 0 fail / 4 explicit skip；worker 23/23；historical smoke 4/4。
- backtest:golden：16/16 PASS。
- production：1800 秒、57 样本、continuous ready/fresh；三份合同、Postgres、Redis、目标镜像、clean detached target 和 Candidate absent 独立复核 PASS。
- `backtest:formal`：未运行，继续禁止。

### 是否部署

已通过 Microsoft Edge/OrcaTerm 部署腾讯云 Web-only target `cec0b657...`，Web image=`sha256:cd3652...`。精确 staging 已自动删除，脱敏 evidence 与旧 Web rollback image 保留。数据库、Redis、Worker 和其它服务未变。

### 风险与遗留问题

- 通用 `production-check.sh` 未加载锁定生产身份 wrapper，直接运行时在 `POSTGRES_USER` 插值阶段失败；这是 verifier 兼容性 P1，不是 production health 降级。
- Runtime Identity、Candidate activation、Shadow Capture、reconciliation、canonical cutover、WP-G0.2 和 G0 仍未完成。
- 当前仍是 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只启动 Runtime Identity 独立只读 preflight，并先把 verifier 复用生产 identity wrapper 作为进入任何身份 mutation 前的硬门禁。

## 2026-07-15 / WP-G0.2 Dormant Closeout、Identity-safe Verifier 与 Runtime Identity Current-release Preflight

### 本轮目标

关闭 Dormant 生产 PASS 的 closeout，修复通用生产校验器遗漏锁定身份 wrapper 的 P1，并把 Runtime Identity runner 刷新到当前 clean detached production target。

### 修改范围

- `production-check.sh` 在固定生产根目录强制 root-owned `0700` wrapper、root-owned `0600` override 和双 SHA-256 验证，禁止回退到裸 Compose。
- Runtime Identity request/runner 分开绑定 runner source commit 与 production commit，锁定 `cec0b657...` clean detached target，并绑定 env、Compose、Dormant evidence、wrapper/override 和 8 文件 artifact。
- Web recreate 开始尝试即进入回滚责任；失败后必须复核 env checksum、旧 Web image、Candidate worker absent 和 identity-safe 完整生产合同。
- 更新合同、攻击性测试、自治状态、traceability、Context 和交付报告。
- 未修改 scan、analysis、strategy、backtest、frontend、API、migration、Compose、Candidate 业务实现或 secret；生产未连接、未变更。

### 核心链路影响

加强候选筛选与复盘进化的 Candidate runtime 身份地基；不改变实时排序、结构分析、RR、止损、目标或交易计划。

### 测试结果

- 红灯：deploy safety 5/6；旧 Runtime Identity 合同拒绝 current-release 状态与 clean detached 目标。
- deploy safety 6/6、Runtime Identity runner 10/10、身份事务 14/14：PASS。
- PostgreSQL 16：ledger=9，provision 3 / rollback 3，最终 LOGIN=0；独立权限测试 1/1 PASS。
- typecheck、lint、build：PASS。
- test:market：960 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical smoke 4/4。
- backtest:golden：16/16 PASS。
- autonomy 29/29、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，禁止。

### 是否部署

未部署、未连接腾讯云生产、未创建生产 LOGIN、未写 Candidate URL、未 recreate Web。上一包 Dormant 生产仍保持 `cec0b657...`、1800 秒 57 样本 PASS；Candidate runtime 继续 disabled。

### 风险与遗留问题

- `PASS_LOCAL_RUNTIME_IDENTITY_CURRENT_RELEASE_PREFLIGHT` 不是生产身份 PASS。
- 生产 Runtime Identity 仍是 R2 privileged identity 变更，须 fresh read-only preflight、精确一次性外部授权、自动回滚和观察。
- Candidate activation、Shadow Capture、reconciliation、backfill、canonical cutover、WP-G0.2 与 G0 仍未完成。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

冻结本轮 clean commit 与门禁后，只形成 Runtime Identity fresh production preflight 和精确执行包；不得夹带 Candidate activation。

## 2026-07-15 / WP-G0.2 Runtime Identity 生产执行包

### 本轮目标

把已通过 current-release preflight 的 Runtime Identity runner 收口为可复现脱敏运输、仓库外单次授权、全局 lease/fencing、独立 systemd 执行和数据库/env/Web 三层自动回滚的生产包；本地阶段不连接或改变生产。

### 修改范围

- 新增 production execution JSON/中文合同、Bundle builder、transient systemd entrypoint 和攻击/边界测试。
- Runtime Identity approval 新增精确 Web image 与 rollback ref 绑定；staged request 使用 canonical checksum 二次校验。
- production runner 新增 mutation 前 health/Candidate/schema/identity 动态预检、授权消费、逐阶段 fencing checkpoint 和回滚 lease closeout。
- credentials 与 role-admin URL 不进入 Bundle，由 detached worker 在仓库外 0700 临时目录内生成，文件 0600，退出后精确删除。
- 完整环境回滚备份只允许暂存在本包 0700 ops 根；脱敏 provision/lease 证据写入独立证据目录，worker 退出时精确删除 ops 根，避免生产 secret 副本残留。
- 生产宿主机无 Node 时，entrypoint、validator、env renderer 和 lease CLI 均使用当前已批准 Web 镜像的隔离 Node 运行时；Web 使用完整容器 ID 二次比对，Postgres 通过 Compose 标签唯一发现。
- 未修改 scan、analysis、strategy、backtest、frontend、业务 API、migration、Compose、Redis、worker、Feature Flag、Candidate activation 或 secret。

### 核心链路影响

加强候选筛选与复盘进化的最小权限运行地基；不改变全市场扫描排序、结构分析、RR、止损、目标或交易计划。

### 测试结果

- Production Packet 9/9、Runtime Identity Runner 11/11、Identity 14/14、Deploy Safety 6/6：PASS。
- 隔离 PostgreSQL 16：migration 9、provision 3、rollback 3、最终 LOGIN=0，productionConnected=false。
- typecheck、lint、build：PASS。
- test:market：960 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical smoke 4/4。
- backtest:golden：16/16 PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- backtest:formal：未运行，禁止。

### 是否部署

未部署、未连接腾讯云生产、未创建生产 LOGIN、未写 Candidate URL、未 recreate Web。当前生产仍是 Dormant target `cec0b657...`、Web image `sha256:cd3652...`、Candidate disabled/worker absent。

### 风险与遗留问题

- `PASS_LOCAL_RUNTIME_IDENTITY_PRODUCTION_PACKET` 不是生产身份 PASS。
- 生产动态事实、最终 clean commit/tree、Bundle hash、环境指纹和外部一次性 authorization 尚未冻结。
- Runtime Identity 生产成功后仍需只读身份复核和统一观察；Candidate activation 继续禁止。
- WP-G0.2/G0 未完成，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

冻结并推送本包后，刷新 Microsoft Edge/OrcaTerm 生产只读事实，只执行精确 Runtime Identity production transaction；不得夹带 Candidate activation。

## 2026-07-15 / WP-G0.2 Runtime Identity 生产预检真值与 Verifier 兼容修复

### 本轮目标

在任何生产身份 mutation 前，用真实 Dormant 脱敏摘要和当前生产只读事实校验执行包，修复 verifier 通过 identity wrapper 调用 Compose 时遗漏锁定 env-file 的兼容缺口。

### 修改范围

- `candidate-runtime-identity/runner.mjs`：新增真实 Dormant evidence 的 19 字段、时效、观察、休眠、回滚和 mutation 边界校验。
- `production-runner.sh`：删除错误的 inline 字段假设，统一调用受测试的 `dormant-evidence` 子命令。
- `production-check.sh`：通过 root-owned wrapper 显式传入固定 `.env` 与 `.env.production`，不 source、不输出 secret。
- 同步生产合同、runner preparation、治理校验器和三份攻击/边界测试。
- 未修改 scan、analysis、strategy、backtest、frontend、业务 API、migration、Compose、Redis、worker、Feature Flag、Candidate activation 或 secret。

### 核心链路影响

加强候选筛选与深扫验证的运行身份地基；不改变全市场排序、结构判断、RR、止损、目标或交易计划。

### 测试结果

- Runtime Identity Runner：12/12 PASS；Production Packet：9/9 PASS。
- Runtime Identity：14/14 PASS；Deploy Safety：6/6 PASS。
- PostgreSQL 16：migration 9、provision 3、rollback 3、最终 LOGIN=0、productionConnected=false。
- 两个治理 validator：PASS，无 violation。
- typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip。
- Golden 16/16、worker 23/23、historical 隔离测试 4/4 和三项安全门禁：PASS。
- 额外联网 `backtest:historical`：本机到 Binance 与 Bybit 443 均超时，标记 `等待外部条件`；未将外部网络失败写成引擎 PASS，也未影响固定基础门禁。
- formal：未运行，禁止。

### 是否部署

未部署、未创建 LOGIN、未写 Candidate URL、未 recreate Web。Microsoft Edge/OrcaTerm 仅执行只读 wrapper compatibility proof，确认绑定两份 env-file 后可解析现有 11 个 Compose 服务；当前生产仍为 `cec0b657...`、Web `sha256:cd3652...`、Candidate disabled/worker absent。

### 风险与遗留问题

- commit=`1ba960f...` 的旧 Bundle 与旧 artifact 已作废，禁止进入生产。
- 当前只证明预检修法兼容，不等于 Runtime Identity 已在生产执行。
- clean commit、最终可复现 Bundle 与外部一次性授权仍待冻结。
- WP-G0.2/G0 未完成，系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完成固定门禁和 clean commit 后，重建绑定新 commit/tree/artifact 的脱敏 Bundle；只执行 Runtime Identity 身份事务，不得夹带 Candidate activation。

## 2026-07-15 / WP-G0.2 Runtime Identity runner 全链 env-file 收口

### 本轮目标

在上传和生产 mutation 前，关闭 production runner 自身通过 identity wrapper 调用 Compose 时遗漏基础/生产 env-file 的最后一处兼容缺口。

### 修改范围

- `production-runner.sh`：`COMPOSE` 数组统一绑定固定 `.env` 与 `.env.production`，后续 `config/ps/up/exec` 自动继承。
- 隔离 execute rehearsal：要求 runner 自身的 `config/ps/up` 和 verifier 的 `exec` 均携带两份 env-file。
- Runtime Identity 治理 validator：把 env-file 绑定提升为 artifact guard。
- 刷新 8 文件 runner 与 11 文件 production packet artifact。
- 未修改 scan、analysis、strategy、backtest、frontend、业务 API、migration、数据库 schema、Redis、worker、Feature Flag、Candidate activation 或 secret。

### 核心链路影响

只加强候选筛选与深扫验证的运行身份地基，不改变实时排序、结构分析、RR、止损、目标或交易计划。

### 测试结果

- 红灯基线：Runner 10/12，治理 validator 与生产 wrapper 调用断言按预期失败；回滚测试继续通过。
- 修复后 Runner 12/12、Packet 9/9、Deploy Safety 6/6：PASS。
- runner validator artifact=`b2826b9...`、packet validator artifact=`b8ae75b7...`，均无 violation。
- typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip。
- Identity 14/14、PG16 provision/rollback、worker 23/23、historical 4/4、Golden 16/16、三项安全门禁：PASS。
- 自治总门禁：待 clean commit 后重新冻结；formal 未运行，禁止。
- formal：未运行，禁止。

### 是否部署

未部署、未上传、未创建 LOGIN、未写 Candidate URL、未 recreate Web。`164540d/c7710aad/57716b98` 旧 commit Bundle/request 已作废并精确删除；生产仍保持 `cec0b657...`、Web healthy、Candidate disabled/worker absent。

### 风险与遗留问题

- 当前修复改变 runner artifact，旧 gate evidence 与所有旧 Bundle/request 不得复用。
- 必须重跑固定门禁、clean commit、自治总门禁和可复现 Bundle，再刷新一次性 90 分钟 request。
- Runtime Identity、Candidate activation、WP-G0.2 和 G0 仍未完成。

### 下一轮建议

冻结当前 env-file 收口修复并重建唯一新 Bundle；只执行 Runtime Identity，不夹带 Candidate activation。

## 2026-07-15 / WP-G0.2 Runtime Identity 生产管理凭据来源收口

### 本轮目标

关闭生产入口错误使用 Postgres 容器初始化密码、导致当前管理身份网络认证 `28P01` 的 P1；保持任何生产 mutation 前 fail closed。

### 修改范围

- `runner.mjs` 新增严格、可测试的 secure input preparation：只接受 root-only 管理 env 的精确两键、容器用户名和数据库名，生成 3 套临时 Candidate 凭据及 role-admin URL。
- `production-entrypoint.sh` 显式绑定既有 identity-remediation `postgres-admin.env`，验证 root-owned `0600` 普通文件、大小和固定路径；禁止读取容器 `POSTGRES_PASSWORD`。
- runtime request、runner/packet 合同、治理 validator 和 authorization production-identity hash 同步绑定管理凭据路径。
- 新增函数、真实 CLI、旧容器来源拒绝、权限、请求漂移、隔离执行与回滚测试。
- 未修改 scan、analysis、strategy、backtest、frontend、业务 API、schema、Redis、worker、Feature Flag、Candidate activation 或真实 secret。

### 核心链路影响

加强候选筛选与深扫验证在 Shadow 启动前的最小权限数据库身份地基；不改变实时排序、结构分析、RR、止损、目标或交易计划。

### 测试结果

- 红灯：production packet artifact drift；旧 execute rehearsal request 缺少新字段；真实 CLI 暴露 Node 24 `readFile(0)` 不兼容。三项均保持 fail closed。
- 修复后 Runner 14/14、Packet 11/11、Identity 14/14、Deploy Safety 6/6：PASS。
- PostgreSQL 16：migration 9、provision 3、rollback 3、productionConnected=false：PASS。
- typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip。
- workers 23/23、historical 4/4、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- runner artifact=`22248fbc...`；production packet artifact=`8d5f6afd...`；两个 validator 无 violation。
- `backtest:formal`：未运行，按合同禁止。

### 是否部署

本轮尚未重试生产。上一份 `d934f7a...` 执行在 mutation 前因 `28P01` 安全停止，lease=`SAFE_STOP_PRE_MUTATION`，回滚验证通过；生产角色、Candidate URL、Web 和其它服务均未改变。

### 风险与遗留问题

- 本地 PASS 不等于生产管理凭据可用；仍须在新 clean commit、自治 gate evidence、新 Bundle 和新单次 request 下做只读文件事实复核与精确生产重试。
- Runtime Identity、Candidate activation、WP-G0.2 和 G0 仍未完成。
- 当前系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

冻结本轮 clean commit 和自治总门禁，只重试 Runtime Identity；成功后立即做只读身份验收，观察进入并行只读车道，不夹带 Candidate activation。

## 2026-07-15 / WP-G0.2 Runtime Identity 生产容器 pg 解析修复

### 本轮目标

关闭 staged Runtime Identity runner 从 `/src` 运行时无法解析 Web 镜像 `/app/node_modules/pg` 的生产形态缺口，保持数据库 mutation 前 fail closed。

### 修改范围

- `runner.mjs`：增加批准应用根目录的 CommonJS `pg` 解析回退，解析失败返回明确 `approved_pg_runtime_unavailable`。
- `production-runner.sh`：preflight、provision、rollback 三条数据库容器命令显式绑定 `MARKET_RADAR_APPLICATION_ROOT=/app`。
- `runner.test.mjs`、`production-entrypoint.test.mjs`：新增 packet 位于 `/app` 外的解析回归和三路径绑定断言。
- 两份 Runtime Identity 机器合同刷新 artifact hash。
- 未修改 scan、analysis、strategy、backtest、frontend、业务 API、schema、Redis、worker、Feature Flag、Candidate activation 或 secret。

### 核心链路影响

只加强候选筛选和深扫验证的生产身份地基；不改变全市场排序、结构分析、RR、止损、目标或交易计划。

### 测试结果

- 红灯：真实生产形态只读复现返回 `ERR_MODULE_NOT_FOUND`；新增本地回归初始 2 项失败。
- 修复后 Runner 15/15、Production Packet 11/11、Runtime Identity 14/14、Deploy Safety 6/6：PASS。
- PostgreSQL 16：migration 9、provision 3、rollback 3、最终 productionConnected=false：PASS。
- typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip。
- workers 23/23、historical 4/4、golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- runner artifact=`4e213d3f2a22465e7e56d8fec7c408057017693d091c12aab0d1d00573892235`；production packet artifact=`127c308a8659ccc6a8d187278abdb83c5616ba19f8122687368772b9090db619`。
- formal：未运行，按合同禁止。

### 是否部署

本轮尚未重试生产 mutation。上一份 `ef9d844...` 请求只读认证通过，但 staged runner 在数据库 preflight 因 `ERR_MODULE_NOT_FOUND` 安全停止；lease fencing token 5 以 `SAFE_STOP_PRE_MUTATION` 释放。生产 LOGIN、Candidate URL、env、Web 和其它服务均未改变。

### 风险与遗留问题

- 本地修复 PASS 不等于生产 Runtime Identity PASS；旧 Bundle/request 已失效，不得复用。
- 必须先 clean commit、重新冻结自治 gate evidence、生成可复现 Bundle 和新的单次请求。
- Runtime Identity、Candidate activation、WP-G0.2 和 G0 仍未完成。

### 下一轮建议

只重试 Runtime Identity 生产身份事务；即时验收通过后把持续观察放入只读并行车道，不夹带 Candidate activation。

## 2026-07-16 / WP-G0.2 Activation/Observation current-main production-safety refresh

### 本轮目标

把历史 Activation/Observation runner 移植到当前 main，并补齐 session-independent systemd、外部 lease/fencing、clean detached Git、精确旧 Web 镜像 retention、24 小时 revocation 感知观察和自动回滚；不激活生产 Candidate runtime。

### 修改范围

- 修改 `scripts/production/candidate-activation/**`、Activation 治理合同/validator/测试、外部 lease observation 语义、PG16 rehearsal、package scripts、自治状态、traceability、Context 和本轮报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、backtest 逻辑、frontend、业务 API、Compose、migration、Candidate 业务实现、数据库、Redis、生产 env、Feature Flag 或 secret。

### 核心链路影响

支撑候选筛选和复盘进化的 Candidate Episode Shadow Capture 地基；不改变全市场发现、深扫验证、结构分析、风险赔率或交易计划。

### 测试结果

- Activation validator PASS；定向 17/17；Autonomy/lease 31/31。
- 隔离 PostgreSQL 16：migration 9、control start 1、rollback 1、final legacy/epoch 2/write_frozen=true、productionConnected=false。
- typecheck、lint、build PASS。
- test:market 960 pass / 0 fail / 4 explicit DB skip；workers 23/23；historical smoke 4/4。
- backtest:golden 16/16；forbidden-files、secret-patterns、security-check PASS。
- formal 未运行。

### 是否部署

未部署。Runtime Identity 仍未生产 PASS；旧 90 分钟 request 已过期且 Edge / OrcaTerm 需要重新登录，生产未变。Activation 生产继续禁止。

### 风险与遗留问题

- P0：无新增。
- P1：Runtime Identity 必须用 fresh dynamic facts 和唯一新 exact request 先完成生产身份事务。
- P1：Activation 仍需 future code-activation release、新 artifact/request 和真实 24 小时观察，当前只可写本地准备 PASS。

### 下一轮建议

只恢复 Edge / OrcaTerm 登录并执行 Runtime Identity exact production package；Activation 继续关闭。

## 2026-07-16 / WP-G0.2 Runtime Identity stale Dormant evidence renewal remediation

### 本轮目标

如实处理 Runtime Identity 真实生产重入时发现的 Dormant evidence 超过 24 小时问题：不放宽 freshness，不复用旧 PASS，先增加新的 1800 秒只读续证，再允许原身份事务。

### 修改范围

- 修改 Runtime Identity runner、生产入口、Bundle builder、治理合同与定向测试，使 stale-only 路径执行 1800 秒、至少 57 样本的只读观察并生成重新校验的脱敏摘要。
- 更新自治状态、traceability、Context、Changelog 和本轮报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、backtest、frontend、业务 API、migration、业务数据、Redis、worker、Feature Flag 或 Candidate activation。

### 核心链路影响

只加强候选筛选和复盘进化的生产身份地基；不改变全市场发现排序、深扫、结构分析、风险赔率或交易计划。

### 测试结果

- Runtime Identity Runner 16/16、Production Packet 11/11、Identity 14/14、Deploy Safety 6/6：PASS。
- typecheck、lint、build：PASS。
- test:market 960 pass / 0 fail / 4 explicit DB skip；workers 23/23；historical 4/4。
- backtest:golden 16/16；forbidden-files、secret-patterns、security-check：PASS。
- runner artifact=`a57522dc...`；production packet artifact=`f7dccab3...`。
- formal 未运行，按合同禁止。

### 是否部署

旧 commit `e28691a...` 的最新真实生产 unit 在任何 LOGIN、权限、env 或 Web mutation 前以 `SAFE_STOP_PRE_MUTATION_DORMANT_EVIDENCE_NOT_FRESH` 停止。只读复核证明生产仍为 clean detached `cec0b657...`、Web healthy/0 restart、Candidate URL/runtime LOGIN/worker=`0/0/0`、schema ledger/control=`9|0`、writer archive SELECT/INSERT=`false/false`、Redis PONG、4 个生产 API HTTP 200；staging/secure/ops 均已删除。remediation commit `2d79bef...` 已推送 GitHub main，尚未用新 Bundle/request 重试生产。

### 风险与遗留问题

- 本地 remediation PASS 不等于 Runtime Identity 生产 PASS。
- 新生产事务前仍须冻结控制面 clean commit、运行自治总门禁并生成唯一 Bundle 和 fresh 90 分钟 request。
- 1800 秒续证任一样本失败必须停止；不得缩短观察、放宽 freshness 或复用旧摘要。
- Candidate activation、WP-G0.2 和 G0 仍未完成；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只执行绑定新 clean commit 的 Runtime Identity 1800 秒只读续证和身份事务；Activation 继续关闭。

## 2026-07-16 / WP-G0.2 Runtime Identity 续证采样漂移修复

### 本轮目标

如实修复生产续证在 1800 秒内只完成 51/57 个样本的问题，不缩短观察、不降低样本数、不放宽 ready/fresh 或 Candidate dormant 门禁。

### 修改范围

- `production-runner.sh` 改为从观察起点计算绝对采样时间，检查耗时不再叠加到下一轮固定 sleep。
- 增加样本间隔和调度滞后硬失败，无法守住采样合同就继续 fail closed。
- 更新 Runtime Identity 定向回归、两份治理 artifact、自治状态、traceability、Context 和本轮报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、backtest、frontend、业务 API、migration、业务数据、Redis、worker、Feature Flag 或 Candidate activation。

### 核心链路影响

只加强候选筛选和复盘进化的生产身份地基；不改变全市场发现、深扫、结构分析、风险赔率或交易计划。

### 测试结果

- Runtime Identity Runner 16/16：PASS。
- Production Packet 11/11：PASS。
- Runtime Identity transaction 14/14、Deploy Safety 6/6、Autonomy 31/31：PASS。
- 隔离 PostgreSQL 16：migration 9、provision 3、rollback 3、最终 productionConnected=false：PASS。
- typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip。
- workers 23/23、historical smoke 4/4、backtest:golden 16/16：PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。
- 一次直接执行编译后 `radar-snapshot.test.js` 的辅助命令没有继承 `npm_lifecycle_event=test:market`，因而读到 `.next/cache` 开发快照并出现 4 个旧 no-refresh 断言失败；新增的 archive 单写回归当次已通过。随后使用规定的 `npm run test:market` 完整重跑为 965 pass / 0 fail / 4 explicit DB skip。该错误调用不计作 PASS 证据。

### 是否部署

真实生产续证重试已执行但失败：只完成 51/57 个样本，随后自动回滚并验证生产基线恢复；没有创建 Runtime LOGIN，没有改权限、env 或 Web。旧 Bundle/request 已失效，当前修复尚未重新部署。

### 风险与遗留问题

- P0：无新增；回滚已验证。
- P1：完整门禁、clean commit、自治 gate evidence 和全新 Bundle/request 尚未冻结。
- P1：Runtime Identity、Candidate activation、WP-G0.2 和 G0 仍未完成。

### 下一轮建议

只完成当前修复的完整门禁与精确生产重试；Runtime Identity 未获得最终 PASS 前继续禁止 Candidate activation。

## 2026-07-16 / WP-G0.2 Runtime Identity 续证摘要安全桥接修复

### 本轮目标

修复生产已完成 1800 秒、61 样本续证后，隔离 validator 因未挂载仓库外 evidence 目录而无法读取新摘要的问题；不绕过 validator，不重复消耗已真实完成的观察窗口。

### 修改范围

- Runtime Identity runner 将新摘要复制为 `SECURE_ROOT` 内 `0600` 临时桥接文件，由 network-none/read-only/cap-drop-all Node 校验后删除。
- Production Packet 只新增对精确 Runtime Identity `dormant-evidence-refreshed.json` 路径的接受；任意其它路径仍 fail closed。
- 机器合同同时绑定旧 summary lineage 与新 61 样本 summary SHA，并刷新 runner/packet artifact。
- 更新自治状态、traceability、Context、两份人工合同和本轮报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、backtest、frontend、业务 API、migration、业务数据、Redis、worker、Feature Flag 或 Candidate activation。

### 核心链路影响

只加强候选筛选和复盘进化的生产身份地基；Candidate 仍 dormant，不生成候选信号或交易计划。

### 测试结果

- 红灯：安全桥接缺失、精确续证路径未被合同接受，共 2 项按预期失败；修复后均 PASS。
- Runtime Identity Runner 16/16、Production Packet 12/12、Identity transaction 14/14、Deploy Safety 6/6、Autonomy 31/31：PASS。
- 隔离 PostgreSQL 16：migration 9、provision 3、rollback 3、productionConnected=false：PASS。
- typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip。
- workers 23/23、historical smoke 4/4、backtest:golden 16/16：PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- runner artifact=`3d58b9ed...`；production packet artifact=`60608ae6...`。
- formal：未运行，按合同禁止。

### 是否部署

前一生产 unit 完成 1800 秒、61 样本续证后在身份 mutation 前安全停止；未创建 LOGIN，未改权限、env 或 Web，回滚合同验证通过。当前最小修复尚未形成 clean commit 或重试生产；旧 Bundle/request 已失效。

### 风险与遗留问题

- P0：无新增；生产基线已验证恢复。
- P1：仍须 clean commit、提交后自治 gate evidence、新 Bundle/request 和 Runtime Identity 精确生产重试。
- P1：Runtime Identity、Candidate activation、WP-G0.2 和 G0 仍未完成；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只冻结本修复并重试 Runtime Identity；成功后立即执行独立只读身份验收，Activation 继续关闭。

## 2026-07-16 / WP-G0.2 Runtime Identity Node 22 模块格式修复

### 本轮目标

如实修复生产 Web 身份探针被 Node 22 拒绝的问题；不放宽身份、权限、health、Dormant 或回滚门禁。

### 修改范围

- 仅把 `production-runner.sh` 中精确 Web 身份探针封装为 CommonJS 可解析的 async IIFE，并新增从真实 heredoc 提取后执行 `node --check` 的回归测试。
- 更新两份 Runtime Identity 机器/人工合同、自治状态、traceability、Context 和本轮报告。
- 未修改 migration、业务数据、Redis、worker、Feature Flag、Candidate activation、scan、analysis、strategy、RR、Risk Gate、backtest、frontend 或业务 API。

### 核心链路影响

只修复候选筛选与复盘进化的生产身份地基，不改变全市场发现、深扫验证、结构分析、风险赔率或交易计划。

### 测试结果

- Runtime Identity Runner 16/16、Production Packet 13/13、Identity transaction 14/14、Deploy Safety 6/6、Autonomy 31/31：PASS。
- 隔离 PostgreSQL 16 provision/rollback：PASS，`productionConnected=false`。
- typecheck、lint、build：PASS；market 960 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical 4/4；Golden 16/16。
- forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

上一事务绑定 source `f83d83e...`，在完成 provision/env/Web recreate 后因 `ERR_AMBIGUOUS_MODULE_SYNTAX` 失败；自动回滚和独立复核均 PASS，生产未保留 LOGIN、权限、env 或 Web mutation，lease 与临时目录已清理。当前本地修复尚未提交、推送或重试生产。

### 风险与遗留问题

- P0：无已知未收口污染；生产已恢复旧基线。
- P1：clean commit、提交后 gate evidence、新 Bundle/request 和生产重试尚未完成。
- P1：Runtime Identity、Activation、WP-G0.2 和 G0 仍未完成。

### 下一轮建议

只冻结当前 Node 22 修复并重试 Runtime Identity；最终 PASS 前继续禁止 Candidate activation。

## 2026-07-16 / WP-G0.2 Runtime Identity Web 就绪竞态修复

### 本轮目标

修复生产 Web no-build recreate 后在服务尚未监听时执行身份探针导致的 `ECONNREFUSED`，不放宽身份、权限、Dormant、health 或回滚门禁。

### 修改范围

- Runtime Identity runner 增加最长 240 秒的 Web readiness 等待；容器必须 `running|healthy`，且容器内 `/api/health` 必须为 `ready / database ready / fresh`。
- 正向身份探针与自动回滚复核使用同一 readiness 门禁。
- 新增真实重试回归：第一次 readiness 失败、第二次成功后才继续。
- 更新机器合同、自治状态、traceability、Context 和本轮中文报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、backtest、frontend、业务 API、migration、Redis、worker、Feature Flag 或 Candidate activation。

### 核心链路影响

只加强候选筛选与复盘进化的 Runtime Identity 地基；不改变全市场发现、深扫验证、结构分析、风险赔率或交易计划。

### 测试结果

- Runner 17/17、Packet 13/13、Identity 14/14、Deploy Safety 6/6、Autonomy 31/31：PASS。
- 隔离 PostgreSQL 16：migration 9、provision 3、rollback 3、productionConnected=false：PASS。
- typecheck、lint、build：PASS；test:market 960 pass / 0 fail / 4 explicit DB skip。
- worker 23/23、historical 4/4、Golden 16/16：PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- runner artifact=`0d40fdf0...`；production packet artifact=`5f734339...`。
- formal：未运行，按合同禁止。

### 是否部署

上一生产事务绑定 source `26e82fb...`，在 provision/env/Web recreate 后因 readiness 竞态失败；自动回滚和独立只读复核 PASS，生产没有保留 LOGIN、权限、env 或 Web mutation。当前修复尚未提交和重试生产，两个脱敏上传临时文件仍待精确清理。

### 风险与遗留问题

- P0：无已知未收口生产 mutation；回滚已验证。
- P1：clean commit、提交后自治 gate evidence、新 Bundle/request 和生产重试尚未完成。
- P1：Runtime Identity、Activation、WP-G0.2 和 G0 仍未完成。

### 下一轮建议

只冻结并重试 Runtime Identity；最终 PASS 前继续禁止 Candidate activation。

## 2026-07-16 / WP-G0.2 Runtime Identity 生产通过与 Activation Release 冻结

### 本轮目标

完成 Runtime Identity 最终生产观察；在不降低任何交易、权限、回滚或观察标准的前提下，把 Shadow Capture activation release 迁移到当前 main 基线并形成单提交发布候选。

### 修改范围

- Runtime Identity 生产只读观察器修复了 evidence 路径、角色名、systemd 用户、Docker stdin、PostgreSQL boolean 和 verifier 来源等执行工具问题；这些脚本与结果位于仓库外/ignored evidence，不改变产品代码。
- Activation release 将代码授权常量切为 true，但全部运行时 Feature Flag 默认仍为 false；新增可复现脱敏 Bundle、精确 external request、lease/fencing、session-independent systemd、旧 Web 镜像 retention、自动回滚和 24 小时观察合同。
- 更新 `AUTONOMOUS_ENGINEERING_STATE.json`、traceability、Context、Changelog 和中文交付报告。
- 未修改 scan 排序、analysis、strategy、RR、Risk Gate、交易计划、frontend、migration、数据库业务行、Redis、既有 worker 业务逻辑或 formal 回测。

### 核心链路影响

加强候选筛选与复盘进化的 Candidate Episode Shadow Capture 地基。当前仍不产生新交易计划，不取得 canonical authority，不影响生产排序。

### 测试结果

- Runtime Identity observer：7/7 样本，1851 秒，`Result=success / ExecMainStatus=0`，最终 `PASS_RUNTIME_IDENTITY_AND_PERMISSION`。
- Activation release：24/24 PASS；Composition 29/29 PASS；Shadow governance 8/8 PASS；Autonomy 31/31 PASS。
- PostgreSQL 16 隔离演练：migration 1-9、control start 1、rollback 1、final legacy/epoch 2/writeFrozen true、productionConnected=false：PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：960 pass / 0 fail / 4 explicit DB skip；workers 23/23；historical 4/4。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

Runtime Identity 已在腾讯云生产执行并通过；生产 HEAD 仍为 clean detached `cec0b657...`，Web image 未改变。Activation release 尚未推送 main、尚未生成最终 Bundle/request、尚未生产激活。

### 风险与遗留问题

- P0：无新增生产 P0；Runtime Identity 观察期未发生 DB/Redis/env/其它服务 mutation。
- P1：Activation 生产事务和 24 小时/289 样本观察尚未完成。
- P1：Runtime Identity 上传的两个脱敏运输文件位于仓库外缓存目录，因删除属于独立远端清理动作，本轮未将其伪装为已清理。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`；WP-G0.2/G0 均未完成。

### 下一轮建议

只执行 Activation release 单提交冻结、main 推送、精确脱敏 Bundle/request 和 shadow-only 生产激活，然后进入不可缩短的 24 小时观察。

## 2026-07-16 / WP-G0.2 Activation 私有 Staging 容器 UID 修复

### 本轮目标

修复首次 Shadow Capture activation 在生产 mutation 前因隔离数据库 control 容器无法读取 `0700` staging 挂载而失败的问题，不降低目录权限、容器隔离、交易边界或观察标准。

### 修改范围

- `production-runner.sh` 的 database control 容器改为显式使用 staging 所有者 UID/GID；继续保留 read-only、cap-drop、no-new-privileges 和精确 source/secure 挂载。
- 新增回归，要求 database control runner 同时具备显式 UID/GID 和两项只读挂载。
- 刷新 runner、activation、contract checksum，并纠正 Runtime Identity evidence SHA 首三位的历史人工抄写错误。
- 更新自治状态、traceability、Context、Changelog 和中文交付报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、frontend、migration、业务 DML、Redis、业务 worker 或 formal 回测。

### 核心链路影响

只修复候选筛选与复盘进化的 Shadow Capture 生产执行地基，不改变候选内容、排序、结构判断或交易计划。

### 测试结果

- Activation 25/25：PASS。
- 隔离 PostgreSQL 16：migration 1-9、control start 1、rollback 1、final legacy/epoch 2/writeFrozen true、productionConnected=false：PASS。
- typecheck、lint、test:market 960/0/4 explicit skip、worker 23/23、historical 4/4、build、Golden 16/16 与三项安全门禁：PASS。
- 提交后 commit-bound 自治 gate：待 clean commit 后运行，未拿旧提交证据代替。
- formal：未运行，按合同禁止。

### 是否部署

首次事务绑定 source `d07bfe37...`、Bundle `0aa008b9...`、request `3634e1f5...`，在 lease、Git、DB control、env 和服务 mutation 前失败；生产仍为 clean detached `cec0b657...`，Candidate worker absent，staging/secure/ops 已清理。旧 Bundle/request 已消费且禁止复用。当前 UID 修复尚未提交、推送或重试生产。

### 风险与遗留问题

- P0：无已知未回滚生产 mutation；首次失败发生在 mutation 前。
- P1：必须完成全门禁、clean commit、提交后 gate、新 Bundle/request 和精确重试。
- P1：24 小时/289 样本观察尚未启动，Activation、WP-G0.2、G0 均未完成。

### 下一轮建议

只冻结并重试该 UID 修复；即时验证通过后启动不可缩短的 24 小时观察。

## 2026-07-16 / WP-G0.2 Activation Web 镜像依赖根修复

### 本轮目标

如实修复第二次 Activation 事务在数据库 control preflight 阶段无法从私有 staging 模块路径解析 Web 镜像内 `pg` 运行时的问题；不放宽私有目录、容器隔离、数据库、回滚、观察或交易门禁。

### 修改范围

- 激活 runner 复用既有 Runtime Identity 依赖加载模式，从显式批准的 Web 镜像 `/app` application root 加载 `pg`；找不到时返回稳定 `approved_pg_runtime_unavailable`。
- database control 容器仅增加 `MARKET_RADAR_APPLICATION_ROOT=/app`；继续保留 staging owner UID/GID、read-only、cap-drop ALL、no-new-privileges 和精确 source/secure 挂载。
- 新增 mounted staging 模块路径无法直接解析依赖、但批准 application root 可以解析的回归；刷新 activation runner/release/contract 哈希。
- 更新自治状态、traceability、Context 和中文交付报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、frontend、migration、业务 DML、Redis、业务 worker、Feature Flag 或 formal 回测。

### 核心链路影响

只修复候选筛选与复盘进化的 Shadow Capture 生产执行地基，不改变候选内容、排序、结构判断或交易计划。

### 测试结果

- Activation 26/26：PASS。
- 隔离 PostgreSQL 16：migration 1-9、control start 1、rollback 1、final legacy/epoch 2/writeFrozen true、productionConnected=false：PASS。
- Activation release/runner contract：PASS；runner artifact=`9fd66066...`、activation artifact=`c6518ece...`、contract=`9180e26d...`。
- 固定基础门禁：typecheck、lint、market 960/0/4 explicit skip、workers 23/23、historical 4/4、build、Golden 16/16，全部 PASS。
- Composition 29/29、Shadow governance 8/8、Autonomy 31/31 与三项安全门禁：PASS。
- 首次并行总门禁让两个 `build:market-cli` 竞争 `.tmp/market-tests` 并产生 `MODULE_NOT_FOUND`；改为严格串行后上述结果全部 PASS，未把并发失败包装成代码 PASS。
- 提交后 commit-bound gate：待 clean commit 后运行。
- 第一次 commit-bound 控制器调用在门禁启动前因 active package 与 queue 状态枚举不一致而 fail closed；两者已同步为合同规定的 `ready_for_gate`，详细生产失败事实继续保留在 system truth/traceability。
- formal：未运行，按合同禁止。

### 是否部署

第二次事务绑定 source `abcc34c8...`、Bundle `27b64ac4...`、request `572c4f37...`，在 lease、Git、DB control、env 和服务 mutation 前失败；生产仍为 clean detached `cec0b657...`，`.env.production` 哈希未变，Web/Postgres/Redis healthy，Candidate worker absent，staging/secure/ops 已清理。该 Bundle/request 已消费且禁止复用。当前依赖根修复已形成 clean commit；commit-bound gate、main 推送和生产重试尚未完成。

### 风险与遗留问题

- P0：无已知未回滚生产 mutation；第二次失败仍发生在 mutation 前。
- P1：必须完成固定全门禁、clean commit、提交后 gate、新 Bundle/request 和精确重试。
- P1：24 小时/289 样本观察尚未启动，Activation、WP-G0.2、G0 均未完成。

### 下一轮建议

只冻结并重试当前依赖根修复；即时验证通过后启动不可缩短的 24 小时观察。

## 2026-07-16 / WP-G0.2 Activation 首次观察失败、基线恢复与 P0 收口

### 本轮目标

如实关闭第三次 Shadow Capture 生产激活暴露的核心扫描 HTTP 500、worker 假健康和自动回滚缺陷；在新版本重试前恢复可信 Dormant 基线并完成最小 P0 修复。

### 修改范围

- Candidate mapper 从完整公开合约 identity universe 与当前深扫 instrument 联合解析身份，不再把“未进入本轮深扫批次”误判为 unresolved。
- Shadow Capture source/map 写入失败返回结构化 failed；核心 canonical scan archive 仍持久化，但刷新状态如实标记 failed，不让 Shadow 附属链路吞掉核心数据或伪装成功。
- protected worker 的 idle heartbeat 保留最近一次真实 task error，直到后续真实任务成功，禁止 idle `ok` 覆盖扫描失败。
- observation runner 修复 ERR trap 退出码；production runner 的回滚改为 active-state aware，并使用 staging 绑定 verifier 验证回滚基线。
- Activation Bundle 增加 3 个实际运行时依赖文件，文件数由 16 调整为 19；刷新 artifact 与 contract checksum。
- 更新自治状态、蓝图追踪矩阵、Context、Changelog 和中文交付报告。
- 未修改 scan 排序、analysis、strategy、RR、Risk Gate、交易计划、frontend、migration、业务数据、Redis、Feature Flag 或 formal 回测。

### 核心链路影响

保护全市场发现与候选筛选：附属 Shadow Capture 失败不再破坏 canonical 扫描存档，同时生产健康状态能真实暴露失败；不改变候选排序、结构分析或交易计划。

### 测试结果

- Activation runner/rehearsal：28/28 PASS。
- Composition wiring：32/32 PASS。
- Shadow governance：4/4 + readiness 4/4 PASS。
- Autonomy：31/31 PASS。
- PostgreSQL 16 隔离演练：migration 1-9、control start 1、rollback 1、final legacy/epoch 2/writeFrozen true、productionConnected=false：PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：969 total，965 pass / 0 fail / 4 explicit DB skip；worker 23/23；historical 4/4。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

第三次生产事务绑定 source `a23365f42a4ff465d733d17390651c7c9af1e892`、Bundle `b14681fd8bd309a991d5412bd8b0e1b626ff93b6c1539ba88a9d3e5ce842e569`、request `07bfc56e0df0578df9f2f97e60488a64ff6f5588a8776afbbe2f8c52cf64a1ec`。即时激活通过，但首个观察样本因 scanner-worker degraded 失败；旧 observer 自动回滚链也失败，随后独立紧急恢复验证生产已回到 clean detached `cec0b657...`、旧 Web `sha256:cd3652...`、Candidate worker absent、control legacy/epoch 2/writeFrozen=true、Web/Postgres/Redis healthy、lease=`ROLLBACK_PASS`。旧 Bundle/request 已消费且禁止复用。当前 P0 修复仅在本地，尚未 commit/push/重新部署。

### 风险与遗留问题

- P0：生产 mutation 已恢复，当前无已知残留 Candidate activation；P0 代码修复尚待 clean commit 和 commit-bound gate，不能重试生产前宣称关闭。
- P1：新单次 Bundle/request、Shadow-only 生产重试和不可缩短的 24 小时/289 样本观察尚未完成。
- P1：事故 stage/evidence/ops/secure 目录按证据保留，未伪装为已清理；清理必须独立精确执行。
- Activation、WP-G0.2 和 G0 均未完成；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只冻结当前 P0 修复、运行提交绑定自治总门禁并推送 main；随后生成全新单次 Bundle/request 重试 Shadow-only 激活。

## 2026-07-16 / WP-G0.2 Activation 回滚后生命周期安全重启修复

### 本轮目标

处理第四次真实生产激活在 mutation 前暴露的 `candidate_control_not_empty`：让上一轮已安全回滚的 legacy 控制行可以在严格条件下合法重启，而不是删除控制行、清库或绕过数据库门禁。

### 修改范围

- `runner.mjs` 仅允许 exact `legacy + writeFrozen=true + 正偶数 epoch + Candidate event/outbox/resolution 全空 + 剩余 deadline 足够 24 小时和一个采样间隔` 的控制行，通过既有 `transition_migration_control_v1` 进入下一正奇数 epoch。
- fresh 路径也新增 Candidate 数据全空复核；观察样本不再写死 epoch1，改为 runtime/monitor epoch 必须一致且为正奇数。
- PG16 集成演练覆盖 `fresh epoch1 -> rollback epoch2 -> rearm epoch3 -> rollback epoch4`。
- 治理 validator 的 Activation artifact 文件数由历史错误 16 纠正为真实 19；刷新 runner、activation 和 contract 哈希。
- 未修改 migration、schema、业务 DML、scan 排序、analysis、strategy、RR、Risk Gate、frontend、Redis、业务 worker 或 formal 回测。

### 核心链路影响

只修复候选筛选与复盘进化的 Shadow Capture 生命周期地基；不改变候选内容、结构判断、交易计划或生产排序。

### 测试结果

- Activation：28/28 PASS。
- PostgreSQL 16：control start 2、rollback 2、final legacy/epoch4/frozen、productionConnected=false，PASS。
- typecheck、lint、test:market 965/0/4、workers 23/23、historical 4/4、build、Golden 16/16：PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

第四次事务绑定 source `6c615c33749f857797cfa1cfee1f95e7731352cb`、Bundle `84a6457cad76ba6566ba9f767125672b83c8eeb10bc7f44d539ad70202ee52c2`、request `d5d48825f4db23fac5cf796ac160b14a08f05a36d373db8e6fd75d1f9a7df661`。入口合同通过，但 control preflight 在 lease/Git/DB/env/service mutation 前 fail closed。生产仍为 clean detached `cec0b657...`，Candidate worker absent，control legacy/epoch2/frozen，候选 event/outbox/resolution 均为 0；staging/secure/ops 和本轮远端上传临时文件已清理。旧 Bundle/request 禁止复用。当前修复尚未 commit/push/重试。

### 风险与遗留问题

- P0：无已知生产 mutation 残留；第四次失败发生在 mutation 前。
- P1：必须完成 clean commit、commit-bound gate、main 推送和全新单次 Bundle/request。
- P1：24 小时/289 样本观察尚未启动，Activation、WP-G0.2、G0 均未完成。

### 下一轮建议

只冻结并重试 restart-safe lifecycle 修复；即时激活通过后启动不可缩短的 24 小时观察。

## 2026-07-16 / WP-G0.2 Reconciliation 并行本地准备与生产观察真值同步

### 本轮目标

在 Candidate Activation 24 小时生产观察独立运行期间，提前完成下一 Gate 的只读 10,000 条逐笔投影对账工具，不缩短观察、不连接生产、不自动推进 phase。

### 修改范围

- 从历史未进入 main 的准备分支恢复 reconciliation 人机合同、治理 validator、只读 runner、纯函数测试和 PostgreSQL 16 演练，并按当前生产事实重新审计。
- 将历史写死的 authority epoch 1 改为正奇数策略；请求、数据库控制行和可用的观察内嵌身份必须精确一致，覆盖当前生产 epoch 3。
- 当前 Activation v1 最终结果未内嵌 release/epoch 时，显式采用“证据 SHA-256 + 新精确审批 + 数据库控制行”绑定并在结果标记，不伪造内嵌身份。
- 修复 PG16 演练夹具的固定旧日期污染；样本改为相对本次动态 control window 生成，生产 runner 的窗口门禁未放宽。
- 更新自治状态为生产观察 WIP=1、本地准备 WIP=1，并同步 Context 与中文交付报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、backtest、frontend、业务 API、migration、Compose、Feature Flag、生产 DB/Redis/worker/env 或 secret。

### 核心链路影响

加强候选筛选和复盘进化的 Candidate 投影真值；不改变全市场发现、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Reconciliation validator/dry-run 与纯函数/治理 9/9：PASS。
- PostgreSQL 16：migration 1-9、10,000 compared writes、0 difference、只读事务拒写、phase unchanged、productionConnected=false，PASS。
- Activation PG16：fresh epoch1 -> rollback epoch2 -> rearm epoch3 -> rollback epoch4，PASS。
- Autonomy 31/31、typecheck、lint：PASS。
- market 965 pass / 0 fail / 4 explicit DB skip；workers 23/23；historical 4/4，PASS。
- build、Golden 16/16：PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- 自治总门禁：13/13 PASS，`worktreeUnchanged=true`。
- formal：未运行，按合同禁止。

### 是否部署

本地 Reconciliation 准备未部署、未连接生产。此前绑定 `e5eb900...` 的 Candidate Activation 生产 observer 继续独立运行；截至 `2026-07-16 22:59 +08:00` 为 active、31/289 样本。该状态不是最终 PASS。生产上传的两份 e5 脱敏运输文件仍待独立精确清理。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：Activation 仍须完成真实 24 小时/至少 289 样本并输出 checksum-bound `PASS_ACTIVATE_AND_OBSERVE`。
- P1：生产 reconciliation 尚未执行；本地 10,000 条演练不能代替生产数据对账。
- P1：canonical compat/read cutover、安全收口和 G0 Exit Audit 均未完成。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

保持 production HEAD 和 Candidate identity 冻结直至观察完成；并行完成 reconciliation clean commit 与后续 canonical compat 只读设计，生产动作必须等待最终观察证据。

## 2026-07-17 / WP-G0.2 Canonical Compat Local Superpackage

### 本轮目标

在生产 Activation 观察不被打断的前提下，本地一次收口 Candidate 正式读链兼容地基与 Review 缺失值真值，为观察 PASS 后的生产 reconciliation 和 canonical read cutover 提前消除代码等待。

### 修改范围

- 新增 Canonical Read Model、独立 Raw Oracle、API Resource、纯 Route Adapter、Trusted Context、Legacy diagnostic 及对应测试。
- 修复 Review 缺失 direction 被当作 long、缺失 MFE/MAE 被补 0、非终态被包装成 timeout 的误导风险。
- 新增七份人机治理合同、三套隔离 PostgreSQL 16 演练和超级包定向门禁。
- 更新自治状态与项目上下文；未修改现有 `src/app/api` 路由、migration、scan、analysis、strategy、backtest 或生产配置。

### 核心链路影响

加强候选筛选与复盘进化的读真值和分母真值；不改变全市场发现、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- 当前定向域/治理测试：99 pass / 0 fail / 3 explicit PG skip（102 项总计，未把 skip 冒充 pass）。
- 三套隔离 PostgreSQL 16 演练：PASS，`productionConnected=false`。
- 六份合同 validator 与超级包集成：PASS。
- Autonomy 31/31、typecheck、lint：PASS。
- test:market 1008 pass / 0 fail / 7 explicit DB skip；workers 23/23；historical 4/4：PASS。
- build、backtest:golden 16/16、三项安全门禁：PASS。
- 自治提交总门禁：PASS，18/18，`worktreeUnchanged=true`；文档证据对账后按合同再执行一次最终绑定门禁。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未连接生产、未接现有 API、未取得 canonical authority。生产 observer 继续独立运行。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：生产 Activation 尚未完成 24 小时/至少 289 样本。
- P1：生产 10,000 条 reconciliation 尚未执行。
- P1：当前常量仍为 `CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED=false`，这是正确的 fail-closed 状态。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完成本地超级包全部提交门禁并冻结工作分支；生产端继续等待 Activation 最终证据，随后只执行精确绑定的只读 reconciliation。

## 2026-07-17 / WP-G0.3-G0.5 Security Release Incident Local Superpackage

### 本轮目标

在 Candidate 生产观察继续运行期间，本地一次收口 G0.3 HTTPS/private session、G0.4 release/evidence 单一正本和 G0.5 known-incident 机器回归，提前消除观察完成后的代码等待。

### 修改范围

- Session 增加强配置校验、前一 secret 轮换、严格 v1 token claims、同源 mutation、no-store、rate-limit fail-closed 与脱敏安全事件。
- 把 session password/secret 从共享 `x-app-env` 移到 Web 专属 environment，Worker 不再继承。
- Caddy 增加 CSP、Permissions-Policy、HSTS 分阶段控制和 Server header 移除；保留 `:80/HSTS=0` 当前真值。
- 新增 7 天 HTTPS/private-session evidence Gate、统一 release record schema/validator 和十类已知事故机器注册表。
- 将四项 G0 本地控制接入手动 production workflow 的质量门禁。
- 未修改 scan、analysis、strategy、RR、Risk Gate、backtest、Candidate authority、migration 或生产环境。

### 核心链路影响

为全市场发现到复盘进化的完整链路提供可信访问、发布身份和事故回归地基；不改变任何交易判断或排序。

### 测试结果

- Auth domain：9/9 PASS。
- HTTPS/session Gate：4/4 PASS，production decision 继续 BLOCKED。
- Release record：3/3 PASS，production record 尚不存在。
- Known incidents：3/3 PASS，10/10 machine-covered。
- G0 总治理：3/3 PASS，`g0Completed=false`。
- Security closeout superpackage：22/22 PASS。
- production evidence：15/15 PASS；migration runner：59/59 PASS；Canonical domain：99 pass / 0 fail / 3 explicit PG skip；deploy safety：6/6 PASS。
- Autonomy 31/31、typecheck、lint：PASS。
- test:market 1017 pass / 0 fail / 7 explicit DB skip；workers 23/23；historical 4/4：PASS。
- build：首轮因并发 Next build 抢占失败，确认无残留进程/锁后独立重跑 PASS；Golden 16/16 与三项安全门禁 PASS。
- 提交前自治总门禁：18/18 PASS，`worktreeUnchanged=true`；报告对账后按合同再次运行最终绑定门禁。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未连接生产、未修改 DNS/TLS/env/secret。生产 observer 继续独立运行，最新只读核验为 active、57/289；最新样本约 `2026-07-17T01:14:26+08:00`，health ready、scan fresh、Postgres/Redis 与 7 workers healthy、Candidate active/epoch3/ready。

### 风险与遗留问题

- P0：无新增未关闭 P0；发现的共享 session secret 暴露已在源码配置中收口，尚未部署。
- P1：当前生产 TLS/private session 未证明，7 天 burn-in 未开始。
- P1：当前 production release record 尚未生成。
- P1：Activation、生产 reconciliation、canonical cutover 仍是安全收口前置。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

执行提交绑定自治总门禁，形成 clean commit 并只推工作分支；生产 observer 到期后严格按 Observation -> Reconciliation -> Canonical -> HTTPS/Session -> Release Record -> G0 Exit 顺序执行。

## 2026-07-17 / WP-G0.2 Reconciliation Production Packet

### 本轮目标

把本地 Candidate 10,000 条只读对账工具收口为可复现、会话独立、一次授权和外部租约约束的生产执行包；当前只做本地准备，不连接或查询生产。

### 修改范围

- Reconciliation runner 强制 `REPEATABLE READ READ ONLY`，并在事务内强制 `candidate_audit_role`。
- 新增脱敏可复现 Bundle、精确生产请求、原始 289 样本重算、transient systemd 入口和 evidence-only runner。
- 新增生产运输漂移、权限、只读、租约、服务无 mutation 和 secret 不回显测试。
- 将 validator 与 packet tests 接入 production workflow 质量门禁。
- 更新自治状态、Context 和中文交付报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、frontend、API route、migration、Compose、env、Feature Flag、Redis、业务 Worker 或生产服务。

### 核心链路影响

加强候选筛选与复盘进化的 Candidate 投影真值；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Production packet 9/9、Reconciliation runner/governance 12/12、Autonomy 31/31：PASS。
- 提交前自治总门禁：13/13 PASS，`worktreeUnchanged=true`。
- PostgreSQL 16：10,000 compared writes、0 differences、事务只读、`candidate_audit_role`、phase unchanged、`productionConnected=false`：PASS。
- typecheck、干净 lint：PASS。
- market 1017 pass / 0 fail / 7 explicit DB skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未连接生产、未查询生产数据库。最近只读 observer 证据为 active、61/289；Activation 最终 PASS 尚未产生，因此生产 request 和 Reconciliation 执行继续禁止。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：Activation 必须精确完成 289 样本且至少 24 小时，并从原始样本重算取得最终 PASS。
- P1：本地 10,000 条零差异不能代替生产对账。
- P1：Canonical Cutover、HTTPS/private session、release record 和 G0 Exit 仍未完成。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只冻结并推送当前本地包；observer 最终 PASS 后生成绑定该证据的新请求，并执行一次生产只读 10,000 条对账。

## 2026-07-17 / WP-G0.2 Shadow Verify Runtime Wiring Local Superpackage

### 本轮目标

在不打断 Candidate `shadow_capture` 生产观察的前提下，把本地已验证的 Canonical Read Model、独立 Raw Oracle、Trusted Context 和 Route Adapter 接成真实只读 API，并继续锁死生产权威切换。

### 修改范围

- 新增 `/api/frontend/candidate-lifecycle` GET 路由和服务端 Composition；公开请求只能控制 limit 与完整 cursor pair。
- Monitor DB、可信 manifest 或依赖缺失时统一 fail closed 为 503，不返回空 Candidate 或 stale fallback。
- AbortSignal 传入 Canonical Model 与 Raw Oracle 的 PostgreSQL transaction；数据库 statement timeout 收紧为 12 秒，严格小于 HTTP data deadline 15 秒。
- 增加本包机器合同、治理回归、CI 质量门禁和运行时 Composition 测试。
- 未修改现有 Review API/页面、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、migration、Compose、env、Redis、Worker 或生产服务。

### 核心链路影响

加强候选筛选与复盘进化的 Candidate 生命周期读真值；不改变全市场发现、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Runtime wiring validator：PASS；接线测试 32/32 PASS。
- Canonical domain：103 pass / 0 fail / 3 explicit PG skip；跳过项未冒充通过。
- 三项独立 PostgreSQL 16 演练：Canonical read、同快照 Raw Oracle、Trusted Context/audit role 全部实际 PASS，`productionConnected=false`。
- typecheck、干净 lint：PASS。
- market 1021 pass / 0 fail / 7 explicit DB skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16：PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- Autonomy unit 31/31：PASS；提交前自治总门禁 15/15 PASS，`worktreeUnchanged=true / canAutoCommit=true / canAutoDeploy=false`；更新最终上下文后再执行一次绑定门禁。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未连接生产、未查询生产数据库、未修改 Candidate authority。最近只读 observer 证据为 active、70/289；该状态仍不是 Activation PASS。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：编译期 `CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED=false`，这是当前正确的 fail-closed 状态；Shadow Verify 生产执行仍受 Activation 和 Reconciliation 两个前置 Gate 阻断。
- P1：当前 API 只有本地 build 证明，生产 manifest、Compose mount、phase transition 和 dual-read observer 尚未建立。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

本包 clean commit/push 后，只准备 `WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION`；任何生产执行必须继续等待 Activation 289 样本/24 小时最终 PASS 和生产 10,000 条零差异 Reconciliation PASS。

## 2026-07-17 / WP-G0.2 Validation Cycle Continuation Local Superpackage

### 本轮目标

解决生产真实吞吐与单周期 72 小时上限之间的数学冲突，同时不降低 10,000 条、三段 24 小时、窗口分离或任何交易质量门槛。

### 修改范围

- 新增严格的 Candidate validation cycle identity：cycle 1 兼容现有 ID，后续只允许相邻 `cycle-N`。
- Shadow Source/Consumer/Monitor 与 Trusted Read Context 统一使用服务端 `CANDIDATE_RUNTIME_MIGRATION_ID`；显式空值和非法 ID fail closed。
- Shadow 写链在 `shadow_capture / shadow_verify / canonical_compat` 保持受 epoch/release/deadline 围栏，canonical 不允许 Shadow 写。
- 新增原子周期续接 runner：SERIALIZABLE + control table lock，旧 cycle 退 Legacy/frozen 后才创建新 cycle；数据计数变化或多 active cycle 立即回滚。
- 新增机器合同、治理回归、隔离 PostgreSQL 16 演练和 CI 门禁。
- 未修改 migration、扫描、分析、策略、RR、Risk Gate、交易计划、回测、页面、Redis、Worker 实现或生产服务。

### 核心链路影响

为候选筛选和复盘进化提供可完成且不降质的生命周期验证路径；不改变任何市场发现、结构判断、风险赔率或交易计划。

### 测试结果

- Cycle unit/composition：22/22 PASS。
- Governance：2/2 PASS。
- PostgreSQL 16：旧 deadline immutable、Candidate data preserved、single active cycle、productionConnected=false，PASS。
- Trusted Context validator：PASS，artifact=`9788dbf6be36f2aaa804dd3978e60b6afdd26fb86d5c9672d9ad677a8bed3d88`。
- typecheck、干净 lint：PASS。
- market 1025 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- Autonomy unit 31/31：PASS；提交绑定自治总门禁待执行。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未连接生产、未执行数据库 mutation。生产 observer 继续独立运行，最近只读证据为 active、78/289、completed writes=1064。

### 风险与遗留问题

- P1：当前 cycle 无法在剩余 deadline 内完成全部 G0.2 Gate；该问题现在有本地可演练修复，但生产 runner、rollback 和 observation packet 尚未完成。
- P1：生产必须先取得当前 Activation 最终 PASS，才能考虑周期续接；不得中断当前有效观察。
- P1：累积 completed writes 未达 10,000，Reconciliation 不能 PASS。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

当前包提交绑定自治总门禁、commit/push 后，建立 session-independent production runner 与 cycle observer；只有 Activation 最终 PASS、动态 preflight 和精确绑定全部通过才允许执行。

## 2026-07-17 / WP-G0.2 Validation Cycle Continuation Production Packet

### 本轮目标

把已验证的不可变 validation cycle 续接封装为会话独立、精确绑定、一次授权、自动降级回滚和持续留证的生产执行包；当前只做本地准备，不连接或执行生产 mutation。

### 修改范围

- 新增确定性脱敏 Bundle、严格 request、Activation 原始样本重算和 15 分钟只读 production preflight 绑定。
- 新增 transient systemd entrypoint、Web/Worker 镜像 retention、外部租约、原子续接、Candidate-disabled Legacy-safe rollback 和真实写入 observer。
- 扩展 cycle core：环境精确切换、失败环境全关闭、生产 rollback 和只读 observation snapshot。
- 新增机器合同、治理回归、CI 门禁和中文报告。
- 未修改 migration、scan、analysis、strategy、RR、Risk Gate、交易计划、frontend/API、Redis、scanner-worker、其它 worker 或生产服务。

### 核心链路影响

服务候选筛选和复盘进化的 Candidate 生命周期真值；不改变全市场发现、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Packet/governance/runner/observer/bundle/boundary：22/22 PASS。
- Core continuation：25/25；治理 2/2 PASS。
- PostgreSQL 16：active 相邻 cycle 原子续接、旧 deadline immutable、Candidate data preserved、single active cycle、失败冻结为全 Legacy，并从最新 frozen Legacy 启动下一相邻 cycle且不复活旧 cycle，PASS；`productionConnected=false`。
- typecheck、干净 lint：PASS。
- market 1025 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- 两次预提交脱敏 Bundle SHA-256 均为 `1e55c2c1065cd34c071f5905d987793781718908600ddcfe7e479466941263dc`；重复副本已精确删除。
- 冻结态恢复修复改变 runner/contract 后，上述旧预提交 Bundle 已失效并精确删除；最终 clean commit 后必须重新生成。
- 本轮后审计真实触发两类 fail-closed：runner 改变后旧 artifact hash 被拒绝；测试凭据形状被 security gate 拒绝。分别通过重算合同和改用非凭据测试占位关闭，未增加白名单。
- 最终自治总门禁：15/15 PASS，`worktreeUnchanged=true`；`canAutoCommit=true`、`canAutoDeploy=false`。
- 最终 clean commit=`54837d03d0fb91b33cf9919bd25ab7aaad60dd7e`，已推送工作分支；提交后自治总门禁 15/15 PASS。
- 最终可复现脱敏 Bundle SHA-256=`49e93e5d7ee18f30304e64ac2dd82c0f9717ed02f06a8c387298c27e677009a9`，未上传、未执行。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未上传、未执行数据库或服务 mutation。Edge/OrcaTerm 最新只读证据为 observer active、96/289、completed writes=1481；Activation 最终 PASS 尚未产生。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：当前 Activation 必须完成 exact 289 样本和至少 24 小时后从原始样本重算 PASS。
- P1：当前包虽已 clean commit/push，但必须等待 Activation 最终 PASS 后重建绑定新鲜生产事实的一次性 request/Bundle，现有本地 Bundle 不得提前执行。
- P1：累计写入仍低于 10,000；Reconciliation、Shadow Verify、Canonical Compat/Cutover 均未执行。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

继续当前 observer，不中断观察；Activation 最终 PASS 后才允许使用新鲜 preflight 和一次性 authorization/request 执行周期续接。

## 2026-07-17 / WP-G0.2 Reconciliation Multi-Cycle Lineage Remediation Local Superpackage

### 本轮目标

修复旧 Reconciliation 固定 cycle1 且只核对当前 release 的 P1 死路，使累计跨多个 72 小时周期的至少 10,000 条 Candidate 写入能够被完整、逐条、只读和零差异验收。

### 修改范围

- 分离 Activation 首周期身份与当前新鲜验证周期身份，引入严格连续的 `sourceReleaseWindows`。
- 每条 Source/Event/Episode 按自身 release 的不可变时间窗口和完整 projection command hash 核对。
- 同一只读事务读取全部 Candidate control 血缘；历史周期必须 Legacy/frozen，当前周期必须唯一 shadow_capture。
- 全局检测 outside-lineage、pending、claimed、retry_wait 和 unresolved，任一不为 0 都失败。
- Production request 增加独立 lineage evidence 路径、权限、SHA-256、阈值和未来阶段声明校验，并只读挂载保存。
- 修复旧 production runner 错误要求 Candidate Worker absent 的死点，改为 Worker 必须 running/healthy 且系统 ready/fresh，不执行停止或重启。
- 更新治理合同、自治状态、Context 和中文报告。
- 未修改 scan、analysis、strategy、RR、Risk Gate、trade plan、frontend、API、migration、Compose、env、Redis、Worker 实现或生产服务。

### 核心链路影响

加强候选筛选和复盘进化的 Candidate 生命周期真值验收；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Runner/governance 13/13：PASS。
- Production packet 11/11：PASS。
- PostgreSQL 16：两个周期各 5,000 条、合计 10,000 条、0 difference、只读拒写、审计角色、未批准第三 control 拒绝、phase unchanged、productionConnected=false：PASS。
- Autonomy unit 31/31：PASS。
- typecheck、干净 lint：PASS。
- market 1025 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。
- 最终自治总门禁：14/14 PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。

### 是否部署

未部署、未连接生产、未查询生产数据库、未修改服务或 Candidate authority。最近只读生产证据仍为 observer active、96/289、completed writes=1481。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：Activation 尚未完成 289 样本/24 小时最终 PASS；累计 completed writes 尚未达到 10,000。
- P1：必须在累计达标后进入新的相邻验证周期并生成可信 multi-cycle lineage evidence，才能构造生产 Reconciliation request。
- P1：Reconciliation PASS 也只表示可进入独立 Shadow Verify，不会自动切换 Canonical authority。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

当前包提交并推送后，继续不中断 Activation observer；最终 PASS 后按已验证周期续接包推进真实累计，达到 10,000 后启动新鲜验证周期，再执行生产只读多周期 Reconciliation。

## 2026-07-17 / WP-G0.2 Fresh Verification Cycle Lineage Capture Local Superpackage

### 本轮目标

建立可从原始 Activation、累计达标周期、新鲜相邻周期和数据库完整 control/count 快照重算的 Lineage 证据，禁止人工自报 10,000 或把达标周期本身包装成新鲜周期。

### 修改范围

- 新增 Lineage builder/validator、治理合同、单元测试和隔离 PostgreSQL 16 演练。
- Activation final 必须从 exact 289 样本重算；累计和 fresh final 必须分别从至少 7 样本/1800 秒/2 次 completed 推进重算。
- Fresh cycle 必须严格相邻，startedAt 晚于累计 PASS 最后样本。
- 数据库全部 control、按 release completed 和全局状态必须在只读审计角色事务中一致。
- 输出固定包含 7 个原始证据内容哈希和完整 source release windows；所有未来阶段声明为 false。
- Reconciliation Bundle 改为复用共享 validator，并把 Activation 内容哈希与 289 样本重算 final 交叉绑定。
- production workflow 接入 Lineage 合同与测试。
- 未修改 frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、migration、Compose、env、Redis、Worker 实现或生产服务。

### 核心链路影响

加强候选筛选和复盘进化的 Candidate 生命周期证据；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Lineage domain/governance：6/6 PASS。
- Reconciliation production packet：12/12 PASS。
- PostgreSQL 16：2 controls、release counts 10005+15、completed 10020、read-only/audit role、outside-lineage reject、productionConnected=false，PASS。
- typecheck、干净 lint、build：PASS。
- market 1025 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- Golden 16/16 和三项安全门禁：PASS。
- 最终自治总门禁：13/13 PASS，`worktreeUnchanged=true`、`canAutoCommit=true`、`canAutoDeploy=false`。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未连接生产、未查询生产数据库、未修改服务或 Candidate authority。最近已知生产观察仍为 96/289、completed=1481。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：当前生产 Activation、累计 10,000 和新鲜相邻周期均未完成。
- P1：本包只有本地引擎，生产 capture packet 尚未建立。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

本包提交推送后，只建立会话独立的只读生产 Lineage capture packet；真实执行继续等待全部外部前置证据。

## 2026-07-17 / WP-G0.2 Fresh Verification Cycle Lineage Capture Production Packet

### 本轮目标

把本地多周期 Lineage 重算器封装为会话独立、一次授权、外部租约约束的生产只读采集包；当前只做本地实现和隔离演练。

### 修改范围

- 新增确定性脱敏 Bundle、最长 90 分钟一次性 request、transient systemd entrypoint 和生产只读 runner。
- 三组 final/samples/closeout 共 9 个私有文件全部绑定路径、hash、closeout 和原始样本重算。
- 生产 runner 强制当前 Git/Web image/Compose/env、Candidate Worker 和 ready/fresh health；执行前后全部 Compose 容器 identity 必须一致。
- 数据库只允许 `REPEATABLE READ READ ONLY + candidate_audit_role`；输出仅保留 Lineage、来源 hash、数据库只读身份、lease 和 runtime identity。
- stage/secure/ops 只按精确路径清理，原始证据和输出 evidence 保留。
- 未修改 frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、migration、Compose、env、Redis、Worker 实现或生产服务。

### 核心链路影响

加强候选筛选和复盘进化的生产证据真值；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Production packet：10/10 PASS。
- 原 Lineage：6/6 PASS；Reconciliation production packet：12/12 PASS。
- PostgreSQL 16：controls=2、release counts=10005+15、completed=10020，production runner 端到端 Lineage capture、只读事务、审计角色和 outside-lineage 拒绝全部 PASS，`productionConnected=false`。
- Autonomy unit：31/31 PASS。
- typecheck、零警告 lint：PASS。
- market 1025 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。
- 最终自治总门禁：15/15 PASS，`worktreeUnchanged=true`；上下文对账后按合同再次运行最终绑定门禁。

### 是否部署

未部署、未上传、未连接或查询生产、未执行任何数据库或服务 mutation。最近已知生产快照仍为 96/289、completed=1481，可能已经过期，本轮没有把它包装成当前事实。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：真实 Activation、累计 10,000 和新鲜相邻周期仍未完成，生产 Lineage capture 必须继续 fail closed。
- P1：Lineage PASS 后仍须独立执行 Reconciliation，不能自动进入 Shadow Verify 或 Canonical authority。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

等待真实前置期间，只准备 Reconciliation 后的 Shadow Verify phase transition/dual-read observation 包；不提前部署或切换 Candidate authority。

## 2026-07-17 / WP-G0.2 Shadow Verify Code Authorization Local Superpackage

### 本轮目标

只在本地启用 Candidate Read 受控状态机，为未来 `shadow_verify` 同快照双读提供代码能力；Legacy 在 Shadow Verify 中继续作为唯一响应权威。

### 修改范围

- 将编译期 Candidate Read 状态机能力从全关切换为显式启用。
- 默认测试事实改为当前 `shadow_capture`，证明授权启用后仍只读 Legacy。
- 新增真实 `shadow_verify` 路由测试，证明会执行 Candidate-vs-Oracle parity，但响应仍为 Legacy、Candidate Review 不可用、不能授权 Cutover。
- 新增机器可审计合同、治理校验器和防放宽测试；CI 改为运行当前授权合同。
- 未修改前端页面、scan、analysis、strategy、RR、Risk Gate、交易计划、backtest、migration、Compose、env、Redis、Worker 或生产服务。

### 核心链路影响

加强候选筛选与复盘进化的 Candidate 双读真值；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Shadow Verify code authorization 合同与 Candidate domain：37/37 PASS。
- 隔离 PostgreSQL 16 Canonical Read：PASS，`productionConnected=false`。
- 隔离 PostgreSQL 16 Raw Oracle：PASS，同一数据库快照，`productionConnected=false`。
- 隔离 PostgreSQL 16 Trusted Context：PASS，`candidate_audit_role`，`productionConnected=false`。
- Autonomy：31/31 PASS。
- typecheck、零警告 lint：PASS。
- market 1026 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- 自治总门禁：14/14 PASS，`worktreeUnchanged=true`；文档对账后将再次运行最终绑定门禁。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未连接生产、未切换 phase、未写数据库。生产 Activation 最近已知快照仍为 96/289、completed=1481，可能已过期，本轮未把它包装成当前事实。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：代码授权只能在 Lineage 和 Reconciliation 真实 PASS 后另包部署；提前部署或切 phase 均被禁止。
- P1：Shadow Verify 仍需独立 phase transition 和 24 小时/289 样本零差异观察。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

本包总门禁、提交和推送收口后，准备独立的 Shadow Verify Web-only 生产发布包；不与数据库 phase transition 合并。

## 2026-07-17 / WP-G0.2 Shadow Verify Code Authorization Web-only Production Release Preparation

### 本轮目标

建立独立、确定性、可回滚的 Web-only 生产发布包，把已验证的 Candidate Read 授权代码安全发布能力准备到位，同时继续禁止提前切换 Shadow Verify phase 或 Candidate authority。

### 修改范围

- 冻结 baseline=`54837d0`、单父 3 文件 target=`eb48827`、tree、diff SHA 和 path-set SHA；错误的旧 11 文件发布目标已精确删除并由当前目标取代。
- 新增确定性脱敏 Bundle、一次性 Standing Grant request、session-independent transient systemd 入口、Web-only runner、边界测试及成功/自动回滚执行演练。
- CI 接入发布合同和测试；机器状态、治理合同、Context 和本轮报告同步更新。
- 未修改 frontend、API route、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、migration、Compose、env、Redis、Worker 或生产服务。

### 核心链路影响

加强候选筛选与复盘进化的 Candidate 双读发布安全；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Web-only 发布合同与 Bundle/边界/执行演练：6/6 PASS；build 失败自动恢复 baseline Git 与旧 Web image。
- 精确 3 文件 release target：定向 22/22、typecheck、零警告 lint、build、forbidden-files、secret-patterns、security-check PASS。
- 原 Shadow Verify 授权合同与域测试 37/37、Autonomy 31/31：PASS。
- typecheck、零警告 lint：PASS。
- market 1026 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。
- 提交前自治总门禁：13/13 PASS，`worktreeUnchanged=true`；最终事实回填后再次运行提交绑定门禁。

### 是否部署

未部署、未上传、未连接或查询生产，未执行数据库、服务、phase、manifest、Feature Flag 或 Candidate authority mutation。最近已知生产快照仍为 96/289、completed=1481，可能已过期，本轮没有把它包装成当前实时事实。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：真实 Activation、累计 10,000、新鲜相邻周期、Lineage 与生产 Reconciliation 尚未 PASS，因此本包生产执行继续 fail closed。
- P1：生产 baseline 漂移会使当前发布包失效，必须重新生成精确 release target，不能回退生产迎合旧包。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完成当前包提交、提交后门禁和确定性 Bundle 后，继续推进不依赖生产前置的 Shadow Verify phase-transition/dual-read observation 本地准备；生产执行保持等待可信 Lineage 与 Reconciliation PASS。

## 2026-07-17 / WP-G0.2 Shadow Verify Phase Transition and Dual-Read Observation

### 本轮目标

建立独立、会话无关、一次授权、可自动回滚的 Shadow Verify phase transition 与 24 小时全分页双读观察包；本轮只做本地实现、隔离演练和发布准备，不连接或修改生产。

### 修改范围

- 新增 phase 合同、严格环境渲染、root-owned manifest、Lineage/Reconciliation/Web release 三项前置证据校验。
- 新增生产 runner：只允许三个 Candidate 读取 flag、既有 control transition procedure、精确 manifest 和 no-build Web recreate。
- 新增全分页 observer：每个样本在同一 `SERIALIZABLE READ ONLY DEFERRABLE` 快照内，用 `candidate_audit_role` 读取全部 Candidate 页并与独立 Raw Oracle 比较。
- 新增精确 289 样本/300 秒调度，采样时间来自数据库时钟，观察覆盖至少 24 小时且最大间隔不超过 600 秒。
- 新增自动回滚：切 phase 后回到 `legacy/frozen`、关闭全部 Candidate flags、停止 Candidate worker、保留 Candidate 数据与当前 Git/Web image。
- 新增确定性脱敏 Bundle、一次性 90 分钟 request、transient systemd entrypoint、CI scripts、边界测试和 PostgreSQL 16 演练。
- 未修改 frontend、API source、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、migration、Compose、env、Redis、Worker implementation 或生产服务。

### 核心链路影响

加强候选筛选和复盘进化的 Candidate 生命周期读真值；不改变全市场发现、深扫验证、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Phase 合同、Bundle、全分页 observer、边界、环境和 24 小时证据纯函数：19/19 PASS。
- 隔离 PostgreSQL 16：migration 1-9、9,999 拒绝、10,000 放行、`shadow_capture -> shadow_verify`、重复 transition 拒绝、`shadow_verify -> legacy/frozen`、10,000 行保留、`productionConnected=false`：PASS。
- Autonomy unit：31/31 PASS。
- typecheck、零警告 lint、全量 market、build：PASS。
- Golden：16/16 PASS。
- forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。
- 首次提交绑定自治总门禁前 8 项 PASS，随后 lint 正确发现 1 个未使用 import 和生产观察器 5 处有意 CommonJS `require` 缺少 lint 边界声明，整轮记为 FAIL；最小修复后必须 amend 并从头重跑 12 项，最终证据以 `.autonomy/latest-gate-result.json` 为准。

### 是否部署

未部署、未上传、未连接或查询生产；未执行数据库、Redis、服务、phase、manifest、Feature Flag 或 Candidate authority mutation。最近已知生产快照仍只是 96/289、completed=1481，可能已过期，本轮没有把它包装成当前实时事实。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：真实 Activation、累计 10,000、新鲜相邻周期、Lineage、Web code release 和生产 Reconciliation 均尚未取得本包所需 PASS，因此生产 runner 必须继续 fail closed。
- P1：本包即使未来完成 24 小时 Shadow Verify，也不会自动进入 Canonical Compat、Canonical Cutover 或生产排序/交易计划。
- P1：回滚到 `legacy/frozen` 后不宣称旧周期可直接重启，后续必须独立审计恢复身份和新周期资格。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

本包提交、提交后自治门禁、确定性 Bundle 和工作分支推送收口后，继续准备 Canonical Compat 独立观察包；生产执行保持等待真实 Lineage、Reconciliation 和 Web code release PASS。

## 2026-07-17 / WP-G0.2 Canonical Compat Phase Transition and Observation

### 本轮目标

建立独立、会话无关、可自动回滚的 `shadow_verify -> canonical_compat` 阶段切换与 24 小时观察包；本轮只做本地实现、隔离演练和生产准备，不连接或修改生产。

### 修改范围

- 新增 Canonical Compat phase 合同、环境/manifest/DB runner、公共 API 语义观察和全分页 Raw Oracle。
- 新增精确 289 样本、至少 24 小时、最大间隔 600 秒且不可缩短的观察证据；Candidate 只在当前请求 parity PASS 时成为候选生命周期与复盘读取权威。
- 新增失败自动回滚到 `legacy/frozen`，关闭全部 Candidate flags、停止 Candidate worker并保留 Candidate 数据、Git 与 Web image。
- 新增确定性脱敏 Bundle、会话独立入口、生产边界测试和隔离 PostgreSQL 16 演练。
- 修正 4 份过期 Canonical 机器合同：代码授权已成立，但 phase/cutover/自动推进仍禁止。
- 未修改 frontend、API source、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、migration、Compose、Redis、Worker implementation 或生产服务。

### 核心链路影响

加强候选筛选和复盘进化的 Candidate 生命周期读真值；不改变全市场发现、深扫验证、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- Phase 定向测试：20/20 PASS。
- Canonical domain：105 pass / 0 fail / 3 个显式 PostgreSQL skip；独立 PostgreSQL 16 演练实际 PASS。
- PostgreSQL 16：10,000 门槛、`shadow_verify -> canonical_compat`、`canonical_compat -> legacy/frozen`、epoch/digest 与数据保留 PASS，`productionConnected=false`。
- Autonomy unit：31/31 PASS。
- typecheck、零警告 lint：PASS。
- market 1026 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未上传、未连接或查询生产；未执行数据库、Redis、服务、phase、manifest、Feature Flag 或 Candidate authority mutation。最近已知生产快照仍只是 96/289、completed=1481，可能已过期，本轮没有把它包装成当前事实。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：生产仍需真实 Dual Read、Lineage、Reconciliation 和 Web code release 全部 PASS；否则 runner 必须 fail closed。
- P1：本包完成也不等于 Canonical Cutover、WP-G0.2 或 G0 完成。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

本包提交、提交后自治门禁、确定性 Bundle 和推送收口后，只准备 Canonical fail-closed phase transition 与观察包；生产执行继续等待真实 Dual Read 证据。

## 2026-07-17 / WP-G0.2 Canonical Rollback State Machine Remediation Local Superpackage

### 本轮目标

关闭最终 Canonical Read Cutover 前的状态机硬缺口：migration 009 没有 `canonical -> legacy/frozen` 受控恢复路径。

### 修改范围

- 新增 migration 010，只增加 rollback-only SECURITY DEFINER procedure；不修改 001-009。
- 过程只接受 active canonical、精确 epoch、非空 release 和 `sha256:` approval digest，固定回到 `legacy/frozen` 并把 epoch 加一。
- PUBLIC 和应用写角色无 EXECUTE；只有 `candidate_migration_role` 可调用，应用角色直接 UPDATE control 仍拒绝。
- 新增治理合同、validator、负向测试和隔离 PostgreSQL 16 演练。
- 历史 migration 009 runner 测试改用冻结九文件 fixture；旧 runner 继续拒绝含 010 的当前仓库，旧授权未扩大。
- 未修改 frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis、Worker、Compose、env 或生产服务。

### 核心链路影响

保护候选筛选与复盘进化的 Candidate 生命周期读取地基；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- 治理与历史 migration runner 定向：57/57 PASS。
- 隔离 PostgreSQL 16：migrations 1-10、`canonical epoch 9 -> legacy/frozen epoch 10`、数据保留、least privilege 与六类负向拒绝 PASS，`productionConnected=false`。
- 既有 Canonical Compat PostgreSQL 16 回归：PASS，当前 1-10 schema 不破坏旧安全路径。
- Autonomy unit：31/31 PASS。
- typecheck、零警告 lint：PASS。
- market 1026 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未上传、未连接生产、未执行 migration 010。生产仍为 migrations 1-9；Canonical Cutover 继续阻断。

### 风险与遗留问题

- P0：单向 Cutover 缺口已在本地修复并验证，但生产 010 尚未应用，因此生产风险门禁仍保持阻断。
- P1：migration 010 必须以独立 production Add Schema 包执行和验证，不能与 Canonical Cutover 合并。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完成本包提交和推送后，独立准备 migration 010 的 production Add Schema 包；成功应用并验证前不进入 Canonical phase。
## 2026-07-17 / WP-G0.2 Canonical Rollback Safety Production Add Schema Packet

### 本轮目标

为 migration 010 建立独立、确定性、单迁移、最小权限且会话无关的生产 Add Schema 执行包；本轮先完成本地实现和隔离演练，不连接生产。

### 修改范围

- 新增 migration 010 专用 runner、确定性 Bundle、单次 90 分钟 Standing Grant request、transient systemd 入口和数据库唯一生产 runner。
- 新增精确 1-9 ledger、唯一 pending 010、NOINHERIT migration login、显式 owner role、单事务 ledger、业务行不变和生产身份不变门禁。
- 新增合同/负向/边界测试与隔离 PostgreSQL 16 演练；接入 package scripts 和 CI。
- 未修改 migration 001-010、frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis、Worker、Compose、env 或生产服务。

### 核心链路影响

加强候选筛选与复盘进化的 Candidate 生命周期读权威地基；不改变发现、深扫、结构、风险赔率、交易计划或生产排序。

### 测试结果

- 合同、边界、负向和确定性 Bundle：10/10 PASS。
- PostgreSQL 16：精确 1-9、故障事务回滚、只应用 010 到 10、least privilege、业务数据不变、`productionConnected=false` PASS。
- 首轮 PG16 因 NOINHERIT 登录不能隐式访问 schema 而失败；最小修复为身份检查后显式 `SET ROLE candidate_migration_role`，未放宽登录权限。
- Autonomy 31/31、typecheck、零警告 lint：PASS。
- market 1026 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- 提交前自治总门禁：12/12 PASS，`worktreeUnchanged=true`。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未上传、未连接或查询生产，migration 010 未执行。生产仍是 migrations 1-9，Canonical Cutover 继续阻断。

### 风险与遗留问题

- P0：无新增已知 P0；生产没有 rollback function 仍是 Cutover 前硬阻断。
- P1：本地包仍须 clean commit、提交后绑定门禁、确定性 Bundle 和推送，之后才能进入独立生产执行。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完成本包门禁、提交和推送后，独立执行 production Add Schema；不得与 Canonical phase transition 合并。

## 2026-07-17 / WP-G0.2 Canonical Rollback Add Schema Production Preflight Remediation

### 本轮目标

修复生产只读预检发现的 Web 镜像 `pg` 模块解析阻断，同时保持 migration 010、数据库身份和执行范围不变。

### 修改范围

- 只把本包在 Web 镜像内的只读挂载根从 `/packet` 改为 `/app/packet`。
- 新增生产边界回归，要求 runner 位于 `/app` 依赖树下并禁止退回 `/packet`。
- 新增 root-only 父目录兼容：只允许 `sudo stat` 核验凭据普通文件、单硬链、私有模式及非 root runner UID/GID；不放宽共享目录权限，容器用户保持 `ubuntu`。
- 更新 runner artifact 机器合同。
- 未修改 migration、frontend、API、scan、analysis、strategy、backtest、Redis、Worker、Compose、env、Feature Flag 或生产服务。

### 核心链路影响

只恢复候选生命周期权威地基的 schema 安全执行能力；不改变发现、深扫、结构分析、风险赔率、交易计划、排序或复盘指标。

### 测试结果

- 定向合同/边界/Bundle：10/10 PASS。
- 隔离 PostgreSQL 16：精确 1-9、只应用 010、事务回滚、least privilege、业务数据不变、`productionConnected=false` PASS。
- 基础门禁、提交后自治门禁和新 Bundle：待本轮继续执行，不提前标记 PASS。
- formal：未运行，按合同禁止。

### 是否部署

未部署。旧 Bundle 的显式只读生产预检在数据库连接前因 `ERR_MODULE_NOT_FOUND: pg` 停止；修复后的 transient unit 又在 lease/DB 前因 root-only 父目录导致宿主机凭据检查不可达而停止。两次都没有数据库、服务、仓库、环境或 Candidate control 变更，migration ledger 仍为 001-009。

### 风险与遗留问题

- P0：生产 rollback function 仍 absent，Canonical phase transition 继续阻断。
- P1：旧 Bundle/request/staging 已失效，必须用新 clean commit 重新生成和验证。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完整重跑基础和自治门禁，提交最小修复，重建确定性 Bundle 后重新执行同范围 production Add Schema。

## 2026-07-17 / WP-G0.2 Canonical Rollback Safety Production Add Schema Execution and Closeout

### 本轮目标

在独立 Add Schema 边界内把 migration 010 安全应用到生产，证明最小权限、事务原子性、业务数据不变、服务身份不变、失败关闭和租约释放，并按实际 production phase 重新校准后续路线。

### 修改范围

- 生产只从精确 migration ledger 001-009 应用 `010_candidate_canonical_rollback_safety` 到 10。
- 两份旧身份请求分别因 Web image 与 production Git identity 漂移在 lease/DB 前 fail closed；没有绕过身份门禁。
- 最终请求绑定实际 dormant production baseline `cec0b657...`、Web image `sha256:cd3652c1...`、commit `26d01d1...`、确定性 Bundle 和单次 90 分钟请求。
- 未修改 migration 文件、生产 Git、Compose、env、Web/Worker/Redis/Caddy、Feature Flag、Candidate runtime、scan、analysis、strategy、RR、Risk Gate、trade plan 或 backtest。

### 核心链路影响

为候选筛选与复盘进化补齐 Canonical authority 的生产可回退地基；不产生候选、不生成交易计划、不改变市场扫描或排序。

### 测试结果

- 最终提交后自治总门禁：12/12 PASS，gate evidence SHA-256 `04c384dbae69c82f6ad93731d8380b3e8d1feb2262b56b31fc4c8b0f76b2a84c`。
- 生产 runner：`PASS_PRODUCTION_CANONICAL_ROLLBACK_SAFETY_ADD_SCHEMA`。
- migrationRows：9 -> 10；唯一 applied migration=010。
- function owner=`candidate_migration_role`、least privilege=true、Candidate 业务数据 mutation=false。
- 独立 restage verify：PASS，ledger 10、owner/权限/业务数据不变再次确认。
- 生产 health=`ready/fresh`、Postgres ready、Redis PONG、scanner healthy、frontend/backend/business contract PASS。
- Git/tree/Web/全部容器执行前后不变，Candidate worker absent。
- formal：未运行，按合同禁止。

### 是否部署

已执行 additive production Add Schema；未发布或重建任何服务。fencing token=13 已以 PASS 释放；staging、ops、临时凭据和上传临时文件均已清理，原始生产证据保留于仓库外 evidence 目录。

### 风险与遗留问题

- P0：无新增已知 P0；Canonical 回退 procedure 已在生产可用。
- P1：生产 control 当前是 `legacy / epoch 4 / writeFrozen=true`，其更新时间早于本轮 migration；旧计划中的 `shadow_capture / epoch 3` 已过期。
- P1：Validation Cycle Continuation 旧包绑定 migration 1-9 和旧身份，必须刷新为 migration 1-10 与当前 production baseline 后才能续接。
- Candidate runtime、Reconciliation、Shadow Verify、Canonical Compat/Cutover、WP-G0.2 与 G0 均未完成。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只做 `WP-G0.2-VALIDATION-CYCLE-CONTINUATION-PRODUCTION-REFRESH-AFTER-MIGRATION-010`：保留旧周期全部数据，在 unresolved=0、旧 control 冻结和新周期严格相邻的机器门禁下刷新并执行续接；不得直接进入 Canonical Compat。

## 2026-07-17 / WP-G0.2 Legacy Pending Drain Remediation Local Superpackage

### 本轮目标

关闭生产 `legacy/frozen epoch 4` 中 2,957 条 pending 与 Candidate worker absent 造成的相邻周期续接死锁，并在不产生新 source write 的前提下建立可回滚的 pending-only drain。

### 修改范围

- 新增 pending drain 机器合同、中文治理说明、纯状态/完成真值 runner、负向测试和隔离 PostgreSQL 16 演练。
- 只允许同一 migration/control/release 从 `legacy/frozen epoch 4` 临时进入 `shadow_capture epoch 5`，处理既有 pending 后立即回到 `legacy/frozen epoch 6`。
- 任何 source write 可达、scanner 未暂停、Candidate worker 预先存活、retry/quarantine/claimed/resolution、partial drain、outbox 删除或 deadline/release 漂移均失败。
- 未修改 migrations 1-10、frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、Worker、Compose、env、Redis 或生产服务。

### 核心链路影响

保护候选筛选和复盘进化的 Candidate 生命周期完整性；不改变全市场发现、深扫、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- 合同与 runner 定向：11/11 PASS。
- PostgreSQL 16：migrations 1-10、4 条 pending 全排空、sourceWritesAdded=0、outboxDeleted=0、最终 `legacy/frozen epoch 6`、`productionConnected=false` PASS。
- typecheck、零警告 lint：PASS。
- market 1026 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check：PASS。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未上传、未连接或修改生产。生产仍是 `legacy/frozen epoch 4`，outbox 5,914 中 completed 2,957、pending/unresolved 2,957，Candidate worker absent。

### 风险与遗留问题

- P0：无新增已知 P0；本地包没有把生产 pending 包装成已排空。
- P1：生产 drain 必须由独立、会话无关、commit/artifact/identity 绑定且自动回滚的执行包完成。
- P1：drain PASS 后仍需单独启动相邻 cycle-2，不得把两次 authority mutation 合并成一次不可审计操作。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只建立并执行 `WP-G0.2-LEGACY-PENDING-DRAIN-PRODUCTION`；成功恢复 scanner、fresh scan 与 legacy/frozen epoch6 后，再独立刷新 cycle-2 continuation。

## 2026-07-17 / WP-G0.2 Legacy Pending Drain Production Packet Local Preparation

### 本轮目标

建立只排空生产既有 2,957 条 Candidate pending、禁止任何新 source enqueue、成功或失败均恢复生产基线的会话无关单次生产包。

### 修改范围

- 新增 drain-only source 硬阻断，Candidate consumer 在同一临时 runtime 内仍可处理旧 pending。
- 新增精确合同、治理 validator、确定性 Bundle、90 分钟单次 request、root-only 数据库凭据入口、transient systemd entrypoint、生产 runner 和 DB runner。
- 成功只允许 control `legacy/frozen epoch4 -> shadow_capture epoch5 -> legacy/frozen epoch6`；失败会停止 Candidate worker、冻结 control 并恢复原 env/Git/Web/scanner 镜像和 scanner 服务。
- 未修改 migration、frontend、API、scan 排序、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis 数据或非目标服务。

### 核心链路影响

保护候选筛选与复盘进化的 Candidate 生命周期数据完整性；不改变全市场发现、深扫、结构分析、风险赔率或交易计划。

### 测试结果

- 生产包治理与执行器：16/16 PASS。
- 旧 pending drain 合同：12/12 PASS。
- drain-only composition：7/7 PASS。
- 隔离 PostgreSQL 16：成功排空路径与失败冻结保留 pending 路径均 PASS，`productionConnected=false`。
- typecheck、零 warning lint：PASS。首次并行 typecheck 因 build 同时重建 `.next/types` 出现 TS6053，build 后串行复核 PASS。
- market 1027 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、三项安全门禁、自治 31/31：PASS。
- formal：未运行，按合同禁止。

### 是否部署

未部署、未上传、未连接或修改生产。生产仍是 legacy/frozen epoch4，pending/unresolved=2,957，Candidate worker absent。

### 风险与遗留问题

- P0：无新增已知 P0；本地 Packet PASS 不等于生产 drain PASS。
- P1：runner artifact 已冻结为 `b3f91b6278c3a84bba023e9c3b6493faeb275040d1d80880f0ce735d32b6419b`，任何执行文件变化必须重新冻结。
- P1：clean commit、提交后自治 gate、动态生产只读快照、Bundle/request 和真实执行仍待完成。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完成本包基础门禁和 commit-bound approval 后，只执行生产 pending drain；不得合并 cycle-2 启动。

## 2026-07-17 / WP-G0.2 Legacy Pending Drain Production Identity Path Remediation

### 本轮目标

修复 Microsoft Edge/OrcaTerm 动态只读预检发现的生产 identity-runner 路径合同错误，不绕过身份校验、不修改生产。

### 修改范围

- 请求校验器改为只接受同一 `/var/lib/market-radar-ops/wp-g0-2-identity-runner-YYYYMMDDTHHMMSSZ` 根目录下的精确 wrapper、override 与 Postgres admin env。
- 新增跨 identity root、伪 wrapper 和不存在稳定别名的负向回归。
- 重新冻结生产 runner artifact；未修改 migration、frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis、Worker、Compose、env 或 secret。

### 核心链路影响

只修复候选生命周期生产排空入口的真实身份绑定；不改变市场发现、候选排序、分析、风险赔率或交易计划。

### 测试结果

- Bundle 身份路径定向：5/5 PASS。
- 生产包治理与执行器：17/17 PASS。
- 提交前完整自治门禁：12/12 PASS；包含 PostgreSQL 16 双路径、typecheck、零 warning lint、market 1027/0/7、workers 23/23、historical 4/4、build、Golden 16/16 和三项安全门禁。
- 提交后 commit/tree-bound 自治门禁：待执行，当前不提前生成 Bundle 或标记生产可执行。
- formal：未运行，合同禁止。

### 是否部署

未部署。生产只执行只读 Git、文件哈希、容器身份、health 和路径查询；production lease absent，数据库和服务均未修改。

### 风险与遗留问题

- P0：无新增已知 P0。
- P1：当前变更尚未完成完整门禁、clean commit、推送、新 Bundle 和生产 request。
- 系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

完成完整门禁和新 commit-bound Bundle 后，继续同一 pending-only drain 生产包，不进入 cycle-2。

## 2026-07-17 / WP-G0.2 Legacy Pending Drain Production Failure and Rollback Closeout Remediation

### 本轮目标

如实收口首次 production pending-only drain 的安全失败，证明数据库与生产基线未被误改，并修复 scanner 锁等待、rollback health cadence、租约释放和回滚证据单值性缺陷。

### 修改范围

- Microsoft Edge/OrcaTerm 只读核查生产 lease、Git/tree、容器/镜像、env/Compose 指纹、Redis scan lock、Candidate 数据、health 与失败证据。
- runner 停止 scanner 后只读等待最多 660 秒让 600 秒 Redis 锁自然过期，禁止删除 Redis 锁。
- rollback baseline health 等待从 600 秒改为 1,200 秒，覆盖 900 秒 scanner cadence 和 300 秒余量，并继续要求新 completedAt 与 ready/fresh。
- 真正 rollback incomplete 时不再调用非法 `ROLLBACK_FAIL` release outcome；保留租约并输出单一 `ROLLBACK_INCOMPLETE_LEASE_RETAINED`。
- 更新生产合同、治理 validator、回归测试、报告和长期上下文；未修改 migration、frontend、业务 API、scan 排序、analysis、strategy、RR、Risk Gate、trade plan、backtest、Worker、Compose、env 或 secret。

### 核心链路影响

保护候选筛选与复盘进化的 Candidate 生命周期地基；不产生信号，不修改市场发现、结构分析、风险赔率或交易计划。

### 测试结果

- 新增回归在旧 runner 上 4 项变红；修复后 production packet 20/20 PASS。
- 隔离 PostgreSQL 16 migrations 1-10、pending-only drain、sourceWritesAdded=0、outboxDeleted=0、legacy/frozen epoch6：PASS，`productionConnected=false`。
- typecheck、零 warning lint：PASS。
- market 1027 pass / 0 fail / 7 explicit skip；workers 23/23；historical 4/4：PASS。
- build、Golden 16/16、forbidden-files、secret-patterns、security-check、Autonomy 31/31：PASS。
- formal：未运行，合同禁止。

### 是否部署

首次生产尝试已执行但 FAIL：fencing token 14 在 scanner pause 后因 `scanner_lock_still_present` 于数据库 preflight 前退出。数据库保持 migration 10、legacy/frozen epoch4、outbox=5,914、completed=2,957、pending/unresolved=2,957；Candidate worker absent。Git/tree、env/Compose、Web/scanner 原镜像均恢复，Redis scan lock=0，后续 health 已为 ready/fresh。旧 lease 因非法 release outcome 保留到自然过期。当前本地修复尚未 commit-bound、未生成新 Bundle/request、未生产重试。

### 风险与遗留问题

- P0：旧执行结果是 rollback closeout incomplete，不是 production drain PASS；旧 active lease 必须自然过期或在下一次 acquire 时按租约协议归档，不能手工删除。
- P1：新修复仍需 clean commit、提交后自治 gate、新 Bundle/request 和动态生产 preflight。
- P1：只有 pending=0、legacy/frozen epoch6、scanner ready/fresh、租约释放和证据闭环全部 PASS 后，G0 主步骤才能从 8 减为 7。
- 系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只完成并重试 `WP-G0.2-LEGACY-PENDING-DRAIN-PRODUCTION`；不得合并 cycle-2。

## 2026-07-17 / WP-G0.2 Pending Drain Target Image Preflight Remediation

### 本轮目标

如实收口第二次 production pending drain 的 `pg` 缺失失败，并保证新 DB runner 只在包含其运行依赖的目标 Web 镜像中执行。

### 修改范围

- 第二次执行绑定 commit `1856990852a3`、deterministic Bundle `ceaf387f...` 和单次 request `768402ec...`；远端 staging、双 SHA 与容器内 request 验证 PASS。
- fencing token 15 在 `database-preflight` 因旧基线 Web 镜像缺少 `pg` 而失败；未打开 epoch、未启动 Candidate worker、未推进 pending。
- runner 改为 scanner 仍在线时先 checkout/build 目标 Web 与 Candidate worker 镜像，随后停止 scanner，并用目标 Web 镜像执行 preflight；后续 open/snapshot/close/verify 本来就使用同一目标镜像。
- 合同新增 `targetImageBuiltBeforeScannerPause=true` 与 `databaseRunnerImage=target_web_image_with_pg`，并冻结到新 runner artifact。
- OrcaTerm 错误粘贴误装的唯一 `mailcap` 已精确 purge 并复核 absent；未 autoremove 原有包。
- 未修改 migration、Candidate 数据逻辑、frontend、scan 排序、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis 数据、Compose、env 或 secret。

### 核心链路影响

只强化候选筛选与复盘进化的生产排空执行地基；不生成信号，不改变市场发现、结构分析、风险赔率或交易计划。

### 测试结果

- 旧 runner 生产事实证明 `ERR_MODULE_NOT_FOUND: pg`；新顺序回归明确拒绝 baseline Web preflight。
- 生产包 20/20、旧 pending drain 12/12：PASS。
- PostgreSQL 16 成功 drain 与失败 refreeze 双路径：PASS，sourceWritesAdded=0、productionConnected=false。
- shell syntax、diff-check：PASS。
- typecheck、lint、market、build、Golden、安全与完整自治门禁：待本轮后续执行，不能提前继承。
- formal：未运行，合同禁止。

### 是否部署

第二次生产执行 FAIL 但 rollback 完整：`ROLLBACK_PASS`、`leaseReleased=true`、全局 lease absent。数据库仍为 migration 10、legacy/frozen epoch4、completed=2,957、pending/unresolved=2,957；Web/scanner/Git/env 已恢复基线。当前顺序修复尚未 commit、push 或生产重试。

### 风险与遗留问题

- P0：生产 pending 仍为 2,957，不能减 G0 主步骤。
- P1：当前修复仍需完整门禁、clean commit、提交后 gate、新 Bundle/request 和第三次执行。
- P1：只有 pending=0、legacy/frozen epoch6、scanner ready/fresh、lease released、evidence closed 全部满足后，主步骤才能从 8 减为 7。
- 系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只完成本修复的 commit-bound 生产重试，不进入 cycle-2。

## 2026-07-18 / WP-G0.2 Pending Drain Application Module Root Remediation

### 本轮目标

如实收口第三次 production pending drain 的 ESM 模块解析失败，并保证挂载于 `/packet` 的 DB runner 只从目标 Web 镜像应用根 `/app/package.json` 解析 `pg`。

### 修改范围

- 第三次执行绑定 commit `d3c17b517849`、deterministic Bundle `4fd0210d...` 和单次 request `7ef5b22d...`；远端双哈希、容器 request 验证与 transient unit 启动 PASS。
- fencing token 16 在 `database-preflight` 因静态 ESM import 沿 `/packet` 解析、无法到达镜像 `/app/node_modules/pg` 而失败；未打开 epoch、未启动 Candidate worker、未推进 pending。
- DB runner 改为优先从 `/app/package.json` 建立 `createRequire` 并加载 `pg`；仅为本地测试/演练保留当前 module URL fallback，非 `MODULE_NOT_FOUND` 错误不会被吞掉。
- 合同新增 `databaseRunnerModuleRoot=/app/package.json`，Bundle validator、治理校验和弱化攻击测试共同禁止切回 `/packet` 模块根。
- 未修改 migration、Candidate 数据语义、frontend、scan 排序、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis 数据、Compose、env 或 secret。

### 核心链路影响

只强化候选筛选与复盘进化的生产排空运行时地基；不生成信号，不改变全市场发现、结构分析、风险赔率或交易计划。

### 测试结果

- DB runner 定向测试 4/4、完整生产包 21/21、旧 drain 12/12、Node 语法检查、diff check：PASS。
- PostgreSQL 16 success drain 与 failure refreeze 双路径 PASS，`sourceWritesAdded=0`、`productionConnected=false`。
- 本机无 Docker CLI，未执行本地 bind-mount 容器演练。
- 提交前基础、安全与自治总门禁 12/12 PASS：market 1027/0/7 explicit skip、workers 23/23、historical 4/4、build、Golden 16/16、三项安全检查、Autonomy 31/31、`worktreeUnchanged=true`；提交后仍须重新生成 commit-bound gate evidence。
- formal：未运行，合同禁止。

### 是否部署

第三次生产执行 FAIL 但 rollback 完整：`ROLLBACK_PASS`、fencing token 16 已释放、全局 lease absent。数据库仍为 migration 10、legacy/frozen epoch4、completed=2,957、pending/unresolved=2,957；Web/scanner/Git/env 已恢复基线并为 ready/fresh。当前模块根修复尚未 commit、push 或生产重试。

### 风险与遗留问题

- P0：生产 pending 仍为 2,957，G0 主步骤不能从 8 减为 7。
- P1：当前修复还需完整定向/PG16/基础/安全门禁、clean commit、提交后 gate、新 Bundle/request 和第四次生产执行。
- P1：只有 pending=0、legacy/frozen epoch6、scanner ready/fresh、lease released、evidence closed 全部满足后才能减数。
- 系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只完成本模块根修复的 commit-bound 第四次生产重试，不进入 cycle-2。

## 2026-07-18 / WP-G0.2 Pending Drain Exact Environment Mount Remediation

### 本轮目标

如实收口第五次 production pending drain 的隔离 env 读取失败，并保证只有专用 renderer 能以精确单文件只读方式读取生产 env，输出只进入临时 OPS 目录。

### 修改范围

- 第五次执行绑定 commit `c0cce68da8e5`、deterministic Bundle `f0676ee6...` 和单次 request `f58bef9a...`；远端双哈希、容器 request 验证、目标镜像构建、DB runner `/app` 模块根、三道单行 `jq` 合同和真实 DB preflight 均 PASS。
- fencing token 18 在 `drain-only-environment` 因隔离容器没有挂载宿主 `.env.production` 而报 `ENOENT`；未打开 epoch、未启动 Candidate worker、未推进 pending。
- 新增专用 `render_drain_environment`：只挂载精确 env 文件到 `/runtime/env.production` 且只读，只允许写本轮临时 OPS；通用 lease runner 不获得 env 挂载。
- 合同、Bundle validator、治理 validator 和真实 Docker 参数回归共同锁定该边界；runner artifact 刷新为 `f90f202489f8c763612c976fe795cd33e1cbc1b807d92ce68ec07ebbe06343f5`。
- 未修改 migration、Candidate 数据语义、frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis、Compose、Feature Flag 或 secret。

### 核心链路影响

只强化候选筛选与复盘进化的生产排空执行地基；不生成信号，不改变全市场发现、结构分析、风险赔率、交易计划或生产排序。

### 测试结果

- production packet 23/23、旧 pending drain 12/12：PASS。
- PostgreSQL 16 success drain 与 failure refreeze：PASS，`sourceWritesAdded=0`、`outboxDeleted=0`、`productionConnected=false`。
- typecheck、零 warning lint、test:market、build、Golden 16/16、三项安全检查、Autonomy 31/31：PASS。
- 首轮完整自治总门禁：12/12 PASS，result=`bc299e8b-0f2a-49dc-a707-e69d708ae7cc`、evidence SHA-256=`defde6928ca4941190ec2316be6cae33f7b6a523c091cc1afca77a3e75873b59`、`worktreeUnchanged=true`。
- 事实回填后的最终冻结门禁：12/12 PASS，result=`e64ffb07-2a61-484f-b5b9-b90f2b4a949d`、evidence SHA-256=`a2be4ebee43cacbd291dcbecb4c209c8156dd035a14c6ffb7eb79358f914b212`、`worktreeUnchanged=true`；不能提前生成第六次 Bundle/request。
- formal：未运行，合同禁止。

### 是否部署

第五次生产执行 FAIL 但 rollback 完整：`ROLLBACK_PASS`、fencing token 18 已释放、全局 lease absent、staging/secure absent。数据库仍为 migration 10、`legacy/frozen epoch4`、completed=2,957、pending/unresolved=2,957；Git/env/Web/scanner 已恢复并为 ready/fresh。本地精确挂载修复尚未 commit、push 或生产重试。

### 风险与遗留问题

- P0：生产 pending 仍为 2,957，G0 主步骤不能从 8 减为 7。
- P1：本修复仍需 clean commit、提交后 gate、新 Bundle/request 和第六次执行。
- P1：只有 pending=0、legacy/frozen epoch6、scanner ready/fresh、lease released、evidence closed 全部满足后才能减数。
- 系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只完成本精确挂载修复的 commit-bound 第六次生产重试，不进入 cycle-2。

## 2026-07-18 / WP-G0.2 Candidate Outbox Source-Lane Classification Correction

### 本轮目标

如实收口第六次 production drain，纠正把 Candidate event 下游 outbox 当成 legacy
source 积压的错误，并阻止旧 drain 包再次作用于当前生产形态。

### 修改范围

- drain DB snapshot 和 preflight 按 `source_type` 拆分；当前生产形态会以
  `legacy_pending_work_missing` 在 control open 前拒绝。
- cycle continuation PostgreSQL 16 演练加入 completed legacy source + pending Candidate
  event 的生产同形态，证明 event lane 保留且不阻断 source-lane clean continuation。
- 旧 drain 中英文合同标记为 `SUPERSEDED_SOURCE_LANE_CLASSIFICATION`，同步状态、上下文和报告。
- 未修改 migration、生产数据、Redis、env、Feature Flag、frontend、API、scan、analysis、
  strategy、RR、Risk Gate、trade plan 或 backtest。

### 核心链路影响

保护候选筛选和复盘进化的数据真值；避免重复投影、伪清零和无效生产重试。

### 测试结果

- legacy drain 13/13、production packet 23/23：PASS。
- cycle continuation 26/26、governance 2/2、production packet 22/22：PASS。
- PostgreSQL 16 source-lane 同形态续周期：PASS，Candidate event pending preserved，
  source unresolved=0，`productionConnected=false`。
- typecheck、零 warning lint、market 1,027/0/7、workers 23/23、historical 4/4、
  build、Golden 16/16、三项安全检查、Autonomy 31/31：PASS。
- 自治总门禁 16/16，`worktreeUnchanged=true`；首轮 evidence SHA-256=
  `331e6c42795bcc7f8f04620c40949289fa074a224dcdc2c4b6f281e1b9b9a8ca`。
- formal：未运行，合同禁止。

### 是否部署

第六次生产尝试到达 epoch5 后因 claimed=0 被主动终止并完整 `ROLLBACK_PASS`；fencing
token 19 已释放，生产恢复 legacy/frozen epoch4、Candidate absent、Web/scanner ready/fresh。
随后只做 aggregate-only read-only 核查，没有再次修改生产。旧 drain packet 已禁用。

### 风险与遗留问题

- legacy source 已 completed=2,957、unresolved=0；Candidate event pending=2,957 是独立
  下游通道，孤儿=0、合同不匹配=0，不能由 Shadow Consumer 伪完成。
- checkpoints/outcomes 仍为 0，第二层交付能力未启用，系统仍是 R1。
- cycle-2 尚未生产启动；必须刷新 commit/artifact/identity binding 后再执行。

### 下一轮建议

只刷新并执行 source-lane-aware 的相邻 validation cycle continuation production packet。

## 2026-07-18 / WP-G0.2 Validation Cycle Continuation Source-Lane-Aware Production Refresh

### 本轮目标

把旧 Cycle-2 生产包刷新到当前真实的 `legacy/frozen epoch4`、Candidate Worker absent 和双 outbox source-lane 形态，阻止旧假设进入生产。

### 修改范围

- 刷新 continuation runner、Bundle、生产 runner、合同、治理和测试。
- Activation 证据改为绑定原始 commit/release/migration/epoch3；当前生产身份单独绑定 epoch4。
- DB snapshot 拆分 legacy source 与 Candidate event 通道，事件 pending 必须完整保留。
- 修复 staged runner 从目标镜像 `/app/package.json` 加载 `pg`、生产 env 精确单文件只读挂载、Worker absent 基线和失败回滚。
- 自动回滚不再依赖 Candidate Worker 容器仍存在；回滚不完整时保留租约并拒绝伪报 PASS。
- 未修改 migration、frontend、公开 API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、Redis、scanner、Caddy、env 或 secret。

### 核心链路影响

只强化候选筛选与复盘进化的数据生命周期地基；不改变全市场发现、深扫、结构分析、风险赔率或交易计划。

### 测试结果

- production packet 24/24、core continuation 28/28、governance 2/2、Autonomy 31/31：PASS。
- PostgreSQL 16 首轮因 SQL alias 合同错误 FAIL；修复后第二轮 PASS，migration 1-10、旧 deadline immutable、Candidate data/event lane preserved、single active cycle 和 rollback 均通过。
- typecheck、零警告 lint、test:market、build、Golden 16/16 和三项安全门禁：PASS。
- 两轮完整自治总门禁均 15/15 PASS、`worktreeUnchanged=true`；最终动态 evidence 不回写 tracked 文档，提交资格由无后续修改的 `autonomy:verify` 证明。
- formal：未运行，合同禁止。

### 是否部署

未部署、未连接生产。当前只是本地刷新包，生产仍为 `legacy/frozen epoch4`、Candidate Worker absent、Web/scanner ready/fresh 的最近只读基线。

### 风险与遗留问题

- G0 主步骤仍为 7；本地 PASS 不等于 Cycle-2 已生产启动。
- 仍需无后续修改的最终动态门禁、clean commit、push、提交后 commit-bound gate、新鲜生产只读 preflight、确定性 Bundle/request 和受控生产执行。
- Cycle-2 启动后仍需真实累计至少 10,000 completed writes、至少 1,800 秒、至少 7 样本和两次推进，不能缩短或伪造。
- 系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只完成本刷新包的 commit-bound 生产 Cycle-2 启动与真实累计，不进入 Shadow Verify 或 Canonical Compat。

## 2026-07-18 / WP-G0.2 Cycle-2 Fresh Activation And Accumulation Remediation

### 本轮目标

纠正旧 Activation “289 样本/24 小时 PASS”的错误前提，把 Cycle-2 改成全新 Activation 与真实写入积累统一观察，两项同时达标才允许进入 Lineage。

### 修改范围

- 生产只读证据确认旧观察仅 197 个样本、约 16.5 小时、closeout=`ROLLBACK`，且没有 `observation-final.json`；旧包停止使用。
- 删除 Cycle-2 request、Bundle validator 和 production entrypoint 对旧 Activation final/closeout/samples 的通行证依赖。
- observation sample 升级为 v2，绑定 health、Candidate runtime/monitor、cycle/release/epoch、数据库锁等待和长事务。
- 统一门禁要求至少 289 个连续样本、24 小时、最大间隔 600 秒，同时 completed writes 至少 10,000、稳定 1,800 秒、至少 7 样本和两次真实推进。
- PostgreSQL 16 演练新增真实 observation snapshot 查询，覆盖相邻周期、数据库安全快照和 Legacy-safe rollback。
- 未修改 frontend、公开 API、migration、Redis、scanner、scan 排序、analysis、strategy、RR、Risk Gate、trade plan、backtest、env 或 secret。

### 核心链路影响

强化候选筛选和复盘进化的数据生命周期真值；不改变全市场发现、深扫、结构分析、风险赔率或交易计划。

### 测试结果

- 红测先为 0/6，实装后 observer 6/6：PASS。
- production packet 26/26、core continuation 28/28、governance 2/2：PASS。
- PostgreSQL 16 migrations 1-10、相邻 cycle、观察安全快照、数据保留和 rollback：PASS，`productionConnected=false`。
- typecheck、零报错 lint、test:market 1,027/0/7、workers 23/23、historical 4/4、build、Golden 16/16、三项安全门禁和 Autonomy 31/31：PASS。
- 第一次 commit-bound 控制器调用在门禁启动前因 active package 使用未定义状态 `ready_for_commit_bound_gate` 而 fail closed；已改回合同允许的 `ready_for_gate`，没有跳过任何门禁。
- 最终审查发现 observer 曾把自定义业务 PASS 状态直接传给租约 release，而租约只接受 `PASS_OBSERVATION`；已改为证据保留详细状态、租约使用合法 closeout 枚举，并新增回归测试。
- formal：未运行，合同禁止。

### 是否部署

未部署、未上传、未修改生产。生产仍为最近只读确认的 `legacy/frozen epoch4`、Candidate Worker absent 基线。

### 风险与遗留问题

- 下游 Lineage/Reconciliation 旧合同仍引用旧 accumulation-only PASS 状态，必须在进入下一生产包前刷新，不能复用旧请求或 Bundle。
- 本地 PASS 不等于 Cycle-2 已启动；G0 主步骤仍为 7。
- Cycle-2 真正减数至少要等现场绑定、上传、执行，以及 24 小时/289 样本与 10,000 writes 双门禁生产 PASS。

### 下一轮建议

先完成本包完整门禁、提交绑定和确定性 Bundle，再执行新的 Cycle-2 生产启动；不复用任何旧 Activation PASS 证据。

## 2026-07-18 / WP-G0.2 Cycle-2 Production Epoch-6 Rebind

### 本轮目标

在腾讯生产现场绑定发现 epoch 漂移后，只把 Cycle-2 入口从过期 epoch 4 重新绑定到当前真实 epoch 6，禁止旧身份包进入生产。

### 修改范围

- Microsoft Edge / OrcaTerm 只读核验生产仍为 clean detached `cec0b657...`、Web image `sha256:cd3652c1...`、Candidate Worker absent，health=`ready`、scan=`fresh`、Postgres=`ready`、Redis=`healthy`。
- 数据库 `REPEATABLE READ READ ONLY` 证明唯一 control 为 `candidate-episode-v1 / legacy / frozen / epoch6 / candidate-shadow-e5eb90026d8b`，updatedAt=`2026-07-17T19:55:23.220Z`；Candidate 计数和两个 source lane 均未漂移。
- global production lease absent；最新历史 lease 是 fencing token 19 的 `WP-G0.2-LEGACY-PENDING-DRAIN-PRODUCTION`，已于 `2026-07-17T19:56:48.252Z` 以 `ROLLBACK_PASS` 释放，与 control epoch 6 更新时间吻合。
- 原 commit `93bc64d...` 和 Bundle `2a1149df...` 因绑定 epoch 4 自动失效，从未上传或执行。
- 只刷新 Cycle continuation 本地/生产合同、Bundle validator、治理 validator、生产身份测试和上下文；runner artifact 更新为 `bf3d55cfce5a9d9907ec06d6d9f76d8335eebfc71fb7f5794607f7873896a47e`。
- 未修改 migration、数据库数据、Redis、Worker 业务逻辑、frontend、API、scan、analysis、strategy、RR、Risk Gate、trade plan、backtest、env 或 secret。

### 核心链路影响

只保护候选筛选和复盘进化的生命周期生产身份；不生成信号，不改变生产排序或交易计划。

### 测试结果

- 红灯：旧合同 `4 !== 6`，epoch 6 request 被 `request_current_authority_epoch_invalid` 拒绝，2 项按预期 FAIL。
- 修复后 Production Packet 26/26、Core 28/28、Governance 2/2、Autonomy 31/31：PASS；旧 epoch 4 request 拒绝回归 PASS。
- PostgreSQL 16 migrations 1-10、相邻 Cycle-2、旧 deadline 不变、Candidate 数据保留、single active cycle 和 rollback：PASS，`productionConnected=false`。
- 完整基础、安全和自治门禁：待最终冻结后执行。
- formal：未运行，合同禁止。

### 是否部署

未上传、未部署、未执行生产 mutation；只完成生产只读核验。当前生产仍为 `legacy/frozen epoch6`、Candidate Worker absent、ready/fresh。

### 风险与遗留问题

- G0 主步骤仍为 7；epoch 重新绑定不能代替 Cycle-2 生产启动和双门禁观察。
- 新包仍需完整门禁、clean commit/push、新鲜 preflight、确定性 Bundle/request、现场执行与 24 小时/10,000 writes 统一观察。
- 系统仍是 `R1 / 可运行但不完整 / 不能支撑实战`。

### 下一轮建议

只完成 epoch 6 绑定包的提交、生产启动和统一观察，不进入 Lineage 或 Shadow Verify。

## 2026-07-18 / WP-G0.2 Cycle-2 Production Authorization Schema Pre-Lease Remediation

### 本轮目标

修复 Cycle-2 一次性授权与通用生产租约入口的 schema 合同断层，保证缺失或错误授权版本在上传前 fail closed。

### 修改范围

- `bundle.mjs` 显式要求 `market-radar-package-authorization.v1`，测试覆盖缺失和伪造版本。
- Cycle continuation 生产合同与 runner artifact 同步刷新；未修改 migration、数据库数据、Redis、scanner、frontend、API、scan、analysis、strategy、RR、trade plan、backtest、env 或 secret。
- 旧 commit `3c432e5...` / Bundle `4a63e3b9...` / request `4bd19894...` 已失效且禁止复用。

### 核心链路影响

只强化候选筛选和复盘进化的生产授权地基，不生成信号、不改变排序或交易计划。

### 测试结果

- 红灯：缺失 schema 的授权被现有 Cycle-2 validator 错误接受，1 项按预期 FAIL。
- 修复后 Production Packet 26/26、Core 28/28、Governance 2/2、Autonomy 31/31、PostgreSQL 16：PASS。
- typecheck、零 warning lint、market 1,027/0/7、workers 23/23、historical 4/4、build、Golden 16/16、forbidden/secret/security：PASS。
- formal：未运行，合同禁止。

### 是否部署

第一次 production attempt 在 lease acquire 前以 `autonomy_authorization_schema_invalid` fail closed；没有 Git、DB、env 或服务变更。生产基线复核 PASS，失败 staging/secure/ops/evidence/upload 和临时 rollback tag 已精确清理。修复后的新版本尚未 commit、push 或重试生产。

### 风险与遗留问题

- G0 主步骤仍为 7；pre-lease fail closed 和本地修复都不能代替 Cycle-2 生产启动。
- 仍需 clean commit、提交绑定门禁、确定性 Bundle/request、新鲜现场 preflight 和受控生产重试。
- Cycle-2 生产启动后仍必须通过 289 样本/24 小时与 10,000 真实 writes 双门禁。

### 下一轮建议

只提交并重新绑定本 schema 修复，然后重试 Cycle-2；不进入 Lineage 或 Shadow Verify。

## 2026-07-18 / WP-G0.2 Cycle-2 Legacy Compose Default Environment Remediation

### 本轮目标

修复 Cycle-2 生产 renderer 与当前 Legacy Compose 默认环境的合同不兼容，同时保持所有显式污染值 fail closed。

### 修改范围

- 第二次生产尝试绑定 commit `096fad5...`、Bundle `78d0ee9c...`、request `ae6d23cf...` 和 preflight `18bcef5e...`；远端上传、隔离校验、租约和目标构建通过。
- fencing token 20 在 DB control 和 Candidate 启动前因 `candidate_environment_source_mismatch:CANDIDATE_EPISODE_CANONICAL_WRITE` 失败并 `ROLLBACK_PASS`。
- 只修改 Cycle continuation renderer、对应测试和两个 artifact 合同：Legacy 缺省字段按 Compose 的精确 disabled/cycle1 默认值解释，显式错误值继续拒绝。
- 未修改 migration、数据库业务数据、Redis、scanner、frontend、API、scan、analysis、strategy、RR、trade plan、backtest、生产 env 或 secret。

### 核心链路影响

只修复候选筛选与复盘进化的生产生命周期入口，不生成信号、不改变排序或交易计划。

### 测试结果

- 红灯：当前 renderer 拒绝真实 Legacy 缺省环境，按预期复现。
- Production Packet 27/27、Core 29/29、Governance 2/2、Autonomy 31/31：PASS。
- PostgreSQL 16 migrations 1-10、旧 deadline immutable、Candidate 数据保留、single active cycle 和 rollback：PASS。
- typecheck、零错误 lint、market 1,027/0/7、workers 23/23、historical 4/4、build、Golden 16/16、forbidden/secret/security：PASS。
- formal：未运行，合同禁止。

### 是否部署

第二次生产尝试已执行但 FAIL，并自动恢复 clean detached `cec0b657...`、旧 Web `sha256:cd3652c1...`、Candidate Worker absent 和 `legacy/frozen epoch6`。绑定版 production-check 独立复核 PASS；Cycle-2 未启动。

### 风险与遗留问题

- 失败事务的精确临时路径、目标镜像和 rollback tag 尚待清理；不得批量 prune。
- 修复尚待 clean commit/push、提交绑定门禁、新 Bundle/request/preflight 和第三次生产重试。
- G0 主步骤仍为 7；本地和回滚 PASS 都不能替代 289 样本/24 小时与 10,000 writes 双门禁。

### 下一轮建议

只完成精确清理、提交绑定和 Cycle-2 第三次生产启动；不进入 Lineage 或 Shadow Verify。

## 2026-07-18 / WP-G0.2 Cycle-2 Failed Transaction Cleanup Boundary Remediation

### 本轮目标

固化第二次生产尝试的脱敏证据，并关闭观察器启动前失败后遗留敏感临时目录、回滚 tag 和未使用目标镜像的清理缺口。

### 修改范围

- `production-runner.sh`：回滚或 pre-mutation 失败确认基线健康后，精确删除本事务 staging、secure、ops、rollback tag 和无人使用目标镜像。
- `observation-runner.sh`：观察期自动回滚后执行同一镜像清理；观察 PASS 保留当前生产镜像和受控回滚镜像。
- 生产合同、治理校验和边界测试冻结 exact path、no-container-use 与 evidence retention 规则。
- 未修改 migration、数据库业务数据、Redis、scanner、frontend、API、scan、analysis、strategy、RR、trade plan、backtest、env 或 secret。

### 核心链路影响

只强化候选筛选与复盘进化的生产失败恢复地基，不生成信号、不改变排序或交易计划。

### 测试结果

- 红灯：pre-observation 与 observation rollback 清理边界 2 项按预期 FAIL。
- 修复后边界 4/4、Production Packet 29/29、production packet validator：PASS。
- Core 29/29、Governance 2/2、Autonomy 31/31、PostgreSQL 16：PASS。
- typecheck、lint、market 1,027/0/7、workers 23/23、historical 4/4、build、Golden 16/16、forbidden/secret/security：PASS。
- 首轮自治总门禁 15/15 PASS 后，自审发现 Bash 条件函数中的 `set -e` 弱化风险；新增查询失败红灯并改为显式检查 Docker/Git 命令退出码。按最终字节重跑 Production Packet 29/29、Core 29/29、Governance 2/2、Autonomy 31/31、PostgreSQL 16、全部基础/安全门禁和自治总门禁 15/15 均 PASS，`worktreeUnchanged=true`；formal 未运行且禁止运行。
- 第二次尝试脱敏 evidence zip SHA-256=`3532b8b385f71aa75d9c267e79600aa1117e3c78059c3ce285d236ebfa96c068`；正确敏感信息扫描零命中。一次正则语法错误导致的扫描结果已作废，未计入证据。

### 是否部署

未部署本修复。第二次生产尝试已经安全回滚，旧远端残留仍待精确清理；旧 `f35dc5d` Bundle 已失效并禁止执行。

### 风险与遗留问题

- 最终完整门禁已通过；仍需 clean commit/push、确定性 Bundle、新鲜 preflight/request 和第三次生产启动。
- 远端 evidence 只在本地脱敏包已校验后按精确路径清理；禁止批量 prune。
- G0 主步骤仍为 7；清理 PASS 不等于 Cycle-2 双门禁 PASS。

### 下一轮建议

只完成门禁、提交、旧残留精确清理和 Cycle-2 第三次生产启动；不进入 Lineage 或 Shadow Verify。

## 2026-07-18 / WP-G0.2 Cycle-2 Observer Stdin and Automatic Rollback Recovery Remediation

### 本轮目标

如实收口第三次 Cycle-2 生产启动失败，恢复生产基线，并修复 observer 无输入和自动回滚自锁两个直接根因。

### 修改范围

- `observation-runner.sh`：隔离 Node 容器显式启用 stdin，确保 heredoc combiner 真正生成 `combined-sample.json`。
- `production-runner.sh`：把 baseline Compose checksum 校验限定在 continue 前置分支；rollback 仍要求精确批准目标、回滚输入校验和最终基线全验证。
- 两份边界/runner 测试锁定 stdin 与 rollback precheck 边界；Production Packet runner artifact 刷新为 `4d0e7c6f1e67b0597fb960acb8778612b4c11146dac2955c9f1d5d6bb618f0da`。
- 未修改 migration、交易逻辑、scan/analysis/strategy/backtest、前端、API、Redis、scanner、生产 env 或 secret。

### 核心链路影响

只强化候选筛选与复盘进化的生产观察和失败恢复地基，不生成信号、不改变排序、RR 或交易计划。

### 测试结果

- Bash 语法与根因定向回归 14/14：PASS。
- Production Packet 31/31：PASS。
- PostgreSQL 16 migrations 1-10、相邻周期、single-active-cycle、数据保留和 rollback：PASS。
- typecheck、lint、market 1,027/0/7、workers 23/23、historical 4/4、build、Golden 16/16：PASS。
- formal：未运行，合同禁止。

### 是否部署

第三次启动已执行但观察器在首样本前 FAIL；自动回滚失败后已在原授权范围内恢复 detached baseline `cec0b657...`、旧 Web、Candidate Worker absent、两个 Cycle 均 Legacy frozen，并释放租约。容器内 health 与双 radar contract、Postgres、Redis、既有 Worker 全部通过；远端脱敏恢复证据 SHA-256=`c4f4cb19cd542d12398d348494d8a7933dfc112aceeb4033b4e8e136dd0e59371`，本地脱敏证据包 SHA-256=`07e02e99b8d8041cd06cbbee44a7926f5b6b23cc3f439f6804b4fa9f01c8f13d`，精确清理 PASS。根因修复尚未部署。

### 风险与遗留问题

- 第三次生产结果不是 Cycle-2 PASS，289 样本/24 小时和 10,000 真实 writes 都尚未开始累计。
- 仍需 clean commit、commit-bound 总门禁、全新 Bundle/preflight/request 和第四次生产启动；旧事务身份禁止复用。
- G0 主步骤仍为 7，系统仍不能标记实战就绪。

### 下一轮建议

只提交并部署 observer/rollback 最小修复，启动 Cycle-2 双门禁观察；不进入 Lineage 或 Shadow Verify。

## 2026-07-18 / WP-G0.2 Frozen Cycle-2 to Adjacent Cycle-3 Production Rebinding

### 本轮目标

根据第三次失败后生产保留的不可变 Cycle-2 历史行，作废 stale Cycle-1/epoch6 生产身份，并把续接入口严格重绑到最新冻结 Cycle-2/epoch2 -> 相邻 Cycle-3。

### 修改范围

- 现场只读绑定确认两个 Legacy frozen 周期共存，最新周期为 `candidate-episode-v1-cycle-2 / epoch2 / candidate-shadow-cycle-2-4ce18da`。
- Cycle continuation 本地/生产合同、治理 validator 和自治状态改为当前 Cycle-2/epoch2 与下一 Cycle-3；旧 24 小时、289 样本、10,000 writes 等阈值全部不变。
- renderer 只在 Legacy 且字段缺失时把 disabled migration identity 绑定到已验证的当前冻结周期；显式旧/未来周期、错误 release 或 authority flag 仍拒绝。
- request validator 必须同时匹配合同中的 current migration、release 和 epoch。
- 未修改 migration、数据库、Redis、scanner、frontend、API、scan、analysis、strategy、RR、trade plan、backtest、env 或 secret。

### 核心链路影响

只修复候选筛选与复盘进化的生命周期真值，不生成信号、不改变排序或交易计划。

### 测试结果

- 红灯：旧 runner、request validator 和治理合同分别拒绝 Cycle-2/epoch2，4 组失败按预期复现。
- 修复后 runner/bundle 定向 15/15、治理 4/4、Production Packet 32/32：PASS。
- PostgreSQL 16：PASS，包含 Cycle-2 冻结后严格相邻 Cycle-3、旧 deadline immutable、Candidate 数据保留和 single active cycle。
- typecheck、零报错 lint、test:market 1,027/0/7、workers 23/23、historical 4/4、build、Golden 16/16，以及 forbidden-files、secret-patterns、security-check：PASS。
- commit-bound 自治总门禁须在 clean commit 后运行；formal 未运行且禁止。

### 是否部署

未部署本修复。commit `a54811c...` 的旧身份 Bundle `5d077211...` 在 request、lease 和任何生产 mutation 前作废；远端唯一 staging 已精确清理。生产仍为 clean detached baseline、旧 Web healthy、Candidate absent、Cycle-1/Cycle-2 均 Legacy frozen。

### 风险与遗留问题

- 仍需 clean commit/push、commit-bound 自治总门禁、全新 Bundle、全新 preflight/request 和生产启动。
- Cycle-3 启动后仍必须从零通过 24 小时/289 样本与 10,000 真实 writes 双门禁。
- G0 主步骤仍为 7，不能把身份重绑 PASS 写成观察 PASS。

### 下一轮建议

只完成 Cycle-3 身份提交、全新现场绑定和受控启动；不进入 Lineage 或 Shadow Verify。

## 2026-07-18 / WP-G0.2 Cycle-3 Production Activation and Unified Observation Start

### 本轮目标

把最新冻结 Cycle-2/epoch2 严格续接为 Cycle-3，并只在完整生产即时门禁通过后启动 24 小时/289 样本与 10,000 真实 completed writes 的统一观察。

### 修改范围

- 本地生产身份重绑提交 `b098238b5d86ae6dd168c509ac1dce68e3a7adba` 已推送；未修改 scan、analysis、strategy、RR、trade plan、backtest、frontend、migration、Redis、scanner、Caddy 或 secret。
- 确定性 Bundle SHA-256=`4e438503d100a67b6c4e4744ebfc793a70134245dd9302d9616e2c353d077496`，37,692 bytes；远端运输与隔离合同验证 PASS。
- 第一次请求因 staging 0755 在 lease 和生产 mutation 前 fail closed；新 0700 staging 使用全新 nonce 与新 request，没有复用失败授权。
- 新 request SHA-256=`e4e6798c0d017840914ec4f9411b0f81401c42a015ce992e9ab2f83710772ea5`，preflight SHA-256=`decb44d34b5dc84c6c9fe4532eed19782c8167c4c557e264e51dbe78d463979a`。

### 核心链路影响

只推进候选筛选与复盘进化的数据生命周期地基；Candidate 仍是 shadow capture，不是交易信号，不改变生产排序或交易计划。

### 测试结果

- 定向 runner/bundle 15/15、治理 4/4、Production Packet 32/32、PostgreSQL 16：PASS。
- typecheck、lint、test:market 1,027/0/7、workers 23/23、historical 4/4、build、Golden 16/16：PASS。
- 三项安全门禁和 commit-bound 自治总门禁 15/15：PASS，`worktreeUnchanged=true`。
- 远端 Bundle SHA/size/`gzip -t`/`tar -tzf`、隔离生产合同、新 request validator：PASS。
- 生产即时 runner：`Result=success`、`ExecMainStatus=0`，输出 `PASS_IMMEDIATE_CYCLE_CONTINUATION_AWAITING_FRESH_ACTIVATION_AND_REAL_WRITE_ACCUMULATION`。
- 部署后 `production-check.sh`：PASS；生产 Git clean，Web/Candidate Worker running，Postgres/Redis/既有 Worker healthy。
- 脱敏生产启动证据包：`cycle3-production-start-evidence.zip`，SHA-256=`0b91a24ec574d02994936384f2d4ee14019f721f33d5d4a929727b7f11b7a5b6`，`unzip -t` PASS；只含清单、说明和四张无 secret 截图。
- formal：未运行，合同禁止。

### 是否部署

已部署腾讯生产，仅 Web 与 Candidate Worker 按批准合同构建/切换；Cycle-3=`shadow_capture`。观察单元 `market-radar-cycle-observer-b098238-196d9054` 当前 active/running。

### 风险与遗留问题

- 截至 15:44 CST 的固定快照为 3/289 样本、608 秒、3,004/10,000 completed writes、1 次真实推进；两个 readiness 均为 false。
- 观察器任何身份、健康、写入、锁等待、长事务、outbox 或连续性异常都会自动回滚到 Legacy-safe 基线。
- 即时 PASS 不等于观察 PASS；G0 主步骤仍为 7，系统仍不能支撑实战。

### 下一轮建议

只持续核验同一 observer，等待并证明 24 小时/289 连续样本与 10,000 真实 writes 双门禁；未 PASS 前不进入 Lineage。
