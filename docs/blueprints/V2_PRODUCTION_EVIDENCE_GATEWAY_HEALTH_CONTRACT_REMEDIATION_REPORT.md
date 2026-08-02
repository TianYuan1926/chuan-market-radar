# V2 Production Evidence Gateway Health Contract Remediation Report

Date: 2026-08-02

Status: `HEALTH_CONTRACT_REMEDIATION_COMMITTED / AUTHORITY_SYNC_SOURCE_REMOTE_3_OF_4 / INDEPENDENT_SECURITY_FAIL / PUBLIC_KEY_FINGERPRINT_ARTIFACT_ROOT_REMEDIATION_COMMIT_8742828 / AUTHORITY_SYNC_FINAL_BYTES_FULL_LOCAL_CI_PASS / AUTHORITY_SYNC_COMMIT_PUSH_AND_REPLACEMENT_FOUR_GATES_PENDING / PRODUCTION_UNCHANGED`

## Scope

This report records the first exact production attempt for `V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY`, the proven pre-mutation failure, and the local contract remediation. It does not authorize another production mutation and does not claim that the gateway, P0R backup, exact retrieval, or isolated restore is complete.

## Bound Attempt

- Qualified source: `dd67d81910f5696049d4271d527c264f2e42115f`
- Signed dispatch commit: `a52aa6acfbe2f4f5d26cb15a82701195ca2f32df`
- Dispatch ID: `production-evidence-gateway-20260802t054430z-dd67d819`
- Package ID: `V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY`
- Approval window: `2026-08-02T05:44:30.000Z` through `2026-08-02T07:09:30.000Z`
- Dispatch published: `2026-08-02T06:12:07.499Z`
- Target claim created: `2026-08-02T06:12:25.744Z`
- Target failure recorded: `2026-08-02T06:12:33.853Z`
- Result: `FAIL_DISPATCH_NOT_REUSABLE`
- Failure class: `dispatch_entrypoint_launch_failed`

The source independently passed all four GitHub gates: Signed Production Dispatch `30734390429`, Full Quality and Materials `30734390438`, A0 Release Qualification `30734390439`, and Independent Security `30734390634`. Those gates remain historical qualification evidence for the failed source; they do not qualify the remediation bytes.

## Proven Root Cause

The target stderr digest is `sha256:d41cd1e0993f4f20b1024ac7e1c9ba17ea70cd9a1f0f5ec61fd96523bde9701f`. Reconstructing the bounded canonical failure statements produced one exact match:

```json
{"reason":"evidence_gateway_health_not_ready","status":"BLOCKED"}
```

The production route `src/app/api/health/route.ts` returns the health object at the top level:

```json
{"ok":true,"health":{}}
```

The gateway parser and its test fixture incorrectly expected `data.health`. The fixture therefore agreed with the implementation but disagreed with the real production API. This contract mismatch caused the package to fail closed during the initial health preflight.

The failure was not caused by scan staleness, database health, Redis, container identity, Caddy syntax, server latency, the browser, or an active production lease. Current read-only evidence showed health `ready`, scan `ready/fresh`, persistence `ready`, the exact 11 bound container identities unchanged, and the production dispatch global lease absent.

## Mutation And Cleanup Truth

The package stopped before gateway installation or Caddy mutation. Read-only verification proved:

- the exact production evidence route still returns the baseline `404`;
- gateway root, outbound root, and exact staging are absent;
- the production repository remained on `cec0b6572bb09ae91ff9e013f8bb160f73c045e2` with a clean worktree;
- the exact 11-container baseline remained unchanged;
- database, Redis, Worker, env, migration, Feature Flag, traffic, and repository mutation did not occur;
- the old approval expired and the claimed dispatch is permanently non-reusable.

This is a fresh zero-drift result for the failed gateway attempt only. It is not the still-pending P0R backup/retrieval/restore zero-drift acceptance.

## Permanent Remediation

- `production-evidence-gateway.mjs` now consumes the real top-level `body.health` contract.
- The default test fixture now reproduces the real production response envelope.
- A red regression feeds the obsolete nested envelope, requires `evidence_gateway_health_not_ready`, and proves zero mutation plus no gateway-root creation.
- The regression statically binds the fixture expectation to the production route source so the two surfaces cannot silently drift again.

The health-contract authority-sync source `d1c3d987cf55105e94e815992dbb989ea1045629` was pushed after gateway `8/8` plus exact Node `22.23.1` / npm `10.9.8` full `ci:production` PASS: recurrence `11/11`, dispatch `37/37`, V2 Foundation `644 total / 638 PASS / 6 explicit skips`, V2 Ops `275/275`, M0 `12/12`, Next production build, Golden `16/16`, and security.

The clean remediation implementation commit is `51886b038b6dfa5e1bf0169abc518810de7eb2d5`. Authority-sync final bytes were rechecked with the same complete CI before their commit; only the final authority-sync source may proceed to remote qualification. Production remained unchanged.

## Exact-Source Requalification And Second Root Remediation

The authority-sync source did not pass all four remote gates. Signed Production Dispatch `30739919674`, Full Quality and Materials `30739919649`, and A0 Release Qualification `30739919664` passed. Independent Security `30739919662` failed, so the exact-source qualification truth is `3/4` and no production package or approval may be derived from it.

Inside Independent Security, CodeQL job `91475363037` and image scan job `91475363053` passed. Full-history secret scan job `91475363046` failed with one finding. Sanitized artifact `8830917655`, digest `sha256:a094742eb7396c2cb757f4290d620593c29d7badce77d17dc7d76373afb161db`, records Gitleaks `8.30.1`, finding count `1`, and report digest `sha256:64519dfe390929e7fa434c40c388e4ad7f7a362151bf9c2ff8be188b31a3d265`. The only finding is `approval-request.json:1`, rule `generic-api-key`, in historical signed-dispatch commit parts `a52aa6acfbe2f4f5d26c + b15a82701195ca2f32df`.

The value is the SHA-256 fingerprint of the fixed X25519 evidence recipient public key. It is not a credential, private key, provider token, or session secret. The scanner correctly failed closed because the historical generated request named the high-entropy public fingerprint `evidenceRecipientKeySha256`, which is secret-shaped. This is a recurrence of the previously identified public-key-fingerprint artifact class, not a reason to disable or weaken Gitleaks.

Permanent remediation now:

- emits `evidenceRecipientFingerprintSha256` in every new gateway request and rejects the obsolete field through strict request keys;
- rejects ambiguous non-public `*KeySha256` 64-hex fields before any signed dispatch publication;
- preserves only the exact immutable historical finding in `.gitleaksignore`, with structured `PUBLIC_KEY_FINGERPRINT` review entry 17; and
- adds a red dispatch regression proving the obsolete generated shape fails before outbox publication while the deterministic new gateway bundle remains accepted.

Current targeted Node evidence is recurrence `11/11`, production dispatch `38/38`, and gateway `8/8`, totaling `57/57` PASS. Clean implementation commit `8742828086041da1db51a5abeeef01ba7656e5fd` contains the permanent code and security remediation. The final authority-sync bytes then passed complete exact-toolchain `ci:production` from zero under Node `22.23.1` and npm `10.9.8`: recurrence `11/11`, dispatch `38/38`, V2 Foundation `644 total / 638 PASS / 6 explicit skips`, V2 Ops `275/275`, M0 `12/12`, Next production build, Golden `16/16`, and security. The authority-sync commit/push and all four remote gates for that replacement exact source remain pending. Production remains unchanged.

## Mandatory Next Sequence

1. Commit and push the authority-sync exact source whose final bytes passed complete local CI.
2. Obtain all four GitHub gates from zero for that same replacement source; the authority-sync `3/4` result cannot be combined with any other run.
3. Rebind a fresh production read-only baseline and build a new deterministic package.
4. Obtain a new exact current production approval; the expired approval cannot be reused.
5. Run current-image isolated validation, deploy Caddy only or automatically restore the baseline, and autonomously retrieve and verify the encrypted evidence.
6. Complete fresh rebind before resuming P0R backup, exact COS version retrieval, isolated PostgreSQL 16 restore, cleanup, and fresh P0.
