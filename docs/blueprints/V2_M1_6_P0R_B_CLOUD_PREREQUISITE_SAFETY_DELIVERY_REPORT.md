# 本轮交付报告

状态：`LOCAL_ENGINEERING_PASS / EXTERNAL_COS_KEY_STS_NOT_PROVISIONED / PRODUCTION_RECOVERY_NOT_EXECUTED / P0_STILL_BLOCKED`

## 1. 本轮目标

修正 P0R 云资源前置链路的真实性缺口：把 COS bucket、唯一对象、生产源 IP、STS policy、临时 credential 和运行编号锁成一份 checksum-bound 计划；机器证明香港单可用区、上传前对象不存在和 exact version retrieval。不得把 versioning 下无效的 overwrite header 继续包装成防覆盖能力。

## 2. 范围边界

本轮只修改 P0R COS/STS 计划、bundle、runner、archive helper、recovery evidence、测试和权威文档。未创建腾讯 COS bucket，未签发 STS，未生成或传输 age 私钥，未上传 bundle，未执行生产 backup/restore，未付费、未关机、未扩容；未修改前端、API、scan、analysis、strategy、backtest、数据库 schema、Redis、Worker、env、Feature Flag 或生产仓库。

## 3. 修改文件清单

- `scripts/v2/production/m1-production-storage-p0r-cos-provisioning.mjs` 与测试：生成 128-bit 高熵 run-id、单 AZ COS/STS plan，校验当前腾讯 STS response，并只在 `/dev/shm` 编译 v2 临时凭证。
- `scripts/v2/production/m1-production-storage-p0r-bundle.mjs` 与测试：只有 clean commit + exact provisioning plan 才能形成 approval-eligible bundle；plan、tool 和 source 全部 checksum 绑定。
- `scripts/v2/production/m1-production-storage-p0r-runner.sh` 与测试：执行前验证 plan/source/run-id，向 archive helper 传入 exact plan。
- `scripts/v2/production/p0r-cos-archive/main.go` 与测试：新增 HEAD Bucket region/单 AZ、plan/credential 绑定、上传前 key absence、exact version 证据，并拒绝 multi-AZ 与已存在对象。
- `scripts/v2/production/m1-production-storage-recovery-evidence.mjs` 与测试：backup/COS evidence 升级 v2，把单 AZ、region、plan/policy/request digest、pre-upload absence 与真实 overwrite mode 变成硬门禁。
- `package.json`：P0R 专用门禁纳入新测试和 plan CLI。
- P0R 合同、运行手册、总蓝图、机器矩阵、索引、施工顺序、项目上下文和 Changelog：登记当前事实并作废旧“无覆盖上传”误述。

## 4. 对核心链路的影响

本轮保护 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产存储与恢复地基，避免后续 Fact 分区在不可恢复或证据虚假的底座上启用。它不增加发现机会、不产生 Candidate、方向、等级、入场、止损、目标或交易计划。

## 5. 分层边界影响

- scan / analysis / strategy / backtest：无逻辑变化。
- frontend / API：无变化。
- DB / Redis / worker / deployment：生产零变化；只增强尚未执行的恢复工具。
- secret：仓库和 bundle 不含 secret；bundle 含受限 COS 目标元数据。raw STS response 与编译 credential 只允许 `/dev/shm` mode 600，raw response 编译后强制删除。
- external resources：控制台只读确认 COS inventory=0；180GB 套餐可选但涉及费用与强制关机，本轮没有执行。

## 6. 风险说明

- 本地测试仍不等于腾讯真实 bucket、STS、对象或数据库恢复；P0 保持 `BLOCKED`，P1 关闭。
- Object Lock 是不可撤销安全动作且当前不支持 multi-AZ；创建时选错 bucket 类型不能靠后续脚本修正。
- plan/request/policy digest 与 RequestId 绑定申请材料和腾讯响应，但不能从 token 内部反解服务端 policy；签发现场仍必须核对 API Explorer 请求。
- `x-cos-forbid-overwrite` 在 versioning 下无效。当前合同只宣称高熵唯一 key、上传前 HEAD 404 和 exact versionId，不宣称服务端无覆盖锁。
- 2026-07-21 只读预览显示 4C16G/180GB 套餐应付 1206.45 元；价格会变化，最终财务与强制关机动作必须由用户完成。

## 7. 执行命令

```text
node --test scripts/v2/production/m1-production-storage-p0r-cos-provisioning.test.mjs
npm run test:v2-m1-p0r
npm run test:v2-ops
npm run v2:m0:verify
git diff --check
npm run ci:production
```

`npm run backtest:formal` 未运行，因为本轮不是能力验收或正式回测轮。

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：PASS。
- `npm run build`：PASS。
- `npm run backtest:golden`：PASS，16/16。
- `npm run test:v2-m1-p0r`：PASS，35/35；Go helper PASS。
- `npm run test:v2-ops`：PASS，89/89；Go helper PASS。
- `npm run v2:m0:verify`：PASS，11/11。
- `npm run ci:production`：PASS，V2 277 pass / 0 fail / 5 explicit skips，security PASS。
- production smoke：未运行，本轮没有部署或生产执行。

## 9. 失败项

无测试失败。外部生产动作未执行，不得计为失败或 PASS；当前仍缺真实 COS、离机 age key、STS、backup/retrieval/restore、容量整改和 fresh P0。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，且保持 400 行上限。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.6-P0R-B1-COS-KEY-STS-EXTERNAL-PROVISIONING`，但这只是允许按计划进行安全敏感的外部资源确认与创建，不代表允许 P1、migration、生产写入或容量付费动作。

## 13. 下一轮建议

只执行 P0R-B1：按运行手册确认 Object Lock 白名单，创建香港单 AZ 私有 COS，生成并离机保管 age 身份，签发与 plan 完全一致的 7200 秒 STS；完成后立即进入同一运行编号的 P0R-C 真实备份/取回/隔离恢复，不混入扩容或 P1。
