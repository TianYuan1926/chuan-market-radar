# Agent H 测试与回归报告

## 结论

通过。本轮基础门禁和新增模块定向覆盖均通过。

## 已运行命令

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`

## 结果

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run typecheck` | pass | exit=0 |
| `npm run lint` | pass | exit=0 |
| `npm run test:market` | pass | 市场核心 803 pass，worker 17 pass，historical smoke 4 pass |
| `npm run build` | pass | Next.js 生产构建通过 |
| `npm run backtest:golden` | pass | 16/16 |
| `npm run ci:forbidden-files` | pass | Forbidden tracked file check passed |
| `npm run ci:secret-patterns` | pass | Tracked source secret pattern check passed |

## 未运行

- `npm run backtest:formal`：未运行。第 3 步不是正式能力验收轮，任务明确禁止 formal。
- `production:smoke`：未运行。本轮不部署、不验证生产。

## 风险

- 通过测试只能证明本轮代码边界和本地构建健康，不证明腾讯云生产已同步。
- 本轮新增模块多为后端基础件，尚未接入前端/API，所以不能包装成已实战成熟。
