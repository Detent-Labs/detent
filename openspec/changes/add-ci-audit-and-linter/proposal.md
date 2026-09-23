# Proposal

## Why

Two review findings in `docs/decisions.md` stay open. DEP-2: CI runs no
dependency audit, so an advisory that Dependabot misses waits for a manual
look. CQ-1: the repository runs no linter. It still carries 86
`eslint-disable` directives in its code, and each one suppresses nothing.

On 2026-09-23 the owner asked for both as one change, "CI um zwei Zeilen
erweitern".

## What Changes

- A new `lint` script runs `oxlint` over `src`, `packages`, `test` and
  `scripts`. It fails on any warning and on any unused disable directive.
- `bun run check` runs `lint` first. The pre-push hook and CI both run
  `check`, so both lint with no step of their own.
- The CI `check` job runs `bun audit --audit-level=high` in the
  devcontainer. A high or critical advisory fails the job. An advisory with
  no fix gets an `--ignore <id>` with a comment that states the reason.
- The 86 dead directives go. The 27 warnings oxlint 1.85.0 reports on
  today's tree get fixed, so the linter lands green.
- `oxlint` becomes a pinned root dev dependency. `THIRDPARTY.md` gets
  regenerated.
- The `development-toolchain` spec loses a stale clause. It still says the
  repository has no hosted-CI workflow, but `add-ci-workflow` shipped
  `.github/workflows/check.yml` and left the clause in place.
- CQ-1 and DEP-2 in `docs/decisions.md` get marked resolved.

Out of scope: DEP-1 (SAST and secret scanning). It gets its own change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: the push requirement adds the lint step and
  replaces the no-hosted-CI clause with what CI runs. Two ADDED
  requirements state the lint rule and the CI dependency audit.

## Impact

- `package.json` (`lint` script, `check` script, `oxlint` dev dependency),
  `bun.lock`, `THIRDPARTY.md`.
- `.github/workflows/check.yml`: one new audit step.
- About 30 source and test files lose directives or get a one-line warning
  fix. No runtime behavior changes.
- `CLAUDE.md`: the Verification passage names what `bun run check` runs.
- `docs/decisions.md`: CQ-1 and DEP-2 marked resolved.
- `README.md`, `ROADMAP.md` and `docs/current-state.md`: the passages that
  list what `check` and CI run name the lint step and the audit step.
- `.githooks/pre-push` already runs `bun run check`, so its logic stays. Its
  header comment names the steps and gets `lint` added.
