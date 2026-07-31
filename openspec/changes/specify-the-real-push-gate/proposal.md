## Why

`openspec/specs/development-toolchain/spec.md:136` requires the repository to
carry an automated workflow that runs on every push and every pull request.
No such workflow exists. Commit `07b9a05` deleted it, and said why. The owner
does not want a hosted service executing this repository. The repository had
Actions turned off anyway. The file therefore "claimed a gate that no longer
ran".

The same commit added `.githooks/pre-push`, which runs `bun run check` inside
the devcontainer. No requirement covers that hook. A search across
`openspec/specs/` for `pre-push` or `githooks` returns nothing.

So the spec describes a gate the repo does not have, and omits the one it
does. Both halves mislead. The commit message argued that a dormant workflow
file is worse than none, because it reads as coverage. A dormant requirement
reads the same way. This one outlived the file by two changes.

## What Changes

- The gate requirement describes `.githooks/pre-push`: what it runs, where it
  runs, and what it refuses to do.
- The parts that were load-bearing survive the move. The typecheck stays its
  own step, because Bun does not typecheck. The run still fails rather than
  proceeds when `DATABASE_URL` is unset, because the DB-backed suites skip
  silently without it.
- The parts that were CI-only go. There is no pull-request trigger, no
  frozen-lockfile install step, and no runner that needs its Bun version
  pinned separately. The hook executes in the devcontainer, whose Bun the
  Dockerfile already pins.
- **BREAKING** for readers, not for code: a requirement that mandated a
  workflow file now mandates a hook. Nothing in the repository changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: the requirement at `spec.md:136` moves to the gate
  that exists. Four new scenarios take the place of its old ones, each one a
  reader can check against `.githooks/pre-push`.

## Impact

- `openspec/specs/development-toolchain/spec.md`: one requirement and its
  scenarios.
- `docs/current-state.md`: the entry describing the gate, if it still names a
  workflow.
- No code changes. `.githooks/pre-push` already behaves as the new
  requirement describes; this change writes down what it does.
