## MODIFIED Requirements

### Requirement: The draft module exposes get, save, list and delete

`src/engine/drafts.ts` SHALL export `getDraft`, `saveDraft`, `listDrafts` and
`deleteDraft`. Each SHALL take `db: SQL = sql` as its last parameter, to match
the other engine modules. `getDraft` SHALL return `undefined` for a process
with no draft. `listDrafts` SHALL return one summary per draft, without the
body. A summary SHALL carry at least the process id, `revision`,
`base_version`, `updated_by` and `updated_at`. `deleteDraft` SHALL delete
the row and SHALL leave every `definitions` row as it was.

A summary SHALL also carry three values out of the stored body: `key`,
`label` and `baseLocale`. The engine stores a draft body as authored. Each
value SHALL therefore read `null` where the body holds a value of another
JSON type, or none. The expected type is a string for `key` and
`baseLocale`, and an object for `label`. In the summary's `label`, an entry SHALL stay only when its value is
a string.

#### Scenario: An absent draft reads as undefined

- **WHEN** a caller calls `getDraft` for a process that never had a draft
- **THEN** it returns `undefined` rather than throwing

#### Scenario: The listing omits bodies

- **WHEN** a caller calls `listDrafts`
- **THEN** each entry carries the process id, revision, base version and
  update metadata
- **AND** no entry carries a body

#### Scenario: Discarding a draft leaves published versions intact

- **WHEN** a caller calls `deleteDraft` for a process with published versions
- **THEN** the `drafts` row is gone
- **AND** every `definitions` row for that process stays as it was

#### Scenario: The listing carries the draft's name fields

- **WHEN** a draft's body holds `key: "laptop_pool"`,
  `label: { "en": "Laptop Pool" }` and `baseLocale: "en"`
- **THEN** its summary carries those three values

#### Scenario: A malformed name field reads as null

- **WHEN** a draft's body holds `key: 7`, `label: ["x"]` and no `baseLocale`
- **THEN** its summary carries `key: null`, `label: null` and
  `baseLocale: null`

#### Scenario: A label entry that is not a string drops out

- **WHEN** a draft's body holds `label: { "en": "Pool", "de": 3 }`
- **THEN** its summary's `label` is `{ "en": "Pool" }`

## ADDED Requirements

### Requirement: The draft listing names the account that last saved each draft

Each entry of `GET /drafts` SHALL carry `updatedByDisplayName` beside
`updatedBy`. Its value SHALL be the display name of the local account whose
id equals `updatedBy`. That name is the account's `display_name`, or its
email while it has none. A disabled account SHALL still resolve. The value
SHALL be `null` when no local account carries that id. The route SHALL
resolve every name in one query.

#### Scenario: A named account resolves to its display name

- **WHEN** an account with the display name "Demo Superuser" saved a draft
- **AND** a listed developer calls `GET /drafts`
- **THEN** that draft's entry carries `updatedByDisplayName: "Demo Superuser"`

#### Scenario: An account without a display name resolves to its email

- **WHEN** an account with no display name and the email `dev@example.test`
  saved a draft
- **THEN** that draft's entry carries
  `updatedByDisplayName: "dev@example.test"`

#### Scenario: An id with no local account resolves to null

- **WHEN** a draft's `updatedBy` names no row in `auth_users`
- **THEN** that draft's entry carries `updatedByDisplayName: null`
- **AND** the response is still 200
