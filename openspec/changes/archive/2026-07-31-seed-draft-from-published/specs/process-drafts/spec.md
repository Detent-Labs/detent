<!-- antislop: allow-file passive-voice -->
<!-- WHEN/THEN scenarios name a condition, not an actor. Every spec under
     openspec/specs/ carries the same passive phrasing. -->

## ADDED Requirements

### Requirement: A save may declare the published version the draft derives from

`saveDraft` SHALL accept an optional `baseVersion` in its input, and
`PUT /drafts/:processId` SHALL accept the same field in its envelope. A save
that carries it SHALL store it in the draft's `base_version` column. A save
that omits it SHALL leave the stored `base_version` unchanged. An ordinary
editing save therefore does not clear a base that a seed or a publish
stamped.

`markDraftPublished` SHALL keep stamping `base_version` after a publish. The
two writers agree on the column's meaning: the published version this draft
was last identical to.

The envelope check SHALL treat `baseVersion` as it treats `revision`. It
SHALL be a positive integer when supplied, and a violation SHALL raise
`RequestShapeError` and SHALL leave any stored draft untouched.

`saveDraft` SHALL additionally reject a `baseVersion` that names no published
version of that process, with the same error and the same guarantee. A draft
body is opaque client state. A base version is a reference into
`definitions`. An unresolvable reference would leave the Versions screen
offering a comparison it cannot make. This check reads `definitions`. It does
not relax the rule that no engine path other than `drafts.ts` reads
`drafts.body`.

#### Scenario: A save declares its base version

- **WHEN** a draft is saved with `baseVersion` naming a published version
- **THEN** the stored `base_version` is that version, and `listDrafts`
  reports it

#### Scenario: A save without the field preserves the stored base

- **WHEN** a draft with a stamped `base_version` is saved again without
  `baseVersion`
- **THEN** the stored `base_version` is unchanged

#### Scenario: An unresolvable base version is refused

- **WHEN** a save supplies a `baseVersion` for which that process has no
  published version
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: A malformed base version is refused

- **WHEN** a save supplies `baseVersion` as zero, a negative number, a
  non-integer or a non-number
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: Publishing still stamps the base version

- **WHEN** a draft is published
- **THEN** `base_version` is the version the publish produced, whatever the
  draft carried before
