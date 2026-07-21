## ADDED Requirements

### Requirement: outputMapping and guard references to child.data lie within the child's declared outputs

Publishing a process SHALL reject it when a subprocess step's `outputMapping`
value expression, or one of the step's automatic-path guard expressions,
references `child.data.<key>` for a `<key>` that is not present in the referenced
child's `contract.outputFields` (resolved to the child field's `key`, the same way
every CEL site addresses a field). The check resolves the child body via the
definition store — the same resolution the `inputMapping` check already performs
for the step — and types `child.data` against a schema built from
`contract.outputFields` instead of accepting any key. An absent or empty
`contract.outputFields` means no key is valid, so any `child.data.<key>` reference
on that step is rejected. `child.outcome` is unaffected: it remains typed `string`
regardless of `contract.outcomes`.

This closes the same class of gap the CEL check/eval scope drift for declared data
sources closed: a declared surface (`contract.outputFields`) that the CEL type
checker did not enforce, letting a parent silently depend on a child's
non-contracted internal field.

#### Scenario: An outputMapping reference to an uncontracted child field is rejected
- **WHEN** a subprocess step's `outputMapping` value expression references
  `child.data.<key>` for a child field whose id is not in the referenced child's
  `contract.outputFields`
- **THEN** publishing the parent fails with a CEL validation error naming the
  offending expression, and no parent version is persisted

#### Scenario: An automatic-path guard reference to an uncontracted child field is rejected
- **WHEN** a subprocess step's automatic-path guard references `child.data.<key>`
  for a child field whose id is not in the referenced child's
  `contract.outputFields`
- **THEN** publishing the parent fails with a CEL validation error naming the
  offending guard expression

#### Scenario: References confined to declared output fields publish normally
- **WHEN** every `child.data.<key>` reference in a subprocess step's `outputMapping`
  and guards names a key whose field id is in the referenced child's
  `contract.outputFields`
- **THEN** the process publishes normally (subject to the existing inputMapping and
  resolvability checks)

#### Scenario: A child with no declared outputFields rejects every child.data reference
- **WHEN** a subprocess step references a child whose `contract.outputFields` is
  absent or empty, and the step's `outputMapping` or a guard references
  `child.data.<key>` for any key
- **THEN** publishing the parent fails, naming the offending expression

#### Scenario: child.outcome references are unaffected
- **WHEN** a subprocess step's guard or `outputMapping` references `child.outcome`
- **THEN** the reference type-checks regardless of the referenced child's
  `contract.outputFields`, exactly as before this change
