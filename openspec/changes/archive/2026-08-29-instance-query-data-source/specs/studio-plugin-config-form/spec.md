## ADDED Requirements

### Requirement: A purpose-built form serves the instance.query data source type

The generated form covers a flat schema. It shows one input per schema
property. An `"instance.query"` config nests a list of comparison objects. The
generator cannot express that shape, so it falls back to the raw JSON textarea.

The studio SHALL therefore ship a purpose-built form for the
`"instance.query"` data source type. That form SHALL take precedence over
both the generated form and the raw JSON fallback, for that type alone.

It SHALL commit the same `{ type, config }` shape the raw JSON path produces.
Every authoring surface produces the same JSON definition, and this one is no
exception.

Every other type SHALL keep its current path. A type whose schema the
generator covers keeps the generated form. A type with no declared schema
keeps the raw JSON textarea.

#### Scenario: Selecting the instance.query type shows its own form
- **WHEN** a developer selects the `"instance.query"` data source type
- **THEN** the editor shows that type's purpose-built form, and neither the
  generated form nor the raw JSON textarea

#### Scenario: The form commits the ordinary envelope shape
- **WHEN** a developer fills the purpose-built form
- **THEN** the committed value is a plain `{ type, config }` object, identical
  in shape to what the raw JSON textarea would have produced

#### Scenario: Another data source type keeps its generated form
- **WHEN** a developer selects the `"db.list"` data source type
- **THEN** the editor shows the generated form, unchanged

### Requirement: The instance.query form picks references rather than accepting free text

The form SHALL offer a picker for the target process, drawn from the published
processes. After that pick, the form SHALL offer pickers for that process's
steps and for its fields. Those pickers SHALL draw from the union of every
published version's catalog and step set. This is deliberately broader than
the publish-time check's own union. That check scopes itself to versions
holding live instances (see `cross-process-validation`). Fetching the
narrower, live-instance-scoped union from the studio would need a new
endpoint.

That choice waits on design.md's own Open Questions section. A reference can
sit inside this broader union but outside the narrower one. The form does not
mark that reference stale. The publish-time check still reports it as a
finding.

Free-text entry of an id SHALL NOT be the primary path. An opaque id typed by
hand is the error the type picker already removed for a plugin `type`. The
same reasoning applies to a step id and a field id.

Each picker SHALL mark a reference the union does not carry. The publish-time
check reports such a reference rather than rejecting it, so the author needs to
see it while authoring.

A comparison row SHALL offer the target field, the operator, and a right side.
The right side SHALL offer a literal or a field of the process the author is
editing.

#### Scenario: Picking a process offers its steps
- **WHEN** a developer picks a target process in the form
- **THEN** the step picker offers that process's steps

<!-- Scenario headers stay byte-identical: the OpenSpec archive step matches them by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A stale reference is marked in the picker
- **WHEN** the configuration names a field id no published target version
  declares
- **THEN** the form marks that reference

#### Scenario: A comparison offers both right sides
- **WHEN** a developer adds a comparison row
- **THEN** the row offers a literal right side and a field of the process the
  author is editing

### Requirement: The raw JSON escape hatch stays open for the instance.query type

An author SHALL be able to switch the `"instance.query"` config from its
purpose-built form to the raw JSON textarea. A schema-backed type already
allows that switch.

The JSON view is the escape hatch for what no builder expresses, and it stays
first-class. A purpose-built form does not close it.

#### Scenario: An author switches the instance.query config to raw JSON
- **WHEN** a developer editing an `"instance.query"` config chooses the raw
  JSON path
- **THEN** the editor shows the textarea carrying that config, and accepts an
  edit to it
