# 川 Market Radar 单机部署迁移方案

本文档用于把当前项目从 Vercel + Neon 迁移为腾讯云香港单机部署。

## 目标架构

```text
Tencent Cloud Lighthouse / CVM
├── caddy                 # 反向代理；无域名时先 HTTP，有域名后自动 HTTPS
├── web                   # Next.js 前端 + API
├── postgres              # 本机 PostgreSQL
├── redis                 # 本机 Redis，先用于部署基础，后续接缓存/锁/队列
├── scanner-worker        # 定时触发 POST /api/scan
├── websocket-light-worker# 连接 public ticker WebSocket，写入 Redis 轻扫快照
├── coinglass-worker      # 定时触发每日异动和 K 线缓存任务
├── signal-worker         # 定时触发 outcome executor 和 v3 forward-map review
├── dynamic-scan-scheduler# 健康状态巡检；后续升级为 Redis 队列调度器
└── macro-worker          # 定时写入 BTC.D / TOTAL2 / TOTAL3 宏观快照
```

## 当前服务器信息

```text
公网 IP：43.161.202.227
登录用户：ubuntu
系统：Ubuntu 24.04
SSH 端口：22
安全组：22 / 80 / 443 已放行
域名：暂无，先用 http://43.161.202.227
```

## 安全边界

- 不把服务器密码、CoinGlass API key、数据库密码、CRON_SECRET 写入仓库。
- `.env.production` 只保存在服务器，不能提交。
- `.env.example` 只保留占位符。
- 不添加自动下单。
- 不连接交易所下单 API。
- Vercel / Neon 配置先保留，新服务器完整验收前不删除旧回滚路径。

## 第 1 步：服务器安装 Docker

在腾讯云 OrcaTerm 或本机 SSH 登录服务器后执行：

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
```

如果代码已经在服务器上，进入项目目录后可以直接运行：

```bash
bash deploy/scripts/install-docker-ubuntu.sh
```

安装完成后重新登录一次 SSH，让 docker 用户组生效，然后验证：

```bash
docker --version
docker compose version
```

## 第 2 步：上传或拉取项目

推荐用 GitHub 拉取：

```bash
mkdir -p ~/apps
cd ~/apps
git clone <YOUR_GITHUB_REPO_URL> chuan-market-radar
cd chuan-market-radar
```

如果暂时不想在服务器配置 GitHub，也可以从本机打包上传。无论哪种方式，服务器项目目录最终应为：

```text
~/apps/chuan-market-radar
```

## 第 3 步：创建生产环境变量

在服务器项目目录执行：

```bash
cp .env.example .env.production
nano .env.production
```

必须修改这些值：

```env
CRON_SECRET=CHANGE_ME_LONG_RANDOM_SECRET
POSTGRES_PASSWORD=CHANGE_ME_POSTGRES_PASSWORD
DATABASE_URL=postgresql://chuan_radar:CHANGE_ME_POSTGRES_PASSWORD@postgres:5432/chuan_market_radar
COINGLASS_API_KEY=CHANGE_ME_COINGLASS_API_KEY
```

无域名阶段保持：

```env
CHUAN_PUBLIC_HOST=:80
```

有域名后改成：

```env
CHUAN_PUBLIC_HOST=你的域名
```

然后 Caddy 会自动申请 HTTPS 证书。

## 第 4 步：检查 Docker Compose 配置

```bash
docker compose --env-file .env.production config
```

能完整输出配置且没有报错，才继续。

## 第 5 步：启动数据库和应用

```bash
docker compose --env-file .env.production up -d --build
```

查看容器状态：

```bash
docker compose --env-file .env.production ps
```

查看日志：

```bash
docker compose --env-file .env.production logs -f web
docker compose --env-file .env.production logs -f scanner-worker
docker compose --env-file .env.production logs -f websocket-light-worker
docker compose --env-file .env.production logs -f coinglass-worker
docker compose --env-file .env.production logs -f macro-worker
docker compose --env-file .env.production logs -f signal-worker
docker compose --env-file .env.production logs -f dynamic-scan-scheduler
```

## 第 6 步：验证 PostgreSQL 和 Redis

```bash
docker compose --env-file .env.production exec postgres pg_isready -U chuan_radar -d chuan_market_radar
docker compose --env-file .env.production exec redis redis-cli ping
```

预期：

```text
accepting connections
PONG
```

## 第 7 步：执行数据库迁移

```bash
set -a
source .env.production
set +a

curl --fail --show-error --silent \
  -X POST http://127.0.0.1/api/admin/persistence/migrate \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
```

预期返回：

```json
{"ok":true}
```

并包含表名：

```text
journal_events
scan_archives
v3_forward_map_snapshots
rank_profiles
daily_mover_snapshots
daily_mover_assets
mover_attribution_reviews
radar_miss_reviews
ohlcv_candle_cache
scan_asset_states
macro_market_snapshots
frontend_ui_states
```

## 第 8 步：运行验收

如果是在本机直接部署腾讯云生产，优先使用：

```bash
npm run production:ssh-check
npm run production:deploy
```

如果只是检查公网页面和 API 合同：

```bash
npm run production:smoke
```

这三个命令默认使用：

```text
PROD_HOST=43.161.202.227
PROD_USER=ubuntu
APP_DIR=/home/ubuntu/apps/chuan-market-radar
BASE_URL=http://43.161.202.227
```

如需覆盖：

```bash
PROD_HOST=<公网 IP> PROD_USER=ubuntu npm run production:ssh-check
PROD_HOST=<公网 IP> BASE_URL=http://<公网 IP> npm run production:deploy
```

如果 SSH 不通，不要继续用 OrcaTerm 手工部署当常态；先修 SSH 网络/密钥/防火墙，再恢复自动部署链路。

登录服务器后，可运行服务器内验收：

```bash
bash deploy/scripts/production-verify.sh
```

完整生产验收使用：

```bash
bash deploy/scripts/production-full-verify.sh
```

只读观察当前运行状态：

```bash
bash deploy/scripts/production-observe.sh
```

如果只想做公开 HTTP smoke test：

```bash
bash deploy/scripts/smoke-test.sh http://127.0.0.1
bash deploy/scripts/prod-smoke.sh http://43.161.202.227
```

浏览器打开：

```text
http://43.161.202.227
```

重点检查：

- 首页能打开。
- `/api/health` 返回 `ok: true`。
- `/api/health.health.scanStability` 显示扫描稳定性。
- `/api/health.health.reviewStatistics` 显示复盘样本状态。
- `/api/frontend/radar-contract` 返回 scanProof、apiUsage、dataSources、fundFlow、scanStability。
- `/api/frontend/review-contract` 返回 reviewStats 和 aiReviewStats。
- `/api/frontend/live-events/stream` 是只读 SSE 事件流，不触发扫描。

## 数据库备份和恢复

备份 PostgreSQL：

```bash
bash deploy/scripts/backup-postgres.sh
```

恢复 PostgreSQL 前必须确认目标环境和备份文件。恢复命令需要显式确认，避免误覆盖：

```bash
CONFIRM_RESTORE=yes bash deploy/scripts/restore-postgres.sh deploy/backups/<backup-file>.dump
```

恢复后重新运行：

```bash
bash deploy/scripts/production-full-verify.sh
```
- `health.persistence.mode` 是 `database`。
- `health.persistence.databaseDriver` 是 `postgres`。
- `health.dataSource.activeSource` 是 `coinglass`。
- `/api/archive` 能返回扫描归档。
- scanner-worker 日志有 `task-ok`。
- websocket-light-worker 日志有 `snapshot-written`，Redis 里能读到 `chuan:ws-light-scan:snapshot`。
- macro-worker 日志有 `macro-market-ingest task-ok`，`/api/health` 的 `macroMarket.status` 是 `ready` 或可解释的 `empty/stale/unavailable`。
- coinglass-worker / signal-worker / macro-worker 没有无限重启。

## 常用运维命令

重启全部服务：

```bash
docker compose --env-file .env.production restart
```

重启单个服务：

```bash
docker compose --env-file .env.production restart web
docker compose --env-file .env.production restart scanner-worker
docker compose --env-file .env.production restart websocket-light-worker
docker compose --env-file .env.production restart macro-worker
```

停止服务：

```bash
docker compose --env-file .env.production down
```

更新代码后重新构建：

```bash
git pull
docker compose --env-file .env.production up -d --build
```

标准生产发布不要手工复制上述两行，优先从本机运行：

```bash
npm run production:deploy
```

查看资源：

```bash
docker stats
df -h
free -h
```

备份 PostgreSQL：

```bash
bash deploy/scripts/backup-postgres.sh
```

备份文件位置：

```text
backups/postgres/
```

## 回滚方案

新服务器未完全验收前：

- 不删除 Vercel 项目。
- 不删除 Neon 数据库。
- 不删除 GitHub Actions workflow。
- DNS 不切换到新服务器。

如果新服务器异常：

```bash
docker compose --env-file .env.production down
```

继续使用原 Vercel/Neon 版本，等问题修复后再迁移。

## 后续增强顺序

1. Redis 接入任务队列，把 dynamic-scan-scheduler 从健康巡检升级为统一调度器。
2. 将 scanner-worker 从“调用 API”逐步升级为“直接运行扫描库函数”。
3. 增加日志轮转和远程备份。
4. 有域名后启用 Caddy 自动 HTTPS。
5. 等单机稳定后，再评估是否需要独立 TencentDB；当前阶段不需要。
