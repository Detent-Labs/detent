## ADDED Requirements

### Requirement: An author may declare a field redactable, eligible for future erasure of its historical values

`FieldDef` SHALL gain an optional `redactable: boolean`. It is a pure
authoring-time signal, read only by the instance audit log's redaction
path (`instance-audit-log`). It carries no runtime behavior of its own. It
changes no CEL type-check, no view resolution, and no other publish-time
rule.

A field declaring `redactable: true` on a `group` field type SHALL fail
the publish. A group holds fields, not a value of its own. Redacting it
is meaningless, for the same reason `technical` already excludes `group`.

`redactable` SHALL place no restriction on `technical`. A field may
declare both, or either alone. A `technical` field's value is
engine-written, not participant-written. It can still hold data an
author wants erasable. For example, a `columnMapping` might copy in an
attribute from another process's instance.

The schema SHALL accept `redactable: false` and SHALL store it unchanged.
Every rule in this capability and in `instance-audit-log` SHALL read
"redactable" as `redactable === true` alone. This flag's presence or
absence SHALL affect `definitionHash`. A declared `redactable: false` is a
key present in the canonical JSON. That is distinct from the key's
absence, the same rule `technical` already carries.

#### Scenario: A body with no redactable key hashes as before

- **WHEN** the engine hashes a body declaring no field's `redactable`
- **THEN** the hash equals the hash of the same body from before this
  capability existed

#### Scenario: A redactable field publishes

- **WHEN** an author publishes a field declaring `redactable: true`, of
  any non-group field type
- **THEN** publish succeeds and the field is redactable

#### Scenario: A redactable group field fails the publish

- **WHEN** an author publishes a field declaring `type: "group"` and
  `redactable: true`
- **THEN** publish fails, naming the field

#### Scenario: A technical field may also be redactable

- **WHEN** an author publishes a field declaring both `technical: true`
  and `redactable: true`
- **THEN** publish succeeds and the field is both technical and
  redactable

#### Scenario: An explicit redactable:false hashes differently from an absent key

- **WHEN** one body declares `redactable: false` on a field and another
  omits the key entirely
- **THEN** the two hash differently
