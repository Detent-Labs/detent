## Context

See proposal.md for motivation. This section carries only the measurements
the decisions below rest on. Every one comes from a grep sweep over
`packages/web/src`, `packages/web/test` and `packages/form-ui` on 2026-08-16.

`packages/web/src/areas/studio/draft/store.tsx` holds the draft reducer.
`produce` appears once, in the `mutate` case at line 50. Two files import a
type from `immer`: `store.tsx` and `draft/draft-array-crud.ts`, both as
`import type { Draft as Immer }`. Each holds two `Immer<Draft>` positions.
One further file names the package in prose, `panels/ActionListEditor.tsx:29`.
The manifest entry sits at `packages/web/package.json:16`.

The `mutate` recipes are the blast radius. There are 23 of them across ten
files. Every one carries a block body and returns nothing, so none relies on
immer's return-value-replaces-the-draft rule. No file under
`packages/web/test` imports `draft/store`.

`Draft` is `DraftOf<AuthoredProcessBody>` (`draft/types.ts`). `DraftOf<T>`
maps every property of `T`, and every nested property through arrays and
plain objects, to optional. It declares no `readonly` anywhere.

`reducer`, `ReducerState` and `Action` carry a comment naming
`draft-store-reducer.test.ts` as the reason for their `export`. A glob over
`packages/web/test` returns no such file. A grep for the three names across
`packages/web/src` and `packages/web/test` returns only `store.tsx` itself,
plus three unrelated comment lines in `screens/draftToolbarState.ts`.

Two `describeError` declarations take a status, and neither reads it. Both
name the parameter `_status`: `areas/admin/errors.ts:17` and
`areas/studio/errors.ts:16`. The app and reporting declarations take no
status at all.

Nine call sites pass a status. Three sit in `src`: `admin/errors.ts:59`,
`studio/errors.ts:79` and `studio/screens/PlayerScreen.tsx:81`. Six sit in
`packages/web/test/errors.test.ts`, at lines 61, 80, 92, 93, 99 and 126. All
six reach the admin declaration through the alias `describeAdminError`. The
one studio call there, line 114, passes no status.

`areas/reporting/api/client.ts:6` re-exports `AppClientError` under the name
`ReportingClientError`. Three sites read the alias: `reportingLogic.ts:5,138`
and `test/reporting-reportingLogic.test.ts:20,182`.

`areas/app/api/client.ts:6-25` declares `listMyTasks` and `listStartedByMe`.
Their bodies agree except for the `scope` value, `"mine"` against
`"started"`. Four sites call them: `TasksScreen.tsx:45,61` and
`StartedScreen.tsx:40,56`.

## Goals / Non-Goals

**Goals:**

- Remove one runtime dependency from `packages/web` and keep the draft
  reducer's observable behavior identical.
- Remove the duplication in finding 39's four `packages/web` entries that a
  grep sweep confirms.
- Leave `PONYTAIL-AUDIT.md` in a state where the next scan does not re-file
  the three declined entries.

**Non-Goals:**

- The other web findings the audit groups as one change, 13, 14, 17 and 33.
  Each reaches many files and needs its own measurement pass.
- Any change to what a user sees, to a route, to a request or to a response.
- Any change to test coverage. Every existing test keeps running, and this
  change adds none.

## Decisions

### 1. `structuredClone` over `produce`, not over a hand-written spread

`produce(state.draft, recipe)` runs the recipe against a proxy. It returns a
new object sharing every subtree the recipe left alone. The replacement owes
the recipe a mutable object it may write freely. It then owes the reducer an
object React has not already rendered.

`structuredClone` does both in one call. Bun and every browser the package
targets carry it as a global. The `Draft` type holds JSON-shaped values
alone. The clone algorithm handles those: no function, no class instance,
no `Symbol` key.

One alternative is a per-recipe spread, touching only the level each recipe
writes. That means rewriting every call site of `mutate`. The file
`draft-array-crud.ts` alone wraps three of them. It trades one line for many.
It also gives up the one-way-to-change-the-draft rule that `useDraft`'s
comment states.

A second alternative is `JSON.parse(JSON.stringify(draft))`. It has the same
shape and runs slower. It also turns an `undefined` member into a missing
key, and `Draft` carries optional members throughout.

### 2. The lost structural sharing gets a `ponytail:` marker

`produce` shares an untouched subtree, so a `useMemo` over that subtree keeps
its result. `structuredClone` copies the whole body instead. Every subtree
gets a new identity on every keystroke.

The provider's own two memos key on the whole draft already. They are
`collectUsedLocales(draft)` and `runValidation(draft, registry,
loadedChildren)`. Both re-run on any `mutate` today, since `produce` returns
a new root object either way. Neither one shifts.

The exposure is a panel or canvas component keyed on a subtree. So the
reducer carries a `ponytail:` comment naming the ceiling and the way back:
restore `produce` if canvas render cost rises measurably. The draft holds
dozens of entities. That is the size `store.tsx`'s existing validation
comment measures at low single-digit milliseconds.

### 3. `Immer<Draft>` becomes `Draft`, not a new local alias

Immer's `Draft<T>` is a deep-mutable mapping. It strips `readonly` from a
property and turns a `ReadonlyArray` into an `Array`. `DraftOf<T>` declares
no `readonly` and produces no `ReadonlyArray`. So the two types agree here.

The alternative is a local `type Mutable<T>` restating immer's mapping. It
would be a mapped type with nothing to strip. The check that the substitution
holds is `tsc --noEmit`: a mismatch surfaces at every `mutate` recipe.

### 4. `listInstances(scope, ...)` over a shared private helper

Two shapes were on the table. One keeps both exports over a shared private
body. The other exports one function taking the scope.

The second wins. The two names carry no information the scope value does not.
A `TasksScreen` asking for `"mine"` reads as well as the old name did.
So does a `StartedScreen` asking for `"started"`. The module loses a
declaration rather than gaining one.

The comment on `listStartedByMe` says why the call sends no `startedBy` of
its own: the route rejects the pair. That reason belongs to the
`scope=started` case. It moves onto the merged function and names the case it
applies to.

### 5. Both `_status` comments state a reason, and the reason is circular

Each declaration justifies the dead parameter in its own comment. The admin
one reads that `status` is "kept in the signature since `describeCaughtError`
below passes `err.status` positionally". The studio one says the same for its
two call sites.

That is not a reason to keep the parameter. It says the parameter exists
because the callers pass it. The callers pass it because the parameter
exists. Neither body reads the value, and no test asserts on it.

The audit's sibling changes met this pattern three times, and each time the
documented reason held. Here it does not, so the parameter goes and the
sentence justifying it goes with it. Tasks 3.1 and 3.2 remove both.

### 6. The `ReportingClientError` alias outlived what it names

The alias carries its own comment. The reporting area threw its own error
class before the consolidation. The alias keeps the name its screens used.
The package that owned that class merged away on 2026-07-31.

Three references pay for the rename, two in `reportingLogic.ts` and one in
its test. The app area already exports `AppClientError` under its own name.
So dropping the alias leaves the areas one name rather than two.

### 7. The three declined entries, with their measurements

**`accountName.ts` inlined into `Chrome.tsx`.** The file is 15 lines with one
call site. It also has `packages/web/test/chrome-accountName.test.ts`, three
cases over the display-name, the federated and the id-only inputs. Inlining
moves the logic into a React component. Those three cases then need a render
to reach, so the test dies or grows a renderer. The change
`ponytail-cleanup-fetch-hooks-and-imports` declined finding 37 on this same
ground.

**`onGoToArea` and `onGoToProfile` derived from `go`.** The audit reads the
four area roots. Each builds its area href as `/${a}`. But `shell/App.tsx`
passes `areaHref(a, "/")` at lines 139 and 185. `Chrome` serves both callers,
so one `go` prop would force one href builder onto the other. The audit sees
four copies of one derivation, not five.

**`listComments` merged with `listAttachments`.** Two things differ, the path
segment and the return type. A merged function needs a type parameter and a
segment argument. Both call sites sit in one file, `TaskScreen.tsx:124,129`.
The merged form runs longer than the two it replaces.

## Risks / Trade-offs

- **A component keyed on a draft subtree re-renders on every keystroke** →
  The `ponytail:` marker names the ceiling and the way back. The
  verification gate's browser check drives the canvas for real. That is
  where a regression of this kind shows.
- **`structuredClone` throws on a value it cannot clone** → `Draft` derives
  from `AuthoredProcessBody`, which is JSON by construction. The draft
  reaches the store from a JSON parse, or from a panel writing JSON values.
  A violating value would already break `definitionHash`, the JCS hash of
  that same body.
- **A recipe holding a pre-clone reference writes elsewhere** → Under
  `produce` the same code hits a revoked proxy and throws. A
  grep of the `mutate(` call sites shows every recipe reading its `d`
  argument alone. Both `tsc --noEmit` and the existing draft tests cover
  the rest.
- **A write to the draft outside `mutate` stops throwing** → `produce` deep-
  froze the state it returned. `structuredClone` does not. The `useDraft`
  comment already states the one-way rule, and a grep finds no site breaking
  it. A shallow `Object.freeze` would not restore the guard, and a deep one
  on every keystroke costs more than the copy.
- **`bun.lock` drifts from `package.json`** → The `frozen-lockfile` push gate
  rejects that pair. So `bun install` runs before the commit, and the
  lockfile ships with it.

## Migration Plan

None. No stored data, no published definition and no API shape changes. The
rollback is a revert of the commit plus `bun install`.

## Open Questions

None. Every decision above rests on a grep sweep recorded in the Context
section, and nothing here waits on an answer.
