#!/usr/bin/env bash
# Devcontainer preflight: names the failing precondition before a developer
# meets its symptom, and prints the command that repairs it. Runs on the
# HOST — check 1 asks whether the Docker daemon answers, and no container
# can answer that. See openspec/specs/devcontainer-preflight
# (add-devcontainer-preflight) for the full contract.
#
# Usage: bash scripts/preflight.sh <core|serve>
#   core:  checks 1, 2, 6 — preconditions of any work in the container.
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

COMPOSE="docker compose -f .devcontainer/docker-compose.yml"

fail() {
  echo "preflight: $1" >&2
  echo "  $2" >&2
  exit 1
}

# Check 1: the Docker daemon answers.
docker info >/dev/null 2>&1 || fail \
  "check 1 failed: the Docker daemon does not answer" \
  "Start Docker Desktop, then re-run."

# Check 2: every required container reports healthy.
UNHEALTHY=""
for svc in app db mailpit; do
  state=$($COMPOSE ps --format '{{.Health}}' "$svc" 2>/dev/null || echo "")
  [ "$state" = "healthy" ] || UNHEALTHY="$UNHEALTHY $svc"
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
  PIDS=$($COMPOSE exec -T app sh -c 'pgrep -f src/http/server.ts' 2>/dev/null || echo "")
  for pid in $PIDS; do
    $COMPOSE exec -T app sh -c "tr '\0' '\n' < /proc/$pid/environ" 2>/dev/null \
      | grep -q '^AUTH_JWT_SECRET=' && SECRET_FOUND=1
  done
  [ -n "$SECRET_FOUND" ] || fail \
    "check 3 failed: no server process carries AUTH_JWT_SECRET" \
    "bash scripts/dev-up.sh"

  # Check 4: every published port this checkout owns answers on the host.
  for port in "$PORT_APP" "$PORT_MAILPIT"; do
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || fail \
      "check 4 failed: port $port ($COMPOSE_PROJECT_NAME) does not answer on the host" \
      "bash scripts/dev-up.sh"
  done

  # Check 5: the development database holds its schema and its seed data.
  DEF_COUNT=$($COMPOSE exec -T db psql -U postgres -d workflow_engine -tAc \
    "select count(*) from definitions" 2>/dev/null || echo "0")
  SUPERUSER_COUNT=$($COMPOSE exec -T db psql -U postgres -d workflow_engine -tAc \
    "select count(*) from auth_users where email = 'demo-superuser@example.test'" 2>/dev/null || echo "0")
  [ "${DEF_COUNT:-0}" != "0" ] && [ "${SUPERUSER_COUNT:-0}" != "0" ] || fail \
    "check 5 failed: the database holds no seed data" \
    ". scripts/worktree-env.sh && docker compose -f .devcontainer/docker-compose.yml exec -e SEED_ALLOW=1 -w /workspace app bun run seed"
fi

# Check 6: no stale codebase-memory WAL file holds a lock. Warns rather than
# blocks: the index is per-machine local state (see CLAUDE.md), and this
# lock probe detects a hold only where the OS enforces mandatory file locks.
# ponytail: Windows-only detection ceiling; Linux/macOS locks are advisory,
# so a held lock there passes silently. Upgrade if that ever costs something.
#
# A zero-length WAL is skipped before the probe. SQLite zeroes the WAL on a
# checkpoint, so such a file holds no unrecovered frame and the database
# behind it is complete -- the opposite of the stale WAL this check looks
# for. Without that skip the check warns on every run, since the editor's own
# codebase-memory-mcp holds the index open and a live handle refuses the
# FileShare.None probe below.
shopt -s nullglob
for wal in "$HOME"/.cache/codebase-memory-mcp/*.db-wal; do
  [ -s "$wal" ] || continue
  db="${wal%-wal}"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      # MSYS/Cygwin's own `<>` redirection does not trigger a Win32 sharing
      # violation, so the probe shells out to .NET, which does.
      winpath="$(cygpath -w "$db")"
      LOCKED=$(powershell.exe -NoProfile -Command \
        "try { (New-Object System.IO.FileStream('$winpath','Open','ReadWrite','None')).Close(); exit 0 } catch { exit 1 }" \
        >/dev/null 2>&1; echo $?)
      ;;
    *)
      ( exec 3<>"$db" ) 2>/dev/null
      LOCKED=$?
      ;;
  esac
  if [ "$LOCKED" != "0" ]; then
    echo "preflight: check 6 warning: $db is locked by another process" >&2
    echo "  Close whatever holds codebase-memory-mcp's index, then re-run." >&2
  fi
done

echo "preflight ($PROFILE): all checks passed"
