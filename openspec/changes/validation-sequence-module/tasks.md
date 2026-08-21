## 1. The registry check split

- [ ] 1.1 Add `RegistryDescription` to `src/engine/registry.ts`, carrying the three type arrays
- [ ] 1.2 Add `describe(registry)` deriving that shape from a live registry
- [ ] 1.3 Split `checkActionRegistry` into a type-resolution half and a config half
- [ ] 1.4 Split `checkAssignmentRegistry` the same way
- [ ] 1.5 Split `checkDataSourceRegistry` the same way
- [ ] 1.6 Keep the combined entry points, so the engine's call sites read unchanged

## 2. The shared validation module

- [ ] 2.1 Add `src/schema/validate.ts` with `validateStructure` and `validateReferences`
- [ ] 2.2 Move the Zod gate, duration and structural stages into `validateStructure`
- [ ] 2.3 Move the registry, CEL, cross-process and chaining stages into `validateReferences`
- [ ] 2.4 Type `validateReferences` to take only a compiled body
- [ ] 2.5 Report each dimension as `ran` or `not-run` in the result
- [ ] 2.6 Add `./schema/validate` to the exports map in `package.json`

## 3. The engine publish path

- [ ] 3.1 Rewrite `publishBody` to call the two phases around its hash lookup
- [ ] 3.2 Keep the hash-hit early return exactly where it sits today
- [ ] 3.3 Keep every error class and its issues unchanged
- [ ] 3.4 Delete the stage list from `publishBody`'s own comments

## 4. Studio wiring

- [ ] 4.1 Pass the fetched registry response into `runValidation`
- [ ] 4.2 Load the target body of every `process.start` action, reusing the child loader
- [ ] 4.3 Rewrite `runValidation` as two calls plus an `EditorIssue` mapping
- [ ] 4.4 Pass `checkViewFlags` in as an extra checker
- [ ] 4.5 Delete the 37-line ordering comment and the KNOWN GAP comment
- [ ] 4.6 Replace `ValidationResult`'s three booleans with the per-dimension record

## 5. The checks rail

- [ ] 5.1 Rewrite `heldBackFor` to read the per-dimension record
- [ ] 5.2 Report the registry group's config half as held back, on its own
- [ ] 5.3 Drop the `"registry"` exclusion from `allChecksClear`
- [ ] 5.4 Drop the `"registry"` exclusion from `totalOpenIssueCount`
- [ ] 5.5 Report a chaining site with no loaded target as not checked
- [ ] 5.6 Change every other reader of `ValidationResult`

## 6. Tests

- [ ] 6.1 Assert both callers report the same issues for one body
- [ ] 6.2 Add a rejecting test per newly visible dimension in the studio
- [ ] 6.3 Assert an unregistered assignment strategy type reaches the rail
- [ ] 6.4 Assert an unregistered data source type reaches the rail
- [ ] 6.5 Assert a bad `process.start` input mapping reaches the rail
- [ ] 6.6 Assert a missing input reports `not-run`, never a pass
- [ ] 6.7 Assert an identical re-publish stays a no-op
- [ ] 6.8 Assert the engine rejects and accepts exactly what it does today

## 7. Documentation

- [ ] 7.1 Add the new export to `docs/current-state.md`
- [ ] 7.2 Record the two-phase seam in `.claude/rules/authoring-invariants.md`
- [ ] 7.3 Add a browser check for the widened rail to `docs/browser-checks.md`

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`
- [ ] 8.2 Run `bun run build`
- [ ] 8.3 Run the full `bun test` with `DATABASE_URL` set
- [ ] 8.4 Read the skip count that run reports
- [ ] 8.5 Run the antislop linter over every Markdown file this change touched
- [ ] 8.6 Run `git diff --check`
- [ ] 8.7 Run `git ls-files --eol`, then read its `w/` column
- [ ] 8.8 Open a seeded example in a browser
- [ ] 8.9 Read that example's rail
- [ ] 8.10 Confirm `GET /registry`'s role gate admits every account that opens a draft
