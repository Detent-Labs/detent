## REMOVED Requirements

### Requirement: Select and multiselect share one option-list rendering

**Reason**: This capability was scoped explicitly to
`packages/editor/src/player/FieldInput.tsx` as an editor-internal mechanism
concern. That file relocates in full to the new `packages/form-ui` package (see
the `form-ui` capability), so the subject this requirement constrains no
longer exists in the editor. The underlying guarantee — one shared
option-list-building expression, not two independently-maintained copies — is
preserved, re-specified under `form-ui`'s equivalent structural requirement.

**Migration**: No caller-visible change; `editor-player`'s behavioral
requirement ("Field rendering covers every BaseFieldType") is unaffected,
since it already described observable Player behavior rather than file
location. Any reference to this consolidation spec should point to `form-ui`
going forward.

### Requirement: Free-text-fallback types share the plain text-input branch

**Reason**: Same relocation as above — this mechanism constraint moves with
`FieldInput.tsx` out of `packages/editor` into `packages/form-ui`.

**Migration**: Re-specified under `form-ui`'s equivalent structural
requirement; no behavior change for either the editor's Player or any other
consumer.
