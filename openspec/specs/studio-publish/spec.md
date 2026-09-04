# studio-publish Specification

## Purpose

Lets a Studio developer publish the draft they just saved without leaving
Studio or hand-crafting a `POST /processes` call — closing the gap where
`packages/editor`'s export path plus a manual publish request was the only
way to turn a Studio-authored draft into a running definition (see
`process-drafts`). `POST /drafts/:processId/publish` targets the *persisted*
draft server-side (never a client-supplied body) and reuses the existing
`publishBody` (see `definition-store`) unchanged, so publishing from Studio
is authorized identically to every other publish path: both
`system:developer` (every studio route) and `system:publish` (the reserved
role `authorization` already gates `POST /processes` with) are required. A
successful publish also stamps the draft's `base_version`, the column
`process-version-inspection`'s Versions screen reads to offer "diff draft
against base."

## Requirements

<!-- antislop: allow passive-voice -->
### Requirement: A saved draft is published through a dedicated route that targets the persisted draft, not the in-browser edit state

`POST /drafts/:processId/publish` SHALL need one of `system:developer` and
`system:author`. It SHALL additionally need `can(actor, "publish", processId,
db)` to answer true. A grant of `"publish"` scoped to that process therefore
substitutes for the global `system:publish`. The authoring role still stands
beside it. Neither authoring role implies anything else, as
`process-drafts` already established. Publishing from Studio therefore stays
gated exactly as publishing from anywhere else.

The route reads its `processId` from the path, so the gate needs no body. It
SHALL run before the handler reads the draft.

The handler SHALL read the persisted draft (`getDraft`). It SHALL pass that
`body` unchanged to the existing `publishBody`. It SHALL return `{processId,
version, definitionHash, status}`. It SHALL NOT accept a body in the request.
The caller has nothing to supply beyond the process id, since the stored draft
is the source of truth.

#### Scenario: Publishing uses the persisted draft's body

- **WHEN** a caller posts `POST /drafts/:processId/publish` for a process with
  a saved draft
- **THEN** the handler passes that draft's stored `body` to `publishBody`
- **AND** the response carries the resulting version and `definitionHash`

#### Scenario: The engine rejects a caller with only system:developer

- **WHEN** an actor holding `system:developer` but not `system:publish` calls
  the publish route
- **AND** no grant admits that actor for that process
- **THEN** the engine answers with the same authorization error `POST
  /processes` already returns for a caller lacking `system:publish`

#### Scenario: The engine rejects a caller with only system:author

- **WHEN** an actor holding `system:author` but not `system:publish` calls the
  publish route
- **AND** no grant admits that actor for that process
- **THEN** the engine answers with that same authorization error

#### Scenario: The engine rejects a caller with only system:publish

- **WHEN** an actor holding `system:publish` but neither `system:developer` nor
  `system:author` calls the publish route
- **THEN** the engine rejects the call, since every studio route needs an
  authoring role whatever else the actor holds

#### Scenario: An author holding the publish role publishes

- **WHEN** an actor holding `system:author` and `system:publish` calls the
  publish route for a process with a saved draft
- **THEN** the publish succeeds and the response carries the new version

#### Scenario: An author holding a grant publishes their own process

- **WHEN** an actor holding `system:author` but not `system:publish` calls the
  publish route
- **AND** the store holds a grant of `"publish"` to a role that actor holds
- **AND** that grant names that `processId` in its scope
- **THEN** the publish succeeds and the response carries the new version

#### Scenario: That same grant publishes no other process

- **WHEN** that same actor calls the publish route for a different process
  with a saved draft
- **THEN** the engine answers with the authorization error

#### Scenario: A grant carries no authoring role

- **WHEN** an actor holding that grant, and neither `system:developer` nor
  `system:author`, calls the publish route
- **THEN** the engine rejects the call, since a grant reaches the publish
  permission and never a studio route's own gate

#### Scenario: Publishing a process with no draft is a 404

- **WHEN** a caller posts `POST /drafts/:processId/publish` for a `processId`
  with no row in `drafts`
- **THEN** the response is 404, the same not-found shape
  `GET /drafts/:processId` already returns

### Requirement: A successful publish stamps the draft's base_version, without disturbing its optimistic-concurrency revision

On a successful publish, the draft's `base_version` column SHALL be set to
the newly published version through a plain update, not through
`saveDraft`'s revision-checked path — `body`, `layout`, and `revision` SHALL
be left untouched by this update, since `base_version` is not part of the
optimistic-concurrency contract those three fields carry.

#### Scenario: Publish stamps base_version without changing revision

- **WHEN** a draft at `revision = 3` is published successfully
- **THEN** the draft's `base_version` becomes the newly published version and
  `revision` remains `3`

#### Scenario: A second publish updates base_version to the latest

- **WHEN** a draft already carrying a `base_version` from a prior publish is
  edited, saved, and published again
- **THEN** `base_version` becomes the new publish's version, replacing the
  earlier one

### Requirement: The studio offers Publish only where the engine would admit it, and names the reason otherwise

When the loaded draft reports that the caller may not publish, the studio
SHALL render Publish as unavailable. The `process-drafts` capability owns the
field that carries the report. It also owns the rule that the screen reads
that field rather than a role.

The unavailable control SHALL stay rendered. Removing it leaves a developer
hunting for a control that is not there.

Beside that control, the screen SHALL state the reason in visible text. It
SHALL say that the account lacks the publish permission for this process.

That text SHALL name the permission rather than a role. A scoped grant and
the global role both satisfy the same gate. A `title` attribute SHALL NOT be
the only carrier of that reason. It reaches neither the keyboard nor a
screen reader.

The control SHALL reference that text through `aria-describedby`, and SHALL
stay reachable by keyboard so a screen reader reaches that reference. A
control the native `disabled` attribute switches off takes no focus, so its
description reaches nobody. The control SHALL therefore carry
`aria-disabled="true"` and SHALL send no publish request when activated.

This client-side check only decides what the screen renders. The publish
route SHALL stay gated server-side whatever the browser decides, exactly as
this capability's own routing requirement states. A client that skips the
check still receives the same authorization error.

#### Scenario: A developer without the publish permission sees an unavailable control

- **WHEN** a draft loads with `canPublish: false`
- **THEN** the Publish control renders with `aria-disabled="true"`
- **AND** it is not removed from the screen
- **AND** activating it sends no publish request

#### Scenario: The unavailable control states its reason

- **WHEN** the Publish control renders unavailable
- **THEN** visible text beside it states that the account lacks the publish
  permission for this process
- **AND** the control references that text through `aria-describedby`
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **AND** the control still takes keyboard focus, so that reference is read

#### Scenario: A permitted actor sees an available control

- **WHEN** a draft loads with `canPublish: true`
- **THEN** the Publish control renders available, unchanged from today

#### Scenario: The frontend check is not the control

- **WHEN** a client that skipped the screen's check posts
  `POST /drafts/:processId/publish` for an actor the permission refuses
- **THEN** the engine still answers with the authorization error

### Requirement: Publishing confirms in a modal dialog that names the version and its immutability

The studio SHALL confirm a publish in a modal dialog of its own, not in the
browser's `confirm()` prompt. The dialog SHALL use the native `dialog`
element opened with `showModal()`. The focus trap, the Escape key and the
backdrop then come from the platform. The dialog SHALL carry an accessible
name through `aria-labelledby`. It SHALL treat a platform cancel as a
decline.

The dialog SHALL state, before the developer confirms:

- the process it will publish;
- the draft revision it will publish;
- the version the publish will mint;
- that a published version can never change, and that a correction needs a
  new version.

The stated version is the version the client expects. The engine assigns the
number, and the screen already reports the assigned version after a
successful publish. The dialog SHALL render a valid version label even when
nobody has published the draft before.

One dialog SHALL cover the unsaved-changes case as well. When the draft
carries unsaved edits, the dialog SHALL say that publishing saves them
first. Confirming SHALL save the draft and then publish it. The studio SHALL
NOT raise a second prompt for the save. Declining SHALL leave the draft
unsaved and unpublished.

A publish that the engine refuses SHALL render its reason inside the open
dialog, and SHALL leave the dialog open. A modal dialog puts everything
behind it out of reach, so the developer cannot read a message back there.

The dialog SHALL NOT open with its confirming control focused. The declining
control SHALL hold the initial focus instead. The studio carries no undo, and
this dialog guards an act the developer cannot reverse. A reflexive Enter on an
opening dialog would otherwise commit the act the dialog exists to question.

Opening a modal runs the platform's own focusing steps. Those steps fall to the
first focusable descendant when nothing claims the focus. So the studio SHALL
place that focus itself rather than rely on document order.

When the dialog closes, focus SHALL return to the control that opened it. That
binds every close route: the declining control, the Escape key, a backdrop
dismissal, and a request that finished. Focus otherwise drops to the document
body, and the developer restarts their traversal from the top of the screen.

#### Scenario: Publishing a clean draft confirms first

- **WHEN** the developer chooses Publish on a draft with no unsaved change
- **THEN** a modal dialog opens naming the process, the revision, the
  expected version and the immutability rule
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **AND** no publish request is sent until the developer confirms

#### Scenario: The dialog names a first version for a never-published process

- **WHEN** that dialog opens for a process with no published version
- **THEN** it names version 1 as the expected version

#### Scenario: The same dialog covers an unsaved change

- **WHEN** the developer chooses Publish while unsaved changes remain
- **THEN** the dialog says that publishing saves them first
- **AND** confirming saves the draft and then publishes it
- **AND** no second prompt appears between the save and the publish

#### Scenario: Declining publishes nothing

- **WHEN** the developer cancels that dialog, or dismisses it with Escape
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **THEN** no save request and no publish request is sent
- **AND** the draft keeps every unsaved change

#### Scenario: A refused publish reports inside the dialog

- **WHEN** the publish request fails
- **THEN** the dialog stays open and renders the reason inside itself

#### Scenario: The dialog opens with the declining control focused

- **WHEN** the publish dialog opens
- **THEN** the declining control holds the focus
- **AND** the confirming control does not hold it

#### Scenario: Closing the dialog returns focus to the control that opened it

- **WHEN** the developer closes that dialog by any route
- **THEN** focus returns to the header bar's menu trigger
- **AND** focus does not drop to the document body

### Requirement: The checks rail states a publish verdict it can verify

The checks rail reports what the studio's own validation measured. It holds no
permission and reads no actor. So its all-clear state SHALL NOT assert that the
caller may publish.

The rail SHALL read the same report the Publish control reads. That report is
the `canPublish` field `process-drafts` owns. Every placement of the rail SHALL
receive it. The rail renders beside the canvas, at the step inspector's bottom
edge, and on the panels screen.

The all-clear state SHALL carry two statements. One names the validation
verdict. The other names the publish verdict. Each SHALL come from its own
catalog key, so neither reads as a consequence of the other.

Where the report reads false, the second statement SHALL name the publish
permission this process needs. It SHALL NOT say that the draft is ready to
publish. A rail saying so contradicts the control that refuses the act, on the
same screen.

An open or held-back check SHALL keep the all-clear state hidden, exactly as it
does today. The publish verdict SHALL change nothing about when that state
shows.

#### Scenario: A clear draft the caller may publish

- **WHEN** the checks rail shows its all-clear state
- **AND** the loaded draft reports `canPublish: true`
- **THEN** the rail states its clear validation verdict
- **AND** it states that the draft is ready to publish

#### Scenario: A clear draft the caller may not publish

- **WHEN** the checks rail shows its all-clear state
- **AND** the loaded draft reports `canPublish: false`
- **THEN** the rail states its clear validation verdict
- **AND** it states that publishing needs the publish permission for this
  process
- **AND** it does not state that the draft is ready to publish

#### Scenario: Every placement of the rail states the same verdict

- **WHEN** the rail renders beside the canvas, at the step inspector's bottom
  edge, or on the panels screen
- **THEN** each placement states the publish verdict the others state

### Requirement: The publish-confirmation dialog renders from compiled styles

`panels/ProcessHeaderBar.tsx` renders the publish-confirmation dialog.
This capability's own requirement names it: "Publishing confirms in a
modal dialog that names the version and its immutability." The dialog
SHALL render from compiled component styles, including its
`::backdrop`. The header bar around it is a different capability's own
concern. Only the dialog itself is this requirement's scope.

This is a first use of `::backdrop` for this repo's StyleX adoption. A
task verifies it against a real build first, before this requirement's
own implementation task runs. That follows `web-styling`'s own
requirement: a phase verifies an unproven compiler feature against a
real build first.

#### Scenario: The publish dialog keeps its look

- **WHEN** a browser opens the publish-confirmation dialog
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared, including its `::backdrop`

#### Scenario: The dialog still opens, traps focus, and dismisses correctly

- **WHEN** an author opens the publish-confirmation dialog with the
  keyboard, then presses Escape
- **THEN** the dialog still opens through the native `showModal()` call,
  unchanged from before the migration
- **AND** focus returns to the control that opened it
