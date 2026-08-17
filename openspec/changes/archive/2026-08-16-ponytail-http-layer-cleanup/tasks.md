## 1. The shared JSON-decode seam

- [x] 1.1 Move `readJson` from `admin-routes.ts:422` into `routes.ts`, beside
      `resolveActor`. Export it. Keep its signature.
- [x] 1.2 Call it from `parseJsonBody` (`routes.ts:115`). Keep the zod half.
- [x] 1.3 Collapse `routes.ts:455` onto `readJson`.
- [x] 1.4 Import `readJson` in `admin-routes.ts`. Collapse its six sites:
      lines 169, 215, 263, 292, 335, 381.
- [x] 1.5 Import `readJson` in `studio-routes.ts`. Collapse lines 100, 231, 333.
- [x] 1.6 Import `readJson` in `account-routes.ts`. Collapse line 117.
- [x] 1.7 Keep `account-routes.ts:123`'s object guard. Comment that `readJson`
      types the body as an object and does not check it.
- [x] 1.8 Keep each collapsed site's existing `as` cast, per design.md.

## 2. The shared version-parse seam

- [x] 2.1 Move `studio-routes.ts:42`'s `parseVersion` into `routes.ts`, beside
      `readJson`. Export it. Widen `raw` to `unknown`.
- [x] 2.2 Delete `admin-routes.ts:48`'s `parseVersionField` and its
      cross-reference comment. Import `parseVersion`. Rename its two call
      sites (lines 388, 389).
- [x] 2.3 Import `parseVersion` in `studio-routes.ts`. Its call sites
      (lines 183, 209, 210, 229, 230, 248) keep the name they read today.
- [x] 2.4 Point `packages/web/src/areas/admin/screens/migrationsLogic.ts:5`'s
      comment at `parseVersion`. No code changes there.

## 3. `parseAuthIssuers`

- [x] 3.1 Add `import { z } from "zod"` to `server.ts`.
- [x] 3.2 Replace the four-property check with a `safeParse` over the array
      schema in design.md. Keep the `JSON.parse` try/catch.
- [x] 3.3 Read the first error's `path[0]` for the entry index in the throw.
- [x] 3.4 Confirm `test/auth-server.test.ts:77-82` still passes. All three
      inputs must throw.

## 4. Spec delta

- [x] 4.1 Apply `specs/http-route-handling-consolidation/spec.md`: the two
      ADDED requirements, for `readJson` and for `parseVersion`.
- [x] 4.2 Confirm the five scenarios under them hold against the code.

## 5. Documents

- [x] 5.1 In `PONYTAIL-AUDIT.md`, move finding 26 to "Checked, not flagged
      (deliberate, per CLAUDE.md)" with its measurement.
- [x] 5.2 Move finding 39's `requireNonBlank`/`requireString` and
      `resolveActor` entries to the same section, each with the measurement
      in design.md. Leave the rest of finding 39 to the two open changes
      that carry it.
- [x] 5.3 Re-measure finding 16 at eleven sites.
- [x] 5.4 Add a "Resolved from the 2026-08-16 scan" entry for findings 16
      and 30 and for finding 39's `parseVersion` entry.
- [x] 5.5 Drop findings 16, 26 and 30 from the consolidation paragraph near
      the file's end. Leave finding 27 to `ponytail-cut-unreachable-code`.
- [x] 5.6 Add `readJson` and `parseVersion` to the shared-helper list at
      `docs/current-state.md:3165-3178`. That passage names `resolveActor`,
      `errorContext`, `guarded` and `parseLimit` one by one. It states no
      count, so do not write one.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`. Report what it printed.
- [x] 6.2 Run `bun run build`. Report what it printed.
- [x] 6.3 Run the full `bun test` with `DATABASE_URL` set. Report the pass
      and skip counts.
- [x] 6.4 Run the antislop linter over every Markdown file this change
      touched.
- [x] 6.5 Run `git diff --check` and `git ls-files --eol` for CRLF.
