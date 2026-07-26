# V2 A0 Independent Security Quality Delivery Report

Date: 2026-07-27

## 1. Truth Status

```text
Control: V2-A0-INDEPENDENT-SECURITY-QUALITY
Source commit parts: 4f501b0fb8b917ce87e0 / 687eab8480b5c9595f27
Security workflow run: 30209898205
Full Quality workflow run: 30209898207
Control status: PASS
A0 total gate: INCOMPLETE
Production mutation: false
```

This package closes only the independent full-history secret scan, CodeQL SAST, and collector-container vulnerability-scan controls. It does not complete A0, authorize M1.5C/M1.5D, prove production recovery, or grant Candidate, Signal, Strategy, READY, or trading authority.

## 2. Bound Implementation

The independent workflow is `.github/workflows/v2-security-quality.yml`. It:

- checks out the exact source without persisted Git credentials;
- scans every reachable Git commit with Gitleaks `8.30.1`;
- runs CodeQL JavaScript/TypeScript `security-extended` with action `4.37.3`, linked bundle `2.26.1`, query pack `2.4.1`, and the explicit `AlertSuppression.ql` query;
- builds the collector image from the exact source commit, verifies its OCI revision label, non-root identity `65532:65532`, read-only/no-network Node smoke test, and scans OS plus library packages with Trivy `0.72.0`;
- uploads only sanitized summaries, never the raw Gitleaks finding report or raw CodeQL SARIF;
- has no production credential, execution, deployment, database, Redis, Feature Flag, or runtime authority.

Gitleaks exceptions are exact historical fingerprints only. Path-wide, rule-wide, and commit-wide allowlists remain forbidden. New findings fail closed.

CodeQL suppressions are bound to exact rule, file, alert line, review ID, rationale, and invariant in `docs/governance/v2-a0-codeql-reviewed-suppressions.v3.json`. The source comment must be immediately adjacent to the reviewed alert line; directory-wide, path-wide, rule-wide, and unregistered suppressions remain forbidden.

## 3. Root-Cause Remediation

| Recurring failure | Root cause | Permanent control |
| --- | --- | --- |
| Reviewed CodeQL findings still blocked the workflow | `security-extended` did not emit SARIF suppression metadata by itself | Pin and execute `AlertSuppression.ql`; require exact scanner/query-pack binding and exact source adjacency in the A0 materials gate |
| Commit identities repeatedly looked like Sourcegraph tokens to Gitleaks | Future architecture manifests stored a contiguous 40-hex reviewed commit | Preserve only exact historical fingerprints and store future reviewed commit identity as two validated 20-hex parts |
| Token-logo tests created URL-substring CodeQL noise | Security-sensitive hostname behavior was tested through insecure substring literals | Extract and test pure exact-host token-logo helpers; remove substring-based URL acceptance |
| Intentional evidence writers produced HTTP-to-file alerts | Validated remote facts are deliberately persisted as non-executable evidence | Harden sinks, document private/non-executable invariants, and bind each remaining alert to an exact reviewed suppression |

No scanner threshold was lowered, no result was discarded by broad exclusion, and no production data or service was changed to obtain PASS.

Post-closure branch verification run `30211083028` later retained a real red light: Gitleaks reported exactly two `sourcegraph-access-token` matches introduced by this report at historical lines 9 and 54. Sanitized artifact `8634464899` (`sha256:9f26ba47f78e155c7c3c21a334d355ea65f0b3502e98065ec29bb9e995df0e8a`) proved both locations were the reviewed security-source commit identity, not credentials. The two immutable historical fingerprints are entries 14 and 15 in the v4 false-positive review; the current report and machine matrix now use two validated 20-hex parts, and both the materials gate and M0 reject a regression to a contiguous credential-shaped identity.

The remediation was then independently revalidated:

```text
Remediation source parts: 9f6d4731e6afbf0a68d3 / 2a98df64da179f20d84a
Security workflow run: 30212437973
Full Quality workflow run: 30212437974
Remediation validation status: PASS
Production mutation: false
```

## 4. Remote Acceptance Evidence

| Control | Job | Sanitized artifact | Verified result |
| --- | --- | --- | --- |
| Full-history secret scan | `89814245147` | `8634143821`, `sha256:dcc6966f9cefeb8ae19f1a74fd97d6ffb85f8df72b35c56dd7acee72cb27acea` | Gitleaks `8.30.1`; full reachable history; finding count `0`; report digest `sha256:37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| CodeQL SAST | `89814245103` | `8634167593`, `sha256:a2e8fc1c18fd48366018fa2f0d4d78f4bea20d22dc296bf2c9d4100bc676b3a3` | result count `8`; exact reviewed suppressions `8`; untriaged/blocking results `0`; SARIF set digest `sha256:ccd677b08befd42fe399cd8a7c3cef087a480eb4d4b017a619d83139932b29e7` |
| Collector image scan | `89814245165` | `8634153873`, `sha256:7b9386b717bdc522feb45ca7ed17e735e77bfb7b47b0c6550e1d67bfdf629322` | Trivy `0.72.0`; CRITICAL `0`; HIGH `0`; report digest `sha256:84e6e12f7e8a5b6c9d3ca7c38c8b7716f5fd8ee2f30d3748fe822506a62ac83a` |
| Exact-runtime full CI | `89814245105` | Workflow run `30209898207` | GitHub Ubuntu 24.04 job completed with conclusion `success` |

The three sanitized security summaries independently bind the concatenated source commit parts `4f501b0fb8b917ce87e0` + `687eab8480b5c9595f27` and state `productionMutation=false`.

### 4.1 Post-Closure Remediation Revalidation

| Control | Job | Sanitized artifact | Verified result |
| --- | --- | --- | --- |
| Full-history secret scan | `89820836444` | `8634842724`, `sha256:17d276663be0eda77c8a8596a59861d733e7640a8eeb9ac79b10f3a046457336` | Gitleaks `8.30.1`; full reachable history; finding count `0`; report digest `sha256:37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| CodeQL SAST | `89820836452` | `8634864382`, `sha256:2b6884927bd07dd72e7442208796fafde58f4c8ad881d7c362c7c1c1d63c20eb` | result count `8`; exact reviewed suppressions `8`; untriaged/blocking results `0`; SARIF set digest `sha256:725ff4f05b33a62b7671da7f6e6f1ed43277953be79be9c04c077a4d36cb3ec6` |
| Collector image scan | `89820836428` | `8634851363`, `sha256:d35ab494bde9f2654b9427c6ec14dcdb57db028f86624f54e1ac0bfb0cb58f3b` | Trivy `0.72.0`; CRITICAL `0`; HIGH `0`; report digest `sha256:9a150383eb0d926f31c361e3c6bf271bdee868bce37a2470104b91d6a837e19f` |
| Exact-runtime full CI | `89820836431` | SBOM `8634884084`, `sha256:bfe7e3b05b8fd1f8f46115d0167364cc0a1451f039cbb463af0e60cf9fabb9fb` | Workflow run `30212437974`; GitHub Ubuntu 24.04 job completed with conclusion `success` |

These receipts prove the credential-shaped identity recurrence is closed on the exact remediation source without a broad allowlist or production mutation. They do not expand the original security control into an A0 total PASS.

## 5. Local Acceptance Evidence

- A0 materials tests: `10/10` PASS.
- A0 materials gate: PASS.
- Repository hygiene and CodeQL evidence regression: `56/56` PASS.
- TypeScript typecheck: PASS.
- ESLint and Biome: PASS.
- M0 engineering exit: `PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED`.
- Exact Node `22.23.1` / npm `10.9.8` full `ci:production`: PASS.
- Exact Gitleaks `8.30.1` remote-equivalent full-history scan: PASS.

Local verification is supporting evidence only. The control is accepted because the bound remote jobs and sanitized artifacts also passed.

## 6. Production and Authority Boundary

This package did not:

- connect to or mutate Tencent production;
- deploy an image or source tree;
- change PostgreSQL, Redis, Worker, Web, Caddy, env, Feature Flag, COS, migration, or secret material;
- start M1.5C or M1.5D;
- emit a Candidate, Signal Grade, Strategy, Decision Snapshot, or READY state;
- change GitHub `main`.

## 7. Remaining A0 Controls

At this report's original acceptance point, three controls remained: reproducible release provenance/rollback, the frozen performance/resource baseline, and P0R.

The first two were subsequently closed on exact source parts `9ef63b85d1a76f3ad7ac + 815e081506c5dbc074a5` by A0 run `30217335595`, with same-source Full Quality `30217335543` and Security `30217335622` also passing. The current evidence is recorded in `docs/blueprints/V2_A0_REPRODUCIBLE_RELEASE_AND_RESOURCE_BASELINE_DELIVERY_REPORT.md`.

A0 remains `INCOMPLETE_P0R_PENDING`. Its only remaining control is the real encrypted off-host backup, exact-version retrieval, isolated PostgreSQL 16 restore, and cleanup. None of the security, provenance, rollback or engineering-resource receipts may substitute for P0R.
