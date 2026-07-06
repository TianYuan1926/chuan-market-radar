# Market Radar 部署授权前检查清单

本文是部署授权前的长期检查清单。它不包含任何 secret、服务器密码、API key 或数据库连接串。

## 1. 适用范围

本清单用于从安全分支进入腾讯云生产部署前的人工授权检查。

当前第 4.1 步只完成本地工程建设、dry-run、证据包自包含和 commit 对齐，不代表已经部署生产。

## 2. 授权前必须确认

- 当前分支和 commit 已被 GPT 或外部审计确认。
- 用户明确授权部署腾讯云。
- 是否合并 `main` 已被用户确认。
- GitHub Actions self-hosted runner 或服务器自拉部署方式已确认。
- GitHub Secrets 已配置，但真实值不写入代码。
- 腾讯云目标目录已确认。
- 部署前生产 HEAD 已记录。
- 部署前 `/api/health` baseline 已采集。
- rollback plan 已确认。

## 3. GitHub Secrets 名称

只允许在 GitHub Secrets 或服务器环境变量中配置真实值，代码和文档中只能出现名称：

- `TENCENT_HOST`
- `TENCENT_USER`
- `TENCENT_SSH_KEY`
- `TENCENT_PROJECT_DIR`
- `CRON_SECRET`
- `DATABASE_URL`
- `COINGLASS_API_KEY`

## 4. 部署后必须验证

- `docker compose ps`
- `/api/health`
- `/api/frontend/radar-contract`
- `/api/radar/backend-contract`
- `npm run production:smoke`
- worker heartbeat
- Redis 状态
- Postgres 状态

## 5. 禁止项

- 未授权不得 push main。
- 未授权不得部署腾讯云。
- 未授权不得运行 migration。
- 未授权不得清 Redis、Postgres 或 reports volume。
- 未授权不得运行 `npm run backtest:formal`。
- 未通过生产 evidence 验收前不得进入 shadow tracking。

## 6. 失败处理

任何 health、API、smoke、worker、Redis、Postgres 失败，都必须阻断发布结论并进入 rollback。不得把 partial 写成 pass。

