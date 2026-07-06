# Agent C：Production Health / Smoke / Status 脚本

## 结论

PASS。

## 新增脚本

- `scripts/production/observability.mjs`

## 新增 package scripts

- `npm run production:health`
- `npm run production:smoke`
- `npm run production:status`
- `npm run production:evidence`

## dry-run 能力

以下命令已可运行：

```bash
npm run production:health -- --dry-run
npm run production:smoke -- --dry-run
npm run production:status -- --dry-run
npm run production:evidence -- --dry-run
```

dry-run 不访问生产、不部署、不写数据库，只验证脚本输出结构、守卫规则和证据包生成能力。

## 输出文件

- `system-status.json`
- `production-health.json`
- `production-smoke.json`
- `production-scan.json`
- `production-worker-status.json`
- `production-data-source-status.json`
- `production-decision-contract-status.json`
- `production-ui-risk-status.json`

## 风险

真实生产检查必须在后续部署/验收轮使用 `--base-url` 单独运行，不能把 dry-run 写成生产健康通过。
