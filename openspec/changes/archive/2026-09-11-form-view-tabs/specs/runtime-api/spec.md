## ADDED Requirements

### Requirement: A resolved view carries the step's tabs and each entry's tab

`InstanceView` SHALL also carry `tabs`: the current step's `view.tabs`, in
the order the body declares them, or an empty array when the view declares
none. Each member SHALL carry the `key` and the `LocalizedText` `label` the
body declares. Resolution SHALL leave the label unresolved, the way it leaves
a note's `text`. The caller then resolves it for its own locale.

`tabs` SHALL report regardless of `status`. That matches `columns`, which
describes the step's declared layout rather than instance state.

A resolved entry of either kind SHALL carry `tab`: the matching entry's own
`tab`, or `undefined` when it declares none. That mirrors how `group` already
resolves.

Resolution SHALL apply no tab-aware filtering. Every rule that decides
whether an entry appears keeps deciding it. Resolution omits a field
resolving invisible, whether or not its tab holds other visible entries. A tab left with
no visible entry still appears in `tabs`, and the renderer decides what to
draw. The `form-ui` capability owns that decision.

The editable and required field sets SHALL ignore `tab` entirely. A required
field stays required on every tab. Submission SHALL accept a value for a
field on any tab. A tab is layout, and it reaches no submission check.

#### Scenario: A view declaring no tabs resolves an empty list

- **WHEN** a step's view declares no `tabs`
- **THEN** `InstanceView.tabs` is an empty array, and every resolved entry's
  `tab` is `undefined`

#### Scenario: A tabbed view resolves its tabs in declaration order

- **WHEN** a step's view declares tabs `details` then `handover`
- **THEN** `InstanceView.tabs` holds those two members in that order, each
  carrying its authored `LocalizedText` label

#### Scenario: A resolved entry reports its own tab

- **WHEN** a view entry declares `tab: "handover"` and resolves visible
- **THEN** its resolved entry carries `tab: "handover"`

#### Scenario: A hidden field on a tab drops out as it does today

- **WHEN** a field entry on a tab resolves `visible: false`
- **THEN** `fields` omits it entirely, exactly as on an untabbed view

#### Scenario: A tab whose entries all resolve invisible still reports

- **WHEN** every entry naming one tab resolves invisible
- **THEN** that tab still appears in `InstanceView.tabs`, and `fields` holds
  none of its entries

#### Scenario: A required field on an unopened tab stays required

- **WHEN** a submission omits a required field whose entry names the second
  tab
- **THEN** the submission fails the required check, the same way it does on
  an untabbed view
