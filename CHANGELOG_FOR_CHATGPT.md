# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-21 / V2 M1.6-P0R-B1 COS Bucket Provisioning

### 本轮目标

只创建并核验 P0R 的香港单 AZ 私有 COS 空桶，不把空桶包装成备份、恢复或 P0 PASS。

### 修改范围

- 创建 `market-radar-v2-p0r-1445289689`，地域 `ap-hongkong`、单 AZ、私有读写、versioning 与 SSE-COS 已开启。
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

## 2026-07-21 / V2 M1.6-P0 Production Storage Read-Only Preflight

### 本轮目标

以 exact source 和只读生产证据决定 M1.6 是否允许进入 P1 Add Schema，并在 BLOCKED 时插入正确整改步骤而不是降低门槛。

### 修改范围

- 新增 strict P0 report、只读 SQL probe、secret-file/临时 host runtime runner 和 22 个 anti-inflation 场景。
- 在腾讯生产宿主机读取 PostgreSQL、schema、容量、Docker/Git before/after；数据库、服务、仓库和 migration 零变更。
- 新增脱敏证据索引、P0 交付报告和 P0R 容量/恢复合同；施工入口改为 P0R。

### 核心链路影响

保护 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产存储地基；不产生 Detector、Candidate、Analysis、Strategy、页面或交易权限。

### 测试结果

- P0 定向 22/22、V2 ops 54/54、M0 PASS。
- 完整 `ci:production` 退出码 0：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 277/0/5 explicit skip、ops 54/54、build、Golden 16/16 和 security PASS。
- fact capture=`PASS_READ_ONLY_FACT_CAPTURE`；admission=`BLOCKED`。PostgreSQL 16、schema=`ABSENT_CLEAN`、旧/新 Fact=0、connection use=2%。
- P0 report `sha256:344ae4e05ec78e74ca97c92728fc06576f744e795bf4919d6eb3b76ee145769e`；远端 bundle `sha256:4d25adbd3247181cb526ded488b9b681d0563eadfcbb8109d8f5b15ee2b8e58`。

### 是否部署

未部署应用。只执行生产只读 probe；DB/Redis/env/migration/Feature Flag/服务/仓库/Candidate runtime/authority 零变更。

### 风险与遗留问题

- 120 GiB 系统盘预计使用率 90%，当前可用 70.02 GB 小于 87.09 GB 所需 headroom；文件系统硬门槛 161,643,694,113 bytes，推荐 180 GiB。
- recovery evidence 缺失；data checksums、WAL archive、bootstrap 权限和默认时区仍为 advisory。
- P0 已过期，整改后必须完整重跑，不能沿用或改写本轮报告。

### 下一轮建议

只执行 `V2-M1.6-P0R-CAPACITY-AND-RECOVERY-REMEDIATION`；取得加密离机备份、隔离恢复和容量整改后重跑 P0，禁止直接进入 P1。

## 2026-07-21 / V2 M1.5-B1-B3 Mark Price Same-Gate 31-Cycle Retest

### 本轮目标

在腾讯隔离 no-authority Runner 以 B1-B2 exact clean commit 完整执行 31 周期同门槛复验，并用独立复算和宿主恢复证据决定 M1.5-B1 是否真实完成。

### 修改范围

- exact image、临时 PostgreSQL、storage/egress 双网络和 31 周期 Worker；生产服务、数据、身份与 authority 不变。
- 固化 Runner/Domain/observation/process-output 四类内容寻址证据，并对永久副本独立复算。
- 更新 V2 v1.10 蓝图、v1.12 机器矩阵和双轨施工顺序，将下一入口切到 M1.6-P0。

### 核心链路影响

证明 `全市场发现 -> Market Fact + Quality` 的 30 分钟 Early Shadow 业务门槛；不证明 Detector、Candidate、Strategy、页面、24 小时 SLO 或盈利能力。

### 测试结果

- exact commit `33f08d3fb72912a2617ed3a21f58cb4c347aefcb`；31/31 READY，minimum collected/usable/fresh 1,444/1,444，四项 ratio=1。
- provider failure、missed start、not-ready 均为 0；observation 1,805,547 ms，p95 cycle 5,997 ms，max schedule lag 45 ms。
- Runner evidence `sha256:58b5d118503def8287642b78e12eb895a26130ac0ecb12b52bbf06e82ce51860` 与永久副本独立复算 PASS；宿主 11 containers / 4 networks / 5 volumes 精确恢复，隔离残留 0。
- 完整 `ci:production` 退出码 0：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 277/0/5 explicit skip、ops 32/32、M0 11/11、build、Golden 16/16 和 security 全部 PASS；`backtest:formal` 未运行。

### 是否部署

未部署应用。仅在生产宿主机运行隔离临时 no-authority 单元；生产 DB/Redis/env/migration/Feature Flag/服务/仓库/Candidate runtime/authority 零变更，临时资源已清理。

### 风险与遗留问题

- Early Shadow PASS 不等于 24 小时 SLO 或 M1 完成。
- production storage migration、最小权限身份、容量/WAL、备份恢复和 isolated-write Shadow 尚未证明。
- 生产应用业务健康仍为 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`。

### 下一轮建议

只执行 `V2-M1.6-P0-PRODUCTION-STORAGE-READ-ONLY-PREFLIGHT-CONTRACT`；P0 未通过前禁止 Add Schema。
