## ADDED Requirements

### Requirement: A process and its steps declare whether comment and attachment collaboration is available

`ProcessBody` and `Step` each carry an optional `collaboration` field,
typed `{ comments?: boolean; attachments?: boolean }`. A body declaring no
`collaboration` at either level SHALL parse successfully, with the field
reading as `undefined`. The field is optional, not defaulted, so a body
predating it keeps its existing `definitionHash`.

Each of `comments` and `attachments` resolves independently for a given
step. Resolution checks the step's own `collaboration` entry for that
key first, then the process's, then falls back to `true`. A step MAY
set one key without the other; an
unset key falls through the same chain on its own. This is a per-key
resolution, not a per-object one: a step declaring
`{ "attachments": false }` alone still inherits `comments` from the
process default.

#### Scenario: A process with no collaboration field parses successfully

- **WHEN** a process body declares no `collaboration` field at either the
  process or any step level
- **THEN** the process body parses successfully, and every
  `collaboration` field reads as `undefined`

#### Scenario: A step overrides one key and inherits the other

- **WHEN** a process declares `"collaboration": { "comments": true,
  "attachments": true }`, and one of its steps declares
  `"collaboration": { "attachments": false }`
- **THEN** the process body parses successfully, and that step's resolved
  collaboration is `comments: true` (inherited) and `attachments: false`
  (overridden)

#### Scenario: A step turns on what the process default turns off

- **WHEN** a process declares `"collaboration": { "attachments": false
  }`, and one of its steps declares `"collaboration": { "attachments":
  true }`
- **THEN** the process body parses successfully, and that step's resolved
  `attachments` is `true` — a step's own setting always wins over the
  process default, in either direction
