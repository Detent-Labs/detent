## Context

See proposal.md - Why. This section records the evidence a fresh sweep
produced this session. A future reader does not need to re-run it.

**Reference sweep.** A case-insensitive grep for the literal strings
`deprecated` and `archived` covers `src/`, `packages/web/src`, `test/`,
`examples/`, and `openspec/specs/`. It returns exactly one hit for either
string in the whole repository: the enum declaration itself, at
`src/schema/definition.ts:197`. No code path compares against, assigns, or
branches on either value. That holds across the engine, the HTTP layer,
and the Runtime API Layer. It holds across the studio, admin, and
reporting areas too. It holds across form-ui, the tests, and the
examples as well.

**Single consumer.** `definitionStatus` (the exported const) has exactly
one consumer in the repository. `processVersion`'s `status:
definitionStatus` field, at `src/schema/definition.ts:814`, is that
consumer. `ProcessVersion` is the published, versioned wrapper. Its own
comment reads "Not part of the hashed body." `.claude/rules/process-contract.md`'s
Hashing / versioning section confirms `definitionHash` is the JCS hash of
`ProcessBody` only. The versioned wrapper is not hashed. `status` sits on
that wrapper, outside `ProcessBody`. Narrowing this enum cannot move
`definitionHash` for any already-published body.

**Runtime write path.** `src/engine/definitions.ts:288` is the only site
in the engine that constructs a `ProcessVersion["status"]` value. It
hardcodes the literal `"published"`:

```ts
const status: ProcessVersion["status"] = "published";
```

The `definitions` table (`src/engine/store.ts:213-221`) declares `status
text NOT NULL`, with no CHECK constraint. The table's own comment calls it
"one row per published version". Drafts live in a separate `drafts`
table, outside this enum's reach entirely. No code path writes
`"deprecated"` or `"archived"` into that column, at present or ever. This
table receives only one enum member today: `"published"`.

**Git-history check.** `authoring-invariants.md` warns that
`src/schema/definition.ts` also deserializes stored immutable bodies. A
tightened refinement can make an already-published record throw on READ.
That risk applies here only if some past code path once wrote
`"deprecated"` or `"archived"` into a persisted row.

`git log -S'"deprecated"'` and `git log -S'"archived"'`, each scoped to
`src/engine`, `src/schema`, `src/runtime`, and `src/http`, return exactly
one commit apiece. That commit is `2fcea2c`, "Add project scaffold: schema
contract, examples, tests, tooling", the commit that introduced the enum
itself. No later commit ever added a write site for either value. No
stored `ProcessVersion` row can hold either value as its `status`. No code
in this repository's history ever wrote one.

**Prior art.** The archived change
`2026-08-17-ponytail-cut-unreachable-code` already carried this deletion
as a Non-Goal. Its own text: "They live in `src/schema/definition.ts`,
which CLAUDE.md says never changes as a side effect of another task."
This change is the deliberate follow-up that one deferred.

## Goals / Non-Goals

**Goals:**
- Narrow `definitionStatus` to the two members ever written or compared:
  `"draft"`, `"published"`.
- Leave `definitionHash` and every already-published body's readability
  unaffected.

**Non-Goals:**
- Auditing why the `definitions` table only ever stores `"published"`
  rows, or whether `"draft"` belongs on `definitionStatus` at all. The
  `drafts` table already covers drafts, with its own concurrency model,
  unrelated to this enum. That question is separate, larger, and belongs
  to the store's shape, not to this finding.
- Any DB migration. The `status` column carries no CHECK constraint, so
  narrowing the Zod enum needs no schema change alongside it.
- Any change to `ProcessBody`, the definition contract's hashed core.
  This change touches only the versioned wrapper's `status` field type.

## Decisions

**Narrow the enum in place, one line.** `src/schema/definition.ts:197`
changes from:

```ts
export const definitionStatus = z.enum(["draft", "published", "deprecated", "archived"]);
```

to:

```ts
export const definitionStatus = z.enum(["draft", "published"]);
```

No other file changes. `ProcessVersion["status"]` derives from
`z.infer<typeof processVersion>`. The narrower type propagates
automatically to every consumer. The single write site
(`src/engine/definitions.ts:288`) already assigns the literal
`"published"`, a member of the narrowed enum. It keeps compiling and
keeps behaving identically.

**Alternative considered: deprecate via a comment instead of deleting.**
Rejected. The audit finding is explicit: no code calls these members.
The finding names a real absence, not a documentation gap. CLAUDE.md's
authoring-invariants guidance protects already-persisted data; it says
nothing about preserving dead vocabulary. Nothing downstream reads a
comment, so only a genuine caller would justify keeping the wider enum.

**Alternative considered: leave the enum untouched and only file the
audit correction.** Rejected. The finding names this as a `delete`
action. The codebase and git-history sweeps above confirm it is safe. A
deferred, unimplemented finding is exactly what this change exists to
close.

## Risks / Trade-offs

[A future feature wants a deprecated mark in the admin UI] → re-adding a
member widens an already-narrow enum. That costs nothing against data
written under the narrower enum today. Nothing in this change forecloses
that future widening.

[The `definitions` table's `status` column carries no CHECK constraint] →
a malformed manual `UPDATE` could already write an out-of-enum string.
This change does not change that exposure. The column already accepted
four values with no DB-level enforcement. It now accepts two, with the
same gap. The Zod schema never enforced this column; the single write
site in `definitions.ts` does.

## Migration Plan

No data migration. No deployed-state change: no persisted row holds a
value this change removes, per the git-history check above. Deploy order:
land the schema change, then run the full verification suite (see
tasks.md), then ship. A plain revert suffices as rollback, since no data
depends on the wider enum.

## Open Questions

None. Every decision above resolves at design time.
