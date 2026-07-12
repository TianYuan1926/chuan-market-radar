# WP-G0.2 Runtime Identity and Permission 本地准备合同

## 1. 本包目标

在不连接生产的前提下，关闭 Candidate 三条数据库通道“URL 已分离但 NOINHERIT LOGIN 无法获得能力角色”的真实缺口。source、consumer、monitor 必须在每个事务内显式切换到唯一固定的 NOLOGIN 能力角色。

当前结论：

```text
本地代码与隔离 PostgreSQL 16：PASS
生产 Dormant Deploy：尚未执行
生产 Candidate LOGIN：尚未创建
生产 URL / Feature Flag / control lifecycle：未配置、未开启
系统等级：R1 / 可运行但不完整 / 不能支撑实战
```

## 2. 三条身份边界

| 通道 | 独立 URL | 固定事务角色 | 允许 | 禁止 |
| --- | --- | --- | --- | --- |
| source | `CANDIDATE_SOURCE_DATABASE_URL` | `candidate_application_writer_role` | `scan_archives` SELECT/INSERT、批准的 Candidate writer procedures | UPDATE/DELETE、Candidate 直接表写、DDL |
| consumer | `CANDIDATE_CONSUMER_DATABASE_URL` | `candidate_shadow_executor_role` | claim/retry/quarantine、Episode/Outcome 批准过程 | source enqueue、直接表读写、DDL |
| monitor | `CANDIDATE_MONITOR_DATABASE_URL` | `candidate_audit_role` | Candidate authority 只读 | legacy archive 读取、任何写入、DDL |

LOGIN 必须是 `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`，且每个 LOGIN 只有一个能力角色 membership。不得让三个 URL 共用 LOGIN、secret 或连接池。

## 3. 为什么必须 SET LOCAL ROLE

能力角色都是 NOLOGIN。生产 LOGIN 也必须 NOINHERIT，因此仅执行 `GRANT capability_role TO login` 不会自动获得权限。运行时必须在 `BEGIN` 后、业务 SQL 前执行固定 `SET LOCAL ROLE`；事务结束后 PostgreSQL 自动恢复 session role。

角色名只能来自代码内 `purpose -> role` 固定映射，并通过安全标识符校验。禁止从 URL、环境变量、HTTP 参数或数据库内容动态决定角色。

## 4. Source 原子写的最小补充

source 必须在同一事务写 legacy `scan_archives` 和调用 Candidate enqueue procedure，才能避免旧归档成功而 Candidate outbox 丢失。权限合同因此只授予 writer role：

```text
public.scan_archives: SELECT, INSERT
```

明确不授予 UPDATE、DELETE、TRUNCATE、REFERENCES、TRIGGER 或任何 DDL。consumer 和 monitor 对 `scan_archives` 保持无权限。

## 5. 隔离演练证明

本地 PostgreSQL 16 从空库应用 migration 001-009，创建三个临时 NOINHERIT LOGIN，并执行真实连接：

- 三个 LOGIN 均无危险属性且各只有一个 membership。
- source 成功写入并读取 `scan_archives`，UPDATE/DELETE/DDL/Candidate 直接表写均返回拒绝。
- consumer 具备 claim procedure、无 enqueue procedure 和直接表权限。
- monitor 可读 Candidate control、不可读 legacy archive、不可写。
- source LOGIN 强制切换 consumer role 返回 `42501`。
- 临时集群和 LOGIN 在测试结束后销毁，未连接生产。

## 6. 生产硬边界

本包不创建生产角色、不写生产环境文件、不重启服务、不启用 Candidate、不启动 control lifecycle。后续生产身份包必须在 Dormant Runtime Deploy 最终 PASS 后另获精确限时审批，并具备 credential 与 Web 自动回滚。
