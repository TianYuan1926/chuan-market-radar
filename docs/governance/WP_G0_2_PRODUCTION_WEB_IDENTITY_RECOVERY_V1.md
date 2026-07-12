# WP-G0.2 Production Web Identity Recovery 准入与恢复合同

## 1. 当前问题

生产数据库探针仍为 `ready`，但运行中 Web 的数据库身份指纹与既有最小权限 identity override 不一致，`scan_archives` 和 `journal_events` 持久化读取返回认证失败，总 health 为 `degraded`。本包只恢复当前旧 Web 的既有身份，不部署 GitHub 新代码。

当前结论：

```text
本地恢复准备：PASS_LOCAL_WEB_IDENTITY_RECOVERY_PREPARATION
生产授权：MISSING
生产恢复：NOT EXECUTED
生产 health：DEGRADED_PERSISTENCE_AUTH
系统等级：R1 / 可运行但不完整 / 不能支撑实战
```

## 2. 唯一允许的变更

```text
使用审批绑定的 root-owned identity Compose wrapper
-> --no-build --force-recreate web
-> 等待 Web readiness
-> 验证身份指纹、持久化、health 和合同
```

禁止 fetch、pull、merge、checkout、build、其它服务重启、环境文件写入、数据库/Redis mutation、migration、Feature Flag、Candidate worker、control lifecycle 和 Dormant 新 release。

## 3. 审批绑定事实

- 生产 HEAD：`0599f802f261fe8e3c1982a07106f362bd62ac13`
- identity override SHA-256：`1b7f8ba4c623a0025ff35ddc203c6b769d1b262a15a5a16892816cdcb478bacf`
- identity wrapper SHA-256：`fb473dc3bf0a2968be8bad385efac32734f0575ddf17cee73f2003d3a369f1f3`
- 生产 `docker-compose.yml` SHA-256：`2749a24dfd2f574ac0ffe64a8e2c9f8afb411dc7d11279f75cfcc9fb0d743a4e`
- `.env` 与 `.env.production`：审批前只读重取 SHA-256 并写入 request；只记录指纹，不记录内容。
- 当前 Web image ID：必须在审批前只读重取并写入 request。
- Recovery artifact SHA-256：`440bae3d22e820358cce794ad8d656722ffba7e510af58ab1b5473b51efc51da`
- request 必须同时绑定 Recovery artifact、合同 checksum、最终 runner source commit、脱敏 transport bundle checksum 和仓库外 staging 绝对路径。
- runner 在生产 mutation 前逐文件校验 entrypoint、validator 与 recovery shell checksum；transport manifest 还必须证明 bundle 不含 secret、不会修改生产仓库。
- 服务白名单：`web`
- 时间窗：不超过 90 分钟。

任何 checksum、HEAD、worktree、image 或时间窗不一致都必须在 Web recreate 前停止。

## 4. Secret 与权限边界

- request 只含 checksum、image ID、布尔授权、操作人和时间，不含连接串、口令或 token。
- request 必须是普通非 symlink `0600` 文件。
- identity override 必须 root-owned `0600`；wrapper 必须 root-owned `0700`。
- 连接串只在管道或进程内存中用于指纹和 `SELECT 1`，不得输出或写入证据。
- 生产宿主机无 Node 时，runner 通过当前 Web 容器 Node 读取 base64 request/contract；验证规则不变。
- 生产仓库保持 `0599f802...` 且禁止 fetch/pull/checkout/write。经审批的脱敏 bundle 只允许上传到 `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-web-identity-recovery-*`。
- staging 目录必须 `0700`，request 必须 `0600`；entrypoint 在成功、失败或回滚结束后删除整个 staging 目录，避免临时 runner、archive 和 request 污染服务器。

## 5. 执行前门禁

1. request exact keys、90 分钟窗口、runner commit、Recovery/contract/bundle checksum、staging 路径和所有禁止授权通过。
2. 生产 HEAD、main、clean worktree、Compose、两份 env 指纹、wrapper、override 和 Web image 全部匹配审批。
3. Candidate worker 不存在。
4. 目标最小权限身份可对 PostgreSQL 执行只读 `SELECT 1`。
5. 当前 health 至少可访问且数据库探针 ready。
6. 执行前记录除 Web 外全部运行容器的 `name=id` 快照。

## 6. 成功验收

成功必须同时证明：

- Web image ID 不变，只是容器被重新创建。
- Web 实际数据库身份指纹等于 identity wrapper 计算出的期望指纹。
- 除 Web 外所有容器 ID 完全不变。
- 生产 HEAD 和 clean worktree 不变。
- `/api/health` 为 ready、scan fresh、database ready，持久化说明不再包含认证失败或 storage unavailable。
- frontend radar、backend radar、business capability 三个合同均 `ok=true`。
- Postgres ready、Redis PONG。
- 五个 Candidate Flag 关闭、三条 Candidate URL 为空、release disabled、worker expected false、Candidate worker 不存在。
- 仓库外临时 staging、上传 bundle、request 和 marker 全部删除。

只有全部通过才输出：

```text
PASS_PRODUCTION_WEB_IDENTITY_RECOVERY
```

## 7. 自动回滚

一旦 Web recreate 后发生任一失败，runner 使用执行前的 base Compose（不带 identity override）并以同一旧 image 执行 Web-only no-build force recreate，恢复已知的执行前基线。回滚后再次确认 Web 可访问和其它容器 ID 未变。

回滚只能写 `ROLLBACK_PRE_RECOVERY_WEB_BASELINE_ATTEMPTED`，不能写恢复成功，也不能把 degraded 基线包装成健康。

## 8. 后续顺序

本包生产 PASS 后先重新生成生产 health/contract 证据。只有 health ready/fresh 且持久化真实恢复，才可另行申请绑定 commit、Dormant artifact、release diff 和 identity override checksum 的 Dormant Web-only 新发布；两次生产动作不得合并审批。
