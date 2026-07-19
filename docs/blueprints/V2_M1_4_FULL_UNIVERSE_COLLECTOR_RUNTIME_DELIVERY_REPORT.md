# 本轮交付报告

## 1. 本轮目标

把 M1 的单 BTC 三 Venue 证据切片扩大为确定性多标的目录与受控 Collector Runtime，建立启动全量、增量 ticker、周期 reconciliation、配额、并发、背压、冷启动、恢复、四分母 telemetry 和 M1 Store 原子持久化闭环。

## 2. 范围边界

本轮只修改 V2 Universe、Market Fact Collector、M1 Store 必要 lineage 边界、V2 测试/演练脚本和当前权威文档。未修改 Legacy、前端、API、Detector、Analysis、Strategy、Backtest 逻辑或生产环境。

## 3. 修改文件清单

- `src/v2/modules/universe/reconcile-catalogs.ts`：保留失败目录和完整 catalog 中消失标的的 accounting；失败标记 `UNAVAILABLE`，完整目录缺失保留 `DELISTING` tombstone。
- `src/v2/modules/market-fact/collector/`：新增 Collector 合同、状态机、四分母 coverage、strict telemetry schema、请求配额/并发/队列治理和三 Venue Adapter composition。
- `src/v2/modules/market-fact/store/postgres-artifact-store.ts`：允许 Universe cutoff 早于 ticker cutoff，并允许 eligible=0 的 Universe/FactQuality 原子落库；exact denominator 约束不变。
- `src/v2/testing/m1-full-scope-provider-fixtures.ts`、`m1-collector-harness.ts`：新增 test-only 21 observed / 15 eligible 多标的与故障 harness，production import fence 保持通过。
- `scripts/v2/rehearsal/`：提取通用一次性 PostgreSQL 16 harness，保留 M1.3 演练并新增 M1.4 Collector 演练。
- `package.json`：新增 M1.4 定向测试和 PG16 演练命令。
- M1.4 合同、蓝图、机器矩阵、施工顺序、Context、Changelog 与本报告：记录当前事实和唯一下一入口。

## 4. 对核心链路的影响

完成 `Universe Registry -> Market Fact + Quality -> append-only M1 Store -> Collector telemetry` 的本地多标的运行闭环。它让后续全市场发现可以证明“provider 实际返回、仍被解释、政策合格、成功采集、仍然新鲜”分别是多少。本轮没有产生 Candidate、信号、方向或交易计划。

## 5. 分层边界影响

- scan：只建设其上游数据地基，不执行机会扫描。
- analysis / strategy / backtest：未修改。
- frontend / API：未涉及。
- DB：仅一次性本机 PostgreSQL 16 演练；生产 DB 零变更。
- Redis / worker / deployment / secret：未涉及；未建立生产 Worker，未读取或写入 secret。

## 6. 风险说明

- 本轮“全范围”只指确定性 fixture 对三 Venue Adapter 所返回记录进行 100% accounting，不等于已经实时连接交易所全量市场。
- 尚未证明 live endpoint 可达性、真实 provider 规模、持续 Worker、断线重连时长、生产资源成本、长期 freshness/coverage SLO 或生产 authority。
- Collector telemetry 是运行证据，不是市场机会或交易信号。

## 7. 执行命令

```text
npm run test:v2-m1-collector
npm run v2:m1:collector:pg16-rehearsal
npm run v2:m1:store-replay:pg16-rehearsal
npm run test:v2-foundation
npm run ci:production
```

## 8. 测试结果

- `npm run test:v2-m1-collector`：14/14 PASS。
- `npm run v2:m1:collector:pg16-rehearsal`：1/1 PASS；21 accounted、15 eligible、启动/增量/全 catalog 故障均经真实 append-only Store 验证。
- `npm run v2:m1:store-replay:pg16-rehearsal`：1/1 PASS；M1.3 append-only/replay 回归通过。
- `npm run test:v2-foundation`：110 pass / 0 fail / 2 explicit PG integration skip；两项 PG integration 已分别真实运行 1/1 PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS，0 error / 0 warning。
- `npm run test:market`：Legacy 核心 965 pass / 0 fail / 4 skip；workers 23/23；historical 4/4。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- M0 机器出口：10/10 PASS，下一入口为 `V2-M1.5`。
- forbidden files、tracked secret patterns、security：PASS。
- 最终单实例 `npm run ci:production`：`exit_code=0`。
- `production smoke`：未运行，本轮未部署。
- `backtest:formal`：未运行，按规则不属于本轮能力验收。

开发中有两次真实失败并已按边界修复：初版 happy fixture 含 malformed row，Universe 正确降为 PARTIAL，因此测试预期 READY 错误；调整为健康 fixture，并保留既有 malformed 专项测试。第一次全 V2 门禁发现 transport governor 位于 Collector 目录而非 Adapter 边界；代码被移动到 `collector/adapters`，没有放宽架构测试。

## 9. 失败项

当前无未解决失败项。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：记录 M1.4 本地能力、未证明项、生产零变更和 M1.5 唯一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入 M1.5 本地阶段。最终单实例 `ci:production` 已退出 0；生产仍未授权、未变更，live/Shadow 能力仍未证明。

## 13. 下一轮建议

只执行 `V2-M1.5 Live No-Authority Collector Rehearsal and Shadow/SLO Entry`：先证明真实 provider 覆盖、连续采集、资源预算和故障恢复，不越过 M1 进入 Detector。
