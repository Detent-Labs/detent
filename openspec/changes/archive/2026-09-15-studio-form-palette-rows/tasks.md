## 1. Palette rows reuse the entity rail

- [x] 1.1 In `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`, import
      `PanelsRailFieldRow` from `../panels/EntityTabs.js`, `flattenRailFields`
      from `../draft/panel-rail.js`, and `fieldKindIcon`/`fieldKindWord` from
      `../draft/field-type-labels.js`. Verify with `bun run typecheck` (no new
      import errors).
- [x] 1.2 Replace the palette's `unplacedRefs(catalogIds, rows)` id source with
      `flattenRailFields(draft.fields)` filtered to the ids `unplacedRefs`
      would have returned, keeping each row's `depth`, and replace the
      palette's `<li><button className={formPaletteField}>...` markup with
      `<PanelsRailFieldRow>`, computing `label` via
      `resolveDraftLocalizedText(field.label, contentLocale, draft.baseLocale
      ?? "en")` (fallback `t("formEditor.unnamedField")`), `kindIcon` via
      `fieldKindIcon(field)`, `typeLabel` via `fieldKindWord(field)`, and
      `groupLabel={undefined}`, `selected={false}`, `dragging={false}`,
      `issues={0}`. Keep the existing `onClick={() => placeFromPalette(id,
      rows.length)}` and `onDragStart`/`onDragEnd` wiring (pass a no-op
      `onDrop`). Verify with `bun run typecheck` and `bun run build`; order
      and indentation are verified visually by the browser check in 2.1/2.2.
- [x] 1.3 Remove the `formPaletteKey` and `formPaletteType` stylex rules from
      `FormEditorScreen.tsx` if nothing else in the file references them
      (`formPaletteField`/`formPaletteFieldMint` stay — the mint section
      still uses them). Verify with `bun run typecheck` and a grep of the
      file confirming no remaining reference to either removed rule.

## 2. Browser check

- [x] 2.1 Open the form editor for a step with an unplaced group field and an
      unplaced non-group field, per `docs/browser-checks.md`'s existing
      field-card entry. Verify the palette shows each field's resolved label
      and kind icon (no raw key or type text visible), the group's member
      indented under it, and that dragging and clicking a palette row still
      places the field on the canvas. Record the check in
      `docs/browser-checks.md`.
- [x] 2.2 Open the Fields tab on the same process and compare its entity rail
      against the palette from 2.1 side by side. Verify the two rows render
      the same way for the same field (icon, label, indent).
- [x] 2.3 Drop the palette clause from `docs/decisions.md`'s **KEYS-1** entry
      ("The 16rem palette wraps 10 of its 38 keys at every width") since the
      palette no longer shows a key, keeping the canvas-card clause
      unchanged. Verify by re-reading the edited entry: it names only the
      canvas-card wrap, and reads correctly as a standalone sentence.

## 3. Verification

- [x] 3.1 Run `bun run typecheck` and confirm it passes with no errors.
- [x] 3.2 Run `bun run build` and confirm it succeeds.
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes, with no silent skip
      (check the skip count, not just the pass count).
- [x] 3.4 Run the antislop and whitespace gates over this change's touched
      Markdown (`sh scripts/gates/range.sh < /dev/null | sh
      scripts/gates/prose.sh` and the equivalent `whitespace.sh` call) and
      confirm both pass.
