# 本轮交付报告

## 1. 本轮目标

完成 `V2-M0.3 Legacy Consumer Map + Runtime Schema Boundary`，用可执行代码和机器门禁收口 M0 本地工程地基，并把唯一下一入口切换到 `V2-M1.1 Three-Venue Identity and Fact Slice`。

本轮完成不代表真实市场扫描、Detector、交易计划、页面或生产能力已经完成。

## 2. 范围边界

本轮允许并实际完成：

- 展开 Legacy capability 的源文件、运行消费者、测试消费者、运行入口、提取候选和存储对象。
- 为 30 个唯一 authority output 建立 strict runtime schema。
- 建立 API、进程、存储和回放共用的 fail-closed decoder。
- 建立 M0 工程出口验证器并接入生产 CI 聚合门禁。
- 更新当前蓝图、机器矩阵、施工顺序、Context、Changelog 和本报告。

本轮明确未做：

- 未修改 Legacy scan、analysis、strategy、backtest、frontend 或 API 行为。
- 未实现真实 Provider、Fact 流、Feature、Detector、Candidate、Decision 或页面。
- 未修改数据库 schema、migration、Redis、Worker、Compose、Caddy、env、Feature Flag 或 secret。
- 未删除 Legacy 代码，未连接、上传、部署或修改腾讯云生产，未修改 GitHub main。
- 未运行 `backtest:formal`。

## 3. 修改文件清单

| 文件 | 修改原因 |
| --- | --- |
| `package.json` | 精确固定 Zod、增加 Consumer Map/M0 命令，并把 M0 出口接入 `ci:production` |
| `package-lock.json` | 锁定 `zod@4.4.3` 依赖树 |
| `src/v2/domain/module-registry.ts` | 导出 30 个 authority output 的类型化名称 |
| `src/v2/domain/contracts.ts` | 分离 Release 产物版本与数据库版本，消除同名字段冲突 |
| `src/v2/runtime-schema/primitives.ts` | 建立时间、金额、质量、lineage、身份和不确定性基础 schema |
| `src/v2/runtime-schema/schema-versions.ts` | 为 29 个 envelope authority 冻结精确 schema version |
| `src/v2/runtime-schema/foundation-schemas.ts` | 建立 Universe、Fact、Feature、Context 与 Runtime 基础产物 schema |
| `src/v2/runtime-schema/decision-schemas.ts` | 建立 Candidate 到 Decision/Risk/Read Model 的严格 schema 和语义守卫 |
| `src/v2/runtime-schema/learning-runtime-schemas.ts` | 建立 Outcome、Research、Alert 和 User Journal schema |
| `src/v2/runtime-schema/registry.ts` | 建立 30 个 authority output 到唯一 schema 的注册表 |
| `src/v2/runtime-schema/decoder.ts` | 建立四类边界共用的限长、无回显、恶意对象防护和深冻结 decoder |
| `src/v2/runtime-schema/runtime-schema-registry.test.ts` | 验证 30/30 覆盖、精确版本、合法 fixture 和 strict unknown-field rejection |
| `src/v2/runtime-schema/runtime-schema-decoder.test.ts` | 验证 READY、RR、几何、时间、金额、恶意对象、JSON 和信息泄漏反例 |
| `docs/architecture/v2/LEGACY_EXTRACTION_POLICY_V1.json` | 对 22 个 Legacy capability 逐项决定提取、重建、隔离和存储归属 |
| `docs/architecture/v2/legacy-consumer-map.v1.json` | 保存当前 Legacy 消费者和入口机器地图 |
| `src/v2/governance/legacy-consumer-map.ts` | 静态分析真实 import 图、导出符号、源 digest 和删除门禁 |
| `src/v2/governance/legacy-consumer-map.test.ts` | 防止 committed map 与当前源码图漂移 |
| `scripts/v2/generate-legacy-consumer-map.mjs` | 以固定 policy/atlas 可重复生成消费者地图 |
| `src/v2/governance/m0-exit-validator.ts` | 聚合十项 M0 出口并保持生产/破坏性权限关闭 |
| `src/v2/governance/m0-exit-validator.test.ts` | 防止 M0 出口被减少或误报 PASS |
| `market-radar-v2-build-sequence.md` | 将 M0 减数并切换当前施工入口 |
| `docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md` | 同步 M0 真实工程状态和 M1.1 边界 |
| `docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json` | 同步机器状态、证据入口和当前包 |
| `docs/blueprints/README.md` | 更新唯一权威解析入口 |
| `PROJECT_CONTEXT_FOR_CHATGPT.md` | 更新当前事实、风险、测试与下一入口 |
| `CHANGELOG_FOR_CHATGPT.md` | 追加本轮重要变化并继续只保留最近五项 |
| `docs/blueprints/V2_M0_ENGINEERING_EXIT_DELIVERY_REPORT.md` | 提供本轮中文可复核证据 |

## 4. 对核心链路的影响

- 全市场发现：为 Universe/Fact/Feature 建立不可伪造的运行时边界，但尚未接入真实市场。
- 候选筛选：Candidate schema 禁止携带等级和交易计划，尚未实现 Detector。
- 深扫验证：Evidence Package 有严格 lineage/quality 边界，尚未调用深扫 Provider。
- 结构分析：Analysis 只能表达结构、方向倾向、位置与反证。
- 风险赔率：READY 的结构 RR 与净 RR 均锁定不低于 3:1；负金额和错误多空几何 fail closed。
- 交易计划：只有完整 `TRADE_PLAN_READY` 可携带 plan；OBSERVE/WAIT/BLOCKED 必须 planless。
- 复盘进化：Outcome/Research schema 与实时 authority 分离，不允许 future outcome 回写当前决策。

## 5. 分层边界影响

- scan / analysis / strategy / backtest：只新增 V2 合同边界，未修改 Legacy 业务实现。
- frontend / API：未修改现有行为；decoder 只是待 M1+ 调用的 V2 边界库。
- DB / Redis / worker / deployment / secret：均未修改。
- production：零命令、零变更，状态继续 UNKNOWN。

## 6. 风险说明

- M0 `LOCAL_PASS` 只证明地基可进入 M1，不证明 V2 已可运行或可实战。
- Consumer Map 是删除前置证据，不是删除授权；当前所有 `deletionAllowedNow` 均为 false。
- runtime schema 能拒绝坏对象，但只有后续所有真实边界都调用 decoder 才能形成系统防线。
- 当前腾讯云 release identity、health、Postgres、Redis 和 Worker 没有新鲜只读证据，不能写成健康或失败。

## 7. 执行命令

```text
npm install zod@4.4.3 --save-exact
npm run typecheck
npm run test:v2-foundation
npm run v2:m0:verify
npm run ci:production
git status --short --branch
```

`ci:production` 内部执行 forbidden files、secret patterns、typecheck、lint、test:market、V2 tests、M0 verifier、build、golden backtest 和 security check。

## 8. 测试结果

- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：核心 965 pass / 0 fail / 4 explicit skip；Worker 23/23 PASS；historical backtest 4/4 PASS。
- `npm run test:v2-foundation`：38/38 PASS。
- `npm run v2:m0:verify`：10/10 PASS，`PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED`。
- `npm run build`：PASS，Next.js production build 完成。
- `npm run backtest:golden`：16/16 PASS。
- `npm run ci:forbidden-files`：PASS。
- `npm run ci:secret-patterns`：PASS。
- `npm run security:check`：PASS。
- `npm run ci:production`：端到端 PASS。
- production smoke：未运行，生产零变更。
- `npm run backtest:formal`：未运行，本轮不是 formal 能力验收。

## 9. 失败项

- 首次 `typecheck` 发现 `traceEnvelopeShape` 把 producer module 扩宽为全部 Module 联合；已改为 const generic 保持字面量类型，同一门禁随后 PASS，没有使用断言掩盖错误。
- 交付前反向审查发现 envelope 版本未精确锁定，且 `ReleaseRecord.schemaVersion` 与 Trace Envelope 同名；已增加 29 个精确版本并将数据库版本改为 `databaseSchemaVersion`，新增版本漂移反例后 PASS。
- 最终定向测试、M0 出口和完整门禁均无失败项。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。写入 M0 工程出口、Consumer Map、runtime schema、生产未知状态和 M1.1 唯一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并继续只保留最近五个重要变化。

## 12. 是否可以进入下一轮

可以进入本地 `V2-M1.1`。不可以据此部署 V2、执行 migration、接入页面、删除 Legacy、切换 authority 或声称系统已经可实战。

## 13. 下一轮建议

只执行 `V2-M1.1 Three-Venue Identity and Fact Slice`：三家目标 CEX 的同一 BTC 线性永续身份归一化、Point-in-Time Fact、Quality 与失败分类。
