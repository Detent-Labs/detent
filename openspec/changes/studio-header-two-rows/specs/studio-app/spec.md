# Delta: studio-app

## ADDED Requirements

### Requirement: The content-locale switcher stands on the Settings tab

The content-locale switcher SHALL stand on the Settings tab's Process view, under
a visible label. It SHALL stay out of the header bar. Its options keep the
per-locale gap counts.

#### Scenario: A process in one language shows no locale in the bar

- **WHEN** an author edits a draft in its base language
- **THEN** the header bar names no locale

### Requirement: The header bar says when an author edits another language

The edited content locale can differ from a well-formed base language while the
JSON surface is shut. The header bar SHALL then print one control. It SHALL name
that language in words. It SHALL open the Settings tab's Process view and hand the
focus to the Settings tab. It SHALL stay away while the two match.

#### Scenario: Another language shows in the bar

- **WHEN** an author picks `de` on the Process view of a draft whose base is `en`
- **THEN** the header bar prints a control reading "Editing German"

#### Scenario: A part-typed base language shows no note

- **WHEN** an author on an `en` draft has typed `d` into the base language
- **THEN** the header bar names no locale

#### Scenario: That control leads back

- **WHEN** an author presses that control on the Steps tab
- **THEN** the Settings tab's Process view opens with the switcher in reach

#### Scenario: That control leaves another Settings view

- **WHEN** an author presses that control on the Settings tab's Access view
- **THEN** the Process view opens and focus stands on the Settings tab

#### Scenario: The form editor leaves for Settings

- **WHEN** an author presses that control inside the form editor
- **THEN** the form editor closes and the Settings tab's Process view opens

### Requirement: The Process view's language controls use the author's words

The content-locale switcher's options SHALL read the language's name and code, as
"German (de)". A language with gaps SHALL read "German (de) — 20 missing". A code
with no name SHALL print alone. The add-a-language control SHALL carry a visible
label. A refused code SHALL read one sentence with an alert role, and the input
SHALL point at it.

#### Scenario: An option names its language

- **WHEN** a draft holds `de` with three gaps
- **THEN** the switcher offers "German (de) — 3 missing"

#### Scenario: A code with no name prints alone

- **WHEN** a draft holds a code the browser cannot name
- **THEN** the switcher offers that code with no parenthesis

#### Scenario: A refused code reads as a sentence

- **WHEN** an author adds a value that is no language code
- **THEN** a sentence with an alert role says so
- **AND** the input carries `aria-invalid` and names that sentence

## MODIFIED Requirements

### Requirement: A LocalizedText entry missing the current locale draws an inline warning

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Take the studio's currently selected `contentLocale`. Take an entry that
carries the draft's `baseLocale` value but lacks that locale's own value.
That entry SHALL draw a warning next to its `LocalizedTextInput`. The process
label is the one exception: its warning SHALL stand directly below the header bar,
so the bar keeps one row. The
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

<!-- antislop: allow synonym-rotation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
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

#### Scenario: The process label's warning stands below the bar

<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **WHEN** the edited language holds no process name
- **THEN** the warning stands directly below the header bar
- **AND** the bar keeps one row

<!-- antislop: allow synonym-rotation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
### Requirement: Leaving the edit screen with unsaved changes prompts first

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Every control that navigates away from an open draft SHALL check the dirty
state before navigating. The requirement "A layout change counts as an unsaved
change" defines that state. The check covers the header bar's back control, Test and
Versions offer, the `⋮` menu's Versions and Player entries, and the Access view's
groups link. It
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
The header bar's Publish and Discard draft controls no longer share that pattern.
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
  chooses the back control, Test, Versions or Player
- **THEN** the screen asks for confirmation before navigating

#### Scenario: An unsaved change on the studio area's top-level nav prompts first

- **WHEN** the developer has an unsaved change and chooses the
  "Processes", "Tools" or "Templates" tab in the studio area's navigation
- **THEN** the screen asks for confirmation before navigating

#### Scenario: The groups link prompts first

- **WHEN** the developer has an unsaved change and chooses "Manage assignment
  groups for this process" on the Access view
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

The dialog SHALL state the process and the draft revision it will drop. It
SHALL state that the published versions stay. It SHALL state that only the
unpublished draft goes. That last sentence is the one fact a developer
needs. The native prompt could not carry it beside the facts above.

<!-- antislop: allow synonym-rotation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
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

#### Scenario: Closing the dialog returns focus to the menu trigger

- **WHEN** the developer closes the discard dialog by any route that keeps the draft
- **THEN** focus stands on the `⋮` trigger
- **AND** focus does not drop to the document body

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
Settings. Fields holds the catalog and the field matrix as two views.
Settings holds four views: the process settings, the data sources, the
contract and the access lists. Each tab stays reachable whether or not the
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

<!-- antislop: allow trailing-negation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The header bar SHALL offer a **Publish** action (see the `studio-publish`
capability). It calls `POST /drafts/:processId/publish` against the currently
persisted draft, not the in-browser draft state. When local changes remain
unsaved, the dialog SHALL say that publishing saves them first. It must not
publish stale or ahead-of-server content. On success, the header bar SHALL state
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
- **THEN** the surface prints the issues, offers Save, and the save succeeds

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
- **THEN** the step page's paths section reads a count of one, and the
  masthead's count also reads one

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the author picks Publish in the header bar while local changes
  remain unsaved
- **THEN** the dialog says publishing saves them first, and the studio does
  not call `POST /drafts/:processId/publish` until the save completes

#### Scenario: The screen confirms a successful publish

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the header bar prints the returned version number
- **AND** the Settings tab's Developer view prints the `definitionHash`

### Requirement: The content-locale switcher renders from compiled styles

`panels/shared/ContentLocaleSwitcher.tsx` SHALL render from compiled
component styles. It SHALL read as a field under the area's field rule.

#### Scenario: The content-locale switcher keeps its look

- **WHEN** a browser renders the Process view's content-locale switcher
- **THEN** its layout, spacing, color and border come from compiled styles

### Requirement: The Fields view's definition half states values, a default and a preview

The two halves SHALL belong to the selected field alone, at any nesting
depth. A field nested inside a group SHALL take the same two halves a
top-level field takes. A group field's halves SHALL have no editor for any
of its children. Inside the halves, only the group's preview draws them.

Translation status SHALL show as a badge beside the label input. The
badge SHALL name the current locale's missing count. The field SHALL
have no separate translation-status list. Adding a language SHALL stay
draft-scoped in the Process view's add-a-language control.

"How it will look" SHALL sit in the definition half, inside a collapsed
`<details>` disclosure. It SHALL start closed. The developer view SHALL
keep its own existing, separate `<details>` disclosure, untouched by
this change.

<!-- antislop: allow synonym-rotation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
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

<!-- antislop: allow negation-habit sentence-length -->
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

<!-- antislop: allow paragraph-length sentence-length -->
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
  switcher already names `de` once, on the Settings tab

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
