# 本轮交付报告

状态：`M1.5A_LOCAL_ENGINEERING_AND_POSTGRES16_PASS / LIVE_EGRESS_UNAVAILABLE / M1.5B_SHADOW_GATE_PENDING / PRODUCTION_UNCHANGED`

## 1. 本轮目标

把 M1.4 Collector Runtime 组合成可重启、可停止、固定节拍、不可重叠且永久无读取/交易权威的 Worker；建立 live public provider rehearsal 和连续 Shadow/SLO 的诚实证据入口。

## 2. 范围边界

本轮只修改 V2 Market Fact Collector、M1 additive checkpoint schema/store、V2 Worker 入口、测试和权威文档。未修改 Legacy 运行逻辑、前端、API、Detector、Analysis、Strategy、Backtest、Redis、现有生产数据库、Compose、env 或 secret；未执行生产 migration、部署或 authority 切换。

## 3. 修改文件清单

- `package.json`：增加 M1.5 定向、checkpoint PG16 和 live rehearsal 命令。
- `src/v2/modules/market-fact/collector/contracts.ts`：增加可持久化 Runtime state 与 restore error。
- `src/v2/modules/market-fact/collector/collector-runtime.ts`：支持精确 durable restore、sequence pruning 和 checkpoint candidate；Store 失败不产生断点。
- `src/v2/modules/market-fact/collector/checkpoint-contract.ts`：checkpoint strict schema、内容寻址、config/sequence digest、构建与恢复校验。
- `src/v2/modules/market-fact/collector/checkpoint-postgres-schema.ts`：独立 additive migration、外键/trigger、append-only 和最小权限 grant。
- `src/v2/modules/market-fact/collector/postgres-checkpoint-store.ts`：checkpoint 幂等 append、严格 row round-trip 和精确 latest restore。
- `src/v2/modules/market-fact/collector/collector-worker-contract.ts`：NO_AUTHORITY Worker cycle、readiness/checkpoint/资源/调度严格合同。
- `src/v2/modules/market-fact/collector/collector-worker.ts`：single-use、固定节拍、skip-missed、优雅停止、失败即停和强制 telemetry sink。
- `src/v2/modules/market-fact/collector/collector-slo.ts`：三态 SLO evaluator、最小观察证据和完整性/覆盖/资源门槛。
- `src/v2/modules/market-fact/collector/adapters/live-public-rest-adapter-runtime.ts`：在 Adapter 边界内组合真实 public transport。
- `src/v2/entrypoints/m1-collector-worker.ts`：分离读写身份、完整 commit 绑定、禁 migration、NO_AUTHORITY 进程入口。
- `src/v2/entrypoints/m1-collector-worker.test.ts`：进程 env、身份、authority 和 migration 边界测试。
- `src/v2/modules/market-fact/collector/collector-checkpoint.test.ts`：digest/authority 篡改、错 release/config 和恢复测试。
- `src/v2/modules/market-fact/collector/collector-checkpoint-postgres.integration.test.ts`：真实 PG16 append-only、权限、断点不领先和跨连接恢复测试。
- `src/v2/modules/market-fact/collector/collector-worker.test.ts`：固定节拍、重叠拒绝、失败即停和 stop drain 测试。
- `src/v2/modules/market-fact/collector/collector-slo.test.ts`：短观察不足、PASS、0 denominator、资源和混 config 测试。
- `src/v2/modules/market-fact/collector/collector-live.integration.test.ts`：三家 public endpoint 两轮真实无权威演练。
- `scripts/v2/rehearsal/m1-collector-checkpoint-postgres16.sh`：隔离 PG16 checkpoint rehearsal。
- `scripts/v2/rehearsal/m1-live-no-authority-postgres16.sh`：隔离 PG16 + live public rehearsal。
- `src/v2/governance/m0-exit-validator.ts`：把机器报告的唯一下一入口更新为 M1.5-B Gate。
- `docs/architecture/v2/M1_5_LIVE_NO_AUTHORITY_COLLECTOR_CONTRACT_V1.md`：冻结本轮工程、运行、SLO 和独立生产 Gate。
- `docs/architecture/v2/M1_FOUNDATION_VERTICAL_SLICE_CONTRACT_V1.md`：记录 M1.5-A 当前证据和未完成边界。
- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`：更新 M1 当前事实和唯一下一入口。
- `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json`：更新机器状态、合同、报告和 M1.5-B 路由。
- `docs/blueprints/README.md`：登记 M1.5 权威材料和当前入口。
- `market-radar-v2-build-sequence.md`：把 M1.5 分成已通过的 A 本地出口与待执行的 B live/shadow gate。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`：更新当前真实能力、风险、测试和下一入口。
- `CHANGELOG_FOR_CHATGPT.md`：增加 M1.5-A，并保持最近 5 个重要变化。
- `docs/blueprints/V2_M1_5_LIVE_NO_AUTHORITY_COLLECTOR_DELIVERY_REPORT.md`：本报告。

## 4. 对核心链路的影响

本轮强化 `全市场发现` 之前的运行地基：事实周期可从已验证断点恢复，只有 artifact 与 checkpoint 均成功的新周期才能 operational READY。它不增加候选筛选、深扫验证、结构分析、风险赔率、交易计划或复盘进化能力，也不把 light data 包装成机会。

## 5. 分层边界影响

- `scan`：未进入 Detector，只提供未来扫描可依赖的 Fact 运行地基。
- `analysis / strategy / backtest`：未修改；无方向、等级、计划、RR 或 future outcome。
- `frontend / API`：未修改，V2 仍无页面读取 authority。
- `DB`：只新增未在生产执行的 additive migration；旧 migration/checksum 未改。
- `Redis`：未涉及。
- `worker`：新增 V2 no-authority Worker 代码和入口，未部署。
- `deployment`：只具备可发布入口和独立 Gate 合同，生产零变更。
- `secret`：未新增或提交 secret；入口只读取变量名，不输出连接串。

## 6. 风险说明

- 本机到 Binance、OKX、Bybit 三家 endpoint 的 TCP/HTTPS 连接均超时，live 两轮为 0 observed / 0 eligible / `DEGRADED`。不能声明 live contract、真实市场规模或 SLO 已通过。
- checkpoint 在 artifact transaction 后单独追加，因此进程可留下“artifact 已写、checkpoint 尚未写”；该状态只会让断点落后，数据库约束禁止断点领先，Worker 在 checkpoint 失败后立即停止。
- migration 和 Worker 尚未进入生产；生产身份、资源、网络、备份和回滚仍需独立 Gate。
- 系统仍为 R1，可运行但不完整，不能支撑实战。

## 7. 执行命令

```bash
npm run test:v2-m1-collector
node --test .tmp/market-tests/v2/entrypoints/m1-collector-worker.test.js
npm run v2:m1:collector-checkpoint:pg16-rehearsal
npm run v2:m1:collector:pg16-rehearsal
npm run v2:m1:store-replay:pg16-rehearsal
npm run v2:m1:collector:live-no-authority-rehearsal
curl --connect-timeout 5 --max-time 12 <three public provider endpoints>
npm run test:v2-foundation
npm run typecheck
npm run lint
npm run ci:production
git diff --check
```

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS，0 warning。
- `npm run test:market`：PASS，核心 965 pass / 0 fail / 4 skip；workers 23/23；historical 4/4。
- `npm run test:v2-m1-collector`：PASS，30/30。
- `npm run test:v2-foundation`：PASS，130 pass / 0 fail / 4 explicit integration skip。
- M1.5 checkpoint PostgreSQL 16：PASS，1/1。
- M1.4 Collector PostgreSQL 16 回归：PASS，1/1。
- M1.3 Store/Replay PostgreSQL 16 回归：PASS，1/1。
- `npm run v2:m0:verify`：PASS，10/10。
- `npm run build`：PASS。
- `npm run backtest:golden`：PASS，16/16。
- forbidden files、secret patterns、security：PASS。
- 单实例完整 `npm run ci:production`：PASS。
- live no-authority rehearsal：FAIL/UNAVAILABLE；两轮、三家 provider 均 timeout，未达到 READY。
- `npm run backtest:formal`：未运行，按合同禁止在本轮乱跑。
- production smoke：未运行，生产零变更。

## 9. 失败项

1. 首次 live test 编译时 telemetry callback 暴露了 `Array.push` 数字返回值；typecheck 失败后改为无返回 block，并从编译重跑。
2. 两次 live rehearsal 均因本机三家 provider 网络连接/请求超时失败；独立 `curl` 也在 5 秒连接阶段超时。没有放宽 READY 或改用 fixture 顶替。
3. 首次完整 `ci:production` 的 full typecheck 发现隔离 env fixture 缺少仓库必填 `NODE_ENV`；补为 `test` 后从完整 CI 第一项重跑并通过。
4. M0 机器报告输出了旧的 M1.5 入口；已更新为 M1.5-B live/shadow gate 并重新验证。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，只记录当前事实、live 失败和唯一下一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.5-LIVE-SHADOW-GATE` 的可达网络 rehearsal 与精确生产 Gate 准备；不可以把 M1 标为完成，不可以让 M2 读取 M1 authority，也不可以声明实战能力。

## 13. 下一轮建议

只执行 `V2-M1.5-LIVE-SHADOW-GATE`：先取得三家 provider 的真实四分母和 READY 周期，再绑定 exact release、checkpoint migration checksum `sha256:fa04652c2c72f00c3a6f1f5cd1b39f2b9f098f998dffd3cb275a54b7e030f37d`、分离身份、资源预算和回滚目标，提交 no-authority Shadow Gate。
