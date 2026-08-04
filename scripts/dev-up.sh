#!/usr/bin/env bash
# One-command devcontainer bring-up: start the compose services, install
# deps, seed the example processes + demo users, ensure a demo-superuser
# with all six system:* roles, and (re)start the HTTP server. Safe to
# re-run — every step is idempotent, and the JWT signing secret is
# generated once and reused, so restarts don't invalidate existing logins.
#
# Runs on the HOST (it drives docker compose itself); the actual
# bun/tsc/test commands it shells out to all run inside the app container,
# per CLAUDE.md. Usage: bash scripts/dev-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash on Windows otherwise rewrites the Unix-style /workspace path
# into a Windows path before Docker sees it. Harmless no-op elsewhere.
export MSYS_NO_PATHCONV=1

SUPERUSER_EMAIL="demo-superuser@example.test"
SUPERUSER_PASSWORD="seed-demo-password"
SUPERUSER_ROLES="system:publish,system:cancel-any,system:admin,system:developer,system:reports,system:datalists"
SECRET_FILE=".devcontainer/.auth-secret"

COMPOSE_FILES=(-f .devcontainer/docker-compose.yml)
if [ ! -f .devcontainer/docker-compose.override.yml ]; then
  echo "No .devcontainer/docker-compose.override.yml — creating one to publish the dev ports to the host."
  cat > .devcontainer/docker-compose.override.yml <<'EOF'
services:
  app:
    ports:
      - "127.0.0.1:3000:3000"
      - "127.0.0.1:5173:5173"

  # Mailpit's web interface. The 127.0.0.1 prefix is load-bearing on Windows:
  # without it Docker binds [::], and the host browser meets a connection reset.
  mailpit:
    ports:
      - "127.0.0.1:8025:8025"
EOF
fi
COMPOSE_FILES+=(-f .devcontainer/docker-compose.override.yml)
compose() { docker compose "${COMPOSE_FILES[@]}" "$@"; }

echo "==> Starting containers"
compose up -d

echo "==> Installing dependencies"
compose exec -w /workspace app bun install

if [ ! -f "$SECRET_FILE" ]; then
  echo "==> Generating AUTH_JWT_SECRET ($SECRET_FILE, gitignored, reused on every future run)"
  openssl rand -base64 32 > "$SECRET_FILE"
fi
SECRET="$(cat "$SECRET_FILE")"

echo "==> Seeding example processes + per-role demo users"
compose exec -e SEED_ALLOW=1 -w /workspace app bun run seed

echo "==> Ensuring $SUPERUSER_EMAIL (all system:* roles)"
# On a re-run add-user hits the unique constraint on auth_users.email, and
# set-roles is the expected path — so its stderr is noise, not a failure.
compose exec -w /workspace app bun run src/auth/cli.ts add-user "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" "$SUPERUSER_ROLES" 2>/dev/null \
  || compose exec -w /workspace app bun run src/auth/cli.ts set-roles "$SUPERUSER_EMAIL" "$SUPERUSER_ROLES"

echo "==> (Re)starting the HTTP server"
compose exec -w /workspace app pkill -f "src/http/server.ts" >/dev/null 2>&1 || true
sleep 1
# docker logs/compose logs only capture the container's PID 1 (sleep
# infinity) — a detached `exec -d` process's stdout/stderr are never
# captured, so the server's structured logs (src/log.ts) went nowhere.
# Redirecting to a file under /workspace makes them readable both inside
# the container and on the host (bind mount), e.g. `tail -f
# .devcontainer/server.log`.
compose exec -d -e AUTH_JWT_SECRET="$SECRET" -w /workspace app \
  bash -c 'bun run serve > .devcontainer/server.log 2>&1'
sleep 2

echo "==> Confirming the stack is ready"
bash scripts/preflight.sh serve

echo
echo "Ready: http://localhost:3000/"
echo "Login: $SUPERUSER_EMAIL / $SUPERUSER_PASSWORD"
