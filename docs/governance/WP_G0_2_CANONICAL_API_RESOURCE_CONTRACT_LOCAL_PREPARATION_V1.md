# WP-G0.2 Canonical API Resource Contract Local Preparation

## 1. 目标

在不修改现有 API 和前端的前提下，建立 Candidate/Legacy 统一只读资源信封。未来接线时，调用方必须明确知道返回的是 Legacy diagnostic、Candidate canonical、显式 fallback，还是不可用状态，不能再从字段形状猜权威性。

## 2. 资源信封

`candidate-canonical-api-resource.v1` 固定输出：

- route mode、read source、authority、status；
- 请求 policy 与当前 parity；
- 相互隔离的 `candidateCanonical` 和 `legacyDiagnostic`；
- `candidateCanonicalReviewUsable`、blockers 与稳定 content hash；
- `canAuthorizeCutover=false`、`canCreateTradePlan=false`、`canMutateLiveRanking=false`、`automaticPhaseAdvance=false`。

## 3. 模式矩阵

- `legacy_only`：只返回 Legacy diagnostic，不携带 parity。
- `dual_read_legacy_authority`：仍返回 Legacy diagnostic，可以附带 Candidate-vs-Oracle parity，但 parity 不改变 Legacy 的非权威身份。
- `canonical_compat_candidate`：只有 Candidate `ready` 且当前请求 parity 为 0 差异 PASS 才返回 Candidate。
- `canonical_compat_candidate + legacy_fallback`：parity 非 PASS 时显式返回 Legacy diagnostic，Candidate data 必须为 null。
- `canonical_authority`：只返回 Candidate；partial/unavailable 原样保留，禁止静默回退 Legacy。

## 4. Fail-Closed

非法 mode/source/result/parity 组合返回 `resource_contract_unavailable`。运行时会重新验证 Legacy/Candidate 的 authority、allowedUse、禁止能力、null 形状和 content hash；parity PASS 还必须带真实 SHA-256 proof hash，不能只靠 TypeScript 类型或任意字符串。Legacy 不得填充 Candidate payload；Candidate partial 不得改成 ready，unavailable 不得改成 empty；unknown direction、null observation price、null MFE/MAE 不得补值。

## 5. 分层边界

该资源只服务 Candidate 生命周期与 Review 分母。它不生成方向、入场、止损、目标、RR 或交易计划，也不修改 scan 排序、analysis、strategy、risk 或 backtest。

## 6. 本轮禁止

不修改 `src/app/api/**`、组件或 Review 页面；不连接数据库、Redis、worker 或生产；不修改 migration、Compose、生产脚本、身份、Feature Flag 或 control；不运行 formal。

## 7. 当前结论

本地资源合同只能降低未来 API 接线的误导风险，不能证明生产 Reader、API、前端或 canonical cutover 已完成。生产必须先完成 Activation 最终观察，再执行独立只读 Reconciliation；当前系统仍为 R1、可运行但不完整、不能支撑实战。
