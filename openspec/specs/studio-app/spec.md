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
holds neither `system:developer` nor `system:templates`, the shell SHALL
render an explanatory screen. That screen SHALL state that the account lacks
studio access. The shell SHALL NOT redirect to `/login`, because the
credentials are valid. It SHALL NOT render a partly populated screen.

An account holding `system:templates` alone SHALL enter the area and reach
the templates screen only. Every other studio screen SHALL refuse it and
SHALL state which role the account lacks.

This client-side check only decides what the shell renders. Every studio route
SHALL stay gated server-side whatever the browser decides.

#### Scenario: A participant account learns why studio is empty

- **WHEN** an actor holding neither studio role logs in to studio
- **THEN** an explanatory empty state renders
- **AND** the shell renders neither the login screen nor any process or draft
  data

#### Scenario: A curator enters the area and reaches one screen

- **WHEN** an actor holding only `system:templates` logs in to studio
- **THEN** the templates screen renders
- **AND** the process list refuses and names the missing role

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

### Requirement: Editing is a canvas-primary surface with the carried-over panels as an inspector, loading and saving against the draft routes

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

The process header SHALL stay on the Structure surface, above the
editing well. It carries `baseLocale`, and this capability requires an
author to declare a non-English base locale without leaving that
surface. The shared modal SHALL NOT hold it.

Three links SHALL sit at the top of the Structure surface: Fields, Data
sources, Contract. Each SHALL open a shared modal dialog straight to
its own view. These three views cover the whole process, not one step.
The links stay reachable whether or not the author has selected a step
on the canvas.

The links SHALL belong to the Structure surface alone. The screen SHALL
NOT offer them while the JSON surface is active. All three views mutate
the draft body, and the `studio-json-view` capability requires that no
draft-body-mutating control stays reachable there.

This change touches only where the screen mounts each panel and how an
author reaches it. What each panel validates, mutates, or persists
stays the same.

Every inline missing-translation warning SHALL survive the move. Six
`LocalizedTextInput` sites carry one.

- the process label, which stays on the screen
- a step's label and description, which move into the section index's
  identity section
- a field's label and description, and a field option's label, which
  move into the modal's Fields view

Live validation SHALL remain exactly what it is today. It runs the
engine's own publish-time chain in the browser and reports issues in
place. It SHALL NOT block saving, since a work-in-progress draft is
normally invalid.

The section index SHALL carry one issue count for the selected step as
a whole. That count SHALL cover the step's own issues, and the issues of
its paths, timers and actions. Here `resolveLoc` returns the deepest
entity it finds. A guard's issue therefore names the path, not the step.
A count over the step's own id alone would read zero on such a step.

The shared modal's rail SHALL carry one issue count per view. Both
counts SHALL use the same visual tone. The rest of the studio area
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

#### Scenario: A Structure-surface link opens the shared modal

- **WHEN** the developer clicks the Fields, Data sources, or Contract
  link at the top of the Structure surface
- **THEN** the shared modal dialog opens to that view, and the canvas
  stays visible behind the dimmed backdrop

#### Scenario: A link opens the shared modal with no step selected

- **WHEN** the developer clicks one of those links before selecting any
  step on the canvas
- **THEN** the shared modal dialog still opens to that view

#### Scenario: The JSON surface renders no link into the shared modal

- **WHEN** the developer switches to the JSON surface
- **THEN** the three links are absent, and no control on screen opens
  the shared modal

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

### Requirement: The process header declares the process's base locale

The process header SHALL carry a control that reads and writes the process's
`baseLocale`. An author SHALL be able to declare a non-English base locale
without leaving the structural surface.

`baseLocale` decides which entry of every `LocalizedText` in the body is
mandatory, and publish requires it. Leaving it to the JSON surface alone made
a process authored only through the structural panels unpublishable.

The control SHALL write the typed value through, unvalidated. Live validation
reports a value that is not a well-formed locale code. That is the route
every other malformed authored value takes. The header SHALL NOT reject or
correct the keystroke.

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

- **WHEN** a draft declaring `baseLocale: "de"` is loaded into the edit screen
- **THEN** the process header's base-locale control shows `de`

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

#### Scenario: A malformed base locale reports as a validation error

- **WHEN** an author types a value into the base-locale control that is not a
  well-formed locale code
- **THEN** the draft body carries that value, and live validation reports the
  error against `baseLocale`

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

### Requirement: Studio's testable logic is extracted from its components

Following `packages/web/src/areas/app/screens/inboxLogic.ts`, the logic worth
testing SHALL live in pure modules with `bun:test` coverage — at minimum the
process-list row derivation (merging the process listing with the draft
listing) and the save/conflict state machine. React components themselves are
not required to be tested.

#### Scenario: Row derivation is tested without a DOM

- **WHEN** the process-list derivation is given a process listing and a draft
  listing
- **THEN** it returns the merged rows, and the test needs no rendering

### Requirement: The data sources panel picks a list key rather than accepting free text

For a data source of type `"db.list"`, `DataSourcesPanel` SHALL offer the
`listKey` values the server reports, rather than a free-text field. The
studio reads them through the data list read route, which its
`system:developer` role already grants.

A draft whose `"db.list"` data source names a `listKey` the server does not
report SHALL draw a warning, never a validation error. Publishing does not
read the tables, so a missing list cannot be an invariant here. The warning
matches the one for a step with no `assignment`.

#### Scenario: The panel offers the existing keys
- **WHEN** an author edits a `"db.list"` data source and the server reports
  two lists
- **THEN** the panel offers both keys as a choice

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

An entry that lacks the `baseLocale` value SHALL NOT draw this warning.
The existing base-locale `EditorIssue` already flags it. The warning
SHALL NOT draw when `contentLocale` equals `baseLocale`.

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

### Requirement: The shared editing modal keeps every change and states so

The shared modal SHALL carry two chrome bars and no more. The header
names the open view. The footer holds one Close control.

The modal SHALL carry no Save control. Every change an author makes
inside it SHALL write straight into the in-browser draft. That is how
the panels write today. The screen's own Save, Discard and Publish
toolbar SHALL remain the only thing that persists.

Close SHALL discard nothing. The footer SHALL state that plainly, so
Close never reads as a cancel.

A panel's own unsubmitted input SHALL survive a Close too. The contract
panel holds a half-typed outcome name in component state. The data
sources panel fetches its list keys on mount. The modal therefore stays
mounted for as long as the Structure surface is active. Opening it calls
`showModal()` on the already-mounted element, and Close calls `close()`.

A left rail SHALL list the three views. Each entry SHALL carry two
numbers, and they SHALL read as different things. The entity count says
how many fields, data sources or outcomes the view holds. The issue
count says how many of them are wrong. Only the issue count takes the
refusal tone. An entry SHALL surface no issue count when the view holds
no issue.

For the Fields view the rail SHALL also list the field catalogue and an
Add entry. Choosing a field SHALL scroll that field's row into view
inside the panel. The Add entry SHALL add a field, through the call the
panel's own add control makes. A group field's children indent one
level under it. Contract holds a single editor, so its rail entry SHALL
carry no sub-list.

The rail SHALL mark the open view with `aria-current`. A rail entry
switches a view rather than disclosing adjacent content, so it SHALL
NOT carry `aria-expanded`.

The rail SHALL cap indentation at two levels. A group field's children
indent once. A field nested deeper SHALL take its own top-level rail
entry rather than a deeper indent. This is a rail-rendering rule only:
the draft's own field tree SHALL keep whatever depth it declares.

#### Scenario: Closing the modal keeps every change

- **WHEN** the developer adds a field in the modal and then clicks Close
- **THEN** the draft still carries that field, and the screen's toolbar
  still reports unsaved changes

#### Scenario: Closing the modal keeps a half-typed outcome name

- **WHEN** the developer types an outcome name in the Contract view,
  clicks Close without adding it, then reopens that view
- **THEN** the typed text is still in the input

#### Scenario: The modal offers no Save of its own

- **WHEN** the developer inspects the open modal
- **THEN** it carries one Close control and no Save control, and the
  footer states that Close keeps every change

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

#### Scenario: The Fields rail adds a field

- **WHEN** the developer chooses the rail's Add entry under Fields
- **THEN** the draft carries one more field, and the rail lists it

#### Scenario: The modal keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has
  a `label` carrying the base-locale value but no `de` value
- **THEN** the modal's Fields view shows the missing-translation warning
  next to that field's label input
