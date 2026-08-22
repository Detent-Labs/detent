## Why

`publishBody` (`src/engine/definitions.ts:223-302`) runs seven validation
stages in a fixed order. Compile bundles the Zod gate, duration and the
seven structural checks behind one call. The three registry checks, CEL,
cross-process and chaining follow it, one stage each.

The studio rebuilds that order by hand in
`packages/web/src/areas/studio/draft/validation.ts:79-165`, at a different
granularity. It unbundles compile into three of the checks rail's own
groups: zod, structural and duration. It adds cel and registry, for five
rail groups in total. Within those five groups, four individual publish
blockers never reach the rail at all. Three are `checkAssignmentRegistry`,
`checkDataSourceRegistry` and `validateProcessChaining`. The fourth is
`checkUnknownKeys`, one of the structural group's own seven checks.

`studio-checks-rail`'s "Every publish blocker is visible" requirement states
that an author can read publishability off five groups alone. That claim is
false today. A draft that maps a `process.start` action into a field the target
process does not declare shows a clear rail. Publish then fails with a
`CrossProcessValidationError` the rail never predicted.

The studio wires a fifth stage and never fires it. `checksRail.ts:26-30`
records that no studio code path passes a live `Registry` to `runValidation`.
So `registryChecked` reads `false` for the whole session. Two sums exclude
`"registry"` to stay reachable. The rail carries a permanently held-back group,
and the spec above writes that exception in.

Nothing holds the two sequences together. `grep -rln "publishBody"
packages/web/test/` returns one file, `studio-promotionRoundTrip.test.ts`.
That file mentions it only in a comment explaining why the test exists. The
test itself calls `compileProcessBody` directly, never `publishBody`. No test
asserts the two validation sequences agree.

## What Changes

- Add two exported functions to a new top-level `src/validate.ts`, reached
  through the package exports map: `validateStructure` and
  `validateReferences`. `validateStructure` runs first. It runs the Zod gate,
  the compile and duration interlock, and the structural checks. It produces
  the compiled body `validateReferences` requires. Together the two functions
  own the stage order and the per-dimension "did this run" reporting.
- `publishBody` calls it and throws on a non-empty result. The module's four
  owned post-hash stages, the three registry checks and CEL, keep their
  position. Cross-process and chaining validation stay outside the module and
  keep their own position too. A re-publish of an already-published body
  stays a no-op.
- The studio's `runValidation` calls it and maps the result to `EditorIssue`.
  `checkViewFlags` passes in as an extra checker. It stops being a second
  sequence.
- Split each registry check into two halves. Type resolution answers whether a
  registry holds a `{type}`, and reads a serializable registry description.
  Config validation answers whether a `{config}` satisfies that type's Zod
  schema. That half keeps needing the live registry.
- The studio feeds the three type lists it already fetches from `GET /registry`
  into the type-resolution half. The action, assignment strategy and data source
  dimensions stop being invisible.
- A dimension a caller cannot supply reports `checked: false`. It is never
  silently absent.
- **BREAKING** for callers of `runValidation`: `ValidationResult` replaces its
  three boolean bookkeeping fields with one per-dimension record.

## Capabilities

### New Capabilities

- `publish-validation-consolidation`: one module owns the publish-time
  validation sequence for the stages it can own without a DB round trip. Those
  stages are the Zod gate, duration, structural, the three registry checks and
  the single-body CEL check. Both the engine's publish path and the studio's
  live validation read it for those stages. Cross-process and process-chaining
  validation stay a separate, DB-resolving step inside `publishBody`, run
  after the module's own stages. That step shares comparison logic with the
  module, not its call path; see design.md's chaining-split decision.

  Covers the stage order and the "did this run" reporting for the stages the
  module owns. Covers the split of each registry check into a
  type-resolution half and a config-validation half.

### Modified Capabilities

- `studio-checks-rail`: the registry group widens from one check to three. It
  covers action, assignment strategy and data source types. The rail stops
  holding that group back for the whole session. The CEL group widens to cover
  process chaining targets. "Every publish blocker is visible" becomes true of
  the groups it names.
- `registry-config-check-consolidation`: its "Resolve-and-validate-config loop
  shares one implementation" requirement gains `resolveType`. That is the new
  shared not-registered check. Both `checkTypedConfig` and each dimension's
  standalone type-resolution half call it. `checkTypedConfig` is an internal,
  unexported helper.

  It gains one parameter, `typeNames`, to call `resolveType` from its own
  body. Its emitted issues stay unchanged. Each of its three callers keeps
  its own public signature too: `checkActionRegistry`,
  `checkAssignmentRegistry` and `checkDataSourceRegistry`. See design.md's
  "The type-resolution half shares one implementation" decision.
<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: the quoted "invoked at publish" span merges this
     bullet's first two sentences into one count. Each sentence reads under
     20 words split at its own period. -->
- `assignment-registry-validation` needs a delta. Its "invoked at publish"
  requirement named a direct call this change removes. `publishBody` reaches
  the same verdict now, through `validateReferences`'s `resolveType` and
  `checkConfigOnly` calls. Placement, precedence and the thrown error class
  stay as they are.
- `data-source-registry-validation` needs a delta too. Its "publish error,
  never a runtime one" requirement names the same now-indirect call. See
  design.md's "The type-resolution half shares one implementation across all
  three registry checks" decision.

`action-registry-validation` needs no delta either. Its two siblings each
pin a "wording correction" delta because their own MODIFIED requirement
literally names `checkAssignmentRegistry`/`checkDataSourceRegistry` as
`publishBody`'s direct call path. `action-registry-validation`'s three
SHALL-worded Requirements never name `checkActionRegistry` that way; only
its Purpose text states validation is "invoked by `publishBody`," a claim
that stays true through `validateReferences`'s indirect call. No Requirement
text goes stale, so no delta is needed.

`definition-store` needs no delta. Publish accepts and rejects the same bodies,
raises the same error classes, and keeps the same stage order. Only the code
path behind that behavior moves.

`cross-process-validation` needs no delta either. `validateProcessChaining`
keeps throwing `CrossProcessValidationError` for the same conditions, just by
delegating to the new `checkProcessChainingTarget`. See design.md's
chaining-split decision.

## Impact

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: sentence splitting merges across this paragraph's dense chain of `code span` references. Each sentence reads under 20 words on its own. -->
Engine: a new top-level `src/validate.ts` joins `schema/`, `engine/` and
`cel/` as siblings. The new module stays outside `src/schema/` itself. That
directory must stay free of concepts owned by the engine, like `Registry`
and CEL. `./cel/check` and `./engine/registry-check` already sit outside `src/schema/`
for the same reason. `src/engine/definitions.ts`, `src/engine/registry.ts`,
`src/engine/registry-check.ts` and `src/cel/check.ts` change. `package.json`'s
exports map gains one entry, `./validate`.

Tests: a new file, `test/validate-sequence.test.ts`, carries the assertions
in tasks.md §6.

Studio: six files change. The file
`packages/web/src/areas/studio/draft/validation.ts` shrinks to a call and a
mapping. The file `draft/checksRail.ts` gains three groups and loses two
exclusion filters. The file `draft/store.tsx` gains a `token` prop that it
uses to fetch the registry description via `useRegistry`. It also gains a
record of loaded process-chaining target bodies, next to its existing
step-keyed subprocess child loader. That record keys by the triggering
process.start action's own id.

The file `packages/web/src/areas/studio/screens/EditScreen.tsx` passes its
`token` into `DraftProvider` at that provider's sole call site. The file
`packages/web/src/areas/studio/panels/ActionListEditor.tsx` narrows its
per-action registry badge to the held-back config-validation half. It also
gains a second, analogous badge for a `process.start` action whose chaining
target the studio has not loaded. The file
`packages/web/src/areas/studio/panels/ChecksRail.tsx` renders the registry
group's new `registryConfigHeldBack` field as its own held-back indicator,
independent of `heldBack`. Every reader of `ValidationResult` updates.

A new file, `packages/web/test/studio-draftProvider-chainingFetch.test.ts`,
carries task 6.22's assertion that two `process.start` sites sharing a target
`processId` issue one `listProcesses`+`getVersionBody` pair, deduped via
`chainingFetchState`. It also carries task 6.22a's assertion. After deleting
or reordering an action shifts a site's `loc`, `chainingSiteStatus` and
`loadedChainingTargets` still key on that site's own `action.id`. That
invariant is distinct from 6.22's same-`processId` dedup coverage.

A new file, `packages/web/test/studio-actionListEditor-registryBadge.test.tsx`,
carries task 6.9a's assertion. `ActionListEditor.tsx` shows the
config-held-back badge for an action whose type resolves. It shows a
registry issue instead for an action whose type does not resolve.

Five pre-existing test files are direct consumers of the symbols this change
restructures. Each updates in place rather than staying as it is. The files
`studio-checksRail.test.ts` and `studio-draftValidationLogic.test.ts`
(`packages/web/test/`) move off the three retired `ValidationResult`
booleans onto the per-dimension record. The file `studio-strip-compiled.test.ts`
(`packages/web/test/`) moves onto `runValidation`'s new signature. The files
`studio-editorDock-fieldMatrixTab.test.tsx` and
`studio-fieldMatrixPanel-legend.test.tsx` (`packages/web/test/`) start
passing a `token` prop into `DraftProvider`.

No definition contract change. This change leaves
`src/schema/definition.ts` alone. The engine accepts and rejects exactly the bodies
it accepts and rejects today. Only the studio's view of that verdict widens.

Docs: `docs/authoring-guide.md` states no rule this change alters, so it stays
as it is. `docs/current-state.md` lists exported symbols and behavior by
hand. It needs the new export. It also needs three existing passages
rewritten, not just the export line added.

The `runValidation` "Known gap" passage is the first. This change's
`unknownKeysHeldBack` reporting supersedes it. The `checkDataSourceRegistry`
passage is the second. It states a direct `publishBody` wiring this change
replaces with an indirect call through `validateReferences`.

The `draft/validation.ts` passage is the third. It states that file calls
`compileProcessBody` directly. After this change it calls
`validateStructure` instead, which calls `compileProcessBody` internally.
That same file's engine section gains a note on the new two-phase seam.
The note names `validateStructure` then `validateReferences`.

`docs/browser-checks.md` gains a check for the widened rail.
`.claude/rules/process-contract.md`'s Extensibility paragraph is rewritten,
per task 7.4. It now credits `validateReferences` (via `resolveType` and
`checkConfigOnly`) as what `publishBody` invokes at publish time. That
replaces the direct `checkActionRegistry`/`checkAssignmentRegistry`/
`checkDataSourceRegistry` description. `docs/decisions.md` gains an Open
Questions bullet. It records that `checkUnknownKeys` stays held back in the
studio pending a tolerant walk (task 7.5).

Not in scope: unifying `CompileIssue`, `DurationIssue`, `CelIssue` and
`RegistryIssue`. Their three `loc` conventions stay as they are. That work
touches the same four producers. It should follow this change rather than run
beside it.
