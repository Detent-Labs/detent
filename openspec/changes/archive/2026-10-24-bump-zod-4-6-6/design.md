# Design

## Context

See proposal.md for the motivation. Two manifests pin `zod` exactly at 4.6.5:
the root `package.json` and `packages/web/package.json`.
In `packages/form-ui/package.json`, `zod` is a peer dependency. Its range is
`^4.4.3`. `bun.lock` holds one `zod` entry, so every workspace loads the
same copy. The `frozen-lockfile` gate rejects a manifest the committed lockfile
cannot satisfy.

## Goals / Non-Goals

**Goals:**

- The installed `zod` is 4.6.6, and `bun audit --audit-level=high` exits 0.

**Non-Goals:**

- A new version of any other dependency.
- A change to the peer range in `packages/form-ui/package.json`.

## Decisions

### D1: Bump the two exact pins and leave the peer range

Both exact pins move to 4.6.6. The peer range `^4.4.3` states which Zod
releases `form-ui` works with. It installs nothing, and 4.6.6 satisfies it.
Raising it would claim that `form-ui` needs the fix, which it does not.

The alternative was `bun update zod`. It could also move the peer range and
other transitive entries, which widens the diff past the advisory.

### D2: Regenerate the lockfile and the license notice with the repo's tools

`bun install` in the devcontainer rewrites the `zod` entry in `bun.lock`.
`bun run scripts/thirdparty.ts --write` regenerates `THIRDPARTY.md`, as
`CLAUDE.md` requires after any dependency change.

## Risks / Trade-offs

- [Risk] A patch release alters a parse result the definition contract relies
  on. → The full suite parses every example definition. A different result
  fails a named test.

## Migration Plan

None. A `bun install` picks the new version up. No stored state records the Zod
version.

## Open Questions

None.
