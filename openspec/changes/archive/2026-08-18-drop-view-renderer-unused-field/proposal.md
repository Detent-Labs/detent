## Why

Ponytail finding 67 (`PONYTAIL-AUDIT.md`) names the field
`view.renderer`. It has no reader. The registry check covers actions,
assignment strategies and data sources, but never the renderer. The
form-ui package picks its field renderer from `FieldDef.type`, never
from a step-level plugin slot. No authoring surface in
`packages/web/src/areas/studio` writes it either.

The archived `field-tree-check-consolidation` change (2026-08-18) found
the same result but dropped this deletion from its scope. Its own gate
treats an unrun production-`definitions`-table audit query the same as
a nonzero result. No such environment is reachable from this
repository.

That gate no longer blocks the deletion. This platform has no
deployment yet: no `definitions` table exists anywhere outside this
repository's own databases. The devcontainer's own `definitions` table
returns zero rows for `jsonb_path_exists(body,
'$.workflow.steps[*].view.renderer')`. That confirms, against stored
data, the same zero-producer result the archived change's grep already
found against source code.

## What Changes

- Delete `renderer: plugin.optional()` from the `view` object schema in
  `src/schema/definition.ts`.
- Delete `collectPluginTypeSites`'s dead `view.renderer` site
  (`src/schema/compile.ts`, the `if (s.view?.renderer) pushType(...)`
  line and its doc-comment mention).
- **BREAKING** (publish-time only): an authored body that sets
  `view.renderer` now fails to publish. It reports as an unknown key at
  `steps[i].view.renderer`. That is the existing generic unknown-key
  mechanism: `definition-contract`'s "Authored bodies reject unknown
  keys instead of dropping them" requirement. No authoring surface here
  ever wrote this key. This breaks no first-party author.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `openspec/specs/definition-contract/spec.md` states no requirement
naming `view.renderer`. Its unknown-key-rejection requirement is
already generic over any key a schema does not declare. Removing a
field from the schema exercises that existing requirement, not a new
one. This change sets `skip_specs: true`.

## Impact

- **Code**: `src/schema/definition.ts` (one field deleted),
  `src/schema/compile.ts` (`collectPluginTypeSites`, one dead site
  removed).
- **Callers**: none outside `src/schema/compile.ts` read `view.renderer`.
  A repo-wide grep across `src/`, `packages/form-ui/` and `packages/web/`
  confirms this (design.md carries the search).
- **Data / `definitionHash`**: unaffected for every stored body, since
  none has ever set the key. The only `definitions` table this platform
  has, the devcontainer's own database, confirms this. So does the same
  repo-wide grep for any producer. No migration needed.
