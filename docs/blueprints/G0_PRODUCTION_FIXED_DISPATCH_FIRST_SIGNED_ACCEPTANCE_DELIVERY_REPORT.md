# 本轮交付报告

## 1. 本轮目标

在腾讯生产目标机完成固定 pull-only 通道的首个真实签名派发验收，证明普通无 secret Bundle 能脱离 OrcaTerm 文件上传和前台会话完成 `publish -> pull -> verify -> launch -> package acceptance`，同时不改变生产应用、数据、业务容器或交易 authority。

## 2. 范围边界

本轮只允许 Runtime Control 的签名派发状态、一次性 acceptance staging 和脱敏证据写入。明确禁止前端、业务 API、scan、analysis、strategy、backtest、数据库、Redis、Worker、Feature Flag、migration、环境变量、生产应用仓库和业务容器 mutation。

## 3. 修改文件清单

- `scripts/v2/production/fixed-channel/production-dispatch-acceptance.mjs`：以精确 sudo 非交互只读 allowlist 读取 Docker inventory 与 Redis PING，并输出零漂移证据。
- `scripts/v2/production/fixed-channel/production-dispatch-acceptance-bundle.mjs`：从 exact clean pushed commit 构建可复现、无 secret 的一次性验收 Bundle。
- `scripts/v2/production/fixed-channel/production-dispatch-acceptance.test.mjs`：覆盖请求边界、精确 Docker 权限、身份漂移拒绝、可复现构建和 staging 清理。
- `docs/governance/production-fixed-dispatch-channel.v1.json`：登记首单 dispatch、来源、哈希、目标验收和零漂移事实。
- `docs/governance/recurrence-root-cause-registry.v1.json`：把 stale upload 事故从 `REMEDIATION_IN_PROGRESS` 更新为 `CLOSED_VERIFIED`，open incident 从 1 降为 0。
- `docs/runbooks/PRODUCTION_FIXED_DISPATCH_CHANNEL_V1.md`：把首单待验收改为已通过，并禁止肉眼抄录长身份。
- V2 权威蓝图、机器 traceability、项目上下文和 changelog：只更新当前事实，不提升业务 readiness。

## 4. 对核心链路的影响

只加固核心链路共用的 Runtime Control / Deployment 地基。它缩短后续无 secret 生产包的运输和独立启动时间，但不增加全市场覆盖、机会发现、分析质量、交易计划数量或盈利能力。

## 5. 分层边界影响

- scan / analysis / strategy / backtest：无逻辑变更。
- frontend / API：无业务变更；只读读取既有 health 与前后端合同作为验收证据。
- DB / Redis / worker：未执行 mutation；Redis 只执行 PING。
- deployment：首个 signed dispatch 真实通过；业务 package 仍需逐包独立验收。
- secret：Bundle、request、Outbox 和生产证据均声明并验证 `containsSecrets=false`。

## 6. 风险说明

前三次失败没有被最终 PASS 覆盖：第一次暴露 `ubuntu` 无 Docker socket 读取权，修复为仅两个精确 Docker 只读调用使用 `sudo -n`；后两次因人工抄录 64 字符容器 ID 出错而被身份门禁正确拒绝。最终没有降低门槛，而是在目标机生成排序后的机器文件并执行 exact diff 后重新签发。人工长身份抄录已从运行手册退役。

固定通道仍禁止运输 STS、Token、数据库 URL、私钥和 `.env`。腾讯 MFA、secret rotation、P0R `/dev/shm` 临时凭证和紧急救援仍是明确例外。通道通过不等于 G0、M1 或网站实战能力完成。

## 7. 执行命令

```bash
npm run test:recurrence-gate
npm run test:production-dispatch
node scripts/v2/production/fixed-channel/production-dispatch-acceptance-bundle.mjs <exact bindings>
node scripts/v2/production/fixed-channel/production-dispatch.mjs prepare <exact signed outbox>
node scripts/v2/production/fixed-channel/production-dispatch.mjs validate <exact signed outbox>
node scripts/v2/production/fixed-channel/production-dispatch.mjs publish --branch production-dispatch <exact signed outbox>
git -C /home/ubuntu/apps/chuan-market-radar rev-parse HEAD
git -C /home/ubuntu/apps/chuan-market-radar status --porcelain=v1 --untracked-files=all
```

生产验收由固定 agent 和 acceptance runner 执行，不依赖浏览器保持连接。

## 8. 测试结果

- `test:recurrence-gate`：PASS，9/9；2 个 incident 均 `CLOSED_VERIFIED`，open=0，violations=0。
- `test:production-dispatch`：PASS，21/21。
- Bundle reproducibility：PASS；两次构建的 Bundle SHA-256 均为 `5e263bb5d26edacf479db43da8f482c4894b8810dddedebff5c0b4d234e682e3`，request SHA-256 均为 `b8168ed65c32c37bb1c8de8c804e5491d079c99e1e2e5ca9b7fe931d6a901fb2`。
- secret scan：PASS，无命中。
- dispatch publish：PASS，commit `467ce8e2156aabe399ca61211b232c9d81294c4e`，parent `776be1ad498ef71e054e2e5169c353b1b18695d5`。
- agent launch：`PASS_SESSION_INDEPENDENT_RUNNER_LAUNCHED`。
- package acceptance：`PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE`，evidence SHA-256 `e337f6b3b1940ba58149d13423ffd720886404401231c04fd0d9b09cc3037044`。
- production smoke：HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2` 前后相同，worktree clean，11 个容器身份不变，health=`ready`、scan=`ready/fresh`、persistence=`ready`、Redis=`PONG`、timer=`enabled/active`，staging absent。
- `npm run ci:production`：PASS，退出码 0；forbidden files、secret patterns、typecheck、lint、market 965/965（4 个明确 skip）、Worker 23/23、historical backtest 4/4、V2 Foundation 317/317（6 个明确 skip）、V2 Ops 115/115、M0 zero-drift、Next.js build、Golden 16/16 和 security check 全部通过。
- `backtest:formal`：未运行，且本轮禁止运行。

## 9. 失败项

- `g0-first-signed-20260722t201110z`：FAIL，Docker socket permission；失败 claim/result 保留。
- `g0-first-signed-retry-20260722t202929z`：FAIL，container identity mismatch；失败 claim/result 保留。
- `g0-first-signed-idfix-20260722t204024z`：FAIL，第二处人工 ID 转录错误；失败 claim/result 保留。
- `g0-first-signed-exact-20260722t211117z`：PASS，使用机器核对后的 exact identity；没有复用失败 dispatch。
- 首次本地 `ci:production` 在受限沙箱运行时，两个 Worker 测试因禁止监听 `127.0.0.1` 返回 `EPERM`；未修改代码或测试，原样移到允许本机回环监听的宿主测试环境后 23/23 PASS，完整门禁退出码 0。该环境失败保留，不冒充代码失败或提前 PASS。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新；登记首单生产验收、零漂移、复发关闭和 G0 不减数边界。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

在完整 `ci:production`、文档一致性、Git clean/push 和唯一诊断临时文件清理均通过前，不宣称本轮完整收口。

## 13. 下一轮建议

固定通道转入普通无 secret 包的默认运输层；工程主线回到当前最高优先 P0R 恢复准入与既定 V2/G0 顺序，不重复首单验收，不降低任何业务 Gate。

## 14. G0 计数真值

```text
G0 主步骤：7
当前步骤状态：固定生产派发 supporting unit 已通过生产验收；G0 业务主步骤未减数
当前剩余动作：完成本轮文档/门禁/清理/推送 -> 回到 7 个 Legacy 安全出口与 V2 主线
为什么还不能减数：本轮解决的是生产运输和独立启动地基，不是 Cycle final、Lineage/Reconciliation、Shadow Verify、Canonical Compat、Canonical Read Cutover、HTTPS/private session 或 Release truth/G0 exit 中任一业务出口
```
