# cross-process-validation

## Purpose

Defines the publish-time enforcement that a `subprocess` step's wiring is valid
against the child process it calls. A subprocess step references a child by
`processId` + `versionBinding` and maps parent data into the child's inputs; these
checks resolve the referenced child via the definition store and reject the publish
when the reference does not resolve to a contracted child, or when an `inputMapping`
target lies outside the child's declared inputs. Failing at publish keeps the error
close to the author instead of surfacing as a runtime spawn dead-letter, and makes
child-first publish ordering a hard requirement.

## Requirements

### Requirement: inputMapping targets lie within the child's declared inputs

Publishing a process SHALL reject it when any subprocess step's `inputMapping`
target key is not present in the referenced child's `contract.inputFields`. The
check resolves the child body via the definition store; the rejection is a
publish-time error, not a runtime failure.

#### Scenario: An out-of-contract inputMapping target is rejected at publish
- **WHEN** a process with a subprocess step maps a value to a child field id that is not in the child's `contract.inputFields`
- **THEN** publishing that process fails with a cross-process validation error naming the offending field, and no version is persisted

#### Scenario: inputMapping targeting only declared input fields publishes
- **WHEN** every `inputMapping` target of every subprocess step is in the referenced child's `contract.inputFields`
- **THEN** the process publishes normally

### Requirement: The child reference must resolve to a contracted child (child-first ordering)

Publishing a process with a subprocess step SHALL resolve the referenced child and
reject the publish when it cannot: a `pinned` binding whose `pinnedVersion` is not
a published version of the child process, or a `latest-at-spawn` binding whose
`contractRef` matches no published child contract signature. A resolved child that
declares no `contract` is likewise rejected — there is no declared input set to
validate the wiring against. A parent MAY therefore be published only after the
contracted child version it references exists.

#### Scenario: A pinned reference to an unpublished child version is rejected
- **WHEN** a subprocess step pins a child `pinnedVersion` that has not been published
- **THEN** publishing the parent fails with a cross-process validation error, and no parent version is persisted

#### Scenario: A latest-at-spawn reference matching no published contract is rejected
- **WHEN** a subprocess step binds `latest-at-spawn` with a `contractRef` that equals no published child version's contract signature
- **THEN** publishing the parent fails with a cross-process validation error

#### Scenario: A reference to a non-contracted child is rejected
- **WHEN** a subprocess step resolves to a published child version that declares no `contract`
- **THEN** publishing the parent fails with a cross-process validation error

#### Scenario: Publishing the child first lets the parent validate
- **WHEN** the contracted child version is published, then the parent referencing it is published
- **THEN** the child resolves and the parent publishes (subject to the inputMapping check)

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
