## Context

See proposal.md for motivation. A repo-wide grep across `src/`,
`packages/form-ui/` and `packages/web/` for `renderer` found exactly
three lines that reference `View.renderer`.

- `src/schema/definition.ts:464`: the field declaration,
  `renderer: plugin.optional()`.
- `src/schema/compile.ts:583`: `collectPluginTypeSites`'s dead site,
  `if (s.view?.renderer) pushType(s.view.renderer,
  \`${sloc}.view.renderer\`)`.
- `src/schema/compile.ts:570`: a doc-comment line. It lists every
  `Plugin.type` position `collectPluginTypeSites` visits, naming
  `view.renderer.type` among them.

No other module reads or writes the field. The form-ui package picks
its field renderer from `FieldDef.type` alone. No
`packages/web/src/areas/studio` control binds to it.

The prior `field-tree-check-consolidation` change (archived 2026-08-18)
found this same result. It gated the deletion on a production-
`definitions`-table audit query. Deleting a schema field changes the
canonical JSON of any stored body that ever set it. That moves
`definitionHash` and can strand a pinned instance (see that change's
design.md, "Risks"). This platform has no deployment, so no such table
exists outside this repository. A query against the devcontainer's own
`definitions` table, the only one that exists, returned zero rows for
`jsonb_path_exists(body, '$.workflow.steps[*].view.renderer')`.

## Goals / Non-Goals

**Goals:**
- Delete `view.renderer` from the definition contract.
- Close its two now-dead references in `src/schema/compile.ts`.
- Record the exact blast-radius check this deletion relied on. A later
  reader should be able to verify the reasoning without re-running it.

**Non-Goals:**
- No new field-catalog capability, no replacement for `view.renderer`.
  This change deletes the field. It migrates nothing.
- No `packages/web` change. No area or form-ui code reads the field.
- No data backfill. The audit found zero rows. Step 3 of the Migration
  Plan below covers what happens if a later, real-deployment audit ever
  disagrees.

## Decisions

- **Delete outright, not deprecate in place.** A field with no reader
  and no producer carries no migration path to protect. Keeping it
  optional but unused would only grow the definition contract's
  surface, for no reader to ever exercise.
- **"No deployment exists" beats "environment unreachable"**. The
  archived change's own gate refused to treat an unreachable
  environment as a zero-row result. A real deployment might still
  exist somewhere the gate could not see. That caution does not apply
  here.
- The platform owner confirms no deployment exists at all. So there is
  no possible location for a nonzero row to hide. The devcontainer's
  own `definitions` table is not a stand-in for a production snapshot.
  It is the only `definitions` table this platform has ever had, and it
  returns zero rows.
- **No spec delta.** The `definition-contract` spec's unknown-key-
  rejection requirement is generic over any key a schema does not
  declare. Deleting `view.renderer` exercises that existing requirement
  on one more key. It adds no new rule. This matches the precedent set
  by the archived `drop-definition-status-unused-members` change, which
  narrowed an unused enum under the same `skip_specs: true` reasoning.

## Risks / Trade-offs

- [An unaccounted-for deployment stored `view.renderer`] -> that
  instance would fail on its next read or migration. `rehydrate`
  (`src/engine/store.ts`) or `migrateOne`
  (`src/engine/migration.ts`) would throw a pin-mismatch after this
  change ships.
- This design records the exact query run and its zero-row result. A
  future incident then traces back to a documented, checked
  assumption, not a silent one. If the assumption is wrong, the fix is
  a data backfill. Strip the unread key from the affected stored rows,
  before this schema change is re-applied. A schema rollback alone
  would not fix it.
- [A future author copies an old example showing `view.renderer`] ->
  that reference does not exist. A repo-wide grep of `examples/`,
  `docs/` and `openspec/specs/` found no such reference, for either
  `view.renderer` or view-context `renderer:`.

## Migration Plan

1. Delete the field and its two dead references (see What Changes).
2. No data migration. The zero-row audit result means no stored body's
   canonical form changes.
3. Suppose a later, real-deployment audit finds a nonzero-row result
   for this predicate, against a genuine production `definitions`
   table. That contradicts this design's premise. Treat it as grounds
   to revert this change and re-scope: back-fill the affected rows
   first, or defer the deletion again.
4. Rollback: revert the commit. No stored row needs unwinding, since
   step 2 makes no data change.

## Open Questions

None.
