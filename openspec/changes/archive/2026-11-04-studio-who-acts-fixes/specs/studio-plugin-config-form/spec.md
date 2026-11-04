## MODIFIED Requirements

### Requirement: A generated form replaces the raw JSON textarea for a schema-backed type

The `GET /registry` response may include a config-schema description for
the selected type. WHEN it does, the editor SHALL show one input per
schema property, instead of the raw JSON textarea. The form SHALL commit
the same `{ type, config }` shape the raw JSON path produces today. The
fixed-list, group and person-field strategies take their own controls from
`studio-step-page`, and those commit the same shape.

#### Scenario: Selecting a schema-backed type shows a generated form

- **WHEN** a developer selects the built-in `static` assignment strategy,
  whose schema declares one `candidates: string[]` property
- **THEN** the editor shows its list control for `candidates` and no JSON
  textarea

#### Scenario: The generated form's output matches the existing config shape

- **WHEN** a developer fills the list control for the `static` assignment
  strategy
- **THEN** the committed config is a plain `{ candidates: [...] }` object,
  identical in shape to what the raw JSON textarea would have produced

### Requirement: A purpose-built form serves the instance.query data source type

The generated form covers a flat schema. It shows one input per schema
property. An `"instance.query"` config nests a list of comparison objects. The
generator cannot express that shape, so it falls back to the raw JSON textarea.

The studio SHALL therefore ship a purpose-built form for the
`"instance.query"` data source type. That form SHALL take precedence over
both the generated form and the raw JSON fallback, for that type alone.

It SHALL commit the same `{ type, config }` shape the raw JSON path produces.
<!-- "authoring surface" is a reserved domain term (see CLAUDE.md: "an authoring surface is what the studio presents"), not a synonym for "show" elsewhere in this file. -->
<!-- antislop: allow synonym-rotation -->
Every authoring surface produces the same JSON definition, and this one is no
exception.

Every other type SHALL keep its current path, apart from the assignment
strategies `studio-step-page` gives their own controls. A type whose schema the
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

## ADDED Requirements

### Requirement: A string list keeps the author's text while it parses to the stored list

A string-list config control SHALL hold one value per line. It SHALL show the author's own text while that text parses to the stored list. Any other write to the stored list SHALL replace the text. The stored list SHALL hold each line trimmed, with blank lines dropped.

#### Scenario: Enter starts a second value

- **WHEN** the control holds `requester` and the author presses Enter and types `finance-approver`
- **THEN** the control shows both values on two lines
- **AND** the stored list holds `requester` and `finance-approver`

#### Scenario: A space survives while the author types

- **WHEN** the author types `finance approver` one key at a time
- **THEN** the control shows `finance approver`
- **AND** the stored list holds that one value

#### Scenario: A trailing blank line stores nothing

- **WHEN** the control's text ends in an empty line
- **THEN** the control keeps the empty line
- **AND** the stored list has no empty value

#### Scenario: A write from elsewhere replaces the text

- **WHEN** the control holds text and the raw JSON path writes another list
- **THEN** the control shows the new list, one value per line

### Requirement: A string list states its one-per-line rule on screen

A string-list config control SHALL print its one-per-line rule as visible text. The control SHALL read that text as its accessible description. The rule SHALL NOT stand in an `aria-label` alone. A caption that states the rule SHALL serve as that text, so the control prints the rule once.

#### Scenario: A sighted author reads the rule

- **WHEN** a generated form draws a string-list control
- **THEN** the words "one per line" stand on screen beside the control
- **AND** the control's accessible description holds them

#### Scenario: A caption that states the rule replaces the hint

- **WHEN** a caller's caption already reads "one per line"
- **THEN** the words stand on screen once
- **AND** the control's accessible description holds them

### Requirement: A type change clears the config the old type held

Choosing another type at a registry-backed position SHALL write an empty `config` to the draft. The envelope's `description` SHALL stay. Within one mount of the editor, choosing a type again SHALL restore the config that type last held. The draft SHALL never hold a key of a type it no longer names.

#### Scenario: A stale key leaves the draft

- **WHEN** a step's strategy holds `{ "groupId": "group_it_ops" }` and the author chooses the starter's manager
- **THEN** the draft's `config` reads `{}`
- **AND** a publish meets no config refusal for `groupId`

#### Scenario: A switch back restores the value

- **WHEN** the author chooses the starter's manager and then chooses the group strategy again
- **THEN** the draft's `config` reads `{ "groupId": "group_it_ops" }`

#### Scenario: Another entity starts clean

- **WHEN** the author switches type on one action and then opens another action
- **THEN** the second action's editor has no config of the first

#### Scenario: The rule reaches every registry-backed position

- **WHEN** the author chooses another type on an action or a data source
- **THEN** the draft's `config` reads `{}`

### Requirement: GET /registry names the assignment strategies that refuse an unknown key

`GET /registry` SHALL carry `closedAssignmentStrategyTypes`, the registered strategy types whose config schema refuses a key it does not declare. A schema that admits or strips an unknown key SHALL stay out of the list.

#### Scenario: The list holds a strict schema

- **WHEN** an actor reads `GET /registry`
- **THEN** `closedAssignmentStrategyTypes` holds `org.group-members`, `org.actor-from-field` and `org.manager-of-starter`

#### Scenario: A plain or loose schema is not listed

- **WHEN** a registered strategy's config schema is a plain or a loose object
- **THEN** `closedAssignmentStrategyTypes` omits that type
- **AND** the list omits `static` on that ground
