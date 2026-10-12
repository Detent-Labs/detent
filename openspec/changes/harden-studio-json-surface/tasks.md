# Tasks

## 1. The load guard

- [ ] 1.1 Add `collaboration` to `KNOWN_KEYS` and export the set. Add a test in `studio-load-guard.test.ts` that compares it to `Object.keys(processBody.shape)`.
- [ ] 1.2 Add the `Shape` type, `DRAFT_SHAPE` and the walker from design decision 1. Test that the guard flags `workflow.steps` as an object, a string step and a `null` `view`.
- [ ] 1.3 Test that a body with `collaboration.comments` false, an empty body and absent step containers return no issues. Test the same for a well-typed body that breaks an invariant.
- [ ] 1.4 Grep `examples/` and `packages/web/test` for a body with a `null` container, and fix any hit. Rewrite the `null` comment in `studio-fieldRemoval.test.ts`. Rewrite the header comment in `load-guard.ts`, which names `draft/validate.ts` where the file is `draft/validation.ts`.
- [ ] 1.5 Add the helper `packages/web/test/zodContainerPaths.ts` with `containerNodes`, per design decision 3. Add a test that `DRAFT_SHAPE` flattens to the same paths, including `view.fields[]`. See it fail when a row leaves the table.

## 2. The mirror tests

- [ ] 2.1 Add a test to `studio-sectionsFor.test.ts` that maps every key of `step.shape` to a section or `masthead`. See it fail when a key leaves the map.
- [ ] 2.2 Add `collaboration` and `assignment` to the `shapes` list in `studio-changeSet.test.ts`. Add a test that every object schema under `processBody` has a listed shape with the same key set.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, then `bun run build`. Record the printed result.
- [ ] 3.2 Run the full suite in the container with `OPENSPEC_TELEMETRY=0` through `sh scripts/test-gated.sh bun test`. Record the pass, fail and skip counts.
- [ ] 3.3 Run the antislop and whitespace gates over the pushed range on the host. Record both exit codes.
- [ ] 3.4 Build for production. In a browser on this worktree's stack, reproduce E1-1 and E1-5 and see Apply work, then refuse. Run `/impeccable critique` and `/impeccable audit` on the JSON surface route.

## Workflow follow-up

- Sync the delta spec into `openspec/specs/studio-json-view/spec.md`.
- Strike the `harden-studio-json-surface` entry in the audit index in `docs/decisions.md`.
- Archive the change with `Move-Item`.
