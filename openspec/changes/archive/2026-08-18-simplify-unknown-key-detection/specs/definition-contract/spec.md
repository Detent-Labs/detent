## MODIFIED Requirements

### Requirement: Authored bodies reject unknown keys instead of dropping them

Publishing a body SHALL fail when it carries any key the contract does not
declare. This applies at any depth: process, step, path, action, timer,
field, view field, validation, subprocess spec, contract, data source.
Publishing SHALL then report a located issue per offending key.

Stripping an unknown key is not a safe default on the write path. A path
authored with `gaurd` compiles to a path with **no guard**, reproduced by
execution. That turns a conditional transition into an unconditional
default. The same mechanism deletes misspelled action lists. It turns a
misspelled `terminal` into a non-terminal step. Process Studio's JSON
surface is a first-class authoring path, so hand-written JSON is ordinary
input.

Reading a stored body SHALL continue to strip. Its `definitionHash` covers
the parse output, so a stored body cannot contain an undeclared key. The
read schema stays permissive by design.

Detection SHALL NOT depend on the rest of the body already being
schema-valid. An author mid-edit routinely has more than one thing wrong at
once. The unknown-key issue often explains the others: a misspelled key
reads as a missing required field one level up. A detection method that
only runs once the whole body parses cleanly would go silent on that body.
It would report only the unrelated issue instead.

<!-- antislop: allow passive-voice: exact scenario name from the current spec, required unchanged for openspec archive. -->
#### Scenario: A misspelled guard is rejected

- **WHEN** a body declares a path with a `gaurd` key
- **THEN** publishing fails with a located issue naming the unknown key and
  its path, rather than publishing a guardless path

<!-- antislop: allow passive-voice (exact existing scenario name, see note above) -->
#### Scenario: Every unknown key is reported

- **WHEN** a body carries unknown keys in more than one place
- **THEN** the rejection names each of them

#### Scenario: The check is not bypassable by the compiled branch

- **WHEN** a body carrying an unknown key also satisfies
  `publishedProcessBody`
- **THEN** publishing still fails

<!-- antislop: allow passive-voice (exact existing scenario name, see note above) -->
#### Scenario: Reading a stored body is unaffected

- **WHEN** a client reads a previously published body
- **THEN** it parses under the ordinary stripping read schema, with no
  unknown-key check applied

#### Scenario: An unknown key is still located when the rest of the body is not yet valid

- **WHEN** a body carries an unknown key on an object that is also missing a
  required field the contract declares
- **THEN** publishing fails with a located issue naming the unknown key,
  not only an issue about the missing required field
