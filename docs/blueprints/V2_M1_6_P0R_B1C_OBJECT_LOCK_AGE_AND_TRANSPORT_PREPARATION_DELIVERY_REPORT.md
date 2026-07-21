# 本轮交付报告

任务：`V2-M1.6-P0R-B1C-OBJECT-LOCK-AGE-AND-TRANSPORT-PREPARATION`

状态：`OBJECT_LOCK_31D_ENABLED_AND_VERIFIED / AGE_IDENTITY_KEYCHAIN_PASS / PRODUCTION_TRANSPORT_BUNDLE_PASS / STS_AND_RECOVERY_PENDING / P0_BLOCKED`

日期：2026-07-21

## 1. 本轮目标

在不触碰生产数据库和服务的前提下，完成真实 Object Lock、离机 age 身份和 exact clean-commit P0R 传输包，把恢复链推进到 7200 秒最小权限 STS 创建前。

## 2. 范围边界

本轮真实外部动作只有：腾讯 COS 专用桶启用默认 `COMPLIANCE` 31 天并回读验证；macOS Keychain 创建一份 age X25519 恢复身份。未签发 STS、未上传备份对象、未读取生产数据库、未启动隔离恢复、未修改数据库、Redis、Worker、应用服务、env、Feature Flag、migration 或生产仓库。

## 3. 修改文件清单

- `scripts/v2/production/m1-production-storage-p0r-bundle.mjs`：Go 测试使用宿主平台，只有 release binary 交叉编译为 Linux/amd64。
- `scripts/v2/production/m1-production-storage-p0r-bundle.test.mjs`：增加环境合同和真实 helper 构建反例。
- Git 外受限区：保存官方工具 archive、public recipient、无私钥 attestation、当前 provisioning plan 和生产 transport bundle；均不进入 Git。
- `docs/runbooks/V2_M1_6_P0R_PRODUCTION_RECOVERY_RUNBOOK.md` 与权威状态文档：更新当前事实和唯一下一动作。

## 4. 对核心链路的影响

只加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的恢复地基。它不增加扫描、候选、信号、Analysis、Strategy 或交易计划能力。

## 5. 分层边界影响

- `scan / analysis / strategy / backtest / frontend / API`：未修改。
- `DB / Redis / worker / deployment`：生产零变更。
- `secret`：age 私钥仅保存在 macOS 登录 Keychain；Git 外 attestation 和 bundle 均不含私钥或长期 credential。
- `COS`：Object Lock 已启用；对象仍未上传。

## 6. 风险说明

1. Object Lock 为不可关闭的安全设置，默认 retention 只能延长；当前已按用户动作级确认启用 31 天。
2. transport bundle 含受限目标元数据，必须保持 mode 600，只能上传到指定腾讯生产 staging，执行后清理。
3. STS 尚未创建；production backup、exact version retrieval、isolated restore parity、RPO/RTO 和 cleanup 均未发生，不能写恢复 PASS。

## 7. 执行命令

```bash
npm run test:v2-m1-p0r
npm run ci:production
node scripts/v2/production/m1-production-storage-p0r-cos-provisioning.mjs create-plan ...
node scripts/v2/production/m1-production-storage-p0r-bundle.mjs ...
shasum -a 256 <restricted-bundle>
tar -tzf <restricted-bundle>
```

外部控制台：Microsoft Edge 腾讯 COS Object Lock 页面，只在用户确认后保存并回读。

## 8. 测试结果

- Object Lock 回读：`ENABLED / COMPLIANCE / 31 DAYS`。
- age vault：`PASS_P0R_AGE_IDENTITY_VAULT`，Keychain readback 与 public attestation PASS。
- P0R 定向：61/61 PASS，Go helper PASS。
- production transport：`PASS_P0R_PRODUCTION_TRANSPORT_BUNDLE`。
- source commit：`6a81e865e61569f7d2d7c3bb3be1d78db72a9eab`。
- bundle SHA-256：`02e164cd90e26b449c741ddd8e8e1683426005613a85dbc80573cf67a76b0e04`。
- manifest digest：`sha256:9682c6a2e92c472219bfc221a2179cedaf288731bad27134e038d18fc894181b`。
- bundle size：9,047,400 bytes；mode 600；12/12 listed payload hashes match；containsSecrets=false；containsPrivateKey=false。
- 完整 `npm run ci:production`：PASS；具体总数见同日 M3.0 报告。
- production smoke：未运行，因为生产应用未部署。

## 9. 失败项

首次 transport 构建真实失败：builder 把 `go test` 与 Linux release build 共用 `GOOS=linux GOARCH=amd64`，导致 macOS 执行 Linux test binary 时 `exec format error`。已拆分 host-test 与 linux-build 环境，并用真实 helper 构建测试覆盖；没有跳过测试或手工伪造 bundle。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：Object Lock、age identity 和 transport bundle 已完成，STS/生产恢复/fresh P0 仍待执行。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入同一 plan 的 7200 秒最小权限 STS、受限上传和 P0R-C 生产恢复执行；不可以进入 P1。

## 13. 下一轮建议

只执行一次 `STS -> upload -> plan -> encrypted backup -> exact version retrieval -> isolated PG16 restore -> cleanup`，任一校验失败立即保持 P0 BLOCKED。
