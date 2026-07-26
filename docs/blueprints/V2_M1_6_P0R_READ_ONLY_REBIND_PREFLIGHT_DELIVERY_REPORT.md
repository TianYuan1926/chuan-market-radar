# V2 M1.6-P0R Read-Only Rebind Preflight Delivery Report

Date: 2026-07-27

Status: `LOCAL_ENGINEERING_FULL_CI_AND_EXACT_SOURCE_REMOTE_QUALIFICATION_PASS / PRODUCTION_REBIND_NOT_EXECUTED / PRODUCTION_UNCHANGED`

## 1. Why This Package Exists

The P0R staging created from historical source `bed938...` is complete and checksum-bound, but it is no longer executable. Three server-side runtime files were strengthened after that source:

- secure file reads now use one `O_NOFOLLOW` handle and validate the same opened inode;
- encrypted output and evidence publication use exclusive creation instead of check-then-write;
- credential and recovery JSON reads have bounded single-handle semantics.

The local transport builder was also moved from host-specific `tar` flags to deterministic Node USTAR. Reusing the historical staging would bypass those fixes. Its new authoritative state is:

```text
REJECTED_SUPERSEDED_SECURITY_SOURCE
```

This is a route correction based on current code and staging evidence. It does not weaken P0R, shorten recovery validation, or change production.

## 2. Delivered Boundary

Implementation source parts:

```text
408803e0bdc21051124a + 79e307db8e9eb39c793c
```

The package:

1. builds a deterministic no-secret signed-dispatch bundle from the exact pushed commit;
2. binds the last trusted production Git HEAD and exact container identity set;
3. checks production worktree, dispatch timer, listeners, health, `/dev/shm`, P0R containers and P0R volumes read-only;
4. reads Tencent instance metadata in memory and retains only the SHA-256 of the `/32` source address;
5. validates every historical staging member, manifest, plan, binding and digest;
6. proves that the three historical runtime files differ from the current security-fixed source;
7. writes only bounded sanitized evidence under the fixed dispatch state;
8. removes only its exact temporary staging directory;
9. refuses application, database, Redis, Worker, migration, environment, repository or business-data mutation.

The bundle does not contain STS credentials, age private identity, bucket name, object key, production environment values or database rows.

## 3. Fail-Closed Controls

- request fields and nested objects use exact-key validation;
- source/ref/tree, dispatch, approval window and one-shot runner identity are fixed;
- command execution is an exact read-only allowlist;
- files are opened with `O_NOFOLLOW` and bounded reads;
- archive entries use deterministic USTAR and exact payload membership;
- existing evidence cannot be overwritten; publication uses an atomic same-directory hard link;
- production identity is sampled before and after and must be byte-equivalent after bounding;
- a blocked run may persist only a sanitized failure class and never a success marker;
- the historical staging remains quarantined until a fresh current-source P0R package exists and is independently verified.

## 4. Verification

Local exact Node `22.23.1` / npm `10.9.8`:

- rebind package: `9/9 PASS`;
- complete P0R suite: `70/70 PASS`, Go COS helper PASS;
- V2 Ops: `179/179 PASS`;
- Market: `965 PASS / 4 explicit environment skips`;
- Workers: `23/23 PASS`;
- Historical: `4/4 PASS`;
- V2 Foundation: `584 PASS / 6 explicit environment skips`;
- typecheck, ESLint, Biome, M0, Next production build, Golden `16/16` and security check: PASS;
- `git diff --check`: PASS.

Exact-source GitHub qualification is also PASS:

- Full Quality run `30219999104`, job `89840685016`: exact-runtime full CI PASS; SBOM artifact `8636959605`, digest `sha256:b29707e180e1bc528c2d00088221ea2997333d42f195dcdf114ff1550e7b177e`;
- A0 Release Qualification run `30219999094`: frozen 1,440-instrument performance job `89840684949` PASS, artifact `8636923163`, digest `sha256:49b0ee761123ade7ce439ef2b1253ef71ed16a21176ec5fec3dc644638d92924`; reproducible rootfs/provenance/rollback job `89840684998` PASS, artifact `8636930607`, digest `sha256:3bd188579e14f8df64eef87426a6c49b43bff17c8c71461baada6147da2dcf29`;
- Independent Security run `30219999063`: full-history Gitleaks job `89840684924` PASS with findings=`0`, artifact `8636918736`; CodeQL job `89840684925` PASS with untriaged results=`0`, artifact `8636942614`; exact Collector image job `89840684960` PASS with Trivy HIGH=`0` and CRITICAL=`0`, artifact `8636925384`.

All three workflows explicitly reported `production_execution=false`, `production_mutation=false` and no production credentials. Remote qualification closes the source-validation prerequisite only; it does not prove the Tencent production baseline or execute the read-only rebind.

## 5. Production Truth

No production command was executed by this package delivery. Web, Caddy, PostgreSQL, Redis, Workers, containers, volumes, environment, feature flags, migrations, COS objects, GitHub main and all business authority are unchanged.

The next allowed production action is only:

```text
V2-M1.6-P0R-R0-READ-ONLY-SOURCE-REBIND
```

It must pass before creating a fresh current-source plan or transport bundle. STS and age identity remain outside the signed Git channel and may enter only `/dev/shm` under a fresh, exact, time-bounded recovery action.
