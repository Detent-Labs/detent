## Context

See `proposal.md` for motivation. The full walkthrough, with the options
weighed and rejected, lives in
`docs/superpowers/specs/2026-08-02-db-data-lists-design.md`. This document
carries the decisions and their rationale.

Two facts of the current code shape the approach. A data source declaration
lives in the process body, which is immutable and hashed. Its resolution runs
at request time. Nothing pins the result. `resolveFields` already holds the
instance. `optionValuesValid` already reads resolved options rather than
`FieldDef.options`.

The 2026-07-24 data-source-resolution design deferred a second type. It named
the open questions as timeout, cache, and error semantics. It also recorded
that widening `DataSourceContext` stays additive.

## Goals / Non-Goals

**Goals:**

- Keep the declaration in the body and move only the values out.
- Change values with no publish, no new version, and no migration.
- Keep a running instance working when an operator retires a value it holds.
- Keep publishing independent of the state of the tables.

**Non-Goals:**

- Search or typeahead. See `proposal.md`.
- A cache across calls, a change history, an import endpoint, or a CEL
  namespace for data sources. See `proposal.md`.
- Any change to `src/schema/definition.ts`.

## Decisions

### The declaration stays in the body; only the values move

A `"db.list"` data source is still declared in `ProcessBody.dataSources`, with
`config: { listKey }`. Only the option values live in the tables.

Alternative considered: store the declaration in the database too, keyed by
process. Rejected because the body would no longer be self-contained.
Promotion export would ship a JSON that does not run on the target. The
version diff would no longer show what changed about a process. And
`definitionHash` would no longer cover the definition.

### A flat `list_key`, with no scope column

Alternative considered: a `process_id` column, null for a global list.
Rejected because the body already records which process uses which list. A
second notion of ownership can contradict the first. It also forces a
resolution order between a process-scoped list and a global list of the same
key. The admin screen derives usage from `definitions` instead, so the answer
cannot go stale.

### The handler owns its database access

`createDefaultDataSourceRegistry` takes the database handle, and the handler
closes over it. Alternative considered: put a handle in `DataSourceContext`.
Rejected because every existing caller would then have to supply one, for a
type that does not need it.

### `heldValues` carries the retirement rule

`DataSourceContext` gains `heldValues: string[]`, and the query adds
`OR value = ANY($2)`. `resolveFields` supplies the values the instance holds.

One mechanism then covers two needs. `optionValuesValid` already reads the
resolved options. A retired value the instance holds therefore passes
validation with no change to that function. Its label renders because the row
came back with it.

Alternative considered: resolve active rows only, and special-case the
submission check. Rejected because it leaves rendering broken. The
participant would see a select with no matching entry, and the audit trail
would show a bare key.

Alternative considered: return every row with an `active` marker, and let the
UI grey out the retired ones. Rejected for this change because `FieldOption`
is `{value, label}` in the hashed contract. Marking would widen that contract
or add a parallel runtime shape. It would also need renderer work in
`form-ui`, for a case only the holding instance sees.

### Writing replaces the whole value set

One `PUT` replaces the values of a list. Alternative considered: three routes
per value. Rejected because the editing screen saves a table. One `PUT` is
atomic, and the size bound then lives in one place.

An omitted value becomes inactive rather than disappearing. This is what makes
the retirement rule hold. No API path deletes a value row, so no running
instance can lose the label of a value it holds.

### Publishing does not read the tables

The registry check validates the type and the config shape alone. An existence
check would make the same body valid or invalid according to table contents.
The rule "an identical re-publish is a no-op" would no longer hold.

The studio prevents the mistyped key instead. `DataSourcesPanel` offers the
keys the server reports. A draft naming an unknown key draws a warning, never
an error.

### A new role rather than `system:admin`

`system:datalists` gates the routes. The existing roles are narrow and imply
nothing about each other. Staff who maintain cost centres must not gain the
power to cancel instances. Read access also accepts `system:developer`. That
is what lets the studio picker work without a second route.

## Risks / Trade-offs

- [One `SELECT` per view resolution] → The bound keeps a list at 500 rows,
  and the read is an indexed scan. Revisit against a measurement, not a
  guess.
- [A global list can miss the `baseLocale` of a process that uses it] →
  Publishing cannot check this, for the reason above. Rendering falls back to
  a locale that exists. Recorded as a known gap.
- [The admin screens are the larger half of the work] → The engine-side tasks
  land first and stay green. The read path is then usable before any screen
  exists.
- [`heldValues` widens `DataSourceContext`] → The field is optional, and
  `"static"` ignores it. No existing handler changes.
- [A body can name a missing list] → The delete guard blocks the only API
  path. Only direct SQL remains. The canary `Error` names the key.

## Migration Plan

Additive. `initSchema` creates the two tables through its existing
`CREATE TABLE IF NOT EXISTS` path. An existing database gains them on the next
start. Nothing in `definition.ts` changes. `definitionHash` therefore stays
the same, and every published body stays valid. A body with no `"db.list"`
data source behaves as before.

Rollback reverts the touched files and drops the two tables. A body that
already names a `"db.list"` data source would then fail its publish-time
registry check. Rollback after authors adopt the type therefore needs those
bodies withdrawn first.
