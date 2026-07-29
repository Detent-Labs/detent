<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Validator-to-EditorIssue mapping shares one implementation

**Reason**: This was an engineering-hygiene constraint exclusively about
`packages/editor/src/draft/validation.ts`'s `pushIssues` function, naming no
`packages/studio` component. `packages/editor` is deleted, so the
constraint has no subject left.

**Migration**: None. `packages/studio`'s own validator-to-issue mapping code
was never brought under this constraint, and this change does not newly
impose it.
