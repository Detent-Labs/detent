## MODIFIED Requirements

### Requirement: Typed engine errors map to a legible, distinct UI treatment

The app SHALL map each of the following conditions to the stated behavior,
rather than a generic error message:

| Condition | Behaviour |
|---|---|
| `AlreadyClaimedError` | Refresh the row; the task leaves the inbox |
| `NotACandidateError` | Explain the task is not assigned to this user |
| `NotClaimantError` / `NotClaimedError` | Prompt to claim, or report the claim is gone |
| `SubmissionValidationError` | Attach each error to its field via `form-ui` |
| Concurrent transition (OCC conflict) | Reload the view and report the task moved on |
| `CollaborationDisabledError` | Reload the view and report the step no longer accepts new comments/attachments |
| `401` | Return to `/login` |

#### Scenario: AlreadyClaimedError removes the task from view

- **WHEN** trying to claim fails with `AlreadyClaimedError`
- **THEN** the task screen refreshes and the task no longer appears as
  claimable by the current user

#### Scenario: NotACandidateError explains the mismatch

- **WHEN** trying to claim fails with `NotACandidateError`
- **THEN** the app displays that the task is not assigned to this user

<!-- antislop: allow passive-voice --> <!-- Scenario title must match the base spec verbatim for OpenSpec's archive matching; rewording to active voice breaks that match. -->
#### Scenario: A lost claim is reported distinctly from a normal prompt-to-claim

- **WHEN** trying to submit fails with `NotClaimantError` or
  `NotClaimedError`
- **THEN** the app either prompts the user to claim, or reports the claim
  is gone, distinct from the unclaimed state

#### Scenario: A concurrency conflict prompts a reload

- **WHEN** a submission fails due to a concurrent transition (OCC conflict)
- **THEN** the app reloads the instance view and reports that the task moved
  on

#### Scenario: A collaboration-disabled error prompts a reload

- **WHEN** a comment or attachment submission fails with
  `CollaborationDisabledError` because the current step's config changed
  since the view loaded
- **THEN** the app reloads the instance view and reports that this step no
  longer accepts new comments or attachments

### Requirement: Task screen shows a comment thread with a post form

The task screen SHALL show a comment thread beside the field form,
fetched via `GET /instances/:id/comments`, listing each comment's
`actorId` and `createdAt`, oldest first. This thread SHALL be visible to
any actor who can open the task screen at all, independent of claim
state.

It SHALL provide a text box and a submit button. Submitting calls `POST
/instances/:id/comments` and, on success, refetches the thread. This
input SHALL show only when the instance view's `collaboration.comments`
is `true`. When it is `false`, the thread above still renders, with no
text box or submit button beside it. A note in their place explains
that the step does not accept new comments.

#### Scenario: Opening a task loads its comment thread

- **WHEN** a user opens `/tasks/:instanceId` for a task they may view
- **THEN** the screen issues `GET /instances/:id/comments` and renders the
  returned comments oldest first

#### Scenario: Posting a comment refreshes the thread

- **WHEN** a user submits non-empty text in the comment box
- **THEN** the app calls `POST /instances/:id/comments` and, on success,
  the thread refetches and shows the new comment

#### Scenario: The comment thread is visible before claiming

- **WHEN** a user opens an unclaimed, assignment-bearing task they are an
  eligible candidate for
- **THEN** the comment thread renders and accepts a new comment, with no
  claim required first

#### Scenario: The current step disables further comments

- **WHEN** a user opens a task whose instance view resolves
  `collaboration.comments` to `false`
- **THEN** the comment thread still renders, oldest first, but the text
  box and submit button are absent
- **AND** a note explains that the step does not accept new comments

### Requirement: Task screen shows attachments with an upload control

The task screen SHALL show an upload control beside the field form: a
file picker and a submit button. The button SHALL call `POST
/instances/:id/attachments` with the chosen file's name, MIME type, and
base64-encoded bytes. On success it SHALL refetch the attachment list.
This upload control SHALL show only when the instance view's
`collaboration.attachments` is `true`.

The task screen SHALL also show a list of the instance's attachments,
fetched via `GET /instances/:id/attachments`, each with a download
action. This list SHALL be visible to any actor who can open the task
screen at all, independent of claim state. That holds even when
`collaboration.attachments` is `false`: the list still renders, with no
upload control beside it, and a note in its place explains that the
step does not accept new attachments.

#### Scenario: Opening a task loads its attachment list

- **WHEN** a user opens `/tasks/:instanceId` for a task they may view
- **THEN** the screen issues `GET /instances/:id/attachments` and renders
  the returned list

#### Scenario: Uploading a file refreshes the list

- **WHEN** a user picks a file and submits the upload control
- **THEN** the app calls `POST /instances/:id/attachments` and, on
  success, the list refetches and shows the new attachment

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

#### Scenario: The current step disables further attachments

- **WHEN** a user opens a task whose instance view resolves
  `collaboration.attachments` to `false`
- **THEN** the attachment list still renders, but the upload control is
  absent
- **AND** a note explains that the step does not accept new attachments
