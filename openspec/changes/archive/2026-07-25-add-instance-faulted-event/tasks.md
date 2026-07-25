## 1. Contract

- [x] 1.1 Add `instanceFaultedReason = z.enum(["automatic-cascade-loop"])` and its
      `z.infer` type in `src/schema/definition.ts`, beside the existing reason
      enums, with a comment naming why the reason is an enum at one member.
- [x] 1.2 Add the ninth arm to the `instanceEvent` discriminated union:
      `kind: z.literal("instance.faulted")`, payload
      `z.object({ stepId, reason: instanceFaultedReason }).strict()`, no
      `actions` field. Comment it in the style of the neighbouring arms — the
      `migration.skipped` shape (no transition, no actions), envelope `version`
      is the instance's own.
- [x] 1.3 `bun run typecheck` — confirm no exhaustive `switch` over
      `InstanceEventKind` elsewhere in the repo broke.

## 2. Engine

- [x] 2.1 Rewrite `markFaulted` in `src/engine/transition.ts` to run inside
      `db.begin`: the guarded `UPDATE`, then `appendInstanceEvent` with an
      envelope at the instance's current `instanceId`/`version`/`transitionSeq`
      and payload `{ stepId: instance.currentStepId, reason:
      "automatic-cascade-loop" }`. (Uses the existing `withTransaction` helper
      rather than `db.begin` directly — the same savepoint-joinable wrapper
      `fireTimer` already uses at this same call depth, so `markFaulted` stays
      composable if a future caller ever nests it inside an open transaction.)
- [x] 2.2 Skip the append when the `UPDATE` matched no row (lost OCC race), so no
      event is written for a park that did not happen.
- [x] 2.3 Replace the `ponytail:` comment on `markFaulted` with an accurate one:
      it is still not a transition (no seq bump, no `HistoryEntry`), but it is no
      longer a bare flip and no longer defers the audit event.

## 3. Tests

- [x] 3.1 In `test/automatic.test.ts`, extend the existing cascade-loop test (or
      add one beside it) to assert an `instance.faulted` event exists for the
      instance with the repeated `stepId` and reason `automatic-cascade-loop`.
- [x] 3.2 Assert the event carries the same `transitionSeq` the instance rests
      at, that the instance's persisted `transitionSeq` did not advance, and
      that no `HistoryEntry` was appended for the park.
- [x] 3.3 Assert the event has no `actions`.
- [x] 3.4 Add a rejection test for the contract: an `instance.faulted` event with
      an unknown `reason` fails `instanceEvent.parse` (the project rule — every
      invariant ships with a test that rejects a violating input).
- [x] 3.5 Run the full suite with `DATABASE_URL` set and confirm the skip count,
      not just the pass count. A single-file rerun is not a valid signal.
      (733 pass / 0 fail; DB-backed suites ran for real — non-zero timings, no
      `(skip)` markers.)

## 4. Documentation

- [x] 4.1 `CLAUDE.md`, "Runtime record" section: the kind list says "Eight kinds
      exist" and enumerates them — make it nine and add `instance.faulted`,
      keeping it in the group that enqueues nothing.
- [x] 4.2 `docs/current-state.md`: add the kind wherever the event kinds are
      enumerated. (No existing kind-enumeration table there; added a note at
      the `faulted`-instance paragraph instead, the file's existing home for
      this fact.)
- [x] 4.3 `PONYTAIL-DEBT.md`: remove the `src/engine/transition.ts:658` marker,
      update the summary line to 11 markers / 1 with no trigger, and note the
      removal in the changes-since-last-snapshot paragraph. (Also closed the
      `file-system-access.d.ts:1` no-trigger gap, fixed earlier this session —
      actual result is 10 markers / 0 with no trigger.)

## 5. Close out

- [x] 5.1 Re-index the knowledge graph (`index_repository`, full) — the contract
      and an engine function changed.
- [x] 5.2 `/opsx:verify` this change, then archive it. (1 WARNING noted: the
      OCC-race scenario on `markFaulted` is correctly implemented but untested,
      since the function is module-private and the codebase's race-testing
      pattern needs a direct call. No CRITICAL issues.)
