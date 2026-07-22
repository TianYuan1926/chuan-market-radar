# 本轮交付报告

## 1. 本轮目标

消除普通生产 Bundle 对 OrcaTerm 人工上传和前台会话的依赖，建立不开放入站端口、不运输 secret、不接受任意命令的签名 pull-only 固定执行通道。

## 2. 范围边界

本轮只改 Runtime Control / Deployment：本地签名、专用 Git ref、服务器 pull agent、systemd timer、安装门禁、测试和治理文档。未改前端、业务 API、scan、analysis、strategy、backtest、数据库、Redis、Worker、Feature Flag、migration、现有 P0R 绑定或生产应用服务。

## 3. 修改文件清单

- `scripts/v2/production/fixed-channel/production-dispatch.mjs`：实现 keygen、prepare、validate、publish、agent initialize 和 agent-once；扫描合法归档路径内的凭证内容，异常租约只等待，claim 启动前同步到磁盘，无效单任务隔离后推进 cursor。
- `scripts/v2/production/fixed-channel/production-dispatch.test.mjs`：覆盖签名、篡改、时效、必需审批绑定、tar/path/secret、合法路径内凭证内容、commit reachability、WIP/异常租约、坏任务隔离和 exactly-once。
- `scripts/v2/production/fixed-channel/install-production-dispatch.sh`：一次性 exact-hash 安装器，source-set 包含安装器自身；因生产主机无 Node，安装器改为在 mutation 前从 Node.js 官方 HTTPS 下载固定 `v24.18.0` Linux x64，并验证官方归档、binary、license、架构和版本后只安装独立 runtime，不改全局 PATH。
- `scripts/v2/production/fixed-channel/install-production-dispatch-launcher.sh`：针对 OrcaTerm 特殊字符静默丢失的永久修复；用短 `verify/install` 命令核对精确 manifest、严格 facts、公钥、source-set 和 Node 固定事实，再把值交给原安装器，不能绕过原门禁。
- `scripts/v2/production/fixed-channel/*.service|*.timer|README.md`：20 秒 pull-only systemd 运行层和边界说明；agent 使用 `/opt/market-radar-production-dispatch/runtime/node --jitless`，其 Node 子进程继承固定 runtime PATH 与 `--jitless`，Bundle 从 staging 根目录启动。
- `docs/governance/production-fixed-dispatch-channel.v1.json`：机器可读合同。
- `docs/runbooks/PRODUCTION_FIXED_DISPATCH_CHANNEL_V1.md`：安装、日常发布、判定和例外运行手册。
- `.github/workflows/v2-production-dispatch-quality.yml`、`package.json`：把定向测试加入 V2 质量门禁，保持 GitHub-hosted job 无生产执行权；Legacy `production.yml` 未改变。
- `AUTONOMOUS_ENGINEERING_STATE.json`、两份权威蓝图、`PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：登记真实范围和当前未安装状态。

## 4. 对核心链路的影响

只加固 `全市场发现 -> 候选筛选 -> 深扫验证 -> 结构分析 -> 风险赔率 -> 交易计划 -> 复盘进化` 共用的发布地基。它不增加信号、不改变排序、不生成计划，也不提高任何交易结论等级。

## 5. 分层边界影响

- scan / analysis / strategy / backtest：无逻辑变更。
- frontend / API：无变更。
- DB / Redis / worker：无变更。
- deployment：新增本地实现，腾讯生产未安装。
- secret：明确禁止经 Git/Bundle 运输；P0R STS/MFA 继续使用服务器 `/dev/shm` 独立边界。

## 6. 风险说明

固定 agent 只减少运输和启动时间，不缩短 build、恢复、健康、观察或回滚门禁。旧包若声明 `approved_orcaterm_bundle_upload` 必须拒绝，只有明确生成 `signed_git_bundle` 的新包可进入。生产主机没有 Node，因此旧版 `/usr/bin/node` 方案不可安装；现已改成固定官方 runtime。OrcaTerm 的重复会话、输入和上传失败已触发 `RECURRENCE_ROOT_CAUSE_GATE`。其中长命令特殊字符丢失已由 source-set 绑定的短入口在代码和回归测试层根治，继续人工重输不再算进展；固定通道整体仍未生产安装，必须通过真实服务器验收后才能声称瓶颈关闭。

## 7. 执行命令

```bash
npm run test:production-dispatch
npm run production:dispatch:install-plan
npm run autonomy:status
npm run test:autonomy
npm run v2:consumer-map:generate
npm run v2:m0:verify
npm run ci:production
node --check scripts/v2/production/fixed-channel/production-dispatch.mjs
bash -n scripts/v2/production/fixed-channel/install-production-dispatch.sh
bash -n scripts/v2/production/fixed-channel/install-production-dispatch-launcher.sh
npx eslint scripts/v2/production/fixed-channel/production-dispatch.mjs scripts/v2/production/fixed-channel/production-dispatch.test.mjs
```

## 8. 测试结果

- `test:production-dispatch`：固定 runtime 与短入口修正后 PASS，13/13；包括完整包 verify 通过及 README 篡改后 fail-closed。
- `test:autonomy`：固定 runtime 与复发门禁登记后 PASS，31/31。
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
- production smoke：未运行，本轮尚未部署。
- `backtest:formal`：未运行，且本轮禁止运行。

## 9. 失败项

初次自治审计真实失败，原因是新增通道未登记到 active package 路径白名单；登记后 PASS。首次完整 CI 又真实失败：通道最初位于 `scripts/deploy/` 且修改 Legacy `production.yml`，M0 正确判定为 Legacy 冻结后新增入口。修复不是重签旧基线，而是把全部通道代码迁入 `scripts/v2/production/fixed-channel/`、恢复 Legacy workflow，并新增 V2 quality-only workflow；consumer map 回到 539 source / 273 runtime edges。腾讯只读预检随后抓到主机 `command_node=FAIL`，因此没有执行旧安装包；改为固定官方下载 runtime 后完整 CI 重新 PASS。OrcaTerm 长命令又出现特殊字符静默丢失，未继续重试，而是新增短入口和篡改回归；定向 13/13、自治 31/31 和完整 CI 均重新 PASS。生产安装和生产验收仍未发生，不包装成完成。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，明确记录固定通道本地实现但生产未安装，以及 P0R STS 例外。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入固定通道“一次性脱敏安装包准备”，不等于可以声明生产通道可用。生产安装仍需 exact source/public-key hash、动态预检和安装后零业务变更验证。

## 13. 下一轮建议

完成本轮全门禁后，准备并安装一次固定执行通道；随后普通无 secret 生产包改走 signed pull-only，P0R 临时凭证继续单独处理。
