## SummitBPS — Full Code & Spec Review

Baseline evidence: tsc --noEmit clean; bun test 336 pass / 0 fail / 0 skip against Postgres. The architecture is genuinely strong — the OCC
token, the plan/apply seam, the transactional outbox with event-carrier outcome routing, the subprocess return's single-lock transaction, and
duration-validation placement all survived adversarial review. The findings cluster in three themes: holes in the publish path, crash-window
liveness, and validation edges — plus spec-sync debt.
Critical (both verified by me, end-to-end)
1. compileProcessBody discards its parse result — unknown keys get hashed, then stripped on read, permanently bricking instances.
src/schema/compile.ts:102-104 returns/spreads the raw input; all schemas are Zod strip-mode, so an extra key anywhere in an authored body
(editor annotation, typo'd optional) is never rejected. It flows into definitionHash and the stored jsonb (src/engine/definitions.ts:99-127),
but every read re-parses via processBody.parse (definitions.ts:38-40) which strips it — so rehydrate recomputes a different hash and throws
PinMismatch (src/engine/store.ts:321-322) for every instance pinned to that version, forever, through the documented-correct creation path.
Also breaks "identical bodies get identical hashes." Fix: body = authoredProcessBody.parse(body) (and the same on the publishedProcessBody
early return).
2. CEL authoring validation is not wired into publish — the "publish error, not runtime error" promise is void.
validateProcessBody (src/cel/check.ts:206) has zero production callers (grep-verified: only tests). publishBody runs durations + sink compile
+ cross-process only. A broken guard publishes cleanly; guard totality then turns it into a silently-stuck wait-state, and a broken
inputMapping dead-letters and parks the parent. This contradicts openspec/specs/cel-expressions/spec.md:83-85, CLAUDE.md ("enforced at
PUBLISH"), config.yaml, and a comment in compile.ts itself. validateMigrationSpec is wired (migration.ts:129), which disguises the omission.
One call in publishBody closes it — but see finding 8 first.
Important — runtime correctness & liveness
3. Spawn-handler redelivery skips the very repairs redelivery exists for (verified). subprocess.ts:61-62 returns on exists without re-running
the drive-to-rest (line 95) or the cancel-orphan backstop (lines 100-104). Crash after createInstance → redelivery marks the row delivered
and the child is parked on its automatic initial step forever (the shipped credit-check shape), or left running under a cancelled parent. Two
reviewers found this independently.
4. Run-to-rest is commit-then-cascade everywhere, with no durable resume flag (transition.ts:352-353, 416-417, subprocess.ts:95, 189). A
crash between a commit and its cascade leaves an instance at rest on an all-automatic step with resolve_state='idle' — nothing re-drives it,
no event records it. Migration already demonstrates the fix pattern (set resolve_state='pending' inside the commit).
5. An unmatched child.outcome permanently strands the parent, unrecorded (verified). subprocess.ts:181 commits the writeback, marks the row
delivered, and returns; the child namespace exists only during that delivery, so no re-resolution can ever match. Trivially reachable:
independently cancel a child — its return carries the reserved "cancelled" outcome, which both shipped examples fail to guard, and neither
declares the bounding timer the code comment assumes. Needs at least an event (timer.unarmed precedent) and ideally a publish lint (outcome
coverage ∪ timer present).
6. Cancel cascade is best-effort and unrepairable (verified). The child sweep (transition.ts:388-397) runs after the parent's commit with no
fault isolation, and the status !== "running" gate at line 378 sits before it — so re-invoking cancel on the already-cancelled parent no-ops
without re-sweeping. One OCC loser, resolver miss, or crash → running children under a cancelled parent, permanently, and retrying can't fix
it.
7. A faulted instance can take manual and timer transitions (verified). markFaulted flips status without a seq bump (transition.ts:456-459);
executeManualTransition never checks status (transition.ts:333-352) and the commit predicate is instance_id + transition_seq only (line 288).
The action-handlers spec calls faulted a dead-end park; the code enforces that for nothing — asymmetrically, a faulted instance can't be
cancelled but can be advanced, and a faulted child advancing to terminal enqueues a real subprocess return.
8. Migration plan-freeze race (verified). migrateInstances reads the plan (migration.ts:407) before stamping applied_at (lines 418-419); a
registerMigrationPlan in between passes its WHERE applied_at IS NULL guard — population migrates under spec A while spec B is stored and
frozen. The spec names this exact hazard. Fix: UPDATE … SET applied_at = COALESCE(…) … RETURNING spec.
9. Migration's child-link repair misbehaves when a parked subprocess parent is relocated. migration.ts:380-384 repoints children
unconditionally: mapping subprocess step A→B applies B's outputMapping to the old child's return and orphans one child; mapping
A→non-subprocess makes the old child's return dead-letter (return: not a subprocess step) with the child orphaned forever. validatePlan
imposes no constraint, and the repair behavior appears in no spec at all.
10. type: "subprocess" and the subprocess spec are uncoupled. A spec-less subprocess step publishes (cross-process validation iterates
s.subprocess and skips it, definitions.ts:52-53), then dead-letters at spawn and parks forever — a statically detectable error surfacing at
runtime. Also unenforced: the spec's "subprocess step MUST have all-automatic paths" (a manual path off it orphans the running child), and
nothing forbids a contracted child whose initialStep is terminal (created running, never returns).
11. Identity/uniqueness enforcement thins out past steps and top-level fields. Unchecked: path ids, action ids, timer ids, dataSource ids,
group-nested field ids (definition.ts:481-482 covers only the two). Duplicate action ids reachable in one transition collide on the
deterministic idempotency key → one handler run silently suppressed; duplicate timer ids break migration's id-keyed reconciliation.
Separately, field key uniqueness is unenforced while CEL resolves everything by key — two fields keyed amount silently shadow each other in
every guard, and a dataSource keyed result/child rewires check-time scoping.
12. Check/eval drift inside the CEL layer (verified). Authoring registers data/instance/actor at Action.output sites
(check.ts:82-91,141-144); runtime supplies {result} only (eval.ts:144-146, whose comment misstates the authoring scope) — result.net +
data.amount type-checks, then throws on every delivery, re-invoking the external handler each retry. Similarly, data sources are registered
at check for guards/mappings but supplied at runtime nowhere; and onCancel outputs are the one action position collect() never visits
(durations and structural checks do cover it).
Spec & docs
- Living contradiction: transition-execution/spec.md:96-99 still asserts creation does not spawn for a subprocess initialStep;
subprocess-execution requires it and store.ts:260-298 does it. The initial-step-spawn change updated two specs and missed the third.
- cel-expressions says guards reference fields by fieldId; automatic-transitions, timers, and the code say by key (a field_<uuid> isn't even
a valid CEL identifier). Internally inconsistent since the CEL wiring change.
- CLAUDE.md states as fact: runtime ids are UUIDv7 (code: v4 everywhere, acknowledged in code comments), registry validates plugin config at
publish (nothing does), "~230 tests / ~80 skip" (now 336/176 DB-gated).
- The definition contract itself has no owning spec — the most load-bearing artifact is governed only by CLAUDE.md prose and
validate.test.ts.
- Nits: two spec Purposes still read "TBD - update after archive" (timers, writeback-reresolution); runtime-events' Purpose predates the
fourth kind; config.yaml contradicts the duration-validation placement rule; example expense-approval.json carries a wrong-format
definitionHash (sha256 of the empty string) and non-UUID ids in the subprocess examples; outbox delivery order within one transition is
unspecified and untiebreakable (created_at shared).
Minor (reviewer-confirmed, spot-checked)
Stale past next_timer_at is never self-healed and poisons the head of every 500ms scan batch (timers.ts:43, transition.ts:536-538); outbox
per-row mark transaction sits outside the try, so one row's transient DB error stalls the rest of the claimed batch for a lease period
(outbox.ts:153); instantFromValue rejects real Postgres timestamptz text (6-digit fractions, +00 offsets) despite its comment
(duration.ts:52); deterministic Action.output eval errors retry the external handler 5× before dead-lettering (outbox.ts:70); a faulted
instance leaves a dangling resolve_state='pending' (resolution.ts:96-97); fireTimer's transition branch will fire a never-armed timer for a
direct caller (transition.ts:514-529); the publish-race comment overclaims what the PK backstops (definitions.ts:90-93); coerceJson
NaN/Infinity→null and bytes→numeric-keyed-object losses; the "timer with targetPath counts as an exit" invariant arm is unsatisfiable dead
code (definition.ts:404-406 vs 497-499).
Test gaps (highest-value first)
1. ~18 structural invariants have no rejecting test (duplicate step/field ids, missing priority, multiple guardless autos, XOR rules,
contract rules, …) — roughly half the superRefine branches are deletable without a named failure.
2. No publish-rejects-invalid-CEL test (impossible until #2 is fixed — wire it and the test together).
3. No crash-redelivery tests: spawn redelivered after partial first attempt; return redelivered mid-cascade.
4. No unmatched-child.outcome test, including the cancelled-child path the examples embody.
5. No faulted-status gating test in either direction; no partial-cancel-cascade or concurrent double-cancel test; no migration population >
BATCH(100); no registration-vs-invocation race test.
Suggested order of attack
1. #1 and #2 — small, mechanical, catastrophic-if-hit; each plus its regression test. (#2's fix will surface #12's drift — decide the
Action.output scope explicitly at the same time.)
2. #7 status gate + #8 atomic stamp — one-line-shaped fixes.
3. The liveness cluster (#3, #4, #5, #6) as one OpenSpec change — same root pattern (durable resume via resolve_state, plus an event for the
unmatched-outcome strand).
4. Validation-edge sweep (#10, #11, + onCancel CEL site) in definition.ts/publish.
5. Spec sync pass (transition-execution sentence, cel-expressions fieldId→key, CLAUDE.md facts, Purposes) — cheap, prevents the next
contradiction-driven mistake.