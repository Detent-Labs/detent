<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Task screen shows attachments with an upload control

The task screen SHALL show an upload control beside the field form: a
file picker and a submit button. The button SHALL call `POST
/instances/:id/attachments` with the chosen file's name, MIME type, and
base64-encoded bytes. On success it SHALL refetch the attachment list.

The task screen SHALL also show a list of the instance's attachments,
fetched via `GET /instances/:id/attachments`, each with a download
action. This list SHALL be visible to any actor who can open the task
screen at all, independent of claim state.

#### Scenario: Opening a task loads its attachment list

- **WHEN** a user opens `/tasks/:instanceId` for a task they may view
- **THEN** the screen issues `GET /instances/:id/attachments` and renders
  the returned list

#### Scenario: Uploading a file refreshes the list

- **WHEN** a user picks a file and submits the upload control
- **THEN** `POST /instances/:id/attachments` is called and, on success,
  the list refetches and shows the new attachment

#### Scenario: Downloading an attachment saves the file

- **WHEN** a user selects an attachment's download action
- **THEN** the screen fetches `GET
  /instances/:id/attachments/:attachmentId` with the user's auth header.
  It then triggers the browser's save dialog for the returned bytes.

#### Scenario: The attachment list is visible before claiming

- **WHEN** a user opens an unclaimed, assignment-bearing task they are an
  eligible candidate for
- **THEN** the attachment list and upload control show, with no claim
  required first
