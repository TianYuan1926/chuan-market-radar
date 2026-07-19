# Legacy Capability Atlas v1

状态：`REVIEWED_CAPABILITY_LEVEL_BASELINE / ZERO_DELETION_AUTHORITY`

目的：把旧站按能力和风险分类，决定哪些可提取、哪些必须重建、哪些只保留参考、哪些先隔离。分类不是对旧代码质量的背书，也不是删除授权。

## 分类口径

| 分类 | 含义 |
| --- | --- |
| `EXTRACT` | 有可证明的纯能力，但必须移入 V2 合同并补齐故障/回放测试 |
| `KEEP_AND_HARDEN` | 安全、测试或运行防线值得保留，同时收敛身份与版本漂移 |
| `REFERENCE` | 只保留经验与历史证据，不继承运行代码 |
| `REBUILD` | 职责或 authority 错误，V2 独立实现后对比替换 |
| `ISOLATE` | 当前仍有消费者或用途尚未完全证明，禁止扩展并与 V2 隔离 |
| `RETIRE` | replacement 稳定且删除 Gate 全过后才可删除 |

## 核心结论

1. **不能原样继承 Universe**：当前按 `baseAsset + USDT symbol` 聚合多个 Venue，无法表达 contract size、settlement、venue instrument 和 unresolved identity，必须重建。
2. **不能沿用多套决策链**：Legacy、Analysis v2/v3 与 Unified Decision 并存；只提取 RR、结构 stop/target、WAIT/BLOCKED 和 anti-future-leak 防线。
3. **不能沿用前端合同 authority**：`frontend-contract.ts` 约 5,683 行，聚合、格式和部分决策调用混在一起，必须被单一 DecisionSnapshot 替换。
4. **Candidate 基础设施有提取价值**：serializable transaction、advisory lock、幂等键、append-only event、outbox、UUIDv7 和 migration safety 可提取；旧 maturity 同时包含 candidate 与 READY 语义，不能原样继承。
5. **持久化必须重建 fail-closed**：Legacy 允许缺少数据库时选择 memory mode；V2 的 Episode、Decision、Outcome 和 read authority 不允许内存冒充持久化真值。
6. **Provider 与测试值得提取**：公开 CEX adapters、CoinGlass 故障分类、Golden、anti-mock、future-leak、release/restore 思想保留，但必须进入 V2 Interface 和版本化 capability registry。

完整机器清单见 `legacy-capability-atlas.v1.json`。它覆盖所有当前 `src` 一级边界与 `src/lib` 能力目录；后续每个实施包还要做文件消费者扫描。任何 `RETIRE` 都必须单独批准，当前 `legacyDeletionAllowed=false`。

## 删除 Gate

```text
replacement contract/replay pass
-> approved shadow diff
-> V2 authority stable through rollback period
-> code/route/job/compose consumers = 0
-> rollback no longer depends on Legacy
-> exact deletion list + absence test + production health pass
```

任一步缺失，只能继续 `ISOLATE`，不能把“看起来旧”当作污染删除。
