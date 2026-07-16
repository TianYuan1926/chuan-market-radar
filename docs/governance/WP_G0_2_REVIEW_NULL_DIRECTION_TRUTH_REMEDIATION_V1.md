# WP-G0.2 Review Null/Direction Truth Remediation

## 目标

关闭旧 Review 链路中的三类真值污染：未知方向默认多头或上涨、缺失价格与 MFE/MAE 补 0、未知结果显示为超时。

## 允许范围

- Review statistics 只统计同时具备真实 MFE 与 MAE 的样本。
- Review API 合同保留 `null`、`未知`、`pending` 和 `unknown`。
- Review 页面只翻译后端合同，不推断方向、结果或价格。
- 增加反例测试和机器化治理门禁。

## 禁止范围

- 不修改 scan、analysis、strategy、Risk Gate 或 backtest 算法。
- 不修改 API route、Candidate 数据库、Redis、worker、migration、Compose 或部署。
- 不连接生产，不改变 Feature Flag、control、release 或 canonical read 授权。
- 不运行 formal backtest。

## 真值规则

1. `direction` 不是 `long` 或 `short` 时必须显示“未知”。
2. 缺失 entry、stop、target、验证窗口、MFE、MAE 时必须保留 `null`。
3. 只有后端明确 `expired` 才能显示“超时未达”。
4. `watching`、tracking 或 pending 显示“等待结果”；其它未决状态显示“结果未知”。
5. 缺少方向、结果或完整 MFE/MAE 的生命周期资源必须是 `partial`，不能声称 `live` 完整。
6. 漏判方向和幅度缺失时显示“未知 / 幅度待记录”，不能默认上涨或 0%。

## 生产边界

本包只修本地 Review 真值，不授权生产部署。生产必须先取得 `PASS_ACTIVATE_AND_OBSERVE`，下一包只能是获得独立绑定的 `WP-G0.2-SHADOW-VERIFY-RECONCILIATION`。
