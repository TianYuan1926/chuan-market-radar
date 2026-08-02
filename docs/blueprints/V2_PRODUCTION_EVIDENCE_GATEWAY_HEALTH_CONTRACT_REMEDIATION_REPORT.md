# V2 Production Evidence Gateway Health Contract Remediation Report

Date: 2026-08-02

Status: `LOCAL_RUNTIME_PASS / CLEAN_REMEDIATION_COMMIT_CREATED / AUTHORITY_SYNC_FULL_CI_PASS / REMOTE_GATES_PENDING / PRODUCTION_UNCHANGED`

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

Current evidence is gateway `8/8` plus exact Node `22.23.1` / npm `10.9.8` full `ci:production` PASS: recurrence `11/11`, dispatch `37/37`, V2 Foundation `644 total / 638 PASS / 6 explicit skips`, V2 Ops `275/275`, M0 `12/12`, Next production build, Golden `16/16`, and security. Push and all four GitHub gates have not yet run for the authority-sync source.

The clean remediation implementation commit is `51886b038b6dfa5e1bf0169abc518810de7eb2d5`. Authority-sync final bytes were rechecked with the same complete CI before their commit; only the final authority-sync source may proceed to remote qualification. Production remained unchanged.

## Mandatory Next Sequence

1. Commit and push the authority-sync final source.
2. Obtain all four GitHub gates for that exact source.
3. Rebind a fresh production read-only baseline and build a new deterministic package.
4. Obtain a new exact current production approval; the expired approval cannot be reused.
5. Run current-image isolated validation, deploy Caddy only or automatically restore the baseline, and autonomously retrieve and verify the encrypted evidence.
6. Complete fresh rebind before resuming P0R backup, exact COS version retrieval, isolated PostgreSQL 16 restore, cleanup, and fresh P0.
