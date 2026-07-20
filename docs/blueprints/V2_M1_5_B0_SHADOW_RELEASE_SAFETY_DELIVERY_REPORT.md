# 本轮交付报告

状态：`M1.5-B0_LOCAL_ENGINEERING_PASS / EXTERNAL_CHANNEL_UNAVAILABLE / DOCKER_BUILD_UNPROVEN / PRODUCTION_UNCHANGED`

## 1. 本轮目标

在 M1 Collector 进入任何 live Shadow 前，修复最小数据库身份、secret 注入、完整 SLO 证据和独立容器边界，并根据真实容量风险调整 M1 后续施工顺序。

## 2. 范围边界

本轮只修改 V2 M1 no-authority 进程入口、observation/SLO evidence、专用 Shadow 容器模板、测试和权威文档。未修改 Legacy、前端、API、Provider 算法、Fact 业务语义、Feature、Context、Detector、Analysis、Strategy、Backtest、Redis、现有数据库、生产 env 或 secret；未执行 migration、部署或 authority 切换。

## 3. 修改文件清单

- `src/v2/entrypoints/m1-collector-worker.ts`：增加有限 profile、secret-file URL、host/database 绑定、显式 role assumption、会话身份验证和完整 observation 输出。
- `src/v2/entrypoints/m1-collector-worker.test.ts`：覆盖 profile、secret source、endpoint 与 reader/writer identity fail-closed。
- `src/v2/entrypoints/m1-collector-slo-report.ts`、对应测试：从严格 JSONL 生成固定 profile SLO 报告，非 PASS 返回失败退出码。
- `src/v2/modules/market-fact/collector/collector-observation-log.ts`：定义完整 strict cycle log envelope。
- `src/v2/modules/market-fact/collector/collector-shadow-evidence.ts`、对应测试：冻结 30 分钟/24 小时 SLO profile 与 JSONL decoder。
- `src/v2/modules/market-fact/collector/collector-worker.test.ts`：证明完整日志 roundtrip 与短观察只能证据不足。
- `deploy/v2/m1-collector/Dockerfile`：只复制编译后 V2 runtime 的非 root Collector 镜像。
- `deploy/v2/m1-collector/compose.shadow.yml`：有限 no-authority Shadow service、独立 storage/egress network、secret files、只读 filesystem 与资源/日志边界。
- `scripts/v2/production/m1-shadow-package.test.mjs`：防止 Legacy secret、端口、特权、自动重启或整仓运行代码进入 Shadow。
- `package.json`：把新增入口、evidence 与 package tests 纳入 M1 定向门禁。
- `src/v2/governance/legacy-consumer-map.ts`、对应测试：统一排除 `src/deploy/scripts/tools` 下的 V2 专属根目录，防止 V2 运维文件污染 Legacy 基线。
- `docs/architecture/v2/M1_5_B0_SHADOW_RELEASE_SAFETY_CONTRACT_V1.md`：冻结本轮安全合同、外部预检事实与分阶段出口。
- `docs/architecture/v2/M1_5_LIVE_NO_AUTHORITY_COLLECTOR_CONTRACT_V1.md`、`M1_FOUNDATION_VERTICAL_SLICE_CONTRACT_V1.md`：同步 B0 证据和单表 retention 阻断。
- `market-radar-v2-build-sequence.md`：拆分 B0、本地/外部 B1、M1.6 分区存储与 M1.7 持续 SLO。
- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`、机器矩阵、README：切换唯一工程入口为 M1.6，并登记外部 B1 Gate。
- `src/v2/governance/m0-exit-validator.ts`：机器路由对准 M1.6。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：只记录当前事实、风险和下一入口。

## 4. 对核心链路的影响

本轮加固 `Universe Registry -> Market Fact + Quality -> Runtime Truth` 的 live 前运行地基。它不提升发现率，不产生 Candidate、方向、等级、Signal、READY、入场、止损、目标或交易计划。

## 5. 分层边界影响

- `scan / analysis / strategy / backtest`：零逻辑变更。
- `frontend / API`：零变更。
- `DB`：只读取既有 schema 代码做审计；零 migration、DDL、DML 或生产连接。
- `Redis`：零变更，Shadow service 不接收 Redis URL。
- `worker`：仅 V2 M1 no-authority bounded Shadow 入口与证据边界。
- `deployment`：新增未部署的专用 Dockerfile/Compose overlay；真实 build 与 merge 未证明。
- `secret`：只定义 file-based 注入合同，未创建、读取或写入真实 secret。

## 6. 风险说明

- 当前本机三家 provider egress 仍不可达，不能证明 live Universe。
- Edge OrcaTerm 新鲜状态为 0 会话/无连接配置，不能执行可信生产 preflight。
- 本机没有 Docker CLI，不能证明真实 image build、Compose merge 或 image digest。
- 高频 Fact 当前逐标的进入无物理 purge 的单一 append-only ledger；只允许有限 Shadow。长期一分钟写入必须等待 M1.6 分区/retention 出口。
- 新增容器模板尚未绑定当前生产 identity wrapper、schema 状态、资源容量或回滚镜像；这些只能由后续精确 Gate 形成。

## 7. 执行命令

```text
npm run test:v2-m1-collector
npm run typecheck
npm run lint
npm run test:v2-foundation
npm run v2:m1:collector-checkpoint:pg16-rehearsal
npm run v2:m1:collector:pg16-rehearsal
npm run v2:m1:store-replay:pg16-rehearsal
npm run ci:production
ruby YAML parse for base and Shadow Compose
bash -n for M1 rehearsal scripts
git diff --check
Microsoft Edge read-only OrcaTerm inspection
```

未执行 `backtest:formal`、生产命令、Docker build、Compose up、migration 或 smoke。

## 8. 测试结果

- `npm run test:v2-m1-collector`：PASS，41/41。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:v2-foundation`：PASS，136 pass / 0 fail / 4 explicit external-dependency skips。
- 三项隔离 PostgreSQL 16 回归：M1.5 checkpoint restart、M1.4 collector、M1.3 store/replay 各 1/1 PASS；均为 `productionConnected=false / productionChanged=false`。
- `npm run ci:production`：PASS，`exit_code=0`；Legacy market 965/0、Worker 23/0、历史回测 4/0、V2 136/0、build、golden 16/16 与 security 均通过。
- YAML 语法、shell syntax、`git diff --check`：PASS。
- Docker image build / Compose merge：UNPROVEN，本机 Docker CLI 不存在。
- production smoke：未运行，生产零变更。
- `backtest:formal`：未运行，本轮不属于 formal 能力验收。

## 9. 失败项

1. 本机 `docker compose ... config` 返回 `docker: No such file or directory`。这只说明本机缺少 Docker CLI；已保留为 UNPROVEN，不以 YAML 解析替代。
2. 首次 Ruby YAML 检查使用了当前系统 Ruby 不支持的新版 `aliases:` keyword；改用兼容 API 后两个 YAML 均解析通过，文件未因此降级。
3. 首次 `git diff --check` 发现一处行尾空格；已删除并重新通过。
4. OrcaTerm 只有新建 SSH 连接表单，没有已保存连接；未输入主机或凭据，未创建持久访问。
5. 首次全 V2 门禁为 2 FAIL：新增 `deploy/v2/**` 被 Legacy capability 源文件展开路径误纳入消费者地图。已把 V2 root 排除同时应用到依赖图与 capability source 两条路径，新增定向回归后为 3/3 PASS；没有重生成或改写 539 文件 Legacy 基线来掩盖失败。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。记录 B0 能力、Docker/live 未证明、单表 retention P1 和 M1.6 唯一工程入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.6-PARTITIONED-FACT-STORAGE` 本地工程；不可以声明 M1 完成，不可以运行长期 Shadow，不可以让 M2 runtime 读取 M1 authority。外部 M1.5-B1 仍需可信生产通道、Docker runner 和独立精确 Gate。

## 13. 下一轮建议

只实现高频 `PointInTimeMarketFact` 的独立 additive 时间分区存储、受控保留、容量水位、purge 审计和 replay/恢复 parity；不改 Provider、Feature、Detector、页面或交易逻辑。
