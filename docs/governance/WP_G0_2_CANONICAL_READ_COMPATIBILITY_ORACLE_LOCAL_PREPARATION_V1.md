# WP-G0.2 Canonical Read Compatibility Oracle 本地准备合同 v1

状态：`PASS_LOCAL_PREPARATION` 仅在全部门禁通过后成立。
生产授权：`false`。
下一生产包：等待真实 `PASS_ACTIVATE_AND_OBSERVE` 后，只能是独立审批的只读 Reconciliation；不得直接进入 Canonical。

## 1. 为什么不能直接比较 Legacy 与 Canonical

Legacy journal/event 投影没有数据库级 Episode identity、单活跃约束、immutable firstSeen、release/scan lineage、Checkpoint identity/fencing、exactly-once terminal Outcome、evidence-grade version 或权威 Review 分母。把这些字段补成 0、null、默认 long 或从 Candidate 表反查后再称为 Legacy parity，都是假对账。

Legacy adapter 因此只能输出 `diagnostic_only / partial / empty / unavailable`，并固定列出 unsupported Canonical fields。它永远满足：

```text
canProveCanonicalParity=false
canAuthorizeCutover=false
canCreateTradePlan=false
canMutateLiveRanking=false
```

## 2. 真实 0 差异的定义

Canonical 0 差异只允许比较：

1. Candidate 主聚合 Read Model。
2. 同一个 `SERIALIZABLE READ ONLY DEFERRABLE` 数据库快照内，从 Episode、Checkpoint、Outcome 原始行独立重算的 Oracle。

Oracle 不调用主查询的 `mapReview` 或聚合结果。它独立执行 policy 过滤、分页、null/unknown 映射、分母、rate、excluded reason、metric sample、不变量和重复 identity 检测。policy、Episode 字段、page 和 Review 任一差异都必须失败。

## 3. 路由语义

- `shadow_verify`：返回 Legacy diagnostic；同时记录 Candidate-vs-Oracle reference parity。
- `canonical_compat`：只有当前请求的 reference parity PASS 才返回 Candidate；否则显式 Legacy fallback。
- `canonical`：Candidate 为唯一读源，失败返回 partial/unavailable，禁止静默回退。
- parity sample 使用 `candidate-read-parity-sample.v2` 和 `referenceStatus`，不再把 Legacy 冒充 reference。
- 两个 24 小时窗口、每窗至少 289 样本、最大间隔 600 秒、0 difference、0 partial/unavailable 的门槛不变。
- PASS 不自动切 phase，也不授权生产 cutover。

## 4. 权限与边界

- Oracle Reader 只读 Episode、Checkpoint、Outcome；Outbox 读取必须返回 42501。
- 本包只使用一次性本地 PostgreSQL 16，不连接生产。
- 禁止 API、前端、migration、Compose、Feature Flag、control、worker、Redis、scan、analysis、strategy、risk、backtest 和 production ranking 变更。
- future outcome、MFE/MAE 或 hit 可以作为 Outcome/Review 只读结果，但永远不能进入生产发现、排序、分析或策略输入。

## 5. 仍未完成

生产 Reader LOGIN/URL、Legacy API response diagnostic 接线、Candidate API resource envelope、前端适配器、真实 dual-read 观察和 canonical cutover 均未实施。本地 PASS 不等于 WP-G0.2、G0 或实战能力完成。
