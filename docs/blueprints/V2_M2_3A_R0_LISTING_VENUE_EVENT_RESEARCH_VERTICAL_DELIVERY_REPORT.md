# V2 M2.3A R0 Listing/Venue Event Research Vertical Delivery Report

日期：2026-08-01

状态：`LOCAL_EVENT_TRUTH_VERTICAL_PASS / DIRECTED_14_OF_14_PASS / ADJACENT_65_OF_65_PASS / FULL_CANDIDATE_CI_PASS / REMOTE_FOUR_GATES_PASS / NO_CANDIDATE_OR_PRODUCTION_AUTHORITY`

## 1. 交付目的

在不生成 Candidate、方向、概率、信号等级、策略或 READY 的前提下，把 M1 上市生命周期事实无损转换为 point-in-time Listing/Venue 研究事件。R0 只关闭事件真值、身份和时间血缘，防止当前目录倒推历史、标题猜 symbol、首次观察冒充上新、目录消失冒充下架，以及 publication、effective、knowledge 三个时间被混用。

## 2. 精确交付身份

- 分支：`codex/market-radar-v2-m2-3a-listing-event`。
- 功能提交：`1d0a4a79f3673d0439f305d4171c738f6252c998`。
- M2 Bundle schema：`v2-m2-listing-venue-event-research.v1`。
- M2 event schema：`v2-m2-listing-venue-research-event.v1`。
- M1 lifecycle ledger schema：`v2-m1-listing-lifecycle-ledger.v2`。
- Scope epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`。
- Venue 分母：Binance Futures、OKX Swap、Bybit Derivatives、Bitget Futures，共 4 家。

## 3. 实现内容

- 冻结 14 类事件：合约公告、首次目录观察、pre-launch、warm-up、established、maintenance、restriction、suspension、delisting notice、delisting transition、offline、Venue product update、目录缺席未决和 unresolved。
- M1 ledger v2 原样保留 `providerPublishedAt`；公告必须有 publication time，目录与缺席事件禁止伪造该时间，publication 不得晚于 knowledge time。
- publication、provider effective 和 knowledge time 分开保存；event anchor 明示使用哪一种时间，禁止事后替换。
- 一条 M1 lifecycle event 必须恰好映射一条 M2 research event；Bundle 的 upstream denominator、Venue/event/disposition 计数和 content hash 必须一致。
- 每个 artifact 绑定 exact release、scope epoch、ledger、当前/前一 identity snapshot、identity epoch、source cutoff、source coverage 和内容摘要。
- 未关联公告不从标题猜 symbol；没有 provider effective time 时不得把公告绑定到 listing epoch。
- 首次 active catalog observation 只算 baseline，不算上新证明；目录消失保持 unresolved，不能推断 delisting。
- 无支持合约的新币保持 WATCH_ONLY 且没有 canonical contract id；股票事件 handoff M2.3B；CFD/RWA 只做 accounting；partial/unresolved identity 保留为显式 BLOCKED 行，不能静默丢弃。
- source coverage 必须逐一覆盖四 Venue，并与 M1 complete catalog sources 一致；future coverage、release drift、cutoff 越界和内容篡改全部 fail closed。
- Candidate、方向、概率、Grade、Strategy、READY、production runtime 和 production mutation 权限全部固定为 false。

## 4. 验证证据

定向测试：

```text
tests 14
pass 14
fail 0
```

相邻合同回归覆盖 M1 multi-asset identity、listing history runtime、M2 discovery、precursor atlas 和本包：

```text
tests 65
pass 65
fail 0
```

锁定 Node `22.23.1`、npm `10.9.8`、Go `1.26.3` 的完整 `ci:candidate`：

- V2 Foundation：669 total / 663 pass / 6 explicit skip / 0 fail。
- V2 Ops：236/236。
- Candidate M0：PASS，且明确 `NO_PRODUCTION_BRANCH_AUTHORITY`。
- Next production build：PASS。
- Golden cases：16/16。
- Security check：PASS。

首轮误用主机 Node `24.15.0` 时，Ops 唯一失败为 `p0r_runtime_capsule_node_version_mismatch`。没有忽略或放宽该失败；切回仓库锁定的 Node `22.23.1` 后从头重跑完整 CI 并全部通过。这是运行环境资格故障，不是 M2.3A 业务测试失败。

GitHub 独立门：

- Signed Production Dispatch Quality：run `30699019243`，PASS。
- V2 A0 Release Qualification：run `30699019238`，PASS。
- V2 Independent Security Quality：run `30699019242`，PASS。
- V2 Full Quality and Materials Gate：run `30699019235`，PASS。

## 5. 权限与生产边界

本包未：

- 读取或写入生产数据库、Redis 或 COS。
- 修改生产仓库、服务、Worker、env、migration、Feature Flag、流量或 P0R。
- 接入真实四 Venue production runtime。
- 生成 Candidate、方向、概率、Signal Grade、Strategy、READY 或交易计划。
- 声称真实 precision、recall、误报、漏报、提前率、盈利能力或 M2 完成。

生产业务、数据、服务和权限保持不变。

## 6. 未完成事项

- 四 Venue announcement/catalog 的真实、持续、资格化 source coverage。
- M1.5C 四 Venue forward fact 与 M1.5D microstructure forward evidence。
- M1.6-D1 expanded-scope no-cost capacity 证据。
- M2.4A 真实 event/non-event/matched control cohort、purge/embargo、sealed untouched holdout、walk-forward、消融、跨 Venue/regime/liquidity/lifecycle 校准。
- 真实前向 Shadow、漂移监控、独立审计和受控生命周期晋级。
- Candidate emission、方向、概率、Grade、Strategy、READY 与生产 runtime authority。

因此 M2.3A 主步骤保持未勾选。当前准确结论是“事件研究真值纵切已通过本地和远端质量门，但不能支撑真实 Detector 或实战信号”。
