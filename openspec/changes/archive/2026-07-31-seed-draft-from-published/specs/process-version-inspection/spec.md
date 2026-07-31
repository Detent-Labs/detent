<!-- antislop: allow-file passive-voice -->
<!-- WHEN/THEN scenarios name a condition, not an actor. Every spec under
     openspec/specs/ carries the same passive phrasing. -->

## ADDED Requirements

### Requirement: The diff agrees with the definition hash on what counts as the same body

The version diff SHALL compare values by canonical JSON, the rule
`definitionHash` defines a body's identity by. Two bodies that hash alike
SHALL diff as identical. Key order SHALL NOT read as a change at any depth,
including inside an array of objects. Array element order SHALL keep reading
as a change, since order carries meaning in a `ProcessBody`.

The studio and the engine SHALL share one canonicalizer. A second
implementation would drift from the one the hash uses, and the two would then
disagree about identity.

This matters wherever the two sides come from different sources. A draft read
back from a `jsonb` column arrives in the store's normalized key order. A
published body arrives in the read schema's order. Before this rule the
comparison reported every array of objects as changed.

#### Scenario: Key order alone is not a change

- **WHEN** two bodies differ only in the key order of an object inside an
  array
- **THEN** the diff reports no entry

#### Scenario: Array element order is still a change

- **WHEN** two bodies carry the same array elements in a different order
- **THEN** the diff reports that array as changed

### Requirement: A draft is diffed against the authored shape of its base version

The draft-against-base diff SHALL remove the compile pass's injected content
from the published body before it compares. A draft holds the authored shape
and a published body the compiled one. Comparing them raw reports the
cancel-sink step and the reserved cancel outcome as changes. The author made
neither and can act on neither. The next publish injects both again.

Removal SHALL use the same inverse the draft seeding uses. One function then
carries the rule, and one test keeps it in step with the compile pass.

#### Scenario: An unmodified seeded draft diffs clean

- **WHEN** a draft seeded from a published version is diffed against its base
  without a change
- **THEN** the diff reports no differences, which agrees with publishing that
  draft returning the version it came from

#### Scenario: A changed draft reports only the author's change

- **WHEN** a seeded draft with one changed step label is diffed against its
  base
- **THEN** the diff reports that change and reports no cancel-sink step and
  no reserved outcome
