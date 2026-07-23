## ADDED Requirements

### Requirement: A step's assignment, when present, follows the plugin-envelope shape

A `Step` MAY declare an optional `assignment: { strategy: { type: string;
config: unknown; description?: string } }` field — already present in the
schema (`assignment = z.object({ strategy: plugin })`), documented here for
the first time as this change activates it at publish and runtime. A step
with no `assignment` field SHALL be unrestricted — every existing published
body, example, and test that predates enforcement SHALL continue to parse
and behave identically. This field introduces no structural coupling to a
step's `type`: a step of any type MAY declare `assignment`.

#### Scenario: A step with no assignment field parses unchanged

- **WHEN** a step declares no `assignment` field
- **THEN** the process body parses successfully and the step is
  unrestricted, identical to pre-existing behavior

#### Scenario: A step with a well-formed assignment envelope parses

- **WHEN** a step declares `assignment: { strategy: { type: "static",
  config: { candidates: ["role_a"] } } }`
- **THEN** the process body parses successfully (subject to every other
  invariant; `strategy.type`/`strategy.config` resolution against a
  registry happens at publish, not at parse)

#### Scenario: An assignment envelope missing its strategy type is rejected

- **WHEN** a step declares an `assignment.strategy` object with no `type`
  string
- **THEN** the process body fails to parse
