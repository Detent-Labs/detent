<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the rest of this repo's specs use; that grammar is structurally passive. -->

## ADDED Requirements

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
