# WP-G0.2 Dormant Runtime Deploy 准入与运行合同

## 1. 本包目标

把已经通过本地 Composition Wiring 的 Candidate 代码部署到生产 `web` 镜像，但保持全部 Candidate 行为休眠。该动作只安装代码，不启动 Candidate 数据采集，不建立数据库身份，不改变任何生产数据。

当前结论：

```text
本地部署准备：PASS_LOCAL_DORMANT_DEPLOY_PREPARATION
隔离执行/回滚演练：PASS_ISOLATED_EXECUTE_AND_ROLLBACK_REHEARSAL
生产部署：NOT EXECUTED
生产授权：MISSING
生产激活：FORBIDDEN
系统等级：R1 / 可运行但不完整 / 不能支撑实战
```

## 2. 为什么不能使用通用发布脚本

现有通用脚本会执行全量 Compose build/up，并带 `--remove-orphans`。本包只允许重建 `web`，因此必须使用专用 runner：

```text
docker compose build web
docker compose up -d --no-deps web
```

禁止 profile、Candidate worker、全量服务重建和 `--remove-orphans`。

## 3. 生产审批必须绑定

当前 artifact 固定为 14 个文件，必须包含 `src/lib/candidate-episode/transaction-adapter.ts`，SHA-256 为 `78f1e3fa045615fd46dc38739adce0ed14a267e3665a3a1c99501f0520478449`。此前 13 文件 checksum 与上一版 14 文件 checksum `43e9deaef51e0c0408acb3c449a5cf92577181e66a14adaff958d669d3435f52` 都只保留为历史证据，已经失效，不得再用于任何生产审批。

artifact checksum 只能证明 14 个安全关键文件，不能单独证明整个 Git release 没有夹带其它 Web 代码。当前 release-diff 门禁额外锁定：

- required release base=`591163a37493910c346530ebdf271f878c6a67b5`
- last verified production rollback=`0599f802f261fe8e3c1982a07106f362bd62ac13`
- rollback 必须是 approved commit 的祖先，approved commit 必须继承 required release base
- release diff 必须精确为 149 个 `A/M` 路径
- path-set SHA-256=`f39c8a26ddf5ed8047a081a79bbbcaeed2ebfcc9540466d6e806adad8ce91f37`
- Review、Canonical read、activation、reconciliation 和任意非 allowlist 路径全部 fail closed

因此，包含后续 Canonical/Review 代码的功能分支不能直接作为本 Dormant approved commit，即使 14 文件 artifact checksum 相同也不允许通过。

审批请求必须完整绑定：

- `packageId=WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY`
- GitHub `main` 的 40 位 approved commit
- 当前机器合同中的 artifact SHA-256
- release diff file count 与 path-set SHA-256
- 当前生产 40 位 rollback commit
- `services=[web]`
- `deploymentMode=dormant_runtime_web_only`
- Compose 环境文件顺序固定为 `.env` 后 `.env.production`
- 不超过 90 分钟且尚未过期的窗口
- 自动 Web 镜像回滚允许为 true
- Candidate worker、数据库 URL、Feature Flag、代码授权、control lifecycle、migration 和数据库 mutation 全部为 false

“下一步”“继续”“全自动搭建”都不等于该生产审批。

## 4. 执行前条件

1. 本地完整门禁和专用 validator PASS。
2. approved commit 已进入 GitHub `main`，artifact checksum 未漂移，且 release diff 的祖先关系、149 路径和 path-set SHA-256 全部匹配。
3. 生产 worktree clean，当前 HEAD 等于审批中的 rollback commit。
4. `.env.production` 中五个 Candidate Flag 为 false 或缺省。
5. `.env` 和 `.env.production` 都通过 Candidate 休眠校验；合并后的三条 Candidate Database URL 为空或缺省。
6. Candidate runtime release 为 disabled，Candidate worker expected 为 false。
7. Candidate worker 容器不存在，旧 Web 镜像可作为回滚镜像。
8. 用户明确批准精确 commit、checksum、web-only 和 90 分钟窗口。

任一条件失败立即停止，不进行部分部署。

## 5. 执行方式

为避免先修改生产 worktree 再校验 runner，应先在服务器用 `origin/main` 的 approved commit 建立临时 detached worktree，从该临时目录运行 runner，并把真实生产目录通过 `ROOT_DIR_OVERRIDE` 传入。请求 JSON 只包含审批元数据，不包含任何 secret。

专用 runner 默认 dry-run。只有同时设置下列两项并提供通过校验的请求文件，才可能执行：

```text
DORMANT_DEPLOY_MODE=production_deploy
CONFIRM_DORMANT_DEPLOY=true
REQUEST_FILE=/secure/path/request.json
```

生产 Compose 必须同时使用 `--env-file .env --env-file .env.production`。基础文件提供 PostgreSQL 等必需插值，覆盖文件提供生产运行覆盖；单独使用任一文件都不构成有效准入证据。

runner 请求解析必须兼容生产同类环境可能使用的 Bash 3.2，不得依赖 Bash 4 才提供的 `readarray` / `mapfile`。本地隔离演练必须真实执行 runner 的成功路径与即时验证失败路径，并证明失败路径恢复 rollback commit 和旧 Web 镜像。

真实命令和临时路径由 Codex 在审批窗口内按服务器实际目录生成；禁止把 `.env.production`、连接串或 token 写入请求文件和证据。

## 6. 即时验收

专用 runner 必须证明：

- 生产 HEAD 等于 approved commit。
- 只重建 `web`。
- Web 容器中五个 Candidate Flag 关闭、三条 Candidate URL 为空。
- Candidate release disabled、worker expected false。
- Candidate worker 容器不存在。
- 未授权 Candidate API 返回 401。
- 授权只读调用返回 `mode=dormant`、`batch=null`，且包含代码未授权 blocker。
- `/api/health`、前后端合同、现有 workers、Postgres、Redis 通过既有生产检查。

即时检查通过只能写：

```text
PASS_IMMEDIATE_DORMANT_WEB_CHECKS_AWAITING_DB_VERIFY_AND_OBSERVATION
```

## 7. 最终验收

即时检查后还必须完成：

1. 使用既有最小权限 Migration Verify 身份做只读核验：ledger 仍为 9、catalog 不变、control rows=0、Candidate Feature Flag enabled=0；禁止执行 migration。
2. 观察 30–60 分钟，每 5 分钟至少一份脱敏样本；health ready、scan fresh、现有 worker heartbeat 正常，无新增权限、事务、锁或服务错误。
3. Server HEAD、GitHub main、Web release/image 证据对齐。

只有三部分全部通过，才能写 `PASS_DORMANT_RUNTIME_DEPLOY`。否则保持 partial 或触发回滚，不能进入 Runtime Identity and Permission。

## 8. 回滚

runner 在 Web build/recreate 或即时验证失败后，必须恢复审批绑定的旧 Web 镜像和 rollback commit，再执行降级生产检查。该回滚不执行数据库 rollback，因为本包严禁数据库变更。

观察期出现持续 health/scan/worker 退化、Candidate worker 意外出现、开关/URL 非休眠、release mismatch 或 secret 风险时，也必须停止并按同一目标回滚。

## 9. 下一包

只有 Dormant Runtime Deploy 最终 PASS 后，下一包才是：

```text
WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION
```

该包仍不得直接 activation。三条最小权限身份和 active permission rehearsal 通过后，才可另行申请激活与观察。
