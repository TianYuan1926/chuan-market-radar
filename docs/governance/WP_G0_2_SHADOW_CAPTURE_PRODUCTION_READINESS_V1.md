# WP-G0.2 Shadow Capture 生产准入说明

> 历史状态说明：本文件是 Migration 009 应用前的 readiness/approval packet，内部审批事实按当时快照保留。009 已在后续独立生产包应用并验证 dormant，本地 Composition Wiring 也已 PASS；当前事实与下一 Gate 以 `WP_G0_2_SHADOW_CAPTURE_COMPOSITION_WIRING_V1.md` 为准。

## 历史结论

```text
本地生产准备：待本包完整门禁确认
生产决定：BLOCKED_AWAITING_EXPLICIT_APPROVAL
生产授权：false
```

本包只把生产前的工程防线、演练和审批材料准备完整。它不授权连接腾讯云、执行 migration、部署 runtime、开启 Feature Flag 或启动 Shadow Writer。

## 已收口的生产前缺口

1. Quarantine 只能通过审批化 `replay_after_approved_fix` 或 `exclude_invalid_source` 处置。
2. 原始隔离项和 resolution ledger 都不可修改或删除；replay 必须创建新的 Outbox。
3. 数据库使用自己的时钟创建 72 小时 Shadow 生命周期，同一 migration id 不能重启计时。
4. pending、claimed、retry_wait 或未决 quarantine 都会阻止进入 `shadow_verify`。
5. Runtime 同时要求代码授权、数据库 phase/epoch/deadline、数据库持久化、release 对齐和环境 kill switch；环境变量不能单独授权。
6. Candidate mapper 只输出 canonical perpetual venue identity，不能把 long/short、策略、RR 或 Outcome 带入 SCAN source。
7. Monitor 只读聚合计数和时延，不读取 payload，不输出 secret。

## 拆分后的生产顺序

1. `PRODUCTION-ADD-SAFETY-SCHEMA`：只应用 migration 009，验证 schema、权限、checksum、Feature Flag=false，保持 dormant。
2. 独立本地包完成真实 production composition wiring 和 worker lifecycle 测试。
3. 独立批准部署 dormant runtime，仍保持代码授权和 Feature Flag 关闭。
4. 独立批准启动 `shadow_capture`、开启 kill switch 并进入 24 小时以上观察。

以上步骤不能合并授权。失败时先关 kill switch、停止 consumer、保持 legacy 权威，并保留 schema 与证据；禁止通过删表、删 ledger 或改写 quarantine 假装恢复。

## 历史下一生产审批边界

下一包最多只允许：

```text
WP-G0.2-SHADOW-CAPTURE-PRODUCTION-ADD-SAFETY-SCHEMA
```

该 schema-only 边界已经在后续独立审批包完成，不得再次执行 Migration 009。当前新的生产边界是独立审批的 Dormant Runtime Deploy，仍不授权 activation。
