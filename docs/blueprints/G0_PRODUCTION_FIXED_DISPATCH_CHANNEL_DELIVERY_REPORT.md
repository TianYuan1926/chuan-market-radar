# 本轮交付报告

> 历史安装阶段报告：本文保留固定通道安装时点的真实事实，不代表当前状态。当前首个 signed dispatch 的生产验收结论见 [固定生产派发首单验收报告](./G0_PRODUCTION_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE_DELIVERY_REPORT.md)。

## 1. 本轮目标

消除普通生产 Bundle 对 OrcaTerm 人工上传和前台会话的依赖，建立不开放入站端口、不运输 secret、不接受任意命令的签名 pull-only 固定执行通道。

## 2. 范围边界

本轮只改 Runtime Control / Deployment：本地签名、专用 Git ref、服务器 pull agent、systemd timer、安装门禁、测试和治理文档。未改前端、业务 API、scan、analysis、strategy、backtest、数据库、Redis、Worker、Feature Flag、migration、现有 P0R 绑定或生产应用服务。

## 3. 修改文件清单

- `scripts/v2/production/fixed-channel/production-dispatch.mjs`：实现 keygen、prepare、validate、publish、agent initialize 和 agent-once；扫描合法归档路径内的凭证内容，异常租约只等待，claim 启动前同步到磁盘，无效单任务隔离后推进 cursor。
- `scripts/v2/production/fixed-channel/production-dispatch.test.mjs`：覆盖签名、篡改、时效、必需审批绑定、tar/path/secret、合法路径内凭证内容、commit reachability、WIP/异常租约、坏任务隔离和 exactly-once。
- `scripts/v2/production/fixed-channel/install-production-dispatch.sh`：一次性 exact-hash 安装器，source-set 包含安装器自身；固定官方下载 Node `v24.18.0`，并把状态根固定到 service-owned `/var/lib/market-radar-production-dispatch`，避免依赖共享 root-only 目录。
- `scripts/v2/production/fixed-channel/install-production-dispatch-launcher.sh`：短 `verify/install` 入口；Deploy Key 身份统一按 `key type + key body` canonical form 哈希，注释不能再造成生产与构建端身份漂移。
- `scripts/v2/production/fixed-channel/*.service|*.timer|README.md`：20 秒 pull-only systemd 运行层；agent 使用固定 `/opt/market-radar-production-dispatch/runtime/node --jitless`，只写独立状态根，Bundle 从 staging 根目录启动。
- `docs/governance/production-fixed-dispatch-channel.v1.json`：机器可读合同。
- `docs/governance/recurrence-root-cause-registry.v1.json`、`scripts/v2/production/fixed-channel/recurrence-root-cause-gate.mjs` 及其测试：把复发指纹、根因、永久修复、红绿回归、运行门禁和真实目标验收做成中央注册表与 operation fail-closed 门禁；实现物理隔离在 V2 control plane，不修改或扩张 Legacy 运行图。
- `docs/runbooks/PRODUCTION_FIXED_DISPATCH_CHANNEL_V1.md`：安装、日常发布、判定和例外运行手册。
- `.github/workflows/v2-production-dispatch-quality.yml`、`package.json`：把定向测试加入 V2 质量门禁，保持 GitHub-hosted job 无生产执行权；Legacy `production.yml` 未改变。
- `AUTONOMOUS_ENGINEERING_STATE.json`、两份权威蓝图、`PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：登记“已安装、首个真实 signed dispatch 待验收”的当前真值。

## 4. 对核心链路的影响

只加固 `全市场发现 -> 候选筛选 -> 深扫验证 -> 结构分析 -> 风险赔率 -> 交易计划 -> 复盘进化` 共用的发布地基。它不增加信号、不改变排序、不生成计划，也不提高任何交易结论等级。

## 5. 分层边界影响

- scan / analysis / strategy / backtest：无逻辑变更。
- frontend / API：无变更。
- DB / Redis / worker：无变更。
- deployment：固定 Runtime Control 已安装；业务应用、仓库、容器、数据库、Redis 和 Worker 零 mutation。
- secret：明确禁止经 Git/Bundle 运输；P0R STS/MFA 继续使用服务器 `/dev/shm` 独立边界。

## 6. 风险说明

固定 agent 只减少运输和启动时间，不缩短 build、恢复、健康、观察或回滚门禁。旧包若声明 `approved_orcaterm_bundle_upload` 必须拒绝，只有明确生成 `signed_git_bundle` 的新包可进入。安装已真实通过，但尚未有一项真实 package 完成 `publish -> pull -> verify -> launch -> runner acceptance`，因此当前不能把日常运输写成闭环。OrcaTerm 输入完整性事故已有真实短入口安装证据，状态为 `CLOSED_VERIFIED`；stale upload 事故仍为 `REMEDIATION_IN_PROGRESS`，必须等首个真实 signed dispatch 才能关闭。

## 7. 执行命令

```bash
npm run test:production-dispatch
npm run test:recurrence-gate
npm run recurrence:status
npm run production:dispatch:install-plan
npm run autonomy:status
npm run test:autonomy
npm run v2:consumer-map:generate
npm run v2:m0:verify
npm run ci:production
node scripts/v2/production/fixed-channel/build-install-package.mjs --deploy-public-key <public-key> --dispatch-public-key <dispatch-public-key> --output-root <outside-repo-root>
bash install-production-dispatch-launcher.sh verify
bash install-production-dispatch-launcher.sh install
systemctl is-enabled market-radar-production-dispatch.timer
systemctl is-active market-radar-production-dispatch.timer
journalctl -u market-radar-production-dispatch.service --no-pager -n 30
git -C /home/ubuntu/apps/chuan-market-radar rev-parse HEAD
git -C /home/ubuntu/apps/chuan-market-radar status --short
sudo docker ps -q --no-trunc
curl -kfsSL 127.0.0.1/api/health
curl -kfsSL 127.0.0.1/api/frontend/radar-contract
curl -kfsSL 127.0.0.1/api/radar/backend-contract
sudo ss -lntp
node --check scripts/v2/production/fixed-channel/production-dispatch.mjs
bash -n scripts/v2/production/fixed-channel/install-production-dispatch.sh
bash -n scripts/v2/production/fixed-channel/install-production-dispatch-launcher.sh
npx eslint scripts/v2/production/fixed-channel/production-dispatch.mjs scripts/v2/production/fixed-channel/production-dispatch.test.mjs
```

## 8. 测试结果

- `test:production-dispatch`：PASS，14/14；包括 canonical Deploy Key、独立 state root、完整包 verify 及篡改 fail-closed。
- `test:recurrence-gate`：PASS，9/9；实际注册表 1 CLOSED / 1 open、结构违规 0，active operation 为首个 signed dispatch 验收。
- `test:autonomy`：PASS，31/31；Legacy 自治控制器保持审计基线原样。复发门禁独立验证 active package 未声明 recurrence operation 时 fail closed。
- `autonomy:status`：PASS，scope violations=0。
- `typecheck`：PASS。
- `lint`：PASS。
- `test:market`：PASS。
- `test:v2-foundation`：PASS，317 pass / 0 fail / 6 explicit skip。
- `test:v2-ops`：PASS，115/115；Go helper PASS。
- `v2:m0:verify`：`PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED`，Legacy protected source drift=0。
- `build`：PASS。
- `backtest:golden`：PASS，16/16。
- security gates：forbidden files、secret patterns、security check 全部 PASS。
- production smoke：PASS。安装返回 `PASS_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH_INSTALLED`；timer enabled/active，agent 持续 `IDLE_NO_DISPATCH_REF`；production HEAD/clean worktree 和 11 个容器 ID 与基线完全一致；health=`ready`、scan=`ready/fresh`、persistence guard=`ready`、Redis=`PONG`，前后端合同非空，无新增监听端口。
- `backtest:formal`：未运行，且本轮禁止运行。

## 9. 失败项

所有失败均保留为失败，没有包装成完成：早期 V2/Legacy 边界、生产无 Node、OrcaTerm 长命令丢字符和两次 0B 上传均按既有报告收口。生产安装阶段又发现两项代码根因：`471a226` 包在 mutation 前因构建端哈希 canonical public key、launcher 却哈希带注释整行而拒绝；统一 canonical form 后，`966bc60` 进入安装但 agent 初始化因共享 `/var/lib/market-radar-ops` 为 root `0700` 而 `EACCES`，安装器自动回滚。没有放宽共享目录权限，而是创建独立 `0700 ubuntu:ubuntu` 状态根；`7a59e45b` 最终安装 PASS。验收时一次手工 `pg_isready` 被 OrcaTerm 再次改写为 `pgisready`，该命令明确不计证据；Postgres 采用真实 `/api/health` persistence guard=`ready` 与未变容器身份验收。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，明确记录生产 timer 已安装、业务零扰动、首个真实 signed dispatch 待验收，以及 P0R STS 例外。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入首个真实 signed dispatch 验收，不等于 G0 完成，也不等于该 package 的生产结果 PASS。

## 13. 下一轮建议

只选择一个无 secret、可自动回滚、已有 exact runner 的真实生产包作为首单，完成 signed publish/pull/launch/runner acceptance；P0R 临时凭证继续单独处理。
