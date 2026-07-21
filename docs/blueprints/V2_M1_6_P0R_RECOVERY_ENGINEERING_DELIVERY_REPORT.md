# 本轮交付报告

状态：`HISTORICAL_LOCAL_RECOVERY_ENGINEERING_PASS / SUPERSEDED_IN_PART_BY_P0R_B_CLOUD_PREREQUISITE_HARDENING / PRODUCTION_RECOVERY_NOT_EXECUTED / P0_STILL_BLOCKED`

更正说明：本报告形成后重新核对腾讯官方 `PUT Object` 合同，确认 versioning 启用时 `x-cos-forbid-overwrite` 不生效。本报告不得再被解读为已经具备服务端无覆盖保证；现行权威改为高熵唯一 key、上传前对象不存在证明和 exact versionId 取回，详见 P0R-B 交付报告与运行手册。

## 1. 本轮目标

为 M1.6-P0 暴露的 recovery evidence 缺口建立一套 fail-closed 的生产执行工具：从同一 PostgreSQL 只读快照生成 fingerprint 与加密备份，把密文存入私有腾讯 COS，精确取回同一对象版本，在无生产网络的独立 PostgreSQL 16 中恢复并比对，再生成 P0 strict recovery evidence。该工具不得执行 migration、改变生产服务或把本地测试冒充生产恢复。

## 2. 范围边界

本轮只实现 P0R recovery artifact、runner、verifier、COS helper、失败注入测试和权威文档。明确未执行真实生产备份、COS 上传、隔离恢复、系统盘扩容、生产健康验证或 fresh P0；未修改 scan、analysis、strategy、backtest 逻辑、前端、API、数据库 schema、Redis、Worker、env、Feature Flag 或 secret。

## 3. 修改文件清单

- `scripts/v2/production/m1-production-storage-database-fingerprint.mjs`：生成不含业务行值的结构与计数摘要。
- `scripts/v2/production/m1-production-storage-database-fingerprint.test.mjs`：覆盖确定性、计数变化、PG16/只读事务和标识符转义。
- `scripts/v2/production/m1-production-storage-backup-capture.mjs`：在同一只读快照中执行 fingerprint，并把 `pg_dump` 直接流入 age 加密。
- `scripts/v2/production/m1-production-storage-backup-capture.test.mjs`：覆盖同快照合同、X25519 recipient 和 pg_dump/age 失败清理。
- `scripts/v2/production/m1-production-storage-recovery-evidence.mjs`：组装并严格校验 P0 recovery evidence。
- `scripts/v2/production/m1-production-storage-recovery-evidence.test.mjs`：覆盖 RPO/RTO、远端取回、restore parity、隔离、清理和反夸大。
- `scripts/v2/production/m1-production-storage-p0r-runner.sh`：计划/确认双模式的生产 P0R runner，绑定源码、工具和无权限边界。
- `scripts/v2/production/m1-production-storage-p0r-runner.test.mjs`：检查 runner 计划、checksum、清理、隔离和 shell 语法。
- `scripts/v2/production/m1-production-storage-p0r-bundle.mjs`：构建可复现、脱敏、内容绑定的 Linux amd64 执行包。
- `scripts/v2/production/m1-production-storage-p0r-bundle.test.mjs`：覆盖 bundle 字节可复现、官方 age provenance 和错误二进制拒绝。
- `scripts/v2/production/p0r-cos-archive/go.mod`：声明零第三方运行依赖的 Go helper module。
- `scripts/v2/production/p0r-cos-archive/main.go`：当时实现腾讯 COS REST 签名、owner-only ACL、versioned/COMPLIANCE 对象上传和精确取回；其中 overwrite 请求头后来确认在 versioning 下无效，已由 P0R-B 替换为不夸大的唯一键合同。
- `scripts/v2/production/p0r-cos-archive/main_test.go`：覆盖官方签名向量、额外账户 ACL/弱保留模式拒绝和 mock HTTPS 端到端对象流程。
- `package.json`：把 P0R 定向门禁和 Go 测试接入 V2 ops/生产 CI，并增加 bundle/plan 命令。
- `docs/architecture/v2/M1_6_P0R_CAPACITY_AND_RECOVERY_REMEDIATION_CONTRACT_V1.md`：冻结容量、恢复、顺序和外部动作边界。
- `docs/architecture/v2/M1_6_PARTITIONED_FACT_STORAGE_CONTRACT_V1.md`：登记 P0 BLOCKED 与 P0R 当前事实。
- `docs/runbooks/V2_M1_6_P0R_PRODUCTION_RECOVERY_RUNBOOK.md`：锁定离机私钥保管、临时凭证、staging、执行、清理、扩容和 fresh P0 操作顺序。
- `docs/blueprints/V2_M1_6_P0_PRODUCTION_STORAGE_READ_ONLY_PREFLIGHT_DELIVERY_REPORT.md`：封存 P0 只读现场结论。
- `docs/blueprints/V2_M1_6_P0_PRODUCTION_STORAGE_EVIDENCE_INDEX.json`：登记脱敏 P0 report/database/host/bundle digest。
- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`、`docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json`、`docs/blueprints/README.md`、`market-radar-v2-build-sequence.md`：把唯一施工入口更新为 P0R 生产动作，不提前开放 P1。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：维护当前事实和最近五轮变更。

## 4. 对核心链路的影响

本轮保护 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产数据地基，确保后续分区 Fact Store 具备可恢复前提。它不提高行情发现率，不产生 Candidate、信号等级、方向、入场、止损、目标或交易计划。

## 5. 分层边界影响

- scan / analysis / strategy / backtest：无逻辑变化。
- frontend / API：无变化。
- DB / Redis / worker / deployment：只增加未执行的恢复 runner；生产零变更。
- secret：仓库不接收私钥或 COS 凭证；runner 只允许 `/dev/shm` 中 mode 600 的短期 secret file，并在退出时清理。
- recovery：本地工程 PASS；生产 recovery evidence 尚不存在。

## 6. 风险说明

- 本地测试和 mock COS 只能证明工具约束，不能证明腾讯生产数据已可恢复。
- 真实执行前仍需专用单 AZ 私有 COS bucket、versioning=`ENABLED`、Object Lock=`COMPLIANCE` 至少 30 天、专用 age X25519 身份和按当前 P0R-B 运行计划签发的 7200 秒最小权限临时凭证；私钥原件必须与 COS 分离保存在加密保险库，生产机只放临时副本。
- 当前根文件系统仍为 126,695,636,264 bytes，低于 161,643,694,113 bytes 硬门槛；推荐扩至 180 GiB。
- 扩容涉及费用及可能的强制关机，只能由用户在腾讯控制台确认。
- P0 仍为 `BLOCKED`；任何 P1 Add Schema、身份创建、分区预建或 Worker 启动都必须继续拒绝。
- 本轮 15 分钟指标只约束单次“源快照到远端精确取回验证”；持续 RPO/PITR 尚未证明，仍由 M1.7 验收。

## 7. 执行命令

```bash
npm run test:v2-m1-p0r
npm run test:v2-ops
npm run v2:m0:verify
npm run ci:production
```

另已验证官方 age v1.3.1 Linux amd64 archive checksum `bdc69c09cbdd6cf8b1f333d372a1f58247b3a33146406333e30c0f26e8f51377`、age binary `2e305637f2a0555305e21c17fb74446acbb39b53135d43d4b744e50c287133a5` 和 Linux amd64 ELF；Go Linux amd64 静态构建两次 digest 均为 `b5fd3c9002c78d2245c9a3a558390ee4b6aa9385c0ca1b0efc4a3dc4db9a9924`。`backtest:formal` 未运行。

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：PASS。
- `npm run build`：PASS。
- `npm run backtest:golden`：PASS，16/16。
- `npm run test:v2-m1-p0r`：PASS，28/28；Go helper PASS。
- `npm run test:v2-ops`：PASS，82/82；Go helper PASS。
- `npm run test:v2-foundation`：PASS，277/277，5 个外部依赖场景显式 SKIP。
- `npm run v2:m0:verify`：PASS，11/11。
- `npm run ci:production`：PASS。
- production smoke：未运行，因为本轮未部署、未执行 P0R 生产动作。
- `npm run backtest:formal`：未运行，符合 formal 只在明确能力验收轮执行的规则。

## 9. 失败项

代码和基础门禁无失败项。真实 COS 上传/取回、真实隔离恢复、容量扩展、生产健康验证和 fresh P0 尚未执行；它们是 P0R 未完成动作，不能记为测试失败，也不能记为 PASS。本机没有 Docker，因此未用本机容器替代生产恢复演练。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新，并保持不超过 400 行。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入且只可以进入 `V2-M1.6-P0R-CAPACITY-AND-RECOVERY-REMEDIATION` 的真实生产恢复与容量动作；不可以进入 P1 Add Schema。

## 13. 下一轮建议

先建立专用私有 COS 与一次性 age/临时凭证，在扩容前执行真实同快照加密备份、远端 version retrieval 和隔离 PG16 restore parity；证据封存后再由用户完成 180 GiB 系统盘升级，恢复生产健康并完整重跑 fresh P0。
