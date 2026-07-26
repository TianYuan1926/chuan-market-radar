# V2 A0 Reproducible Release and Resource Baseline Delivery Report

Date: 2026-07-27

## 1. Truth Status

```text
Control: V2-A0-REPRODUCIBLE-RELEASE-AND-RESOURCE-BASELINE
Source commit parts: 9ef63b85d1a76f3ad7ac / 815e081506c5dbc074a5
A0 workflow run: 30217335595
Full Quality workflow run: 30217335543
Independent Security workflow run: 30217335622
Reproducible artifact provenance and rollback: PASS
Frozen engineering performance and resource baseline: PASS
A0 total gate: INCOMPLETE_P0R_PENDING
Production mutation: false
```

This package closes exactly two A0 controls:

1. `REPRODUCIBLE_ARTIFACT_PROVENANCE_AND_ROLLBACK_DRILL`;
2. `PERFORMANCE_AND_RESOURCE_BASELINE`.

It does not close `P0R_REAL_ENCRYPTED_BACKUP_EXACT_RETRIEVAL_AND_ISOLATED_RESTORE`, authorize M1.5C/M1.5D, prove live-provider or live-database capacity, deploy a collector, or grant Candidate, Signal, Strategy, READY, or trading authority.

## 2. Frozen Qualification Contract

The qualification is bound to `docs/governance/v2-a0-release-qualification-policy.v1.json`, policy digest `sha256:805b0f21873e784cd8954c1f697893acd5c891bff14f253e4f87c65c47b9e711`.

The release path fixes:

- Node `22.23.1` and npm `10.9.8`;
- exact build and runtime base-image digests;
- Buildx `0.31.1` at an exact image digest;
- two independent no-cache RootFS builds;
- two independent application-capsule serializations;
- canonical content, mode, symlink, image configuration, source revision, non-root user and entrypoint identity;
- read-only and no-network fail-closed runtime smoke;
- three isolated release-pointer rollback scenarios.

The performance path freezes:

- workload `v2-a0-three-venue-1440-instrument-collector.v1`;
- three venues, 480 assets per venue, 1,446 observed and 1,440 eligible instruments;
- 5 warm-up incremental cycles, 12 measured cold cycles and 60 measured incremental cycles;
- all collector work, sample counts and budgets before execution;
- in-memory public-JSON transport and atomic artifact-store fixtures;
- test-only engineering evidence with no live-market, live-provider, live-database or production-capacity claim.

## 3. Root-Cause Closure

The first remote attempts were retained as failures instead of being hidden by retries.

| Failure | Root cause | Permanent remediation |
| --- | --- | --- |
| RootFS evidence could not be read after Buildx export | Buildx local export created root-owned evidence | Transfer ownership only for the two isolated RootFS evidence trees; preserve file modes and content; lock the command and order in the materials gate |
| Legitimate package paths were rejected | A character allowlist treated valid POSIX names such as `libstdc++.so.6` as unsafe | Replace the allowlist with structural path validation; reject absolute, traversal, empty-segment, backslash, control, bidi and non-NFC paths while accepting legitimate names |
| CodeQL reported two file-system races | Evidence code performed path-based metadata checks before a separate read | Read through one `O_NOFOLLOW` file handle; compare bigint `fstat` identity, mode, timestamps and size before and after; reject symlinks and byte-count drift |
| Frozen Runner event-loop p99 reached `358.351 ms` against the unchanged `200 ms` budget | One complete collector cycle held the event loop across multiple bounded heavy stages | Add four explicit `setImmediate` cooperative yield boundaries between existing stages; preserve every provider observation, artifact, sample and budget; lock the default primitive and exact yield count in regression tests |

No workload, sample floor, instrument denominator, security query, vulnerability threshold, performance budget or acceptance rule was weakened.

## 4. Remote Release Evidence

### 4.1 Reproducible Artifact and Rollback

GitHub job `89833713538` completed with conclusion `success`.

| Evidence | Exact result |
| --- | --- |
| Aggregate status | `PASS_REPRODUCIBLE_ROOTFS_EXACT_CONFIG_PROVENANCE_AND_ROLLBACK` |
| Qualification identity | `sha256:6ba3db32e258f36e9335baf6ef216749cd0f1c037e318728b0799dc6b4c84601` |
| Aggregate evidence hash | `sha256:e80d069120ea9fc83f45ac965e6c0df92030c53fc3ae154e5e64bb476419c5c3` |
| Application capsule | 2 byte-identical serializations; 62 entries; 704,512 bytes; `sha256:c5d78bfefb47bb2603ac91a1fd100d3581839f2006cbd24826ad73ff5f517ac2` |
| Canonical RootFS | 2 independent builds; 2,737 entries; 2,197 files; 343 symlinks; `sha256:9a2268f9dca161419d17d2b33e83db35df4ec5d018c58e13d7b67ddabac26155` |
| Image configuration | non-root `65532:65532`; exact entrypoint; `sha256:cb720485b91c996c67a60c2d6797bbcdc261275a5de1a9bed8aa7f74c9022497` |
| Loaded image identity | `sha256:9f98a402d84a750f5ddf613770e814062f71e486e27b6492b8ac07dad2205ee8` |
| Runtime smoke | `PASS_RUNTIME_LOADS_AND_FAILS_CLOSED_BEFORE_NETWORK_OR_DATABASE`; evidence `sha256:0b723f1a6e21d52ced04583c6811680baf183de2b96e2e7e9ee5d90e5f30089f` |
| Rollback drill | tampered candidate blocked with pointer unchanged; health failure restored exact baseline; explicit rollback restored exact baseline |

Sanitized artifact `8636196061` has archive digest `sha256:4e8868f7e52b42a9bdf9c570808ed97e7c75296509cb2982a9954257ee6ab88c`.

This is an isolated release-mechanism drill. It is not a Tencent production rollback and cannot substitute for P0R.

### 4.2 Frozen Performance and Resource Baseline

GitHub job `89833713570` completed with conclusion `success`. All ten machine checks passed.

| Metric | Frozen budget | Measured result |
| --- | ---: | ---: |
| Cold latency p95 | `<= 1800 ms` | `183.731 ms` |
| Incremental latency p95 | `<= 500 ms` | `44.944 ms` |
| Cold CPU p95 | `<= 1500 ms` | `314.500 ms` |
| Incremental CPU p95 | `<= 400 ms` | `70.052 ms` |
| Event-loop delay p99 | `<= 200 ms` | `64.750 ms` |
| Incremental throughput p05 | `>= 750 instruments/s` | `31,510.967 instruments/s` |
| Maximum heap | `<= 256 MiB` | `140.406 MiB` |
| Maximum RSS | `<= 384 MiB` | `232.801 MiB` |

Evidence status is `PASS_FROZEN_ENGINEERING_RESOURCE_BASELINE`, evidence hash `sha256:c351b4c89a834f7a0e3a201fadb781b1460f8434340834d8de669e832a64f2ca`, workload digest `sha256:ed7c71fd311914aa03d193eb1cc8324a27533dd208b721d12d49c8ddd87e8d27`.

Sanitized artifact `8636187635` has archive digest `sha256:38462d87eaaf8f45b85ad146f5da98cee3e2a93a5dccfe58cfc557f68ca5316d`.

The result qualifies the collector core under the frozen fixture. It explicitly does not prove four-venue Scope V2 capacity, live provider capacity, live PostgreSQL capacity or Tencent host capacity.

## 5. Exact-Source Quality and Security Revalidation

The same source identity passed all independent workflows:

| Gate | Run / job | Result |
| --- | --- | --- |
| Full Quality | run `30217335543`, job `89833713330` | exact Node/npm, materials, SBOM, zero high/critical npm audit, complete `ci:production`, M0 and production build PASS |
| Full-history secret scan | run `30217335622`, job `89833713630` | Gitleaks `8.30.1`, complete reachable history, findings `0` |
| CodeQL SAST | run `30217335622`, job `89833713645` | `security-extended`, untriaged results `0`; no new suppression added for the file-race remediation |
| Collector image scan | run `30217335622`, job `89833713627` | Trivy HIGH `0`, CRITICAL `0` |

Sanitized artifacts:

- SBOM `8636223320`, `sha256:e08792f6a2f6065587ab4acb3b60075324dda603f41a8022f754689754956bdb`;
- Gitleaks `8636182951`, `sha256:4d1ce814c68df8fe14514496ed283050d9bf53403296e16a03038bb26b788967`;
- CodeQL `8636206253`, `sha256:b52d72cdc9afae807f04fa65b8f221a15e6f404d5558673f883975ba6eafd130`;
- image scan `8636191430`, `sha256:66cf69d21c3ca217f20005ae319a3dbf13ba283742bd23eec4ecc247a4b0c335`.

## 6. Local Acceptance Evidence

- targeted A0 release, performance and runtime regression tests: `35/35` PASS;
- frozen performance baseline repeated three times locally with event-loop p99 `25.002`, `17.596` and `17.891 ms`;
- exact Node `22.23.1` / npm `10.9.8` complete `ci:production`: PASS;
- Market tests: `965` pass, `4` explicit skip, `0` fail;
- Workers: `23/23`; Historical: `4/4`;
- V2 Foundation: `584` pass, `6` explicit skip, `0` fail;
- V2 Ops: `170/170`;
- M0: `PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED`;
- Next production build, Golden `16/16`, and local security check: PASS.

Local evidence supports but does not replace the bound remote qualification.

## 7. Production and Authority Boundary

This package did not:

- read from or mutate Tencent production;
- deploy source, image, service or configuration;
- change PostgreSQL, Redis, Worker, Web, Caddy, COS, env, Feature Flag or migration;
- use production credentials;
- change GitHub `main`;
- start M1.5C or M1.5D;
- emit Candidate, Signal Grade, Strategy, Decision Snapshot or READY.

Production health remains `UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION` for this package.

## 8. Remaining A0 Exit

Only one A0 control remains:

```text
P0R_REAL_ENCRYPTED_BACKUP_EXACT_RETRIEVAL_AND_ISOLATED_RESTORE
```

The next production path remains the already bounded P0R sequence: fresh 7200-second exact-plan STS, encrypted off-host backup, exact COS version retrieval, independent PostgreSQL 16 restore parity, cleanup, fresh health/topology and fresh P0 admission.

A0 stays `INCOMPLETE_P0R_PENDING`; M1.5C/M1.5D stay blocked. The two controls closed here cannot lend their PASS to P0R.
