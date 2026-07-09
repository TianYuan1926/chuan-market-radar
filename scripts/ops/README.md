# Market Radar Ops Network Checks

这些脚本只服务本机运维验证，不属于 Market Radar 业务运行链路。

## 边界

- 不读取 `.env` 或 `.env.production`。
- 不连接数据库。
- 不写业务数据。
- 不修改 Redis / Postgres / Docker volume。
- 不修改 macOS 系统代理或 DNS。
- 不修改 SSH / Codex 配置。
- 不向 scan / analysis / strategy / unifiedDecision / Shadow Runner 注入代理逻辑。

## 命令

```bash
npm run ops:network-check
npm run ops:node-fetch-check
npm run ops:local-env-check
```

默认不启用代理。需要代理时显式传入：

```bash
OPS_PROXY_URL=http://127.0.0.1:7892 npm run ops:network-check
OPS_PROXY_URL=socks5://127.0.0.1:7892 npm run ops:network-check
OPS_PROXY_URL=socks5://127.0.0.1:7892 npm run ops:node-fetch-check
OPS_PROXY_URL=socks5://127.0.0.1:7892 npm run ops:local-env-check
```

## Node fetch 说明

当前项目没有 checked-in proxy agent 依赖。为了避免新增重量级依赖，`ops:node-fetch-check` 的直连部分使用 Node 原生 `fetch`，代理部分使用 `curlFallback`。这只用于本机诊断，不影响生产运行。
