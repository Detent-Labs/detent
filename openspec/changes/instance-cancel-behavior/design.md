## Context

`cancelInstance` exists at two layers today, and the split matters to this
design:

- `src/engine/transition.ts::cancelInstance(instance, body, actor, db,
  resolveBody)` is the low-level engine primitive. It performs the
  synthesized transition to the cancel-sink and trusts its caller completely
  — it runs no authorization check of its own. `src/engine/subprocess.ts`'s
  downward child-cascade calls this directly, with `SYSTEM_ACTOR`, bypassing
  every authorization layer above it.
- `src/runtime/api.ts::cancelInstance(instanceId, actor, db)` is the
  participant/operator-facing wrapper. It authorizes `actor` first — trying
  `system:cancel-any` load-free, then a per-process `"cancel"` grant, then
  falling back to `instance.startedBy === actor.id` — and only then calls the
  engine primitive (imported locally as `engineCancelInstance`).

`getInstanceView` (also in `src/runtime/api.ts`) already resolves several
read-model fields this same way — `assignment`, `baseLocale`, the form draft —
each as its own small, focused requirement rather than one field bolted onto
the giant "resolve a display-ready view" requirement. `canCancel` follows that
established pattern.

See `proposal.md` for the motivation (CapEx-at-the-CEO example) and the six
spec deltas for exact requirement text.

## Goals / Non-Goals

**Goals:**
- Let a process owner declare a process, or an individual step, not
  participant-cancellable.
- Guarantee — structurally, not just by convention — that `system:cancel-any`
  and a per-process `"cancel"` grant remain unconditional, so no combination
  of `cancellable`/`Step.cancellable` can produce an instance nobody can
  clean up.
- Give the read model (`InstanceView.canCancel`) and the write path
  (`cancelInstance`'s own authorization) one shared predicate, so a UI
  decision and an actual authorization decision cannot disagree.
- No-code authoring for both new fields, reusing existing studio surfaces
  rather than adding a new tab or dialog.

**Non-Goals:**
- No plugin/resolver mechanism for "who besides the starter may cancel"
  (considered and rejected during brainstorming — see the two role/grant
  tests already covering every case the requester named; a `ponytail:`
  comment at the gate's call site marks this as the extension point if a real
  need appears).
- No change to the cancel-sink injection, `onCancel`, the cancel audit
  record, or subprocess-cancel-propagation mechanics — all unaffected, and
  the propagation delta spec now says so explicitly.
- No new HTTP route and no new error shape — rejection stays the existing
  `AuthorizationError` → `403`.
- No change to the admin app's own cancel control's OUTCOME for an operator
  relying on `system:cancel-any` or a process-scoped `cancel` grant — those
  are exactly the two branches this change leaves untouched. An
  admin-role-only operator (holding `system:admin` but neither of the above)
  who is also the instance's own starter is newly subject to the cancellable
  gate via the starter-fallback branch, the same as any other starter; this
  is intended, not a regression — that operator is acting as the instance's
  participant at that moment, not as an unconditional operator.
- No data migration for already-published process versions: both fields are
  optional and default to today's actual behavior (everywhere cancellable),
  so an existing pinned body needs no rewrite.

## Decisions

**Two plain optional booleans, not a resolver/plugin registry.** Considered a
`Step.cancellableBy: { type, config }` mirroring `Assignment.strategy`, since
that is the project's existing pattern for "who may act here." Rejected: the
only distinction ever named is starter-vs-operator, which the existing
role/grant/starter split in `authorization` already draws. A registry would
add a resolution step, a new registry file, and a new publish-time
config-schema check for a distinction the code already makes elsewhere.
`ProcessBody.cancellable`/`Step.cancellable`, each an optional boolean with
the other as its inherited default, cover every case the CapEx example and
the brainstorming conversation named, with no cross-field Zod refinement
(override is valid in either direction) and no `compile.ts` change.

**The gate lives only in the authorization wrapper, never in the engine
primitive.** `isCancellableAtStep(body, step)` is called from exactly one
place: the `instance.startedBy === actor.id` branch inside
`src/runtime/api.ts::cancelInstance`. It is never called from
`src/engine/transition.ts::cancelInstance`. This is what makes the admin/grant
bypass a structural fact rather than a maintained invariant: `system:cancel-any`
and the per-process grant branch physically never reach the new check, and
neither does the subprocess cascade, which calls the engine primitive
directly with `SYSTEM_ACTOR` and was never authorization-gated to begin with.
Any future participant-facing entry point to cancel MUST route through the
`runtime/api.ts` wrapper for this guarantee to keep holding — this is worth a
code comment at the engine primitive's definition, not just this document.

**One shared predicate for `cancelInstance` and `getInstanceView`.** Both
call sites need the same answer to "may this actor cancel this instance right
now" — one to enforce it, one to report it. Extracting a single async
predicate (parallel to the existing `requireSubmitAuthority`, which the
codebase already built to keep `submitAndTransition` and `saveInstanceDraft`
from drifting) is the only way to guarantee the two cannot disagree. The pure
half — `isCancellableAtStep(body, step): boolean`, no DB access — is a
separate, trivially testable unit; the predicate composes it with the
existing role/grant checks.

**UI location: extend existing surfaces, not new ones.** Investigated the
studio source directly rather than assume a "process settings" screen exists.
It doesn't, but the header bar's `⋮` menu already carries a "Process, saved
with the draft" group that mutates `key` and `baseLocale` in place, gated by
`disabled={!structureActive}`. `ProcessBody.cancellable` becomes one more row
there. `Step.cancellable` becomes a new section on the step page, alongside
Assignment (both are "who may act on this step" concerns), shown only for
task and subprocess steps — a terminal step's instance has already left the
running state the field governs.

**A plain checkbox at process level; a three-state `<select>` at step level —
resolved via `/impeccable shape`.** `ProcessBody.cancellable` sits at the root
of the inheritance chain — there is nothing above it to "inherit" from, so a
tri-state control there would offer a meaningless third option. It becomes one
more plain checkbox row in the header bar's existing "Process, saved with the
draft" `⋮`-menu group, beside `key` and `baseLocale`, same
`disabled={!structureActive}` gating.

`Step.cancellable` genuinely has a parent default to defer to, so it keeps the
three explicit states: "Inherit from process", "Cancellable", "Not
cancellable" — a plain `<select>`, not a custom segmented control (Operate-mode
guidance is explicit: reuse the page's existing form-control vocabulary rather
than invent one). It renders as a new "Cancellable" section in the step page's
leading column, beside Assignment, for task and subprocess steps only. A small
muted note beneath the select names the resolved effective outcome whenever
"Inherit" is selected (mirroring the existing `stepSections.
terminalNoPathsOrTimers`-style note pattern), so an author sees the real
result without jumping to the process-level setting.

**Disabled-with-reason, not hidden, for the end-user Cancel control.** The
"Discard case" control stays visible and becomes `disabled` when `canCancel`
is `false`, with a line beneath it naming why — pattern: "This case can no
longer be discarded — it has passed the point where {starter} can withdraw
it." A starter who has used the control before and then loses access to it
(the CapEx-reaches-the-CEO case) should see why, not wonder where the button
went. `task.discardCase`'s catalog entry gains a sibling key for this
explanation, DE/EN, following the existing per-locale catalog pattern.

## Risks / Trade-offs

- **[Risk]** A future change adds a new participant-facing path to cancel an
  instance and calls the engine primitive directly, skipping the
  authorization wrapper and silently reintroducing an unconditional-cancel
  hole → **Mitigation:** a code comment at
  `engine/transition.ts::cancelInstance`'s definition states that every
  participant/operator-facing caller MUST go through
  `runtime/api.ts::cancelInstance`, and the `authorization` spec delta now
  documents the gate's placement explicitly enough for a reviewer to catch a
  violation against the spec.
- **[Risk]** An author sets `Step.cancellable: true` under a process-wide
  `cancellable: false`, expecting the process-wide flag to win → **Mitigation:**
  documented explicitly in the `cancellation` spec delta ("either MAY override
  the other in either direction") and named as its own scenario; the
  step-level control also states the resolved effective outcome, not just the
  raw override, so an author sees the real result while editing.
- **[Trade-off]** No fine-grained "assigned actor may also cancel" rule ships
  in v1, only starter-vs-operator → acceptable: nothing in the brainstorming
  conversation asked for it, and the `ponytail:`-marked gate call site is the
  named extension point if it turns out to be needed.
- **[Risk]** `InstanceView.canCancel` reflects load-time state; a concurrent
  change (e.g. an automatic transition) before the participant's click can
  still produce a real `AuthorizationError` on submit → **Mitigation:** falls
  through to the Task screen's existing generic failure treatment, the same
  fallback every other untabled typed error already receives — an accepted,
  pre-existing fallback, not a new gap. No new row is added to `end-user-app`'s
  typed-errors table; a later change can add one if this proves confusing in
  practice.

## Migration Plan

No data migration. Both fields are optional; their absence resolves to
today's actual behavior (every non-terminal step participant-cancellable), so
every already-published version and every running instance behaves exactly as
before until a process owner explicitly opts a process or step out. No
feature flag: per `CLAUDE.md`'s pre-1.0 stage note, nothing deployed depends
on today's unconditional starter-cancel behavior surviving unchanged.

Rollout is one change: schema, engine authorization, `InstanceView`, the two
studio surfaces, and the end-user control land together, verified by the
existing four-gate pipeline (`typecheck`, `build`, full `bun test` with
`DATABASE_URL`, the two prose/whitespace gates) plus a browser check of both
new UI surfaces per `CLAUDE.md`'s "a UI change is never trivial" rule.

## Open Questions

None. `/impeccable shape` resolved both the widget shape (plain checkbox at
process level, `<select>` at step level) and the end-user explanation copy
pattern during this proposal, per `CLAUDE.md`'s UI workflow — see the shape
decision above.
