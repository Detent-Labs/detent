# Tasks

## 1. Handler refuses a target of another kind

- [x] 1.1 In `src/handlers/instance-transition.ts`, throw a `PermanentError` naming both kinds when `target.kind` differs from `acting.kind`. Verify with a test.
- [x] 1.2 Add tests to `test/instance-transition.test.ts` for test→published, published→test and same-kind. Verify the first two fail permanently and the third moves.
- [x] 1.3 Update the handler's header comment to name the `kind` rule. Verify by reading the comment.

## 2. Publish binds instanceIdField to an instance query

- [x] 2.1 In `validateInstanceTransitionReferences`, reject an action whose field has no `instance.query` source over the action's `processId`. Verify with 2.2.
- [x] 2.2 Add tests to `test/instance-transition-cross-process.test.ts` for the six binding scenarios and the re-publish scenario. Verify the four rejections name the location and field.
- [x] 2.3 Give every existing test body that publishes an `instance.transition` action a bound field. Verify the touched suites pass.
- [x] 2.4 Add an end-to-end test: an id the source does not offer fails the option check and enqueues nothing. An offered id moves the target. Verify both.
- [x] 2.5 Write the rule in `.claude/rules/authoring-invariants.md`. Verify the new bullet names the check and its placement.

## 3. Publish requires migrate on the target

- [x] 3.1 Add `validateInstanceTransitionWriteGrant` beside `validateCrossProcessReadGrant`, and call it in `publishBody` after the read check. Verify with 3.2.
- [x] 3.2 Add tests for the eight scenarios of the two `migrate` requirements. Verify a Reader list entry alone fails and a global developer role passes.
- [x] 3.3 Update the read-grant comment, the `publishBody` actor comment and the `handlers/instance-transition.ts` header. Verify none says both sites share one gate.
- [x] 3.4 In `.claude/rules/process-contract.md` and `.claude/rules/authoring-invariants.md`, replace "seven" with "eight" DB-resolving checks and list the new one. Verify with `git grep -n "seven DB"`.

## 4. Authoring guide

- [x] 4.1 In `docs/authoring-guide.md`, state that `instanceIdField` binds to an `instance.query` source over the target process. Verify the example gains the data source and the bound field.
- [x] 4.2 State the trust model and the `migrate` rule in the same section. Verify it says the source offers every instance it selects.
- [x] 4.3 Strike the `bind-instance-transition-target` entry from the audit index in `docs/decisions.md`. Verify `git grep -n "bind-instance-transition-target" docs/decisions.md` finds none.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, then `bun run build`. Verify both exit 0.
- [ ] 5.2 Run the full `bun test` with `DATABASE_URL` set, through `scripts/test-gated.sh`. Verify zero failures and the gate accepts the run.
- [ ] 5.3 Run the prose and whitespace gates over the pushed range. Verify both exit 0.
