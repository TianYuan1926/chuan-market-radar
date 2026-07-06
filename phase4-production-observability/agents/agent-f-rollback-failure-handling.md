# Agent F：Rollback / Failure Handling

## 结论

PASS。

## 本轮改动

- `scripts/deploy/rollback.sh` 默认改为 dry-run。
- 新增 `docs/deployment/ROLLBACK_PLAN.md`。
- `scripts/deploy/auto-deploy.sh` 保留失败回滚逻辑，但真实部署必须显式授权。

## 回滚门禁

真实回滚必须显式设置：

```bash
ROLLBACK_MODE=production_rollback CONFIRM_ROLLBACK=true
```

否则只输出 dry-run 信息，不切 Git、不重启容器。

## 禁止项

- 不自动真实回滚生产。
- 不动数据库。
- 不删除 Redis 数据。
- 不删除 reports volume。

## 风险

回滚验证必须后续在真实生产部署轮执行；本轮只证明脚本默认不会误执行。
