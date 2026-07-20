# 本轮交付报告

状态：`LOCAL_ENGINEERING_EXIT_PASS / PRODUCTION_UNCHANGED / B1-B3_PENDING`

## 1. 本轮目标

处理 B1-A/B1-B1 暴露的 Market Fact 语义错误：停止混用最新成交价，把三 Venue 统一为标记价格快照，拆开 collection、price usability 和 freshness，并修复 Runner/校验器参数漂移。

## 2. 范围边界

只改 `src/v2/modules/market-fact`、直接依赖的 V2 Feature/fixture、M1 Collector/Worker/SLO、隔离生产 Runner 证据合同、测试和当前权威文档。

未改 Legacy、前端、API authority、Candidate、Analysis、Strategy、Backtest、生产 DB/Redis/env/Feature Flag/服务/仓库；没有 migration，没有自动交易能力。

## 3. 修改文件清单

- 三个 `*-mark-price.ts` Adapter：绑定 Binance/OKX/Bybit 公开 mark-price 字段和 Provider 快照时间。
- `mark-price-normalization.ts`、`price-snapshot-types.ts`、`build-mark-price-facts.ts`：建立 `MARK_PRICE / MARK_PRICE_SNAPSHOT` 唯一语义和严格序列门禁。
- Collector coverage/runtime/telemetry/SLO/evidence：新增 `usablePriceCount` 与 price-usability ratio，升级运行和证据 schema。
- Feature、artifact integrity、fixtures：从 `LAST_PRICE` 切到 `MARK_PRICE`，同步内容哈希和 feature identity。
- 腾讯 Runner/validator：共用唯一 environment 合同，修复 1 小时/24 小时漂移，并输出脱敏验证阶段错误码。
- 对应单元、集成、anti-inflation 和生产证据测试：验证 exact endpoint、值不变但时间前进、duplicate 拒绝、可用率独立失败和 aggregate=Venue sum。

## 4. 对核心链路的影响

加固 `全市场发现 -> Market Fact + Quality -> Point-in-Time Feature` 的数据地基。它没有提高 Detector、信号等级或交易计划能力，也不宣称实战完成。

## 5. 分层边界影响

- scan：只改善其未来可读取的价格事实；未实现 Detector。
- analysis / strategy / backtest / frontend / API：未接入。
- DB / Redis / worker / deployment：只改 no-authority Worker 和隔离 Runner 源码；生产运行对象零变更。
- secret：未读取、未写入、未提交。

## 6. 风险说明

- B1-B1 的 31 周期进程跑完但完整证据没有保住，因此结论必须为 `EXECUTION_INVALID_NOT_COUNTED`。
- 标记价格是稳定的估值快照，不等于成交、订单簿或可执行价格；后续机会识别仍需独立 trade/OI/order-book/liquidity facts。
- 只有新的 B1-B3 31 周期业务 Gate 能证明本次整改在真实市场持续成立。

## 7. 执行命令

```text
npm run test:v2-m1-identity-fact
npm run test:v2-m1-feature-context
npm run test:v2-m1-collector
npm run test:v2-foundation
npm run test:v2-ops
npm run ci:production
```

## 8. 测试结果

- 定向 identity/fact：30/30 PASS。
- 定向 feature/context：17/17 PASS。
- 定向 collector/runner：70/70 PASS。
- 全 V2：277 PASS / 0 FAIL / 5 explicit external-dependency skips。
- V2 ops：32/32 PASS。
- `ci:production`：PASS，退出码 0；Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 277/0/5 explicit skip、ops 32/32、M0 11/11、Next build、Golden 16/16 和 security 全部通过。

## 9. 失败项

B1-B1 现场执行无有效完成证据，失败报告 digest 为 `sha256:ba16338bcf0cf7ae9600bd34d6c415f35e228a3e8958fcf70faa854a8ceb0ebc` 与 `sha256:cbf1079a177bb21f64452ecf9a396225daa933826edd527fffa87d894dd717e8`。宿主恢复通过，隔离暂存已删除；该运行不计 PASS/FAIL 业务结论。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以在 commit/push 绑定 exact clean release 后进入 B1-B3；当前不可进入 production storage 或 24 小时 Shadow。

## 13. 下一轮建议

只执行 `V2-M1.5-B1-B3-MARK-PRICE-SAME-GATE-31-CYCLE-RETEST`。
