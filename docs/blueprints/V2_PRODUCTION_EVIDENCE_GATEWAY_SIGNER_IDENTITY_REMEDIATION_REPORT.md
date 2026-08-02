# V2 Production Evidence Gateway Signer Identity Remediation Report

Date: 2026-08-03

Status: `THREE_HISTORICAL_FAILURES_PRESERVED / BRIDGE_V6_SOURCE_DF85_SAME_SOURCE_FOUR_GATES_PASS / SIGNER_BOUND_CADDY_ONLY_REAL_TARGET_ACCEPTANCE_PASS / ENCRYPTED_EVIDENCE_RETRIEVED_DECRYPTED_AND_SIGNATURE_VERIFIED / NON_TARGET_ZERO_DRIFT / RECURRENCE_CLOSED_VERIFIED / P0R_RECOVERY_PENDING`

## Scope

This report preserves the third failed production execution and its automatic rollback, then records the fourth exact execution that closed the gateway recurrence. Bridge-v6 source `df85b485b6d2c0ede8cdd2b656978ba2fdc372ab` passed all four same-source remote gates, the signer-bound Caddy-only release completed on the real Tencent target, and the fixed local retriever independently decrypted and verified the production-host signature. This closes only the production evidence-return fault class. P0R encrypted database backup, COS exact-version retrieval, isolated PostgreSQL 16 restore, cleanup and fresh P0 remain incomplete.

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

Bridge schema v6 carries explicit `{id, failure_code}` bindings through the clipboard wait loop, preserving credential-versus-age classification at every observation point. Fault injection separately covers immediate credential disconnect, credential disconnect during clipboard wait and age disconnect during clipboard wait. Directed bridge tests pass `13/13`; the complete P0R suite passes `142/142` plus the Go helper. At that historical checkpoint these results had no remote authority; source `df85b485b6d2c0ede8cdd2b656978ba2fdc372ab` subsequently obtained all four same-source gates and real-target gateway acceptance.

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
- Bridge-v6 clean commit, push and four same-source GitHub gates: `PASS`, source `df85b485b6d2c0ede8cdd2b656978ba2fdc372ab`
- New deterministic package and bound baseline: `PASS`
- New exact production approval: `PASS_CONSUMED_NOT_REUSABLE`
- Signer-bound real-target acceptance and independent ciphertext retrieval: `PASS`

Neither the previous source's PASS evidence nor the three passing request-v4 remote gates was combined to qualify the new bridge-v6 bytes. Source `df85b485b6d2c0ede8cdd2b656978ba2fdc372ab` obtained all four gates independently.

## Fourth Exact Real-Target Acceptance

- Source commit: `df85b485b6d2c0ede8cdd2b656978ba2fdc372ab`
- Source tree: `f32cc5aa70f7f1c46e772b3b7ba2abbbd7aaf2a5`
- Same-source remote gates: Signed Dispatch `30758244706`, Full Quality `30758244710`, Independent Security `30758244707`, A0 `30758244715`; all `PASS`
- Production HEAD: `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`
- Dispatch: `production-evidence-gateway-20260802t172525z-df85b485`
- Approval request SHA-256: `1daeb3a6a1eef848065fbcbda7ce80d967409a08d11deee2878f385355f9a9bd`
- Bundle SHA-256: `e70e6388ccebf7a0d00eb9465349b6bb707af1fbbfade83fd1b9118b0afd00e0`
- Artifact manifest SHA-256: `4c8bba4f24c8696b8a3d7186ca3ee277b8b6ca6a452a38c9e41985226d637119`
- Baseline evidence SHA-256: `f5bde72e3acb373ad630ebbf34c78846428ec796ef887239d05b4fafd5625b3c`
- Baseline container-set SHA-256: `f871741f6a8d249db728ac49b5e7e6f109a6b60ba1052581f7de483ba01976be`
- Signed dispatch commit: `3cca64f63ea160e0b772c513c9c6624bc76a28ec`
- Runner: `market-radar-evidence-gateway-df85b485`
- Production result: `PASS_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY`
- Evidence object: `22ebecfad6dd9d83b8e40203889f2f36d7c22fa7237fcf3bf63142acafe14acf.mre`
- Payload SHA-256: `d33c62ec5978940b691774b6716d7b3f5f9d898314c46335135783efc563eed1`
- Sealed SHA-256: `2f0ab691bda06cfa02b54e8d0d43c58e3cc2074c23780eaa8e583fd4432520d7`
- Local retrieval: `PASS_PRODUCTION_EVIDENCE_DECRYPTED_AND_VERIFIED`

The fourth execution passed current-image validation, exact Compose identity validation, real host-key sign-and-verify preflight, Caddy-only recreation, route probe and ready/fresh health. The local retriever pinned the production host identity, rejected redirects, decrypted the exact ciphertext, checked its payload and sealed hashes, and persisted payload, receipt and sealed evidence as three mode-`0600` files.

Independent read-only production checks confirmed the signed dispatch claim and cursor, successful one-shot unit result, clean production worktree, unchanged production HEAD, all ten non-Caddy full container identities unchanged, exact staging and global lease absent, and the per-dispatch expiry timer active. The exact evidence object returned `200`; a malformed namespace returned `404`. Database, Redis, Worker, env, migration, Feature Flag, production repository and other services were unchanged.

The recurrence `REC-2026-08-02-PRODUCTION-GATEWAY-PREFLIGHT-EQUIVALENCE` is therefore `CLOSED_VERIFIED` with recurrence count `3`. The three failed dispatches remain immutable and non-reusable. This acceptance does not close `REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS` and does not prove P0R recovery.

## Required Next Sequence

1. Commit and qualify the authority-sync bytes without reusing the consumed gateway approval.
2. Perform a fresh P0R read-only rebind and zero-residue baseline through the accepted evidence channel.
3. Generate new source-bound route, lease, run, object key, v4 plan and transport identities; stage the no-secret target through fixed dispatch.
4. Prearm both exact no-echo TTY sessions and prove the authoritative Tencent `/32 -> 8022` route before STS issuance.
5. Use one fresh exact-plan STS and age handoff, then run read-only encrypted backup, exact COS version retrieval and isolated PostgreSQL 16 restore.
6. Prove integrity, complete lease-bound cleanup, production zero drift, fresh health/topology/capacity and fresh P0.

The gateway is production-accepted, but Market Radar V2 remains `可运行但不完整 / 不能支撑实战` until P0R and the later decision-chain gates pass.
