## ADDED Requirements

### Requirement: The first process choice on a subprocess step writes a whole spec

A new subprocess step has no `subprocess` spec. An author may pick a process
in "Which process it calls" on such a step. The step page SHALL then write a
complete spec in one edit. The spec SHALL hold the chosen `processId` and
`versionBinding: "pinned"`. It SHALL hold the chosen process's newest version
as `pinnedVersion`, and an empty `inputMapping` and `outputMapping`.

A step that already has a spec keeps its binding and its mappings when the
author picks another process. Only `processId` changes. A pinned binding also
takes the newest version of the new process as `pinnedVersion`.

A step with no spec SHALL show the process select alone. It SHALL show no
binding select, no version field and no mapping editor. The draft therefore
never reads "pinned" while the stored body lacks it.

#### Scenario: Choosing a process on a new subprocess step

- **WHEN** an author picks the process "Credit check", whose newest version is
  3, on a subprocess step with no spec
- **THEN** the step has that `processId`, `versionBinding` `pinned`,
  `pinnedVersion` 3, `inputMapping` `{}` and `outputMapping` `{}`
- **AND** the Checks tab reports no Zod "Required" issue for the spec

#### Scenario: Choosing another process on a step with a spec

- **WHEN** an author picks a different process on a subprocess step whose
  binding is `latest-at-spawn` with a `contractRef`
- **THEN** the step keeps `versionBinding`, `contractRef` and both mappings
- **AND** only `processId` changes

#### Scenario: A step with no spec shows the process select alone

- **WHEN** the step page shows a subprocess step with no `subprocess` spec
- **THEN** "Which process it calls" shows the process select
- **AND** it shows no binding select, no version field and no mapping editor

### Requirement: The inputMapping editor offers the child's input fields as keys

The `inputMapping` editor in "Which process it calls" SHALL offer the called
process's `contract.inputFields` as its keys. It SHALL offer none of the
calling process's own fields. Each option SHALL print the child field's `key`
and store the child field's `id`.

The step page SHALL read the child's contract from the body of the version the
binding names. A `pinned` binding names its `pinnedVersion`. A
`latest-at-spawn` binding names the newest version in the process list. The
page SHALL read once per process and version, through the studio's existing
version-body route.

"+ add" SHALL pick the first child input field that no row holds. It SHALL
stay disabled while the list is empty, exhausted, loading or failed. While the
read loads or after it fails, a one-line note SHALL say so. A child with no
`contract` or no `inputFields` SHALL get a note that it declares no input
fields.

The editor SHALL keep every stored key as stored. A stored key that the child
does not list SHALL appear as its own marked option. The select therefore
never shows another key than the stored one. The author may remove that row or
pick a listed key for it. The `outputMapping` editor keeps the calling
process's fields as targets.

#### Scenario: A pinned binding lists the child's input fields

- **WHEN** a subprocess step calls "Credit check" pinned at version 2, and
  version 2 declares `contract.inputFields` of `amount` and `applicant`
- **THEN** the `inputMapping` select offers `amount` and `applicant`
- **AND** the select offers no field of the calling process

#### Scenario: A latest-at-spawn binding reads the newest version

- **WHEN** a subprocess step calls "Credit check" with `latest-at-spawn` and
  the process list names version 5 as the newest
- **THEN** the editor reads the contract of version 5

#### Scenario: Opening a valid mapping shows the stored key

- **WHEN** an author opens a step whose `inputMapping` maps the child field
  `amount`, and the child lists it
- **THEN** the row's select shows `amount`
- **AND** the stored key stays as it was

#### Scenario: The read fails

- **WHEN** the child's version body fails to load
- **THEN** "+ add" stays disabled
- **AND** a note says the child's input fields could not load
- **AND** every stored `inputMapping` row stays as stored

#### Scenario: A stored key the child no longer lists

- **WHEN** a row has a key that the child's contract does not list
- **THEN** the row's select shows a marked option for that key
- **AND** the row stays until the author changes or removes it

### Requirement: A kind switch confirms before it removes keys

The step's "performed by" control SHALL remove the keys a new kind cannot
carry. It SHALL confirm first when the step has any of them. The keys per
target kind are:

- A task step (the "participant" option) cannot carry `subprocess` or
  `outcome`.
- A subprocess step cannot carry `outcome`.
- An end step cannot carry `subprocess`, `paths`, `timers`, `onExit`,
  `onCancel` or `cancellable`.

A switch that removes nothing SHALL apply at once, with no dialog. A switch
that removes something SHALL open a modal dialog first. The dialog SHALL name
the target kind and count what it removes, one fact row per kind of key. A
count is the number of entries, or 1 for a single key. The dialog SHALL show
no step content and SHALL state that the studio has no undo.

Cancel SHALL hold the initial focus. The confirming control SHALL stay outlined.
It SHALL remove the keys and switch the kind in one edit. Cancel, Escape or a
confirm SHALL return focus to the control that opened the dialog. A decline
leaves the step as it was.

#### Scenario: A subprocess step switches to a task step

- **WHEN** an author presses the task option on a subprocess step that has a
  `subprocess` spec
- **THEN** a dialog opens that counts one subprocess call
- **AND** the step stays as it was until the author confirms

#### Scenario: Confirming removes the spec

- **WHEN** the author confirms that dialog
- **THEN** the step has `type` `task` and no `subprocess` key
- **AND** the Checks tab stops reporting "only a subprocess step may declare a
  subprocess spec"

#### Scenario: A task step with paths switches to an end

- **WHEN** an author presses the end option on a task step with three paths,
  one timer and one `onExit` action
- **THEN** the dialog counts three paths, one time limit and one exit action
- **AND** a decline leaves all of them in place

#### Scenario: A switch that removes nothing skips the dialog

- **WHEN** an author presses the end option on a task step
- **AND** the step has no paths, timers, exit actions, cancel actions or
  `cancellable` key
- **THEN** the step becomes an end step at once
- **AND** no dialog opens

#### Scenario: Cancel holds the focus

- **WHEN** the dialog opens
- **THEN** keyboard focus stands on Cancel
- **AND** Enter on the open dialog declines

### Requirement: An emptied outcome field writes no outcome

The "How the case ends" outcome text field SHALL write no `outcome` key when
the author empties it. The field shows where the process declares no
`contract.outcomes`. An empty string would stay on the step after a later kind
switch and trip the publish check that restricts `outcome` to an end step.

#### Scenario: Emptying the outcome text

- **WHEN** an author clears the outcome text on an end step
- **THEN** the step has no `outcome` key
