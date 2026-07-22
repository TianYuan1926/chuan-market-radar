# Market Radar 生产固定执行通道 V1

## 1. 目的

当前生产操作的主要耗时来自浏览器、OrcaTerm、短期会话、人工上传和前台启动，不是腾讯服务器算力。这个通道把正常发布改成：

```text
本地完整门禁
-> 生成脱敏 Bundle 与精确外部授权
-> Ed25519 私钥签名
-> 推送专用 production-dispatch Git ref
-> 腾讯服务器每 20 秒主动拉取
-> 验签、时效、提交、哈希、WIP 与路径检查
-> 启动现有 transient systemd package runner
-> package runner 执行 lease/fencing、变更、验证、回滚和证据
```

OrcaTerm 从日常运输通道降级为：首次安装、云平台 MFA、secret rotation 和紧急救援入口。

## 2. 当前真实状态

截至 2026-07-22：

- 固定执行通道代码、本地签名链和隔离 Git 端到端测试已实现。
- 尚未安装到腾讯生产服务器，所以当前不能声称已经消除 OrcaTerm。
- 当前 P0R 使用 7200 秒腾讯 STS 和 `/dev/shm` 临时凭证，仍属于云平台凭证例外；V1 通道禁止运输 secret，也不伪装成能够绕过腾讯 MFA。
- 安装完成后，普通无 secret 的生产 Bundle 不再需要浏览器逐文件上传和前台保持连接。
- 旧包若仍声明 `approved_orcaterm_bundle_upload`，固定通道会拒绝；只有合同和 request 明确声明 `signed_git_bundle` 的新包才可进入，禁止运输事实与报告不一致。

## 3. 安全模型

### 3.1 信任边界

- 私钥：仅在本机 `$HOME/.local/share/market-radar-production-dispatch/`，权限 `0600`。
- 公钥：生产 `/opt/market-radar-production-dispatch/dispatch-public.pem`，只用于验签。
- 运输：私有 Git 专用 ref，不保存 `.env`、数据库 URL、Token、COS STS、SSH key 或业务数据。
- 生产 Git：agent 使用独立 bare mirror，不修改应用 worktree 的 HEAD、index 或 tracked files。
- 生产互斥：发现仓库外 production lease 仍 active 时只返回 `DEFERRED_PRODUCTION_WIP_ACTIVE`；租约文件存在但格式、时间或路径不可信时返回 `DEFERRED_PRODUCTION_LEASE_UNCERTAIN`，不得当成空闲。
- 一次性：claim 在 entrypoint 启动前同步到文件和目录；单个结构损坏任务只会被隔离、记失败并推进 cursor，不执行，也不永久堵住后续队列。
- 运行沙箱：agent 与 entrypoint 启动的 Node 子进程使用 `--jitless` 配合 `MemoryDenyWriteExecute`，entrypoint 的 cwd 固定为 staging 根目录。
- 运行时：生产主机无需预装 Node。安装器只从 Node.js 官方 HTTPS 地址下载固定 `v24.18.0` Linux x64 归档，在任何 install mutation 前核对官方归档 SHA-256、解包后二进制 SHA-256、许可证 SHA-256、`x86_64` 和版本；只安装独立 binary/license，不安装 npm，不改全局 PATH。

### 3.2 强制拒绝

以下任一情况在启动前拒绝：

1. Envelope 字段多一个或少一个。
2. Ed25519 签名错误。
3. 任务不在 90 分钟窗口内。
4. Bundle、approval request 或 entrypoint SHA-256 不匹配。
5. target commit 不可从批准的 source ref 到达。
6. Git dispatch history 不是 fast-forward，或同时积压超过一个任务。
7. staging 越界、已存在、是符号链接，或 tar 存在穿越、重复、特殊文件。
8. Bundle 出现 `.env`、私钥、credential/secret 文件或可识别的真实敏感值。
9. entrypoint 不属于固定 `scripts/production/**/production-entrypoint.sh`、`scripts/production/*-entrypoint.sh` 或 `scripts/v2/production/*-entrypoint.sh` 形态。
10. 请求试图携带 arbitrary command、执行两次、取消回滚、取消 session-independent execution 或放宽 production WIP=1。

## 4. 一次性安装

### 4.1 本机生成签名密钥

```bash
install -d -m 700 "$HOME/.local/share/market-radar-production-dispatch"
node scripts/v2/production/fixed-channel/production-dispatch.mjs keygen \
  --private-key "$HOME/.local/share/market-radar-production-dispatch/ed25519-private.pem" \
  --public-key "$HOME/.local/share/market-radar-production-dispatch/ed25519-public.pem"
```

私钥不得进入项目、Git、Bundle、腾讯服务器、截图或交付报告。

### 4.2 生成安装计划

```bash
npm run production:dispatch:install-plan
```

计划输出 `sourceSetSha256` 与固定 Node 运行时事实，不修改服务器。source-set 同时绑定 agent、installer 自身、短安装入口、README、service 和 timer；脱敏安装包只包含这些控制文件、公钥、`INSTALL_FACTS.json` 和 `SHA256SUMS`，不携带 Node 二进制。Node 由服务器直接从 `https://nodejs.org/dist/v24.18.0/` 下载，固定事实为：

```text
archive sha256 = 55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742
binary sha256  = 41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c
license sha256 = 148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5
```

### 4.3 腾讯服务器安装

真实安装必须把本轮安装包 SHA-256、公钥 SHA-256、生产远端 URL 和 source-ref allowlist 写入独立执行记录。上传归档的外层 SHA-256 先在服务器核对，然后只执行不含长环境变量和特殊字符的短入口：

```bash
bash install-production-dispatch-launcher.sh verify
bash install-production-dispatch-launcher.sh install
```

短入口先核对 `SHA256SUMS` 的精确文件集合与全部内容、严格 `INSTALL_FACTS.json` schema、公钥、source-set 和固定 runtime 事实，再把这些值作为参数交给原安装器；它不包含 secret，也不能跳过原安装确认与哈希门禁。安装器在目标已存在时拒绝覆盖。官方下载、三层哈希、架构、版本、公钥、source-set、远端和生成配置全部在首次 install mutation 前验证。首次安装中途失败时，它只回收本次预检确认原本不存在的 install root、state root、config 和 systemd unit；不会删除生产仓库、staging 根、应用、容器或数据。后续升级必须生成新的精确升级包，不能静默覆盖固定 agent。

### 4.4 安装验收

```bash
sudo systemctl is-enabled market-radar-production-dispatch.timer
sudo systemctl is-active market-radar-production-dispatch.timer
sudo systemctl status market-radar-production-dispatch.timer
sudo journalctl -u market-radar-production-dispatch.service --since -10min
```

验收还必须证明：无新增监听端口、应用生产 worktree 未改变、现有容器 ID 未改变、Postgres/Redis 未改变、`/api/health` 仍 ready/fresh。

## 5. 日常发布

### 5.1 前置条件

- 本地定向测试、基础门禁和安全门禁 PASS。
- Bundle 已有可复现 manifest，且 `containsSecrets=false`。
- approval request 绑定 package、target commit、staging、runner unit、Bundle SHA-256、rollback 和外部授权。
- source ref 在服务器 allowlist 中。
- 当前没有另一项生产 mutation。

### 5.2 准备签名 Outbox

```bash
node scripts/v2/production/fixed-channel/production-dispatch.mjs prepare \
  --approval-request <absolute-approval-request.json> \
  --bundle <absolute-redacted-bundle.tar.gz> \
  --dispatch-id <unique-dispatch-id> \
  --entrypoint <allowlisted-entrypoint-path> \
  --expires-at <ISO-8601-within-90-minutes> \
  --issued-at <ISO-8601-now> \
  --success-marker <exact-detached-start-marker> \
  --package-id <exact-package-id> \
  --revocation-epoch <current-epoch> \
  --runner-unit <unique-systemd-unit-name> \
  --runtime-max-seconds 5400 \
  --source-ref <approved-ref> \
  --staging-directory <exact-production-staging-directory> \
  --target-commit <40-char-commit> \
  --private-key "$HOME/.local/share/market-radar-production-dispatch/ed25519-private.pem" \
  --outbox <absolute-ignored-outbox-directory>
```

### 5.3 本地复核并发布

```bash
node scripts/v2/production/fixed-channel/production-dispatch.mjs validate \
  --outbox <absolute-outbox-directory> \
  --public-key "$HOME/.local/share/market-radar-production-dispatch/ed25519-public.pem"

node scripts/v2/production/fixed-channel/production-dispatch.mjs publish \
  --outbox <absolute-outbox-directory> \
  --public-key "$HOME/.local/share/market-radar-production-dispatch/ed25519-public.pem" \
  --repo /Users/chuan/Documents/web \
  --remote origin \
  --branch production-dispatch
```

发布动作只推送四个脱敏文件：`approval-request.json`、`bundle.tar.gz`、`dispatch.json`、`dispatch.sig`。

## 6. 结果判定

- `PASS_SIGNED_DISPATCH_PUBLISHED`：只代表脱敏任务已送到专用 ref。
- `PASS_SESSION_INDEPENDENT_RUNNER_LAUNCHED`：只代表固定 agent 已验签并启动 package runner。
- 真正发布 PASS：仍必须来自 package runner 的生产验证、回滚边界和证据合同。
- `DEFERRED_PRODUCTION_WIP_ACTIVE`：生产已有 mutation，等待 lease 释放，不算失败也不算完成。
- `DEFERRED_PRODUCTION_LEASE_UNCERTAIN`：租约真值损坏或处于创建竞态，保持任务未消费并等待修复，不得继续生产变更。
- `FAIL_DISPATCH_NOT_REUSABLE`：该 dispatch 已声明失败，不得修改后重用，必须重新生成 ID、nonce、授权和签名。

## 7. 速度目标

安装后，正常 Bundle 的“运输并启动”目标从人工 20-60 分钟降为 1-3 分钟；完整生产耗时仍由 build、数据库安全、健康验证和必要观察窗口决定，这些质量门禁不缩短。
