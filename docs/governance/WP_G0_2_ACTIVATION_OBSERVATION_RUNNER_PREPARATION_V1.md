# WP-G0.2 Activation and Observation Runner 本地准备合同

## 1. 本包定位

本包只准备未来生产 Shadow Capture 激活、自动回滚和不少于 24 小时的连续观察工具。当前 `CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED` 必须继续为 `false`，因此本地 runner PASS 不等于生产具备激活权限。

生产顺序保持：

```text
Dormant Runtime Deploy final PASS
-> Runtime Identity and Permission final PASS
-> 另建 future activation release，把代码授权从 false 改为 true
-> 新的 exact commit + artifact + rollback commit + 90 分钟审批
-> activate immediate checks
-> 24 小时真实观察
-> PASS_ACTIVATE_AND_OBSERVE
```

任何前置缺失都必须拒绝，不能用环境变量单独开启。

## 2. 唯一允许的生产变化

- GitHub `main` 快进到经审批的 future activation commit。
- 只构建并更新 `web` 与 profile 隔离的 `candidate-shadow-worker`。
- 保持三条 Candidate Database URL 不变。
- 只将 Shadow write、release ID 和 worker expected 打开；canonical write、dual read、canonical read、review read 继续关闭。
- 只调用一次 `start_shadow_capture_v3`，数据库生成固定 72 小时 deadline 和 epoch 1。
- 不执行 migration、schema DDL、业务 DML、backfill、排序修改或 phase advance。

## 3. 双重授权

审批必须同时绑定：future activation commit、future 16 文件 artifact SHA-256、当前 runner artifact SHA-256、runner 治理合同 SHA-256、生产 rollback commit、release ID、migration ID、Dormant final PASS、Runtime Identity final PASS、服务白名单、自动回滚和不超过 90 分钟的窗口。

执行器还会读取 future commit 中的源码，只有代码常量明确为 `true as const` 且 artifact checksum 完全一致才可执行。当前准备分支固定为 false，所以不能拿当前 checksum 冒充激活发布。

## 4. 即时 Gate 与自动回滚

激活顺序固定为：构建镜像、创建 control、原子切换环境、recreate Web、启动 Candidate worker、检查 active runtime/monitor、运行完整 production check。任一步失败都必须：

1. 停止并移除 Candidate worker。
2. 恢复原 `.env.production`。
3. 恢复旧 Web 镜像和 rollback commit。
4. 将 control 从 `shadow_capture` 转回 `legacy`，epoch 单调增加且 `write_frozen=true`。
5. 保留 Candidate schema、Episode、Event、Outbox 和所有证据，不做删除。

即时成功只能写 `PASS_IMMEDIATE_SHADOW_CAPTURE_AWAITING_OBSERVATION`。

## 5. 24 小时观察

生产观察固定每 5 分钟采样，至少 289 个样本、覆盖至少 24 小时，单次最大间隔 10 分钟。每个样本必须同时证明：

- health ready、scan fresh、Postgres ready、Redis healthy；
- 6 个既有 worker 与 Candidate worker 均 healthy；
- Candidate runtime active、无 blocker、release 和 epoch 一致；
- monitor ready、无 blocker/warning、无 retry_wait、无 quarantine；
- oldest pending 小于 300 秒；
- completed writes 单调不减且最终大于 0；
- 无 lock waiter、无超过 5 分钟的事务、身份读取无错误。

任一样本失败立即触发预授权安全回滚。审批窗口过期不能阻止安全回滚，但绝不能允许新的激活动作。

本包不会检查 `10,000 compared writes` 作为 Activation PASS 条件；该阈值原样保留给下一 `shadow_verify/reconciliation` Gate，绝不下调，也不自动推进 phase。

## 6. 当前结论

当前只能达到 `PASS_LOCAL_ACTIVATION_OBSERVATION_RUNNER_PREPARATION`。生产未连接、未执行，Candidate runtime 仍 disabled；系统仍为 `R1 / 可运行但不完整 / 不能支撑实战`。
