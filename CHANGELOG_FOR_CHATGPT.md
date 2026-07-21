# Market Radar 最近变更日志

用途：只保留最近最多 5 个重要变化，帮助下一轮快速接手。更早细节从 Git history、脱敏交付报告和历史证据读取。本文件不包含 secret。

## 2026-07-22 / V2 M3.1 Family Analysis and Evidence Interpretation

### 本轮目标

建立六类机会的独立 Analysis/Evidence 解释合同，完整保留反证、point-in-time lineage 和不确定性，同时禁止越权生成等级或计划。

### 修改范围

- 新增六族 long、short、失效/unavailable policy 与 21 项合同测试。
- `AnalysisSnapshot v2` 新增 exact evidence ids、Market Context id 和 calibration authority。
- M3.0 增加 EvidenceItem 全核算和 scope-matched Analysis authority 门禁，回归扩至 17 项。

### 核心链路影响

加固 `深扫验证 -> 结构分析 -> 后续双评级` 的来源和反证边界，不改变发现、策略或生产运行。

### 测试结果

- M3.1 21/21、M3.0 17/17，合计 38/38 PASS。
- 完整 `ci:production` PASS：全 V2 317/0/6 explicit skip、ops 115/115、M0 11/11、build、Golden 16/16、security PASS；`test:market` PASS。

### 是否部署

未部署；生产服务、数据库、Redis、Worker、migration、数据和 authority 零变更。

### 风险与遗留问题

当前 policy 固定 `TEST_ONLY_UNCALIBRATED`；真实 Deep Validation、双评级校准、Strategy、Feasibility、Risk、holdout 和 runtime 均未完成。

### 下一轮建议

本地只进入 M3.2 Evidence/Setup Qualification 合同；生产线保持 P0R 单一 WIP。

## 2026-07-21 / V2 M1.6-P0R-B1C Object Lock, Age and Transport Preparation

### 本轮目标

完成真实 Object Lock、离机 age 身份和 exact transport bundle，把生产恢复推进到 7200 秒最小权限 STS 创建前。

### 修改范围

- 用户动作级确认后，Edge 已启用并回读 COS Object Lock=`COMPLIANCE` 31 天。
- age X25519 私钥仅保存在 macOS Keychain；Git 外只保留 public recipient 与无私钥 attestation。
- 修复 P0R builder 将 host Go test 错误交叉编译为 Linux 的缺陷，提交 `6a81e865e61569f7d2d7c3bb3be1d78db72a9eab`；重新生成 exact plan 与无 secret transport bundle。

### 核心链路影响

只加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的恢复地基，不改变交易逻辑。

### 测试结果

- P0R 61/61、真实 Go helper build、Object Lock readback、age Keychain readback 和 12/12 bundle payload hash PASS。
- bundle SHA-256=`02e164cd90e26b449c741ddd8e8e1683426005613a85dbc80573cf67a76b0e04`；containsSecrets/privateKey=false。
- 完整 `ci:production` PASS：Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 294/0/6 skip、ops 115/115、M0 11/11、build、Golden 16/16、security PASS。

### 是否部署

未部署应用。外部 COS 安全设置已变更；STS、对象、生产数据库读取、backup/retrieval/restore 和服务变更均未发生。

### 风险与遗留问题

Object Lock、age 和 bundle 不等于恢复 PASS；仍缺临时凭证、真实对象、精确版本取回、隔离恢复、cleanup、fresh topology/calibration/P0。

### 下一轮建议

只执行 exact-plan STS、受限上传、真实 P0R-C 与 cleanup；失败即保持 P0 BLOCKED。

## 2026-07-21 / V2 M3.0 Final Decision Authority Contract

### 本轮目标

冻结 M3 最终决策的唯一权威边界，保证 Candidate、Analysis、Draft、前端或缺失事实不能直接产生 READY。

### 修改范围

- 新增 strict Bundle：authorization、Episode、Thesis、Evidence、Analysis、Qualification、Draft、Feasibility、Trigger、Runtime 与 Decision。
- 校验 same release/id/time lineage、Action State 优先级、结构与净 RR 门槛、READY plan parity 和派生原因完整性。
- 未实现真实 Analysis/Strategy，也未接 API、页面、DB、Redis、Worker 或生产 authority。

### 核心链路影响

加固 `深扫验证 -> 结构分析 -> 风险赔率 -> 交易计划终审` 的防伪边界，不提升发现率或策略效果。

### 测试结果

- M3.0 15/15 PASS；伪造 READY、DRAFT Detector、隐藏原因、权限矛盾、时间倒流、lineage 拼接和 future 字段均 fail closed。
- 完整 `ci:production` PASS，测试总数同上；`backtest:formal` 未运行。

### 是否部署

未部署；生产服务、数据和 authority 零变更。

### 风险与遗留问题

M1 未退出、M2 Gate=INSUFFICIENT、Detector=DRAFT、Candidate 禁发；当前只能 planless BLOCKED。M3 主步骤未完成。

### 下一轮建议

本地只进入 M3.1 family Analysis/Evidence 合同；生产线优先 P0R 与 fresh P0。

## 2026-07-21 / V2 M1.6 Fresh P0 Capacity Admission

### 本轮目标

让 future fresh P0 使用六小时实测容量模型，同时完整继承旧 P0 的只读、身份、恢复、拓扑、schema 和零 mutation 门禁。

### 修改范围

- 新增 raw evidence 可重建的 fresh P0 composition admission；只替代三个旧日分区容量计算。
- 修正稳态 60% / 峰值 70% 双门槛，隔离 restore target 必须容纳数据库、完整稳态数据集和 WAL reserve。

### 核心链路影响

只加固 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产存储准入。

### 测试结果

- fresh admission 10/10、P0R 59/59、ops 113/113、M0 11/11 和当轮完整 CI PASS。

### 是否部署

未部署，未消费 fresh production evidence，生产零变更。

### 风险与遗留问题

本地工具不等于 production capacity PASS；真实 recovery、fresh topology 和 exact-release calibration 仍需组合执行。

### 下一轮建议

完成真实恢复后重跑 exact-release calibration 和 fresh P0。

## 2026-07-21 / V2 M1.6-P0R-D0 No-Cost Capacity and Six-Hour Partitions

### 本轮目标

不付费扩容、不缩小市场分母、不放慢一分钟 cadence，重设计 Fact 存储容量并实现六小时分区 v2。

### 修改范围

- 保持 v1 checksum 不变，新增 additive v2 六小时 UTC 分区、小时 cutoff 和非空 v1 拒绝升级。
- 新增隔离 PG16 容量校准，固定 1,805 Facts/周期、30h retention、1h sweep、1.5 倍字节成本和 reserve。

### 核心链路影响

加固 Market Fact 持久化、容量和恢复地基，不改变 Detector、Strategy 或页面。

### 测试结果

- clean source `15746813245744af4f4ba73f61a976b722ad9a21` 完成 8 周期/11,552 Fact；稳态/峰值 59%/67%，本地模型 PASS。
- partition 7/7、ops 103/103、隔离 PG16 和当轮完整 CI PASS。

### 是否部署

未部署；production DB/Redis/env/migration/服务/authority 零变更。

### 风险与遗留问题

本地容量模型不等于 fresh P0，P1 继续关闭。

### 下一轮建议

与真实 recovery evidence、fresh topology 和 P0 组合验收。
