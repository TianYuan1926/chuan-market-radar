# WP-G0.2 Shadow Capture 本地实现与 PG16 演练

> 历史包状态：本包已完成。当前后续状态见 `WP_G0_2_SHADOW_CAPTURE_PRODUCTION_READINESS_V1.md`；不能继续按本文旧的“下一步”直接推断生产权限。

## 范围

本包完成生产启用前的本地工程实现，不连接腾讯云，不修改生产 schema，不接生产 API/worker，不开启 Feature Flag。

## 实现组件

| 组件 | 职责 | 生产状态 |
| --- | --- | --- |
| `CandidateShadowCaptureSourceWriter` | scan archive + candidate Outbox 同事务 | 未接线 |
| `CandidateShadowCaptureConsumer` | source-only claim、幂等投影、有界失败处理 | 未接线 |
| Migration 009 | quarantine、epoch lock、deadline、v2 procedures | 仅本地草案 |
| PG16 rehearsal | 空库、1-8 upgrade、故障/并发/恢复验证 | 本地 PASS |

## 不变量

- write/read authority 仍为 legacy。
- Candidate 旁路不得修改 scan ranking、analysis、strategy、READY、RR 或 frontend。
- source payload 不包含 trade plan、Outcome 或未来结果。
- Redis 不参与正确性。
- quarantine 不允许静默跳过；未解决时 phase advance 必须失败。
- production mutation、deployment 和 approval 均为 false。

## 当前结论

```text
PASS_LOCAL_IMPLEMENTATION_AND_REHEARSAL
BLOCKED_NOT_AUTHORIZED_FOR_PRODUCTION
```

Production readiness/approval packet 已在后续包本地完成；下一步仍必须获得新的独立明确审批，并且只允许 schema-only 应用/验证 migration 009，不能开启 shadow writer。
