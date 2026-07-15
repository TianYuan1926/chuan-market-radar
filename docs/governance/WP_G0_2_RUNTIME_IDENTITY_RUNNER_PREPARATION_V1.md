# WP-G0.2 Runtime Identity Production Runner 准入合同

当前 8 文件 artifact SHA-256 为 `d471bd5a7c0c062715946b07359ccf0777ee998d826d2161572875f101cdbd49`。旧 checksum `3d58b9ed889713322703aea7d18118bf2b2c1059417af4e86634a7ef7f28ba0b` 及更早值只保留为历史事实，不得再用于后续身份审批。

## 1. 本包目标

为 Dormant production PASS 之后的 Runtime Identity and Permission 建立默认 dry-run、精确 detached production target、身份安全 Compose、最小变更和自动回滚 runner。本包只准备和隔离演练 runner，不连接或修改生产。

## 2. 生产前置条件

执行必须同时满足：

- Dormant Runtime Deploy 已达到 `PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION`；最新续证完成 1800 秒、61 样本、continuous ready/fresh、Candidate dormant/worker absent，摘要 SHA-256 为 `b76413fc317cd70511207e1a6dfb1280ccc7943331d06987320c8715fb070077`。原摘要 `2ced16ca970c61e889eb966d5c32e8276f88d2f61d093ae9ab01c58f1330fc0c` 只作为 lineage 保留。
- Dormant evidence 不超过 24 小时；超过后必须重新做动态只读预检，不得沿用旧状态。
- runner source commit 与 production commit 分开绑定；production 必须为 clean detached `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，不得要求或 checkout GitHub main。
- 新的独立审批窗口不超过 90 分钟。
- `.env`、`.env.production`、production Compose、Dormant evidence、identity wrapper 和 identity override 均须与审批 SHA-256 完全一致。
- identity wrapper 必须为 root-owned `0700`，override 必须为 root-owned `0600`；部署、回滚和最终 `production-check` 复用同一 wrapper。
- 三个 Candidate LOGIN 均不存在，writer role 对 `scan_archives` 尚无权限。
- Candidate schema ledger=9、control rows=0。
- 常态四个 secure 文件位于仓库外且 group/other 权限为 0；如 runner 生成续证摘要，只能先复制为 `SECURE_ROOT` 内 `0600` 临时桥接文件，再由只读挂载的隔离 Node 校验，校验后立即删除。
- Candidate Flag 全 false、release disabled、worker expected=false、三个 Candidate URL 为空。

## 3. 唯一允许的变更

```text
创建 3 个 LOGIN NOINHERIT
-> 每个只 GRANT 1 个固定能力角色
-> writer 对 scan_archives 仅 SELECT/INSERT
-> .env.production 只写 3 个 Candidate URL
-> 只 force-recreate web，不 build、不启动 Candidate worker
```

禁止 migration、schema DDL、业务表 DML、Flag、release、worker、control lifecycle、backfill、dual read 和 read cutover。

## 4. Secret 边界

审批 request 和 evidence 不含 secret。当前 PostgreSQL 管理凭据只能来自合同锁定的 identity-remediation `secrets/postgres-admin.env`，该文件必须为 root-owned `0600` 普通文件；Postgres 容器初始化环境中的密码不得作为当前网络认证凭据。credentials、role-admin URL 和 Dormant PASS evidence 位于 `SECURE_ROOT`，文件必须是 0600 或更严格。仓库外 evidence 目录不直接暴露给通用隔离运行时；续证摘要通过 `SECURE_ROOT` 的 `0600` 临时副本校验后删除。口令只允许 32-128 位 base64url 字符，runner 不打印 login、password 或 URL；证据只包含计数、布尔值和状态。

## 5. 自动回滚

任一 provision、env 切换、Web recreate、身份连接、dormant API 或 identity-safe 生产检查失败时：

1. 恢复原 `.env.production`。
2. 恢复旧 Web 镜像并只 recreate `web`。
3. 确认新 LOGIN 不拥有对象后，撤销三个 membership 并 DROP 三个 LOGIN。
4. 撤销 writer 的 `scan_archives` 权限。

前置要求 LOGIN 不存在，因此不需要猜测或覆盖旧密码。存在任一同名 LOGIN 时 runner 必须在 mutation 前停止。

## 6. 验收边界

即时检查通过只能写：

```text
PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION
```

之后仍需只读角色/权限复核和 30-60 分钟观察，三部分全部通过才可写 `PASS_RUNTIME_IDENTITY_AND_PERMISSION`。Activation 仍需新的独立审批。

本地准入状态只能写：

```text
PASS_LOCAL_RUNTIME_IDENTITY_NODE_RUNTIME_COMPATIBILITY_REMEDIATION
```

它证明 runner、回滚和当前 release 合同可进入精确生产授权准备，并证明 Web 身份探针已使用 CommonJS 可解析的 async IIFE 且由直接 `node --check` 回归保护；不证明生产角色或 URL 已配置。生产运输、外部授权、lease/fencing 和 transient systemd 入口另由 `wp-g0-2-runtime-identity-production-execution.v1.json` 约束；两份合同必须同时 PASS。
