# Market Radar 项目总览交接文件

生成日期：2026-07-11
用途：给外部架构审计员 / ChatGPT 快速理解项目全景、边界、生产状态、代码结构、测试状态、未解决问题和下一步方向。  
敏感信息策略：所有密钥、连接串、服务器密码、cookie、token、私钥均视为 `[REDACTED]`。本文不包含真实 secret。

## 0. 最新生产事实快照

- 2026-07-12 `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA-RERUN` 已在用户明确的 Add Schema-only 90 分钟窗口内执行一次。执行前新建加密生产备份 `add-schema-preddl2-20260711T172200Z`，完成 archive、离机下载、188299934 bytes 与 SHA-256 `51130d1cb5a9c324436c076966086ae83823f3554ec422e830bd9f80c7ea299c` 一致性校验；容量 validator 于 17:31:11Z 通过 14/14，预计磁盘 29%。
- Runner `execute` 已返回 pass，锁定的 8 个 migration 全部 applied。生产人工 catalog 真值为 schema=1、tables=8、columns=151、functions=20、trigger objects=10、trigger event rows=14、roles=7、applied ledger=8；10 与 14 是 `pg_trigger` 对象数和 `information_schema.triggers` 事件行数的不同口径，不是缺 4 个触发器。
- 自动 `verify` 返回 PostgreSQL `42501 permission denied for schema candidate_authority`，本包总状态为 `PARTIAL_SCHEMA_APPLIED_VERIFY_FAILED`，不得写成 PASS。根因是 `market_radar_migration_login` 为 `NOINHERIT` 且只具备 `candidate_migration_role` membership，runner 的 post-schema `readDatabaseBoundary` 在读取 ledger 前未显式 `SET ROLE candidate_migration_role`；生产只读证据同时证明 login 直接 schema usage/ledger select=false，而 owner role=true。
- 失败后未自动 resume、重跑 migration、drop、restore、改角色或放宽权限。五个 Candidate Feature Flag 仍为 0，旧应用仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13`、worktree clean、health ready/database；17:57:46Z 至 18:27:50Z 的 30 分钟只读观察 7/7 通过，Web/Postgres/Redis 全程 healthy，长事务、idle-in-transaction、lock waiter、ungranted lock 均为 0。
- Candidate schema 现在存在但仍 dormant，writer、backfill、dual-read/read cutover、G1、R4、实盘和自动交易均未授权。系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`；下一步只能独立修复 verifier 的显式 owner-role 切换和触发器统计口径，补回归测试后申请 verify-only 生产复核，禁止再次 execute migration。
- 2026-07-11 用户批准启动“不降低质量的提速方案”。新增 `MARKET_RADAR_ACCELERATED_DELIVERY_PLAN_V1.md`，采用 Production WIP=1、Local Preparation WIP=1 的双车道；只重叠本地准备和已经获准开始的证据窗口，不改变 G0-G8 顺序、审批、RR/Risk Gate、holdout、60 天 Shadow 或 30 天 paper 要求。
- `PRODUCTION-CAPACITY-OFFHOST-RESTORE-REMEDIATION` 已达到 `PASS_CAPACITY_AND_RECOVERY_REMEDIATION`：生产只清理未使用 Docker build cache，回收 88.76 GB；根盘从 85% 降到 12%，完成两份加密备份后最终为 13%，约 99.0 GiB 可用。未 prune image/container/volume，未重启服务。
- 生产 PostgreSQL 16 custom dump 由只驻留本机的 RSA 私钥对应公钥执行 CMS AES-256 加密；私钥从未上传生产。首份 177.0 MiB 加密备份完成 checksum/archive/off-host 校验，并在本机外部隔离 PostgreSQL 16 恢复成功：12 个用户表、1 个用户 schema、RPO 14 分钟、RTO 53 秒，未输出业务行，明文 dump 和临时集群均未保留。
- 为满足 Add Schema 申请前 15 分钟新鲜度，另建并下载第二份 fresh 加密备份。容量 validator 于 2026-07-11T10:45:06Z 以保守的 2 GiB migration temp、3 GiB WAL peak、2 GiB rollback reserve 和 20 GiB safety reserve 通过 14/14 检查：预计磁盘 18%，生产可用 112.1 GB，要求余量 29.2 GB，外部恢复可用 273.0 GB。结果只允许申请审批，仍为 `authorizesMigration=false`。
- 2026-07-11 `WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION` 达到 `PASS_IDENTITY_AND_RUNNER_REMEDIATION`：生产应用已从唯一超级 LOGIN 切换到独立最小权限 Application Runtime；独立 Migration LOGIN、NOLOGIN owner、受控 Break-glass 和显式双身份 Runner 已建立。角色原名和 Secret 未进入证据。
- 生产只 recreate 了 8 个 credential-bearing 应用/worker 容器以清除旧共享凭据，未重建镜像，未重启 Postgres、Redis 或 Caddy；生产应用仍为 `0599f802f261fe8e3c1982a07106f362bd62ac13` 和原 image digest，生产 worktree before/throughout/after 均 clean。
- 身份整改轮当时 Runner 仅执行 plan/preflight/dry-run/verify；Application Runtime 被拒绝作为 migration identity。该历史轮次未执行 Candidate Migration，五个 Candidate Feature Flag 关闭。
- 生产身份切换后完成 7 次、每 5 分钟一次且总时长不少于 30 分钟的 detached 观察：Web/Scan/6 workers/Shadow/Review/Postgres/Redis、页面/API、角色会话、权限/事务错误、release/image 和 Worktree Guard 均通过。OrcaTerm 曾断线，原前台观察被废弃；重连 baseline 后改用 Ops 持久 PID/state 从零重跑，不能把中断窗口计入 PASS。
- 截至身份整改与容量/恢复 Gate 轮次，Candidate schema 尚不存在；该条是历史前置状态，已被本节顶部 2026-07-12 的 schema-applied / verify-failed 事实替代。
- 2026-07-10 已建立 Market Radar 双蓝图 v1.0：`docs/blueprints/MARKET_RADAR_ENGINEERING_BUILD_BLUEPRINT_V1.md` 规定系统怎样搭建，`docs/blueprints/MARKET_RADAR_PRODUCTION_RUNTIME_BLUEPRINT_V1.md` 规定系统怎样启动、稳态运行、降级、发布和恢复；`docs/blueprints/README.md` 是权威目录，`docs/blueprints/market-radar-blueprint-traceability.v1.json` 是机器追踪矩阵。
- 现有 `docs/chuan-market-radar-blueprint.md` 已改为兼容总索引；旧版详细内容完整保留为低优先级历史事实区，避免丢失当前工作树中的未提交历史变化。发生冲突时，当前生产事实/current evidence -> 双蓝图 -> V3/追踪矩阵 -> context/changelog -> 历史蓝图。
- 双蓝图与 V3 顺序已获用户确认，但目标合同不证明能力已经实现，也不授权跳包、扩大范围或降低门禁。当前仍是 `R1 / 可运行但不完整 / 不能支撑实战`。
- 工程蓝图以当前 Node 22、Next.js 16.2.9、React 19.2.7、PostgreSQL 16、Redis 7、Caddy 和 7 个 worker/runner 的单机 Compose 为基线；目标采用模块化单体 + 独立 worker，不为显得高级提前微服务化。
- 运行蓝图定义 11 个 Compose 服务、启动顺序、周期任务、五类健康语义、7 个核心状态/流程图、初始 SLO、error budget、18 类降级、SEV0-SEV3、RB-01 至 RB-12、发布、备份恢复、容量和 R4 暂停政策。
- 机器矩阵把 7 个核心链路环节、G0-G8、当前代码路径、目标合同、运行检查和证据逐项对应。首轮验证：JSON parse pass、当前路径缺失 0、Mermaid 13/13 有无障碍描述、敏感值 0、diff-check pass。
- WP-G0.1 已修改前端只读事实合同与展示，并完成 GitHub `main` 和腾讯 `web` 部署；未修改 DB、Redis、worker、Caddy、strategy、backtest 或 secret，未运行 migration、restore、rollback 或 formal。
- `WP-G0.2 - Candidate Lifecycle and Outcome Truth` 已完成仓库、持久化、Review、前端和生产只读审计，结论为 `PARTIAL_SCHEMA_MIGRATION_REQUIRED`；现有 mutable JSONB journal/scan-state 结构不能在数据库层保证单活跃 Episode、不可变 firstSeen、重触发继承、append-only 历史和 Outcome 只终态一次。本轮依约停止运行时代码、migration 和部署。
- `WP-G0.2-MIGRATION-DESIGN-AND-APPROVAL` 的历史审批包仍保留 `PROPOSED / approvedByUser=false` 原始事实；2026-07-10 用户通过独立执行合同明确授权后续 `WP-G0.2-MIGRATION-IMPLEMENTATION-AND-REHEARSAL`，该授权只覆盖正式 migration 实现和隔离演练，不改写旧审批包，也不授权生产 migration。
- `WP-G0.2-MIGRATION-IMPLEMENTATION-AND-REHEARSAL` 已达到 `PASS_IMPLEMENTATION_AND_REHEARSAL`：8 个 additive migration 覆盖批准 registry 的 8 表/151 字段，Episode/Event/Checkpoint/Outcome/Legacy/Outbox、同连接事务、并发幂等、lease/fencing、eg.v1、数据库角色和 deny guard 已实现；空库、上一稳定 12 表 schema、checksum drift、失败回滚、备份恢复和恢复后事务 smoke 均在 `wp_g0_2_rehearsal_*` 本地 Unix socket 数据库通过。
- 本轮真实 PostgreSQL 集成 5/5、候选域普通测试 88 pass/1 DB skip、全量 market 924 pass/1 DB skip、worker 17/17、historical 4/4、golden 16/16、typecheck/lint/build/forbidden/secret/security 均通过；真实 DB 套件按隔离环境单独实跑，不用普通门禁中的 skip 冒充通过。
- `WP-G0.2-MIGRATION-PRODUCTION-ADD-SCHEMA` 已执行到生产只读 PostgreSQL preflight 后按硬门禁停止；migration 未执行。一次 OrcaTerm 复杂输入误生成 0 字节未跟踪文件，曾使生产 worktree 变脏并触发绝对禁止条款，因此本包总状态必须为 `FAIL_PRODUCTION_BOUNDARY_VIOLATION`，不能仅写成 preflight PARTIAL。生产只有 1 个 LOGIN 数据库角色；它同时是当前应用连接角色，并具有 SUPERUSER、CREATEDB、CREATEROLE、REPLICATION、BYPASSRLS。批准设计中的 7 个 Candidate NOLOGIN 角色均不存在，也没有独立 production migration LOGIN 身份。
- 生产 preflight 的非权限指标正常：PostgreSQL 16.14、连接 9/100、idle-in-transaction=0、长事务=0、lock waiter=0、ungranted lock=0；生产 Candidate authority schema 仍不存在（0 表/0 字段/0 函数/0 trigger），旧 catalog fingerprint 已脱敏记录。由于 migration identity Gate 失败，本轮没有创建生产备份、异地副本、restore drill、detached staging worktree，也没有执行 migration 或 30-60 分钟 post-migration observation。
- 本轮生产应用仍为 `main@0599f802f261fe8e3c1982a07106f362bd62ac13`，Web image、Worker、Shadow、Postgres、Redis 未重建或重启；结束时生产 worktree clean，health/scan 为 ready/fresh。误生成的 0 字节未跟踪文件已在用户明确批准后删除并复核 clean；未触碰跟踪文件、业务数据或 Schema，但最终 clean 不撤销边界失败判定。
- 本轮未写入生产业务数据、未执行 production migration、未改变生产 schema、未部署腾讯云应用、未开启 production shadow/dual-write/read cutover、未运行 formal。代码和隔离演练 PASS 不等于 `WP-G0.2`、G0 或实战能力完成。
- routine deploy/verify 脚本中的隐式 `/api/admin/persistence/migrate` 调用已从代码中移除，改为要求独立批准 runbook；该安全改动尚未部署腾讯云。当前唯一下一建议是另行审批 `WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION`，先建立与应用角色隔离的 migration 身份和可审计 production runner，再重跑 add-schema；当前 `canEnterProductionAddSchema=false`。
- 2026-07-10 已把两份历史 Master Plan、v2、最新 `53/100` 全系统审计、当前代码和当前只读生产点样本合并为唯一建议版 `Market Radar Practical Readiness Master Plan v3`：`docs/superpowers/plans/2026-07-10-market-radar-practical-readiness-master-plan-v3.md`。v2 已标记 `SUPERSEDED`，只保留审计历史。
- 历史方案的 46 项任务已逐项清洗为 completed / partial / superseded / deferred / not started，机器可读矩阵位于 `docs/superpowers/plans/2026-07-10-market-radar-v3-current-state-matrix.json`。CoinGlass 旧鉴权故障已归档为历史事故，不再冒充当前主阻断。
- V3 是已确认的顺序化建设与验收方案，不是实战能力证明；每个 work package 仍需独立范围锁定、门禁、部署证据和人工审计。
- 当前真实等级是 `R1 - 生产研究平台 / 可运行但不完整 / 不能支撑实战`。`53/100` 是最近架构审计分，不是实战 readiness 分。
- 当前生产验收点样本：`/api/health` 为 `ready / fresh`，六个业务 worker 当下 healthy；公开市场 observed=3112、accepted=1316，scan eligible=593，current-cycle=24，deep-scanned=48。前端合同分别显示公开接受率 42.3%（accepted/observed）、当前周期覆盖率 4.0%（current-cycle/eligible）和深扫覆盖率 8.1%（deep/eligible）。
- 当前公网入口仍为明文 `http://43.161.202.227`，浏览器标记“不安全”。这是新的 P0；Caddy 配置和 private-session 代码本地存在，不等于生产 HTTPS / private mode 已通过。
- 当前生产 frontend contract 返回 radarSignals=30、`TRADE_PLAN_READY=0`。生产旧 Review 点样本为最新 120 条 journal event，其中 closed=51、claimed evidence=61、pending=59、MFE/MAE=0；这些状态会重叠且 null 会被补 0，只能作为 legacy diagnostics，不能作为 Candidate Episode/Outcome 权威分母。生产 active/closed episode 和五类 outcome 数量当前应为 unavailable，不得写成 0。
- 当前活动 P0 包括公网明文 HTTP、Candidate/Outcome 权威 runtime 尚未接入、post-schema verifier 未收口、轻扫 `topCandidates` 仍被合成为 `RadarSignal`、Review neutral/unknown→long、null→0、pending/error→timeout 和事件行分母污染。WP-G0.1 的单一扫描证明和 leaderboard fallback 防线仍保留，但全站 frontend truth 已重开为 partial。
- 历史数据库超级权限依赖、加密离机备份和恢复演练前置风险已分别由 identity remediation 与 capacity/off-host restore 包关闭；当前新的数据库 P0 是 post-schema verifier 在 NOINHERIT membership 下未显式 `SET ROLE`，不是生产应用重新获得超级权限。
- v3 将路线重排为 G0-G8：事实/安全/生命周期/发布 -> 可靠性/恢复/安全/E2E -> 数据质量/身份/深扫 -> 候选与提前发现 -> 分析/策略/风险 -> 真实 Shadow/outcome -> 专业工作台/三模式复盘 -> 30 天模拟与 R4 审核 -> R5 长期治理。
- R4 只表示“受控人工实战决策辅助”，不表示保证盈利或自动交易。首次 R4 审核现实周期约 9-12 个月；必须 readiness >=85/100、各分项达标、无一票否决，并具备独立 holdout、至少 60 天真实 Shadow、30 天模拟决策、SLO、restore drill 和安全证据。
- 历史设计与 implementation/rehearsal 包已落成正式 migration；生产 schema 已于 2026-07-12 additive 应用，但 runtime 仍未接入，自动 verify 尚未 PASS。
- 当前只允许审计本轮 schema-applied / verify-failed 证据。Codex 不得代批；再次明确批准前不能运行 verify-only 修复复核，更不能再次 execute migration、启用 writer、backfill、read cutover、G1、R4 或实盘。

- 第 5.1-DEPLOY-CHANNEL-FIX 已完成腾讯云部署通道恢复诊断，结论为 `PASS_DEPLOY_CHANNEL_RECOVERED_VIA_ORCATERM`。本轮没有修改项目业务代码、没有同步服务器代码、没有部署、没有 Docker build/up/restart、没有运行 formal、没有动 DB/Redis/Postgres/volume、没有读取 `.env`/`.env.production` 原文、没有输出 secret 或 SSH 私钥。
- 第 5.1-DEPLOY-CHANNEL-FIX 证据显示：Chrome 里没有 OrcaTerm；用户打开 Microsoft Edge 中的腾讯云 OrcaTerm 后，Codex 通过 Computer Use 可控该页面，并以 `ubuntu@VM-0-9-ubuntu` 完成服务器只读 smoke。只读 smoke 覆盖 `whoami`、`hostname`、`pwd`、UTC date、`uname`、Docker/Compose 版本、项目目录访问、`ls -la`、`docker compose ps` / `sudo -n docker compose ps`。观察到 caddy、web、scanner-worker、coinglass-worker、dynamic-scan-scheduler、websocket-light-worker、signal-worker、macro-worker、shadow-runner、postgres、redis 等服务均在运行，web/postgres/redis 为 healthy。
- 第 5.1-DEPLOY-CHANNEL-FIX 仍保留边界：direct SSH 到腾讯云 22 端口超时；SOCKS 代理和 SOCKS 到目标 22 的 TCP connect 可用，但 SSH 在 KEX/banner 前后被关闭，没有进入 `Offering public key`、`Server accepts key` 或 `Authenticated`。当前恢复的是 Edge OrcaTerm 通道，不是 SSH 通道。下一步可以进入 `5.1-H.1-R.2-SCAN-FIX-PROD` 前置，但必须重新确认授权、备份、allowlist、只重建必要服务、30-60 分钟观察和 production evidence validate；仍不能进入 5.1-H / 5.2 / 实盘。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 已通过 Edge OrcaTerm 实际部署 14 个 allowlist 文件到腾讯云生产，结论为 `FAIL_PRODUCTION_SCAN_HEALTH_AFTER_DEPLOY`，不是 PASS。本轮创建服务器外部备份、完成 bundle hash 校验、应用 14 文件、重建并启动 `web` / `scanner-worker` / `coinglass-worker` / `dynamic-scan-scheduler`；没有 push main、没有运行 formal、没有动数据库/Redis/Postgres/volume、没有自动下单或新增交易 API。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 部署过程有一个已处理的部署工件问题：首次 Docker build 因备份目录位于项目根目录导致 Next/TypeScript 扫描备份源码而失败；备份已移动到 `/home/ubuntu/market-radar-backups/...`，项目根目录备份代码残留清除后，目标服务 build/up 重试通过。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 部署后验证显示 API 存活但 scan 主链路失败：GET `/api/health`、`/api/scan`、`/api/radar/backend-contract`、`/api/frontend/radar-contract` 均 HTTP 200；POST `/api/scan` 无密钥/错密钥为 401、正确密钥为 200；但 30 分钟有效观察 7/7 样本均为 `scanStatus=partial`、`scannedCount=0`、`candidateCount=0`、`signalsCount=0`、`scanCriticalStatus=failed`、`coinglassStatus=auth_error`、`deepScanStatus=auth_error`。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 本地门禁通过：observability test 15/15、typecheck、lint、test:market 835 + worker 17 + historical 4、build、backtest:golden 16/16、test:production-evidence 15/15、forbidden-files、secret-patterns、security:check；formal 未运行。服务器 web 容器内 real production evidence 生成成功，但 validate 正确失败：production health/status 不是 pass，`production-scan.json.scanGate.ok` 不是 true，`CoinGlass auth_error cannot pass real_production evidence`。
- 第 5.1-H.1-R.2-SCAN-FIX-PROD 下一步不能进入 5.1-H.1-R.2-RERUN / 5.1-H / 5.2 / 实盘；唯一下一步是修复腾讯云生产 CoinGlass `auth_error` / 运行时 key 或 provider capability 问题，再只重启必要服务并重跑 post-deploy validation、30 分钟观察和 real production evidence validate。
- 第 5.1-H.1-R.2-RERUN 已重跑 `Checkpoint Outcome 生产口径最终验收`，结论为 `PARTIAL_RUNTIME_HEALTH_REGRESSION`，不是 PASS。本轮未修改业务代码、未修改策略/扫描/UI 交易逻辑、未运行 formal、未动数据库/Redis/Postgres/volume、未 push main。
- 第 5.1-H.1-R.2-RERUN 证据显示：公网 Caddy API 可访问，`/api/health` HTTP 200，`health.level=ready`，但 `scan.status=partial`；第二次复查时 `scan.freshness=aging`，`/api/scan` 仍为 partial，CoinGlass requestFailures 包含 EDGE / USELESS 的 429 Too Many Requests。
- 第 5.1-H.1-R.2-RERUN 生产 evidence validate 正确失败：`phase4-3-1-summary.json.production_status must be pass`。按任务书要求，Step 0 运行健康回退时必须停止，因此本轮未继续执行 runner loop 两周期观察、dry-run、manual checkpoint、daily summary 或 server backup。
- 第 5.1-H.1-R.2-RERUN 下一步只能先恢复生产 `scan.status=ready` 并让 production evidence validate pass，然后从 Step 0 重跑本轮；不能进入 5.1-H，不能进入 5.2，不能写成支撑实盘交易。
- 第 5.1-H.1-R.2 已完成 `Checkpoint Outcome 生产口径最终验收`，结论为 `PARTIAL_NEEDS_RUNNER_LOOP_FIX`，不是 PASS。生产 runtime health、CoinGlass、worker heartbeat、scan freshness、production evidence validate 均已恢复并通过；manual checkpoint / dry-run / idempotency / missing price handling / research-only 隔离均通过。
- 第 5.1-H.1-R.2 证据显示：runId=`shadow-v1-20260707T182114Z`，checkpoint total=3636，due_total=2448，due_pending 从 148 降到 0，outcomes.jsonl 行数从 2300 增至 2448。新增 outcome 均因旧 Shadow baseline 缺 `priceAtObservation` 被正确标记为 `pending_with_error / MISSING_PRICE_AT_OBSERVATION`，没有伪造历史价格、没有 fake outcome、没有 future data leak。
- 第 5.1-H.1-R.2 阻断点：Shadow runner loop 未保持运行，runner lock pid 不存活，heartbeat stale，未观察到自动 capture/checkpoint due sweep。本轮只能证明 manual checkpoint 闭环，不得进入第 5.1-H 24h Shadow Health Review，不得进入 5.2，不得写成支撑实盘交易。下一步必须先修复 Shadow runner loop 启动/保活/自动 due sweep，再重跑 5.1-H.1-R.2。
- 第 5.1-H.1-R.1 已完成 `Production Evidence Health / Status Partial 收口`，结论为 `PARTIAL_PRODUCTION_STATUS_NOT_READY`，不是 PASS。生产 API 可访问，但真实生产状态仍为 partial，不能进入 5.1-H.1-R.2，不能进入 5.2，不能写成支撑实盘交易。
- 第 5.1-H.1-R.1 证据显示：`/api/health` HTTP 200、`level=ready`、Postgres ready、Redis healthy、`scan.freshness=fresh`，但 `scan.status=partial`；scanner-worker、websocket-light-worker、coinglass-worker、signal-worker、dynamic-scan-scheduler、macro-worker 均未收到心跳，worker heartbeat 状态为 down。
- 第 5.1-H.1-R.1 证据显示：`/api/scan` HTTP 200，但 `scan.status=partial`、`scannedCount=0`、`candidateCount=0`、`/api/scan signals=0`。公开发现层仍可用，liveInstrumentCount=1315；CoinGlass 深扫计划请求 24 次，但 rawRows=0、cleanRows=0、requestFailures=24。
- 第 5.1-H.1-R.1 证据显示：后端合同中 CoinGlass runtime capability 为 `deepScanStatus=auth_error`，`/api/futures/pairs-markets` 返回 `Invalid API key provided`。这不是“市场无机会”，而是生产 CoinGlass 深扫鉴权/运行状态未恢复。
- 第 5.1-H.1-R.1 已修复 production evidence 工具口径：本地验证生产 API 时支持 `OPS_PROXY_URL` 只读采集；production status 不再复用旧 `production-health.json` / `production-smoke.json`；`scan.status` 与 `scan.freshness` 分离；worker heartbeat down 会使 health/status 保持 partial；validator 未被弱化，仍要求 `production_health=pass` 与 `production_status=pass`。
- 第 5.1-H.1-R.1 production evidence 已重新生成，但 validate 正确失败：`phase4-3-1-summary.json.production_health must be pass`、`phase4-3-1-summary.json.production_status must be pass`。本轮没有伪造 pass，没有降低 validator 标准，没有修改 scan / analysis / strategy / UI 交易逻辑，没有运行 formal，没有动数据库、Redis、Postgres 或 volume。
- 第 5.1-H.1-R.1 下一步必须先修复腾讯云生产 CoinGlass API key / 套餐鉴权和 worker heartbeat，再重跑本轮生产证据。当前不能进入 `5.1-H.1-R.2 checkpoint outcome 生产口径最终验收`。
- 第 5.1-H.1-R 已执行到本地准备与安全分支阶段，结论为 `PARTIAL_LOCAL_FIX_NOT_APPLIED`，不是生产 PASS。安全分支 `codex/phase5-1-h-1-r-checkpoint-outcome-production-validation` 已推送，commit 为 `8518a14dcf03cd70e5470c3c9fd81e6e23a5dcb2`，只包含 `src/lib/shadow/storage.ts`、`src/scripts/shadow/shadow-tracking.ts`、`src/lib/shadow/storage.test.ts` 三个 Shadow 修复文件。
- 第 5.1-H.1-R 未能应用到腾讯云 live Shadow Runner：直接 SSH 超时，代理 SSH 到达认证阶段但失败，Codex 内置浏览器未暴露 OrcaTerm 标签。公网 `/api/health` 经代理返回 ready/fresh 只能证明生产当前可访问，不能证明本轮修复已应用。
- 第 5.1-H.1-R 当前边界：未创建服务器备份，未同步服务器 worktree，未执行服务器 dry-run/manual checkpoint/idempotency/runner-loop 验证，未验证 production isolation。下一步仍必须在可控腾讯云终端中应用安全分支并重跑 5.1-H.1-R，不能进入 5.2，不能写成支撑实盘交易。
- 第 5.1-H.1 已完成本地 `Checkpoint Outcome 回填闭环修复`，结论为 `PARTIAL_LOCAL_FIX_READY`，不是生产 PASS。当前未 push main、未运行 formal、未动数据库/Redis/Postgres/volume、未应用到腾讯云 Shadow Runner。
- 第 5.1-H.1 修改范围只限 Shadow research-only checkpoint/outcome：新增 checkpoint outcome writer、Binance Futures 历史 K 线 price source adapter、`shadow:checkpoint -- --dry-run`、幂等写入、latest/daily summary checkpoint 状态同步、runner loop 每次 capture 后的轻量 due sweep。未修改 scan / analysis / strategy / UI 交易逻辑，未降低 RR，未开启自动交易。
- 第 5.1-H.1 本地验证 runId 为 `shadow-20260707T134822Z`。修复前 checkpoint total=72、due=48、duePending=48、recorded=0、missed=0、pending_with_error=0；修复后 duePending=0、pending=24、recorded=0、missed=0、pending_with_error=48，`outcomes.jsonl` 写入 48 行。
- 第 5.1-H.1 的 recorded 仍为 0 是合理结果：本地 5.1 legacy baseline 缺少 `priceAtObservation`，系统按规则标记 `pending_with_error / MISSING_PRICE_AT_OBSERVATION`，没有伪造检测价、没有计算 rawMove/MFE/MAE、没有使用当前价冒充历史价。
- 第 5.1-H.1 基础门禁通过：typecheck、lint、shadow:validate、shadow:checkpoint dry-run、shadow:checkpoint、shadow:daily-summary、Shadow storage 单测 13/13、test:market 827 + worker 17 + historical smoke 4、build、backtest:golden 16/16、forbidden-files、secret-patterns、security-check。
- 第 5.1-H.1 下一步必须是 `phase5_1_h_1_r_checkpoint_outcome_validation`：把该修复应用到腾讯云 research-only Shadow Runner 后，验证生产 live run 的到期 checkpoint 是否能回填为 recorded / missed / pending_with_error。完成前不能重跑 5.1-H 写 PASS，不能进入 5.2，不能写成支撑实战交易。
- 第 5.1-H-pre 已完成 Shadow Checkpoint Due / Outcome Precheck，结论为 `PARTIAL_NEEDS_5_1_H_1`，不是 24h PASS。runId 仍为 `shadow-v1-20260707T182114Z`。
- 第 5.1-H-pre 服务器侧证据显示：checkpoint total=2664、due=1464、pending=2664、recorded=0、missed=0、pending_with_error=0、due_pending=1464；其中 1h due pending=833、4h due pending=631、24h due pending=0。
- 第 5.1-H-pre 已在腾讯云 web 容器内显式 `--out-dir /app/reports/phase5-1-1-tencent-shadow-runner-start/shadow --run-id shadow-v1-20260707T182114Z` 执行 manual checkpoint、validate、daily-summary。执行安全，未发现 fake outcome、未污染 production ranking、未开启自动交易；但 manual checkpoint 只刷新 `checkpoint-status.json`，不会回填 `priceAtCheckpoint`、MFE/MAE，也不会把 checkpoint 标成 recorded/missed。
- 第 5.1-H-pre 明确发现 P1：runner loop 当前只做 capture 和 heartbeat，不调用 checkpoint；`priceAtObservation` 当前缺失，`priceAtCheckpoint` 无真实价格源和写入逻辑；manifest 声明 `outcomesPath`，但当前没有实际 outcomes writer。因此下一步必须做 `5.1-H.1 checkpoint outcome 回填闭环修复`，不能直接等 24h 重跑，也不能进入 5.2。
- 第 5.1-H-R 已重跑 Shadow Runner 24h 健康复查，结论仍是 `PARTIAL_NOT_DUE`，不是 24h PASS。runId 为 `shadow-v1-20260707T182114Z`，startedAt 为 `2026-07-07T18:21:14.045Z`，服务器采集时间为 `2026-07-08T06:25:07Z`，已运行约 12.06 小时，预计 24h 到期时间为 `2026-07-08T18:21:14.045Z`。
- 第 5.1-H-R 已用腾讯云服务器内侧口径复取当前 runner：PID 737 alive，cmdline 为 `shadow-tracking.js run-loop`，lock/runId 一致，heartbeatAt 为 `2026-07-08T06:21:27.798Z`，heartbeat fresh。Shadow 仍为 research-only，enrichment gate pass，production evidence validate pass。
- 第 5.1-H-R 当前结论：可以继续 Shadow 观察态运行，但不能进入第 5.2，不能写成支撑实战交易；checkpoint dueCount 为 1323 且仍为 pending，说明 outcome 回填闭环尚未证明可用；Shadow manifest 记录的 production commit `45d854afafb9ba7931a30973bf8e553cd0b91f7d` 与当前服务器 HEAD `ae6852cfa2a2c9c09faa5d41ae6f5c886f023679` 不一致，后续正式 24h 验收必须收口。
- 第 5.1-R 已补齐 Shadow Tracking v1 正式启动代码入口、统一决策 enrichment gate、runner CLI 和测试保护，但本轮没有成功启动长期 Shadow Tracking。
- 第 5.1-R 启动命令已执行：`shadow:start --no-background --out-dir phase5-1-r-shadow-v1-start`。结果为 `PARTIAL / preflight_failed`，原因是当前执行环境访问生产公网入口失败：`production_health_fetch_failed:fetch failed`、`enrichment_preflight_failed:fetch failed`。
- 第 5.1-R 硬边界：`shadowTrackingStarted=false`，没有生成 running run，没有 first capture，没有 checkpoint plan，不允许写成已开始样本积累。下一步必须在腾讯云服务器侧或稳定生产访问通道中启动 runner。
- 第 5.1-R 本地基础门禁通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns、security-check、test:production-evidence、shadow:validate。
- 第 5.1 已建立 Shadow Tracking v1 文件存储基线与 run manifest：`reports/shadow-tracking/` 已生成 `manifests/current-run.json`、`events/<runId>/events.jsonl`、`events-manifest.json`、`checkpoint-plan.json`、`latest.json`、`latest.md`。
- 第 5.1 runId：`shadow-20260707T134822Z`；捕获来源为生产 `/api/scan` 快照，生产 commit `ae6852cfa2a2c9c09faa5d41ae6f5c886f023679`，production health `pass`，production evidence validate `pass`。
- 第 5.1 baseline 捕获：24 个生产信号事件、24 个唯一币种、72 个待记录 checkpoint（1h/4h/24h），READY=0，OBSERVE=16，WAIT=1，BLOCKED=7。
- 第 5.1 边界：`shadowTrackingStarted=false`，只做 baseline readiness，不启动 7-14 天 Shadow Tracking，不写未来 outcome，不修改 production ranking，不自动调参，不自动下单，仍不能写成支撑实战交易。
- 第 5.0-R 已在 CoinGlass key 修复后重跑生产基线：生产 commit `ae6852cfa2a2c9c09faa5d41ae6f5c886f023679`，与本地安全分支 HEAD 一致；本轮未 push main、未部署、未运行 formal、未动 Postgres / Redis / volume。
- 第 5.0-R 生产 API 复查：`/api/health` 3/3 HTTP 200 ready/fresh，`/api/scan` 3/3 HTTP 200 ready，`/api/radar/backend-contract` 3/3 HTTP 200 且 CoinGlass deep scan ready。
- 第 5.0-R 连续扫描观测：3 轮 `scannedCount=28`、`candidateCount=23`、`anomalyCount=23`、`radarSignals=23`，CoinGlass `invalid_key=0`，CoinGlass `429=0`。
- 第 5.0-R 复查结论：CoinGlass key 修复后的扫描基线已恢复，production smoke/status pass，unifiedDecision / overlay guard 未退化；但 Shadow Tracking 专用 report/storage/run manifest 仍为 partial。
- 当前可把第 5.1 存储基线交给 GPT 审计；审计确认后才可进入第 5.1-R 正式启动长期 Shadow Tracking。仍不能写成支撑实战交易。
- 第 5.0 基线曾发现腾讯云生产 CoinGlass 深扫全部失败，错误为 `Invalid API key provided`，导致 `scannedCount=0`、scan `partial`，不能进入 Shadow Tracking。
- 第 5.0.1 生产检查确认：服务器 `.env.production` 中的 `COINGLASS_API_KEY` 与运行中容器读取到的 key 指纹不一致；根因是 app 容器仍读取旧环境变量。
- 第 5.0.1 已只重建 app 容器，不动 Postgres / Redis / volume / schema。重建后 `web`、`scanner-worker`、`coinglass-worker` 等服务读取同一 CoinGlass key 指纹；真实 key 值未输出。
- CoinGlass capability probe 已从 `auth_error` 恢复为 `ready`，可用端点包括 `futures_pairs_markets`、`open_interest_current`、`funding_current`；`taker_buy_sell_current` 仍为不可用/受限边界。
- 生产深扫已重新返回真实数据：基线轮出现 `scannedCount=31`、`candidateCount=23/24`、`coinglass request failures` 不再是 invalid key。
- 当前仍不能写成实战成熟：最新一轮深扫出现单个 CoinGlass `429 Too Many Requests`，scan 可为 `partial`。这是限速/节流风险，不是 key 鉴权失败。

## 1. 项目一句话定义

Market Radar 是一个面向山寨币合约市场的雷达系统，用于快速全市场扫描，发现山寨币机会，给出策略，并通过复盘持续自我提升。

## 2. 项目唯一核心目标

唯一核心目标：

```text
快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。
```

四个核心能力：

1. **快速全市场覆盖扫描**：尽快覆盖 Binance / OKX / Bybit 等公开合约市场，发现哪些币开始异常波动。
2. **发现真正有价值的机会**：从涨跌幅、成交、压缩、相对强弱、关键位、衍生品验证中筛出值得继续深扫的标的。
3. **给出可执行、可解释、可失效的策略**：明确为什么看、能不能做、触发条件、止损、目标、结构盈亏比、失效条件。
4. **通过复盘持续自我提升**：追踪命中、失败、超时、漏判、错判、策略分型表现，避免系统只会展示而不能进化。

当前必须诚实说明：系统已具备可运行的扫描、展示、生产部署和部分复盘基础，但仍不能写成“实战成熟交易系统”。

## 3. 核心链路

固定链路：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

### 3.1 全市场发现

- 环节：全市场发现
- 负责目录：`src/lib/market`、`deploy/workers`
- 关键文件：`src/lib/market/universe-registry.ts`、`src/lib/market/providers/public-futures-universe-discovery.ts`、`src/lib/market/providers/public-light-scan.ts`、`src/lib/market/ws-light-scan.ts`、`deploy/workers/ws-light-scan-worker.mjs`
- 输入：Binance / OKX / Bybit public universe、public ticker、WebSocket 轻扫数据、Redis 轻扫快照
- 输出：可扫描 universe、轻扫覆盖数、轻扫候选、实时能力状态、扫描证明
- 当前状态：生产 smoke 显示 totalMonitored=593、scannable=593、lightScanned=593、coverage=100；WebSocket secondLevelOnline=true
- 主要风险：轻扫只能发现异常，不能生成交易计划；WebSocket 快照 stale 时必须明确降级；全市场覆盖成功不等于机会筛选成熟

### 3.2 候选筛选

- 环节：候选筛选
- 负责目录：`src/lib/market`、`src/lib/api`
- 关键文件：`src/lib/market/scan-state-pool.ts`、`src/lib/market/scan-coordinator.ts`、`src/lib/market/universe-priority-hints.ts`、`src/lib/api/backend-contract.ts`
- 输入：轻扫候选、状态池、历史 hints、daily mover 样本、候选轮换状态
- 输出：深扫排队、当前批次、长时间未扫资产、候选分层、rotation audit
- 当前状态：已有状态池、两阶段 allocation、rotation audit；第一轮修复了 `WARM` 资产深扫排队证明边界
- 主要风险：候选排序主干仍需长期验证，不能让少数热门币长期霸占 Top10；候选不能冒充信号

### 3.3 深扫验证

- 环节：深扫验证
- 负责目录：`src/lib/market/providers`、`deploy/workers`
- 关键文件：`src/lib/market/providers/coinglass-provider.ts`、`src/lib/market/providers/coinglass-client.ts`、`src/lib/market/providers/coinglass-capability-probe.ts`、`deploy/workers/protected-api-worker.mjs`
- 输入：深扫候选、CoinGlass Hobbyist 可用端点、公开交易所衍生品补充数据
- 输出：OI、Funding、pairs markets、CoinGlass capability、深扫 cleanRows/rawRows/failures
- 当前状态：第 5.0.1 已修复生产容器读取旧 CoinGlass key 的问题；capability probe 为 `ready`，`futures_pairs_markets`、`open_interest_current`、`funding_current` 可用；生产 scan 已重新出现 `scannedCount=31`，不再是 invalid key 导致的 0 深扫。
- 主要风险：CoinGlass Hobbyist 有限速和端点边界；最新基线仍出现单个 `429 Too Many Requests`，scan 可能为 `partial`；CoinGlass 失败不能写成市场无机会；公开交易所深扫不能冒充 CoinGlass

### 3.4 结构分析

- 环节：结构分析
- 负责目录：`src/lib/analysis`、`src/lib/analysis/v3`
- 关键文件：`src/lib/analysis/v3/market-reading-engine.ts`、`src/lib/analysis/v3/key-level-engine.ts`、`src/lib/analysis/v3/forward-level-map.ts`、`src/lib/analysis/v3/pattern-library.ts`、`src/lib/analysis/v3/current-signal-dossier.ts`
- 输入：OHLCV、关键位、趋势完整度、形态、技术指标辅助、宏观锚点、衍生品证据
- 输出：结构判断、关键位、Forward Map、证据链、反证链、成熟度
- 当前状态：已有 v3 结构分析骨架和测试；TradingView/Kline 合同已有基础；但分析报告可读性和实战稳定性仍需要专业回测继续校验
- 主要风险：技术指标不能单独给结论；低周期不能推翻高周期；大涨后看多/大跌后看空容易晚到

### 3.5 风险赔率

- 环节：风险赔率
- 负责目录：`src/lib/analysis/v3`、`src/lib/risk`
- 关键文件：`src/lib/analysis/v3/trade-plan.ts`、`src/lib/analysis/v3/forward-level-map.ts`、`src/lib/risk/personal-position-lens.ts`
- 输入：入场触发、止损、目标、关键位、结构空间、个人杠杆展示参数
- 输出：结构盈亏比、风控门禁、是否允许生成计划
- 当前状态：最低结构盈亏比 3:1 是硬下限；个人仓位镜头用于展示风险，不允许改变结构 RR 逻辑
- 主要风险：策略层容易卡死或过松；止损/目标位必须更聪明而不是单纯放宽；杠杆展示不能绕过风控门禁

### 3.6 交易计划

- 环节：交易计划
- 负责目录：`src/lib/analysis/v3`、`src/lib/api`、`src/components/token`
- 关键文件：`src/lib/analysis/v3/trade-plan.ts`、`src/lib/market/signal-backend-dossier.ts`、`src/app/api/frontend/token-dossier/route.ts`、`src/components/token/token-dossier.tsx`
- 输入：证据融合、结构分析、风险赔率、风控门禁、成熟度
- 输出：可执行计划、等待条件、失效条件、分批止盈、不可交易原因
- 当前状态：已有 token dossier 和 strategyV3 输出基础；计划复核区只允许后端事实源确认的 `TRADE_PLAN_READY`
- 主要风险：前端不能编计划；`WAIT` 不能冒充 `READY`；没有计划就绪时宁可空，不允许候选补位

### 3.7 复盘进化

- 环节：复盘进化
- 负责目录：`src/lib/analysis/v3`、`src/lib/market`、`src/lib/api`、`src/app/review`
- 关键文件：`src/lib/analysis/v3/forward-map-review.ts`、`src/lib/analysis/v3/forward-map-review-executor.test.ts`、`src/lib/market/daily-mover-ingest.ts`、`src/lib/market/daily-mover-kline-backtest.ts`、`src/app/api/frontend/review-contract/route.ts`
- 输入：信号生命周期、daily movers、后续价格路径、MFE/MAE、命中/失败/超时、漏判样本
- 输出：复盘报告、策略分型统计、错判/漏判归因、下一步规则建议
- 当前状态：已有 review contract、daily mover、outcome、forward map review 基础；但样本和能力验收仍不足
- 主要风险：回测 future outcome 不得污染 production score；复盘结论不能自动改生产权重；当前系统仍需要更多真实样本验证

## 4. 当前技术架构

- 前端：Next.js App Router + React + TypeScript + Tailwind，页面位于 `src/app`，组件位于 `src/components`
- 后端：Next.js Route Handlers，核心 API 位于 `src/app/api`，业务逻辑主要位于 `src/lib`
- 数据库：PostgreSQL，生产由 Docker Compose `postgres` 服务提供，持久化通过 repository 层访问
- 缓存：Redis，生产由 Docker Compose `redis` 服务提供，用于 WebSocket 轻扫快照、运行状态等
- worker：Docker Compose worker 服务，包括 scanner、websocket light scan、coinglass、signal、dynamic scheduler、macro
- 反代：Caddy，配置位于 `deploy/caddy/Caddyfile`
- 部署：Docker Compose 单机部署
- 代码正本：GitHub `main`
- 生产服务器：腾讯云香港单机
- reports volume：Docker volume `reports-data`，挂载到 `/app/reports`
- 重要边界：Vercel / Neon 已不再是主部署路线，但旧配置未必全部删除；当前生产主线是腾讯云香港单机

## 5. Docker 服务清单

| 服务名 | 作用 | 启动命令 | 依赖 | 是否核心 | 当前风险 |
|---|---|---|---|---|---|
| `web` | Next.js 前端和 API 服务 | Dockerfile 默认启动 `npm run start` | postgres、redis | 是 | Web 健康依赖 `/api/health`，如果只页面 200 不代表业务实战成熟 |
| `caddy` | 公网 HTTP/HTTPS 入口和反向代理 | `caddy run --config /etc/caddy/Caddyfile` | web healthy | 是 | Caddy 正常只能证明入口可访问，不能证明分析能力 |
| `postgres` | 生产关系数据库 | postgres 官方镜像 entrypoint | 无 | 是 | 不允许在普通轮次清表/迁移；备份恢复演练仍应持续验证 |
| `redis` | 缓存、WebSocket 轻扫快照、运行状态 | `redis-server --appendonly yes` | 无 | 是 | Redis 正常不代表快照新鲜，必须看 stale/age |
| `scanner-worker` | 定时触发 `/api/scan` | `node deploy/workers/protected-api-worker.mjs scanner` | web healthy | 是 | CRON_SECRET 错误会导致扫描停摆；served_cache 不能冒充 updated |
| `websocket-light-worker` | Binance/OKX/Bybit WebSocket 秒级轻扫 | `node deploy/workers/ws-light-scan-worker.mjs` | redis、web | 是 | 秒级轻扫只做发现和调度，不能直接生成交易计划 |
| `coinglass-worker` | daily mover ingest 和 K 线缓存填充 | `node deploy/workers/protected-api-worker.mjs coinglass` | web healthy | 是 | CoinGlass 限速/端点不可用必须 partial/unavailable，不可静默降级成假数据 |
| `signal-worker` | outcome、forward map review、shadow tracker | `node deploy/workers/protected-api-worker.mjs signal` | web healthy | 是 | 复盘结果不能污染生产排序或实时评分 |
| `dynamic-scan-scheduler` | health watch 和动态扫描调度辅助 | `node deploy/workers/protected-api-worker.mjs dynamic` | web healthy | 是 | 只能调度/观察，不能绕过扫描链路边界 |
| `macro-worker` | 宏观环境采集 | `node deploy/workers/protected-api-worker.mjs macro` | web healthy | 辅助核心 | 宏观环境只能做顺风/逆风背景，不能直接给个币方向 |

## 6. 主要页面说明

| 页面 | 页面作用 | 主要 API / 数据入口 | 展示什么 | 不能展示什么 | 是否可能误导用户 | 当前状态 |
|---|---|---|---|---|---|---|
| `/dashboard` | 雷达总控 | `getRadarContractForPage`、`getLeaderboardContractForPage`、`/api/frontend/radar-contract` | 系统状态、覆盖率、候选池摘要、轻扫/深扫、数据源、大盘环境 | 不能把候选当交易推荐 | 是，如果只看卡片不看成熟度 | 可访问；production smoke 200 |
| `/signals` | 候选验证台 | `getRadarContractForPage`、`getLeaderboardContractForPage` | 验证成熟度池、计划复核区、异动候选明细 | 轻扫标记不能进主信号区；WAIT 不能进计划复核区 | 是，尤其候选/观察项/计划边界 | 可访问；需继续审计展示是否强于后端 |
| `/leaderboard` | 每日异动复盘榜 | `getAllLeaderboardContractsForPage`、`/api/frontend/leaderboard` | 涨跌幅、成交额、强弱、衍生品排行和候选标记 | 榜单不能冒充推荐 | 是，榜单天然容易诱导追涨杀跌 | 可访问；production smoke 显示榜单 live |
| `/market` | 大盘环境与市场数据 | `getRadarContractForPage`、leaderboard contracts | BTC/ETH、BTC.D/TOTAL2/TOTAL3、衍生品/宏观环境 | 宏观不能直接给个币方向 | 中等，需明确 context-only | 可访问 |
| `/token/[id]` | 单币档案 | `getTokenDossierContractForPage`、`getKlineContractForPage`、leaderboards | TradingView/K线合同、证据链、关键位、风控、计划状态、历史样本 | 前端不能编交易计划；无后端证据不能显示 READY | 高，是交易决策核心页 | 可访问；需要重点审计实战可读性 |
| `/review` | 复盘进化中心 | `getReviewContractForPage`、`/api/frontend/review-contract` | daily mover、扫描帧、交易日记、样本归因、回测/复盘状态 | 不能把回测结论写进生产排序 | 高，future outcome 污染风险 | 可访问；需要持续样本验证 |
| `/system` | 系统中心 | `getRadarContractForPage` | 服务健康、数据源、扫描稳定性、告警/偏好 | 不能把系统健康等同于交易能力健康 | 中等 | 可访问 |
| `/login` | 身份核验入口 | `src/components/auth/login-terminal.tsx`、auth middleware/config | 私有模式下的登录入口 | 不能泄露服务端数据 | 中等；取决于私有模式配置 | 页面存在，需单独审计 session/路由级鉴权 |

页面硬规则：

- 候选不能冒充信号。
- WAIT 不能冒充 READY。
- 榜单不能冒充推荐。
- 前端不能编交易计划。

## 7. API 合同说明

| API | 作用 | 是否公开 | 是否需要 CRON_SECRET | 是否读 DB | 是否写 DB | 是否读 Redis | 是否调用外部 API | 是否给前端展示 | 风险 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `/api/health` | 系统健康、数据源、持久化、扫描、worker heartbeat | 是 | 否 | 是 | 否 | 可能 | 否 | 是 | ready/fresh 只能证明运行状态，不等于实战能力成熟 |
| `/api/scan` | GET 读扫描摘要；POST 触发扫描刷新 | GET 公开，POST 受保护 | POST 是 | 是 | POST 可能写归档/状态 | 可能 | POST 可能调用 | 部分 | served_cache 不能冒充 updated；POST 未授权必须失败 |
| `/api/archive` | 扫描回放归档读取 | 是 | 否 | 是 | 否 | 否 | 否 | 是 | 归档为空或旧数据时必须明确 |
| `/api/frontend/radar-contract` | 前端雷达总控合同 | 是 | 否 | 是 | 否 | 可能 | 间接读取缓存 | 是 | 前端主事实源，不能静默补假数据 |
| `/api/frontend/leaderboard` | 前端榜单合同 | 是 | 否 | 是/可能 | 否 | 可能 | 可能调用公开市场数据 | 是 | 榜单只做观察和复盘，不可推荐交易 |
| `/api/frontend/token-dossier` | 单币档案合同 | 是 | 否 | 是 | 否 | 可能 | 否/间接 | 是 | 交易计划必须来自后端 dossier，前端不能编 |
| `/api/frontend/kline-contract` | K线/TradingView/关键位合同 | 是 | 否 | 是 | 否 | 否 | 否/间接 | 是 | K线缺失时必须 waiting/unavailable，不可用 mock 伪装 |
| `/api/frontend/review-contract` | 复盘中心合同 | 是 | 否 | 是 | 否 | 可能 | 否 | 是 | 复盘样本不能污染生产排序 |
| `/api/radar/backend-contract` | 后端总事实合同 | 是 | 否 | 是 | 否 | 可能 | 否/间接 | 给前端和审计 | 合同字段多，前端不能只取好看的字段 |
| `/api/radar/business-capability` | 业务能力状态合同 | 是 | 否 | 是 | 否 | 可能 | 否 | 是/审计 | readiness 不是收益能力证明 |
| `/api/admin/*` | 生产运维、ingest、outcome、migration、capability 等 | 否 | 是 | 视接口而定 | 视接口而定 | 视接口而定 | 视接口而定 | 否 | 必须严格鉴权；不得泄露 secret；普通轮次不得随意迁移/清表 |

## 8. 数据源说明

| 数据源 | 用途 | 是否秒级 | 是否能生成交易计划 | 失败时如何展示 | fallback | 当前边界 |
|---|---|---:|---:|---|---|---|
| Binance | USDT 永续 universe、ticker、K线、部分 public 衍生品、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否，只能参与发现/验证 | partial/stale/failed | OKX/Bybit/public REST | 交易所数据不能单独给策略 |
| OKX | universe、ticker、K线、public swap 数据、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否 | partial/stale/failed | Binance/Bybit | symbol 格式和合约口径需清洗 |
| Bybit | universe、ticker、public linear 数据、WebSocket 轻扫 | 是，WebSocket 可秒级 | 否 | partial/stale/failed | Binance/OKX | 只能做交叉验证/轻扫补充 |
| CoinGlass Hobbyist | OI、Funding、pairs markets、深扫验证、daily movers | 否，受 30 调用/分钟和端点限制 | 否，必须经过结构分析和风控后才可能形成计划 | partial/unavailable/upgrade_required/auth_error/rate_limited | 公开交易所衍生品补充，但不能冒充 CoinGlass | Taker/CVD 类能力不能写成完整可用 |
| CoinGecko | BTC.D、TOTAL2/TOTAL3、trending、market context | 否 | 否 | partial/stale/unavailable | DefiLlama/公开源 | 宏观和榜单 context-only |
| DefiLlama | 宏观/链上/TVL/稳定币等 context | 否 | 否 | partial/stale/unavailable | CoinGecko/其它公开源 | 不能直接给个币方向 |
| DEX Screener | DEX 新币观察、流动性、热度、外部事件 | 接近实时但非交易所秒级 | 否 | context-only/partial | CoinGecko trending/external intel | 只做早期观察，不直接进合约交易计划 |
| 其它 external intel | 情报、事件、logo/身份映射、新闻背景 | 否 | 否 | context-only/partial/unavailable | 无或人工复核 | 外部情报不能喊单，不能绕过证据链 |

必须明确：

- WebSocket 轻扫不能生成交易计划。
- 榜单不能生成交易计划。
- CoinGlass 失败不能写成市场无机会。
- 外部情报不能直接喊单。
- 宏观环境不能直接给个币方向。

## 9. Scan / Analysis / Strategy / Backtest 边界

固定职责：

- SCAN 只负责发现。
- ANALYSIS 只负责判断结构和机会质量。
- STRATEGY 只负责是否可交易。
- BACKTEST 只负责评价和归因。

红线：

- backtest future outcome 不得污染 production score。
- MFE / MAE / qualityHit 不得进入生产排序。
- strategy blocker 不得过早压死 scan candidate。
- WAIT / WATCH 不得进入计划复核区。
- 轻扫标记不允许附带完整交易计划。
- 深扫候选可以展示“验证中”，但不能包装成“计划就绪目标”。
- `TRADE_PLAN_READY` 才允许进入计划复核区。

## 10. 当前测试体系

| 命令 | 用途 | 什么时候跑 | 是否每次必须跑 | 是否当前通过 | 最近一次结果 |
|---|---|---|---:|---:|---|
| `npm run typecheck` | TypeScript 类型检查 | 每次代码改动后 | 是 | 是 | 第四轮证据：exit=0 |
| `npm run lint` | ESLint 检查 | 每次代码改动后 | 是 | 是 | 第四轮证据：exit=0；有 1 个既有 warning：`priorityReasons` 未使用 |
| `npm run test:market` | 市场、worker、历史回测 smoke 单元测试 | 扫描/分析/worker 改动后 | 是 | 是 | 第四轮证据：exit=0，769 + 17 + 4 全部通过 |
| `npm run build` | Next.js 生产构建 | 推送/部署前 | 是 | 是 | 第四轮证据：exit=0 |
| `npm run backtest:golden` | Golden cases 验证 | 分析规则/边界改动后 | 是 | 是 | 第四轮证据：exit=0，16/16 |
| `npm run backtest:formal` | 正式能力验收回测 | 只在能力验收轮跑 | 否 | 已运行，但业务能力不通过 | 第五轮证据：exit=2；程序完成，裁判发现高优先级能力阻断 |
| `npm run production:smoke` | 生产公网页面/API/合同 smoke | 部署后、生产证据轮 | 是，生产变更后 | 是 | 第三轮前置门禁：exit=0 |

说明：`formal` 不是普通测试，只能在能力验收轮跑，不能在普通证据轮或修复轮随手运行。

## 11. 当前生产部署流程

当前实际部署方式：

```text
本地 / Codex 修改代码
-> 测试
-> commit
-> push GitHub 安全分支
-> GPT / 用户验收
-> 明确授权后合并 main
-> 明确授权后腾讯云服务器同步 main
-> 明确授权后 docker compose build/up
-> production smoke / evidence
```

当前状态：

- GitHub `main` 是代码正本。
- 腾讯云香港单机是当前生产主线。
- Docker Compose 负责 web、caddy、postgres、redis、workers。
- 第二轮生产证据中，production smoke 通过。
- SSH/scp 直连在第二轮仍不可用，OrcaTerm 可用；这会影响自动化效率。
- 第 4 步后，`production.yml` 不再监听 `push main` 自动生产部署；默认只手动触发 dry-run 质量门禁和证据包。
- `npm run production:deploy` / `npm run production:rollback` 默认 dry-run；真实生产动作必须使用显式 manual 命令并获得用户授权。

GitHub Actions / self-hosted runner：

- 当前是否已实现：已建立第 4 步生产观测 dry-run workflow 和证据 artifact 基础。
- 还差什么：真实腾讯云自动部署仍需单独授权、生产 runner/SSH 安全环境和部署验收轮。
- 是否还依赖手动执行：是。真实部署仍不能默认自动执行。

## 12. 当前项目真实状态

- 当前是否空壳：不是空壳。已有生产部署、真实 API、数据库、Redis、worker、公开交易所轻扫、CoinGlass 深扫基础、前端合同和生产 smoke。
- 当前是否可运行：可运行。第二轮生产证据显示生产页面/API 200、Docker 服务正常、worker heartbeat 正常。
- 当前是否完整：不完整。扫描、分析、策略、复盘都有基础，但仍需要专业能力验收。
- 当前是否支撑实战：**当前系统仍不能支撑实战。**
- 当前最大短板：
  1. 第五轮 formal 中 `TRADE_PLAN_READY=0`，策略分数从第三轮 `28.61` 降到 `22.48`，第四轮策略计划层整改没有转化为能力提升。
  2. 第五轮 formal 中 WAIT 有效率仍为 `0%`，WAIT bad rate 从 `8.33%` 升至 `25%`；诊断更细，但等待计划仍无效。
  3. 第五轮 formal 中 RR、止损、目标问题更重：`reward_risk_below_minimum` 从 `27` 增至 `33`，目标过远或不现实成为新暴露问题。
  4. 分析判断有效率不足：第五轮 formal 中被选中节点真正不晚到且事后有效比例为 `21.43%`。
  5. 扫描提前发现能力不足：第五轮 formal 中结构可行动机会 TopN 捕获率为 `26.42%`，启动前捕获率为 `23.53%`。
  6. 生产服务器尚未同步第四轮提交：本地 HEAD `dc22fda6`，腾讯云只读检查 HEAD `a76010223`；第五轮 formal 是本地第四轮代码验收，不是生产第四轮代码验收。
  6. 回测/复盘和生产评分边界必须持续防污染。

不能把“页面可访问”写成“系统可实战”。当前更准确状态是：**可运行但不完整，具备继续审计和能力验证的基础。**

## 13. 最近三轮关键事件

### 第二轮

- 目标：证明线上生产环境真实、安全、新鲜、可访问。
- 改了什么：未改业务代码；轮换生产 CRON_SECRET；重启必要服务；采集生产证据；生成第二轮脱敏证据包。
- 测试结果：
  - 无 secret admin：401。
  - 旧 secret admin：401。
  - 新 secret admin：200。
  - `/api/scan?force=1`：status=updated。
  - `/api/health`：ready/fresh。
  - Docker：10 个服务，异常 0。
  - worker：6/6 healthy。
  - Redis：PONG。
  - Postgres：accepting connections。
  - production smoke：exit=0。
  - typecheck/lint/test:market/build/backtest:golden：全部通过。
- 是否通过：通过。
- 遗留问题：SSH/scp 直连仍不可用，本机无法直接拉取服务器完整 zip；业务实战能力仍未通过 formal 能力验收。
- 下一轮：可进入第三轮生产/业务链路审计，但不得把生产可用等同于实战成熟。

### 第三轮

- 目标：正式能力回测轮，验证系统是否真正具备“快速全市场扫描、发现机会、给出策略、自我提升”的核心能力。
- 改了什么：未改业务代码、未改 UI、未调策略、未改扫描排序、未改回测逻辑、未提交、未部署、未迁移数据库；只采集前置门禁、运行 formal、生成报告和证据包。
- 测试结果：
  - 前置 API 门禁：通过，`/api/health` 为 ready/fresh，Redis healthy，worker 6/6 healthy。
  - production smoke：exit=0。
  - typecheck/lint/test:market/build/backtest:golden：全部 exit=0。
  - formal：exit=2；程序完成，但裁判系统发现高优先级能力阻断。
  - formal 报告：`reports/professional-backtest-audit/2026-07-05T025649-925Z`。
- 是否通过：生产前置门禁通过；正式能力验收不通过。
- 关键结论：
  - 总判定：当前系统仍不能支撑实战。
  - 扫描：不合格，分数 `50.88`，通过率 `7.69%`。
  - 分析：不合格，分数 `48.05`，通过率 `23.81%`。
  - 策略：不合格，分数 `28.61`，通过率 `0%`。
  - `TRADE_PLAN_READY=0`。
  - WAIT 有效率 `0%`。
- 遗留问题：策略计划层是最大短板；WAIT/RR/止损/目标需要专项整改；不能为了提高 READY 数量降低风控门槛。
- 下一轮：进入第四轮整改，但只能做策略计划层专项整改，不建议新增功能或 UI。

### 第四轮

- 目标：策略计划层专项整改，只修 WAIT / RR / 止损 / 目标 / 关键位投射 / 触发确认。
- 改了什么：
  - `StrategyV3TradePlan` 增加可选结构化等待字段：等待区、触发条件、二次确认、等待原因、当前为什么不能做。
  - `buildV3TradePlan` 输出更清楚的 WAIT 结构，不把 WAIT 升级 READY。
  - `structure_repair_pending` 拆成建设性修复等待、失败阻断、普通观察。
  - WAIT 后验诊断新增：`trigger_not_reached`、`structure_invalidated_before_trigger`、`stop_too_close_to_entry`、`target_too_far_or_unrealistic`。
  - 修正 WAIT 诊断内部价格距离百分比计算，避免误用数量占比函数。
- 测试结果：
  - 定向测试通过：`trade-plan` 13/13、`location-rr` 11/11、`trend-integrity` 8/8、`professional-audit-round` 57/57。
  - `npm run typecheck`：通过。
  - `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
  - `npm run test:market`：通过，769 + 17 + 4 全部通过。
  - `npm run build`：通过。
  - `npm run backtest:golden`：通过，16/16。
- 是否通过：第四轮基础门禁通过；未跑 formal。
- 遗留问题：不能宣称实战可用；第四轮没有验证 formal 能力是否改善。
- 下一轮：第五轮正式回归验收，重点看策略分数、WAIT 有效率、`TRADE_PLAN_READY` 是否仍为 0。

### 第五轮

- 目标：正式回归验收第四轮策略计划层整改是否有效。
- 改了什么：未改业务代码、未改 UI、未改扫描/分析/策略/回测规则、未部署、未动数据库、未提交 Git；只运行前置门禁、formal 回归、生成第五轮报告和脱敏证据包。
- 测试结果：
  - 生产公网从本地 shell 访问 43.161.202.227:80/443 超时；通过 SSH 只读检查服务器本机 health 为 ready/fresh。
  - 生产服务器 HEAD 为 `a76010223`，本地第四轮 HEAD 为 `dc22fda6`，生产尚未同步第四轮。
  - `npm run typecheck`：通过。
  - `npm run lint`：通过；仍有既有 warning：`src/lib/market/universe-registry.ts` 的 `priorityReasons` 未使用。
  - `npm run test:market`：通过。
  - `npm run build`：通过。
  - `npm run backtest:golden`：通过。
  - `npm run backtest:formal`：直连 Binance 首次失败；使用 `BACKTEST_CURL_PROXY=socks5h://127.0.0.1:7892` 后完整跑完，exit=2。
  - formal 报告：`reports/professional-backtest-audit/2026-07-05T043726-668Z`。
- 是否通过：formal 有效生成，但业务能力不通过。
- 核心结果：
  - 总判定：当前系统仍不能支撑实战。
  - 高优先级问题：第三轮 `60` -> 第五轮 `65`，退步。
  - 扫描：`50.88` -> `50.74`，退步。
  - 分析：`48.05` -> `46.57`，退步。
  - 策略：`28.61` -> `22.48`，退步。
  - `TRADE_PLAN_READY`：仍为 `0`。
  - WAIT 有效率：仍为 `0%`。
  - WAIT bad rate：`8.33%` -> `25%`，退步。
- 遗留问题：第四轮 WAIT 文案和诊断变细，但策略计划能力没有改善；RR/止损/目标和 WAIT 触发质量仍是最大短板。
- 下一轮：第六轮只建议做“关键位/RR/目标投射与 WAIT 触发质量专项审计整改”，不建议新增功能或 UI。

## 14. 当前 P0 / P1 / P2 风险

## 13.1 当前收敛状态补充（2026-07-06）

第 2.1 步补充收敛整改已把以下事实写入当前代码和测试边界：

- Token 单币档案不能再根据 v3 交易计划草案自行升级为 `TRADE_PLAN_READY`；必须同时满足后端 `SignalBackendDossier.signal.maturity.stage === TRADE_PLAN_READY`、完整 trade plan 和 risk gate 放行。
- `/dashboard` 已引入统一四层信息结构：L1 决策层、L2 中文解释层、L3 结构化证据层、L4 折叠技术层。
- `/signals` 用户可见措辞收敛为“验证候选 / 证据观察 / 计划复核区 / 后端计划门禁”，避免把候选、WAIT、EVIDENCE_SIGNAL 写成可执行信号。
- market provider registry 在真实 provider 未配置时 fail-closed 到 `unconfigured`，不再静态导入 mock provider 作为生产兜底。
- CI guard 已覆盖审计包、证据包、zip/log/raw/env 和 secret pattern 检查；文档里的连接串示例统一改为 `[REDACTED]`。
- 本轮不改变最低 `3:1` 结构 RR，不新增自动下单，不让 review/backtest 影响 production ranking，不部署腾讯云，不运行 formal。

当前真实状态仍是：**可运行但不完整，不能支撑实战。**

## 14. 当前 P0 / P1 / P2 风险

### P0 风险

1. 问题：前端把候选、WAIT、WATCH、榜单包装成交易机会。
   - 影响核心链路哪一环：候选筛选、交易计划。
   - 证据：蓝图和 API 合同反复强调候选不能冒充信号、WAIT 不得进入狙击榜。
   - 当前状态：已有成熟度分层，但仍需页面级审计。
   - 下一步：逐页检查 `/signals`、`/dashboard`、`/token/[id]`，确认展示文案和排序不越权。

2. 问题：backtest future outcome 污染 production score。
   - 影响核心链路哪一环：候选筛选、复盘进化、生产排序。
   - 证据：第一轮专门修复生产排序测试边界。
   - 当前状态：测试已补强，但需要继续审计数据流。
   - 下一步：审计所有 ranking reasons、priority hints、review outcome 到 production ranking 的路径。

3. 问题：secret / admin 鉴权风险。
   - 影响核心链路哪一环：生产安全。
   - 证据：第二轮已轮换生产 CRON_SECRET 并验证 401/200。
   - 当前状态：第二轮通过。
   - 下一步：继续保持证据包不含 raw secret，推动自动化部署也必须脱敏。

### P1 风险

1. 问题：扫描排序主干不够强，优质机会未必稳定进入 Top10。
   - 影响核心链路哪一环：全市场发现、候选筛选。
   - 证据：长期讨论和回测反馈集中在“提前性”和“优质机会进入候选”的稳定性。
   - 当前状态：有状态池、轻扫、深扫 allocation，但仍需 formal 能力验收。
   - 下一步：用 formal 能力回测专门测试“启动前识别”和“候选召回率”。

2. 问题：分析推理报告可读性和实战解释力不足。
   - 影响核心链路哪一环：结构分析、交易计划。
   - 证据：用户反馈分析报告乱、看不懂、无法直接实战参考。
   - 当前状态：有 v3 dossier/forward map，但仍需业务表达重构和验收。
   - 下一步：按“为什么看、为什么不看、怎么错、怎么等”重构报告合同。

3. 问题：CoinGlass 与公开衍生品数据边界容易被误解。
   - 影响核心链路哪一环：深扫验证。
   - 证据：Hobbyist 支持范围和 Taker/CVD partial 需要明确展示。
   - 当前状态：第二轮深扫可用，但不是所有衍生品维度都完整。
   - 下一步：继续在 sourceAudit/dataSourceCapabilities 中区分 live/partial/unavailable。

### P2 风险

1. 问题：SSH/scp 自动化链路不稳定。
   - 影响核心链路哪一环：生产部署、证据采集。
   - 证据：第二轮本机无法直接 scp 拉取服务器完整 zip，只能通过 OrcaTerm 操作。
   - 当前状态：未根治。
   - 下一步：修复 SSH 公钥或建立受控 CI/CD，不要依赖手动浏览器终端。

2. 问题：页面 200 和健康 ready 可能被误读为能力成熟。
   - 影响核心链路哪一环：全链路验收。
   - 证据：第二轮只证明生产真实、安全、新鲜、可访问，不证明实战能力。
   - 当前状态：已在报告中标明；第三轮 formal 也证明当前仍不能支撑实战。
   - 下一步：第五轮跑正式回归验收，不要继续堆功能。

3. 问题：旧演示/legacy 文件仍存在但已降级。
   - 影响核心链路哪一环：前后端一致性、数据真实性。
   - 证据：`src/lib/radar-contract.ts` 保留旧同步 getter，但返回 empty/disabled，避免 mock 冒充真实。
   - 当前状态：兼容层可接受，但需要防止新页面误用旧 getter。
   - 下一步：检索所有页面数据入口，禁止直接读取旧 mock 数据。

## 15. 给 ChatGPT 的审计重点

请优先审计：

1. 核心链路是否自洽。
2. scan / analysis / strategy / backtest 是否互相污染。
3. 前端是否展示强于后端。
4. 是否存在 mock / fallback / stale cache 冒充真实。
5. WAIT / WATCH / EVIDENCE_SIGNAL 是否容易误导。
6. 是否有生产安全风险。
7. 测试是否真的证明了当前能力。
8. 下一轮最应该做什么。

建议 ChatGPT 不要只看“功能多不多”，而要看系统是否真正围绕：

```text
快速发现 -> 候选筛选 -> 深扫验证 -> 结构分析 -> 风险赔率 -> 交易计划 -> 复盘进化
```

## 16. 当前用户工作方式

- 用户不写代码。
- 用户只提出产品想法、交易逻辑观点和最终决策。
- Codex 负责执行工程实现。
- ChatGPT 负责架构审计、任务拆解、交易逻辑边界、验收标准和风险判断。

协作要求：

- 对用户尽量用中文和大白话。
- 不能把“能跑”说成“完整完成”。
- 不能用旧数据、mock、缓存或 fallback 冒充真实能力。
- 涉及网站核心能力时，必须先对照蓝图和核心链路。

## 17. 后续协作规则

每轮 Codex 必须输出：

1. 修改文件清单。
2. 每个文件为什么改。
3. 执行命令。
4. 测试结果。
5. 是否影响核心链路。
6. 是否影响 scan / analysis / strategy / backtest 边界。
7. 是否有新风险。
8. 是否可以进入下一轮。

每轮还必须说明：

- 是否改业务代码。
- 是否部署。
- 是否跑 formal。
- 是否动数据库。
- 是否包含 secret。
- 是否存在不能支撑实战的边界。

## 18. 第六轮全站逐数字 + 后端全链路审计状态

本节记录 2026-07-05 第六轮审计状态。该轮只做证据采集和审计包生成，不修改业务代码、不部署、不提交 Git、不运行 formal、不动数据库。

审计结论：

- 当前系统仍不能支撑实战。
- 本轮发现 P0：是。
- P0 数量：2。
- P1 数量：4。
- P2 数量：4。
- 当前不允许直接开始优化。

阻断原因：

1. 生产运行态事实源不可采集：公网 `/api/health` HTTP/HTTPS 超时；SSH 经 SOCKS TCP 可达，但认证阶段被关闭；本地 3000 未运行，本地也没有可用 Docker 命令。
2. 生产 HEAD 与 GitHub main / 本地 HEAD 一致性本轮不可复核。第五轮曾记录生产 HEAD 落后本地，本轮不能重新确认。

本轮能证明的正向事实：

- 静态代码显示狙击榜入口只允许 `TRADE_PLAN_READY`、`RR >= 3`、且无 `whyBlocked` 的信号进入。
- 榜单 fallback 投影候选时已有“候选不等于交易计划”的保护边界。
- `useLiveNumber` 当前不再随机制造数字漂移。
- 最近 formal 报告仍明确显示系统不能支撑实战：`TRADE_PLAN_READY=0`，WAIT 有效率为 0%，高优先级问题 65。

本轮不能证明的事实：

- 不能证明生产页面逐数字真实。
- 不能证明生产 API 合同字段和前端展示一致。
- 不能证明 Postgres、Redis、worker heartbeat、scan lock、reports volume 正常。
- 不能证明 CoinGlass、WebSocket 轻扫和公开交易所深扫当前真实工作。

下一轮优先级：

先做“生产事实源恢复与逐数字验收轮”，恢复只读 SSH / API / Docker / DB / Redis 证据采集。P0 未关闭前，不应进入扫描排序、策略、UI 或业务能力优化。

## 2026-07-06 第 2 步最终复查 + 中文命名体系收口

本节记录 2026-07-06 本地最终复查状态。该轮只做中文命名体系、状态语义、单一事实源、前端四层结构、review research-only、Git/CI 安全和测试验证收口；不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 阻断型 P1：无。
- 是否可进入第 3 步实战能力提升：可以。
- 是否可 push main：否。
- 是否可部署腾讯云：否。

本轮已验证：

- `TRADE_PLAN_READY` 仍是计划就绪区唯一入口。
- `TRADE` 只是 L1 决策状态，不进入计划就绪区。
- 候选观察、证据观察、等待条件、风控阻断和计划就绪的中文语义已收口。
- 前端核心展示不再使用 `n/a` 或 `0` 冒充未知值。
- Review / backtest 仍为 research-only，不污染 production ranking。
- 基础门禁通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns。

仍需说明：

- 本轮不是生产验证轮，不能证明腾讯云当前已同步。
- 本轮不是 formal 能力验收轮，不能证明扫描、分析、策略已经支撑实战。
- 历史 `SniperTarget` 类型仍保留 entry/stop/target 字段，当前 UI 不用它生成计划，但后续应单独清理。

下一轮优先级：

进入第 3 步实战能力提升，只围绕扫描、分析、策略三大核心做正式样本验证和能力提升。

## 2026-07-06 第 3 步实战能力提升

本节记录 2026-07-06 本地能力提升状态。该轮只做后端能力基础件和测试保护；不改 UI、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 是否 push main：否。
- 是否部署腾讯云：否。
- 是否可进入下一步受控接线：可以。

本轮已完成的本地能力基础：

- 深扫队列和候选质量证明增强：`deepScanCoveragePercent`、`pendingCount`、`oldestPendingAge`、`estimatedCycleMinutes`、`highPriorityPendingCount`、`skippedLowPriorityCount`、`priorityReason`。
- 统一决策引擎：把后端 v3 trade plan 归一化为 `OBSERVE / WAIT / BLOCKED / TRADE_PLAN_READY`，并要求 READY 必须满足后端 maturity、结构止损、目标、入场、RR >= 3 和无 blocker。
- 市场状态识别：新增 `TREND_UP / TREND_DOWN / RANGE / HIGH_VOLATILITY / LOW_LIQUIDITY / RISK_OFF / ALT_ROTATION / UNKNOWN`，只作为 `market_context_only`。
- 错失机会复盘：新增 research-only missed opportunity 归因，覆盖 scan、light scan、deep scan、analysis、strategy、data source、market regime、frontend 等错失原因。
- 机会生命周期：新增 research-only lifecycle，从 `DISCOVERED` 到 `OUTCOME_REVIEWED`，禁止 outcome 回写 production ranking。
- 账户级风险模拟器：按 1500 USDT、3% 初始保证金、BTC/ETH 150x、山寨币交易所最高杠杆做只读风险镜头，不改变结构 RR 和策略门禁。

测试结果：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 803 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

仍需说明：

- 本轮新增能力多为后端基础件，尚未接入生产 API / 前端展示。
- 本轮不证明真实市场样本下的候选 Top10、WAIT 转 READY 或策略命中能力。
- 本轮不证明腾讯云生产已同步。

下一轮优先级：

进入第 3.1 步：把统一决策引擎接入 radar signal、signals/sniper 可见状态和 token dossier 合同，作为计划状态的唯一后端出口；仍不改 UI 美观、不改 scan 排序、不部署。

## 2026-07-06 第 3.1 步统一决策引擎主链路接线与合同验收

本节记录 2026-07-06 本地合同接线状态。该轮只做统一决策引擎到 radar signal、signals/sniper 可见状态和 token dossier 主链路的接线；不改 scan 排序、不改 RR 门槛、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮发现新 P0：否。
- 是否 push main：否。
- 是否部署腾讯云：否。
- 是否可进入 3.1 验收复查：可以。

本轮已完成的本地合同接线：

- radar signal 和 `buildFrontendTokenDossierContract()` 均调用统一决策链路。
- radar signal / token dossier 合同新增 `unifiedDecision`，包含 `decision`、`decisionLabel`、`source=unified_decision_engine`、`canTradeNow`、`blockerReasons`、`waitPlanReady`、`readyPlan`。
- token dossier 前端 L1 决策只读 `unifiedDecision.decision`，不再用页面局部逻辑推导 TRADE / WAIT / BLOCKED。
- signals / anomaly / sniper 可见状态不再用前端 category、odds、候选数量或计划数量自行推断 READY。
- dashboard L1 只表达系统运行状态，不再把候选数量或计划数量包装成交易结论。
- `tradePlan` 只在 `unifiedDecision.canTradeNow=true` 时暴露。
- WAIT 只展示等待条件，不生成入场、止损、目标。
- 修复 stale READY 风险：后端 maturity 残留为 `TRADE_PLAN_READY` 但没有完整后端计划时，token dossier 不再保留 visible `TRADE_PLAN_READY`。
- READY 硬门槛 blocker 增加 severity，缺入场、缺结构止损、缺目标、RR 不足、plan blocker 等均为 critical。

测试结果：

- 定向合同/展示/guard 测试：52/52 通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run test:market`：通过，市场核心 807 pass，worker 17 pass，historical smoke 4 pass。
- `npm run build`：通过。
- `npm run backtest:golden`：通过，16/16。
- `npm run ci:forbidden-files`：通过。
- `npm run ci:secret-patterns`：通过。
- `npm run backtest:formal`：未运行，本轮禁止。

仍需说明：

- 本轮只证明 radar signal、signals/sniper 可见状态和 token dossier 决策出口已接入统一决策链路。
- Kline readonly overlays 仍需单独审计，避免图表视觉层比决策合同更强。
- 本轮不证明腾讯云生产已同步。

下一轮优先级：

进入 3.1 验收复查，随后做 Kline / TradingView readonly overlay 边界审计，防止图表视觉层看起来强于统一决策合同。

## 2026-07-06 第 3.2 步图表叠加层与严格单一事实源最终收口

本节记录 2026-07-06 本地图表合同收口状态。该轮只修 Kline / TradingView overlay 与统一决策事实源的错位；不改 scan 排序、不改策略规则、不降低 RR、不部署、不运行 formal、不动数据库、不同步腾讯云。

结论：

- 当前系统仍不能支撑实战。
- 本轮修复前发现 P0：Kline overlay 会把非 READY 的 v3 trade plan 草案显示成“结构止损 / TP”视觉线，可能与右侧“不能交易”结论冲突。
- 本轮本地修复后：Kline overlay 的交易计划线只允许来自 `unified_decision_engine` 的 `readyPlan`。
- 是否 push main：否。
- 是否部署腾讯云：否。

本轮已完成的本地合同收口：

- `KlineOverlay` 增加 `semanticRole`、`allowedUse`、`sourceDecision`。
- `target/stop` overlay 必须满足 `semanticRole=ready_trade_plan`、`allowedUse=ready_trade_plan_only`、`sourceDecision=unified_decision_engine` 才可渲染。
- `buildFrontendKlineContract()` 不再无条件从 `dossier.strategyV3.tradePlan` 输出止损/TP。
- 非 READY：只允许显示支撑、压力、前方结构、失效观察等结构参考。
- WAIT：只允许显示“等待触发区 / 等待失效参考”，不得显示为入场、止损或 TP。
- stale / partial / cached Kline 数据不允许显示 ready trade plan overlay。
- `chartIntegrity.overlaySource` 不再把 v3 草案标记为 trade plan overlay；READY 图表计划线来源改为 `v3_key_levels_forward_map_unified_ready_plan`。

定向验证：

- `npm run build:market-cli && node --test .tmp/market-tests/lib/api/frontend-contract.test.js`：通过，32/32。
- `npm run typecheck`：通过。
- 完整基础门禁仍需在本轮最终报告中记录。

仍需说明：

- 本轮不证明腾讯云生产已同步。
- 本轮不证明策略命中率或实战能力达标。
- 后续能力提升仍需围绕扫描提前性、分析准确性、策略有效性和复盘闭环继续验收。

## 附录 A：核心相关文档清单

建议外部审计员优先阅读这些文档，而不是一次性读完整 docs：

- `docs/chuan-market-radar-blueprint.md`：长期事实源、核心目标、边界和不做什么。
- `docs/chuan-market-radar-engineering-charter.md`：长期工程准入、分层、删除、验证规则。
- `docs/BACKEND_API_CONTRACT.md`：后端合同、前端消费边界、核心 API 语义。
- `docs/frontend-data-truth-contract.md`：前端数据真实性边界。
- `docs/frontend-backend-field-map.md`：前后端字段映射。
- `docs/CORE_STRATEGY_SPEC.md`：策略系统目标、非目标、阶段和决策枚举。
- `docs/EVIDENCE_ENGINE_SPEC.md`：证据项、证据族、权重和可追溯边界。
- `docs/DATA_RULES.md`：OI、Funding、多空、主动买卖、相对强弱规则。
- `docs/INDICATOR_RULES.md`：RSI/MACD/Bollinger/ATR/EMA/VWAP/ADX 等技术指标边界。
- `docs/MARKET_READING_SPEC.md`：市场阅读和结构分析规范。
- `docs/RISK_GATE_SPEC.md`：风险门禁。
- `docs/KEY_LEVEL_ENGINE_SPEC.md`：关键位和结构位。
- `docs/backtest-v2/PROFESSIONAL_BACKTEST_AUDIT_SPEC.md`：专业回测审计目标。
- `docs/backtest-v2/BACKTEST_TEST_PLAN.md`：回测测试方案。
- `docs/single-server-deployment.md`：腾讯云单机部署。
- `docs/deployment-checklist.md`：部署检查清单。
- `audit-round-2/ROUND_2_PRODUCTION_EVIDENCE_REPORT.md`：最近一轮生产证据报告。

## 附录 B：打包说明

`project-context-for-chatgpt.zip` 应只包含：

- `PROJECT_CONTEXT_FOR_CHATGPT.md`
- 核心相关文档清单
- `package.json`
- `docker-compose.yml`
- 部署脚本清单
- 最近一轮 ROUND 报告的脱敏副本

不得包含：

- `.env`
- `.env.*`
- audit zip
- raw logs
- `node_modules`
- `.next`
- `dist`
- `build`
- 真实数据库数据
- 真实密钥

## 2026-07-06 第 4 步生产观测闭环补充

本节记录本地第 4 步事实：本轮只建设生产观测、dry-run 证据、GitHub Actions 手动门禁和回滚 dry-run，不部署腾讯云，不运行 formal，不动数据库 / Redis / volume。

- 安全分支：`phase4-production-observability`。
- workflow：`.github/workflows/production.yml` 已改为手动 `workflow_dispatch`，不再监听 `push main` 自动生产部署。
- 生产观测脚本：`scripts/production/observability.mjs`。
- dry-run 命令：`npm run production:health -- --dry-run`、`npm run production:smoke -- --dry-run`、`npm run production:status -- --dry-run`、`npm run production:evidence -- --dry-run`。
- 部署脚本：`npm run production:deploy` 默认 dry-run；真实部署需要显式 manual 命令和用户授权。
- 回滚脚本：`npm run production:rollback` 默认 dry-run；真实回滚需要显式 manual 命令和用户授权。
- 证据目录：`phase4-production-observability/`。
- 证据包：`phase4-production-observability.zip` 和目录内 `production-evidence.zip` 只用于用户/GPT 审计，不应进入 Git。
- 当前真实状态：本轮只能证明本地工程观测链路可执行，不能证明腾讯云已部署新代码，也不能证明系统支撑实战交易。

## 2026-07-06 第 4.1 步证据链收口补充

第 4.1 步只修生产证据链，不改扫描、分析、策略、图表、前端交易展示或数据库。

本轮事实：

- 安全分支：`phase4-1-evidence-commit-alignment`。
- 基线分支：`phase4-production-observability`。
- 基线 commit：`cd279008e3a9f55a3bf7485e80632cd3ec2e93a9`。
- 证据生成脚本：`scripts/production/observability.mjs`。
- 证据验证命令：`npm run production:evidence:validate -- --zip <production-evidence.zip>`。
- 证据输出目录：`phase4-1-evidence-commit-alignment/`，该目录为 ignored/untracked artifact，不进入 Git。
- 内层证据包：`phase4-1-evidence-commit-alignment/production-evidence.zip`，必须能单独交给 GPT 审计。
- 外层证据包：`phase4-1-evidence-commit-alignment.zip`，不进入 Git。
- 部署授权清单：`docs/DEPLOYMENT_AUTHORIZATION_CHECKLIST.md` 与 evidence 内 `DEPLOYMENT_AUTHORIZATION_CHECKLIST.md`。

第 4.1 步必须保证：

- `phase4-1-summary.json.source_commit` 等于当前安全分支 HEAD。
- `system-status.json.git.commit` 等于当前安全分支 HEAD。
- `gpt-handoff-summary.md` 与 `production-deployment-report.md` 明确写入当前 commit。
- `production-evidence.zip` 不包含 `pending_commit`、`等待 Agent`、`placeholder`、`TODO`、`待补充` 或旧第 3.2 commit 作为当前 HEAD。
- dry-run 和真实生产部署必须区分；本轮仍不能写成已经部署腾讯云。

当前真实状态：

- 本轮目标是部署授权前证据收口。
- 可以交给 GPT 做第 4.1 验收复查。
- 仍需用户明确授权才可进入腾讯云真实部署。
- 当前系统仍不能写成支撑实战交易。

## 2026-07-06 第 4.2 步腾讯云部署授权准备补充

第 4.2 步只做真实部署前的授权审查和部署准备，不做生产部署，不改扫描、分析、策略、前端交易展示或数据库。

本轮事实：

- 安全分支：`phase4-2-tencent-deploy-readiness`。
- 第 4.1 基线分支：`phase4-1-evidence-commit-alignment`。
- 第 4.1 基线 commit：`7913e4cf5bdaec77c757c590723abf7a4fb034c1`。
- 证据生成脚本：`scripts/production/deploy-readiness.mjs`。
- 证据生成命令：`npm run production:deploy-readiness`。
- 证据验证命令：`npm run production:deploy-readiness:validate`。
- 证据输出目录：`phase4-2-tencent-deploy-readiness/`，该目录为 ignored/untracked artifact，不进入 Git。
- 证据包：`phase4-2-tencent-deploy-readiness.zip`，不进入 Git。
- 第 4.2 evidence 内必须包含部署授权清单、Secrets/Runner 清单、腾讯云部署 Runbook、部署前备份、部署后验证、回滚失败处理、测试结果、grep 证据、剩余风险和下一步。

第 4.2 步必须保证：

- 不 push main。
- 不部署腾讯云。
- 不运行 `npm run backtest:formal`。
- 不运行 migration。
- 不动 Postgres、Redis 或 Docker volume。
- 不输出真实 secret、API key、DATABASE_URL、CRON_SECRET、SSH 私钥、cookie 或 token。
- 证据包只能证明部署准备和授权审查完成，不能证明生产已同步。
- 真实部署前必须由用户明确授权，并重新确认腾讯云目标目录、生产 HEAD、Docker Compose、`.env.production`、Caddy、Postgres、Redis、worker 和 reports volume。

当前推荐部署方式：

```text
GPT / 用户验收第 4.2 证据
-> 用户明确授权
-> 合并或推进 GitHub main
-> 腾讯云服务器自拉 main
-> Docker Compose 构建和启动
-> health / smoke / evidence / rollback guard 验证
```

当前真实状态：

- 本轮目标是腾讯云真实部署前准备。
- 可以交给 GPT 做第 4.2 验收复查。
- 通过后可以请求用户授权真实部署。
- 未授权前不能部署腾讯云，不能进入 shadow tracking。
- 当前系统仍不能写成支撑实战交易。

## 2026-07-06 第 4.3 步真实腾讯云部署执行补充

第 4.3 步在用户明确授权后执行了真实腾讯云部署。部署目标不是 `main`，而是安全分支：

- 目标分支：`phase4-2-tencent-deploy-readiness`
- 目标 commit：`953def3363ec64efb8a859e7772c55e9a51f175c`
- 腾讯云项目目录：`/home/ubuntu/apps/chuan-market-radar`

本轮真实结果：

- 腾讯云生产仓库已切换到 `phase4-2-tencent-deploy-readiness`。
- 腾讯云生产 HEAD 已对齐 `953def3363ec64efb8a859e7772c55e9a51f175c`。
- 已执行 Docker Compose build/up。
- web 容器为 healthy。
- Postgres / Redis 继续使用原有 volume，未删除、未重建、未清空。
- `/api/health` 最终为 `ready / fresh`。
- `/api/scan`、`/api/frontend/radar-contract`、`/api/radar/backend-contract`、`/api/frontend/kline-contract`、`/api/frontend/review-contract` 均返回 HTTP 200。
- 已生成第 4.3 evidence 目录：`phase4-3-production-deploy-first-evidence/`。
- 已生成 production evidence 首包：`phase4-3-production-deploy-first-evidence/production-evidence.zip`。
- 已生成外层证据包：`phase4-3-production-deploy-first-evidence.zip`。

第 4.3 剩余工程风险：

- 生产镜像未包含 `scripts/production/observability.mjs`，因此不能直接在 web 容器内运行 production evidence 脚本。本轮改为本地脚本通过 SSH tunnel 访问腾讯云 Caddy 真实生产 API 采集 evidence。
- `production:evidence:validate` 仍保留第 4.1 dry-run 口径，真实生产 evidence 会被 `dry_run_only must be true` 拦下。因此第 4.3 evidence validate 当前不能写成通过。
- `npm run security:check` 存在源码正则误报风险，安全总门禁不能写成全绿。

本轮明确没有做：

- 未 push main。
- 未运行 `npm run backtest:formal`。
- 未运行 migration。
- 未修改数据库 schema。
- 未清 Redis。
- 未删除或重建 Docker volume。
- 未接自动下单或交易所下单 API。

当前真实状态：

- 生产部署已完成，生产 health/API 可用。
- 生产 evidence 首包已生成。
- 生产 evidence validate 链路仍有 P1 工具缺口，需要下一轮修复。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。

## 2026-07-06 第 4.3.1 步生产 Evidence 真实口径修复补充

第 4.3.1 步只修复第 4.3 暴露的生产 evidence 工具链问题，不改扫描、分析、策略、前端交易逻辑、数据库或 Redis。

本轮事实：

- 安全分支：`phase4-3-1-production-evidence-real-mode`。
- 修复目标一：`production:evidence:validate` 支持 `dry_run` / `real_production` 两种 evidence 模式。
- 修复目标二：真实生产 evidence 使用 `phase4-3-1-summary.json`，不再把第 4.3 真实生产证据伪装成 `phase4-1-summary.json`。
- 修复目标三：Docker runner 镜像包含 `scripts/production/*.mjs` 和 `zip/unzip`，使生产容器内可以生成和验证 evidence。
- 修复目标四：`security:check` 不再把源码里的 secret 检测正则定义误判为真实 secret。
- 本轮本地基础门禁已通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns、security:check。
- 本轮本地 dry-run evidence 与 validate 已通过。

第 4.3.1 必须保证：

- 不 push main。
- 不运行 `npm run backtest:formal`。
- 不运行 migration。
- 不修改数据库 schema。
- 不清 Redis。
- 不删除或重建 Docker volume。
- 不接自动下单或交易所下单 API。
- 不改 scan / analysis / strategy / UI 交易逻辑。
- 真实生产 evidence validate 未通过前，不得进入 shadow tracking。

当前真实状态：

- 本地 evidence 工具链修复已通过基础门禁和 dry-run validate。
- 第 4.3.1 已完成腾讯云 web-only 重建、`real_production` 口径 evidence 生成和 validate pass，但后续复核发现 evidence 附属文件仍有一致性问题。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。

## 2026-07-07 第 4.3.2 步生产 Evidence 一致性与验证严格性最终收口

第 4.3.2 步只修复生产 evidence 的一致性和 validator 严格性，不改扫描、分析、策略、前端交易逻辑、数据库 schema、Redis 或 Docker volume。

本轮事实：

- 安全分支：`phase4-3-2-production-evidence-consistency`。
- 修复目标一：`grep-evidence.md` 不再依赖生产镜像是否安装 `rg`，改为 Node.js 内置文本扫描。
- 修复目标二：`production:evidence:validate` 必须识别 grep/git 命令失败文本、占位文本、非法 JSON、changed-files 结构缺失、rollback 旧口径和多 summary 口径冲突。
- 修复目标三：`production-evidence-validate-result.json` 必须是纯 JSON；命令日志单独放入 markdown。
- 修复目标四：`changed-files.txt` 必须写清比较基线 commit、当前 commit、已提交差异、未提交 tracked 变更和未跟踪 artifact。
- 修复目标五：真实生产 rollback plan 必须是部署后的回滚口径，不得继续写“本轮未部署 / 部署授权前计划”。
- 追加修复目标六：`grep-evidence.md` 中来自源码的 secret 检测规则文本必须全局脱敏；同一行出现多个 `DATABASE_URL=` / `CRON_SECRET=` / `COINGLASS_API_KEY=` 等模式时，不允许只脱敏第一个。
- 新增定向测试：`npm run test:production-evidence`，覆盖好包通过、command failure fail、占位文本 fail、非法 JSON fail、changed-files 缺结构 fail、多 summary 冲突 fail、4.3.2 扫描 partial 不冒充 pass、真实 secret-like 文本仍被拦截。
- 第 4.3.2 evidence 口径：生产扫描为 `partial` 时必须如实写成 `partial`，允许交给 GPT 审计，但不得写成 full pass，也不得宣称生产能力已完整。
- 本轮本地基础门禁已通过：typecheck、lint、test:market、build、backtest:golden、forbidden-files、secret-patterns、security-check、test:production-evidence。

第 4.3.2 必须保证：

- 不 push main。
- 不运行 `npm run backtest:formal`。
- 不运行 migration。
- 不修改数据库 schema。
- 不清 Redis。
- 不删除或重建 Docker volume。
- 不接自动下单或交易所下单 API。
- 不改 scan / analysis / strategy / UI 交易逻辑。
- 不得把 evidence validate 写成交易能力成熟。

当前真实状态：

- 本地 evidence 生成和 validator 严格性已增强并通过本地门禁。
- 首次腾讯云 4.3.2 真实 evidence 验证发现 `grep-evidence.md` 脱敏口径仍需补强：问题来自源码规则文本误判，不是已确认的真实 secret 泄露；本轮必须重新提交安全分支、重建 web、重采 real production evidence 并 validate。
- 仍需在腾讯云只重建 `web` 后重新生成 `phase4-3-2` real production evidence，并由 GPT 做最终生产 evidence 审计。
- 当前系统仍不能写成支撑实战交易，不能进入 shadow tracking。

## 2026-07-08 第 5.1-H.1-R.1-FIX 生产运行健康根因修复

第 5.1-H.1-R.1-FIX 只修复生产运行健康，不改扫描、分析、策略、前端交易逻辑、checkpoint outcome、数据库 schema、Redis、Postgres 或 Docker volume。

本轮事实：

- 生产 CoinGlass key 已通过安全脚本注入服务器 `.env.production`，原值未写入代码、报告、证据包或日志。
- `deploy/scripts/update-prod-coinglass-key.sh` 补充 `websocket-light-worker` recreate，防止后续 key 更新时该 worker 留在旧 env。
- web、scanner-worker、websocket-light-worker、coinglass-worker、signal-worker、dynamic-scan-scheduler、macro-worker 已重建并读取更新后的运行时 env。
- CoinGlass capability smoke：HTTP 200，accountPlan=`hobbyist`，deepScanStatus=`ready`，`futures_pairs_markets` / `open_interest_current` / `funding_current` 可用；`taker_buy_sell_current` 仍为 blocked，必须按能力边界展示。
- `/api/scan` 授权口径已恢复：no secret=401，wrong secret=401，correct secret=200。
- worker heartbeat 已从 6 个 worker 全 down 恢复为 6 个 worker healthy。
- 生产 scan 已从 `partial / scannedCount=0` 恢复为 `ready / fresh`；最新证据中 scannedCount=40、candidateCount=24、radarSignals=24、requestFailures=0。
- production evidence 重新生成并 validate pass，errors=[]，warnings=[]；validator 未弱化，summary 未硬改 pass。
- 本轮门禁通过：ci:forbidden-files、ci:secret-patterns、security:check、test:production-evidence、typecheck、lint、test:market、build、backtest:golden。

仍需诚实保留的边界：

- 服务器 Git worktree 仍有未提交/未跟踪文件，不能写成 deploy clean。
- 本轮只能证明生产 runtime health 修复，不能证明 checkpoint outcome 生产闭环已通过。
- 当前系统仍不能写成支撑实战交易，不能进入 5.2，不能进入实盘。

## 2026-07-10 Git 工作区收口与生产部署真值强化

本轮先完成 GitHub Desktop 工作区清理、正式提交、GitHub `main` 快进和腾讯生产仓库收口，再处理部署过程中暴露的 P1 真值问题。未修改 scan / analysis / strategy / backtest / frontend 交易逻辑。

当前事实：

- 本地 `/Users/chuan/Documents/web` 工作区已清理为干净 `main`；生成态 production observability JSON 和临时恢复稿已先归档到 ignored `reports/workspace-cleanup-20260710/`，未删除历史证据、环境文件、数据库、Redis 或 Docker volume。
- 正式代码与蓝图已推送 GitHub；最终 `main` 为 `a247b59769ee4ec39e7160f50ac6727432a891c7`。
- 腾讯仓库旧分支热修已保存为 `stash@{0}: pre-main-sync-20260710`；仓库根目录 `phase5-*` 残留已移动到 `/home/ubuntu/market-radar-evidence/worktree-residue-20260710/`，没有直接删除。
- 腾讯生产仓库已切换为干净 `main`，HEAD 与 GitHub 一致；最终 Git 状态只有 `## main...origin/main`。
- 生产 `/api/health` 为 `ready`，Web / Postgres / Redis 正常，scanner / websocket-light / CoinGlass / signal / dynamic / macro worker 均运行。
- Shadow runner 已改为 Node 直接作为容器 PID 1；最终 health 为 `ok=true`、`heartbeatFresh=true`、`lockPidAlive=true`、`reason=pid_alive_heartbeat_fresh`、`sameRuntime=true`。
- `production-check.sh` 默认 API readiness 等待 600 秒，Shadow 单独等待 660 秒；远端旧 heartbeat 不再冒充本容器 supervisor healthy。
- 显式确认的 production deploy 若失败，会把 production rollback 确认传递给 rollback 脚本，不再出现“声称自动回滚但实际只 dry-run”。
- production facts 已纳入 Shadow 状态与日志；最新证据目录为 `/home/ubuntu/apps/chuan-market-radar/reports/production-facts/20260710T001040Z`。

测试事实：

- `typecheck`、`lint`、`build`、forbidden-files、secret-patterns、security-check：pass。
- `test:market`：836 pass；worker：17 pass；historical smoke：4 pass。
- `backtest:golden`：16/16 pass；未运行 formal。
- `test:deploy-safety`：5/5 pass；`test:production-evidence`：15/15 pass。
- 腾讯 `docker compose config --quiet`、强化后的 production check、Postgres、Redis、全部 worker、Shadow local supervisor health：pass。

仍需保留的能力结论：

- 当前生产运行底座健康，但系统整体仍为 `可运行但不完整 / 不能支撑实战`。
- 本轮只强化部署与运行真值，没有证明 G0-G9 工程蓝图已完成。
- 下一轮从蓝图 `WP-G0.1 Frontend Truth Contract` 开始，只清理前端合成事实与未知值伪装，不得顺手修改策略或扫描排序。

## 2026-07-10 WP-G0.1 Frontend Truth Contract

本轮只收口前端事实合同与展示语义，没有修改 scan 排序、analysis 结论、strategy、RR 3:1、交易计划、backtest、数据库、Redis、worker 或 secret。

当前事实：

- `main` 生产代码提交为 `05e9530846b276cd1c56bc789b95c2540bfa83aa`；功能提交为 `0e086c7`，扫描分母生产回归修复为 `05e9530`。
- leaderboard 只保留榜单和真实 ticker 价格用途，不再升级为 radar signal、signal card 或 signal token。
- 前端不再合成 direction、freshness、age、source、score、sentiment、volume multiple、anomaly score 或 bull/bear trend；未知价格和不支持字段显示 `n/a`，不再用 0 冒充。
- Dashboard、Signals、System 只消费后端 `radarSignals`；计划就绪为空时保持空，不用榜单补位。
- 全站主定位由“实战雷达”收口为“研究雷达”；SCAN / ANALYSIS / STRATEGY / BACKTEST 权限边界未放宽。
- 全市场扫描证明只保留一个权威组件。生产事实分别为 observed=3112、accepted=1316、eligible=593、current-cycle=24、deep=48；公开接受率 42.3% 以 observed 为分母，当前周期 4.0% 和深扫 8.1% 以 eligible 为分母。
- 本地定向测试 96/96、typecheck、lint、test:market 836/836、worker 17/17、historical smoke 4/4、build、golden 16/16、forbidden-files、secret-patterns、security-check 全部通过；formal 未运行。
- 腾讯生产只重建 `web`；未运行 migration，未修改或清理 Postgres/Redis，未删除或重建 volume。`/api/health` 为 ready/fresh，Postgres 接受连接，Redis PONG，全部 worker healthy，Shadow `heartbeatFresh/lockPidAlive/sameRuntime=true`。
- 生产浏览器复核通过：页面显示“研究雷达”、单一扫描证明、三组明确分母和真实空计划状态。公网仍为明文 HTTP，是未关闭的 P0。
- 脱敏生产证据目录：`/home/ubuntu/apps/chuan-market-radar/reports/production-facts/20260710T010527Z`。

当前真实状态仍是：**可运行但不完整，不能支撑实战。**

## 2026-07-10 WP-G0.2 Candidate Lifecycle and Outcome Truth

本轮先审计 Candidate/Outcome/Review 全链路，再依据任务停止规则冻结范围。结论为 `PARTIAL_SCHEMA_MIGRATION_REQUIRED`，不是 WP-G0.2 PASS，也不是完整 G0 PASS。

当前事实：

- 蓝图 `CandidateEpisode` 没有对应的权威 runtime/persistence entity；journal 与 scan-state 都是会冲突更新的 mutable projection。
- 现有 schema 不能强制一币单活跃 Episode、firstSeen 不可变、closed 历史保留、同币重触发新 ID、parent lineage、append-only event 和 `(eventId, checkpoint)` 单终态 Outcome。
- Review 当前按事件行而非 Episode/Checkpoint 统计；pending/closed 可重叠，null MFE/MAE 会变 0，DB 读取失败可退化为空数组。
- 前端 lifecycle 路径会把非 short 显示为 long，把缺失 price/MFE/MAE 显示为 0，把未命中 TP/SL 的所有状态显示成超时。
- 生产只读点样本 health 为 ready/fresh，但 CandidateEpisode/Outcome 权威数量不可用。旧 120 行 Review 诊断不能作为真实分母。
- 本轮未修改 runtime code、scan/analysis/strategy/READY/RR/ranking，未部署，未 migration，未清 DB/Redis/volume，未运行 formal。
- 已生成 `reports/wp-g0-2-candidate-lifecycle-outcome-truth/WP-G0.2-MIGRATION-PROPOSAL.md`。它是提案，不是迁移授权。

当前仍为 **R1 / 可运行但不完整 / 不能支撑实战**。最后完整完成包仍是 WP-G0.1；完整 G0 未通过。当前无自动授权的下一 Work Package，唯一建议是人工审批 `WP-G0.2-MIGRATION-DESIGN-AND-APPROVAL`。

## 2026-07-10 WP-G0.2 Migration Design and Approval

本轮是纯设计与审批包，最终设计状态为 `PROPOSED / READY_FOR_USER_APPROVAL`，不表示用户已批准或 schema 已实现。

冻结决定：v1 scope 为单一 `production_radar` 权威通道；单活跃键是 `(scope, canonical_instrument_id) WHERE closed_at IS NULL`；不允许同币 long/short 或多策略并行 Episode；方向反转关闭旧 Episode 并创建 child。Checkpoint 与 Outcome 分表，retry 属于 Checkpoint，Outcome 只有 recorded/missed/data_unavailable 三个不可变终态。`eg.v1` 要求有界 1m K 线 100% 覆盖、无缺失/重复/future candle，并保存版本、reasons 和 candle-set hash。

事务正确性由 Postgres same-connection transaction、advisory/row lock、partial unique、idempotency hash、stream version、claim lease 和 fencing token共同保证；Redis 不授予写权限。Legacy 默认权威 Episode/Outcome 回填数为 0，partial/unclassified 永不进入正常状态机或指标分母。

Cutover 使用 outbox + 单一 phase/epoch 控制，dual projection 硬上限 72h，需连续 24h 无可比差异和 10,000 次写入；切换写冻结最多 120 秒。Rollback 保留新 schema/历史，旧投影不完整时只能 forward-fix。任何 production add-schema、shadow writer、backfill 和 read cutover 都必须单独审批。

当前系统事实没有改善：runtime/schema/frontend/production 均未改变，完整 WP-G0.2/G0 未完成，仍为 R1、不能支撑实战、自动交易永久禁止。正式 known-issues registry 仍不存在，本包只生成 local risk register/supplement。

## 2026-07-09 第 5.1-H.1-R.2-FIX Shadow Runner Loop 根因修复

第 5.1-H.1-R.2-FIX 只修复 Shadow Runner 自动循环、lock、heartbeat、status 真伪判断、capture loop 和 auto checkpoint due sweep，不改 scan / analysis / strategy / UI 交易逻辑，不改 checkpoint outcome 算法，不动数据库 schema、Redis、Postgres 或 Docker volume。

本轮事实：

- 根因类别：`shadow_runner_missing_supervisor_and_runtime_truth_guard`。
- 修复前：runner manifest 显示 `running`，但 lock pid 已死，heartbeat 停在 `2026-07-08T14:36:03.170Z`，captureCount 停在 1212，未观察到自动 capture 或自动 due sweep。
- 直接根因：Shadow Runner 由 CLI start 派生 detached child，缺少 Docker/systemd supervisor；child 退出后 manifest 仍可能停留在 `running`。
- 状态根因：`shadow:status` 过度相信 manifest，没有用 pid、heartbeat、runtimeId 推导真实运行态。
- 已新增 `shadow-runner` Docker Compose 服务，`restart: unless-stopped`，依赖 `web` healthy，挂载 reports volume，执行 `shadow:prod:run-loop`。
- 已新增 runner runtime 状态推导：lock / state 记录 `hostname`、`pid`、`runtimeId`、`heartbeatAt`、`mode`、`updatedAt`；status / health 用 manifest + pid liveness + heartbeat freshness 推导。
- 已新增 stale lock cleanup、dead pid recovery、duplicate runner guard、`shadow:prod:health`。
- 生产修复后证据：`shadow-runner` 容器持续运行 17+ 分钟；lock pid alive；heartbeat fresh；effectiveStatus=`running`；duplicate runner 被 `shadow_runner_duplicate_active` 阻断。
- 已观察至少两个完整自动周期：`01:18`、`01:23`、`01:33` 均更新 capture 与 checkpoint sweep。
- outcomes 从 2448 增至 2918，events 从 1212 增至 1251，checkpoint `duePending=0`。
- `shadow:prod:validate`：pass。
- `production:smoke`：pass。
- `production:evidence:validate`：real_production / pass / errors=[] / warnings=[]。
- 本轮门禁通过：build:market-cli、runner-runtime 定向测试、shadow storage + runner runtime、typecheck、lint、test:market、build、backtest:golden、ci:forbidden-files、ci:secret-patterns、security:check、test:production-evidence。

仍需诚实保留的边界：

- 本轮不是 5.1-H.1-R.2 正式重跑；本轮成功后只允许重跑 `5.1-H.1-R.2 checkpoint outcome 生产口径最终验收`。
- 本轮不能直接进入 `5.1-H`、`5.2` 或任何实盘阶段。
- 本轮生产侧采用服务器文件覆盖 + 只重建 `shadow-runner` 的方式完成；服务器 Git worktree 仍需后续收口，不能写成 deploy clean。
- 当前系统仍不能写成支撑实战交易，不能进入实盘。

## 2026-07-12 WP-AUTO-01 全自动工程控制层与质量锁

本轮只建立全自动工程的治理和 fail-closed 控制层，不修改 scan、analysis、strategy、backtest、frontend、API、数据库、Redis、worker、部署或 secret。它是后续工程施工的质量底座，不提升当前交易能力等级。

当前事实：

- 新增机器状态源 `AUTONOMOUS_ENGINEERING_STATE.json`，锁定 R1、`可运行但不完整 / 不能支撑实战`、Candidate schema `applied_verify_failed` 和 runtime disabled。
- 自动控制器会检查每包 allowlist/prohibited path、Production/Local WIP=1、生产审批时间窗、必须工件、状态哈希、工作树指纹和全部门禁证据；任一不一致即 fail closed。
- 永久硬锁包括 RR `>=3:1`、禁止自动交易/交易所下单 API、禁止回测结果污染生产排序、禁止前端生成交易计划、禁止自动运行 formal、禁止自动批准生产操作。
- 定向防绕过和指纹回归测试 16/16 通过，覆盖降低 RR、自动交易、formal、过期/缺失生产审批、越界文件、陈旧或缺失门禁证据，以及 Git 暂存状态不改变内容指纹。
- 提交前 staged diff 复核曾发现指纹依赖 Git 暂存状态；提交被阻止且未产生 commit。控制器已改为只绑定文件路径、内容、可执行位和文件类型，并新增“同内容暂存前后指纹不变”回归测试。
- 历史 `reports/wp-capacity-offhost-restore-remediation/**` 已从 Git 索引取消跟踪，但本地文件完整保留；forbidden-files、secret-patterns 和 security-check 已恢复 PASS。
- 当前路线真值已更正：Candidate authority 8/8 migration 已执行，但 post-schema automatic verify 因 NOINHERIT login 未 `SET ROLE` 返回 42501；Feature Flag 仍为 0。禁止再次 execute migration，下一包只做本地 verifier 修复，之后 production verify-only 仍需新的独立审批。
- 本轮手工基础门禁已通过：typecheck、lint、test:market 924 pass / 0 fail / 1 isolated DB skip、worker 17/17、historical smoke 4/4、build、backtest:golden 16/16，以及三项安全门禁。formal 未运行且自动控制器明确禁止。

当前能力结论不变：**R1 / 可运行但不完整 / 不能支撑实战**。该控制层只能证明后续工程更难自欺、越界或带病提交，不能证明全市场雷达核心链已经达到实战级。
