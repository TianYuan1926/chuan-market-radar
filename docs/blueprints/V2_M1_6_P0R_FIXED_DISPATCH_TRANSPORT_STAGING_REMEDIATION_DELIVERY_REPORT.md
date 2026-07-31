# V2 M1.6 P0R Fixed Dispatch Transport Staging Remediation Delivery Report

Date: 2026-07-31

Status: `LOCAL_IMPLEMENTATION_P0R_GATE_AND_FULL_CI_PASS / PRODUCTION_TARGET_DELIVERY_PENDING / REAL_RECOVERY_NOT_STARTED`

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

- transport staging tests: `10/10 PASS`
- recurrence plus staging targeted tests: `21/21 PASS`
- complete P0R tests on the real host permission boundary: `110/110 PASS`
- Go COS helper: `PASS`
- full `ci:production`: `PASS`
  - Market: `965 PASS / 4 explicit skips`
  - Workers: `23/23 PASS`
  - historical smoke: `4/4 PASS`
  - V2 Foundation: `631 PASS / 6 explicit skips`
  - V2 Ops: `232/232 PASS`
  - M0 exit, Next production build, Golden `16/16` and security: `PASS`

The first sandboxed P0R run returned seven `clipboard_arm_failed` results because the managed sandbox rejects every Tcl/Expect internal `exec`, including `/usr/bin/true`, with `EPERM`. The same exact bridge suite passed `9/9` outside that artificial sandbox. This was an environment-only false failure; no production bridge behavior was weakened or rewritten.

The first complete CI attempt stopped at two `preserve-caught-error` lint findings. The remediation kept source-read errors bounded by intentionally discarding provider/path causes instead of exposing them; lint and complete P0R were rerun before the complete CI passed. Clean B8 commit, four new remote gates and production target acceptance remain pending.

## 6. Completion Boundary

This package is not complete until one signed fixed dispatch:

1. reaches the Tencent production agent,
2. recreates the exact 16-member staging directory,
3. proves exact member names, modes, owner and hashes,
4. proves the outer dispatch staging is removed,
5. proves the application worktree, containers, PostgreSQL, Redis, workers, environment and feature flags are unchanged.

Only after that acceptance may the separate 8022 bootstrap, pre-armed local TTY bridge, fresh STS, Keychain age handoff, encrypted backup, exact COS version retrieval, isolated PostgreSQL 16 restore and cleanup sequence begin.

Current truth remains:

```text
P0R recovery: NOT EXECUTED
P0 admission: BLOCKED
Production package target staging: PENDING
Production business mutation: NONE
User action required now: NO
```
