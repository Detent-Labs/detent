## ADDED Requirements

### Requirement: An existing process file can be imported as an editable Draft
The editor SHALL support importing a complete process definition file — a
published `DefinitionVersion` wrapper (`{ processId, version,
definitionHash, status, ..., definition: ProcessBody }`) or a raw
`ProcessBody` — and converting it into a Draft loaded into the workspace,
distinct from "Load draft" (which accepts only a previously-saved Draft
file and remains unchanged by this requirement).

Import SHALL parse the (unwrapped, if applicable) body through the
contract's real `processBody` Zod schema, not the relaxed Draft load-guard,
and SHALL reject a file that fails that parse with a clear error instead of
producing a partially- or all-undefined Draft.

Import SHALL strip the engine-injected cancel-sink step (matched by its
reserved step id) and, when present, remove the reserved cancellation
outcome from the contract's `outcomes`, before the result is treated as a
Draft — a no-op for a body that was never compiled. The resulting Draft
carries no provenance back to the source file's `processId`, `version`, or
`definitionHash`.

#### Scenario: Importing a published DefinitionVersion wrapper loads its process
- **WHEN** an author imports a file shaped like `{ processId, version,
  definitionHash, status, ..., definition: {...} }`
- **THEN** the editor loads a Draft populated from the `definition` field's
  content (key, label, fields, workflow, etc.), not an empty Draft

#### Scenario: Importing a raw ProcessBody loads it directly
- **WHEN** an author imports a file that is a `ProcessBody` with no
  wrapping envelope
- **THEN** the editor loads a Draft populated from that body's content

#### Scenario: Importing a compiled body strips the reserved cancel-sink
- **WHEN** an author imports a `ProcessBody` (wrapped or raw) whose
  `workflow.steps` includes the engine-injected cancel-sink step
- **THEN** the loaded Draft's `workflow.steps` does not include that step,
  and, if the source declared a `contract`, the loaded Draft's
  `contract.outcomes` does not include the reserved cancellation outcome

#### Scenario: Importing a file that is not a valid process body is rejected with a clear error
- **WHEN** an author attempts to import a file that fails to parse against
  the `processBody` schema (invalid JSON, or JSON that doesn't satisfy the
  schema even after unwrapping a `definition` field if present)
- **THEN** the editor reports an import error and does not load a
  partially- or all-undefined Draft

#### Scenario: Import replaces the current workspace, like Load draft
- **WHEN** an author imports a process file while a Draft is already loaded
  in the workspace
- **THEN** the imported Draft replaces the current workspace content

#### Scenario: Load draft is unaffected by Import
- **WHEN** an author uses "Load draft" on a previously-saved `.draft.json`
  file
- **THEN** behavior is exactly as specified by the existing "Draft can be
  saved to and loaded from a file" requirement, unchanged by the
  introduction of Import
