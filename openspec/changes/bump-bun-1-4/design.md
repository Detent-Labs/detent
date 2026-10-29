# Design

## Context

See proposal.md. Bun 1.3.11 stands in four places:

- `container/Dockerfile`: `ENV BUN_VERSION=1.3.11`, which the install script
  reads. `scripts/dev-pod.sh up` builds the app image from this file, locally
  and in both CI jobs.
- `deploy/engine.Dockerfile` and `deploy/frontend.Dockerfile`:
  `FROM docker.io/oven/bun:1.3.11-slim`. The engine file's comment says to bump
  both with `BUN_VERSION`.
- `THIRDPARTY.md`: the row for `oven/bun:1.3.11-slim`.

The tag `oven/bun:1.4.4-slim` exists on Docker Hub since 2026-10-22.
`bun.lock` holds `"lockfileVersion": 1`, and `@types/bun` locks at 1.3.14.

The Bun 1.4 release notes (`bun.com/blog/bun-v1.4`, "Upgrading to 1.4" and the
lists after it) name these changes that can reach this repo:

- `bun.lock` becomes `lockfileVersion: 2`. A v1 lockfile loads, and
  `bun install` migrates it.
- `Bun.YAML` follows YAML 1.2. `test/gates.test.ts` parses the CI workflow and
  `dependabot.yml` with it.
- `toContain()` compares with `===` instead of `Object.is`.
- `Bun.serve` answers `400` to more malformed framing. A status outside 100 to
  999 goes to `error()`.
- `Bun.sql` decodes Postgres `infinity` as `Infinity`, and `.simple()`
  `timestamp` values as UTC. A second auth request fails.
- With `"jsx": "react-jsx"` the runtime imports `jsx`/`jsxs`.
- `jest.resetAllMocks()` resets implementations too.
- Warnings print in the Node format.

## Goals / Non-Goals

**Goals:**

- One Bun version, 1.4.4, in the devcontainer, CI and both deploy images.
- `@types/bun` matches that runtime.
- Every gate stays green on 1.4.4 without a weakened check.

**Non-Goals:**

- Adopting a 1.4 feature, such as `bun test --parallel` or the isolated linker.
- Raising the skip floor or lowering the pass floor to absorb a 1.4 failure.
  A failing test gets a repair or a ruling, never a skip.

## Decisions

### D1. Pin 1.4.4 everywhere in one change

The four pins move together, as the engine Dockerfile's comment demands. A
split would let CI and the deploy image run different runtimes.

### D2. Migrate the lockfile with the new runtime

After the devcontainer rebuild, `sh scripts/dev-exec.sh bun install` rewrites
`bun.lock` to `lockfileVersion: 2` and locks `@types/bun` 1.4.4. The task
checks that no other locked version moves. The `frozen-lockfile` gate then
runs against the migrated file.

### D3. Repair what breaks, smallest change first

The first full suite on 1.4.4 lists the failures by name. Each one gets the
smallest repair that the matching release-note item points to. The
implementer records each repair here, under "Repairs", in one line: test or
file, cause, fix. A failure no release-note item explains stops the task as
BLOCKED for a ruling.

### D4. The CI e2e job is the browser check

The runtime builds the web bundle and serves it. The CI `e2e` job drives the
built app through Playwright on 1.4.4. No screen moves, so
`docs/browser-checks.md` gains no entry.

## Repairs

None yet. Task 2.3 fills this list.

## Risks / Trade-offs

- [The summary format of `bun test` changes] → The `no-silent-green` gate
  rejects a summary it cannot read. The push then fails loudly. The repair
  belongs in this change, in `scripts/gates/silent-green.sh`, with a fixture.
- [A Rust-port regression hits a path no test covers] → The suite covers the
  engine and the HTTP layer. The CI `e2e` job covers the built app. A gap
  outside them stays possible until a later run finds it.
- [A contributor on an old devcontainer cannot read `bun.lock` v2] → One
  machine runs this repo, and the rebuild is one command.

## Migration Plan

1. Rebuild the devcontainer on the branch, migrate, repair, verify.
2. Archive, push, merge on green CI. With `skip_specs` there is nothing to sync.
3. Rollback: revert the merge, then `sh scripts/dev-pod.sh up` rebuilds 1.3.11.

## Open Questions

None.
