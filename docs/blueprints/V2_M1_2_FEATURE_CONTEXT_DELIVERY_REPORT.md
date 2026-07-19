# 本轮交付报告

任务：`V2-M1.2 Point-in-Time Feature and Context Slice`

## 1. 本轮目标

在不接 Legacy、不联网拉取新数据、不写数据库和不改生产的前提下，把 M1.1 冻结的 `Universe -> Point-in-Time Fact + FactQuality` 推进为一个精确、可重放、可审计的跨三 Venue Feature、FeatureQuality 和最小非方向性 Market Context。

## 2. 范围边界

已修改：

- V2 Feature/FeatureQuality/MarketContext 合同、strict runtime schema 和版本。
- 跨 Venue 价格分散纯函数、FeatureSet builder、独立 replay 质量 builder 和保守 Context builder。
- test-only M1 slice builder、定向测试、冻结 fixture 与当前权威文档。

明确未修改：

- Legacy 扫描、Analysis、Strategy、Backtest 逻辑、前端、API。
- PostgreSQL、Redis、Worker、Docker Compose、migration、env、secret、Feature Flag。
- GitHub main、腾讯云或任何生产 authority。

## 3. 修改文件清单

合同与 schema：

- `src/v2/domain/contracts.ts`：Feature subject 改为明确 subject type/id；FeatureSet 增加 computation identity；FeatureQuality 增加可审计 parity evidence；Context 引用 FeatureQuality。
- `src/v2/runtime-schema/foundation-schemas.ts`：增加三类对象的 fail-closed 结构和一致性守卫。
- `src/v2/runtime-schema/schema-versions.ts`：FeatureSet、FeatureQuality、MarketContext 升级为 v2。
- `src/v2/runtime-schema/runtime-schema-registry.test.ts`：同步 30 个权威对象的严格 canonical fixture。

实现：

- `src/v2/modules/feature/decimal-dispersion.ts`：用十进制整数运算计算三 Venue 价格分散度。
- `src/v2/modules/feature/build-feature-set.ts`：完整覆盖、同 cutoff、future-read、lineage、quality、deterministic hash 和 runtime deep-freeze。
- `src/v2/modules/feature/build-feature-quality.ts`：ONLINE/REPLAY/repeat replay 独立 run、语义哈希、null 与质量结论。
- `src/v2/modules/market-context/build-market-context.ts`：只识别证据支持的价格碎片化，不生成方向或其他未证明维度。
- `src/v2/testing/m1-slice-builders.ts`：从 M1.1 官方形状 fixture 构造冻结测试纵切，production import fence 继续生效。

测试与 fixture：

- `src/v2/modules/feature/*.test.ts`：精确计算、顺序不变、future/null/stale、覆盖、独立 replay 和 schema 防伪。
- `src/v2/modules/market-context/build-market-context.test.ts`：保守 Context、fragmentation、parity failure 和 lineage。
- `src/v2/fixtures/m1-foundation-slice.v1.json`、`src/v2/domain/foundation-slice-fixture.test.ts`：删除旧 fixture 对 `RANGE/NORMAL/HEALTHY` 的无证据宣称。
- `package.json`：新增 `test:v2-m1-feature-context` 定向入口。

治理与文档：

- `src/v2/governance/m0-exit-validator.ts`：唯一下一入口推进为 M1.3。
- `docs/architecture/v2/M1_2_FEATURE_CONTEXT_CONTRACT_V1.md`：记录公式、点时、parity、Context 和禁止能力。
- M1 总合同、V2 蓝图、机器矩阵、正确施工顺序、README、Context 和 Changelog：同步当前真实状态。

## 4. 对核心链路的影响

本轮完成：

```text
Point-in-Time Fact
-> exact cross-venue FeatureSet
-> independent parity + FeatureQuality
-> minimal MarketContext
```

它让未来 Detector 可以读取一个有 cutoff、来源、版本和回放证据的特征，而不是直接读取页面数据或自行算指标。本轮没有增加机会召回、提前率、信号数量或交易计划能力，也不能据此声称系统可实战。

## 5. 分层边界影响

| 边界 | 影响 |
| --- | --- |
| scan | 未进入；只提供未来 Detector 输入地基 |
| analysis / strategy / backtest | 零逻辑变更 |
| frontend / API | 零接入、零展示变更 |
| DB / Redis / worker / deployment / secret | 零变更 |
| Feature | 新增一个版本化跨 Venue 价格分散 Feature |
| Context | 新增最小非方向性背景；不输出 LONG/SHORT |
| runtime schema | 三类 authority artifact 升至 v2 并增加 lineage/parity 守卫 |

## 6. 风险说明

- 当前只有 BTC 冻结 fixture 的一个 Feature，不能代表全 eligible Universe、全特征体系或爆发前发现能力。
- `FRAGMENTED` 只是三 Venue last price 分散异常；它不是订单簿、滑点或执行流动性的完整判断。低分散永远不在本规则中变成 `HEALTHY`。
- 独立 replay 目前由本地 artifact/run evidence 证明；持久化完整性、跨进程 manifest 和数据库 identity 要在 M1.3 证明。
- M1.1 live provider connectivity 仍为 `UNPROVEN`，生产终态仍未知。

## 7. 执行命令

```bash
npm run typecheck
npm run test:v2-m1-feature-context
npm run test:v2-foundation
npm run ci:production
git diff --check
```

未执行公网 provider 重试、生产命令、migration、production smoke 或 formal backtest。

## 8. 测试结果

- `npm run test:v2-m1-feature-context`：17/17 PASS。
- `npm run test:v2-foundation`：84/84 PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS，0 warning。
- `npm run test:market`：核心 965 pass / 0 fail / 4 explicit skip；workers 23/23；historical 4/4。
- M0 机器出口：10/10 PASS，下一入口为 `V2-M1.3 FACT_STORE_REPLAY_RUNTIME_TRUTH_REHEARSAL`。
- `npm run build`：PASS，Next.js production build 完整生成。
- `npm run backtest:golden`：16/16 PASS。
- forbidden files、secret patterns、security：PASS。
- 完整 `npm run ci:production`：退出码 0。
- `npm run backtest:formal`：未运行，本轮不属于 formal 能力验收。
- production smoke：未运行，本轮生产零变更。

## 9. 失败项

第一次类型门禁因 runtime schema canonical fixture 引用了尚未定义的 `partialQuality` 而失败。已补齐显式 PARTIAL fixture，随后 `typecheck` 和两层 V2 测试通过；未删除或放宽 schema 防线。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：记录 M1.2 本地能力、单一 Feature 限制、live/production 未证明和 M1.3 唯一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近最多 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入本地 `V2-M1.3`。完整 `ci:production` 已从清理后的编译起点退出 0。

不可以据此执行生产 migration、接入 live authority、启动 M2 Candidate、删除 Legacy 或声称系统具备实战能力。

## 13. 下一轮建议

只执行 `V2-M1.3 Fact Store, Replay Manifest and Runtime Truth Rehearsal`：先在隔离本地环境证明 append-only、幂等、artifact integrity、回放 cutoff 和五类运行真值，不执行生产 migration。
