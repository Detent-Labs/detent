<!-- antislop: allow-file long-words passive-voice sentence-length -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: LocalizedText fields require a non-empty base-locale entry
`ProcessBody.label`/`description`, `Step.label`/`description`,
`FieldDef.label`/`description` (including fields nested inside a `group`
field), and `FieldOption.label` SHALL be `LocalizedText`
(`Record<LocaleCode, string>`) rather than a plain string. Every
`LocalizedText` value found anywhere in the process body SHALL contain a
non-empty entry keyed by the process's `baseLocale`. Entries for other
locales are optional.

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
