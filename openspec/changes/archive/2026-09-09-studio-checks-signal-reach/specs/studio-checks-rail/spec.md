## ADDED Requirements

### Requirement: An issue's source prints as a label

Where the checks rail or an issue list names an issue's source (`zod`,
`cel`, `registry`, `duration`, `structural`, `view`), that name SHALL
print as a small, mono-faced label, set apart from the message by its own
visual treatment. It SHALL NOT print as a bracket-wrapped prefix inline in
the message's own text.

The source name itself stays the untranslated machine value this
validation pipeline defines. This requirement asks for no plain-language
translation of it. `design-language`'s own rule already reserves mono,
untranslated text for exactly this kind of machine-defined category name.

Every place an issue's source prints SHALL use the same label treatment.
The full grouped list's per-group heading and a per-entity issue list's
per-line source both qualify.

#### Scenario: A per-entity issue's source prints as a label

- **WHEN** a field's own issue list holds an issue whose source is `zod`
- **THEN** the source prints as a small mono label reading "ZOD"
- **AND** the message text beside it has no bracket-wrapped prefix

#### Scenario: The full grouped list and a per-entity list agree

- **WHEN** the same issue renders in the Checks tab's full grouped list and
  in a field's own per-entity issue list
- **THEN** both name the issue's source with the same label treatment
