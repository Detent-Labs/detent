## Why

`publishBody` (`src/engine/definitions.ts:231-283`) runs seven validation
stages in a fixed order. The studio rebuilds that order by hand in
`packages/web/src/areas/studio/draft/validation.ts:79-165` and runs five of
them. Four publish blockers never reach the checks rail:
`checkAssignmentRegistry`, `checkDataSourceRegistry`, `validateProcessChaining`
and `checkUnknownKeys`.

`studio-checks-rail`'s "Every publish blocker is visible" requirement states
that an author can read publishability off five groups alone. That claim is
false today. A draft that maps a `process.start` action into a field the target
process does not declare shows a clear rail. Publish then fails with a
`CrossProcessValidationError` the rail never predicted.

The studio wires a fifth stage and never fires it. `checksRail.ts:31-35`
records that no studio code path passes a live `Registry` to `runValidation`.
So `registryChecked` reads `false` for the whole session. Two sums exclude
`"registry"` to stay reachable. The rail carries a permanently held-back group,
and the spec above writes that exception in.

Nothing holds the two sequences together. `grep -rln "publishBody"
packages/web/test/` returns no file.

## What Changes

- Add one exported `validateBody` to `src/schema`, reached through the package
  exports map. It owns the stage order, the Zod gate, the compile and duration
  interlock, and per-dimension "did this run" reporting.
- `publishBody` calls it and throws on a non-empty result. The five stages that
  sit after the hash-hit early return keep that position. A re-publish of an
  already-published body stays a no-op.
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
  validation sequence. Both the engine's publish path and the studio's live
  validation read it. Covers the stage order and the "did this run" reporting.
  Covers the split of each registry check into a type-resolution half and a
  config-validation half.

### Modified Capabilities

- `studio-checks-rail`: the registry group widens from one check to three. It
  covers action, assignment strategy and data source types. The rail stops
  holding that group back for the whole session. The CEL group widens to cover
  process chaining targets. "Every publish blocker is visible" becomes true of
  the groups it names.

`definition-store` needs no delta. Publish accepts and rejects the same bodies,
raises the same error classes, and keeps the same stage order. Only the code
path behind that behavior moves.

## Impact

Engine: `src/schema/` gains the new module. `src/engine/definitions.ts`,
`src/engine/registry-check.ts` change. `package.json`'s exports map gains one
entry.

Studio: `packages/web/src/areas/studio/draft/validation.ts` shrinks to a call
and a mapping. `draft/checksRail.ts` gains three groups and loses two exclusion
filters. Every reader of `ValidationResult` updates.

No definition contract change. This change leaves
`src/schema/definition.ts` alone. The engine accepts and rejects exactly the bodies
it accepts and rejects today. Only the studio's view of that verdict widens.

Docs: `docs/authoring-guide.md` states no rule this change alters, so it stays
as it is. `docs/current-state.md` lists exported symbols by hand. It needs the
new export.

Not in scope: unifying `CompileIssue`, `DurationIssue`, `CelIssue` and
`RegistryIssue`. Their three `loc` conventions stay as they are. That work
touches the same four producers. It should follow this change rather than run
beside it.
