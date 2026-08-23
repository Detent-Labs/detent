# Tasks

## 1. Correct the stale claim in the tests

- [ ] 1.1 Re-base the layering assertion in `test/validate.test.ts`, lines 676
      to 690. Delete the sentence claiming `resolveBody` sits outside the
      per-instance try. Keep the test itself: the write path still rejects a bad
      duration, and the read path still parses one, because the check stays in
      `compile.ts`. Rewrite the comment to name arming totality as the reason,
      and to point at `definition-contract` for the placement rule.
- [ ] 1.2 Correct the two comments in `test/compile-validation.test.ts`, at
      lines 480 and 575. Each states the withdrawn reason. Replace it with one
      sentence naming the placement and pointing at the rule.
- [ ] 1.3 Add a test for the containment the new requirement names: a stored
      body that fails `processBody.parse` skips its own instance and leaves the
      rest of the pass to run. Check whether `test/timers.test.ts` already
      covers this through the poison-instance requirement. Add nothing if it
      does, and record which test covers it.

## 2. Correct the code comments

- [ ] 2.1 `src/schema/definition.ts:149` (the ISO 8601 duration comment). Keep
      the fact that the schema deserializes stored bodies. Drop the "would
      retroactively make" framing that reads as a veto. Point at
      `definition-contract`'s placement requirement.
- [ ] 2.2 `src/schema/definition.ts:294` (the `technical` field comment). Same
      treatment.
- [ ] 2.3 `src/schema/definition.ts:503` (the `columns` union comment). This one
      is about widening, not tightening, so its reasoning stays correct. Confirm
      that and leave it alone, or adjust only the clause that implies a veto.
- [ ] 2.4 `src/schema/compile.ts:69` (`validateDurations`). Rewrite the "Lives
      here, not as a Zod refinement, because" paragraph to lead with arming
      totality, matching the `timers` delta.

## 3. Update the rules files

- [ ] 3.1 `.claude/rules/authoring-invariants.md`: rewrite the placement
      paragraph at the top. State the two criteria. Keep the unbypassable-check
      sentence, which this change does not touch.
- [ ] 3.2 `.claude/rules/authoring-invariants.md`: each invariant bullet citing
      the read-path reason. The duration bullet and the `technical` bullet both
      spell it out. Shorten each to name its placement and point at the rule
      once.
- [ ] 3.3 `.claude/rules/process-contract.md`: the hashing and versioning
      passage. It states published-version immutability, which stays true. Check
      whether it also states the veto, and correct only that.

## 4. Update the project context

- [ ] 4.1 `CLAUDE.md`: the "Stage: pre-1.0" note's second paragraph. It bundles
      three rules under "immutable" and names them all untouchable. Separate
      them: storage immutability and instance pinning hold, and the schema
      refinement veto is gone.
- [ ] 4.2 `openspec/config.yaml`, the `context:` block. It carries the withdrawn
      reason verbatim: "a rule that may tighten over time belongs on the write
      path, since definition.ts also deserializes stored immutable bodies."
      Replace it with the two-criterion rule, in one sentence.

## 5. Verify

- [ ] 5.1 `openspec validate allow-schema-refinement-tightening --strict`.
- [ ] 5.2 `bun run typecheck`, then `bun run build`.
- [ ] 5.3 Full `bun test` with `DATABASE_URL` set, in the devcontainer. Pipe it
      through `scripts/gates/silent-green.sh` and report the pass count, the
      skip count and the database name the preload printed.
- [ ] 5.4 `sh scripts/gates/prose.sh < /dev/null` over every Markdown file this
      change touches.
- [ ] 5.5 `sh scripts/gates/whitespace.sh < /dev/null`.
- [ ] 5.6 No browser check. Nothing here alters UI or engine behavior.

## 6. Record the interaction

- [ ] 6.1 Note in `openspec/changes/reject-unsatisfiable-required-readonly/`
      that its duplicated writer-set helper is now optional. Add the note only.
      Do not restructure that change here.
