# 生产部署 Runbook

## 当前标准流程

```text
本地修改
-> 本地测试
-> commit 到安全分支
-> push 安全分支
-> GPT / 用户验收
-> 用户明确授权
-> 合并 main
-> 腾讯云服务器自拉 main
-> Docker Compose 构建/重启
-> production smoke / evidence
```

## 本轮禁止

第 4.2 部署授权审查阶段不部署、不跑 formal、不动数据库、Redis 或 volume。

## 分支规则

- `main` 是代码正本；推送前必须确认本轮已经允许生产发布。
- 整改验收、安全审查、证据包生成只能在安全分支或本地完成。
- 当前 `.github/workflows/production.yml` 不监听 `push main` 自动部署；真实腾讯云部署仍必须单独授权。

## 手工部署命令

本轮不执行。授权后推荐在服务器生产目录执行：

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main
docker compose --env-file .env.production config
docker compose --env-file .env.production up -d --build --remove-orphans
npm run production:health -- --base-url http://127.0.0.1
npm run production:smoke -- --base-url http://127.0.0.1
npm run production:evidence -- --base-url http://127.0.0.1
```

如果使用 `npm run production:deploy:manual`，必须先确认 `DEPLOY_MODE=production_deploy CONFIRM_DEPLOY=true` 是用户明确授权动作。

## 验证入口

- Caddy local: `http://127.0.0.1/api/health`
- web container: 容器内部 `http://127.0.0.1:3000/api/health`
- public: 使用 `BASE_URL`

宿主机 `127.0.0.1:3000` 不是唯一事实源。

## 回滚

```bash
ROLLBACK_TO=<previous-head> bash scripts/deploy/rollback.sh
```

回滚不删除 Postgres / Redis / reports volume。

## 第 4.2 结论边界

部署准备完成不等于部署完成。生产 smoke/evidence 通过之前，不能进入 shadow tracking，不能写成系统支撑实战交易。
