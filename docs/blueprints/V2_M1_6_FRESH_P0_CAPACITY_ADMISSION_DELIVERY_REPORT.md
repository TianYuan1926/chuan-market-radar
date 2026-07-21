# 本轮交付报告

## 1. 本轮目标

让下一次 fresh P0 在不降低门槛的前提下采用六小时实测容量模型，避免继续被旧日分区公式错误阻断，同时保证恢复、身份、拓扑、只读和零 mutation 防线一项不少。

## 2. 范围边界

只修改 P0R 容量纯函数、fresh P0 组合准入工具、测试、权威合同和项目上下文。未修改前端、API、Detector、Candidate、Analysis、Strategy、Backtest、数据库 schema、Redis、Worker、env、Feature Flag、生产服务或 secret。

## 3. 修改文件清单

- `m1-production-storage-p0r-no-cost-capacity.mjs`：抽出唯一容量计算器，并纠正稳态 60% / 峰值 70% 双门槛。
- `m1-production-storage-fresh-capacity-admission.mjs`：绑定五类 fresh 证据，重建旧 P0 报告，只替代三个旧容量检查，并要求恢复目标容纳稳态数据与 WAL reserve 后输出内容寻址准入报告。
- 两个对应测试文件：覆盖旧容量替代、非容量继承、恢复缺失、过期拓扑、门槛降级、61% 稳态反例、恢复目标不足、篡改和 CLI 受限文件路径。
- `package.json`：把 fresh P0 准入测试纳入 P0R 定向门禁。
- V2 合同、主蓝图、机器矩阵、施工顺序、README、项目上下文和 Changelog：登记当前真实状态。

## 4. 对核心链路的影响

只加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产存储准入。它保留全市场一分钟分母和 24 小时 Detector 回看，不产生信号、计划或交易权限。

## 5. 分层边界影响

- scan：只保护未来生产 Fact 容量，不改排序或候选。
- analysis / strategy / backtest / frontend / API：无业务逻辑改动。
- DB / Redis / worker / deployment / secret：无生产改动。
- production evidence：本轮只实现消费者；未采集新事实，也未声称生产 PASS。

## 6. 风险说明

- 本地工具 PASS 不等于 fresh P0 PASS；真实 recovery 和 15 分钟内 topology 仍是硬前置。
- Synthetic production-shape calibration 不能单独声明生产容量，只能与同 source 的 fresh 生产证据组合。
- 校准有效期 24 小时，未来外部门完成后必须在 exact release 上重跑，不能复用当前过期样本。

## 7. 执行命令

```text
node --test scripts/v2/production/m1-production-storage-fresh-capacity-admission.test.mjs
npm run test:v2-m1-p0r
npx eslint scripts/v2/production/m1-production-storage-fresh-capacity-admission*.mjs scripts/v2/production/m1-production-storage-p0r-no-cost-capacity.mjs
npm run ci:production
```

## 8. 测试结果

- fresh capacity admission：10/10 PASS。
- P0R 定向：59/59 PASS，Go COS helper PASS。
- V2 ops：113/113 PASS。
- `typecheck`、`lint`、`build`：PASS。
- Legacy market：965 pass / 0 fail / 4 explicit skip。
- Worker：23/23 PASS；historical smoke：4/4 PASS。
- V2 foundation：279 pass / 0 fail / 6 explicit external skip。
- M0：11/11 PASS；Golden：16/16 PASS；security：PASS。
- `npm run ci:production`：PASS。
- `npm run backtest:formal`：未运行，且本轮不应运行。

## 9. 失败项

无测试失败。审阅发现并修复一处既有标准漂移：原实现把稳态和峰值都按 70% 判定，现已恢复合同要求的稳态 60% / 峰值 70%，并新增 61% 稳态必须阻断的反例。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，只登记 fresh P0 准入工具本地 PASS 和生产仍 BLOCKED 的当前事实。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并维持最近 5 个重要事件。

## 12. 是否可以进入下一轮

本地工程可以；生产 P0 不可以。外部 Object Lock、age/STS、真实 backup/retrieval/restore 和 fresh topology 未完成前，P1 仍关闭。

## 13. 下一轮建议

只完成 Object Lock 白名单与真实恢复前置；外部门通过后，在 exact clean release 重跑容量校准、采集 fresh P0 原始事实并用本工具生成唯一生产准入结论。
