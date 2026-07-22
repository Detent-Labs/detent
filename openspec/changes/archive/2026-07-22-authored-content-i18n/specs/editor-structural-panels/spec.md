## ADDED Requirements

### Requirement: Panels edit localized content through a content-locale-scoped input
Wherever a panel edits `ProcessBody.label`/`description`, `Step.label`/
`description`, `FieldDef.label`/`description`, or `FieldOption.label`, it
SHALL do so through an input bound to the Draft's currently selected
content locale, writing the entered text into that `LocalizedText` value's
entry for that locale. The content locale is independent of the editor's
own UI-chrome locale (`editor-i18n`): switching one SHALL NOT change the
other.

#### Scenario: Editing a label writes to the current content locale's entry
- **WHEN** the current content locale is `de` and an author types into a
  step's label input
- **THEN** the text is written to that step's `label.de` entry, leaving
  `label.en` (or any other existing locale entry) unchanged

#### Scenario: Switching content locale shows that locale's existing text
- **WHEN** an author switches the content locale from `en` to `de` for a
  field whose `label` is `{ en: "Amount", de: "Betrag" }`
- **THEN** the label input displays `"Betrag"`

#### Scenario: Switching content locale does not affect the UI-chrome locale
- **WHEN** an author changes the content-locale switcher
- **THEN** the editor's own interface language (`useLocale()`) is unchanged

### Requirement: A new content locale can be added from the panel
The content-locale switcher SHALL allow adding a locale not yet used
anywhere in the Draft (free-form entry validated against the `LocaleCode`
format), making it selectable and editable without requiring the process's
`baseLocale` to change.

#### Scenario: Adding a new locale makes it selectable
- **WHEN** an author adds locale `fr` via the content-locale switcher
- **THEN** `fr` becomes a selectable content locale for editing every
  localized field in the Draft

#### Scenario: An invalid locale code is rejected
- **WHEN** an author attempts to add a locale code that does not match the
  `LocaleCode` format
- **THEN** the switcher rejects the input and does not add it
