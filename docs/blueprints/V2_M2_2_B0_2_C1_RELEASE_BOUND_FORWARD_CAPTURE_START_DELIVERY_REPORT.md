# 本轮交付报告

任务：`V2-M2.2-B0.2-C1-RELEASE-BOUND-FORWARD-CAPTURE-START`

日期：2026-07-20

## 1. 本轮目标

恢复可信公开市场 egress，修复首次成功实采暴露出的 identity 与证据绑定缺口，并在同一冻结 release/config 下取得两轮、三 Venue、完整且可复核的前向合约目录证据。

## 2. 范围边界

本轮只修改 `src/v2` 的前向 instrument research capture、identity normalization、外部 evidence store、runner、CLI 和对应测试；只写工作区外 C1 evidence root。

明确未修改 Legacy、前端、后端业务 API、Detector、Candidate、Analysis、Strategy、Backtest 规则、数据库、Redis、Worker、migration、env、Feature Flag、腾讯生产服务或 GitHub main。没有自动下单或交易所账户写权限。

## 3. 修改文件清单

- `src/v2/modules/universe/identity.ts`：支持交易所真实 Unicode 字母/数字身份并进行 NFC 规范化，ASCII 字母仍确定性大写。
- `src/v2/research/forward-instrument-provenance.ts`：冻结 capture config、artifact schema version、cadence 和 exact Git release provenance。
- `src/v2/research/forward-instrument-capture.ts`：区分 canonical target、provider-native out-of-scope 和 unresolved；Raw/Snapshot/Batch 全部绑定 release/config。
- `src/v2/research/forward-instrument-continuity.ts`：范围外 row 保留 identity epoch 但不冒充 unresolved；continuity 禁止跨 release/config。
- `src/v2/research/forward-instrument-evidence-store.ts`：Artifact Reference 绑定 provenance，journal 升级为 v2。
- `src/v2/research/forward-instrument-capture-runner.ts`：请求前验证整个 journal 历史链、release/config 和上一 head artifact。
- `src/v2/entrypoints/m2-forward-instrument-capture.ts`：强制 `--release-id`、clean tracked worktree 和 exact HEAD。
- `src/v2/**/*forward-instrument*.test.ts`、`src/v2/testing/forward-instrument-harness.ts`：增加 Unicode、范围外分母、真正 unresolved、跨 release、历史 journal 篡改和 CLI release 测试。
- `src/v2/governance/m0-exit-validator.ts`：只同步 C1 已通过与 M1.5-B1-A 下一入口，不改变 M0 十项判定。
- `docs/architecture/v2/M2_2_B0_2_C1_RELEASE_BOUND_FORWARD_CAPTURE_START_V1.md`：记录 C1 当前运行合同和证据边界。
- `PROJECT_CONTEXT_FOR_CHATGPT.md`、`CHANGELOG_FOR_CHATGPT.md`、权威蓝图、机器矩阵、目录和正确搭建顺序：同步当前真值和下一入口。

## 4. 对核心链路的影响

只影响 `全市场发现 -> Universe Registry` 的合约身份与完整覆盖地基。当前能证明三家目标 Venue 从捕获日起的合约目录连续性；没有进入候选筛选、深扫验证、结构分析、风险赔率、交易计划或复盘进化。

## 5. 分层边界影响

- scan：不修改。
- analysis / strategy / backtest：不修改。
- frontend / API：不修改业务接口或页面。
- DB / Redis / worker / deployment / secret：不涉及。
- Research capture：新增 release-bound、完整分母和 identity truth。
- 生产：零变更，状态仍需新鲜只读核验。

## 6. 风险说明

1. `FORWARD_ONLY_READY` 只证明捕获起点，不是历史数据 Gate、Detector 有效性或生产 readiness。
2. 当前只有两轮、约 6 分钟证据；长期目录连续性仍需后续持续采集，不能包装成 24 小时 SLO。
3. B0.2-B 的 exact source rights 与历史 instrument capability 仍需账户所有者或合格法律审查者，Agent 不能批准。
4. 本机没有 Docker CLI；M1.5-B1 必须在独立可达 runner 证明 image、四分母和 31 周期 Shadow。
5. 旧 `b0-2-c` 根含未绑定 release 的诊断记录，只保留审计，未并入正式 C1 chain。

## 7. 执行命令

```bash
npm run test:v2-m2-forward-instrument
npm run ci:production
git commit -m "feat(v2): bind forward evidence to release truth"
git push origin codex/market-radar-v2-implementation
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=<local-proxy> HTTP_PROXY=<local-proxy> \
  npm run v2:m2:forward-instrument:capture -- \
  --evidence-root <external-release-bound-root> \
  --repository-root /Users/chuan/Documents/web \
  --release-id 4139cc631d3d760876c3e39404c494462541a910
```

采集命令执行两次，两个 Provider cutoff 组之间均超过冻结 300 秒 cadence。代理值未写入 Git、报告或 artifact。

## 8. 测试结果

- `npm run test:v2-m2-forward-instrument`：PASS，34/34。
- `npm run typecheck`：PASS（完整 CI）。
- `npm run lint`：PASS（完整 CI）。
- `npm run test:market`：PASS，Legacy 965 pass / 0 fail / 4 skip；Worker 23/23；Historical 4/4。
- `npm run test:v2-foundation`：PASS，267 pass / 0 fail / 5 explicit external-dependency skip。
- `npm run v2:m0:verify`：PASS，10/10。
- `npm run build`：PASS。
- `npm run backtest:golden`：PASS，16/16。
- forbidden-file、secret-pattern、security：PASS。
- `npm run backtest:formal`：未运行；本轮不是 Detector 正式能力验收。
- production smoke：未运行；本轮没有生产部署。

运行证据：

```text
release=4139cc631d3d760876c3e39404c494462541a910
config=sha256:6cecaf486c155721b85a4f1161b7c492e69916f27c40b4bf0bd34400d90e4a9d
batch0=sha256:1a9ee6f4eacf86ca2b18bce82dc6cd358c2746bba073bb6139d7c05a7261ed7f
batch1=sha256:6b78f520d7843e50e74f72877f299519995ca174c581de1db852fb489549bf6e
journalHead=sha256:4ac46f0b8c364afb28d89fd79c1aa8019ff62f908334696f298027709021ca7b
Binance=841 rows / 654 target / 187 out-of-scope / 0 unresolved / span 368507 ms
OKX=426 rows / 272 target / 154 out-of-scope / 0 unresolved / span 368550 ms
Bybit=746 rows / 642 target / 104 out-of-scope / 0 unresolved / span 368533 ms
allContinuity=FORWARD_ONLY_READY / complete 2/2 / gap 0 / conflict 0 / blocker 0
```

## 9. 失败项

没有代码、测试或 C1 运行出口失败项。直连 DNS/路由仍不可用，已如实记录为本机网络限制；显式本机代理路径通过公开 HTTPS 和 raw integrity 验证。

## 10. 是否更新 PROJECT_CONTEXT_FOR_CHATGPT.md

已更新：删除“C1 blocked on egress / complete snapshot=0”的过期当前事实，替换为 release-bound 两轮完整前向捕获真值。

## 11. 是否更新 CHANGELOG_FOR_CHATGPT.md

已更新。

## 12. 是否可以进入下一轮

可以进入 `V2-M1.5-B1-A-REACHABLE-DOCKER-RUNNER-PREFLIGHT`。不可以进入 B1 historical bulk acquisition、真实 cohort、Detector 生命周期、Candidate runtime 或生产 authority。

## 13. 下一轮建议

只执行 branch-scoped、GitHub-hosted、no-authority Docker runner 预检：构建 exact source image，证明三家 live 四分母、身份隔离、无 secret/生产写入和可下载脱敏证据。预检 PASS 后再单独启动固定 31 个一分钟早期 Shadow 周期。
