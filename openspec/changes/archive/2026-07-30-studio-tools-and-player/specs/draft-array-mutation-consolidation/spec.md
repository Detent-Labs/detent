<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Add and update on a root-level draft array share one implementation

**Reason**: This was an engineering-hygiene constraint exclusively about
`packages/editor/src/draft/draft-array-crud.ts`'s own call sites, naming no
`packages/studio` component. `packages/editor` is deleted, so the
constraint has no subject left.

**Migration**: None. `packages/studio`'s own draft-array-mutation code
(`packages/studio/src/draft/draft-array-crud.ts`) was never brought under
this constraint, and this change does not newly impose it.
