## ADDED Requirements

### Requirement: The process header bar carries the process-wide collaboration defaults

The process header bar SHALL carry two checkboxes, labeled Comment and
Attachments, bound to the draft's own `collaboration.comments` and
`collaboration.attachments`. Checking or unchecking either SHALL update
the draft body at once. Neither checkbox stands among the header bar's
three right-aligned controls (Save, Discard draft, Publish); both stand
distinct from them.

#### Scenario: Unchecking a default disables it process-wide

- **WHEN** an author unchecks the Attachments checkbox in the process
  header bar
- **THEN** the draft sets `collaboration.attachments` to `false`

#### Scenario: A step with no override still shows the process default

- **WHEN** an author checks the process header bar's Comment checkbox, and no
  step declares its own `collaboration.comments` override
- **THEN** every such step resolves `collaboration.comments` to `true`
