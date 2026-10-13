# Proposal

## Why

The published field "Amount" has key `amount`. A guard reads
`data.amount > 1000.0`. The author changes the label to "Total amount".
Today the key follows the label to `total_amount`, because the key still
equals the prior derivation. No code rewrites the guard. The checks rail then
reports an unknown variable and never names the rename. A key typed by hand
also writes on every keystroke, so a half-typed key reaches the same readers.
The 2026-10-10 audit recorded this as E2-7.

## What Changes

- A label change no longer changes the key of a field that a CEL expression
  reads. The same holds for a field that the base version holds. The key then
  changes only through the key input.
- The key input of a non-group field commits on blur or Enter. A group
  field's key input already does.
- The key input shows how many CEL expressions read the key. It says that a
  key change does not touch them. A published field without readers shows a
  notice that the label no longer sets the key.
- A published field's key stays open to a change in the next version. Instance
  data uses the `id`, and a running instance keeps its own version.
- No change rewrites a reader. A "rename and rewrite readers" command can
  follow later.
- Out of scope: an option value that a CEL comparison names. Plugin config
  mapping values (FIELDS-17) and a reused key (FIELDS-18) stay open too.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the requirement "The field catalog's field key auto-derives
  from the field label" gains the lock. The field catalog gains two
  requirements for the key input: the commit on blur, and the reader notice.

## Impact

- `packages/web/src/areas/studio/`: `panels/FieldCatalogPanel.tsx`,
  `panels/fieldCatalogLogic.ts`, `screens/EditScreen.tsx`, the studio
  catalog, a new `draft/key-readers.ts` and a new `draft/publishedFields.tsx`.
  The file `draft/field-removal.ts` reads `key-readers.ts` too.
- `src/` and `src/schema/definition.ts` stay as they are. The definition
  contract stays as it is. `docs/authoring-guide.md` states no derivation
  rule, so it stays too.
- `packages/web/test/` gains tests for each task group.
- `docs/browser-checks.md` gains one entry and fixes one.
- `docs/decisions.md` loses the audit index entry for this change. It gains
  FIELDS-26 for the option-value gap that this change leaves open.
- Each open draft with a base version makes one more `getVersionBody`
  request. The Changes tab already makes the same request.
