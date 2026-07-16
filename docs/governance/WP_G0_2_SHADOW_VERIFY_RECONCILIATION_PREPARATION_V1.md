# WP-G0.2 Shadow Verify / Reconciliation 本地准备合同 v1

状态：`PASS_LOCAL_PREPARATION` 仅在全部门禁通过后成立。
生产授权：`false`。
当前生产顺序：Activation 已执行，必须先取得真实 `PASS_ACTIVATE_AND_OBSERVE`，再凭新的精确审批执行本只读对账包。

## 1. 目标

为未来 `shadow_verify` 建立只读、逐笔、可重算的 Candidate 投影对账证据。它只回答“Legacy 候选 Source Outbox 是否被 Candidate 以完全相同的命令投影”，不生成交易计划、不修改排序，也不切换权威读写链。

## 2. 一条 compared write 的严格定义

每一条计数必须同时满足：

1. Source 为不可变 `legacy_scan_candidate` Outbox，状态为 `completed`。
2. payload 精确符合 `shadow-candidate-observation.v1` allowlist，不含 Outcome、MFE、MAE、qualityHit、交易计划或排序字段。
3. `payload_hash` 可从完整 payload 重算一致。
4. source id、source version、source idempotency key 与 scan cycle、instrument、时间完全一致。
5. 通过 `shadow-projection:<outbox_id>` 唯一关联一个不可变 Candidate Event。
6. 用 Source payload、Event runtime id 和 idempotency key 重建完整 `open_or_refresh_episode_v1` 命令，重算 `command_hash` 必须一致。
7. Event release、scan cycle、event time、instrument、event type 和 Episode identity 全部一致。
8. Source 创建与完成时间位于审批绑定的 control 72 小时窗口内。

只统计总数、只看 completed、只比较 instrument、或用当前可变 Episode 聚合行代替历史命令比对，均不算 compared write。

## 3. PASS 条件

- 前置 Activation/Observation 必须为真实 `PASS_ACTIVATE_AND_OBSERVE`。
- 同一 release、migration、authority epoch；epoch 必须为正奇数，并由审批请求、数据库控制行和观察证据三方精确绑定，不得写死为历史 epoch 1。
- 当前 Activation v1 最终结果未内嵌 release/epoch 时，只允许通过“最终证据 SHA-256 + 新精确审批请求 + 数据库控制行”三方绑定；若未来证据内嵌身份，则内嵌值也必须精确一致。
- 连续 clean window 不少于 24 小时、至少 289 个观察样本。
- compared writes 不少于 10,000。
- comparison differences、重复 Source 映射、重复 Event 映射全部为 0。
- pending、claimed、retry_wait、unresolved quarantine、unresolved total 全部为 0。
- resolved quarantine 只作为显式排除项报告，不计入 compared writes。
- 数据库采集必须在 `REPEATABLE READ READ ONLY` 事务中完成，并验证 `transaction_read_only=on`。
- 最终证据按逐笔 digest 排序后聚合 SHA-256，输入顺序不能改变证据 hash。

## 4. 明确禁止

- 不执行 `shadow_verify` phase transition；PASS 只表示可另行申请审批。
- 不执行 DDL、DML、migration、Feature Flag、worker、Web、Redis 或生产排序变更。
- 不读取或使用 future outcome、MFE、MAE、hit、qualityHit、交易计划或回测结果。
- 不自动进入 `canonical_compat`、canonical read/write 或 Review read。
- 不把 9,999 条、部分样本、总数相等或 resolved fallback 包装成 PASS。

## 5. 当前结论

本地纯函数测试与隔离 PostgreSQL 16 演练证明工具能处理真实 10,000 条联表对账、拒绝只读事务写入并保持 phase 不变。生产数据尚未产生，当前不能宣称 reconciliation、shadow_verify、WP-G0.2 或 G0 完成。
