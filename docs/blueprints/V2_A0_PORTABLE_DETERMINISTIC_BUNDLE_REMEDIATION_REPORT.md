# V2 A0 Portable Deterministic Bundle Remediation Report

Date: `2026-07-26`

Status: `LOCAL_ROOT_CAUSE_REMEDIATION_PASS / SIGNED_DISPATCH_REMOTE_LINUX_PASS / FULL_QUALITY_REMOTE_LINUX_PASS / EXACT_RUNTIME_REMOTE_CI_CONTROL_COMPLETE / A0_TOTAL_GATE_INCOMPLETE / PRODUCTION_UNCHANGED`

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

## First Remote Reverification

The first remediation reverify at exact HEAD `cc9e902740d70cc560602fe5efdff6c1acfc375f` produced two distinct facts:

- Signed Production Dispatch run `30199692352` passed on Ubuntu 24.04. This closes the host-tar portability fault for the signed-dispatch path.
- Full Quality run `30199692349`, job `89787377997`, reached V2 Foundation but failed the M0 ancestry check. The workflow used the checkout action default `fetch-depth: 1`, while M0 intentionally proves that reviewed Legacy baseline `2ae438b394d289a05f02dbfa0c2846cd2194ea37` exists and is an ancestor of HEAD. The baseline was three commits behind HEAD and therefore absent from the shallow clone.

Commit `1d5638d0fb538bacec09086ec7b719d9e7a85ce9` is the permanent local remediation for that second fault. Full Quality now checks out complete Git history, the A0 materials gate rejects future shallow-history regression, and an M0 test failure prints the exact failed checks instead of only the aggregate status.

## Final Remote Reverification

Full Quality run `30200077285`, job `89788386319`, passed every step at exact HEAD `dc5e1823d08ac5a2d1630f3989257e735f829695` on Ubuntu 24.04:

- exact Node `22.23.1` and npm `10.9.8`;
- exact lockfile installation and A0 materials policy;
- CycloneDX SBOM generation and high/critical dependency audit;
- complete `ci:production`, including M0 ancestry verification;
- non-secret SBOM artifact upload.

SBOM artifact `8631398374` is named `v2-a0-sbom-dc5e1823d08ac5a2d1630f3989257e735f829695-1`, has digest `sha256:ba6de688e0b2163ccc7f17c06e39c9ef35406eb98235d744a137d849cb57e241`, and is retained by GitHub through `2026-08-25T11:29:41Z`.

## Local Evidence

Exact Node `22.23.1` / npm `10.9.8`:

- deterministic USTAR portability and rejection tests: `2/2` PASS;
- V2 Ops: `139/139` PASS plus P0R Go tests PASS;
- production-dispatch contract: `21/21` PASS;
- Market tests: `969` total, `965` PASS, `4` explicit skips;
- V2 Foundation: `588` total, `582` PASS, `6` explicit skips;
- Workers `23/23`, Historical `4/4`, Golden `16/16`;
- M0, Next production build, ESLint, Biome and security checks PASS.

## Remaining Gate

`EXACT_NODE_22_23_1_NPM_10_9_8_REMOTE_CI_EVIDENCE` is complete. A0 remains incomplete because independent secret/SAST scanning, container-image vulnerability scanning, full artifact provenance and rollback drill, performance/resource baselines, and P0R real recovery are still pending. No production service, database, Redis, Worker, environment, feature flag, production repository or authority changed.
