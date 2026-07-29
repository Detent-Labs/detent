<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Repo is a Bun workspace with no engine file moves

**Reason**: `packages/editor` is deleted in full; there is no editor package
left for this workspace-boundary requirement to govern.

**Migration**: No author-facing change. The engine package's own layout is
untouched; `studio-app`'s existing workspace-boundary requirement already
governs the surviving frontend packages.

### Requirement: Engine package restricts its exports to the contract surface

**Reason**: This requirement described the exports map from `packages/editor`'s
perspective as a consumer. `packages/editor` is deleted; `studio-app`'s
existing requirement already covers the same exports-map restriction for
`packages/studio`.

**Migration**: None. The engine's `exports` map itself is unchanged by this
deletion.

### Requirement: New editor package lives under packages/editor

**Reason**: `packages/editor` is deleted in full.

**Migration**: None. `packages/studio` is the replacement frontend for every
capability this package provided; it already exists at
`packages/studio`.
