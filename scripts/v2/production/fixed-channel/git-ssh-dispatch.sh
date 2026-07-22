#!/bin/sh
set -eu

exec /usr/bin/ssh \
  -F /dev/null \
  -i /opt/market-radar-production-dispatch/github-deploy-key \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/opt/market-radar-production-dispatch/github-known-hosts \
  "$@"
