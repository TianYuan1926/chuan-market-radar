# WP-G0.2 Shadow Capture 工程合同

> 状态更新：本文件记录本地实现包的基础合同。当前准入结论已由 `WP_G0_2_SHADOW_CAPTURE_COMPOSITION_WIRING_V1.md` 和对应 composition JSON 接管。

## 1. 当前结论

设计阶段已结束，本地实现与 PostgreSQL 16 隔离演练已通过。当前机器结论固定为：

```text
本地实现：PASS_LOCAL_IMPLEMENTATION_AND_REHEARSAL
生产决定：BLOCKED_NOT_AUTHORIZED
系统状态：R1 / 可运行但不完整 / 不能支撑实战
```

本文件不构成 production migration、shadow writer、Feature Flag、backfill、dual read 或 read cutover 授权。

## 2. 权威与源事务

旧系统继续负责真实写入和读取。Shadow source 选择完整 `scan_archives` 记录和调用方已解析的 canonical instrument 候选观察，不使用可覆盖的 `journal_events` 或调度状态 `scan_asset_states` 伪造 Episode 真值。

同一 PostgreSQL connection transaction 必须原子完成：

1. 插入不可变 scan archive；同 ID 同内容为幂等 no-op，同 ID 不同内容硬拒绝。
2. 为每个 canonical candidate 写入 `legacy_scan_candidate` Outbox；同幂等键不同 payload hash 硬拒绝。

任何 Outbox 写入失败都回滚 scan archive。Feature Flag 不是授权书；真正的旁路写权限来自 `candidate_migration_control.phase + epoch`，环境变量最多只能作为额外 kill switch。

## 3. Consumer 边界

- 只 claim `source_type=legacy_scan_candidate`，不消费 Candidate 自己产生的 event Outbox。
- Payload 使用精确 key allowlist，不接受交易计划、RR、Outcome 或 future 数据字段；SCAN source 只允许 `light_candidate/deep_candidate` 与 `unknown/neutral`，不能携带 long/short 或分析成熟度。
- 投影命令使用源 Outbox ID 生成独立幂等键；投影成功但 completion lease 丢失时，由新 lease owner 幂等重放。
- 永久 payload/constraint 错误进入 quarantine；瞬时失败指数退避，第 8 次失败进入 quarantine。
- payload/hash/idempotency 冲突先 quarantine 再 hard stop，不继续处理同批次。
- 指标只包含 release、migration、epoch、payload version 和 failure class，不记录 payload、异常原文或 secret。

## 4. 数据库防线

Migration `009_candidate_shadow_capture_safety.sql` 是对生产现有 1-8 的增量草案：

- 增加 `max_attempts`、`error_class`、`error_message_redacted`、`quarantined_at`。
- 增加不可变 `quarantined` 终态和 quarantine 索引。
- 增加 source enqueue、source-filtered claim、retry-or-quarantine、immediate quarantine v2 过程。
- authority epoch 检查使用 `FOR SHARE`，与 phase transition 的 `FOR UPDATE` 形成数据库锁屏障。
- 使用数据库时钟执行 72 小时 deadline；调用方不能延长或伪造时间。
- 任一 unresolved quarantine 阻断 `shadow_verify/canonical` 晋级。

## 5. 已验证事实

- Candidate 定向测试：97 pass / 0 fail / 2 个显式数据库环境测试 skip；本包 PG16 测试单独真实执行。
- 空库 migration 1-9：9/9 applied，8 tables / 155 columns / 24 functions。
- 已有 1-8 schema 升级：只 applied 009；重复执行 9/9 skipped；旧 public sentinel hash 不变。
- PG16 场景通过：原子回滚、同源 hash conflict、source-only claim、Candidate 幂等投影、8 次失败 quarantine、终态不可改、quarantine 阻断晋级、lease takeover、stale fence、epoch lock race、database deadline。
- 临时集群位于 `/tmp`，使用 loopback、专用 rehearsal DB 名和 trust-only 临时实例；演练结束后关闭并删除，未连接生产。

## 6. 仍未完成

1. Production 仍只有 migration 1-8；009 尚未审批或应用。
2. Quarantine 的审批化 forward-fix/resolution ledger 已在 readiness 包本地实现并通过 PG16 演练，尚未进入生产 schema。
3. 本地 Production API/worker/composition root 已接线并通过排练，但尚未部署生产；五个 Candidate Feature Flag 继续关闭。
4. 新的 production 限时审批不存在。

## 7. 下一包

`WP-G0.2-SHADOW-CAPTURE-PRODUCTION-ADD-SAFETY-SCHEMA`

Readiness 本地包完成后，下一包必须是独立审批的 schema-only 009 生产应用与 dormant verify。不得在同一审批中部署 runtime 或开启 Shadow Writer。

## 8. 验证命令

```bash
npm run test:candidate-shadow-capture
npm run candidate:shadow-capture:validate
npm run candidate:test
npm run candidate:shadow-capture:pg16-rehearsal
```

以上成功只证明本地实现与演练，不证明 production shadow_capture 已开启。
