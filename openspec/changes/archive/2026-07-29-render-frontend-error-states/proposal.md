# Stop reporting failures as emptiness in the browser packages

## Why

Every SPA screen that loads data uses the same shape:

```ts
catch (err) {
  if (err instanceof XClientError && err.status === 401) onUnauthorized();
  else throw err;
}
```

There are 25 of these across the four packages (`InstancesScreen`,
`InstanceScreen`, `OutboxScreen`, `TimersScreen`, `UsersScreen`,
`TasksScreen`, `StartScreen`, `EditScreen`, `VersionsScreen`,
`ProcessesScreen`, `MigrationPlanScreen`, and the three `LoginScreen`s).
Rethrowing inside an `async` callback or a `.catch` handler cannot reach a
React error boundary — and a repo-wide grep for
`componentDidCatch|ErrorBoundary|getDerivedStateFromError|unhandledrejection`
across all five packages returns **zero** matches. So the throw becomes an
unhandled rejection and the screen renders as if nothing had gone wrong.

What the user then sees is not a blank screen — it is an affirmative false
statement. The client wraps a network failure as
`new AdminClientError({type:"internal", ...})` with no `status`, and any
5xx/403/422 also has `status !== 401`, so an outage takes the rethrow branch.
`finally { setLoading(false) }` still runs, so `InstancesScreen` renders
**"No instances match these filters."** and `VersionsScreen` renders
**"No published versions yet."** — indistinguishable from a genuinely empty
result. An operator reading `/instances` during a database outage is told the
system is idle, which is the single worst answer an operations console can
give. `studio/EditScreen.tsx` is worse still: its throw at `:148` leaves
`record` at the initial `"loading"` sentinel, so the screen renders
`Loading…` permanently, with no retry.

The template for the fix already exists in the same repo:
`packages/app/src/screens/TaskScreen.tsx`'s `withErrorHandling` distinguishes
401 / validation / claim-lost / moved-on, reverts optimistic UI when the
server disagrees, and guards against a second failure escaping during its own
recovery refetch. `packages/app/src/errors.ts::describeError` is the localized
message layer it funnels into.

A second, smaller defect lives in the same flow. `DraftToolbar`'s `savedBody`
is seeded at mount and advanced only on a successful save; `reload()` replaces
the draft and the save state but never calls `setSavedBody`. After a
409-then-reload — the exact flow the conflict banner exists to drive — `draft`
holds the freshly-fetched server body while `savedBody` still holds the
discarded local edits, so `isDirty` compares two unrelated bodies and returns
true for a draft byte-identical to what the server stored. `DraftToolbar` is
not remounted by `replace()`, so the false-dirty state persists: publish then
always prompts `publishConfirmSave` on a clean draft. Accepting re-PUTs the
just-fetched body, bumping the stored revision for nothing and invalidating a
concurrent editor's in-flight revision; declining silently aborts a publish
the user was entitled to make.

## What Changes

- Every `else throw err` in a load or action handler becomes a rendered error
  state: `setError(describeError(...))` or the per-app equivalent. The 401
  branch is unchanged.
- Every empty state is gated on `items.length === 0 && !loading && !error`, so
  "nothing here" is only said when the request actually succeeded.
- `studio/EditScreen` gets an explicit error sentinel instead of leaving
  `record` at `"loading"`, and offers a retry.
- Each app gains one `ErrorBoundary` around its routed screen — a backstop for
  render-time throws, not a substitute for the per-screen handling.
- `DraftToolbar.reload()` sets `savedBody` to the reloaded body, so a reload
  is the clean point it is by definition.

## Capabilities

### New Capabilities

- `spa-error-reporting`: one rule for all four browser packages — a failed
  request is rendered as a failure, never as an empty result or a permanent
  loading state, and every empty state is conditioned on a successful load.

### Modified Capabilities

- `studio-app`: reloading after a save conflict leaves the draft in a clean,
  not-dirty state, so publishing does not prompt to save a draft identical to
  the server's.

## Impact

- 25 call sites across `packages/admin`, `packages/app`, `packages/studio`
  (and `packages/editor`, if it still exists when this lands — it is deleted
  by `studio-tools-and-player`).
- Each package gains a small `ErrorBoundary` component and, where it does not
  already have one, an error-message catalog entry. `packages/app` has both
  the pattern (`withErrorHandling`) and the catalog (`describeError`); admin
  and studio need the equivalent.
- Empty-state conditions change in every list screen — a rendering change a
  reviewer should read screen by screen, since each one currently reads as a
  positive statement about the data.
- `packages/studio/src/panels/DraftToolbar.tsx` — one added line, plus the
  first component test in that package.
- No engine, HTTP or contract change; no new dependency.
- UI work: per `CLAUDE.md`, the implementation goes through the design skills
  before any error/empty state is reshaped visually.
