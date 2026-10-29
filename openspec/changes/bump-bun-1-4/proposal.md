# Proposal

## Why

Dependabot PR #90 bumps `@types/bun` from 1.3.14 to 1.4.4. The runtime is Bun
1.3.11, so types for 1.4 would admit APIs the runtime lacks.
`bump-dependabot-batch-2026-10` left #90 open for a runtime upgrade.

Bun 1.4 shipped on 2026-08-20, and 1.4.4 is the current patch release. Bun
rewrote it in Rust, and its release notes list many behavior changes. The repo
is pre-1.0 and nothing runs in production. Every month on 1.3 widens the gap
the upgrade has to close.

## What Changes

- `container/Dockerfile` pins `BUN_VERSION=1.4.4`.
- `deploy/engine.Dockerfile` and `deploy/frontend.Dockerfile` build from
  `oven/bun:1.4.4-slim`.
- `package.json` declares `@types/bun` `^1.4.4`.
- `bun.lock` moves to the lockfile format Bun 1.4 writes, `lockfileVersion: 2`.
- `THIRDPARTY.md` follows the new runtime image and `@types/bun`.
- Code and tests that Bun 1.4 breaks get the smallest repair the release notes
  point to. design.md lists each one.
- The devcontainer image and the dev pod rebuild on Bun 1.4.4.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No spec names a Bun version. `development-toolchain` says only that
`BUN_VERSION` in `container/Dockerfile` pins it. This change sets
`skip_specs: true`.

## Impact

- `container/Dockerfile`, `deploy/engine.Dockerfile`,
  `deploy/frontend.Dockerfile`, `package.json`, `bun.lock`, `THIRDPARTY.md`,
  plus the source and test files design.md names after the first suite run.
- Every contributor rebuilds the devcontainer with `sh scripts/dev-pod.sh up`.
  A Bun 1.3 binary may refuse the migrated `bun.lock`.
- Merging lets Dependabot close #90 as up to date.
