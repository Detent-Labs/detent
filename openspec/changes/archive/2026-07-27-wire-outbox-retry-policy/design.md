## Context

`src/engine/outbox.ts` (verified against current file contents):

```ts
export const MAX_ATTEMPTS = 5;
// ponytail: fixed exponential backoff (1s, 2s, 4s, …); make per-action configurable
// only if delivery SLAs ever diverge.
const BACKOFF_BASE_MS = 1000;
```

...used at two sites inside `drainOutbox`'s per-row tx2:

```ts
} else if (permanent || attempts >= MAX_ATTEMPTS) {
  // -> dead-letter
} else {
  const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
  // -> back to pending, next_attempt_at = now() + backoffMs
}
```

`Action.retry` (`retryPolicy` schema, `definition.ts:321-326`) is:

```ts
export const retryPolicy = z.object({
  maxAttempts: z.number(),
  backoff: z.enum(["none", "fixed", "exponential"]),
  baseDelay: duration.optional(),
});
```

Authorable, grammar-checked at publish (`compile.ts:77`: `grammar(a.retry?.baseDelay,
...)`), read by nothing today. `examples/expense-approval.json` authors it
twice: `{"maxAttempts": 3, "backoff": "exponential", "baseDelay": "PT10S"}`
and `{"maxAttempts": 5, "backoff": "exponential", "baseDelay": "PT30S"}` —
both use `"exponential"`, so today's hardcoded formula happens to already
match their shape, just not their specific numbers.

`test/outbox.test.ts`'s existing retry/dead-letter tests
(`"a failed delivery retries later..."`, `"a row that keeps failing
exhausts attempts and dead-letters"`) build actions via a local `act()`
helper that sets no `.retry` field, and import `MAX_ATTEMPTS` directly to
bound a loop — these tests pin the no-policy default path and must keep
passing unchanged.

## Goals / Non-Goals

**Goals:**
- `drainOutbox` reads `action.retry` when present; an action with no
  `retry` behaves identically to today (same `MAX_ATTEMPTS`, same
  1s/2s/4s/… backoff).
- Retire the `ponytail:` marker on `BACKOFF_BASE_MS` — it now serves as
  the *default*, not the only value.
- `baseDelay` is an ISO-8601 duration string (the same grammar
  `Timer.duration` uses), converted via the existing `durationMs` helper
  (`src/engine/duration.ts`), not a raw millisecond number.

**Non-Goals:**
- Adding a magnitude bound on `retry.baseDelay` — `compile.ts`'s own
  comment (`:62-66`) already explains why none applies (`retryPolicy.baseDelay`
  computes no instant, unlike `Timer.duration`); this change does not
  revisit that decision.
- Validating `retry.maxAttempts` (e.g. rejecting 0 or negative) at publish
  or at read time — out of scope; not requested, and `compile.ts` does not
  validate it today either (only `baseDelay`'s grammar).
- Any change to `PermanentError`/dead-letter-on-unregistered-type
  handling, the claim/lease mechanism, or the writeback/outcome logic —
  only the two computations (`maxAttempts`, backoff delay) change.

## Decisions

### Two small per-row functions, not a restructured drainOutbox

```ts
function maxAttemptsFor(action: Action): number {
  return action.retry?.maxAttempts ?? MAX_ATTEMPTS;
}

function backoffMsFor(action: Action, attempts: number): number {
  const policy = action.retry;
  const baseDelayMs = policy?.baseDelay !== undefined ? durationMs(policy.baseDelay) : BACKOFF_BASE_MS;
  switch (policy?.backoff ?? "exponential") {
    case "none":
      return 0;
    case "fixed":
      return baseDelayMs;
    case "exponential":
      return baseDelayMs * 2 ** (attempts - 1);
  }
}
```

`drainOutbox`'s two call sites become:

```ts
} else if (permanent || attempts >= maxAttemptsFor(row.action)) {
  ...
} else {
  const backoffMs = backoffMsFor(row.action, attempts);
  ...
}
```

No `action.retry` (the default, and every existing test's shape):
`maxAttemptsFor` returns `MAX_ATTEMPTS`; `backoffMsFor` falls to
`"exponential"` with `baseDelayMs = BACKOFF_BASE_MS` — `1000 * 2 **
(attempts - 1)`, byte-identical to today's formula.

Alternative considered: resolve the whole effective policy once per row
into a `{ maxAttempts, backoff, baseDelayMs }` object and pass that around
instead of two functions taking `action` each time. Rejected — the two
values are consumed at two different points in `drainOutbox`'s branching
(`maxAttempts` in the branch condition itself, before the branch that
computes backoff even runs), so building a combined object either forces
computing `backoffMsFor` unconditionally even on the dead-letter path (a
wasted `durationMs` call in that branch) or requires two separate reads
out of the object anyway — two focused functions is not more code than
one combined resolver plus destructuring.

### `backoff` enum semantics: `"none"` means zero delay, not `maxAttempts: 1`

`retryPolicy.backoff`'s three values ("none" | "fixed" | "exponential")
describe the *delay strategy*, not whether retries happen at all — that is
already `maxAttempts`'s job. `"none"` is defined here as "retry
immediately, no backoff wait" (`backoffMsFor` returns `0`), consistent
with the name describing the absence of a *backoff*, not the absence of a
*retry*.

Alternative considered: treat `"none"` as "no retries" (equivalent to
forcing `maxAttempts: 1`). Rejected — that would make `backoff` and
`maxAttempts` both able to independently control whether a retry happens,
an authoring surface with two ways to say the same thing and a real
ambiguity when both are set inconsistently (e.g. `backoff: "none",
maxAttempts: 5"`); keeping `backoff` purely about delay timing and
`maxAttempts` purely about retry count keeps the two fields orthogonal —
this is a genuinely undocumented corner (finding 7's own text: "documented
nowhere"), so this decision is this change's to make, recorded here for
the next reader.

### `baseDelay` defaults to `BACKOFF_BASE_MS`, not a policy-mandated value

If `retry` is declared but `baseDelay` is omitted (the schema marks it
`.optional()`), `backoffMsFor` still falls back to `BACKOFF_BASE_MS`
(1000ms) — an author can override `maxAttempts` and/or `backoff` alone
without being forced to also specify a base delay.

## Risks / Trade-offs

- [Risk] `durationMs` throws for a grammatically invalid duration
  (`src/engine/duration.ts:28-33`) — unreachable for a body published
  after `compile.ts`'s grammar check landed, but reachable for a body
  published before it (the same caveat `armStepTimers` documents for
  `Timer.duration`). → Mitigation: `drainOutbox`'s existing per-row error
  boundary (the `try`/`catch` around each claimed row) already catches
  this: the row stays claimed and is picked up again after its lease
  expires, the same fate a corrupt action row gets today. No new failure
  mode, just a new possible cause of the existing one.
- [Risk] An authored `baseDelay` has no magnitude bound (by design, see
  Non-Goals), so a very large value combined with `"exponential"` backoff
  could compute a `backoffMs` large enough to push `next_attempt_at`
  implausibly far out. → Mitigation: not a new risk this change
  introduces — `compile.ts` already made this exact call for
  `retry.baseDelay` (deliberately no bound, unlike `Timer.duration`); this
  change only starts reading a value that was already publishable
  unbounded.
- [Risk] `examples/expense-approval.json`'s two authored `retry` blocks
  now actually take effect on delivery failure. → Mitigation: both
  actions' happy-path tests succeed on first delivery (confirmed: neither
  test drives a failure), so no existing test's outcome depends on the
  old hardcoded values; task 3 adds direct coverage of the new
  per-action-override behavior itself.

## Migration Plan

Additive behavior change: an action declaring no `retry` is unaffected;
an action declaring `retry` (today, only the two in
`examples/expense-approval.json`) starts having it honored. No
schema/contract shape change, no `definitionHash` impact. Rollback is
reverting `src/engine/outbox.ts`.

## Open Questions

None outstanding.
