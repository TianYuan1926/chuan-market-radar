# WP-G0.2 Canonical Compat Read Model 本地准备合同 v1

状态：`PASS_LOCAL_PREPARATION` 仅在全部定向、PostgreSQL 16、基础和安全门禁通过后成立。
生产授权：`false`。
当前生产顺序：Activation 24 小时观察正在运行；只有最终 `PASS_ACTIVATE_AND_OBSERVE` 后，才能凭新绑定执行只读 Reconciliation。本地 Canonical 准备不得越过这两道门。

## 1. 目标

建立 Candidate Episode、Checkpoint、Outcome 与 Review 的统一只读模型，并固定 `shadow_verify -> canonical_compat -> canonical` 的 Fail-Closed 路由。它只服务候选生命周期和复盘分母真值，不生成交易计划、不修改实时排序、不连接生产。

## 2. 统一查询口径

每次查询必须显式固定：

1. `scope=production_radar`。
2. 当前 `asOf`，且与数据库时钟差不超过 600 秒。
3. exact release id。
4. Episode observation cohort 的起止时间。
5. Checkpoint due cohort 的起止时间。
6. 单一 checkpoint kind：`1h`、`4h` 或 `24h`。
7. exact evidence grade version：`eg.v1`。

缺少或冲突的口径返回 `unavailable`，不能默认扩大为全历史聚合。数据库不变量失败或 `asOf` 失去当前快照意义时返回 `partial`，不能标记 `ready`。

## 3. 数据真值

- `unknown/neutral` 保持原值，不能变成 long/short。
- observation price、MFE、MAE 的 null 保持 null，不能变成 0。
- `terminalOutcomes = recorded + missed + data_unavailable`。
- `completedCheckpoints = terminalOutcomes`，不一致时返回 `partial`。
- Outcome 完成率、证据覆盖率和 recording success 使用 `dueCheckpoints` 分母。
- MFE/MAE 只使用 exact `eg.v1` 的 evidence-grade 数字样本。
- evidence version mismatch、missed、data unavailable、pending、claimed、retry wait 和 completed-without-outcome 都必须显式归因。
- 数据库失败返回 `unavailable`，不能伪装成空数组或 0。

## 4. 读路由

- 当前代码授权固定为 false，因此任何 Feature Flag 组合都只能走 Legacy。
- `shadow_verify`：双读比较，Legacy 仍是返回权威。
- `canonical_compat`：必须先有独立 24 小时 Dual Read 零差异证据；每个请求只有 parity PASS 才返回 Candidate，否则显式 `legacy_fallback`。
- `canonical`：必须再有独立 24 小时 Canonical Compat 零差异证据；Candidate 失败必须直接返回 unavailable/partial，禁止静默回退 Legacy。
- 两个观察窗口各自不少于 24 小时、289 样本、最大间隔 600 秒、0 差异、0 unavailable/partial，且不能自动推进 phase。

## 5. 权限与生产边界

- 数据库事务固定为 `SERIALIZABLE READ ONLY DEFERRABLE`。
- Reader 能读取 Episode、Checkpoint、Outcome，但不能读取 Source Outbox，不能 DML/DDL。
- 本地 PostgreSQL 16 只创建临时 NOINHERIT Reader LOGIN；生产 Reader LOGIN/URL 尚未配置。
- 本包不修改 API、前端、Compose、migration、Feature Flag、control、worker、Redis、scan、analysis、strategy、risk 或 backtest。
- 本地 PASS 不表示 canonical cutover、WP-G0.2、G0 或实战能力完成。

## 6. 当前结论

该包只为后续生产阶段准备可验证读模型。实际 Legacy 归一化 adapter、生产 Reader 身份、API 接线、真实双读观察和 canonical cutover 仍必须分别实施并取证。
