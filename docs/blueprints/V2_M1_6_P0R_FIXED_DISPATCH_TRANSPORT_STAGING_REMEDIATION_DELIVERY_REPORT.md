# V2 M1.6 P0R Fixed Dispatch Transport Staging Remediation Delivery Report

Date: 2026-07-31

Status: `LOCAL_AND_REMOTE_QUALIFICATION_PASS / UNSAFE_PARENT_PERMISSION_FAIL_CLOSED_ZERO_MUTATION / P0R_PARENT_0700_REMEDIATION_PASS / FRESH_SIGNED_DISPATCH_EXACT_TARGET_ACCEPTANCE_PASS / PRODUCTION_ZERO_DRIFT / REAL_RECOVERY_NOT_STARTED`

## 1. Purpose

This package permanently removes the Tencent OrcaTerm browser file manager from P0R production package transport. It delivers one already qualified, secret-free P0R transport v3 archive through the existing Ed25519 signed pull-only production dispatch channel and atomically stages its exact 16 members for a later, separately authorized recovery session.

It is a transport-only remediation. It cannot request or carry STS credentials, read PostgreSQL, access COS, start the P0R session or Runner, change an application service, or claim recovery success.

## 2. Qualified Inner Package

- source commit: `be87cf040472559979f4b6a602350970d9bf2c32`
- run id: `p0r-20260729t221859z-48eee3208ed0c519e49c2519f05e665e`
- transport schema: `v2-m1-production-storage-p0r-transport.v3`
- archive SHA-256: `44f5e34fdd2bbdbf94dbc642a3a45b39b6271f9d14e6dc5cb7173d7bddf2aa9b`
- archive size: `9176819` bytes
- member count: `16`
- manifest digest: `sha256:8d6abdbc6ab91d35c2b9bd43269fe37993351094886eb56d194186968812d39b`
- plan digest: `sha256:b595256b84ea2db11aba941ff22423e09b315baa8d76e006ff5e3b9ca9b3fd00`
- runtime capsule SHA-256: `cc0ce88091cc0b32850197c98c222df8b3b1406d2afb36fa6aed69021e76a7b9`
- contains secret: `false`

The source passed all four GitHub gates:

- Signed Production Dispatch Quality: `30494580534`
- A0 Release Qualification: `30494580517`
- Independent Security Quality: `30494580551`
- Full Quality and Materials Gate: `30494580577`

Fresh production read-only rebind `p0r-rebind-preflight-20260729t220958z-0bc442e3` also passed without production mutation.

## 3. Recurrent Transport Failure

The OrcaTerm browser file manager failed three controlled delivery attempts for the exact archive:

1. The first upload disconnected the OrcaTerm session before a target file existed.
2. The second upload remained at `0B/8.8MB`.
3. An independently checksummed copy at a short visible Downloads path also failed.

The measured interval from the first upload submission to the final controlled comparison was 805 seconds. Production read-only checks proved that `/home/ubuntu/p0r-transport-a.tar.gz` and the run-bound target staging directory were absent. No credential, database, COS, repository, service, container, Redis, migration, environment or feature-flag mutation occurred.

The recurrence registry therefore reopens `REC-2026-07-23-ORCATERM-ZERO-BYTE-UPLOAD`. `p0r_orcaterm_recovery_bundle_transport` is permanently retired. Reloading or retrying the browser uploader is not an allowed remediation.

## 4. Replacement Boundary

The replacement adds:

- `scripts/v2/production/m1-p0r-transport-staging.mjs`
- `scripts/v2/production/m1-p0r-transport-staging-entrypoint.sh`
- `scripts/v2/production/m1-p0r-transport-staging-bundle.mjs`
- `scripts/v2/production/m1-p0r-transport-staging-release.mjs`
- `scripts/v2/production/m1-p0r-transport-staging.test.mjs`

The outer dispatch has exactly five members and binds:

- canonical approval request
- exact source commit and source ref
- exact run id, plan digest and inner archive SHA-256
- exact target delivery path
- 90-second dispatch runtime
- exact outer member names, modes and hashes
- no-secret and no-recovery authority

The target implementation:

- verifies regular non-symlink source files with before/after identity checks
- rejects approval, source, destination, member, owner, mode or hash drift
- creates only one run-bound `.incoming-*` directory
- extracts and verifies the exact 16 members
- atomically renames into the final run directory without overwrite
- verifies final modes, owner and bytes
- cleans only its exact outer dispatch staging
- never invokes the P0R session or Runner

## 5. Verification

- transport staging tests: `11/11 PASS`
- recurrence plus staging targeted tests: `22/22 PASS`
- complete P0R tests on the real host permission boundary: `111/111 PASS`
- Go COS helper: `PASS`
- full `ci:production` under Node `22.23.1`, Go `1.26.3` and `GOTOOLCHAIN=local`: `PASS` with exit code `0`
  - Market: `965 PASS / 4 explicit skips`
  - Workers: `23/23 PASS`
  - historical smoke: `4/4 PASS`
  - V2 Foundation: `631 PASS / 6 explicit skips`
  - V2 Ops: `233/233 PASS`
  - M0 exit, Next production build, Golden `16/16` and security: `PASS`

The first sandboxed P0R run returned seven `clipboard_arm_failed` results because the managed sandbox rejects every Tcl/Expect internal `exec`, including `/usr/bin/true`, with `EPERM`. The same exact bridge suite passed `9/9` outside that artificial sandbox. This was an environment-only false failure; no production bridge behavior was weakened or rewritten.

The first complete CI attempt stopped at two `preserve-caught-error` lint findings. The remediation kept source-read errors bounded by intentionally discarding provider/path causes instead of exposing them; lint and complete P0R were rerun before the complete CI passed.

The clean outer source `15d7cb3899b5f8c4763390fa0baba8e51aa29d56` subsequently passed all four remote gates:

- Signed Production Dispatch Quality: `30632789118`
- Independent Security Quality: `30632789106`
- A0 Release Qualification: `30632788902`
- Full Quality and Materials Gate: `30632788867`

The first signed production dispatch was `p0r-transport-stage-20260731t131227z-81fcaa2f`, commit `9fac599e9cf107f5cd2469c09fc7b5775810fd58`. It failed closed with `p0r_transport_stage_directory_unsafe` because the pre-existing `/home/ubuntu/.cache/market-radar-v2/p0r` ancestor was mode `0755`. Sanitized stderr SHA-256 `a45bfc12781fcc56c4d086e280573139608297eaa39f335444c17f64f68e71a5` was matched to the bounded source failure. The Runner did not change that directory, create the target, leave `.incoming-*`, request a credential, or mutate a production service.

After exact user authorization, only that ancestor was changed to mode `0700`. Its owner and realpath, the `staging` child mode, target absence, production HEAD, clean worktree, 11-container identity, Web/PostgreSQL/Redis health, timer and P0R runtime absence were reverified before redispatch.

The fresh dispatch was `p0r-transport-stage-20260731t143942z-63b1e6f9`, signed commit `d5ea6e44797cd88239a474961bfa91cf4bf6ca6d`. It returned `PASS_SESSION_INDEPENDENT_RUNNER_LAUNCHED` and produced the exact target. Independent acceptance proved:

- exact target realpath, owner `ubuntu`, directory mode `0700`
- exactly 16 top-level regular files and zero symlinks
- manifest SHA-256 `c9e85a91bf09a5fbeafb119517be93805a1f25ad09466c6c9a9a15a58295a318`
- every listed member size, SHA-256, owner and exact mode matched transport v3
- no outer dispatch staging and no `.incoming-*` residue
- production HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`, clean worktree, 11 containers, Web/PostgreSQL/Redis, timer and container identity remained unchanged
- P0R containers, volumes and `/dev/shm` credential material remained zero

The post-acceptance regression adds the previously missing ancestor case: an existing mode-`0755` parent with an absent delivery child must fail before child creation and must not be chmodded. Transport staging is now `11/11`; complete P0R is `111/111` under Node `22.23.1`, Go `1.26.3` and `GOTOOLCHAIN=local`.

One local release invocation initially supplied `--branch refs/heads/production-dispatch`. The publisher already derives the full ref, so GitHub rejected the resulting nested ref before remote mutation. The signed outbox remained byte-identical and was published only after correcting the option to the short branch name `production-dispatch`. The publisher now rejects every `refs/...` branch before filesystem, Git or network I/O; production dispatch is `25/25`, and the runbook independently locks the same operator boundary.

## 6. Completion Boundary

This package is complete because one fresh signed fixed dispatch:

1. reaches the Tencent production agent,
2. recreates the exact 16-member staging directory,
3. proves exact member names, modes, owner and hashes,
4. proves the outer dispatch staging is removed,
5. proves the application worktree, containers, PostgreSQL, Redis, workers, environment and feature flags are unchanged.

All five acceptance conditions passed. The separate 8022 bootstrap, pre-armed local TTY bridge, fresh STS, Keychain age handoff, encrypted backup, exact COS version retrieval, isolated PostgreSQL 16 restore and cleanup sequence remains a new B9 work package with its own action-time approval and evidence. B8 acceptance does not authorize or prove recovery.

Current truth remains:

```text
P0R recovery: NOT EXECUTED
P0 admission: BLOCKED
Production package target staging: PASS_EXACT_16_MEMBER_ACCEPTANCE
Production business mutation: NONE
User action required now: NO
```
