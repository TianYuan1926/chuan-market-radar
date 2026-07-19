# 本轮交付报告

任务：`V2-M1.3 Fact Store, Replay Manifest and Runtime Truth Rehearsal`

## 1. 本轮目标

把 M1.1-M1.2 的冻结 Universe/Fact/Feature/Context 纵切写入真实隔离 PostgreSQL 16 append-only 账本，从账本按 event/knowledge 双 cutoff 重放，并用五类独立证据生成不夸大的 Runtime Truth。

## 2. 范围边界

已修改：

- V2 M1 artifact store、完整性、原子 lineage、幂等、retention metadata。
- Replay Manifest、持久化读取、两次独立 replay 和 parity proof。
- PostgreSQL schema/checksum/append-only trigger 与五类最小权限 role。
- Runtime Truth v2、固定 M1 runtime profile、strict schema 和本地 PG16 rehearsal。

明确未修改：

- Legacy scan/analysis/strategy/backtest/frontend/API。
- 生产 migration、腾讯云 PostgreSQL、Redis、Worker、Compose、env、secret、Feature Flag。
- GitHub main、生产 authority、Candidate、Signal、交易计划或自动下单。

## 3. 修改文件清单

- `src/v2/modules/market-fact/store/**`：artifact contracts、integrity、PostgreSQL schema/store、Replay Manifest/Runner、单元与真实 PG16 集成测试。
- `src/v2/modules/runtime/**`：五维 Runtime Truth builder、固定 required-check profile 和失败矩阵。
- `src/v2/domain/contracts.ts`、`src/v2/runtime-schema/**`：Runtime Truth v2 类型、schema、版本与 canonical fixture。
- `src/v2/testing/m1-slice-builders.ts`：构造冻结完整 M1 test-only 纵切。
- `scripts/v2/rehearsal/m1-artifact-store-postgres16.sh`：临时 PG16 cluster；显式清除生产数据库 env，退出自动销毁。
- `package.json`：M1.3 定向测试和 PG16 演练入口。
- M1.3 合同、正确顺序、蓝图、机器矩阵、Context、Changelog 和本报告：同步当前事实。

## 4. 对核心链路的影响

本轮完成：

```text
Universe/Fact/Feature authority artifact
-> durable append-only store
-> cutoff-safe durable replay
-> parity evidence
-> truthful runtime status
```

它让未来全市场发现可以建立在可追溯、可重放、不会因数据库不可用偷偷退回内存的地基上。本轮没有提高市场覆盖、机会召回、提前率、Signal 数量或 READY 能力。

## 5. 分层边界影响

| 边界 | 影响 |
| --- | --- |
| scan / analysis / strategy / backtest | 零业务逻辑变更 |
| frontend / API | 零接入、零展示变更 |
| PostgreSQL | 仅隔离临时 PG16；生产零连接、零变更 |
| Redis / worker / deployment / secret | 零变更 |
| storage/replay | 新增 append-only、双 cutoff、full digest、idempotency 和 role contract |
| runtime truth | v2 五维证据；Rehearsal 永不冒充 Production READY |

## 6. 风险说明

- 当前只在冻结 BTC test-only 纵切上证明，不是 live 全市场采集。
- 本地 schema 尚未形成生产 migration；没有生产角色、partition、容量、备份、恢复或 retention purge 证据。
- Store 保存六类 M1 canonical artifact，不等于原始交易所 payload/object storage 已完成。
- Runtime Truth 的本地结果是 `REHEARSAL/PARTIAL`；不能写成生产健康或业务 ready。
- live provider 连通性、真实 Worker、全 eligible Universe、Shadow/SLO 仍未证明。

## 7. 执行命令

```bash
npm run typecheck
npm run lint
npm run test:v2-m1-store-replay
npm run v2:m1:store-replay:pg16-rehearsal
npm run test:v2-foundation
npm run ci:production
git diff --check
```

未运行 `backtest:formal`、production smoke、生产 migration 或部署命令。

## 8. 测试结果

- `test:v2-m1-store-replay`：12/12 PASS。
- 隔离 PostgreSQL 16 integration：1/1 PASS；8 artifact、append-only、权限、幂等冲突、篡改检测、replay parity、runtime truth 全部通过。
- `test:v2-foundation`：96 pass / 0 fail / 1 explicit skip；skip 为未注入临时 PG URL 时的 integration，独立 PG16 命令已 1/1 PASS。
- `typecheck`：PASS。
- `lint`：PASS，0 warning。
- `test:market`：核心 965 pass / 0 fail / 4 explicit skip；workers 23/23；historical 4/4。
- M0 machine exit：10/10 PASS，下一入口为 `V2-M1.4 FULL_ELIGIBLE_UNIVERSE_AND_COLLECTOR_RUNTIME`。
- `build`：PASS，Next.js production build 完整生成。
- `backtest:golden`：16/16 PASS。
- forbidden files、secret patterns、security：PASS。
- 最终单实例 `npm run ci:production`：`exit_code=0`。
- `backtest:formal`：未运行，按规则禁止。
- production smoke：未运行，生产零变更。

## 9. 失败项

- 第一次 PG16 集成演练因权限证明 SQL 多传一个未使用参数而 FAIL；修正参数后从全新 cluster 重跑 PASS，没有降低数据库防线。
- 第一次全 V2 测试发现 V2 shell 入口位于通用 `scripts/rehearsal`，被 Legacy Consumer Map 误归类；没有更新旧地图吞掉污染，而是把入口移到受治理器明确隔离的 `scripts/v2/rehearsal`，随后 M0 与 Consumer Map 恢复 PASS。
- 最终聚合门禁确认退出码时误启动两个并行 `ci:production`，两个 `build:market-cli` 竞争清理 `.tmp/market-tests`，其中一个在 M0 阶段因编译产物被并发删除而失败。确认无残留进程后只启动一个实例，从干净编译起点完整重跑并取得 `exit_code=0`；未把并发故障包装成代码通过。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：记录 M1.3 本地 Store/Replay/Runtime Truth 能力、生产未变、未证明项和 M1.4 唯一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近最多 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入本地 `V2-M1.4`。最终单实例 `ci:production` 已退出 0。

不可以执行生产 migration、生产 authority 切换、M2 Candidate、Legacy 删除或声称实战可用。

## 13. 下一轮建议

只执行 `V2-M1.4 Full Eligible Universe and Collector Runtime`：先扩大真实覆盖和采集运行合同，不越过 M1 直接做 Detector。
