## Context

`Path.key` is `z.string()` today, no `.min(1)`. `Path.label` is
`z.string().optional()`. `newPath()`
(`packages/web/src/areas/studio/draft/createPath.ts`) seeds `{ id, key: "",
to, trigger }`, with no `label` key at all. Both the canvas's
drag-to-connect gesture and `PathsPanel`'s "add path" action call it. See
proposal.md for the motivation.

`definition-contract`'s placement rule names two criteria for an
authoring-time invariant. One a hand-written body must not bypass belongs
on the publish path (`compileProcessBody`). One whose violation cannot
exist in an already-published body may live in the schema
(`definition.ts`).

<!-- antislop: allow synonym-rotation -->
<!-- "edit rail" is the fixed ui-glossary.md term, not a rotated synonym for "change". -->
A fourth call site reaches `newPath()`: `insertOnPath.ts`. It is the pure
transform behind the edit rail's step-dropped-on-a-path gesture
(`EditScreen.tsx:320`). It passes `newPath()` the retargeted path's old
`to` value, a bare step id, not a `DraftStep`.

## Goals / Non-Goals

**Goals:**

- Tighten `Path.key`/`Path.label` directly in `src/schema/definition.ts`.
- Fix `newPath()`'s default so an author cannot draw a path that reaches
  publish unnamed.
- Backfill the two subprocess examples (the only label-less paths in
  `examples/`). Audit the other two to confirm they already carry labels,
  so all four keep publishing.

**Non-Goals:**

- No `compile.ts` write-path check. The reasoning below covers why this
  invariant needs none.
- No change to how `key`/`label` behave at runtime. CEL, the executor, and
  transition logic never read either.
- No change to `Path.key`'s format. It stays free-form, exempt from the
  CEL-identifier grammar `FieldDef.key` carries.
- No live sync between a path's derived default and a later step rename.
  The default gets computed once, at creation.

## Decisions

**The tightening lands in `definition.ts`, not `compile.ts`**. Neither
placement criterion sends it to the publish path.

The "hand-written body must not bypass" criterion has a reason.
`publishedProcessBody` is the narrow schema behind the idempotent early
return. It carries only the cancel-sink id count, not every write-path
check. A relational check that lives only in `compile.ts` could dodge that
early return. A hand-written body satisfying the narrow schema slips past
it.

That gap does not apply here. `key`/`label` are plain per-field Zod
constraints on the same `path` object every schema shares: `processBody`,
`publishedProcessBody`, `authoredProcessBody` alike. Tightening the shared
schema reaches every one of them at once. A hand-written body finds no
separate narrow schema left to satisfy instead.

The "violation cannot exist in an already-published body" criterion holds
once this change touches every existing body the repository carries. The
two subprocess examples gain a `label` on each of their five label-less
paths in the same commit. The task 1.4 audit confirms the other two
already carry theirs. No deployment runs this engine.

No stored instance depends on a version somebody else needs (root
`CLAUDE.md`, "Stage: pre-1.0"). An older shape may still sit in a dev
database, and a developer can reseed that. Nothing survives for the
tightened schema to strand.

Alternative considered: a `compile.ts` check mirroring
`checkUnsatisfiableRequiredReadonly`'s placement. Rejected. That check
guards a relational fact, a required-and-readonly pair checked against the
body's own writer set. A single-field `.min(1)` carries no such relation,
so it needs none of the two-layer split that check's shape demands.

The closer precedent is `checkFieldKeyFormat`
(`.claude/rules/authoring-invariants.md`). It too is a single-field check,
`FieldDef.key` against the CEL identifier grammar, on the same shared
schema objects. Yet it lives in `compile.ts`. The reason differs: bodies
already existed that would have violated the tightened format when that
check landed. That prior state closed the schema route to it.

This change ships its own audit and backfill (tasks 1.4-1.5) in the same
commit as the schema tightening. No already-published violator survives
past this commit. The schema route stays open here, unlike for
`FieldDef.key`.

**The `.trim()` is the schema's first output-mutating operation.** This
change makes that choice deliberately. Today, `definition.ts` carries no
`.trim()`, `.transform()` or `.default()`: parse output equals authored
input. Now `z.string().trim().min(1)` breaks that rule. An authored
`key: " ab "` parses to `"ab"`.

The consequences stay safe. A stored body is always the parse output.
Publish parses, compiles, and stores it. As a result, no stored body ever
carries padding. The `definitionHash` field keeps covering that parse
output, exactly as it does today.

Two authored inputs differing only in padding collapse to one hash. This
is canonicalization, not a bypass: the same spirit as the JCS
canonicalization the hash already applies. Consider the non-mutating
alternative, `.refine((s) => s.trim().length > 0)`. It rejects the same
whitespace-only input but keeps padding verbatim. This change instead
chose the mutating form, so the studio's padded keystrokes normalize at
publish rather than surviving it.

**`newPath()`'s default comes from the source and target steps**. It gets
computed once, at creation. Considered and rejected: a generic placeholder
(`"path-3"` / `"New path"`) is cheaper to build. It leaves a process with
several indistinguishable defaulted paths.

That does not close the real gap this change targets: a reader still
cannot tell paths apart on sight. Considered and rejected: block creation
until the author types a name, via a focused input and a blocking
checks-rail issue. That adds friction to drag-to-connect, the one gesture
this area's own spec already optimizes for speed. No blocking intermediate
Draft state exists anywhere else in the canvas either.

**The default label puts an arrow between the source and target step's
label**. Each step's key stands in when it carries no label. This gives
every path a name specific enough to read on sight. It costs the author
no typing. It stays fully editable afterward, like any other path field.

**A step with neither key nor label falls back to an "unnamed step"
placeholder, not an empty string**. The function `newStep()` hardcodes
`key: ""`. Its callers pass a `seedLocalizedText()`-seeded empty label
(`CanvasView.tsx:615`, `EditScreen.tsx:314`). Nothing renames it
automatically. Two of the four `newPath()` call sites hit this state
directly: the drag-to-empty-canvas branch, and the step-dropped-on-a-path
gesture. Both call `newPath()` with a step that was just created and never
renamed.

The same fallback covers a target the draft no longer holds. A
dropped-on path whose `to` dangles keeps that original id. The derivation
then falls back to the placeholder for the target side alone. A step
named with no alphanumeric characters (`"!!!"`) never reaches that
fallback, since it carries a label.

Its slug then comes out empty. The key side then falls back to the
placeholder's slug, computed and stripped by the same pipeline. Otherwise
the joined `key` would violate the rule this change adds.

Deriving a label from an empty key and an empty label would build an
empty or arrow-only string. That defeats the point of this change. This
change reuses one piece of `CanvasView.tsx`'s existing `stepLabel()`
helper, not its whole fallback chain. The helper `stepLabel()` reads
`` s.key || resolveDraftLocalizedText(...) || t("steps.unnamedStep") ``,
key first.

This change's own derivation order is label-first instead. That is the
opposite of `stepLabel()`'s order. Above states the rule: "Each step's
key stands in when it carries no label."

Only the terminal placeholder string, `steps.unnamedStep`, carries over.
The code in `stepLabel()` is precedent for that one placeholder alone. The
derivation reuses it instead of inventing a second "no name at all"
string. It is not precedent for the priority order the new derivation
uses. The derivation takes the already-resolved string as a parameter.
Each call site resolves it via the catalog's `t`, keeping
`createPath.ts` pure.

A derived path name benefits more from the human-readable label than the
compact key. The whole point is a name a reader recognizes on sight. The
key-first order in `stepLabel()` serves a different purpose instead: a
stable, short string for a rename dialog.

**PathsPanel's "add path" action picks its target first.** It creates the
path only after that pick. The function `addPath()` (`PathsPanel.tsx:53`)
calls `newPath()` right on click. It passes `steps[0]?.id` as the target.
That value, `steps[0]`, is whichever step happens to sit first in the
draft's array. It is not a target the developer chose. The real target
only gets picked afterward, via the `to`
`<select>` the new row renders (PathsPanel.tsx:77-89).

Once `newPath()` derives its default `key`/`label` from the target step,
that ordering stops being a cosmetic quirk. It derives a confident-looking
name against the wrong step. It then leaves that name stale the moment
the developer retargets. The row might read "Manager review → Approve"
moments before the developer picks a different target. That reads worse
than today's empty-label state, which at least reads as unfinished.

Fix: "add path" requires a target selection before it creates anything.
PathsPanel adds one target `<select>` above the list, populated the same
way the per-row `to` select is, defaulting to no selection. "Add path"
stays disabled until that select holds a value, alongside the existing
empty-list and terminal guards. Clicking it then calls
`newPath()` with the chosen target already resolved. It appends the new
row and resets the target select back to empty.

This makes the Paths-tab path genuinely equivalent to a canvas drag. In
both cases, `newPath()` never runs against a target the developer has not
chosen yet.

Alternative considered: re-derive `key`/`label` whenever the `to` select
changes, as long as neither field has been hand-edited since creation.
Rejected here. It needs a pristine/hand-edited flag per field that
nothing else in this panel tracks. The target-first ordering avoids that
flag by construction. A real target, already resolved before `newPath()`
ever runs, needs no re-derivation step at all.

## Risks / Trade-offs

- **A manual path's label is participant-facing, not just an inspector
  name**. The component `PathButtons.tsx:17` renders `path.label ??
  path.key` as the literal submit-button text a participant sees. The real
  Task screen mounts that component, at `TaskScreen.tsx:353`. So does
  `PlayerScreen.tsx:223`.

- Once every path carries a required label, an unrenamed drag-created path
  ships a derived label, not a short verb. The derived form reads
  "`<source step> → <target step>`", for example "Manager review →
  Finance sign-off." That string is longer than a short verb like
  "Approve."

- **Accepted.** This is a display-text change only, not a correctness
  break. Today's path shows a blank label or a raw id, which reads worse.
  It stays inside this change's stated non-goal, "no change to how
  key/label behave at runtime." The file `PathButtons.tsx` already reads
  `label ?? key` today, before this change, and keeps doing so after.

- Fixing the wording quality of an unrenamed manual path's label is a
  follow-up, not required here. The comment at
  `src/schema/definition.ts:49-51` claims Path label/description is
  "Authoring-facing-only... never rendered to a process participant".
  That claim is already false today (`PathButtons.tsx:17`). Task 1.1
  corrects it in the same edit as the tightening.

- **A derived default goes stale after a step rename**. An author may read
  it as a live label. The requirement states it plainly: computed once,
  never resynced. A step label and a field label behave the same way
  elsewhere in this schema.

- **A split leaves the retargeted path's derived label on the wrong
  step**. Dropping a step on "Manager review → Finance sign-off" leaves
  that label on the path now pointing at the inserted step. The
  retargeted path keeps its `label`, the same way it keeps its `key`.
  The base spec's keep-list names `id`, `key`, guard and priority; it
  predates required labels. Re-deriving on retarget is the pristine-flag
  mechanism the Decisions section already rejected. This design accepts
  that trade-off under the same "computed once, never resynced" rule as a
  step rename.

- **A derived label bakes in the author's studio locale**. The field
  `Path.label` is a plain, non-localized `z.string()` (`definition.ts:444`).
  The field `Step.label` is a `LocalizedText` map resolved per-viewer
  instead. The function `newPath()` resolves each source/target step's label
  via `resolveDraftLocalizedText(value, contentLocale, baseLocale)`, at the
  author's currently active studio content locale. It bakes that one plain
  string into the path's `label`, the same string every participant sees,
  regardless of their own locale.

- This is a new systematic outcome. Today an unrenamed path's label is
  blank, never shown to a participant in the wrong language. Accepted for
  the same "display-text-only" reasoning above. A later change that
  revisits `Path.label`'s non-localized shape should account for this.

- **The example sweep misses a path**. A rejection test guards it. It
  lands in `test/validate.test.ts`, alongside this change's other
  `definition-contract` rejection tests. It fails loudly on any example
  with an empty or absent label still in it. A full `bun test` run covers all four at once.

- **A dev database seeded before this change carries a definition body
  that now fails to parse on read**. That parks its instances. The
  pre-1.0 stance (root `CLAUDE.md`) accepts this outcome. Reseed. No
  production deployment exists to protect.

## Migration Plan

None for a deployed system: none exists. A developer's local seed data
carrying an older-shaped path needs a reseed after this change lands, per
the risk above. A saved studio draft carrying a label-less path keeps
opening. The draft load path never parses against the schema. The checks
rail flags the new violations on open. Only the next publish blocks
until the author fills the fields.

## Open Questions

None. The default-naming strategy, the placement, and the example-sweep
scope are all decided above.

`ROADMAP.md` stage 45, "Auto-derive key from label in the studio" (NOT
STARTED, no OpenSpec change opened), proposes live-typing key derivation
for `Step.key`/`Path.key`/`FieldDef.key`/`ProcessBody.key`. There, a manual
edit stops auto-derivation. This change's task 2.2 builds a narrower,
one-time, creation-time slug-derivation helper for `Path.key` alone. The
mechanism differs and the timing differs, so the two do not conflict. Stage
45, when picked up, should treat `Path.key` derivation as already partially
built, not as a second mechanism to add.
