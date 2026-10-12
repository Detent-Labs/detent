## 1. The cancel-sink must match the engine's injection

- [ ] 1.1 In `src/schema/compile.ts`, extract the sink injection into `injectCancelSink`. Verify: the existing compile tests pass.
- [ ] 1.2 On the early branch, compare the body with the injection over its stripped form. Reject a difference with one located issue on the sink step. Verify: task 1.3 passes.
- [ ] 1.3 In `test/compile.test.ts`, add tests that reject five bodies. The five hold a sink with another outcome, a non-terminal sink, and a sink with an action. They also hold a sink out of position and a missing reserved outcome. Verify: each fails with 1.2 reverted on a copy.
- [ ] 1.4 Add a test that publishes all nine files under `examples/` twice and gets byte-identical output. Verify: it passes.
- [ ] 1.5 In `test/cancel.test.ts`, keep the lookalike test. Add an assertion that `compileProcessBody` rejects the same body. Verify: the new assertion passes.

## 2. Actions keep no unread key

- [ ] 2.1 In `src/schema/definition.ts`, narrow `execution` to `async` and remove `idempotencyKey` from `action`. Verify: `bun run typecheck` passes.
- [ ] 2.2 Remove `"idempotencyKey": null` from `examples/expense-approval.json` and `examples/purchase-requisition.json`. Verify: `git grep idempotencyKey examples` prints nothing.
- [ ] 2.3 Add tests that reject `execution: "blocking"` and an `idempotencyKey` of `null` and of a string. Add one that accepts `execution: "async"`. Verify: they pass.
- [ ] 2.4 Remove `idempotencyKey` from `PROPERTY_WORDS` in `packages/web/src/areas/studio/draft/changeSet.ts`, and its catalog string. Verify: the `packages/web` typecheck and tests pass.
- [ ] 2.5 Sweep the other hand-kept mirrors for the removed key: `KNOWN_KEYS`, `OWNED_LISTS` and the `sectionsFor` test. Verify: `git grep idempotencyKey packages/web` shows outbox rows only.

## 3. Rules and documents

- [ ] 3.1 Update `.claude/rules/authoring-invariants.md` and `.claude/rules/process-contract.md` for the exact-sink rule, the async-only enum and the removed key. Verify: each file states each rule once.
- [ ] 3.2 Update the Action section of `docs/authoring-guide.md`. Verify: it says `execution` is async only and never names `idempotencyKey`.
- [ ] 3.3 Fix the comments in `definition.ts` and `compile.ts` that call the sink count the only check. Verify: `git grep "checks only the cancel-sink"` shows no stale claim.
- [ ] 3.4 Strike the `tighten-publish-contract-checks` entry from the audit index in `docs/decisions.md`. Verify: `git grep tighten-publish-contract-checks docs/decisions.md` prints nothing.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`, then `bun run build`, then the full `bun test` through `scripts/test-gated.sh` with `DATABASE_URL` set. Verify: record the printed result.
- [ ] 4.2 Run the antislop gate over the range: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. Verify: it exits 0.
- [ ] 4.3 Run the whitespace gate over the range: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`. Verify: it exits 0.

## Workflow follow-up

- After the tasks: verify, sync, archive with `Move-Item`, push, then open the PR.
