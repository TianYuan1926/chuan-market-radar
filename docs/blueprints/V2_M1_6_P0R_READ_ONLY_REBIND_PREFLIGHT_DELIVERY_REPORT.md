# V2 M1.6-P0R Read-Only Rebind Preflight Delivery Report

Date: 2026-07-29

Status: `E362_EXACT_SOURCE_GATES_REBIND_AND_STAGING_HISTORICAL_PASS_RUN_INVALIDATED / THIRD_STS_POST_RESPONSE_DISCLOSED_NEVER_USED_EXPIRED_FORBIDDEN_REUSE_DUAL_CLOCK_PROOF_PASS / PROD_P0R_FILES_PROCESSES_CONTAINERS_VOLUMES_ZERO / LOCAL_PREARMED_FIXED_TTY_BRIDGE_FULL_QUALIFICATION_PASS / NEW_EXACT_SOURCE_REMOTE_QUALIFICATION_REBIND_EXECUTION_IDENTITY_AND_REAL_RECOVERY_PENDING`

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

The final sentence above records the state at the end of the Region root-fix
package. It is superseded by the current evidence below.

## 7. Historical BD20 Exact-Source Acceptance and Receiver Gate

The exact source qualified at that historical point was:

```text
bd20bd5b73ef0beb41c331aa43c58051ef01d37a
```

All four required GitHub gates are now PASS:

- Full Quality `30273183761`;
- Signed Production Dispatch Quality `30273183650`;
- Independent Security `30273183504`;
- A0 Release Qualification `30273183454`.

Fresh signed dispatch
`p0r-rebind-preflight-20260728t110438z-b2815255` returned
`PASS_P0R_READ_ONLY_REBIND_PREFLIGHT`. Its receipt was generated at
`2026-07-28T11:08:37.115Z`. Production HEAD
`cec0b6572bb09ae91ff9e013f8bb160f73c045e2`, clean worktree, 11-container
identity, health, PostgreSQL, Redis scan state, scan freshness and timer state
were unchanged. No P0R container, P0R volume or secret residue was present.

The exact plan is
`v2-m1-production-storage-cos-provisioning-plan.v3`, bound to
`ap-hongkong`, 7,200 seconds and plan digest
`sha256:6f151aa8375e4dbb58a2da2cdb3c52497b8160816031b88b92971ef2eb0ba75d`.
The no-secret transport Bundle SHA-256 is
`3c2383839e0204aa0c82a042ba950dce9b6ec7e7260722e7d654d8a7f418d6dc`.
All 13 manifest members plus the outer transport file were verified on the
Tencent staging host for content digest, ownership, mode and Runner plan
identity.

The user completed Tencent MFA and API Explorer returned one exact-plan
7,200-second STS response. During transfer, the intended OrcaTerm `tee`
receiver was not running and the raw response was pasted into the interactive
shell. The credential is therefore
`COMPROMISED_FORBIDDEN_UNTIL_EXPIRED` and must never be compiled or used. Its
expiry is `2026-07-28T18:55:30Z`.

Independent containment verification found zero P0R raw or credential files
in production `/dev/shm`, no P0R `tee` process and zero sensitive-field
markers in persistent shell history. The pasted lines produced shell parsing
errors only. No production database read occurred, no encrypted backup or COS
object exists, and no exact retrieval or isolated PostgreSQL 16 restore ran.
Production services and data remain unchanged.

The receiver mechanics were then rehearsed on the same real Tencent host with
a fixed, non-secret 32-byte canary. An independent verifier proved one exact
`tee` PID, the complete target path and `ubuntu:600` size-zero readiness before
transfer. After EOF it proved that `tee` exited, the file remained
`ubuntu:600`, size was 32 bytes, content matched exactly and the path was
removed. The rehearsal also directly observed that an approximately 300-byte
OrcaTerm composite command silently lost its prefix, while the 154-byte
receiver and 198-byte cleanup commands were preserved. Therefore every
secret-path OrcaTerm command is now single-purpose, at most 200 UTF-8 bytes and
reviewed before and after execution. This canary contained no credential and
does not count as STS acceptance or recovery.

A later read-only staging check captured a second editor-integrity failure:
when commands were written in rapid succession, a 94-byte `find` command lost
its leading token. The exact visible preview gate rejected it before execution.
The retry succeeded only after the editor was explicitly cleared, allowed to
settle for at least 1,000 milliseconds, populated, allowed to settle again and
compared in full. The production rule therefore requires both the 200-byte
ceiling and clear/settle/exact-preview for every command; neither guard is
sufficient by itself.

The sequence recorded at that historical point was:

```text
CONFIRM_COMPROMISED_STS_EXPIRED
-> FRESH_ACTION_TIME_APPROVAL
-> FRESH_USER_MFA_AND_NEW_EXACT_PLAN_STS
-> INDEPENDENT_SECOND_SESSION_EXACT_TEE_PID_PATH_AND_CONNECTION_PROOF
-> BOUNDED_SINGLE_PURPOSE_ORCATERM_COMMANDS_AT_MOST_200_UTF8_BYTES
-> CLEAR_SETTLE_EXACT_VISIBLE_PREVIEW_BEFORE_EVERY_COMMAND
-> RAW_STS_RESPONSE_ONLY_IN_PRODUCTION_/dev/shm
-> EXACT_PLAN_CREDENTIAL_COMPILE_AND_RAW_RESPONSE_DELETION
-> AGE_IDENTITY_ONLY_IN_PRODUCTION_/dev/shm
-> ENCRYPTED_READ_ONLY_BACKUP
-> EXACT_VERSION_RETRIEVAL
-> ISOLATED_POSTGRESQL_16_RESTORE
-> EVIDENCE_PUBLICATION
-> SECRET_CONTAINER_VOLUME_AND_RUNTIME_CLEANUP
-> PRODUCTION_ZERO_DRIFT_VERIFICATION
```

P0R remains incomplete until the Runner returns its explicit recovery PASS and
the final cleanup and zero-drift checks also pass.

## 8. Current Atomic Session Root Remediation

The `bd20...` four-gate, read-only rebind, zero-drift and 13-member v3 bundle
results remain valid historical qualification evidence. They no longer grant
execution authority because the credential transport path was disproved by a
second real STS attempt.

The second exact 7,200-second STS response reached a real receiver, but the
manual transfer and compile sequence exceeded the five-minute issuance gate.
The compiler used the real clock and correctly returned
`STS response was not compiled immediately after issuance`. No synthetic
`--now` value was used, and COS, PostgreSQL, backup, retrieval, restore and the
Runner were not invoked. The exact expiry is
`2026-07-28T20:57:29Z`. Local UTC at `2026-07-28T20:57:48Z` and the Tencent
STS HTTPS Date at `2026-07-28T20:57:56Z` independently proved expiry. The
credential is expired and must never be reused.

After the raw path was unlinked, an independent production check found PID
`1175383`, an exact `tee` receiver still holding the unlinked file and waiting
for input. The process was verified against the exact run before termination.
Separate follow-up checks proved zero production P0R files and zero P0R
processes. The local clipboard was overwritten and the secret-bearing browser
automation process was reset.

The following paths are permanently retired:

- bare `tee` credential receivers;
- persisted `.sts-response.json`;
- manual `compile-credentials`;
- AX/OCR response reconstruction;
- direct terminal typing for shell metacharacters;
- manual multi-command binding setup;
- `docker compose --env-file ... ps` runtime identity re-interpolation.

The replacement is checksum-bound
`m1-production-storage-p0r-session.sh`. It disables TTY echo before bounded
stdin reads, validates and compiles STS entirely in memory, never persists the
raw response, and exclusively creates root-owned mode-600 credential and age
identity files under `/dev/shm`; the ready file remains operator-owned. The
second session binds the first by PID, Linux
process-start token and source commit, so PID reuse or a stale ready file cannot
authorize age handoff. It parses `p0r-bindings.env` as plain data and accepts
exactly 12 allowlisted keys: one 40-character source commit and eleven
64-character SHA-256 values. It identifies the running Web and PostgreSQL
containers only by exact Compose project/service labels. Once both secrets are
present, it automatically launches the checksum-bound Runner. Timeout,
disconnect, validation failure, secondary-session failure and Runner exit all
immediately clean the entire exact credential, identity and session-ready set.

The replacement read-only rebind contract now separates two source sets. The
frozen transport-v1 verifier compares only the three security files that
actually existed in the historical staging. Request/result schema v2 separately
binds all seven transport-v2 runtime files, including the Runner and atomic
session helper, and persists their canonical set digest. Missing or mixed source
sets fail closed. This preserves historical evidence without allowing the new
runtime helper to escape exact-source qualification.

The same final audit tightened the runtime secret boundary. An age private
identity must now match the exact age X25519 Bech32 alphabet and 58-character
payload used by the Keychain authority. Runner-only database descriptors and
canaries are created inside one owner-bound mode-700 `mktemp` directory, text is
written with mode-600 no-clobber semantics, and the old internal `tee` path is
forbidden. Success requires verified removal of that directory; failure cleanup
also targets only the exact run-bound directory.

The credential ingress CLI rejects caller-supplied clock overrides, so the
issuance gate always uses the process real clock. Current local evidence is
P0R `81/81`, the Go COS helper PASS, recurrence gate `10/10`, production
dispatch `24/24`, `git diff --check` and complete `ci:production` PASS. The
complete CI also passed V2 Foundation with `631 PASS / 6 explicit skips`, V2
Ops `203/203`, the Next production build, Golden `16/16` and the final security
check. This is a local engineering result, not production recovery. A new clean
source commit, all four GitHub gates, a fresh production read-only rebind, a new
run-id/plan/14-member transport-v2 bundle, real-target session acceptance and the recovery
drill remain pending.

The current allowed sequence is:

```text
FINAL_AUTHORITATIVE_DOCUMENT_SYNC_AND_REVIEW
-> NEW_CLEAN_EXACT_SOURCE
-> FOUR_GITHUB_GATES
-> FRESH_PRODUCTION_READ_ONLY_REBIND
-> NEW_RUN_ID_PLAN_AND_14_MEMBER_TRANSPORT_V2_BUNDLE_STAGING_VERIFICATION
-> FRESH_USER_MFA_AND_NEW_EXACT_STS
-> FIRST_FRESH_ORCATERM_NOECHO_MEMORY_INGRESS_AND_IMMEDIATE_COMPILE
-> SECOND_FRESH_ORCATERM_NOECHO_AGE_IDENTITY_HANDOFF
-> AUTOMATIC_CHECKSUM_BOUND_RUNNER
-> ENCRYPTED_READ_ONLY_BACKUP
-> EXACT_VERSION_RETRIEVAL
-> ISOLATED_POSTGRESQL_16_RESTORE
-> EVIDENCE_PUBLICATION
-> SECRET_CONTAINER_VOLUME_SESSION_AND_RUNTIME_CLEANUP
-> PRODUCTION_ZERO_DRIFT_VERIFICATION
```

P0R remains incomplete until the Runner returns its explicit recovery PASS,
the final independent cleanup has zero residue, and fresh P0 also passes.

## 9. Current E362 Qualification, Third STS Containment and Fixed TTY Bridge

The section 8 sequence is now historical and its two OrcaTerm secret entries
are permanently retired. Source
`e3626387ee8d57ef8e4f9c11c2e098b781ac6fbe` subsequently passed:

- Full Quality `30403475812`;
- Signed Production Dispatch Quality `30403475763`;
- Independent Security `30403475844`;
- A0 Release Qualification `30403475716`;
- fresh production read-only rebind
  `p0r-rebind-preflight-20260728t222400z-e994dde2`.

Production HEAD `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`, the clean
worktree and all 11 container identities remained unchanged. A new run,
plan and transport-v2 staging were also verified. Those facts remain valid
historical qualification evidence.

The third exact-plan STS response was then disclosed by a browser-state read
before server handoff. The credential was immediately forbidden. It expires at
`2026-07-29T06:09:17Z`, but expiry will never restore reuse authority. It was
never sent to production, compiled or used for COS. No database backup,
retrieval or restore ran. Independent production checks proved zero P0R files,
session/provisioning processes, containers and volumes. Application, database,
Redis, repository, environment, migration and business authority were
unchanged.

Local UTC `2026-07-29T10:32:53Z` and Tencent STS HTTPS Date
`2026-07-29T10:35:42Z` independently proved that exact expiry has passed. The
credential is now `EXPIRED_FORBIDDEN_REUSE`; this proof only permits a future
issue against a new exact source, run and plan.

The bound run, plan, object key, bundle and staging are therefore invalidated
for execution even though their source and qualification evidence remain
historically true. A replacement credential may not be issued against that run.

The new operator-side
`m1-production-storage-p0r-local-tty-bridge.exp` establishes both exact SSH TTY
sessions before and during the recovery without accepting an arbitrary host or
remote command. The first remote helper now disables echo before emitting its
READY marker. Only after that marker may the user execute MFA and use Tencent
API Explorer's native Copy action. The bridge validates a bounded exact-shape
response, clears the clipboard before handoff, compiles immediately, retrieves
the age identity internally from the fixed macOS Keychain item and clears the
clipboard on every exit path. Browser-state reads, screenshots, OCR,
accessibility extraction, computer-use and OrcaTerm secret entry are forbidden
after the response exists.

Pseudo-TTY tests pass 10/10, including malformed clipboard, marker mismatch and
SSH failure injection, exact primary/secondary command checks, fixed Keychain
lookup, secret-free stdout/stderr and clipboard cleanup. The bridge also pins
and validates local Node `v22.23.1` instead of trusting `PATH`. Complete P0R
tests pass 87/87 with the Go helper, recurrence passes 10/10, production
dispatch passes 24/24, and exact Node/npm `ci:production`, Next production
build, Golden 16/16 and security checks all pass. A new clean commit, four new
GitHub gates, a fresh read-only rebind, a new run/object
key/plan/bundle/staging and real recovery remain pending.

The current allowed sequence is:

```text
NEW_CLEAN_EXACT_SOURCE
-> FOUR_GITHUB_GATES
-> FRESH_PRODUCTION_READ_ONLY_REBIND
-> NEW_RUN_OBJECT_KEY_PLAN_AND_14_MEMBER_BUNDLE
-> INDEPENDENTLY_PROVE_THIRD_STS_EXPIRED_AND_NEVER_REUSE
-> PREARM_FIXED_LOCAL_TTY_BRIDGE_AND_RECEIVE_ECHO_DISABLED_READY
-> USER_MFA_AND_TENCENT_NATIVE_COPY_ONLY
-> IMMEDIATE_STS_COMPILE_AND_INTERNAL_KEYCHAIN_AGE_HANDOFF
-> AUTOMATIC_CHECKSUM_BOUND_RUNNER
-> ENCRYPTED_READ_ONLY_BACKUP
-> EXACT_VERSION_RETRIEVAL
-> ISOLATED_POSTGRESQL_16_RESTORE
-> VERIFIED_SECRET_CONTAINER_VOLUME_SESSION_AND_RUNTIME_CLEANUP
-> PRODUCTION_ZERO_DRIFT
-> FRESH_P0
```

P0R and P0 remain blocked until every current-sequence item has matching
real-target evidence.
