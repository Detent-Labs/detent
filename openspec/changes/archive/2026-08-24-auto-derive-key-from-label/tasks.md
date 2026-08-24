## 1. Shared derivation utility

- [x] 1.1 Create `packages/web/src/areas/studio/draft/deriveKey.ts` with
      `deriveKey(label: string): string` (lower-case, collapse non-`[a-z0-9]`
      runs to `_`, trim leading/trailing `_`, prefix `_` if the result
      starts with a digit) and `dedupeKey(base: string, taken: ReadonlySet<string>): string`
      (append `_2`, `_3`, … until unused). Verify with a unit test table
      covering: empty label, punctuation-only label, leading digit, already
      collapsed input, and a dedupe collision chain (`base` taken, `base_2`
      taken, `base_3` free).
- [x] 1.2 Add a shared `shouldAutoDeriveKey(currentKey: string, previousLabelDerivedKey: string): boolean`
      helper in `deriveKey.ts`, exported alongside `deriveKey`/`dedupeKey`
      and used at all four call sites (process, step identity zone, step
      canvas rename, field) — encapsulating "empty or still equal to the
      prior derivation". Verify with a unit test covering: empty current key
      (true), current key equal to prior derivation (true), current key
      diverged (false).
- [x] 1.3 At every call site, resolve the entity's `label` with the existing
      `resolveDraftLocalizedText(label, draft.baseLocale ?? "en", draft.baseLocale ?? "en")`
      (`draft/localized-text.ts`) before passing it to `deriveKey`, never the
      current content locale. The `draft.baseLocale ?? "en"` half reuses the
      raw-string coercion `EditScreen.tsx:83`/`EditorDock.tsx:185` already
      apply for `Draft`'s deep-partial `baseLocale`; passing that value for
      BOTH of `resolveDraftLocalizedText`'s parameters is this task's own
      construction (no existing call site does this — `EditorDock.tsx`'s own
      call passes the real `contentLocale` as the first argument instead), and
      relies on the function's own `value?.[locale] ?? value?.[baseLocale]`
      body collapsing to a single read when both arguments match. Verify with
      a unit test in the style of `studio-localizedText.test.ts`: a label
      with entries in two locales derives the same key regardless of which
      locale the test's "current content locale" context claims.

## 2. Process key (studio-canvas)

- [x] 2.1 Wire the process label's inline `onChange` in `ProcessHeaderBar.tsx`
      to auto-derive `draft.key` from the new label using `deriveKey`, gated
      by the lock check against the label's *prior* resolved text. Verify
      with a unit test in `studio-processHeaderLogic.test.ts`'s own style —
      a test-local helper driving `deriveKey`/`shouldAutoDeriveKey` (from
      `deriveKey.ts`) in the exact sequence the `onChange` calls them, the
      same shape as that file's existing `typeBaseLocale` helper, never a
      rendered-and-typed-into DOM test (that file's own doc comment states
      `ProcessHeaderBar` has no interactive DOM test environment to render
      through): typing a label sequence into a new draft derives `key` to
      the expected slug.
- [x] 2.2 Verify a hand-edited process key stops following the label: a test
      that sets `key` directly, then changes the label again, and asserts
      `key` is unchanged.
- [x] 2.3 Verify base-locale-only derivation: a test that sets the process's
      base-locale label (deriving a key), switches content locale, and types
      a translation into the non-base locale — asserts `key` is unchanged.

## 3. Step key (studio-canvas)

- [x] 3.1 Extract the step-key decision into a new
      `panels/stepsPanelLogic.ts`, mirroring `screens/processHeaderLogic.ts`
      (`studio-app`'s "Studio's testable logic is extracted from its
      components" requirement: extraction earns its keep on the decision's
      own branching complexity — base-locale resolution, the lock check
      against the prior derivation, and dedup all compose in one function —
      not merely on `StepsPanel.tsx` lacking a DOM test environment, though
      that's also true here as it is for `processHeaderLogic.ts` and
      `inlineRename.ts`). It resolves the next
      `key` for a step's label edit: given the step's current `key`, its
      prior and new `label`, `draft.baseLocale`, and the sibling keys in
      scope, it returns the derived-and-deduped key, or `undefined` when the
      lock check says to leave `key` untouched. Wire `StepsPanel.tsx`'s
      identity-zone label `onChange` to call it, deduped against
      `draft.workflow.steps[].key` excluding the step itself. Verify with a
      unit test driving the function directly (the `studio-processHeaderLogic.test.ts`
      pattern): creating a step via `newStep` (key `""`) and typing a label
      derives its key.
- [x] 3.2 Verify dedup: creating two steps with the same label produces
      keys `X` and `X_2`.
- [x] 3.3 Verify a hand-edited step key stops following that step's label,
      the same shape as 2.2.
- [x] 3.4 Verify base-locale-only derivation for the step label, the same
      shape as 2.3, plus the accepted gap design.md's Risks names: creating
      a step while content locale differs from `draft.baseLocale` and
      typing a label leaves its key empty.
- [x] 3.5 Wire `CanvasView.tsx::commitRename` to call the same
      `stepsPanelLogic.ts` function 3.1 introduces (alongside
      `inlineRenamePatch` from `canvas/inlineRename.ts`, which still owns
      producing the label patch itself), so the canvas node's inline rename
      and the identity zone's label input stay in agreement per
      `inlineRename.ts`'s existing "cannot drift" contract. Verify with a
      unit test in the style of `studio-inlineRename.test.ts`, driving both
      functions in the sequence `commitRename` calls them: renaming a step
      via the canvas node's inline rename derives its key the same way
      typing into the identity zone would, and a step whose key was already
      hand-locked stays locked through a canvas rename too.
- [x] 3.6 Verify the canvas-rename half of 3.4's dual-route scenario: typing
      a base-locale step label (deriving a key) via the identity zone, then
      typing a translation into a non-base content locale via the canvas
      node's inline rename, leaves the step's key unchanged — driven through
      the same `commitRename` call sequence 3.5 uses.

## 4. Field key (studio-app)

- [x] 4.1 Extract the field-key decision into a new
      `panels/fieldCatalogLogic.ts`, the same shape as 3.1's
      `stepsPanelLogic.ts` and for the same reason: the decision's own
      branching complexity (base-locale resolution, lock check, catalog-wide
      dedup), not merely that `FieldCatalogPanel.tsx` has no interactive DOM
      test environment either. Its dedup `taken` set comes from
      `draftFields(draft)` (`draft/fields.ts`, already the flattened
      top-level-plus-group-children traversal `localized-text.ts` reuses) —
      do not hand-roll a second flatten. Wire the top-level field key input
      in `FieldCatalogPanel.tsx` (around the field editor that currently
      reads `field.key`) to it, gated by the lock check. Verify with a unit
      test driving the function directly: minting a field via
      `mintCatalogField` (key `""`) and typing a label derives its key.
- [x] 4.2 Apply the same wiring, via the same `fieldCatalogLogic.ts`
      function, to the nested `group`-child field editor. Verify with a
      test: adding a field inside a group and typing a label derives that
      nested field's key the same way.
- [x] 4.3 Verify dedup across the whole catalog via `draftFields(draft)`,
      including a top-level field colliding with a label-derived key
      already used by a field nested inside a group.
- [x] 4.4 Verify a hand-edited field key (top-level or nested) stops
      following its label, the same shape as 2.2.
- [x] 4.5 Verify base-locale-only derivation for a field label, the same
      shape as 2.3, plus the accepted gap design.md's Risks names: minting
      a field while content locale differs from `draft.baseLocale` and
      typing a label leaves its key empty.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes with no errors.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes with no silent
      skips, per `scripts/gates/silent-green.sh`.
- [x] 5.3 Mark `ROADMAP.md` stage 45 DONE, noting `Path.key`/`Path.label`
      as the deliberately deferred site (design.md's Open Questions), and
      add its entry to `docs/roadmap-history.md`.
