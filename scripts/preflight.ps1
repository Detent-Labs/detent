# Devcontainer preflight, PowerShell entry point. It runs preflight.sh rather
# than restate its six checks, so the two entry points agree by construction.
#
# This file held a second PowerShell implementation of all six until
# `one-source-gates-and-preflight`. The two hand-synced identical SQL, the
# service list `app db mailpit`, the port list (per-checkout, derived by
# scripts/worktree-env.sh — see worktree-isolation), and check 6's whole
# rationale as a comment. Commit 210c526 narrowed the WAL check once, and both
# files needed the repair by hand.
#
# Delegating needs bash on the host. That is no new requirement in practice:
# .githooks/pre-push is a POSIX sh script that runs `bash scripts/preflight.sh
# core`, and this file's own check 3 and check 4 printed `bash
# scripts/dev-up.sh` as their repair. Git for Windows ships Git Bash, and a
# contributor cannot clone without git.
#
# Usage: pwsh scripts/preflight.ps1 <core|serve>
#   core:  checks 1, 2, 6 -- preconditions of any work in the container.
#   serve: core plus checks 3, 4, 5 -- preconditions of a browser session.
#
# See openspec/specs/devcontainer-preflight for the full contract.

param(
    [Parameter(Position = 0)]
    [string]$Profile
)

Set-StrictMode -Version Latest
Set-Location (Join-Path $PSScriptRoot "..")

# Rejected here rather than in preflight.sh, so a bad argument costs no bash
# lookup and exits 2 exactly as it did before this file delegated.
if ($Profile -ne "core" -and $Profile -ne "serve") {
    Write-Host "Usage: preflight.ps1 <core|serve>"
    exit 2
}

$bash = (Get-Command bash -ErrorAction SilentlyContinue).Source
if (-not $bash) {
    Write-Host "preflight: no bash on this host, and the six checks live in preflight.sh"
    Write-Host "  Install Git for Windows, which ships Git Bash, then run: bash scripts/dev-up.sh"
    exit 1
}

& $bash (Join-Path $PSScriptRoot "preflight.sh") $Profile
exit $LASTEXITCODE
