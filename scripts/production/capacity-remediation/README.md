# Production Capacity And Recovery Remediation

This package creates an encrypted PostgreSQL backup on production and proves it can be restored on an external, isolated PostgreSQL 16 host. It does not run Candidate migration DDL/DML, change the application release, delete Docker resources, or connect the restore host to production.

## Trust boundary

- The private key remains on the external restore host and must never be copied to production or committed.
- Production receives only the public certificate.
- Production retains the plaintext dump in a root-only operations directory until a separately approved cleanup.
- Only the encrypted backup, manifest, and public certificate enter the transfer directory.
- Restore evidence contains schema/count/size/RPO/RTO metadata only; it contains no business rows.

## Plan mode

Both scripts default to plan mode and perform no production database connection or restore:

```bash
AUTHORIZED_HEAD=<40-char-head> \
BACKUP_ID=<backup-id> \
OPS_ROOT=/var/lib/market-radar-ops/<backup-id> \
PUBLIC_CERT=/absolute/path/public-cert.pem \
npm run capacity:backup:plan

ENCRYPTED_BACKUP=/absolute/path/backup.dump.cms \
MANIFEST=/absolute/path/backup.manifest.json \
PRIVATE_KEY=/absolute/path/private-key.pem \
PUBLIC_CERT=/absolute/path/public-cert.pem \
RESULT_FILE=/absolute/path/restore-result.json \
npm run capacity:restore:plan
```

## Execute controls

Production backup execution requires root and the exact confirmation value:

```text
CONFIRM_BACKUP=CREATE_ENCRYPTED_OFFHOST_BACKUP_ONLY
```

The external restore drill requires the exact confirmation value:

```text
CONFIRM_RESTORE_DRILL=RESTORE_ENCRYPTED_BACKUP_IN_LOCAL_ISOLATION
```

Execution must be performed from an approved runbook with an authorized production HEAD, an empty production worktree, verified health, and explicit operator approval for production file transfer. Do not put actual paths, host credentials, database credentials, or keys in this document.

## Verification

```bash
npm run test:capacity-remediation
bash -n scripts/production/capacity-remediation/production-encrypted-backup.sh
bash -n scripts/production/capacity-remediation/local-restore-drill.sh
```
