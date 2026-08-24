## MODIFIED Requirements

### Requirement: A process-identity header bar shows draft and publish status

The canvas edit screen SHALL show a header bar above the three-column
layout. It SHALL show the process name and the key in the mono face.
It SHALL also show the draft's revision badge and dirty state. It SHALL
show the version and hash after a publish. `EditorArea` computes all of
these as controlled props. It already lifts `saveState` the same way.

The header bar SHALL also show a last-saved time. That time is
client-only state. `EditorArea` sets it on every successful save.

The header bar SHALL show the content-locale badge the `studio-app`
capability's content-locale-switcher requirement governs. It SHALL also
show the Structure/JSON toggle.

<!-- antislop: allow synonym-rotation -->
<!-- "Discard" below is the literal button label `DraftToolbar` renders, not a synonym choice against "remove" elsewhere in this file. -->
The header bar SHALL show a `⋮` overflow menu. The menu SHALL hold
`DraftToolbar`'s Save, Discard draft, and Publish actions.
`DraftToolbar` SHALL keep computing when each action is available and
what each one does. The menu calls that logic. The menu holds no save,
discard, or publish logic of its own.

The menu SHALL show its remaining controls under one heading: "Process,
saved with the draft". That heading SHALL hold the editable process key
and the base-locale control the `studio-app` capability's base-locale
requirement governs. The menu SHALL NOT offer an action-registry
selector or any other session-only control. Nothing in the studio ever
loads a live `Registry` a registry-resolution check could run against.
The menu therefore holds nothing session-only.

That heading SHALL also hold a "Manage assignment groups for this
process" link. The
link SHALL open the admin area's Groups screen: the `admin-app`
capability's `/groups` route. It SHALL carry the open process's id as a
query parameter. That parameter pre-filters the Groups screen to global
groups plus groups already scoped to this process.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" below names the UI glossary term (structure surface / JSON surface), not a synonym for "show". -->
The link SHALL appear once a process is open, for any signed-in actor.
It SHALL appear whether or not that actor holds `system:admin`. It SHALL
appear whether the structure surface or the JSON surface is active.

Following it without `system:admin` SHALL lead to one of two outcomes.
The same admin-area-entry gate every other admin route already crosses
decides which (`shell/areas.ts::mayEnter`). An actor may hold
`system:datalists`, or another role `mayEnter` accepts for the admin
area, without holding `system:admin`. That actor SHALL see the admin
area's own `MissingRole` empty state. That is the same state any
`system:admin`-gated route shows a caller without the role.

An actor who holds no admin-area-entry role at all SHALL never reach the
admin area's own code. The shell blocks entry before `AdminArea` mounts,
and shows its generic `area.forbidden` message instead.

The link SHALL carry no group data of its own. It SHALL trigger no
request to a `/admin/groups*` route: it is navigation only, so Studio
duplicates no group CRUD.

The header bar's summary fields SHALL stay a read-only pass-through of
state `EditorArea` owns. Those fields are the process name, the revision
badge, the dirty state, and the published version and hash. None of
them carries logic of its own.

#### Scenario: The header bar shows an unsaved draft's state

- **WHEN** the draft has unsaved changes
- **THEN** the header bar shows the process name, the draft's revision
  badge, and a dirty indicator

#### Scenario: The header bar shows a just-published version

- **WHEN** a publish succeeds
- **THEN** the header bar shows the published version and its hash
  prefix

#### Scenario: The overflow menu invokes DraftToolbar's own save

- **WHEN** the developer chooses Save from the `⋮` menu
- **THEN** the draft saves through `DraftToolbar`'s existing save call

#### Scenario: The overflow menu separates persisted settings from session-only settings

- **WHEN** the developer opens the `⋮` menu
- **THEN** the key and base-locale control appear under "Process, saved
  with the draft"
- **AND** no action-registry selector and no other session-only control
  appears anywhere in the menu

#### Scenario: The menu links to Groups filtered to the open process

- **WHEN** the developer opens the `⋮` menu and selects "Manage
  assignment groups for this process"
- **THEN** the admin area's Groups screen opens, showing global groups plus
  groups already scoped to the open process

#### Scenario: Following the link with admin-area entry but not the admin role

- **WHEN** an actor who holds `system:datalists` but lacks `system:admin`
  follows the link
- **THEN** the admin area shows its own `MissingRole` empty state instead
  of the Groups screen

#### Scenario: Following the link with no admin-area-entry role at all

- **WHEN** an actor who holds neither `system:admin` nor `system:datalists`
  follows the link
- **THEN** the shell blocks entry to the admin area before it mounts
- **AND** it shows the generic `area.forbidden` message instead of the
  Groups screen

#### Scenario: The link renders regardless of the open surface

- **WHEN** the developer has the JSON surface active, not the structure
  surface
- **THEN** the "Manage assignment groups for this process" link still
  appears in the `⋮` menu
