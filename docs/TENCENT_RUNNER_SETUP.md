# 腾讯云 GitHub Runner 设置说明

本文件只说明人工安装步骤，不包含 token、密钥或服务器密码。

## 目标

说明腾讯云 self-hosted runner 的人工准备边界。第 4.2 阶段不安装 runner，不部署腾讯云，只判断是否具备请求用户授权真实部署的条件。

## 前置条件

- 腾讯云服务器可 SSH 登录。
- 服务器已有 Docker / Docker Compose。
- 项目目录存在，例如 `/home/ubuntu/apps/chuan-market-radar`。
- GitHub Actions secrets 已人工配置，不写入仓库。

## 必需 Secret 名称

只列名称，不写值。真实值只能放在 GitHub Secrets 或腾讯云服务器本地环境中。

- `TENCENT_HOST=[REDACTED]`
- `TENCENT_USER=[REDACTED]`
- `TENCENT_PORT=[REDACTED]`
- `TENCENT_APP_DIR=[REDACTED]`
- `TENCENT_SSH_KEY=[REDACTED]`
- `PRODUCTION_BASE_URL=[REDACTED]`

项目中历史文档曾出现 `TENCENT_PROJECT_DIR`。第 4.2 起统一推荐使用 `TENCENT_APP_DIR`。如果后续脚本需要兼容旧名，必须在部署任务书里单独说明。

生产运行 secret 建议只保留在腾讯云 `.env.production`，不作为 GitHub-hosted runner 默认 secret：

- `CRON_SECRET=[REDACTED]`
- `COINGLASS_API_KEY=[REDACTED]`
- `POSTGRES_DB=[REDACTED]`
- `POSTGRES_USER=[REDACTED]`
- `POSTGRES_PASSWORD=[REDACTED]`
- `CHUAN_SESSION_SECRET=[REDACTED]`
- `CHUAN_SESSION_PASSWORD=[REDACTED]`

## 安装边界

- Codex 不自动安装 runner。
- runner token 不写入代码或文档。
- `.env.production` 不进入 Git。
- 如果 GitHub main 和服务器 HEAD 不一致，部署脚本必须先对齐 HEAD。

## 权限边界

- runner 只绑定本仓库，不做组织级共享 runner。
- runner 系统用户只允许访问项目目录、Docker Compose 和必要日志。
- Docker 权限等同生产管理员权限，不能让任意 PR 或未审计分支跑在生产 runner 上。
- GitHub Actions token 默认保持 `contents: read`。
- 真实部署 job 必须加人工审批或等价确认。
- migration、清库、删 volume、formal 回测必须单独授权，不能放入默认部署 job。
- runner 日志不得打印 secret、`.env.production`、数据库连接串或 API key。

## 当前推荐

第 4.2 阶段首选“用户授权后服务器自拉 main + Docker Compose + production evidence”。self-hosted runner 作为后续自动化目标，不作为本轮真实部署前置条件。
