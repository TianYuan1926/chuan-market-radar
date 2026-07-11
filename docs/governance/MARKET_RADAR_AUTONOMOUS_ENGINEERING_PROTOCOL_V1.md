# Market Radar 全自动工程协议 v1.0

状态：`ACTIVE_FAIL_CLOSED`

适用范围：G0-G8 本地施工、验证、提交、生产审批与状态报告
不授权：自动下单、自动调权、自动修改 READY/RR、自动生产审批或自动执行高风险生产操作

## 1. 大白话定义

全自动工程的意思是：Codex 自动读项目、锁范围、改代码、跑测试、检查结果、写报告并推进低风险本地任务。

它不意味着：测试失败继续干、为了通过而降低标准、把部分完成写成完成，或不经批准修改生产数据库和正式读写路径。

```text
自动施工
-> 自动检查
-> 自动找错
-> 自动停止
-> 证据通过后才允许提交或申请生产动作
```

## 2. 唯一机器正本

根目录 `AUTONOMOUS_ENGINEERING_STATE.json` 是自动施工状态正本，必须记录：

- 当前真实等级和实战状态。
- 当前唯一 Work Package。
- 允许和禁止修改的路径。
- 不可修改的质量锁。
- 本轮定向、基础和安全门禁。
- 生产审批及有效期。
- 后续队列和 WIP 状态。

状态文件不能替代生产事实。状态与 Git、测试或生产证据冲突时，以更差的结果为准。

## 3. 不可修改的质量锁

- 结构 RR 最低 `3:1`。
- 不自动下单，不接交易所下单 API。
- 不自动修改实时排序、READY 或策略权重。
- 不使用 future outcome、MFE、MAE、hit 或 qualityHit 影响生产判断。
- 前端不能创建交易计划。
- formal 回测不能由自动流程执行。
- 生产动作不能由控制器替用户批准。

依赖这些质量锁验收的 Work Package，不能在同一包修改质量锁。

## 4. WIP 与自动推进

- Production WIP 永远最多 1。
- Local Preparation WIP 永远最多 1。
- 低风险本地包在全部门禁通过后可以自动进入提交候选状态。
- 生产 DDL、writer、backfill、read cutover、restore、rollback、secret rotation 必须等待独立且未过期的明确批准。
- 任一前置包为 FAIL/PARTIAL/BLOCKED 时，后续生产包保持禁止。

## 5. 机器控制器

```bash
npm run autonomy:status
npm run autonomy:gates
npm run autonomy:verify
npm run test:autonomy
```

### `autonomy:status`

读取状态和真实 Git diff。越过 allowlist、触碰 prohibited path、改变硬锁、超过 WIP 或缺审批时直接失败。

### `autonomy:gates`

只运行状态文件锁定的 npm scripts。输出实时显示，但持久证据只保存命令名、退出码、耗时和输出 SHA，不保存可能含敏感值的原始日志。

遇到第一个失败门禁立即停止。`backtest:formal` 永远拒绝自动运行。

### `autonomy:verify`

要求：

- 状态文件没有变化。
- Git 工作树指纹没有变化。
- 所有必需门禁都真实执行并通过。
- gate result 不是旧任务或旧 diff 的结果。
- 当前包状态为 `ready_for_gate`。

只有满足全部条件才输出 `canAutoCommit=true`。生产包还必须有当前有效审批，才可能输出 `canAutoDeploy=true`。

## 6. 自动停止条件

出现以下任何一项，当前包和后续晋级立即停止：

- 修改文件超出 allowlist。
- 修改 scan/analysis/strategy/backtest 分层边界。
- RR、Risk Gate、WAIT/READY 或状态词典被放宽。
- 测试、构建、安全、secret 或 forbidden-files 失败。
- gate result 与当前 state/diff 指纹不一致。
- 生产工作树不干净、release 不一致或 health 非 ready/fresh。
- mock、旧缓存、0、fallback 或 unavailable 被包装成真实能力。
- 生产审批缺失、过期或范围不匹配。
- 数据库出现长事务、锁等待、部分 DDL 或恢复风险。

## 7. 防止自欺欺人的规则

1. 施工者的文字说明不是证据。
2. “能跑”不等于“完成”。
3. 自动控制器自己也必须有绕过测试。
4. 本轮依赖的测试和门禁不能在本轮删除或降级。
5. 旧 PASS 不能覆盖当前 FAIL/PARTIAL。
6. 观察窗口必须满足真实时间，不能缩短后改写时间戳。
7. 人工只读审计不能冒充正式自动 verify PASS。
8. 生产 schema 存在不能冒充 Candidate Runtime 已启用。

## 8. 当前自动路线

```text
WP-AUTO-01 控制层与质量锁
-> WP-G0.2 verifier 本地修复
-> 用户批准 production verify-only
-> Shadow Write 独立审批
-> Reconciliation
-> Backfill Dry Run
-> Backfill 独立审批
-> Dual Read
-> Read Cutover 独立审批
-> G0 出口
-> G1-G8
```

当前 schema 已进入生产，但 verifier 仍失败，Candidate Runtime 关闭。控制器不得跳过 verifier 修复直接进入 Shadow Write。

## 9. 状态报告

每轮必须输出：

```text
当前状态
已完成
验证结果
发现问题
未完成和影响
下一步
```

状态只能使用：`完整完成`、`可运行但不完整`、`临时验证版`、`等待外部条件`、`不能支撑实战`。
