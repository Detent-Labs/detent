# Proposal

## Why

`docs/browser-checks.md` holds over 5200 lines of manual checks, and the
repository has no end-to-end test. Three defects shipped past a green suite.
The first was a dialog behind a modal. The second was a stale result row. The
third was an `/admin/*` route collision.

Stale UI state after a mutation recurs, and no gate covers it. The file `docs/decisions.md` entry 51 defers a query cache
until that class recurs. Today a recurrence reaches `main` before anybody
notices it.

## What Changes

- Add `@playwright/test` as a root devDependency, and a `bun run e2e` script.
- Add a smoke suite under `e2e/` with four flows:
  - A login, then `/app`, `/admin`, `/studio` and `/reporting` each load with no
    error boundary.
  - In the app area, a participant starts a process and completes its task.
    My tasks then drops the row.
  - In the admin area, an operator cancels an instance. The list row shows the
    new status with no reload.
  - In the studio, a developer publishes a seeded draft. Versions shows the new
    version, and no dialog sits behind a modal.
- The suite starts the engine against the production web build. The engine
  takes an ephemeral port and a database of its own, `<name>_e2e`. The suite
  never drives the `_test` database.
- Add a third job, `e2e`, to `.github/workflows/check.yml`. It runs on every
  push and every pull request, in parallel with `check`.
- The browser-check split rule in `development-toolchain` gains a third home.
  A repeating check that needs a real page becomes a smoke test. Every
  checklist entry the suite covers leaves `docs/browser-checks.md`.
- Regenerate `THIRDPARTY.md`.
- `playwright-cli` stays the tool for manual checks. Entry 51 stays deferred.

## Capabilities

### New Capabilities

- `browser-smoke-suite`: the committed Playwright suite. It covers what the
  suite runs against, its database, its port, its flows and its CI job.

### Modified Capabilities

- `development-toolchain`: its browser-check split rule gives a check three
  homes instead of two. A check that needs a real page and guards a recurring defect becomes a smoke
  test.

## Impact

- New files: `e2e/*.e2e.ts`, `playwright.config.ts`, `scripts/e2e.ts`.
- Changed files: root `package.json`, `bun.lock`, `THIRDPARTY.md`,
  `.github/workflows/check.yml`, `docs/browser-checks.md`, `.gitignore`.
  `.gitignore` gains Playwright's report and result directories. The root
  `tsconfig.json` gains `e2e`. `README.md`, `CLAUDE.md` and possibly
  `docs/current-state.md` gain a line each.
- CI: one more job per push and per pull request. It downloads Chromium and
  adds several runner minutes, in parallel with `check`.
- No engine, schema or definition contract change, and no change under `src/`.
