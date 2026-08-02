# V2 Production Evidence Gateway Runtime Preflight Remediation Report

Date: 2026-08-02

Status: `SECOND_EXACT_ATTEMPT_FAILED_PRE_CADDY_MUTATION / PRODUCTION_ZERO_DRIFT / ROOT_CAUSE_DIRECT / LOCAL_REMEDIATION_CHECKPOINT_CREATED / FULL_LOCAL_CI_PASS / REMOTE_GATES_AND_NEW_APPROVAL_PENDING`

## Scope

This report records the second exact production attempt for `V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY`, the two directly reproduced production-runtime mismatches, the completed rollback-scope cleanup, and the permanent local remediation checkpoint. It does not claim that the gateway is deployed, that a replacement source is remotely qualified, or that P0R backup, exact retrieval and isolated restore are complete.

## Exact Attempt

- Qualified source: `d9a1e5fedf481f00e3cc88705c7e2b884add3ebe`
- Production HEAD: `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`
- Remote gates from the same source: Signed Dispatch `30743899298`, A0 `30743899304`, Independent Security `30743899295`, Full Quality `30743899329`; all passed before packaging.
- Dispatch ID: `production-evidence-gateway-20260802t110456z-d9a1e5fe`
- Approval request SHA-256: `33d3edb2e012898f7ec4f5c80a1bb24b4b061a9c8e06e3043fc3d9f267ea6f62`
- Bundle SHA-256: `946a158a6f81bed738a36c1d0c05460e694e4bd625c8056c2b25dd2f8aaacae9`
- Signed dispatch commit: `39732e2e943e7b32648d1f0ca43c477900133acb`
- Signed dispatch parent: `a52aa6acfbe2f4f5d26cb15a82701195ca2f32df`
- Published: `2026-08-02T11:39:24.782Z`
- Claimed: `2026-08-02T11:39:28.743Z`
- Failed: `2026-08-02T11:39:39.416Z`
- Agent status: `FAIL_DISPATCH_NOT_REUSABLE`
- Agent reason: `dispatch_entrypoint_launch_failed`
- Stderr SHA-256: `67269043cc7fb87238ed8eb995d48bd6c92384b3f11ce821d376e7c1d158229a`
- Stdout SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- The stderr digest uniquely matched the old runner's canonical `{"reason":"unexpected_error","status":"BLOCKED"}` response. It was not treated as a usable root-cause diagnosis.

The claim makes this dispatch permanently non-reusable. The exact approval is bound to the failed source, request and bundle and cannot authorize a replacement package.

## Direct Root Cause

Two production-equivalent, no-Caddy-mutation diagnostics reproduced the failure boundary:

1. The original isolated Caddy validation exited `255` with `exec /usr/bin/caddy: operation not permitted`. `--cap-drop ALL` removed the file capability needed to execute the current Caddy image. The same current image passed `caddy validate` with all existing isolation retained and only `NET_BIND_SERVICE` restored.
2. Direct Docker Compose validation exited `1` because `POSTGRES_USER` was missing. The runner supplied only `.env.production` and bypassed the production identity chain. The existing root-owned production Compose wrapper passed `config --quiet` with the gateway override because it binds `.env.production`, the root-only PostgreSQL admin env and the runtime identity override.

The exact external production identities are:

- Compose wrapper: root/root, mode `0700`, SHA-256 `fb473dc3bf0a2968be8ad385efac3273f4057530df17cee73f2003d3a369f1f3`
- Runtime identity override: root/root, mode `0600`, SHA-256 `1b7f8ba4c623a0025ff35ddc203c6b769d1b262a1545a16892816cdbc478bacf`

Together with the first health-envelope failure, this is recurrence occurrence two for `production_gateway.preflight_runtime_equivalence`. Local mock success did not materially model the production API, image capabilities or Compose identity. The class is now `STOP-THE-LINE` for generic gateway release.

## Production Truth And Cleanup

The second attempt failed before gateway installation completed and before any Caddy mutation:

- production HEAD remained `cec0b6572bb09ae91ff9e013f8bb160f73c045e2`;
- production worktree remained clean;
- all eleven exact container identities remained unchanged, including Caddy `b778744935ececd6d86d00f468fab14fcd6271eb17767ba124e2014cff9cf9fa`;
- health remained ready, scan remained ready/fresh, and persistence remained ready;
- the fake evidence route remained `404`;
- gateway root, exact staging and global production lock were absent;
- database, Redis, Worker, env, migration, Feature Flag, production repository and other services were unchanged.

The failed runner left one known empty outbound directory. It was removed under the approved automatic rollback and staging-cleanup scope only after proving gateway root, staging and lock absence. Final verification returned outbound absent, diagnostic directories `0`, diagnostic containers `0`, ready/fresh health and the unchanged exact production identity.

## Permanent Local Remediation

Implementation checkpoint `bb9abe5cf0404ca7ce9af55f6ed99a6e3f646d76` with tree `1b01dff47eb613faab492d5c7204fcc55594d807` now:

- binds the exact production Compose wrapper and runtime identity override paths, hashes, owners and modes;
- uses the exact wrapper for target Compose validation, Caddy deployment and rollback;
- validates the current Caddy image with network none, read-only root, no-new-privileges, cap-drop all and only `NET_BIND_SERVICE` added;
- emits stable operation-level command failures with bounded stdout/stderr digests instead of generic `unexpected_error`;
- removes only gateway and empty outbox state created by the current attempt, while preserving and blocking on unknown pre-existing state;
- embeds the checksum-bound recurrence registry and executable recurrence gate in the deterministic bundle;
- validates the registered remediation operation during bundle creation and again on production before gateway file creation or Caddy mutation;
- permanently retires mock-only and unbound gateway release paths while leaving the incident open until full real-target acceptance.

Directed evidence is gateway `12/12`, recurrence gate `11/11`, production dispatch and evidence channel `38/38`, ESLint, Biome, tracked-source secret scan and `git diff --check` all passed. Complete exact-toolchain `ci:production` also exited `0` under Node `22.23.1` and npm `10.9.8`: market `965/969` with four explicit skips, workers `23/23`, historical `4/4`, V2 Foundation `638/644` with six explicit skips, V2 Ops `279/279`, M0 `12/12`, Next production build, Golden `16/16` and security all passed. Clean authority-sync commit/push, GitHub four-gate requalification, fresh production baseline, deterministic replacement package and new exact approval remain pending.

## Required Next Sequence

1. Commit and push the exact replacement source after final-byte CI passes.
2. Obtain all four GitHub gates from that same source; no old gate may be spliced.
3. Capture a fresh read-only production baseline, including both external identity hashes and modes.
4. Build the replacement package twice and prove byte-for-byte determinism.
5. Obtain a new exact approval bound to the new source, request, bundle, production baseline and 90-minute window.
6. Execute only the registered remediation path; automatically roll back and clean on any failure.
7. Retrieve, decrypt and verify the signed evidence independently before closing this recurrence incident or resuming P0R.

Until steps 1-9 pass, the accurate status is `可运行但不完整`; the gateway is not deployed and Market Radar V2 is not ready for controlled practical admission.
