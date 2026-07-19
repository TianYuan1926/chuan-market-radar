# ADR-0001：干净 Git 基线与 V2 物理隔离

状态：`ACCEPTED`

日期：2026-07-20

## 背景

原 V2 蓝图分支 `codex/market-radar-v2-blueprint-reset` 相对 `origin/main` 为 `0 behind / 71 ahead`。其中只有最后一个提交是 V2 蓝图与活跃记忆重构，前 70 个提交属于旧 G0 Candidate 周期、生产包和观察治理历史。若直接在该分支实施，新代码会在 Git 祖先、差异审计和未来 cherry-pick 中继续携带这些历史，无法证明“新 V2 只提取经审核能力”。

## 决策

1. `codex/market-radar-v2-blueprint-reset@983ef76e6291e361b1677e8ec6192566b2331023` 永久保留为设计归档来源。
2. V2 实施分支从最新 `origin/main@e5eb90026d8bfcd52b060359446515de5a5c32d6` 新建。
3. 只移植 V2 权威提交，形成实施基线 `ef42535369d547440aa04883ac56b15733fe8216`。
4. V2 新实现放在 `src/v2/`；默认禁止读取 `src/lib/`、`src/app/`、`src/components/` 等 Legacy 运行模块。
5. Legacy 默认也不得引用 V2。未来只有经过 ADR 批准的窄适配器可以跨边界，并必须有消费者、Shadow 和回滚证据。
6. 旧 G0 分支、worktree 和报告不批量删除；它们保留历史与恢复价值，但不具有 V2 实施权威。

## 被拒绝的方案

- **继续在 71-ahead 分支开发**：无法干净区分 V2 与旧 G0 施工历史。
- **把 Legacy 全部复制进新目录**：只会复制错误职责和重复权威。
- **新建独立仓库或立即微服务化**：当前没有吞吐、团队或故障域证据支持额外运维复杂度。
- **Big Bang 重写并一次切生产**：无法逐 authority 对比和回滚。

## 后果

- 设计归档与实施历史可分别审计。
- 已验证 Legacy 能力必须通过 Capability Atlas 逐项 `EXTRACT`，不能通过隐式 import 继承。
- M0/M1 本地工程可以继续；任何生产判断仍要求新鲜只读证据。
- 分支干净不等于 Legacy 问题消失，也不等于 V2 已具备实战能力。
