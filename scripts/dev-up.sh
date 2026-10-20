#!/usr/bin/env bash
# One-command devcontainer bring-up: start this checkout's pod (and wait for
# every container's probe, the database's included), install deps, seed the
# example processes + demo users, ensure a demo-superuser with all eight
# system:* roles, and (re)start the HTTP server. Safe to re-run — every step
# is idempotent, a pod that already runs the current spec and image is left
# alone, and the JWT signing secret is generated once and reused, so restarts
# don't invalidate existing logins.
#
# Runs on the HOST (it drives podman itself); the actual bun/tsc/test
# commands it shells out to all run inside the app container, per CLAUDE.md.
# Usage: bash scripts/dev-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. scripts/worktree-env.sh

SUPERUSER_EMAIL="demo-superuser@example.test"
SUPERUSER_PASSWORD="seed-demo-password"
SUPERUSER_ROLES="system:publish,system:cancel-any,system:admin,system:developer,system:author,system:reports,system:datalists,system:templates"
SECRET_FILE="container/.auth-secret"

echo "==> Starting the pod ($DEV_POD: $PORT_APP, $PORT_VITE, $PORT_MAILPIT)"
sh scripts/dev-pod.sh up

echo "==> Installing dependencies"
sh scripts/dev-exec.sh bun install

if [ ! -f "$SECRET_FILE" ]; then
  echo "==> Generating AUTH_JWT_SECRET ($SECRET_FILE, gitignored, reused on every future run)"
  openssl rand -base64 32 > "$SECRET_FILE"
fi
SECRET="$(cat "$SECRET_FILE")"

echo "==> Seeding example processes + per-role demo users"
sh scripts/dev-exec.sh env SEED_ALLOW=1 bun run seed

echo "==> Ensuring $SUPERUSER_EMAIL (all system:* roles)"
# On a re-run add-user hits the unique constraint on auth_users.email, and
# set-roles is the expected path — so its stderr is noise, not a failure.
sh scripts/dev-exec.sh bun run src/auth/cli.ts add-user "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" "$SUPERUSER_ROLES" 2>/dev/null \
  || sh scripts/dev-exec.sh bun run src/auth/cli.ts set-roles "$SUPERUSER_EMAIL" "$SUPERUSER_ROLES"

echo "==> (Re)starting the HTTP server"
podman exec "$DEV_POD-app" pkill -f "src/http/server.ts" >/dev/null 2>&1 || true
sleep 1
# podman logs only captures the container's PID 1 (sleep infinity) — a detached `exec -d` process's stdout/stderr are never
# captured, so the server's structured logs (src/log.ts) went nowhere.
# Redirecting to a file under /workspace makes them readable both inside
# the container and on the host (bind mount), e.g. `tail -f
# container/server.log`.
podman exec -d -e AUTH_JWT_SECRET="$SECRET" -w /workspace "$DEV_POD-app" \
  bash -c 'bun run serve > container/server.log 2>&1'
sleep 2

echo "==> Confirming the stack is ready"
bash scripts/preflight.sh serve

echo
echo "Ready:"
echo "  Engine:   http://127.0.0.1:${PORT_APP}/"
echo "  Frontend: http://127.0.0.1:${PORT_VITE}/ (once you start the dev server — see docs/browser-checks.md)"
echo "  Mailpit:  http://127.0.0.1:${PORT_MAILPIT}/"
echo "Login: $SUPERUSER_EMAIL / $SUPERUSER_PASSWORD"
