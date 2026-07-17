# WP-G0.2 Legacy Pending Drain Remediation Local Superpackage

## 目标

生产只读核验确认旧 Candidate 周期已经安全冻结在 `legacy / epoch 4`，但仍有 2,957 条 `pending`。Candidate worker 当前 absent，因此既不能自然排空，也不能满足相邻周期续接的 `unresolved=0` 门禁。本包只关闭这个死锁，不启动新周期、不取得 Canonical authority。

## 为什么不能直接续接

生产共有 5,914 条 outbox，其中 2,957 条 completed、2,957 条 pending；事件数为 2,957，resolution 为 0。直接把 cycle-2 启动条件改成允许 pending，会把两个周期的未完成工作混在同一 authority 边界内，也会让 Lineage 和 Reconciliation 失去可信起点，因此禁止。

## 受控排空路线

1. 精确绑定 migrations 1-10、唯一 control、旧 release、epoch 4、deadline 和聚合计数。
2. 暂停 scanner，并证明 public/read 路径不会触发 refresh；排空期间 outbox 总数不得增加。
3. 使用既有受控 transition procedure，把同一 control 临时推进到 `shadow_capture / epoch 5`；不改 migration id、release、startedAt 或 deadline。
4. 只运行既有 Candidate consumer 处理旧 pending。任何 quarantine、retry_wait、claimed 残留、resolution 写入或硬错误立即失败。
5. completed 必须精确等于原 outbox 总数，events 必须精确增加原 pending 数；不得删除或改写旧 source/payload。
6. 立即把同一 control 冻结回 `legacy / epoch 6`，停止 Candidate worker，关闭 Candidate flags，恢复 scanner。
7. scanner 必须重新形成 fresh 成功扫描；Git、env、Web identity、Postgres、Redis 和非目标容器必须回到基线。

## 失败与回滚

排空不是“尽量处理”。只要出现 partial、quarantine、retry、身份漂移、source 新写入、deadline 不足或 scanner 恢复失败，就不能写 PASS。自动回滚的安全目标始终是 `legacy/frozen`、Candidate worker absent、旧数据保留、Legacy authority 保持。

## 边界

本地 PASS 只证明生产排空设计和隔离演练成立，不代表生产 pending 已处理，不代表 cycle-2、Lineage、Reconciliation、Shadow Verify、Canonical Cutover、WP-G0.2 或 G0 完成。formal backtest 禁止运行。
