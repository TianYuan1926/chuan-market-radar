# Production Verification

- Production application HEAD: `0599f802f261fe8e3c1982a07106f362bd62ac13` before and after.
- Production worktree: clean before and after.
- Final root disk: 123726136 KiB total, 14808500 KiB used, 103763584 KiB available, 13% used.
- Docker build cache reclaimed: 88.76 GB; images, containers and volumes were not pruned.
- Runtime: 11 containers running; web, PostgreSQL and Redis healthy.
- Health: HTTP 200, `X-Chuan-Health-Level: ready`, `X-Chuan-Persistence: database`.
- Candidate migration executed: false.
- Production schema changed: false.
- Application release/image changed: false.
- Raw production dump downloaded off-host: false.
- Private key uploaded to production: false.
