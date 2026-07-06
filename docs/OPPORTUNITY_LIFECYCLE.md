# Opportunity Lifecycle

本文定义机会生命周期模块的状态机和边界。该模块只用于机会追踪、复盘研究和人工审计，不改变实时生产排序。

## 生命周期状态

- `DISCOVERED`：发现层捕捉到异常。
- `CANDIDATE_OBSERVE`：进入候选观察。
- `DEEP_SCAN_PENDING`：等待深扫验证。
- `EVIDENCE_OBSERVE`：已有证据观察，但未进入策略就绪。
- `WAIT_CONDITION`：策略层给出等待条件。
- `BLOCKED`：被门禁或证据不足阻断。
- `TRADE_PLAN_READY`：后端结构化计划就绪。
- `INVALIDATED`：结构失效。
- `EXPIRED`：机会过期。
- `OUTCOME_REVIEWED`：后验结果已复盘。

## 分层来源

生命周期事件必须声明来源层：

- `scan`
- `analysis`
- `strategy`
- `review`

`OUTCOME_REVIEWED` 只能来自 `review` 层。后验 outcome 不能反向污染 scan、analysis 或 strategy。

## 只读边界

生命周期记录固定：

```text
allowedUse = research_only
canAutoExecute = false
canAutoAdjustWeights = false
canMutateLiveRanking = false
canMutateProductionRanking = false
```

## 当前代码

- `src/lib/lifecycle/types.ts`
- `src/lib/lifecycle/opportunity-lifecycle.ts`
- `src/lib/lifecycle/opportunity-lifecycle.test.ts`

当前实现只提供状态定义、状态转移验证和 research-only 生命周期构造，不接 UI、不接 API、不接 DB/Redis、不接生产 ranking。
