# V2 M2.3A R1 Upstream Evidence Join Delivery Report

日期：2026-08-01

状态：`LOCAL_UPSTREAM_EVIDENCE_JOIN_PASS / DIRECTED_14_OF_14_PASS / ADJACENT_70_OF_70_PASS / FULL_CANDIDATE_CI_PASS / REMOTE_FOUR_GATES_PASS / NO_REAL_LIVE_RUNTIME_CANDIDATE_OR_PRODUCTION_AUTHORITY`

## 1. 交付目的

R0 已建立 Listing/Venue point-in-time 事件研究真值，但仍允许调用方提供 `sourceCoverage`。R1 关闭该信任缺口：Coverage、生命周期账本和研究 Bundle 必须从 exact M1 证据连接推导，调用方不能手写“某交易所覆盖完整”或静默丢弃失败来源。

本包只建立上游证据连接和防篡改边界，不运行真实 Detector，不生成 Candidate、方向、概率、信号等级、策略或 READY。

## 2. 精确交付身份

- 分支：`codex/market-radar-v2-m2-3a-r1-evidence-join`。
- 功能提交：`777af03d18bb8c677854bdd3579c19d003f71864`。
- 基线提交：`8da11086de3cd9d68ec2d16e9c3aaae9fb2487c2`。
- R0 功能提交：`1d0a4a79f3673d0439f305d4171c738f6252c998`。
- Refresh evidence schema：`v2-m2-listing-watch-refresh-evidence.v1`。
- Evidence join schema：`v2-m2-listing-venue-event-evidence-join.v1`。
- Scope epoch：`SCOPE_EPOCH_V2_MULTI_ASSET_4V`。

## 3. 实现内容

- 精确连接 M1 upstream binding、source capability registry、四 Venue catalog capture binding、当前/前一 identity snapshot、Bybit/Bitget listing refresh batch、history page、advance、checkpoint 和 evidence binding。
- 对 capability registry 先执行完整 assessment，重新验证 registry digest；手工修改 Binance/OKX listing capability absence 行后，即使结构仍合法也必须拒绝。
- Binance/OKX 只有在对应能力行保持 `NO_OFFICIAL_CAPABILITY_FOUND / UNAVAILABLE`、endpoint/channel 为空且 registry assessment PASS 时，才可计入资格化 announcement coverage。
- Bybit/Bitget refresh 结果必须各恰好一条；source、release、页序、checkpoint、binding、upstream hash、evidence class 和 network environment 必须精确一致。
- `COMMITTED`、`BLOCKED`、partial pages、gap、request count、response bytes、checkpoint 与 binding 分母全部由嵌套制品推导，调用方汇总字段漂移时 fail closed。
- 阻断或部分来源保持显式 Coverage 与 reason code，不能从分母删除后制造完整率。
- Coverage 再驱动 M1 lifecycle ledger 和 R0 research Bundle；四 Venue 目录、两条 provider listing source 与两条资格化 capability absence 共同构成完整证据链。
- Refresh source、refresh aggregate 和 final join 都是 strict、内容寻址制品；内容核心与 artifact identity 分开校验，重哈希后的分母扩张和 authority 升级仍被拒绝。
- 所有 Candidate、方向、概率、Grade、Strategy、READY、production runtime 和 production mutation 权限固定为 false。

## 4. 验证证据

R1 定向测试：

```text
tests 14
pass 14
fail 0
```

R0 与相邻 M1 合同回归：

```text
tests 70
pass 70
fail 0
```

锁定 Node `22.23.1`、npm `10.9.8`、Go `1.26.3` 的完整 `ci:candidate`：

- V2 Foundation：683 total / 677 pass / 6 explicit skip / 0 fail。
- V2 Ops：236/236。
- Candidate M0：PASS，且明确 `NO_PRODUCTION_BRANCH_AUTHORITY`。
- Next production build：PASS。
- Golden cases：16/16。
- Security check：PASS。

新文件先暂存，再重跑 tracked-only forbidden-file、secret-pattern 和 security 门，三项均 PASS，避免未跟踪文件逃逸安全扫描。

GitHub 独立门：

- Signed Production Dispatch Quality：run `30700942398`，PASS。
- V2 A0 Release Qualification：run `30700942328`，PASS。
- V2 Independent Security Quality：run `30700942353`，PASS。
- V2 Full Quality and Materials Gate：run `30700942338`，PASS。

## 5. 本轮发现并根治的问题

- 初次定向测试 12 项同时失败，根因是 strict core schema 收到了 `sourceEvidenceId/contentHash` 制品字段。修复为先剥离 artifact identity，再验证内容核心和稳定摘要，没有放宽 schema 或测试。
- 修复后剩余 1 项测试揭示真实缺口：`M1SourceCapabilityRegistrySchema` 只验证结构，不能单独证明 digest 未被篡改。R1 现在强制执行 `assessM1SourceCapabilityRegistry` 并要求 PASS，手改能力缺席结论会被永久拒绝。
- 删除未使用声明和无调用者的内部内容导出，lint 对 729 个文件 PASS，无残留 TODO、placeholder 或权限旁路。

## 6. 权限与生产边界

本包未：

- 执行真实四 Venue catalog 或 listing refresh runtime。
- 读取或写入生产数据库、Redis、COS。
- 修改生产仓库、服务、Worker、env、migration、Feature Flag、流量或 P0R。
- 生成 Candidate、方向、概率、Signal Grade、Strategy、READY 或交易计划。
- 声称 precision、recall、误报、漏报、提前率、盈利能力或 M2.3A 完成。

生产业务、数据、服务和权限保持不变。

## 7. 未完成事项

- 在同一 exact release 上取得四 Venue catalog capture 与 Bybit/Bitget listing refresh/checkpoint/binding 的真实持续证据。
- M1.5C 四 Venue forward fact 与 M1.5D microstructure forward evidence。
- M1.6-D1 expanded-scope no-cost capacity 证据。
- M2.4A 真实 event/non-event/matched control cohort、purge/embargo、sealed untouched holdout、walk-forward、消融和跨 Venue/regime/liquidity/lifecycle 校准。
- 真实前向 Shadow、漂移监控、独立审计和受控生命周期晋级。
- Candidate emission、方向、概率、Grade、Strategy、READY 与生产 runtime authority。

因此 M2.3A 主步骤保持未勾选。准确结论是“上游证据连接与 Coverage 推导已通过本地和远端质量门，但尚无真实 live Detector 或实战信号能力”。
