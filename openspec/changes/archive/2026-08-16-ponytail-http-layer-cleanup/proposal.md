## Why

`PONYTAIL-AUDIT.md`'s 2026-08-16 scan groups findings 16, 26, 27 and 30 as
one HTTP change. A grep sweep over `src/http`, `test` and `openspec/specs`
confirms two of the four. It disqualifies the other two.

Finding 16 holds. It is larger than the audit measured. Finding 30 holds.
Both are internal refactors inside `src/http`. Each keeps the same request,
the same status, the same error message and the same body.

Findings 26 and 27 do not hold. This change corrects the audit, so the next
scan does not re-propose them.

Finding 39 is a grouped list of small pairs. Three of its entries sit in
`src/http`, in the same four files this change already opens. The audit files
them as ride-alongs, under "small enough to ride along with whatever touches
their files next". This is that carrier. A grep sweep confirms one of the
three and disqualifies the other two.

## What Changes

- Move `readJson` from `src/http/admin-routes.ts` into `src/http/routes.ts`
  and export it, beside `resolveActor`, `guarded` and `parseLimit`
  (finding 16). The three sibling route modules already import from there.
- Replace eleven hand-copied
  `try { await req.json() } catch { throw new RequestShapeError(...) }`
  blocks with a `readJson` call. Six sit in `admin-routes.ts`, three in
  `studio-routes.ts`, one in `account-routes.ts`, one in `routes.ts`. The
  audit counted ten and missed `routes.ts:455`.
- Collapse the same block inside `routes.ts`'s own `parseJsonBody` onto a
  `readJson` call. `parseJsonBody` keeps its zod parse and its second
  `RequestShapeError`. Only the JSON-decode half moves.
- Rewrite the four-property check in `parseAuthIssuers` over a zod schema
  (finding 30). It sits in `src/http/server.ts`. `zod` is a direct
  dependency. `routes.ts` in this same layer already parses request bodies
  with it. Both throws stay throws. Both messages still name `AUTH_ISSUERS`
  and the offending entry.
- Merge `admin-routes.ts::parseVersionField` and
  `studio-routes.ts::parseVersion` into one exported
  `parseVersion(raw: unknown, label: string)` in `routes.ts` (finding 39).
  The two bodies agree line for line. Only the parameter type differs,
  `unknown` against `string`, and `unknown` admits both callers. Nine call
  sites keep the name they read today: two in `admin-routes.ts`, seven in
  `studio-routes.ts`.
- Correct `PONYTAIL-AUDIT.md`. Move finding 26 and finding 39's two declined
  `src/http` entries to "Checked, not flagged (deliberate, per CLAUDE.md)".
  Attach the measurement that disqualifies each. Re-measure finding 16 from
  ten sites to eleven. Record findings 16 and 30 as resolved, and finding
  39's `src/http` third as landed. design.md carries the evidence.

Findings 26 and 27 do not land, and neither do two thirds of finding 39's
`src/http` entries:

- Finding 26 asks for one `requireAnyRole` over `requireDataListRead`,
  `requireAuthoring` and `requireStudioRead`. `studio-routes.ts:54-55`
  carries a comment rejecting exactly that. `:68-69` binds
  `requireStudioRead` to the same rule by reference. The three also raise
  three different messages. Each names its own role set.
- Finding 27 asks to delete `BINARY_ROUTES`.
  `openspec/specs/http-wrapper/spec.md:1491` is a requirement naming it.
  `test/http-disposition.test.ts` drives every entry. The sibling change
  `ponytail-cut-unreachable-code` lands that correction in its own
  tasks.md:116. This change does not repeat it.
- Finding 39 asks to merge `requireNonBlank` (`admin-routes.ts:191`) and
  `requireString` (`admin-routes.ts:430`) as a pair differing by a length
  bound. They differ by more. `requireNonBlank` rejects a blank string. It
  returns the untrimmed value. `requireString` rejects an empty one and
  bounds its length. Their messages differ too, `must not be empty` against
  `is required`. Merging changes what two route families reject.
- Finding 39 asks to inline `resolveActor(req, resolver, db)`, whose body is
  `resolver(req.headers, db)`. It has 60 call sites in `src`. Inlining
  rewrites all 60 to delete three lines, and the `dedup-server-helpers`
  change created the helper on purpose. Its own comment records that.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-route-handling-consolidation`: two ADDED requirements, "JSON
  request-body decoding has one implementation" and "Version-number parsing
  has one implementation". That capability carries one requirement per
  shared plumbing helper in `routes.ts`, and `readJson` and `parseVersion`
  join the set. Without them the spec would govern four helpers and leave
  two unnamed. A later route module could then copy either block again.

Finding 30 needs no delta. `parseAuthIssuers` keeps its signature, its
return type and its throw-on-malformed behavior. No spec names its internal
check.

## Impact

- `src/http/routes.ts`: gains an exported `readJson` and an exported
  `parseVersion`. `parseJsonBody` and one route handler call `readJson`.
- `src/http/admin-routes.ts`: loses its private `readJson` and its private
  `parseVersionField`, imports the shared pair. Six blocks collapse. Two
  call sites take the new name.
- `src/http/studio-routes.ts`, `src/http/account-routes.ts`: import
  `readJson`. Four blocks collapse. `account-routes.ts:123` keeps its
  object guard. `studio-routes.ts` loses its private `parseVersion` and
  imports the shared one. Its seven call sites read unchanged.
- `packages/web/src/areas/admin/screens/migrationsLogic.ts:5`: a comment
  names `parseVersionField`. It names `parseVersion` after this change. No
  code there changes.
- `src/http/server.ts`: `parseAuthIssuers` rewritten over a zod schema. One
  `import { z } from "zod"` added.
- `openspec/specs/http-route-handling-consolidation/spec.md`: two deltas.
- `docs/current-state.md`: the shared-helper passage at :3165-3178 names
  `resolveActor`, `errorContext`, `guarded` and `parseLimit` one by one.
  `readJson` and `parseVersion` join that list. The passage states no count,
  so none goes in.
- `PONYTAIL-AUDIT.md`: finding 26 and two of finding 39's `src/http` entries
  moved, finding 16 re-measured, findings 16 and 30 recorded as resolved
  with finding 39's `src/http` third.
- No dependency change. No new source file. No route added or removed.
