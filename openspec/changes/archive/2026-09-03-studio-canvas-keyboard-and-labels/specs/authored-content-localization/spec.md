## Purpose

<!-- antislop: allow sentence-length passive-voice synonym-rotation -->
<!-- Copied byte for byte from the live Purpose; "display text" is its word and surface is the project's domain term. -->
Defines the locale-keyed shape of authored display text in the contract
(`ProcessBody`/`Step`/`FieldDef`/`FieldOption` `label`/`description`), the
process-declared `baseLocale` fallback, the structural invariant that
enforces it, and the pure fallback-to-base-locale resolution function.
Authoring-facing-only text (`Path.label`/`description`, `Timer.description`,
`Plugin.description`) is out of scope and stays a plain string.

Also covers how a UI surface calls that resolution function. A surface that
prints authored text is where the fallback either reaches the author's chosen
locale or fails to. That rule needs one home, and it is this one.

## ADDED Requirements

### Requirement: A studio surface displaying authored text resolves it for the content locale

A studio surface that prints a `LocalizedText` value SHALL resolve it through
`resolveDraftLocalizedText`. It SHALL resolve against the studio's content
locale, with fallback to the draft's `baseLocale`. A raw entry read, and a
fallback chain that tries another key first, both defeat the content-locale
switcher.

Where a surface falls back to a non-localized value, that fallback SHALL come
after the resolution, never before it. A step's `key` is the case this rule
covers. A key is always there, so a chain that tries the key first never
reaches the label at all.

The canvas is the surface that carried that defect. Its node printed the
step's key, and printed it twice. The content-locale switcher changed nothing
there. Two step headings carried the same defect, in `StepsPanel` and in the
form editor. Each printed a key and reached no label.

#### Scenario: The content locale reaches every surface that prints a label

- **WHEN** an author switches the studio's content locale, and a step carries
  a translation in the chosen locale
- **THEN** every studio surface printing that step's label prints the
  translation

#### Scenario: A step heading prints the label, not the key

- **WHEN** a step carries a key and a label that resolves to a non-empty
  string
- **AND** a surface prints one name for that step
- **THEN** the canvas node, the step inspector heading and the form editor
  heading all print the resolved label

#### Scenario: A non-localized fallback comes last

- **WHEN** a surface prints a step whose label resolves to a non-empty string
- **THEN** it prints the resolved label, not the step's key
