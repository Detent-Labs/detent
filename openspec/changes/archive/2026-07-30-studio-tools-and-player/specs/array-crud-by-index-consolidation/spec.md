<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Remove-by-index and update-by-index share one implementation

**Reason**: This was an engineering-hygiene constraint exclusively about
`packages/editor/src/draft/list-ops.ts`'s own call sites
(`PONYTAIL-AUDIT.md` finding 2), naming no `packages/studio` component.
`packages/editor` is deleted, so the constraint has no subject left.

**Migration**: None. `packages/studio`'s own array-CRUD-by-index code
(`packages/studio/src/draft/list-ops.ts`) was never brought under this
constraint, and this change does not newly impose it — reintroducing an
equivalent hygiene rule for Studio, if wanted, is a separate, future
decision.
