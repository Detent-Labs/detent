# studio-app Specification

## Purpose

The developer's frontend, the studio area of `packages/web`: a workspace package mirroring
the app area of `packages/web`'s shape (React 18, Vite 6, own build/typecheck, a hand-written
History-API routing hook, `session.ts` for the JWT under its own storage
key), reusing the existing login mechanism, with a role-aware shell, a
process list merging published and draft state, and the panel editing
surface (originally carried over from `packages/editor`, now deleted, and
independent of it since) wired to the draft routes instead of
file persistence — reaching the engine exclusively through the HTTP wrapper
at runtime and through the package's `exports` map at compile time only. See
the `process-drafts` capability for the server-side store and routes this
frontend calls, and the `authorization` capability for the `system:developer`
role its shell checks (presentationally) and every studio route enforces
(authoritatively).
## Requirements
### Requirement: Studio is a workspace package that reaches the engine only through its two sanctioned boundaries

Studio SHALL live at `packages/web/src/areas/studio`, inside the one workspace
package that produces a browser bundle (see the `unified-shell` capability). It
SHALL reach the running system at **runtime** exclusively through the HTTP
wrapper — never the database, never an engine module invoked in-process against
live state — and it SHALL import from the engine at **compile time** only
through the package's `exports` map (`workflow-engine/schema`,
`/schema/compile`, `/cel/check`, `/engine/registry-check`), which is what makes
live validation a pure frontend feature with no endpoint behind it.

Routing within the area SHALL stay a pure matcher and path builder over paths
relative to the `/studio` prefix, driven by the shell's one History-API hook,
with no router dependency. Studio SHALL NOT import from another area's
directory, and SHALL NOT modify `packages/form-ui`.

#### Scenario: No direct data access

- **WHEN** `packages/web/src/areas/studio` is inspected for imports
- **THEN** it imports no database client and no engine module by deep path,
  only the exports-map entry points and its own HTTP client

#### Scenario: No cross-area import

- **WHEN** the studio area's sources are inspected
- **THEN** nothing under it imports from another area's directory

### Requirement: The shell routes to Tools and Player alongside the process list

The studio area SHALL offer navigation to `/studio/tools` (see the
`studio-tools` capability) and to a per-process Player at
`/studio/processes/:processId/play` (see the `studio-player` capability),
reachable the same way the process list already is — behind the shell's
`system:developer` presentational check, with every route it calls enforcing
the role authoritatively.

#### Scenario: Tools is reachable from the shell

- **WHEN** an authenticated actor holding `system:developer` uses the studio
  area's navigation
- **THEN** a link to `/studio/tools` is present and renders the Tools screen

#### Scenario: Player is reachable from a process's edit context

- **WHEN** an authenticated actor holding `system:developer` opens a process
- **THEN** a link to that process's Player screen is present

### Requirement: Leaving the edit screen with unsaved changes prompts first

Every control that navigates away from an open draft SHALL check the dirty
state before navigating. The header bar already computes that state as
draft vs. last-saved body. That includes the edit screen's own "Back to
processes", "Versions" and "Player" links. It also includes the studio
area's top-level "Processes", "Tools" and "Templates" tabs.

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

This requirement covers only the in-app links named above. A browser-level
navigation (the Back button, closing the tab, an address-bar navigation) is
out of scope.

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

### Requirement: Discarding a draft confirms in a modal dialog

The edit screen's Discard control SHALL confirm in a modal dialog of the
application's own, not in the browser's `confirm()` prompt. The dialog SHALL
take the treatment `studio-publish` fixes for the publish dialog. That means
the native `dialog` element opened with `showModal()`, an accessible name
through `aria-labelledby`, and a platform cancel read as a decline. It also
means the initial focus and the focus return that requirement fixes.

Here the confirming control destroys the draft, and the studio carries no undo.
So the declining control SHALL hold the initial focus, and the destructive one
SHALL NOT. Document order alone puts the destructive control first.

The dialog SHALL state the process and the draft revision it will drop. It
SHALL state that the published versions stay. It SHALL state that only the
unpublished draft goes. That last sentence is the one fact a developer
needs. The native prompt could not carry it beside the facts above.

Declining SHALL leave the draft untouched and SHALL send no request. A
discard the engine refuses SHALL render its reason inside the open dialog.
The publish dialog reports a refusal the same way.

#### Scenario: Discarding confirms with the facts first

- **WHEN** the developer chooses Discard on an open draft
- **THEN** a modal dialog opens naming the process and the draft revision
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

### Requirement: Studio authenticates with the existing login and session mechanism

Studio SHALL NOT authenticate at all. The shell owns the one login screen and
the one session under one storage key (see the `unified-shell` capability), and
the studio area sends that session's token as the bearer credential on every
request. Any `401` from any studio request SHALL discard the stored session and
return the user to `/login`, the same handling every other area gets. Studio
SHALL NOT introduce a new authentication mechanism, token format, or credential
store, and SHALL NOT hold a storage key of its own.

An actor already signed in elsewhere in the shell SHALL reach `/studio` with no
second sign-in.

#### Scenario: A successful login opens the shell

- **WHEN** an actor holding `system:developer` submits valid credentials
- **THEN** the session is persisted and the process list is reachable at
  `/studio`

#### Scenario: An expired session returns to login

- **WHEN** any studio request answers 401
- **THEN** the stored session is cleared and the login screen is shown

#### Scenario: No second sign-in

- **WHEN** an actor already signed in under another area navigates to `/studio`
- **THEN** no login screen appears

### Requirement: An authenticated actor without the developer role sees an explanatory empty state

The shell SHALL read the roles the login response carries. When the account
holds none of `system:developer`, `system:author` and `system:templates`, the
shell SHALL render an explanatory screen. That screen SHALL state that the
account lacks studio access. The shell SHALL NOT redirect to `/login`, because
the credentials are valid. It SHALL NOT render a partly populated screen.

An account holding `system:templates` alone SHALL enter the area and reach
the templates screen only. Every other studio screen SHALL refuse it and
SHALL state which role the account lacks.

An account holding `system:author` alone SHALL enter the area. It SHALL reach
the process list, the editor, the versions screen, the migration screen and
the player. The tools screen and the templates screen SHALL refuse it. Each
SHALL state which role the account lacks.

This client-side check only decides what the shell renders. Every studio route
SHALL stay gated server-side whatever the browser decides. Whether an
author's action on the migration screen succeeds for a given process is a
`studio-migration-planning` question, not this requirement's. See that
capability for the scoped `migrate` grant that governs it.

#### Scenario: A participant account learns why studio is empty

- **WHEN** an actor holding no studio role logs in to studio
- **THEN** an explanatory empty state renders
- **AND** the shell renders neither the login screen nor any process or draft
  data

#### Scenario: A curator enters the area and reaches one screen

- **WHEN** an actor holding only `system:templates` logs in to studio
- **THEN** the templates screen renders
- **AND** the process list refuses and names the missing role

#### Scenario: An author enters the area and reaches the process list

- **WHEN** an actor holding only `system:author` logs in to studio
- **THEN** the process list renders

#### Scenario: An author reaches the migration screen for any process

- **WHEN** an actor holding only `system:author` opens a process's
  migration screen
- **THEN** the migration screen renders, whether or not a `migrate` grant
  admits that process

#### Scenario: The frontend check is not the control

- **WHEN** a client that skipped the shell check calls a draft route directly
- **THEN** the server still answers 403

### Requirement: The process list shows draft and published state per process

The `/processes` screen SHALL list one row per process reachable to the
developer, combining `GET /processes` and `GET /drafts`. Each row SHALL show
whether a draft exists and, if so, who last saved it and when, and the latest
published version with its `definitionHash`. A process with a draft but no
published version and a process with published versions but no draft SHALL
both render correctly.

Actions SHALL be: create a new process, open a process for editing, and
discard its draft. Discarding SHALL require a confirmation and SHALL call
`DELETE /drafts/:processId`, leaving published versions untouched.

#### Scenario: A never-published process appears

- **WHEN** a draft exists for a process with no `definitions` rows
- **THEN** the row renders with its draft metadata and an empty published
  column

#### Scenario: A published process with no draft appears

- **WHEN** a process has published versions and no draft
- **THEN** the row renders the latest version and its hash, and offers
  creating a draft rather than opening one

#### Scenario: Discarding removes only the draft

- **WHEN** discard is confirmed for a process with published versions
- **THEN** the draft disappears from the list and the published version and
  hash still render

### Requirement: Creating a new process mints a prefixed id client-side

Creating a process SHALL mint a `proc_`-prefixed UUIDv4 id in the browser.
It SHALL use the minting path the Draft model already uses for every other
entity kind. That path generates `${prefix}_${crypto.randomUUID()}` and
parses it through the contract's own branded id schema. Creating SHALL then
write the row with a `PUT /drafts/:processId` at `revision = 0`. There SHALL
be no separate create-then-save round trip and no server-side id allocation.

Creating SHALL first offer a choice of starting body. The empty choice SHALL
seed the body the studio seeds today. The template choice SHALL seed the body
and the layout of a template the author picks. The picker SHALL list the
templates the account may read.

A process seeded from a template SHALL claim no base version, because a
template is no published version.

#### Scenario: A new process is one round trip

- **WHEN** an author creates a new process
- **THEN** the browser issues exactly one `PUT /drafts/:processId`, with
  `revision` 0, and the process id carries the `proc_` prefix

#### Scenario: The empty choice behaves as before

- **WHEN** an author creates a new process and picks the empty choice
- **THEN** the draft body declares the base locale and nothing else

#### Scenario: The template choice seeds body and layout

- **WHEN** an author creates a new process from a template
- **THEN** the draft holds that template's body and layout
- **AND** the draft carries no base version

#### Scenario: An author with no readable template still creates a process

- **WHEN** an author creates a new process while no template exists
- **THEN** the picker offers the empty choice and states that no template
  exists

### Requirement: Creating a draft for a published process starts from the latest published version

Creating a draft from the process list SHALL seed the draft body from the
process's latest published version. The studio SHALL read that body through
the published-version route before it writes the draft. It SHALL send the
result as the new draft's body, at `revision = 0`.

The published-version route returns the compiled body. A draft holds the
authored shape. The studio SHALL therefore strip the content the compile
pass injects before it writes the draft. That content is the reserved
cancel-sink step and, for a contracted process, the reserved cancel outcome
in `contract.outcomes`. The studio SHALL strip nothing else.

The write SHALL declare the version it seeded from as the draft's
`baseVersion`. The Versions screen compares the draft against it.

The seeded draft SHALL carry no stored layout. The canvas places steps that
have no recorded position, so a seeded process renders without one.

Creating a draft for a process with no published version SHALL write a body
declaring `baseLocale: "en"` and nothing else. It SHALL declare no base
version. Creating a new process SHALL keep both of those.

Publish requires `baseLocale`. The seed is the only place the structural
panels can supply it before the author has typed anything. The chosen value
matches the fallback every other studio reader already applies to a draft
that declares no base locale.

When the read of the published version fails, the studio SHALL report the
error and SHALL NOT write a draft. An empty draft must not silently replace
the seeded one. The process list would then show a draft the author never
authored.

#### Scenario: A published process seeds its draft

- **WHEN** a draft is created for a process with a published version
- **THEN** the stored draft body equals that version's authored shape, and
  the draft carries `revision` 0 with `baseVersion` set to that version. The
  edit screen renders the process's steps

#### Scenario: The seeded body carries no compile-pass content

- **WHEN** a draft is seeded from a published version of a contracted process
- **THEN** the stored body carries no step with the reserved cancel-sink id
  or key, and `contract.outcomes` carries no reserved cancel outcome

#### Scenario: The seeded body passes the studio's own validation

- **WHEN** a seeded draft is loaded into the edit screen
- **THEN** live validation reports no error that the published version did
  not already carry

#### Scenario: A never-published process starts with a base locale only

- **WHEN** a draft is created for a process with no published version
- **THEN** the stored draft body declares `baseLocale: "en"` and carries no
  other key. The draft carries no base version, and the edit screen renders
  no steps

#### Scenario: A new process starts with a base locale only

- **WHEN** a new process is created from the process list
- **THEN** the stored draft body declares `baseLocale: "en"` and carries no
  other key, and no published-version read precedes the write

#### Scenario: The new-process seed reports no missing base locale

- **WHEN** the body a new process starts from is parsed as an authored
  process body
- **THEN** no reported error names `baseLocale`

#### Scenario: A failed seed read writes no draft

- **WHEN** the published-version read fails while a draft is being created
- **THEN** the screen reports the error and no draft write follows. The
  process list still shows the process as having no draft

### Requirement: A process row writes one draft per press

A press on a process row's "Create draft" SHALL write at most one draft. From
the press until the edit screen opens, that row's "Create draft" button SHALL
read disabled. A press on it during that wait SHALL send no request.

When the published-version read or the draft write fails, the screen SHALL
report the error. The button SHALL then read enabled again, and a later press
SHALL try once more.

The hold SHALL belong to one row. A write in flight for one process SHALL leave
every other row's "Create draft" button enabled.

While it reads disabled, the button SHALL keep its visible label and its
accessible name.

The in-flight rule SHALL live in a pure module with `bun:test` coverage. This
capability's requirement on the studio's testable logic states that pattern.

#### Scenario: A second press sends no second write

- **WHEN** an author presses "Create draft" twice on a published process's row
  before the edit screen opens
- **THEN** the browser issues one read of the published version and one
  `PUT /drafts/:processId` for that process
- **AND** the button reads disabled from the first press until the edit screen
  opens

#### Scenario: The editor's first save follows a double press without a conflict

- **WHEN** an author presses "Create draft" twice, then edits the opened draft
  and saves
- **THEN** the save succeeds, and the screen shows no conflict message

#### Scenario: A failed try enables the button again

- **WHEN** the published-version read or the draft write fails after a press
  on "Create draft"
- **THEN** the screen reports the error, and that row's button reads enabled
- **AND** a new press repeats the requests the first press sent

#### Scenario: Another row stays available

- **WHEN** a draft write for one process is in flight
- **THEN** every other row's "Create draft" button reads enabled

#### Scenario: A disabled button keeps its name

- **WHEN** a row's "Create draft" button reads disabled during its write
- **THEN** its visible label and its accessible name both read "Create draft"

#### Scenario: A test holds the in-flight rule without a DOM

- **WHEN** a test calls the in-flight rule twice for one process before the
  first write settles
- **THEN** the second call runs no write, and the test renders nothing
- **AND** once the first write rejects, a third call runs its write

<!-- Why: `edit` names the route; a change names a draft mutation. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft model
(`draft/`), UI-chrome i18n, and live validation. It SHALL also carry over the
structural panels (`panels/`). These panels are steps, paths, timers, actions,
subprocess spec, view editor, field catalog, data sources, and contract.

The draft routes replace file-based persistence. `GET /drafts/:processId` loads
the draft. `PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be one tabbed process surface. The
`studio-process-tabs` capability states the tab row and its ten tabs. The canvas
stands on the Canvas tab. A steps rail and a step page stand on the Steps tab,
and the `studio-step-page` capability states both.

Seven tabs carry a process-wide subject. They are Fields, Data sources, Paths,
Forms, Field matrix, Contract and Changes. Checks takes the tenth tab. Each tab
stays reachable whether or not the author has picked a step.

The process header's `⋮` overflow menu SHALL carry `baseLocale`. This capability
requires an author to declare a non-English base locale without leaving the
process surface. No tab SHALL hold that control.

The tab row SHALL belong to the Structure surface alone. The surface SHALL stand
no tab while the JSON surface is open. Four tabs write the draft body, and the
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

The step page's masthead SHALL carry one issue count for the open step as a
whole. That count SHALL cover the step's own issues, and the issues of its paths,
timers and actions. Here `resolveLoc` returns the deepest entity it finds. A
guard's issue therefore names the path, not the step. A count over the step's own
id alone would read zero on such a step.

Each section heading on the step page SHALL carry its own count. It counts the
issues `resolveLoc` resolves to an entity that section holds. A path's issue
counts at the paths section, and a timer's at the time-limit section. An issue
`resolveLoc` resolves to the step itself counts on the masthead alone. The
`studio-step-page` capability states the section register those counts sit in.

A tab SHALL carry one issue count for its own subject. Every count SHALL take the
same visual tone. The rest of the studio area already takes that tone for issues.

The studio's area nav SHALL offer a **Publish** action (see the `studio-publish`
capability). It calls `POST /drafts/:processId/publish` against the currently
persisted draft, not the in-browser draft state. When local changes remain
unsaved, the action SHALL prompt the author to save first. It must not publish
stale or ahead-of-server content. On success, the studio SHALL confirm the new
version number and `definitionHash`.

#### Scenario: A draft round-trips through the panels

- **WHEN** the author loads a draft, adds a step through the panels, saves
  the draft, and reloads it
- **THEN** the panels carry the new step identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** the author loads a draft, repositions a step, connects it to
  another step, then saves and reloads it
- **THEN** the Canvas tab draws the new position and path identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for the current draft
- **THEN** the surface prints the issues, keeps the save action available,
  and the save succeeds

#### Scenario: A Structure-surface link opens the panels screen

- **WHEN** the author picks one of the seven process-wide tabs
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
- **THEN** the step page's paths section reads a count of one, and the
  masthead's count also reads one

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the author picks Publish in the area nav while local changes
  remain unsaved
- **THEN** the studio prompts the author to save before publishing, and does
  not call `POST /drafts/:processId/publish` until the save completes

#### Scenario: The screen confirms a successful publish

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the studio prints the returned version number and `definitionHash`

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen is a routed sub-state of the edit screen

The ten tabs SHALL sit on a routed surface, not behind a dialog. The path SHALL
read `/processes/:id/edit/:tab`. Here `:tab` is one of `canvas`, `steps`,
`fields`, `dataSources`, `paths`, `forms`, `matrix`, `contract`, `changes` or
`checks`.

That path SHALL be a sub-state of the `edit` route. It rides as an optional field
on the same route object, the shape `formStepId` already takes. The
`studio-form-editor` capability routes its own screen that way.

An unrecognized `:tab` SHALL fall back to the Canvas tab. The routing table
already answers an unrecognized path with the process list, and this is that rule
one level down.

The surface SHALL stand the tab row above one body. The body SHALL hold the open
tab alone. No rail of tab names SHALL stand beside it. The rail's one-line
summary SHALL stand in the studio's area nav, not at the surface's bottom edge.
See the `studio-checks-rail` capability for what the rail carries there.

A tab SHALL fill the body. The tab row above it SHALL keep every other tab one
click away. The surface therefore needs no control back to the canvas.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `tab` and `formStepId`
matches.

<!-- "Show on the canvas" repeats the control's own name, so the word stays. -->
<!-- antislop: allow synonym-rotation -->
Choosing a "Show on the canvas" control SHALL open the Canvas tab with that step
preselected. The Canvas tab SHALL read the target whenever it changes, not only
once on mount. Reaching it from another tab therefore still selects the step.

Once read, the surface SHALL replace that history entry with the plain `edit`
route. It SHALL NOT leave the step target addressable. The browser's Back control
therefore still returns to the tab the navigation came from, per
`unified-shell`'s navigation requirement.

The body SHALL fill the height the header rows and the tab row leave. It SHALL
stop above the floor the surface uses. A taller window therefore carries a taller
body, and no empty band sits below it.

#### Scenario: The columns fill a tall window

- **WHEN** the author opens a tab on a window taller than the floor
- **THEN** the body reaches the surface's bottom edge
- **AND** no empty band sits below it

#### Scenario: A short window holds the floor

- **WHEN** the author opens a tab on a window shorter than the floor
- **THEN** the body holds that floor and the page scrolls

#### Scenario: The screen stands no checks column

- **WHEN** the author opens a tab
- **THEN** the open tab fills the body
- **AND** the checks summary stands in the area nav, in no column of its own

#### Scenario: A view has its own address

- **WHEN** the author opens the Data sources tab
- **THEN** the address bar reads that tab's path, and loading that path
  directly opens the same tab

#### Scenario: The Changes and Paths views have addresses too

- **WHEN** the author opens the Changes tab
- **THEN** the address bar reads `/processes/:id/edit/changes`, and loading
  it directly opens the same tab

#### Scenario: A reload keeps the open view

- **WHEN** the author reloads the browser on the Contract tab
- **THEN** the surface reopens on the Contract tab, not on Canvas

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Back leaves the screen rather than the process

- **WHEN** the author reaches the Fields tab from the Canvas tab and presses
  the browser's Back control
- **THEN** the Canvas tab returns, and the draft keeps every change

#### Scenario: Show on the canvas preselects a step

- **WHEN** the author picks "Show on the canvas" on a used-in row of the
  Fields tab
- **THEN** the Canvas tab opens and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the author loads `/processes/:id/edit/nonsense`
- **THEN** the Canvas tab opens, and the surface reports no issue

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- The area nav's Discard control drops every unsaved change; a panel's Remove control drops one entity. -->
No tab SHALL carry a Save control. Every change an author makes on a tab SHALL
write straight into the in-browser draft. That is how the panels write today. The
area nav's Save and Publish controls SHALL remain the only ones that persist.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" here names the process surface, a noun, and no verb of display. -->
Leaving a tab SHALL discard nothing. The surface SHALL state that plainly, so
leaving a tab never reads as a discard.

A tab's own unsubmitted input SHALL survive a switch between tabs. The contract
panel holds a half-typed outcome name in component state. The data sources panel
fetches its list keys on mount. The field matrix holds its selected cell in
component state. All four tabs SHALL therefore stay mounted for as long as the
process surface is open. Switching a tab SHALL reveal and hide them, rather than
mount them.

Each of those four tabs SHALL carry two numbers, and they SHALL read as different
things. The entity count says how many fields, data sources, outcomes or live
cells the tab holds. The `studio-process-tabs` capability states which tab prints
one. The issue count says how many of them are wrong. Only the issue count takes
the refusal tone. A tab SHALL have no issue count while its subject has no
issue.

The Fields tab and the Data sources tab SHALL each stand an entity rail beside
the open editor. The rail SHALL list that tab's own entities, and an Add entry
too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. On the Fields tab, the Add entry SHALL add a top-level field. A group
field's children indent one level under it.

A field entry SHALL be the drag source that moves its field into a group and
out of it. The entry SHALL have no move control of its own, since the field's
editor carries that control. The move requirement below states the drag, its
keyboard route and what the move writes. Data source entries SHALL take no
part in a move, since a data source nests under nothing.

Contract holds a single editor, so its tab SHALL stand no entity rail. The field
matrix draws a grid, so its tab SHALL stand none either.

A tab SHALL stand its own rail alone. No tab SHALL list another tab's entities.

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

The row SHALL NOT print the field's key. The key stays in the definition
half's "What this field asks" zone, once an author selects that field. The
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
  Canvas tab
- **THEN** the draft still carries that field, and the area nav still reports
  unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the author types an outcome name on the Contract tab, opens the
  Fields tab without adding it, then returns
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the author moves roving focus to a live cell on the Field matrix
  tab and activates it
- **AND** the author opens the Contract tab, then returns
- **THEN** the same cell still holds roving focus, and it is still activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the author inspects an open tab
- **THEN** it has no Save control, and it states that it keeps every
  change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a contract
- **THEN** the Fields tab reads three, the Data sources tab reads two, and
  the Contract tab stands no entity rail

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a validation
  issue
- **THEN** the Fields tab reads three for its entity count and one for its
  issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the Data sources tab reads two and has no issue count

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
- **THEN** the Data sources tab renders that data source's editor, and it
  renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the author opens the Data sources tab on a draft that carries both
  fields and data sources
- **THEN** that tab's rail lists the data sources, and it lists no field

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child now opens its own editor. -->
#### Scenario: A group child selects its group

- **WHEN** the author picks a group field's child in the rail
- **THEN** the tab renders that child's own editor, with both halves
- **AND** the rail marks the child's entry alone, and neither the group's
  entry nor a sibling's entry

#### Scenario: A newly chosen field's editor opens at its top

- **WHEN** the author scrolls a field's editor down to its "Validation" zone
- **AND** the author picks another field in the rail
- **THEN** the editor shows that field's "What this field asks" zone at its
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

- **WHEN** the author picks the rail's Add entry on the Data sources tab
- **THEN** the draft carries one more data source, the rail lists it, and the
  tab renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the author removes the selected data source from a draft that
  carries three
- **THEN** the tab renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the author reloads the browser on the Data sources tab
- **THEN** the tab renders the first data source in the draft

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

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's Changes view shows what a publish would change

The Changes tab SHALL state the difference between the draft and the version the
draft sits on. It answers the question a publish raises.

The tab SHALL read the draft as the editor holds it, including changes the
author has not saved. The `process-version-inspection` capability's versions
screen reads the saved draft from the server instead.

Both screens SHALL use one difference computation. The tab SHALL pass the base
version as the before side and the draft as the after side. Every row then runs
from the published value toward the draft value, the direction a publish moves.

The tab SHALL list one row per changed entity. A row names its entity by label
and by key. A data source has no label, so its row names its key alone. A row
carries one stamp, reading added, changed or removed.

Rows SHALL stand under seven group headings, in this order: Process, Fields,
Data sources, Steps, Paths, Forms, Contract. A group holding no row SHALL NOT
appear.

A list SHALL pair its members by anchor. Steps, fields,
paths, timers, actions and data sources pair by `id`. Fields pair across the
whole catalog, so a field moved into another group stays one row. A form entry
pairs by its `ref`, a form tab by its `key`, and a field option by its `value`.
A note has no anchor, so notes pair by their position among the view's
notes.

Each group owns a fixed set of rows:

- Process holds one row for the process's own keys and its initial step.
- Fields holds one row per field. The group a field sits in is one of its
  properties.
- Data sources holds one row per data source.
- Steps holds one row per step. A step's assignment, timers and actions are its
  properties.
- Paths holds one row per path. The row names the step the path leaves.
- Forms holds one row per step whose view differs. Its entries, tabs, notes and
  columns are that row's properties.
- Contract holds one row for the input fields, output fields and outcomes.

A list whose members differ only in position SHALL add one order property to
the row owning that list. The property SHALL name that list, such as Step order
or Form order. It SHALL add no row for a moved member.

A step the draft adds SHALL also add a row under Paths for each of its paths. It
SHALL add a row under Forms for its view. A step the draft drops SHALL do the
same with removed rows.

Every row SHALL stand folded when the change list first appears. Leaving the tab
and returning to it SHALL keep each row's open state. A folded row SHALL name the
properties that differ, four at most, and then state how many more differ. An
open row SHALL show each property's value before and after.

A value SHALL read in words where the tab has a word for the property. A
localized text reads in the editor's content locale, falling back to the base
locale. A difference in any other locale reads as a property of
its own, named with that locale. A yes-or-no value reads as yes or no. A
reference to another entity reads as that entity's label. A CEL expression reads
as its source text.

A property the tab has no word for SHALL read under its JSON key, with its
values printed as JSON. No difference SHALL drop out of the list for want of a
word.

An open row SHALL offer a command opening the tab that owns its entity. The
Process row SHALL offer none: no single tab holds the process's own keys. Every
open row SHALL hold a Developer view, listing the row's JSON paths with their
values before and after. The tab SHALL offer one command that opens every row, and folds them
all again.

A row SHALL keep its open state across a later draft change that leaves its
entity in the list.

<!-- The compile pass's cancel sink is the engine's own term. -->
<!-- antislop: allow synonym-rotation -->
The tab SHALL strip the compiled content from the base version's body first. The
versions screen gives that body the same treatment. The compile pass injects a
cancel sink, and no author wrote it.

A process with no base version SHALL read as a first publish. The tab says so,
and it has no difference.

An empty difference SHALL read as such. The tab says the draft matches its base
version.

The Changes tab SHALL print its number of rows as its own count.

#### Scenario: A draft over a published version shows its difference

- **WHEN** the author opens the Changes tab on a draft of a published process
- **THEN** the tab states what the draft changes against its base version

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: An unsaved edit reaches the view

- **WHEN** the author renames a step and opens the Changes tab without saving
- **THEN** the Steps group holds one changed row for that step
- **AND** opening the row shows the published label before and the unsaved
  label after

#### Scenario: One added field reads as one added row

- **WHEN** the author adds one field to a catalog of 51 fields
- **THEN** the Fields group holds one added row, naming the new field
- **AND** no row repeats any of the other 51 fields

#### Scenario: A field moved into another group stays one row

- **WHEN** the author moves a field out of one group and into another
- **THEN** the Fields group holds one changed row for that field
- **AND** its Group property reads the old group's label before and the new
  group's label after

#### Scenario: A reorder reads as one order property

- **WHEN** the author swaps two field entries on a step's form and changes
  nothing else
- **THEN** the Forms group holds one changed row for that step
- **AND** that row's only property is Form order

#### Scenario: An added step brings its paths and its form

- **WHEN** the author adds a step carrying two paths and a view
- **THEN** the Steps group holds one added row for the step
- **AND** the Paths group holds two added rows, and the Forms group holds one

#### Scenario: A folded row names four properties at most

- **WHEN** the author changes six entries on one step's form
- **THEN** that step's folded row under Forms names four of them
- **AND** it states that two more differ

#### Scenario: A label reads in the content locale

- **WHEN** the author sets the editor's content locale to German, and renames a
  field's German label
- **THEN** the field's open row shows the German label before and after

#### Scenario: A property with no word reads under its JSON key

- **WHEN** the draft adds a key to a step that the tab has no word for
- **THEN** the step's row lists that key as a property
- **AND** its value prints as JSON

#### Scenario: An open row opens the tab owning its entity

- **WHEN** the author opens a row under Paths and presses its open command
- **THEN** the Paths tab opens

#### Scenario: An open row stays open after a further change

- **WHEN** the author opens a field's row, then changes another field on the
  Fields tab
- **THEN** the first field's row still stands open on the Changes tab

#### Scenario: A publish moves the base and the view follows it

- **WHEN** the author publishes the draft from the header bar and returns to
  the Changes tab
- **THEN** the tab reads the newly published version, with no reload
- **AND** it reports that the draft matches that version

#### Scenario: A never-published process reads as a first publish

- **WHEN** the author opens the Changes tab on a process with no base version
- **THEN** the tab says the publish would be the first one, and it has no
  difference

#### Scenario: A draft matching its base reads as no difference

- **WHEN** the author opens the Changes tab on a draft nobody has changed
  since it seeded from its base version
- **THEN** the tab says the draft matches that version

#### Scenario: The count counts rows

- **WHEN** a draft renames one field and adds one path
- **THEN** the Changes tab's count reads 2

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's Paths view lists every path in the process

The Paths tab SHALL carry one row per path across the whole draft. The five
columns are source step, trigger, priority, guard and target. A canvas draws a
path as a line, and a line hides those five values.

Rows SHALL follow the draft's own order. The steps order the rows first, and each
step's own path order orders the rows inside it.

A path with no guard SHALL read as such, and so SHALL a path with no priority.
The tab states each absence rather than leaving a blank cell unexplained. A guard
is independent of the trigger. A manual path can carry one. That guard decides
whether the participant may take the path, so the tab SHALL carry it.

A draft with no path at all SHALL carry an empty state naming that fact.

The row derivation SHALL live in a pure module with `bun:test` coverage, the
convention `packages/web/src/areas/app/screens/inboxLogic.ts` sets. It takes the
draft's steps and returns the rows. The test needs no DOM and no rendering.

The Paths tab SHALL print the path count as its own count.

#### Scenario: Every path takes a row

- **WHEN** the author opens the Paths tab on a draft holding four steps and
  five paths
- **THEN** the tab carries five rows

#### Scenario: A row names its source step and its target step

- **WHEN** the tab carries a path's row
- **THEN** that row names the step the path leaves and the step it enters

#### Scenario: A manual path with no guard reads as carrying none

- **WHEN** a step's manual paths carry no guard and no priority
- **THEN** each of their rows reads as carrying no priority and no guard

#### Scenario: A manual path carrying a guard shows it

- **WHEN** a manual path carries a guard
- **THEN** its row carries that guard's CEL source

#### Scenario: An automatic path shows its priority and its guard source

- **WHEN** a step carries two automatic paths, one guarded
- **THEN** each row carries that path's priority
- **AND** the guarded row carries its guard's CEL source

#### Scenario: A draft with no path shows an empty state

- **WHEN** the author opens the Paths tab on a draft holding no path
- **THEN** the tab says the process has no path yet

#### Scenario: The row derivation holds without rendering

- **WHEN** a test gives the row derivation a list of steps
- **THEN** it returns one row per path, in the draft's own order
- **AND** the test needs no DOM or canvas rendering

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

### Requirement: The field catalog's definition half offers a Technical control

The field catalog's definition half SHALL offer a Technical checkbox for
the selected field. A field nested inside a group SHALL offer it in that
field's own editor. Checking it SHALL write `technical: true`. Unchecking it
SHALL delete the `technical` key. Every other view-flag control in the studio
already follows that same convention for its own default value.

A group's child holds a value of its own, and a structural source can
write it. The compile rule and the rail's own finding both read the
flattened catalog. A control on the top-level field alone would leave
one gap. A nested field would state `technical` through the JSON view
alone.

Checking it SHALL also delete every `required` and `readonly` key that
any step's `view.fields[]` entry carries for that field. That deletion
SHALL happen in the same draft mutation. The definition contract rejects
those keys on a technical field's entry.

Every builder control that could clear one also goes away as the
developer checks the box. The strip omits them, the matrix cell disables
them, the row offers no bulk badge. Without the clearing pass, a stale
key would block the publish. The JSON view would be the only route back
to it. The pass SHALL walk every step, including a step the field matrix
omits.

Unchecking SHALL write no `required` or `readonly` key back. The pass
records no prior state, so an uncheck cannot restore an authored
`required: true` or `readonly: true` the check deleted. Restoring a
default-valued key instead would move `definitionHash` under a change
that alters no behaviour. Restoring an authored one is not possible.

Checking Technical SHALL need a confirmation before the clearing
pass runs. The confirmation SHALL name the count of `required` and
`readonly` keys the pass will delete. Declining it SHALL leave the
draft as it stands, with no `technical` key written. Checking
Technical on a field carrying no such key SHALL run no confirmation.

A field of `type: "group"` SHALL disable the control, at any nesting
depth. The definition contract rejects `technical: true` on a group
field. Offering the control there would only invite a rejected publish.

#### Scenario: Checking Technical writes the key

- **WHEN** the developer checks Technical on a non-group field in the
  field catalog
- **THEN** that field's `technical` key becomes `true`

#### Scenario: Checking Technical clears the field's stale flag keys

- **WHEN** one step's view entry for a field carries `required: true`
- **AND** another step's entry for it carries `readonly: false`
- **AND** the developer checks Technical on that field
- **THEN** neither entry carries a `required` or a `readonly` key
- **AND** the draft publishes

#### Scenario: Unchecking Technical deletes the key

- **WHEN** the developer unchecks Technical on a field already carrying
  `technical: true`
- **THEN** that field has no `technical` key
- **AND** no view entry regains a `required` or `readonly` key

#### Scenario: A group's child offers the control

- **WHEN** the developer selects a field nested inside a `type: "group"`
  field
- **THEN** that field's own definition half offers the Technical checkbox

#### Scenario: A group field disables the Technical control

- **WHEN** the developer selects a field of `type: "group"` in the field
  catalog
- **THEN** the field catalog disables the Technical checkbox

#### Scenario: Checking Technical confirms the keys it will delete

- **WHEN** the developer checks Technical on a field whose view entries
  carry three `required` or `readonly` keys across the draft's steps
- **THEN** the field catalog asks for a confirmation naming that count
  of keys
- **AND** declining it leaves every one of those keys in place, and
  writes no `technical` key

#### Scenario: A field with no stale key confirms nothing

- **WHEN** the developer checks Technical on a field no view entry
  carries a `required` or `readonly` key for
- **THEN** the field catalog asks for no confirmation

### Requirement: The field catalog's field key auto-derives from the field label

The field catalog's key field SHALL auto-fill from the field's label as the
developer types it. It SHALL do so while the key is empty. It SHALL also do
so while the key still equals what derivation produces from the label's prior
value. In any other case, a write to the label SHALL leave the key as it
stands. This applies to a top-level catalog field and to a field nested inside
a `group` field alike.

Derivation SHALL read only the base-locale entry of the field's label. A write
to any other locale's translation SHALL NOT trigger key derivation.
Derivation SHALL lower-case the label. It SHALL collapse every run of
characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
trailing `_`. A result starting with a digit SHALL gain a leading `_`.

The result then takes the shape the definition contract's identifier grammar
already requires of a published `FieldDef.key`: `/^[a-z_][a-z0-9_]*$/`.

A derived key can collide with a key that another field already carries.
That other field can sit at the top level or inside any `group`. The field
catalog SHALL then append `_2`. A second collision SHALL swap `_2` for `_3`.
The catalog SHALL keep raising the number until no other field carries the
candidate.

The developer's first direct write to a field's key field SHALL stop this
auto-fill for that one field. The stop SHALL hold for the rest of the draft's
lifetime in the browser. The key field SHALL remain an ordinary, writable text
input throughout.

#### Scenario: A new top-level field's key follows its label as the developer types

- **WHEN** the studio's content locale is the draft's base locale
- **AND** the developer drops a new field onto the canvas
- **AND** the developer types "Requested amount" into its label, never
  touching its key field
- **THEN** the field's key reads `requested_amount`

#### Scenario: A new field's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away from
  the draft's base locale
- **AND** the developer drops a new field onto the canvas
- **AND** the developer types a label into it, never touching its key field
- **THEN** the field's key stays empty. A new field's label seeds under the
  current content locale. Derivation reads the base-locale entry alone

#### Scenario: A new nested field's key follows its label as the developer types

- **WHEN** the developer adds a field inside a `group` field
- **AND** the developer types a label into it, never touching its key field
- **THEN** the nested field's key derives from its own label the same way a
  top-level field's does

#### Scenario: A colliding derived field key gets a numeric suffix

- **WHEN** the developer types a label that derives to a key another field
  in the catalog already carries
- **AND** that other field sits at the top level or inside a group
- **THEN** the new field's key reads the colliding key with a `_2` suffix

#### Scenario: A second collision takes the next number

- **WHEN** the developer types a label that derives to `amount`
- **AND** other fields already carry `amount` and `amount_2`
- **THEN** the new field's key reads `amount_3`

#### Scenario: A hand-edited field key stops following its label

- **WHEN** the developer types over a field's auto-derived key
- **AND** the developer then types more into that field's label
- **THEN** that field's key stays what the developer typed

#### Scenario: Editing a non-base-locale translation leaves an already-derived field key untouched

- **WHEN** the developer types a base-locale field label, which derives a key
- **AND** the developer switches the studio's content locale
- **AND** the developer types a translation into the label's entry for that
  locale
- **THEN** the field's key keeps the value it derived

### Requirement: The field matrix lists every catalog field against every workflow step

The field matrix view SHALL draw a grid. Its rows are the field
catalog, depth-first flattened in catalog order: a group field
immediately followed by its own children. Its columns are
`workflow.steps`, in array order. The grid SHALL include every catalog
field and every step. This holds whether or not a given step's view
references a given field.

Each cell SHALL draw in one of three states:

- **Hatched**, where the column's step declares no `view` at all. Every
  cell in that column SHALL draw hatched, regardless of the row.
- **Blank**, where the step declares a `view` and that view's `fields`
  has no entry referencing the row's field.
- **Live**, where such an entry exists. A live cell SHALL show
  independent `visible`, `required` and `readonly` controls. Each
  control SHALL show that entry's own resolved value. Where a flag
  carries a CEL expression instead, its control gives way to a CEL
  stamp. That stamp SHALL show the expression's source.

#### Scenario: The grid covers the whole catalog and the whole step list

- **WHEN** the developer opens the field matrix on a draft with N
  catalog fields and M workflow steps
- **THEN** the grid draws N rows and M columns, independent of how many
  view entries exist

#### Scenario: A group field heads its own children

- **WHEN** the field catalog declares a group field with nested fields
- **THEN** the group's row sits immediately above its children's rows,
  in the order the Fields rail lists them

#### Scenario: A step with no view hatches its whole column

- **WHEN** a workflow step declares no `view`
- **THEN** every cell in that step's column draws hatched, for every
  field row

#### Scenario: An unreferenced field on a view-bearing step draws blank

- **WHEN** a workflow step declares a `view` whose `fields` has no
  entry for a given catalog field
- **THEN** that field's cell in that step's column draws blank

#### Scenario: A referenced field draws live with its flags summarized

- **WHEN** a workflow step's view carries an entry referencing a
  catalog field
- **THEN** that cell draws live
- **AND** it shows one control per flag, each at the entry's resolved
  `visible`, `required` and `readonly` value

### Requirement: A live cell edits its own view entry inline

Each live cell's `visible`, `required` and `readonly` controls SHALL
each be a plain boolean checkbox. The matrix SHALL offer no
boolean-or-CEL switch.

CEL authoring for `required` and `readonly` happens only on the
field's own strip, `studio-form-editor`'s "Developer view" disclosure.
CEL authoring for `visible` happens there too, or on the field
catalog's "Only ask this when" row. That row writes the
same `visible` override across every referencing step view.

Each checkbox SHALL carry no visible label. It SHALL carry an
`aria-label` naming its own flag, so a screen reader still announces
which control it reached. The cell's three flag controls SHALL sit in
one horizontal row. That row keeps `visible`/`required`/`readonly`
order, the same order the column and row bulk-toggle badges already
use.

Each checked checkbox SHALL also carry its own color, one of three
fixed colors keyed on which flag it controls. The `visible` checkbox
SHALL use one color, `required` a second, and `readonly` a third, once
each one reads checked. An unchecked checkbox keeps the platform's own
default appearance. The native `accent-color` mechanism this requirement
relies on tints only a checked or indeterminate control, in every
evergreen browser.

Every checked live cell in the field matrix SHALL use the same three
colors, in the same `visible`/`required`/`readonly` assignment. The
color adds to the checkbox's `aria-label` and its row position; neither
of those changes.

Each checkbox SHALL start from the entry's own resolved value: an
absent key reads the engine's own default, not `false`. Changing a
checkbox SHALL write to that entry's key immediately, through the same
`setFlag` primitive `studio-form-editor` already uses. It SHALL clear
the key on a return to its default.

Where a live cell's own `visible` resolves to a literal `false`, that
cell's `required` and `readonly` checkboxes SHALL disable. That is the
same gating the field matrix applied before this change.

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
Where no other source in the draft, **guaranteed to be written before
this cell's own step is submitted**, writes a live cell's field, its
`required` and `readonly` checkboxes SHALL gate each other. Checking
`required` SHALL disable `readonly`, while `readonly` does not already
read `true`. Checking `readonly` SHALL disable `required`, while
`required` does not already read `true`. "No other source, guaranteed
before this step" means none of these already write the field:

<!-- antislop: allow run-ons sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- an action's `output`, where the action sits on a step that
  **dominates** this cell's own step (every path from `initialStep` to
  this cell's step passes through the action's step), or on this
  cell's own step at `onEntry`, or on this cell's own step's timer
  `onFire` declaring a `targetPath`
- a subprocess's `outputMapping`, on a step that dominates this cell's
  own step
- a field's `columnMapping`
- a `contract.inputFields` entry
- another editable view entry (`visible !== false`, `readonly !==
  true`) for the same field, on a step that dominates this cell's own
  step

<!-- antislop: allow sentence-length passive-voice run-ons em-dash -->
<!-- Why: copied byte for byte from the live requirement. -->
A step dominating another is the same relation the compile pass's
`definition-contract` check (`checkUnsatisfiableRequiredReadonly`) now
uses. The two SHALL share one dominance computation over the draft's
`workflow.steps`. Neither can then disagree with the other about which
step guarantees a value before a given step submits. A step editable
only on a step that does NOT dominate this cell's own step does NOT
count. That covers a step reachable solely after it, or only via a
different branch. Gating stays engaged.

Where a cell already carries `required: true` and `readonly: true`
before either gate engages, neither checkbox SHALL disable. The
developer keeps a path to uncheck either one.

Where a live cell's field declares `technical: true`, that cell's
`required` and `readonly` checkboxes SHALL disable, whatever the two
keys already hold. This case overrides the both-flags escape above.
The definition contract rejects either key on a technical field's view
entry. No path to set one may stay open. The field catalog's Technical
checkbox clears any key already there.

Where a flag already carries a CEL expression, its checkbox SHALL give
way entirely to the CEL stamp. That stamp sits in the same horizontal
row as the cell's other controls. The matrix SHALL offer no control
there, boolean or otherwise. It SHALL offer no way to switch that flag
back to a boolean from inside the matrix. Editing that flag stays
possible on the field's own strip. For `visible` alone it is also
possible on the field catalog's condition row.

A disabled checkbox that reads checked SHALL keep its flag's own
color. The same opacity rule every other disabled control in the
studio area uses dims it. A checked, gated checkbox does not lose its
color to a neutral shade. It stays identifiable by color, only
fainter.

A disabled checkbox that reads unchecked keeps the platform's own
default unchecked appearance, per this requirement's earlier rule.
That same reduced opacity still applies to it.

#### Scenario: Changing a cell's control writes the same entry the form editor writes

- **WHEN** the developer changes a live cell's `visible`, `required` or
  `readonly` checkbox
- **THEN** the underlying step's view entry for that field updates
  immediately, in the in-browser draft, without a Save control

#### Scenario: A control returning to its default clears the key

- **WHEN** the developer sets a live cell's checkbox back to the
  engine's own default for that flag
- **THEN** the corresponding key is absent from the view entry. It does
  not carry the default value instead

#### Scenario: Turning visible off disables the other two controls

- **WHEN** the developer sets a live cell's `visible` checkbox to
  literal `false`
- **THEN** that cell's `required` and `readonly` checkboxes disable,
  and their keys clear from the entry

#### Scenario: A hatched or blank cell offers no control

- **WHEN** the developer inspects a hatched cell or a blank cell
- **THEN** neither cell offers a `visible`, `required` or `readonly`
  control

#### Scenario: A boolean or undefined flag shows a checkbox only

- **WHEN** the developer opens a live cell whose `visible`, `required`
  or `readonly` value is boolean or absent
- **THEN** that flag's control is a plain checkbox
- **AND** the matrix shows no select or other control to choose CEL
  mode for that flag

#### Scenario: A CEL-carrying flag offers no checkbox

- **WHEN** a live cell's `visible`, `required` or `readonly` already
  carries a CEL expression
- **THEN** the matrix shows that flag's CEL stamp only
- **AND** the matrix offers no checkbox, select, or other way to change
  or clear that flag

#### Scenario: A cell's three controls sit in one row

- **WHEN** the developer inspects a live cell carrying two or more
  flags
- **THEN** those flags' controls sit side by side in one horizontal
  row, not stacked

#### Scenario: A checkbox with no visible label still names its flag

- **WHEN** a screen reader reaches a live cell's `visible`, `required`
  or `readonly` checkbox
- **THEN** it announces that flag's own name, through the checkbox's
  `aria-label`

#### Scenario: Checking required disables readonly on an unwritten field

- **WHEN** the developer checks a live cell's `required` box
- **AND** nothing else in the draft, guaranteed before that cell's own
  step, writes that field
- **AND** that cell's `readonly` does not already read `true`
- **THEN** that cell's `readonly` checkbox disables

#### Scenario: Checking readonly disables required on an unwritten field

- **WHEN** the developer checks a live cell's `readonly` box
- **AND** nothing else in the draft, guaranteed before that cell's own
  step, writes that field
- **AND** that cell's `required` does not already read `true`
- **THEN** that cell's `required` checkbox disables

#### Scenario: A field something else writes keeps both controls free

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** the developer checks a live cell's `required` box
- **AND** an action output, a subprocess output mapping, a column
  mapping, a contract input field, or another editable view entry for
  the same field on a step that dominates this cell's own step already
  writes that field
- **THEN** that cell's `readonly` checkbox stays enabled

#### Scenario: A field editable only on a non-dominating step keeps gating engaged

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** the developer checks the first step's live cell for a
  field's `required` box
- **AND** the field's only other editable placement is on a step
  reachable only after this first step, or only via a different branch
- **THEN** that cell's `readonly` checkbox disables

#### Scenario: An own-step post-gate output does not clear gating

<!-- antislop: allow sentence-length em-dash passive-voice -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** the developer checks a live cell's `required` box
- **AND** the field's only other writer is an action's `output` on the
  cell's own step at `onExit`, `onPath`, or `onCancel`
- **THEN** that cell's `readonly` checkbox still disables — an own-step
  post-gate output fires after the submission gate, so it does not
  count as a source that writes the field before this step is
  submitted

#### Scenario: An entry already carrying both flags stays editable

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **WHEN** a live cell already carries `required: true` and
  `readonly: true`, on a field nothing else in the draft, guaranteed
  before that cell's own step, writes
- **THEN** neither the `required` nor the `readonly` checkbox disables
- **AND** the developer can uncheck either one

#### Scenario: A technical field's cell disables required and readonly

- **WHEN** a live cell's field declares `technical: true`
- **THEN** that cell's `required` and `readonly` checkboxes disable
- **AND** its `visible` checkbox stays enabled

#### Scenario: Every checked checkbox for one flag shares one color

- **WHEN** the developer opens the field matrix on a draft with
  multiple live cells carrying a checked `visible` checkbox
- **THEN** every one of those checked `visible` checkboxes renders in
  the same color
- **AND** that color differs from the color every checked `required`
  checkbox and every checked `readonly` checkbox renders in

#### Scenario: A disabled, checked checkbox stays identifiable by color

- **WHEN** a live cell's `required` or `readonly` checkbox reads
  checked and then disables, through any of this requirement's gating
  rules
- **THEN** that checkbox still renders in its own flag's color
- **AND** it renders at the reduced opacity every disabled control in
  the studio area already uses

#### Scenario: A disabled, unchecked checkbox keeps the default appearance

- **WHEN** a live cell's `required` or `readonly` checkbox reads
  unchecked and then disables, through any of this requirement's
  gating rules
- **THEN** that checkbox keeps the platform's own default unchecked
  appearance, carrying no color
- **AND** it renders at the reduced opacity every disabled control in
  the studio area already uses

### Requirement: Column headers name the step and flag steps with no view

Each column header SHALL show the step's `key` alongside its resolved
label. Where a step declares no `view` at all, its column header SHALL
carry an explicit note stating so. That column also draws hatched.

#### Scenario: A column header shows the step's key and label

- **WHEN** the developer opens the field matrix
- **THEN** every column header shows that step's `key` and its
  resolved label

#### Scenario: A step with no view carries a note in its own header

- **WHEN** a workflow step declares no `view`
- **THEN** that step's column header carries a note stating it
  declares no view

### Requirement: Row headers name the field and its type

Each row header SHALL show the field's `key` alongside its `type`.

#### Scenario: A row header shows the field's key and type

- **WHEN** the developer opens the field matrix
- **THEN** every row header shows that field's `key` and its `type`

### Requirement: The field matrix marks a technical field's row header

Each row header in the field matrix SHALL carry a marker when its field
declares `technical: true`. The marker stays separate from a cell's own
`visible`, `required`, `readonly` and flagged-cell markers. It names a
fact about the field, not about any one cell.

#### Scenario: A technical field's row carries the marker

- **WHEN** the field matrix draws a row for a field declaring
  `technical: true`
- **THEN** that row header carries the technical-field marker

#### Scenario: A non-technical field's row carries no marker

- **WHEN** the field matrix draws a row for a field declaring no
  `technical` key
- **THEN** that row header carries no technical-field marker

<!-- antislop: allow synonym-rotation -->
### Requirement: Column and row headers offer bulk flag toggles on the panels screen

The Field matrix tab mounts the only field matrix, and this requirement covers
it. The wrapper adds these badges to the bare grid.

Each column header and each row header SHALL offer `visible`, `required` and
`readonly` toggle badges. This holds wherever that column or row carries at least
one live cell. A badge SHALL flip every live, non-CEL cell in that column or row.

A `required` or `readonly` badge SHALL skip any cell already gated for that flag.
Gated means one of two things. The cell's own `visible` resolves to `false`, or
the field's other flag among `required`/`readonly` already resolves to `true`.
The second case applies only while nothing else in the draft writes that field.
Such a writer must land before the participant submits that cell's own step.
That is the same dominance-scoped test "A live cell edits its own view entry
inline" defines.

Every `required` and `readonly` bulk badge SHALL treat a technical field's cell
as gated, unconditionally. This holds on a column header and on a row header
alike. This matches a cell that already carries the flag's opposite. The
definition contract rejects either key on a technical field's view entry. A bulk
badge SHALL NOT write one there, even where the column's other rows are eligible.

Where every eligible cell already carries the flag's non-default value, the badge
SHALL turn that flag off across those cells. It turns the flag on otherwise.

A column or row with no live cell SHALL carry no bulk toggle badge.

The matrix SHALL NOT stand a single badge whose own eligible cell set is empty.
Gating a cell only stops the write. It leaves the button in place. A button that
answers no click reads as a broken control.

This rule widens the live-cell rule above, from the whole badge group to one
badge. It covers a technical field's row with no second exclusion mechanism.
`visible` keeps a non-empty eligible set there. That badge stays, and the other
two go. The rule also removes a badge from a row whose cells the studio gates for
any other reason.

A column header's `visible`/`required`/`readonly` badges SHALL sit in three fixed
positions, one per flag, in that order. Those positions SHALL match the fixed
positions the same three flags hold in the column's own cells below. A badge can
be absent because its eligible set is empty. Its position SHALL stay empty then,
rather than let the remaining badges shift into it.

#### Scenario: A column's bulk badge sets every eligible cell in that step

- **WHEN** the author picks a column's `required` badge, on a step where none
  of its live, non-CEL, non-gated cells carry `required: true`
- **THEN** every one of those cells' `required` value becomes `true`

#### Scenario: A row's bulk badge clears every eligible cell for that field

- **WHEN** every live, non-CEL, non-gated cell for one field already carries
  `required: true`, across every step
- **AND** the author picks that field's `required` badge
- **THEN** every one of those cells' `required` key clears

#### Scenario: A bulk badge skips CEL and gated cells

- **WHEN** the author picks a column's or row's `required` or `readonly`
  badge
- **THEN** it changes no cell whose relevant flag carries a CEL expression
- **AND** it changes no cell whose `visible` resolves to `false`

#### Scenario: A column with no live cell carries no bulk badge

- **WHEN** a workflow step declares no `view`
- **THEN** that step's column header carries no bulk toggle badge

#### Scenario: A bulk badge skips a cell gated by the required/readonly rule

- **WHEN** the author picks a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`, on a field
  nothing else in the draft writes before that cell's own step
- **THEN** the badge leaves that cell's `readonly` value alone

#### Scenario: A bulk badge does not skip a cell written only on a non-dominating step

- **WHEN** the author picks a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`
- **AND** the field's one other editable placement sits on a non-dominating
  step
- **AND** that step follows this cell's own step, or sits on a different
  branch
- **THEN** the badge still skips that cell
- **AND** the non-dominating placement makes it no more eligible

#### Scenario: A technical field's row never receives a bulk required or readonly toggle

- **WHEN** the author picks a column's `required` or `readonly` badge for a
  step where a technical field's cell is otherwise live
- **THEN** the badge leaves that cell's `required` and `readonly` value alone

#### Scenario: A technical field's row offers no required or readonly bulk badge of its own

- **WHEN** the field matrix draws the row header for a technical field with
  at least one live cell
- **THEN** that row header offers no `required` or `readonly` toggle badge
- **AND** it still offers the `visible` toggle badge

#### Scenario: A row already gated on every cell offers no bulk badge either

- **WHEN** every live cell for one field already carries `required: true`
- **AND** nothing else in the draft writes that field before each cell's own
  step
- **AND** no cell's field declares `technical: true`
- **THEN** that row header offers no `required` toggle badge

#### Scenario: A column header with only one eligible badge still aligns with its column's checkboxes

- **WHEN** every one of a column's live cells is a technical field
- **AND** `visible` stays eligible there, while `required` and `readonly`
  have no eligible cell
- **THEN** that column header carries the `visible` badge alone
- **AND** the `visible` badge sits in the same fixed position a `visible`
  checkbox holds in that column's cells
- **AND** the badge does not shift toward where `required` or `readonly`
  would otherwise sit

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

### Requirement: The three bulk flag badges render at one shared width

Each bulk flag badge the field matrix draws SHALL render at one shared
fixed width. The width SHALL be the same for `visible`, `required` and
`readonly` alike. It SHALL fit the widest badge. The two-character
`readonly` badge then reads as a member of the group, not a narrower
badge. This holds on the panels screen's column and row headers
wherever they carry a bulk badge.

#### Scenario: The readonly badge is no narrower than its neighbors

- **WHEN** the field matrix draws a column or row header whose eligible
  set holds more than one flag
- **THEN** each badge renders at the same width as its neighbors
- **AND** the `readonly` badge is no narrower than the `visible` or
  `required` badge

<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's field matrix toolbar filters inert columns and reports coverage

The Field matrix tab mounts the only field matrix, and this requirement covers
it.

The field matrix SHALL carry a toolbar above the grid. The toolbar SHALL carry a
toggle that hides every step with no `view` at all from the grid, when engaged.
The toggle SHALL affect only the grid's columns. It SHALL leave every row in
place.

The toolbar SHALL also carry one live count line. That line SHALL state four
numbers. A note entry SHALL raise neither the declared field-entry count nor,
through it, the undeclared-cell count. The one case below is its only exception.
The fourth number subtracts the first from a grid of cells, so the two must count
the same thing.

- the number of declared field entries
- the field count
- the count of steps the grid currently draws
- the number of cells among those steps that carry no entry

That case moves two of the four numbers. Where a note is the first entry in a
step that declared no `view`, that step stops being inert. It then joins the
drawn columns. `stepCount` rises by one, and `undeclaredCells` by the whole field
count.

That is one more cell than a first field entry moves it. A field entry adds a
declared entry, and the fourth number subtracts that entry back out. A note adds
none. The note itself still counts as no entry and occupies no cell.

#### Scenario: Hiding inert columns removes steps with no view

- **WHEN** the author engages the "Hide inert columns" toggle on a draft
  where 3 of 13 steps declare no view
- **THEN** the grid draws 10 columns, and none of them belongs to a step with
  no view

#### Scenario: The toggle leaves every row in place

- **WHEN** the author engages the "Hide inert columns" toggle
- **THEN** the grid still draws every catalog field as a row

#### Scenario: The count line reflects the currently drawn columns

- **WHEN** a draft carries 54 field entries, 22 fields and 13 steps, of which
  3 declare no view
- **AND** the author engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 10 steps, and
  166 cells the visible steps do not declare

#### Scenario: A note moves none of the four numbers

- **WHEN** a step that already declares a view in that same draft gains three
  note entries
- **THEN** the count line still reads 54 field entries and 166 undeclared
  cells, because a note occupies no cell

#### Scenario: A note in a viewless step joins the drawn columns

- **WHEN** a note is the first entry in one of that same draft's 3 steps
  declaring no `view`
- **AND** the author engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 11 steps, and
  188 cells the visible steps do not declare

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen's field matrix toolbar explains its marks with a legend

The Field matrix tab mounts the only field matrix, and this requirement covers
it.

The toolbar SHALL carry a legend. The legend SHALL explain seven marks:

- a bulk badge sets the whole column or row it sits on
- a cell with no key written reads the engine's own default
- what the CEL stamp marks
- what a blank cell's dash means
- what the flagged-cell marker means
- what the technical-field row-header marker means
- which color maps to `visible`, which to `required`, and which to `readonly`

The seventh entry SHALL carry a swatch in each of the three checkbox colors
beside that color's flag name. A swatch SHALL use the exact color the live cells'
checkboxes use for that flag. The legend defines no separate color of its own.

#### Scenario: The legend is visible without further interaction

- **WHEN** the author opens the Field matrix tab
- **THEN** the toolbar's legend is visible, with no click or hover needed to
  reveal it

#### Scenario: The legend's color entry matches the grid's own colors

- **WHEN** the author compares the legend's `visible`/`required`/`readonly`
  swatches against a live cell's checkboxes
- **THEN** each swatch's color equals that flag's checkbox color in the grid

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

### Requirement: A live cell marks itself when it produces a view Checks finding

A live cell whose resolved flags currently produce one of
`checkViewFlags`'s findings SHALL carry a flagged marker. That marker
stays separate from the cell's `visible`, `required` and `readonly`
controls. `checkViewFlags` reports two findings, in the same order it
checks them:

1. `required` while `visible` resolves to `false`
2. `required` together with `readonly`, where no other source in the
   draft, guaranteed to be written before this cell's own step is
   submitted, already writes that field. None of these SHALL write it:
   - an action's `output` on a step that dominates this cell's own step
   - a subprocess's `outputMapping` on a step that dominates this
     cell's own step
   - a field's `columnMapping`
   - a `contract.inputFields` entry
   - another editable view entry for the same field on a step that
     dominates this cell's own step

   A step reachable only after this cell's own step, or only via a
   different branch, does NOT dominate it, and an editable placement
   or action output there does not clear this finding.

A live cell whose own field is a group field SHALL carry no flagged
marker, either way. The engine's own `checkViewFlags` function skips
a group field first, before it checks either finding.

A flag carrying a CEL expression resolves per instance. A cell with
any CEL-driven flag SHALL therefore carry no flagged marker, whatever
its other resolved values are.

#### Scenario: A required-and-hidden cell carries the marker

- **WHEN** a live cell's `required` resolves to `true` while its
  `visible` resolves to `false`
- **THEN** that cell carries the flagged marker

#### Scenario: A required-and-readonly cell with nothing else writing it carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** no other source, guaranteed before that cell's own step, in
  the draft writes that cell's field
- **THEN** that cell carries the flagged marker

#### Scenario: A required-and-readonly cell already written elsewhere carries no marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** one of these already writes that cell's field, guaranteed
  before that cell's own step is submitted:
  - an action output on a step that dominates this cell's own step
  - a subprocess output mapping on a step that dominates this cell's
    own step
  - a data source column mapping
  - a contract input field entry
  - another editable view entry for the same field on a step that
    dominates this cell's own step
- **THEN** that cell carries no flagged marker

#### Scenario: A required-and-readonly cell written only by an own-step post-gate output still carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** the only other source naming that cell's field is an action's
  `output` on the cell's OWN step at `onExit`, `onPath`, or `onCancel`
- **THEN** that cell carries the flagged marker — an own-step post-gate
  output fires after the submission gate, so it does not clear this
  finding, the same own-step exclusion `checkUnsatisfiableRequiredReadonly`
  already applies

#### Scenario: An own-step reminder timer's output still carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** the only other source naming that cell's field is an `onFire`
  action on the cell's OWN step's timer, and that timer declares no
  `targetPath`
- **THEN** that cell carries the flagged marker — an own-step reminder
  timer with no `targetPath` is not guaranteed to fire before submission,
  the same own-step reminder-timer exclusion
  `checkUnsatisfiableRequiredReadonly` already applies

#### Scenario: A required-and-readonly cell written only on a non-dominating step still carries the marker

- **WHEN** a live cell's `required` and `readonly` both resolve to
  `true`
- **AND** the only other editable placement or action output for that
  field is on a step reachable only after this cell's own step, or
  only via a different branch
- **THEN** that cell carries the flagged marker

#### Scenario: A group field's cell carries no flagged marker

- **WHEN** a live cell's own field is a group field
- **THEN** that cell carries no flagged marker, regardless of its
  resolved `visible`, `required` and `readonly` values

#### Scenario: A cell with a CEL-driven flag carries no flagged marker

- **WHEN** any of a live cell's `visible`, `required` or `readonly`
  carries a CEL expression
- **THEN** that cell carries no flagged marker, whatever its other
  resolved values are

### Requirement: The field matrix stays one tab stop; activating a cell reaches its controls

The field matrix SHALL stay one stop in the page's tab order.
`spa-accessibility`'s existing rule for this grid already requires
that. Arrow-key navigation between cells SHALL continue to move focus
exactly as it did before this change. It SHALL add no tab stop of its
own.

Enter or Space on a focused live cell SHALL activate it. An activated
cell's `visible`, `required` and `readonly` controls SHALL become the
grid's only reachable tab stops. They replace the grid's own stop
until the cell deactivates. Escape SHALL deactivate the active cell.
Moving focus away from an active cell by any other means SHALL also
deactivate it. Deactivating SHALL hand the one tab stop back to the
grid.

#### Scenario: Arrow-key navigation alone adds no tab stop

- **WHEN** the developer moves focus between cells with the arrow keys
- **THEN** the field matrix stays one stop in the page's tab order

#### Scenario: Activating a cell makes its controls reachable by Tab

- **WHEN** the developer presses Enter or Space on a focused live cell
- **THEN** that cell's `visible`, `required` and `readonly` controls
  become the only tab stops inside the field matrix

#### Scenario: Escape deactivates the cell and restores single-stop navigation

- **WHEN** the developer presses Escape on an activated cell
- **THEN** the field matrix returns to being one stop in the page's
  tab order

<!-- antislop: allow synonym-rotation -->
### Requirement: The field matrix's rail entry counts field entries and view findings

The `studio-process-tabs` capability gives the Field matrix tab no entity count.
The toolbar's own count line carries that number instead, as the first of its
four. That number is the total of field entries across every step in the draft. A
live cell represents one of that same total.

A note entry SHALL count as none of them. The count answers how much a step binds
to the catalog, and a note binds to nothing. Counting one would report a step as
busier than its data says.

This is the matrix's analogue of two other counts. The Fields tab counts catalog
rows. The Contract tab counts outcomes.

The Field matrix tab SHALL carry an issue count. It SHALL equal the number of
open findings carrying the `view` source over the whole draft. Those are the
findings the `studio-checks-rail` capability's rail groups under that name. Since
this change, that set holds one finding anchored on a field rather than a cell:
an unwritten technical field. The count therefore over-reports by one per such
field, with nothing to find in the grid.

The field catalog's own badge, which counts by entity type, carries that finding
correctly.

The count SHALL NOT come from the step entity type. A per-step view finding
shares that entity type with every other per-step issue in the draft.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the author opens the Field matrix tab on a draft with 54 field
  entries across its steps
- **THEN** the toolbar's count line reads 54 field entries

#### Scenario: A note leaves the field matrix count alone

- **WHEN** a draft holds one step whose view carries two field entries and
  three notes
- **THEN** the toolbar's count line reads 2 field entries

#### Scenario: A step holding notes alone contributes no entity count

- **WHEN** a draft holds one step whose view carries notes alone
- **THEN** that step raises the toolbar's field-entry count by none

#### Scenario: The issue count reflects only view-source findings

- **WHEN** the draft carries one `checkViewFlags` finding and several
  unrelated issues on the same steps, from other sources
- **THEN** the Field matrix tab carries an issue count of 1, not a count
  including the unrelated issues

#### Scenario: An unwritten technical field raises the matrix issue count

- **WHEN** the draft carries one unwritten-technical-field finding and no
  other `view`-source finding
- **THEN** the Field matrix tab carries an issue count of 1

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

### Requirement: The Form section's configured-field count reads field entries alone

The Form section SHALL report how many of the catalog's fields a step's view
configures. That line reads `N / M`, where `M` is the catalog's own size.

The first number SHALL count field entries alone. A note occupies no catalog
row. Counting one would report a step as binding more of the catalog than it
does. The second number never moves for a note, because the catalog holds
none.

This count sits in the Form section, not in the form editor. The form editor
displays no count of its own.

#### Scenario: A note raises no configured-field count

- **WHEN** a step's view holds one field entry and three notes
- **THEN** the Form section reports that step's configured fields as 1

#### Scenario: A step holding notes alone reports none configured

- **WHEN** a step's view holds notes alone
- **THEN** the Form section reports that step's configured fields as 0

### Requirement: The process header declares the process's base locale

The process header's `⋮` overflow menu SHALL carry a control that reads
and writes the process's `baseLocale`. An author SHALL be able to
declare a non-English base locale without leaving the Structure surface.

`baseLocale` decides which entry of every `LocalizedText` in the body is
mandatory, and publish requires it. Leaving it to the JSON surface alone made
a process authored only through the structural panels unpublishable.

The control SHALL write the typed value through, unvalidated. Live
validation reports a value that is not a well-formed locale code. That
is the route every other malformed authored value takes. The menu SHALL
NOT reject or correct the keystroke.

When the typed value is a well-formed locale code, the studio SHALL also move
the edited content locale to it.

Without that move, the control opens a trap. The edited content locale decides
which entry every text input writes. It also decides which entry a newly
created step or field seeds. An author who declares `de` and keeps typing
would write every value under the previous locale. Each new entity would then
report a missing `de` entry while visibly holding text.

The studio SHALL NOT move the edited content locale for a value that is not a
well-formed locale code. A part-typed value would otherwise become a real
locale key. One character typed into any text field is enough.

#### Scenario: The header shows the draft's declared base locale

- **WHEN** the edit screen loads a draft declaring `baseLocale: "de"`
- **THEN** opening the process header's `⋮` menu shows a base-locale
  control reading `de`

#### Scenario: Declaring a base locale moves the edited content locale

- **WHEN** an author changes the process header's base-locale control to `de`
- **THEN** the draft body's `baseLocale` is `de`, and the edited content
  locale is `de`. A step created next seeds its label under `de`

#### Scenario: A part-typed base locale leaves the content locale alone

- **WHEN** an author has typed `d` on the way to `de`
- **THEN** the draft body's `baseLocale` is `d`, and the edited content locale
  is whatever it was before

#### Scenario: Existing text without an entry for the new base locale reports

- **WHEN** an author changes the base locale to `de` on a process whose labels
  carry only `en` entries
- **THEN** live validation reports a missing base-locale entry for every
  `LocalizedText` in the body that carries no `de` entry

#### Scenario: A malformed base locale reports as a validation issue

- **WHEN** an author types a value into the base-locale control that is
  not a well-formed locale code
- **THEN** the draft body carries that value, and live validation
  reports the issue against `baseLocale`

### Requirement: A save conflict is surfaced and resolved by reloading, never merged

When `PUT /drafts/:processId` answers 409, the studio SHALL tell the user that
the draft was changed elsewhere and SHALL offer reloading the stored draft. It
SHALL NOT merge, SHALL NOT silently retry with the newer revision, and SHALL
NOT discard the conflict.

Reloading SHALL leave the editor in a **clean** state: the body the toolbar
treats as "last known persisted" SHALL be advanced to the reloaded body, in
the same operation that replaces the draft, the layout and the revision. A
reload is by definition the point at which current and saved coincide — the
same invariant the initial seed and the post-save advance already encode.

Without this the unsaved-changes comparison is made against the discarded
local edits, so a draft byte-identical to the stored one reads as dirty for
the rest of the session (the toolbar is not remounted by a reload). Publishing
then always prompts to save first: accepting re-writes the just-fetched body
and bumps the stored revision for nothing, invalidating a concurrent editor's
in-flight revision, and declining aborts a publish the user was entitled to
make.

#### Scenario: A conflicting save is reported

- **WHEN** a save answers 409
- **THEN** a conflict message is shown with a reload action, and the local
  editing state is left intact until the user chooses

#### Scenario: Reloading adopts the stored draft

- **WHEN** the user reloads after a conflict
- **THEN** the stored body, layout and revision replace the local state and a
  subsequent save succeeds

#### Scenario: Publishing straight after a reload does not prompt to save

- **WHEN** the user reloads after a conflict and immediately publishes,
  without editing
- **THEN** the publish proceeds without the unsaved-changes prompt, because
  the draft is identical to the stored one

#### Scenario: Editing after a reload is dirty again

- **WHEN** the user reloads after a conflict and then makes an edit
- **THEN** the unsaved-changes prompt reappears on publish, so the fix does
  not turn the gate off

<!-- antislop: allow passive-voice -->
### Requirement: Studio's testable logic is extracted from its components

Following `packages/web/src/areas/app/screens/inboxLogic.ts`, the logic
worth testing SHALL live in pure modules with `bun:test` coverage. At
minimum, that covers two things. It covers the process-list row
derivation, which merges the process listing with the draft listing. It
covers the save/conflict state machine too. React components themselves
carry no test requirement.

Extraction into its own module earns its keep on branching or
state-machine complexity, or on guarding a documented regression class.
Caller count alone does not settle it. Neither does a component's own
resistance to `renderToStaticMarkup`. A single expression with no
independent complexity, and one caller, SHALL inline at its call site
instead. That holds even where inlining costs the expression's own narrow
test file. The expression was never the part a test could not already
read.

<!-- antislop: allow passive-voice -->
#### Scenario: Row derivation is tested without a DOM

- **WHEN** a test hands the process-list derivation a process listing and
  a draft listing
- **THEN** it returns the merged rows, and the test needs no rendering

#### Scenario: A one-caller expression with no further decision inlines instead of extracting

- **WHEN** a piece of studio logic has exactly one caller
- **AND** it carries no branch feeding further decision logic, and no state
  machine
- **AND** it guards no documented regression
- **THEN** it lives inline at its call site, not in its own pure module
  with its own test file

#### Scenario: A one-caller expression that guards a regression class stays extracted

- **WHEN** a piece of studio logic has exactly one caller
- **AND** it carries a real branch and a test suite guarding a documented
  wiring bug
- **AND** that bug is the same shape `draftToolbarState.ts` guards in its
  save/reload state machine
- **THEN** it stays in its own pure module, since caller count alone does
  not settle whether extraction earns its keep

### Requirement: The data sources panel picks a list key rather than accepting free text

For a data source of type `"db.list"`, `DataSourcesPanel` SHALL offer the
`listKey` values the server reports, rather than a free-text field. The
studio reads them through the data list read route, which its
`system:developer` role already grants.

That read SHALL carry each list's declared columns beside its key. The route
returns them today. The field catalog needs them to offer real column keys.
A second read over the same rows would let the two disagree.

A draft whose `"db.list"` data source names a `listKey` the server does not
report SHALL draw a warning, never a validation error. Publishing does not
read the tables, so a missing list cannot be an invariant here. The warning
matches the one for a step with no `assignment`.

#### Scenario: The panel offers the existing keys
- **WHEN** an author edits a `"db.list"` data source and the server reports
  two lists
- **THEN** the panel offers both keys as a choice

#### Scenario: The read carries each list's columns
- **WHEN** the server reports a list declaring two columns
- **THEN** the studio holds both column keys against that list

#### Scenario: A key the server does not report draws a warning
- **WHEN** a draft names a `listKey` the server does not report
- **THEN** the studio shows a warning for that data source

#### Scenario: The warning does not block publishing
- **WHEN** an author publishes a draft carrying that warning
- **THEN** the publish succeeds

### Requirement: A non-terminal step with no assignment draws a publish-time warning

For a non-terminal step whose `assignment` is absent, the studio SHALL draw
a warning next to the assignment editor. The warning SHALL NOT be an
`EditorIssue`, and SHALL NOT block or delay publishing. A self-service
step legitimately has no assignment, so this stays informational, matching
the rule the `"db.list"`-missing-key warning already follows.

A terminal step has no outgoing paths, so nothing is ever submitted on it.
The warning SHALL NOT draw on a terminal step, regardless of whether it
carries an `assignment`.

#### Scenario: A non-terminal step with no assignment draws a warning

- **WHEN** a draft's non-terminal step carries no `assignment`
- **THEN** the studio shows a warning next to that step's assignment editor

#### Scenario: A terminal step draws no warning

- **WHEN** a draft's step sets `terminal: true` and carries no `assignment`
- **THEN** the studio shows no warning for that step

#### Scenario: The warning does not block publishing

- **WHEN** an author publishes a draft carrying the no-assignment warning
- **THEN** the publish succeeds

### Requirement: The templates screen lists, creates and deletes a template

The studio area SHALL carry a templates screen. It SHALL list one row per
template, labelled by the `label` the stored body declares. A body may declare
no label for the active content locale. The row SHALL then fall back to the
template key, so no row renders nameless.

The screen SHALL create a template from a published version of a process, and
from no other source. That path SHALL strip the compile pass's cancel-sink
injection, because a template holds the authored shape.

A draft SHALL NOT be a source. `system:templates` cannot read one. Opening
drafts to a curator would hand them every unfinished body in the
installation.

The screen SHALL delete a template behind a confirmation. A delete SHALL
leave every process untouched.

The screen SHALL need `system:templates`. An actor holding only
`system:developer` SHALL NOT reach it. That actor still reads the templates
through the picker.

#### Scenario: A template made from a published version appears in the list

- **WHEN** a curator creates a template from a published version
- **THEN** the list carries a row for it, labelled by the body's label

#### Scenario: A template whose body declares no label still renders

- **WHEN** the list renders a template whose body carries no label for the
  active content locale
- **THEN** the row shows the template key

#### Scenario: Deleting a template asks first

- **WHEN** a curator deletes a template
- **THEN** the screen asks for a confirmation before it calls the engine

#### Scenario: An author reaches no templates screen

- **WHEN** an actor holding only `system:developer` opens the templates screen
- **THEN** the screen refuses and states which role the account lacks

### Requirement: The content-locale switcher shows a per-locale translation-gap count

For each locale `ContentLocaleSwitcher` offers, the studio SHALL count
`LocalizedText` entries with a gap. A counted entry carries the draft's
`baseLocale` value but lacks that locale's own value. The switcher SHALL
show this count next to the locale. It SHALL show nothing extra for a
locale with a count of zero. The draft's own `baseLocale` SHALL never
carry a count against itself.

An entry that lacks even the `baseLocale` value SHALL NOT count as a gap
for any other locale. The existing `EditorIssue` for a missing base-locale
value already flags that entry.

#### Scenario: A locale with translation gaps shows its count

- **WHEN** a draft's `de` locale has entries with a `baseLocale` value but
  no `de` value
- **THEN** the content-locale switcher shows `de` with that count

#### Scenario: A fully-translated locale shows no count

- **WHEN** every entry with a `baseLocale` value also carries a `de` value
- **THEN** the content-locale switcher shows `de` with no count suffix

#### Scenario: The base locale never shows a gap count

- **WHEN** the draft's `baseLocale` is `en`
- **THEN** the content-locale switcher shows `en` with no count, regardless
  of any other locale's gaps

### Requirement: A LocalizedText entry missing the current locale draws an inline warning

Take the studio's currently selected `contentLocale`. Take an entry that
carries the draft's `baseLocale` value but lacks that locale's own value.
That entry SHALL draw a warning next to its `LocalizedTextInput`. The
warning SHALL NOT be an `EditorIssue`, and SHALL NOT block or delay
publishing.

It SHALL draw at every `LocalizedTextInput` site:

- the process label
- each step's label and description
- each field's label and description
- each field option's label
- each note's text

An entry that lacks the `baseLocale` value SHALL NOT draw this warning.
The existing base-locale `EditorIssue` already flags it. The warning
SHALL NOT draw when `contentLocale` equals `baseLocale`.

A static rule in `packages/web/test/boundaries.test.ts` SHALL enforce that
list, scoped to `src/areas/studio/`. Every `LocalizedTextInput` rendered
there SHALL sit beside a call to `missingTranslationWarning`. An exempt site
SHALL instead carry an inline comment stating why. A hand-kept list does not
grow with the code. This rule does.

That rule also pins the number of sites it found. A change adding or
removing a site SHALL move that literal in the same commit. Otherwise the
rule rejects a tree it exists to admit.

#### Scenario: A step label missing the current locale draws a warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's step has a
  `label` carrying an `en` (base locale) value but no `de` value
- **THEN** the studio shows a warning next to that step's label input

#### Scenario: An entry with the current locale filled in draws no warning

- **WHEN** a draft's field `label` carries both the base-locale value and
  the current `contentLocale`'s value
- **THEN** the studio shows no warning next to that field's label input

#### Scenario: Viewing the base locale draws no translation warning

- **WHEN** the studio's `contentLocale` equals the draft's `baseLocale`
- **THEN** the studio shows no missing-translation warning anywhere

#### Scenario: The warning does not block publishing

- **WHEN** an author publishes a draft carrying a missing-translation
  warning
- **THEN** the publish succeeds

#### Scenario: A new render site warns

- **WHEN** the studio area gains a `LocalizedTextInput` site
- **THEN** the site calls `missingTranslationWarning`
- **AND** an untranslated entry draws the warning there

#### Scenario: An unguarded site fails the suite

- **WHEN** a source file under `src/areas/studio/` renders a
  `LocalizedTextInput` with no adjacent `missingTranslationWarning` call and
  no exempting comment
- **THEN** the boundary test names the file and fails

#### Scenario: An exempt site says why

- **WHEN** a site legitimately does not need a warning
- **THEN** an inline comment states the reason, and the rule skips it

#### Scenario: A note's text missing the current locale draws a warning

- **WHEN** the studio's `contentLocale` is `de`, and a note's `text` carries
  the base-locale value alone
- **THEN** the note's strip shows the warning beside its text input

<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen and its process-wide views render from compiled styles

Four tabs carry a process-wide subject this requirement covers. They are the
field catalog, the field matrix's toolbar and legend, the data sources panel, and
the contract panel. The process surface, the field catalog, the field matrix and
the data sources panel SHALL render from compiled component styles. Each reads
`form-ui/tokens.stylex`. The rendered result SHALL match the previous stylesheet
declaration for declaration.

The contract panel renders no class this migration covers. It already satisfies
this requirement, unchanged, since it carries no rule to compile.

The field matrix's cell state, hatched, blank or live, SHALL pick its style from
an exhaustive check. That check covers this closed, three-value type in full. A
blank cell carries no extra style. That matches today's stylesheet, which
declares no rule for it either.

#### Scenario: The panels screen keeps its look

- **WHEN** a browser renders the process surface after the migration
- **THEN** the field catalog keeps its computed layout, spacing, color and
  border
- **AND** the field matrix and the data sources panel each do too
- **AND** every value matches the deleted stylesheet's own

#### Scenario: A field matrix cell's state picks the right style

- **WHEN** the field matrix renders a hatched cell, a live cell, and a blank
  cell side by side
- **THEN** each renders the same visual result the deleted stylesheet
  produced
- **AND** the blank cell carries no color override

### Requirement: The process list, its dialogs, and the templates and versions screens render from compiled styles

`screens/ProcessesScreen.tsx` (the process list, its promotion-preview
dialog and its start-picker dialog), `screens/TemplatesScreen.tsx`, and
`screens/VersionsScreen.tsx` SHALL render from compiled component
styles. The rendered result SHALL match the previous stylesheet
declaration for declaration.

#### Scenario: The process list and its dialogs keep their look

- **WHEN** a browser renders the process list, then opens its
  promotion-preview dialog and its start-picker dialog
- **THEN** each one's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared, including the dialogs'
  `::backdrop`

#### Scenario: The templates and versions screens keep their look

- **WHEN** a browser renders the templates screen and the versions
  screen
- **THEN** each one's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared

### Requirement: Discarding a draft's confirmation dialog renders from compiled styles

`panels/ProcessHeaderBar.tsx` renders the discard-confirmation dialog,
per this capability's own "Discarding a draft confirms in a modal
dialog" requirement. The dialog SHALL render from compiled component
styles. The header bar around it is a different capability's own
concern. Only the dialog itself is this requirement's scope.

#### Scenario: The discard dialog keeps its look

- **WHEN** a browser opens the discard-confirmation dialog
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared, including its `::backdrop`

### Requirement: The content-locale switcher renders from compiled styles

`panels/shared/ContentLocaleSwitcher.tsx` SHALL render from compiled
component styles. The rendered result SHALL match the previous
stylesheet declaration for declaration.

#### Scenario: The content-locale switcher keeps its look

- **WHEN** a browser renders the header bar's content-locale switcher
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared

### Requirement: Both process-wide field views take the area's field rule

<!-- antislop: allow synonym-rotation -->
<!-- Why: carried from the live requirement, with the mono rule scoped to the key. -->
Both views SHALL render their editors under the design language's field
rule. The rule `.steps-panel label` states it in the area today. A
label SHALL sit above its control. A `key` SHALL print in mono, because
the engine matches it exactly. A hairline SHALL divide rail rows, and a
rule SHALL sit under a view's heading. No corner SHALL take a radius.

#### Scenario: A field editor states its labels above its controls

- **WHEN** the developer opens the Fields view on any field
- **THEN** each label sits above its own control, and no label sits
  beside one

#### Scenario: A key prints in mono

- **WHEN** the developer opens the Fields view on any field
- **THEN** the field's key prints in the mono face

#### Scenario: The Data sources view takes the same rule

- **WHEN** the developer opens the Data sources view on any data source
- **THEN** each label sits above its own control, a hairline divides the
  rail rows, and no corner takes a radius

### Requirement: The Fields view divides into a definition half and an effect half

<!-- antislop: allow synonym-rotation -->
<!-- "edit" names an author working one field; "change" names one write to the draft. -->
The Fields view SHALL edit one field through two halves under one
heading. The definition half comes first, the effect half second. The
view SHALL have no tab set.

The definition half says what the field is. It SHALL hold five zones, plus
a sixth for a group field. Their order reads "What this field asks", "What
kind of field", "Where values come from", "Default value", "Validation". Each
zone SHALL sit under its own heading, with a rule between it and its
neighbour.

A group field's definition half SHALL hold a sixth zone after "Validation",
named "Fields inside this group". That zone SHALL draw none of the group's
fields, since the entity rail lists them. It SHALL hold one control, which
adds a field at the end of the group. The tab SHALL then select that new field.

Keyboard focus SHALL then land in the new field's label input, since a new
field needs its label first. The rail SHALL bring the new field's entry into
view where it sits outside the rail's visible part. It SHALL scroll no further
than that, and it SHALL NOT animate the scroll.

"What this field asks" holds the label, the description, the key and the
move control, in that order. "What kind of field" holds the kind picker and
the Technical control. "Where values come from" holds the data source and
the options.

The effect half says where the field acts in the process. It SHALL hold
four zones, in this order: "Used in", "Only ask this when", "Ask for
this" and "Column mapping". The same heading and rule treatment holds.

"Used in" lists every step whose view references the field, with the
modes those references set. "Only ask this when" holds the condition.
"Ask for this" holds the requiredness.

Neither half SHALL sit behind a disclosure. Both SHALL show as the view
opens. A closed disclosure over the usage list is what this change
removes. Returning one would undo the change.

A change in the definition half SHALL tint the affected row in the
effect half. That tint SHALL be the only motion the two halves carry.

#### Scenario: The view draws two halves and no tab set

- **WHEN** the developer opens the Fields view on any field
- **THEN** the definition half and the effect half both show, side by
  side under one heading
- **AND** no tab set renders

#### Scenario: A definition change tints its effect row

- **WHEN** the developer changes the label of a field two step views
  reference
- **THEN** both rows for those steps tint in the effect half

#### Scenario: The move control stands under the key

- **WHEN** the developer opens the Fields view on any field
- **THEN** "What this field asks" holds the move control directly under the key
- **AND** the control names the group that holds the field, or the top level

#### Scenario: A group's own zone adds a field and selects it

- **WHEN** the developer uses the control in a group field's "Fields inside
  this group" zone
- **THEN** the group's `fields` array carries one more field, at its end
- **AND** the tab selects that field and shows its own two halves
- **AND** keyboard focus sits in that field's label input

#### Scenario: The rail brings a new field in a long group into view

- **WHEN** a group holds 18 fields, and the rail shows the group's entry but
  not its last field's entry
- **AND** the developer uses the control in that group's "Fields inside this
  group" zone
- **THEN** the rail shows the new field's entry, carrying the current mark
- **AND** the rail reaches that position at once, with no smooth scroll

#### Scenario: A new entry the rail already shows moves no rail

- **WHEN** the rail shows a group's last field and the entry after it
- **AND** the developer uses the control in that group's "Fields inside this
  group" zone
- **THEN** the rail keeps its scroll position
- **AND** the new field's entry carries the current mark

#### Scenario: Only a group field holds the sixth zone

- **WHEN** the developer opens the Fields view on a group field, then on a
  `string` field
- **THEN** the group field's definition half shows "Fields inside this group"
  directly after "Validation"
- **AND** the `string` field's definition half shows no such zone

### Requirement: A field's checks stand at the zone each one belongs to

The Fields view SHALL place a check on the selected field at the zone
the check names. A check on the key stands in "What this field asks". A
check on an option stands in "Where values come from". A check on a
validation rule stands in "Validation".

A check the view cannot place SHALL stand at the top of the definition
half. No check SHALL go unshown for want of a matching zone.

Placement SHALL read the check's own location in the body. A check
carries that location today. The studio's issue model drops it, so this
rule needs the model to carry it through. The `studio-app` capability
states no shape for that model. What it states is the outcome: two
checks on one field, naming two zones, stand apart.

A nested field's check SHALL stand in that field's own editor, at the
zone the check names. The group's editor SHALL show the group's own checks
alone.

The view SHALL have no consolidated check list of its own. The
draft-wide roll-up and the publish gate sit in the docked summary the
`studio-checks-rail` capability states.

A zone holding a check SHALL take the refusal tone at its own heading.
An author scanning the halves then sees which zone is wrong, with
nothing to open.

#### Scenario: A key check stands at the key's zone

- **WHEN** the selected field's key breaks the identifier grammar
- **THEN** the check shows inside "What this field asks", and that
  zone's heading takes the refusal tone

#### Scenario: An unplaceable check stands at the top

- **WHEN** the selected field carries a check naming no zone the view
  draws
- **THEN** the check shows at the top of the definition half

<!-- antislop: allow negation-habit -->
<!-- The live heading and body, unchanged; the negation names what the rule forbids. -->
#### Scenario: The view carries no consolidated list

- **WHEN** the developer opens the Fields view on a field carrying two
  checks in two zones
- **THEN** each check shows at its own zone, and no list gathers both
  in one place

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child row is now the child's own editor. -->
#### Scenario: A group's child row keeps its own list

- **WHEN** a field nested inside a group carries a check on its key
- **THEN** selecting that field shows the check inside its own "What this
  field asks" zone
- **AND** selecting the group shows the group's own checks alone

### Requirement: The effect half states its own empty state

The effect half SHALL show an empty state for as long as no step view
references the selected field. It SHALL say that no step asks for the
field yet.

It SHALL offer the route from there to a step view. That route SHALL
reach the canvas with a step preselected, on the terms the panels
screen's own step-target rule states.

The empty state SHALL take the empty tone, never the refusal tone. A
field no step asks for yet is an unfinished draft, not a broken one.

#### Scenario: An unused field draws the empty state

- **WHEN** the developer selects a field no step view references
- **THEN** the effect half says that no step asks for the field yet
- **AND** it offers the route to a step view, in the empty tone

#### Scenario: The empty state clears when a step references the field

- **WHEN** a step view gains a reference to the selected field
- **THEN** the effect half lists that step, and the empty state goes

### Requirement: The Fields view's definition half states values, a default and a preview

The two halves SHALL belong to the selected field alone, at any nesting
depth. A field nested inside a group SHALL take the same two halves a
top-level field takes. A group field's halves SHALL have no editor for any
of its children. Inside the halves, only the group's preview draws them.

Translation status SHALL show as a badge beside the label input. The
badge SHALL name the current locale's missing count. The field SHALL
have no separate translation-status list. Adding a language SHALL stay
draft-scoped in the content-locale switcher.

"How it will look" SHALL sit in the definition half, inside a collapsed
`<details>` disclosure. It SHALL start closed. The developer view SHALL
keep its own existing, separate `<details>` disclosure, untouched by
this change.

Remove field SHALL sit below a rule at the definition half's end. It
SHALL read as the half's least frequent action.

Every zone SHALL stay mounted while a field stays selected. A
disclosure SHALL keep its own open state for as long as the same field
stays selected. Each builder holds an incomplete row the draft does not
carry. The developer view holds a half-typed config in component state.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, rewrapped so no code span breaks across a line. -->
The Default value zone SHALL offer a literal input matching the field's
type and its declared format. For a field carrying static `options`
that input SHALL be a `<select>` bound to those options, or the
multi-value equivalent when the field's type is `list`.
For a `string` field declaring a `format` it SHALL be that format's own
native input.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
Either control SHALL offer no option when the field is
`dataSource`-bound, since the draft carries no resolved rows for one.
That is the same carve-out named below for the preview. The CEL toggle
SHALL still work there. A field declaring `format: "person"` and
neither `options` nor `dataSource` SHALL get the identical carve-out,
whether its type is `string` or `list`: the draft resolves no
`allowedGroups`-sourced people list either, since that resolution needs
a live database read the draft editor does not have. The CEL toggle
still works there too.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
The note the zone shows in the person case SHALL name the people list
rather than a data source. The existing note names a data source by hand, and
this field declares none; an author reading it would learn the wrong
thing about their own draft.

For a `file` field the whole Default value zone SHALL show disabled. It
SHALL state that the type accepts no default here. This mirrors "Only
ask this when" 's own disabled state for a field no step view
references.

For a `group` field the whole Default value zone SHALL also show
disabled. It SHALL state that a group's own default is never read. A
group has no slot of its own in the flat data payload. A literal
or CEL default written there would silently never apply.

Every other type gets a link-styled toggle. It SHALL switch the zone
to a raw CEL text input for an expression default. This mirrors the
toggle affordance the condition zone already uses. The zone SHALL NOT
mount the guard-shaped condition-builder component. A default is a
value rather than a boolean. It does not need a comparison-row builder.

Writing through the literal input SHALL set the field's `default` key
to that literal value. Writing through the CEL input SHALL set it to `{
lang: "cel", src }`. Clearing either input SHALL remove the `default`
key.

"How it will look" SHALL preview the field through the shared form
component, read-only, inside its disclosure. Every previewed entry's
`readonly` SHALL read `true`, and the preview's container SHALL carry
`inert`.

The preview runs over a synthesized single-field view. For a group
field it synthesizes the group's own entry, plus one entry per
descendant. That reaches every depth, beyond the group's immediate
children.

A group holding a group SHALL preview both levels. That is the
grouping the shared form component itself applies. The synthesis
SHALL also carry the sample values in the shape that component reads
them, keyed by field id.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
A dataSource-backed field SHALL preview with no option list. The
draft has no resolved rows for one. The row stating so SHALL name
that the field resolves at runtime. An author previews what a
participant gets. A field declaring `format: "person"` and neither
`options` nor `dataSource` SHALL preview the same way, for the
identical reason: the draft cannot reach the live `allowedGroups`
expansion either. That field SHALL get its own row wording. It names the
people list rather than a data source it does not declare.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, with its em-dash rewritten as two sentences. -->
The preview's sample value SHALL match the shape the field's own type
takes. A `format` narrows the value domain, so a formatted field
previews that format's sample rather than its type's. A `{type:
"list"}` field holds an array whatever its format, so its sample SHALL
be the format's sample inside an array. A scalar there would draw a
multi-select with nothing selected, since the shared form component
reads a non-array value as an empty selection.

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the group's halves now draw no child at all. -->
#### Scenario: A group's children render without halves of their own

- **WHEN** the developer selects a `group` field carrying two children
- **THEN** the definition half draws no row for either child
- **AND** the rail still lists both children, indented under the group

#### Scenario: A nested field takes the same two halves

- **WHEN** the developer selects a `string` field nested inside a `group`
  field
- **THEN** the view shows that field's definition half and effect half
- **AND** the definition half shows the Default value zone and the preview

#### Scenario: Translation status shows as a badge

- **WHEN** the studio's `contentLocale` is `de`, and a field's label
  carries a base-locale value but no `de` value
- **THEN** a badge beside the label input names its missing count for
  the active content locale
- **AND** no separate translation-status list renders
- **AND** the badge names no locale of its own. The content-locale
  switcher already names `de` once, in the toolbar

#### Scenario: A disclosure survives a selection that returns

- **WHEN** the developer opens the preview disclosure, selects another
  field, and selects the first field again
- **THEN** the preview disclosure state follows the rule the view
  states, and no half remounts

#### Scenario: Remove field sits below a rule

- **WHEN** the developer opens the Fields view on any field
- **THEN** Remove field is the definition half's last control, below a
  rule that separates it from every other control

#### Scenario: The definition half shows its zones ruled apart

- **WHEN** the developer opens the Fields view on any field
- **THEN** the five zone headings show, in the order the requirement
  names
- **AND** a rule sits between each zone and its neighbour

#### Scenario: A literal default writes the field's raw value

- **WHEN** the developer types `100` into a Number field's Default
  value input, with the CEL toggle off
- **THEN** the draft's field carries `default: 100`

#### Scenario: A CEL default writes an expression

- **WHEN** the developer switches the Default value zone to CEL and
  types `data.subtotal * 1.1`
- **THEN** the draft's field carries `default: { lang: "cel", src:
  "data.subtotal * 1.1" }`

#### Scenario: Clearing the default drops the key

- **WHEN** the developer clears a field's Default value input, whether
  literal or CEL
- **THEN** the draft's field has no `default` key

#### Scenario: A literal default on a Choice field uses its own options

- **WHEN** the developer chooses one of a `string` field's own
  `options` in its Default value zone, with the CEL toggle off
- **THEN** the draft's field carries `default` set to that option's
  value

#### Scenario: A dataSource-bound field's default offers no option list

- **WHEN** the developer opens the Default value zone on a
  `dataSource`-bound `string` field
- **THEN** the literal control offers no option, and the CEL toggle
  still lets the developer write an expression default

#### Scenario: A bare person field's default offers no option list

- **WHEN** the developer opens the Default value zone on a `{type:
  "string", format: "person"}` field declaring neither `options` nor
  `dataSource`
- **THEN** the literal control offers no option, and the CEL toggle
  still lets the developer write an expression default
- **AND** the note names the people list rather than a data source

#### Scenario: A bare person list's default offers no checkbox group

- **WHEN** the developer opens the Default value zone on a `{type:
  "list", format: "person"}` field declaring neither `options` nor
  `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the literal control offers no option, rather than a checkbox
  group over an empty option set, and the CEL toggle still lets the
  developer write an expression default

#### Scenario: The Default value zone disables for a reference or file field

- **WHEN** the developer opens the Fields view on a `file` field
- **THEN** the Default value zone shows disabled, and states that the
  type accepts no default here

#### Scenario: A formatted string field's default uses that format's input

- **WHEN** the developer opens the Default value zone on a
  `{type: "string", format: "date"}` field, with the CEL toggle off
- **THEN** the literal input is a native date input

#### Scenario: The Default value zone disables for a group field

- **WHEN** the developer opens the Fields view on a `group` field
- **THEN** the Default value zone shows disabled, and states that a
  group's own default is never read

#### Scenario: The preview shows one field, read-only

- **WHEN** the developer opens a field's preview
- **THEN** the shared form component shows that field with sample
  values
- **AND** none of the preview's controls take keyboard or pointer
  interaction

#### Scenario: A group field previews its group and its children

- **WHEN** the developer opens the preview on a group field carrying
  two children
- **THEN** the shared form component draws the group and both children
  inside it

#### Scenario: A bare person field previews with no option list

- **WHEN** the developer opens the preview on a `{type: "string",
  format: "person"}` field declaring neither `options` nor `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the preview shows no option list, and the row states that
  the field's people list resolves at runtime, naming no data source

#### Scenario: A person list previews an array sample

- **WHEN** the developer opens the preview on a `{type: "list", format:
  "person"}` field
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the synthesized sample value is an array holding the person
  format's own sample rather than that sample as a bare scalar
- **AND** the `{type: "string"}` twin still previews the scalar

### Requirement: The Fields view's effect half states usage, a condition and requiredness

"Column mapping" SHALL show in the effect half only when the field's
data source is mappable, per the existing `showsColumnMapping` rule.
Its absence draws no rule of its own. It sits in the effect half
because a column mapping writes into other fields. That is effect, not
definition.

"Used in" SHALL list every step whose view references the field, with
the modes those references set. A "Show on the canvas" control on a row
SHALL return to the canvas with that step preselected.

"Only ask this when" is a third condition-builder site, alongside the
path guard and the view-override sites `studio-condition-builder`
already names. It SHALL read the `visible` overrides of every step
view that references the field. When those views disagree, the row
SHALL state that plainly. A `visible` override is `boolean` or an
expression. The row edits expressions alone. A referencing view holding
a literal SHALL therefore count as a disagreement, and the row SHALL
name it.

When no step view references the field, the row SHALL show disabled.
It SHALL state that no step asks for it yet.

The row's operand picker SHALL withhold `child.*`. The row writes one
expression across steps of mixed type, and a `visible` override admits
`child` on a subprocess step alone.

Updating the condition SHALL write the same override to every
referencing view, and SHALL name the write before it happens. Where a
referencing view holds a literal, the notice SHALL name that step.
Clearing the condition SHALL drop the `visible` key from every
referencing view. It SHALL name that scope before it happens, on the
same terms a write does. The field SHALL NOT store a field-level
condition.

"Ask for this" SHALL read and write the `required` override of every
step view that references the field. The catalog declares no `required`
key of its own, so this control writes the view and never the field.
That is the definition contract's own rule, and this control does not
bend it.

When those views disagree, the row SHALL state that plainly and name
the differing step. Updating SHALL name the write before it happens,
on the same terms the condition row takes. A technical field SHALL show
the row disabled, since `technical` already forces `required: false` on
every step. A field no step view references SHALL show it disabled too.

#### Scenario: A mappable field shows Column mapping in the effect half

- **WHEN** the developer opens the Fields view on a field whose data
  source is mappable
- **THEN** "Column mapping" shows in the effect half, ruled apart from
  its neighbour

#### Scenario: An unmappable field shows no Column mapping zone

- **WHEN** the developer opens the Fields view on a field whose data
  source is not mappable
- **THEN** no "Column mapping" heading renders, and its neighbour draws
  no rule below it for a zone that isn't there

#### Scenario: Used in lists steps and modes

- **WHEN** a field's ref appears in two step views, one with
  `required` and one with `readonly`
- **THEN** the usage list names both steps and both modes

#### Scenario: A condition writes every referencing view

- **WHEN** the developer sets "Only ask this when" on a field that
  two step views reference
- **THEN** both views carry the same `visible` override, and the row
  named both steps before the write

#### Scenario: Clearing the condition names its scope

- **WHEN** the developer clears "Only ask this when" on a field that
  two step views reference
- **THEN** the row named both steps before the clear, and neither view
  carries a `visible` key afterwards

#### Scenario: The condition row names diverging views

- **WHEN** one referencing view carries a different `visible`
  override than the others
- **THEN** the condition row says so and names the differing step

#### Scenario: A literal override counts as a disagreement

- **WHEN** one referencing view carries `visible: false` and another
  carries an expression
- **THEN** the condition row says the views disagree and names the step
  holding the literal
- **AND** the write notice names that step too

#### Scenario: The condition row offers no child operand

- **WHEN** the developer opens "Only ask this when" on a field a
  subprocess step's view references
- **THEN** the operand picker offers the catalog and the instance and
  actor context, and it offers no `child.outcome` or `child.data` entry

#### Scenario: An unreferenced field disables the condition row

- **WHEN** the developer opens "Only ask this when" on a field no step
  view references
- **THEN** the row shows disabled and states that no step asks for
  the field yet

#### Scenario: Ask for this writes every referencing view

- **WHEN** the developer turns "Ask for this" on for a field that two
  step views reference
- **THEN** both views carry `required: true`, and the row named both
  steps before the write

#### Scenario: Ask for this names disagreeing views

- **WHEN** one referencing view carries `required: true` and another
  carries no `required` key
- **THEN** the row says the views disagree and names the differing step

#### Scenario: A technical field disables Ask for this

- **WHEN** the developer selects a field carrying `technical: true`
- **THEN** "Ask for this" shows disabled, and the draft's view entries
  keep no `required` key

### Requirement: A field moves into a group and out of it from the catalog rail

The catalog rail's drag SHALL move a field into a group field and out of it,
in place. The field editor's move control SHALL make the same move. The move
SHALL neither remove the group nor rebuild it. It SHALL neither remove the
moved field nor rebuild it.

The move SHALL write the field's place in the draft's field array. The
field SHALL keep its `id`, its `key` and every other key it carries. No
CEL expression and no column mapping SHALL change.

That holds because a group has no entry in the flat data payload,
and `FieldDef.key` is unique across every depth. A leaf field takes a
flat address through its own key, whatever group it sits in. Views and
column mappings reference the `id`. The `definition-contract` capability
states both rules, and this requirement rests on them rather than
restating them.

A view entry is the one reference the move SHALL rewrite. The definition
contract binds a field entry's `group` to the field's catalog parent. A
move that leaves the entries alone therefore strands every one of them.
The move SHALL set the `group` of every view entry whose `ref` names the
moved field, to the destination group's `key`. A move to the top level
SHALL remove that key instead of writing it.

The same contract refuses an entry whose `group` names a card its view
does not carry. A step's view may carry the moved field without the
destination group's card. The move SHALL then place that card on the view,
immediately before the moved field's entry.

A destination nested inside other groups SHALL bring every missing ancestor
card too, outermost first. Each placed card SHALL name its own parent's key
as its `group`. A view already carrying a card SHALL gain no second one. A
move to the top level SHALL place nothing.

The rewrite and every placed card SHALL reach every step in the draft. Both
SHALL land in the same draft change as the field-array write. A reader
between the writes would see a catalog and a set of views that disagree.

A tabbed form keeps the definition contract's tab rules through the move.
Each entry's former tab is the tab the form editor's canvas drew it on. A
root's former tab is its own, and a member's is its outermost group card's.

An entry the move puts inside a group SHALL lose its `tab`, since its card
names the tab. A card the move places at the form's root SHALL take that
entry's former tab. An inner card of a placed chain SHALL have no `tab`. An
entry the move lifts to the top level SHALL take its former tab. On a form
declaring no tabs, the move SHALL write no `tab` anywhere.

A group moved into another group follows the same rule. Its own card loses
its `tab`, and the destination card holds the tab instead. A card the move
places takes the moved card's former tab. A card the form already carries
keeps its own.

A note entry SHALL stay untouched. A note names no catalog field, so no
move can carry it.

A pointer SHALL move the field by dragging its rail entry. The keyboard
SHALL move the same field through the move control in that field's own
editor. A field nested inside a group carries that control in its own
editor too. The `spa-accessibility` capability names this route for a
move into a group or out of one. Both gestures SHALL reach one write.

The two gestures SHALL reach the same set of destinations. A drop names
its target by the row it lands on, so it reaches every group. The move
control SHALL therefore name every group too, and the top level beside
them. A control offering one direction fails this rule. It reaches the
nearest group alone. Every other group then needs a pointer.

The move control SHALL name the group that holds the field, or the top
level. After a move made through the control, keyboard focus SHALL return
to it.

A move may nest a field below the rail's own two-level indentation cap.
The rail SHALL then draw that field at the cap. The draft's own field
tree SHALL keep whatever depth the move produces.
That split is the rail-rendering rule the panels screen already states.

A move SHALL keep the moved field selected. The view SHALL keep showing
that field's own two halves.

#### Scenario: A field moves into a group with a pointer

- **WHEN** the developer drags a top-level field's rail entry onto a
  group field's entry
- **THEN** the draft carries that field inside the group's `fields`
  array, and the group keeps its own `id` and `key`

#### Scenario: A field moves out of a group with the keyboard

- **WHEN** the developer focuses the move control in a group child's own
  editor, and picks the top level
- **THEN** the draft carries that field at the top level, and the
  group's remaining children keep their order

#### Scenario: The keyboard reaches every group the pointer reaches

- **WHEN** the developer moves a top-level field with the keyboard, on a
  draft carrying two group fields
- **THEN** the move control names both groups and the top level
- **AND** the field reaches whichever group the developer picks

#### Scenario: Focus returns to the move control after a move

- **WHEN** the developer moves a group child to the top level through its
  move control
- **THEN** the tab selects that field, and keyboard focus sits on the move
  control in the field's own editor

#### Scenario: A move rewrites no reference

- **WHEN** the developer moves a field that two step views reference
  and one column mapping targets
- **THEN** both view entries and the column mapping still resolve, and
  neither carries a changed `id`
- **AND** each view entry's `group` now names the destination group

#### Scenario: A move to the top level clears the group on every entry

- **WHEN** the developer moves a group child out to the top level
- **AND** three step views carry an entry naming that field
- **THEN** none of the three entries carries a `group` key any more

#### Scenario: A move brings the destination group's card to a form lacking it

- **WHEN** the developer moves a top-level field into a group
- **AND** a step view carries that field but not the group's card
- **THEN** that view carries the group's card immediately before the
  field's entry
- **AND** the field's entry names the group's key

#### Scenario: A move into a nested group brings the whole missing chain

- **WHEN** the developer moves a field into a group that sits inside
  another group
- **AND** a step view carrying the field carries neither group's card
- **THEN** that view carries the outer card, then the inner card naming
  the outer key, then the field's entry

#### Scenario: A form already carrying the group's card gains no second one

- **WHEN** the developer moves a field into a group whose card a step view
  already carries
- **THEN** that view still carries exactly one card for that group

#### Scenario: A group moved into another group brings the destination card

- **WHEN** the developer moves a group field into a second group
- **AND** a step view carries the first group's card and its members, but
  not the second group's card
- **THEN** that view carries the second group's card immediately before
  the first group's card
- **AND** the first group's members keep their places after its card

#### Scenario: A move to the top level places nothing

- **WHEN** the developer moves a group child out to the top level
- **THEN** every step view keeps the cards it carried, and gains none

#### Scenario: A move into a group takes the entry's tab off

- **WHEN** the developer moves a top-level field into a group
- **AND** a tabbed step view carries that field on its second tab, but not the
  group's card
- **THEN** that view carries the group's card on the second tab, immediately
  before the field's entry
- **AND** the field's entry names the group's key and has no `tab`

#### Scenario: Only the outermost placed card takes the tab

- **WHEN** the developer moves a field on a tabbed form into a group nested
  inside another group
- **AND** that view carries neither group's card
- **THEN** the outer card carries the field's former tab
- **AND** neither the inner card nor the field's entry carries a `tab`

#### Scenario: A move to the top level gives the entry its card's tab

- **WHEN** the developer moves a group child out to the top level
- **AND** a tabbed step view carries the child inside a group card on the
  second tab
- **THEN** the child's entry names the second tab

#### Scenario: A form without tabs gains no tab from a move

- **WHEN** the developer moves a group child out to the top level
- **AND** a step view carrying it declares no tabs
- **THEN** the child's entry has no `tab`

#### Scenario: A group moved into a group hands its tab to the destination card

- **WHEN** the developer moves a group field into a second group
- **AND** a tabbed step view carries the first group's card on its second tab,
  but not the second group's card
- **THEN** that view carries the second group's card on the second tab
- **AND** the first group's card has no `tab`

#### Scenario: A move leaves a note inside the group alone

- **WHEN** the developer moves a field out of a group whose view also
  holds a note naming that group's key
- **THEN** the note still names that group's key

#### Scenario: A move keeps the key

- **WHEN** the developer moves a field whose `key` is `amount` into a
  group
- **THEN** the field's `key` still reads `amount`, and every CEL
  expression naming `data.amount` still resolves

#### Scenario: The moved field stays selected

- **WHEN** the developer moves the selected field into a group
- **THEN** the view still shows that field's definition half and its
  effect half

### Requirement: An empty field catalog offers a start state

The Fields view SHALL show a start state when the draft carries no
field at all. That state SHALL replace both halves, since neither has a
field to describe.

The start state SHALL do more than report the count. It SHALL name what
a field is for in this process. It SHALL carry the control that adds the
first field. That control SHALL be the same call the rail's Add entry
makes.

The start state SHALL take the empty tone. A draft with no field yet is
a new draft, not a broken one.

The state SHALL go as soon as the draft carries one field. The view
SHALL then select that field and show its two halves.

#### Scenario: A fresh draft shows the start state

- **WHEN** the developer opens the Fields view on a draft carrying no
  field
- **THEN** the view shows the start state instead of the two halves
- **AND** it carries a control that adds the first field

#### Scenario: Adding the first field leaves the start state

- **WHEN** the developer chooses the start state's add control
- **THEN** the draft carries one field, the view selects it, and it
  shows that field's definition half and effect half

#### Scenario: The start state takes the empty tone

- **WHEN** the developer opens the Fields view on a draft carrying no
  field
- **THEN** the start state carries no refusal tone and no issue mark

### Requirement: The field catalog picks a named field kind

The field catalog SHALL offer one picker naming a field kind. A kind
names, in one entry, the `type`, the `format` and the `control` a field
declares. The catalog SHALL NOT ask an author to pick those three
separately.

The kind picker SHALL read its entries from a named table the engine
package exports beside `ALLOWED_BY_TYPE`. The studio SHALL reach that
table over the engine package's `exports` map, the same boundary it
already uses for `ALLOWED_BY_TYPE`. The studio SHALL declare no table
of its own. A second table in the browser package would drift from the
engine's, and the drift would first show at publish.

Choosing a kind SHALL write the raw `type`, `format` and `control`
values that entry names. It SHALL drop a key the entry does not name.
The serialized definition SHALL carry exactly the keys it carries
today. This change adds no key to the definition contract.

Every entry in the table SHALL name a `{type, format, control}` triple
the publish-time format-and-control check accepts. A table entry the
check would reject is unpublishable, so it may not exist.

Changing the kind SHALL name what it drops before it happens, on the
terms `droppedByTypeChange` already states for a type change. An
author changing kind on a field carrying an incompatible `format` or
`control` SHALL see that drop named first.

A field the table names no kind for SHALL keep an escape route. The
picker SHALL offer the plugin envelope. The JSON view SHALL stay the
route for any triple the table omits.

#### Scenario: The picker names a kind, not three members

- **WHEN** the developer opens the kind picker on any field
- **THEN** each entry names one kind, and the view offers no separate
  format picker and no separate control picker

#### Scenario: Choosing a kind writes the raw members

- **WHEN** the developer picks the kind naming `{type: "string",
  format: "date"}`
- **THEN** the draft's field carries `type: "string"` and `format:
  "date"`, and it carries no `control` key

#### Scenario: Changing the kind names the drop

- **WHEN** the developer changes a `{type: "string", format: "date"}`
  field to a kind naming `{type: "number"}`
- **THEN** the studio names the drop before it happens, and the draft's
  field carries no `format` key afterwards

#### Scenario: Every table entry publishes

- **WHEN** a definition declares a field for each entry the table names
- **THEN** the publish-time format-and-control check accepts every one
  of them

#### Scenario: A plugin-typed field keeps its envelope

- **WHEN** the developer opens the kind picker on a field carrying a
  plugin type
- **THEN** the picker offers the plugin envelope, and choosing it keeps
  the field's own `{type, config}` shape

#### Scenario: The definition serializes unchanged

- **WHEN** the developer sets every field in a draft through the kind
  picker and publishes
- **THEN** the serialized body carries the same keys the same draft
  carried before this change, and its `definitionHash` matches

### Requirement: A pressed bulk flag badge fills with its own flag color

A bulk flag badge the field matrix draws SHALL fill with the color of the
flag it sets, once pressed. The `visible` badge SHALL take the visible
flag's color, `required` the required flag's, and `readonly` the readonly
flag's. No badge SHALL fill with the accent.

The badge and the legend that explains it SHALL read one color per flag.
The legend already draws a swatch in each flag's color. A badge in the
accent contradicts the swatch beside it.

The pressed style SHALL follow the same rule every other state on this
surface follows. Code SHALL pick a named compiled style from the flag it
already holds. No stylesheet SHALL select on the `aria-pressed` attribute
the button carries.

#### Scenario: Each pressed badge takes its own flag's color

- **WHEN** the developer presses the `required` bulk badge on a column
  header
- **THEN** that badge fills with the required flag's color
- **AND** it matches the swatch the legend draws for `required`
- **AND** no badge on the screen fills with the accent

#### Scenario: The badge label stays legible on every flag color

- **WHEN** the developer presses any bulk badge, in either color scheme
- **THEN** its label meets the 4.5:1 contrast minimum against its fill

#### Scenario: The accent stays with the screen's one primary action

- **WHEN** the developer reads the field matrix with several badges pressed
- **THEN** the accent fill appears on the publish control alone

### Requirement: A bulk flag badge reads all three of its states

A bulk flag badge SHALL show which of three states its eligible cells hold.
Every eligible cell carries the flag's non-default value, none does, or some
do. The three SHALL look different from one another.

A badge whose cells disagree SHALL NOT look like a badge whose cells all hold
the default. Those two states send an author opposite information. A press on
the first destroys work. A press on the second destroys nothing.

The mixed look SHALL follow the flag's own color, the way the pressed look
does. The fill SHALL carry the difference between them. An author then reads
state and flag from one mark.

Text on a badge SHALL meet the contrast floor against whatever ground that
badge's state gives it. A state carrying no fill therefore takes its own text
color.

#### Scenario: A column where some cells carry the flag reads as mixed

- **WHEN** a column holds four eligible cells and two carry `required: true`
- **THEN** its `required` badge shows the mixed state
- **AND** that state differs from the state the same badge shows when no cell
  carries `required`

#### Scenario: A column where every cell carries the flag reads as full

- **WHEN** every eligible cell in a column carries `required: true`
- **THEN** its `required` badge shows the full state

#### Scenario: The mixed state survives both color schemes

- **WHEN** a badge shows the mixed state, in either color scheme
- **THEN** it stays distinguishable from the empty state and from the full
  state

### Requirement: A bulk flag badge names the cells its press will touch

A bulk flag badge SHALL state how many cells its press writes. It SHALL also
state how many already hold the value that press would set. Both numbers
SHALL reach a pointer user through the badge's title. Both SHALL reach a
screen reader user through its accessible name.

An author SHALL be able to read the blast radius without pressing. The studio
has no undo for a bulk write. The count stands in place of one.

#### Scenario: A mixed badge states both numbers

- **WHEN** the author points at a `required` badge over four eligible cells,
  two of which already carry `required`
- **THEN** the badge states that a press writes four cells and that two
  already hold the value

#### Scenario: The count reaches a screen reader

- **WHEN** focus reaches that badge
- **THEN** its accessible name carries the same two numbers its title carries

### Requirement: A bulk flag badge names the column or row it acts on

A bulk flag badge's accessible name SHALL identify the column or the row it
writes. A grid of thirty badges SHALL NOT give them three names between them.

The name SHALL carry the flag and the target together. A screen reader user
moving across a header row then hears the step each badge belongs to.

#### Scenario: Two badges for one flag carry different names

- **WHEN** a screen reader user reaches the `required` badge on two different
  step columns
- **THEN** each name identifies its own step
- **AND** the two names differ

### Requirement: The field matrix states an empty result in words

The field matrix SHALL say so in words where it has no row to draw. It SHALL
NOT draw a table that carries headers above no row.

Two routes reach this state. A process declares no field, or a filter leaves
no row. The words SHALL say which route applies. One is a process to fix. The
other is a filter to clear.

#### Scenario: A process with no field says so

- **WHEN** the author opens the Field matrix tab on a process that declares no
  field
- **THEN** the tab states in words that the process declares no field
- **AND** it draws no header-only table

#### Scenario: A filter that hides every column says so

- **WHEN** the author engages Hide-inert on a process whose every step is
  inert
- **THEN** the tab states in words that the filter leaves nothing to show

### Requirement: The Hide-inert toggle shows its pressed state

The Hide-inert toggle SHALL look different when engaged. It carries
`aria-pressed` today, and nothing paints that state.

Code SHALL pick a named compiled style from the same value it passes to
`aria-pressed`. No stylesheet SHALL select on the attribute.

#### Scenario: The engaged toggle differs from the resting one

- **WHEN** the author engages Hide-inert
- **THEN** the control's appearance differs from its resting appearance
- **AND** its `aria-pressed` value reads `true`

### Requirement: A gated cell gives its reason

A cell the studio gates for a flag SHALL say why. It carries `aria-disabled`
today and answers a click with nothing.

The reason SHALL reach a pointer user through the cell's title, and a screen
reader user through its accessible description. The two gating cases carry
different reasons, and the wording SHALL say which one applies.

#### Scenario: A cell gated by its own visible flag says so

- **WHEN** the author points at a `required` checkbox on a cell whose
  `visible` resolves to `false`
- **THEN** the cell states that the flag needs a visible cell

#### Scenario: A cell gated as a technical field says so

- **WHEN** the author points at a `required` checkbox on a technical field's
  cell
- **THEN** the cell states that the definition contract rejects the flag there

### Requirement: The field matrix takes the height the tab body leaves

The field matrix's grid SHALL grow with its rows. It SHALL stop at the height
the tab body leaves under the matrix toolbar. This requirement calls that
height the height under the toolbar. That stop SHALL never fall below a floor
of 24rem.

Past the stop the grid SHALL scroll inside itself. The grid SHALL have no fixed
maximum height. A taller window therefore shows more rows, and no empty band
sits below the grid.

On a window with room for everything above the grid and for the floor, the tab
body SHALL NOT scroll. That room counts the toolbar and the spacing between the
toolbar and the grid. On a shorter window the stop sits at the floor and the
tab body scrolls. A grid whose rows need more than the floor then measures the
floor.

A grid SHALL end under its last row when its rows need less than the height
under the toolbar. That holds for a grid shorter than the floor too. The grid's
frame SHALL have no empty band under its last row.

The toolbar SHALL keep its own height at every window height. The grid gives up
height first, down to the floor.

#### Scenario: A long matrix reaches the bottom edge

- **WHEN** the Field matrix tab opens on a window with room for the floor
- **AND** the draft's grid is taller than the height under the toolbar
- **THEN** the grid's bottom edge is the tab body's bottom edge
- **AND** no empty band sits below the grid
- **AND** the tab body itself does not scroll

#### Scenario: The grid scrolls inside itself with its headers in place

- **WHEN** the author scrolls that grid down and sideways
- **THEN** the grid's rows move inside its own frame
- **AND** the step header row and the field header column keep their place
- **AND** the toolbar keeps its place above the grid

#### Scenario: A taller window shows more rows

- **WHEN** the author makes the window taller with the Field matrix tab open
- **THEN** the grid grows with the window and shows more rows

#### Scenario: A short matrix ends under its last row

- **WHEN** the Field matrix tab opens on a grid whose rows need less than the
  height under the toolbar
- **THEN** the grid's frame ends under its last row
- **AND** the grid shows no vertical scrollbar

#### Scenario: A matrix shorter than the floor has no empty band

- **WHEN** the Field matrix tab opens on a grid whose rows need less than 24rem
- **THEN** the grid's frame ends under its last row
- **AND** no empty band sits inside the frame

#### Scenario: A short window holds the floor

- **WHEN** the Field matrix tab opens on a window too short for everything
  above the grid and the floor
- **THEN** a grid whose rows need more than 24rem measures 24rem
- **AND** the toolbar keeps its own height
- **AND** the tab body scrolls to reach the rest of the grid

### Requirement: Renaming a group field's key rewrites the view entries naming it

A `view.fields[].group` holds a group field's `key` rather than its `id`.
Editing that key in the field catalog SHALL rewrite the view entries that
belong to the group. The rewrite SHALL reach every step in the draft. The
catalog write and the view rewrite SHALL land in one draft change.

A field entry belongs to the group through the catalog. The rewrite SHALL
reach each entry whose `ref` names one of the group's direct children. It
SHALL set that entry's `group` to the new key. An empty new key SHALL remove
the entry's `group` instead. The rewrite SHALL leave every other group's
entries alone, even an entry naming the same key string.

A note has no catalog parent, so its old key is its only tie to the group. A
note naming the old key SHALL follow to the new key only when both hold:

- the old key and the new key are both non-empty
- no other group field, at any catalog depth, holds either key

Otherwise the note SHALL keep the key it names. The checks rail reports it
while no group field its view carries holds that key. Retyping the old key
returns the note to its group, since the note never left that key. A group's
first key therefore leaves every note in place, since the old key is empty.

No key write SHALL write an empty `group`.

A group's key input SHALL commit the typed key on blur or on Enter. Ordinary
typing SHALL write nothing before the commit. A half-typed key could equal
another group's key, and the rewrite never sees one.

A label change that derives a new key for a group reaches the same rewrite. A
label whose derivation is empty SHALL keep the group's key.

The rule reaches the key control wherever the catalog offers it. A top-level
group and a group nested inside another group SHALL behave the same way.

On a tabbed form the rewrite keeps the definition contract's tab rules.
Clearing a group's key turns the entries of its direct children into roots.
Each such entry SHALL take the tab of the outermost card holding the group's
own entry. A group's first key turns those entries into members, and each
SHALL lose its `tab`.

On a form declaring no tabs, the rewrite SHALL write no `tab`. Every note
SHALL keep its `tab` as it stood.

A group's first key can reach a view that carries a child's entry and lacks
the group's own card. That view SHALL gain the card, placed immediately
before its first child entry. Every missing ancestor card SHALL come with it,
outermost first. A view already carrying the card SHALL gain no second one.

On a tabbed view the outermost placed card SHALL take the tab the first child
carried. Every child then sits inside that card, whatever tab it named before
the key changed.

The definition contract already refuses a body whose entry names a group key
no field declares. Before this requirement, renaming a group produced exactly
that body. The author then met the error at publish, with nothing naming the
rename.

#### Scenario: A rename follows through to every step

- **WHEN** the developer changes a group field's key from `request` to
  `order_request`
- **AND** three step views carry entries for that group's children
- **THEN** all three entries name `order_request`

#### Scenario: A rename carries a note along

- **WHEN** the developer changes a group field's key from `request` to
  `order_request`, and no other group field holds either key
- **AND** a step view holds a note naming `request`
- **THEN** the note names `order_request`

#### Scenario: A nested group renames the same way

- **WHEN** the developer renames a group field that sits inside another group
- **THEN** its direct children's entries name the new key
- **AND** its own entry still names the outer group's key

#### Scenario: A rename leaves another group's entries alone

- **WHEN** the developer renames one of a draft's two group fields
- **THEN** the entries naming the other group keep their old key

#### Scenario: A cleared key keeps the note until the key returns

- **WHEN** a step view carries the card of a group keyed `g`, a member and a
  note naming `g`
- **AND** the developer clears that key and commits it
- **THEN** the member's entry has no `group`, and the note still names `g`
- **AND** no entry in the view carries an empty `group`
- **AND** once the developer types `g` again and commits it, the member's
  entry and the note name `g`

#### Scenario: A key another group holds leaves every note where it stands

- **WHEN** a step view holds a note naming group `g`'s key and a note naming
  group `h`'s key
- **AND** the developer changes `g`'s key to `h` and commits it
- **THEN** the first note still names `g`, and the second still names `h`

#### Scenario: An old key two groups share keeps its note

- **WHEN** two group fields both hold the key `dup`
- **AND** a step view carries a member of the first group and a note naming
  `dup`
- **AND** the developer changes the first group's key to `unique` and commits
  it
- **THEN** the member's entry names `unique`
- **AND** the note still names `dup`

#### Scenario: A cleared key gives a root group's members its card's tab

- **WHEN** a tabbed step view carries a group's card and two members on its
  second tab
- **AND** the developer clears that group's key
- **THEN** both members' entries name the second tab and have no `group`

#### Scenario: A cleared key on a nested group gives its members the outer card's tab

- **WHEN** a tabbed step view carries an outer group's card on its second tab
- **AND** an inner group's card and its member sit inside that card
- **AND** the developer clears the inner group's key
- **THEN** the member's entry names the second tab

#### Scenario: A group's first key takes the tab off its children's entries

- **WHEN** a tabbed step view carries a key-less group's card and its child
  field, each naming a tab
- **AND** the developer gives the group its first key
- **THEN** the child's entry names that key and has no `tab`

#### Scenario: A form without tabs gains no tab from a cleared key

- **WHEN** a step view declaring no tabs carries a group's card and a member
- **AND** the developer clears that group's key
- **THEN** the member's entry has no `tab`

#### Scenario: A group's first key brings its card to a form lacking it

- **WHEN** a step view carries a key-less group's child field and lacks the
  group's card
- **AND** the developer gives the group its first key
- **THEN** that view carries the group's card immediately before the child's
  entry

#### Scenario: A first key's card takes the first child's tab

- **WHEN** a tabbed step view carries two children of a key-less group, on
  different tabs
- **AND** that view lacks the group's card
- **AND** the developer gives the group its first key
- **THEN** the placed card names the tab of the child that comes first in the
  view
- **AND** both children sit inside it, with no `tab` of their own

#### Scenario: A first key on a nested group brings the whole chain

- **WHEN** a key-less group sits inside a keyed group in the catalog
- **AND** a step view carries the inner group's child field and neither card
- **AND** the developer gives the inner group its first key
- **THEN** that view carries the outer card, then the inner card naming the
  outer key, then the child's entry

#### Scenario: A first key places no second card

- **WHEN** a step view already carries a key-less group's card and its child
- **AND** the developer gives the group its first key
- **THEN** that view still carries exactly one card for that group
