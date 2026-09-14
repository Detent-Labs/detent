## Context

`cancelInstance` exists at two layers today, and the split matters to this
design:

- `src/engine/transition.ts::cancelInstance(instance, body, actor, db,
  resolveBody)` is the low-level engine primitive. It performs the
  synthesized transition to the cancel-sink and trusts its caller completely.
  It runs no authorization check of its own. `src/engine/subprocess.ts`'s
  downward child-cascade calls this directly, with `SYSTEM_ACTOR`, bypassing
  every authorization layer above it.
- `src/runtime/api.ts::cancelInstance(instanceId, actor, db)` is the
  participant/operator-facing wrapper. It authorizes `actor` first, trying
  `system:cancel-any` load-free, then a per-process `"cancel"` grant, then
  falling back to `instance.startedBy === actor.id`. Only then does it call
  the engine primitive (imported locally as `engineCancelInstance`).

`getInstanceView` (also in `src/runtime/api.ts`) already resolves several
read-model fields this same way: `assignment`, `baseLocale`, and the form
draft. Each is a small, focused requirement. The giant "resolve a
display-ready view" requirement carries none of them. `canCancel` follows that
established pattern.

See `proposal.md` for the motivation (CapEx-at-the-CEO example) and the six
spec deltas for exact requirement text.

## Goals / Non-Goals

**Goals:**
- Let a process owner declare a process, or an individual step, as
  non-participant-cancellable.
- Guarantee, structurally and not just by convention, that `system:cancel-any`
  and a per-process `"cancel"` grant remain unconditional. No combination
  of `cancellable`/`Step.cancellable` can produce an instance nobody can
  clean up.
- Give the read model (`InstanceView.canCancel`) and the write path
  (`cancelInstance`'s own authorization) one shared predicate. Then a UI
  decision and an actual authorization decision cannot disagree.
- No-code authoring for both new fields, reusing existing studio surfaces
  rather than adding a new tab or dialog.

**Non-Goals:**
- No plugin/resolver mechanism exists for "who besides the starter may
  cancel." The brainstorming conversation considered and rejected this: the
  two role/grant tests already cover every case the requester named. A
  `ponytail:` comment at the gate's call site marks this as the extension
  point if a real need appears.
- No change touches the cancel-sink injection, `onCancel`, the cancel audit
  record, or subprocess-cancel-propagation mechanics. All three stay
  unaffected. The propagation delta spec now states this explicitly.
- No new HTTP route and no new error shape: rejection stays the existing
  `AuthorizationError` → `403`.
- The admin app's cancel control keeps its OUTCOME unchanged for an
  operator using `system:cancel-any` or a process-scoped `cancel` grant.
  Those are exactly the two branches this change leaves untouched. An
  admin-role-only operator holds `system:admin` but neither of the above,
  and may also be the instance's own starter. When that is true, the
  cancellable gate newly reaches them via the starter-fallback branch. This
  design intends that outcome deliberately, distinct from a regression. At
  that moment, that operator acts as the instance's participant, exercising
  only the starter's own access.
- No data migration for already-published process versions. Both fields are
  optional and default to today's behavior (everywhere cancellable). A
  pinned body does not need a rewrite.

## Decisions

**Two plain optional booleans, not a resolver/plugin registry.** Considered a
`Step.cancellableBy: { type, config }` mirroring `Assignment.strategy`, since
that is the project's existing pattern for "who may act here." Rejected: the
only distinction ever named is starter-vs-operator, which the existing
role/grant/starter split in `authorization` already draws. A registry would
add a resolution step and a new registry file. It would also add a new
publish-time config-schema check. That check would cover a distinction the
code already makes elsewhere. Both `ProcessBody.cancellable` and
`Step.cancellable` cover every case the CapEx example and the brainstorming
conversation named instead. Each is an
optional boolean with the other as its inherited default. No cross-field Zod
refinement applies, so override is valid in either direction, and
`compile.ts` does not need a change.

**The gate lives only in the authorization wrapper.** It has exactly one
caller. That caller is the `instance.startedBy === actor.id` branch inside
`src/runtime/api.ts::cancelInstance`. `src/engine/transition.ts::cancelInstance`
never calls it.

This makes the bypass structural. It relies only on structure, a guarantee
no future developer needs to remember to maintain. Both
`system:cancel-any` and the per-process grant branch physically never reach
the new check. Neither does the subprocess cascade,
which calls the engine primitive with `SYSTEM_ACTOR` and was never
authorization-gated to begin with. Any future participant-facing entry point
to cancel MUST route through the `runtime/api.ts` wrapper for this guarantee
to keep holding. That is worth a code comment at the engine primitive's
definition too.

**One shared predicate for `cancelInstance` and `getInstanceView`.** Both
need it. They must agree on "may this actor cancel this instance right
now." One answer enforces it; the other reports it. Extracting a
single async predicate is the only way to guarantee the two cannot disagree.
`requireSubmitAuthority` already does this for `submitAndTransition` and
`saveInstanceDraft`, keeping them from drifting apart; the new predicate
follows the same pattern. The pure half, `isCancellableAtStep(body, step):
boolean`, touches no database; it is a separate, trivially testable unit.
The full predicate composes it with the existing role/grant checks.

**UI location: extend what exists, add nothing new.** The studio has no
"process settings" screen today. The header bar's `⋮` menu already carries a
"Process, saved with the draft" group. That group mutates `key` and
`baseLocale` in place. It is gated by `disabled={!structureActive}`.
`ProcessBody.cancellable` becomes one more row there. `Step.cancellable`
becomes a new section on the
step page, alongside Assignment. Both are "who may act on this step"
concerns. It shows only for task and subprocess steps. A terminal step's
instance has left the running state the field governs, so the section does
not apply.

**A plain checkbox at process level, a three-state `<select>` at step level,
resolved via `/impeccable shape`.** Process level comes first.
`ProcessBody.cancellable` sits at the root of the inheritance chain. Nothing
sits above it to "inherit" from. A
tri-state control there would offer a meaningless third setting. It becomes
one more plain checkbox row in the header bar's existing "Process, saved
with the draft" `⋮`-menu group. It sits beside `key` and `baseLocale`, with
the same `disabled={!structureActive}` gating.

`Step.cancellable` genuinely has a parent default to defer to. It keeps
three explicit states: "Inherit from process," "Cancellable," and "Not
cancellable." It uses a plain `<select>` instead of a custom segmented
control. Operate-mode guidance is explicit here: reuse the page's existing
form-control vocabulary rather than invent one. The control renders as a new
"Cancellable" section in the step page's leading column, beside Assignment.
It shows for task and subprocess steps only.

A small muted note beneath the select names the resolved effective outcome
whenever an author selects "Inherit." It mirrors the existing
`stepSections.terminalNoPathsOrTimers`-style note pattern. This way, an
author sees the real result without jumping to the process-level setting.

**Disabled-with-reason, kept visible, for the participant-facing Cancel
control.** The "Discard case" control stays visible. It becomes `disabled`
when `canCancel` is `false`, with a line beneath it naming why. The pattern
reads: "{starter} can no longer discard this case. The point where they
could withdraw it has passed."

A starter who used the control before and
loses access to it (the CapEx-reaches-the-CEO case) deserves to know why.
The button's disappearance should never be a mystery. `task.discardCase`'s
catalog entry gains a sibling key for this explanation, DE/EN, following the
existing per-locale catalog pattern.

## Risks / Trade-offs

- **[Risk]** A future change adds a new participant-facing path to cancel an
  instance and calls the engine primitive directly. It could skip the
  authorization wrapper and silently reintroduce an unconditional-cancel
  hole. → **Mitigation:** a code comment at
  `engine/transition.ts::cancelInstance`'s definition states that every
  participant/operator-facing caller MUST route through
  `runtime/api.ts::cancelInstance`. The `authorization` spec delta documents
  the gate's placement enough for a reviewer to catch a violation against
  the spec.
- **[Risk]** An author sets `Step.cancellable: true` under a process-wide
  `cancellable: false`, expecting the process-wide flag to win → **Mitigation:**
  the `cancellation` spec delta documents this explicitly, stating "either
  MAY override the other in either direction." It also names this as its
  own scenario. The step-level control also states the resolved effective
  outcome, beyond the raw override. This way, an author sees the real result
  while editing.
- **[Trade-off]** No fine-grained "assigned actor may also cancel" rule
  ships in v1; only starter-vs-operator does. This is acceptable: nothing in
  the brainstorming conversation asked for it. The `ponytail:`-marked gate
  call site stays the named extension point if a real need arises.
- **[Risk]** `InstanceView.canCancel` reflects load-time state. A concurrent
  automatic transition can land before the participant's click. That can
  still produce a real `AuthorizationError` on submit. **Mitigation:** this
  falls through to the Task screen's existing generic error treatment.
  That is the same fallback every other untabled typed error already
  receives. It is an accepted, pre-existing fallback rather than a new gap.
  `end-user-app`'s typed-errors table gains no new row; a later change can
  add one if this proves confusing in practice.

## Migration Plan

No data migration. Both fields are optional. Their absence resolves to
today's actual behavior: every non-terminal step stays participant-cancellable.
Every already-published version and every running instance behaves as
before. That holds until a process owner explicitly opts a process or step
out. No feature flag: per `CLAUDE.md`'s pre-1.0 stage note, nothing deployed
depends on today's unconditional starter-cancel behavior surviving
unchanged.

Rollout ships as one change. Schema, engine authorization, `InstanceView`,
the two studio surfaces, and the participant-facing control land together.
The four-gate pipeline verifies all of it: `typecheck`, `build`, full `bun
test` with `DATABASE_URL`, and the two prose/whitespace gates. A browser
check of both new UI surfaces follows too, per `CLAUDE.md`'s "a UI change is
never trivial" rule.

## Open Questions

None. `/impeccable shape` resolved both the widget shape and the
participant-facing explanation copy during this proposal. The widget shape
is a plain checkbox at process level and a `<select>` at step level. This
followed `CLAUDE.md`'s UI workflow; see the shape decision above.
