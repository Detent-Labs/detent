# Spec Delta

## MODIFIED Requirements

### Requirement: Publishing confirms in a modal dialog that names the version and its immutability

<!-- antislop: allow synonym-rotation trailing-negation -->
<!-- Why: a platform cancel is the dialog decline, and a tab stop is a focus position, two unrelated concepts. -->
The studio SHALL confirm a publish in a modal dialog of its own, not in the
browser's `confirm()` prompt. The dialog SHALL use the native `dialog`
element opened with `showModal()`. The focus trap, the Escape key and the
backdrop then come from the platform. The dialog SHALL carry an accessible
name through `aria-labelledby`. It SHALL treat a platform cancel as a
decline.

The dialog SHALL state, before the developer confirms:

- the process it will publish;
- the version the publish will mint;
- the number of open issues the draft carries;
- that a published version can never change, and that a correction needs a
  new version.

A closed Developer view in the dialog SHALL hold the process key, the process id
and the draft revision. None of the three SHALL print until it opens. Where the
draft holds more than one language, the dialog SHALL name each language with its
translation gap count.

<!-- "issue" names a validation entry; "error" elsewhere names the engine's authorization error. -->
<!-- antislop: allow synonym-rotation -->
The open issue count SHALL read the same `validation.issues[]` the area nav's
Checks control reads. One of those issues may block a publish. The dialog
SHALL then say the author cannot publish the draft yet, and that Checks marks
what to fix. It SHALL NOT say "the engine" or "somebody".

The stated version is the version the client expects. The engine assigns the
number, and the screen already reports the assigned version after a
successful publish. The dialog SHALL render a valid version label even when
nobody has published the draft before.

One dialog SHALL cover the unsaved-changes case as well. When the draft
carries unsaved work, the dialog SHALL say that publishing saves it first.
Confirming SHALL save the draft and then publish it. The studio SHALL NOT
raise a second prompt for the save. Declining SHALL leave the draft unsaved
and unpublished.

A publish that the engine refuses SHALL render its reason inside the open
dialog, and SHALL leave the dialog open. A modal dialog puts everything
behind it out of reach, so the developer cannot read a message back there.
Each located reason SHALL print as the sentence `studio-checks-rail` states for
it. The server's own text SHALL stand in a closed Developer view.

<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The dialog SHALL NOT open with its confirming control focused. The declining
control SHALL hold the initial focus instead. The studio carries no undo, and
this dialog guards an act the developer cannot reverse. A reflexive Enter on an
opening dialog would otherwise commit the act the dialog exists to question.

Opening a modal runs the platform's own focusing steps. Those steps fall to the
first focusable descendant when nothing claims the focus. So the studio SHALL
place that focus itself rather than rely on document order.

When the dialog closes, focus SHALL return to the control that opened it. The
header bar carries that control. This binds every close route. Those
are the declining control, the Escape key, a backdrop dismissal, and a request
that finished. Focus otherwise drops to the document body, and the developer
restarts their traversal from the top of the screen.

#### Scenario: Publishing a clean draft confirms first

- **WHEN** the developer chooses Publish on a draft with no unsaved work
- **THEN** a modal dialog opens naming the process
- **AND** it names the expected version, the open issue count and the
  immutability rule
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **AND** no publish request is sent until the developer confirms

#### Scenario: The dialog names a first version for a never-published process

- **WHEN** that dialog opens for a process with no published version
- **THEN** it names version 1 as the expected version

#### Scenario: The same dialog covers an unsaved change

- **WHEN** the developer chooses Publish while unsaved work remains
- **THEN** the dialog says that publishing saves it first
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
- **AND** a located reason reads as a sentence with no field path
- **AND** the server's text stands in a closed Developer view

#### Scenario: The dialog opens with the declining control focused

- **WHEN** the publish dialog opens
- **THEN** the declining control holds the focus
- **AND** the confirming control does not hold it

#### Scenario: Closing the dialog returns focus to the control that opened it

- **WHEN** the developer closes that dialog by any route
- **THEN** focus returns to the header bar's Publish control
- **AND** focus does not drop to the document body

#### Scenario: A blocking issue warns inside the dialog

- **WHEN** the developer chooses Publish on a draft carrying one blocking issue
- **THEN** the dialog reads one open issue
- **AND** the dialog says the author cannot publish the draft yet
- **AND** no text in it reads "the engine" or "somebody"

#### Scenario: Machine values wait behind the Developer view

- **WHEN** the publish dialog opens
- **THEN** no key, process id or revision shows until its Developer view opens
- **AND** the open Developer view holds all three

#### Scenario: A draft in two languages names both

- **WHEN** the publish dialog opens on a draft holding `en` and `de`, with three
  `de` gaps
- **THEN** the dialog names `en` and `de`, with `de`'s three missing entries

#### Scenario: A draft in one language names none

- **WHEN** the publish dialog opens on a draft holding one language
- **THEN** the dialog prints no language fact
