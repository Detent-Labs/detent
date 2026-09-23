# Proposal

## Why

Eight security findings from the 2026-08-18 code review sit in
`docs/decisions.md` as open entries. None carries a verdict, so none has a
consequence. On 2026-09-23 the owner gave each one a verdict before 1.0.
This change records those verdicts. It also records the deployment rule
that two of them depend on.

## What Changes

- `docs/decisions.md` records one verdict per finding, with its reason.
  - Build before 1.0: SEC-2 (password floor), SEC-3 (self-rotation), SEC-5
    (shared login limiter), SEC-6 (per-instance attachment ceiling) and SEC-9
    (a role removal reaches an issued token). Each entry moves to "Decided,
    not yet built" and names the follow-up change that builds it.
  - Accepted: SEC-4 (token in `localStorage`), SEC-8 (echoed `contentType`)
    and SEC-10 (development defaults). Each entry moves to a new "Accepted
    risks" section and states why.
- `docs/runbooks/deployment.md` states that a tenant may run more than one
  engine process. A process keeps one piece of state in its own memory: the
  login rate-limit windows. The runbook names it, and says what a second
  process does to it. It also says that one process finishes startup before
  the others start.
- No code changes. Four follow-up changes build the five build verdicts:
  `password-floor-and-self-rotation` (SEC-2 and SEC-3),
  `postgres-login-rate-limit` (SEC-5), `instance-attachment-byte-ceiling`
  (SEC-6) and `live-roles-for-local-tokens` (SEC-9).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment-runbook`: the runbook states how many engine processes a tenant
  may run. It also names the state a process keeps only in its own memory.

## Impact

- Documentation only: `docs/decisions.md`, `docs/runbooks/deployment.md`.
- Four untracked briefs under `tmp/briefs/`, one per follow-up change.
- The sibling worktree `add-publish-cycle-check-and-cel-deadline` covers SEC-1
  and SEC-7. It edits the same `docs/decisions.md` section. The two branches touch
  neighbouring lines, so the second merge resolves a conflict there.
