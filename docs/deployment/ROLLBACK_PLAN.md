# Production Rollback Plan

本计划只描述 Market Radar 的生产回滚步骤，不允许自动动数据库、Redis 或 volume。

## 默认行为

`npm run production:rollback` 默认 dry-run，只输出当前 HEAD 和目标，不执行真实回滚。

```bash
npm run production:rollback
```

真实回滚必须显式确认：

```bash
ROLLBACK_MODE=production_rollback CONFIRM_ROLLBACK=true ROLLBACK_TO=<commit> npm run production:rollback:manual
```

## 回滚前检查

1. 确认当前生产故障来自代码部署，而不是数据源、CoinGlass 限速、Redis/Postgres 短暂抖动。
2. 确认 `ROLLBACK_TO` 是已知可运行版本。
3. 确认本轮不需要 migration。
4. 确认不删除 Postgres / Redis / reports volume。
5. 先采集故障证据，再回滚。

## 回滚后验证

回滚完成后必须运行：

```bash
npm run production:health -- --base-url <production-url>
npm run production:smoke -- --base-url <production-url>
npm run production:evidence -- --base-url <production-url>
```

必须确认：

- `/api/health` 可访问。
- 数据源状态没有被写成假 ready。
- `WAIT / WATCH / CANDIDATE` 没有被包装成 `TRADE_PLAN_READY`。
- 非 live K 线不显示 ready trade plan overlay。

## 失败处理

如果回滚后仍失败：

1. 停止继续反复部署。
2. 保留当前证据包。
3. 报告当前 HEAD、回滚目标、失败 API、Docker 状态。
4. 不清库、不删 volume。
