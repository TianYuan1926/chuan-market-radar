# V2-M1.6 P0R Route Authority Root Remediation Delivery Report

日期：2026-08-02

状态：`LOCAL_EXACT_MAIN_BRANCH_FULL_CI_PASS / CODEQL_ROOT_REMEDIATION_PASS / CURRENT_SOURCE_GITHUB_FOUR_GATES_PASS / FRESH_PRODUCTION_REBIND_PENDING / PRODUCTION_UNCHANGED / P0R_BLOCKED`

## 1. 根因

transaction v1 会验证 `market-radar-v2-m1-p0r-external-route-evidence.v1`，但仓库中不存在权威生产者。测试和现场只能手工填入 `firewallRuleIdentityHash`；事务只验证它是否为 64 位十六进制，无法证明该值来自腾讯 `DescribeFirewallRules`、正确实例、完整分页、唯一 exact `/32` 规则或服务器 exact listener。继续执行会把人工拼装 JSON 误当作 route authority，并可能再次消耗 listener、firewall 和人工 MFA 窗口。

## 2. 永久修复

- 新增 route target v1，精确绑定腾讯 Lighthouse provider、endpoint、action/version、region、instance id、固定生产 SSH host/alias/user、TCP 8022 和 transient unit；transaction lease 保存其 canonical SHA-256。
- 新增腾讯 firewall capture v1，只接受 authenticated API Explorer native response、`Response` 精确字段、RequestId、FirewallVersion、TotalCount 和完整 100 条分页。任何截断、版本漂移、重复 RequestId、未知字段、宽 CIDR、多端口、端口范围、重复或额外 8022 ACCEPT 规则均 fail closed。
- firewall identity 由 provider/action/version/region/instance/FirewallVersion/RequestId 集合和完整 normalized rule canonical 重算，事务不再接受调用者提供的任意 hash。
- 新增固定 SSH listener observer。它使用 strict known_hosts、ed25519 host key、固定 identity、固定 SOCKS、固定 host/port/user 和 source-bound remote command，验证 exact systemd unit 为 loaded/active/running、MainPID、一个 IPv4 listener、零 IPv6 listener、sshd process 与 MainPID 一致。
- observer shell 进入 transport v4，内包由 16 members 升为 17 members；lease 绑定 observer script SHA-256，远端执行前由 `sha256sum --check --status` 验证 exact bytes。
- route evidence 升为 v2，记录 source freshness、provider RequestId/FirewallVersion、capture hash、listener observation hash、known_hosts/public-key hash、remote command/observation hash和 exact route target hash。transaction 在 Bridge 启动前重新计算 firewall identity 与 listener observation digest。
- route target、lease、firewall capture 和 listener observation 只接受 current-user、mode-600、canonical JSON；既有 provisioning plan 继续按安全稳定读取和 exact SHA-256 绑定。listener observation 与 route evidence 由 producer 以 no-clobber mode-600 canonical JSON 写出；route evidence 和 listener/firewall source freshness 均限制为 120 秒。
- 首轮远端安全资格在 `scripts/v2/production/m1-production-storage-p0r-route-evidence.mjs:112` 报出真实 CodeQL `js/file-system-race`。诊断提交 `8059edf37fd0076b36cb7c57f233525c0d3056f3` 只增加有界、脱敏的 rule/path/line/severity annotation，不隐藏结果；安全 run `30725896115`、job `91437419288` 因该 7.7 级 finding 保持 FAIL。
- 永久修复提交 `913bae3a2db4d8f172d0de9be87305ad21b53884` 将 public identity 读取改为先以 `O_RDONLY | O_NOFOLLOW` 打开 exact path，再以 descriptor `stat` 作为 authority，随后验证 canonical path/lstat 与已打开对象一致，并在有界读取后复核 descriptor/path/realpath 身份。没有添加 suppression、忽略规则或缩小扫描范围。

## 3. 本地证据

- route authority、producer 和 transaction directed tests：`24/24 PASS`。除 101 条跨两页完整分页、官方 ICMP 空 `Port` 形态、非法端口、重复 RequestId、public identity symlink/no-follow 和 SSH 身份观察前后漂移外，新增回归还证明安全 open 必须发生在 path lstat 之前。
- exact transport v4、staging、rebind 和 bundle regressions：`30/30 PASS`；隔离工作树首次缺少 `node_modules/pg` 的 3 个环境失败不计入 PASS，使用锁定 Node 22/npm 10 完成 `npm ci` 后原样通过。
- 完整 P0R suite：`139/139 PASS`，Go COS helper PASS。
- 全 V2 Ops：`266/266 PASS`。exact-toolchain launcher `3/3 PASS`；本机默认 Node `24.15.0` / npm `11.12.1` 的一次运行按设计失败，不计 PASS。固定入口现自动选择已安装的 Node `22.23.1` / npm `10.9.8`，若不存在则在任何长门禁前失败，不再依赖操作员记忆或要求用户切版本。
- M0 exact CI binding：`6/6 PASS`。外层只允许固定 launcher 指向 `ci:production:exact`，内层精确锁定 14 项有序生产门禁、self-building verifier 和 compiled authority；删除、重排、绕过或 target 漂移均 fail closed。
- 隔离候选完整 `ci:production` 再次自动选择锁定工具链并通过分支身份前的全部门。V2 Foundation=`643 total / 636 pass / 6 explicit skip / 1 expected fail`；唯一失败检查为 `clean_v2_branch_identity`，因此不计 full CI PASS，必须在唯一 V2 实施分支从头复验。
- 候选通过污染、安全和 diff 审计后形成 exact implementation commit `157e9a79a635d8f31857481fbd6a51d10df51160`，并以同一 commit identity 精确合入 `codex/market-radar-v2-implementation`。
- 官方 V2 实施分支在永久修复最终字节上完整 `ci:production` 已从头 PASS：recurrence=`11/11`、production dispatch=`25/25`、market=`965 PASS / 4 explicit skip`、workers=`23/23`、historical=`4/4`、V2 Foundation=`643 total / 637 PASS / 6 explicit skip`、V2 Ops=`266/266`、M0=`12/12`、Next production build、Golden=`16/16` 和 security 均通过。候选身份门失败和首轮真实 CodeQL FAIL 继续作为历史红证据保留。
- exact source `913bae3a2db4d8f172d0de9be87305ad21b53884` 的 GitHub 四门已全部 PASS：Signed Production Dispatch=`30726178696`、Full Quality and Materials=`30726178679`、A0 Release Qualification=`30726178659`、Independent Security=`30726178672`；CodeQL job `91438221977` PASS 且无 annotation。
- ESLint 与 Biome：PASS。
- Node：`22.23.1`；npm：`10.9.8`；Go 使用本机 `/opt/homebrew/bin/go`。

## 4. 未改变范围

本包先在隔离 worktree `codex/p0r-route-evidence-producer` 开发和审计，再以 exact commit 身份精确合入唯一 V2 实施分支；随后实现、诊断和永久修复提交均已推送并完成远端资格。腾讯 production-dispatch 执行、firewall/listener、STS、COS、数据库、Redis、容器、env、migration、Feature Flag、业务服务和流量均未改变。Edge 敏感响应页未读取、未截图、未 OCR、未做 browser-state 或 computer-use。

## 5. 仍未完成

- 当前 exact implementation/fix source 已取得本地和 GitHub 四门资格；尚未取得 fresh production rebind、外部零残留或真实目标恢复验收。候选 `636 PASS + 1 branch-identity failure`、首轮 CodeQL FAIL 和后续 PASS 均分别保留，不互相覆盖；GitHub PASS 不能替代生产资格。
- 腾讯 API Explorer response 是经过账户认证的控制面观察，但不是腾讯签名证明；生产证据必须由代理从原生 response 自动保存，用户不得手工拼装 final route JSON。
- 旧云 listener/firewall/server residue 与 production zero drift 仍未 fresh 复核；在安全页面关闭和旧外部状态清场前不得创建新 route 或 STS。
- 新 transport v4 会使旧 v3 package、run、lease 和 route evidence 全部失去执行权；必须生成全新 run/plan/object key/package/staging。
- P0R 仍需真实完成只读加密 backup、exact COS version retrieval、独立 PostgreSQL 16 restore、cleanup 和 production zero drift，才可进入 fresh P0。

## 6. 下一步

1. 对承载本报告与机器真值的最终 HEAD 从头复跑本地门禁和 GitHub 四门，确保资料同步没有产生 source 漂移。
2. 取得 fresh signed read-only rebind，并在不读取 Edge 的情况下验证服务器 8022/unit/P0R residue；外部云清场仍遵守敏感页边界。
3. 生成全新 route target、lease、run、plan、transport v4 和 fixed-dispatch staging。
4. 由代理自动保存 authenticated Tencent firewall capture、生成 listener observation 和 route evidence v2；只有全部 PASS 后才允许 Bridge PREARMED 和唯一平台强制的本人 MFA/native Copy。
5. 完成真实 P0R recovery、零残留 closure、fresh health/topology/calibration 和 fresh P0。
