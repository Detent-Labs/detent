## Context

`src/schema/definition.ts` is both the authoring contract and the read-path
deserializer: every `resolveBody` cache miss re-parses a stored body through
these same Zod schemas. Two independent gaps let invalid definitions
publish cleanly and fail only at runtime, as a parked instance with no
diagnostic:

1. `type: "subprocess"` and the `subprocess` spec are independent optional
   fields; a subprocess step with no wait-state guarantee (all-automatic
   paths, per the existing `subprocess-execution` requirement) is
   authorable; and a process's `initialStep` may be terminal, which
   `createInstance` (`src/engine/store.ts:230`) does not detect — it
   hardcodes `status: "running"` regardless of the target step, so the
   instance can never complete and, as a subprocess child, never returns.
2. `processBody`'s `superRefine` (`definition.ts:457-518`) checks only two
   uniqueness facts — step ids and top-level field ids — while
   `src/cel/check.ts::dataSchema` and `src/cel/eval.ts::fieldKeyById` both
   recurse into `group` sub-fields and flatten them into the same `data`
   namespace as top-level fields. A nested id or key can therefore collide
   with a top-level one (or with another nested one) across the whole
   expression layer with nothing catching it. View-ref resolution
   (`definition.ts:493-495`) disagrees in the other direction — it is
   top-level-only, so a view legitimately referencing a group sub-field is
   wrongly rejected.

## Goals / Non-Goals

**Goals:**
- Every new invariant lives in `src/schema/definition.ts`, enforced on
  every parse (authoring and read-path), with a test that rejects a
  violating definition.
- One authoritative recursive field-collection routine, shared by
  id/key-uniqueness, view-ref resolution, and the two CEL modules that
  already do this walk independently — so the four cannot drift again.
- Close every Family A and Family B gap named in the proposal.

**Non-Goals:**
- No change to `compile.ts` or `definitions.ts` (the publish pipeline) —
  none of the `definition-contract` checks need a child process body or any
  I/O; they are all single-body structural facts.
- No attempt to fully close the "subprocess child spawned at an
  already-terminal initial step never notifies its parent" gap (see Risks) —
  only the "permanently running" half of Family A item 3 is fixed here.
- No registry-backed plugin `config` schema validation (tracked separately
  in `CLAUDE.md` as a decided-but-unbuilt item).
- No change to migration's child-link repair behavior (explicitly out of
  scope per the proposal — a separate, migration-semantics change).

## Decisions

### 1. Placement: `definition.ts` Zod refinements, not the publish path

`definition.ts` already carries two structural-identity checks at this
layer (duplicate step ids, duplicate top-level field ids), and the project
convention (`CLAUDE.md`) draws the write-path line at checks that **may
tighten over time** — CEL type-checking and duration bounds, where a
stricter future rule must not retroactively invalidate an already-published
body. Every check in this change is the opposite kind: a closed structural
fact about a single body, fully decidable from the body alone, that is
already wrong today and will not become "more wrong" under a future rule
change. Extending the existing superRefine blocks keeps the schema's
identity-invariant style internally consistent, rather than having some
uniqueness checks at read-path and others at write-path with no principled
line between them.

Alternative considered: put the new checks in `compile.ts` alongside
`validateDurations`, matching CEL/duration placement. Rejected — these
checks need nothing from the write pipeline (no store, no async, no child
body), and moving them there would mean `processBody.parse()` alone (used
directly by tests, and by any future tool or editor validating a draft
before submission) silently accepts a structurally broken body, weakening
"fail close to the author" for no corresponding benefit.

Residual risk (see Risks below): a *stored* body that happens to violate a
new check becomes unrehydratable on its next read, which is a strictly
wider blast radius than a write-path check (which only affects new
publishes). Accepted for the reason above; mitigation is a pre-deploy audit,
not a design change.

### 2. One shared recursive field walk

Export a single `collectFieldsDeep(fields: FieldDef[]): FieldDef[]` (depth-
first, recursing into `group.fields`) from `definition.ts`. It replaces:
- the new id/key-uniqueness superRefine's own field traversal,
- the view-ref resolution check's field-id set (currently top-level-only),
- `src/cel/check.ts::dataSchema`'s inline walk,
- `src/cel/eval.ts::fieldKeyById`'s inline walk.

`definition.ts` stays free of any CEL dependency (per existing project
rule) — this is a plain data-shape utility; `cel/check.ts` and `cel/eval.ts`
already import types from `definition.ts`, so importing one more function
does not introduce a new dependency direction. This is the one change that
touches files outside `definition.ts` and `test/`: `src/cel/check.ts`,
`src/cel/eval.ts`, and their tests (`test/cel.test.ts`), which must keep
passing unchanged since the walk's behavior does not change, only its
location.

Alternative considered: leave the three walks independent and just add the
missing uniqueness/view-ref checks with their own ad-hoc recursion.
Rejected — that reproduces the exact failure mode the proposal is fixing
(four places computing "the field set" that can silently drift apart);
unifying them is what makes "all four agree" a structural guarantee instead
of a convention someone has to remember.

### 3. Terminal `initialStep`: a `createInstance` status fix, not a publish rejection

An earlier draft of this design rejected a terminal `initialStep` at
publish, reasoning it had no valid use case. That reasoning was wrong: a
terminal `initialStep` is exactly what a migration-target version looks
like when the wait-state instances are relocating onto has been collapsed
into a terminal step in the new version (`test/migration.test.ts` "6.2
migration onto a terminal step yields completed" — existing, passing
behavior that publishes such a body and migrates a running v1 instance onto
it, expecting it to land `completed`). Rejecting the shape at publish broke
this test outright, proving the shape is not an authoring mistake to
forbid; it is `createInstance`'s hardcoded `status: "running"`
(`src/engine/store.ts:230`) that is wrong when the target happens to be
terminal.

The fix is therefore in `createInstance`: derive `status` from the initial
step exactly as `planStepEntry` derives it for a transition target
(`target.terminal ? "completed" : instance.status`), rather than assuming
`"running"` unconditionally. This is a small, low-risk, single-line-of-logic
change with a direct precedent already in the codebase, and it fully closes
the "permanently running" half of Family A item 3 for every case —
top-level creation and subprocess-child spawn alike.

It does not close the other half: a subprocess child spawned directly at an
already-terminal initial step still never notifies its parent, because only
the transition path (`planStepEntry`, `target.terminal && instance.parent`)
enqueues the `core.returnSubprocess` action — `createInstance` has no
equivalent enqueue, and adding one would also need a new event kind to
carry that action's `ActionOutcome` (creation writes no `HistoryEntry`,
exactly the reasoning behind the existing `subprocess.spawn-enqueued`
event). That is real, separate engine work spanning `store.ts`,
`subprocess.ts`, and the `InstanceEvent` union — out of scope for a change
whose other 90% is authoring-time schema validation. See Risks.

### 4. Dead code removal folded in

The "timer `targetPath` counts as an exit" branch (`definition.ts:404-406`)
is unsatisfiable given the existing rule that a timer's `targetPath` must be
one of the step's own outgoing paths (`definition.ts:496-499`): a step with
zero paths can never have a timer whose `targetPath` resolves. Removed as
part of this change since it sits in the same `superRefine` block being
edited and every existing test continues to pass with it gone (nothing
exercises it, because nothing can).

## Risks / Trade-offs

- [Risk] A body already persisted (in a real `definitions` table, if one
  exists outside test fixtures) that happens to violate a new check becomes
  unrehydratable on its next `resolveBody` read, per Decision 1.
  → Mitigation: this engine has no deployed editor or production instance
  population yet (roadmap item 4 is still pending); the practical blast
  radius today is `examples/*.json` and test fixtures, both verified clean
  by the test suite this change adds to. Before deploying this change
  against any real persisted data, audit existing `definitions.body` rows
  with `processBody.safeParse` (the same schema `resolveBody` already
  parses through) and remediate any that fail before the deploy.
- [Risk] Unifying the three field-walk implementations (Decision 2) touches
  `cel/check.ts` and `cel/eval.ts`, which are outside this change's
  otherwise single-file blast radius.
  → Mitigation: the walk's traversal order and output are unchanged, only
  relocated and exported; `test/cel.test.ts`'s existing group-field
  scenarios (including all three `examples/`) are the regression guard.
- [Trade-off] Coupling `type`/`subprocess` and requiring all-automatic paths
  on a subprocess step forecloses no expressible v1 behavior — no test or
  example relies on the invalid combinations — so this is a pure tightening
  with no compatibility cost against the current example set.
- [Risk] A subprocess child spawned directly at an already-terminal initial
  step now correctly reaches `status: "completed"` (Decision 3) but still
  never notifies its parent, which stays parked at its subprocess step
  forever with nothing recording why — the same silent-park failure mode
  this whole change targets, in a corner this change does not reach.
  → Mitigation: this is a pre-existing gap, not one this change introduces
  or worsens (before this change the child was *also* never returned to its
  parent, and was additionally stuck incorrectly `"running"` besides).
  Tracked as a follow-up rather than solved here — see design.md Decision 3.

## Migration Plan

Almost entirely additive validation with no schema shape changes: the
`definition-contract` refinements add only new rejection paths at parse
time, and the field-walk relocation (Decision 2) is behavior-preserving.
The one runtime behavior change is `createInstance`'s status derivation
(Decision 3, `instance-creation` capability): a newly-created instance whose
`initialStep` is terminal now gets `status: "completed"` instead of
`"running"` — strictly a bugfix, since no other code path could have
observed or relied on a terminal-initial-step instance staying `"running"`
in a way that was ever correct. Land the refinements, the shared field-walk
export, the `createInstance` fix, and the accompanying tests together; run
`bun test` with `DATABASE_URL` set (full suite, not a single-file rerun)
and `bun run typecheck` before merge. Rollback is a plain revert — no data
migration accompanies this change in either direction.

## Open Questions

None outstanding; the placement question the proposal flagged as
load-bearing is resolved by Decision 1.
