# Spec Delta

## ADDED Requirements

### Requirement: A null value in a submission clears the field

In `submitAndTransition`, a submitted `null` SHALL mean the participant cleared that field.
The engine SHALL remove the key from the committed `data`, so the field behaves as never written.
The key still meets the field-set rule of the submit requirement.
A `null` for an unknown key or a `readonly` field draws `unknown-field` or `readonly-field`, as any value would.

#### Scenario: A cleared optional number leaves the data

- **WHEN** an optional `number` field holds 120 and a submission carries `null` for it
- **THEN** the committed `data` has no key for that field

#### Scenario: A null for a readonly field draws a refusal

- **WHEN** a submission carries `null` for a field the step marks `readonly`
- **THEN** the result carries a `readonly-field` issue for that field
- **AND** the instance keeps its stored value

#### Scenario: The audit log records the removal

- **WHEN** a submission clears a field that held a value
- **THEN** the instance audit log gains a `set` entry for that field whose value is a JSON null

### Requirement: A cleared key meets no value check

A cleared key SHALL meet no type, option, constraint or rule check, since it has no value to judge.
The merged data that a `validation.rule`, the required check and the path guard read SHALL omit the key.
A guard that reads a removed field raises, and a raising guard means no match.

#### Scenario: A cleared optional date skips the format check

- **WHEN** a submission carries `null` for an optional `{type: "string", format: "date"}` field
- **THEN** the submission raises no `type-mismatch` issue for that field
- **AND** the committed `data` has no key for it

#### Scenario: A cleared select skips the option check

- **WHEN** a submission carries `null` for an optional field with static `options`
- **THEN** the submission raises no `invalid-option` issue for that field

#### Scenario: A guard reads a cleared field as unwritten

- **WHEN** a submission clears a field and the path guard reads `data.<key>` for it
- **THEN** the guard raises, and the engine refuses the path

### Requirement: A creation seed does not read null as a clear

`createProcessInstance` SHALL NOT read `null` in its `opts.data` seed as a clear.
A `null` there meets the type check as before.

#### Scenario: A null seed fails the type check

- **WHEN** `createProcessInstance` receives `null` for a `string` field in `opts.data`
- **THEN** creation fails with a `type-mismatch` issue for that field

### Requirement: A blank value counts as missing for the required check

The required check of the submit requirement SHALL treat a field as missing when its merged value is
`undefined`, `null` or the empty string `""`.
The word "defined" in that requirement carries this meaning.
A stored `""` counts as missing the way a submitted one does.
The check SHALL NOT treat `0`, `false` or an empty array as missing, because each is a value a participant entered.

#### Scenario: An erased required text field fails

- **WHEN** a visible-and-required `string` field has `""` in the merged data at a submission
- **THEN** the result carries a `required-missing` issue for that field

#### Scenario: A cleared required field fails

- **WHEN** a submission carries `null` for a visible-and-required field
- **THEN** the result carries a `required-missing` issue for that field

#### Scenario: Zero and false satisfy the check

- **WHEN** a visible-and-required `number` field has `0` and a `boolean` field has `false`
- **THEN** the result has no `required-missing` issue for either
