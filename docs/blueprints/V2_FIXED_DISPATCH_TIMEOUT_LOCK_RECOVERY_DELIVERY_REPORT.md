# V2 Fixed Dispatch Timeout Lock Recovery Delivery Report

Date: 2026-07-27

Status: `PASS_FIXED_DISPATCH_LOCK_RECOVERY / PRODUCTION_CONTROL_PLANE_ONLY / BUSINESS_RUNTIME_ZERO_DRIFT`

## 1. Incident Truth

The production signed-dispatch timer stopped making progress after a poll began at
`2026-07-26 14:09:36 +08:00`. The old agent had no hard Git-child deadline.
Systemd terminated it after 180 seconds with `SIGTERM`, while the old
directory-only lock remained at:

```text
/var/lib/market-radar-production-dispatch/agent.lock
```

The directory was empty, mode `0700`, owned by `ubuntu:ubuntu`, and had no live
`fuser`, `pgrep` or `lslocks` owner. The old implementation could remove the
lock only through its normal `finally` path and had no verifiable owner record
or stale-owner recovery. The timer then produced 4,526
`dispatch_agent_already_running` failures over 103,524 seconds.

This proves the failure was in the fixed dispatch control plane. It was not a
P0R package failure, database failure or application-health failure.

## 2. Permanent Fix

Source commit:

```text
2b4fccc9f3affe613d4f0da0f97295d97b0c6452
```

The repair:

- hard-bounds every Git child to 90 seconds, below the 180-second service limit;
- bounds SSH connection attempts and keepalive failure detection;
- records boot ID, PID, Linux process-start identity, acquisition time and a
  random ownership token in the agent lock;
- keeps a verified live owner fail-closed;
- quarantines and removes a proven-dead owner lock;
- recovers an unowned legacy lock only after four minutes;
- keeps recent, malformed or unverifiable lock state fail-closed;
- verifies the ownership token before releasing a lock.

`npm run test:production-dispatch` passed 24 of 24 cases. The cases include live
owner exclusion, dead-owner recovery, exact stale empty-lock recovery and recent
empty-lock rejection. A separate Tencent Linux smoke used the installed pinned
Node runtime and returned:

```text
PASS_LINUX_AGENT_LOCK_SELF_RECOVERY_AND_EXCLUSION
```

The complete local `npm run ci:production` also passed before installation.

## 3. Production Change Boundary

Only these three files changed:

| File | Installed SHA-256 |
| --- | --- |
| `/opt/market-radar-production-dispatch/production-dispatch.mjs` | `ad12dc949dc25a047a1fc44ad7a4b0a914b7dba6f6452644394728bb53e4c31b` |
| `/opt/market-radar-production-dispatch/git-ssh-dispatch.sh` | `30e6294854f679555b7b2b7e8beaa30e91ebb1ff7f90d81770d429332ade7e04` |
| `/opt/market-radar-production-dispatch/README.md` | `83b7b625eef750a0c8136b2a289fa811ffc4cabb7489ce611f6681e2eefed405` |

The systemd service, timer, config and pinned Node binary retained their exact
pre-change hashes. The upgrade stopped only the dispatch timer and one-shot
service, retained the exact old files and cursor as rollback material, installed
checksum-bound replacements, and automatically restored the old state when the
first acceptance script made an incorrect result-filename assumption.

That first attempt did not touch the application. Its single diagnostic result
was moved out of the active results directory into the failed-attempt evidence
directory. The corrected second attempt passed. The exact upload staging
directory was then deleted; rollback material and sanitized maintenance evidence
remain under the dedicated dispatch state root.

## 4. Expired Dispatch Truth

The previously published P0R rebind dispatch was not executed:

```text
dispatch id: p0r-rebind-preflight-20260726t213258z-e77631a3
dispatch commit: 34b1f137e92be1649d64c6507c3e36204ce0b31e
result: FAIL_DISPATCH_NOT_REUSABLE
reason: dispatch_not_current
```

The failure occurred before a complete envelope was accepted, so the durable
result is named by commit and carries `dispatchId=null` and `packageId=null`.
There is no claim, extracted business staging or P0R runner launch. The cursor
advanced to the expired commit to prevent replay. Manual and timer-driven polls
then returned `IDLE_NO_NEW_DISPATCH` with exit status 0.

This replaces the former `UNKNOWN_TARGET_RECEIPT_UNREAD` statement with
`CONFIRMED_NOT_EXECUTED_EXPIRED_NOT_CLAIMED`. A fresh signed dispatch with a new
approval window is required.

## 5. Zero-Drift Acceptance

Independent post-change verification proved:

- application Git HEAD remained `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`;
- application worktree remained clean;
- all 11 container identities remained exact;
- Web, PostgreSQL and Redis containers remained healthy;
- application health level, source, persistence, scan and archive remained
  `ready`;
- Redis and all six worker runtime probes remained `healthy`;
- dispatch timer remained enabled and active;
- no agent lock remained after either idle poll;
- application, database, Redis, Worker, environment, feature flag, migration,
  COS and business authority mutation were zero.

Sanitized production evidence hashes:

| Evidence | SHA-256 |
| --- | --- |
| before | `fa2ec20626427e1dba6475253c9d06a2094a17ae0063e87ea3f092ed57ea0853` |
| after | `44241397c9976e097bcd82bf7434c1f6b81277bbbb4a38fc82821e7c15331ca8` |
| result | `f2b148819e6e3898629a8037e89e5784bbf76aaadc49f863dde513d9fc3557b2` |
| service journal | `c467527190a95363b1da99aa125c6989898102c2634fadb50c3f3cfb04a1ee9e` |
| first-attempt diagnostic | `23c95ce51b09ffb73cd409d160e9d170aee6f6b829a549196d72f553e29ef3a1` |

## 6. Completion Boundary

The fixed signed-dispatch channel is operational again and this recurrence is
`CLOSED_VERIFIED`. P0R itself remains incomplete. No backup, COS object,
version retrieval, isolated PostgreSQL restore, fresh topology or fresh P0 was
performed.

The next allowed action is:

```text
generate fresh exact signed P0R read-only rebind
-> target execution and zero-drift acceptance
-> current-source P0R plan and deterministic bundle
-> fresh /dev/shm STS and age identity
-> encrypted backup, exact retrieval, isolated restore and cleanup
-> fresh topology and P0
```
