## 1. Cross-process publish pass (definitions.ts)

- [x] 1.1 Add `CrossProcessValidationError extends Error` (message names the offending step + field/reference).
- [x] 1.2 In `publishBody`, after the existing-hash no-op and before insert, build the store resolvers via `createDefinitionStore(db)` and, for each subprocess step in the compiled body, resolve the child: `pinned` → `resolveBody(processId, pinnedVersion)`; `latest-at-spawn` → `resolveLatestByContract(processId, contractRef)`. Throw `CrossProcessValidationError` if the child does not resolve (child-first ordering).
- [x] 1.3 Also throw `CrossProcessValidationError` if the resolved child declares no `contract` — a subprocess reference to a non-contracted child has no `inputFields` to validate against.
- [x] 1.4 With the child body resolved, throw `CrossProcessValidationError` if any `inputMapping` target key is not in the child's `contract.inputFields`. Treat an absent `inputFields` (it is optional) as the empty set — every mapped target is then out-of-contract.
- [x] 1.5 Ensure every throw happens before any `INSERT`, so a rejected publish persists no version.
- [x] 1.6 Test: publishing a parent whose subprocess `inputMapping` targets a field outside the child's `contract.inputFields` is rejected; no parent version is persisted.
- [x] 1.7 Test: a `pinned` reference to an unpublished `pinnedVersion` is rejected; a `latest-at-spawn` `contractRef` matching no published child contract is rejected; a reference to a resolvable child that declares no `contract` is rejected.
- [x] 1.8 Test: child-first round-trip — publish the child, then publish the parent referencing it; the parent validates and publishes (both `pinned` and `latest-at-spawn`).

## 2. Docs

- [x] 2.1 Update `CLAUDE.md`: roadmap #1 — the publish-time cross-process invariants are no longer deferred. Add the two enforced invariants (inputMapping ⊆ child `inputFields`; the child reference resolves to a contracted child → child-first publish ordering). Note the still-deferred outputMapping-reference check, and that the child self-requiredness invariant was dropped (a `required` view flag is satisfied by an interactive step's user, so it does not encode "the caller must supply the field").
