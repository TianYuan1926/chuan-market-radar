# 本轮交付报告

## 1. 本轮目标

在不继承归档 V2 设计分支下 70 个 Legacy G0 施工提交的前提下，建立 Market Radar V2 的干净工程起点，冻结正确搭建顺序、产品宪法、模块权威、状态边界、事件评估定义和 Legacy 隔离规则，并直接启动首个 M1 地基纵切契约。

本轮不是 M0 完成，也不是实战能力完成，只是把后续施工放到可验证、不会继续污染 Legacy 的正确轨道上。

## 2. 范围边界

本轮允许并实际完成：

- 从最新 `origin/main@e5eb90026d8bfcd52b060359446515de5a5c32d6` 创建独立 `codex/market-radar-v2-implementation` 分支。
- 只带入归档设计分支的 V2 当前设计提交，形成干净 V2 起点 `ef42535369d547440aa04883ac56b15733fe8216`。
- 新增 V2 M0 架构文档、机器 Manifest、Legacy Capability Atlas、领域合同和合同测试。
- 把 V2 基础测试接入项目生产 CI 聚合命令。
- 通过 Microsoft Edge 打开腾讯 OrcaTerm，仅查看连接状态。

本轮明确未做：

- 未修改 Legacy scan、analysis、strategy、backtest、frontend 或 API 运行逻辑。
- 未连接数据库或 Redis，未改 schema、migration、Worker、Compose、env、Feature Flag 或 secret。
- 未上传文件、未部署、未重建容器、未修改 GitHub main 或腾讯云生产。
- 未删除 Legacy 代码。Atlas 只分类，不授权删除。
- 未运行 `backtest:formal`。

## 3. 修改文件清单

- `market-radar-v2-build-sequence.md`：定义 M0-M7 正确搭建顺序、关键路径、并行边界和真实进度计数规则。
- `docs/architecture/v2/ADR-0001-CLEAN-BASELINE-AND-V2-ISOLATION.md`：记录干净基线与 V2/Legacy 双向隔离决策。
- `docs/architecture/v2/V2_BASE_MANIFEST.v1.json`：机器可读地绑定基线、分支、设计来源和生产边界。
- `docs/architecture/v2/PRODUCTION_TRUTH_BASELINE_2026-07-20.md`：记录生产读通道不可用，不以旧证据冒充当前事实。
- `docs/architecture/v2/EVENT_AND_EARLY_DETECTION_DEFINITION_V1.md`：冻结事后事件标签、提前率和三个评估分母，禁止未来标签进入实时链路。
- `docs/architecture/v2/DATA_CAPABILITY_AND_REPLAY_BASELINE_V1.md`：定义三家目标 CEX 与 CoinGlass 的数据角色、授权、成本、存储和回放要求。
- `docs/architecture/v2/LEGACY_CAPABILITY_ATLAS_V1.md` 与 `legacy-capability-atlas.v1.json`：覆盖 Legacy `src` 能力目录，分类为提取、保留强化、参考、重建、隔离或退役候选。
- `docs/architecture/v2/M1_FOUNDATION_VERTICAL_SLICE_CONTRACT_V1.md`：定义三交易所 BTC 线性永续从 Universe 到 Runtime Truth 的首条纵切，不生成 Candidate、Signal 或交易计划。
- `src/v2/domain/*`：新增产品宪法、状态、不确定性、18 Module 注册表、核心权威产物合同和 Strategy Decision 领域语义守卫；外部输入 decoder 属于下一包。
- `src/v2/research/event-label-contract.ts`：新增只能用于评估的事件标签与提前捕获分类器。
- `src/v2/fixtures/m1-foundation-slice.v1.json`：新增显式 synthetic、test-only、禁止进入运行时的三交易所 fixture。
- `src/v2/**/*.test.ts`：新增模块唯一权威、V2/Legacy 隔离、fixture 污染、READY 完整性、净 RR、事件未来泄漏和 Atlas 覆盖测试。
- `package.json` 与 `tsconfig.market-test.json`：接入 `test:v2-foundation` 和 V2 TypeScript 测试编译。
- 活跃蓝图、蓝图索引、机器追踪矩阵、`PROJECT_CONTEXT_FOR_CHATGPT.md` 与 `CHANGELOG_FOR_CHATGPT.md`：同步本轮当前事实和下一入口。

## 4. 对核心链路的影响

- 全市场发现：建立三家目标 CEX 的标准化 Instrument Identity 和同一底层资产分组合同，但尚未接入实时全市场数据。
- 候选筛选：只冻结 Candidate 状态与职责边界，尚未实现 V2 Detector 或调度器。
- 深扫验证：只冻结 Evidence Package 权威合同，未实现 Provider 调用。
- 结构分析：只冻结 Analysis Snapshot 权威合同，未实现新分析器。
- 风险赔率：锁定结构 RR 与净 RR 均不得低于 3:1，个人风险只能降级，不能升级 Action State。
- 交易计划：用 TypeScript 判别联合与领域语义守卫确保只有完整 READY 计划可携带 entry、stop、target 和 RR；WAIT/BLOCKED/OBSERVE 必须没有可执行计划。外部不可信对象仍须先经过 M0.3 runtime schema decoder。
- 复盘进化：冻结 point-in-time 事件评估定义，未来结果只能进入 Outcome/Research，不能污染生产发现和决策。

## 5. 分层边界影响

- scan：未修改 Legacy；V2 仅建立 Discovery Candidate 合同。
- analysis：未修改 Legacy；V2 仅建立分析权威边界。
- strategy：未修改 Legacy；V2 新增最终决策合同与 READY 守卫。
- backtest/review：新增 evaluation-only 标签合同，不写生产排序。
- frontend：未修改，且 V2 合同继续禁止前端生成交易事实。
- API：未修改。
- DB / Redis / worker / deployment / secret：均未修改。

## 6. 风险说明

- 当前 V2 仍处于 `M0_IN_PROGRESS_LOCAL_ONLY`，不能写成已经具备实战能力。
- 当前腾讯 OrcaTerm 显示 0 个已连接会话且无连接配置，因此 production health、release identity、Postgres、Redis 和 Worker 当前事实全部保持未知。
- 当前 fixture 是 synthetic 合同样本，不是实时数据；架构测试会阻止生产代码导入 `src/v2/fixtures`。
- Legacy Atlas 是提取和替换依据，不是立即删除许可。删除必须等消费者清零、替代能力验证和回滚窗口满足。
- 首条真实数据纵切、运行时 schema 边界和 Legacy Consumer Map 尚未完成，是下一包的明确范围。

## 7. 执行命令

```text
git fetch origin
git switch -c codex/market-radar-v2-implementation origin/main
git cherry-pick 983ef76e76de08540c3dacfb85969d2718111254
npm run test:v2-foundation
npm run typecheck
npm run lint
npm run test:market
npm run build
npm run backtest:golden
npm run ci:forbidden-files
npm run ci:secret-patterns
npm run security:check
npm run ci:production
```

还执行了只读 Git、JSON、Markdown、链接、工作树和敏感信息检查。未执行数据库、Redis、部署、迁移或生产写命令。

## 8. 测试结果

- `npm run test:v2-foundation`：PASS，18/18。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run test:market`：PASS；核心 965 pass / 0 fail / 4 explicit skip，Worker 23/23，historical 4/4。
- `npm run build`：PASS。
- `npm run backtest:golden`：PASS，16/16。
- `npm run ci:forbidden-files`：PASS。
- `npm run ci:secret-patterns`：PASS。
- `npm run security:check`：PASS。
- `npm run ci:production`：端到端 PASS，确认上述基础门禁和新增 V2 foundation 测试按正式顺序全部执行。
- `npm run backtest:formal`：未运行，按规则禁止。
- production smoke：未运行，因为本轮生产零变更且无可用只读 OrcaTerm 会话。

## 9. 失败项

- `lint` 首次发现 Next.js 规则禁止在两个测试循环中使用变量名 `module`；变量改为语义等价的 `definition` 后 PASS，没有改规则或关闭检查。
- `test:market` 首次在受限沙箱中有 2 个 Worker 因 `listen EPERM 127.0.0.1` 失败；在仅允许本机回环监听的受控环境运行同一命令后全部 PASS，没有修改测试或 Worker 逻辑。
- `build` 首次因受限网络无法解析现有 `fonts.googleapis.com` 失败；仅开放构建所需网络后同一命令 PASS，没有改字体或构建配置。
- 生产只读核验未完成：OrcaTerm 没有已连接会话。该项标记为 `NO_ACTIVE_READ_CHANNEL`，不能冒充 PASS。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。写入干净分支、M0 当前状态、V2 合同、生产未知状态和下一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新，并继续只保留最近 5 个重要变化。

## 12. 是否可以进入下一轮

可以进入本地 `V2-M0.3`。不可以部署 V2，不可以声称 M0 完成，也不可以执行任何生产写操作。

## 13. 下一轮建议

只执行 `V2-M0.3 Remaining: Legacy Consumer Map + Runtime Schema Boundary`：先标清 Legacy 当前消费者和数据库表归属，再为跨进程、存储和 API 输入建立 fail-closed decoder。现有 M1 第一纵切合同保持冻结，M0 出口通过后再开始三家 CEX 的真实只读 Instrument/Fact/Quality 最小实现。
