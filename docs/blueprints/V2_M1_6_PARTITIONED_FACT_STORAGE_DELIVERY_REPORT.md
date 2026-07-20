# 本轮交付报告

状态：`M1.6_LOCAL_ENGINEERING_AND_POSTGRES16_REHEARSAL_PASS / FULL_CI_PASS / PRODUCTION_UNCHANGED`

## 1. 本轮目标

为高频 `PointInTimeMarketFact` 建立可扩展日分区、活动身份唯一性、容量水位、受控物理保留、备份恢复证据和清理审计，不改变 Fact 语义或交易逻辑。

## 2. 范围边界

只修改 V2 M1 Fact Store、PostgreSQL additive migration、分区治理、隔离 PG16 演练、必要的 M1 PG 回归和权威文档。未修改 Legacy、前端、API、Provider、Feature/Context 语义、Candidate、Analysis、Strategy、Backtest、Redis、生产 env、secret 或生产数据库。

## 3. 修改文件清单

- `partitioned-fact-contract.ts`、测试：容量状态、日分区 inventory、backup evidence 和 retention run strict 合同。
- `partitioned-fact-postgres-schema.ts`、测试：独立 checksum migration、专用分区表、活动身份注册表、权限、函数与审计账本。
- `partitioned-fact-postgres-governance.ts`：Reader/Audit/Retention 三类 capability 接口。
- `postgres-artifact-store.ts`、`contracts.ts`：新 Fact 分区写、迁移前旧读兼容、审计清理后的重灌拒绝。
- `partitioned-fact-postgres.integration.test.ts`：真实迁移、跨分区、权限、dump/restore、replay、retention 与防重灌演练。
- 三个 Collector/Store PostgreSQL integration：全部要求 M1.6 migration 与预建分区。
- `m1-partitioned-fact-postgres16.sh`、`package.json`：定向和隔离 PG16 入口。
- M1.6 合同、蓝图、机器矩阵、Context、Changelog、README 与施工顺序：同步当前事实和下一入口。

## 4. 对核心链路的影响

加固 `Universe -> Market Fact + Quality -> Runtime Truth` 的长期全市场数据地基。它不提高发现率，不生成 Candidate、方向、等级、Signal、READY、入场、止损、目标或交易计划。

## 5. 分层边界影响

- `scan / analysis / strategy / backtest`：零业务逻辑变更。
- `frontend / API / Redis`：零变更。
- `DB`：新增未部署的 additive migration；旧 migration checksum 未改变。
- `worker`：只更新隔离 PG 集成准备，不改调度、Provider 或运行 profile。
- `deployment / secret`：零生产动作，零真实 secret。

## 6. 风险说明

- 生产 migration 与容量阈值尚未绑定，不能声明长期全市场写入可用。
- 迁移前旧 Fact 保持兼容但不会由本迁移自动清理；生产 preflight 必须证明旧 Fact 为零，或另做受控 backfill/retirement。
- DROP 是高风险 DDL，生产只能由独立 retention 身份在 restore-verified evidence 后执行。
- 本机 live egress、Docker 和 OrcaTerm 通道限制仍存在，M1.5-B1/M1.7 未通过。

## 7. 执行命令

```text
npm run test:v2-m1-partitioned-fact
npm run v2:m1:partitioned-fact:pg16-rehearsal
npm run v2:m1:store-replay:pg16-rehearsal
npm run v2:m1:collector:pg16-rehearsal
npm run v2:m1:collector-checkpoint:pg16-rehearsal
npm run typecheck
npm run lint
npm run test:v2-foundation
npm run ci:production
```

未执行 `backtest:formal`、生产命令、live provider、Docker、migration deploy 或 production smoke。

## 8. 测试结果

- `test:v2-m1-partitioned-fact`：PASS，5/5。
- M1.6 隔离 PostgreSQL 16：PASS，1/1。
- M1.3 Store/Replay、M1.4 Collector、M1.5 Checkpoint PG16 回归：各 1/1 PASS。
- `typecheck`、`lint`：PASS。
- `test:v2-foundation`：141 pass / 0 fail / 5 explicit external-dependency skips。
- 完整 `ci:production`：PASS，`exit_code=0`；Legacy market 965 pass / 0 fail / 4 skip，Worker 23/23，历史回测 4/4，全 V2 141 pass / 0 fail / 5 explicit external-dependency skips，M0 10/10、生产 build、golden 16/16、forbidden files、secret patterns 与 security 全部通过。
- production smoke、`backtest:formal`：未运行，范围不允许。

## 9. 失败项

1. 首次 PG16 migration 演练因 PL/pgSQL 输出变量与列名 `partition_name` 歧义失败；加表别名后通过，任何写入前已终止。
2. 首次 M1.3 回归中数据库拒绝篡改 Fact，但 Store 丢失精确冲突码；已区分并恢复 idempotency/immutable/retired 语义。
3. 首次跨分区 fixture 使用 30 天保留时已早于当前日期，数据库诚实降级；非清理目标分区改用既有长期 rehearsal 保留，目标分区仍用真实短期到期。
4. 首次清理后重灌被“无可路由分区”泛化；Store 增加身份/分区事件前置检查后明确返回 `ARTIFACT_RETIRED`。
5. 容量反审计发现永久身份墓碑会无限增长；已改为有界活动身份注册表，并用不可变 DROPPED 事件永久阻止重灌。
6. 最终旁路审计发现低层 SQL 既可能把新 Fact 写回旧账本，也可能把迁移前身份重复写入新分区；两条写入路径都已增加数据库触发器，真实 PG16 演练分别证明旁路与跨账本重复被拒绝。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，只记录 M1.6 当前事实、未证明项和下一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入 `V2-M2.0-DISCOVERY-CONTRACTS-AND-GOLDEN-FIXTURES` 本地合同工程；不可以声明 M1 完成，不可以启动 M2 Detector runtime，不可以执行生产 migration 或长期 Shadow。外部 M1.5-B1 仍是独立阻断 Gate。

## 13. 下一轮建议

只冻结六类机会 taxonomy、Detector 输入边界、`DiscoveryCandidate -> CandidateEpisode -> OpportunityThesis` 生命周期合同、三分母和 point-in-time 黄金样本；禁止方向等级、交易计划、M1 runtime 读取与 Outcome 反写。
