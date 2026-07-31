# environment-promotion Specification

## Purpose
Moves a published process definition from one environment to another as a
file. A developer exports a version in the source Studio and imports it in the
target Studio. The target publishes it under the source `processId`.
## Requirements
### Requirement: A published version exports as a self-describing JSON file

Studio SHALL offer an export action for a published version. The action SHALL
produce a downloadable `.json` file. The file SHALL carry the version's
`processId`, `version`, `definitionHash` and compiled `body`.

The exported `body` SHALL be the compiled body the source environment stores,
byte for byte. Export SHALL NOT convert it back to the authored shape.

`version` and `definitionHash` describe the source environment only. Import
SHALL ignore both, because the target environment mints its own version number
and computes its own hash.

#### Scenario: A developer exports a published version

- **WHEN** a developer with the developer role exports a published version
- **THEN** the browser downloads a `.json` file holding `processId`, `version`,
  `definitionHash` and `body`
- **AND** the `body` equals the compiled body that environment resolves for
  that version, including its injected cancel sink

#### Scenario: Export never offers an unpublished draft

- **WHEN** a process has a draft but no published version
- **THEN** no export action is reachable for that process

### Requirement: Studio checks an import file's shape before any request

Studio SHALL parse a chosen import file client-side. It SHALL confirm that the
text parses as JSON. It SHALL confirm that the parsed value is an object
carrying a string `processId` and an object `body`.

The check is a guard against a wrong file, not a second implementation of the
definition contract. Studio SHALL NOT validate the `body` against the schema
client-side. The server already does that on publish.

#### Scenario: The file does not parse as JSON

- **WHEN** a developer chooses a file whose text is not valid JSON
- **THEN** Studio reports the error inline
- **AND** Studio sends no publish request

#### Scenario: The file lacks a required key

- **WHEN** a developer chooses a JSON file without `processId`, or without
  `body`
- **THEN** Studio reports the missing key inline
- **AND** Studio sends no publish request

#### Scenario: A file exported by this feature passes the guard

- **WHEN** a developer chooses a file that a previous export produced
- **THEN** the guard passes
- **AND** Studio shows the import preview

### Requirement: Import previews the incoming version before publishing it

Studio SHALL show a preview after the guard passes and before any publish
request. The preview SHALL show the incoming process `key`, its `label`, the
source `version` number and the source `definitionHash`. It SHALL resolve
`label` through the body's own `baseLocale`, since `label` is a localized-text
map rather than a string.

The preview SHALL NOT compare the incoming body against a remote environment.
The target environment may hold no version of this process at all.

Publishing SHALL happen only after the developer confirms.

#### Scenario: A developer reviews the preview and confirms

- **WHEN** the guard passes for a chosen file
- **THEN** Studio shows `key`, `label`, source `version` and source
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
incoming `key` under a different `processId`. The warning SHALL NOT block the
import, because that state can be intentional.

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

### Requirement: Import publishes under the source processId through the existing publish route

Import SHALL publish through the existing process-create route, sending the
`processId` and `body` from the file. It SHALL NOT mint a new `processId` and
SHALL NOT rewrite any reference inside the body. It SHALL send the compiled
`body` unchanged, and SHALL NOT convert it back to the authored shape first.

Preserving the id keeps a subprocess reference inside a promoted body valid,
since a subprocess reference resolves by `processId` alone. The developer
promotes a subprocess child before its parent, the same child-first order the
seed script already uses.

#### Scenario: A version promoted into an empty target environment

- **WHEN** a developer imports an exported file into an environment holding no
  version of that process
- **THEN** the target publishes version 1 of that process under the source
  `processId`
- **AND** the resulting `definitionHash` equals the source `definitionHash`

#### Scenario: A developer imports the same file twice

- **WHEN** a developer imports the same file again into the same environment
- **THEN** the target mints no new version
- **AND** Studio reports the existing version and hash

#### Scenario: A developer imports a parent before its subprocess child

- **WHEN** a developer imports a process whose subprocess reference names a
  `processId` the target does not hold
- **THEN** the existing cross-process validation rejects the publish
- **AND** Studio shows the error the server returned

### Requirement: A refused publish keeps its located detail, inside the dialog

The publish chain locates every error it raises. A registry, CEL, duration,
compile or schema error names a path into the body. A cross-process error names
the unresolved child. Studio SHALL show that detail. It SHALL NOT reduce a
publish rejection to a generic server error.

Studio SHALL show a refused publish inside the preview dialog, and SHALL keep
the dialog open. A modal dialog occupies the browser's top layer. The browser
dims everything on the screen behind it and takes it out of reach.

A file the client-side guard rejects never opens a dialog, so its message
belongs on the screen instead.

#### Scenario: The server rejects the incoming body

- **WHEN** the server refuses a confirmed import and names located errors
- **THEN** the dialog stays open
- **AND** it shows each error with its location in the body
- **AND** the developer can cancel or retry from that same dialog

#### Scenario: The server rejects an unresolved subprocess reference

- **WHEN** a confirmed import names a subprocess child the target does not hold
- **THEN** the dialog shows the server's own message naming that child

### Requirement: Promotion needs the same roles publishing already needs

Export SHALL need the developer role, which Studio access already requires.
Import SHALL need the developer role and the publish role together, the same
pair the existing publish action needs. Promotion SHALL introduce no new role.

The server enforces the publish role on the process-create route, unchanged.

#### Scenario: A developer without the publish role attempts an import

- **WHEN** an actor holding the developer role but not the publish role
  confirms an import
- **THEN** the server refuses the publish
- **AND** Studio shows the authorization error

