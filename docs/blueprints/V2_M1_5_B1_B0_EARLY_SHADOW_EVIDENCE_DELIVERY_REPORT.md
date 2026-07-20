# 本轮交付报告

## 1. 本轮目标

完成 `V2-M1.5-B1-B0-EARLY-SHADOW-EVIDENCE-CONTRACT`：冻结一个原子 31 周期、内容寻址、业务 Gate 独立、失败不拼接且可精确恢复宿主 Docker 基线的 no-authority Runner，为下一轮腾讯真实 Early Shadow 提供可信执行边界。

## 2. 范围边界

本轮只修改 M1 Collector 的 process/evidence/SLO 合同、专用腾讯隔离 Runner、运维验证和权威文档。

没有修改 Detector、Candidate、Analysis、Strategy、Backtest 逻辑、前端、Legacy 生产代码、生产 DB/Redis、migration、env、Feature Flag、服务或 authority；没有执行生产 Shadow，没有读取或写入 secret。

## 3. 修改文件清单

- `src/v2/modules/market-fact/collector/collector-process-contract.ts`：严格约束 31/1441 周期进程终态，拒绝短包和错误恢复声明。
- `src/v2/modules/market-fact/collector/collector-early-shadow-evidence.ts`：解析单进程 31 周期输出，重算固定 SLO 并生成内容寻址 domain evidence。
- `src/v2/modules/market-fact/collector/collector-slo.ts` 与 policy/tests：新增 100% collection coverage 独立门槛，避免“eligible 存在但未采集”漏过 Gate。
- `src/v2/entrypoints/m1-collector-worker.ts` 与 `m1-collector-early-shadow-report.ts`：统一 strict process summary，并提供只读证据 CLI。
- `scripts/v2/production/m1-early-shadow-runner-evidence.mjs`：绑定 domain evidence、exact image/source、隔离运行边界和宿主恢复证明。
- `scripts/v2/production/m1-tencent-early-shadow-runner.mjs`：显式绑定获准的 exact commit，并编排 pinned toolchain、临时 PG、独立网络、实际 Worker、证据生成、自动清理和退出语义。
- 新增/更新测试与 `package.json` M1 专用门禁：锁定 anti-stitching、anti-inflation、分母、权限、资源、清理和失败原因。
- 权威蓝图、机器矩阵、Context、Changelog、索引和正确搭建顺序：将下一入口推进到 B1-B1。

## 4. 对核心链路的影响

加固 `全市场发现 -> Market Fact + Quality` 的证据与运行地基，确保后续 31 周期实测能诚实回答“是否完整采集、是否新鲜、是否按时、是否持久化、是否真的 READY”。

本轮没有生成 Candidate、方向、等级、入场、止损、目标或交易计划。

## 5. 分层边界影响

- scan：只加固上游 Market Fact Collector 和 SLO 证据，不产生候选或排序。
- analysis / strategy / backtest / frontend / API：未修改。
- DB：Runner 合同只允许隔离临时 PostgreSQL；生产 DB 未连接、未迁移。
- Redis / production worker / deployment / secret：未修改。
- authority：固定 `NO_AUTHORITY`、`automaticTradingAllowed=false`、`m1ExitClaimed=false`。

## 6. 风险说明

- B1-B0 只是本地工程 PASS，不证明 31 周期业务 SLO，也不证明 M1 完成。
- B1-A 已观察到 freshness/duplicate/missed-start，B1-B1 很可能得到业务 FAIL；这是应保留的真实结果，不是 Runner 失败。
- 临时 PG 使用隔离 `trust` rehearsal，明确不能冒充生产认证证明。
- 中断不能续接旧周期；必须清理后整轮重跑，因此真实执行需要预留至少 45 分钟窗口。

## 7. 执行命令

- `npm run test:v2-m1-collector`
- `npm run typecheck`
- `npm run lint`
- `npm run ci:production`
- `git diff --check`

## 8. 测试结果

- M1 专用门禁：PASS，68/68。
- `typecheck`：PASS。
- `lint`：PASS，0 error / 0 warning。
- `test:market`：PASS，Legacy 965/0/4 skip；Worker 23/23；Historical 4/4。
- `test:v2-foundation`：PASS，274/0/5 explicit external-dependency skip。
- `test:v2-ops`：PASS，31/31。
- M0 机器出口：PASS，11/11。
- `build`：PASS。
- `backtest:golden`：PASS，16/16。
- security / forbidden files / tracked secret patterns：PASS。
- 完整 `ci:production`：PASS。
- `backtest:formal`：未运行；本轮不是正式能力验收。
- production smoke / 31-cycle empirical capture：未运行；本轮没有部署。

## 9. 失败项

无本地工程失败项。外部 B1-B1 业务 Gate 尚未执行，必须保持 `UNPROVEN`，不能填写 PASS。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.5-B1-B1-31-CYCLE-EMPIRICAL-CAPTURE`；不可以进入 M1.6-P、M1.7、M2 runtime、页面接入或能力宣称。

## 13. 下一轮建议

只执行 B1-B1：绑定本包 exact commit，在腾讯隔离 Runner 原样运行 31 周期；先接受原始 PASS/FAIL，再决定是否进入 B1-B2 freshness 语义整改。
