## Context

Three independent, unrelated-except-by-location duplications in
`src/http/`:

1. `errors.ts:42-100` — `mapError`'s 18 sequential `err instanceof X`
   checks. Verified against current file contents. Every branch's output
   body falls into one of two shapes:
   - `{ type, issues: err.issues }`, status 422 in all cases: `SubmissionValidationError`,
     `RegistryValidationError`, `AssignmentRegistryValidationError`,
     `DataSourceRegistryValidationError` (these three share `type:
     "registry-validation"`), `CelValidationError`, `DurationValidationError`,
     `ZodError` (`type: "schema-validation"`) — 7 classes.
   - `{ type, message: err.message }`, status varies by class:
     `RequestShapeError` (400), `CrossProcessValidationError` (422),
     `GuardRefused` (409), `PinMismatch` (500, `type: "internal"`),
     `ActorResolutionError` (401), `AuthorizationError` (403),
     `NotAssignedError`/`NotACandidateError`/`AlreadyClaimedError`/
     `NotClaimedError`/`NotClaimantError` (all 403) — 11 classes.
   - Two branches do NOT fit either shape: `ConcurrencyConflict` returns
     `{ type: "concurrency-conflict" }` with no `message`/`issues` at all,
     and the final default (no `instanceof` check — `err instanceof Error
     ? err.message : String(err)`) handles anything unrecognized.
   - Order-safety: none of these 19 classes is a subclass of another
     (`RequestShapeError extends Error` is the only `extends` among them,
     and every other listed class also ultimately extends `Error` the same
     way native/library errors do — no class here extends another *listed*
     class), so replacing the `if`-chain with an ordered `.find()` over a
     table preserves first-match semantics exactly, regardless of table
     order.
2. `routes.ts:44-244` — 11 of 12 exported handlers wrap their entire body in
   `try { … } catch (err) { return mapError(err); }`
   (`handleCreateInstance`, `handleGetInstanceView`, `handleClaim`,
   `handleRelease`, `handleListInstances`, `handleInstanceRecord`,
   `handleCancel`, `handlePublish`, `handleListProcesses`,
   `handleListVersions`, and `handleSubmit`'s *outer* shape). `handleSubmit`
   additionally special-cases `AutomaticCascadeLoop`: on that specific
   thrown type it re-fetches the (now-faulted) instance view and returns it
   as a 200, instead of mapping to an error response — the write already
   committed before the throw (see the existing comment at
   `routes.ts:92-93`).
3. `routes.ts:31-42` — `extractCredential(req)` returns `req.headers`
   unchanged; its only caller is `resolveActor(req, resolver)`, which does
   `resolver(extractCredential(req))`.

## Goals / Non-Goals

**Goals:**
- Replace `mapError`'s branch chain with a table-driven lookup, with
  `ConcurrencyConflict` and the untyped default kept as explicit special
  cases, not forced into either table.
- Route every handler except `handleSubmit` through one shared
  try/catch-and-map wrapper.
- Delete `extractCredential`, folding its one line into `resolveActor`.
- Preserve every status code and response body byte-for-byte, for every
  error type and every handler.

**Non-Goals:**
- Any change to HTTP status codes, response body shapes, or which error
  type maps to which status — this is pure internal restructuring.
- Changing `handleSubmit`'s `AutomaticCascadeLoop` handling — it stays a
  bespoke try/catch, not routed through the shared wrapper.
- Changing `resolveActor`'s signature or its 11 call sites — only the
  `extractCredential` indirection is removed.
- Touching `server.ts` (the `{status, body} -> Response` translation) or
  any Runtime API Layer code.

## Decisions

### `mapError` table-driven rewrite

Two ordered arrays of `{ ctor, status, type }`, one per output shape, plus
`.find()`:

```ts
type IssuesMapping = { ctor: new (...a: any[]) => { issues: unknown }; status: number; type: string };
type MessageMapping = { ctor: new (...a: any[]) => Error; status: number; type: string };

const ISSUES_ERRORS: IssuesMapping[] = [
  { ctor: SubmissionValidationError, status: 422, type: "validation" },
  { ctor: RegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: AssignmentRegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: DataSourceRegistryValidationError, status: 422, type: "registry-validation" },
  { ctor: CelValidationError, status: 422, type: "cel-validation" },
  { ctor: DurationValidationError, status: 422, type: "duration-validation" },
  { ctor: ZodError, status: 422, type: "schema-validation" },
];

const MESSAGE_ERRORS: MessageMapping[] = [
  { ctor: RequestShapeError, status: 400, type: "request-shape" },
  { ctor: CrossProcessValidationError, status: 422, type: "cross-process-validation" },
  { ctor: GuardRefused, status: 409, type: "guard-refused" },
  { ctor: PinMismatch, status: 500, type: "internal" },
  { ctor: ActorResolutionError, status: 401, type: "actor-resolution" },
  { ctor: AuthorizationError, status: 403, type: "authorization" },
  { ctor: NotAssignedError, status: 403, type: "not-assigned" },
  { ctor: NotACandidateError, status: 403, type: "not-a-candidate" },
  { ctor: AlreadyClaimedError, status: 403, type: "already-claimed" },
  { ctor: NotClaimedError, status: 403, type: "not-claimed" },
  { ctor: NotClaimantError, status: 403, type: "not-claimant" },
];

export function mapError(err: unknown): HttpResult {
  const issues = ISSUES_ERRORS.find((e) => err instanceof e.ctor);
  if (issues) return { status: issues.status, body: { error: { type: issues.type, issues: (err as { issues: unknown }).issues } } };

  if (err instanceof ConcurrencyConflict) {
    return { status: 409, body: { error: { type: "concurrency-conflict" } } };
  }

  const message = MESSAGE_ERRORS.find((e) => err instanceof e.ctor);
  if (message) return { status: message.status, body: { error: { type: message.type, message: (err as Error).message } } };

  const fallbackMessage = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: { type: "internal", message: fallbackMessage } } };
}
```

Table order matches the original `if`-chain's order within each shape
group — not required for correctness (per the Context section's
subclass-safety check) but keeps the diff easy to review line-by-line
against the original.

Alternative considered: one combined table with a `shape: "issues" |
"message"` discriminant field instead of two arrays. Rejected — the audit's
own suggested shape is "two tuple tables", and keeping them separate means
`IssuesMapping`/`MessageMapping` can each be typed to the field they
actually read (`issues` vs. the inherited `Error.message`) without a union
narrow at every call site.

### `guarded` wrapper

```ts
async function guarded(fn: () => Promise<HttpResult>): Promise<HttpResult> {
  try {
    return await fn();
  } catch (err) {
    return mapError(err);
  }
}
```

Every handler except `handleSubmit` becomes:

```ts
export async function handleCreateInstance(...): Promise<HttpResult> {
  return guarded(async () => {
    const actor = await resolveActor(req, resolver);
    const body = (await req.json()) as { version?: number; data?: Instance["data"] };
    const created = await createProcessInstance(processId as ProcessId, actor, dataSourceRegistry, { version: body.version, data: body.data }, db);
    return { status: 201, body: created };
  });
}
```

`handleSubmit` is left with its existing explicit try/catch, unchanged
except it no longer needs to change — its shape (try body, catch checking
`AutomaticCascadeLoop` first, then falling through to `mapError`) already
does what it needs to do and doesn't fit `guarded`'s no-branching contract.

Alternative considered: give `guarded` an optional second parameter for a
"special case" handler (e.g. `guarded(fn, { onAutomaticCascadeLoop: ... }
)`) so `handleSubmit` could use it too. Rejected — a wrapper parameterized
for exactly one caller's one exception is more indirection than the four
extra lines `handleSubmit` keeps by staying bespoke; the proposal's
non-goal is explicit about leaving it alone.

### `extractCredential`/`resolveActor` collapse

```ts
/**
 * The credential handed to an `ActorResolver` is the request's `Headers`
 * unchanged — each resolver reads whatever it needs (`Authorization` for
 * JWT, `X-Actor-Id`/`X-Actor-Roles` for the dev resolver). No
 * resolver-specific field is pre-extracted here.
 */
async function resolveActor(req: Request, resolver: ActorResolver): Promise<Actor> {
  return resolver(req.headers);
}
```

`extractCredential` is deleted; its doc comment moves to `resolveActor`
verbatim (the "why the whole `Headers` object" rationale still applies,
now describing `resolveActor`'s one line instead of a separate function).

## Risks / Trade-offs

- [Risk] A table entry's `status`/`type` could be transcribed wrong during
  the mechanical rewrite, silently changing a response for one error type.
  → Mitigation: this repo has no existing dedicated `mapError` unit test
  (confirmed via search of `test/` for `mapError`/`errors.ts`), so
  correctness is verified by the full `bun test` suite's existing HTTP
  route tests, which exercise each error path indirectly by triggering the
  real underlying error (e.g. a malformed submission triggers
  `SubmissionValidationError` through the real validation path, not a
  mock) — task 4 adds a direct table-driven check as well (see tasks.md).
- [Risk] Reordering `guarded`'s try/catch around existing handler bodies
  could change *when* `resolveActor` runs relative to other work in a way
  that matters (e.g. `handlePublish` calls `requireRole` immediately after
  `resolveActor`, before parsing the body). → Mitigation: `guarded` wraps
  the handler's *entire* existing body unchanged, in the same order; no
  statement moves relative to any other, only the try/catch boundary moves
  from "written 11 times" to "written once and invoked 11 times".
- [Risk] None identified for the `extractCredential` collapse — a pure
  inline of a one-line pass-through with a single caller.

## Migration Plan

Pure refactor, no schema/contract/data changes, no HTTP-visible behavior
change. Rollback is reverting `errors.ts` and `routes.ts`.

## Open Questions

None outstanding.
