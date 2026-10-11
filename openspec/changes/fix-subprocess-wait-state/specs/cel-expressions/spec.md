<!-- antislop: allow-file passive-voice -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: A step-level validation rule is a checked expression site

A `rule` declared on a `view.fields[].validation` SHALL be parsed and
type-checked at publish. The catalog field's own `rule` and every other
expression in the body get the same treatment. Its location SHALL name the
step and the view field, so an author can find it.

It SHALL be checked in the scope the engine evaluates it in: `data`,
`instance` and `actor`, with neither `result` nor `child`. That holds on a
subprocess step too. The surrounding view field's `visible`, `required` and
`readonly` flags get no `child` either. The runtime resolves the flags while it
renders the form, and the rule during submission. Both run against
`buildGuardContext(body, instance, actor)`, which registers no `child`.
Checking one of them with `child` in scope would let an author publish an
expression referencing an unbound name. That name is never bound when the
expression runs. A flag that read it would always evaluate to false.

#### Scenario: A syntactically broken step-level rule is rejected

- **WHEN** a step's view field declares a `validation.rule` whose `src` does
  not parse as CEL
- **THEN** publish fails and reports the step and the view field

#### Scenario: An unknown field reference in a step-level rule is rejected

- **WHEN** a step-level `validation.rule` references a field key absent from
  the catalog
- **THEN** publish fails and names the unknown reference

#### Scenario: A step-level rule referencing child is rejected on a subprocess step

- **WHEN** a subprocess step's view field declares a `validation.rule`
  referencing `child`
- **THEN** publish fails

#### Scenario: A view flag referencing child is rejected on a subprocess step

- **WHEN** a subprocess step's view entry declares a `visible`, `required` or
  `readonly` expression referencing `child.outcome` or `child.data`
- **THEN** publish fails and names the unknown reference, because the runtime
  resolves the flag with no child in scope

#### Scenario: A step-level rule referencing result is rejected

- **WHEN** a step-level `validation.rule` references `result`
- **THEN** publish fails, because `result` is scoped to `Action.output` alone

#### Scenario: A well-typed step-level rule passes

- **WHEN** a step-level `validation.rule` parses and type-checks against the
  catalog and the submission context
- **THEN** publish succeeds
