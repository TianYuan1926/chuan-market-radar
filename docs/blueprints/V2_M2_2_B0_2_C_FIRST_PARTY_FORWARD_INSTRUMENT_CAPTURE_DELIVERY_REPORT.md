# 本轮交付报告

任务：`V2-M2.2-B0.2-C-FIRST-PARTY-FORWARD-INSTRUMENT-CAPTURE`

状态：`LOCAL_ENGINEERING_PASS / OPERATIONAL_CAPTURE_START_BLOCKED_ON_EGRESS / PRODUCTION_UNCHANGED`

日期：2026-07-20

## 1. 本轮目标

为 Binance Futures、OKX Swap 和 Bybit Linear Perpetual 建立从真实捕获时刻起生效的 point-in-time instrument truth：保留 exact raw evidence、完整目录分母、身份 epoch、持续缺席与 coverage gap，并形成可增量验证的连续证据链。

本包不能回填过去，不能替代 B0.2-B 历史来源与权利门，也不能生成 Candidate、Signal、等级、READY 或交易计划。

## 2. 范围边界

本轮只修改 V2 Research 前向 instrument capture、现有 catalog Adapter 的受控 raw 捕获接口、测试入口、治理状态和交付文档。

明确未修改 Legacy 交易逻辑、M1 authority、Analysis、Strategy、Backtest 评价、前端、API、数据库、Redis、Worker、migration、env、Feature Flag、secret 和生产服务。没有执行历史回填、bulk acquisition、Detector 晋级或生产部署。

## 3. 修改文件清单

- `src/v2/modules/universe/public-json-transport.ts`：新增显式 `captureBody`，只在 opt-in 时返回 exact bytes、SHA-256 和 byte count；默认 M1 行为不变。
- `src/v2/modules/universe/public-json-transport.test.ts`：验证 opt-in exact raw 和默认失败语义。
- `src/v2/modules/universe/adapters/forward-catalog-capture-adapter.ts`：在 Adapter 边界复用三 Venue catalog，实现逐请求 raw evidence 与完整 accounting 绑定。
- `src/v2/research/forward-instrument-capture.ts`：定义 Snapshot/Batch、完整性、前向专用和 anti-backfill 合同。
- `src/v2/research/forward-instrument-continuity.ts`：实现 identity epoch、持续缺席、coverage gap、链式 checkpoint 和 readiness。
- `src/v2/research/forward-instrument-evidence-store.ts`：实现工作区外 content-addressed raw/artifact store、权限、篡改/符号链接防线和单写 journal。
- `src/v2/research/forward-instrument-capture-runner.ts`：串联 capture、持久化、continuity 与 journal，保持 no-authority。
- `src/v2/testing/forward-instrument-harness.ts`：提供测试专用三 Venue 原始响应 harness，不进入生产 import。
- `src/v2/entrypoints/m2-forward-instrument-capture.ts`：新增有界摘要 CLI；完整为 exit 0，partial/failed 写证据后 exit 2，完整性错误 exit 1。
- `src/v2/**/*forward-instrument*.test.ts`：覆盖正常、失败、anti-backfill、分母、身份、缺席、篡改、路径和并发。
- `package.json`：新增 B0.2-C 定向测试和前向捕获命令。
- `src/v2/governance/m0-exit-validator.ts`：只同步机器报告的 B0.2-C 本地出口、C1 运行入口与 B0.2-B 外部门；未改变 M0 十项判定。
- `docs/architecture/v2/M2_2_B0_2_C_FIRST_PARTY_FORWARD_INSTRUMENT_CAPTURE_V1.md`：冻结前向捕获合同与双出口。
- `docs/blueprints/*`、`market-radar-v2-build-sequence.md`：蓝图 v1.5、机器矩阵 v1.7、状态、施工顺序和本报告。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：只写当前真实状态、风险和 C1 下一入口。

## 4. 对核心链路的影响

本轮加固：

```text
全市场发现
-> 候选筛选
-> Research Governance
```

它从捕获日起保存交易所目录中的全分母和变化证据，为未来减少幸存者偏差。它不增加已证明的发现率，不产生候选或计划，也不证明历史 cohort、live market coverage 或盈利能力。

## 5. 分层边界影响

- `scan`：未接入运行扫描，只提供未来 Universe 研究证据。
- `analysis / strategy / backtest`：未修改；Outcome/future material 不在输入。
- `frontend / API`：未修改。
- `DB / Redis / worker / deployment / secret`：未修改，生产零命令、零变更。
- `M1 authority`：未读取；provider endpoint 继续只存在于 Adapter。
- `Candidate authority`：永久 false。

## 6. 风险说明

1. 本机真实 egress 仍不可用，三家 complete snapshot 均为 0；不能说前向捕获已经运行。
2. 当前两轮失败只证明失败语义、外部 store 和 journal chain 生效，不证明 live 全市场覆盖。
3. B0.2-B 的人工 retention/replay 权利和合格 historical instrument source 仍 blocked；C/C1 永远不能回填过去或替代历史门。
4. `FORWARD_ONLY_READY` 即使未来通过，也只证明捕获日起的连续目录证据，不能解锁 B1、Detector 或 Candidate。

## 7. 执行命令

```bash
npm run test:v2-m2-forward-instrument
npm run test:v2-foundation
npm run v2:m0:verify
npx eslint <本轮 TypeScript 文件>
node -e "JSON.parse(...)"
git diff --check
npm run ci:production
```

真实 no-authority 捕获使用：

```bash
npm run v2:m2:forward-instrument:capture -- \
  --evidence-root /Users/chuan/.cache/market-radar-v2/evidence/b0-2-c \
  --repository-root /Users/chuan/Documents/web
```

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS；本轮文件定向 ESLint 也已 PASS。
- `npm run test:market`：PASS，Legacy 965 pass / 0 fail / 4 skip，Worker 23/23，Historical 4/4。
- `npm run build`：PASS。
- `npm run backtest:golden`：16/16 PASS。
- B0.2-C 定向：28/28 PASS。
- 全 V2：266 total / 261 pass / 0 fail / 5 explicit external-dependency skips。
- M0：10/10 PASS，生产状态保持 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。
- 完整 `npm run ci:production`：PASS；禁文件、secret pattern、typecheck、lint、Legacy/V2 测试、M0、build、Golden 与 security 全部通过。
- `backtest:formal`：未运行，本轮不是 formal 能力验收。
- production smoke：未运行，本轮未部署。

## 9. 失败项

本地定向、回归和完整 CI 无失败项。

正式证据根两轮真实采集均为 `FAILED`：Binance 为 `provider_request_failed`，OKX 和 Bybit 为 `provider_timeout`。最新 journal sequence=1，journal digest=`sha256:dd48aeb382072c2ed1c4a38d194b854bdaf6df3b5bcd257e1ca5d8764ff64d11`，batch digest=`sha256:6d9140c1ca42f55ff604925dbff829d3b0f8d66d6186cc9021a447bbddb23d44`。每家 observed snapshot=2、complete snapshot=0、pre-capture incomplete=2、active gap=0、captureStartedAt=null。该运行出口明确失败，未包装成 PASS。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：记录 B0.2-C 本地工程出口、真实 egress 阻断、完整快照为 0 和 C1 下一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并继续只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入 C1 运行起点包，但运行能力尚不能减数。当前不可以进入 B1、真实 cohort、Detector 生命周期或 M2 runtime。

## 13. 下一轮建议

只执行 `V2-M2.2-B0.2-C1-EGRESS-CAPABLE-FORWARD-CAPTURE-START`：在可信可达网络运行同一冻结 release，取得至少两轮、跨度达到 cadence、raw 可复核、active gap=0 且无 identity conflict 的三 Venue 完整 Snapshot；B0.2-B 外部门继续并行等待。
