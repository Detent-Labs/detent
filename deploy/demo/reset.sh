#!/bin/sh
# Resets the demo to the seed state. Runs as `detent`, nightly from the timer.
set -eu

# TCP on purpose: the first-boot initdb server listens on the unix socket only.
waited=0
until podman exec detent-db pg_isready -h localhost -U postgres -q 2>/dev/null; do
  if [ "$waited" -ge 120 ]; then
    echo "reset.sh: Postgres did not accept connections within 120 s" >&2
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done

systemctl --user stop detent-engine.service
podman exec detent-db dropdb -U postgres --if-exists --force workflow_engine
podman exec detent-db createdb -U postgres workflow_engine
systemctl --user start detent-engine.service

# A plain `podman build` drops HEALTHCHECK, so poll /readyz directly.
waited=0
until podman exec detent-engine bun -e "fetch('http://localhost:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  if [ "$waited" -ge 120 ]; then
    echo "reset.sh: /readyz did not answer within 120 s" >&2
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done

podman exec -e SEED_ALLOW=1 detent-engine bun run scripts/seed.ts

# Every reserved role in src/auth/authorize.ts. The seed's per-role accounts hold one each.
roles="system:publish,system:cancel-any,system:admin,system:developer,system:reports,system:datalists,system:templates,system:author,system:create,system:owner"
podman exec detent-engine bun run src/auth/cli.ts add-user demo-superuser@example.test seed-demo-password "$roles"
