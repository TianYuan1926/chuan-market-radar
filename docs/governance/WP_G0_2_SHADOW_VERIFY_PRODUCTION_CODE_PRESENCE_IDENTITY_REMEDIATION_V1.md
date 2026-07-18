# WP-G0.2 Shadow Verify Production Code Presence Identity Remediation v1

状态：`LOCAL PREPARATION PASS / PRODUCTION VERIFY-ONLY NOT EXECUTED`

日期：2026-07-19

## 1. 目标

旧 Shadow Verify Web-only release 把生产目标固定在 `eb48827b...`，但当前 Cycle-5 生产 Git 已推进到 `94b6d415...`。Git 历史核对发现，Shadow Verify 所需的三个应用代码 blob 在参考 commit、当前生产 commit 和本地工程中逐个完全一致，因此直接重发 Web 会成为没有代码收益的生产变更。

本包新增一条更严格的零变更出口：只有参考 blob、生产 Git、Cycle-5 Web 构建记录和正在运行的 Web 容器四重身份全部闭环，才允许用生产代码存在性证据替代 Web 重发。任一项漂移都必须拒绝并回到真实 Web-only release，不能用本地比较冒充生产 PASS。

本包服务核心链路中的候选筛选和复盘进化，只减少无意义发布风险；不生成候选、方向、止损、目标、RR 或交易计划。

## 2. 范围

允许修改：

- 新增 Shadow Verify production code-presence 本地验证、确定性 Bundle、只读生产 runner、边界测试和隔离执行演练。
- 将 Shadow Verify phase v4 依赖扩展为：接受真实 Web-only release PASS，或严格的零变更 production code-presence PASS。
- 更新合同、自治状态、项目上下文和本轮中文证据。

明确禁止：

- 上传或执行生产 Packet、发布或重建 Web、切换 Git、构建镜像、重建容器。
- 修改数据库、Redis、Worker、env、Compose、Feature Flag、manifest、migration 或 Candidate phase。
- 修改 scan、analysis、strategy、backtest、frontend、业务 API、RR 或 Risk Gate。
- 运行 formal backtest。

## 3. 四重身份合同

参考代码身份：

- 参考 commit：`eb48827b8b403452328b65dc4b415c3fc0ecf765`
- 当前生产 commit：`94b6d415573f5d8b2d0190c809a4b8e128a25aa8`
- 当前生产 tree：`3d362ceaad05f24f705efe2d871a5a46c3d8704e`
- 三个 Shadow Verify 应用文件的 Git blob 必须逐个精确一致，不能只比较文件名或工作区文本。

生产执行时还必须证明：

- 生产 Git 为 clean detached，并精确等于合同 commit/tree。
- Cycle-5 `target-images-record.json` 的 schema、文件哈希和 Web image 身份精确匹配。
- 正在运行的 Web 容器使用同一 Web image，容器处于运行状态。
- Candidate read authority manifest 必须不存在，Candidate lifecycle endpoint 必须以 `candidate_read_control_unavailable` / `candidate_read_trusted_context_invalid` fail closed，不能硬编码 Legacy authority。
- `/api/health` 为 `ready`，scan freshness 为 `fresh`，Legacy 仍是响应权威。
- servicesMutated 为空；Git、DB、Redis、Worker、env、Compose、manifest、phase 和 migration 全部零变更。

生产 PASS schema 为 `candidate-shadow-verify-code-presence-evidence.v1`，唯一 PASS status 为 `PASS_PRODUCTION_SHADOW_VERIFY_CODE_PRESENCE_VERIFIED`。本地 blob 一致只证明 Packet 可以准备，不是生产 PASS，也不是 phase transition PASS。

## 4. 本地证据

- 参考、生产和当前工程的三个应用 blob 完全一致。
- code-presence 定向测试：8/8 PASS，覆盖本地身份、确定性归档、解包后 runner 篡改拒绝、请求窗口、Shell 边界、完整隔离执行和证据严格校验。
- phase 定向测试：21/21 PASS，同时保留真实 Web-only release 路径，并拒绝非零变更或身份漂移的 code-presence 证据。
- 隔离执行使用 detached `94b6d415...` worktree、真实确定性 transport 解包和只读 Docker 替身；没有连接生产。
- code-presence runner artifact：`d4f2508330261d890b2d38afdf59350d1026d9d5214eeb2eb58c24b9b6814e80`
- code-presence contract SHA-256：`8df2d658262d156f76bddacbfad9cc9668b72a02161692cee9000351b0caaff2`
- phase v4 runner artifact：`08261d8e1286af88d0223cf59b29e9e78b4be4be51888c90262d5a921104380c`
- phase v4 contract SHA-256：`9052112ebb95cdeded7c386c36806f055ec18607446b5cb3c1637f60099576dd`
- 基础门禁和提交绑定门禁以本轮最终交付报告为准；formal 未运行。

## 5. 生产顺序与出口

Cycle-5 observer 继续是唯一生产 WIP。只有 Cycle-5 累计、短观察和 24 小时门禁全部 PASS 后，才允许按同一现场身份依次执行：

1. production code-presence verify-only。
2. production Lineage read-only capture。
3. production Reconciliation read-only comparison。
4. 另一个有授权、有自动回滚的 Shadow Verify phase transition 和 24 小时 dual-read observation。

本包不缩短任何观察时间，也不让 G0 主步骤减数。当前 G0 仍为 7。
