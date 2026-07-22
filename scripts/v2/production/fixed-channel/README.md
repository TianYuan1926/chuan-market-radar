# Market Radar Fixed Production Dispatch

This directory contains the pull-only production dispatch channel.

## Boundary

- The agent opens no inbound port.
- GitHub stores only a redacted bundle, an external approval request, a canonical dispatch envelope, and an Ed25519 signature.
- The signing private key stays on the local engineering host and is never committed or uploaded.
- The production host stores only the public key.
- A dispatch cannot contain a shell command or command arguments.
- The only executable target is a checksum-bound, allowlisted `production-entrypoint.sh` or `*-entrypoint.sh` from the signed bundle.
- The agent defers while the repository-external production lease is active or its state is uncertain.
- The single-use claim is synchronized to disk before launch. A structurally invalid single dispatch is quarantined and consumed without execution so it cannot deadlock all later work.
- Existing package runners retain responsibility for lease/fencing checks, mutation checkpoints, rollback, evidence, and cleanup.

## Runtime

`market-radar-production-dispatch.timer` starts a one-shot poll every 20 seconds. The agent fetches only into a dedicated bare mirror under `/var/lib/market-radar-ops/production-dispatch`; it does not fetch into or check out the production worktree.

The first installation initializes a cursor at the current dispatch ref. Existing history is not replayed. After that, only one fast-forward dispatch commit may be pending. Invalid, expired, tampered, duplicate, non-reachable, secret-bearing, or out-of-scope requests fail closed before launch. The agent and Node children launched by the package entrypoint use `--jitless` under the systemd memory-execution restriction, and the entrypoint starts from the exact staging root.

## Files

- `production-dispatch.mjs`: key generation, preparation, validation, publication, initialization, and one-shot polling.
- `install-production-dispatch.sh`: exact-hash-gated, one-time systemd installation; its own bytes are included in the source-set hash and a failed first install removes only paths created by that attempt.
- `market-radar-production-dispatch.service`: hardened one-shot poller.
- `market-radar-production-dispatch.timer`: 20-second pull cadence.
- `production-dispatch.test.mjs`: policy and isolated end-to-end tests.

See `docs/runbooks/PRODUCTION_FIXED_DISPATCH_CHANNEL_V1.md` in the source repository for the full operational runbook.
