<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     openspec/specs/reporting-app/spec.md carries the same directive for the
     same reason. A delta that lints under a stricter rule than the file it
     merges into would read differently from every requirement around it. -->

## ADDED Requirements

### Requirement: The reporting area renders its wording from a catalog

Every string the reporting area shows a process owner SHALL come from the
area's own catalog through `t(locale, key)`. The catalog SHALL carry an
English and a German map, and both maps SHALL declare the same key set.

The area SHALL render in the locale the shell holds. A locale change in the
account menu SHALL change the wording of every reporting screen without a
reload.

This covers the three view headings, the date range control's labels, the
scope note each view carries, the empty state, the waiting state and the
failure note.

#### Scenario: A view renders its catalog value

- **WHEN** a process owner opens a reporting view in a supported locale
- **THEN** its heading, controls, scope note and empty state read their values
  from the reporting catalog for that locale

#### Scenario: A locale change re-renders the area

- **WHEN** a process owner switches the account menu's language while a
  reporting view is open
- **THEN** that view re-renders its wording in the newly chosen locale

#### Scenario: Both locales declare the same keys

- **WHEN** the reporting catalog's English and German maps are compared
- **THEN** each declares the same key set, so no key falls back to a missing
  value

### Requirement: A duration reads its units from the catalog

The reporting area prints an elapsed time as a largest-fitting-unit duration,
such as `4.5 h`. It SHALL take each unit suffix from a catalog key rather than
from a literal. It SHALL print the decimal part with the locale's own
separator, so German reads `4,5`. It SHALL keep the figure in the mono face
and right-aligned in both locales.

The figure beside a measuring rule SHALL stay the content. The rule itself
carries no wording.

#### Scenario: A duration suffix follows the locale

- **WHEN** a view prints a median or an average as a duration
- **THEN** each unit suffix in it comes from a catalog key for the chosen
  locale

#### Scenario: A decimal separator follows the locale

- **WHEN** a view prints a duration with a decimal part in German
- **THEN** the figure carries a comma, not a full stop

#### Scenario: A duration column stays aligned in either locale

- **WHEN** the same table of durations is shown in English and in German
- **THEN** the figures stay right-aligned in both

### Requirement: A sentence carrying a count is one catalog key per form

The reporting area states how many instances a view excludes. It SHALL NOT
assemble that sentence from fragments. Each grammatical form SHALL be one
catalog key holding the whole sentence, with the count substituted into it.

A translator has to see the whole sentence. A count-bearing sentence has a
singular and a plural form in English and in German alike.

#### Scenario: A singular count reads as one sentence

- **WHEN** exactly one instance is excluded
- **THEN** the view shows the singular form's catalog value with the count
  substituted into it

#### Scenario: A plural count reads as one sentence

- **WHEN** more than one instance is excluded
- **THEN** the view shows the plural form's catalog value with the count
  substituted into it
