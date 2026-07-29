## MODIFIED Requirements

### Requirement: A draft body is stored as authored, with only its envelope validated

`saveDraft` SHALL store the body exactly as supplied — the **authored**,
uncompiled shape — and SHALL NOT parse it against `processBody`,
`authoredProcessBody`, or any structural refinement. A draft under
construction legitimately violates the authoring-time invariants (a step with
no exit, a path referencing a step not yet created, a `LocalizedText` whose
base-locale entry is still empty), and rejecting those at save would make the
draft unusable for its purpose.

The save path SHALL nonetheless validate the request envelope, since a `PUT`
is a trust boundary: `body` SHALL be a JSON object (not an array, scalar or
`null`), `layout` SHALL be an object, and `revision` SHALL be a non-negative
integer. A violation SHALL raise `RequestShapeError` (HTTP 400) and SHALL
leave any stored draft untouched.

The envelope check SHALL additionally bound the serialized size of `body` and
`layout` together, raising `RequestShapeError` when it is exceeded. The
previous rationale for having no draft-specific bound — that `POST /processes`
accepts an author-supplied body without one from the same class of role-gated
caller — no longer holds: the HTTP server now declares a
`maxRequestBodySize` that applies to both. The draft bound exists so that the
limit survives a caller that does not arrive over HTTP, since `drafts.ts` is a
module boundary in its own right.

The engine SHALL NOT cross-check a process id carried inside the body against
the route parameter — `ProcessBody` declares no `processId` field, so there is
nothing to compare.

Correctness SHALL be enforced where it already is: live in the studio's
editing surface against the engine's own validators, and unconditionally at
publish, which revalidates server-side regardless of what a client checked.
No engine path other than `drafts.ts` SHALL read `drafts.body`.

#### Scenario: A structurally invalid draft is stored

- **WHEN** `saveDraft` is called with a body whose only step has no outgoing
  path and no timer
- **THEN** the save succeeds and `getDraft` returns that body unchanged

#### Scenario: A draft body is not compiled on save

- **WHEN** a body is saved and read back
- **THEN** it is byte-equivalent JSON to what was supplied, with no
  compile-pass-injected content

#### Scenario: A non-object body is refused

- **WHEN** a save supplies `body` as an array, a string, a number or `null`
- **THEN** it raises `RequestShapeError` and no `drafts` row is written or
  modified

#### Scenario: A malformed revision is refused

- **WHEN** a save supplies `revision` as a negative number, a non-integer or a
  non-number
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: An over-size draft is refused

- **WHEN** a save supplies a `body`/`layout` pair whose serialized size
  exceeds the declared bound
- **THEN** it raises `RequestShapeError` and the stored draft is unchanged

#### Scenario: A realistic draft is unaffected by the bound

- **WHEN** a draft of the size a real process definition reaches is saved
- **THEN** it is stored normally — the bound is sized to the largest
  plausible legitimate draft, not to typical ones
