## ADDED Requirements

### Requirement: The content-locale switcher shows a per-locale translation-gap count

For each locale `ContentLocaleSwitcher` offers, the studio SHALL count
`LocalizedText` entries with a gap. A counted entry carries the draft's
`baseLocale` value but lacks that locale's own value. The switcher SHALL
show this count next to the locale. It SHALL show nothing extra for a
locale with a count of zero. The draft's own `baseLocale` SHALL never
carry a count against itself.

An entry that lacks even the `baseLocale` value SHALL NOT count as a gap
for any other locale. The existing `EditorIssue` for a missing base-locale
value already flags that entry.

#### Scenario: A locale with translation gaps shows its count

- **WHEN** a draft's `de` locale has entries with a `baseLocale` value but
  no `de` value
- **THEN** the content-locale switcher shows `de` with that count

#### Scenario: A fully-translated locale shows no count

- **WHEN** every entry with a `baseLocale` value also carries a `de` value
- **THEN** the content-locale switcher shows `de` with no count suffix

#### Scenario: The base locale never shows a gap count

- **WHEN** the draft's `baseLocale` is `en`
- **THEN** the content-locale switcher shows `en` with no count, regardless
  of any other locale's gaps

### Requirement: A LocalizedText entry missing the current locale draws an inline warning

Take the studio's currently selected `contentLocale`. Take an entry that
carries the draft's `baseLocale` value but lacks that locale's own value.
That entry SHALL draw a warning next to its `LocalizedTextInput`. The
warning SHALL NOT be an `EditorIssue`, and SHALL NOT block or delay
publishing.

It SHALL draw at every `LocalizedTextInput` site:

- the process label
- each step's label and description
- each field's label and description
- each field option's label

An entry that lacks the `baseLocale` value SHALL NOT draw this warning.
The existing base-locale `EditorIssue` already flags it. The warning
SHALL NOT draw when `contentLocale` equals `baseLocale`.

#### Scenario: A step label missing the current locale draws a warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's step has a
  `label` carrying an `en` (base locale) value but no `de` value
- **THEN** the studio shows a warning next to that step's label input

#### Scenario: An entry with the current locale filled in draws no warning

- **WHEN** a draft's field `label` carries both the base-locale value and
  the current `contentLocale`'s value
- **THEN** the studio shows no warning next to that field's label input

#### Scenario: Viewing the base locale draws no translation warning

- **WHEN** the studio's `contentLocale` equals the draft's `baseLocale`
- **THEN** the studio shows no missing-translation warning anywhere

#### Scenario: The warning does not block publishing

- **WHEN** an author publishes a draft carrying a missing-translation
  warning
- **THEN** the publish succeeds
