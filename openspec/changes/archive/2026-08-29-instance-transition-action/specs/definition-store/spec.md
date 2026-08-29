## MODIFIED Requirements

### Requirement: Publish returns its findings beside the version

`publishBody` SHALL return the published version together with a list of
publish findings. A finding reports a condition that does not block the
publish. It is distinct from a validation error, which throws and persists no
version.

The list SHALL be empty when a publish raises no finding. A caller SHALL NOT
have to distinguish an absent list from an empty one.

<!-- "authoring surface" is a reserved domain term (see CLAUDE.md: "an authoring surface is what the studio presents"), not a synonym for "display" elsewhere in this file. -->
<!-- antislop: allow synonym-rotation -->
The engine returns findings rather than leaving them to an authoring surface.
A publish over the HTTP API, and a publish of a hand-authored body, then
report what the studio reports. A studio-only check would report nothing on
either path.

The publish route SHALL carry the findings in its response.

An identical re-publish SHALL return the existing version and an empty finding
list. The hash-hit path returns before validation runs, so it computes no
findings. Reporting a stale set from an earlier publish would be worse than
reporting none.

Two checks produce a finding. `cross-process-validation`'s reference check over
an `"instance.query"` data source produces one. Its path check over an
`instance.transition` action produces the other.

A finding SHALL name the site it came from. A data-source finding names the
data source. An action finding names no data source, because an action is not
one. A finding's identifying name SHALL therefore be optional. A reader SHALL
fall back to the finding's location in the body when the name is absent.

A finding's reference kind SHALL admit `"path"` beside `"step"` and `"field"`.
An action's path reference is neither of the other two.

#### Scenario: A publish raising no finding returns an empty list

- **WHEN** a body publishes and no check reports a finding
- **THEN** the result carries the new version and an empty finding list

#### Scenario: A publish raising a finding returns it with the version

- **WHEN** a body publishes carrying a data source whose reference no live
  target version holds
- **THEN** the result carries the new version and a finding naming that
  reference

#### Scenario: An action finding falls back to its location

- **WHEN** a body publishes carrying an `instance.transition` action whose
  `pathId` no live target version holds
- **THEN** the result carries the new version and a finding whose reference
  kind is `"path"`, naming no data source
- **AND** a reader identifies that finding by its location in the body

#### Scenario: A rejected publish returns nothing at all

- **WHEN** a body fails a publish-time validation check
- **THEN** publish throws, persists no version, and returns no findings

#### Scenario: An identical re-publish returns an empty finding list

<!-- Scenario bullets are structural text OpenSpec matches verbatim; the body, not an actor, is this scenario's subject. -->
<!-- antislop: allow passive-voice -->
- **WHEN** a body whose hash matches an already-published version is published
  again
- **THEN** the result carries the existing version and an empty finding list
