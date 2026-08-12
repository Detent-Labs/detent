<!-- antislop: allow-file passive-voice -->
<!-- passive-voice: SHALL-form normative spec prose, the convention the base
     spec at openspec/specs/studio-plugin-config-form/spec.md already follows. -->

## ADDED Requirements

### Requirement: A list over a fixed value set renders as pickers, not free text

A config schema may declare an array whose entries come from a fixed value
set. WHEN it does, `GET /registry` SHALL describe that property with its value
set attached. The editor SHALL then offer one checkbox per value, in place of
the free-text control an open-ended array gets.

A free-text array renders today as one text area holding newline-separated
values. It has no rows, so a picker cannot sit in one. The whole control
gives way instead.

Without this rule such a property falls outside the described subset. One
undescribable property drops the whole type's description. The editor then
shows the raw JSON textarea for every other property too. A
`notification.email` action would lose its generated form entirely.

The committed config SHALL stay a plain array of the chosen strings. That is
the same shape the raw JSON path produces.

A rule spanning two properties SHALL stay a publish check. The requirement "A
config schema carrying a cross-field rule still yields a generated form"
already sets that placement. So `notification.email` shows no inline issue for
two empty recipient lists, and publish rejects that body.

#### Scenario: A fixed-value list shows one checkbox per value

- **WHEN** a developer selects `notification.email`, whose schema declares a
  `toActors` list over `candidate`, `claimant` and `starter`
- **THEN** the editor shows three labelled checkboxes for that property, and
  no free-text control

#### Scenario: The rest of the type keeps its generated form

- **WHEN** a developer selects a type declaring both a fixed-value list and
  ordinary string properties
- **THEN** the editor shows a generated form for every property, and no raw
  JSON textarea

#### Scenario: The committed shape is a plain array of strings

- **WHEN** a developer ticks two boxes in a fixed-value list
- **THEN** the committed config holds a plain array of those two strings

#### Scenario: A free-text list is unaffected

- **WHEN** a developer selects the built-in `static` assignment strategy,
  whose `candidates` list carries no fixed value set
- **THEN** the editor keeps its free-text control for that property

#### Scenario: Two empty recipient lists reach publish, not the form

- **WHEN** a developer leaves both `to` and `toActors` empty
- **THEN** the form shows no inline issue for either one
- **AND** publish rejects the body with a located config-validation issue
