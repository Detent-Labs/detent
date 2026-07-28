## 1. Port the load-time shape guard

- [x] 1.1 Add `packages/studio/src/draft/load-guard.ts`: copy `LoadGuardIssue` and `checkDraftShape` from `packages/editor/src/draft/load-guard.ts` verbatim (do not modify `packages/editor`).
- [x] 1.2 Add `packages/studio/test/load-guard.test.ts` (no equivalent exists yet in `packages/editor/test/` to mirror) covering: non-object root rejected; an unrecognized top-level key flagged; each `expectString`/`expectArray`/`expectObject` field flagged when present with the wrong type; a fully-valid object and an empty object `{}` both return no issues.

## 2. Parse/format logic

- [x] 2.1 Add `packages/studio/src/panels/draftJsonLogic.ts`: `parseDraftText(text): { draft: Draft } | { error: string }` — empty/whitespace-only text short-circuits to `{ draft: {} }` (matching `migrationPlanLogic.ts::parseSpecText`'s empty-input convention); otherwise `JSON.parse`, catching a syntax error into `{ error }`; on parse success, run `checkDraftShape` and, if it returns any issues, join them into one `{ error }` string (one issue per line: `${path}: ${message}` when `path` is non-empty, else just `message`); otherwise return `{ draft: value as Draft }`. Also add `formatDraftText(draft): string` (`JSON.stringify(draft, null, 2)`).
- [x] 2.2 Add `packages/studio/test/draftJsonLogic.test.ts`: valid object round-trips through `formatDraftText`/`parseDraftText`; malformed JSON returns `{ error }`; a valid JSON array/string/number/boolean/`null` each return `{ error }`; a valid object with a wrong-typed known field (e.g. `{ fields: "oops" }`) returns `{ error }` mentioning the field; empty/whitespace text returns `{ draft: {} }`.

## 3. JsonView component

- [x] 3.1 Add `packages/studio/src/panels/JsonView.tsx`: props `{ draft: Draft; onApply: (draft: Draft) => void }`; local `text` state seeded once via `useState(() => formatDraftText(draft))` (no resync effect); a `<textarea className="studio-json-editor">` bound to `text`; a local `error` state; an "Apply" button that calls `parseDraftText(text)`, sets `error` on failure, otherwise calls `onApply(parsed.draft)` and clears `error`.
- [x] 3.2 Render `error` inline (`<p className="studio-error">`, matching `MigrationPlanScreen`'s convention) when set, preserving `\n`-separated multi-issue messages (e.g. `white-space: pre-line`).

## 4. Wire into the edit screen

- [x] 4.1 In `packages/studio/src/screens/EditScreen.tsx`'s `EditorArea`, add `const [surface, setSurface] = useState<"structure" | "json">("structure")` and a small toggle control (two buttons/tabs) rendered above the row this change touches.
- [x] 4.2 Group `ProcessHeader`, `FieldCatalogPanel`, `DataSourcesPanel`, `ContractPanel`, and the existing `<div className="canvas-layout">…</div>` under `surface === "structure"`; render `<JsonView draft={draft} onApply={replace} />` under `surface === "json"` instead of that whole group. `ContentLocaleSwitcher` and `RegistryPanel` stay rendered unconditionally, same as `DraftToolbar` — neither mutates the draft body (see design.md). `draft` and `replace` already come from `useDraft()`, no new context plumbing.
- [x] 4.3 Confirm `DraftToolbar`, `ContentLocaleSwitcher`, and `RegistryPanel` stay rendered unconditionally regardless of `surface` (verify only — no code change expected for these three).

## 5. Styling

- [x] 5.1 Reuse the existing `.studio-json-editor` class (already defined for `MigrationPlanScreen`'s textarea) for `JsonView`'s textarea — add a surface-toggle style only if the two buttons need visual distinction beyond default button styling.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`.
- [x] 6.2 Run the full `bun test` suite with `DATABASE_URL` set (never a single-file rerun — the DB-backed suites contend when run in isolation back-to-back; see `CLAUDE.md`) and confirm a clean pass, checking the skip count alongside the pass count.
- [x] 6.3 Manually verify in a running `packages/studio` dev server: open a draft, switch to JSON, confirm no Structure panel is reachable while JSON is shown; edit and Apply a valid change (reflected in Structure); Apply invalid JSON (error shown, draft unchanged); Apply a valid JSON array (error shown, draft unchanged); Apply a valid object with a wrong-typed known field (error shown, draft unchanged); Apply empty text (draft becomes `{}`); switch away and back without applying (edit discarded).
