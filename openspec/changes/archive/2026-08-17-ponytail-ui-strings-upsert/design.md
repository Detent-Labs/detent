## Context

See proposal.md for motivation. Three facts shape the approach.

The table is `ui_string_overrides`. `src/engine/store.ts:397-405` creates it
with `PRIMARY KEY (area, locale, key)`. The existing upsert already carries
`ON CONFLICT (area, locale, key)`. So the arbiter needs no new index.

The engine opens no transaction around this write, and it sets no isolation
level. Postgres therefore runs the write at `READ COMMITTED`. A `count(*)`
inside the insert reads that statement's own snapshot. Two writers can still
each read 1999 and each insert.

The bound is asymmetric today. `admin-routes.ts:802` reads the bound only when
the target row is absent. So an overwrite and a clear stay possible at the
bound. Any single-statement form has to keep that asymmetry. Otherwise an
admin at 2000 rows could no longer correct a typo in one of them.

## Goals / Non-Goals

**Goals:**

- One database round trip per override write, down from three.
- `setUiStringOverride` owns the bound. The route picks the status code and
  the message, as it does now.
- Byte-identical HTTP answers: same statuses, same `error.type`, same message
  text, same response bodies.

**Non-Goals:**

- Closing the concurrency window. See the Decisions section.
- Changing `MAX_OVERRIDES`, changing where it lives, or unexporting it.
  `test/http-ui-strings.test.ts:16` imports it.
- Touching the delete path. A clear removes a row, so no bound applies to it.
- Touching the public `GET /ui-strings` read or `listUiStringOverrides`.

## Decisions

**The bound moves into the insert's `WHERE`.** Not into a constraint, and not
into a trigger. The statement gains a `SELECT` source, a `WHERE`, and a
`RETURNING`. Its conflict clause stays the one it already carries.

<!-- antislop: allow synonym-rotation -->
That clause is `ON CONFLICT (area, locale, key) DO UPDATE`. The new predicate
holds two disjuncts:

```sql
(SELECT count(*) FROM ui_string_overrides) < $max
  OR EXISTS (SELECT 1 FROM ui_string_overrides
              WHERE area = $area AND locale = $locale AND key = $key)
```

The `EXISTS` disjunct carries today's asymmetry. At the bound an overwrite
still matches, and only a new key draws the refusal.

The statement returns `key`, which answers the caller. Zero rows back means
the bound refused the write. One row back means it landed.

A `CHECK` constraint cannot count rows. A statement-level trigger could. It
would raise a database error, and the route would have to translate that error
back into `RequestShapeError`. That is more moving parts than the two round
trips it saves. It also puts a rule the HTTP layer owns into the schema.

**`setUiStringOverride` takes the bound as an argument, and does not import
it.** `MAX_OVERRIDES` sits in `src/http/admin-routes.ts`. It is a statement
about the public read's size, which is an HTTP concern. The engine module
stays what its header calls it: a keyed text store that names no UI string.

An argument keeps that boundary. It also lets the test drive the bound with a
small number, instead of inserting 2000 rows.

The signature becomes
`setUiStringOverride(area, locale, key, value, updatedBy, max, db = sql)`. A
mandatory parameter cannot follow `db`'s default, so `max` goes before it.
That moves `db` from position 6 to position 7. All 14 call sites pass their
handle positionally, so each one moves that argument one place right. One call
sits in `src/http/admin-routes.ts`. Four sit in `test/http-ui-strings.test.ts`
and nine in `test/ui-strings.test.ts`.

**The return type becomes a small union, not a boolean.** Today's `boolean`
means "a row landed or a row went away". The caller now needs three outcomes:
written, cleared-nothing, refused-by-bound. So the function returns
`"written" | "missing" | "at-bound"`.

The route maps `"at-bound"` to the `RequestShapeError` it raises today. It
reads `"missing"` for the `deleted` field it already returns. A second boolean
out-parameter would encode the same three states less plainly.

**The concurrency window narrows and does not close.** Under `READ COMMITTED`
two concurrent inserts can still cross the bound by one row. The comment at
`admin-routes.ts:788-791` already declares that acceptable. It gives the
reason too. The bound keeps the public read small, rather than enforcing an
exact count.

This change does not rest on that judgment. It removes two queries. The
atomicity it gains inside one statement is a side effect worth noting, and not
worth claiming.

A `SERIALIZABLE` transaction would close the window. So would an advisory
lock. Either one costs a retry path, for a bound nobody needs to be exact. Not
taken.

That is why this change declares no capability delta. The audit files finding
23 under `native`, and calls it "a check-then-act that races". Only the first
half of that survives measurement. The change is worth landing for the round
trips.

**The audit corrections carry their measurement.** Findings 5, 28 and 22 move
to one audit section, "Checked, not flagged (deliberate, per CLAUDE.md)". Each
carries the command or the line numbers that disqualify it. The
`waitingLabel` entry and the `prose.sh` collector entry already use that shape
there. Without the measurement the next scan re-derives the finding and
proposes it again. That is what the section exists to prevent.

## Risks / Trade-offs

- The new statement reads denser than the `VALUES` form it replaces → a
  comment names the two disjuncts. It also names why the `EXISTS` half is
  there. A reader understands one statement instead of three.
- This change deletes `uiStringOverrideExists`, which
  `test/ui-strings.test.ts:63` tests → the replacement test drives the bound
  through `setUiStringOverride` with a small `max`. It covers the same
  row-already-present branch. It also covers the refusal the old test never
  reached.
- The bound now runs on every write, an overwrite included → the `count(*)`
  scans a table bounded at 2000 rows. It runs once per admin save.
  `countUiStringOverrides` already ran that same aggregate on the new-key
  path.
- A caller that passes no bound would write without one → the parameter is
  mandatory, so `tsc --noEmit` rejects that call. No default.
- A clear takes a `max` it never reads → the delete branch returns before the
  predicate. An optional `max` would let a forgotten argument skip the bound
  in silence. Mandatory and unused beats optional and skippable.
- The route stops reading `countUiStringOverrides`, so only `test/` reaches it
  → the function stays, because the bound test drives it. Task 4.7 records it
  under `PONYTAIL-AUDIT.md` finding 41, which tracks that category.

## Migration Plan

None. No schema change, no data change, no rollout order. The change is one
function body, one route body, one deleted function and one test.

## Open Questions

None.
