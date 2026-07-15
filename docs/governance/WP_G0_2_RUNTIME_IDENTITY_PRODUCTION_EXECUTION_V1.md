# WP-G0.2 Runtime Identity 生产执行合同

## 目标

只为 Candidate 后续 Shadow Capture 建立三套最小权限 LOGIN，并把三条连接 URL 注入 Web；Candidate 仍保持 Dormant，不启动 worker、不打开 Feature Flag、不执行 migration 或业务 DML。

## 授权与互斥

生产执行必须绑定当前干净提交、tree、diff、门禁证据、运输包、环境指纹、Compose、旧 Web 镜像和回滚目标。授权由仓库之外的 standing-grant trust root 提供，单次有效期不超过 90 分钟，`maxExecutions=1`。执行前获取全局 lease 和 fencing token，授权被消费后不能重放。

## 脱敏运输

运输包使用固定时间戳的 `ustar + gzip -n`，必须可字节级复现。包内不得包含 `.env`、credentials、role-admin URL、approval request、生产业务行或原始日志。

## 独立执行

OrcaTerm 只负责上传脱敏包和启动 launcher。真实执行必须进入 `Restart=no`、`RuntimeMaxSec=5400`、journald 的 transient systemd unit；不存在前台或 `nohup` 降级路径。浏览器断开不会中断事务。

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

本合同和本地测试通过只表示生产包具备执行条件，不表示生产已变更，也不表示 G0.2 已完成。生产成功后仍需只读身份验证和统一观察窗口。
