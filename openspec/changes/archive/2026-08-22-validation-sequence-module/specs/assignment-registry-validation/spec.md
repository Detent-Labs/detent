<!-- antislop: allow-file passive-voice sentence-length em-dash synonym-rotation -->
<!-- Passive voice and the "error class" vs. "issue" distinction match every
     sibling spec in this directory (see openspec/specs/assignment-registry-validation/spec.md's
     own Gherkin "WHEN publishBody is called" idiom, unchanged here); "error
     class" names a TypeScript class (AssignmentRegistryValidationError), never
     a synonym for the located RegistryIssue records. Sentence length and the
     em-dash follow the base spec's own requirement prose style. -->

## Purpose

A wording correction to the "invoked at publish" requirement. `publishBody`
no longer calls `checkAssignmentRegistry` by name. It reaches the same
resolve-then-parse verdict through `validateReferences`'s assignment-type
dimension, which composes the same `resolveType`/`checkConfigOnly` pair
`checkAssignmentRegistry` itself composes internally. See
`validation-sequence-module`'s design.md, "The type-resolution half shares
one implementation across all three registry checks." Placement, precedence
and the thrown error class stay exactly as they are.

## MODIFIED Requirements

### Requirement: checkAssignmentRegistry is invoked at publish, alongside checkActionRegistry

`publishBody` SHALL reach the assignment-strategy resolve-then-parse verdict
at the same placement as every other publish-time check — after the
hash-hit no-op return, on the compiled body, before CEL and cross-process
validation — by calling `validateReferences` (`src/validate.ts`), not by
calling `checkAssignmentRegistry` directly. `validateReferences`'s
assignment-type dimension SHALL call `resolveType` against a
`RegistryDescription` built from the injected `AssignmentRegistry`, then
SHALL call `checkConfigOnly` against that same live registry. Those two
functions are the same resolve-then-parse primitives `checkAssignmentRegistry`
itself composes internally. The split moved the call path, not the check.

A violation SHALL throw `AssignmentRegistryValidationError` carrying every
located issue, collected rather than failing on the first found. This
matches `RegistryValidationError`.

`publishBody` SHALL take the process's `AssignmentRegistry` as a further
argument, beside the action `Registry` and the `DataSourceRegistry` it
already takes, and SHALL derive the `RegistryDescription` that
`validateReferences` resolves against from that argument. The check never
compares against a literal.

`checkAssignmentRegistry` SHALL keep existing as a combined entry point,
composing the same `resolveType`/`checkConfigOnly` pair for a caller that
wants a single call over both halves at once. It is no longer
`publishBody`'s own call path.

#### Scenario: An identical re-publish of an already-stored body stays a no-op

- **WHEN** `publishBody` is called with a body whose hash matches an
  already-published version, which may predate this check
- **THEN** the call returns the existing version without invoking
  `validateReferences`'s assignment-type resolution or config-validation
  halves

#### Scenario: A publish with an unregistered assignment type throws with every located issue

- **WHEN** `publishBody` is called with a compiled body containing two steps
  whose `assignment.strategy.type` the injected registry does not hold
- **THEN** it throws `AssignmentRegistryValidationError` carrying a located
  issue for each of the two steps, not only the first

#### Scenario: A body published before a strategy was registered survives re-publish

- **WHEN** `publishBody` is called with a body whose hash already matches a
  stored version
- **WHEN** the current registry no longer holds that body's strategy type
- **THEN** the call returns the existing version, and throws nothing
