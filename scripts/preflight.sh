#!/usr/bin/env bash
# Devcontainer preflight: names the failing precondition before a developer
# meets its symptom, and prints the command that repairs it. Runs on the
# HOST — check 1 asks whether Podman answers, and no container can answer
# that. See openspec/specs/devcontainer-preflight
# (add-devcontainer-preflight) for the full contract.
#
# Usage: bash scripts/preflight.sh <core|serve>
#   core:  checks 1, 2 — preconditions of any work in the container.
#   serve: core plus checks 3, 4, 5 — preconditions of a browser session.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. scripts/worktree-env.sh

PROFILE="${1:-}"
if [ "$PROFILE" != "core" ] && [ "$PROFILE" != "serve" ]; then
  echo "Usage: $0 <core|serve>" >&2
  exit 2
fi

fail() {
  echo "preflight: $1" >&2
  echo "  $2" >&2
  exit 1
}

# Check 1: Podman answers.
podman info >/dev/null 2>&1 || fail \
  "check 1 failed: Podman does not answer" \
  "podman info"

# Check 2: every required container reports healthy.
UNHEALTHY=""
for svc in app db mailpit; do
  podman healthcheck run "$DEV_POD-$svc" >/dev/null 2>&1 || UNHEALTHY="$UNHEALTHY $svc"
done
[ -z "$UNHEALTHY" ] || fail \
  "check 2 failed: not healthy:$UNHEALTHY" \
  "bash scripts/dev-up.sh"

if [ "$PROFILE" = "serve" ]; then
  # Check 3: the HTTP server process carries AUTH_JWT_SECRET. The container
  # environment is the wrong place to look: ALLOW_INSECURE_DEV_AUTH=1 sits
  # there on purpose, and dev-up injects the secret into the server process
  # alone.
  SECRET_FOUND=""
  PIDS=$(podman exec "$DEV_POD-app" sh -c 'pgrep -f src/http/server.ts' 2>/dev/null || echo "")
  for pid in $PIDS; do
    podman exec "$DEV_POD-app" sh -c "tr '\0' '\n' < /proc/$pid/environ" 2>/dev/null \
      | grep -q '^AUTH_JWT_SECRET=' && SECRET_FOUND=1
  done
  [ -n "$SECRET_FOUND" ] || fail \
    "check 3 failed: no server process carries AUTH_JWT_SECRET" \
    "bash scripts/dev-up.sh"

  # Check 4: every published port this checkout owns answers on the host.
  for port in "$PORT_APP" "$PORT_MAILPIT"; do
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || fail \
      "check 4 failed: port $port ($DEV_POD) does not answer on the host" \
      "bash scripts/dev-up.sh"
  done

  # Check 5: the development database holds its schema and its seed data.
  DEF_COUNT=$(podman exec "$DEV_POD-db" psql -U postgres -d workflow_engine -tAc \
    "select count(*) from definitions" 2>/dev/null || echo "0")
  SUPERUSER_COUNT=$(podman exec "$DEV_POD-db" psql -U postgres -d workflow_engine -tAc \
    "select count(*) from auth_users where email = 'demo-superuser@example.test'" 2>/dev/null || echo "0")
  [ "${DEF_COUNT:-0}" != "0" ] && [ "${SUPERUSER_COUNT:-0}" != "0" ] || fail \
    "check 5 failed: the database holds no seed data" \
    "sh scripts/dev-exec.sh env SEED_ALLOW=1 bun run seed"
fi

echo "preflight ($PROFILE): all checks passed"
