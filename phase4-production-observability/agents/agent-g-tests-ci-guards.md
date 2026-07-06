# Agent G：Tests / CI Guards

## 结论

PASS。

## Guard 状态

- `.env` / `.env.*`：由 `.gitignore` 和 `ci:forbidden-files` 阻断。
- private key：由 `ci:secret-patterns` 阻断。
- `*.zip`：由 `.gitignore` 和 `ci:forbidden-files` 阻断。
- audit / evidence / logs / raw：由 `.gitignore` 和 `ci:forbidden-files` 阻断。
- production-evidence.zip：匹配 `*.zip`，不会进入 Git。
- runner token：`ci:secret-patterns` 可检测 TOKEN 类模式。

## workflow 默认部署风险

旧风险已修复：`production.yml` 不再监听 `push main`。

## 待验证命令

Agent H 阶段必须运行：

- `npm run typecheck`
- `npm run lint`
- `npm run test:market`
- `npm run build`
- `npm run backtest:golden`
- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`
- 第 4 步四个 dry-run 命令
