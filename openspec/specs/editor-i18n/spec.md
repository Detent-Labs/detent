# editor-i18n

## Purpose

Defines localization of the editor's own UI chrome (panel titles, buttons,
legends, badges): the locale state (current locale, manual switcher,
persistence, default-to-`en`), the UI-string catalog and `t()` lookup, and
the fallback-to-base-locale rule for missing keys. Scoped to the editor's
own interface text — engine-sourced validation/issue messages and
authored process content (`label`/`description` in the Draft/contract)
are explicitly out of scope.

## Requirements

### Requirement: Editor UI-chrome text is localizable
The editor SHALL render its own UI-chrome text (panel titles, buttons,
legends, badges, and similar static UI strings) through a locale-aware
lookup rather than as hardcoded literals, so the rendered language depends
on the current locale. `EditorIssue.message` (engine-sourced validation/
issue text) is explicitly excluded — it is rendered as-is regardless of
locale.

#### Scenario: UI-chrome string resolves to the active locale
- **WHEN** the editor's current locale has a translation for a UI-chrome
  string
- **THEN** the rendered text is that locale's translation, not the
  hardcoded English literal

#### Scenario: Validation issue messages are unaffected by locale
- **WHEN** the editor renders an `EditorIssue.message` in `IssueList` under
  any locale
- **THEN** the text is rendered exactly as returned by the engine
  validator, unchanged by the current locale setting

### Requirement: Default locale is English
The editor SHALL use `en` as its locale whenever no locale has been
explicitly selected and persisted, including first load and a missing or
invalid persisted value.

#### Scenario: First load with no persisted locale
- **WHEN** the editor loads and no locale is present in persisted storage
- **THEN** the active locale is `en`

#### Scenario: Persisted locale is invalid or unrecognized
- **WHEN** the editor loads and the persisted locale value does not match
  any supported locale
- **THEN** the active locale falls back to `en`

### Requirement: Missing translation keys fall back to the base locale
For any UI-chrome string, if the active non-base locale's catalog has no
entry for a given key, the editor SHALL render that key's `en` (base
locale) entry instead of an empty string or the raw key.

#### Scenario: Non-base locale is missing a key present in the base catalog
- **WHEN** the active locale is not `en` and its catalog has no entry for
  a key that exists in the `en` catalog
- **THEN** the editor renders the `en` entry for that key

### Requirement: Locale is manually switchable, persisted, and extensible
The editor SHALL provide a manual control listing every currently
supported locale and invoking a locale change on selection, and SHALL
persist the selected locale so it is restored on subsequent loads. No
automatic browser-language detection is performed. This change SHALL ship
exactly one supported locale (`en`); adding a further locale SHALL require
only a new catalog entry and a `LocaleCode` addition, with no change to
the switcher control, locale state, or lookup implementation.

#### Scenario: Switcher lists only the currently supported locales
- **WHEN** the editor renders and exactly one locale (`en`) is supported
- **THEN** the switcher control offers exactly that one option and offers
  no locale the editor cannot render

#### Scenario: Selected locale persists across reloads
- **WHEN** an author selects a locale via the switcher and then reloads
  the editor
- **THEN** the editor loads with that previously selected locale active,
  not the default

#### Scenario: A new locale requires no switcher or lookup code changes
- **WHEN** a further locale's catalog file and `LocaleCode` entry are added
  in a later change
- **THEN** the switcher lists it and UI-chrome text renders in it without
  modifying the switcher component, `useLocale`, or `useT`

### Requirement: Non-component code receives translated text as a parameter
Editor code that runs outside a React component or hook (e.g. `draft/
file-io.ts`'s file-picker type descriptions, `FileToolbar`'s error-fallback
helper) SHALL NOT itself depend on the UI-chrome catalog or call a
translation hook. It SHALL receive any translated display string it needs
as a parameter, resolved by the calling component.

#### Scenario: File I/O module renders no hardcoded English fallback
- **WHEN** the editor saves, loads, or exports a draft via `draft/
  file-io.ts`
- **THEN** any user-facing description string that module uses (e.g. a
  file-picker type description) was supplied by its caller, not resolved
  internally by that module

#### Scenario: Error-fallback text respects the active locale
- **WHEN** a file operation fails with a non-`Error`, non-`DOMException`
  value and the editor must show a generic fallback message
- **THEN** the rendered fallback text is the active locale's translation,
  not a hardcoded English literal, while an underlying platform error's
  own `message` (when present) is still shown as-is, untranslated — the
  same treatment as engine-sourced validation messages

### Requirement: Locale state is exposed independent of the string catalog
The editor SHALL expose the current locale and a setter for it as a
reusable unit (e.g. a hook) that does not depend on the UI-chrome message
catalog, so other editor features can read or drive the active locale
without importing catalog/lookup machinery they don't need.

#### Scenario: Locale is readable without the UI-string lookup
- **WHEN** editor code needs only the current locale value (not a UI-chrome
  translation)
- **THEN** it can obtain the locale without importing the `t()`/catalog
  lookup
