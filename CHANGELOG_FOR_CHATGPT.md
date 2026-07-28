# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-29 / P0R Atomic Secret Session Root Remediation

### 本轮目标

根据两次真实 STS 失败证据，永久移除 raw response 落盘、裸 `tee`、手工编译、AX response reconstruction 和 Compose env 重插值路径；建立无回显、内存即时编译、两项 secret 到齐后自动执行且失败全清理的原子会话。

### 当前证据

- `bd20bd5b73ef0beb41c331aa43c58051ef01d37a` 的四条 GitHub 门禁、fresh production read-only rebind 和 v3 plan/bundle staging 核验仍是可信历史证据，但其旧 secret 会话实现已被真实失败证伪，因此不再拥有执行权。
- 第一枚 STS 因 receiver 未运行而误入交互 shell，已过期且永久禁用。第二枚 STS 最终进入真实 receiver，但多条手工操作导致超过签发后 5 分钟；编译器按真实时钟返回 `STS response was not compiled immediately after issuance`。未使用 `--now` 伪造时间，也未继续 COS、数据库、backup、retrieval 或 restore。
- raw path 删除后，独立现场核验发现 PID `1175383` 的 `tee` 仍持有已 unlink 文件并等待输入。该进程经 exact identity 核对后终止；随后分别证明生产 P0R 文件数 `0`、进程数 `0`。本机 clipboard 已覆盖，secret-bearing Node 会话已整体 reset。
- 第二枚 STS 的 exact expiry `2026-07-28T20:57:29Z` 已由本机 UTC `2026-07-28T20:57:48Z` 与腾讯 STS HTTPS Date `2026-07-28T20:57:56Z` 双重证明超过；该凭证现为 `EXPIRED_FORBIDDEN_REUSE`，永久禁止复用。两次尝试均没有生产数据库读取、COS 对象、backup、retrieval、restore、业务服务或 authority 变更。
- 新 `m1-production-storage-p0r-session.sh` 在 TTY 关闭 echo，使用 Web 容器内的受控 Node 从 stdin 有界读取 STS、在内存校验并即时编译，原始响应不落盘；credential 与 age identity 只以 exclusive mode 600 写入 `/dev/shm`。第二会话以 PID、Linux process-start token 和 source commit 三重绑定第一会话，拒绝 PID 复用或陈旧 ready 文件；两项 secret 到齐后自动启动 checksum-bound Runner，任一会话超时、断线、验证失败或 Runner 退出均立即清理整组 exact session 路径。
- session helper 不执行 `p0r-bindings.env`，只把它作为普通数据解析；恰好接受 12 个白名单键、一个 40 位 source commit 和 11 个 SHA-256。生产容器仅按 exact Compose project/service labels 选择，不再重新渲染 Compose 或读取 env。
- Runner 内部数据库描述和 canary 不再使用可预测公共 `/dev/shm` 文件：每次执行创建 owner-bound mode-700 私有目录，内部 plaintext/recovered canary 以 no-clobber mode-600 regular file 生成，禁止内部 `tee`，并在成功前验证整个目录已删除。
- credential ingress CLI 已删除 caller-supplied `--now`，生产编译只能使用进程真实时钟；回归证明任何时钟覆盖参数都会 fail closed。
- fresh rebind request/result schema v2 已把历史 transport v1 三文件替代比较与当前 transport v2 七文件运行资格分离；七文件集包含 runner 和 atomic session helper，任一摘要缺失或混写都 fail closed，且历史 13-member verifier 边界保持冻结。
- 当前定向 P0R `81/81`、Go helper、recurrence gate `10/10`、production dispatch `24/24`、`git diff --check` 和完整 `ci:production` 已通过；完整 CI 同时取得 V2 Foundation `631 PASS / 6 explicit skip`、V2 Ops `203/203`、Next production build、Golden `16/16` 与 security PASS。新 clean commit、GitHub 四门、fresh production read-only rebind、新 plan/bundle、真实目标 session acceptance 与恢复仍待完成。

### 当前真值

P0R 当前是“本地根因修复通过专项门禁，完整资格和真实生产恢复未完成”。没有可用 credential，没有读取生产数据库，没有生成或上传 backup，没有创建 COS 对象，没有执行 exact retrieval 或独立 PostgreSQL 16 restore。生产应用、数据库、Redis、Worker、env、migration、Feature Flag、生产仓库和业务 authority 未改变。旧 raw/tee/manual-compile 路线已永久退役，不能因历史四门或 staging PASS 恢复执行权。

### 下一步

第二枚 STS 的精确过期前置已完成证明。先完成最终权威文档同步与提交前复核，形成 clean commit，随后通过 GitHub 四门、fresh production read-only rebind 和新 exact plan/bundle；只有这些新 source 资格全部通过后才允许生成新的 7200 秒 STS。使用两个 fresh OrcaTerm 会话分别进入唯一无回显 session 入口，由 helper 完成即时编译、age handoff 和自动 Runner。只有真实 backup、exact retrieval、独立 PostgreSQL 16 restore、证据封存、secret/container/volume/runtime 清理和生产零漂移全部 PASS，P0R 才能关闭。

## 2026-07-28 / Strategy Archetype Labeling Blueprint Integration

### 本轮目标

把“每笔策略必须说明属于哪一种交易逻辑”纳入 V2 权威链，并确保它是可版本化、可验证、可复盘的后端事实，而不是前端自由文案或事后解释。

### 修改范围

- 新增 `M3.3E Strategy Archetype Labeling and Outcome Attribution` 独立合同，区分 canonical 主标签、有界辅助标签和 Action State 派生状态标签。
- 冻结突破回踩、跌破反抽、支撑反弹、压力受阻、趋势延续、假突破/假跌破反转、区间反转、压缩扩张、流动性扫单、相对强弱和衍生品资金流等初始双向词表。
- Strategy Construction 是主标签唯一生成者；Candidate/Analysis 只能输出 `setupHypothesis`，Final Decision 只校验和冻结，前端只本地化、展示和筛选。
- Decision Snapshot、Alert 和 Outcome 必须原样传播原标签；Outcome 按标签、方向、regime、Venue、流动性、资产域和生命周期分层评价。
- 新标签必须通过真实 cohort、matched control、sealed holdout、前向 Shadow 和独立审计，禁止单币种、单日或少量成功案例过拟合。

### 当前真值

本轮只完成设计权威、追踪矩阵和施工顺序整合。schema、builder、strict decoder、Final Decision parity、Outcome 归因、前端消费、测试、真实 Shadow 和生产 authority 均尚未实现；不得将 `DESIGN_AUTHORITY_ADDED` 误写为策略标签能力完成。腾讯应用、数据库、Redis、Worker、COS、env、migration 和业务 authority 未由本包改变。

### 下一步

先继续关闭当前独立第一关键路径 P0R；随后按 `schema -> Strategy builder -> Final Decision -> DecisionSnapshot/Alert -> Outcome -> frontend -> replay/holdout/Shadow` 实施 M3.3E，并与真实 M3.1A-M3.3D 分域策略共同验收。

## 2026-07-27 / P0R STS Required Region Contract Root Remediation

### 本轮目标

根据腾讯 API Explorer 的真实拒绝结果，根治 P0R provisioning plan 未把必填 Region 写入 STS request 的合同缺口，禁止手工补参数绕过 exact-plan digest。

### 修改范围

- plan schema 从 `v2-m1-production-storage-cos-provisioning-plan.v2` 升级为 `.v3`，`stsRequest.region=ap-hongkong` 进入 plan digest 与 credential request digest。
- Go COS helper 同步要求 request Region 与 grant Region 精确一致，缺失或非香港一律 fail closed。
- JavaScript 与 Go 回归覆盖 Region 缺失和错配；运行合同、生产手册、蓝图、追踪矩阵和上下文同步当前真值。
- 历史 v2 staging/bundle 验证器仍只用于读取旧证据，不被机械改写为新可执行合同。
- Signed Production Dispatch Quality 的 push/PR 路径从 `fixed-channel` 子目录扩大到全部 `scripts/v2/production/**`，并增加回归，防止 P0R 生产脚本变化再次漏掉第四门。

### 验收结果

- source `94118d3b8270b6ac58c449380911ea77b8abeace` 的前序 GitHub 四门和腾讯 fresh read-only rebind 均 PASS，生产身份零漂移。
- 随后的 v2 STS 请求真实返回 `MissingParameter.Region`；没有 credential、数据库读取、backup 或 COS 对象，失效 remote staging 已精确清理。
- 新合同定向 P0R `72/72 PASS`、Go helper PASS、V2 Ops `194/194 PASS`。
- Region 修复 source `b33661...` 的 A0、Full Quality 和 Independent Security 已 PASS；旧路径过滤没有触发 Signed Production Dispatch Quality，因此不能标记四门通过。
- 完整本地 `ci:production` 已 PASS；包含路径修复的新提交四条 exact-source GitHub 门禁和 fresh production read-only rebind 尚待执行。

### 风险与下一步

本轮仍不是 P0R 恢复完成。旧 v2 plan/bundle 已失去执行权；只有新 clean commit 通过完整 CI、远端四门和 fresh rebind 后，才能重建 v3 plan/bundle 并重新请求 7200 秒 STS，再执行 backup、exact retrieval、isolated PG16 restore、cleanup 与 fresh P0。

## 2026-07-27 / Fixed Dispatch Timeout Lock Root-Cause Recovery

### 本轮目标

读取旧 P0R 派发的真实目标 receipt，根治固定派发代理在 systemd 超时后遗留空锁、持续拒绝后续包的问题，并恢复低延迟的生产派发通道。

### 修改范围

- 生产 journal 证明 2026-07-26 14:09:36 +08:00 的 Git fetch 在 180 秒后被 systemd `SIGTERM`；空 `agent.lock` 无任何 live owner，随后累计 4,526 次 `dispatch_agent_already_running`。
- agent 的 Git child 改为不可由调用方取消的 90 秒硬上限；SSH 增加连接次数、连接超时和 keepalive 失败边界。
- lock 新增 boot ID、PID、Linux process-start token、acquiredAt 和随机 token；live owner fail closed，dead owner 隔离恢复，空旧锁只在四分钟后恢复。
- governance contract、24 项固定通道回归、复发注册表、运行手册、权威蓝图和生产验收报告同步更新。

### 验收结果

- `npm run test:production-dispatch` 24/24、recurrence gate 9/9 和完整本地 `ci:production` PASS。
- 腾讯隔离 Linux smoke 返回 `PASS_LINUX_AGENT_LOCK_SELF_RECOVERY_AND_EXCLUSION`。
- 生产只替换 agent、Git SSH wrapper 和 README 三文件；旧件和游标保留为可回滚证据。
- 旧 dispatch 被记录为 `FAIL_DISPATCH_NOT_REUSABLE / dispatch_not_current`，无 claim、解包或业务 Runner；随后手动和 timer 轮询均为 `IDLE_NO_NEW_DISPATCH`。
- 生产应用 HEAD/clean worktree、11 容器、Web/PostgreSQL/Redis、六 Worker 和 health 全部零漂移；远端 staging 已精确删除。

### 风险与下一步

本次完成的是生产派发控制面的根因关闭，不是 P0R 完成。旧派发已确认过期、未领取、未执行且禁止复用；下一动作是生成并执行 fresh exact signed read-only rebind，然后才能进入 current-source plan/bundle、fresh `/dev/shm` STS/age、加密 backup、exact retrieval、独立 PG16 restore、cleanup 与 fresh P0。

## 2026-07-27 / V2 M1.4D + M1.5C/M1.5D Local Runtime and Exact Package

### 本轮目标

在 A0/P0R 仍关闭生产 live 执行的前提下，补齐 Scope V2 四 Venue 多资产 Base Fact、M1.5C/M1.5D 两类 31 周期 Shadow runtime、独立证据验证器和同一 exact release 的无密钥腾讯派发包。

### 修改范围

- M1.4D 建立四 Venue catalog/listing watch、identity v2/snapshot v3、T0 lifecycle、T1 wide-market 和 point-in-time Base Fact Snapshot。
- Provider URL、HTTP/WebSocket transport 全部收进 Adapter；Core 仅持 URL hash、分页、超时和字节边界，架构门禁新增 Bitget host。
- M1.5C 固定 31 周期、60 秒 cadence 和四责任轴逐周期分母；M1.5D 固定同 cadence 的 trades/book/mark-index 前向采集及确定性 research/control 选择。
- 新增两套独立 verifier、隔离 PostgreSQL 16 store、combined runtime entrypoint、deterministic Bundle、strict request/envelope、Runner 和 entrypoint。
- Runner 禁止目标 build、source sync、dependency install 及生产 DB/Redis/应用/env/Feature Flag/migration 写入；只有 topology 精确恢复时才允许声明 `productionChanged=false`。
- Binance JSON subscribe endpoint 按 routed stream 语义修正为 `/public/stream` 与 `/market/stream`，并由回归锁定。

### 验收结果

- Base Fact 23/23、Expanded Shadow 70/70 PASS。
- Exact live package 12/12 PASS。
- V2 Ops 192/192、P0R Go package、全 V2 编译测试、typecheck、ESLint、Biome 715 files、forbidden-files 和 secret-pattern 全部 PASS。
- 完整 `ci:production` PASS：V2 Foundation 637 total / 631 pass / 6 explicit skip、V2 Ops 192/192、M0、Next production build、Golden 16/16 与 security 全部通过。

### 是否部署

未部署。M1.5C live cycle=0，M1.5D live cycle=0；腾讯生产服务、数据库、Redis、Worker、Caddy、env、Feature Flag、migration、COS、生产仓库和业务 authority 均未改变。

### 风险与下一步

本地工程 PASS 不代表四 Venue coverage、微观结构 SLO 或容量 PASS。当前生产 Bundle 必须 fail closed，因为 A0/P0R 尚未关闭，且旧 M1.4B/source-conformance evidence 与当前源码不是 same-commit upstream。正确顺序是先完成 P0R 和 fresh P0，再在同一 clean commit 刷新 upstream，执行 M1.5C/M1.5D 两包并分别验收，最后进入 M1.6-D1。
