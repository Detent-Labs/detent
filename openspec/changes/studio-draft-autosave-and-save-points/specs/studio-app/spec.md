<!-- antislop: allow-file sentence-length passive-voice synonym-rotation filler run-ons paragraph-length -->
<!-- Why: the MODIFIED blocks copy the live spec's older text word for word, 900 lines of it. -->

## ADDED Requirements

### Requirement: A draft saves itself after each change

The studio SHALL send `PUT /drafts/:processId` about 1200 milliseconds after the
last change to an open draft's body or layout. A run of changes with no pause SHALL
still save within 10 seconds. At most one such request SHALL run at a time.

Any write to the layout counts as a change. A layout with the same values in another
key order SHALL NOT count as one. Reading a draft SHALL send no save. No tab, screen
or bar SHALL carry a Save control.

#### Scenario: A label saves after a pause

- **WHEN** an author changes a field's label and stops typing
- **THEN** one `PUT /drafts/:processId` carries the change
- **AND** the state line reads "Saved just now" after the answer

#### Scenario: Moving a step saves too

- **WHEN** the developer drags a step and changes nothing else
- **THEN** one `PUT /drafts/:processId` carries the new layout

#### Scenario: A long run of typing still saves

- **WHEN** an author types for longer than 10 seconds with no pause
- **THEN** a save runs before the typing ends

#### Scenario: A change during a save saves next

- **WHEN** an author changes the draft while a save request runs
- **THEN** a second request carries that change after the first answers

#### Scenario: Opening a draft sends nothing

- **WHEN** an author opens a draft and reads every tab
- **THEN** no `PUT /drafts/:processId` leaves the browser
- **AND** the draft's revision and saved-by entry do not move

#### Scenario: The same layout in another key order sends nothing

- **WHEN** a save answers with the layout's values in another key order
- **THEN** the state line reads as saved and no further request leaves

### Requirement: A failed save says so and offers Try again

A save that fails with anything but a 401 or a 409 SHALL raise a banner under the
header bar. The banner SHALL say that the latest changes stay in the tab, unsaved.
The caught text SHALL stand in a closed Developer view. The banner SHALL carry a "Try
again" control, and the state line SHALL read "Unsaved changes".

A successful save SHALL remove this banner. It SHALL leave a banner another act
raised.

#### Scenario: A failed save keeps the work and says so

- **WHEN** a save answers 500
- **THEN** the banner stands with "Try again"
- **AND** the state line reads "Unsaved changes"
- **AND** the draft keeps the change

#### Scenario: A save leaves another act's banner standing

- **WHEN** Arrange's layout library fails to load and a later change saves
- **THEN** the Arrange banner still stands

#### Scenario: A clean draft clears the failure

- **WHEN** a save fails and the author then takes the change back by hand
- **THEN** the banner leaves and the state line reads as saved

### Requirement: A failed save retries where an answer may heal

A network failure or a 5xx answer SHALL retry by itself after 5, 15 and 30 seconds,
then every 60 seconds. The banner SHALL say so. Any other answer SHALL wait for the
next change or for Try again. A later change SHALL start the ordinary pause.

#### Scenario: A lost connection heals by itself

- **WHEN** a save fails on the network and the connection then returns
- **THEN** a later retry succeeds with no press
- **AND** the banner leaves and the state line reads "Saved just now"

#### Scenario: A refused save waits

- **WHEN** a save answers 400
- **THEN** no further request leaves until the author changes the draft or presses
  "Try again"

#### Scenario: A hung save counts as a failed one

- **WHEN** a save request has no answer after 30 seconds
- **THEN** the banner stands and the retry runs

### Requirement: Leaving the draft saves first

Every control that navigates away from an open draft SHALL save a waiting change
first and ask no question. That holds for the header bar's back control, Test and
Versions offer, and the `⋮` menu's Versions and Player. It holds for the groups link,
the area nav, and the account menu's area switch, profile entry and logout.

A change made during that wait SHALL save too. A second exit pressed during the wait
SHALL replace the first. A confirmed discard SHALL navigate with no save.

#### Scenario: A clean draft navigates at once

- **WHEN** an author with no change waiting chooses a control the rule covers
- **THEN** the screen navigates immediately and sends no request

#### Scenario: A waiting change saves, then the screen leaves

- **WHEN** an author changes a label and presses the back control within the pause
- **THEN** one `PUT /drafts/:processId` carries the change
- **AND** the process list opens after its answer, with no dialog

#### Scenario: Two exits run one navigation

- **WHEN** an author presses the back control, then Tools, during that wait
- **THEN** the Tools screen opens and the process list does not

#### Scenario: Discarding the draft raises no leave prompt

- **WHEN** the developer moves a step, chooses Discard draft and confirms the dialog
- **THEN** the screen navigates to the process list
- **AND** no leave dialog opens and no save request follows the discard

### Requirement: An exit asks only after a failed save

When the save before an exit fails, or a conflict stands, the control SHALL ask in the
studio's dialog form. The dialog SHALL say the latest changes could not reach the
server. Confirming SHALL navigate and drop them. Canceling SHALL leave the author on
the draft with every change kept. No automatic save SHALL run while the dialog stands.
Text the JSON surface has not applied asks first, with no save (`studio-json-view`).

#### Scenario: A failed save asks first

- **WHEN** an author presses the back control and the save answers 500
- **THEN** the dialog says the latest changes could not reach the server
- **AND** canceling keeps the author on the draft with the change

#### Scenario: A conflict asks first

- **WHEN** a conflict stands over a change that has not landed, and an author presses
  the back control
- **THEN** the dialog opens and no save request leaves

#### Scenario: A conflict on a clean draft leaves with no question

- **WHEN** a save point act answered 409 on a clean draft, and an author presses the
  back control
- **THEN** the process list opens with no dialog

#### Scenario: Confirming the dialog drops the change

- **WHEN** an author confirms that dialog
- **THEN** the screen navigates and the draft on the server lacks the change

#### Scenario: A retry waits behind the dialog

- **WHEN** a save failed on the network and the dialog stands past the retry's time
- **THEN** no request leaves until the author answers the dialog

### Requirement: The browser's prompt stands while a change has not landed

While a change has not landed, closing the tab or reloading SHALL raise the browser's
own leave prompt. A `401` answer SHALL end the session with no dialog and no leave
prompt. A Back or Forward step between entries of this page SHALL raise no prompt. It
SHALL send a waiting change once where no failure, conflict or notice stands, and
otherwise keep it as a copy where none stands.

#### Scenario: Closing the tab while a change waits prompts

- **WHEN** an author changes a label and closes the tab within the pause
- **THEN** the browser raises its leave prompt

#### Scenario: Closing the tab on a saved draft raises nothing

- **WHEN** the state line reads as saved and an author closes the tab or reloads
- **THEN** the browser raises no leave prompt

#### Scenario: Browser Back within the pause still saves

- **WHEN** an author changes a label and presses the browser's Back within the pause
- **THEN** one `PUT /drafts/:processId` carries the change

#### Scenario: Browser Back during a backoff keeps a copy

- **WHEN** a save failed on the network and an author presses the browser's Back
- **THEN** the tab's copy holds the change
- **AND** a later visit to that draft shows the notice

#### Scenario: Browser Back after a discard sends nothing

- **WHEN** an author confirms the discard and then presses the browser's Back
- **THEN** no `PUT /drafts/:processId` leaves

### Requirement: A kept copy waits for the author's answer

When the same actor reopens a draft with a differing copy, a notice SHALL offer two
controls. "Restore unsaved changes" puts the stored body and layout in the editor,
keeps the stored revision and deletes the copy. "Discard them" deletes the copy too.

A restore over a change made since the draft opened SHALL ask first, saved or not.
Both controls SHALL wait while a save or publish runs. Discarding the draft SHALL
delete the copy.

#### Scenario: The same actor can restore after logging in again

- **WHEN** the actor logs in again and opens the draft that has a copy
- **THEN** a notice offers "Restore unsaved changes" and "Discard them"
- **AND** restoring puts the stored body and layout in the editor
- **AND** a save carries them after the pause

#### Scenario: A copy equal to the loaded draft shows no notice

- **WHEN** the actor opens a draft whose body and layout equal the copy
- **THEN** no notice appears

#### Scenario: Restoring over newer changes asks first

- **WHEN** the developer changes the draft while the notice shows and then
  chooses "Restore unsaved changes"
- **THEN** the screen asks for confirmation before it replaces the draft

#### Scenario: Restoring after this tab saved asks first

- **WHEN** the author saved a change here under the notice, by naming a save point,
  and chooses "Restore unsaved changes"
- **THEN** the screen asks for confirmation before it replaces the draft

#### Scenario: A restored draft saved against a moved revision conflicts

- **WHEN** someone else saved the draft after the copy existed, and the
  developer restores the copy
- **THEN** the save answers 409 and the conflict message appears
- **AND** the draft on the server keeps its content

#### Scenario: Another actor sees no notice

- **WHEN** a different actor logs in on the same tab and opens that draft
- **THEN** no notice appears

#### Scenario: Restoring deletes the copy

- **WHEN** the developer chooses "Restore unsaved changes"
- **THEN** no copy remains for that actor and process

#### Scenario: Choosing "Discard them" deletes the copy

- **WHEN** the developer chooses "Discard them"
- **THEN** the notice closes
- **AND** a later visit to that draft shows no notice

#### Scenario: Discarding the draft deletes the copy

- **WHEN** the developer discards the draft that has a copy
- **THEN** no copy remains for that actor and process

#### Scenario: The notice waits for a running save

- **WHEN** a save or publish is running and the notice shows
- **THEN** the screen disables both buttons until the answer arrives

### Requirement: A standing notice holds the automatic saves

While the notice stands, no automatic save SHALL run. A change made then SHALL stay in
the tab, and the state line SHALL read "Unsaved changes". An exit, a Publish, or naming
or restoring a save point still saves that change. The copy SHALL then stay, and its revision SHALL
follow that save, so a later restore can still land. Answering the notice SHALL let
the saves run. A 401 SHALL keep that copy and drop the change made under the notice.

#### Scenario: A change under the notice sends nothing

- **WHEN** the notice shows and the author changes a label
- **THEN** no save leaves after the pause
- **AND** the notice still stands and the state line reads "Unsaved changes"

#### Scenario: Answering the notice lets the saves run

- **WHEN** the author changed a label under the notice and chooses "Discard them"
- **THEN** a save carries the change after the pause

#### Scenario: An exit under the notice keeps the copy

- **WHEN** the notice shows, the author changes a label and presses the back control
- **THEN** a save carries the change and the process list opens
- **AND** a later visit to that draft shows the notice

#### Scenario: A copy restores after an exit under the notice

- **WHEN** an exit under the notice saved a change, and the author later restores
  the copy
- **THEN** the editor holds the copy and a save carries it with no conflict

#### Scenario: A 401 under the notice keeps the copy

- **WHEN** the notice shows, the author changes a label, and a request answers 401
- **THEN** the stored copy still holds what the notice offered

### Requirement: The Save points view lists a draft's save points

The Settings tab's Save points view SHALL hold one labelled input, "Name this save
point", with a "Save this point" control, over the draft's save points. A row SHALL
print the name, who saved it and how long ago, with Restore and Remove. An empty list
SHALL say so in a sentence. No key, id, revision or hash SHALL print on the view.

The view SHALL fetch its list each time it turns visible. A failed fetch SHALL report
where the rows would stand.

#### Scenario: A return visit reads the rows again

- **WHEN** an author leaves the view and comes back to it
- **THEN** the list reads the server's rows again, and their ages move

#### Scenario: A draft with no save point says so

- **WHEN** an author opens the view on a draft with none
- **THEN** a sentence says no save points exist yet

#### Scenario: The view prints no machine value

- **WHEN** an author reads the view
- **THEN** no key, id, revision or hash prints on it

### Requirement: Naming a save point holds what the author sees

A press on "Save this point" SHALL save a waiting change first. A failed save SHALL
stop the act and leave the banner standing. A 409 SHALL raise the conflict banner. An
empty name SHALL print a sentence at the input and send no request. Another refusal
SHALL print at the input.

A successful create SHALL clear the input, add the row and say so in a status line.
The focus SHALL stay in the input. A create that reaches the bound SHALL move it to
the bound's sentence.

#### Scenario: Naming a save point

- **WHEN** an author types "Before the review step" and presses "Save this point"
- **THEN** a row reads "Before the review step" and who saved it, just now
- **AND** the input is empty and holds the focus

#### Scenario: A waiting change lands in the save point

- **WHEN** an author changes a label and at once saves a point
- **THEN** the draft's save lands first
- **AND** restoring that point later brings the label back as typed

#### Scenario: An empty name asks for a name

- **WHEN** an author presses "Save this point" with an empty input
- **THEN** a sentence at the input asks for a name
- **AND** no request leaves

#### Scenario: A create whose answer is lost shows its row

- **WHEN** a create commits and its answer is lost
- **THEN** the sentence prints at the input, and the list reads the server's rows again

#### Scenario: A refused create prints at the input

- **WHEN** a create answers 500
- **THEN** the reason prints at the input and the name stays typed

#### Scenario: The last create moves the focus to the bound's sentence

- **WHEN** a create brings the draft to the bound
- **THEN** the bound's sentence holds the focus

### Requirement: The Save points view states the engine's bound

At the bound the list states, the view SHALL replace the form with a sentence naming
that bound. Restore SHALL carry `aria-disabled="true"` and keep its focus, and Remove
SHALL stay available. A remove at the bound SHALL land the focus on the input that
returns. A refetch SHALL keep the rows on screen until its answer.

#### Scenario: The bound replaces the form

- **WHEN** a draft holds the most save points the engine admits
- **THEN** a sentence names that bound in place of the form
- **AND** Remove stays available

#### Scenario: A remove at the bound lands on the input

- **WHEN** an author removes a point at the bound
- **THEN** the form returns and its input holds the focus

### Requirement: Restoring a save point asks first and names what it kept

Restore SHALL open the studio's dialog form. The heading SHALL read "Restore “{name}”?"
and the confirm "Restore". The dialog SHALL name who saved the point and when. It SHALL
say that the current work becomes a save point.

Confirming SHALL save a waiting change, then restore. The editor SHALL hold the
restored draft, clean, and no save SHALL follow. A status line SHALL name both points.
The focus SHALL return to that row's Restore.

#### Scenario: A restore brings the old draft back

- **WHEN** an author confirms the restore of a point whose label differs from the
  draft's
- **THEN** the step page and the map print the point's content
- **AND** the state line reads as saved and no `PUT` follows

#### Scenario: A restore can come undone

- **WHEN** an author restores a point and then restores the point it kept
- **THEN** the draft holds the work it held before the first restore

#### Scenario: A restore over a moved draft conflicts

- **WHEN** another tab saved the draft, and an author confirms a restore here
- **THEN** the dialog closes and the conflict banner stands
- **AND** the draft on the server keeps its content

#### Scenario: A failed save closes the Restore dialog

- **WHEN** an author confirms a restore and the waiting change's save answers 500
- **THEN** the dialog closes and the banner stands
- **AND** no restore request leaves

#### Scenario: A refused restore prints in the dialog

- **WHEN** a restore answers 500
- **THEN** the dialog stays open and prints the reason inside itself

#### Scenario: A stale row refetches

- **WHEN** a restore or a remove answers 404
- **THEN** the dialog closes and the list reads the server's rows again
- **AND** after a remove, the focus lands on the name input

#### Scenario: A restore retires the Versions offer

- **WHEN** the header bar offers Versions after a publish, and an author restores a point
- **THEN** the offer leaves

#### Scenario: A restore at 49 points needs a Remove to come undone

- **WHEN** an author restores a point on a draft holding 49
- **THEN** the kept point is the fiftieth and Restore stands unavailable
- **AND** a press on Remove makes Restore available again

### Requirement: A restore whose answer is lost reads the stored draft

A restore whose answer is lost SHALL read the stored draft under the same time limit. A
revision past the one the restore carried SHALL land as a restore, in the same way.
Otherwise the dialog SHALL print the reason. The list SHALL read the server's rows again
in both cases.

#### Scenario: A restore whose answer is lost still lands

- **WHEN** a restore commits and its answer is lost
- **THEN** the editor holds the restored draft, clean, and the status line names both points
- **AND** no conflict banner stands

#### Scenario: A restore that never arrived stays in its dialog

- **WHEN** a restore's request fails on the network and the stored revision has not moved
- **THEN** the dialog stays open and prints the reason
- **AND** the list reads the server's rows again

### Requirement: A running save point request holds the rows' controls

A row's Restore and Remove SHALL stand unavailable while a save point request runs, so a
second request cannot move the revision the first one carries.

#### Scenario: A running request holds the rows' controls

- **WHEN** a save point request runs
- **THEN** each row's Restore and Remove stand `aria-disabled`, and a press starts nothing

### Requirement: Removing a save point asks first

Remove SHALL open the studio's dialog form, with the heading "Remove “{name}”?" and the
confirm "Remove". A refusal SHALL print inside the open dialog. After a remove, the
focus SHALL land on the name input.

#### Scenario: Removing a point

- **WHEN** an author confirms the removal of a point
- **THEN** the row leaves and the focus stands on the name input

## MODIFIED Requirements

### Requirement: A save keeps a layout change made while it runs

A successful save SHALL adopt the answer's revision. It SHALL adopt the
answer's layout only when the developer changed no layout during the request.
A layout change made during the request SHALL stay in the editor, and a later
save SHALL carry it. A save that answers 409 SHALL leave the current layout as it is.

#### Scenario: A drag during a running save survives the answer

- **WHEN** the developer drags a step while a save request runs and the save
  then succeeds
- **THEN** the step stays at its new position
- **AND** a second save carries that position after the answer

#### Scenario: A conflict does not roll the layout back

- **WHEN** the developer drags a step while a save request runs and the save
  then answers 409
- **THEN** the step stays at its new position
- **AND** the conflict message appears

### Requirement: A session that ends with unsaved changes keeps the draft

When a request answers 401 and no copy stands for that actor and process, the
studio SHALL store an unsaved draft in the tab's `sessionStorage`. The copy holds the body, layout and revision. Its key
holds the actor id and the process id. The session SHALL still end as the
session requirement states, even when the write fails.

#### Scenario: A 401 on save keeps the work

- **WHEN** the developer has an unsaved change and a save answers 401
- **THEN** the login screen appears
- **AND** the copy exists for that actor and process

#### Scenario: A clean draft stores nothing

- **WHEN** a request from a draft with no unsaved change answers 401
- **THEN** the studio writes nothing to storage

<!-- antislop: allow synonym-rotation -->
<!-- Why: stop is a verb here; Cancel elsewhere in this file names a control. -->
#### Scenario: A failed write does not stop the logout

- **WHEN** the unsaved draft is too large for the storage quota and a save
  answers 401
- **THEN** the login screen appears

### Requirement: A save conflict is surfaced and resolved by reloading, never merged

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
When `PUT /drafts/:processId` answers 409, the studio SHALL tell the user that
the draft was changed elsewhere and SHALL offer reloading the stored draft. It
SHALL NOT merge, SHALL NOT silently retry with the newer revision, and SHALL
NOT discard the conflict. No automatic save SHALL run while a conflict stands.

One 409 is no conflict. A send after a lost answer SHALL read the stored draft. Where
its body and layout equal what a failed request sent, that save SHALL count as landed
at the stored revision. Equal content means this tab made the only write. A network
failure loses an answer, and so does a gateway's 502, 503 or 504.

The banner over a dirty draft SHALL say that Reload drops the unsaved changes. Reload
SHALL report a draft that no longer exists.

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
the rest of the session (the toolbar is not remounted by a reload). An
automatic save would then re-write the just-fetched body and bump the stored
revision for nothing, invalidating a concurrent editor's in-flight revision.

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
- **THEN** the publish proceeds with no wait for a save, because the draft is
  identical to the stored one

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: Editing after a reload is dirty again

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** the user reloads after a conflict and then makes an edit
- **THEN** the draft saves itself again, so the fix does not turn saving off

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
#### Scenario: Reloading with a different stored layout reads clean

<!-- antislop: allow sentence-length run-ons passive-voice em-dash -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** the developer drags a step, a save answers 409, and the developer
  reloads
- **THEN** the header bar prints the saved state
- **AND** Publish's confirm waits for no save

#### Scenario: A lost answer on a landed save is no conflict

- **WHEN** a save lands, its answer is lost, and the retry answers 409
- **THEN** the studio reads the stored draft and finds what it sent
- **AND** no conflict banner stands, and the state line reads as saved

#### Scenario: The banner says what Reload costs

- **WHEN** a conflict stands over a dirty draft
- **THEN** the banner reads "This draft was changed elsewhere. Reload loads the stored draft and drops your unsaved changes."
- **AND** over a clean draft it reads "This draft was changed elsewhere."

#### Scenario: A Reload of a draft that went says so

- **WHEN** an author presses Reload and the stored draft no longer exists
- **THEN** a banner reads "Not found."

#### Scenario: A conflict stops the automatic saves

- **WHEN** a save answers 409 and the author keeps changing the draft
- **THEN** no further save leaves until the author presses Reload

### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft model
(`draft/`), UI-chrome i18n, and live validation. It SHALL also carry over the
structural panels (`panels/`). These panels are steps, paths, timers, actions,
subprocess spec, view editor, field catalog, data sources, and contract.

The draft routes replace file-based persistence. `GET /drafts/:processId` loads
the draft. `PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be one tabbed process surface. The
`studio-process-tabs` capability states the tab row and its six tabs. The
canvas stands on the Map tab. A steps rail and a step page stand on the
Steps tab, and the `studio-step-page` capability states both.

Four tabs carry a process-wide subject. They are Fields, Forms, Checks and
Settings. Fields holds the catalog, the field matrix and the data sources as three views.
Settings holds four views: the process settings, the contract, the access lists
and the save points. Each tab stays reachable whether or not the
author has picked a step.

The Settings tab SHALL carry `baseLocale`. This capability requires an author
to declare a non-English base locale without leaving the process surface.

The tab row SHALL belong to the Structure surface alone. The surface SHALL stand
no tab while the JSON surface is open. Every tab but Checks writes the draft body, and the
`studio-json-view` capability requires that no draft-body-writing control stays
reachable there.

This requirement governs where the surface mounts each panel, and how an author
reaches it. What each panel validates, writes, or persists stays the same.

Every inline missing-translation warning SHALL survive the move. Six
`LocalizedTextInput` sites carry one.

- the process label, which stays on the screen
- a step's label and description, which sit in the step page's masthead
- a field's label and description, and a field option's label, which sit in the
  Fields tab

Live validation SHALL remain exactly what it is today. It runs the engine's own
publish-time chain in the browser and reports issues in place. It SHALL NOT block
saving, since a work-in-progress draft is normally invalid.

<!-- antislop: allow trailing-negation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The steps rail's row SHALL carry one issue count for the step as a whole. That
count SHALL cover the step's own issues, and the issues of its paths, timers and
actions. Here `resolveLoc` returns the deepest entity it finds. A guard's issue
therefore names the path, not the step. A count over the step's own id alone
would read zero on such a step.

Each section heading on the step page SHALL carry its own count. It counts the
issues `resolveLoc` resolves to an entity that section holds. A path's issue
counts at the paths section, and a timer's at the time-limit section. A check on
the step's key counts at More. A check on its name or description counts on no
header, and stands at its own line. The `studio-step-page` capability states the
section register those counts sit in.

A tab SHALL carry one issue count for its own subject. Every count SHALL take the
same visual tone. The rest of the studio area already takes that tone for issues.

<!-- antislop: allow trailing-negation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The header bar SHALL offer a **Publish** action (see the `studio-publish`
capability). It calls `POST /drafts/:processId/publish` against the currently
persisted draft, not the in-browser draft state. While a local change has not
landed, the dialog's confirm SHALL wait for that save. It must not publish stale
or ahead-of-server content. On success, the header bar SHALL state
the new version number. The Settings tab's Developer view SHALL hold its
`definitionHash`.

#### Scenario: A draft round-trips through the panels

- **WHEN** the author loads a draft, adds a step through the panels, saves
  the draft, and reloads it
- **THEN** the panels carry the new step identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** the author loads a draft, repositions a step, connects it to
  another step, then saves and reloads it
- **THEN** the Map tab draws the new position and path identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for a draft carrying unsaved work
- **THEN** the surface prints the issues, and the automatic save succeeds

#### Scenario: A Structure-surface link opens the panels screen

- **WHEN** the author picks one of the four process-wide tabs
- **THEN** the surface opens that tab, and the address bar carries that
  tab's own path

#### Scenario: A link opens the panels screen with no step selected

- **WHEN** the author picks one of those tabs before selecting any step
- **THEN** the surface still opens that tab

#### Scenario: The JSON surface renders no link into the panels screen

- **WHEN** the author opens the JSON surface from the overflow menu
- **THEN** the tab row stands away, and no control on screen reaches a tab

#### Scenario: A path's issue counts on the Paths head

- **WHEN** a step's path carries a failing guard
- **THEN** the step page's paths section reads a count of one
- **AND** the steps rail row's count also reads one

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the author picks Publish in the header bar while local changes
  remain unsaved
- **THEN** the dialog's confirm waits for that save, and the studio does not
  call `POST /drafts/:processId/publish` until the save completes

#### Scenario: The screen confirms a successful publish

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the header bar prints the returned version number
- **AND** the Settings tab's Developer view prints the `definitionHash`

### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- The area nav's Discard control drops every unsaved change; a panel's Remove control drops one entity. -->
No tab SHALL carry a Save control. Every change an author makes on a tab SHALL
write straight into the in-browser draft. That is how the panels write today. The
draft's automatic save carries each one to the server, and Publish SHALL remain
the one act that mints a version.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" here names the process surface, a noun, and no verb of display. -->
Leaving a tab SHALL discard nothing. The header bar's state line SHALL report
each save, so leaving a tab never reads as a discard.

A tab's own unsubmitted input SHALL survive a switch between tabs. The contract
panel holds a half-typed outcome name in component state. The data sources panel
fetches its list keys on mount. The field matrix holds its selected cell in
component state. Every tab and every view SHALL therefore stay mounted for as
long as the process surface is open. Switching a tab or a view SHALL reveal
and hide them, rather than mount them.

The Fields tab's count says how many fields the catalog holds. A rail row's
issue mark says whether that entity is wrong. Only the issue mark takes the
refusal tone. A row SHALL have no issue mark while its entity has no issue.

Two views SHALL each stand an entity rail beside the open editor. They are
the Fields tab's Catalog view and its Where values come from view. The rail SHALL list that view's own entities, and an Add entry too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. On the Fields tab, the Add entry SHALL add a top-level field. A group
field's children indent one level under it.

A field entry SHALL be the drag source that moves its field into a group and
out of it. The entry SHALL have no move control of its own, since the field's
editor carries that control. The move requirement below states the drag, its
keyboard route and what the move writes. Data source entries SHALL take no
part in a move, since a data source nests under nothing.

The contract holds a single editor, so its view SHALL stand no entity rail.
The field matrix draws a grid, so its view SHALL stand none either.

A view SHALL stand its own rail alone. No view SHALL list another view's
entities.

Choosing a field nested inside a group SHALL select that field. The tab SHALL
open that field's own editor, the same one a top-level field opens. The rail
SHALL mark that entry alone, and it SHALL leave the group's own entry unmarked.

On the Fields tab, a newly chosen field's editor SHALL open at its top. A move
keeps the same field selected, and the editor keeps its scroll position.

A selection SHALL live in component state and SHALL take no address of its own.
The tab SHALL select the first entity on mount. It SHALL select the added entity
after an Add.

<!-- antislop: allow synonym-rotation -->
<!-- The panel's Remove control drops one entity; the area nav's Discard control drops every unsaved change. -->
It SHALL select the neighbour after a Remove. Inside a group, the neighbour
SHALL be the next field of that group, then the previous one, then the group.
Switching to another tab and back SHALL keep the selection the first tab held.

Each entity entry SHALL carry its own issue mark, separate from the tab's issue
count. One entity at a time otherwise hides a broken entity behind whichever
entry an author has open.

The rail SHALL mark the selected entity with `aria-current`. A rail entry selects
an entity rather than disclosing adjacent content, so it SHALL NOT carry
`aria-expanded`. The `studio-process-tabs` capability states the tab row's own
tab-set semantics.

The rail SHALL cap indentation at two levels. A group field's children indent
once. A field nested deeper SHALL take its own top-level rail entry rather than a
deeper indent. This is a rail-rendering rule only: the draft's own field tree
SHALL keep whatever depth it declares.

The Fields rail entry SHALL name a field by its resolved label alone, on one
line. A label too long for the rail's width SHALL truncate there rather than
wrap onto a second line. An icon for the field's kind SHALL lead the label on
that same line. The issue mark SHALL follow the label there.

The entry SHALL print neither the kind name nor a group's name as visible
text. The indent alone SHALL show the group. The kind name SHALL stay the
icon's tooltip, and it SHALL stay part of the entry's accessible name. A
nested entry's accessible name SHALL also carry the name of the group that
holds its field. The indent shows that group to a sighted author alone.

The row SHALL NOT print the field's key. The key stays in the field
card's More, in its Developer view, once an author selects that field. The
engine's own exact-match value already lives there. The Data sources rail
entry names its data source through the same rail-row name element. An
over-long data source key SHALL truncate on its one line the identical way.

The kind icon and the kind name SHALL come from the same table the kind picker
reads. Each kind SHALL take an icon no other kind takes. A plugin-typed field
SHALL take one further icon. A field whose members name no kind SHALL take
another. A row naming the base type while the picker beside it names the kind
would give one field two vocabularies. The row's kind name therefore reads
"Date" where the picker reads "Date".

The rail SHALL keep the fallback name it carries today. It SHALL trigger on an
EMPTY RESOLVED LABEL rather than an empty key. The label is the row's primary
text now. A field carrying a key but no label needs the fallback exactly as an
empty-key field did before.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the author adds a field on the Fields tab and then opens the
  Map tab
- **THEN** the draft still carries that field, and the header bar's state line
  reports its save

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the author types an outcome name on the contract view, opens the
  Fields tab without adding it, then returns
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the author moves roving focus to a live cell on Where fields
  appear and activates it
- **AND** the author opens the Settings tab, then returns
- **THEN** the same cell still holds roving focus, and it is still activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the author inspects an open tab
- **THEN** it has no Save control, and the header bar's state line reports each
  save

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a contract
- **THEN** the Fields tab reads three, the Settings tab prints no count, and
  the contract view stands no entity rail

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a validation
  issue
- **THEN** the Fields tab reads three, and that field's rail row carries an
  issue mark. Only the mark takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** no data source rail row carries an issue mark

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry instead of a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the author picks the second in
  the rail
- **THEN** the Fields tab renders that field's editor, and it renders neither
  of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the author picks the second
  in the rail
- **THEN** Where values come from renders that data source's editor, and it
  renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the author opens Where values come from on a draft that carries
  both fields and data sources
- **THEN** that view's rail lists the data sources, and it lists no field

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child now opens its own editor. -->
#### Scenario: A group child selects its group

- **WHEN** the author picks a group field's child in the rail
- **THEN** the tab renders that child's own editor, with both halves
- **AND** the rail marks the child's entry alone, and neither the group's
  entry nor a sibling's entry

#### Scenario: A newly chosen field's editor opens at its top

- **WHEN** the author scrolls a field's card down to its "Validation" part
- **AND** the author picks another field in the rail
- **THEN** the editor shows that field's card at its
  top

#### Scenario: The Fields rail adds a field

- **WHEN** the author picks the rail's Add entry on the Fields tab
- **THEN** the draft carries one more field, the rail lists it, and the tab
  renders that new field

<!-- The heading keeps the live spec's wording; the entry now offers the drag, and the editor holds the control. -->
#### Scenario: A field entry offers the move control

- **WHEN** the author opens the Fields tab on a draft carrying a group field
  and a top-level field
- **THEN** each field entry offers the drag that moves its field, and no
  data source entry offers one
- **AND** no rail entry carries a move control of its own

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; "names" means printed text, and a nested entry's accessible name carries the group's name. -->
#### Scenario: A rail entry names no group

- **WHEN** a draft carries a group field holding two fields
- **THEN** both child entries indent once under the group's entry
- **AND** neither child entry prints the group's name

#### Scenario: A nested entry's accessible name carries its group's name

- **WHEN** a draft carries a group field holding a field
- **THEN** the child entry's accessible name carries the group's name
- **AND** the entry prints no group name as visible text

#### Scenario: Removing a field selects its neighbour

- **WHEN** the author removes the selected field from a draft that carries
  three
- **THEN** the tab renders a neighbouring field, and it reports no empty
  selection

#### Scenario: Removing a field inside a group selects the field after it

- **WHEN** a group holds three fields, and the author removes the first
- **THEN** the tab renders the field that followed it in that group

#### Scenario: Removing a group's last field selects the field before it

- **WHEN** a group holds three fields, and the author removes the third
- **THEN** the tab renders the group's second field

#### Scenario: Removing a group's only field selects the group

- **WHEN** a group holds one field, and the author removes it
- **THEN** the tab renders the group's own editor

#### Scenario: A reload selects the first entity

- **WHEN** the author reloads the browser on the Fields tab
- **THEN** the tab renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the author picks the rail's Add entry on Where values come from
- **THEN** the draft carries one more data source, the rail lists it, and the
  view renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the author removes the selected data source from a draft that
  carries three
- **THEN** the tab renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the author reloads the browser on Where values come from
- **THEN** the view renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the author
  has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: A nested field's entry marks its own check

- **WHEN** a field inside a group carries a check on its key
- **THEN** that field's own rail entry carries the issue mark
- **AND** the group's entry carries none for that check

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has a
  `label` carrying the base-locale value but no `de` value
- **THEN** the Fields tab carries the missing-translation warning next to
  that field's label input

#### Scenario: The Fields rail row shows no key

- **WHEN** the author opens the Fields tab on a draft whose fields each carry
  a `key`
- **THEN** every rail row carries the resolved label, the kind icon and any
  issue mark
- **AND** no row prints a `key`

#### Scenario: The rail row and the picker name one kind

- **WHEN** the author selects a `{type: "string", format: "date"}` field
- **THEN** the rail row's kind icon carries, as its tooltip, the word the kind
  picker shows for that field

#### Scenario: Each kind takes its own icon

- **WHEN** a draft carries one field of each kind the kind picker offers
- **THEN** each of those rail entries shows an icon no other entry shows
- **AND** no entry prints its kind name as visible text

#### Scenario: A plugin-typed field takes the plugin icon

- **WHEN** a draft carries a field whose `type` is a plugin envelope
- **THEN** its rail entry shows the plugin icon, and the icon's tooltip reads
  the kind picker's custom-type word

#### Scenario: A long field name truncates instead of wrapping

- **WHEN** a field's resolved label is longer than the rail entry's own
  width, especially once indented under a group
- **THEN** the rail entry shows the label truncated on its one line. It
  prints no character of it on a line of its own

<!-- A MODIFIED block keeps every scenario, so this heading stays though the kind name no longer prints. -->
#### Scenario: A long kind name truncates instead of wrapping

- **WHEN** a field's kind name is longer than any share of the rail entry's
  line
- **THEN** the rail entry keeps its one line and prints no character of the
  kind name on it. The icon's tooltip carries the kind name whole

#### Scenario: A long data source key truncates instead of wrapping

- **WHEN** a data source's `key` is longer than the Data sources rail
  entry's own width
- **THEN** the rail entry shows the key truncated on its one line. It
  prints no character of it on a line of its own

### Requirement: Each confirmation names its act

A confirmation's heading SHALL name the act, and its confirming control SHALL name the same act. Neither SHALL read "OK" or "Continue". A confirmation SHALL use no contract word its author would not meet elsewhere.

#### Scenario: Leaving a draft

- **WHEN** an author presses the back control and the save of the latest change fails
- **THEN** a dialog reads "Leave this draft?" with the control "Leave without saving"
- **AND** the body says the latest changes could not be saved
- **AND** declining returns the focus to the back control and keeps the changes

#### Scenario: Arrange

- **WHEN** an author presses Arrange on a hand-placed draft
- **THEN** a dialog reads "Arrange every step?" with the control "Arrange"

#### Scenario: Restoring over newer changes

- **WHEN** an author with unsaved changes chooses "Restore unsaved changes"
- **THEN** a dialog reads "Replace your current changes?" with the control "Replace them"

<!-- antislop: allow synonym-rotation -->
<!-- Why: an option is a field's choice; a setting here is a dialog's own word for what a kind or the Technical marker clears. -->
#### Scenario: A kind change that drops a setting

- **WHEN** an author changes the field "Due date" from the kind Date to the kind Number
- **THEN** a dialog reads "Change “Due date” from Date to Number?" with the control "Change kind"
- **AND** it says the new kind cannot keep how this field checks its value
- **AND** declining leaves the field and the select on the old kind

#### Scenario: Checking Technical

- **WHEN** an author checks Technical on a field whose entries carry three required or read-only settings
- **THEN** a dialog reads "Mark “Reference” as technical?" with the control "Mark as technical"
- **AND** it counts 3 settings it clears
- **AND** declining leaves the checkbox clear and the draft unchanged

#### Scenario: Deleting a template

- **WHEN** a curator presses Delete on the template "Approval"
- **THEN** a dialog reads "Delete “Approval”?" with the control "Delete template"
- **AND** no request goes out until the curator confirms

#### Scenario: Replacing a template

- **WHEN** a curator creates a template over the existing key of "Approval"
- **THEN** a dialog reads "Replace “Approval”?" with the control "Replace template"

### Requirement: Discarding a draft confirms in a modal dialog

<!-- antislop: allow sentence-length trailing-negation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The Discard draft entry in the header bar's `⋮` menu SHALL confirm in a modal
dialog of the application's own, not in the browser's `confirm()` prompt. The dialog SHALL
take the treatment `studio-publish` fixes for the publish dialog. That means
the native `dialog` element opened with `showModal()`, an accessible name
through `aria-labelledby`, and a platform cancel read as a decline. It also
means the initial focus that requirement fixes. Picking the entry closes the menu,
so every close route SHALL return the focus to the `⋮` trigger.

<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Here the confirming control destroys the draft, and the studio carries no undo.
So the declining control SHALL hold the initial focus, and the destructive one
SHALL NOT. Document order alone puts the destructive control first.

The dialog SHALL state the process it will drop the draft of. It SHALL print
no revision. It SHALL state that the published versions stay. It SHALL state
that only the unpublished draft goes. That last sentence is the one fact a
developer needs. It SHALL also state that the draft's save points go with it.

<!-- antislop: allow synonym-rotation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Declining SHALL leave the draft untouched and SHALL send no request. A
discard the engine refuses SHALL render its reason inside the open dialog.
The publish dialog reports a refusal the same way.

#### Scenario: Discarding confirms with the facts first

- **WHEN** the developer chooses Discard on an open draft
- **THEN** a modal dialog opens naming the process, with no revision
- **AND** it states that the published versions stay
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **AND** no discard request is sent until the developer confirms

#### Scenario: Declining keeps the draft

- **WHEN** the developer cancels that dialog, or dismisses it with Escape
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **THEN** no request is sent and the draft stays open, unchanged

#### Scenario: Confirming discards the draft

- **WHEN** the developer confirms that dialog
- **THEN** the engine drops the draft and the screen leaves for the list,
  exactly as it does today

#### Scenario: A refused discard reports inside the dialog

- **WHEN** the discard request fails
- **THEN** the dialog stays open and renders the reason inside itself

#### Scenario: The destructive control never holds the opening focus

- **WHEN** the discard dialog opens
- **THEN** the declining control holds the focus
- **AND** the Discard draft control does not hold it

#### Scenario: Closing the dialog returns focus to the menu trigger

- **WHEN** the developer closes the discard dialog by any route that keeps the draft
- **THEN** focus stands on the `⋮` trigger
- **AND** focus does not drop to the document body

#### Scenario: The dialog names the save points

- **WHEN** the discard dialog opens
- **THEN** it says the draft's save points go with it

#### Scenario: A discard waits for a running save

- **WHEN** a save request runs while the discard dialog stands
- **THEN** both controls stand disabled until that save answers
- **AND** no save leaves while the dialog stands

## REMOVED Requirements

### Requirement: Leaving the edit screen with unsaved changes prompts first

**Reason**: A draft saves itself, so an exit has nothing to ask about unless that save fails.

**Migration**: Three requirements take its place: "Leaving the draft saves first", "An exit asks only after a failed save" and "The browser's prompt stands while a change has not landed".

### Requirement: A layout change counts as an unsaved change

**Reason**: Its scenarios state the prompt and the Publish note that this change retires.

**Migration**: "A draft saves itself after each change" says what counts as a change, and `studio-canvas` says what the state line reads.

### Requirement: A kept draft gets a restore notice

**Reason**: A save no longer deletes the copy, since an automatic save would delete it behind the author's back.

**Migration**: "A kept copy waits for the author's answer" and "A standing notice holds the automatic saves" take its place.
