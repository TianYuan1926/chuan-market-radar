# V2 M1.6-P0R Read-Only Rebind Preflight Delivery Report

Date: 2026-07-27

Status: `PRODUCTION_READ_ONLY_REBIND_PASS_SOURCE_94118 / PRODUCTION_ZERO_DRIFT / STS_REQUEST_REJECTED_MISSING_REQUIRED_REGION_NO_CREDENTIAL / PLAN_V3_ROOT_REMEDIATION_LOCAL_PASS_REMOTE_REQUALIFICATION_PENDING`

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

The first signed dispatch was later inspected on the Tencent target. It had not
been claimed, extracted or launched. A fixed-channel Git fetch had exceeded the
180-second systemd service limit before the dispatch was available, and the old
directory-only lock then blocked 4,526 polls. The control-plane defect was
repaired and accepted separately under
`V2_FIXED_DISPATCH_TIMEOUT_LOCK_RECOVERY_DELIVERY_REPORT.md`.

After repair, the expired dispatch commit was consumed as
`FAIL_DISPATCH_NOT_REUSABLE / dispatch_not_current`, with `dispatchId=null`,
`packageId=null`, no claim and no business staging. Therefore the former
`UNKNOWN_TARGET_RECEIPT_UNREAD` state is superseded by:

```text
CONFIRMED_NOT_EXECUTED_EXPIRED_NOT_CLAIMED
```

No production command from this P0R package was executed. Web, Caddy,
PostgreSQL, Redis, Workers, containers, volumes, environment, feature flags,
migrations, COS objects, GitHub main and all business authority are unchanged.
The only production mutation was the separately bounded fixed-dispatch
control-plane repair.

At that historical point, the next allowed production action was:

```text
V2-M1.6-P0R-R0-READ-ONLY-SOURCE-REBIND
```

It had to pass before creating a fresh current-source plan or transport bundle. STS and age identity remain outside the signed Git channel and may enter only `/dev/shm` under a fresh, exact, time-bounded recovery action.

The expired dispatch cannot be reused.

## 6. Fresh Production Rebind and STS Region Contract Correction

The historical next action above was subsequently completed with exact source
`94118d3b8270b6ac58c449380911ea77b8abeace`. That source passed complete local
CI and GitHub Full Quality `30263341562`, A0 Release Qualification
`30263341569`, Independent Security `30263341571` and Signed Production
Dispatch Quality `30263341645`.

Fresh dispatch `p0r-rebind-preflight-20260727t115642z-bd715b46` returned
`PASS_P0R_READ_ONLY_REBIND_PREFLIGHT` on Tencent. Production HEAD
`cec0b6572bb09ae91ff9e013f8bb160f73c045e2`, clean worktree, 11-container
identity and application health remained unchanged.

The next exact v2 plan and bundle were built, uploaded and verified member by
member. After user identity verification, Tencent API Explorer rejected the STS
request with `MissingParameter.Region`. No temporary credential was generated;
the database was not read; no backup or COS object was created. The exact
invalid remote staging was removed.

The root cause was a local contract omission: `ap-hongkong` was already bound
to the grant and policy, but not to `stsRequest.region`. The executable plan
schema is now `v2-m1-production-storage-cos-provisioning-plan.v3`. Region is
part of the request, plan digest and credential request digest, and the Go COS
helper rejects a missing or mismatched value. P0R `72/72`, the Go helper and V2
Ops `194/194` pass locally.

This report does not claim recovery completion. Complete local CI is PASS. The
remediated source still requires all four exact-source GitHub gates, a fresh
production read-only rebind and a newly built v3 plan/bundle before requesting
another 7200-second STS credential.
