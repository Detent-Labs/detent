#!/bin/sh
# scripts/dev-exec.sh — runs a command in this checkout's `app` container.
#
#   sh scripts/dev-exec.sh <cmd> [args...]
#
# The argv is the command and nothing else; a caller that needs an env
# variable passes `env NAME=value cmd`. The workdir is /workspace, the
# checkout's bind mount. No TTY is allocated, which suits the push hook and CI.
#
# The derivation is sourced by a path relative to this file, and it reads the
# caller's working directory, so the command reaches the pod of the checkout
# it ran in. POSIX sh only — CI's `sh` is dash.
set -eu

# shellcheck disable=SC1091
. "$(dirname "$0")/worktree-env.sh"

exec podman exec -w /workspace "$DEV_POD-app" "$@"
