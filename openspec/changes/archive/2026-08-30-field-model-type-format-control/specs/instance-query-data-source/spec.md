## MODIFIED Requirements

### Requirement: A valueFromField reference resolves to a scalar field of the reading process

`valueFromField` names a field of the publishing process, not the target's.
Publish validation SHALL reject a `valueFromField` that resolves to no field
of the reading process's own catalog. It SHALL also reject one that resolves
to a field whose declared type holds a non-scalar value.

<!-- "render" (the UI act of drawing options) and "display" (display text, process-contract.md's own term) are different concepts here, not synonyms; "render" is this file's own established word, used again below. -->
<!-- antislop: allow synonym-rotation -->
This is an in-process check, unlike the compared field's own type check
above. No target-process lookup happens, since the reference names the
publishing body's own catalog. Left unchecked, a `list`- or `group`-typed
`valueFromField` substitutes an array or an object as the read's comparison
right side. The instance data read then rejects that non-scalar value as
invalid, at resolution time. This happens on every form render and every
submission that reaches the source, not once at publish.

#### Scenario: An unresolvable valueFromField fails the publish
- **WHEN** a `valueFromField` names a field id absent from the reading
  process's own catalog
- **THEN** validation produces a located issue for that data source's config

#### Scenario: A non-scalar valueFromField field fails the publish
- **WHEN** a `valueFromField` names a field of the reading process's own
  catalog whose declared type is `list` or `group`
- **THEN** validation produces a located issue for that data source's config

#### Scenario: A scalar valueFromField field publishes
- **WHEN** every `valueFromField` in a source's `where` names a field of the
  reading process's own catalog whose declared type is scalar
- **THEN** publishing succeeds, subject to the other checks
