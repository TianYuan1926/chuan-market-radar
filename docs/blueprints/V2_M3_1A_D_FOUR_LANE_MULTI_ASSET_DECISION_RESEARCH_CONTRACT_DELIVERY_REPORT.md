# V2 M3.1A-D Four-Lane Multi-Asset Decision Research Contract Delivery Report

日期：2026-07-24

状态：`LOCAL_RESEARCH_CONTRACT_SCAFFOLD_PASS / DIRECTED_28_OF_28_PASS / FULL_CI_PASS / PRODUCTION_UNCHANGED`

## 1. 交付目的

把 Bitget、上新暖机、单股永续和指数/ETF 永续正确接入 M3 决策合同，同时防止把旧三 Venue 加密 fixture、单一总校准或通用策略模板改名后冒充 Scope V2 能力。

## 2. 实现内容

- 新增四条精确 decision lane，并锁定各自 asset domain 与 lifecycle。
- 新增 `LISTING_AND_VENUE_EVENT`、`EQUITY_EVENT_AND_BASIS` 及对应 pattern。
- Analysis 分离 evidence/setup/integrity blockers，硬前提反证不能被支持证据抵消。
- Evidence 与 Setup 使用两份独立、内容寻址 calibration；校准绑定 segment，不绑定单一 instrument。
- Strategy policy 绑定 lane、Venue、domain、lifecycle、family、direction、regime 和两份 calibration hash。
- Cost snapshot 使用 exact evidence reference；不可得成本为 `null`，禁止默认 0。
- Reference price 升级为可 sealing/verifying 的内容寻址 artifact，并绑定 entry evidence。
- Strategy Draft 使用正十进制定点价格、结构 stop、精确费用与 gross/net RR；低 RR 只弃权，不缩 stop。
- Fib target 只有在 validated extension evidence digest 精确匹配时可用。
- 公共 Strategy builder 对 malformed 和极端 schema-valid 输入 fail closed，不抛异常。

## 3. 四轨测试

定向测试共 28 项：

- Analysis 10 项。
- Independent Qualification 7 项。
- Strategy 11 项。

覆盖：

- 四轨正向研究合同。
- Bitget 不能借 Binance 证据。
- Listing warm-up 不能借 established crypto 校准。
- 单股不能借指数/ETF policy。
- CFD、RWA、watch、prelaunch、maintenance、suspended、delisting 禁入。
- 股票 session、公司行动、FX、闭市 basis 任一缺失即弃权。
- 非方向证据不能投 LONG/SHORT。
- hard prerequisite 支持与反证并存时阻断。
- calibration 最小样本、regime、holdout、冻结阈值与 future leak。
- Evidence 与 Setup 独立升降级。
- cost/reference/policy/draft hash 篡改。
- Fib、低 RR、stop 外扩和无异常边界。

当前定向结果：

```text
tests 28
pass 28
fail 0
```

正式实施分支身份下完整 `ci:production` 结果：

- V2 Foundation：494 total / 488 pass / 6 explicit skip / 0 fail。
- V2 Ops：131/131。
- M0 工程出口：11/11。
- Next production build：PASS。
- Golden cases：16/16。
- Security check：PASS。

## 4. 权限与生产边界

本包未：

- 读取或写入生产数据库。
- 修改生产服务、Redis、Worker、env、Feature Flag 或页面。
- 创建真实 Detector、Candidate、Signal Level、READY 或交易计划。
- 声称真实 cohort、untouched holdout、校准效果、precision、recall、lead time 或盈利能力。
- 修改 P0R、M1.4B 腾讯运行或 Legacy 生产状态。

所有输出固定为 research-only，无 Strategy/READY/Execution authority。

## 5. 未完成事项

- M2.3A/B 与 M2.4A/B 尚未形成真实 runtime/cohort/holdout。
- M3.1A-M3.3D 仍需使用真实 point-in-time 样本重新校准和逐域验收。
- M3.4-R1、M3.5、M3.6 尚未实现。
- Scope V2 腾讯 runtime、Shadow、容量与恢复验收尚未完成。
- P0R 仍需 fresh exact-plan STS、加密备份、精确取回、独立 PG16 恢复和 fresh P0。

因此本包不减少生产门禁，也不改变“不能支撑实战”的当前结论。
