# 第 4 步生产部署治理报告

## 1. 本轮目标

建立生产级自运行与观测闭环，但不执行真实腾讯云部署。

## 2. 执行模式

- 安全分支：`phase4-production-observability`
- 生产部署：否
- formal 回测：否
- 数据库 / Redis / volume：未触碰
- push main：否
- 所有生产相关脚本默认 dry-run：是

## 3. GitHub Actions 治理

`.github/workflows/production.yml` 已收敛为手动触发：

- 触发方式：`workflow_dispatch`
- 默认模式：`dry_run`
- 质量门禁：typecheck / lint / test:market / build / backtest:golden / CI guards / security check
- evidence：上传 `phase4-production-observability/` artifact
- production deploy：需要 `mode=production_deploy` 且 `confirm_deploy=DEPLOY_PRODUCTION`
- 本轮真实部署：阻断，不执行 SSH / Docker / Tencent deploy

## 4. 本地部署脚本治理

`npm run production:deploy` 默认执行：

```bash
DEPLOY_MODE=dry_run bash scripts/deploy/auto-deploy.sh
```

验证结果：pass。输出部署计划，不执行真实部署。

`npm run production:rollback` 默认执行：

```bash
ROLLBACK_MODE=dry_run bash scripts/deploy/rollback.sh
```

验证结果：pass。输出回滚计划，不执行真实回滚。

## 5. 观测脚本治理

新增 `scripts/production/observability.mjs`，支持：

- `health`
- `smoke`
- `status`
- `evidence`

dry-run 验证通过。真实生产检查需要后续显式传入生产 `--base-url`，本轮未执行。

## 6. 证据包

生成：

- `phase4-production-observability/production-evidence.zip`
- `phase4-production-observability.zip`

两者均命中 `.gitignore` 的 `*.zip` 规则，默认不提交。

## 7. 结论

第 4 步生产部署治理的本地工程建设完成，可交给 GPT 做验收复查。

不能得出：

- 腾讯云已经部署成功。
- 生产 health 已真实 ready。
- 系统可支撑实战交易。
