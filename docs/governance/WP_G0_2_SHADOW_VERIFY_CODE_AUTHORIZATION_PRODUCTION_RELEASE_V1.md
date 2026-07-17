# WP-G0.2 Shadow Verify Code Authorization Production Release

## 1. 目标

把已经通过本地和隔离 PostgreSQL 16 验证的 Shadow Verify 代码授权，以独立、可回滚、仅 Web 的方式发布到生产。这个包只让未来 `shadow_verify` 阶段具备同快照双读能力；当前 `shadow_capture` 仍返回 Legacy，Candidate 不能成为响应权威，也不能进入 Review 或 Canonical Cutover。

## 2. 精确 Release

- 生产前置目标：`54837d03d0fb91b33cf9919bd25ab7aaad60dd7e`。
- Release target：`eb48827b8b403452328b65dc4b415c3fc0ecf765`。
- Target 只有 3 个文件：授权常量和两组真实状态机测试。
- 如果生产在执行前不再是精确 baseline，本包必须失效并基于新生产 baseline 重建；禁止通过回退生产代码来迁就旧包。

## 3. 前置证据

执行必须同时读取并验证私有、不可变、内容哈希绑定的 Lineage 与 Reconciliation 文件。Lineage 必须证明至少 10,000 条 completed writes、完整连续周期和新鲜相邻验证周期；Reconciliation 必须是 0 difference、0 duplicate、0 unresolved，并保持 `shadow_capture`、`writeFrozen=false` 和正奇数 epoch。任一证据缺失、过期、权限过宽、为符号链接或身份不一致，必须在生产 mutation 前停止。

## 4. 生产边界

只允许：

```text
精确 fetch target
-> 保留当前 Web rollback image
-> checkout detached target
-> build web
-> --no-deps --no-build --force-recreate web
-> 1800 秒连续验证
```

禁止数据库、Redis、env、Compose、migration、Feature Flag、phase、read-authority manifest、Candidate worker、scanner-worker 和其它容器变化。部署前后 Candidate worker 的 container ID 与 image ID、全部非 Web 容器身份、Candidate control、Lineage/Reconciliation 文件哈希都必须完全一致。

## 5. 运行时真值

本包不创建 `/run/market-radar/candidate-read-authority.json`。在当前 `shadow_capture` 且没有可信 manifest 时，新 API 必须以 `503 candidate_read_control_unavailable` fail closed，不能返回空数组、旧缓存或 Candidate 数据冒充成功。未来独立 phase-transition 包创建可信 manifest 后，`shadow_verify` 才能执行 parity；即便 parity 为零差异，响应权威仍是 Legacy。

## 6. 回滚

第一次 mutation 前必须取得仓库外全局 lease、递增 fencing token、消费一次性授权并验证 immutable rollback image。任何 Git、build、Web、health、endpoint、worker、control、evidence 或非目标容器检查失败，自动恢复 baseline Git 与旧 Web image，并再次证明 ready/fresh、Candidate worker/控制行/非目标容器未变。Rollback image 在成功后继续保留，清理由独立包决定。

## 7. 完成边界

本地合同、Bundle 和执行演练 PASS 只代表发布工具可用；生产 Web release PASS 也只代表代码已安全部署，不等于 Shadow Verify phase transition、24 小时/289 样本观察、Canonical Cutover、WP-G0.2 或 G0 完成。
