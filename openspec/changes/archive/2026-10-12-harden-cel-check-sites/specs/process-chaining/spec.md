## ADDED Requirements

### Requirement: A process.start mapping value is a checked CEL site

Publish SHALL parse and type-check every CEL value of a `process.start`
action's `config.inputMapping` against the acting process's field catalog. The
scope is `data`, `instance` and `actor`, with neither `result` nor `child`. The
time-function ban, the structure bounds and the length bound apply as at any
other site. The CEL checks run on the publish path. The length bound runs in the
compile pass.

#### Scenario: Publish rejects an unknown field reference in a mapping value

- **WHEN** a `process.start` mapping value reads `data.missing`, and the acting process declares no field with that key
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the unknown reference

#### Scenario: Publish rejects a time function in a mapping value

- **WHEN** a `process.start` mapping value calls `timestamp()`
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the time function

#### Scenario: Publish rejects three nested comprehensions in a mapping value

- **WHEN** a `process.start` mapping value reads `data.items.all(a, data.items.all(b, data.items.all(c, a == b && b == c)))`
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the comprehension nesting limit

#### Scenario: Publish rejects a namespace the delivery does not supply

- **WHEN** a `process.start` mapping value reads `result` or `child.outcome`
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the unknown reference

#### Scenario: Publish rejects an over-long mapping value

- **WHEN** a `process.start` mapping value has a source longer than the expression length bound
- **THEN** publish fails with a located issue naming the bound

#### Scenario: A well-typed mapping value passes

- **WHEN** a `process.start` mapping value reads `data.amount * 2.0`, and `amount` is a `number` field
- **THEN** authoring-time validation accepts it, whatever type the value infers to

#### Scenario: Publish reads no other plugin config for CEL

- **WHEN** an action of another type holds a CEL-shaped object in its `config`
- **THEN** publish reports no CEL issue for it

#### Scenario: The studio shows the issue before publish

- **WHEN** the studio validates a draft whose `process.start` mapping value reads `timestamp()`
- **THEN** the checks rail lists a CEL issue for that mapping entry
