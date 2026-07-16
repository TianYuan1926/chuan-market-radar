# WP-G0.3-G0.5 Security, Release and Incident Local Superpackage

## 1. Goal

Prepare the remaining G0 access-security, release-identity and known-incident controls while Candidate Activation observation continues. This package is local preparation only and cannot modify production, DNS, TLS certificates, runtime environment, Candidate authority, databases or workers.

## 2. HTTPS and private session

The Caddy and session sources now contain security headers, staged HSTS control, strict private-session configuration, secret rotation support, strict token claims, same-origin mutation checks, no-store responses, bounded rate limiting and redacted security events. The current Compose/bootstrap default remains `CHUAN_PUBLIC_HOST=:80` and `CHUAN_HSTS_MAX_AGE=0`; this truth is deliberately preserved so local code cannot claim that production TLS exists.

Production G0.3 requires either a verified public hostname with a valid certificate and permanent HTTP redirect, or proof that no public listener exists and a trusted private network is enforced. It also requires at least seven days and 2,017 samples with zero failures, maximum gap at most 600 seconds, then HSTS enablement for public TLS. Private-session page/API rejection, secure/HttpOnly/SameSite cookies, logout invalidation, no-store, rate limiting, redacted logs and rotation procedure are all mandatory.

## 3. Release identity

`RELEASE_RECORD_SCHEMA.json` and `release-record-check.mjs` define one current record binding GitHub `main`, commit, tree, runtime Git, immutable image digests, Compose, redacted env fingerprint, served content, migrations, evidence, health and rollback. Runtime health cannot substitute for release alignment. A dirty worktree, stale evidence, content mismatch or untested rollback is FAIL.

The schema and validator do not generate current production evidence. G0.4 remains blocked until a current production record is generated and independently aligned.

## 4. Known incidents

The machine registry contains ten required incident IDs and exact executable regression evidence for credential propagation, failure classification, worker staleness, zero clean scans, false running, stale evidence, dirty deploy, fake zero, scan-proof denominator truth and timeout mapping. Missing or renamed evidence fails the registry Gate.

## 5. Production order and hard stop

The only legal order remains:

1. Candidate Activation observation PASS.
2. Production 10,000-write read-only reconciliation PASS.
3. Canonical compatibility and read cutover PASS.
4. G0.3 HTTPS/private-session production evidence and seven-day burn-in PASS.
5. G0.4 current release record PASS.
6. G0.5 incident registry and G0 exit audit PASS.

This local package must stay on the work branch. It does not authorize `main`, production deployment, DNS, TLS, environment or secret changes.
