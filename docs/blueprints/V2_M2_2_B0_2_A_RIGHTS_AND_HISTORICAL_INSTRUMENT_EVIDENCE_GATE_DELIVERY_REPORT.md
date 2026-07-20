# 本轮交付报告

任务：`V2-M2.2-B0.2-A-RIGHTS-AND-HISTORICAL-INSTRUMENT-EVIDENCE-GATE`

日期：2026-07-20

## 1. 本轮目标

把来源权利和历史合约身份从几个可自报的布尔值升级为可审计、可过期、可核算缺口的内容寻址证据 Gate，并核查现有公开/商业候选是否真的能解锁历史 cohort。

## 2. 范围边界

本轮只改 V2 Research 来源资格、权利证据、历史 instrument identity/coverage、测试和权威文档。未采购数据、未批量下载、未构造真实 cohort、未打开 holdout、未修改 Detector 生命周期、未写 Candidate，未改 Legacy/M1 runtime、前端、API、DB、Redis、Worker、migration、env、Feature Flag、secret 或生产。

## 3. 修改文件清单

- `src/v2/research/historical-rights-review.ts`：外部人工审查、exact operator、历史行情 + instrument reference 双范围、条款捕获、有效期、account/jurisdiction、attestation 和撤销处置。
- `src/v2/research/historical-instrument-identity.ts`：来源 capability/provider binding、identity epoch、状态区间、knowledge time、eligibility resolver 和完整覆盖核算。
- `src/v2/research/historical-instrument-source-registry.ts`：Binance/OKX/Bybit 当前接口与 Tardis/Kaiko 历史候选的字段级登记。
- `src/v2/research/historical-source-qualification.ts`：资格/评估升级到 v2，绑定权利和 coverage artifact；B0.2 未通过同时禁止 bulk 与 cohort。
- `src/v2/governance/m0-exit-validator.ts`：只同步机器报告的当前本地入口 B0.2-C 与关键外部门 B0.2-B，未改 M0 十项检查逻辑。
- `src/v2/research/*test.ts`：Agent/合成审批、过期审查、当前快照倒推、archive presence、状态缺口、晚到知识、symbol reuse、分母和防篡改测试。
- `docs/architecture/v2/M2_2_B0_2_RIGHTS_AND_HISTORICAL_INSTRUMENT_EVIDENCE_GATE_V1.md`：本轮合同、来源核查和外部解决路径。
- `docs/blueprints/*`、`market-radar-v2-build-sequence.md`、Context、Changelog：状态和唯一下一入口。

## 4. 对核心链路的影响

加固 `全市场发现 -> 候选筛选 -> 复盘进化/Research Governance` 的历史 Universe 真值。它防止幸存者偏差、错误合约混入、future knowledge 回填和无权数据污染 Detector 验收；没有新增真实发现能力。

## 5. 分层边界影响

- scan：未接生产 scan，Detector 仍 DRAFT。
- analysis / strategy / backtest：未改；formal 未运行。
- Candidate：`candidateEmissionAllowed=false`。
- frontend / API：未改。
- DB / Redis / worker / deployment / secret：未涉及。
- production：零连接、零命令、零变更，终态仍需新鲜只读核验。

## 6. 风险说明

- 机器 Gate 通过不代表外部权利或历史来源通过；B0.2 总包仍 blocked。
- Binance/OKX/Bybit 当前接口不能单独回填过去；从现在开始 capture 只改善未来。
- Tardis/Kaiko 只是候选，厂商文档不替代合同/SLA、技术抽样和账户所有者审查。
- 现有 runtime canonical identity 对 symbol reuse 的历史 epoch 表达不足；本包以独立 historicalInstrumentId/identityEpoch 保留真值，后续 B2 必须显式映射，不能合并纪元。
- L2 Liquidity Shift 的历史数据能力仍未解决。

## 7. 执行命令

```bash
npm run build:market-cli
node --test <B0.2-A 定向测试>
npm run typecheck
npm run lint
npm run test:v2-foundation
npm run ci:production
git diff --check
```

外部资料只查官方交易所或数据商文档。成功抓取的公开文档原文仅保留在 `$HOME/.cache/market-radar-v2/evidence/b0-2/sha256`，仓库只存元数据；未成功留存的页面保持 un-hashed。

未执行 `npm run backtest:formal`、production smoke、Shadow、migration、bulk acquisition 或任何生产命令。

## 8. 测试结果

- B0.2-A 定向：35/35 PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS，0 error / 0 warning。
- `npm run test:v2-foundation`：242 total / 237 pass / 0 fail / 5 个明确外部依赖 skip。
- `npm run v2:m0:verify`：10/10 PASS，生产状态仍 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`，机器下一入口已同步为 local B0.2-C / external B0.2-B。
- 完整 `npm run ci:production`：PASS，exit code 0；Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 237/0/5 skip、M0 10/10、Next production build、Golden 16/16、禁文件/secret/security 门禁全部通过。

## 9. 失败项

当前无最终失败项。开发中第一次全 V2 回归以 1 项失败拒绝 Research 注册表直接持有 OKX provider host；没有给 Research 加白名单，而是改为引用 OKX 官方 SDK 的非运行证据地址。反向审计加固后第一次定向为 34/35：旧测试拿 Binance 历史覆盖替代 TEST provider，被新 provider binding 正确拒绝；测试改为同 provider 的真实缺口并另验跨 provider 拒绝，最终复跑 35/35、全 V2 237/0/5。外部事实缺口不是测试失败：权利仍 `PENDING_HUMAN_REVIEW`，合格历史 instrument source 数量仍为 0，因此业务 Gate 正确保持 BLOCKED。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新为当前事实，并保持不超过 400 行。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新并继续只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以继续 B0.2 的外部来源解决或前向 capture 独立包；不可以进入 B1 bulk、B2 cohort、holdout、Detector lifecycle、Candidate runtime 或生产发布。

## 13. 下一轮建议

本地直接执行 `V2-M2.2-B0.2-C-FIRST-PARTY-FORWARD-INSTRUMENT-CAPTURE`，明确只能从真实捕获时刻向未来积累；外部并行解决 `B0.2-B` 的精确权利和合格历史来源。
