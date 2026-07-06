# 垃圾资产清理计划

目标：减少审计包、日志、zip、旧证据和本地临时文件对工程判断的干扰，避免误提交。

## 禁止提交

- `.env`
- `.env.*`
- `audit-*/`
- `audit-core-system-self-check/`
- `*.zip`
- `*.log`
- `*.exitcode`
- `*.raw.log`
- `raw/`
- `evidence/`
- `api-samples/`
- `node_modules/`
- `.next/`
- `dist/`
- `build/`

## 本地可保留但不进 Git

- 审计证据包
- 生产事实源采集包
- 临时日志
- 本地报告 zip
- 手工导出的 API sample

## 清理顺序

1. 先跑 `git status --short` 区分 tracked/untracked。
2. untracked 审计包可保留本地，不 add。
3. tracked 高风险文件必须停止并报告，不直接提交。
4. 清理前确认不包含生产数据、报告唯一副本或用户需要的证据包。

## 自动化保护

- `npm run ci:forbidden-files`
- `npm run ci:secret-patterns`

这两个命令进入 `ci:production` 和 GitHub Actions quality gate。
