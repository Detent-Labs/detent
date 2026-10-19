# Design

## Context

See `proposal.md` for the three defects. The full finding text is under
E1-8, E1-9 and E1-10 in the 2026-10-10 audit record.

`shell/latestGate.ts` already holds a newest-answer gate. `usePagedList`,
`DataListScreen` and `UiStringsScreen` use it, and
`test/shell-latestGate.test.ts` covers it.

The gate has two operations. The `next()` call starts a generation and
turns every earlier `IsCurrent` false. The `current()` call returns the
running generation's `IsCurrent` and turns nothing stale. The Versions
screen keeps an older hand-written counter, `latestCompare`, for the same
purpose.

`checkPlan` in `screens/migrationPlanLogic.ts` returns row errors, and
`MigrationSpecEditor` draws them under the row. Today the transforms rows
draw no error at all: their picker passes `invalid={false}`.

`TemplatesScreen` already asks with the native `confirm()` before a delete.

## Goals / Non-Goals

**Goals:**

- A late answer never writes state for a choice the author has left.
- The migration-plan form names every row the saved plan would lose.
- A create that replaces a template asks first.

**Non-Goals:**

- Aborting the fetch. A dropped answer costs one request, and the gate
  does not need an `AbortController`.
- Blocking the migration-plan save on a browser-side error. No rule in the
  form blocks the save today, and this change keeps that.
- A server-side create-only route for templates. The engine upserts on
  purpose (`src/engine/templates.ts`).

## Decisions

**E1-8: reuse `createLatestGate`, not a third counter.** The gate is a
tested module with the exact two operations the Player needs. A reload
takes `next()`. "Load more" takes `current()`, so a reload started after
the click turns the late page stale. A hand-written `useRef` counter like
`latestCompare` would be a third copy of the same logic.

- Player: one gate for the record. `loadRecord` takes `next()`.
  `loadMoreRecord` takes `current()`. A stale answer writes neither
  `record`, `recordCursor` nor `recordError`.
- Tools: one gate for the catalog choice. `selectProcess` and
  `selectCatalog` each take `next()`. A new process choice also turns a
  catalog fetch for the old process stale, which is correct, since that
  catalog belongs to the old process. A stale answer writes neither
  `versions`, `hasDraft`, `fields` nor `catalogError`.
- The gate lives in `useState(createLatestGate)`, the form the admin
  screens already use.

**E1-9: two new rules in `checkPlan`, drawn at the row.** The rules mirror
the existing duplicate-target rule:

- two `fieldMap` rows with one non-empty `from`;
- two `stepMap` rows with one non-empty `from`;
- two `transforms` rows with one non-empty `target`.

Every row in the collision gets the error, as the duplicate-target rule
already does. The two messages:

- map row: `two rows map this source; the plan keeps only one`
- transforms row: `two transforms target this field; the plan keeps only one`

Neither contains the word `injective`. An existing test filters the
duplicate-target errors on that word. The
transforms row passes `describedBy` and `invalid` to its picker and draws
the error paragraph, the same markup a map row draws.

The server cannot see this collision, because a JSON object holds one key
once. The spec limits the form to rules the server already enforces. The
delta adds one exception for rows the plan cannot hold.

**E1-10: native `confirm()` before the PUT.** The screen itself sets the
shape. Its delete already asks through `confirm()`, so the replacement asks
the same way, with no new dialog component. The check reads
the loaded `items` for the trimmed key. A cancel returns before
`setCreating(true)`, so the form keeps the typed key and the chosen source.

Prompt text: `A template "<key>" exists. Replace it with this version? You
lose the old template body.`

The text stays a literal in the screen, like the delete prompt beside it.
The templates screen reads no catalog key today. The studio `t()` takes no
substitution either. A catalog key for one sentence would need a new format
helper. The `checkPlan` messages stay literals for the same reason. The
audit change `catalog-studio-literal-strings` (E2-19) moves studio literals
into the catalog, and it takes these sentences with the rest.

## Risks / Trade-offs

- [The `items` list is stale] A second curator creates the same key after
  the list loaded. The PUT still replaces without a prompt. → Accepted. The
  engine upserts on purpose. A reload of the list shows the new template.
- [The gate drops an error] A stale request that fails shows nothing.
  → Correct. The error belongs to a choice the author left.
- [No component test renders a race] The web tests do not mount these
  screens. → `checkPlan` gets unit tests. The gate keeps its own tests. The
  browser check delays one answer with a route intercept and confirms that
  the screen drops it.

## Migration Plan

None. The change touches browser code only, with no stored data.

## Open Questions

None.
