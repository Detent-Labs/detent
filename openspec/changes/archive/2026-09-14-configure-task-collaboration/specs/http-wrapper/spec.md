## ADDED Requirements

### Requirement: A disabled comment field gets 409 on the comment route

`CollaborationDisabledError` thrown by `postComment` SHALL map to `409`
with `error.type` equal to `"collaboration-disabled"`, naming the
instance and `"comments"`.

#### Scenario: A step that disables comments refuses a posted comment

- **WHEN** `POST /instances/:instanceId/comments` resolves to an actor
  who may read the instance, but the instance's current step resolves
  `collaboration.comments` to `false`
- **THEN** the response is `409` with `error.type` equal to
  `"collaboration-disabled"`

### Requirement: A disabled attachment field gets 409 on the attachment route

`CollaborationDisabledError` thrown by `uploadAttachment` SHALL map to
`409` with `error.type` equal to `"collaboration-disabled"`, naming the
instance and `"attachments"`.

#### Scenario: A step that disables attachments refuses an uploaded attachment

- **WHEN** `POST /instances/:instanceId/attachments` resolves to an actor
  who may read the instance, but the instance's current step resolves
  `collaboration.attachments` to `false`
- **THEN** the response is `409` with `error.type` equal to
  `"collaboration-disabled"`
