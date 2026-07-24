## Context

The action-handler seam (`src/engine/registry.ts`, `src/engine/outbox.ts::deliver`,
publish-time validation in `src/engine/registry-check.ts`) is fully built and
specified (`openspec/specs/action-handlers/spec.md`), but no handler for a
real, author-facing action type is registered anywhere. `startEngine`'s
default `Registry` is empty except for the two engine-internal `core.*`
handlers (`subprocess.ts`); `examples/expense-approval.json` illustrates
`notify.email` / `accounting.postInvoice` types that dead-letter today because
nothing resolves them. This is Roadmap #5e (`ROADMAP.md`, "make the engine
reachable" stage e: "Real action-handler implementations registered against
the handler registry ... Needed for a process to do more than pass data
through.").

This change adds exactly one such handler: a generic, vendor-neutral
`http.request` action that calls an authored URL and writes the response back
via the existing `Action.output` mechanism. It is deliberately the smallest
unit that is still a *real* handler (genuine external I/O, genuine
retry-vs-permanent error semantics) rather than a no-op/log stub, and
deliberately generic rather than a set of vendor-specific handlers
(`notify.email`, `accounting.postInvoice`) that would require account/vendor
decisions nobody has made. Most real integrations (email providers, Slack,
accounting systems) are reachable through their HTTP APIs, so one generic
handler covers the near-term need without speculating about a specific
vendor.

## Goals / Non-Goals

**Goals:**
- Register one real, generic HTTP action handler behind the existing seam,
  with publish-time config validation and correct permanent-vs-transient
  error classification.
- Make the handler available by default: any deployment calling
  `startEngine()` with no explicit registry gets it automatically.

**Non-Goals:**
- **Vendor-specific handlers** (`notify.email`, `accounting.postInvoice`, or
  any other domain-specific type). Deferred until a concrete integration is
  needed; the example process's illustrative types remain unregistered.
- **Dynamic instance data in the outgoing request.** The handler builds the
  request from `action.config` alone — no `data` field values, no DB lookup
  by `instanceId`. `config` is static, publish-time-validated JSON, matching
  every other declarative action; the handler does no DB I/O at all, unlike
  the `core.*` subprocess handlers.
- **Secret management.** `config.headers` (including any `Authorization`
  value) is plain JSON, persisted in the published, immutable process body.
  No symbolic-reference/secret-store layer is built. See "Risks / Trade-offs".
- **SSRF protection / URL allow-listing.** `config.url` is called as
  authored, with no host/network restriction.
- **Wiring `Action.retry` into outbox delivery.** `outbox.ts` keeps its own
  fixed `MAX_ATTEMPTS`/backoff, unchanged. Only `Action.timeout` is consumed,
  and only by this handler locally (an `AbortController` bound on its own
  `fetch` call) — no change to `outbox.ts`.
- **An `outputSchema` for the handler.** Unread by anything today (no
  consumer exists yet, per `CLAUDE.md`), so declaring one now has no effect.
- **A configurable idempotency-header name.** The dedup header (see
  "Deduplication signal" below) is hardcoded to `Idempotency-Key`, the
  established REST convention. Making the header name authorable is deferred
  until a concrete target API needs a different one — the generic handler
  stays simple; a future vendor-specific handler can pick its own header.

## Decisions

### Module shape

New `src/handlers/` directory — the first home for concrete, vendor-neutral
handler implementations, distinct from the engine-internal seam:

- **`src/handlers/http.ts`** — `HTTP_ACTION_TYPE = "http.request"`, the Zod
  `httpConfigSchema`, and the handler function itself.
- **`test/handlers-http.test.ts`** — unit tests against a local `Bun.serve`
  mock target server (see "Testing").

`src/engine/host.ts` gains, alongside `startEngine`:

```ts
export function createDefaultRegistry(): Registry {
  const reg = createRegistry();
  register(reg, HTTP_ACTION_TYPE, httpHandlerDef);
  return reg;
}
```

mirroring the existing `createDefaultAssignmentRegistry` in spirit (a
registry pre-populated with the one built-in handler). `startEngine`'s
`registry` parameter defaults to `createDefaultRegistry()` instead of `new
Map()`, so any deployment calling `startEngine()` with no explicit registry
gets the handler automatically — the same default-on posture the `static`
assignment strategy already has.

**Placement note (revised during implementation):** `createDefaultRegistry`
lives in `src/engine/host.ts`, not `src/engine/registry.ts` as originally
drafted. `registry.ts` importing `src/handlers/http.ts` — which itself must
import `PermanentError` from `src/engine/outbox.ts` for the permanent/
transient classification to be real (`drainOutbox` checks `e instanceof
PermanentError` against that exact class) — would close a cycle:
`registry.ts` → `http.ts` → `outbox.ts` → `registry.ts` (`outbox.ts` already
imports `resolve`/`Registry` from `registry.ts`). This is precisely the
hazard `registry.ts`'s own `SPAWN_ACTION_TYPE`/`RETURN_ACTION_TYPE` placement
comment already calls out and avoids ("Homed in this leaf module ... so
store.ts and transition.ts can both name them without an import cycle").
`host.ts` sits downstream of `registry.ts`, `outbox.ts`, and (now)
`src/handlers/http.ts` alike, and nothing imports `host.ts` back, so building
the default registry there is acyclic. `registry.ts` itself is untouched by
this change — it stays the leaf module it already was.

No `package.json` `exports` entry: `src/handlers/` runs server-side only,
never imported by `packages/editor`.

**Alternative considered:** put the handler directly in
`src/engine/registry.ts` alongside the `core.*` handlers. Rejected — the
`core.*` handlers are engine-internal (dispatched by `subprocess.ts`, exempt
from the author-facing registry-resolution check), while `http.request` is an
ordinary author-facing plugin. Keeping it in a separate `src/handlers/`
directory keeps that distinction visible in the file layout and gives future
vendor-neutral handlers (if any) an obvious home.

### Config schema

```ts
const IDEMPOTENCY_HEADER = "Idempotency-Key";

const httpConfigSchema = z
  .object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
  })
  .refine((c) => !(c.method === "GET" && c.body !== undefined), {
    message: "a GET request cannot carry a body",
    path: ["body"],
  })
  .refine(
    (c) => !Object.keys(c.headers ?? {}).some((k) => k.toLowerCase() === IDEMPOTENCY_HEADER.toLowerCase()),
    {
      message: `"${IDEMPOTENCY_HEADER}" is set by the engine and must not be authored in config.headers`,
      path: ["headers"],
    },
  );
```

Validated at publish via the existing `checkActionRegistry` (`registry-check.ts`)
against `HandlerDef.configSchema` — an author-time error, never a runtime
dead-letter, matching every other registered handler.

The two `.refine`s close gaps found in design review, both publish-time rather
than runtime, matching the project's standing rule that a validation that may
tighten belongs on the write path, not a runtime crash:

- **GET + body.** The Fetch `Request` constructor throws a `TypeError` when
  `method` is `GET`/`HEAD` and a `body` is given (verified against the actual
  runtime, not assumed). That `TypeError` is not a `PermanentError`, so
  uncaught it would be misclassified as transient and retried up to
  `MAX_ATTEMPTS` against a config error that cannot change between attempts.
  Rejecting the combination at publish removes the dead-end retry loop
  entirely.
- **Reserved idempotency header.** See "Deduplication signal" below — the
  engine, not the author, owns this header's value, so an authored value
  under the same key is an unresolvable precedence conflict rather than a
  silently-picked winner.

### Handler behavior

```ts
type HttpActionResult = { status: number; headers: Record<string, string>; body: unknown };

async function httpHandler(ctx: HandlerContext): Promise<HttpActionResult>
```

1. Parse `ctx.config` against `httpConfigSchema` (already publish-validated;
   this is type-narrowing, not a new check).
2. Build the outgoing headers: start from `config.headers ?? {}` (already
   guaranteed by the schema to omit `Idempotency-Key` and, for a `GET`, to
   have no accompanying `body`), then set:
   - `Idempotency-Key: ctx.idempotencyKey` — always, unconditionally
     overwriting nothing since the schema already forbids an authored value
     under this key.
   - `Content-Type: application/json` — only when `body !== undefined` and
     `config.headers` does not already declare a `Content-Type` (matched
     case-insensitively); an author-supplied `Content-Type` (e.g. for a
     non-JSON target) is always respected as-is.
3. Build a `Request` from `url`/`method`/the merged headers/`body`
   (JSON-serialized) — still nothing beyond `action.config` plus the two
   engine-computed headers above; no instance `data`, no DB lookup.
4. If `ctx.action.timeout` is set, bound the `fetch` call with an
   `AbortController`, using `durationMs(ctx.action.timeout)`
   (`src/engine/duration.ts`, already used for timer arming) to compute the
   millisecond bound. No timeout set → no abort bound.
5. Classify the response into `HttpActionResult`: `body` is JSON-parsed when the
   response's `Content-Type` includes `application/json`, otherwise the raw
   text.
6. Error classification (see table below) — the handler throws; `deliver`
   itself is unchanged.

| Outcome | Handler behavior |
|---|---|
| `2xx` response | Returns `HttpActionResult` |
| `4xx` response, except `429` | `throw new PermanentError(...)` (already exported from `outbox.ts`) — immediate dead-letter, no point retrying an unchanged config error |
| `429` or `5xx` response | `throw new Error(...)` (transient) — runs through the existing retry/backoff in `outbox.ts` up to `MAX_ATTEMPTS`, then dead-letters |
| Network error (`fetch` throws) | transient, same as above |
| Timeout (`AbortController` fires) | transient (an `AbortError` is a plain thrown error), same as above |

No new error type: `PermanentError` already exists for exactly this purpose
(`deliver`'s own "unregistered type" case uses it today).

**Alternative considered:** treat all `4xx` as transient (retry blindly).
Rejected — a `4xx` other than `429` reflects a config/request problem
(bad URL, malformed body, auth failure) that will not change on retry;
retrying wastes attempts and delays dead-lettering a definitively broken
action. `429` is carved out because it means "retry later," not "this request
is wrong."

### Deduplication signal

`HandlerContext`'s own contract (`src/engine/registry.ts`) states a handler
"MUST dedupe external effects on `idempotencyKey`", and the existing
`action-handlers` spec requires the same ("a handler MAY be invoked more than
once for the same row and MUST dedupe on the row's idempotency key" —
`openspec/specs/action-handlers/spec.md`). This is not a corner case for
`http.request`: a `429`/`5xx`/network/timeout classification is *transient by
design*, meaning `drainOutbox` redelivers the identical row — same config,
same body — on its ordinary retry path, not only after a crash. `POST` is the
handler's default method, so the common case is exactly the one where a
retry after a lost response (the target actually succeeded, but the reply
never arrived) becomes a real duplicate execution against the receiving
system (double charge, double order, double send) if nothing distinguishes
the retried request from the original.

The handler therefore emits `ctx.idempotencyKey` — already deterministic
per `(instanceId, transitionSeq, actionId)` and stable across every delivery
attempt of the same outbox row (`attempts` increments; `idempotency_key` does
not) — as an `Idempotency-Key` request header on every attempt, following the
convention several major HTTP APIs (Stripe, PayPal, and others) already
expect for exactly this purpose. This fulfills the registry's dedupe
contract by giving a cooperating receiver the same stable key on every retry
of the same delivery.

**Boundary condition, stated plainly:** this is a signal, not a guarantee.
It only prevents duplicate execution if the receiving API itself implements
idempotency-key deduplication — a target that ignores the header can still
duplicate on retry, exactly as it could before this design. That residual
risk is a property of the target system, outside this change's control; what
is in this change's control — actually emitting the key the engine already
computes — is now done, closing the gap where the handler emitted no
dedup signal at all.

**Alternative considered:** treat this as an accepted risk and document it in
"Risks / Trade-offs" without mitigation, matching the pattern used for SSRF
and secrets. Rejected — SSRF/secrets are properties of what the author
chooses to configure (a URL, a header value) that the engine has no way to
constrain further without new infrastructure (an allow-list, a secret
store). Dedup is different: the engine already computes the exact value
needed (`ctx.idempotencyKey`) and the fix is emitting it, not building new
infrastructure — there is no reason to leave a MUST from an existing,
already-accepted spec unmet when satisfying it costs one header.

### Data flow

1. An `Action{ type: "http.request", config, output }` sits in any of the
   five existing positions (`onEntry`/`onExit`/`onCancel`/`path.onPath`/
   `timer.onFire.actions`) — no schema change, uses the existing seam as-is.
2. `outbox.ts::deliver` resolves the handler by type and invokes it with
   `{action, config, idempotencyKey, instanceId}`, outside any DB
   transaction, like every other handler.
3. The handler runs the request/response cycle above and returns (or
   throws).
4. `deliver` evaluates `action.output` (CEL over `result`, already `dyn`-typed
   in `src/cel/check.ts`) against the returned `HttpActionResult` — unchanged,
   existing `evalOutput` code path.
5. Writeback, `ActionOutcome` recording, running-instance suppression, and
   re-resolution flagging are all existing, untouched `outbox.ts` behavior.

The handler itself does no DB I/O and holds no state — the first fully
stateless handler in the registry (unlike `core.spawnSubprocess`/
`core.returnSubprocess`, which close over `db`).

### Testing

`test/handlers-http.test.ts`, `bun:test`, no `DATABASE_URL` required (the
handler does no DB work) — pure unit tests of the handler function against a
locally started `Bun.serve` mock target (stopped after each test), plus one
registry-check integration point:

1. Success (`2xx`, JSON body) → `HttpActionResult` with parsed `body`.
2. Success, non-JSON response (`text/plain`) → raw string `body`.
3. Request construction: method/headers/body from `config` arrive unchanged
   at the mock server (asserted server-side).
4. `4xx` (e.g. `404`) → `PermanentError`.
5. `429` → transient (plain `Error`, not `PermanentError`).
6. `5xx` → transient, same assertion as `429`.
7. Response delayed past `action.timeout` → aborts, throws transient.
8. No `action.timeout` set → no abort, handler waits normally.
9. Every request carries an `Idempotency-Key` header equal to
   `ctx.idempotencyKey` (asserted server-side); a second `deliver()` call
   built from the same `ClaimedRow` (simulating a retried delivery) sends the
   identical header value, not a freshly generated one.
10. A `GET` config with `body` set fails `httpConfigSchema.safeParse` (schema
    unit test, not a network call).
11. A `config.headers` entry named `Idempotency-Key` (any case) fails
    `httpConfigSchema.safeParse`.
12. `body` set with no `Content-Type` in `config.headers` → the request sent
    to the mock server carries `Content-Type: application/json` (asserted
    server-side).
13. `body` set with an explicit `Content-Type` in `config.headers` (e.g.
    `application/x-www-form-urlencoded`) → that value reaches the mock
    server unchanged, not overwritten.
14. Registry-check integration (in `test/definitions.test.ts` or a small
    addition there): an `http.request` action with invalid `config` (e.g.
    missing `url`, or a `GET` with `body`) is rejected at publish via
    `checkActionRegistry`, confirming `httpConfigSchema` is actually wired
    into `createDefaultRegistry`.

No new end-to-end outbox-delivery test: the delivery path itself (claim,
retry, dead-letter, writeback) is already covered generically by existing
outbox tests against a registered handler; this change only needs to verify
the handler's own request/response/error behavior plus the one registry-check
data point.

## Risks / Trade-offs

- **[Risk] Duplicate execution on a target that ignores the dedup
  header.** Mitigated, not accepted-as-is: see "Deduplication signal" above
  — every request (including every retry) carries `Idempotency-Key:
  ctx.idempotencyKey`. → Residual: this only prevents a duplicate at the
  receiving side if that side implements idempotency-key deduplication
  itself; a target that ignores the header can still execute twice on a
  lost-response retry. Not revisitable by this change alone — it is a
  property of whatever system `config.url` points at.
- **[Risk] No SSRF protection.** `config.url` is called as authored, with
  no host allow-list. → Mitigation: accepted, because process definitions are
  an authoring-time, trusted artifact (not user input) — the same trust
  boundary the project already applies to actor resolution ("trusted as
  given"). Revisit only if process definitions could originate from a
  less-trusted authoring source.
- **[Risk] Secrets in plaintext.** `config.headers` (including
  `Authorization`) persists in the published, immutable definition body,
  readable via any read path (editor import/export, etc.). → Mitigation:
  accepted as the simplest seam-conformant option; a symbolic-reference +
  server-side secret resolution layer is a separate, later change if real
  secret management becomes a concrete need.
- **[Trade-off] No dynamic instance data in outgoing requests.** A process
  wanting to send a current field value (e.g. the example's `amountField`
  pattern) cannot do so with this handler alone. → Mitigation: accepted;
  revisit only if a real process needs it — likely as a
  `bodyFields: FieldId[]`-style extension that has the handler load instance
  data itself, mirroring how the subprocess handlers already do their own DB
  reads.
- **[Trade-off] `Action.retry` stays unwired into `outbox.ts`.** Per-action
  retry/backoff configuration remains declared-but-unenforced, unchanged from
  today. → Mitigation: accepted; revisit only if delivery SLAs ever diverge
  per action type (existing `ponytail` note in `outbox.ts`).

## Migration Plan

Purely additive: new `src/handlers/http.ts`, new `test/handlers-http.test.ts`,
one new export (`createDefaultRegistry`) plus the default-parameter change in
`src/engine/host.ts::startEngine`. `src/engine/registry.ts` is untouched. No
schema change, no change to `src/engine/outbox.ts` or
`src/engine/registry-check.ts`. Rollback is deleting the new files and
reverting `host.ts` to its prior state (empty default registry).

**Compatibility note on the `startEngine` default change:** any caller today
passing its own `registry` argument is unaffected. A caller relying on the
previous empty-default behavior (e.g. a test asserting `http.request` actions
dead-letter) would need updating — expected to be none, since no such type
was previously registerable, but worth a check at implementation time.

## Open Questions

None outstanding — scope, secrets handling, dynamic-data exclusion, error
classification, deduplication, URL-restriction posture, and
default-registration all converged during design review (see "Decisions" and
"Non-Goals" above).
