# Agent D - 用户可见文案与视觉误导审查

## 范围

审查图表 label、WAIT / OBSERVE / BLOCKED 表达、旧误导词和 grep 命中。本 Agent 不改业务逻辑。

## grep 结果

- `visible-language-risk-grep.txt`：49 行命中。
- 命中集中在：
  - `docs/NAMING_STANDARD.md`：列出禁用词和替换词。
  - `src/lib/ui-schema/display-names.ts`：禁用词映射表。
  - `src/lib/ui-schema/*.test.ts`：防回归测试 fixture。

## 人工判断

PASS。

未发现新增生产用户可见误导文案。命中均属于：

1. 命名规范文档。
2. 禁用词映射表。
3. guard 测试 fixture。

## 图表文案变化

- 旧 `失效` 改为 `失效观察`，降低“交易计划止损线”的误读风险。
- WAIT overlay 使用 `等待触发区`、`等待失效参考`，不使用 entry / stop / target 命名。
- ready plan overlay 仍使用 `结构止损` / `TP`，但只在 `TRADE_PLAN_READY + readyPlan + live` 时可见。

## 剩余 cleanup

P2：旧词仍存在于规范文档和测试 fixture 中，这是为了防回归，不是 production 风险。

