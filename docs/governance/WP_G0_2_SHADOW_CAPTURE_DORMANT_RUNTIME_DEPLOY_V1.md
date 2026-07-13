# WP-G0.2 Dormant Runtime Deploy 准入与运行合同

## 1. 本包目标与当前真值

本包只把 Candidate Episode / Shadow Capture 运行时代码装入生产 `web`，让后续最小权限身份和激活包有可承接的代码地基。Candidate 在本包前后都必须完全休眠：不采集、不写入、不启动 worker、不生成候选、信号或交易计划。

```text
本地 runner 刷新：PASS_LOCAL_DORMANT_DEPLOY_STANDING_AUTHORITY_RUNNER_REFRESH
隔离成功/回滚演练：PASS（12/12 定向测试中的真实脚本执行用例）
精确 release：70722ea... -> cec0b657...（单父、18 个 A/M 文件）
生产部署：NOT EXECUTED
精确单次生产执行记录：NOT CREATED
生产激活：FORBIDDEN
系统等级：R1 / 可运行但不完整 / 不能支撑实战
```

2026-07-12 的历史 Dormant 生产尝试仍是“新 Web 启动竞态后自动回滚”，不是 PASS。旧 commit、artifact、宽 release diff、bundle 和已消费审批只保留为历史证据，禁止复用。

## 2. 唯一允许的发布对象

当前生产基线必须在执行前动态复核为 clean detached：

```text
baseline commit = 70722ea71b33268b688be5d42af9908d40f49859
target commit   = cec0b6572bb09ae91ff9e013f8bb160f73c045e2
target tree     = eb217a7fbaad5b464279a08d4441a8249fc266e3
remote branch   = codex/wp-g0-2-dormant-runtime-release-v2
```

target 必须只有一个父提交，且父提交精确等于 baseline。release diff 必须精确为合同 JSON 中的 18 个 `A/M` 路径：

```text
release diff SHA-256 = ee814eb07b7b4fa6c4f36f92293d9ec9fbf2269fbb0e348d0705799637e4f4fa
path-set SHA-256     = 595fe25980a91548c7a88a7301f141c24ea29e1ea61c1960284a59c950aef19a
runtime artifact     = 5f4fb48da4b013278fde1c240c4838b96f020acfa142e624ca36000a491243e7
target Compose       = 9e22cf32574e19e8526cf42795726627bff9b90cd990db69b5639d20e9ff0820
```

不得部署 GitHub `main` 的宽差异，不得把历史 149/156 路径发布包换皮复用。release 中虽包含 Candidate 代码，但本包不允许配置身份、开 Flag、启动 control lifecycle 或 Candidate worker。

## 3. 发布和授权边界

唯一允许的服务动作：

```text
docker compose build web
docker compose up -d --no-deps --force-recreate web
```

禁止全量 Compose、`--remove-orphans`、profile、scanner-worker 或其它服务重建。禁止数据库 DDL/DML、Redis mutation、migration、env 修改、Feature Flag 修改、Candidate 数据库 URL 配置和代码激活。

G0-G8 standing authorization 只取消常规逐包等待，不取消以下约束：

1. runner source commit/tree/parent/diff/path-set、合同、artifact、policy、gate evidence 必须精确绑定。
2. 当前 Web image、Compose、base/production env、root-owned identity wrapper 与 `0600` identity override 必须动态绑定。
3. 仓库外单次 package authorization 最长 90 分钟、`maxExecutions=1`。
4. 仓库外全局 lease、递增 fencing token 和每个 mutation 前 checkpoint 必须通过。
5. approval 不能预填 lease ID 或 fencing token；运行身份只能在生产端 acquire 时产生。

任一绑定漂移都必须在 Git/Docker mutation 前 fail closed。

## 4. 会话独立执行

批准的脱敏、可复现 `ustar+gzip-n` Bundle 只能上传到仓库外 `0700` staging。请求文件必须为普通非符号链接 `0600` 文件，不能含 secret。入口必须用 transient systemd unit 启动 detached worker：

```text
Restart=no
RuntimeMaxSec=5400
StandardOutput=journal
StandardError=journal
```

OrcaTerm、Microsoft Edge 或启动 shell 断开不能中止执行。不存在 `nohup` 或前台 fallback。worker 结束后只能删除与审批精确绑定的 staging，不得扩大清理范围。

2026-07-14 动态预检证明生产宿主机没有 Node。宿主 Node 因此明确不是前提：validator 必须把 request、contract 和两份环境文件以 base64 输入当前批准 Web 容器；lease CLI fallback 必须使用当前批准 Web image，且固定 `--network none`、`--read-only`、`--cap-drop ALL`、`no-new-privileges`，只挂载治理脚本、只读请求、外部 trust root 和 evidence 目录。容器 fallback 不得读取或输出连接串。

## 5. 执行前条件

1. 定向测试、基础门禁、安全门禁、自治门禁全部 PASS，工作树冻结且证据绑定当前 runner commit。
2. release branch 已推 GitHub，target commit/tree/parent/diff/path-set/Compose 全部匹配。
3. 生产仓库 clean detached baseline；不得有未跟踪文件或分支漂移。
4. 当前 Web、非目标容器、Postgres、Redis、`/api/health` 和三份合同均通过只读预检。
5. 五个 Candidate Flag 为 false，三条 Candidate URL 为空，release ID 为 disabled，worker expected=false。
6. Candidate worker 不存在；`candidate_migration_control` 行数为 0；已应用 migration ledger 仍为 9。
7. 旧 Web image 已绑定为 rollback ref，且在任何 checkout/build/recreate 前验证可解析回原 image ID。
8. 当前单次 authorization、外部 lease 和 fencing 均有效、未消费、未撤销。

任一条件失败立即停止，不执行部分发布。

## 6. 即时验收

发布后必须同时证明：

- HEAD 为 clean detached target，Compose 为 target checksum；
- 只有 Web 容器和镜像发生变化，非目标容器身份逐字节一致；
- Web 实际 `DATABASE_URL` 脱敏指纹等于批准 Compose 身份指纹；
- Candidate Flag、URL、release、worker expected 仍完全休眠，Candidate worker absent；
- 未授权 admin 调用返回 401；授权只读调用返回 `mode=dormant`、`batch=null` 和 `release_not_authorized_in_code` blocker；
- schema 只读结果为 `9|0`，没有 DDL/DML；
- health ready、scan fresh、scanner heartbeat healthy；前后端与 business capability 合同、Postgres、Redis 通过；
- rollback ref 仍精确解析到旧 Web image。

即时通过仍不能写生产 PASS，必须继续观察。

## 7. 连续观察与最终 PASS

观察固定为 1800 秒、每 30 秒采样。每个样本都必须重新检查外部 lease fencing、health ready、scan fresh、Candidate dormant、Candidate worker absent、非目标容器不变、Web 身份不变和 rollback ref 存在。不得缩短真实时间，不得用历史样本补位。

只有即时验收、连续观察和最终 closeout 全部通过，且外部 lease 以 PASS 释放，才允许状态：

```text
PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION
```

这只代表休眠代码地基部署成功，不代表 Candidate 已激活，不代表 WP-G0.2/G0 完成，更不代表系统可以实战交易。

## 8. 自动回滚

旧 Web image 必须在生产 mutation 前保留到：

```text
market-radar-rollback/wp-g0-2-dormant:web-<old-digest-prefix>
```

checkout、build、recreate、即时验证、观察或最终 closeout 任一步失败，都必须使用 safety checkpoint：恢复旧 Web tag、checkout detached baseline、仅 force-recreate Web，再验证旧 image、Git、身份、health、Candidate absent 和非目标容器。只有全部通过才能写：

```text
ROLLBACK_DORMANT_DEPLOY_BASELINE_VERIFIED
```

成功后 rollback ref 仍保留；删除它必须是另一个精确批准的清理包。

## 9. 下一包

只有真实生产 Dormant PASS 后，下一包才是：

```text
WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION
```

Runtime Identity 包仍不能直接 activation。身份与权限通过后，才可进入独立的 Activate and Observe 包。
