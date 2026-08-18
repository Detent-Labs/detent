## ADDED Requirements

### Requirement: A step's view field may override the catalog field's validation

A `view.fields[]` entry SHALL accept an optional `validation`, carrying the
same keys the catalog `FieldDef.validation` carries: `min`, `max`,
`minLength`, `maxLength`, `pattern`, `rule`. The entry SHALL also accept an
optional `validationMode`, either `"merge"` or `"replace"`.

An absent `validationMode` reads as `"merge"`. Under `merge`, the keys the
step declares overlay the catalog field's. Every key the step leaves out keeps
its catalog value. Under `replace`, the catalog field's validation does not
apply in that step at all. Only the keys the step declares are in force.

The `rule` key is one key like any other. A step that declares `rule` under
`merge` supersedes the catalog `rule` rather than adding a second one.

A step may loosen a bound as well as tighten it. Nothing requires an override
to be narrower than the catalog value.

Both keys are optional, so a body written before this requirement parses
unchanged and its `definitionHash` does not move.

#### Scenario: A step narrows a catalog bound

- **WHEN** a catalog field declares `max: 10000` and a step's view field
  declares `validation: { max: 1000 }` with no `validationMode`
- **THEN** the body parses, and `max` is 1000 in that step and 10000 in every
  step that declares no override

#### Scenario: A step widens a catalog bound

- **WHEN** a catalog field declares `max: 10000` and a step's view field
  declares `validation: { max: 20000 }`
- **THEN** the body parses and the wider bound is in force in that step

#### Scenario: Merge keeps the keys the step leaves out

- **WHEN** a catalog field declares `min: 0` and `pattern`, and a step's view
  field declares `validation: { max: 1000 }` under `merge`
- **THEN** `min` and `pattern` keep their catalog values in that step

#### Scenario: Replace drops the keys the step leaves out

- **WHEN** a catalog field declares `min: 0` and `pattern`, and a step's view
  field declares `validation: { max: 1000 }` with `validationMode: "replace"`
- **THEN** only `max` is in force in that step, and the catalog `min` and
  `pattern` do not apply there

#### Scenario: A body without any override parses as before

- **WHEN** a view field declares neither `validation` nor `validationMode`
- **THEN** the body parses and the catalog field's validation is the one in
  force, as it was before this requirement

### Requirement: A view field's validation override is well-formed

A `view.fields[]` entry declaring `validationMode` without `validation` SHALL
fail to parse. A mode selects between overlaying and discarding. Neither means
anything with nothing to overlay or discard.

A `view.fields[]` entry declaring `validation` with no key set SHALL fail to
parse. An empty object is indistinguishable from an absent one under `merge`.
Under `replace` it silently discards every catalog bound. An author who means
that can express it by naming the keys they want.

#### Scenario: A mode without an override is rejected

- **WHEN** a view field declares `validationMode: "replace"` and no
  `validation`
- **THEN** the process body fails to parse

#### Scenario: An empty override is rejected

- **WHEN** a view field declares `validation: {}`
- **THEN** the process body fails to parse

#### Scenario: An unknown mode is rejected

- **WHEN** a view field declares `validationMode: "override"`
- **THEN** the process body fails to parse

### Requirement: Every step-level validation pattern compiles at publish

Every `pattern` declared on a `view.fields[].validation` SHALL be compiled at
publish. A pattern whose source exceeds the declared maximum length SHALL be
rejected. Both hold on the same terms the catalog field tree is already held
to. A pattern that does not compile SHALL be a located publish issue naming
the step and the field.

The reason is the reason the catalog check exists. Published versions are
immutable. An uncompilable pattern throws for every submission touching that
field in that step, for the life of the version. The only remedy is publishing
a replacement and migrating every pinned instance.

#### Scenario: An uncompilable step-level pattern is rejected

- **WHEN** a step's view field declares `validation.pattern` of `"("`
- **THEN** publishing fails with a located issue naming the step and the field

#### Scenario: An over-long step-level pattern source is rejected

- **WHEN** a step-level pattern's source exceeds the maximum pattern length
- **THEN** publishing fails with a located issue

#### Scenario: A valid step-level pattern publishes unchanged

- **WHEN** a step's view field declares a well-formed pattern
- **THEN** publishing succeeds
