# Proposal

## Why

Development moved to an Arch Linux machine on 2026-10-20, and no Windows host
remains. The repository still carries code and rules that exist only for a
Windows host:

- two PowerShell entry points that delegate to the shell scripts;
- README lines that send a contributor to Git Bash;
- CLAUDE.md wording that ties a permission-analyzer convention to Windows,
  plus one rule only Cygwin needs;
- two rationales that justify a still-valid rule with a Windows-only cause.

Each of these costs a reader time and states something false about this host.

## What Changes

- **BREAKING** Delete `scripts/dev-up.ps1` and `scripts/preflight.ps1`. A
  Windows host has no supported entry point afterwards.
- `README.md` drops the PowerShell and Git Bash sentences from the bring-up
  section.
- `CLAUDE.md` keeps its permission-analyzer convention with a
  platform-neutral lead-in. It drops the Windows framing and the Cygwin
  sub-rule, which was the only Windows-specific one. CLAUDE.md also drops
  the MSYS clause from the whitespace-gate explanation.
- The `127.0.0.1`-not-`localhost` rule stays, with a reason that holds on
  this host. The bring-up publishes every port on the IPv4 loopback address
  alone, and `localhost` can resolve to `::1` first, where nothing listens.
  The rule changes in `docs/browser-checks.md`, in the CORS comment in
  `scripts/dev-pod.sh` and in two `development-toolchain` requirements.
- Out of scope, kept on purpose:
  - Preflight check 6, the WAL lock probe, including its Windows branch.
    Removing it changes the check count that `devcontainer-on-podman`
    introduces, so it gets its own change once that one archives.
  - The Windows path spellings in the `no-machine-paths` gate. They guard
    the repository's content, not the host.
  - The CR check in the whitespace gate and `.gitattributes`' `eol=lf`.
  - Portability notes inside gate scripts.
  - Measurement records that name the browser and OS of the measurement.
  - The generated `openspec-onboard` skill.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `devcontainer-preflight`: the change removes the two requirements about
  the PowerShell delegators. The idempotency rule one of them carried
  survives as a requirement of its own.
- `development-toolchain`: two requirements justify the `127.0.0.1` address
  by the loopback binding instead of by Windows:
  - "The devcontainer permits every frontend dev origin"
  - "The manual checklist states its address and its one conflict"

## Impact

- Deleted: `scripts/dev-up.ps1`, `scripts/preflight.ps1`.
- Docs: `README.md`, `CLAUDE.md`, `docs/browser-checks.md`.
- Comment: `scripts/dev-pod.sh`.
- Ordering: stacks on `rename-devcontainer-dir`. The manual-checklist delta
  targets the text `devcontainer-on-podman` leaves behind, so this change
  archives after both.
