# Legacy / Mock / Old Contract 隔离计划

本轮不危险删除旧资产，而是建立隔离规则，防止旧逻辑误入生产主链路。

## 生产主链路

- `src/lib/api/frontend-contract.ts`
- `src/lib/frontend-contract-server.ts`
- `src/lib/signal-state-semantics.ts`
- `src/lib/ui-schema/`
- `src/lib/contracts/`
- `src/lib/market/`
- `src/lib/analysis/v3/`
- `src/lib/review/research-only-boundary.ts`

## 不允许进入生产主链路的内容

- mock provider
- old contract adapter
- legacy UI fallback
- audit raw sample
- backtest future outcome
- raw evidence package
- local screenshots / zip / log

## 隔离规则

1. mock 只能用于测试或 demo，不允许被 production API import。
2. `src/lib/market/provider-registry.ts` 必须 fail-closed：真实 provider 未配置时返回 `unconfigured`，不得静态 import `mock-market-provider`。
3. old report 只能归档，不允许被 review 当作最新结果。
4. audit 包、raw log、zip、exitcode 不进入 Git。
5. 如果文件仍有参考价值，优先迁移到 `docs/archive/` 或加文件头 `DO_NOT_IMPORT_IN_PRODUCTION`。
6. 发现已被 Git 跟踪的审计包或 secret 相关文件时，停止提交并单独报告。

## 当前执行

- `.gitignore` 已覆盖 audit、zip、log、raw、evidence、env、build 输出。
- `scripts/ci/check-forbidden-files.sh` 会阻止禁入文件被 Git 跟踪。
- `scripts/ci/check-secret-patterns.sh` 会扫描源码中的明显 secret 模式。
- `provider-registry` 已用 `unconfigured` provider 替代生产 mock fallback；mock provider 只能通过测试/demo 明确导入。

## 后续清理

下一轮如果要删除旧文件，必须先列出：

- 文件路径
- 是否被生产 import
- 是否有测试引用
- 删除或归档方案
