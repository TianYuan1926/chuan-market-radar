# Agent F - 主集成

## 集成范围

整合 Agent B / C / D / E 的修改与审查结果。

## 越权检查

未发现 Agent 越权：

- 未部署腾讯云。
- 未 push main。
- 未运行 formal。
- 未动数据库 / Redis / volume。
- 未降低 RR。
- 未放宽 `TRADE_PLAN_READY`。
- 未让前端生成交易计划。

## 文件冲突

无冲突。修改集中在合同、图表 overlay、Kline 展示、系统健康语义和测试。

## 核心结论

- `unified_decision_engine_single_source`：PASS。
- 图表 overlay 已严格受 `unifiedDecision` 门控：PASS。
- 非 READY 不再展示 stop / target 类交易计划线：PASS。
- WAIT 只展示等待条件线：PASS。
- stale / partial 不展示 fresh ready plan overlay：PASS。
- 旧 v3 plan overlay 不能绕过 unifiedDecision：PASS。

## 测试

全部通过：

- typecheck：pass
- lint：pass
- test:market：810 + 17 + 4 pass
- build：pass
- backtest:golden：16/16
- ci:forbidden-files：pass
- ci:secret-patterns：pass

## 是否可进入下一步

可以进入第 3.2 验收复查。

不能直接进入第 4 步。
不能写成生产已验证。
不能写成支撑实战交易。

