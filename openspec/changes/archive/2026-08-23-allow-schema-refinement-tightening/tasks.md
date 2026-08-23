# Tasks

## 1. Correct the stale claim in the tests

- [x] 1.1 Re-base the layering assertion in `test/validate.test.ts`, lines 676
      to 690. Delete the sentence claiming `resolveBody` sits outside the
      per-instance try. Keep the test itself: the write path still rejects a bad
      duration, and the read path still parses one, because the check stays in
      `compile.ts`. Rewrite the comment to name arming totality as the reason,
      and to point at `definition-contract` for the placement rule. Give the
      same treatment to the second comment block at lines 603 to 608, above
      the `describe("timer duration", ...)` block, which restates the same
      withdrawn framing.
- [x] 1.2 Correct the two comments in `test/compile-validation.test.ts`, at
      lines 480 and 575. Each states the withdrawn reason. Replace it with one
      sentence naming the placement and pointing at the rule.
- [x] 1.3 Add a test for the containment the new requirement names: a stored
      body that fails `processBody.parse` skips its own instance and leaves the
      rest of the pass to run. Check whether `test/timer.test.ts` already
      covers this through the poison-instance requirement. Add nothing if it
      does, and record which test covers it.
      Covered already, nothing added: `test/timer.test.ts`'s "an unparseable
      row at the head of the timer scan does not block due timers" (row parse)
      and "a failing timer instance is pushed out of the scan and not
      reselected on the next pass" (resolver miss) together exercise both
      halves of the per-instance error boundary named in the requirement.
- [x] 1.4 Correct the two comments in `test/definitions.test.ts`, above the
      "re-publishing an already-stored body is a no-op" test (around line
      207) and above the "a body stored before the check still reads" test
      (around line 223). Each states the withdrawn "would strand them" /
      "would break exactly this, turning a tightening into an outage"
      framing. Replace each with one sentence naming the placement and
      pointing at `definition-contract`, matching the treatment task 1.1 and
      1.2 give the other test comments.

## 2. Correct the code comments

- [x] 2.1 `src/schema/definition.ts:149` (the ISO 8601 duration comment). Keep
      the fact that the schema deserializes stored bodies. Drop the "would
      retroactively make" framing that reads as a veto. Point at
      `definition-contract`'s placement requirement.
- [x] 2.2 `src/schema/definition.ts:294` (the `technical` field comment). Same
      treatment.
- [x] 2.3 `src/schema/definition.ts:503` (the `columns` union comment). This one
      is about widening, not tightening, so its reasoning stays correct. Confirm
      that and leave it alone, or adjust only the clause that implies a veto.
      Confirmed and left alone: it states a true consequence of narrowing, not
      a veto.
- [x] 2.4 `src/schema/compile.ts:69` (`validateDurations`). Rewrite the "Lives
      here, not as a Zod refinement, because" paragraph to lead with arming
      totality, matching the `timers` delta.
- [x] 2.5 `src/engine/definitions.ts`'s module header JSDoc (the "Publish is
      the enforcement point for every check that may tighten over time"
      paragraph, around lines 13 to 16). Reword it to the new two-criterion
      framing, matching the treatment task 2.4 gives `compile.ts:69`.
- [x] 2.6 `src/schema/compile.ts:458-461` (`checkColumnMapping`'s JSDoc, the
      "Seven rules, all write-path" opening). Reword it to lead with the
      two-criterion framing, matching the treatment task 2.4 gives
      `compile.ts:69`.
- [x] 2.7 `src/schema/definition.ts:280-281` (`FieldDef.columnMapping`'s doc
      comment, "a refinement on this read schema would make an
      already-published body throw on READ"). Same treatment as task 2.1 and
      2.2.

## 3. Update the rules files

- [x] 3.1 `.claude/rules/authoring-invariants.md`: rewrite the placement
      paragraph at the top. State the two criteria. Keep the unbypassable-check
      sentence, which this change does not touch.
- [x] 3.2 `.claude/rules/authoring-invariants.md`: every invariant bullet
      citing the read-path reason — at minimum the duration bullet, the
      `technical` bullet, the `SubprocessSpec.outputMapping`/
      contract-fields bullet, and the `checkPatterns` bullet (it argues the
      same placement logic in different words, "An uncompilable pattern would
      otherwise brick a step for the life of an immutable published version",
      and will not surface from a "deserializ" grep). Shorten each to name
      its placement and point at the rule once.
      - Final check: grep for "deserializ" across the file to catch any
        bullet a manual read might miss (the file has roughly a dozen-plus
        bullets). The `checkPatterns` bullet above is a known miss for that
        grep — check it by hand regardless of what the grep returns.
- [x] 3.3 `.claude/rules/process-contract.md`: the hashing and versioning
      passage. It states published-version immutability, which stays true. Check
      whether it also states the veto, and correct only that.
      Checked: the passage states immutability and pinning only, no veto
      language. Left unchanged.
- [x] 3.4 No rejecting test applies to the new "An authoring invariant argues
      its own placement" requirement (`definition-contract` delta spec). Its
      "A change states the placement it takes" scenario describes
      documentation/process behavior — that a change's spec names its
      placement and reasoning — not checkable engine behavior. Its other two
      scenarios restate general properties (poison-instance containment,
      publish-path rejection) already covered by existing tests. No new test
      is needed or possible for this requirement itself.

## 4. Update the project context

- [x] 4.1 `openspec/config.yaml`, the `context:` block. It carries the withdrawn
      reason verbatim: "a rule that may tighten over time belongs on the write
      path, since definition.ts also deserializes stored immutable bodies."
      Replace it with the two-criterion rule, in one sentence.
- [x] 4.2 `openspec/specs/timers/spec.md`, `## Purpose`, lines 14 to 17 (the
      paragraph opening "A `duration`, by contrast..."). This passage restates
      the withdrawn read-path-veto framing for duration placement, and sits
      outside any `### Requirement:` body, so the normal delta-merge mechanism
      this change's delta spec uses cannot reach it. At archive time,
      hand-edit it directly to the two-criterion placement framing — a direct
      edit of the archived spec, not a delta. Whether the archive tooling
      supports a Purpose-section delta on an existing capability is itself
      open; see design.md's Open Questions.
      Done ahead of archive, on explicit request: hand-edited the live spec's
      Purpose paragraph to the arming-totality / `definition-contract`
      framing, and split it into two paragraphs (it otherwise exceeded the
      antislop paragraph-length limit once the rewritten sentences landed).
      Verified with the antislop linter directly (the committed-content
      ratchet has nothing to diff pre-commit): 220 findings before this
      file's edit, 217 after — a drop, not a rise, with no new finding left
      in the touched paragraph. `git diff --check` and `git ls-files --eol`
      report clean.
- [x] 4.3 (MANDATORY) Grep the repo for "deserializ", "throw on READ",
      "would strand" and "unrehydratable" (excluding `openspec/changes/` and
      dated snapshots under
      `docs/`) as a sanity check for stray restatements of the withdrawn
      reasoning. This grep already found two real, live hits during review —
      `src/engine/definitions.ts`'s module header JSDoc (task 2.5) and
      `test/definitions.test.ts`'s two test comments (task 1.4) — so it must
      actually be run, not skipped, and any further hit it turns up fixed too.
      For example, `ROADMAP.md`'s stage 44 history entry repeats the phrasing,
      but that one is a completed-stage history entry and stays as written.
      Run: it turned up one further live hit beyond tasks 1.4/2.5,
      `.claude/skills/openspec-review-change/SKILL.md:119` to `:122`
      (already named in proposal.md's Impact list), now fixed. Every other
      hit — `docs/CODE_REVIEW-2026-07-29.md`, `docs/current-state.md`,
      `openspec/specs/cel-expressions/spec.md`, the live (pre-archive)
      `definition-contract`/`timers` base specs, `ROADMAP.md`'s history
      entry, `src/engine/transition.ts`, `src/schema/compile.ts`'s hash-
      reproducibility comments, and `src/schema/definition.ts`'s `columns`
      and `timerProvenance` comments — is either a different topic (hash
      reproducibility, org-chart accounts, arming races) or explicitly
      scoped elsewhere by this change's own proposal/tasks (cel-expressions,
      the dated snapshot, the completed-stage history entry, the live specs
      this change's delta reaches only at archive).

## 5. Record the interaction

- [x] 5.1 Add a coordination note to
      `openspec/changes/reject-unsatisfiable-required-readonly/design.md`'s
      Decisions section, stating that its check placement beside
      `checkTechnicalFields` no longer needs the read-path veto as
      justification — the unbypassable-check criterion this change introduces
      independently supports the same `compile.ts` placement. Its duplicated
      writer-set helper is unaffected: that stays for the package-boundary and
      type-mismatch reasons its own design.md states, independent of this
      change.
      Name explicitly, in that same note, the specific text needing
      correction before that sibling change archives:
      `openspec/changes/reject-unsatisfiable-required-readonly/specs/definition-contract/spec.md`,
      lines 61 to 62 ("This is a write-path check, not a read-path
      refinement. A stored immutable body has to keep deserializing whatever
      a later rule tightens."). That text merges verbatim into the live base
      spec when the sibling change archives, sitting beside the new
      two-criterion rule this change adds — reword it to the two-criterion
      framing before that archive happens.
      Add the note only. Do not restructure that change's proposal or tasks
      here.

## 6. Verification

- [x] 6.1 `openspec validate allow-schema-refinement-tightening --strict`.
      Result: "Change 'allow-schema-refinement-tightening' is valid".
- [x] 6.2 `bun run typecheck`, then `bun run build`. Both exited 0 in the
      devcontainer (engine `tsc --noEmit`, `form-ui`/`web` typecheck all
      clean; `web` production build succeeded).
- [x] 6.3 Full `bun test` with `DATABASE_URL` set, in the devcontainer. Pipe it
      through `scripts/gates/silent-green.sh` and report the pass count, the
      skip count and the database name the preload printed.
      Result: 3018 pass, 1 skip (an unrelated local-time-vs-UTC test, not a
      DB skip), 0 fail, across 169 files. Database: `workflow_engine_test`.
      `silent-green.sh` exited 0.
- [x] 6.4 `sh scripts/gates/prose.sh < /dev/null` over every Markdown file this
      change touches.
      `range.sh < /dev/null | prose.sh` reports "the push changes no
      Markdown, nothing to check" because nothing here is committed yet, so
      the committed-content ratchet has no diff to read. Verified the intent
      by hand instead: ran the antislop linter directly on every touched
      Markdown file (`tasks.md`, `authoring-invariants.md`,
      `openspec-review-change/SKILL.md`, and the sibling change's
      `design.md`) and compared against each file's pre-edit content. Two
      findings this change's own edits introduced got fixed (an em-dash pair
      in `SKILL.md`, a long sentence plus an em-dash and passive voice in the
      `design.md` coordination note); every other finding in those files
      predates this change and stays, per the ratchet's own rule. The gate
      itself reruns clean once these edits are committed and pushed.
- [x] 6.5 `sh scripts/gates/whitespace.sh < /dev/null`.
      Exited 0, but vacuously: like the prose gate, it reads the committed
      range, and nothing here is committed yet. Verified by hand instead:
      `git diff --check HEAD` over every touched tracked file found no
      trailing space and no blank line at EOF; `git ls-files --eol` showed
      `w/lf` for all of them. The untracked sibling `design.md` (task 5.1)
      isn't covered by `git ls-files --eol`, so checked its raw bytes
      directly: no CR bytes, no trailing whitespace, no blank line at EOF.
- [x] 6.6 No browser check. Nothing here alters UI or engine behavior.
