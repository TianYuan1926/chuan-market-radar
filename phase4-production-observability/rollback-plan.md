# 第 4 步回滚计划摘要

本文件是 phase4 证据包内的回滚摘要。详细 runbook 见 `docs/deployment/ROLLBACK_PLAN.md`。

## 当前约束

- 本轮没有真实部署腾讯云。
- 本轮没有执行真实回滚。
- 本轮没有运行 migration。
- 本轮没有清理或重建 Postgres / Redis / reports volume。

## 默认行为

```bash
npm run production:rollback
```

默认只做 dry-run，不切换 Git HEAD，不重启容器。

## 真实回滚触发条件

只有用户明确授权后，才允许执行真实回滚。真实回滚必须满足：

1. 已记录当前生产 commit。
2. 已指定 `ROLLBACK_TO=<previous_commit>`。
3. 已确认数据库 schema 未发生不可逆变更。
4. 已确认 Redis / volume 不需要删除。
5. 已准备回滚后 health / smoke 验证。

真实命令形态：

```bash
ROLLBACK_MODE=production_rollback CONFIRM_ROLLBACK=true ROLLBACK_TO=<previous_commit> npm run production:rollback:manual
```

## 必须回滚的情况

- 部署后 `/api/health` failed 或非 ready。
- `production:smoke` 发现 P0。
- Web 容器无法启动。
- READY / WAIT / overlay 语义出现生产误导。

## 只阻断部署、不回滚的情况

- quality gate 失败。
- dry-run evidence 失败。
- secret guard 失败。
- forbidden files guard 失败。
- 未获得用户明确生产授权。
