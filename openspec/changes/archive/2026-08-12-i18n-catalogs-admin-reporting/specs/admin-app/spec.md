<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     openspec/specs/admin-app/spec.md carries the same directive for the same
     reason. A delta that lints under a stricter rule than the file it merges
     into would read differently from every requirement around it. -->

## ADDED Requirements

### Requirement: The admin area renders its wording from a catalog

Every string the admin area shows an operator SHALL come from the area's own
catalog through `t(locale, key)`. The catalog SHALL carry an English and a
German map, and both maps SHALL declare the same key set.

The area SHALL render in the locale the shell holds. A locale change in the
account menu SHALL change the wording of every admin screen without a reload.

This covers screen headings, tab labels, column headers, button labels, empty
states, waiting states, confirmation prompts and the error text the area
derives from a failed request.

#### Scenario: A screen renders its catalog value

- **WHEN** an operator opens an admin screen in a supported locale
- **THEN** every heading, label and empty state on it reads its value from the
  admin catalog for that locale

#### Scenario: A locale change re-renders the area

- **WHEN** an operator switches the account menu's language while an admin
  screen is open
- **THEN** that screen re-renders its wording in the newly chosen locale

#### Scenario: Both locales declare the same keys

- **WHEN** the admin catalog's English and German maps are compared
- **THEN** each declares the same key set, so no key falls back to a missing
  value

### Requirement: A machine value stays untranslated

The admin area shows values the engine matches exactly. An instance id, a
process id, a definition hash, a version number, a role name, a data list key,
a CEL source, an outbox status token and a timer's stored fire instant are
such values.

The area SHALL render each one as the engine stores it. No such value SHALL
enter the catalog, and no such value SHALL change with the locale.

#### Scenario: An id reads the same in either locale

- **WHEN** the same instance row is shown in English and in German
- **THEN** its instance id, definition hash and version read identically in
  both

#### Scenario: A role name reads the same in either locale

- **WHEN** the users screen lists an account's roles in either locale
- **THEN** each role reads as the engine stores it, such as `system:admin`

### Requirement: A printed timestamp follows the chosen locale

The admin area prints stored instants on the instances list, the instance
record, the timers screen and the data lists screen. Each SHALL follow the
locale the shell holds, not the browser's own language setting.

An operator whose browser reports English and who picks German SHALL read
German dates.

#### Scenario: A timestamp follows the picked locale

- **WHEN** an operator whose browser reports English picks German, and opens a
  screen that prints a stored instant
- **THEN** that instant prints in the German locale's date format
