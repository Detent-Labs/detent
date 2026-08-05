## Why

Ponytail audit findings 2, 5, 6, 14 and 15. All five are server-side
duplication or dead code. One change carries all five, because they share a
review and a test run. None of them changes behavior.

Finding 2 is the largest. `resolveActor`, `errorContext` and `guarded` each
stand in four copies. The four route modules are `routes.ts`,
`admin-routes.ts`, `studio-routes.ts` and `reporting-routes.ts`. `parseLimit`
stands in two. Every copy's own comment
admits it, with wording like "Same shape as routes.ts::guarded". The audit
named three of the four helpers. `errorContext` is a fourth, found while
reading the files.

The `http-route-handling-consolidation` spec already forbids two of these
duplications. Its wording covers `routes.ts` alone, so three sibling modules
grew their own copies without breaking a rule.

## What Changes

- Export `resolveActor`, `errorContext`, `guarded` and `parseLimit` from
  `routes.ts`. Delete the copies in the three sibling route modules and import
  them instead.
- Add `test/helpers/http-fixture.ts` with the `DB` flag, `authHeaders`,
  `authedReq` and the shared `beforeAll`/`beforeEach` bootstrap. Three suites
  hold that bootstrap today, copied from each other.
- Add `makeAssignmentUnresolvedEvent` beside the other event helpers. Three
  sites hand-build the same seven-field `assignment.unresolved` literal.
- Rewrite `parseRoles` over `map` and a `Set` spread. Its manual seen-`Set`
  and `push` loop restates what both already give.
- Drop the `export` keyword from `buildTransformContext` (`src/cel/eval.ts`)
  and `makeSpawnHandler` (`src/engine/subprocess.ts`). Nothing outside their
  own file reads either name.

No HTTP status, body, header or authorization changes. No engine behavior
changes. The full suite is the regression net.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-route-handling-consolidation`: the `guarded` and `resolveActor`
  requirements name `routes.ts` today. Widen both to every route module, and
  add `parseLimit` and `errorContext` to the set.

The other four findings get no requirement. They are single-file
simplifications with no mechanism worth freezing, and tests carry no spec.

## Impact

- `src/http/routes.ts`. Four helpers gain the `export` keyword. Nothing else.
- `src/http/admin-routes.ts`, `src/http/studio-routes.ts` and
  `src/http/reporting-routes.ts`. The copies go, an import arrives.
  `admin-routes.ts` also loses its `parseRoles` loop.
- `src/engine/store.ts`. One new event helper beside `newInstanceEventId`.
- `src/engine/transition.ts` and `src/engine/subprocess.ts`. Three literals
  become three calls. `subprocess.ts` also loses one `export` keyword.
- `src/cel/eval.ts`. One `export` keyword goes.
- `test/helpers/http-fixture.ts` is new. `test/http.test.ts`,
  `test/http-admin.test.ts` and `test/http-studio.test.ts` import from it.
- `openspec/specs/http-route-handling-consolidation/spec.md`. Two
  requirements widen.
- `docs/current-state.md`. One new section.
