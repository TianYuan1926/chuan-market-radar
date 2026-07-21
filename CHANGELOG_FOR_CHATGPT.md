# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-21 / V2 M1.6-P0R-D0 No-Cost Capacity and Six-Hour Partitions

### 本轮目标

在不付费扩容、不缩小全市场分母、不放慢一分钟 cadence 和不缩短 24 小时回看的前提下，用生产形状机器证据重新设计 M1 Fact 存储容量，并实现六小时分区 v2。

### 修改范围

- 保持 v1 partition migration checksum 不变，新增 additive v2 六小时 UTC 分区、小时级 cutoff 和非空 v1 拒绝升级门禁。
- 新增隔离 PG16 容量校准和 no-cost evaluator，固定 1,805 Facts/周期、30h retention、1h sweep、1.5 倍字节成本和全部 reserve。
- 更新 P0 exact migration 清单、V2 合同、机器证据索引、主蓝图、施工顺序和项目上下文。

### 核心链路影响

只加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的持久化、容量和恢复地基；不改变 Detector、Candidate、Analysis、Strategy、Backtest 或页面。

### 测试结果

- typecheck、定向 partition 7/7、V2 ops 103/103、隔离 PostgreSQL 16 迁移/restore/retention 1/1 PASS。
- clean commit `15746813245744af4f4ba73f61a976b722ad9a21` 完成 8 周期/11,552 Fact，最大周期 33,660 ms。
- 容量模型稳态 59%、峰值 67%、固定上限 70%，`PASS_LOCAL_NO_COST_MODEL`。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、historical 4/4、V2 foundation 279/0/6 explicit skips、ops 103/103、M0 11/11、build、Golden 16/16 和 security 全部通过。

### 是否部署

未部署。生产 DB/Redis/env/migration/Feature Flag/服务/仓库/Candidate runtime/authority 零变更；未生成 age/STS、未上传对象、未执行生产恢复。

### 风险与遗留问题

- 本地容量模型 PASS 不等于 production P0 PASS；旧 topology 过期，旧远端 bundle 摘要长度不合法。
- Object Lock 白名单、真实 age/STS、加密备份、exact retrieval、隔离恢复和 fresh P0 仍未完成。
- P1 继续关闭。

### 下一轮建议

只完成外部恢复前置和真实 recovery evidence，然后刷新生产 topology 并完整重跑 P0。

## 2026-07-21 / V2 M1.6-P0R-B1B Object Lock and Age Vault Qualification

### 本轮目标

确认 Object Lock 实际资格，并实现免费、受保护的离机 age X25519 身份生成与保管工具，不生成真实私钥或冒充生产恢复。

### 修改范围

- Edge 只读确认 COS 仍为空且新旧控制台没有 Object Lock 入口；腾讯白名单工单已填写脱敏草稿，但账号手机号未设置，尚未提交。
- 新增 macOS Keychain age vault 工具：冻结官方 archive checksum、独立 recipient 推导、Keychain 读回、失败回滚和无私钥 attestation；按官方 v1.3.1 源码兼容 stdout/stderr 重复同一 recipient，并拒绝冲突 recipient。
- 清理 tracked bucket 标识与真实 APPID 测试 fixture，新增 bucket 标识和 age 私钥 CI 防污染门禁。

### 核心链路影响

只加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的恢复地基；不产生 Candidate、Analysis、Strategy 或交易计划。

### 测试结果

- age vault 6/6、P0R 41/41、Go COS helper、secret pattern 和新文件 ESLint PASS。
- 完整 `ci:production` PASS：typecheck、lint、market 965/0/4 explicit skips、Worker 23/23、historical smoke 4/4、V2 foundation 277/0/5 explicit external skips、V2 ops 95/95、M0 11/11、build、Golden 16/16 和 security 全部通过；未运行 `backtest:formal`。

### 是否部署

未部署应用；未提交工单、未启用 Object Lock、未生成 age/STS、未上传对象、未执行生产恢复。生产服务、数据和 authority 零变更。

### 风险与遗留问题

- Object Lock 白名单未开通，账号手机号未设置；草稿不是提交或开通证据。
- age vault 是本地工具 PASS；官方 darwin/arm64 archive 尚未成功下载并执行，真实身份尚未生成。
- P0 继续因容量与 recovery evidence BLOCKED，P1 关闭。

### 下一轮建议

只补齐账号联系方式并提交 Object Lock 白名单工单；等待期间并行推进 P0R-D0 纯本地容量模型，不生成私钥、STS 或对象。

## 2026-07-21 / V2 M1.6-P0R-B1 COS Bucket Provisioning

### 本轮目标

只创建并核验 P0R 的香港单 AZ 私有 COS 空桶，不把空桶包装成备份、恢复或 P0 PASS。

### 修改范围

- 创建专用 COS 空桶，地域 `ap-hongkong`、单 AZ、私有读写、versioning 与 SSE-COS 已开启；精确名称只保存在 Git 外受限事实文件。
- 概览确认对象 0、存储 0 MB、外网流量 0 B、读请求 0；未开启日志、静态网站、CDN、全球加速或数据万象。
- 更新权威蓝图、机器矩阵、施工顺序、项目上下文和本轮交付报告；交易与生产运行代码零变化。

### 核心链路影响

只为 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 提供离机恢复目标的空容器；不产生 Candidate、Analysis、Strategy 或交易计划。

### 测试结果

- COS bucket/region/permission/versioning/encryption/empty usage 控制台核验 PASS。
- 文档结构与 JSON 校验 PASS；`test:v2-m1-p0r` 35/35 PASS；完整 `ci:production` 退出码 0，覆盖 typecheck、lint、market、V2 277/0/5 explicit skips、ops 89/89、M0 11 项工程退出证明、build、Golden 16/16 和 security PASS。

### 是否部署

未部署应用；创建 1 个空 COS bucket。未启用 Object Lock、未生成 age/STS、未上传对象、未执行 backup/restore、未付费、未关机、未扩容；生产服务、数据和 authority 零变更。

### 风险与遗留问题

- P0 继续因容量与 recovery evidence BLOCKED；P1 关闭。
- Object Lock COMPLIANCE 31 天不可逆，必须先证明支持并独立确认。
- 用户拒绝付费扩容；零付费容量架构必须保留原门禁并取得机器证据，不能直接降低阈值。
- 安全更正：提交 `c647376c` 曾记录完整 bucket 名；当前 HEAD 已脱敏并新增 CI 防复发，但历史提交仍应视为“bucket 标识已知”。桶私有、为空且没有凭证泄露，这不是 secret rotation 证明。

### 下一轮建议

只执行 `V2-M1.6-P0R-B1B-OBJECT-LOCK-AGE-STS-QUALIFICATION`；任一安全前置不满足都保持空桶并禁止上传。

## 2026-07-21 / V2 M1.6-P0R-B Cloud Prerequisite Safety

### 本轮目标

把真实 COS/STS 外部动作收口为运行级、最小权限、可校验且不夸大防覆盖能力的生产前置合同。

### 修改范围

- 新增高熵 run-id、香港单 AZ bucket、源 IP `/32`、唯一 object key 与精确 STS policy 的 provisioning plan，以及只在 `/dev/shm` 编译 credential 的工具。
- bundle/runner/helper 全链绑定 plan/source/run-id；COS helper 新增 region/单 AZ、上传前 key absent、exact version 证据，拒绝 multi-AZ 和已存在对象。
- recovery evidence 升级 v2；按腾讯官方合同作废旧“versioning 下 forbid-overwrite 可防覆盖”的误述。
- 腾讯控制台只读确认 COS bucket=0；180GB 套餐可选但涉及费用与强制关机，本轮未执行任何外部动作。

### 核心链路影响

加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产恢复地基；不改变交易逻辑或生产 authority。

### 测试结果

- P0R 35/35、V2 ops 89/89、M0 11/11 PASS。
- 完整 `ci:production` PASS：typecheck、lint、market、V2 277/0/5 explicit skips、build、Golden 16/16 和 security 全部通过。

### 是否部署

未部署；未创建 COS、未签发 STS、未生成/传输私钥、未执行生产恢复、未付费、未关机、未扩容。生产 DB/Redis/env/migration/Feature Flag/服务/仓库/Candidate runtime/authority 零变更。

### 风险与遗留问题

- P0 仍因真实 recovery evidence 与容量 `BLOCKED`，P1 关闭。
- Object Lock 不可撤销且不支持 multi-AZ；外部创建必须按 action-time 安全确认执行。
- 真实剩余为 COS/age/STS -> backup/retrieval/isolated restore -> 用户扩容 -> health -> fresh P0。

### 下一轮建议

只执行 `V2-M1.6-P0R-B1-COS-KEY-STS-EXTERNAL-PROVISIONING`，完成后用同一 run-id 立即进入 P0R-C；禁止混入 P1。

## 2026-07-21 / V2 M1.6-P0R Local Recovery Engineering

### 本轮目标

把 P0 暴露的 recovery evidence 缺口实现为可审计、fail-closed 的同快照加密备份、腾讯 COS 私有归档、隔离 PG16 恢复和 P0 evidence 工具链，同时保持生产与 P1 权限不变。

### 修改范围

- 新增无业务行 fingerprint、`pg_dump -> age X25519` 直接流式加密、strict recovery verifier 和计划/确认双模式 P0R runner。
- 新增零第三方运行依赖的腾讯 COS REST helper，要求私有 bucket、versioning、COMPLIANCE retention 和精确 version 取回复算；其当时依赖的 overwrite 请求头后来确认在 versioning 下无效，已由 P0R-B 替换。
- 新增可复现无 secret bundle、官方 age provenance、失败注入与 runner/source/checksum/隔离/清理约束；新增离机私钥保管与生产操作 runbook，更新 P0R 合同、蓝图、矩阵和施工顺序。

### 核心链路影响

保护 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产数据地基；不产生 Detector、Candidate、Analysis、Strategy、页面或交易权限。

### 测试结果

- P0R 定向 28/28、V2 ops 82/82、M0 11/11 PASS；Go COS helper 与 mock HTTPS 全流程 PASS。
- 完整 `ci:production` PASS：typecheck、lint、market、V2 277/0/5 explicit skips、ops 82/82、build、Golden 16/16 和 security 全部通过。
- 官方 age v1.3.1 Linux amd64 archive、ELF 和 checksum 已验证；Go Linux amd64 静态构建两次 digest 一致。

### 是否部署

未部署，未执行真实 COS 备份/取回、隔离恢复或扩容；生产 DB/Redis/env/migration/Feature Flag/服务/仓库/Candidate runtime/authority 零变更。

### 风险与遗留问题

- 本地 recovery 工程 PASS 不等于生产可恢复；P0 仍因真实 recovery evidence 和容量 BLOCKED。
- 需要专用私有 COS、versioning、COMPLIANCE retention、一次性 age 身份和短期最小权限凭证后才能真实执行。
- 根文件系统仍低于 161,643,694,113 bytes 硬门槛；推荐 180 GiB，付费与关机必须由用户确认。

### 下一轮建议

只继续 P0R 生产动作：真实备份/取回/隔离恢复证据先于扩容，生产健康恢复后完整重跑 P0；禁止直接进入 P1。
