# V2 Production Evidence Gateway Signer Identity Remediation Report

Date: 2026-08-02

Status: `THIRD_EXACT_ATTEMPT_FAILED_AFTER_CADDY_DEPLOY / AUTOMATIC_BASELINE_ROLLBACK_PASS / NON_TARGET_ZERO_DRIFT / SIGNER_ROOT_CAUSE_DIRECT / REQUEST_V4_COMMIT_4D104261_PUSHED / REMOTE_3_OF_4_FULL_QUALITY_BRIDGE_RACE_FAIL / BRIDGE_V6_LOCAL_P0R_142_AND_FINAL_BYTES_FULL_CI_PASS / NEW_CLEAN_COMMIT_REMOTE_FOUR_GATES_AND_REAL_TARGET_ACCEPTANCE_PENDING`

## Scope

This report records the third exact production execution of `V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY`, the successful automatic baseline rollback, the direct evidence-signer root cause, and the permanent remediation under qualification. Request v4 source `4d1042618eff24d39f6ecceb93d5715e2e798b5a` is committed and pushed, but its remote qualification is only `3/4`: Full Quality exposed a deterministic-diagnostics race in the P0R local TTY bridge. Bridge v6 fixes that adjacent release-gate defect and passes final-byte local CI; it still requires a new clean commit and four same-source gates. This report does not claim that the evidence gateway is deployed, that the current bridge-v6 bytes are remotely qualified, or that P0R backup, exact retrieval and isolated restore are complete.

## Exact Third Attempt

- Source commit: `ad9aeb9842f6b57d934e7729e5e8a5cf2680a3b7`
- Source tree: `82c89ca03c635ae6c77ceb4de8a8f96ba9630f41`
- Production HEAD: `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`
- Same-source remote gates: Signed Dispatch `30749690584`, A0 `30749690576`, Full Quality `30749690577`, Independent Security `30749690593`; all passed before packaging.
- Dispatch ID: `production-evidence-gateway-20260802t135119z-ad9aeb98`
- Approval request SHA-256: `b3100e73600e9e6fbd2766cbe4dddd303c28e8945920cdf54fa5421e806d3b88`
- Bundle SHA-256: `77ecd44af8e6bb14446c34fdce1f7cc369a61946ec9edc49689eee634d5fe6ee`
- Artifact manifest SHA-256: `172ef42656e6bb7fb97225e9e4ea787a44964258d67c8eaa13b883a5b9443f70`
- Signed dispatch commit: `700b994066309aa242484d978f712f6e2b3f0775`
- Signed dispatch parent: `39732e2e943e7b32648d1f0ca43c477900133acb`
- Published: `2026-08-02T14:02:32.060Z`
- Claimed: `2026-08-02T14:02:40.739Z`
- Failed result observed: `2026-08-02T14:02:58.884Z`
- Agent status: `FAIL_DISPATCH_NOT_REUSABLE`
- Agent reason: `dispatch_entrypoint_launch_failed`
- Canonical runner reason: `evidence_gateway_seal_failed:evidence_signing_key_path_invalid`
- Outer stderr SHA-256: `7dd54690755c93d874684587be3cacaf2ff9124ea3acc0d5619a7d1c8faa2abf`

The claimed dispatch and its exact approval, request and bundle are permanently non-reusable.

## What Actually Ran

Unlike the first two attempts, the third attempt passed current-image Caddy validation, production Compose validation, target Caddy recreation, ready/fresh health, mount checks and the encrypted-route probe. It then failed while sealing the final evidence object. The runner automatically recreated baseline Caddy and removed its exact staging, gateway and outbound state.

The accurate production statement is therefore:

- an authorized, bounded Caddy-only transient mutation occurred;
- no database, Redis, Worker, env, migration, Feature Flag, production repository or other-service mutation occurred;
- target Caddy was not retained;
- automatic rollback restored the baseline Caddy configuration and image;
- all ten non-Caddy full container identities remained unchanged;
- production HEAD remained exact and the worktree remained clean;
- the health contract returned ready/fresh after rollback;
- exact staging, gateway root, outbound root and both isolated diagnostic roots were absent in the final cleanup check.

This is `ROLLBACK_PASS_WITH_NO_PERSISTENT_TARGET_GATEWAY`, not `PRE_MUTATION_FAILURE` and not `PRODUCTION_NEVER_TOUCHED`.

## Direct Root Cause

The request used schema `market-radar-production-evidence-gateway-request.v3`, which bound the Caddy and Compose runtime identities but did not bind an evidence-signing key path or public-key fingerprint. The gateway forwarded `signer` and `signerOptions` unchanged. Production supplied neither, so the default signer received no `keyPath` and correctly failed with `evidence_signing_key_path_invalid`.

The successful local happy-path test manually supplied `signerOptions.keyPath`. That made the test prove a different call from production and masked the missing default-path wiring.

Two independent production diagnostics excluded adjacent causes:

1. The exact current Caddy image and target route passed an isolated no-network, read-only, no-new-privileges validation and exact body/closed-namespace probe.
2. `/etc/ssh/ssh_host_ed25519_key` was a root-owned mode-`0600` regular file and successfully produced an SSH namespace signature that verified against fingerprint `SHA256:wxHx/NcT7wmgM6aOJnjgYKK4gOQGGeN44XkHYARbpbc`.

The direct cause is therefore missing signer identity wiring and missing production-equivalent signer preflight, not a broken host key, Caddy route, database, Redis or user action.

## Permanent Remediation Under Qualification

The local remediation now:

- upgrades the request to `market-radar-production-evidence-gateway-request.v4`;
- binds the absolute production host signing-key path and expected SSH SHA-256 public-key fingerprint in the canonical request and deterministic bundle;
- rejects request/policy path or fingerprint drift;
- supplies the request-bound key path to the default signer even when the caller provides no `signerOptions`;
- rejects a caller-supplied conflicting key path;
- performs one sanitized real sign and independent verify before any Caddy mutation;
- compares the observed signer public-key fingerprint with the request-bound fingerprint before mutation;
- emits stable signer preflight failures and removes only runner-owned gateway/outbox state;
- permanently retires `production_evidence_gateway_runtime_identity_bound_release` and allows only `production_evidence_gateway_signing_identity_bound_release` while the recurrence remains open.

The happy path no longer supplies caller `signerOptions`; it asserts that both preflight and final evidence sealing receive the request-bound key path. Fault injection proves a missing key path and a valid signature from the wrong signing identity both stop with zero Caddy mutation and zero runner-owned residue.

## Remote Qualification Finding And Bridge v6 Root Cure

The request-v4 signer remediation was committed and pushed as source `4d1042618eff24d39f6ecceb93d5715e2e798b5a`, tree `c28fa60f1236e8b80a7185de4bcfdc4c084d34e0`. Its exact remote runs were:

- Signed Dispatch `30755615525`: `PASS`
- A0 `30755615545`: `PASS`
- Independent Security `30755615533`: `PASS`
- Full Quality `30755615546`, job `91517146516`: `FAIL`

Full Quality expected `prearmed_credential_session_disconnected` but observed `prearmed_secret_session_disconnected` in the prearmed-disconnect fault case. The initial liveness checks used session-specific classifications, while the clipboard wait loop relabelled both credential and age sessions with the generic `prearmed_secret_session` prefix. Process scheduling therefore selected the visible reason code. This did not invalidate the request-v4 signer root cure, but it made release diagnostics nondeterministic and correctly prevented qualification.

Bridge schema v6 now carries explicit `{id, failure_code}` bindings through the clipboard wait loop, preserving credential-versus-age classification at every observation point. Fault injection separately covers immediate credential disconnect, credential disconnect during clipboard wait and age disconnect during clipboard wait. Directed bridge tests pass `13/13`; the complete P0R suite passes `142/142` plus the Go helper. Final-byte exact-toolchain CI also passes locally; these results still have no remote or production authority until all four new same-source GitHub gates pass.

## Qualification Truth

- Gateway directed tests: `14/14 PASS`
- Recurrence gate: `11/11 PASS`
- Production dispatch and evidence channel: `38/38 PASS`
- Request-v4 exact-toolchain local CI at source `4d104261...`: `PASS` under Node `22.23.1` and npm `10.9.8`
- Market tests: `965/969 PASS`, with `4` explicit skips
- Worker tests: `23/23 PASS`
- Historical smoke: `4/4 PASS`
- V2 Foundation: `638/644 PASS`, with `6` explicit skips
- V2 Ops: `281/281 PASS`
- M0 checks: `12/12 PASS`
- Next production build, Golden `16/16`, and security checks: `PASS`
- Request-v4 clean remediation commit and push: `PASS`, source `4d1042618eff24d39f6ecceb93d5715e2e798b5a`, tree `c28fa60f1236e8b80a7185de4bcfdc4c084d34e0`
- Request-v4 same-source GitHub gates: `3/4`; Full Quality `30755615546` failed on the bridge-v5 diagnostic race
- Bridge-v6 directed tests: `13/13 PASS`
- Bridge-v6 complete P0R suite: `142/142 PASS`, plus Go helper
- Bridge-v6 final-byte exact-toolchain CI: `PASS` under Node `22.23.1` and npm `10.9.8`
- Bridge-v6 final-byte CI exact totals: recurrence `11/11`, production dispatch `38/38`, market `965/969` with `4` explicit skips, workers `23/23`, historical `4/4`, V2 Foundation `638/644` with `6` explicit skips, V2 Ops `283/283`, M0 `12/12`, Next production build, Golden `16/16`, and security `PASS`
- Bridge-v6 clean commit, push and four same-source GitHub gates: `PENDING`
- New deterministic double build: `PENDING`
- New exact production approval: `PENDING`
- Signer-bound real-target acceptance and independent ciphertext retrieval: `PENDING`

Neither the previous source's PASS evidence nor the three passing request-v4 remote gates can be combined to qualify the new bridge-v6 bytes.

## Required Next Sequence

1. Create and push one clean bridge-v6 remediation commit.
2. Obtain all four GitHub gates from that exact source; no prior gate may be combined with it.
3. Capture a fresh read-only production baseline and rebind the exact signer, wrapper, override, Caddy image and container identities.
4. Build the new bundle twice and prove byte-for-byte determinism.
5. Obtain a new exact approval bound to the new source, tree, request, bundle, baseline and time window.
6. Execute only the signing-identity-bound operation; automatically roll back and clean on any failure.
7. Retrieve, decrypt and independently verify the production evidence before closing the recurrence or resuming P0R.

Until all seven steps pass, the gateway status is `可运行但不完整`, P0R remains unexecuted, and Market Radar V2 remains `不能支撑实战`.
