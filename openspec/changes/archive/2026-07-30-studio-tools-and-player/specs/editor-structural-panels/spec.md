<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Panels cover every authorable entity in the Draft

**Reason**: `packages/editor` is deleted. `packages/studio` already carries
the panels forward as the inspector beside the canvas (`studio-shell-and-drafts`,
`studio-canvas`); no separate spec ever existed for Studio's own copy.

**Migration**: None. See `studio-app`'s "Editing is a canvas-primary surface
with the carried-over panels as an inspector..." requirement.

### Requirement: Panels expose wait-state and guard-priority concepts directly

**Reason**: `packages/editor` is deleted along with its panels.
`packages/studio`'s carried-over panels already expose the same concepts.

**Migration**: None.

### Requirement: Panels edit localized content through a content-locale-scoped input

**Reason**: `packages/editor` is deleted along with its panels.
`packages/studio`'s carried-over panels already have their own
content-locale editing (`ContentLocaleSwitcher`, `LocalizedTextInput`).

**Migration**: None.

### Requirement: A new content locale can be added from the panel

**Reason**: `packages/editor` is deleted along with its panels.
`packages/studio`'s carried-over panels already have this capability.

**Migration**: None.
