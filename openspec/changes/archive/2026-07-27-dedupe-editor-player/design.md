## Context

Three independent, unrelated-except-by-location duplications in
`packages/editor/src/player/`:

1. `store.tsx:142-170` — `run`/`runLogin`, both
   `setLoading(true)/setError(undefined)/try{await fn()}catch{...}finally{setLoading(false)}`,
   differing only in the catch body: `run` special-cases a 401
   (`PlayerClientError` with `status === 401`) to call `logout()` and
   return early; `runLogin` always calls `setError(toClientError(err))`.
2. `FieldInput.tsx:5-9`'s `firstLocalizedText` and `PlayerView.tsx:6-9`'s
   `firstText` are the same function body (`Object.values(value)[0] ?? ""`,
   guarded by `if (!value) return ""`), typed slightly differently
   (`LocalizedText | undefined` vs. `Record<string, string> | undefined`) —
   `LocalizedText` (`src/schema/definition.ts`) is itself
   `Record<LocaleCode, string>`, so the two signatures already describe the
   same shape.
3. `client.ts:6` — `PlayerClientError`'s `super(...)` call computes a
   three-way ternary nothing reads (verified via repo-wide grep for
   `.message` in `packages/editor/src/player/`: every hit reads
   `ClientError.message` or a native `Error.message` in a different catch
   path, never `.message` on a caught `PlayerClientError`).

Verified against current file contents before designing this change.

## Goals / Non-Goals

**Goals:**
- Collapse `run`/`runLogin` behind one implementation with the 401-logout
  branch as its only parameter.
- Remove the `firstText`/`firstLocalizedText` duplication behind one
  shared function.
- Delete `PlayerClientError`'s unread message ternary.
- Preserve all three pieces' external behavior exactly.

**Non-Goals:**
- Any change to `PlayerContextValue`'s public shape (`login`, `submit`,
  etc.) — callers of the Player store are unaffected.
- Any change to `ClientError`'s shape or `client.ts`'s HTTP request logic
  beyond the one constructor line.

## Decisions

### `run`/`runLogin` collapse

Single function, `isLogin` as an explicit parameter (matches the audit's
suggested shape) rather than inferring from call site or overloading:

```ts
const run = async (fn: () => Promise<void>, opts?: { isLogin?: boolean }) => {
  setLoading(true);
  setError(undefined);
  try {
    await fn();
  } catch (err) {
    if (!opts?.isLogin && err instanceof PlayerClientError && err.status === 401) {
      logout();
      return;
    }
    setError(toClientError(err));
  } finally {
    setLoading(false);
  }
};
```

`login`'s call site becomes `run(async () => {...}, { isLogin: true })`;
every other call site (`createInstance`, `openInstance`, `refresh`,
`submit`) is unchanged (`run(async () => {...})`).

Alternative considered: keep `runLogin` as a thin wrapper
(`run(fn, { isLogin: true })`) instead of inlining `{ isLogin: true }` at
the one login call site. Rejected as an unneeded extra name for a single
call site — the audit's own suggested signature threads `isLogin` through
`run` directly.

### `firstText`/`firstLocalizedText` consolidation

New file `packages/editor/src/player/locale-text.ts` (not `types.ts` —
that file is pure type declarations today, no runtime code; adding one
function there would break that convention for one function), exporting:

```ts
export function firstLocalizedText(value: LocalizedText | undefined): string {
  if (!value) return "";
  return Object.values(value)[0] ?? "";
}
```

`FieldInput.tsx` imports it directly (same name, same signature — no
change at call sites). `PlayerView.tsx` imports it as `firstLocalizedText`
and drops its local `firstText`; its one call site
(`firstText(view.step.label) || view.step.key`) becomes
`firstLocalizedText(view.step.label) || view.step.key` — `view.step.label`
is already typed `LocalizedText` (`types.ts::InstanceView.step.label`), so
no cast needed.

Alternative considered: keep the name `firstText` (shorter, and it's what
`PlayerView.tsx` already calls it). Rejected — `firstLocalizedText` names
the actual input type precisely (a `LocalizedText` record, not
arbitrary text), and is the name already used by the file with more call
sites (`FieldInput.tsx`, three call sites vs. `PlayerView.tsx`'s one).

### `PlayerClientError` simplification

```ts
export class PlayerClientError extends Error {
  constructor(readonly error: ClientError, readonly status?: number) {
    super(error.type);
    this.name = "PlayerClientError";
  }
}
```

Matches the audit's suggested `super(error.type)` — every `ClientError`
variant has a `type` discriminant, so this is always a short, defined
string, never `undefined`.

## Risks / Trade-offs

- [Risk] `run`'s 401-logout special case is easy to get backwards
  (accidentally applying it to the login call, or dropping it for the
  others) when threading `isLogin` through. → Mitigation revised during
  implementation: `run`/`runLogin` are closures inside `PlayerProvider`
  (a component), never exported, so `player-store.test.ts` only covers the
  *pure* helpers (`createInstanceAndFetchView`, `submitAndFetchView`,
  `parseSeedData`, `editableFieldIds`) — it does not and did not exercise
  this branch, and this project has no jsdom/testing-library setup for
  interactive component tests (confirmed: existing player component tests
  use `renderToStaticMarkup`, no hooks/state interaction). No automated
  test covers this branch either before or after this change. Mitigation
  is therefore a manual dev-server check of both paths specifically (task
  4.2), not an existing or new automated test.
- [Risk] None identified for the other two changes — pure rename/move
  (`firstLocalizedText`) and a dead-code deletion with no reachable
  alternate path (`PlayerClientError`).

## Migration Plan

Pure refactor, no schema/contract/data changes. Rollback is reverting
`store.tsx`, `client.ts`, the new `locale-text.ts`, and the two files that
import it.

## Open Questions

None outstanding.
