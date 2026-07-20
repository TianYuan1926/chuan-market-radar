# 本轮交付报告

任务：`V2-M2.2-B0-HISTORICAL-SOURCE-QUALIFICATION-AND-ACQUISITION-SAFETY`

日期：2026-07-20

## 1. 本轮目标

在批量获取真实历史数据前，建立不会把“公开可下载”包装成“允许长期保留和回放”的来源资格 Gate，并证明精确对象、官方 checksum、磁盘预算、工作区外路径、受校验续传和验证后删 raw 的技术链。

## 2. 范围边界

本轮只改 V2 Research 来源准入、单对象技术 pilot、机器施工入口和权威文档。未批量下载、未构造真实 cohort、未打开 holdout、未改 Detector 阈值/生命周期、未生成 Candidate/Signal/Plan，未改 Legacy、前端、API、DB、Redis、Worker、migration、secret 或生产。

## 3. 修改文件清单

- `src/v2/research/historical-source-qualification.ts`：权利、技术、历史身份、时间和逐 Detector 能力的严格资格/评估合同。
- `src/v2/research/historical-acquisition-contract.ts`：精确对象、checksum、host allowlist、容量、路径和 preflight 合同。
- `src/v2/research/historical-acquisition-pilot.ts`：单对象技术下载、受校验续传、大小/hash 门禁、删除 raw 与不可覆盖证据。
- `src/v2/research/historical-source-registry.ts`：Binance Vision 当前候选来源、诚实阻断状态和冻结技术试点计划。
- `src/v2/entrypoints/m2-historical-source-pilot.ts`：本地 preflight/verify CLI；没有 bulk 旁路。
- `src/v2/research/historical-source-qualification.test.ts`：权利、身份、时间、磁盘、路径、host 和 bulk 阻断测试。
- `src/v2/research/historical-acquisition-pilot.test.ts`：checksum、删除 raw、续传、损坏和 redirect 测试。
- `src/v2/governance/m0-exit-validator.ts`：唯一下一入口更新为 B0.1，不改变 M0 判定。
- `package.json`：新增 B0 定向测试和显式 pilot 命令。
- `docs/architecture/v2/*`：新增 B0 合同，并更新数据基线与 M2.2 未完成项。
- `docs/blueprints/*`、`market-radar-v2-build-sequence.md`：把 B 总包按真实依赖展开为 B0-B3，更新机器矩阵 v1.4 与当前入口。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：更新当前事实、风险、证据和下一入口。

## 4. 对核心链路的影响

只影响 `复盘进化 -> Research Governance` 的历史证据入口。它防止来源权利、合约范围或时间语义有问题的数据污染 Detector 评价；不改变全市场发现、候选、分析、风险、计划或生产排序。

## 5. 分层边界影响

- scan / analysis / strategy / backtest：未改生产逻辑；只新增 Research Gate。
- frontend / API：未改。
- DB / Redis / worker / deployment / secret：未涉及。
- production：零连接、零命令、零变更。
- holdout：未创建、未打开。

## 6. 风险说明

- Binance Vision 技术链通过，但 retention/replay 权利仍是 `PENDING_HUMAN_REVIEW`，bulk acquisition=false。
- 归档 presence 不能证明历史 eligible instrument；point-in-time onboard/delist/contract/settlement/underlying/status 缺失，cohort freeze=false。
- Kline 不支持 Liquidity Shift 所需 L2，该 Detector 保持 unsupported。
- 历史 knowledge time 是闭合 Kline 加冻结保守延迟的 modeled 值，不是当时 observed receivedAt。
- M2.1 只有 matched/no-match，没有 target-blind diagnostic strength，当前不能诚实形成 Top20 ranking。

## 7. 执行命令

```bash
npm run test:v2-m2-historical-source
npm run test:v2-m2-historical-replay
npm run v2:m0:verify
npm run v2:m2:historical-source:verify-pilot -- --output-root /Users/chuan/.cache/market-radar-v2/m2-2-b0-binance-pilot
npm run ci:production
git diff --check
```

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：969 total / 965 pass / 0 fail / 4 skip；Worker 23/23；Historical 4/4。
- `npm run test:v2-m2-historical-source`：14/14 PASS。
- `npm run test:v2-m2-historical-replay`：13/13 PASS。
- `npm run test:v2-foundation`：199 total / 194 pass / 0 fail / 5 explicit external-dependency skips。
- `npm run v2:m0:verify`：10/10 PASS，nextEntry=B0.1。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- forbidden files、secret patterns、security：PASS。
- 完整 `npm run ci:production`：exit code 0。
- `npm run backtest:formal`：未运行；本轮不是能力验收。
- production smoke：未运行；本轮未部署。

真实 pilot：

```text
object=BTCUSDT-1m-2026-06.zip
bytes=1,838,455
provider sha256=9b214199eb5063585c7ed0f59ba19323326d68ac024b85106713989399204490
actual sha256=9b214199eb5063585c7ed0f59ba19323326d68ac024b85106713989399204490
result=VERIFIED_AND_RAW_DELETED
result digest=sha256:7967763a6ef4ddde0d9e32c7f906f21197b26ec7c251f5da237ea53508438527
```

验证后缓存目录只有 digest 命名的 preflight/result JSON，没有 ZIP、partial 或 verified raw 文件。

## 9. 失败项

没有测试失败。真实业务 Gate 仍有明确阻断：来源权利未人工批准、历史合约身份不完整、L2 缺失、ranking strength 未实现。因此 M2.2 真实 Gate 继续 `INSUFFICIENT`，不能写成真实 cohort 完成。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入本地 `M2.2-B0.1`。不可以进入 bulk acquisition、真实 cohort freeze、holdout、Detector lifecycle 或 runtime。

## 13. 下一轮建议

只执行 `V2-M2.2-B0.1-TARGET-BLIND-DIAGNOSTIC-STRENGTH-AND-CONSTRUCTION-POLICY-FREEZE`：先建立不读取 target/future 的 Detector 强度与 ranking，再把 train-only 标签、匹配、完整背景和 trial policy digest 绑定到 dataset manifest。
