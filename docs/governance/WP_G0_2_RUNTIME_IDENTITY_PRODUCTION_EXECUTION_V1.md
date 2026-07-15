# WP-G0.2 Runtime Identity 生产执行合同

## 目标

只为 Candidate 后续 Shadow Capture 建立三套最小权限 LOGIN，并把三条连接 URL 注入 Web；Candidate 仍保持 Dormant，不启动 worker、不打开 Feature Flag、不执行 migration 或业务 DML。

## 授权与互斥

生产执行必须绑定当前干净提交、tree、diff、门禁证据、运输包、环境指纹、Compose、旧 Web 镜像和回滚目标。授权由仓库之外的 standing-grant trust root 提供，单次有效期不超过 90 分钟，`maxExecutions=1`。执行前获取全局 lease 和 fencing token，授权被消费后不能重放。

## 脱敏运输

运输包使用固定时间戳的 `ustar + gzip -n`，必须可字节级复现。包内不得包含 `.env`、credentials、role-admin URL、approval request、生产业务行或原始日志。

## 管理凭据来源

credentials 与 role-admin URL 不进入 Bundle。detached worker 只能读取合同锁定的 identity-remediation `secrets/postgres-admin.env`；该文件必须是 root-owned `0600` 普通文件。管理凭据只通过进程管道进入隔离 Node 运行时，不输出、不复制到运输包。Postgres 容器初始化环境中的 `POSTGRES_PASSWORD` 明确禁止作为当前网络认证凭据。临时 credentials 与 role-admin URL 位于仓库外 `0700` 目录、文件 `0600`，退出后精确删除。

## 独立执行

OrcaTerm 只负责上传脱敏包和启动 launcher。真实执行必须进入 `Restart=no`、`RuntimeMaxSec=5400`、journald 的 transient systemd unit；不存在前台或 `nohup` 降级路径。浏览器断开不会中断事务。

续证摘要只允许来自精确 Dormant release `summary.json`，或精确 Runtime Identity evidence 目录下的 `dormant-evidence-refreshed.json`；任意其它文件名或目录均拒绝。新摘要由 runner 写入仓库外 evidence 目录后，必须以 `0600` 临时副本桥接到 `SECURE_ROOT`，隔离 validator 只读校验该副本，校验后立即删除。该桥接不放宽 24 小时 freshness、1800 秒、57 样本或任何 ready/fresh 门禁。

## 动态预检

任何生产写入前必须重新证明：生产仓库 clean detached 到精确 target、health ready/fresh、Candidate Dormant、worker absent、schema ledger `9|0`、三套 LOGIN 不存在、writer 对 `scan_archives` 尚无权限、旧 Web 镜像可保留并恢复。

## 唯一允许变更

- 创建三套 `NOINHERIT LOGIN`，每套只授予一个固定 capability role。
- writer capability 对 `public.scan_archives` 只获得 `SELECT, INSERT`。
- `.env.production` 只改变三条 Candidate Database URL。
- 仅 `web` 执行 `--no-deps --no-build --force-recreate`。

## 回滚

任一步失败必须恢复旧 `.env.production`、旧 Web image、删除三套 LOGIN、撤销 writer archive 权限，并重新执行生产合同验证。回滚验证失败是 P0，不能标记 PASS。

## 真值

绑定 source commit `f83d83e314bafbbe10d55c78555d406801966e2d` 的上一生产事务已创建临时身份、权限并重建 Web，但 Web 身份探针因 Node 22 拒绝 CommonJS `require()` 与顶层 `await` 混用而失败；有界回滚已恢复旧 env、旧 Web image、删除三套 LOGIN、撤销新增权限并释放 lease，生产没有保留本次 mutation。旧 Bundle `0703656c3f403313f370e20932201f96b40daf2e2e7ec59083b3aac4ed0fac8f` 和旧 request 已消费，禁止复用。

当前本地修复把探针封装为 async IIFE，并由直接 Node syntax gate 保护。当前 11 文件 production packet artifact 为 `a110badddd2807bcb6a45290257a8ff046d4ff46ab639d6197ba2dab71957ff9`，定向 packet 测试为 13/13。本合同和本地测试通过仍只表示新生产包具备冻结条件，不表示生产已变更，也不表示 G0.2 已完成。生产成功后仍需只读身份验证和统一观察窗口。
