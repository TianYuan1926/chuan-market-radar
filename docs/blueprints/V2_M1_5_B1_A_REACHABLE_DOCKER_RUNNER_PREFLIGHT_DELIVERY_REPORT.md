# 本轮交付报告

## 1. 本轮目标

执行 `V2-M1.5-B1-A-REACHABLE-DOCKER-RUNNER-PREFLIGHT`：在可达 Docker Runner 上构建 exact source 的 M1 no-authority 镜像，真实采集 Binance Futures、OKX Swap、Bybit Linear Perpetual，证明技术 Runner、三 Venue 分母、持久化、清理和证据链，同时把业务 SLO 结论与技术 PASS 严格分离。

## 2. 范围边界

本轮只修改 B1-A live integration/preflight 验证代码和治理文档。现场只使用腾讯宿主机上的隔离临时 Runner、临时 PostgreSQL、临时 network/volume 和工作区外 evidence 目录。

本轮没有修改生产数据库、Redis、Web、Worker、Caddy、Compose、env、Feature Flag、migration、Candidate runtime、交易逻辑、生产仓库或生产 authority；没有读取或上传 secret 内容，没有自动交易能力。

## 3. 修改文件清单

- `src/v2/modules/market-fact/collector/collector-live.integration.test.ts`：让 live 预检同时保存完整周期真值，并验证部分 freshness 不能宣称 READY。
- `scripts/v2/production/m1-reachable-runner-preflight.mjs`：将技术 Runner 结论与业务 readiness/SLO 分开，生成内容寻址、可重算、可清理复核的 v2 证据。
- `scripts/v2/production/m1-reachable-runner-preflight.test.mjs`：增加分母不完整、原因缺失、部分 freshness、SLO FAIL 被弱化等 anti-inflation 回归。
- `src/v2/governance/m0-exit-validator.ts`：移除会重复派发旧 B1-A 的硬编码入口，改为读取唯一机器矩阵，并验证当前包没有生产变更权限。
- `src/v2/governance/m0-exit-validator.test.ts`：锁定 B1-A 已完成、B1-B0 为当前入口和外部历史来源 Gate 的一致性。
- `docs/blueprints/V2_M1_5_B1_A_REACHABLE_DOCKER_RUNNER_PREFLIGHT_DELIVERY_REPORT.md`：记录本轮范围、结果和下一入口。
- 权威 Context、Changelog、蓝图、机器矩阵、索引与搭建顺序：删除 B1-A 待执行/Docker 未证明的过期事实，写入正确后续顺序。

## 4. 对核心链路的影响

加固 `全市场发现 -> Market Fact + Quality` 的运行地基。它证明三 Venue Collector 可以在隔离 Docker Runner 完成全 eligible 分母和持久化，但同时证明当前周期不能满足业务就绪门槛。

本轮没有进入 Candidate、深扫验证、结构分析、风险赔率、交易计划或复盘晋级。

## 5. 分层边界影响

- scan：只影响上游 Market Fact 运行证据，不生成候选或排名。
- analysis / strategy / backtest：未修改。
- frontend / API：未修改。
- DB：只使用隔离临时 PostgreSQL；生产 DB 未连接、未迁移。
- Redis / 生产 worker / deployment / secret：未修改。
- authority：固定 `NO_AUTHORITY`，`automaticTradingAllowed=false`。

## 6. 风险说明

B1-A 技术预检通过，但业务 readiness 明确失败，不能写成“全市场扫描已健康”或“M1.5-B1 已完成”。两周期均为 `DEGRADED / PARTIAL / NOT_READY`：第一周期主要是 Binance 三个 ticker 在 cutoff 时 stale；第二周期出现大量 duplicate ticker sequence，Binance fresh ratio 降到约 67.92%。两周期之间还暴露固定节拍 missed start。

下一包必须先取得 31 周期固定节拍原始证据。后续整改不得直接增大 freshness 阈值，不得把 duplicate、idle instrument 或 carried-forward price 标记为 FRESH，也不得把 SLO `FAIL` 包装为证据不足。

## 7. 执行命令

- `node --test scripts/v2/production/m1-reachable-runner-preflight.test.mjs`
- B1-A exact source isolated runner（由 `m1-reachable-runner-preflight.mjs` 编排）
- `npm run ci:production`
- 服务器端 SHA-256 复核与 `verifyReachableRunnerEvidence` 独立重算
- Git status、敏感信息门禁、commit 与 push

## 8. 测试结果

- B1-A 定向 anti-inflation 测试：PASS。
- 腾讯隔离 Docker Runner：`PASS_REACHABLE_DOCKER_RUNNER_PREFLIGHT`。
- exact source commit：`97f10e75ce296b07d933e9c362c40ba2be0997ea`。
- evidence digest：`sha256:a44cab89b8a4bf291e7c8f67eb6de2b76f2637f4f8265d91ebb8f1224d2a40c2`，独立重算 PASS。
- 两周期 collected：1,444/1,444；fresh：1,441/1,444、1,274/1,444；READY：0/2。
- checkpoint / persistence：两周期均 `INSERTED`。
- provider failure：0。
- host cleanup：PASS；11 个运行容器、4 个 network、5 个 volume 的 baseline/post-cleanup digest 完全一致。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：PASS，Legacy 965 pass / 0 fail / 4 skip。
- `npm run build`：PASS。
- `npm run backtest:golden`：PASS，16/16。
- 完整 `npm run ci:production`：PASS；V2 267 pass / 0 fail / 5 explicit external-dependency skip，Worker 23/23，Historical 4/4，M0 11/11，security PASS。
- `npm run backtest:formal`：未运行；本轮不是正式能力验收。
- production smoke：未运行；本轮没有部署或变更生产服务。

## 9. 失败项

业务 readiness/SLO：`FAIL`，不是测试异常。

- `fresh_coverage_below_slo`
- `missed_schedule_starts_above_slo`
- `operational_ready_ratio_below_slo`

第一次现场执行还发现 preflight 旧合同错误地期待 `INSUFFICIENT_EVIDENCE`，而 SLO evaluator 正确返回 `FAIL`。本轮保留 evaluator 和门槛，修正 preflight 让失败真值向上透传后重新执行通过技术 Gate。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入 `B1-B0` 证据合同工程；不可以直接进入生产 Shadow、M1.7、M2 runtime 或能力宣称。

## 13. 下一轮建议

只执行 `V2-M1.5-B1-B0-EARLY-SHADOW-EVIDENCE-CONTRACT`：实现固定 31 周期、完整分母、内容寻址证据、业务 Gate 独立结论和宿主机精确恢复，再以原门槛进行一次真实捕获。
