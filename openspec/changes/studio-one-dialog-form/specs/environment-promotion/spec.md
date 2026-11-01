<!-- antislop: allow-file sentence-length passive-voice trailing-negation negation-habit -->
<!-- Why: MODIFIED blocks copy their base wording from the live spec, whose debt a new file counts as a rise. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: Import previews the incoming version before publishing it

Studio SHALL show a preview after the guard passes and before any publish
request. The preview SHALL show the incoming process's `label` and the source
`version` number. A closed Developer view SHALL hold the `key`, the process id
and the source `definitionHash`. It SHALL resolve
`label` through the body's own `baseLocale`, since `label` is a localized-text
map rather than a string.

The preview SHALL NOT compare the incoming body against a remote environment.
The target environment may hold no version of this process at all.

Publishing SHALL happen only after the developer confirms.

#### Scenario: A developer reviews the preview and confirms

- **WHEN** the guard passes for a chosen file
- **THEN** Studio shows `label` and source `version`
- **AND** its closed Developer view holds `key`, the process id and source
  `definitionHash`
- **AND** Studio publishes only after the developer confirms

#### Scenario: A developer cancels the preview

- **WHEN** a developer cancels at the preview
- **THEN** Studio sends no publish request

#### Scenario: The incoming label carries several locales

- **WHEN** the incoming `label` holds an entry for more than one locale
- **THEN** the preview shows the entry for the body's `baseLocale`

### Requirement: The preview warns about a process key another process already holds

Nothing enforces a unique process `key`, so an import can leave two processes
in the target sharing one key. Nothing can delete either one afterwards.

The preview SHALL warn when the target already holds a process with the
incoming `key` under a different `processId`. The warning SHALL print no key
and no id; the Developer view holds the other process's id. The warning SHALL
NOT block the import, because that state can be intentional.

Studio SHALL derive the warning from the process list it has already loaded. It
SHALL send no extra request, and SHALL compare against no remote environment.

#### Scenario: An unrelated process already holds the incoming key

- **WHEN** the target holds a process with the incoming `key` under a different
  `processId`
- **THEN** the preview warns that the key is already in use
- **AND** the developer can still confirm the import

#### Scenario: The target holds the same process already

- **WHEN** the target holds the incoming `key` under the same `processId`
- **THEN** the preview shows no key warning, since this is a re-promotion

#### Scenario: The key is free in the target

- **WHEN** no process in the target holds the incoming `key`
- **THEN** the preview shows no key warning
