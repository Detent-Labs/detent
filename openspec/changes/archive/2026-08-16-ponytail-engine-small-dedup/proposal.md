## Why

`PONYTAIL-AUDIT.md`'s 2026-08-16 scan groups findings 9, 18, 19, 21, 29, 34
and 35 as one engine cleanup. Four of the seven are already spoken for. The
change `ponytail-cut-unreachable-code` deletes finding 18 and disqualifies
29, 34 and 35. Finding 19 asks for a change to the engine package's exports
map. It reaches about twenty test files, so it is not small. Findings 9 and
21 remain, and both stay inside `src/engine`.

Each one removes a literal duplication. Two byte-identical helpers and a
seven-line envelope check stand in both `src/engine/templates.ts` and
`src/engine/drafts.ts`. Two site-collection functions in
`src/engine/registry-check.ts` have one caller each. The next line maps
each result into another shape.

A grep sweep also disqualifies the second half of finding 9. The audit
calls `parseJsonb` dead. It asks for three copies plus ten inline sites to
collapse to `raw`. That does not hold. This change corrects the audit, so
the next scan does not re-propose it.

## What Changes

- Export `parseJsonb` from `src/engine/drafts.ts`. Delete the identical
  private copy in `src/engine/templates.ts` (finding 9). The two agree byte
  for byte, comment included.
- Replace the shared half of both `checkEnvelope` bodies with one exported
  `checkJsonEnvelope(kind, body, layout)` in `drafts.ts` (finding 9). It
  holds the two `isJsonObject` guards and the size bound. The `kind`
  argument carries the noun, so every thrown message stays what it is
  today. The `revision` and `baseVersion` checks stay inline in
  `drafts.ts`, since a template has neither.
- Delete `isJsonObject` from `templates.ts` (finding 9). After the previous
  item only `checkJsonEnvelope` reads it, and that sits in `drafts.ts`.
- Inline `collectAssignments` and `collectDataSources` into the two `.map`
  chains that call them (finding 21). The callers are
  `checkAssignmentRegistry` and `checkDataSourceRegistry`. Delete the
  `AssignmentSite` and `DataSourceSite` interfaces with them.
- Correct `PONYTAIL-AUDIT.md`. Re-measure finding 9 against what holds.
  Record findings 9 and 21 as resolved. Move the disqualified half under
  "Checked, not flagged". The evidence sits in `design.md`.

Two claims in finding 9 do not land:

- The function `parseJsonb` is not dead. `src/engine/host.ts:115` exports
  one, and `src/http/admin-routes.ts` calls it six times across five
  lines. One test imports it too.
- The `parseJsonb` in `host.ts` is a different function from the one in
  `drafts.ts` and `templates.ts`. It catches a `JSON.parse` failure and
  answers `undefined`, where the other two let it throw. Its comment names
  the reason: an explicit `::jsonb` cast makes a column arrive as raw text.
  That happens on the two data-list relations. Merging the three would
  change what one of them does on malformed stored text. This change
  touches neither it nor `store.ts:672`'s inline ternary.

Finding 9 makes a third claim: `toTemplate` and `toDraft` are the same row
mapper. That is wrong too. The two rows carry different columns. This
change leaves both mappers alone.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Both findings are internal refactors inside `src/engine`. The inputs,
the outputs and the thrown messages all stay the same. No route changes, no
schema or definition-contract touch, no change to the engine package's
exports map. The change carries `skip_specs: true`, the same marker
`ponytail-cleanup-fetch-hooks-and-imports` uses for its own findings.

## Impact

- `src/engine/drafts.ts`: `parseJsonb` gains an `export`. `checkEnvelope`
  splits, and its shared half becomes the exported `checkJsonEnvelope`.
- `src/engine/templates.ts`: three private helpers go, and the import from
  `./drafts.js` widens.
- `src/engine/registry-check.ts`: two functions and two interfaces go,
  inlined at the one call site each has.
- `PONYTAIL-AUDIT.md`: findings 9 and 21 recorded as resolved, with the
  disqualified half moved and measured.
- `docs/current-state.md:1313` stays as it is. It names four `drafts.ts`
  exports and already omits three more, so it reads as a sample. The two
  new exports are internal plumbing and do not join that line.
- No dependency change, no database change, no HTTP surface change.
