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
