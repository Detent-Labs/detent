# authored-content-localization

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

## Requirements

### Requirement: A process declares a required base locale
`ProcessBody` SHALL carry a required `baseLocale: LocaleCode` field naming
the process's fallback locale for all `LocalizedText` content it defines.

#### Scenario: A process body with no baseLocale fails to parse
- **WHEN** a `ProcessBody` omits `baseLocale`
- **THEN** the body fails to parse

#### Scenario: baseLocale must be a well-formed locale code
- **WHEN** a `ProcessBody` sets `baseLocale` to a value that does not match
  the `LocaleCode` format
- **THEN** the body fails to parse

### Requirement: LocalizedText fields require a non-empty base-locale entry
`ProcessBody.label`/`description`, `Step.label`/`description`,
`FieldDef.label`/`description` (including fields nested inside a `group`
field), `FieldOption.label`, and `ViewNote.text` SHALL be `LocalizedText`
(`Record<LocaleCode, string>`) rather than a plain string. Every
`LocalizedText` value found anywhere in the process body SHALL contain a
non-empty entry keyed by the process's `baseLocale`. Entries for other
locales are optional.

`ViewNote.text` is the newest of those keys. It is the first that sits
in a step's `view` rather than in the catalog or on the step itself. It
changes nothing about the rule. The enumeration names it so the key list and
the rule cannot drift apart.

<!-- antislop: allow synonym-rotation -->
<!-- A type error comes from the compiler; the canvas defect below is a shipped bug. -->
The studio's own locale sweep reads this same key list.
`forEachLocalizedEntry` (`packages/web/src/areas/studio/draft/localized-text.ts`)
SHALL visit every position this requirement enumerates, a note's `text`
included. Two studio surfaces share that walk: the content-locale switcher's
option list, and its per-locale gap count. A position absent from the walk
reaches neither of them, and no type error marks its absence.

The inline missing-translation warning does not read that walk.
`missingTranslationWarning` takes one value. Each site declaring a
`LocalizedTextInput` also calls it, directly beside that input. A new
`LocalizedText` position therefore SHALL carry its own call, beside its own
input.

#### Scenario: A label missing the base-locale entry is rejected
- **WHEN** a process declares `baseLocale: "en"` and a step's `label` is
  `{ de: "Prüfen" }` (no `en` entry)
- **THEN** the process body fails to parse

#### Scenario: A label with only the base-locale entry is valid
- **WHEN** a process declares `baseLocale: "en"` and a field's `label` is
  `{ en: "Amount" }`
- **THEN** the process body parses successfully (subject to every other
  invariant)

#### Scenario: A label with the base locale plus additional locales is valid
- **WHEN** a process declares `baseLocale: "en"` and a step's `label` is
  `{ en: "Review", de: "Prüfen" }`
- **THEN** the process body parses successfully (subject to every other
  invariant)

#### Scenario: The invariant applies to nested group fields and field options
- **WHEN** a `group`-type field's nested field, or the `FieldOption.label` of
  a field carrying `options`, is missing the process's `baseLocale` entry
- **THEN** the process body fails to parse, exactly as it would for a
  top-level field's `label`

#### Scenario: A note's text carrying the base locale and one other parses

- **WHEN** a note entry's `text` declares both `de` and `fr`, and the body's
  `baseLocale` is `de`
- **THEN** the process body parses

#### Scenario: A locale only a note declares reaches the switcher

- **WHEN** a draft's only `fr` text is a note's, and every label carries the
  base locale alone
- **THEN** the content-locale switcher offers `fr`, and its gap count for
  `fr` counts every label that lacks one

### Requirement: Locale-scoped text resolves with fallback to the base locale
A pure `resolveLocalizedText(value, locale, baseLocale)` function SHALL
return `value`'s entry for `locale` when present, and `value`'s entry for
`baseLocale` otherwise.

#### Scenario: Requested locale has its own entry
- **WHEN** `resolveLocalizedText({ en: "Review", de: "Prüfen" }, "de", "en")`
  is called
- **THEN** it returns `"Prüfen"`

#### Scenario: Requested locale falls back to the base locale
- **WHEN** `resolveLocalizedText({ en: "Review" }, "de", "en")` is called
- **THEN** it returns `"Review"`

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
