# V2 A0 Portable Deterministic Bundle Remediation Report

Date: `2026-07-26`

Status: `LOCAL_ROOT_CAUSE_REMEDIATION_PASS / REMOTE_LINUX_REVERIFY_PENDING / A0_TOTAL_GATE_INCOMPLETE / PRODUCTION_UNCHANGED`

## Trigger And Root Cause

Commit `61ef7e995e8df0e5f4240a14553feeb9adc482c9` passed the exact Node `22.23.1` / npm `10.9.8` full quality gate on macOS, but the first independent Ubuntu 24.04 runs failed:

- V2 Full Quality run `30198990064`, job `89785562489`.
- V2 Signed Production Dispatch Quality run `30198990079`, job `89785562516`.

Both failures occurred in the same production-dispatch regression. The active V2 bundle builder invoked `tar --uid=0 --gid=0`; the local BSD tar accepted the command while the Ubuntu runner rejected `--uid=0`. This proved that the previous local reproducibility check was operating-system dependent.

## Permanent Remediation

Commit `29ab47dec0b9fbbbe66e1cfe7ce90aa2e1e4c25d` replaces external tar creation in the four active V2 bundle paths with one pure Node USTAR writer:

- fixed-channel production-dispatch acceptance bundle;
- M1 source-conformance live bundle;
- M1 runtime-adapter live bundle;
- M1 P0R transport bundle.

The writer:

- sorts and deduplicates canonical POSIX paths;
- rejects absolute paths, traversal, backslashes, NUL bytes, symbolic links and special files;
- normalizes uid/gid to `0` and mtime to the bound source epoch;
- preserves only the reviewed file permission bits;
- emits USTAR headers, checksums, padding and two zero trailer blocks without host tar extensions;
- creates the output archive exclusively with mode `0600`.

Legacy historical bundle builders were intentionally not rewritten or re-signed. Their historical checksums and production identities remain frozen. If any is reactivated, it requires a separately reviewed exact release instead of silently inheriting this change.

## Local Evidence

Exact Node `22.23.1` / npm `10.9.8`:

- deterministic USTAR portability and rejection tests: `2/2` PASS;
- V2 Ops: `138/138` PASS plus P0R Go tests PASS;
- production-dispatch contract: `21/21` PASS;
- Market tests: `969` total, `965` PASS, `4` explicit skips;
- V2 Foundation: `588` total, `582` PASS, `6` explicit skips;
- Workers `23/23`, Historical `4/4`, Golden `16/16`;
- M0, Next production build, ESLint, Biome and security checks PASS.

## Remaining Gate

This report closes the local root cause only. `EXACT_NODE_22_23_1_NPM_10_9_8_REMOTE_CI_EVIDENCE` remains pending until both GitHub workflows pass on the exact remediation commit. No production service, database, Redis, Worker, environment, feature flag, production repository or authority changed.
