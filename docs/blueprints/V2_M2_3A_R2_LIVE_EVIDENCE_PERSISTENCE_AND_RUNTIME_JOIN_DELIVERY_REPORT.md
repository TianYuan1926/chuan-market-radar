# V2 M2.3A R2 Live Evidence Persistence and Runtime Join Delivery Report

日期：2026-08-01

状态：`LOCAL_RUNTIME_EVIDENCE_CHAIN_PASS / DIRECTED_15_OF_15_PASS / ADJACENT_148_OF_148_PASS / FULL_CANDIDATE_CI_PASS / REMOTE_FOUR_GATES_PASS / LIVE_EXECUTION_ZERO_OF_31 / NO_CANDIDATE_OR_PRODUCTION_AUTHORITY`

## 1. 交付目的

R1 能从调用方提供的 M1 证据对象推导 Listing/Venue Coverage，但 M1.5C 的真实 31 周期文件链只保存最终 listing binding 和 checkpoint，没有保存每轮规范化 page、advance、请求计数及其前一 checkpoint 身份。即使未来真实运行完成，也无法仅凭落盘证据独立重建 M2.3A，且不同 checkpoint 窗口存在被拼接的风险。

R2 关闭这个运行证据断点：M1.5C 每轮必须保存完整 listing refresh batch，31 周期独立 verifier 必须逐轮证明 checkpoint 连续性；精确运行包再从通过独立验真的最终 source cycle 派生并回读验证 M2.3A 五件套。本包仍不执行真实运行，不生成 Candidate、方向、概率、等级、策略或 READY。

## 2. 精确交付身份

- 分支：`codex/market-radar-v2-m2-3a-r2-live-evidence`。
- 功能提交：`d5d70bc50484db570748a7744319e2b35e0e8426`。
- 基线提交：`1f50817fa66d74e8c3d6f0e608a220bd43ca4531`。
- R1 功能提交：`777af03d18bb8c677854bdd3579c19d003f71864`。
- M1 persistence receipt：`v2-m1-multi-asset-shadow-persistence-receipt.v3`。
- M1 store verification：`v2-m1-multi-asset-shadow-store-verification.v2`。
- M2 refresh evidence：`v2-m2-listing-watch-refresh-evidence.v2`。
- M2 runtime evidence：`v2-m2-listing-venue-event-runtime-evidence.v1`。
- live result / failure：`market-radar-v2-m1-expanded-shadow-live-result.v2` / `market-radar-v2-m1-expanded-shadow-live-failure.v2`。

## 3. 实现内容

- Listing refresh result 现在以 strict schema 保存两条 provider source 的 pages、advance、checkpoint、binding、request count、response bytes、reason codes 和 no-authority 边界。
- 每个 refresh result 显式绑定 `priorCheckpointId` 与 `priorCheckpointHash`；Worker 从两条 initial checkpoint 开始，逐源逐周期验证前后连续，任何跨窗口拼接立即 fail closed。
- M1.5C 每周期从 8 个文件增至 9 个文件，新增 `listing-watch-refresh-batch.json`；31 周期独立验证从 249 个文件增至 280 个文件。
- persistence receipt 从 5 个业务制品增至 6 个，并绑定 refresh batch hash 和精确落盘字节；单独保存的两条 binding 必须与 batch 内 binding 完全一致。
- 独立 verifier 不只返回 cycle 摘要，还返回 31 组已校验 catalog、identity 与 refresh batch，并记录首尾 refresh batch hash；调用者不能用内存对象替代磁盘证据。
- M2 refresh evidence v2 保留规范化 source batch hash，runtime manifest 必须与 independently verified M1.5C final batch 交叉一致；即使重新计算整个 manifest，伪造 source hash 仍会被拒绝。
- 精确生产包在 M1.5C 独立审计后，从 cycle 30/31 identity、cycle 31 catalog 与 listing refresh 生成五个内容寻址文件：refresh evidence、lifecycle ledger、research bundle、evidence join、runtime evidence。
- 五个文件全部使用 exclusive canonical write，随后从磁盘重新读取、strict parse、整组重建并校验内容哈希；生产 Bundle 显式闭合新增编译模块。
- 所有 Candidate、方向、概率、Grade、Strategy、READY、production runtime 和 production mutation 权限继续固定为 false。

## 4. 验证证据

相邻合同共 `148/148`：

- runtime adapter 与 listing history：`26/26`。
- M1 expanded shadow：`71/71`。
- M2.3A evidence/runtime join：`15/15`。
- exact live package：`13/13`。
- M1 base fact：`23/23`。

锁定 Node `22.23.1`、npm `10.9.8`、Go `1.26.3` 的完整 `ci:candidate` 从头退出码 0：

- V2 Foundation：`685 total / 679 pass / 6 explicit skip / 0 fail`。
- V2 Ops：`236/236`。
- Candidate M0：PASS，明确 `NO_PRODUCTION_BRANCH_AUTHORITY`。
- Next production build：PASS。
- Golden cases：`16/16`。
- forbidden files、secret patterns 与 security check：PASS。

新文件暂存后又单独重跑 tracked-only forbidden-file、secret-pattern、typecheck、730 文件 lint 与 M2 定向门，全部 PASS，避免未跟踪文件逃逸扫描。

GitHub 独立门全部绑定功能提交 `d5d70bc50484db570748a7744319e2b35e0e8426`：

- Signed Production Dispatch Quality：run `30706385082`，PASS。
- V2 A0 Release Qualification：run `30706385111`，PASS。
- V2 Independent Security Quality：run `30706385064`，PASS。
- V2 Full Quality and Materials Gate：run `30706385069`，PASS。

## 5. 本轮根因治理

- 第一次完整 CI 的唯一失败来自宿主 PATH 选择了 Node `24.15.0`，而 P0R capsule 合同精确锁定 Node `22.23.1`。使用仓库声明的 Node `22.23.1` / npm `10.9.8` 后该门 `6/6` 通过，并从头重跑完整 CI；失败运行不计入通过。后续本包命令均显式使用固定工具链。
- 审查发现 runtime manifest 虽记录 source batch hash，但 R1 refresh evidence 未保留该 hash，通用 verifier 无法交叉重建。R2 将 refresh schema 升至 v2，并增加“重新计算 manifest 也不能接受伪造 source hash”的回归断言。
- 新增 prior checkpoint 红例证明跨链拼接会在 Worker 和独立磁盘 verifier 两层被拒绝，不以最终 checkpoint 内容相似替代连续性证明。

## 6. 权限与生产边界

本包未：

- 执行 M1.5C 或 M1.5D 真实 31 周期运行；当前 live denominator 仍是 `0/31`。
- 读取或写入生产数据库、Redis、COS。
- 修改生产仓库、服务、Worker、env、migration、Feature Flag、流量或 P0R。
- 部署新 Bundle、启动容器或取得生产 runtime authority。
- 生成 Candidate、方向、概率、Signal Grade、Strategy、READY 或交易计划。
- 声称 precision、recall、提前率、盈利能力、真实 Detector 或 M2.3A 完成。

生产业务、数据、服务和权限保持不变。

## 7. 未完成事项与下一入口

- P0R 仍是“远端资格通过、完整恢复未执行”；必须先完成加密只读备份、COS 精确版本取回、独立 PostgreSQL 16 恢复、全量清理与 fresh P0。
- 在同一 clean exact release 上刷新 M1.4B 与 source conformance，再派发 M1.5C/M1.5D；R2 才能取得真实 31 周期 source evidence。
- M1.6-D1 expanded-scope capacity 仍等待 M1.5C/M1.5D 真实 fact rate。
- M2.4A 仍缺真实 event/non-event/matched control cohort、purge/embargo、sealed untouched holdout、walk-forward、消融、跨 Venue/regime/liquidity/lifecycle 校准和前向 Shadow。
- 独立审计、受控生命周期晋级和任何 Candidate/Strategy/READY authority 均未开放。

因此 M2.3A 主步骤继续不勾选。准确结论是：真实运行所需的证据保存、连续性验证和 M2 runtime join 已在本地与 GitHub 质量门闭合，但真实 live evidence、Detector 有效性与生产能力尚未发生。
