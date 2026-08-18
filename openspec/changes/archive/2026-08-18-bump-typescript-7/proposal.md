## Why

Dependabot opened PR #17. It bumps `typescript` version 5.6.2 to version
7.0.2: a major jump in the compiler, not a library.

`CLAUDE.md` names a "tooling or infra switch" as a trigger for an OpenSpec
change. That trigger applies even when no capability's behavior changes.

This proposal records that switch after the fact. The team verified
`typecheck`, `build`, and the full `bun test` suite green in an isolated
devcontainer, then merged the PR. The OpenSpec cycle got skipped in the
moment. This proposal closes that gap for the record.

## What Changes

- `typescript` moves from `5.6.2` to `7.0.2` in `package.json` (engine) and
  in `packages/web/package.json`.
- `bun.lock` regenerates to match: 43 lines changed, transitive resolution
  only, no new direct dependency.
- No source file changes. `tsc --noEmit` passes unmodified against the new
  compiler, across the engine, `packages/form-ui`, and `packages/web`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a compiler-tooling version bump. Type-checking behavior
against the existing codebase stayed the same, and no runtime code changed.
Per `.openspec.yaml`, `skip_specs: true`: no spec describes behavior here,
because none changed.

## Impact

- **Affected files**: `package.json`, `packages/web/package.json`,
  `bun.lock`.
- **Affected systems**: local dev typecheck (`bun run typecheck`), the CI
  push gate (`.githooks/pre-push`), and the devcontainer's pinned
  toolchain.
- **Verification performed**: `bun install`, `bun run typecheck`, `bun run
  build`, and the full `bun test` suite (2741 pass, 0 fail, 1 unrelated
  skip). All four ran in an isolated Docker Compose project
  (`detent-deptest17`) cloned from the PR branch. The shared devcontainer
  and the main working tree stayed untouched. The repository's own
  pre-push hook re-ran the same suite on push and passed.
- **Risk**: low in practice, since verification passed. A major compiler
  bump can still shift inference or tighten diagnostics in code this PR
  did not touch. This proposal flags that risk so a future regression
  search starts from this change.
