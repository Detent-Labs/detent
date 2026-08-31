<!-- antislop: allow-file passive-voice sentence-length long-words -->
<!-- The MODIFIED block below carries live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: LocalizedText fields require a non-empty base-locale entry
`ProcessBody.label`/`description`, `Step.label`/`description`,
`FieldDef.label`/`description` (including fields nested inside a `group`
field), `FieldOption.label`, and `ViewNote.text` SHALL be `LocalizedText`
(`Record<LocaleCode, string>`) rather than a plain string. Every
`LocalizedText` value found anywhere in the process body SHALL contain a
non-empty entry keyed by the process's `baseLocale`. Entries for other
locales are optional.

`ViewNote.text` is the newest of those keys, and it is the first that sits
in a step's `view` rather than in the catalog or on the step itself. It
changes nothing about the rule. The enumeration names it so the key list and
the rule cannot drift apart.

The studio's own locale sweep reads this same key list.
`forEachLocalizedEntry` (`packages/web/src/areas/studio/draft/localized-text.ts`)
SHALL visit every position this requirement enumerates, a note's `text`
included. Two studio surfaces share that walk: the content-locale switcher's
option list, and its per-locale gap count. A position absent from the walk
reaches neither of them, and no type error marks its absence.

The inline missing-translation warning does not read that walk.
`missingTranslationWarning` takes one value, and each render site calls it
directly. A new `LocalizedText` position therefore SHALL carry its own call,
beside the input that renders it.

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
