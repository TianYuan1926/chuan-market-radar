# WP-G0.2 Shadow Capture 本地工程合同

## 1. 本轮结论

本轮只把 `shadow_capture` 的工程边界变成可机器校验的合同，不连接生产、不写生产数据库、不启用 Candidate Feature Flag。

当前结论固定为：

```text
本地设计：PASS_LOCAL_DESIGN
生产决定：BLOCKED_NOT_AUTHORIZED
系统状态：可运行但不完整 / 不能支撑实战
```

## 2. 大白话说明

旧系统仍然负责真实写入和真实读取。新 CandidateEpisode 只能像旁路记录员一样，读取“旧事务已经提交”的 Outbox，再把同一事实投影到新表。旁路失败不能影响旧系统，也不能改榜单、分析、策略、READY、RR 或前端显示。

Feature Flag 不是授权书。真正的写入权威只能由 PostgreSQL 的 `candidate_migration_control.phase + epoch` 决定，环境变量最多只能再关掉能力，不能单独打开能力。

## 3. 当前已经具备的防线

- Candidate schema 已在生产完成只读复核，但保持 dormant。
- Outbox 有 scope、幂等键、payload SHA-256、租约、fencing token 和 authority epoch。
- 同一幂等键不同 payload hash 必须硬停。
- 旧 fencing token、过期租约和错误 epoch 必须拒绝。
- 双投影总窗口最多 72 小时，T0 不允许重置；后续切换仍需 24 小时干净窗口和至少 10,000 次比较写入。
- 当前生产 Candidate 五个开关全部关闭，生产 API/worker 未接入 `CandidateOutboxService`。

## 4. 当前真实缺口

1. 旧系统写入事务尚未在同一 PostgreSQL connection transaction 内创建 Candidate Outbox。
2. Outbox 有 `attempt_count`，但数据库没有 `failed/quarantined` 终态或 `max_attempts` 约束；目前不能证明失败任务会在达到上限后被可靠隔离。
3. 生产 worker 尚未接入 Outbox consumer，这是正确的 dormant 状态，不得把“服务类存在”说成“生产写入已实现”。
4. 尚未在隔离 PostgreSQL 16 环境完成原子性、重复消费、哈希冲突、租约过期、旧 fencing、重试耗尽、停止和恢复演练。
5. 用户尚未对未来的 production shadow_capture 发出新的、限定范围和时效的批准。

因此，当前不能直接申请打开生产 shadow writer。

## 5. 下一包唯一任务

`WP-G0.2-SHADOW-CAPTURE-LOCAL-IMPLEMENTATION-AND-POSTGRES-REHEARSAL`

只允许在本地完成：

- 在被选定的旧权威写事务内原子插入 Outbox；不得把 `journal_events` 或 `scan_asset_states` 粗暴当成完整 Episode 真值。
- 增加数据库可证明的重试耗尽隔离语义，失败项必须阻断 phase advance。
- 实现未接生产入口的 consumer composition root、结构化错误分类、脱敏指标和停机开关。
- 在隔离 PostgreSQL 16 跑并发、崩溃恢复、重复消费、hash 冲突、stale fence、deadline 和重试耗尽测试。
- 仍保持生产开关全关，不部署、不 backfill、不 dual read、不 read cutover。

上述本地实现和演练全部通过后，才能形成一份新的 production shadow_capture 审批包。

## 6. 运行验证

```bash
npm run candidate:shadow-capture:validate
npm run test:candidate-shadow-capture
```

校验器成功只代表“合同没有被削弱且真实缺口被诚实识别”，绝不代表生产获准。
