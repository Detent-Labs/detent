<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

### Requirement: The engine writes mapped column attributes into data

The Runtime API Layer SHALL apply a field's `columnMapping` on
`submitAndTransition` and on `createProcessInstance`. It SHALL apply it only to
a field the request writes. A field the request leaves alone keeps whatever
`data` already holds for its targets.

For each such field the engine SHALL:

1. Find the resolved option whose `value` equals the submitted value. It uses
   the option list it already resolved for submission validation, so the read
   costs nothing extra.
2. Read each `columnMapping` key from that option's `attributes`.
3. Check the value against the target field's declared type, by the same rule a
   participant's own submission faces.
4. Write a matching value into `data`, and drop a mismatching one.

The write SHALL land before the transition commits. A guard on the same hop
therefore reads the written value. That is what makes `data.price > 10` legal
on the path out of the step that carries the picker.

A mapped target SHALL take the mapped value even when the request also carries
a value for that target. The list owns a mapped field, and one deterministic
rule beats a merge order nobody can predict.

The engine SHALL write a mapped target whatever its view says. A readonly
target still takes the value, and so does one the view never shows. The mapping
is authored, not participant input. The view's rules for what a participant may
edit therefore do not govern it.

The engine SHALL walk the step's view order, which is the order
`ResolvedViewField[]` already carries. It SHALL NOT walk the request's own key
order, which whoever posted it controls. A request writing two pickers
therefore resolves the same way twice.

At creation the write-back SHALL run before the initial step's assignment
resolves. A strategy on that step therefore reads the final data, mapped values
included.

#### Scenario: Picking a row writes the mapped fields
- **WHEN** a participant submits a `select` field whose picked option carries
  `attributes.price` and whose `columnMapping` sends `price` to a number field
- **THEN** that number field holds the attribute's value after the commit

#### Scenario: A guard on the same hop reads the written value
- **WHEN** the path out of that step carries a guard reading the mapped field
- **THEN** the guard evaluates against the written value, not the previous one

#### Scenario: The mapped value beats a submitted one
- **WHEN** one request carries both the picker and a value for a mapped target
- **THEN** the mapped target holds the attribute's value

#### Scenario: A readonly target still takes the value
- **WHEN** the step's view marks the mapped target readonly
- **THEN** the target takes the mapped value, and no `readonly-field` issue is
  raised for it

#### Scenario: An unmapped column writes nothing
- **WHEN** a `columnMapping` key names a column the bound list does not declare
- **THEN** nothing is written for that key, and the submission succeeds

#### Scenario: An unfilled attribute writes nothing
- **WHEN** the picked option carries no attribute for a mapped column
- **THEN** nothing is written for that key, and the submission succeeds

#### Scenario: A field the request omits keeps its targets
- **WHEN** a request writes no value for a mapping field
- **THEN** the mapped targets keep whatever `data` already holds

#### Scenario: Two pickers resolve in view order
- **WHEN** one request writes two mapping fields, and the request's key order
  differs from the step's view order
- **THEN** the engine applies them in view order

#### Scenario: An initial step's assignment reads the mapped data
- **WHEN** an instance is created at a step whose assignment strategy reads a
  mapped field
- **THEN** the strategy resolves against the written value

#### Scenario: Creation applies the mapping too
- **WHEN** an actor creates an instance whose start step carries a mapping
  field, and the creation data names an option
- **THEN** the mapped targets hold the option's attributes on the created
  instance

### Requirement: A type-mismatching attribute is dropped and recorded

The engine SHALL drop a mapped attribute whose value does not match its target
field's declared type. It SHALL NOT write it, and it SHALL NOT fail the
submission.

The drop SHALL record a `datasource.attribute-dropped` event, in the same
transaction as the commit. `runtime-events` owns that kind.

Failing the submission is the wrong answer. The mismatch comes from operator
data, and the participant can do nothing about it. The rule follows the one
`Action.output` already sets. The side effect stands, the mismatching entry
does not land, and the record names it.

#### Scenario: A mistyped attribute is dropped
- **WHEN** the picked option carries a string attribute and its target field
  declares `number`
- **THEN** the target keeps its previous value and the submission succeeds

#### Scenario: The drop is recorded
- **WHEN** a mapped attribute is dropped
- **THEN** the instance carries a `datasource.attribute-dropped` event naming
  the mapping field, the column and the target

#### Scenario: One drop does not stop the others
- **WHEN** one mapped attribute mismatches and another matches
- **THEN** the matching one is written and only the mismatching one is recorded
