# Market Radar Known Issues Registry

This registry turns previously observed failures into release-blocking regression evidence. The JSON file is authoritative; this document explains the operating rule.

Every issue must have a stable ID, severity, invariant, machine-covered status and at least one existing test file, exact test title and executable npm command. A missing issue, deleted test, renamed test, unknown command or non-covered status fails `g0:known-issues:validate`.

The registry covers credential propagation, CoinGlass failure classification, stale workers, zero clean scan rows, false runner state, stale evidence, dirty deployment, fake zero display, scan-proof denominator duplication and outcome timeout mapping. Passing the registry proves only that regression guards are wired locally. It does not prove current production release identity, HTTPS, private session, Candidate cutover or G0 exit.
