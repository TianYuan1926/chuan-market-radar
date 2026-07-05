# Market Radar 自动化部署与观测规则

本文是生产部署、验证、回滚和证据采集的执行说明。

## 1. 目标链路

```text
GitHub main
-> GitHub Actions 自动测试
-> 腾讯云服务器自动同步
-> Docker Compose 重建
-> 生产验证
-> 失败自动回滚
-> 生成生产证据包
-> 上传 GitHub Artifact
```

## 2. CI/CD 入口

GitHub workflow：

```text
.github/workflows/production.yml
```

执行内容：

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run security:check`
- 远程执行 `scripts/deploy/auto-deploy.sh`
- 下载并上传生产证据包

## 3. 服务器脚本

自动部署：

```text
scripts/deploy/auto-deploy.sh
```

功能：

- 记录上一版本 HEAD。
- `git fetch / checkout / pull --ff-only`。
- `docker compose up -d --build --remove-orphans`。
- 执行生产验证。
- 失败时调用回滚。
- 成功时生成生产证据包。

自动回滚：

```text
scripts/deploy/rollback.sh
```

功能：

- 回到 `ROLLBACK_TO` 或 `.deploy-state/previous-head`。
- 重建 Docker 服务。
- 运行生产验证。

生产验证：

```text
scripts/verify/production-check.sh
```

验证：

- `/api/health`
- `/api/frontend/radar-contract`
- `/api/radar/backend-contract`
- `/api/radar/business-capability`
- scan freshness
- Postgres
- Redis
- worker 服务状态

生产证据：

```text
scripts/audit/collect-production-facts.sh
```

输出：

- deployment summary
- git status / git log
- health snapshot
- radar contract snapshot
- backend contract snapshot
- business capability snapshot
- review contract snapshot
- docker compose ps
- worker logs tail
- Postgres readiness
- Redis readiness
- scan status summary

输出目录：

```text
reports/production-facts/<timestamp>
reports/production-facts/production-facts-<timestamp>.tar.gz
```

## 4. 安全边界

默认不做：

- 不打印 `.env.production`。
- 不输出真实密钥。
- 不导出数据库真实数据。
- 不删除 Postgres volume。
- 不删除 Redis volume。
- 不删除 reports volume。
- 不自动运行 migration。

安全检查：

```text
scripts/verify/security-check.sh
```

会阻断：

- 真实 `.env` 被 Git 跟踪。
- audit/log/zip/build 产物被 Git 跟踪。
- 明显真实 secret 值进入源码。

## 5. GitHub Secrets

GitHub Actions 自动部署需要以下 secrets：

```text
TENCENT_HOST
TENCENT_USER
TENCENT_PORT
TENCENT_APP_DIR
TENCENT_SSH_KEY
PRODUCTION_BASE_URL
```

其中 `TENCENT_PORT` 和 `TENCENT_APP_DIR` 可用默认值，但建议显式配置。

## 6. 成功标准

部署不能只看容器启动。必须同时满足：

- CI 基础门禁通过。
- 服务器 HEAD 等于 GitHub main。
- Docker 服务启动。
- `/api/health` ready。
- scan freshness fresh。
- Postgres ready。
- Redis ready。
- worker 可观测。
- 生产证据包生成并上传。

失败时必须自动回滚上一版本。
