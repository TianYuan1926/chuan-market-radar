# 本轮交付报告

## 1. 本轮目标

完成 `V2-M1.1 Three-Venue Identity and Fact Slice`：在独立 V2 边界内，用 Binance USD-M、OKX SWAP、Bybit Linear 的官方公开合同形状贯通 `Universe Registry -> Market Fact + Quality`，并让分页、身份、缺失、限速、网络、schema 和时序失败诚实降级。

本轮只建立数据真值地基，不产生 Candidate、方向、等级、Signal、entry、stop、target、RR、READY 或自动交易能力。

## 2. 范围边界

已修改：

- V2 Instrument Accounting 与 Source Lineage 合同。
- V2 公开 GET Transport、三家 catalog/ticker Adapter、Universe/Fact builder。
- V2 test-only provider fixture、失败矩阵、架构 fence、M0 CI 自包含性。
- 当前蓝图、施工顺序、Context、Changelog 与来源合同。

明确未修改：

- Legacy 运行逻辑、现有前端、API、扫描排序、Analysis、Strategy、Backtest 逻辑。
- PostgreSQL、Redis、Worker、Docker Compose、migration、env、secret、Feature Flag。
- 腾讯云、GitHub main 或任何生产 authority。

## 3. 修改文件清单

领域与 runtime schema：

- `src/v2/domain/contracts.ts`：允许 unresolved accounting 保留 nullable identity；Source Lineage 增加 normalization 并允许真实缺失时间。
- `src/v2/runtime-schema/primitives.ts`：收紧 event/receive/normalize/persist chronology。
- `src/v2/runtime-schema/foundation-schemas.ts`：只有完整身份可 eligible；observed 分母、ID 唯一性、Fact null/time 语义 fail closed。
- `src/v2/runtime-schema/runtime-schema-registry.test.ts`：验证未联网、未持久化 Fact 不需要伪造时间。
- `src/v2/fixtures/m1-foundation-slice.v1.json`、`src/v2/domain/foundation-slice-fixture.test.ts`：补 observation/normalized/null persistence 合同。

Universe：

- `src/v2/modules/universe/stable-artifact.ts`：确定性 canonical JSON、SHA-256 与 authority artifact 运行时深冻结。
- `src/v2/modules/universe/identity.ts`：资产、Venue instrument、contract size 和 canonical identity。
- `src/v2/modules/universe/catalog-types.ts`、`catalog-normalization.ts`：catalog 结果、失败和 observed accounting。
- `src/v2/modules/universe/public-json-transport.ts`：固定 HTTPS allowlist、无凭证 GET、timeout、字节上限和错误分类。
- `src/v2/modules/universe/adapters/binance-catalog.ts`、`okx-catalog.ts`、`bybit-catalog.ts`：三家目录解析与状态归一化；Bybit 完整分页。
- `src/v2/modules/universe/build-eligible-snapshot.ts`：100% observed accounting、冲突全降级和确定性 Universe Snapshot。
- 对应 `public-json-transport.test.ts`、`catalog-adapters.test.ts`、`build-eligible-snapshot.test.ts`：正常、失败、分页、冲突和生成式样本门禁。

Market Fact：

- `src/v2/modules/market-fact/ticker-types.ts`、`ticker-normalization.ts`：统一 ticker observation 和时间/价格解析。
- `src/v2/modules/market-fact/adapters/binance-ticker.ts`、`okx-ticker.ts`、`bybit-ticker.ts`：三家 `LAST_PRICE` 适配。
- `src/v2/modules/market-fact/build-last-price-facts.ts`：Fact/Quality、duplicate/out-of-order/gap/stale/future cutoff/recovery 和 null lineage。
- 对应 `ticker-adapters.test.ts`、`build-last-price-facts.test.ts`：端到端与失败语义测试。
- `src/v2/testing/m1-provider-fixtures.ts`：永久 test-only 的官方形状冻结输入；production fence 禁止引用。

治理与文档：

- `src/v2/domain/architecture-boundary.test.ts`、`src/v2/governance/m0-exit-validator.ts`：testing/fixture/provider endpoint 隔离与自构建 M0 门禁。
- `package.json`：新增 M1.1 定向测试；CI 改为调用自构建 M0 verifier，消除临时编译目录隐式依赖。
- `docs/architecture/v2/M1_1_PROVIDER_SOURCE_CONTRACTS_V1.md`：官方来源、字段、失败语义与 live 未证明边界。
- `docs/architecture/v2/M1_FOUNDATION_VERTICAL_SLICE_CONTRACT_V1.md`：记录 M1.1 本地出口和 M1.2 边界。
- `market-radar-v2-build-sequence.md`：把 M1 拆为 M1.1-M1.5 的正确依赖顺序。
- V2 蓝图、机器矩阵、README、`PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：更新当前真实状态和唯一下一入口。

## 4. 对核心链路的影响

本轮完成：

```text
全市场发现之前的目标范围身份
-> 每条 observed instrument 记账
-> 合格 instrument snapshot
-> Point-in-Time LAST_PRICE
-> Fact Quality
```

它让后续扫描知道“应该扫描谁、实际看到了谁、谁因为何种原因不能进入”，并让失败行情保持 null/partial/stale/unavailable。它没有提高机会召回、提前率或交易计划数量，也不构成实战能力证明。

## 5. 分层边界影响

| 边界 | 影响 |
| --- | --- |
| scan | 未进入；只提供未来输入地基 |
| analysis / strategy / backtest | 零逻辑变更 |
| frontend / API | 零接入、零展示变更 |
| DB / Redis / worker / deployment / secret | 零变更 |
| provider | 新增 V2 公开只读 Adapter；当前不在生产 runtime |
| runtime schema | SourceLineage 与 InstrumentAccountingRecord 诚实表达能力增强 |

## 6. 风险说明

- 2026-07-20 当前本地环境对六个公开 endpoint 的 15 秒只读探测均未取得可解析响应。因此状态只能是 `LOCAL_PASS_FROZEN_PROVIDER_CONTRACT`，不能写成 live provider 已跑通。
- `contractSize` 已按 M1.1 identity 语义归一化，但扩大到全市场或进入执行成本前仍需按交易所规格做独立 reconciliation。
- 本轮没有持久化；`persistedAt=null` 是正确事实，不是缺陷包装。
- 没有新交易风险，因为本轮不能生成 Candidate、Signal 或计划，也未接生产。

## 7. 执行命令

```bash
npm run typecheck
npm run lint
npm run test:v2-m1-identity-fact
npm run test:v2-foundation
npm run v2:m0:verify
npm run ci:production
git diff --check
```

另执行三家公开 catalog/ticker 的只读短超时探测；均未取得响应，已如实记录，未反复重试或改用旧缓存。

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS，0 warning。
- `npm run test:v2-m1-identity-fact`：27/27 PASS。
- `npm run test:v2-foundation`：67/67 PASS。
- `npm run test:market`：核心 965 pass / 0 fail / 4 explicit skip；workers 23/23；historical 4/4。
- M0 机器出口：10/10 PASS，`PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED`。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- forbidden files、secret patterns、security：PASS。
- 完整 `npm run ci:production`：最终退出码 0。
- production smoke：未运行，本轮无生产变更。
- `npm run backtest:formal`：未运行，本轮不属于 formal 能力验收。

## 9. 失败项

有三项过程失败，均未隐藏：

1. 最初误用 `node --import tsx` 运行 V2 测试，仓库没有顶层 `tsx` 依赖；随后改用正式 `test:v2-foundation` 编译测试入口并通过。
2. 第一次聚合 CI 在 M0 verifier 处因依赖前一步 `.tmp/market-tests` 临时产物而退出 1。已把 CI 改为 `v2:m0:verify` 自行重建后验证；定向 M0 10/10 PASS，完整 CI 从头重跑后退出 0。
3. 状态文档推进到 M1.2 后，M0 report 的 `nextEntry` TypeScript 字面量仍锁在 M1.1，最终复跑被 typecheck 阻止；已同步类型与输出后重新执行门禁。

剩余未通过项只有 live provider connectivity；它不是用 fixture 可以消除的门槛，已标记 `UNPROVEN`，不会冒充 PASS。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：记录 M1.1 本地能力、live 未证明、生产零变更和 M1.2 唯一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并保持最近最多 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.2 Point-in-Time Feature and Context Slice` 的本地开发。

不可以进入生产部署、数据库 migration、全市场能力声明、M2 Candidate、Signal 或交易计划开发。

## 13. 下一轮建议

只实现一个跨三 Venue 的 Point-in-Time 价格离散度 Feature、FeatureQuality、实时/回放同源纯函数和最小非方向性 Market Context，并继续保持 provider、Candidate、方向和交易计划边界关闭。
