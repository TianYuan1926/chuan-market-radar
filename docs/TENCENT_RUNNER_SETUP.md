# 腾讯云 GitHub Runner 设置说明

本文件只说明人工安装步骤，不包含 token、密钥或服务器密码。

## 目标

让 GitHub main 通过 quality gate 后，可触发腾讯云生产服务器自动同步、构建、验证和证据采集。

## 前置条件

- 腾讯云服务器可 SSH 登录。
- 服务器已有 Docker / Docker Compose。
- 项目目录存在，例如 `/home/ubuntu/apps/chuan-market-radar`。
- GitHub Actions secrets 已人工配置，不写入仓库。

## 必需 Secrets

- `TENCENT_HOST=[REDACTED]`
- `TENCENT_USER=[REDACTED]`
- `TENCENT_PORT=[REDACTED]`
- `TENCENT_APP_DIR=[REDACTED]`
- `TENCENT_SSH_KEY=[REDACTED]`
- `PRODUCTION_BASE_URL=[REDACTED]`

## 安装边界

- Codex 不自动安装 runner。
- runner token 不写入代码或文档。
- `.env.production` 不进入 Git。
- 如果 GitHub main 和服务器 HEAD 不一致，部署脚本必须先对齐 HEAD。
