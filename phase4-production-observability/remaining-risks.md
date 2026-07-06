# 第 4 步剩余风险

## P0

无本轮新增 P0。

本轮没有发现以下问题：

- secret 泄露。
- `push main` 自动生产部署。
- WAIT / BLOCKED / OBSERVE 被提升为 READY。
- 非 READY 图表 overlay 显示 entry / stop / target。
- 证据 zip 被 Git 跟踪。

## P1

1. 真实腾讯云生产尚未执行本轮代码部署。
   - 影响：本轮只能证明本地工程链路和 dry-run 可用，不能证明腾讯云生产已更新。
   - 下一步：需要用户和 GPT 验收后，再显式授权生产部署验证。

2. 真实生产 health / smoke 尚未对公网或腾讯云环境执行。
   - 影响：`production-health.json`、`production-smoke.json` 当前是 dry-run 结构证据，不是生产运行证据。
   - 下一步：部署轮使用 `--base-url` 对生产入口执行只读 health / smoke / status。

3. GitHub Actions 的真实 production deploy 仍未接 self-hosted runner。
   - 影响：自动化链路已具备治理框架，但真实腾讯云自动部署仍需单独安全配置。
   - 下一步：不要在本轮配置 runner token；后续单独做 runner 安全接入任务。

## P2

1. `src/data/mock-signals.ts` 等旧 mock 资产仍存在。
   - 影响：本轮未新增引用；后续仍需持续防止 mock 进入生产事实源。
   - 当前保护：CI guard、单一事实源、前端合同和生产观测 smoke。

2. `production:evidence` dry-run 会覆盖 phase4 目录中的部分模板文件。
   - 影响：后续如重新运行 evidence，需要再次确认最终报告是否被模板覆盖。
   - 当前处理：本轮在最终 dry-run 后手工补齐正式报告文件。
