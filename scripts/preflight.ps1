# Devcontainer preflight: names the failing precondition before a developer
# meets its symptom, and prints the command that repairs it. Runs on the
# HOST (PowerShell 7+ variant of preflight.sh, for Windows systems without
# Git Bash / WSL). See openspec/specs/devcontainer-preflight
# (add-devcontainer-preflight) for the full contract.
#
# Usage: pwsh scripts/preflight.ps1 <core|serve>
#   core:  checks 1, 2, 6 -- preconditions of any work in the container.
#   serve: core plus checks 3, 4, 5 -- preconditions of a browser session.

param(
    [Parameter(Position = 0)]
    [string]$Profile
)

Set-StrictMode -Version Latest
Set-Location (Join-Path $PSScriptRoot "..")

if ($Profile -ne "core" -and $Profile -ne "serve") {
    Write-Host "Usage: preflight.ps1 <core|serve>"
    exit 2
}

$ComposeFile = ".devcontainer/docker-compose.yml"

function Invoke-Compose {
    docker compose -f $ComposeFile @args
}

function Fail {
    param([string]$Message, [string]$Repair)
    Write-Host "preflight: $Message"
    Write-Host "  $Repair"
    exit 1
}

# Check 1: the Docker daemon answers.
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "check 1 failed: the Docker daemon does not answer" `
        "Start Docker Desktop, then re-run."
}

# Check 2: every required container reports healthy.
$unhealthy = @()
foreach ($svc in @("app", "db", "mailpit")) {
    $state = (Invoke-Compose ps --format '{{.Health}}' $svc 2>$null)
    if ($state -ne "healthy") {
        $unhealthy += $svc
    }
}
if ($unhealthy.Count -gt 0) {
    Fail "check 2 failed: not healthy: $($unhealthy -join ' ')" `
        "docker compose -f .devcontainer/docker-compose.yml up -d"
}

if ($Profile -eq "serve") {
    # Check 3: the HTTP server process carries AUTH_JWT_SECRET. The
    # container environment is the wrong place to look:
    # ALLOW_INSECURE_DEV_AUTH=1 sits there on purpose, and dev-up injects
    # the secret into the server process alone.
    $serverPids = (Invoke-Compose exec -T app sh -c "pgrep -f src/http/server.ts" 2>$null) `
        -split "`n" | Where-Object { $_ -match '\S' }
    $secretFound = $false
    foreach ($serverPid in $serverPids) {
        $env = Invoke-Compose exec -T app sh -c "tr '\0' '\n' < /proc/$serverPid/environ" 2>$null
        if ($env -match '(?m)^AUTH_JWT_SECRET=') {
            $secretFound = $true
        }
    }
    if (-not $secretFound) {
        Fail "check 3 failed: no server process carries AUTH_JWT_SECRET" `
            "bash scripts/dev-up.sh"
    }

    # Check 4: every published port answers on the host.
    foreach ($port in 3000, 8025) {
        $ok = $false
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $client.Connect("127.0.0.1", $port)
            $ok = $client.Connected
            $client.Close()
        }
        catch {}
        if (-not $ok) {
            Fail "check 4 failed: port $port does not answer on the host" `
                "bash scripts/dev-up.sh"
        }
    }

    # Check 5: the development database holds its schema and its seed data.
    $defCount = (Invoke-Compose exec -T db psql -U postgres -d workflow_engine -tAc `
        "select count(*) from definitions" 2>$null)
    $superuserCount = (Invoke-Compose exec -T db psql -U postgres -d workflow_engine -tAc `
        "select count(*) from auth_users where email = 'demo-superuser@example.test'" 2>$null)
    $defCount = if ($defCount) { $defCount.Trim() } else { "0" }
    $superuserCount = if ($superuserCount) { $superuserCount.Trim() } else { "0" }
    if ($defCount -eq "0" -or $superuserCount -eq "0") {
        Fail "check 5 failed: the database holds no seed data" `
            "docker compose -f .devcontainer/docker-compose.yml exec -e SEED_ALLOW=1 -w /workspace app bun run seed"
    }
}

# Check 6: no stale codebase-memory WAL file holds a lock. Warns rather than
# blocks: the index is per-machine local state (see CLAUDE.md), and this
# lock probe detects a hold only where the OS enforces mandatory file locks.
# ponytail: Windows-only detection ceiling; Linux/macOS locks are advisory,
# so a held lock there passes silently. Upgrade if that ever costs something.
$cacheDir = Join-Path $HOME ".cache/codebase-memory-mcp"
if (Test-Path $cacheDir) {
    Get-ChildItem -Path $cacheDir -Filter "*.db-wal" -ErrorAction SilentlyContinue | ForEach-Object {
        $dbPath = $_.FullName -replace '-wal$', ''
        try {
            $fs = [System.IO.File]::Open($dbPath, 'Open', 'ReadWrite', 'None')
            $fs.Close()
        }
        catch {
            Write-Host "preflight: check 6 warning: $dbPath is locked by another process"
            Write-Host "  Close whatever holds codebase-memory-mcp's index, then re-run."
        }
    }
}

Write-Host "preflight ($Profile): all checks passed"
