# WP-G0.2 Shadow Capture 生产 Add Safety Schema 审批包

## 1. 申请范围

只申请在生产 Candidate authority 已有 migration 1-8 的基础上应用：

```text
009_candidate_shadow_capture_safety.sql
```

本审批不包含 runtime 部署、Shadow Writer、Feature Flag、control lifecycle start、backfill、dual read、read cutover、服务重启或交易逻辑变化。

## 2. 审批前必须重新确认

- GitHub `main` commit 与用户审查 commit 完全一致。
- Migration 009 SHA-256 与机器合同完全一致。
- 生产 schema ledger 仍为 1-8，009 不存在；如果 009 已存在则立即停止。
- fresh encrypted off-host backup、隔离 restore、容量 Gate 和 production health 全部 PASS。
- 生产 worktree clean，应用 release/image 不因本 migration 改变。
- 五个 Candidate Feature Flag 全部为 false。
- 独立 migration login、owner role 和权限边界仍通过。

## 3. 允许的执行顺序

1. 只读 preflight 和证据时间校验。
2. 生成新的 schema-only approval request 和一次性 confirmation。
3. Migration Runner 只执行一次 009。
4. 只读 verify：ledger、checksum、9 tables、166 columns、26 functions、权限和 trigger。
5. 验证 Feature Flag=false、Candidate control 未启动、应用 release/image/worktree 未变化。
6. 生产 health、Postgres、Redis、worker heartbeat 和核心 API smoke。
7. 生成脱敏证据并停止；不得继续 runtime 部署或 Writer 激活。

## 4. 立即停止条件

- checksum、commit、schema fingerprint、角色、权限或 approval window 不一致。
- 009 已存在或出现非预期 pending migration。
- backup/restore/capacity/health 任一证据失败或过期。
- worktree dirty、release/image mismatch、Feature Flag=true。
- migration 超时、锁等待超预算、schema 计数或权限验证不一致。
- 任何 secret、payload、业务行或未脱敏日志进入证据。

## 5. 失败与回退

- 009 在单 migration transaction 内失败：事务和 ledger 一起回滚，停止后续动作。
- 009 成功但 verify 失败：保持 Feature Flag=false，不部署 runtime，不启动 control lifecycle；保留 additive schema 供 forward-fix 审计。
- 不执行 `DROP TABLE`、不删除 migration ledger、不清 Postgres/Redis/volume、不修改旧 scan archive。
- legacy 继续是唯一读写权威，网站现有扫描行为不应发生变化。

## 6. 用户审批语句边界

只有类似下列明确语句才构成下一生产包授权：

```text
批准仅执行 WP-G0.2-SHADOW-CAPTURE-PRODUCTION-ADD-SAFETY-SCHEMA，
绑定审查 commit 与 migration 009 checksum，当前 90 分钟窗口。
```

“继续”“全自动搭建”“开始下一包”都不构成生产执行授权。
