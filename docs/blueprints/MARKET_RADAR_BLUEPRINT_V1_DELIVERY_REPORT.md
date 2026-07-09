# Market Radar 双蓝图 v1.0 本轮交付报告

_2026-07-10；工程搭建蓝图与生产运行蓝图的文档交付证据。_

---

## 1. 本轮目标

在 V3 实战就绪路线图基础上，建立一套工程团队能施工、生产操作者能运行、外部审计能追踪的权威蓝图体系：工程搭建蓝图回答“怎么正确建”，生产运行蓝图回答“上线后怎么持续可信运行”。

## 2. 范围边界

本轮只做：

- 当前代码、Compose、API、worker、持久化、发布和恢复脚本的只读核对。
- 工程架构、领域合同、运行状态机、SLO、降级、runbook 和验收设计。
- 蓝图索引、机器追踪矩阵和项目上下文维护。

本轮明确没有：

- 修改业务代码、前端、API、scan、analysis、strategy、backtest 或 Shadow 实现。
- 修改数据库 schema、Redis、worker、Docker、Caddy 或生产配置。
- 提交、push、部署、migration、restore、rollback 或服务重启。
- 运行 `backtest:formal` 或用真实资金验证。

## 3. 修改文件清单

| 文件 | 作用 |
| --- | --- |
| `docs/blueprints/README.md` | 权威蓝图目录、状态词典、阅读顺序和变更规则 |
| `docs/blueprints/MARKET_RADAR_ENGINEERING_BUILD_BLUEPRINT_V1.md` | 目标架构、领域合同、模块/数据/API/安全/测试/发布/建设顺序 |
| `docs/blueprints/MARKET_RADAR_PRODUCTION_RUNTIME_BLUEPRINT_V1.md` | 服务拓扑、启停、调度、状态机、SLO、降级、告警、runbook、恢复 |
| `docs/blueprints/market-radar-blueprint-traceability.v1.json` | 核心链路、G0-G8、代码路径、服务和证据的机器映射 |
| `docs/chuan-market-radar-blueprint.md` | 改为兼容总索引；旧详细内容降为历史事实保留区 |
| `PROJECT_CONTEXT_FOR_CHATGPT.md` | 登记蓝图体系和当前边界 |
| `CHANGELOG_FOR_CHATGPT.md` | 登记本轮交付事实 |

## 4. 对核心链路的影响

本轮不改变运行链路，但为以下环节建立权威工程与运行合同：

```text
全市场发现
-> 候选筛选
-> 深扫验证
-> 结构分析
-> 风险赔率
-> 交易计划
-> 复盘进化
```

机器矩阵将每一环映射到当前代码路径、目标合同、V3 Gate、运行检查、证据和禁止输入。

## 5. 分层边界影响

| 分层 | 本轮影响 |
| --- | --- |
| SCAN | 只定义 MarketFact、identity、scan proof、candidate 和 deep SLA |
| ANALYSIS | 只定义 AnalysisReadModel、证据与反证边界 |
| STRATEGY | 只定义统一决策、WAIT/READY、RR 和 Risk Gate |
| BACKTEST/SHADOW/REVIEW | 只定义不可变 observation/outcome 和 no-production-mutation |
| Frontend | 只定义 truth-only adapter 和页面读模型边界 |
| API | 只定义公共读、用户写、管理写和统一 envelope |
| DB/Redis | 只定义所有权、目标实体、key 和保留规则，不迁移 |
| Worker | 只定义责任、周期、heartbeat 和 run record |
| Deployment | 只定义 release identity、发布 Gate 和 rollback 协议 |
| Secret | 只定义安全规则，不读取或修改真实值 |

## 6. 风险说明

- 蓝图状态为 `PROPOSED`，不表示任何目标能力已落地。
- 当前仍是 `R1 / 可运行但不完整 / 不能支撑实战`。
- 当前 P0 仍是公网 HTTP、前端事实污染、生命周期映射错误、重复 scan proof 和 release/evidence 未对齐。
- 现有 `docs/chuan-market-radar-blueprint.md` 包含大量历史施工事实；本轮保留原内容，避免丢失未提交变化，但已明确降为低优先级历史区。

## 7. 执行命令

本轮执行的只读/文档验证类型：

```text
读取 context/changelog/V3/旧蓝图/审计报告
列出 API、页面、worker、persistence 和运行脚本
核对 Docker Compose、Caddy、Dockerfile、CI、deploy/rollback/backup/restore
解析 JSON 追踪矩阵
检查 Mermaid、Markdown、路径、引用、敏感值和 diff
```

没有执行真实生产命令。

## 8. 测试结果

| 检查 | 结果 |
| --- | --- |
| JSON parse | PASS |
| 当前代码路径存在性 | PASS，缺失 0 |
| Compose 服务映射 | PASS，11 个服务 |
| 核心链路映射 | PASS，7 个环节 |
| Gate 映射 | PASS，G0-G8 共 9 个 |
| Markdown H1/代码围栏 | PASS |
| Mermaid 静态结构与无障碍字段 | PASS，13/13；本地未安装 renderer，未声称完成视觉渲染测试 |
| Footnote 引用 | PASS |
| Placeholder 扫描 | PASS |
| 敏感值扫描 | PASS，0 命中 |
| `diff-check` | PASS |
| `npm run typecheck` | 未运行；本轮无代码改动 |
| `npm run lint` | 未运行；本轮无代码改动 |
| `npm run test:market` | 未运行；本轮无代码改动 |
| `npm run build` | 未运行；本轮无代码改动 |
| `npm run backtest:golden` | 未运行；本轮无代码改动 |
| `npm run backtest:formal` | 未运行；按规则禁止乱跑 |

## 9. 失败项

当前没有文档结构或一致性失败项。运行系统的既有 P0 未在本轮修复，不能因蓝图交付而关闭。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新。登记双蓝图、总索引、追踪矩阵、当前 R1 边界和唯一下一入口。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入蓝图审计和批准；不可以跳过批准直接实施 G1-G8，也不可以把蓝图完成写成系统实战完成。

## 13. 下一轮建议

审计并批准双蓝图后，只拆分 `WP-G0.1 - Frontend Truth Contract` 的独立执行计划。
