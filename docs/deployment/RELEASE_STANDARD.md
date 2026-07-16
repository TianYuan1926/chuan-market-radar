# Market Radar Release Standard

## 1. Purpose

This standard makes one release record the machine-readable source of truth for production identity. Runtime health and release identity are separate gates: a healthy container cannot prove that the intended commit or content is deployed, and an aligned release cannot prove runtime health.

## 2. Required identity

Every production release record must bind:

- release ID, generation time and expiry;
- GitHub `main` commit, tree and remote commit;
- production runtime Git commit;
- immutable image digests for every changed service;
- Compose, redacted environment fingerprint and served-content SHA-256;
- migration status and exact applied migration IDs;
- current evidence artifact and health evidence;
- exact rollback commit and retained image digests.

The record may contain hashes and non-sensitive identities only. It must never contain environment values, passwords, API keys, cookies, bearer tokens, private keys, database URLs or business rows.

## 3. PASS rules

`status=pass` is legal only when all alignment booleans are true, the source worktree is clean, GitHub `main` equals the runtime commit, every digest is immutable, evidence is current, health is independently PASS and rollback has been tested. Missing, stale, dirty or mismatched data is FAIL, never partial PASS.

The release record expires within 24 hours. A newer release, image, Compose file, redacted env fingerprint, migration state or served-content hash invalidates the old record immediately.

## 4. Rollback boundary

Rollback targets must be immutable and different from the current release commit. Rollback may restore code and retained service images only. Database rollback, volume deletion, Redis deletion and evidence deletion are outside this record and remain prohibited without an independent destructive-operation contract.

## 5. G0 production boundary

The schema and validator can be prepared locally, but G0.4 production PASS requires a record generated from the current production release and verified against current GitHub, Git, image, Compose, content, migration, evidence, health and rollback facts. Local fixtures or old evidence cannot satisfy the production Gate.
