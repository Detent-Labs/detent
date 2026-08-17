# One-command devcontainer bring-up, PowerShell entry point. It runs
# dev-up.sh rather than restate its flow, so the two entry points agree by
# construction. Same shape scripts/preflight.ps1 already uses for
# preflight.sh.
#
# Delegating needs bash on the host. That is no new requirement in
# practice: dev-up.sh already shells into the app container for every
# bun/tsc/test command, and Git for Windows ships Git Bash.
#
# Usage: pwsh scripts/dev-up.ps1

Set-StrictMode -Version Latest
Set-Location (Join-Path $PSScriptRoot "..")

$bash = (Get-Command bash -ErrorAction SilentlyContinue).Source
if (-not $bash) {
    Write-Host "dev-up: no bash on this host, and the bring-up flow lives in dev-up.sh"
    Write-Host "  Install Git for Windows, which ships Git Bash, then run: bash scripts/dev-up.sh"
    exit 1
}

& $bash (Join-Path $PSScriptRoot "dev-up.sh") @args
exit $LASTEXITCODE
