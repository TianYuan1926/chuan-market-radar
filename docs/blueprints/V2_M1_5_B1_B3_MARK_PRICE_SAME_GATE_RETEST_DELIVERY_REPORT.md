# V2 M1.5-B1-B3 Mark Price Same-Gate 31-Cycle Retest 本轮交付报告

状态：`PASS_EARLY_SHADOW_BUSINESS_GATE / M1.5-B1_COMPLETE / PRODUCTION_SERVICES_DATA_AND_AUTHORITY_UNCHANGED`

## 1. 本轮目标

绑定 B1-B2 exact clean commit，在腾讯宿主机隔离 no-authority Runner 从第 1 周期执行一个不可拼接的 31 周期窗口，使用原有严格门槛和新增 price-usability 门槛验证三 Venue mark-price Collector 的持续业务健康。

## 2. 范围边界

本轮只执行 exact source 构建、临时 PostgreSQL 16、隔离 storage/egress network、31 周期 Worker、Domain/Runner 证据构建、独立复算、宿主恢复和临时目录清理。未修改生产数据库、Redis、env、Feature Flag、服务、生产仓库、Candidate runtime、页面、API 或任何 authority。

## 3. 修改文件清单

- `docs/blueprints/V2_M1_5_B1_B3_MARK_PRICE_SAME_GATE_RETEST_DELIVERY_REPORT.md`：记录本轮真实执行与验收证据。
- `market-radar-v2-build-sequence.md`：将 B1-B3 和 M1.5-B1 减数，并冻结后续双轨施工顺序。
- `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md`：升级当前事实和执行入口。
- `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json`：登记机器可读 Gate、digest 和下一入口。
- `docs/blueprints/README.md`、`PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`：同步活跃记忆。

## 4. 对核心链路的影响

本轮证明 `全市场发现 -> Market Fact + Quality` 的 30 分钟 no-authority 早期 Shadow 门槛。它不证明 Detector、候选筛选、深扫、结构分析、风险赔率、交易计划、长期 SLO 或盈利能力。

## 5. 分层边界影响

- `scan / analysis / strategy / backtest / frontend / API`：未修改。
- `DB`：仅使用自动销毁的临时 PostgreSQL；生产 DB 零连接、零 migration、零变更。
- `Redis / production worker / deployment / secret`：未修改；两个临时数据库 URL 仅以 secret-file 挂载，原始临时目录已删除。
- `Candidate / trading`：Candidate runtime absent，automatic trading=false，authority=`NO_AUTHORITY`。

## 6. 风险说明

- 这是约 30 分钟的 Early Shadow，不是 24 小时持续 SLO，不覆盖多 regime、Provider 长故障、真实容量、WAL、备份或恢复时长。
- `MARK_PRICE` 不是成交、盘口或可执行价格；后续事实流仍需独立建设。
- 生产应用健康仍为 `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION`；本轮只证明隔离 Collector 和宿主恢复。

## 7. 执行命令

- exact branch fetch、detached checkout、clean worktree 校验。
- pinned Node/PostgreSQL/buildx 镜像和二进制摘要校验。
- exact image build、临时 PG/双网络、31 周期 no-authority Worker。
- Runner evidence builder 与独立 verifier 对永久证据副本再次复算。
- Docker 容器、网络、卷和隔离 label 残留只读核验。
- `npm run ci:production`。

## 8. 测试结果

- exact source commit：`33f08d3fb72912a2617ed3a21f58cb4c347aefcb`。
- Runner：`PASS_31_CYCLE_CAPTURE`；业务：`PASS_EARLY_SHADOW_BUSINESS_GATE`。
- 31/31 cycle READY，not-ready=0，provider-failure cycle=0，missed schedule start=0。
- eligible=1,444；minimum collected/usable/fresh 均为 1,444；collection/price-usability/fresh/operational-ready ratio 均为 1。
- observation=1,805,547 ms；p95 cycle duration=5,997 ms；max schedule lag=45 ms。
- Runner evidence：`sha256:58b5d118503def8287642b78e12eb895a26130ac0ecb12b52bbf06e82ce51860`。
- Domain evidence：`sha256:2304b66dd2ee0a14b8cdab2079f2bf4d97d49c96e98fc6608c5ca6a0bcb65563`。
- observation object：`sha256:e1bacf6dbe8c159902855aaa94a56cd0be78204a4054903130b0f56daf21c113`，31 行。
- process output object：`sha256:5e4d6bfcd6436e47c6288f3c0e4ccea495a0bd6444a07cd6e42b46aee2b2a502`，32 行。
- host baseline/post-cleanup：`sha256:ec3a6a0dc1705399fd8dd76926d8ed20f4421b802617852f27a5b4cc6fc3659c`，11 containers / 4 networks / 5 volumes，隔离资源残留 0。
- 永久脱敏证据路径：`/home/ubuntu/.cache/market-radar-v2/evidence/b1b3/33f08d3fb72912a2617ed3a21f58cb4c347aefcb/`；永久副本独立复算一致。
- `npm run ci:production`：退出码 0；forbidden files、secret patterns、typecheck、lint、Legacy 965/0/4 skip、Worker 23/23、Historical 4/4、V2 277/0/5 explicit skip、ops 32/32、M0 11/11、Next build、Golden 16/16 和 security 全部 PASS。
- `npm run backtest:formal`：未运行，本轮不属于 formal 能力验收。

## 9. 失败项

无业务或技术 Gate 失败。两次正式 Runner 启动前的工具准备错误没有进入 Runner，也没有产生正式窗口；均已清理且不计为 B1-B3 执行。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.6-P0-PRODUCTION-STORAGE-READ-ONLY-PREFLIGHT-CONTRACT`。M1.6 production migration 尚未批准或执行，M1 仍未完成。

## 13. 下一轮建议

只构建并执行 M1.6-P0 新鲜只读预检：证明 exact 生产身份、旧 V2 Fact 数量、migration 现状、容量/备份前置和零变更；未通过前不得 Add Schema。
