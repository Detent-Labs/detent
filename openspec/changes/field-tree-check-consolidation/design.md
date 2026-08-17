## Context

See `proposal.md` for motivation. This change touches three sites. Each
one walks the field tree, or duplicates a small helper.

The compile pass sits in `src/schema/compile.ts::structuralIssues`. It
calls five functions in sequence: `checkPatterns`, `checkIdResolution`,
`checkColumnMapping`, `checkFieldKeyFormat`, `checkLengthBounds`. Three
of the five share one traversal, `walkFieldsIndexed`, over `body.fields`:
`checkPatterns`, `checkColumnMapping`, `checkFieldKeyFormat`. Each one
runs a single per-field check.

The fourth caller, `checkLengthBounds`, runs that same traversal a
fourth time. It uses it for the field-key-length bound. It also runs
three other bounds that touch no field tree: plugin-type length,
expression length, duration length.

The fifth caller, `checkIdResolution`, calls `collectFieldsDeep`
directly. It skips `walkFieldsIndexed`. It needs the flat id set, not
each field's location. This change leaves it alone.

Two CEL modules duplicate a small filter. Two functions live in
`src/cel/check.ts`: `dataSchema` and `contractFieldSchema`. A third,
`fieldKeyById`, lives in `src/cel/eval.ts`. Each one calls
`collectFieldsDeep`, then filters out `group`-typed entries inline.

The shared deep walk already exists: `collectFieldsDeep`, in
`src/schema/definition.ts`. These three functions never pulled the
group filter out of it.

The `view` object schema lives in `src/schema/definition.ts`. It
declares `renderer: plugin.optional()`. A repo-wide search covered
`src/`, `packages/form-ui/`, and `packages/web/`, grepping for
`renderer`.

That search found exactly two readers, both in `src/schema/compile.ts`.
One is the unknown-key shape check, `walkViewKeys`. The other is the
plugin-type-length sweep, `collectPluginTypeSites`. Both checks validate
the field's own shape at write time. Neither one reads its value.

No engine module reads `view.renderer`. No HTTP route handler reads it.
No `packages/form-ui` rendering code reads it either. The form-ui
package picks its field renderer from `FieldDef.type`, never from a
step-level `renderer` plugin slot.

No authoring surface in `packages/web/src/areas/studio` writes
`view.renderer`. The studio's view and form editor has no control bound
to this key. The field has never had a producer or a consumer since the
schema declared it.

## Goals / Non-Goals

**Goals:**
- Findings 65/66: replace the four separate field-tree traversals in
  `compile.ts` with one `walkFieldsIndexed` pass. Replace three
  independently inlined group-filter loops with one shared `leafFields`
  helper. Both edits preserve every check's located issues. Both edits
  preserve every CEL type-checking result. Both edits preserve every
  runtime guard-context result, for any existing process body.
- Finding 67: delete `view.renderer` from the definition contract. Treat
  this as its own deliberate decision (see Decisions, below). Close its
  two now-dead compile.ts references.
- Trace and record finding 67's actual blast radius. Whoever applies
  this change should know exactly what to check before deploying it. A
  clean grep result alone is not enough.

**Non-Goals:**
- No change to what any check accepts or rejects, beyond finding 67's
  new rejection of an authored `view.renderer`. That rejection uses the
  existing unknown-key mechanism.
- No change to how `checkIdResolution` calls `collectFieldsDeep`. That
  function returns an id set, not a per-field location. No sibling
  function does the same walk. It sits outside both consolidations this
  change makes.
- No new field-catalog capability. No new Plugin envelope. No
  replacement for `view.renderer`. This change deletes the field. It
  does not migrate it to something else.
- No `packages/web` change. The Context section confirms it: no area,
  and no form-ui code, reads the field. So this change touches no area
  capability spec.

## Decisions

**D1: the schema change is its own deliberate act**. It is not a side
effect of the compile.ts/cel consolidation. Two project rule files hold
`definition.ts` to a higher bar than the rest of the engine: `CLAUDE.md`
and `.claude/rules/process-contract.md`. It is the definition contract's
source of truth. It also deserializes every already-published, immutable
body ever stored.

This change bundles finding 67 with findings 65/66 for one reason. The
audit grouped all three as one report. They share the field-tree-walking
machinery.

The schema change is not incidental to the refactor. It gets its own
paragraph in `Why`. It gets its own bullet in `What Changes`, marked
**BREAKING**. This document's Risks/Trade-offs and Migration Plan
sections exist to give that one line the scrutiny the rule demands.

Review may find the risk below unacceptable. If so, finding 67 can drop
out of this change. It can then get re-proposed alone, without touching
findings 65/66. The two edits stay independent in the diff.

**D2: the merged walk runs four checks per field**. Before this change,
each check ran in its own full pass over `body.fields`. `structuralIssues`
called `checkPatterns` first, then `checkColumnMapping`, then
`checkFieldKeyFormat`, then `checkLengthBounds`.

Today's issue order groups by check, not by field. All pattern issues
report first, in tree order. Then all columnMapping issues follow, then
all key-format issues, then all length issues.

The merged pass visits each field once. At that field it runs four
checks, in a fixed sequence: pattern, columnMapping, keyFormat,
keyLength. Then it moves to the next field. A field with two violations
now emits them next to each other. The pre-merge output split them
across two positions in the array instead.

Every individual issue keeps its exact `loc`, `value`, and `message`.
That is the proposal's explicit promise. Only the array's order changes,
for a body with violations spanning more than one check.

The `structuralIssues` function throws the full array in one
`CompileValidationError`, regardless of order. Nothing downstream
branches on issue position.

Two test files may still assert on that position, though:
`test/compile-validation.test.ts` and `test/column-mapping.test.ts`. Each
may check a specific array index, or use array equality, rather than
per-message containment. Whoever applies this change must read both
files' assertions before touching `compile.ts`. Any order-sensitive
assertion should become order-independent. Prefer
`expect(issues).toContainEqual(...)` per issue, instead of reshuffling
the walk to match the old order.

**D3: `leafFields` lives beside `collectFieldsDeep`**. It does not live
inside `src/cel/`. The function `collectFieldsDeep` already lives in
`src/schema/definition.ts`, for exactly this reason. Its own doc comment
names it the one authoritative field-tree walk. That comment ties it to
eval.ts and check.ts too.

The new helper, `leafFields(fields)`, returns `collectFieldsDeep(fields)`
filtered. The filter drops every field whose `type` equals the string
`"group"`. That is one line wrapping an existing export, not a new
traversal. It belongs next to what it wraps.

The module `src/cel/check.ts` already imports `collectFieldsDeep` from
`../schema/definition.js`. Its two call sites change their import line
the same way. So does the one call site in `src/cel/eval.ts`. Each one
drops its inline `for` loop's group filter.

**D4: `view.renderer` gets deleted, not deprecated in place**. One
alternative got weighed and set aside. It would leave the field
declared, but mark it reserved. A declared, unread, optional field is
the exact shape the audit flagged. Keeping it declared would preserve
the issue finding 67 exists to fix.

The field has zero producers: no authoring surface writes it. It has
zero consumers, per the Context section. It carries no product value
worth preserving.

The deletion changes an authored `view.renderer`. Once this change
ships, that key stops being a silently-accepted, silently-discarded
value. It becomes a publish-time unknown-key rejection instead.

That rejection tells the truth. Anyone who hand-authors JSON may include
the key by habit, by mistake, or from a stale example.

## Risks / Trade-offs

**[Risk] Deleting `view.renderer` can break every already-published
body that ever set it**. This is not a cosmetic hash difference. Any
running instance pinned to such a body hits a hard runtime issue. The
rest of this section traces the actual call chain behind that claim.

The function `definitionHash(body)` lives in `src/schema/hash.ts`. It
computes the SHA-256 of the canonical JSON, JCS, of a `ProcessBody`. The
`canonicalize` step reads whatever keys sit on the JS object at hash
time. It carries no memory of a key a schema once declared and later
dropped.

A published body sits as raw JSON, in the `definitions` table. The
engine reads it back on every resolve, through `processBody.parse(...)`,
at `src/engine/definitions.ts:119`. Zod's default object behavior strips
keys the schema does not declare.

Before this change, a stored body's `steps[i].view.renderer` value
parses through unchanged, since the schema declares it. After this
change, the same stored JSON parses differently. It produces a
`ProcessBody` object with no `renderer` key at all. Nothing in the
`definitions` table itself changes; only the schema does.

So the canonical JSON differs. `definitionHash` of the identical stored
row now differs, before this change and after it deploys. This holds
for any body that once set `renderer` to a non-empty value.

A body that never set the key sees no difference. An empty or absent
value round-trips through `.optional()` the same way, either way.

That recomputed hash feeds a check on every single read or transition
of a running instance, in two places. The function `rehydrate`, in
`src/engine/store.ts`, recomputes `definitionHash(body)` from the
freshly-resolved body. It compares that result to `inst.definitionHash`.
On disagreement it throws `PinMismatch`; that is not a soft skip.

`rehydrate` sits behind `loadInstanceForRead`, in `src/runtime/api.ts`.
That is the read path behind `getInstanceView`, `submitAndTransition`,
`claimStep`, and every other runtime-API entry point touching an
existing instance.

The migration function `migrateOne` lives in `src/engine/migration.ts`,
near line 395. It runs the identical recompute-and-compare against the
source body, under a row lock. On disagreement it throws a plain
exception: `"pin mismatch under lock: …"`. So migrating an instance off
the offending version fails the same way migrating it forward would
need to work.

An instance pinned to a body that once set `view.renderer` gets no
warning, and no degraded rendering. It becomes permanently unreadable,
and untransitionable, the moment this schema change ships. That holds
for as long as the pin exists. Even the migration escape hatch hits the
same check. No in-band recovery path exists.

Mitigation: before applying this change, run one read-only audit query
against the `definitions` table (see Migration Plan, below). Check every
published body, not only ones with currently-running instances. A
pinned-but-dormant or paused instance suffers the same issue. Look for
any step whose `view.renderer` is non-null.

The Context section found that no authoring surface has ever written
this key. No example sets it either. So the expected result is zero
rows. The task list below makes that query a gating step, not an
assumption.

Suppose the count is not zero. Then finding 67 must come out of this
change, per D1, and get re-scoped. Two options exist. One: a data
backfill strips the key from the affected stored rows, before the
schema change ships. The key was never read, so stripping it changes
nothing observable. Two: the deletion waits.

**[Risk] The merged walk changes issue array order, for a
multi-violation body (D2)**. D2's own note covers the mitigation: fix
any order-sensitive test assertion during apply. Verify with the full
`bun test` run this change's tasks already need.

**[Risk] `leafFields` could drift if a future group-detection rule
diverges between the three current call sites**. Today all three use
one identical predicate: `typeof f.type === "string" && f.type ===
"group"`. Extracting it preserves behavior by inspection.

Mitigation: `leafFields` becomes the one place that predicate lives. A
future change to what counts as a non-leaf field then touches one call
site, not three. That is the point of the consolidation.

## Migration Plan

1. Before implementing the schema change (finding 67), run the audit
   query from the Risks section above. Run it against a snapshot, or a
   read replica, of the production `definitions` table. One workable
   form:
   `SELECT process_id, version FROM definitions WHERE
   jsonb_path_exists(body, '$.workflow.steps[*].view.renderer')`.

   Adjust the exact predicate to however `view.renderer`'s value shape
   sits in storage. A `Plugin` is `{ type: string, config?: object }`,
   so a presence check on the key is the safest form. Record the
   result in this change's task checklist, as the gating step it is.
2. If the audit returns zero rows, proceed with the schema change as
   proposed. This needs no data migration. No stored body's canonical
   form changes, since none of them carries the key.
3. If the audit returns any rows, stop. Do not merge finding 67 as
   scoped. Split it out, per D1. Bring the affected `(process_id,
   version)` list back for a scoped decision: backfill then delete, or
   defer.
4. Findings 65/66 carry no migration concern. They are pure internal
   refactors, with no schema footprint and no stored-data footprint.
   They can ship on their own, even while step 1's audit is still
   pending, since neither one depends on it.
5. Rollback: assuming step 2's branch, this change carries no data
   migration of its own. Reverting the commit fully reverts behavior.
   No stored row needs unwinding.

## Open Questions

- Should the audit query in Migration Plan step 1 become a permanent
  addition to this repo's release checklist? It could become a general
  gate: does any stored body use a key this release deletes? This
  question can wait. It changes none of this change's specs, approach,
  or task breakdown. It only decides whether a future deletion reuses
  this exact query shape, or writes a new one.
