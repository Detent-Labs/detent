# scripts/worktree-env.sh — derives this checkout's devcontainer identity.
#
# Source it, never execute it: `. scripts/worktree-env.sh`. Every caller in
# this repository that starts, inspects or execs into the devcontainer pod
# sources this instead of naming a pod, a container or a port itself (see
# worktree-isolation). DEV_POD names the pod; its containers are
# $DEV_POD-app, $DEV_POD-db and $DEV_POD-mailpit. POSIX sh only — two
# callers declare `#!/bin/sh`, and CI's `sh` is dash.
#
# Reads the CALLER's working directory (the shell this file gets sourced
# into), never $0 — a sourced script's $0 is the sourcing shell, not this
# file.
#
# Exports, unconditionally, from the checkout alone (never an inherited
# value): DEV_POD, PORT_APP, PORT_VITE, PORT_MAILPIT.

_WTENV_MAIN_NAME="workflow-engine"
_WTENV_BASE_APP=3100
_WTENV_BASE_VITE=5173
_WTENV_BASE_MAILPIT=8025

_wtenv_established() {
  DEV_POD="$_WTENV_MAIN_NAME"
  PORT_APP="$_WTENV_BASE_APP"
  PORT_VITE="$_WTENV_BASE_VITE"
  PORT_MAILPIT="$_WTENV_BASE_MAILPIT"
}

if command -v git >/dev/null 2>&1; then
  _wtenv_gitdir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null) || _wtenv_gitdir=""
  _wtenv_commondir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || _wtenv_commondir=""
  if [ -z "$_wtenv_gitdir" ] || [ -z "$_wtenv_commondir" ] || [ "$_wtenv_gitdir" = "$_wtenv_commondir" ]; then
    _wtenv_established
  else
    _wtenv_toplevel=$(git rev-parse --show-toplevel 2>/dev/null) || _wtenv_toplevel=""
    if [ -z "$_wtenv_toplevel" ]; then
      _wtenv_established
    else
      _wtenv_base=$(basename "$_wtenv_toplevel" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g')
      _wtenv_sum=$(printf '%s' "$_wtenv_toplevel" | cksum | cut -d' ' -f1)
      DEV_POD="detent-${_wtenv_base}-${_wtenv_sum}"
      # ponytail: a hashed offset admits a collision between two worktrees —
      # about 1-in-200 per pair. Podman refuses the second bind and names the
      # port, so a collision is loud, not silent. Upgrade to a registry-backed
      # allocator if concurrent worktrees push the odds of that past comfort.
      _wtenv_offset=$((10 * (1 + _wtenv_sum % 200)))
      PORT_APP=$((_WTENV_BASE_APP + _wtenv_offset))
      PORT_VITE=$((_WTENV_BASE_VITE + _wtenv_offset))
      PORT_MAILPIT=$((_WTENV_BASE_MAILPIT + _wtenv_offset))
    fi
  fi
else
  _wtenv_established
fi

unset _wtenv_gitdir _wtenv_commondir _wtenv_toplevel _wtenv_base _wtenv_sum _wtenv_offset

export DEV_POD PORT_APP PORT_VITE PORT_MAILPIT
