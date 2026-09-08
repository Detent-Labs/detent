## MODIFIED Requirements

### Requirement: A process-identity header bar shows draft and publish status

The process surface SHALL carry a header bar above the tab row. The bar SHALL
print the process name and the key in the mono face. It SHALL carry the
draft's revision badge and dirty state. It SHALL carry the version and hash
after a publish. `EditorArea` computes all of these as controlled props. It
already lifts `saveState` the same way.

The header bar SHALL carry a last-saved time. That time is client-only state.
`EditorArea` sets it on every successful save.

The header bar SHALL carry the content-locale badge the `studio-app`
capability's content-locale-switcher requirement governs. It SHALL have no
Structure control and no JSON control of its own. That pair no longer stands.
The JSON surface opens from this same bar's `⋮` menu instead, per
`studio-process-tabs`.

<!-- Why: "Discard draft" below is the literal button label `DraftToolbar` renders, not a synonym choice against "remove" elsewhere in this file. -->
<!-- antislop: allow synonym-rotation -->
The header bar SHALL carry a `⋮` overflow menu. The menu SHALL have no Save,
no Discard draft and no Publish action. The studio's area nav carries those
three. `DraftToolbar` SHALL keep computing when each action is available and
what each one does. The area nav calls that logic and holds none of its own.

The menu SHALL hold its remaining controls under two headings. The first,
"Process, saved with the draft", SHALL hold the editable process key, the
base-locale control and the add-locale control. The `studio-app` capability's
base-locale requirement governs the second of those three. The add-locale
control keeps the behavior it carries today, and no capability declares it
yet. The
first heading SHALL NOT offer an action-registry selector or any other
session-only control. Nothing in the studio ever loads a live `Registry` a
registry-resolution check could run against.

That first heading SHALL also hold a "Manage assignment groups for this
process" link. The link SHALL open the admin area's Groups screen: the
`admin-app` capability's `/groups` route.

<!-- Why: "parameter" below names a URL query parameter, not a synonym choice against the performed-by control's own entries. -->
<!-- antislop: allow synonym-rotation -->
It SHALL carry the open process's id as a query parameter. That parameter
pre-filters the Groups screen to global groups plus groups already scoped to
this process.

The link SHALL appear once a process is open, for any signed-in actor. It
SHALL appear whether or not that actor holds `system:admin`. It SHALL appear
whatever tab the row holds open.

Following it without `system:admin` SHALL lead to one of two outcomes. The
same admin-area-entry gate every other admin route already crosses decides
which (`shell/areas.ts::mayEnter`). An actor can hold `system:datalists`, or
another role `mayEnter` accepts for the admin area, without holding
`system:admin`. That actor SHALL reach the admin area's own `MissingRole`
empty state. That is the state any `system:admin`-gated route gives a caller
without the role.

An actor who has no admin-area-entry role at all SHALL never reach the admin
area's own code. The shell blocks entry before `AdminArea` mounts, and gives
its generic `area.forbidden` message instead.

The link SHALL have no group data of its own. It SHALL trigger no request to
a `/admin/groups*` route: it is navigation only, so Studio duplicates no group
CRUD.

The menu's second heading, "Views", SHALL hold navigation to other views of
this process. `studio-process-tabs` states that heading's own contents.

The header bar's summary fields SHALL stay a read-only pass-through of state
`EditorArea` owns. Those fields are the process name, the revision badge, the
dirty state, and the published version and hash. None of them carries logic of
its own.

#### Scenario: The header bar shows an unsaved draft's state

- **WHEN** the draft carries unsaved changes
- **THEN** the header bar prints the process name, the draft's revision badge,
  and a dirty indicator

#### Scenario: The header bar shows a just-published version

- **WHEN** a publish succeeds
- **THEN** the header bar prints the published version and its hash prefix

#### Scenario: The overflow menu invokes DraftToolbar's own save

- **WHEN** an author looks for Save in the `⋮` menu
- **THEN** the menu holds none
- **AND** the studio's area nav carries the Save control, which calls
  `DraftToolbar`'s existing save

#### Scenario: The overflow menu separates persisted settings from session-only settings

- **WHEN** an author opens the `⋮` menu
- **THEN** the process key, the base-locale control and the add-locale control
  stand under "Process, saved with the draft"
- **AND** no action-registry selector and no other session-only control stands
  anywhere in the menu

#### Scenario: The menu links to Groups filtered to the open process

- **WHEN** an author opens the `⋮` menu and picks "Manage assignment groups
  for this process"
- **THEN** the admin area's Groups screen opens, holding global groups plus
  groups already scoped to the open process

#### Scenario: Following the link with admin-area entry but not the admin role

- **WHEN** an actor who holds `system:datalists` but lacks `system:admin`
  follows the link
- **THEN** the admin area gives its own `MissingRole` empty state instead of
  the Groups screen

#### Scenario: Following the link with no admin-area-entry role at all

- **WHEN** an actor who holds neither `system:admin` nor `system:datalists`
  follows the link
- **THEN** the shell blocks entry to the admin area before it mounts
- **AND** it gives the generic `area.forbidden` message instead of the Groups
  screen

#### Scenario: The link renders regardless of the open surface

- **WHEN** an author holds the Paths tab open rather than the Canvas tab
- **THEN** the "Manage assignment groups for this process" link still stands
  in the `⋮` menu
