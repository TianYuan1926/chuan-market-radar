# V2 M0.4 Expanded Market Scope Amendment Delivery Report

日期：2026-07-23

状态：`DESIGN_SCOPE_AMENDMENT_PASS / IMPLEMENTATION_NOT_STARTED / PRODUCTION_UNCHANGED`

## 本轮目标

把 Bitget、合约上新生命周期、无支持合约的新币 watch、可用数据最大化和股票合约正式纳入 Market Radar V2 权威路线，并阻止旧三 Venue 加密证据被冒充为新四 Venue 多资产证据。

## 完成内容

- 新增 `SCOPE_EPOCH_V1_CRYPTO_3V` 与 `SCOPE_EPOCH_V2_MULTI_ASSET_4V`，冻结跨 epoch 证据不可混用规则。
- 新增 `CRYPTO_LINEAR_PERPETUAL`、`EQUITY_SINGLE_NAME_PERPETUAL`、`EQUITY_INDEX_ETF_PERPETUAL`、`EQUITY_CFD` 和 `OTHER_RWA_DERIVATIVE` 资产域。
- 冻结 Binance、OKX、Bybit、Bitget 的初始 capability truth；未取得官方证明的能力保持 `UNVERIFIED_UNAVAILABLE`。
- 建立公告、目录与 WebSocket 三路上新生命周期，覆盖 announced、pre-launch、warm-up、established、maintenance、restricted、suspended、delisting 和 offline。
- 新币只有现货/资产公告而暂无支持合约时进入 WATCH_ONLY；后续合约使用新 identity，不能把现货身份改成合约身份。
- 把“最大获取数据”定义为 T0-T3 的价值/容量/许可受控采集，不允许无差别保存全部高频字节，也不允许缩小全市场分母。
- 新增 `LISTING_AND_VENUE_EVENT` 与 `EQUITY_EVENT_AND_BASIS` 研究族，当前固定 `DESIGN_ONLY / NO_CANDIDATE_EMISSION`。
- 冻结 M1.1A、M1.1B、M1.4A、M1.5C、M1.6-D1、M2.3、M2.4、M3.1A-M3.6 和 M4-M7 的正确依赖顺序。
- 明确 P0R 生产恢复继续绑定 V1 exact release，原 31 周期和容量模型不能证明扩展范围。

## 权威文件

- `docs/architecture/v2/M0_4_EXPANDED_MARKET_SCOPE_AND_SCOPE_EPOCH_CONTRACT_V1.md`
- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`
- `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json`
- `market-radar-v2-build-sequence.md`
- `PROJECT_CONTEXT_FOR_CHATGPT.md`
- `CHANGELOG_FOR_CHATGPT.md`

## 验证边界

本包只完成设计权威、机器路线和当前真值同步。Bitget Adapter、股票身份、上新采集、四 Venue Shadow、扩展容量、Detector、校准、Strategy、页面和生产能力均未实现。

## 验证结果

- JSON 语法、Scope Epoch 机器矩阵、权威文档一致性、本地 Markdown 链接和 diff whitespace：PASS。
- forbidden tracked file、secret pattern 与 security check：PASS。
- 独立 clean clone、真实分支身份下完整 `npm run ci:production`：PASS。
- V2 foundation：360 pass / 0 fail / 6 explicit skip。
- V2 production ops：115 pass / 0 fail。
- M0 engineering exit：11/11 checks PASS，状态保持 `PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED`。
- Production build 与 Golden Cases：PASS，Golden 16/16。

## 生产影响

```text
production commands: 0
production service changes: 0
database/redis changes: 0
worker changes: 0
feature flag changes: 0
production authority changes: 0
```

## 下一入口

本地下一包为 `V2-M1.1A-FOUR-VENUE-CAPABILITY-REGISTRY`。开始前必须先审查当前未提交的 V1 M3.4 草稿与新 `scopeEpoch` 的兼容性；不兼容内容保持未提交，不能绕过范围重基线。
