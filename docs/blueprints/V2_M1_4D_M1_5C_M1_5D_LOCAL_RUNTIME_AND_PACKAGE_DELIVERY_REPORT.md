# V2 M1.4D + M1.5C/M1.5D 本地运行与生产包交付报告

日期：2026-07-27

状态：`LOCAL_RUNTIME_AND_EXACT_PACKAGE_PASS / LIVE_EXECUTION_NOT_STARTED / PRODUCTION_UNCHANGED / NO_AUTHORITY`

## 1. 本轮目标

在不越过 A0/P0R 生产门禁的前提下，补齐 Scope V2 从四 Venue 多资产目录到 Base Fact、持续 Shadow 和微观结构前向采集的本地运行闭包，并把后续腾讯执行固化为同一 exact release、无密钥运输、两包独立验收且可精确恢复的生产包。

本轮没有把本地 fixture、测试网络响应或可构建状态写成真实市场能力。

## 2. M1.4D 多资产基础事实地基

- 四 Venue 全量目录与 listing watch 形成有界、可哈希、可审计的 catalog capture。
- 多资产身份升级为 `v2-m1-multi-asset-identity.v2`，snapshot 升级为 `v2-m1-multi-asset-identity-snapshot.v3`。
- T0 listing lifecycle 与 T1 wide-market 数据在同一 point-in-time cutoff 下形成 Base Fact Snapshot。
- 每项事实显式携带 source、event time、knowledge time、observed time、ingested time、freshness、quality 和 route disposition。
- 未来目录、未来事实、cutoff 后 lifecycle、分页缺口、身份冲突和来源哈希漂移均 fail closed。
- Provider URL、TLS/HTTP 和 WebSocket transport 只存在于 Adapter；Core 合同只保存 URL hash、最大页数、超时和字节上限。

## 3. M1.5C 四 Venue 多资产 Shadow

- 固定单进程 31 周期、60 秒 cadence、至少 1,800 秒观察。
- 每周期独立核算 `BITGET_VENUE`、`LISTING_LIFECYCLE`、`EQUITY_ASSET_DOMAIN` 和 `DATA_MAXIMIZATION`。
- 证据绑定 source commit/tree/ref、scope epoch、catalog/profile/base-fact identity、cycle sequence、cutoff 和内容哈希。
- 中断、短包、跨 release/config/upstream 拼接、同名 evidence 覆盖和不完整分母全部拒绝。
- 独立 verifier 从保留文件重算 identity、序列、内容和 Gate，不信任进程自报结论。

## 4. M1.5D 微观结构前向 Shadow

- 固定 31 周期、60 秒 cadence，覆盖 trades、top-of-book 和 mark/index reference。
- research/control 标的选择只读取 cutoff 时点可知的 identity、lifecycle、Base Fact 和 Market Fact。
- future catalog、future fact、future lifecycle、非确定性排序和跨 Venue/domain/lifecycle 污染均由测试拒绝。
- research trigger 与 matched control 使用稳定排序和内容哈希，不能以事后涨跌反推选择。
- 结构化 evidence 写入临时隔离 PostgreSQL 16；不写生产 PostgreSQL、Redis 或 COS。
- M1.5D 与 M1.5C 共用 exact release/upstream，但 evidence、Gate 和验收结论相互独立。

## 5. Exact Production Package

- 新增独立 runtime entrypoint、隔离 TypeScript build、deterministic USTAR Bundle、strict request/envelope、Runner 和 shell entrypoint。
- 目标机禁止 source sync、build、dependency install、生产仓库切换、生产数据库/Redis/应用/env/Feature Flag/migration 变更。
- PostgreSQL 固定为 `postgres:16-bookworm@sha256:92620daddcd947f8d5ab5ba66e848702fe443d87fed30c4cea8e389fd78dfc55`，仅临时内部网络与 loopback 暴露，不注入生产 secret。
- Bundle 必须绑定 fresh same-commit M1.4B 与 source-conformance artifact；旧提交证据不能跨 release 复用。
- 正常和失败路径都清理临时 container、network、volume 与 staging，并比较前后 Git、容器、网络、卷、listener、timer 和 health identity。
- 只有精确恢复为 `RESTORED_EXACT` 时，结果才能声明 `productionChanged=false`；恢复失败或未验证时必须为 `null`，不得假装零变更。
- 原始异常文本不进入持久 evidence，避免路径、环境和潜在敏感信息泄漏。

## 6. 根因治理

1. Binance JSON subscribe 使用 routed stream endpoint：public topic 为 `/public/stream`，market topic 为 `/market/stream`；旧 `/public/ws` 与 `/market/ws` 模式已删除并由回归锁定。
2. 架构测试发现 runtime Core 直接依赖公网 transport。live provider 已移动到 Adapter，Core 只依赖中性 port；新增 `api.bitget.com` 边界检查。
3. Provider URL 曾进入 identity Core。真实 URL 已迁到 Adapter transport profile，Core 只保留 URL hash，Adapter 每次请求前精确复算。
4. Runner 失败结果曾不足以证明是否恢复。现已记录失败 phase、已产生 evidence 身份、临时资源计数和 topology before/after，并使用 `RESTORED_EXACT / FAILED / NOT_VERIFIED` 三态。

## 7. 验证

- `npm run test:v2-m1-base-fact`：23/23 PASS。
- `npm run test:v2-m1-expanded-shadow`：70/70 PASS。
- `npm run test:v2-m1-expanded-shadow-live-package`：12/12 PASS。
- `npm run test:v2-ops`：192/192 PASS，P0R Go package PASS。
- 全 V2 编译测试：PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS，Biome 检查 715 个文件。
- `npm run ci:forbidden-files`：PASS。
- `npm run ci:secret-patterns`：PASS。
- 最终完整 `npm run ci:production`：PASS；V2 Foundation 637 total / 631 pass / 6 explicit skip，V2 Ops 192/192，M0、Next production build、Golden 16/16 与 security 全部通过。

## 8. 未完成与权限边界

- M1.5C live cycle：0。
- M1.5D live cycle：0。
- 真实四 Venue coverage/freshness：未验收。
- 真实 microstructure coverage、latency、gap、成本和 matched-control parity：未验收。
- M1.6-D1 扩展容量证明：未开始。
- Fact、Candidate、Strategy、Signal Grade、READY 和自动交易 authority：全部为 false。
- 腾讯生产服务、数据库、Redis、Worker、Caddy、env、Feature Flag、migration、COS、生产仓库：本轮均未改变。

## 9. 正确下一顺序

```text
读取并验收 P0R target receipt
-> 完成真实 backup / exact retrieval / isolated restore / cleanup
-> fresh topology + fresh P0 PASS
-> A0 total gate PASS
-> 在同一 clean commit 刷新 source conformance 与 M1.4B upstream evidence
-> 构建 exact M1.5C+M1.5D Bundle
-> 腾讯隔离 no-authority 31 周期执行
-> M1.5C、M1.5D 分别验证
-> M1.6-D1 使用两者真实事实率做无付费容量与恢复证明
```

任何一步失败都不得借用另一包 PASS、旧 release evidence、本地 fixture 或缩短观察来减数。
