## MODIFIED Requirements

### Requirement: Per-field validation errors attach to their matching input

`form-ui`'s `FieldForm` SHALL accept a pre-partitioned `issuesByField` map
(fieldId -> issues) as a prop and attach each entry to the input for the
field it names, rendering an inline message beside that input. `form-ui`
itself has no visibility into a `SubmissionValidationError`'s raw `issues`
array and so cannot detect or surface an issue whose `fieldId` matches no
currently rendered field — that partitioning, including surfacing an
unmatched issue (e.g. in a form-level summary), is each consumer's own
responsibility.

An issue SHALL render as a **localized message**, not as its raw `kind`
discriminator. `form-ui` already takes `locale` as a prop and holds no locale
state, so the message catalog keyed by `issue.kind` lives in `form-ui` — one
message per failure for every consumer, rather than a different one per app.
A `kind` with no catalog entry SHALL fall back to rendering the raw kind, so
that forgetting an entry degrades to today's behavior rather than failing.

The issue list SHALL be a **sibling** of the field's `<label>`, not a child of
it, and SHALL carry an `id` that the control references through
`aria-describedby`. A `<ul>` inside a `<label>` is invalid markup — `label`
permits phrasing content only — and it folds the error text into the control's
accessible name, so a screen reader announces label and error together as the
control's name every time it is focused.

#### Scenario: A validation issue displays beside its field

- **WHEN** a consumer passes an `issuesByField` map with an entry for a field
  currently rendered in the form
- **THEN** that entry renders attached to that field's input

#### Scenario: An issue reads as a sentence, not an enum

- **WHEN** an issue of kind `missing-required` or `option-not-in-list` is
  rendered
- **THEN** the user sees a localized message in the form's locale, not the
  discriminator text

#### Scenario: An unknown issue kind still renders

- **WHEN** an issue's `kind` has no entry in the catalog
- **THEN** the raw kind is rendered rather than an empty message or a crash

#### Scenario: The error text is not part of the control's name

- **WHEN** a field with issues receives focus
- **THEN** its accessible name is its label, and the issues are announced as
  its description via `aria-describedby`

## ADDED Requirements

### Requirement: Required and invalid state are conveyed programmatically, not only visually

Every control `form-ui` renders SHALL carry `aria-required` when the resolved
view marks the field required, and `aria-invalid` when issues are attached to
it, on **every** rendering branch — the seven type branches and the group
members alike. The visual required marker (`*` with a `title`) SHALL remain,
but SHALL NOT be the only signal.

The native `required` attribute MAY be set where it does not introduce
browser-native submission blocking; the engine is the validator, and a native
block would prevent the submission the server is meant to judge. When in
doubt, `aria-required` alone is correct.

`form-ui` is deliberately the one renderer shared by `packages/app` and the
editor Player, so this reaches every participant-facing form at once.

#### Scenario: A required field announces that it is required

- **WHEN** a screen-reader user focuses a field the current step's view marks
  required
- **THEN** it is announced as required

#### Scenario: An invalid field announces that it is invalid

- **WHEN** a field has attached issues
- **THEN** it is announced as invalid, and its description names them

#### Scenario: Every branch is covered

- **WHEN** any of the rendered field types — including a group's members and
  the free-text fallback branch — is required or invalid
- **THEN** the same attributes are present; no branch is exempt

#### Scenario: Native validation does not pre-empt the server

- **WHEN** a form with a required-but-empty field is submitted
- **THEN** the submission still reaches the engine, which is what decides
  whether it is valid
