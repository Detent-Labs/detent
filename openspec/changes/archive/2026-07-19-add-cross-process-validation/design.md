## Context

`subprocessSpec` references a child by `processId` + `versionBinding` (+
`pinnedVersion` / `contractRef`) and maps data in/out. The engine now resolves and
spawns that child, but nothing validates the wiring: a bad `inputMapping` target or
an unresolvable child reference only fails at spawn time (the handler throws and the
action dead-letters). These cross-process invariants were deferred "until a process
registry exists to resolve the child" — the definition store (`definitions.ts`,
with `resolveBody` and `resolveLatestByContract`) is that registry.

## Goals / Non-Goals

**Goals:**
- Reject at publish a subprocess step whose `inputMapping` target is not a declared
  child input, or whose child reference does not resolve to a contracted child
  (child-first ordering).
- Fail as a publish error, close to the author — never a runtime dead-letter.

**Non-Goals:**
- Checking that `outputMapping` expressions only read child field keys /
  `contract.outputFields` — needs CEL identifier extraction; deferred.
- A "child self-requiredness" check (reject a contracted child that marks a
  non-input field `required: true`) — **dropped.** A `required` view flag is
  satisfied by an interactive step's user, not the caller, so it does not encode
  "the caller must supply this field"; the shipped `expense-approval` example
  legitimately requires a non-input field at its (manual) `review` step. There is
  no clean static defect a `required` flag expresses here.
- Migration `transform` CEL checks (separate roadmap item).

## Decisions

### A single publish-time pass

Both enforced invariants — **inputMapping ⊆ child inputs** and **reference
resolves to a contracted child** — need the *child* definition, so they run as one
publish-time pass in `publishBody` (`definitions.ts`), which already has `db` and
can build the store resolvers. No authoring-time (`definition.ts`) refinement is
added: the only invariant that would have lived there (child self-requiredness) is
dropped as unsound (see Non-Goals).

### The publish-time pass runs on the new-version path only

`publishBody` keeps its order: compile → hash → return early if that hash already
exists for the `processId` (idempotent no-op) → **validate cross-process** →
persist. Validation runs only when a genuinely new version is about to be inserted;
an identical re-publish was already validated when first published, and versions are
immutable, so re-validating is wasted work. Failure throws
`CrossProcessValidationError` before any insert, so nothing is persisted.

### Resolving the child at publish

For each `subprocess` step in the compiled body, resolve the child:
`pinned` → `resolveBody(spec.processId, spec.pinnedVersion)`; `latest-at-spawn` →
`resolveLatestByContract(spec.processId, spec.contractRef)`. An unresolved child —
or a resolved child with no `contract` — is the reference-resolvability rejection
(child-first). With a contracted child body in hand, check every `inputMapping` key
∈ `child.contract.inputFields`, treating an absent `inputFields` (it is optional in
the schema) as the empty set. `publishBody` builds the resolvers from its `db` via
`createDefinitionStore(db)` (same module, no cycle).

### Hard errors, not warnings

Every failure is a thrown error that aborts the publish (or a Zod issue that fails
the parse). No "publish with warnings" path — a subprocess wired against a child it
does not fit is a defect, and v1's pin-by-default model assumes the parent validated
against a concrete child.

## Risks / Trade-offs

- **`publishBody` now reads other rows (children) mid-publish** → publish is no
  longer a single-body operation. The reads see committed, immutable published
  versions, so there is no consistency hazard; publish stays non-transactional.
- **contractRef matching must agree with spawn-time resolution** → both use
  `resolveLatestByContract` / `contractHash` over the stored compiled child
  contract, so a `latest-at-spawn` reference that validates at publish resolves the
  same way at spawn.

## Migration Plan

Additive: a new publish-time gate only. No schema/contract shape change, so
`definitionHash` is unaffected and existing *stored* versions (already valid) keep
resolving. New publishes must satisfy the invariants; existing instances are
untouched. Rollback = drop the publish gate.

## Open Questions

- **Draft/unpublished children:** only published versions are resolvable, so a
  parent cannot reference a draft child. This is the intended child-first behavior;
  revisit only if a draft-reference workflow is ever needed.
- **outputMapping reference checking** stays deferred until there is a reason to add
  CEL identifier extraction to the authoring path.
