# Design

## Context

See `proposal.md` for the motivation. `src/runtime/api.ts` has three parts
today:

- a header of imports and a re-export block, lines 1-89;
- the public types, lines 90-396;
- private helpers and 50 exported functions, lines 397-2789.

Two module-level values carry state. One is `stores`, a `WeakMap` from a `db`
handle to its definition store, and `getStore` reads it. The other is
`patternCache`, a `WeakMap` from a body to its compiled regular expressions,
and `compiledPattern` reads it.

24 files import the module. Five are under `src/`: `routes.ts`,
`studio-routes.ts`, `reporting-routes.ts`, `errors.ts` and
`engine/instance-query-source.ts`. The other 19 are tests. No test calls
`mock.module` or `spyOn` on the module, and no test uses a namespace import of
it. Therefore a symbol that moves to another file changes no test.

A dependency scan of the top-level declarations shows no cycle between the
domains below. The one link between two domains is `reports` → `queries`:
`runReportQuery` calls `queryInstances`, and `resolveVersionCoverage` calls
`buildInstanceWhere` and `buildDataWhere`.

## Goals / Non-Goals

**Goals:**

- No source file under `src/runtime/` holds more than about 700 lines after
  the split.
- `src/runtime/api.ts` exports the same set of value names and type names as
  before the split.
- Every moved declaration keeps its body byte for byte, except for the
  `export` keyword a sibling needs and the import lines at the top of each
  module.

**Non-Goals:**

- Renaming, deduplicating or simplifying anything that moves. A cleanup found
  during the move goes into `docs/decisions.md` as a new finding.
- Changing a test file. A test that needs a change shows that the move changed
  behavior.
- A size gate. The owner ruled on 2026-09-23 that a size limit stays a habit.

## Decisions

### D1. Module layout

Each row names a new file under `src/runtime/` and the declarations it
receives. The line ranges refer to `api.ts` at the change's base commit. The
implementer records that base with `git rev-parse HEAD` before the first move.

| Module | Receives | Lines today |
|---|---|---|
| `internal.ts` | `DEFAULT_LIST_LIMIT`, `MAX_LIST_LIMIT`, `DEFAULT_RECORD_LIMIT`, `MAX_RECORD_LIMIT`, `Page`, `keysetPage`, `pagedRead`, `DefinitionStore`, `stores`, `getStore`, `parseInstance`, `loadInstanceForRead`, `loadInstanceForActor`, `findStep`, `resolveCollaboration`, `CollaborationDisabledError` | 370, 397-470, 543-561, 567-582, 774-795, 1255-1302, 2626-2635 |
| `fields.ts` | the `ResolvedView*` types, `isResolvedViewField`, `AvailablePath`, `SubmissionIssue`, `SubmissionValidationError`, `isGroupField`, `resolveFlag` through `resolveAvailablePaths`, `DroppedAttribute` through `validateSubmissionData`, `patternCache` | 94-144, 196-216, 562-566, 583-773, 796-1112 |
| `instances.ts` | `InstanceView`, `createProcessInstance`, `getInstanceView`, `requireSubmitAuthority`, `submitAndTransition`, `saveInstanceDraft`, `isCancellableAtStep`, `canActorCancelInstance`, `cancelInstance` | 145-195, 1113-1254, 1303-1447, 1505-1601 |
| `claims.ts` | `claimStep`, `releaseClaim`, `delegateClaim` | 1448-1504 |
| `queries.ts` | `InstanceSummary` through `InstanceDataPage`, `StepNotInBodyError`, `toSummary`, `toDegradedSummary`, `toSummaryItem`, `InstanceWhereFilter` through `queryInstances` | 217-369, 471-546, 1602-2010 |
| `reports.ts` | `ReportQuery` through `reportResultToCsv` | 2011-2481 |
| `record.ts` | `InstanceRecordElement`, `getInstanceRecord` | 372-376, 2482-2548 |
| `visibility.ts` | `VisibilityOp`, `changeVisibility`, `revokeVisibility`, `restoreVisibility`, `grantVisibility` | 2549-2625 |
| `comments.ts` | `InstanceComment`, `postComment`, `listComments` | 377-386, 2636-2694 |
| `attachments.ts` | `InstanceAttachment`, `uploadAttachment`, `listAttachments`, `getAttachment` | 387-396, 2695-2789 |

Estimated sizes: `queries.ts` about 650 lines, `fields.ts` about 560,
`reports.ts` about 480, `instances.ts` about 450. The rest stay under 150
each.

A range starts at a declaration's first line. The doc comment above a
declaration moves with it. Sometimes that comment sits inside the range of
the row before.

The table groups by caller. No import cycle can form through `internal.ts`, because it imports
no sibling. Each piece of module state lives in exactly one module. `stores`
lives in `internal.ts` and `patternCache` in `fields.ts`. Two copies of
`stores` would build two definition stores for one `db`. A body in the cache
of one store would then be missing from the other.

Alternative considered: one module per HTTP route file. That splits
`routes.ts`'s callers across claims, comments, attachments and the lifecycle
anyway, so it gives the same cut with a worse name.

### D2. The barrel names every public export explicitly

`api.ts` keeps its header doc comment, reworded to say that it is the layer's
one import surface. It keeps the existing `export { GuardRefused, … }` block
and `export type { InstanceDraft }`. Then it re-exports each module's public
names in an explicit `export { … } from "./x.js"` list, plus an
`export type { … } from "./x.js"` list for the types.

It does not use `export * from`. A sibling must export a helper such as
`resolveFields` or `getStore` so that another sibling can import it. An
`export *` in the barrel would then publish that helper and grow the public
surface by about 30 names. The explicit lists keep the surface identical.
They also make the barrel a readable table of contents.

Alternative considered: a leading `_` or an `internal` namespace for the
helpers. Both rename code, and a rename is out of scope under D1's
byte-for-byte rule.

### D3. How the implementer proves the surface identical

Before the first move, the implementer writes two lists to
`.superpowers/sdd/split-runtime-api/`, a directory `.gitignore` excludes:

- `values-before.txt`, the sorted output of
  `bun -e 'console.log(Object.keys(await import("./src/runtime/api.ts")).sort().join("\n"))'`;
- `types-before.txt`, the sorted names from each `export type` and
  `export interface` declaration and from `export type { … }`, taken with
  `grep` from `api.ts`. A class is a value, so the values list covers it.

After the split, the same `bun -e` command must print a list identical to
`values-before.txt`. The sorted names in the barrel's `export type` lists
must equal `types-before.txt`. The `diff` of each pair must print nothing.

This check runs once. It does not become a test. The typecheck already
covers every name that one of the 24 importers uses. The one-time diff also
covers a name no file uses today.

### D4. Specs keep citing `src/runtime/api.ts`

Nine live specs cite `src/runtime/api.ts`. Four of them name a helper that the
barrel does not export and that moves: `resolveFields`, `checkConstraints`,
`resolveFlag`, and the submission type check in
`runtime-field-type-check-consolidation`. Rewriting each citation would need a
MODIFIED delta that copies the whole requirement, for a path change only.

Instead, the Purpose section of `openspec/specs/runtime-api/spec.md` gets one
added sentence. It says that `src/runtime/api.ts` is the layer's one import
surface over sibling modules in `src/runtime/`, and that a spec citation of
`src/runtime/api.ts` names the layer as a whole. A delta cannot carry a Purpose
change. The OpenSpec instructions therefore send it to the live spec
directly.

### D5. The docs sweep

- `docs/current-state.md`: every `src/runtime/api.ts::<symbol>`,
  `api.ts::<symbol>` or "`<symbol>` (`src/runtime/api.ts`)" citation points
  to the module that now defines the symbol. A passage that names the layer
  as a whole keeps `src/runtime/api.ts`. The Runtime API Layer entry near line
  478 gets one sentence that names the module layout.
- `docs/decisions.md`: the line-number citations `src/runtime/api.ts:1294`,
  `:1868` and `:2583` point to the new file and line. A symbol citation
  follows the `current-state.md` rule. Examples are `loadInstanceForActor`
  near lines 952 and 2176, and the comments above `MAX_LIST_LIMIT` near line
  2406. ARCH-1 near line 1446
  gets the resolved mark in place, in the form RAIL-4 uses near line 1561:
  "(resolved by `split-runtime-api`)". One added sentence names the size of
  the new largest module.
- `CLAUDE.md`: the repository layout entry for `src/runtime/api.ts` becomes
  `src/runtime/` with a one-line list of the modules.
- `README.md`, `ROADMAP.md` and `docs/roadmap-history.md` cite the file too.
  A history entry stays as written. A citation of the current code follows
  the same rule as `current-state.md`.

## Risks / Trade-offs

- [A moved function changes its behavior] → The cause would be an import
  that resolves to a different binding. Each module imports from the same
  engine, schema and auth paths that `api.ts` used. The byte-for-byte rule excludes local edits.
  The full `bun test` run is the evidence.
- [A binding in the temporal dead zone at module load] → An import cycle
  exists today: `api.ts` imports `engine/definitions.ts`, which imports
  `engine/instance-query-source.ts`, which imports `queryInstances` from
  `api.ts`. After the split the cycle runs through the barrel and
  `internal.ts`. It stays safe while no module reads an imported binding at
  top level. Each of the four top-level `extends` in `src/runtime/` names the global
  `Error`. A class must not extend a class from a sibling module. Every test
  file loads the barrel, so the full `bun test` run shows a load-order error.
- [A second copy of `stores` or `patternCache`] → D1 assigns each to one
  module. The task review checks that `new WeakMap` appears once per value
  under `src/runtime/`.
- [A module that imports its own barrel creates a cycle through `api.ts`] →
  No module under `src/runtime/` except `api.ts` imports `./api.js`. The task
  review checks this with `grep`.
- [Doc citations go stale again after the next move] → That is the known,
  ungated stale-citation class that `CLAUDE.md` names. This change sweeps once and does not
  add a gate.
- [The barrel's explicit lists must grow each time a module gains an export]
  → The design wants that. A new public name then shows up in the diff of `api.ts`.

## Migration Plan

No data or deployment step. The change is one commit series on its branch.
Rollback is a revert of the merge commit.

## Open Questions

None.
