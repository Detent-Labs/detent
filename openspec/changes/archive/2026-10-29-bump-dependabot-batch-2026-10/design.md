# Design

## Context

See proposal.md. Today's state:

- `.github/dependabot.yml` holds `bun` entries for `/`, `/packages/form-ui` and
  `/packages/web`, plus one `github-actions` entry, each on a weekly schedule.
- `test/gates.test.ts` reads that file through `dependabotProblems`. That
  function wants a `bun` entry for each member of `BUN_DIRECTORIES`. Those are
  `/`, `/packages/form-ui` and `/packages/web`. It rejects any `npm` entry and
  wants a `github-actions` entry. `DEPENDABOT_FIXTURES` mutates the real file
  once per rule.
- `bun.lock` locks the versions in the table below.
- `packages/web` and `packages/form-ui` both declare the four React packages at
  `^19`.
- `packages/web` declares `@vitejs/plugin-react` `^6`, `vite` `^8.3.4`,
  `@dagrejs/dagre` `^3.1.1`, and `lucide-react` at exactly `1.50.0`.
- The root declares `@playwright/test` `^1.63.0` and `@types/bun` `^1.3.14`.

| Package | Locked | Target | Manifest change |
|---|---|---|---|
| `react`, `react-dom` | 19.2.8 | 19.3.1 | none (`^19`) |
| `@types/react` | 19.2.18 | 19.3.0 | none (`^19`) |
| `@types/react-dom` | 19.2.4 | 19.3.0 | none (`^19`) |
| `@vitejs/plugin-react` | 6.0.5 | 6.1.2 | none (`^6`) |
| `vite` | 8.3.4 | 8.3.5 | `^8.3.5` |
| `@dagrejs/dagre` | 3.1.1 | 3.1.3 | `^3.1.2` |
| `lucide-react` | 1.50.0 | 1.61.0 | `1.61.0` (exact) |
| `@playwright/test` | 1.63.0 | 1.64.1 | `^1.64.1` |

The target column holds the versions the open Dependabot pull requests name.
The one exception is `@dagrejs/dagre`. Pull request #92 names 3.1.2, and the
install resolved the newer patch 3.1.3 inside `^3.1.2`.

## Goals / Non-Goals

**Goals:**

- Every Dependabot `bun` pull request carries its `bun.lock` change.
- `react` and `react-dom` arrive in one pull request.
- The seven open bumps land in one verified branch.

**Non-Goals:**

- `@types/bun` 1.4 (#90). `container/Dockerfile`, `deploy/engine.Dockerfile`
  and `deploy/frontend.Dockerfile` pin Bun 1.3.11. A Bun 1.4 runtime
  bump is its own change, and `@types/bun` follows it there.
- A newer version than a Dependabot pull request names. Dependabot opens the
  next one on its own schedule.
- One group for every package. Unrelated bumps then fail together, and one bad
  release blocks the rest.

## Decisions

### D1. One root `bun` entry

The root job reaches `packages/*` already. It opened #50, #51 and #93 for
packages only `packages/web` and `packages/form-ui` declare. #51 changed
`bun.lock` correctly. The member jobs opened #89, #91 and #92, each a manifest
change with no lockfile change. Removing the member entries keeps the coverage
and drops the broken path.

`BUN_DIRECTORIES` becomes `["/"]`. `dependabotProblems` adds one rule: a `bun`
entry whose directory is not `/` is a problem named
`a bun entry for <directory>`. The two fixtures that delete a member entry
become one fixture that adds a `/packages/web` entry and expects that message.

### D2. A `react` group on the root entry

```yaml
    groups:
      react:
        patterns:
          - "react"
          - "react-dom"
          - "@types/react"
          - "@types/react-dom"
```

React refuses to run with `react` and `react-dom` at different versions. The
two type packages follow them. `dependabotProblems` adds one rule: the root
`bun` entry holds a group whose `patterns` include all four names. The message
is `no group holds react, react-dom, @types/react and @types/react-dom`. A
fixture deletes the group and expects it. The `Update` type in the test gains
an optional `groups` record.

The rule runs only when a root `bun` entry exists. Without one, "no bun entry
for /" already reports it. `expectProblems` compares the whole list. The fixture
"an npm entry in place of the root bun entry" therefore keeps its two expected
messages.

### D3. Bump through the devcontainer, then regenerate the notice

The four rows with a manifest change get it first. Then `bun update` with the
five lock-only package names moves those rows inside their ranges. A
`bun install` settles the rest. Both run in the devcontainer. A range that
`bun update` rewrites in a manifest goes back to its old text. The lock moves,
and the ranges stay.
`bun run scripts/thirdparty.ts --write` regenerates `THIRDPARTY.md`, as
`CLAUDE.md` requires after a dependency change.

### D4. The CI e2e job is the browser check

React, `lucide-react`, `vite` and `dagre` reach the browser. The change moves
no screen, so `docs/browser-checks.md` gains no entry. The CI `e2e` job drives
the built app through Playwright 1.64.1 and stands as the browser check. A
renamed `lucide-react` export fails `bun run typecheck` before that.

## Risks / Trade-offs

- [React 19.3 changes a rendering detail no test sees] → The form-ui and web
  tests render through React. The CI `e2e` job drives the built app. A visual
  regression outside both stays possible.
- [The root job skips a package only a workspace declares] → #51 shows the
  root job bumping a package only `packages/web` declares. A member entry
  cannot fix a later gap, because a member job has no path to `bun.lock`.
- [#90 stays open and red] → It waits for the Bun 1.4 change. Closing it by
  hand loses nothing; Dependabot reopens it weekly.

## Migration Plan

1. Implement and verify on `bump-dependabot-batch-2026-10`, sync, archive.
2. Push, open the pull request, merge on green CI.
3. Dependabot closes the superseded pull requests on its next run.
4. Rollback: revert the merge.

## Open Questions

None.
