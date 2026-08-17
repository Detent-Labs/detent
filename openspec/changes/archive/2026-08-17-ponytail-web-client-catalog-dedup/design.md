## Context

See `proposal.md` for motivation and for the five audit claims this change
corrects. The measurements behind each correction sit under "Measurements"
below.

Three constraints shape every decision here.

An area never imports from another area. It imports upward into `shell/`,
`api/` and `i18n/`. Anything two areas share moves up, never sideways.

Each area is one lazy chunk. A shared module importing every area's catalog
would pull all four catalogs into whichever chunk loads first.

The four client error aliases are one class. `src/api/client.ts` declares
`AppClientError` once. The admin, studio and reporting areas re-export it
under their own names, and the app area exports it as itself. This is why 40
catch bodies agree on a single `instanceof` test.

## Goals / Non-Goals

**Goals:**

- State the 401 rule once. That rule decides whether a caught error logs the
  actor out. Forty hand-copied statements of it is the risk, not the 40
  lines.
- Move up only what two or more areas share. Move it only where the move
  costs fewer lines than leaving it.
- Keep every per-area type per-area. Four areas read four different shapes
  of the same route on purpose.

**Non-Goals:**

- Widening the engine package's `exports` map. See decision 4.
- Merging the three area `errors.ts` describers. The audit leaves that split
  and so does this change.
- Touching `packages/form-ui`.

## Decisions

### 1. `useFail` is a hook, and it covers all three forms of the rule

`useFail(onUnauthorized, onError)` returns one `(err: unknown) => void`. A
component declares it once and calls it from each of its catch bodies.

The alternative is a plain `fail(err, onUnauthorized, onError)` called
directly at each site. It needs no hook machinery and no memoization. It
loses on the measurement. Thirteen of the 15 files carrying the one-line
form hold two or more sites, and `UsersScreen.tsx` holds six. A plain
function repeats both extra arguments at every one of them. The hook names
them once per component.

`TemplatesScreen.tsx:45` already wrote this hook by hand, inline, and named
the result `fail`. The shape is the tree's own, not an invention.

The audit's finding 13 counts one syntactic form. The rule stands in three,
57 times across 21 files:

- The one-line form, `… err.status === 401) onUnauthorized();` with an
  `else` under it. 40 sites in 15 files. This is the audit's count.
- The early-return form, `… e.status === 401) { onUnauthorized(); return; }`
  with the error statement under it. 16 sites in seven more files:
  `TaskScreen.tsx:80`, `DraftToolbar.tsx:77`, `EditScreen.tsx:499`,
  `MigrationPlanScreen.tsx:69,130,146`, `PlayerScreen.tsx:43,73,145`,
  `ToolsScreen.tsx:43,76,98` and `VersionsScreen.tsx:71,105,125,146`.
- The returned-call form, `… err.status === 401) return onUnauthorized();`.
  One site, `ProcessesScreen.tsx:217`.

All three mean the same thing, so all three become `fail`. The early-return
form becomes `fail(e); return;`, and the `return` drops where nothing
follows it. Two sites of the 57 stay hand-written. See Open Questions.

`LoginScreen.tsx:33` also tests a 401 and does not change. A rejected login
is not an expired session, so it answers `setFailed(true)` and keeps the
actor on the screen.

### 2. `useFail` returns a stable callback, through a ref

The returned function keeps one identity for the life of the component. It
reads `onError` through a ref that every render updates.

Without this, the hook regresses what it replaces. Callers pass `onError` as
an inline arrow, so its identity changes each render. A `useCallback` keyed
on it would hand back a new `fail` each render. Every `useCallback` and
`useEffect` listing `fail` as a dependency would then re-run each render.
The load effects in these screens would refetch in a loop. Today's sites
list `[onUnauthorized]` and `[locale]`, both stable.

A test suite of pure logic functions does not see a render loop. This is the
one hazard in the change that green tests would not catch.

No test in this repo can catch it either. `packages/web` has no interactive
DOM test environment. Two suites record that in their own headers,
`studio-draftToolbarState.test.ts:6-9` and
`studio-processHeaderLogic.test.ts:7-9`. Both say the package renders
through `react-dom/server`'s `renderToStaticMarkup`, "which never fires an
event or re-renders on state change". The package depends on no DOM runner
and no `@testing-library/react`.

So the mitigation is structural, not a test. The returned callback carries
no dependency array at all. A ref holds `onError`, and one assignment on
each render keeps it current. Nothing the caller passes reaches the memo, so
nothing the caller passes can change the callback's identity.

Two checks stand beside that. A `bun:test` suite covers the `is401`
predicate `useFail` calls. That predicate is the branch, and it is pure.
And `docs/browser-checks.md` gains one line for the refetch loop. CLAUDE.md's
split rule prescribes that for an error only a browser shows.

### 3. `makeCatalog` takes the catalog, never imports one

`makeCatalog(area, catalog)` returns the `t` function. Each area calls it
once with the catalog it already imports:

```ts
export const t = makeCatalog("admin", adminCatalog);
```

The chunking constraint forbids the other shape, a `makeCatalog` importing
all four catalogs and switching on `area`. The argument keeps each area's
import graph what it is today.

That constraint is real, and the tree already carries its one deliberate
exception. `i18n/catalogs/index.ts` imports all five catalogs. Its header
says why: "Only the admin area's UI-strings screen imports this file. Each
area imports its own catalog file directly, so the per-area chunking
`shell/App.tsx` sets up survives." That screen must list every overridable
key, so it pays the cost knowingly. A `t()` factory has no such reason.

The key stays a type parameter, so an unknown key stays a compile error. A
signature widening the key to `string` would accept a typo and answer
`undefined` at runtime. `i18n-catalog-parity.test.ts` checks the catalogs
against each other. It does not check a call site's key.

The studio keeps its own `t(key)`. It ships one locale on purpose, so its
signature carries no `locale` parameter. The audit says to leave it.

The rename to `CatalogKey` gives five disjoint key unions one name. Three
carry it today, and `TranslationKey` and `ShellKey` join them. No collision
follows. No area imports another area, and the shell's own type is the only
one a second module reads. The name states what the type is, which is why
three files already chose it. Nothing but consistency argues for the rename,
so it stays a rename and touches nine files.

### 4. The three shared types go to `packages/web/src/api/types.ts`

The audit routes `VersionSummary`, `InstanceRecordElement` and
`InstanceRecordPage` through the engine's `exports` map, "like `HistoryEntry`
already does". `HistoryEntry` reaches the web package through the `./schema`
entry, which is `src/schema/definition.ts`. These three live in
`src/engine/definitions.ts` and `src/runtime/api.ts`. The `exports` map
publishes seven entries, and neither of those two files is among them.

Two new entries would publish the engine's runtime and definition-store
modules as package API. That is an engine decision with its own blast
radius. A `packages/web` refactor does not get to make it. The three types
move to `packages/web/src/api/types.ts` instead. That file is where the four
areas already reach for what they share.

That file's header rules exactly this out today. It says "domain types stay
per area on purpose", because each "declares only the fields it reads". Its
last clause reads "pairs that look identical today will drift".

The rule is right, and these three sit outside it. A projection declares the
subset of a response one area reads. Two projections of one route drift as
each area's screen asks for more.

These three declare no subset. Each carries its own comment saying so:
`Mirrors src/engine/definitions.ts::VersionSummary` and
`Mirrors src/runtime/api.ts::InstanceRecordElement`. They restate an engine
type whole. They move when the engine moves, and at no other time.

`ProcessSummary` and `InstanceView` are the projections the header means,
and both stay split. The studio's `ProcessSummary` carries `definitionHash`
and the admin's does not. That is the drift the header predicts, already
happened, in the same file.

This change rewrites that header to state both halves. Projections stay per
area. A whole mirror of an engine type may sit here. Without the rewrite the
file's header would contradict its contents.

### 5. Only the wrappers longer than their own re-export move

An area's screens import from that area's client. A wrapper moved up to
`src/api/` therefore leaves a re-export line behind in each area that used
it. That line is the cost of the move.

After `getJson<T>` lands, a one-route GET wrapper is one line. Hoisting it
writes three lines to delete two: one shared declaration and two
re-exports. `cancelInstance` and `listVersions` are both in that class.
Both stay duplicated.

`getInstanceRecord` (8 lines each), `createInstance` (7) and `submitPath`
(6) all pay for the move. They go up.

The audit states finding 17 as a flat count of duplicate declarations. The
count is right. Not every duplicate is worth closing.

### 6. `getJson` lands in `src/api/client.ts`, beside `fetchAccount`

`src/api/client.ts` already holds the cross-area route functions `login`,
`fetchAccount` and `patchAccount`. The three hoisted wrappers and `getJson`
join them, rather than starting a second shared client module.

`getJson` is `get<T>` from `areas/reporting/api/client.ts`, moved up and
renamed. The reporting area wrote it first. Its comment names the reason:
every route it calls is a GET returning JSON. That holds for 14 wrapper
bodies across the four areas, not four.

### 7. The merged record describer goes to `src/api/record.ts`

`describeRecordElement` reads `InstanceRecordElement`, which decision 4
moves to `src/api/types.ts`. The function follows its type up. It gets its
own file, so `types.ts` stays types alone.

It returns `{at, summary}`. The admin caller adds `detail` at its own call
site, the only place that renders it. `studio-playerLogic.test.ts` imports
the function. Its import moves and its assertions stay.

### 8. This change lands after the three open ponytail changes

`ponytail-web-small-cuts`, `ponytail-cleanup-fetch-hooks-and-imports` and
`ponytail-cut-unreachable-code` each touch a file this one rewrites. Nobody
has applied any of the three.

Order by size. The three are 10 to 60 lines each, and reviewers have already
read them. This one rewrites four catalog files, four API clients and 15
screens. Rebasing three small changes onto this one costs more than rebasing
this one onto them. Every conflict this ordering leaves sits inside a file
this change rewrites anyway.

Two of the overlaps go beyond a textual conflict:

- `ponytail-web-small-cuts` merges `listMyTasks` and `listStartedByMe` into
  one `listInstances(scope, token, opts)`. That merged function is a
  `getJson` call site here.
- `ponytail-cut-unreachable-code` deletes 15 unused studio keys and two app
  keys. Those deletions land in the catalogs `makeCatalog` reads, not in
  `makeCatalog` itself. The two do not touch the same lines.

## Risks / Trade-offs

- [`useFail` re-creates each render and the load effects refetch in a loop]
  → decision 2. The returned callback carries no dependency array, so
  nothing a caller passes can change its identity. No test here can prove
  that, so `docs/browser-checks.md` gains the check.
- [One shared type drifts per area, and has to leave `api/types.ts` again]
  → this is the one-way door in the change. Decision 4 bounds it. Only a
  whole mirror of an engine type qualifies. The two known projections stay
  split. The way back is the way in, reversed, in one file with two
  importers.
- [A catch body changes behavior during the rewrite of 57 sites] → each site
  keeps its error statement verbatim, as the `onError` argument. No site's
  `describeCaughtError` call, locale argument or boolean setter
  changes. `ProfilePage.tsx` keeps two distinct handlers, one per site.
- [Renaming `TranslationKey` and `ShellKey` to `CatalogKey` misses an
  importer] → `bun run typecheck` fails on a missing export. This is the one
  class of error in the change that the compiler catches in full.
- [The shared `InstanceView` and `ProcessSummary` drift toward one type] →
  they stay out of scope. Only wrappers whose return type already agrees
  move up. `listProcesses` and `getInstanceView` stay declared per area for
  exactly this reason.
- [A hoisted wrapper widens what an area can call] → a re-export publishes
  the same name the area published before. No area gains a route it did not
  already have.

## Migration Plan

No deployment step and no data step. The change writes no column, no row and
no stored value. It ships in the bundle the engine already serves from
`WEB_ROOT`.

The four task groups deploy as one commit. They land in this order, and each
leaves the tree green on its own:

1. The 401 rule. Additive first: `useFail` and its `is401` test land before
   any call site moves. Each converted file compiles against the hook that
   already exists.
2. The catalogs. `makeCatalog` lands first. Then each of the four `t()`
   bodies moves onto it. Then the key type rename goes through every
   importer in one step.
3. The API clients. The three shared types move together with the
   re-exports that keep their old import paths working. Then `getJson`, then
   the three wrappers.
4. The record describer, which depends on step 3's type move.

Rollback is `git revert` of the commit. Nothing outside the bundle changes,
so a revert restores the prior behavior in full at the next build.

Stored UI-string overrides need no migration. `makeCatalog` passes
`resolveOverride` the same `area` string each `t()` passes today. The key
rename touches TypeScript type names, never a catalog key.

## Open Questions

Both are deferrable. Neither changes the approach, the other decisions or
the task breakdown; each decides one call site during apply.

- Do `TaskScreen.tsx:80` and `PlayerScreen.tsx:73` move onto `fail`? Both
  sit inside a multi-branch ladder rather than a two-branch catch. Each runs
  `if (err instanceof AppClientError)`, then tests 401, then `validation`,
  then a `refresh-and-remove` navigation.

  A `fail` returning nothing cannot report that it handled the error, so the
  caller cannot know whether to fall through. Either `fail` answers a
  boolean, or both sites stay as they are with a comment naming why. Two
  sites of 57, either way.
- Does `useFail` belong in `shell/` or in `api/`? It reads `AppClientError`
  from `api/client.ts` and calls the session's `onUnauthorized`, so it has a
  foot in each. This change puts it in `shell/`, which owns the session.
  Both directories sit on every area's allowed import path. So
  `boundaries.test.ts` passes either way, and a later move costs one import
  line per file.

## Measurements

Each figure below comes from a grep or a read of the tree on 2026-08-16.

- A grep for `status === 401` finds 58 sites in 23 files. They break down as
  40 one-line, 16 early-return, one returned-call, and one other rule.
- The one-line form, `err instanceof <Alias> && err.status === 401)
  onUnauthorized();`, stands 40 times in 15 files.
- The early-return form stands 16 times in seven files. Two of them confirm
  in full that the shape absorbs into `fail`. In
  `VersionsScreen.tsx:68-76` the catch's only tail is
  `setLoadError(describeCaughtError(e))`, so its `return` is already
  redundant. `MigrationPlanScreen.tsx:65-75` ends on
  `setLoadError(describeCaughtError(e)); return;`.
- The returned-call form stands once, `ProcessesScreen.tsx:217`. Two
  statements follow it, so its `return` carries weight.
- The one other rule is `LoginScreen.tsx:33`, which answers a 401 with
  `setFailed(true)`, because a rejected login is not an expired session.
- Of the 15 files holding the one-line form, 13 hold two or more sites.
  `MigrationsScreen.tsx` and `TemplatesScreen.tsx` hold one each.
  `UsersScreen.tsx` holds six.
- The else-branch takes three shapes. Admin writes
  `setError(describeCaughtError(err, locale))`. Studio writes
  `setError(err instanceof Error ? err.message : String(err))`. The file
  `shell/ProfilePage.tsx` writes `setLoadFailed(true)` at one site and
  `setSaveFailed(true)` at the other.
- Four `t()` bodies agree: admin, app, reporting and shell. The studio's
  fifth takes no `locale`.
- One `tFill` exists, in admin. One `tCount` exists, in reporting. `tFill`
  walks `Object.entries(values)` with `replaceAll`. `tCount` runs one
  `replace` on `{n}`.
- `const res = await request(path, token); return (await res.json()) as T;`
  stands 14 times across the four area clients.
- `listProcesses` agrees in admin, app and studio. The reporting area's
  reads `/reporting/processes` through its own `get<T>` and unwraps
  `{processes}`.
- `getInstanceRecord` differs between admin and studio by one local name,
  `query` against `params`.
- The engine `exports` map publishes seven entries: `./schema`,
  `./schema/canonical-json`, `./schema/strip-compiled`, `./cel/check`,
  `./schema/compile`, `./engine/registry` and `./engine/registry-check`.
- `packages/web/package.json` lists five devDependencies: `@types/react`,
  `@types/react-dom`, `@vitejs/plugin-react`, `typescript` and `vite`. No
  DOM test runner, no `@testing-library/react`.
- Renaming the key type touches nine files. Two declare the type,
  `i18n/catalogs/studio.ts:397` and `i18n/catalogs/shell.ts:79`. Seven read
  it: `shell/catalog.ts`, `shell/profileFields.ts`,
  `areas/studio/catalog.ts`, `canvas/EditRail.tsx`, `panels/StepsPanel.tsx`,
  `screens/FormEditorScreen.tsx` and `screens/PanelsScreen.tsx`.
