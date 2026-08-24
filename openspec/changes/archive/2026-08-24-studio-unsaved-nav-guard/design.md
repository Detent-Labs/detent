## Context

`EditScreen.tsx` already computes the dirty flag the header bar shows:
`isDirty(draft, savedBody)` (`draftToolbarState.ts`), true whenever the
in-browser draft differs from the body last written to the server. Three
controls inside `EditorArea` navigate away from the mounted edit screen
directly (`navigate({ name: "processes" | "versions" | "play" })`), and
`root.tsx`'s top-level nav (Processes/Tools/Templates) does the same one
level up, outside `EditScreen`'s own component tree. Neither checks
`isDirty` first. `DraftToolbar`'s Publish and Discard controls already gate
a destructive action the same way: `if (!confirm(t(key))) return;`. This
change reuses that exact pattern for the navigation guard.

Both sets of controls share one function, though: `root.tsx` creates
`navigate` from `useAreaRoute` exactly once and threads that same reference
into `EditScreen` -> `EditorArea` as a prop. `EditorArea`'s three buttons
call the `navigate` prop they were handed, not a function of their own — so
there is one call point to guard, not six, if the guard sits at the point
`root.tsx` hands `navigate` downward rather than at each button's `onClick`.

`root.tsx` still has no access to `EditorArea`'s `isDirty` value — it lives
three components down (`EditScreen` -> `DraftProvider` -> `EditorArea`),
computed from local `useState`. `root.tsx` needs it only while `route.name
=== "edit"`, to decide whether navigating away must prompt.

## Goals / Non-Goals

**Goals:**
- Every navigation-away control listed in the proposal is blocked by one
  guard, checking the current dirty state with one shared confirmation
  string and the toolbar's existing `confirm()`/`t()` pattern.
- `root.tsx` learns the open edit screen's dirty state without `EditScreen`
  reaching into routing or `EditorArea` reaching into `root.tsx`.

**Non-Goals:**
- No autosave, no draft recovery, no `beforeunload` handling for a browser
  tab close or address-bar navigation (proposal: out of scope).
- No change to what counts as dirty — `isDirty`/`savedBody` stay exactly as
  `draftToolbarState.ts` and `EditorArea` compute them today.

## Decisions

**Report dirtiness upward through one callback prop into a ref, not a
context, a `useState`, or a module-level ref.** `EditScreen` gains an
optional `onDirtyChange?: (dirty: boolean) => void` prop, threaded to
`EditorArea`. `EditorArea` calls it in a `useEffect` keyed on
`isDirty(draft, savedBody)`, and once more on unmount (`dirty: false`) so a
route change away from `edit` can never leave a stale `true` behind.
`StudioArea` (`root.tsx`) holds the received value in a `useRef<boolean>(false)`
rather than `useState` — nothing in `root.tsx` renders differently based on
dirtiness, it is read only inside a click handler, so a ref avoids
re-rendering the whole area on every keystroke-driven toggle and updates
synchronously with no render-batching window. `root.tsx` also resets
`dirtyRef.current = false` in a `useEffect` keyed on `route.name` whenever it
is not `"edit"` (belt-and-suspenders alongside the unmount effect).

Considered a React Context (`EditDirtyContext`) instead: rejected as more
machinery than one boolean needs, and every UI change in this repo already
threads state through explicit props (`go`, `navigate`, `token` all thread
this way through the same files) — a callback prop stays consistent with
that convention rather than introducing a new one.

Considered computing dirtiness in `root.tsx` itself by lifting `saveState`/
`savedBody`: rejected because that state is deep `EditorArea` machinery
(canvas layout, dock state, selection) with no reason to move — only the
one derived boolean needs to leave that component.

**Guard `navigate` once, at the point `root.tsx` hands it downward, not at
each of the six call sites.** `root.tsx` creates exactly one `navigate`
function (from `useAreaRoute`), and both `root.tsx`'s own top-level tabs and
`EditScreen`'s three screen-nav buttons already call that same reference —
`EditorArea`'s buttons take `navigate` as a prop and call it directly, they
never define their own. So `root.tsx` wraps it once:

```
const guardedNavigate = (dest: Route, opts?: NavigateOptions) => {
  if (dirtyRef.current && dest.name !== "edit" && !confirm(t("app.leaveDraftConfirm"))) return;
  navigate(dest, opts);
};
```

(`dest`, not `route`, so the parameter does not shadow the outer `route` from
`useAreaRoute` in the same closure.)

`root.tsx`'s tab `onClick` handlers call `guardedNavigate`; `<EditScreen>`
receives `guardedNavigate` as its `navigate` prop in place of the raw one.
`EditScreen.tsx` needs no guard code of its own — every button that already
calls the `navigate` prop it was handed (the three screen-nav links, plus
the two "Back to processes" buttons in `EditScreen`'s own loading/error
early-return states) keeps calling it unchanged, and that prop is now the
guarded one. The two early-return buttons are covered incidentally, not
specially guarded: `dirtyRef` is always `false` before a draft has loaded,
so `guardedNavigate` never prompts there.
The `route.name !== "edit"` check keeps every in-screen navigation
(`PanelsScreen`'s `onBack`/`onOpenView`/`onShowStep`, `FormEditorScreen`'s
`onBack`, the stepId one-shot effect) unguarded — all of those stay on
`route.name === "edit"`, so only a navigation that actually leaves the
screen prompts. `go()` (cross-area links, e.g. `ProcessHeaderBar`'s
assignment-groups link) is a separate prop and stays untouched — out of
scope per the proposal.

A single new catalog key, `app.leaveDraftConfirm`, is the one
confirmation string `guardedNavigate` reads — the `app.` namespace matches
the existing shell-level key `app.draftIncomplete`, since this guard lives in
`root.tsx` rather than inside a studio panel.

Considered guarding each of the six `onClick` handlers individually
(`EditScreen`'s three, `root.tsx`'s three) with the same
`if (dirty && !confirm(...)) return;` check repeated at each site: rejected
once it was clear all six already resolve to one function reference — six
copies of the same check duplicate logic a single wrap already covers, and
require `EditScreen.tsx` changes that a central wrap makes unnecessary.

**`discard()`'s own navigation must not trip the new guard a second time.**
`DraftToolbar`'s `discard()` (`useDraftToolbarActions`, called inside
`EditorArea`) already gates deletion behind its own
`confirm(t("draftToolbar.discardConfirm"))`, then calls `deleteDraft` and
`onDiscarded()`, which is wired to `navigate({ name: "processes" })` — the
same `navigate` prop `guardedNavigate` now occupies. `discard()` never
reconciles `savedBody` with the (now-deleted) draft, so `isDirty` is still
`true` at that moment; without a fix, `onDiscarded`'s call into
`guardedNavigate` would raise a second, redundant confirmation. `EditorArea`
already receives `onDirtyChange` (the callback into `root.tsx`'s
`dirtyRef`); `onDiscarded` calls `onDirtyChange?.(false)` synchronously
before calling `navigate`, so `dirtyRef.current` is already `false` — no
render or effect round-trip needed, since `root.tsx`'s callback is a plain
ref write — by the time `guardedNavigate` reads it.

Considered having `EditScreen`/`EditorArea` call an unguarded `navigate` for
this one case: rejected, since `EditorArea` is handed exactly one `navigate`
reference (design goal above: guard once, not per-site), and a second,
unguarded reference would reintroduce the two-call-points problem the single
wrap was chosen to avoid.

## Risks / Trade-offs

[A developer who confirms "leave" on the top-level tab, then immediately
regrets it] → Unchanged from today's Discard control: the confirmation
dialog IS the recovery point, and this change adds that recovery point
where none exists today, rather than removing one.

[`studio-player`'s "Player is one of the edit screen's togglable surfaces"
requirement previously promised unsaved edits survive any round trip to
Player] → The current implementation (`DraftProvider`'s local `useReducer`
state, unmounted on route change) already breaks that promise for every
navigation to Player; this change does not introduce the loss, it makes the
existing loss visible and confirmable instead of silent. The `studio-player`
delta in this change's `specs/` reconciles the requirement with that
reality: the guarantee now covers a clean draft only, and an unsaved draft
is protected by the same confirm-then-discard prompt `studio-app` adds
everywhere else. A later change that adds real draft persistence across
Player/Tools would restore the stronger guarantee and is not blocked by
this one — the `studio-app` guard degrades gracefully to a no-op prompt
once nothing is ever lost.

## Migration Plan

Additive: a new optional prop, a new catalog key, and one wrapped `navigate`
in `root.tsx` covering all six existing call sites. No data migration, no
route change, no server change. Ships and reverts as one ordinary commit.

## Open Questions

None. The scope, the guard pattern, and the six call sites are all settled
above.
