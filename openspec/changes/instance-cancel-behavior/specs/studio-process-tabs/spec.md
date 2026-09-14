## ADDED Requirements

### Requirement: The draft-settings menu group carries the process-wide cancellable toggle

The header bar's `⋮` menu's "Process, saved with the draft" group SHALL carry
a control that sets `ProcessBody.cancellable`. That sits alongside its
existing `key` and `baseLocale` rows. Like those two rows, the control SHALL
mutate the draft body directly. It SHALL also be `disabled` while the JSON surface is
active (`structureActive` false), never unmounted. That matches how that
group's existing rows behave.

Unlike the step-level override, the control SHALL be a plain two-state
checkbox, offering only checked or unchecked. Here, `ProcessBody.cancellable` sits at the
root of the inheritance chain. No parent default exists there for a third
"inherit" state to name. A checked box SHALL write `cancellable: true`; an
unchecked box SHALL write `cancellable: false`. The draft's own current value
SHALL determine the box's checked state, defaulting to checked when the key is
absent.

#### Scenario: Setting the process to not cancellable

- **WHEN** an author unchecks the draft-settings group's cancellable checkbox
- **THEN** the draft's `ProcessBody` carries `cancellable: false`

#### Scenario: An unset process shows the checkbox checked

- **WHEN** the draft's `ProcessBody` has no `cancellable` key
- **THEN** the checkbox renders checked

#### Scenario: The active JSON surface disables the control

- **WHEN** the JSON surface is the active surface
- **THEN** the cancellable control renders disabled rather than unmounted,
  matching the `key` and `baseLocale` rows beside it
