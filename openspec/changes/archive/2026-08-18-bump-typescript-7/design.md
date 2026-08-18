## Context

See proposal.md - Why. `.devcontainer/Dockerfile` installs a pinned Bun via
`BUN_VERSION`. TypeScript itself is not pinned there, only in
`package.json` and `packages/web/package.json`. The devcontainer's
TypeScript Language Server (`typescript-language-server@5.3.0`,
npm-global) is separate from the workspace's own `typescript` dependency.
This bump does not touch it.

## Goals / Non-Goals

**Goals:**
- Verify TypeScript 7.0.2 typechecks the existing codebase (engine,
  `packages/form-ui`, `packages/web`) with zero source changes.
- Confirm the build and full test suite pass unchanged.
- Record the tooling switch as an OpenSpec change, per `CLAUDE.md`.

**Non-Goals:**
- Adopting any new TypeScript 6 or 7 language feature, or a stricter
  compiler flag. `tsconfig.json` stays as-is.
- Auditing the rest of the toolchain (Vite, Bun, Node) for compatibility.
  That is out of scope for a single dependency bump.

## Decisions

- **Verify in an isolated Docker Compose project, not the shared
  devcontainer.** The shared `workflow-engine` compose project was mid-use.
  It ran a dev server and held uncommitted work in the main worktree.

  A disposable git worktree, plus a separately named compose project
  (`detent-deptest17`), gave `bun install`, `typecheck`, `build`, and
  `test` a clean target. That target left the shared state untouched.

  It also avoided racing the shared outbox poller against the test suite.
  The team considered running on the host instead, and rejected that
  option. Every tool in this repo runs in the devcontainer, by convention,
  to avoid Bun version drift.
- **Push a lockfile-only commit on each PR branch, instead of editing
  Dependabot's commit.** Dependabot updates `package.json` only in this
  repository, not `bun.lock`. A separate lockfile commit keeps the
  PR's own commit as the attributed dependency bump. It keeps the lockfile
  fix a separate, reviewable diff.
- **No spec deltas** (`skip_specs: true`). TypeScript is a build-time tool.
  This bump changes no runtime behavior, API, or UI surface. Typecheck
  stayed byte-identical in outcome: zero errors before the bump, zero
  errors after.

## Risks / Trade-offs

- [A future TypeScript diagnostic tightens against untouched code] -> the
  existing `bun run typecheck` gate already runs on every push. This
  proposal names the change, for a future regression search to start
  from.
- [This retroactive OpenSpec change documents an already-merged PR, instead
  of gating it beforehand] -> accepted for this one instance. The gap it
  closes is procedural: apply the "tooling or infra switch" trigger before
  merging, not after.

## Migration Plan

None. The change already shipped. `typescript@7.0.2` and the regenerated
`bun.lock` sit on `main` as of PR #17's merge. A normal revert covers any
regression: `typescript` has no runtime footprint, so a revert touches
only `package.json` and `bun.lock`.
