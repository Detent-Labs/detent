## Why

Three `PONYTAIL-AUDIT.md` findings (2026-07-26 scan) live in
`packages/editor/src/player/`, the Player/preview subsystem, and are
bundled here for that reason — all are zero-risk, behavior-preserving
cleanups with no user-visible change:

- Finding 4: `run`/`runLogin` in the Player store (`store.tsx:142-170`) are
  near-identical `setLoading`/`setError`/try/catch/finally wrappers,
  differing only in whether a 401 triggers logout.
- Finding 5: `firstText` (`PlayerView.tsx:6-9`) and `firstLocalizedText`
  (`FieldInput.tsx:5-9`) are byte-identical "first value of a
  locale-keyed record" one-liners, duplicated in the same directory.
- Finding 8: `PlayerClientError`'s constructor (`client.ts:6`) computes a
  `super(...)` message via a three-way ternary
  (`error.type === "validation" ? "validation" : ... : error.message`)
  that nothing reads — every catch site reads `.error` (the typed
  `ClientError`) or `.status`, never `Error.prototype.message` on a caught
  `PlayerClientError`. Confirmed via repo-wide grep: the only `.message`
  reads in `packages/editor/src/player/` are on `ClientError`/native
  `Error` values, never on a caught `PlayerClientError` itself.

## What Changes

- Collapse `run`/`runLogin` into one `run(fn, { isLogin })` helper (or
  equivalent) in the Player store — the only behavioral difference (401 ->
  logout vs. 401 -> generic error) becomes a conditional inside the shared
  body.
- Move one of `firstText`/`firstLocalizedText` into a shared location
  (`player/types.ts` or a small new util) and import it from both
  `FieldInput.tsx` and `PlayerView.tsx`, deleting the duplicate.
- Simplify `PlayerClientError`'s constructor to `super(error.type)`,
  dropping the unread ternary.

## Capabilities

### New Capabilities
- `player-store-consolidation`: two structural requirements — the
  request-lifecycle wrapper (`run`) is implemented once and reused for
  every player store call regardless of whether it's the login call, and
  the "first available locale value" lookup is implemented once and reused
  by every player component that needs it — the mechanism-level
  counterpart to `array-crud-by-index-consolidation`/
  `draft-array-mutation-consolidation`, bundled under one capability the
  way `registry-error-consolidation` bundled two related
  registry-validation mechanisms. External behavior (loading/error state
  transitions, rendered "first value" text) is unchanged; this capability
  exists to keep the "don't re-duplicate this" constraint from silently
  regressing.

### Modified Capabilities
None. Finding 8 (simplifying `PlayerClientError`'s message ternary) has no
capability coverage in `openspec/specs/` — the ternary's alternate branches
were never reachable behavior (nothing reads `.message` on a caught
`PlayerClientError`), so there is no requirement to delete or modify — it
stays a plain deletion with no spec delta, the same treatment finding 6
got in `dedupe-editor-panel-crud` and the dead-file deletion got in the
2026-07-24 audit-cleanup change.

## Impact

- Affected files: `packages/editor/src/player/store.tsx`, `FieldInput.tsx`,
  `PlayerView.tsx`, `client.ts`. Likely a small new shared util (or an
  addition to `player/types.ts`) for the locale-text helper.
- No change to `src/schema/definition.ts`, the JSON process definition
  contract, or any engine/HTTP-wrapper code — editor-internal only. The
  Player talks to the HTTP wrapper as a client; this change touches none
  of the request/response shapes, only internal client-side bookkeeping.
- No dependency changes.
