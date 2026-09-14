## ADDED Requirements

### Requirement: A step's collaboration config can block adding a comment or an attachment

`postComment` and `uploadAttachment` SHALL each resolve the instance's
current step's effective `collaboration.comments` (for `postComment`) or
`collaboration.attachments` (for `uploadAttachment`) against its pinned
body, using the same resolution `definition-contract` states. When the
resolved value is `false`, the call SHALL throw a new
`CollaborationDisabledError` naming the instance id and which of
`"comments"`/`"attachments"` is disabled, and SHALL NOT insert a row.

This check applies after `loadInstanceForActor`'s own visibility rule: an
actor with no sight of the instance still gets the existing
`AuthorizationError`, not `CollaborationDisabledError`. `listComments` and
`listAttachments` are unaffected — a step that disables further additions
does not hide history already recorded.

#### Scenario: The engine refuses a comment on a step with comments disabled

- **WHEN** an actor calls `postComment` for an instance whose current step
  resolves `collaboration.comments` to `false`
- **THEN** it throws `CollaborationDisabledError` naming `"comments"`, and
  it inserts no `instance_comments` row

#### Scenario: The engine refuses an attachment upload on a step with attachments disabled

- **WHEN** an actor calls `uploadAttachment` for an instance whose current
  step resolves `collaboration.attachments` to `false`
- **THEN** it throws `CollaborationDisabledError` naming `"attachments"`,
  and it inserts no `instance_attachments` row

#### Scenario: Listing stays available after a later step disables further additions

- **WHEN** an instance moves to a step resolving `collaboration.attachments`
  to `false`, already holding an attachment from an earlier,
  attachments-enabled step
- **THEN** `listAttachments` still returns that attachment

### Requirement: The instance view reports the current step's resolved collaboration settings

`getInstanceView` SHALL include a `collaboration` field on its returned
`InstanceView`, shaped `{ comments: boolean; attachments: boolean }` —
always fully resolved booleans, never `undefined`. `getInstanceView`
SHALL compute it from the current step's effective collaboration, the
same resolution `definition-contract` states. A caller therefore never
re-derives the process/step fallback itself.

#### Scenario: The instance view resolves both fields from step and process defaults

- **WHEN** an actor calls `getInstanceView` for an instance whose process
  declares `"collaboration": { "comments": true, "attachments": false }`
  and whose current step declares no `collaboration` override
- **THEN** the returned view's `collaboration` is `{ comments: true,
  attachments: false }`

#### Scenario: The resolved collaboration reports regardless of status

- **WHEN** an authorized actor calls `getInstanceView` for a completed,
  cancelled, or faulted instance
- **THEN** the returned view still carries a fully resolved
  `collaboration`
