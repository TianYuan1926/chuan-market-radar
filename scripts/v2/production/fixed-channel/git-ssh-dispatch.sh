#!/bin/sh
set -eu

exec /usr/bin/ssh \
  -F /dev/null \
  -i /opt/market-radar-production-dispatch/github-deploy-key \
  -o BatchMode=yes \
  -o ConnectTimeout=20 \
  -o ConnectionAttempts=2 \
  -o IdentitiesOnly=yes \
  -o ServerAliveCountMax=2 \
  -o ServerAliveInterval=15 \
  -o StrictHostKeyChecking=yes \
  -o TCPKeepAlive=yes \
  -o UserKnownHostsFile=/opt/market-radar-production-dispatch/github-known-hosts \
  "$@"
