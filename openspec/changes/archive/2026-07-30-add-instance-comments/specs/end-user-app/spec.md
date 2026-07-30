<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Task screen shows a comment thread with a post form

The task screen SHALL show a comment thread beside the field form,
fetched via `GET /instances/:id/comments`, listing each comment's
`actorId` and `createdAt`, oldest first. It SHALL provide a text box and a
submit button that calls `POST /instances/:id/comments` and, on success,
refetches the thread. This thread SHALL be visible to any actor who can
open the task screen at all, independent of claim state.

#### Scenario: Opening a task loads its comment thread

- **WHEN** a user opens `/tasks/:instanceId` for a task they may view
- **THEN** the screen issues `GET /instances/:id/comments` and renders the
  returned comments oldest first

#### Scenario: Posting a comment refreshes the thread

- **WHEN** a user submits non-empty text in the comment box
- **THEN** `POST /instances/:id/comments` is called and, on success, the
  thread refetches and shows the new comment

#### Scenario: The comment thread is visible before claiming

- **WHEN** a user opens an unclaimed, assignment-bearing task they are an
  eligible candidate for
- **THEN** the comment thread renders and accepts a new comment, with no
  claim required first
