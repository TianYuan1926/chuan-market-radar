# 本轮交付报告

状态：`M1.6_P0_READ_ONLY_FACT_CAPTURE_PASS / P0_ADMISSION_BLOCKED / PRODUCTION_UNCHANGED`

## 1. 本轮目标

建立并现场执行 M1.6-P0 新鲜只读生产存储预检，用可验证证据决定是否允许进入 P1 Add Schema，而不是根据旧文档或“数据库能连上”作判断。

## 2. 范围边界

只增加 V2 P0 strict report、只读 SQL probe、secret-file/临时 runtime runner、反夸大测试、生产只读执行和权威文档。未执行 migration，未修改数据库、Redis、env、Feature Flag、容器、服务、生产仓库、Candidate runtime、交易逻辑、API 或前端。

## 3. 修改文件清单

- `scripts/v2/production/m1-production-storage-read-only-preflight.mjs`：冻结 schema/migration stage、只读 SQL、容量模型、恢复证据和 PASS/BLOCKED 逻辑。
- `scripts/v2/production/m1-production-storage-read-only-preflight.sh`：在生产宿主机借用当前 Web 容器的 exact Node/pg runtime，通过本地 PostgreSQL socket 执行受限只读 probe，随后删除 secret-file 与临时 runtime。
- `scripts/v2/production/m1-production-storage-read-only-preflight.test.mjs`：22 个 read-only、freshness、identity、schema drift、capacity、recovery、secret 和 tamper 场景。
- `docs/blueprints/V2_M1_6_P0_PRODUCTION_STORAGE_EVIDENCE_INDEX.json`：不含 secret 的证据索引、容量事实和远端 bundle 校验值。
- P0R 合同、V2 蓝图、机器矩阵、README、施工顺序、Context 与 Changelog：把下一入口从 P1 改为 P0R。

## 4. 对核心链路的影响

保护 `全市场发现 -> Market Fact + Quality -> Runtime Truth` 的生产数据地基。它不提高发现率，不生成 Candidate、方向、等级、Signal、READY、入场、止损、目标或交易计划。

## 5. 分层边界影响

- `scan / analysis / strategy / backtest`：零业务逻辑变更。
- `frontend / API / Redis / worker`：零变更。
- `DB`：只执行 `REPEATABLE READ READ ONLY`，transaction ID 未分配，DML 计数为 0。
- `deployment`：未部署应用；只在现有生产宿主机运行临时只读 probe。
- `secret`：连接信息只进入 mode 600 临时文件，证据不含连接串或凭证，退出时已删除。

## 6. 风险说明

- P0 准入明确 `BLOCKED`，不能执行 P1。
- 当前 120 GiB 系统盘同时承载 Docker 与 PostgreSQL；按冻结 30 小时模型，预计磁盘使用率 90%，超过 70% 上限。
- 需要 87,088,269,540 bytes headroom，当前只有 70,016,385,024 bytes；文件系统总量至少要达到 161,643,694,113 bytes，推荐升级到 180 GiB。
- 没有合格的加密离机备份与隔离恢复证据。
- data checksums、连续 WAL 归档、bootstrap 权限和数据库默认时区仍是 advisory，未包装成已解决。

## 7. 执行命令

```text
node --test scripts/v2/production/m1-production-storage-read-only-preflight.test.mjs
npm run test:v2-ops
npm run v2:m0:verify
npm run ci:production
bash scripts/v2/production/m1-production-storage-read-only-preflight.sh plan
bash scripts/v2/production/m1-production-storage-read-only-preflight.sh execute
node scripts/v2/production/m1-production-storage-read-only-preflight.mjs report ...
sha256sum /home/ubuntu/.cache/market-radar-v2/evidence/m1-p0-d5dbc804be00.tar.gz
```

未运行 `backtest:formal`、production migration、Docker recreate、service restart 或写入 Shadow。

## 8. 测试结果

- P0 定向：22/22 PASS。
- V2 ops：54/54 PASS。
- M0：PASS。
- 完整 `ci:production`：退出码 0；Legacy 965 pass / 0 fail / 4 skip，Worker 23/23，Historical 4/4，V2 277 pass / 0 fail / 5 explicit skip，ops 54/54，M0 PASS，build、Golden 16/16、forbidden files、secret patterns 与 security 全部 PASS。
- 生产只读 fact capture：`PASS_READ_ONLY_FACT_CAPTURE`。
- P0 admission report：`BLOCKED`，不是 PASS。
- `backtest:formal`、production smoke：未运行；前者不属本包，后者未改变服务且 P0 只评估存储前置。

## 9. 失败项

1. Web 应用身份不能切换到 `pg_monitor`；runner 没有扩大应用身份，而是改用受约束的临时 bootstrap probe。
2. PostgreSQL 容器 env 中的旧密码已与真实数据库漂移，不能作为连接依据；方案改为 host Node/pg + 本地 socket，不读取或输出密码。
3. Docker 不允许把 `/proc` 暴露的 socket 重新 bind 到临时容器；最终不创建容器，使用当前 Web 容器 exact runtime 的 `/proc/<pid>/root` 视图。
4. Docker volume 路径普通用户不可 stat；最终只用 `sudo test -d` 与只读 `du`，没有改权限。
5. 每次失败均在数据库写入、服务变更和 migration 之前停止；最终 Docker/Git before/after digest 一致。

## 10. 生产证据

- source commit：`d5dbc804be00c546624ab933bad6282228f983c4`。
- production HEAD：`cec0b6572bb09ae91ff9e013f8bb160f73c045e2`，worktree clean。
- report evidence：`sha256:344ae4e05ec78e74ca97c92728fc06576f744e795bf4919d6eb3b76ee145769e`。
- 远端脱敏 bundle：`/home/ubuntu/.cache/market-radar-v2/evidence/m1-p0-d5dbc804be00.tar.gz`。
- bundle SHA-256：`4d25adbd3247181cb526ded488b9b681d0563eadfcbb8109d8f5b15ee2b8e58`，4,636 bytes。
- 生产数据库/服务/仓库 mutation 均为 false，migration=false，containsSecret=false。

OrcaTerm 未安装 SFTP 增强功能。为保持 P0 零生产变更，没有安装软件或修改宿主机来下载 raw bundle；仓库只保存脱敏索引，权威 bundle 继续留在上述生产证据目录并由 SHA-256 绑定。

## 11. 是否更新项目上下文

`PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`、蓝图、机器矩阵、README 与正确施工顺序均已更新。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.6-P0R-CAPACITY-AND-RECOVERY-REMEDIATION` 本地工程和受控外部准备；不可以进入 P1，不可以执行 migration、创建写身份、预建分区或启动 Worker。

## 13. 下一轮建议

只实现 P0R recovery artifact/runner/verifier、失败注入和容量动作验收；取得加密离机备份、隔离恢复及至少 161,643,694,113 bytes 文件系统容量后，重新运行全套 P0。只有新的 P0 PASS 才能请求 P1 Add Schema。
