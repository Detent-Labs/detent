# One-command devcontainer bring-up (PowerShell 7+ variant of dev-up.sh, for
# Windows systems without Git Bash / WSL). Starts the compose services,
# installs deps, seeds the example processes + demo users, ensures a
# demo-superuser with all five system:* roles, and (re)starts the HTTP
# server. Safe to re-run — every step is idempotent, and the JWT signing
# secret is generated once and reused, so restarts don't invalidate
# existing logins.
#
# Runs on the HOST (it drives `docker compose` itself); the actual
# bun/tsc/test commands it shells out to all run inside the app container,
# per CLAUDE.md. Usage: pwsh scripts/dev-up.ps1

Set-StrictMode -Version Latest
Set-Location (Join-Path $PSScriptRoot "..")

$SuperuserEmail = "demo-superuser@example.test"
$SuperuserPassword = "seed-demo-password"
$SuperuserRoles = "system:publish,system:cancel-any,system:admin,system:developer,system:reports"
$SecretFile = ".devcontainer/.auth-secret"

$overridePath = ".devcontainer/docker-compose.override.yml"
if (-not (Test-Path $overridePath)) {
    Write-Host "No $overridePath -- creating one to publish the dev ports to the host."
    @'
services:
  app:
    ports:
      - "127.0.0.1:3000:3000"
      - "127.0.0.1:5173:5173"
      - "127.0.0.1:5174:5174"
      - "127.0.0.1:5175:5175"

  # Mailpit's web interface. The 127.0.0.1 prefix is load-bearing on Windows:
  # without it Docker binds [::], and the host browser meets a connection reset.
  mailpit:
    ports:
      - "127.0.0.1:8025:8025"
'@ | Set-Content -Path $overridePath -NoNewline
}

$ComposeFiles = @("-f", ".devcontainer/docker-compose.yml", "-f", $overridePath)

function Invoke-Compose {
    docker compose @ComposeFiles @args
}

Write-Host "==> Starting containers"
Invoke-Compose up -d

Write-Host "==> Installing dependencies"
Invoke-Compose exec -w /workspace app bun install

if (-not (Test-Path $SecretFile)) {
    Write-Host "==> Generating AUTH_JWT_SECRET ($SecretFile, gitignored, reused on every future run)"
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    [Convert]::ToBase64String($bytes) | Set-Content -Path $SecretFile -NoNewline
}
$Secret = Get-Content -Path $SecretFile -Raw

Write-Host "==> Seeding example processes + per-role demo users"
Invoke-Compose exec -e SEED_ALLOW=1 -w /workspace app bun run seed

Write-Host "==> Ensuring $SuperuserEmail (all system:* roles)"
Invoke-Compose exec -w /workspace app bun run src/auth/cli.ts add-user $SuperuserEmail $SuperuserPassword $SuperuserRoles 2>$null
if ($LASTEXITCODE -ne 0) {
    Invoke-Compose exec -w /workspace app bun run src/auth/cli.ts set-roles $SuperuserEmail $SuperuserRoles
}

Write-Host "==> (Re)starting the HTTP server"
try { Invoke-Compose exec -w /workspace app pkill -f "src/http/server.ts" 2>$null } catch {}
Start-Sleep -Seconds 1
Invoke-Compose exec -d -e "AUTH_JWT_SECRET=$Secret" -w /workspace app bun run serve
Start-Sleep -Seconds 2

Write-Host "==> Confirming the stack is ready"
& (Join-Path $PSScriptRoot "preflight.ps1") serve
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Ready: http://localhost:3000/"
Write-Host "Login: $SuperuserEmail / $SuperuserPassword"
