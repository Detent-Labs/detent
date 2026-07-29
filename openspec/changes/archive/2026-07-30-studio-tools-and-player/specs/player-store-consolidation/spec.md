<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Player store request lifecycle shares one implementation

**Reason**: This was an engineering-hygiene constraint exclusively about
`packages/editor/src/player/`'s own request-lifecycle code, naming no
`packages/studio` component. `packages/editor` is deleted, and its Player is
carried over into `studio-player`.

**Migration**: None. Whether `studio-player`'s carried-over request-lifecycle
code keeps this same shared-implementation property is an implementation
detail of that capability, not separately re-specified here.

### Requirement: Locale-text lookup is NOT consolidated — two divergent implementations exist

**Reason**: This requirement documented a known, unfixed gap specific to
`packages/editor/src/player/locale-text.ts`'s locale-blind step-label
resolution, diverging from `form-ui`'s locale-aware field-label resolution.
`packages/editor` is deleted.

**Migration**: The carried-over `locale-text.ts` in `studio-player` inherits
the same locale-blind behavior unless separately fixed — this change does
not fix it. It remains a known gap, now untracked by any capability's
requirements rather than deliberately documented as one; fixing it is a
separate, future decision.
