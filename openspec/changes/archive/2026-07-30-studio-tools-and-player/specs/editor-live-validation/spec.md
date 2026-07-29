<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Validation runs on every Draft change using the engine's publish-time validators

**Reason**: `packages/editor` is deleted. `packages/studio` already runs the
same engine publish-time validators live against its own Draft model; no
separate spec ever existed for Studio's copy, since `studio-app`'s "Editing
is a canvas-primary surface..." requirement already documents it running
there.

**Migration**: None.

### Requirement: Located issues map onto the entity that produced them

**Reason**: `packages/editor` is deleted along with its issue-to-entity
mapping. `validation-issue-mapping-consolidation` (also retired by this
change) covered the same internal mapping mechanism, exclusively for
`packages/editor`.

**Migration**: None. `packages/studio`'s own issue mapping is unaffected by
this capability's removal.

### Requirement: Externally-scoped checks render as not-checked, never as a false pass

**Reason**: `packages/editor` is deleted along with the live-validation
surface this requirement governed.

**Migration**: None. `packages/studio`'s own validation display is
unaffected by this capability's removal.

### Requirement: A missing base-locale entry surfaces as a located issue

**Reason**: `packages/editor` is deleted along with the live-validation
surface this requirement governed.

**Migration**: None. `packages/studio`'s own validation display is
unaffected by this capability's removal.
