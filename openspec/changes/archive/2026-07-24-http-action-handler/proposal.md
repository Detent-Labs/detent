## Why

The action-handler seam (`registry.ts`, `outbox.ts::deliver`, publish-time
validation in `registry-check.ts`) is fully built and specified, but no
handler for a real, author-facing action type is registered anywhere —
`startEngine`'s default `Registry` is empty except for the two
engine-internal `core.*` handlers, so every authored action dead-letters
today. This is Roadmap #5e ("make the engine reachable" stage e): a process
cannot do more than pass data through until at least one real handler exists.

## What Changes

- Add a new, generic `http.request` action handler (`src/handlers/http.ts`):
  calls an authored URL with an authored method/headers/body and writes the
  response back via the existing `Action.output` mechanism.
- Classify handler outcomes into permanent vs. transient failures: `4xx`
  (except `429`) is a `PermanentError` (immediate dead-letter); `429`, `5xx`,
  network errors, and timeouts are transient (existing outbox retry/backoff).
- Emit `ctx.idempotencyKey` as an `Idempotency-Key` request header on every
  attempt, satisfying the handler-registry's existing "MUST dedupe on the
  idempotency key" contract for a handler whose retries are real, repeatable
  external HTTP calls. `config.headers` may not itself declare this header
  (publish-time rejection) — the engine, not the author, owns its value.
- Reject at publish (schema-level) a `GET` config that also sets `body` (the
  Fetch `Request` constructor throws for that combination at runtime, which
  would otherwise be misclassified as a retryable transient failure). Default
  `Content-Type: application/json` when `body` is set and the author has not
  supplied their own `Content-Type`.
- Add `createDefaultRegistry()` in `src/engine/host.ts` (not
  `src/engine/registry.ts` — see design.md's "Placement note" — importing the
  new handler into `registry.ts` would close an import cycle through
  `outbox.ts`), pre-registering the new handler. Change `startEngine`'s
  `registry` parameter default from an empty `Map()` to
  `createDefaultRegistry()`, so any deployment calling `startEngine()`
  without an explicit registry gets the handler automatically.
- Consume `Action.timeout` (already declared, previously unused) locally in
  the handler via an `AbortController`, bounding only its own `fetch` call.
  `Action.retry` stays unwired into `outbox.ts` (out of scope).

## Capabilities

### New Capabilities
- `http-action-handler`: a registered, vendor-neutral `http.request` action
  handler — its config schema, request/response handling, and permanent-vs-
  transient error classification — plus its default registration into the
  engine's handler registry.

### Modified Capabilities
(none — the handler seam itself, `action-handlers` and
`action-registry-validation`, is unchanged; this change only registers a
concrete handler behind it.)

## Impact

- New: `src/handlers/http.ts`, `test/handlers-http.test.ts`.
- Modified: `src/engine/host.ts` (new `createDefaultRegistry` export,
  `startEngine`'s default `registry` parameter). `src/engine/registry.ts` is
  untouched.
- No schema change (`src/schema/definition.ts` untouched); no change to
  `src/engine/outbox.ts` or `src/engine/registry-check.ts`.
- Compatibility: any caller already passing its own `registry` to
  `startEngine` is unaffected. A caller relying on the previous empty-default
  behavior (e.g. asserting `http.request` actions dead-letter) would need
  updating — expected to be none, since no such type was previously
  registerable.
