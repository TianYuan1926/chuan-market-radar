# WP-G0.2 Shadow Verify / Reconciliation 本地准备合同 v1

状态：`PASS_LOCAL_PREPARATION` 仅在全部门禁通过后成立。
生产授权：`false`。
当前生产顺序：Activation 仍在观察中；之后还需累计至少 10,000 条真实 completed 写入，并启动一个新的相邻验证周期，才能申请执行本只读对账包。

## 1. 目标

为未来 `shadow_verify` 建立只读、逐笔、可重算的 Candidate 投影对账证据。它只回答“全部已批准验证周期内的 Legacy 候选 Source Outbox 是否被 Candidate 以完全相同的命令投影”，不生成交易计划、不修改排序，也不切换权威读写链。

原实现只按当前 release 过滤，跨多个 72 小时周期累计到 10,000 条后会漏掉历史周期，因此不能支撑真实 G0 验收。本合同已改为多周期血缘模型。

## 2. 多周期血缘

1. 血缘必须从 `candidate-episode-v1` 开始，后续只能是严格相邻的 `candidate-episode-v1-cycle-N`。
2. 每个窗口必须精确绑定 migration、release、当时的正奇数写 epoch、startedAt 和 72 小时 deadline。
3. Activation 的 289 样本和 24 小时 PASS 只绑定第一个 release，不得冒充当前新鲜验证周期证据。
4. 请求、当前生产身份和数据库当前 control 必须绑定血缘最后一个窗口。
5. 同一只读事务必须读取全部 Candidate control 行；数量、顺序、release 和时间窗口必须与请求完全一致。
6. 历史 control 必须为 `legacy`、`write_frozen=true`，冻结 epoch 必须等于原写 epoch 加一；最后一个 control 必须是唯一 active `shadow_capture`。
7. 任一 `legacy_scan_candidate` 写入不属于已批准 release 血缘，必须失败，不能用过滤条件把它藏起来。

## 3. 一条 compared write 的严格定义

每一条计数必须同时满足：

1. Source 为不可变 `legacy_scan_candidate` Outbox，状态为 `completed`。
2. payload 精确符合 `shadow-candidate-observation.v1` allowlist，不含 Outcome、MFE、MAE、qualityHit、交易计划或排序字段。
3. `payload_hash` 可从完整 payload 重算一致。
4. source id、source version、source idempotency key 与 scan cycle、instrument、时间完全一致。
5. 通过 `shadow-projection:<outbox_id>` 唯一关联一个不可变 Candidate Event。
6. 用 Source payload、Event runtime id 和 idempotency key 重建完整 `open_or_refresh_episode_v1` 命令，重算 `command_hash` 必须一致。
7. Event release、runtime release、scan cycle、event time、instrument、event type 和 Episode identity 全部一致。
8. Source 创建与完成时间位于该行自身 release 对应的不可变 72 小时窗口内，而不是统一套用当前窗口。

只统计总数、只看 completed、只比较 instrument、只核对当前 release，或用当前可变 Episode 聚合行代替历史命令比对，均不算 compared write。

## 4. PASS 条件

- 前置 Activation/Observation 必须为真实 `PASS_ACTIVATE_AND_OBSERVE`，且原始证据可从 289 样本重算。
- 累计写入证据必须达到 `PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE`，至少 10,000 条。
- 至少两个严格相邻 release 窗口，最后一个是新鲜验证周期。
- compared writes 不少于 10,000。
- comparison differences、重复 Source 映射、重复 Event 映射、血缘外写入全部为 0。
- pending、claimed、retry_wait、unresolved quarantine、unresolved total 全部为 0。
- resolved quarantine 只作为显式排除项报告，不计入 compared writes。
- 数据库采集必须在 `REPEATABLE READ READ ONLY` 事务中完成，并强制 `SET LOCAL ROLE candidate_audit_role`。
- 最终证据按逐笔 digest 排序后聚合 SHA-256，输入顺序不能改变证据 hash。

## 5. 明确禁止

- 不执行 `shadow_verify` phase transition；PASS 只表示可另行进入 Shadow Verify。
- 不执行 DDL、DML、migration、Feature Flag、worker、Web、Redis 或生产排序变更。
- 不读取或使用 future outcome、MFE、MAE、hit、qualityHit、交易计划或回测结果。
- 不自动进入 `canonical_compat`、canonical read/write 或 Review read。
- 不把 9,999 条、部分血缘、漏报 control、总数相等或 resolved fallback 包装成 PASS。

## 6. 当前结论

本地纯函数和隔离 PostgreSQL 16 已证明两个不可变周期各 5,000 条、合计 10,000 条可以逐条零差异对账；只读事务拒绝写入，未批准的第三个 control 会被拒绝，phase 保持 `shadow_capture`。生产 Reconciliation 尚未执行，当前不能宣称 Activation、10,000 条累计、新鲜验证周期、Reconciliation、Shadow Verify、WP-G0.2 或 G0 完成。
