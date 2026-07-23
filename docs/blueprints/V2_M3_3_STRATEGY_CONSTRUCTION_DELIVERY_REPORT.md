# 本轮交付报告

任务：`V2-M3.3-STRATEGY-CONSTRUCTION-CONTRACT`

状态：`LOCAL_CONTRACT_PASS / TEST_ONLY_UNCALIBRATED / NO_READY_AUTHORITY / PRODUCTION_UNCHANGED`

日期：2026-07-23

## 1. 本轮目标

建立六个机会族各自的 Strategy Construction 合同，把结构、方向和双评级转换成可审计草案；结构或目标不完整时明确弃权，不生成占位价格。

## 2. 实现内容

- 新增六族 long/short 独立模板、entry/stop/target kind、confirmation、expiry、no-chase 和 partial take-profit policy。
- 新增 BigInt 定点价格位移与加权 gross/net RR 算法。
- `StrategyDraft` 升级到 v2，加入 family/authority/policy/cost/reference/stop-base/RR lineage。
- stop 先由结构位确定，再向不利方向加 buffer；低 RR 只增加 blocker，不缩 stop。
- target 只引用 Analysis exact level；未验证 Fibonacci 不能成为 target。
- 缺 direction、Evidence、Setup、entry、target 或 fresh reference 时返回 `draft=null`。
- M3.0 增加 Strategy scope authority、family/policy、level/price/fact lineage 和 RR 重算防伪。

## 3. 当前能力边界

当前草案全部是 `TEST_ONLY_UNCALIBRATED`，固定成本和 buffer 只证明合同，不代表真实交易成本。每份草案都保留 no-authority blocker，不能直接或间接产生 READY。

本包没有修改 Legacy、M1/M2 runtime、Candidate Store、数据库、Redis、Worker、migration、env、Feature Flag、前端或生产服务。

## 4. 验证结果

- M3.3 20/20 PASS。
- M3.2 18/18、M3.1 21/21、M3.0 22/22。
- M3 定向合计 81/81 PASS。
- `npm run typecheck`：PASS。
- 改动文件 ESLint：PASS，0 warning。
- 全 V2：366 total / 360 pass / 0 fail / 6 explicit external-dependency skip。
- V2 ops：115/115 PASS，Go helper PASS。
- `git diff --check`：PASS。

完整 `npm run ci:production`：PASS，退出码 0；forbidden-file、secret-pattern、recurrence、production-dispatch、typecheck、lint、Legacy/Worker/historical、V2 Foundation、V2 Ops、M0 zero-drift、Next production build、Golden 16/16 和 security check 全部通过。

## 5. 未完成

1. 真实 buffer、费用、滑点、资金费率和成交容量尚未校准。
2. M1 未退出，M2 Detector 仍 DRAFT、Candidate 禁发。
3. 历史 cohort、untouched holdout、Strategy scope authority 尚不存在。
4. Execution Feasibility、Trigger runtime、Personal/Portfolio Risk 和 M3 runtime 尚未完成。
5. 生产 P0R 仍停在 fresh STS 前，生产业务与数据未因本包改变。

## 6. 下一步

本地进入 `V2-M3.4-EXECUTION-FEASIBILITY-CONTRACT`；生产线仍只按 `fresh STS -> P0R restore -> fresh topology/calibration -> fresh P0` 串行推进。
