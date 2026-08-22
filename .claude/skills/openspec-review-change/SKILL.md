---
name: openspec-review-change
description: Use when an OpenSpec change's artifacts (proposal, specs, design, tasks) are fresh or edited and no code exists yet. Reviews the plan before /openspec-apply-change and reports Critical, Warning and Suggestion findings to work in first.
---

# Reviewing an OpenSpec change before apply

Review the plan, not the code. No code exists yet, so every finding concerns
the four artifacts and this repo's contract.

This is not `openspec-verify-change`. That skill checks a finished
implementation against the artifacts.

## Depth

This review has no budget. A change that carries no fault is worth more than
the cost of finding one. Run the review to the end before `/openspec-apply-change`.

- Read every artifact end to end. No sampling. No `head`.
- Read the whole base spec of every MODIFIED capability.
- Trace every symbol the change modifies, not the interesting ones.
- Walk every checklist item against every artifact.
- Never stop at the first Critical finding. Report all of them.
- Never end the review early because the change reads well.

| Thought | Reality |
|---|---|
| "The remaining spec files look similar" | Similar files hide the mismatched header. Read them. |
| "This change is small" | Blast radius does not follow diff size. Trace it. |
| "The context window fills up" | Spread the reading over more steps. Never drop a file. |
| "One Critical sends it back anyway" | The user works in all findings in one pass. Find them all. |
| "The design reads well" | Prose quality is not a check. Walk the checklist. |
| "This part is fine without a check" | Then the check costs one line. Run it. |
| "The symbol is there, so the claim holds" | Existence is not wiring. Trace who reads it. |

## Steps

1. **Resolve the change.** Take the name from the user. Otherwise run
   `openspec list --json`. More than one candidate: ask. Never guess.
2. **Run `bun run scripts/openspec-review-check.ts <name>` (inside the
   devcontainer).** It runs `openspec validate <name> --strict` itself. It
   folds every fault in at the severity the CLI gave it. `ERROR` becomes
   Critical. `WARNING` becomes Warning. It also runs four checks `--strict`
   does not run.

   <!-- antislop: allow sentence-length -->
   <!-- Known linter miscount: the quoted code spans merge this paragraph's sentences into one count; each sentence reads under 20 words split at its own period. -->
   A MODIFIED or REMOVED requirement header must match a base spec header
   character for character. `--strict` only checks scenario completeness
   when a header happens to match a base one. A reworded header pairs with
   nothing and draws no complaint. It then archives as an added requirement,
   not a modified one.

   <!-- antislop: allow sentence-length -->
   <!-- Known linter miscount: the quoted code spans merge this paragraph's sentences into one count; each sentence reads under 20 words split at its own period. -->
   An ADDED requirement must not duplicate a base header verbatim.
   `proposal.md`'s New/Modified Capabilities bullets must match the
   capabilities `specs/` holds, in both directions. `design.md` must carry
   its required Migration Plan and Open Questions sections.

   Carry every line the script prints into the report at the severity it
   printed. This step is text-matching, not judgment. A clean run clears
   none of steps 3 through 8.

   If the script cannot run at all, fall back to `openspec validate <name>
   --strict` by hand for that one piece. Keep going: the rest of this
   step's checks still need the manual read below.
3. **Read all of it.** `proposal.md`, every `specs/**/spec.md`, `design.md` and
   `tasks.md`. Read `openspec/specs/<capability>/spec.md` for each capability
   the change marks MODIFIED or REMOVED. Read
   `.claude/rules/process-contract.md` and
   `.claude/rules/authoring-invariants.md`. Read `ROADMAP.md` and
   `docs/decisions.md`, which holds "Open questions" and "Decided, not yet
   built".
4. **Verify every codebase claim.** The artifacts name paths, symbols,
   functions, tables, routes and roles. Confirm each one exists. Use the
   knowledge graph (`search_graph`, `get_code_snippet`, `trace_path`) or Read.
   A claim you did not check is not a finding.

   A claim reading "already exists", "already has a home", or "the contract
   already carries it" states two things, not one. The symbol exists, and
   something reads it. Existence is a grep.

   The second half needs
   `trace_path(<symbol>, mode="data_flow")`. A manual walk answers it too.
   Walk to the point the artifact claims the value reaches: the participant's
   screen, the stored row, the guard's context. Confirm both halves before the
   claim counts as checked.

   `field-catalog-redesign` measured that gap. `FieldDef.default` parses in
   `definition.ts` and type-checks in `compile.ts` and `cel/check.ts`. No
   runtime code reads it. `resolveFields` fills a field's value from
   `instance.data` alone. `ResolvedViewField` declares no `default` key, and
   `startInstance` creates an instance with `data: {}`. The proposal's "the
   contract carries `default` … already has a home" passed an existence check.
   It would have shipped an editor whose output no participant ever sees.
5. **Trace the blast radius.** Run `trace_path(<symbol>, mode="calls")` for
   every symbol the change modifies. List the consumers. Compare that list
   against the files the tasks touch.
6. Walk the checklist.
7. Write a fix for every finding. Check each fix once.
8. Report.

## Checklist

**Contract.** CLAUDE.md and `.claude/rules/` are the authority, the artifacts
are not.

- Does the change cross a hard v1 boundary? One active step per instance, no
  parallelism, synchronous call-and-return subprocesses.
- Does it contradict a load-bearing rule? The candidates:
  - `id` as the sole reference anchor, `key` as a mutable slug
  - the hash over `ProcessBody` alone
  - CEL purity and guard totality
  - trigger order and the post-commit outbox
  - a step's paths all-manual or all-automatic
  - contract-pinned subprocess binding
  - the `{ type, config }` plugin envelope
- Does it touch `src/schema/definition.ts`? A tightened refinement there makes
  an already published body throw on READ. Such a check belongs in
  `src/schema/compile.ts`, unless the design argues why the read path stays
  safe.
- Does it add an authoring-time invariant? Then the change ships a test that
  rejects a violating input. It also updates `docs/authoring-guide.md` when a
  rule that guide states changed.

**Fit and blast radius.** The change lands in a running system, and it lands
before the stages that follow it.

- Does a consumer break? Compare the traced consumer list from step 5 against
  the files the tasks touch. A consumer the tasks leave untouched is a break,
  unless the design states why that consumer survives unchanged.
- Does the change reshape `ProcessBody`? Then `definitionHash` moves,
  and every published body and every pinned instance moves with it. The design
  answers this, or the finding is Critical.
- Does the change add persisted state? A column, a table, a status, an event
  kind. State what happens to the rows written before it. Additive is a valid
  answer. Silence is not.
- Does the change decide an open question in passing? `ROADMAP.md` and
  `docs/decisions.md` hold the parked questions.
- Does the change implement part of a later stage in a shape that stage cannot
  use? Name the stage and the conflict.
- Find the one-way door. Ask one question for each later stage: does that stage
  need this design undone? A design a later stage must undo belongs in the
  design's Risks section. Silence there is Critical.
- Does the change hardcode where this repo registers? Extensions resolve through
  the `{ type, config }` envelope and a registry. A second special case beside a
  registry is a Warning.
- Does the change add a second mechanism for one concept? Two ways to store one
  thing is a Warning. Name the mechanism it duplicates.

**Coherence**

- Every capability the proposal lists has a delta spec file, and the reverse.
- Every delta requirement traces to at least one task.
- The design's Decisions cover the non-obvious choices the specs assume.
- No decision contradicts a requirement.
- The proposal's Impact names every file the tasks touch.

**Delta integrity**

- MODIFIED requirement headers match the base spec headers character for
  character. A reworded header adds a requirement instead of modifying one.
- ADDED requirements do not already exist in the base spec.
- Every requirement carries at least one `#### Scenario:` and SHALL wording.

**Tasks**

- Ordered so each group leaves the tree green. Schema comes before its use.
- New invariant: a test that rejects a violating input. New route: an
  authorization test.
- The last group is Verification. It runs `bun run typecheck` and the full
  `bun test` suite with `DATABASE_URL` set. `openspec/config.yaml` requires it.
- No task reads "consider" or "investigate". That is an Open Question.

**Repo conventions**

- `design.md` carries Migration Plan and Open Questions. `openspec/config.yaml`
  requires both beyond the base template.
- UI work in `packages/web` or `packages/form-ui` routes through the design
  skills.

## Severity

| Level | Meaning | Test |
|---|---|---|
| **Critical** | The plan as written produces wrong or contract-breaking work | A contradicted invariant. A delta that will not apply. A requirement no task implements. A named symbol that does not exist. A broken consumer. A one-way door the design does not name. |
| **Warning** | The plan works, but a gap returns as rework | A missing test for a new invariant. An uncovered scenario. An unstated assumption. A doc left untouched. |
| **Suggestion** | Quality | Naming. Ordering. A simpler alternative. A missing Open Question. |

Every finding carries six parts:

- severity
- artifact and section, such as `design.md § Decisions`
- the fault, in one sentence
- why it matters
- the fix
- the verdict of the check on that fix

A finding you cannot point to in a file is not a finding. No Critical finding
is a valid result. Say so in one line. Never promote a Warning to fill the
section.

## Fixes

Every finding carries a fix, at every severity. Then check that fix once.

- Write at least one concrete fix. Name the file, the section, and the wording
  or the task to add. A fix the user cannot paste is not a fix.
- Check the fix once. Ask three questions of it. Does it contradict an
  invariant or another requirement? Does it break a consumer? Does it need a
  task the tasks file lacks?
- Record the verdict beside the fix. "Holds" ends the check.
- When the check refutes the fix, the corrected fix is the output of that
  check. That ends the pass. Never open a second round.
- Two findings can share one fix. Say so, and check it once.

## Output

Print the findings grouped by severity. Critical comes first. Write no report
file. The findings exist for the user to work into the artifacts. A stale
`review.md` beside `design.md` is worse than none.

Close with one line. It gives the count per severity, and it states whether the
change is ready for `/openspec-apply-change`. It is ready when no Critical finding remains.

Then stop. Touch the artifacts only when the user asks.
