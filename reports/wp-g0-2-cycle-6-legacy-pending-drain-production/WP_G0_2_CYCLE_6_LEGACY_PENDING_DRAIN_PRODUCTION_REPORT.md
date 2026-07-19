# 本轮交付报告

## 1. 本轮目标

在不启动 Cycle-7、不切换读写权威、不修改 schema/env/Redis/非目标服务的前提下，精确恢复 Cycle-6 失败回滚后遗留的 48 条 Legacy pending，形成可启动 fresh Cycle-7 的干净生产基线。

## 2. 范围边界

本轮只执行 `WP-G0.2-CYCLE-6-LEGACY-PENDING-DRAIN-PRODUCTION`。允许上传脱敏 deterministic bundle 与 approval request、创建一次性 staging、启动 transient systemd runner、执行 48 条 pending drain、读取 evidence 并清理临时上传件。未修改 frontend、scan、analysis、strategy、backtest、migration、Redis、env、Caddy、Feature Flag、GitHub main 或生产仓库源码。

## 3. 修改文件清单

- `PROJECT_CONTEXT_FOR_CHATGPT.md`：记录生产 drain 已 PASS 的当前事实。
- `CHANGELOG_FOR_CHATGPT.md`：追加本轮生产执行摘要。
- `reports/wp-g0-2-cycle-6-legacy-pending-drain-production/WP_G0_2_CYCLE_6_LEGACY_PENDING_DRAIN_PRODUCTION_REPORT.md`：新增本轮中文交付报告。

## 4. 对核心链路的影响

影响候选筛选与复盘进化之间的 Candidate 生命周期真值。Legacy lane pending 已归零，Candidate event mirror lane 保持完整 pending，不生成信号、不改变排序、不生成交易计划。

## 5. 分层边界影响

- scan / analysis / strategy / backtest / frontend：不影响。
- API：只读验证 `/api/health`、frontend/backend/business 合同端点。
- DB：只执行本包授权的 48 条 Legacy pending drain 和控制行 refreeze；无 migration / schema 变更。
- Redis：只读健康验证 `PONG`。
- worker：临时 drain 结束后 Candidate Worker absent；scanner 恢复 ready/fresh。
- deployment：无 Web/Caddy/GitHub main 发布；systemd transient unit 执行后 success/deactivated。
- secret：未输出 secret，evidence `secretsPrinted=false`。

## 6. 风险说明

本轮 PASS 只代表 Cycle-6 legacy pending 清账完成，不代表 Cycle-7 观察、Shadow Verify、Canonical Compat、HTTPS 或 G0 出口完成。Cycle-6 失败观察样本仍然只能作为失败历史，不得复用或重标 PASS。

## 7. 执行命令

- 通过 OrcaTerm 上传并校验 bundle/request：bundle SHA-256 `ffb016f807a4efc935cafc958211481752edaf246fd4e1b6628aee897b533455`，request SHA-256 `14443ee3e8fd8f804b82028b6258f25f436889f5af10a119eef61764b61a1ea3`。
- 创建 staging：`/home/ubuntu/.cache/market-radar-ops/wp-g0-2-pending-drain-47741f322224-591e5e9b`。
- 启动 transient unit：`market-radar-pending-drain-47741f3-591e5e9b.service`。
- 读取 `systemctl show`、`journalctl`、runner evidence、health 和合同端点。
- 清理远端 `/tmp` b64、上传 tar/request、launcher log、本地临时 staging 和 duplicate continuation tar。

## 8. 测试结果

- 生产 runner：PASS，`PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN`。
- systemd unit：PASS，`Result=success`，`ActiveState=inactive`，`SubState=dead`。
- lease：PASS，最终 outcome=`PASS`。
- DB evidence：PASS，drained=`48`，completed/events=`5,266`，Legacy pending/unresolved=`0`，outbox=`10,532`，global pending/unresolved=`5,266`，final phase=`legacy`，final epoch=`4`，writeFrozen=`true`。
- health/API：PASS，`/api/health` ready/fresh，frontend/backend/business 合同端点 OK。
- Candidate Worker：PASS，absent。
- 临时文件清理：PASS，远端上传件和本地误生成临时件已清理。
- formal：未运行且禁止。

## 9. 失败项

上传阶段发现两类问题并已处理：OrcaTerm 大块粘贴会造成文件 SHA 漂移；`openssl base64 -d` 对超长单行只解出 678 字节。均未进入生产执行，坏上传已删除；最终改为校验 b64 后使用系统 `base64 -d`，二进制 SHA 与 tar 清单均正确后才启动 runner。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入 fresh Cycle-7 request 生成与启动准备；不可以宣称 G0 减数或进入非依赖顺序的 authority cutover。

## 13. 下一轮建议

只执行 `WP-G0.2-CYCLE-7-FRESH-ACTIVATION`：从当前生产干净基线重新 preflight，生成全新 request，启动 Cycle-7，并进入独立 24 小时/289 样本/10,000 writes 观察。
