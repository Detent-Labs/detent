## Why

Three `PONYTAIL-AUDIT.md` findings (2026-07-27 scan) live in `src/http/`
(`errors.ts` + `routes.ts`) and are bundled here for that reason — all are
zero-risk, behavior-preserving cleanups with no request/response shape
change, the same rationale the archived `2026-07-27-dedupe-editor-player`
change used for its three co-located findings:

- Finding 1: `mapError` (`errors.ts:42-100`) is 18 sequential
  `err instanceof X` branches. All but `ConcurrencyConflict` (a bare
  `{type}` body) and the untyped default fallback produce one of exactly two
  shapes: `{type, issues}` (7 classes) or `{type, message}` (11 classes).
- Finding 2: 11 of `routes.ts`'s route handlers each wrap their body in the
  identical `try { … } catch (err) { return mapError(err); }`.
  `handleSubmit`'s extra `AutomaticCascadeLoop` branch (re-fetch and return
  a 200 view instead of an error) makes it the one handler that keeps its
  own explicit try/catch.
- Finding 8: `extractCredential(req)` (`routes.ts:37-39`) just returns
  `req.headers` and has exactly one caller, `resolveActor`, which does
  `resolver(extractCredential(req))`.

## What Changes

- Replace `mapError`'s 18-branch `if`/`instanceof` chain with two ordered
  `{ ctor, status, type }` lookup tables (one per output shape) plus
  `.find()`, keeping `ConcurrencyConflict` and the untyped-fallback default
  as explicit special cases outside the tables. Output for every error type
  is byte-for-byte unchanged.
- Extract a `guarded(fn: () => Promise<HttpResult>): Promise<HttpResult>`
  helper (`try { return await fn(); } catch (err) { return mapError(err); }`)
  and route the 11 non-`handleSubmit` handlers through it, unwrapping their
  business logic into the passed closure. `handleSubmit` keeps its own
  try/catch for the `AutomaticCascadeLoop` branch.
- Collapse `extractCredential`/`resolveActor` into one `resolveActor(req,
  resolver)` that reads `req.headers` directly, carrying forward the
  existing comment explaining why the whole `Headers` object (not a
  pre-extracted field) is the credential. `resolveActor` itself keeps its
  11 call sites unchanged — only the one-line indirection through
  `extractCredential` is removed.

## Capabilities

### New Capabilities
- `http-route-handling-consolidation`: structural requirements — HTTP error
  mapping is driven by shared status/type lookup tables rather than
  independently-maintained `instanceof` branches, every route handler
  (except the one with genuinely different control flow) delegates its
  try/catch to one shared wrapper, and credential extraction has exactly
  one implementation. External behavior (HTTP status codes, response
  bodies, which handler catches what) is unchanged; this capability exists
  so these three duplications don't silently regrow, the same intent as
  `player-store-consolidation` in the archived
  `2026-07-27-dedupe-editor-player` change.

### Modified Capabilities
None. `openspec/specs/http-wrapper/spec.md` already governs this code
(its "Typed Runtime API Layer errors map to specific HTTP statuses" and
"The caller supplies the actor directly; this is not an auth mechanism"
requirements cover the exact behavior findings 1 and 8 touch), but no
requirement's *text* changes — every status code, response body shape, and
the "hand the resolver `req.headers` unchanged, no pre-extracted field"
rule are preserved exactly. Per this repo's established pattern for
audit-driven mechanism-level dedup (`player-store-consolidation`,
`registry-error-consolidation`, `array-crud-by-index-consolidation`, et
al.), this gets its own thin `-consolidation` capability documenting the
"don't re-duplicate this" structural constraint, rather than editing
`http-wrapper`'s behavioral spec for a change that doesn't alter behavior.

## Impact

- Affected files: `src/http/errors.ts`, `src/http/routes.ts`.
- No change to `src/schema/definition.ts`, the JSON process definition
  contract, the Runtime API Layer's exported functions, or any engine code.
  Every HTTP status code and response body for every error type stays
  identical — this is purely internal restructuring of how `mapError` and
  the route handlers are implemented.
- No dependency changes.
- Note (out of scope): `http-wrapper`'s error-mapping table already
  undercounts `mapError`'s actual branches — it lists 11 rows and omits
  `RequestShapeError`, `CrossProcessValidationError`, `DurationValidationError`,
  `CelValidationError`, the `RegistryValidationError` family, and `ZodError`,
  most of which were likely added by later publish-validation work without
  a matching spec update. This change doesn't introduce or resolve that gap
  (`mapError`'s actual mappings are unchanged before/after); documenting it
  is a separate `http-wrapper` spec-accuracy change, not bundled here.
