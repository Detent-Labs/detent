<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Draft state is a structural superset of AuthoredProcessBody

**Reason**: `packages/editor` is deleted. `packages/studio` already has its
own, independent Draft model (carried over, not imported, in
`studio-shell-and-drafts`); this capability only ever specified
`packages/editor`'s copy.

**Migration**: None. `packages/studio`'s Draft model is unaffected by this
capability's removal; no separate spec ever existed for it and none is
added by this change.

### Requirement: Editor mints entity ids at creation time

**Reason**: `packages/editor` is deleted. `studio-app`'s existing "Creating a
new process mints a prefixed id client-side" requirement already documents
the equivalent behavior in `packages/studio`.

**Migration**: None.

### Requirement: Draft validation is a real parse through the contract schemas

**Reason**: `packages/editor` is deleted. `packages/studio` already performs
the same real-parse validation through the engine's unmodified publish-time
validators; no separate spec ever existed for Studio's own copy.

**Migration**: None. See `studio-app`'s existing live-validation coverage.
