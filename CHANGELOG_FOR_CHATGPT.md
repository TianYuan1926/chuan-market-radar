# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

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

## 2026-07-21 / V2 M1.5-B1-B2 Mark Price Snapshot Semantics Remediation

### 本轮目标

修正三 Venue 价格事实语义和 B1-B1 暴露的 Runner/validator 配置漂移，为同门槛 31 周期复测建立不可夸大的地基。

### 修改范围

- Binance/OKX/Bybit 统一改为公开 `MARK_PRICE / MARK_PRICE_SNAPSHOT`，Provider 快照时间和本机 knowledge time 分离。
- Collector、Worker、SLO 和 evidence 升级为 providerObserved/accounted/eligible/collected/usablePrice/fresh 六计数，新增 100% price-usability 门槛。
- Runner 与 validator 共用唯一 environment builder；旧 schema、聚合不等于 Venue 求和、技术 PASS 冒充业务 PASS 均 fail closed。

### 核心链路影响

加固 `全市场发现 -> Market Fact + Quality -> Point-in-Time Feature`。未生成 Candidate、Analysis、Strategy、Backtest、页面或生产 authority。

### 测试结果

- identity/fact 30/30、feature/context 17/17、collector/runner 70/70、ops 32/32 PASS。
- 完整 `ci:production` 退出码 0：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 277/0/5 explicit skip、ops 32/32、M0 11/11、build、Golden 16/16 和 security 全部通过。

### 是否部署

未部署。生产 DB、Redis、env、migration、Feature Flag、服务、仓库、Candidate runtime 和 authority 零变更。

### 风险与遗留问题

- B1-B1 的 31 周期因完整证据未保留只能记 `EXECUTION_INVALID_NOT_COUNTED`，不能从抽样画面推断业务结果。
- mark price 不是成交、订单簿或可执行价格；未来仍需独立事实流。
- B1-B3 新窗口未完成前，业务 SLO、M1.5-B1 和 M1 都未通过。

### 下一轮建议

完整门禁与 exact commit/push 后，只执行 `V2-M1.5-B1-B3-MARK-PRICE-SAME-GATE-31-CYCLE-RETEST`。

## 2026-07-21 / V2 M1.5-B1-B0 Early Shadow Evidence Contract

### 本轮目标

冻结一个不可拼接、内容寻址、业务 Gate 独立且可精确恢复宿主 Docker 基线的 31 周期 no-authority Early Shadow 合同和腾讯隔离 Runner。

### 修改范围

- 新增 strict process summary 和原子 31 周期 evidence builder，拒绝短包、跨进程/config 拼接、非 canonical JSONL、错误 cadence 和状态夸大。
- SLO 新增 100% collection coverage 独立门槛；eligible、collected、fresh 与 READY 不再互相替代。
- 新增 pinned toolchain、临时 PG、storage/egress 双网络、secret-file、只读非 root Worker、内容寻址 artifact、自动清理和宿主精确恢复 Runner。

### 核心链路影响

加固 `全市场发现 -> Market Fact + Quality` 的 31 周期实测地基；未生成 Candidate、Analysis、Strategy、Backtest、页面或生产 authority。

### 测试结果

- M1 专用 68/68、全 V2 274/0/5 explicit external-dependency skip、V2 ops 31/31。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、M0 11/11、build、Golden 16/16、security PASS。
- anti-inflation 覆盖 short/stitched/noisy/cadence drift、collection/freshness 缺口、direct DB capability、report tamper、失败原因和宿主残留。

### 是否部署

未部署。未执行 31 周期真实捕获；生产服务、数据、DB、Redis、env、migration、Feature Flag、Candidate runtime 和 authority 零变更。

### 风险与遗留问题

- B1-B0 只证明合同和 Runner，本身不证明业务 SLO；当前唯一入口是 B1-B1 原始实测。
- B1-A 已暴露 freshness/duplicate/missed-start，实测 FAIL 必须保留，不能先放宽门槛。
- 中断不能续接；必须清理后从第 1 周期整轮重跑。

### 下一轮建议

只执行 `V2-M1.5-B1-B1-31-CYCLE-EMPIRICAL-CAPTURE`：绑定 B1-B0 exact commit，在腾讯隔离 Runner 原样运行并接受独立业务 Gate 的 PASS/FAIL。

## 2026-07-21 / V2 M1.5-B1-A Reachable Docker Runner Preflight

### 本轮目标

在可达隔离 Docker Runner 构建 exact source 的 M1 no-authority image，真实验证三 Venue Collector 分母、持久化、业务 readiness、证据重算与宿主机恢复。

### 修改范围

- 将技术 Runner PASS 与业务 readiness/SLO PASS 彻底分开；technical package 不得遮蔽周期 `NOT_READY`。
- preflight evidence 升级为 v2，绑定 source/image、两周期完整分母、质量原因、SLO、NO_AUTHORITY、清理与 baseline digest。
- 增加 incomplete collection、partial freshness、缺失 NOT_READY 原因和 SLO FAIL 被弱化的 anti-inflation 测试。

### 核心链路影响

加固 `全市场发现 -> Market Fact + Quality` 的 live 运行证据；未生成 Candidate、Analysis、Strategy、Backtest、页面或生产 authority。

### 测试结果

- 腾讯隔离 Runner technical PASS；exact source `97f10e75ce296b07d933e9c362c40ba2be0997ea`，evidence `sha256:a44cab89b8a4bf291e7c8f67eb6de2b76f2637f4f8265d91ebb8f1224d2a40c2` 独立重算 PASS。
- 两周期 eligible/collected 均 1,444/1,444，fresh 1,441 与 1,274，READY 0/2；业务 SLO 正确为 FAIL。
- host cleanup PASS：11 containers / 4 networks / 5 volumes 的 baseline 与 post-cleanup digest 完全一致。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 267/0/5 explicit skip、M0 11/11、build、Golden 16/16、security PASS。

### 是否部署

未部署。使用生产宿主机隔离临时 Runner，但生产服务、数据、DB、Redis、env、migration、Feature Flag、Candidate runtime 和 authority 零变更；临时执行资源已清理。

### 风险与遗留问题

- B1-A 只证明 Runner 技术链路，业务 readiness 明确 FAIL；不得宣称 M1.5-B1 或全市场健康完成。
- Binance 暴露逐 row stale/duplicate 与第二周期 fresh ratio 约 67.92%，固定节拍还有 missed start；需要 31 周期证据定性，不能先放宽门槛。
- 生产应用健康仍未做新鲜只读验证，保持 UNKNOWN。

### 下一轮建议

只执行 `V2-M1.5-B1-B0-EARLY-SHADOW-EVIDENCE-CONTRACT`：冻结 31 周期完整证据、独立业务 Gate、可恢复 Runner 与宿主机精确清理，再按原门槛实测。

## 2026-07-20 / V2 M2.2-B0.2-C1 Release-Bound Forward Capture Start

### 本轮目标

恢复可信公开市场 egress，修正真实目录暴露出的 identity/证据绑定缺口，并用同一冻结 release/config 建立两轮三 Venue 前向合约目录捕获起点。

### 修改范围

- Unicode provider identity 使用 NFC 与确定性 ASCII uppercase，不再把真实目标合约误判为 unresolved。
- identity evidence 分为 canonical target、provider-native out-of-scope 和 unresolved；范围外 row 保留全分母但不阻断目标范围连续性。
- Raw/Snapshot/Batch/Continuity/Artifact Reference/Journal 全部绑定 exact clean Git release 与冻结 config；runner 在请求前验证完整 journal chain 和 head artifact。

### 核心链路影响

加固 `全市场发现 -> Universe Registry` 的实时合约范围真值。没有进入 Candidate、Analysis、Strategy、Backtest、页面或生产 authority。

### 测试结果

- C1 定向：34/34 PASS。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 267/0/5 explicit skip、M0 10/10、build、Golden 16/16、禁文件/secret/security 全部通过。
- release `4139cc631d3d760876c3e39404c494462541a910` 两轮 Batch 均 COMPLETE；Binance/OKX/Bybit 各 2/2 complete、跨度约 368.5 秒、gap/unresolved/conflict/blocker=0，全部 `FORWARD_ONLY_READY`。
- 全链复核 14 个 normalized artifact、6 个 raw reference、5 个唯一 raw object，无 lock/partial 残留。

### 是否部署

未部署。代码已推 V2 实施分支；生产、DB、Redis、Worker、migration、env、Feature Flag、Candidate authority 和 secret 均未修改。

### 风险与遗留问题

- C1 只通过 forward capture start，不回填历史，不等于长期 SLO、historical source、Detector 或实战能力。
- B0.2-B 外部人工权利与合格历史来源仍 blocked，bulk/cohort 仍关闭。
- 本机无 Docker CLI；M1.5-B1 需在独立可达 runner 证明 exact image、Collector 四分母与有界 Shadow。

### 下一轮建议

只执行 `V2-M1.5-B1-A-REACHABLE-DOCKER-RUNNER-PREFLIGHT`：使用 branch-scoped GitHub-hosted no-authority runner 构建 exact source image 并验证三家 live Collector 四分母；PASS 后再单独启动固定 31 周期 Shadow。
