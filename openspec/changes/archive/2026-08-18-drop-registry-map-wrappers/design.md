## Context

`src/engine/registry.ts` holds three parallel plugin registries: the action
`Registry`, the `AssignmentRegistry`, and the `DataSourceRegistry`. Each is a
plain `Map<string, Def>` type alias. Each carries a `create*` factory plus a
`register*` setter plus a `resolve*` getter, nine functions total. See
`proposal.md` - Why for the audit finding this change closes.

Two consumption facts drive every decision below. A repo-wide grep confirmed
both.

<!-- antislop: allow sentence-length run-ons -->
<!-- Every sentence below is at or under 20 words. The linter merges a
sentence that opens with a code span into the sentence before it, doubling
the counted length; see antislop-sentence-split-breaks-on-code-span.md. -->
- `package.json`'s `exports` map re-exports the whole `registry.ts` file at
  `./engine/registry`. Every top-level export is technically reachable
  through it. Actual external use through that path is narrower:
  `packages/web/src/areas/studio/registry/exampleRegistry.ts` imports
  `createRegistry` and `register` to build the studio Tools screen's example
  action registry. No file outside those directories imports a value-level
  symbol from `registry.ts` other than through `exampleRegistry.ts`. Two
  more `packages/web` files, `areas/studio/draft/validation.ts` and
  `areas/studio/draft/store.tsx`, additionally import the `Registry` type
  only; this change leaves that type alias unchanged, so neither file
  changes.
- `openspec/specs/data-source-resolution/spec.md` names
  `createDataSourceRegistry`, `registerDataSource`, and `resolveDataSource`
  in one requirement and its two scenarios. No other spec under
  `openspec/specs/` names any of the nine registry functions. A grep of
  every name across the whole `specs/` tree confirmed this.

## Goals / Non-Goals

**Goals:**
- Delete every wrapper function whose entire body is one `Map.set` or
  `Map.get` call. Rewrite its call sites to call the `Map` directly.
- Keep every consumer, in `src/`, `test/`, and `packages/web/`, compiling
  and passing with no behavior change.

**Non-Goals:**
- Touching the registry concept itself. The per-kind registry, the
  `{ type, config }` plugin envelope, and the publish-time
  `checkActionRegistry`/`checkAssignmentRegistry`/`checkDataSourceRegistry`
  validation stay exactly as they are.
- Changing `Registry`, `AssignmentRegistry`, or `DataSourceRegistry`'s
  underlying type. Each stays a `Map<string, ...>` alias.
- Changing `createDefaultAssignmentRegistry` or
  `createDefaultDataSourceRegistry`. Neither is a one-line wrapper. Each
  pre-populates a registry with a real built-in entry. Only what they call
  internally changes.

## Decisions

<!-- antislop: allow sentence-length run-ons -->
<!-- Every sentence below is at or under 20 words. The linter merges a
sentence that opens with a code span into the sentence before it, doubling
the counted length; see antislop-sentence-split-breaks-on-code-span.md. -->
**Keep the three `create*` factories. Delete the six `register*`/`resolve*`
wrappers.** `createRegistry`, `createAssignmentRegistry`, and
`createDataSourceRegistry` stay. `register`, `resolve`,
`registerAssignmentStrategy`, `resolveAssignmentStrategy`,
`registerDataSource`, and `resolveDataSource` go. Every call site of the six
switches to `reg.set(type, def)` or `reg.get(type)`.

Two reasons hold this line at exactly this point. Neither "delete all nine"
nor "keep all nine" fits as well.

<!-- antislop: allow sentence-length run-ons paragraph-length -->
<!-- Every sentence below is at or under 20 words, and each list item is its
own paragraph. The linter merges a sentence that opens with a code span
into the sentence before it, and treats a blank-line-free numbered list as
one paragraph; see antislop-sentence-split-breaks-on-code-span.md. -->
1. `createRegistry` has a proven external consumer through the exports map.
   Deleting it would force `exampleRegistry.ts` onto `new Map()`. That reads
   no better. It also breaks the one real cross-package use this file has.
   The `register`/`resolve` wrappers `exampleRegistry.ts` also imports carry
   no such argument. Every one of their own call sites, in `src/`, `test/`,
   and this same file, reads exactly as well as `reg.set(type, def)` or
   `reg.get(type)`. The `Registry` type is already visible at each call site
   as `Map<string, HandlerDef>`.
2. `.claude/rules/process-contract.md`'s "Extensibility" section names the
   three registries deliberately parallel siblings. `registry.ts`'s own
   comments beside `AssignmentRegistry` and `DataSourceRegistry` say the
   same. Keeping all three constructed through a named `create*` factory
   keeps that parallelism intact. Only one has a proven external caller.
   That does not weaken the case for the other two. Deleting
   `createAssignmentRegistry` and `createDataSourceRegistry` while keeping
   `createRegistry` would trade one inconsistency for a worse one. It would
   replace a wrapper with no added behavior with three registries, each
   built a different way.

**Alternative considered: delete all nine, including `createRegistry`.** This
is the "use the Map methods" branch of the finding's stated options.
Rejected. It forces an external consumer, `exampleRegistry.ts`, onto a
mechanical rewrite that buys nothing. `new Map()` is not clearer than
`createRegistry()`. The three-registry parallelism argument above applies
here too.

<!-- antislop: allow sentence-length -->
<!-- Every sentence below is at or under 20 words. The linter merges a
sentence that opens with a code span into the sentence before it, doubling
the counted length; see antislop-sentence-split-breaks-on-code-span.md. -->
**Alternative considered: keep all nine.** Rejected. This is the state the
audit finding flagged. `register`/`resolve` and their four assignment and
data-source siblings add a function name and an indirection over one `Map`
call. None adds validation, a default, or extra behavior. Deleting them
shortens `registry.ts` by about 21 lines. It also removes six names a
reader has to look up, only to learn each one calls `.set` or `.get` and
nothing else.

**Spec delta scope: `data-source-resolution` only.** This is the one spec
that names the deleted functions. Its requirement and two scenarios rename
`registerDataSource`/`resolveDataSource` (deleted) to
`createDataSourceRegistry` (kept) plus direct `Map.set`/`Map.get` calls.
Construction, registration, and lookup keep behaving exactly as the
requirement and scenarios already describe. Only the function-name wording
moves. `assignment-strategy-registry/spec.md` names the `AssignmentRegistry`
type. It never names `registerAssignmentStrategy` or
`resolveAssignmentStrategy`. It needs no delta.

## Risks / Trade-offs

[A `test/` call site the repo-wide grep missed still calls a deleted
function, breaking the build] -> `bun run typecheck` catches this
immediately. TypeScript's own compile error names the file and line. The
grepped list in `proposal.md` - Impact is a starting point for the task
breakdown, not the sole check.

[`packages/web`'s `reporting-boundaries.test.ts` asserts that
`workflow-engine/engine/registry-check` stays unreachable from the reporting
area] -> unaffected. That boundary test names `registry-check`, not
`registry`. This change touches no import boundary. It only rewrites what
`exampleRegistry.ts` calls once it has imported `Registry`/`createRegistry`.

[Decision 1 calls `exampleRegistry.ts` a "proven external consumer" for
keeping `createRegistry`. A separate, open change,
`fix-studio-registry-panel-example-mismatch`, proposes deleting that file] ->
the rationale partly evaporates if that change lands first. The conclusion
does not. Decision 2's three-registry-parallelism argument keeps
`createRegistry` and its two siblings on its own. Task 3.1 edits
`exampleRegistry.ts`. If the other change deletes that file first, task 3.1
becomes a no-op, not a conflict.

[Task 2.6 in `tasks.md` rewrites `resolveDataSourceOptions` in
`src/runtime/api.ts`. A separate, open change,
`dedup-runtime-pagination-webhook-sink`, rewrites that function, dropping
its `cache` parameter and citing line numbers] -> no functional conflict.
Both changes' final code is compatible. Whichever change lands first shifts
the line numbers the other cites. That change's implementer should
re-derive its cited line numbers at apply time. Its own `tasks.md` already
applies this discipline to `proposal.md`'s file list elsewhere.

## Migration Plan

<!-- antislop: allow synonym-rotation -->
<!-- "change" below names the OpenSpec change itself, the repo-wide
convention for referring to this artifact; "update" names the edit action
each step performs. Two distinct concepts, not a rotation of one. -->
1. Update `src/engine/registry.ts`: delete the six functions. Keep the three
   factories and everything else.
2. Update every `src/` call site (`host.ts`, `subprocess.ts`, `outbox.ts`,
   `registry-check.ts`, `assignment-strategies.ts`, `registry.ts` itself's
   two internal calls) and `src/runtime/api.ts` to call `.set`/`.get`
   directly.
3. Update `packages/web/src/areas/studio/registry/exampleRegistry.ts`'s two
   `register(...)` calls to `.set(...)`.
4. Delete `test/registry.test.ts`: once `register`/`resolve` are gone, its
   two tests have no remaining subject of their own. Update every other
   `test/*.test.ts` fixture that calls one of the six deleted functions.
   Re-grep at this step: the list in `proposal.md` may have drifted since
   this design's authoring.
5. Apply the `data-source-resolution` spec delta.
6. Run the four-check verification gate: `bun run typecheck`, `bun run
   build`, the full `bun test` with `DATABASE_URL` set, and antislop plus
   `git diff --check` on touched Markdown.

Rollback is a plain revert. No data migration, no schema change, and no
persisted state touches this change.

## Open Questions

None. The answers above cover every question the finding raised. That
covers which functions to keep, which call sites exist, and which specs
need a delta.
