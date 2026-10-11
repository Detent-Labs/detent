# Spec Delta

## ADDED Requirements

### Requirement: A layout change counts as an unsaved change

An open draft SHALL read as unsaved when its body or layout differs from the
last save. Any write to the layout counts, such as a step move, a group change
or a new waypoint. The header bar, every leave prompt and the Publish dialog
SHALL read this one state. A layout with the same values in another key order
SHALL NOT count as different.

#### Scenario: Moving a step marks the draft unsaved

- **WHEN** the developer drags a step and changes nothing else
- **THEN** the header bar prints the dirty indicator
- **AND** "Back to processes" asks for confirmation before it navigates

#### Scenario: A save clears the unsaved state of a layout

- **WHEN** the developer moves a step and saves successfully
- **THEN** the header bar prints the saved state
- **AND** "Back to processes" navigates with no prompt

#### Scenario: A layout-only difference makes Publish save first

- **WHEN** the developer moves a step, changes nothing else and chooses
  Publish
- **THEN** the dialog says that publishing saves the unsaved work first
- **AND** confirming saves the draft and then publishes it

#### Scenario: The same layout in another key order reads as saved

- **WHEN** a save answers with the layout's values in another key order
- **THEN** the header bar prints the saved state

#### Scenario: Discarding the draft raises no leave prompt

- **WHEN** the developer moves a step, chooses Discard draft and confirms the
  dialog
- **THEN** the screen navigates to the process list with no native prompt

### Requirement: A save keeps a layout change made while it runs

A successful save SHALL adopt the answer's revision. It SHALL adopt the
answer's layout only when the developer changed no layout during the request.
A layout change made during the request SHALL stay in the editor and keep the
draft unsaved. A save that answers 409 SHALL leave the current layout as it is.

#### Scenario: A drag during a running save survives the answer

- **WHEN** the developer drags a step while a save request runs and the save
  then succeeds
- **THEN** the step stays at its new position
- **AND** the header bar prints the dirty indicator

#### Scenario: A conflict does not roll the layout back

- **WHEN** the developer drags a step while a save request runs and the save
  then answers 409
- **THEN** the step stays at its new position
- **AND** the conflict message appears

### Requirement: A session that ends with unsaved changes keeps the draft

When a request answers 401, the studio SHALL store an unsaved draft in the
tab's `sessionStorage`. The copy holds the body, layout and revision. Its key
holds the actor id and the process id. The session SHALL still end as the
session requirement states, even when the write fails.

#### Scenario: A 401 on save keeps the work

- **WHEN** the developer has an unsaved change and a save answers 401
- **THEN** the login screen appears
- **AND** the copy exists for that actor and process

#### Scenario: A clean draft stores nothing

- **WHEN** a request from a draft with no unsaved change answers 401
- **THEN** nothing exists in storage for that process

#### Scenario: A failed write does not stop the logout

- **WHEN** the unsaved draft is too large for the storage quota and a save
  answers 401
- **THEN** the login screen appears

### Requirement: A kept draft gets a restore notice

<!-- antislop: allow synonym-rotation -->
<!-- Discard draft names a studio control; the copy is a different object. -->
When the same actor reopens a draft with a differing copy, a notice SHALL offer
two controls. "Restore unsaved changes" puts the stored body and layout in the
editor and keeps the stored revision. "Discard them" deletes the copy. A restore
over newer unsaved changes SHALL ask for confirmation first. A successful save
or a discard of the draft SHALL delete the copy.

#### Scenario: The same actor can restore after logging in again

- **WHEN** the actor logs in again and opens the draft that has a copy
- **THEN** a notice offers "Restore unsaved changes" and "Discard them"
- **AND** restoring puts the stored body and layout in the editor
- **AND** the header bar prints the dirty indicator

#### Scenario: A copy equal to the loaded draft shows no notice

- **WHEN** the actor opens a draft whose body and layout equal the copy
- **THEN** no notice appears

#### Scenario: Restoring over newer changes asks first

- **WHEN** the developer changes the draft while the notice shows and then
  chooses "Restore unsaved changes"
- **THEN** the screen asks for confirmation before it replaces the draft

#### Scenario: A restored draft saved against a moved revision conflicts

- **WHEN** someone else saved the draft after the copy existed, and the
  developer restores the copy and saves
- **THEN** the save answers 409 and the conflict message appears
- **AND** the draft on the server keeps its content

#### Scenario: Another actor sees no notice

- **WHEN** a different actor logs in on the same tab and opens that draft
- **THEN** no notice appears

#### Scenario: Choosing "Discard them" deletes the copy

- **WHEN** the developer chooses "Discard them"
- **THEN** the notice closes
- **AND** a later visit to that draft shows no notice

#### Scenario: A successful save deletes the copy

- **WHEN** the notice shows and the developer saves successfully
- **THEN** the notice closes

#### Scenario: Discarding the draft deletes the copy

- **WHEN** the developer discards the draft that has a copy
- **THEN** no copy remains for that actor and process

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- A MODIFIED header cannot change, so the header keeps the base words. -->
### Requirement: Leaving the edit screen with unsaved changes prompts first

Every control that navigates away from an open draft SHALL check the dirty
state before navigating. The requirement "A layout change counts as an unsaved
change" defines that state. The check covers the edit screen's own "Back to
processes", "Versions" and "Player" links and the `⋮` menu's groups link. It
also covers the "Processes", "Tools" and "Templates" tabs, and the account
menu's area switch, profile entry and logout.

<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
When the draft carries no unsaved change, a control SHALL navigate exactly
as it does today, with no prompt.

When the draft carries an unsaved change, a control SHALL ask for
confirmation before navigating. This uses the browser's own `confirm()`
prompt with a `t()` string.

<!-- antislop: allow synonym-rotation -->
<!-- Discard names the toolbar control; remove names a field removal. -->
The toolbar's Publish and Discard controls no longer share that pattern.
Each confirms in a dialog of the application's own instead. Each commits an
act the developer cannot undo. See `studio-publish` for the publish dialog,
and the requirement below for the other one. A navigation prompt guards no
commit, so it keeps the native prompt.

Confirming SHALL proceed with the navigation; the navigation drops the
unsaved edits, exactly as an explicit Discard already drops them. Canceling
SHALL leave the developer on the edit screen with the draft untouched.

While the draft has an unsaved change, closing the tab or reloading SHALL raise
the browser's own leave prompt. A `401` answer is not a navigation control. It
SHALL end the session with no `confirm()` and no leave prompt.

This requirement covers the in-app controls named above, tab close and reload.
A Back or Forward step between entries of this page is out of scope.

#### Scenario: A clean draft navigates without a prompt

- **WHEN** the developer has an unchanged draft and chooses "Back to
  processes", "Versions", "Player", or a top-level studio tab
- **THEN** the screen navigates immediately, with no confirmation prompt

#### Scenario: An unsaved change on the edit screen's own nav prompts first

- **WHEN** the developer has an unsaved change on the open draft and
  chooses "Back to processes", "Versions" or "Player"
- **THEN** the screen asks for confirmation before navigating

#### Scenario: An unsaved change on the studio area's top-level nav prompts first

- **WHEN** the developer has an unsaved change and chooses the
  "Processes", "Tools" or "Templates" tab in the studio area's navigation
- **THEN** the screen asks for confirmation before navigating

#### Scenario: The groups link prompts first

- **WHEN** the developer has an unsaved change and chooses "Manage assignment
  groups for this process" in the `⋮` menu
- **THEN** the screen asks for confirmation before navigating to the admin
  area

#### Scenario: The account menu's exits prompt first

- **WHEN** the developer has an unsaved change and chooses another area, the
  profile entry or logout in the account menu
- **THEN** the screen asks for confirmation before the shell runs the exit

#### Scenario: Canceling the prompt keeps the draft and the screen

- **WHEN** the developer has an unsaved change and cancels the
  confirmation prompt raised by a navigation control
- **THEN** the edit screen stays open and every unsaved change remains in
  the draft

#### Scenario: Confirming the prompt navigates and drops the unsaved change

- **WHEN** the developer has an unsaved change and confirms the prompt
  raised by a navigation control
- **THEN** the screen navigates away and the unsaved change is not
  recovered

#### Scenario: Closing the tab with an unsaved change prompts

- **WHEN** the developer has an unsaved change and closes the tab or reloads
- **THEN** the browser raises its leave prompt

#### Scenario: Closing the tab with a clean draft does not prompt

- **WHEN** the developer has no unsaved change and closes the tab or reloads
- **THEN** the browser raises no leave prompt

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
### Requirement: Studio authenticates with the existing login and session mechanism

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Studio SHALL NOT authenticate at all. The shell owns the one login screen and
the one session under one storage key (see the `unified-shell` capability), and
the studio area sends that session's token as the bearer credential on every
request. Any `401` from any studio request SHALL discard the stored session and
return the user to `/login`, the same handling every other area gets. Studio
SHALL NOT introduce a new authentication mechanism, token format, or credential
store, and SHALL NOT hold a storage key for the session. Its only browser
storage is the draft copy, one `sessionStorage` entry per actor and process. The
requirement "A session that ends with unsaved changes keeps the draft" states it.

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
An actor already signed in elsewhere in the shell SHALL reach `/studio` with no
second sign-in.

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: A successful login opens the shell

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** an actor holding `system:developer` submits valid credentials
- **THEN** the session is persisted and the process list is reachable at
  `/studio`

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: An expired session returns to login

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** any studio request answers 401
- **THEN** the stored session is cleared and the login screen is shown

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: No second sign-in

<!-- antislop: allow sentence-length run-ons passive-voice -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** an actor already signed in under another area navigates to `/studio`
- **THEN** no login screen appears

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
### Requirement: A save conflict is surfaced and resolved by reloading, never merged

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
When `PUT /drafts/:processId` answers 409, the studio SHALL tell the user that
the draft was changed elsewhere and SHALL offer reloading the stored draft. It
SHALL NOT merge, SHALL NOT silently retry with the newer revision, and SHALL
NOT discard the conflict.

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Reloading SHALL leave the editor in a **clean** state: the body and the layout the toolbar
treats as "last known persisted" SHALL be advanced to the reloaded body and layout, in
the same operation that replaces the draft, the layout and the revision. A
reload is by definition the point at which current and saved coincide — the
same invariant the initial seed and the post-save advance already encode.

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Without this the unsaved-changes comparison is made against the discarded
local edits, so a draft byte-identical to the stored one reads as dirty for
the rest of the session (the toolbar is not remounted by a reload). Publishing
then always prompts to save first: accepting re-writes the just-fetched body
and bumps the stored revision for nothing, invalidating a concurrent editor's
in-flight revision, and declining aborts a publish the user was entitled to
make.

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: A conflicting save is reported

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** a save answers 409
- **THEN** a conflict message is shown with a reload action, and the local
  editing state is left intact until the user chooses

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: Reloading adopts the stored draft

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** the user reloads after a conflict
- **THEN** the stored body, layout and revision replace the local state and a
  subsequent save succeeds

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: Publishing straight after a reload does not prompt to save

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** the user reloads after a conflict and immediately publishes,
  without editing
- **THEN** the publish proceeds without the unsaved-changes prompt, because
  the draft is identical to the stored one

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: Editing after a reload is dirty again

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** the user reloads after a conflict and then makes an edit
- **THEN** the unsaved-changes prompt reappears on publish, so the fix does
  not turn the gate off

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: Reloading with a different stored layout reads clean

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** the developer drags a step, a save answers 409, and the developer
  reloads
- **THEN** the header bar prints the saved state
- **AND** Publish raises no save-first note
