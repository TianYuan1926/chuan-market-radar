# 本轮交付报告

## 1. 本轮目标

在用户不付费扩容的约束下，以生产形状 PostgreSQL 16 机器证据判断当前 120 GiB 系统盘能否保留全市场一分钟扫描、24 小时回看和恢复余量，并把可行方案实现为不可改写旧迁移的六小时分区 v2。

## 2. 范围边界

本轮只修改 M1 Market Fact 存储、分区治理、容量校准、P0 schema 预检和对应文档。未修改 Detector、Candidate、Analysis、Strategy、Backtest、前端、生产服务、数据库、Redis、env、Feature Flag、云对象或 secret。

## 3. 修改文件清单

- `partitioned-fact-postgres-six-hour-schema.ts`：新增 v2 增量迁移、六小时分区和小时级 retention cutoff。
- `partitioned-fact-contract.ts`、`partitioned-fact-postgres-governance.ts`：切换当前 inventory 和治理 API 到六小时边界。
- PostgreSQL integration、contract、schema 和 capacity calibration tests：覆盖迁移拒绝、路由、恢复、回放、淘汰、容量与反作弊。
- `m1-production-storage-p0r-no-cost-capacity.mjs` 及测试：固定全分母、cadence、lookback、余量、磁盘 reserve 和 fail-closed 证据验证。
- `m1-production-storage-read-only-preflight.mjs`：生产 schema exact stage 增加 v2 checksum。
- V2 合同、证据索引、主蓝图、施工顺序、项目上下文和本报告：登记当前真实状态。

## 4. 对核心链路的影响

只加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的持久化、恢复和容量地基。它保留一分钟全市场分母和 24 小时 Detector 回看，不提高信号数量，不产生交易计划。

## 5. 分层边界影响

- scan：只保护其全市场输入持久化，不改变排序或候选。
- analysis / strategy / backtest：无业务逻辑改动。
- frontend / API：无改动。
- DB：仅新增未部署的 additive v2 migration 和本地隔离演练。
- Redis / worker / deployment / secret：无生产改动。

## 6. 风险说明

- 本地容量模型 PASS 不是生产容量 PASS；旧生产 topology 已过期。
- 真实 recovery evidence 仍缺失，Object Lock 白名单仍未开通。
- 旧 P0 evidence index 的远端 bundle 摘要长度不合法，fresh P0 必须重新生成整套证据。
- v2 首次迁移遇到任何非空 v1 日分区会失败；当前过期 P0 只读快照显示 production schema `ABSENT_CLEAN`，但执行前必须 fresh 验证。

## 7. 执行命令

```text
npm run typecheck
npx eslint <本轮 TypeScript/JavaScript 文件>
npm run test:v2-m1-partitioned-fact
npm run test:v2-ops
npm run v2:m1:partitioned-fact:pg16-rehearsal
V2_M1_CAPACITY_CALIBRATION_CYCLES=8 npm run v2:m1:p0r:capacity-calibration:pg16
node scripts/v2/production/m1-production-storage-p0r-no-cost-capacity.mjs ...
npm run ci:production
```

## 8. 测试结果

- `npm run typecheck`：PASS。
- 定向 partition contract/schema：7/7 PASS。
- V2 ops：103/103 PASS。
- 隔离 PostgreSQL 16 迁移/恢复/淘汰演练：1/1 PASS。
- 六小时正式容量校准：8 周期、11,552 Facts、最大周期 33,660 ms，PASS。
- no-cost capacity：稳态 59%（上限 60%）、峰值 67%（上限 70%），`PASS_LOCAL_NO_COST_MODEL`。
- `npm run lint`：PASS。
- `npm run test:market`：Legacy 965/0/4 explicit skips，Worker 23/23，historical smoke 4/4，PASS。
- `npm run test:v2-foundation`：279/0/6 explicit external-dependency skips，PASS。
- `npm run v2:m0:verify`：11/11 PASS，production mutation=false。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- `npm run ci:production`：PASS；V2 ops 103/103，security PASS。
- `npm run backtest:formal`：未运行，且本轮不应运行。

## 9. 失败项

- 首次 8 周期校准因固定 5 分钟总测试时限与允许的 8-31 周期冲突而超时；该产物已删除。修复只扩大整场编排时限，单周期 60 秒红线未放宽。
- 首次六小时 PostgreSQL 演练只预建到 `2026-01-16T00:00Z`，实际覆盖上界不足到 `2026-01-17T00:00Z`，容量 Gate 正确 BLOCKED；随后补齐到 18:00 分区，不缩短验收窗口，复验 PASS。
- 生产外部门禁仍为 BLOCKED，不属于本地测试失败。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，登记六小时分区、本地无扩容容量 PASS 和仍未通过的生产门禁。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

本地可以进入 P0R 外部恢复前置；不可以进入 P1 或任何生产 migration/写入。

## 13. 下一轮建议

只完成 Object Lock 白名单与动作时确认，再执行真实 age/STS、加密离机备份、精确取回和隔离恢复；随后刷新生产 topology 并完整重跑 P0。
