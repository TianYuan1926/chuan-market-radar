# WP-G0.2 Scan Sustained Health Production Release v1

## 1. 目的

把已在生产基线 `0599f802f261fe8e3c1982a07106f362bd62ac13` 上独立验证的扫描持续健康修复提交 `70722ea71b33268b688be5d42af9908d40f49859`，以最小范围发布到生产 Web 和 scanner-worker，并用至少 1800 秒、两个后续完成时间推进证明扫描没有再次滑回 17 分钟左右的假 15 分钟 cadence。

本包只建立可执行批准材料。合同本身不授权生产变更。

2026-07-14 生产执行暴露两个恢复缺口：OrcaTerm 前台会话断开会终止 runner；构建覆盖原镜像 tag 后，历史 scanner-worker 镜像可能不可再用。旧 artifact、contract 和 transport bundle 因此全部失效。当前加固版要求 transient systemd 单元和双镜像不可变保留 tag；本地完整门禁、clean Git 收口与可复现 bundle 已完成，仍需新的动态预检和 exact approval。

## 2. 为什么不能部署 main

当前 GitHub main 同时包含尚未获准进入生产的 Candidate Episode / Dormant runtime 代码。即使功能开关关闭，直接拉取 main 并重建 Web 仍会把未批准代码装进生产镜像。

因此本包只允许部署专用分支 `codex/wp-g0-2-scanner-sustained-health-release` 的精确提交 `70722ea...`。该提交必须：

- 只有一个父提交，且父提交精确为当前生产 `0599f802...`；
- diff 只有合同列出的 16 个扫描运行时和测试文件；
- diff 名称/状态清单 SHA-256 为 `80bab7d7e3cdd5a9811dc0815c5df10205bce54e3f87c14d1791c94bcd3f6f58`；
- `docker-compose.yml` 字节不变。

## 3. 允许范围

- fetch 上述唯一远端分支到远端跟踪引用；
- 生产仓库从 clean `main@0599f802...` 切换到 detached `70722ea...`；
- 使用既有 root-owned identity wrapper 构建 Web 和 scanner-worker；
- 由批准的 transient systemd unit 在浏览器会话之外执行 runner，日志写入 journald；
- 在任何 Git checkout、build 或容器重建前，为两个旧镜像创建批准绑定的 rollback retention tag；
- 只 force-recreate Web 和 scanner-worker；
- 执行只读 Postgres 身份探针、Redis ping、health/contract 读取；
- 在仓库外保留脱敏 cadence 观察摘要；
- 任一步失败时自动恢复两个旧镜像和 `main@0599f802...`。

## 4. 明确禁止

- 不 pull / merge GitHub main；
- 不部署 Candidate/Dormant 代码或启动 Candidate worker；
- 不重启 Postgres、Redis、Caddy 或任何其他 worker；
- 不写数据库，不写 Redis 业务状态，不执行 migration；
- 不改 `.env`、`.env.production`、identity override、Feature Flag 或 secret；
- 不修改 scan 排序、analysis、strategy、RR、backtest 或前端展示；
- 不把 HTTP 200 的旧缓存响应计为扫描成功。

## 5. 执行前硬门禁

1. 精确批准 request 为 `0600`，窗口不超过 90 分钟且仍有效。
2. transport bundle、合同、三个执行文件的 SHA-256 全部匹配。
3. staging 位于批准的仓库外绝对路径，执行后强制删除。
4. identity override 为 root-owned `0600`，wrapper 为 root-owned `0700`，校验和匹配。
5. Compose、两份 env 指纹和当前两个运行镜像 ID 与批准一致。
6. 生产 Git 必须是 clean `main@0599f802...`。
7. Candidate worker 必须不存在；生产持久化必须为 ready。
8. 远端目标提交、单父关系、16 文件 diff 和 Compose 不变均通过验证。
9. `systemd-run` / `systemctl` 和 non-interactive sudo 可用；批准的 transient unit 必须尚不存在。
10. request 必须绑定 unit name、`sessionIndependentExecutionRequired=true`、两个根据当前镜像 digest 确定生成的 rollback image ref，以及 `rollbackImageRetentionRequired=true`。
11. 两个 retention ref 必须在生产 mutation 前解析回批准的旧镜像 ID；任一不匹配立即 fail closed。

## 6. 发布与真值观察

1. 前台 entrypoint 只验证 staging 和批准身份，并启动 `Restart=no`、最长 5400 秒的 transient systemd unit；启动后立即返回 unit、PID 和 journald 查询命令。
2. detached worker 在 systemd unit 内运行，接收 INT/TERM/HUP 时把信号转发给 release runner，等待自动回滚完成后再清理 staging。
3. 为当前 Web 和 scanner-worker 镜像建立确定性 retention tag并验证；随后才允许切到 detached target，main 分支仍指向旧基线。
4. 只构建 Web 和 scanner-worker；checkout 后、build 后、scanner 重建前均重新验证两个 retention ref。
5. 先重建 Web 并等待可访问，再重建 scanner-worker。
6. 验证两个容器都使用新镜像、数据库身份与 approved override 一致，非目标容器 ID 不变。
7. 等待第一次新扫描完成，要求 scan fresh、scanner heartbeat healthy、持久化 ready。
8. 从第一次新完成开始连续观察至少 1800 秒；每 30 秒采样，不允许 freshness 或 scanner heartbeat 中途失败。
9. 要求至少两个后续不同的 `scan.completedAt`，最后 health 必须 `ready/fresh`。
10. scanner 日志必须证明 `fixed_rate_skip_missed`、至少三次 `resultStatus=updated` 成功、零假成功、零 task failure。

不能满足任一条件就不是 PASS。

## 7. 自动回滚

执行前记录 Web、scanner-worker 的镜像 ID、镜像引用和所有非目标容器 ID，并把两个旧镜像绑定到 `market-radar-rollback/wp-g0-2-scan-health:*` 的确定性保留 tag。保留 tag 在成功后也不得自动删除，清理需要独立批准。checkout、build、recreate 或观察任一步失败后：

1. 先验证两个 retention ref 仍精确指向批准的旧镜像，再把它们重新绑定到各自 Compose 镜像引用；
2. checkout 回未移动的 main，即 `0599f802...`；
3. 只重建 Web 和 scanner-worker；
4. 再验证两个旧镜像、两个数据库身份、Candidate absent、非目标容器 ID 不变；
5. 留下脱敏 rollback 结果。

如果回滚验证失败，输出 `P0_ROLLBACK_PRODUCTION_SCAN_SUSTAINED_HEALTH_NOT_VERIFIED`，不得继续 G0。

## 8. 成功状态

唯一完整成功标签：

```text
PASS_PRODUCTION_SCAN_SUSTAINED_HEALTH_TWO_CADENCE_OBSERVATION
```

成功后生产仓库保持 clean detached `70722ea...`。这不是整个 G0 完成，只代表扫描持续健康 P1 已通过本次生产观察。

成功 summary 还必须写入 `rollbackImagesRetained=true`、两个 retention ref 和 `rollbackCleanupRequiresSeparateApproval=true`。没有这些证据，即使 health ready 也不能写 PASS。
