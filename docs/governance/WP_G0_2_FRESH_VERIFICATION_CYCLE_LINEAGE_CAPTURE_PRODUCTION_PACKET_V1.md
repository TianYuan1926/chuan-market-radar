# WP-G0.2 Fresh Verification Cycle Lineage Capture Production Packet v1

## 1. 目标

将本地已验证的 Candidate 多周期 Lineage 重算器封装为会话独立、一次授权、生产只读的执行包。它只在 Activation、累计达标周期和严格相邻的新鲜周期原始证据都真实存在后，读取完整 Candidate control/count 快照并生成 `lineage-final.json`。

## 2. 核心贡献

本包服务候选筛选和复盘进化：阻止人工填写累计数量、漏掉历史周期、复用旧观察窗口或把达标周期冒充新鲜周期。它不改变扫描、分析、策略、RR、Risk Gate、交易计划或生产排序。

## 3. 输入门禁

- Activation 必须由 exact 289 个原始样本重算，覆盖至少 24 小时。
- 累计周期和新鲜周期必须分别由至少 7 个原始样本重算，覆盖至少 1800 秒且至少两次 completed 推进。
- 累计 completed 必须不少于 10,000；新鲜周期必须严格相邻并在累计 PASS 后启动。
- 三组 final、samples、closeout 共 9 个文件均须私有、非符号链接、哈希精确匹配。
- 当前生产 Git、Web image、Compose、production env、Candidate Worker 和 ready/fresh health 必须与一次性请求精确一致。

## 4. 数据库边界

数据库只允许 `REPEATABLE READ READ ONLY`，事务内强制 `candidate_audit_role`。全部 control 必须从 cycle 1 连续到当前周期；历史周期必须 Legacy/frozen/even，当前周期必须唯一 shadow_capture/odd。任何 pending、claimed、retry_wait、unresolved 或 lineage 外数据都会失败。

## 5. 执行与留证

执行使用一次性外部授权、仓库外租约、fencing token 和 `Restart=no` 的 transient systemd unit。Node 运行时来自当前已批准 Web image，容器只读、drop all capabilities、no-new-privileges。只保留脱敏 Lineage、来源文件哈希、数据库只读身份、租约事件和运行前后容器身份；stage、secure 和 ops 临时目录必须精确清理。

## 6. 禁止事项

禁止 Git checkout/source sync、服务重建、数据库写入、migration、env/Feature Flag/phase 变化、Reconciliation、Shadow Verify、Canonical Cutover、生产排序修改、future outcome 输入和 formal backtest。

## 7. 完成真值

本地合同、测试、PG16 演练和基础/安全门禁通过，只能说明生产包可执行。真实生产运行前，`productionAuthorization=false`、`productionExecuted=false`；即使 Lineage capture PASS，也只允许进入独立 Reconciliation，不代表 WP-G0.2 或 G0 完成。
