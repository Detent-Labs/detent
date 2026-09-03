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

### Requirement: Editing is a canvas-primary surface, with the process-wide views on a routed screen

The `/processes/:id/edit` screen SHALL carry over the editor's Draft
model (`draft/`), UI-chrome i18n, and live validation. It SHALL also
carry over the structural panels (`panels/`). These panels are steps,
paths, timers, actions, subprocess spec, view editor, field catalog,
data sources, and contract. The draft routes replace file-based
persistence. `GET /drafts/:processId` loads the draft.
`PUT /drafts/:processId` saves it and carries the revision the load
call returned.

The screen's layout SHALL be canvas-primary. An interactive graph (see
the `studio-canvas` capability) occupies the top of the editing well. A
fixed-width section index beside the canvas lists the selected step's
own sections and their entity counts. Those sections are identity,
assignment, paths, timers, actions, subprocess spec, and view. See the
`studio-canvas` capability for how choosing an entry behaves.

The process header's `⋮` overflow menu SHALL carry `baseLocale`. This
capability requires an author to declare a non-English base locale
without leaving the Structure surface. The panels screen SHALL NOT hold
it.

Four links SHALL sit in the canvas edit screen's rail, under a Process
heading: Fields, Data sources, Contract, Field matrix. See the
`studio-canvas` capability's layout requirement for the rail. Each link
SHALL navigate to the panels screen, opened at its own view. These four
views cover the whole process, not one step. The links stay reachable
whether or not the author has selected a step on the canvas.

The links SHALL belong to the Structure surface alone. The screen SHALL
NOT offer them while the JSON surface is active. All four views mutate
the draft body, and the `studio-json-view` capability requires that no
draft-body-mutating control stays reachable there.

This requirement governs where the screen mounts each panel, and how an
author reaches it. What each panel validates, mutates, or persists
stays the same.

Every inline missing-translation warning SHALL survive the move. Six
`LocalizedTextInput` sites carry one.

- the process label, which stays on the screen
- a step's label and description, which move into the section index's
  identity section
- a field's label and description, and a field option's label, which
  move into the panels screen's Fields view

Live validation SHALL remain exactly what it is today. It runs the
engine's own publish-time chain in the browser and reports issues in
place. It SHALL NOT block saving, since a work-in-progress draft is
normally invalid.

The section index SHALL carry one issue count for the selected step as
a whole. That count SHALL cover the step's own issues, and the issues of
its paths, timers and actions. Here `resolveLoc` returns the deepest
entity it finds. A guard's issue therefore names the path, not the step.
A count over the step's own id alone would read zero on such a step.

The panels screen's index rail SHALL carry one issue count per view.
Both counts SHALL use the same visual tone. The rest of the studio area
already uses that tone for issues.

Per-section issue counts are out of scope. `resolveLoc` resolves a
view, assignment or subprocess-spec issue to the step itself. No
per-section number exists to report.

The screen SHALL offer a **Publish** action (see the `studio-publish`
capability). It calls `POST /drafts/:processId/publish` against the
currently persisted draft, not the in-browser draft state. When local
changes remain unsaved, the action SHALL prompt the user to save
first. It must not publish stale or ahead-of-server content. On
success, the screen SHALL confirm the new version number and
`definitionHash`.

#### Scenario: A draft round-trips through the panels

- **WHEN** the developer loads a draft, adds a step through the panels,
  saves the draft, and reloads it
- **THEN** the panels surface the new step identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** the developer loads a draft, repositions a step, connects it
  to another step, then saves and reloads it
- **THEN** the canvas renders the new position and path identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for the current draft
- **THEN** the screen displays the issues, keeps the save action
  available, and the save succeeds

#### Scenario: A Structure-surface link opens the panels screen

- **WHEN** the developer clicks the Fields, Data sources, Contract, or
  Field matrix link in the rail's Process section
- **THEN** the panels screen opens at that view, and the address bar
  carries that view's own path

#### Scenario: A link opens the panels screen with no step selected

- **WHEN** the developer clicks one of those links before selecting any
  step on the canvas
- **THEN** the panels screen still opens at that view

#### Scenario: The JSON surface renders no link into the panels screen

- **WHEN** the developer switches to the JSON surface
- **THEN** the four links are absent, and no control on screen reaches
  the panels screen

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the developer clicks Publish while local changes remain
  unsaved
- **THEN** the studio prompts the developer to save before publishing,
  and does not call `POST /drafts/:processId/publish` until the save
  completes

#### Scenario: The screen confirms a successful publish

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the screen displays the returned version number and
  `definitionHash`

### Requirement: The panels screen is a routed sub-state of the edit screen

The four process-wide views SHALL sit on a routed screen, not behind a
dialog. The path SHALL read `/processes/:id/edit/panels/:view`. Here
`:view` is one of `fields`, `dataSources`, `contract` or `matrix`.

That path SHALL be a sub-state of the `edit` route. It rides as an
optional field on the same route object, the shape `formStepId` already
takes. The `studio-form-editor` capability routes its own screen that
way.

An unrecognized `:view` SHALL fall back to the edit screen's own
canvas. The routing table already answers an unrecognized path with the
process list, and this is that rule one level down.

The screen SHALL lay out three columns, in order: an index rail, the
open view, and the checks rail. See the `studio-checks-rail` capability
for what the rail shows here.

The panels screen SHALL replace the canvas while it is open. It SHALL
offer one control back to it.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `panel` and
`formStepId` matches. Choosing a "Show on the canvas" control SHALL
navigate back to the canvas with that step preselected. The canvas
SHALL read the target whenever it changes, not only once on mount.
Navigating there from an already-mounted panels screen therefore still
selects the step.

Once read, the screen SHALL replace that history entry with the plain
`edit` route. It SHALL NOT leave the step target addressable. The
browser's Back control therefore still returns to the panels screen
the navigation came from, per `unified-shell`'s navigation
requirement.

The three columns SHALL fill the height the screen's header rows leave,
above the floor the canvas layout uses. A taller window
therefore shows taller columns, and no empty band sits below them. This
is the rule `studio-canvas` states for the canvas edit screen, and the
panels screen stands in the same well.

#### Scenario: The columns fill a tall window

- **WHEN** the developer opens the panels screen on a window taller
  than the floor
- **THEN** the three columns reach the bottom of the well, and no empty
  band sits below them

#### Scenario: A short window holds the floor

- **WHEN** the developer opens the panels screen on a window shorter
  than the floor
- **THEN** the columns hold that floor and the page scrolls

#### Scenario: A view has its own address

- **WHEN** the developer opens the Data sources view
- **THEN** the address bar reads that view's path, and loading that
  path directly opens the same view

#### Scenario: A reload keeps the open view

- **WHEN** the developer reloads the browser on the Contract view
- **THEN** the screen reopens on the Contract view, not on the canvas

#### Scenario: Back leaves the screen rather than the process

<!-- antislop: allow synonym-rotation -->
<!-- Why: the `edit` route is a route name. A change is a draft
     mutation. The two words name different things here. -->
- **WHEN** the developer reaches the panels screen from the canvas and
  presses the browser's Back control
- **THEN** the canvas returns, and the draft keeps every change

#### Scenario: Show on the canvas preselects a step

- **WHEN** the developer chooses "Show on the canvas" on a used-in row
  of the Fields view
- **THEN** the canvas returns and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the developer loads `/processes/:id/edit/panels/nonsense`
- **THEN** the edit screen's canvas renders, and the screen reports no
  issue

### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- Why: the toolbar's Discard control drops every unsaved change. The
     panel's Remove control drops one entity. Two separate controls,
     each keeping its own name. -->
The panels screen SHALL carry no Save control. Every change an author
makes on it SHALL write straight into the in-browser draft. That is how
the panels write today. The screen's own Save, Discard and Publish
toolbar SHALL remain the only thing that persists.

Leaving the screen SHALL discard nothing. The screen SHALL state that
plainly, so leaving never reads as a cancel.

A panel's own unsubmitted input SHALL survive a switch between views.
The contract panel holds a half-typed outcome name in component state.
The data sources panel fetches its list keys on mount. The field matrix
holds its selected cell in component state. All four views SHALL
therefore stay mounted for as long as the panels screen is open.
Switching a view SHALL reveal and hide them, rather than mount them.

An index rail SHALL list the four views. Each entry SHALL carry two
numbers, and they SHALL read as different things. The entity count says
how many fields, data sources, outcomes or live cells the view holds.
The issue count says how many of them are wrong. Only the issue count
takes the refusal tone. An entry SHALL carry no issue count when the
view holds no issue.

For the Fields view and for the Data sources view the rail SHALL also
list that view's own entities and an Add entry. Choosing an entity SHALL
select it. The view SHALL render that one entity's editor. The Add entry
SHALL add an entity, through the call the panel's own add control makes.
A group field's children indent one level under it.

Contract holds a single editor, so its rail entry SHALL carry no
sub-list. The field matrix draws a grid, so its entry SHALL carry none
either.

The rail SHALL render a sub-list only under the open view. Two
sub-lists at once fill the column.

A group field SHALL keep one recursive editor. Choosing a child in the
rail SHALL select the parent group and scroll the child into view inside
that editor.

A selection SHALL live in component state and SHALL take no address of
its own. The screen SHALL select the first entity on mount. It SHALL
select the added entity after an Add.
<!-- antislop: allow synonym-rotation -->
<!-- Why: the panel's Remove control drops one entity. The toolbar's
     Discard control drops every unsaved change. The two are separate
     controls, so neither word may stand in for the other. -->
It SHALL select the neighbour after a Remove. Switching to another view
and back SHALL keep the selection the first view held.

Each entity entry SHALL carry its own issue mark, separate from the
view entry's issue count. One entity at a time otherwise hides a broken
entity behind whichever entry an author has open.

The rail SHALL mark the open view with `aria-current`. A rail entry
switches a view rather than disclosing adjacent content, so it SHALL
NOT carry `aria-expanded`.

The rail SHALL cap indentation at two levels. A group field's children
indent once. A field nested deeper SHALL take its own top-level rail
entry rather than a deeper indent. This is a rail-rendering rule only:
the draft's own field tree SHALL keep whatever depth it declares.

The Fields rail entry SHALL name a field by its resolved label alone, on
one line. The field's friendly type and the issue mark SHALL sit beside
it. The row SHALL NOT print the field's key. The key stays in the Field
tab once an author selects that field. The engine's own exact-match
value already lives there.

The rail SHALL keep the fallback name it shows today. It SHALL trigger
on an EMPTY RESOLVED LABEL rather than an empty key. The label is the
row's primary text now. A field carrying a key but no label needs the
fallback exactly as an empty-key field did before.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the developer adds a field on the screen and then returns to
  the canvas
- **THEN** the draft still carries that field, and the screen's toolbar
  still reports unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the developer types an outcome name in the Contract view,
  switches to Fields without adding it, then switches back
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the developer moves roving focus to a live cell in the
  Field matrix view and activates it
- **AND** the developer switches to Contract, then switches back
- **THEN** the same cell still holds roving focus, and it is still
  activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the developer inspects the open screen
- **THEN** it carries no Save control, and it states that it keeps
  every change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a
  contract
- **THEN** the rail's Fields entry reads three, its Data sources entry
  reads two, and its Contract entry carries no sub-list

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a
  validation issue
- **THEN** the rail's Fields entry reads three for its entity count and
  one for its issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the rail's Data sources entry reads two and shows no issue
  count

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry, not a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the developer chooses the
  second in the rail
- **THEN** the Fields view renders that field's editor, and it renders
  neither of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the developer chooses
  the second in the rail
- **THEN** the Data sources view renders that data source's editor, and
  it renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the developer opens the Data sources view on a draft that
  carries both fields and data sources
- **THEN** the rail lists the data sources under that entry, and it
  lists no field under the Fields entry

#### Scenario: A group child selects its group

- **WHEN** the developer chooses a group field's child in the rail
- **THEN** the view renders the group's own recursive editor, and it
  scrolls the child into view inside that editor

#### Scenario: The Fields rail adds a field

- **WHEN** the developer chooses the rail's Add entry under Fields
- **THEN** the draft carries one more field, the rail lists it, and the
  view renders that new field

#### Scenario: Removing a field selects its neighbour

- **WHEN** the developer removes the selected field from a draft that
  carries three
- **THEN** the view renders a neighbouring field, and it reports no
  empty selection

#### Scenario: A reload selects the first entity

- **WHEN** the developer reloads the browser on the Fields view
- **THEN** the view renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the developer chooses the rail's Add entry under Data sources
- **THEN** the draft carries one more data source, the rail lists it, and
  the view renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the developer removes the selected data source from a draft
  that carries three
- **THEN** the view renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the developer reloads the browser on the Data sources view
- **THEN** the view renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the
  developer has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has
  a `label` carrying the base-locale value but no `de` value
- **THEN** the screen's Fields view shows the missing-translation
  warning next to that field's label input

#### Scenario: The Fields rail row shows no key

- **WHEN** the developer opens the Fields view on a draft whose fields
  each carry a `key`
- **THEN** every rail row shows the resolved label, the friendly type
  and any issue mark
- **AND** no row prints a `key`

### Requirement: The Fields and Data sources views take the area's field rule

Both views SHALL render their editors under the design language's field
rule. The rule `.steps-panel label` states it in the area today. A
label SHALL sit above its control. A `key` and a `type` SHALL print in
mono, because the engine matches both exactly. A hairline SHALL divide
rail rows, and a rule SHALL sit under a view's heading. No corner SHALL
take a radius.

The Fields view SHALL edit one field through three tabs, in order:
Field, Values, Rules. The field's checks (`IssueList`) SHALL show
once, above the tab set, so an issue stays visible whatever tab is
open.

The tab set SHALL edit the selected TOP-LEVEL field alone. A group
field's children SHALL render inside the Field tab through the area's
existing flat, recursive field row. They SHALL carry no tab set of
their own. Nesting a tab set inside a tab set would let an issue on a
child hide behind a tab. That is exactly what a field's own
unconsolidated checks did before this change.

The Field tab SHALL show the key, the label, the description and the
type picker without a click. It SHALL also hold the Technical control,
always visible outside either disclosure, directly below the type
picker.

Translation status SHALL show as a badge beside the label input. The
badge SHALL name the current locale's missing count. The field SHALL
carry no separate translation-status list. Adding a language SHALL
stay draft-scoped in the content-locale switcher. The preview ("How
it will look") and the usage list ("Used in") SHALL each sit inside a
collapsed `<details>` disclosure. Both SHALL start closed.

A group field's children SHALL stay outside any disclosure, inside the
Field tab's always-visible content. The developer view SHALL keep its
own existing, separate `<details>` disclosure, untouched by this
change. Remove field SHALL sit below a rule at the tab's end. It SHALL
read as the tab's least frequent action, not one more item in the stack
above it.

The Values tab SHALL divide into zones, each under its own heading. A
rule SHALL separate each zone from its neighbour. "Where values come
from" (the data source and the options) and "Default value" SHALL
always show.

"Column mapping" SHALL show as a third zone only when the field's data
source is mappable, per the existing `showsColumnMapping` rule. It is
not a fourth control stacked beside the other two. Its absence draws
no rule of its own.

The Rules tab SHALL divide into two zones under the same rule. The
zones are "Only ask this when" (the condition) and "Validation" (the
field's validation rules).

The Default value zone SHALL offer a literal input matching the
field's type and its declared format. For a field carrying static
`options` that input SHALL be a `<select>` bound to those options, or
the multi-value equivalent when the field's type is `list`. For a
`string` field declaring a `format` it SHALL be that format's own
native input.

Either control SHALL offer no option when the field is
`dataSource`-bound, since the draft carries no resolved rows for one.
That is the same carve-out named below for the preview. The CEL toggle
SHALL still work there. A field declaring `format: "person"` and
neither `options` nor `dataSource` SHALL get the identical carve-out,
whether its type is `string` or `list`: the draft resolves no
`allowedGroups`-sourced people list either, since that resolution needs
a live database read the draft editor does not have. The CEL toggle
still works there too.

The note the zone shows in the person case SHALL name the people list,
not a data source. The existing note names a data source by hand, and
this field declares none; an author reading it would learn the wrong
thing about their own draft.

For a `file` field the whole Default value zone SHALL show disabled. It
SHALL state that the type accepts no default here. This mirrors "Only
ask this when" 's own disabled state for a field no step view
references.

For a `group` field the whole Default value zone SHALL also show
disabled. It SHALL state that a group's own default is never read. A
group carries no slot of its own in the flat data payload. A literal
or CEL default written there would silently never apply. That is the
same issue this change exists to close for `FieldDef.default` in
general.

Every other type gets a link-styled toggle. It SHALL switch the zone
to a raw CEL text input for an expression default. This mirrors the
toggle affordance the Rules tab's condition row already uses. The zone
SHALL NOT mount the guard-shaped condition-builder component. A
default is a value, not a boolean. It needs no comparison-row builder.

Writing through the literal input SHALL set the field's `default` key
to that literal value. Writing through the CEL input SHALL set it to `{
lang: "cel", src }`. Clearing either input SHALL remove the `default`
key.

All three tab panels SHALL stay mounted while a field stays selected.
Switching a tab SHALL reveal and hide them, rather than mount them.
This is the rule the four views take one level up. It holds here for
the same reason. The developer view holds a half-typed config in
component state. Each builder holds an incomplete row the draft does
not carry.

A disclosure inside the Field tab SHALL keep its own open/closed state,
independent of the active tab. Switching away from Field and back SHALL
NOT reset an open disclosure to closed.

The type picker SHALL list the six base field types under friendly
names, each with a short note. It SHALL write the raw `baseFieldType`
value to the draft. It SHALL offer no type the contract does not carry.
It SHALL keep the custom plugin envelope.

A format picker and a control picker SHALL sit below the type picker.
Each SHALL offer the members the selected type allows, per the table
the `definition-contract` capability states. Each SHALL also offer an
entry for declaring no member at all. Each SHALL write the raw member
value to the draft. Each SHALL drop its key when the developer picks
the empty entry. A type whose row allows no member SHALL hide that
picker outright.

Switching the type SHALL drop a `format` or a `control` the new type
does not allow. It SHALL name that drop before it happens. Leaving the
key in place lets the developer publish a body the compile pass
rejects. No control on screen would show why.

"How it will look" SHALL preview the field through the shared form
component, read-only, inside its disclosure. Every previewed entry's
`readonly` SHALL read `true`, and the preview's container SHALL carry
`inert`.

The preview runs over a synthesized single-field view. For a group
field it synthesizes the group's own entry, plus one entry per
descendant. That reaches every depth, not only the group's immediate
children.

A group holding a group SHALL preview both levels. That is the
grouping the shared form component itself applies. The synthesis
SHALL also carry the sample values in the shape that component reads
them, keyed by field id.

A dataSource-backed field SHALL preview with no option list. The
draft carries no resolved rows for one. The row stating so SHALL name
that the field resolves at runtime. An author previews what a
participant gets. A field declaring `format: "person"` and neither
`options` nor `dataSource` SHALL preview the same way, for the
identical reason: the draft cannot reach the live `allowedGroups`
expansion either. That field SHALL get its own row wording, naming the
people list rather than a data source it does not declare.

The preview's sample value SHALL match the shape the field's own type
takes. A `format` narrows the value domain, so a formatted field
previews that format's sample rather than its type's — but a `{type:
"list"}` field holds an array whatever its format, so its sample SHALL
be the format's sample inside an array. A scalar there would draw a
multi-select with nothing selected, since the shared form component
reads a non-array value as an empty selection.

"Used in" SHALL list, inside its disclosure, every step whose view
references the field, with the modes those references set. A "Show on
the canvas" control on a row SHALL return to the canvas with that step
preselected.

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

#### Scenario: A field editor states its labels above its controls

- **WHEN** the developer opens the Fields view on any field
- **THEN** each label sits above its own control, and no label sits
  beside one

#### Scenario: A key prints in mono

- **WHEN** the developer opens the Fields view on any field
- **THEN** the field's key and its type print in the mono face

#### Scenario: The type picker writes a raw type

- **WHEN** the developer chooses "Text" in the type picker
- **THEN** the draft's field type reads `string`, and the definition
  serializes unchanged

#### Scenario: The format picker offers what the type allows

- **WHEN** the developer selects a `string` field and opens the format
  picker
- **THEN** it offers `date`, `datetime`, `email` and `person`, plus an
  entry for declaring no format
- **AND** it offers no other member

#### Scenario: The format picker offers person for a list field

- **WHEN** the developer selects a `list` field and opens the format
  picker
- **THEN** it offers `person` alone, plus an entry for declaring no
  format

#### Scenario: A type with no allowed control hides the control picker

- **WHEN** the developer selects a `file` field
- **THEN** neither the format picker nor the control picker renders

#### Scenario: Switching the type drops a member the new type refuses

- **WHEN** the developer switches a `{type: "string", format: "date"}`
  field to `number`
- **THEN** the studio names the drop, and the draft's field carries no
  `format` key afterwards

#### Scenario: The Field tab shows identity without a click

- **WHEN** the developer opens the Fields view on any field
- **THEN** the key, the label, the description and the type picker show
  without opening any disclosure
- **AND** the preview and the usage list each start closed

#### Scenario: The Technical checkbox shows without opening either disclosure

- **WHEN** the developer opens the Fields view on any non-group field
- **THEN** the Technical checkbox shows below the type picker, with
  neither the preview nor the usage list disclosure open

#### Scenario: Translation status shows as a badge

- **WHEN** the studio's `contentLocale` is `de`, and a field's label
  carries a base-locale value but no `de` value
- **THEN** a badge beside the label input names its missing count for
  the active content locale
- **AND** no separate translation-status list renders
- **AND** the badge names no locale of its own. The content-locale
  switcher already names `de` once, in the toolbar

#### Scenario: A disclosure survives a tab switch

- **WHEN** the developer opens the preview disclosure on the Field tab,
  switches to the Rules tab, then switches back
- **THEN** the preview disclosure is still open

#### Scenario: Remove field sits below a rule

- **WHEN** the developer opens the Fields view on any field
- **THEN** Remove field is the tab's last control, below a rule that
  separates it from every other control

#### Scenario: The Values tab always shows its first two zones, ruled apart

- **WHEN** the developer opens the Values tab on any field
- **THEN** "Where values come from" and "Default value" each show
  under their own heading, with a rule between them

#### Scenario: The Values tab shows a third ruled zone only for a mappable field

- **WHEN** the developer opens the Values tab on a field whose data
  source is mappable
- **THEN** "Column mapping" also shows, as a third zone ruled apart
  from "Default value"

#### Scenario: An unmappable field shows no Column mapping zone

- **WHEN** the developer opens the Values tab on a field whose data
  source is not mappable
- **THEN** no "Column mapping" heading renders, and "Default value"
  draws no rule below it for a zone that isn't there

#### Scenario: The Rules tab shows two ruled zones

- **WHEN** the developer opens the Rules tab on any field
- **THEN** "Only ask this when" and "Validation" each show under their
  own heading, with a rule between them

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
- **THEN** the draft's field carries no `default` key

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
- **AND** the note names the people list, not a data source

#### Scenario: A bare person list's default offers no checkbox group

- **WHEN** the developer opens the Default value zone on a `{type:
  "list", format: "person"}` field declaring neither `options` nor
  `dataSource`
- **THEN** the literal control offers no option, rather than a checkbox
  group over an empty option set, and the CEL toggle still lets the
  developer write an expression default

#### Scenario: The Default value zone disables for a reference or file field

- **WHEN** the developer opens the Values tab on a `file` field
- **THEN** the Default value zone shows disabled, and states that the
  type accepts no default here

#### Scenario: A formatted string field's default uses that format's input

- **WHEN** the developer opens the Default value zone on a
  `{type: "string", format: "date"}` field, with the CEL toggle off
- **THEN** the literal input is a native date input

#### Scenario: The Default value zone disables for a group field

- **WHEN** the developer opens the Values tab on a `group` field
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
- **THEN** the preview shows no option list, and the row states that
  the field's people list resolves at runtime, naming no data source

#### Scenario: A person list previews an array sample

- **WHEN** the developer opens the preview on a `{type: "list", format:
  "person"}` field
- **THEN** the synthesized sample value is an array holding the person
  format's own sample, not that sample as a bare scalar
- **AND** the `{type: "string"}` twin still previews the scalar

#### Scenario: A tab switch keeps a half-typed developer view

- **WHEN** the developer types a config the developer view cannot parse
  yet, switches to the Rules tab, and switches back
- **THEN** the typed text is still in the input

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

### Requirement: The field catalog's Field tab offers a Technical control

The field catalog's Field tab SHALL offer a Technical checkbox for the
selected field. It SHALL offer one for each of a group's children in the
same tab. Checking it SHALL write `technical: true`. Unchecking it SHALL delete
the `technical` key. Every other view-flag control in the studio already
follows that same convention for its own default value.

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
to it. The pass SHALL walk every step, not only the steps the field
matrix currently draws.

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
- **THEN** that field carries no `technical` key
- **AND** no view entry regains a `required` or `readonly` key

#### Scenario: A group's child offers the control

- **WHEN** the field catalog's Field tab draws the recursive field row
  for a field nested inside the selected `type: "group"` field
- **THEN** that row offers the Technical checkbox

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

The field catalog's key field SHALL auto-fill from the edited field's label
as the developer types it, for a field whose key is empty or still equal to
what derivation would produce from the label's prior value. This applies to
a top-level catalog field and to a field nested inside a `group` field's
own child editor alike. Derivation SHALL read only the field label's
base-locale entry: an edit to any other locale's translation SHALL NOT
trigger key derivation. Derivation SHALL lower-case the label, collapse
every run of characters outside `[a-z0-9]` to a single `_`, and trim a
leading or trailing `_`; a result starting with a digit SHALL gain a
leading `_` — the same shape the definition contract's identifier grammar
(`/^[a-z_][a-z0-9_]*$/`) already requires of a published `FieldDef.key`.

When the derived key would collide with another key already present
anywhere in the process's field catalog — a top-level field or a field
nested inside any `group` — the field catalog SHALL append `_2`, and, if
that also collides, `_3`, and so on, until the candidate is unique across
the whole catalog.

The first edit the developer types directly into a field's key field SHALL
stop this auto-fill for that one field for the remainder of the draft's
lifetime in the browser. The key field SHALL remain an ordinary editable
text input throughout.

#### Scenario: A new top-level field's key follows its label as the developer types

- **WHEN** the developer, while the studio's content locale is the draft's
  base locale, drops a new field onto the canvas and types "Requested
  amount" into its label, having never touched its key field
- **THEN** the field's key reads `requested_amount`

#### Scenario: A new field's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away from
  the draft's base locale, drops a new field onto the canvas, and types a
  label into it, having never touched its key field
- **THEN** the field's key stays empty, since a newly created field's label
  seeds under the current content locale and derivation reads only the
  base-locale entry

#### Scenario: A new nested field's key follows its label as the developer types

- **WHEN** the developer adds a field inside a `group` field and types a
  label into it, having never touched that nested field's key field
- **THEN** the nested field's key derives from its own label the same way a
  top-level field's does

#### Scenario: A colliding derived field key gets a numeric suffix

- **WHEN** the developer types a label that derives to a key another field
  in the catalog already carries, whether that field is top-level or
  nested inside a group
- **THEN** the new field's key reads the colliding key with a `_2` suffix

#### Scenario: A hand-edited field key stops following its label

- **WHEN** the developer changes a field's auto-derived key and then edits
  that field's label further
- **THEN** that field's key stays what the developer typed

#### Scenario: Editing a non-base-locale translation leaves an already-derived field key untouched

- **WHEN** the developer types a base-locale field label (deriving a key),
  switches the studio's content locale, and types a translation into the
  field label's non-base-locale entry
- **THEN** the field's key is unchanged

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
  carries no entry referencing the row's field.
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
  in the same order the field catalog panel lists them

#### Scenario: A step with no view hatches its whole column

- **WHEN** a workflow step declares no `view`
- **THEN** every cell in that step's column draws hatched, for every
  field row

#### Scenario: An unreferenced field on a view-bearing step draws blank

- **WHEN** a workflow step declares a `view` whose `fields` carries no
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
catalog's Rules tab "Only ask this when" row. That row writes the
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
colors, in the same `visible`/`required`/`readonly` assignment. This
holds identically on the panels screen's grid and the canvas dock's
Field matrix tab. The color adds to the checkbox's `aria-label` and its
row position; neither of those changes.

Each checkbox SHALL start from the entry's own resolved value: an
absent key reads the engine's own default, not `false`. Changing a
checkbox SHALL write to that entry's key immediately, through the same
`setFlag` primitive `studio-form-editor` already uses. It SHALL clear
the key on a return to its default.

Where a live cell's own `visible` resolves to a literal `false`, that
cell's `required` and `readonly` checkboxes SHALL disable. That is the
same gating the field matrix applied before this change.

Where no other source in the draft, **guaranteed to be written before
this cell's own step is submitted**, writes a live cell's field, its
`required` and `readonly` checkboxes SHALL gate each other. Checking
`required` SHALL disable `readonly`, while `readonly` does not already
read `true`. Checking `readonly` SHALL disable `required`, while
`required` does not already read `true`. "No other source, guaranteed
before this step" means none of these already write the field:

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

A step dominating another is the same relation the compile pass's
`definition-contract` check (`checkUnsatisfiableRequiredReadonly`) now
uses. The two SHALL share one dominance computation over the draft's
`workflow.steps`, so neither can disagree with the other about which
step guarantees a value by the time a given step is submitted. A step
editable only on a step that does NOT dominate this cell's own step —
reachable solely after it, or only via a different branch — does NOT
count, and gating stays engaged.

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
possible on the field catalog's Rules tab condition row.

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

- **WHEN** the developer checks a live cell's `required` box
- **AND** an action output, a subprocess output mapping, a column
  mapping, a contract input field, or another editable view entry for
  the same field on a step that dominates this cell's own step already
  writes that field
- **THEN** that cell's `readonly` checkbox stays enabled

#### Scenario: A field editable only on a non-dominating step keeps gating engaged

- **WHEN** the developer checks the first step's live cell for a
  field's `required` box
- **AND** the field's only other editable placement is on a step
  reachable only after this first step, or only via a different branch
- **THEN** that cell's `readonly` checkbox disables

#### Scenario: An own-step post-gate output does not clear gating

- **WHEN** the developer checks a live cell's `required` box
- **AND** the field's only other writer is an action's `output` on the
  cell's own step at `onExit`, `onPath`, or `onCancel`
- **THEN** that cell's `readonly` checkbox still disables — an own-step
  post-gate output fires after the submission gate, so it does not
  count as a source that writes the field before this step is
  submitted

#### Scenario: An entry already carrying both flags stays editable

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

### Requirement: Column and row headers offer bulk flag toggles on the panels screen

This requirement covers the panels screen's field matrix only. The
canvas dock's Field matrix tab carries no bulk toggle badge. The
requirement below, "The canvas dock's Field matrix tab carries no
toolbar or bulk badges," states that half.

Each column header and each row header SHALL offer `visible`,
`required` and `readonly` toggle badges. This holds wherever that
column or row carries at least one live cell. A badge SHALL flip
every live, non-CEL cell in that column or row.

A `required` or `readonly` badge SHALL skip any cell already gated for
that flag. Gated means one of two things: the cell's own `visible`
resolves to `false`, or the field's other flag among
`required`/`readonly` already resolves to `true`. The second case
applies only while nothing else in the draft, guaranteed to be written
before that cell's own step is submitted, writes that field — the
same dominance-scoped "written" test "A live cell edits its own view
entry inline" defines.

Every `required` and `readonly` bulk badge SHALL treat a technical
field's cell as gated, unconditionally. This holds on a column header
and on a row header alike. This matches a cell that already carries
the flag's opposite. The definition contract rejects either key on a
technical field's view entry. A bulk badge SHALL NOT write one there,
even where the column's other, non-technical rows are eligible.

Where every eligible cell already carries the flag's non-default
value, the badge SHALL turn that flag off across those cells. It
turns the flag on otherwise.

A column or row with no live cell SHALL carry no bulk toggle badge.

The matrix SHALL NOT show a single badge whose own eligible cell set is
empty. Gating a cell only stops the write. It leaves the button in
place. A button that answers no click reads as a broken control.

This rule widens the live-cell rule above, from the whole badge group to
one badge. It covers a technical field's row with no second exclusion
mechanism. `visible` keeps a non-empty eligible set there. That badge
stays, and the other two go. The rule also removes a badge from a row
whose cells the studio gates for any other reason.

A column header's `visible`/`required`/`readonly` badges SHALL sit in
three fixed positions, one per flag, in that order. Those positions
SHALL match the fixed positions the same three flags hold in the
column's own cells below. A badge can be absent because its eligible
set is empty. Its position SHALL stay empty then, rather than let the
remaining badges shift into it.

#### Scenario: A column's bulk badge sets every eligible cell in that step

- **WHEN** the developer selects a column's `required` badge, on a
  step where none of its live, non-CEL, non-gated cells carry
  `required: true`
- **THEN** every one of those cells' `required` value becomes `true`

#### Scenario: A row's bulk badge clears every eligible cell for that field

- **WHEN** every live, non-CEL, non-gated cell for one field already
  carries `required: true`, across every step
- **AND** the developer selects that field's `required` badge
- **THEN** every one of those cells' `required` key clears

#### Scenario: A bulk badge skips CEL and gated cells

- **WHEN** the developer selects a column's or row's `required` or
  `readonly` badge
- **THEN** it does not change a cell whose relevant flag carries a CEL
  expression
- **AND** it does not change a cell whose `visible` resolves to
  `false`

#### Scenario: A column with no live cell carries no bulk badge

- **WHEN** a workflow step declares no `view`
- **THEN** that step's column header carries no bulk toggle badge

#### Scenario: A bulk badge skips a cell gated by the required/readonly rule

- **WHEN** the developer selects a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`, on a field
  nothing else in the draft, guaranteed before that cell's own step,
  writes
- **THEN** the badge does not change that cell's `readonly` value

#### Scenario: A bulk badge does not skip a cell written only on a non-dominating step

- **WHEN** the developer selects a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`, and the
  field's only other editable placement is on a step reachable only
  after that cell's own step, or only via a different branch
- **THEN** the badge still skips that cell — the non-dominating
  placement does not make it eligible

#### Scenario: A technical field's row never receives a bulk required or readonly toggle

- **WHEN** the developer selects a column's `required` or `readonly`
  badge for a step where a technical field's cell is otherwise live
- **THEN** the badge does not change that cell's `required` or
  `readonly` value

#### Scenario: A technical field's row offers no required or readonly bulk badge of its own

- **WHEN** the field matrix draws the row header for a technical field
  with at least one live cell
- **THEN** that row header offers no `required` or `readonly` toggle
  badge
- **AND** it still offers the `visible` toggle badge

#### Scenario: A row already gated on every cell offers no bulk badge either

- **WHEN** every live cell for one field already carries `required:
  true`, on a field nothing else in the draft, guaranteed before each
  cell's own step, writes
- **AND** no cell's field declares `technical: true`
- **THEN** that row header offers no `required` toggle badge

#### Scenario: A column header with only one eligible badge still aligns with its column's checkboxes

- **WHEN** every one of a column's live cells is a technical field
- **AND** `visible` stays eligible there, while `required` and
  `readonly` have no eligible cell
- **THEN** that column header shows only the `visible` badge
- **AND** the `visible` badge sits in the same fixed position a
  `visible` checkbox holds in that column's cells
- **AND** the badge does not shift toward where `required` or
  `readonly` would otherwise sit

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

### Requirement: The panels screen's field matrix toolbar filters inert columns and reports coverage

This requirement covers the panels screen's field matrix only. See
"The canvas dock's Field matrix tab carries no toolbar or bulk
badges" below.

The field matrix SHALL offer a toolbar above the grid. The toolbar
SHALL carry a toggle that hides every step with no `view` at all from
the grid, when engaged. The toggle SHALL affect only the grid's
columns. It SHALL leave every row in place.

The toolbar SHALL also report one live count line. That line SHALL
state four numbers. A note entry SHALL raise neither the declared
field-entry count nor, through it, the undeclared-cell count. The one
case below is its only exception. The fourth number subtracts the
first from a grid of cells, so the two must count the same thing.

- the number of declared field entries
- the field count
- the count of steps the grid currently draws
- the number of cells among those steps that carry no entry

That case moves two of the four numbers. Where a note is the first
entry in a step that declared no `view`, that step stops being inert.
It then joins the drawn columns. `stepCount` rises by one, and
`undeclaredCells` by the whole field count.

That is one more cell than a first field entry moves it. A field entry
adds a declared entry, and the fourth number subtracts that entry back
out. A note adds none. The note itself still counts as no entry and
occupies no cell.

#### Scenario: Hiding inert columns removes steps with no view

- **WHEN** the developer engages the "Hide inert columns" toggle on a
  draft where 3 of 13 steps declare no view
- **THEN** the grid draws 10 columns, and none of them belongs to a
  step with no view

#### Scenario: The toggle leaves every row in place

- **WHEN** the developer engages the "Hide inert columns" toggle
- **THEN** the grid still draws every catalog field as a row

#### Scenario: The count line reflects the currently drawn columns

- **WHEN** a draft carries 54 field entries, 22 fields and 13 steps, of
  which 3 declare no view
- **AND** the developer engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 10 steps,
  and 166 cells the visible steps do not declare

#### Scenario: A note moves none of the four numbers

- **WHEN** a step that already declares a view in that same draft gains
  three note entries
- **THEN** the count line still reads 54 field entries and 166
  undeclared cells, because a note occupies no cell

#### Scenario: A note in a viewless step joins the drawn columns

- **WHEN** a note is the first entry in one of that same draft's 3 steps
  declaring no `view`
- **AND** the developer engages the "Hide inert columns" toggle
- **THEN** the count line reads 54 field entries, 22 fields, 11 steps, and
  188 cells the visible steps do not declare

### Requirement: The panels screen's field matrix toolbar explains its marks with a legend

This requirement covers the panels screen's field matrix only. See
"The canvas dock's Field matrix tab carries no toolbar or bulk
badges" below.

The toolbar SHALL carry a legend. The legend SHALL explain seven marks:

- a bulk badge sets the whole column or row it sits on
- a cell with no key written reads the engine's own default
- what the CEL stamp marks
- what a blank cell's dash means
- what the flagged-cell marker means
- what the technical-field row-header marker means
- which color maps to `visible`, which to `required`, and which to
  `readonly`

The seventh entry SHALL show a swatch in each of the three checkbox
colors beside that color's flag name. A swatch SHALL use the exact
color the live cells' checkboxes use for that flag. The legend defines
no separate color of its own.

#### Scenario: The legend is visible without further interaction

- **WHEN** the developer opens the field matrix
- **THEN** the toolbar's legend is visible, with no click or hover
  needed to reveal it

#### Scenario: The legend's color entry matches the grid's own colors

- **WHEN** the developer compares the legend's `visible`/`required`/
  `readonly` swatches against a live cell's checkboxes
- **THEN** each swatch's color equals that flag's checkbox color in
  the grid

### Requirement: The canvas dock's Field matrix tab carries no toolbar or bulk badges

`FieldMatrixPanel` also mounts inside the canvas dock's Field matrix
tab. `studio-canvas`'s "The dock offers three tabs, one active at a
time" requirement already covers that mount. It already states the
Field matrix tab offers no filter. It already states the dock never
grows to fit its content. This requirement restates that boundary
from the field matrix's own side, for this change's toolbar, legend
and bulk badges specifically.

The dock's Field matrix tab SHALL carry no toolbar. It SHALL carry no
inert-column toggle, no count line, no legend, and no bulk row/column
toggle badge. It SHALL draw the same grid the panels screen draws,
with these matching:

- the same live-cell controls
- the same column and row header content
- the same flagged-cell marker
- the same keyboard model

#### Scenario: The dock's Field matrix tab shows no toolbar

- **WHEN** the developer opens the canvas dock's Field matrix tab
- **THEN** it shows no toolbar, no inert-column toggle, no count line,
  and no legend

#### Scenario: The dock's Field matrix tab shows no bulk badges

- **WHEN** the developer opens the canvas dock's Field matrix tab
- **THEN** none of its column or row headers carry a bulk toggle badge

#### Scenario: The dock's Field matrix tab still edits cells inline

- **WHEN** the developer opens the canvas dock's Field matrix tab
- **THEN** each live cell still shows its own `visible`, `required`
  and `readonly` controls
- **AND** editing one still writes through `setFlag`

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

### Requirement: The field matrix's rail entry counts field entries and view findings

The panels screen's index rail SHALL show the field matrix's entity
count. That count is the total number of field entries across every
step in the draft. A live cell represents one of that same total.

A note entry SHALL count as none of them. The count answers how much a
step binds to the catalog, and a note binds to nothing. Counting one
would report a step as busier than its data says.

This is the matrix's analogue of two other counts. The Fields view
counts catalog rows. The Contract view counts outcomes.

The field matrix's issue count SHALL equal the number of open findings
carrying the `view` source over the whole draft. Those are the findings
the `studio-checks-rail` capability's rail groups under that name.
Since this change, that set holds one finding anchored on a field
rather than a cell: an unwritten technical field. The count therefore
over-reports by one per such field, with nothing to find in the grid.
The field catalog's own badge, which counts by entity type, surfaces
that finding correctly.

The count SHALL NOT come from the step entity type. A per-step view
finding shares that entity type with every other per-step issue in the
draft.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the developer opens the field matrix on a draft with 54
  field entries across its steps
- **THEN** the rail's Field matrix entry shows 54 as its entity count

#### Scenario: A note leaves the field matrix count alone

- **WHEN** a draft holds one step whose view carries two field entries
  and three notes
- **THEN** the rail's Field matrix entry shows 2 as its entity count

#### Scenario: A step holding notes alone contributes no entity count

- **WHEN** a draft holds one step whose view carries notes alone
- **THEN** that step raises the rail's Field matrix entity count by none

#### Scenario: The issue count reflects only view-source findings

- **WHEN** the draft carries one `checkViewFlags` finding and several
  unrelated issues on the same steps, from other sources
- **THEN** the rail's Field matrix entry shows an issue count of 1, not
  a count including the unrelated issues

#### Scenario: An unwritten technical field raises the matrix issue count

- **WHEN** the draft carries one unwritten-technical-field finding and
  no other `view`-source finding
- **THEN** the rail's Field matrix entry shows an issue count of 1

### Requirement: The Steps panel's configured-field count reads field entries alone

The Steps panel SHALL report how many of the catalog's fields a step's view
configures. That line reads `N / M`, where `M` is the catalog's own size.

The first number SHALL count field entries alone. A note occupies no catalog
row. Counting one would report a step as binding more of the catalog than it
does. The second number never moves for a note, because the catalog holds
none.

This count sits on the Steps panel, not in the form editor. The form editor
displays no count of its own.

#### Scenario: A note raises no configured-field count

- **WHEN** a step's view holds one field entry and three notes
- **THEN** the Steps panel reports that step's configured fields as 1

#### Scenario: A step holding notes alone reports none configured

- **WHEN** a step's view holds notes alone
- **THEN** the Steps panel reports that step's configured fields as 0

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

That rule also pins the number of sites it found. The note's text is the
tenth. A change adding a site SHALL move that literal in the same commit.
Otherwise the rule rejects a site it exists to admit.

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

- **WHEN** a site legitimately needs no warning
- **THEN** an inline comment states the reason, and the rule skips it

#### Scenario: A note's text missing the current locale draws a warning

- **WHEN** the studio's `contentLocale` is `de`, and a note's `text` carries
  the base-locale value alone
- **THEN** the note's strip shows the warning beside its text input
