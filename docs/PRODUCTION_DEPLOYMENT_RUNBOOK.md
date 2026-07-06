# 生产部署 Runbook

## 标准流程

```text
本地修改
-> 本地测试
-> commit
-> push GitHub main
-> GitHub Actions quality gate
-> 腾讯云 git pull --ff-only
-> docker compose up -d --build
-> production-check
-> collect-production-facts
```

## 本轮禁止

P1 系统收敛整改阶段不部署、不跑 formal、不动数据库。

## 分支规则

- `main` 是生产部署入口；推送前必须确认本轮已经允许生产发布。
- 整改验收、安全审查、证据包生成只能在安全分支或本地完成。
- 如果 `.github/workflows/production.yml` 保持 main push 触发生产部署，不得把未验收整改直接推到 main。

## 手工部署命令

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main
bash scripts/deploy/auto-deploy.sh
```

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
