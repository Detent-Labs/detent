## Context

`packages/studio`'s edit screen (`EditScreen.tsx`) currently renders exactly
one layout for `EditorArea`: `DraftToolbar` (save/publish/discard) above a
`canvas-layout` row that always shows `CanvasView` beside `StepsPanel` as a
fixed inspector. There is no way to see or edit the draft's full JSON body
directly — only per-entity panels and the canvas's drag affordances. The
Process Studio design (`docs/superpowers/specs/2026-07-27-process-studio-design.md`,
Screens: `/processes/:id/edit`) calls for three surfaces over one draft —
Canvas, Panels, JSON — with the JSON surface explicitly "replacing, not
two-way": edit, parse, validate, replace the draft; invalid JSON replaces
nothing; one synchronization direction, so no cursor jumping and no
partial-parse state.

Three existing surfaces in this codebase already do exactly this at smaller
scope, and all three are the pattern to reuse rather than invent a fourth
way:
- `packages/editor/src/panels/ActionListEditor.tsx`'s `configText` — a local
  textarea over one action's `config`, `JSON.parse` on change, an error
  state on failure, `onChange` only on success.
- `packages/studio/src/screens/migrationPlanLogic.ts` (`parseSpecText`/
  `formatSpecText`) plus `MigrationPlanScreen.tsx`'s `text`/`error`/`save()` —
  a local textarea over a whole `MigrationSpec`, seeded once on load, parsed
  only on an explicit "Save plan" click, never partially applied. Empty/
  whitespace text is treated as an empty, valid document (`parseSpecText`
  returns `{ spec: {} }`, not an error), not a special case worth diverging
  from.
- `packages/editor/src/draft/load-guard.ts` (`checkDraftShape`) — a
  load-time-only shape guard for exactly the same problem this change has:
  a pasted/loaded JSON blob becoming a `Draft` that every panel then
  destructures without a runtime schema behind it. It rejects a non-object
  root outright and, for each top-level key present, checks it against the
  minimal shape panels actually need (`fields`/`dataSources` arrays,
  `contract`/`label`/`description` objects, `key` a string), returning a
  list of `{ path, message }` issues rather than a single opaque error. It
  was dropped from `packages/studio` only because the whole file-based
  Load/Import path it guarded (`file-io.ts`, `file-system-access.d.ts`,
  `panels/FileToolbar.tsx`) was replaced outright by the draft routes in
  `studio-shell-and-drafts` — the guard itself was never judged unnecessary,
  and this change reintroduces the exact problem it solves.

`EditorArea` currently also renders several panels that mutate the draft
body directly, unconditionally, above the row this change touches:
`ProcessHeader` (`draft.key`/`draft.label` via `mutate()`),
`FieldCatalogPanel`, `DataSourcesPanel`, and `ContractPanel` (each also
`mutate()`-based). `RegistryPanel`, by contrast, does not touch `draft` at
all — it toggles `registry` (which `Registry` `checkActionRegistry` runs
against for live validation), a value orthogonal to the draft body, so it
makes sense showing regardless of which editing surface is active.
`ContentLocaleSwitcher` is similar: it only selects which locale
`LocalizedTextInput` instances (nested in the body-editing panels) display,
so it's inert — but harmless to leave visible — while the JSON surface is
shown.

The Draft model (`draft/store.tsx`) already has the exact write path this
surface needs: `replace(next: Draft)`, dispatched today only from Load/Import
in the editor (`reducer`'s `"replace"` branch, which also bumps
`loadGeneration` — the signal a future graph-refit or similar already keys
off, distinct from `mutate()`'s in-place Immer patch every panel uses).
`Draft` (`draft/types.ts`) is a fully-optional structural relaxation of
`AuthoredProcessBody` with "no independent runtime schema" — replacing it
with any plain object is already a state every panel already tolerates
(an empty or partial draft), reported through the existing
`validation.zodValid` banner and `IssueList`, not a new failure mode this
change has to invent handling for.

## Goals / Non-Goals

**Goals:**
- A JSON surface on `/processes/:id/edit`, switchable alongside the existing
  Canvas+Panels layout, showing the draft body as pretty-printed JSON.
- Parse-and-replace only on an explicit action, never per-keystroke: local
  textarea state, independent of the Draft until applied.
- No component that mutates the draft body (`ProcessHeader`,
  `FieldCatalogPanel`, `DataSourcesPanel`, `ContractPanel`, `CanvasView`,
  `StepsPanel` and everything nested under it) can be interacted with while
  the JSON surface is shown, and vice versa — the two surfaces are mutually
  exclusive, not merely visually separate, so a JSON Apply can never
  silently clobber a panel edit made while the JSON tab happened to be open.
- Invalid JSON (parse failure) or a value that fails the ported
  `checkDraftShape` shape guard leaves the current draft untouched and shows
  an inline error (or list of issues) — no partial write.
- Reuse `replace()` — the write path Load/Import already established — not a
  new Draft-mutation surface.

**Non-Goals:**
- A code editor with syntax highlighting, folding, or JSON schema
  autocomplete (Monaco, CodeMirror, …). A plain `<textarea>` matches both
  existing JSON-textarea precedents in this workspace and adds no new
  dependency.
- Live two-way binding between the JSON text and Canvas/Panels edits. The
  design is explicit: one direction, on explicit apply.
- Full Zod/CEL schema validation before replacing. `checkDraftShape` is
  deliberately the same "load-time safety check only" it always was in the
  editor — enough to stop an obviously-wrong shape from crashing a panel,
  not a restatement of `authoredProcessBody`. Full structural/CEL validation
  already runs continuously via `runValidation` on whatever the Draft
  becomes (same as after any panel edit).
- Preserving un-applied JSON edits across a Structure↔JSON tab switch (see
  Risks).

## Decisions

**A `"structure" | "json"` toggle owned by `EditorArea`, wrapping every
body-editing panel, not just `canvas-layout`.** Which surface is showing is
a pure rendering concern local to `EditorArea` (`useState`, same ownership
level as today's `selectedStepId`), not a value any other component reads —
unlike `contentLocale`, which really is shared (the switcher and every
`LocalizedTextInput` need it), a Structure/JSON toggle has exactly one
reader. The "Structure" branch groups `ProcessHeader`, `FieldCatalogPanel`,
`DataSourcesPanel`, `ContractPanel`, and the existing `canvas-layout` block
(`CanvasView` + `StepsPanel`) together — every component in `EditorArea`
that calls `useDraft().mutate()` — so the two surfaces are truly mutually
exclusive per the Goals above, not just visually rearranged. `RegistryPanel`
and `ContentLocaleSwitcher` stay outside the toggle, same as `DraftToolbar`:
neither mutates the draft body, so neither needs surface-awareness.
`DraftToolbar` itself stays mounted and visible regardless of which surface
is active: Apply only mutates the in-memory Draft through `replace()`,
exactly like any panel's `mutate()` call, so Save/Publish/Discard need no
surface-awareness either.

**`JsonView` seeds its local `text` state from the *current* draft once, on
mount — no `useEffect` resync.** Because the toggle conditionally renders
either the Structure group or `<JsonView draft={draft} onApply={replace}
/>`, switching *to* the JSON tab always mounts a fresh `JsonView`, and
`useState(() => formatDraftText(draft))` captures the draft as it stood at
that moment. Switching *away* unmounts it. This gets "one synchronization
direction" for free from React's own mount semantics, without a resync
effect that would fight the user's in-progress typing (the exact bug class
`useEffect`-driven textarea sync is prone to) — the same reasoning
`MigrationPlanScreen` already applies (seed once from the loaded plan, never
resynced while editing). Because the Structure group is now unmounted while
JSON is shown (previous decision), there is no longer any component that
could mutate the draft out from under an open, un-applied `JsonView` — the
mount-once seed is safe precisely because nothing else can move the target
from underneath it.

**Port `checkDraftShape`/`LoadGuardIssue` from
`packages/editor/src/draft/load-guard.ts` to
`packages/studio/src/draft/load-guard.ts` verbatim, and build
`panels/draftJsonLogic.ts` on top of it, rather than inventing a shallower
guard.** `parseDraftText(text): { draft: Draft } | { error: string }` and
`formatDraftText(draft): string`, matching `parseSpecText`/`formatSpecText`'s
shape. `parseDraftText`: empty/whitespace text short-circuits to `{ draft: {}
}` (matching `parseSpecText`'s empty-input convention — a blank draft is
already a valid, reachable state, same as a brand-new process); otherwise
`JSON.parse`, catching a syntax error into `{ error }`; on parse success, run
`checkDraftShape` and, if it returns any issues, format them into one
`{ error }` string (one issue per line, `path: message`, path omitted when
empty) rather than returning the raw issue list — matching this module's
`{ draft } | { error }` return shape and `JsonView`'s single inline-error
display. `migrationPlanLogic.ts` never needed a shape guard because a
malformed `MigrationSpec` is caught remotely by the server's own validation
at `PUT /migration-plans/...`; a malformed `Draft` has no remote gate —
`replace()` writes straight into client state every panel then destructures
(`draft.fields.map(...)`, etc.) — so the same load-time problem
`load-guard.ts` was built for in the editor reappears here verbatim, and
reusing it (not just its shape) keeps the "what counts as a loadable draft"
rule defined in exactly one place rather than two that could drift.
Extracted as a pure module (no React) so it's directly `bun:test`-able,
following the existing convention (`packages/app/src/screens/inboxLogic.ts`,
`migrationPlanLogic.ts` itself).

**Apply calls `replace()` directly; it does not switch the tab back to
Structure.** After a successful parse, `JsonView` calls `onApply(parsed.draft)`
and clears its error; it stays on the JSON tab. Forcing a tab switch back to
Structure on every apply would be an unrequested affordance decision the
design doesn't ask for, and it would fight a workflow where someone applies
several JSON edits in a row. The user can see the result by switching to
Structure themselves, or by leaving and re-entering the JSON tab (which
reseeds from the now-updated draft).

**Styling reuses `.studio-json-editor`**, the class `MigrationPlanScreen`'s
textarea already established, rather than introducing a second JSON-textarea
style.

## Risks / Trade-offs

- **[Trade-off] Switching Structure → JSON → Structure → JSON discards
  un-applied JSON text.** Because `JsonView` remounts fresh from the current
  draft each time the tab is selected (per the mount-seeding decision above),
  typed-but-not-applied JSON is lost on tab-away, silently. This is the
  direct consequence of "replacing, not two-way" and matches
  `MigrationPlanScreen`'s existing behavior (navigating away and back
  re-fetches and reseeds `text`), so it is not a new failure mode for this
  workspace — but it is worth a one-line inline hint ("Unapplied edits are
  discarded when you switch views") so it isn't mistaken for a bug during
  review.
- **[Risk] `checkDraftShape` is a load-time safety check, not a schema —
  a value that passes it can still be structurally wrong in a way it
  doesn't look for** (e.g. `{"contract": {"outcomes": "not an array"}}`,
  one level deeper than the guard checks). → Mitigation: this is exactly the
  shape of partial/incomplete draft the Draft model already tolerates today
  from ordinary in-progress panel editing (`Draft`'s optional-everywhere
  type has no runtime enforcement either); the existing
  `validation.zodValid` banner and `IssueList` already report it the same
  way `checkDraftShape` doesn't try to. This is the same trade-off the
  editor already accepted for file-based Load — porting the guard carries
  its scope, deliberately, rather than widening it here.
- **[Risk] Pasting a very large definition freezes the tab momentarily on
  `JSON.parse` and on the subsequent `runValidation` pass.** → Mitigation:
  same cost profile as loading any large draft today (`runValidation` already
  runs synchronously on every Draft change per `draft/store.tsx`'s existing
  comment that this is fine "at this scale" — dozens of entities, low
  single-digit milliseconds); this change doesn't introduce a new document
  size the app doesn't already have to handle on initial load.

## Migration Plan

Purely additive frontend change — no schema, route, or data migration. No
new dependency, no new backend surface. Rollout is `EditScreen.tsx` gaining a
toggle and conditionally rendering the existing Structure group
(`ProcessHeader`, `FieldCatalogPanel`, `DataSourcesPanel`, `ContractPanel`,
`canvas-layout`) or a new `JsonView`; no existing component's props change,
only `EditorArea`'s own JSX nesting and its new local toggle state.
`packages/editor/src/draft/load-guard.ts` is copied, not modified — the
editor is untouched, per `studio-app`'s existing constraint that this whole
line of changes must not touch `packages/editor`. No feature flag, matching
how `studio-canvas` replaced the panel-only layout outright rather than
running both.

## Open Questions

None blocking. Noted so it isn't rediscovered as an oversight: the discarded
unapplied-edits behavior on tab switch (see Risks) is deliberate, not a gap
to close in a follow-up.
