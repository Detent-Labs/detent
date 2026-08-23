## Context

See proposal.md, "Why", for the motivation.

Two facts shape the approach. The studio already owns a writer-set rule, in
`writtenFieldCounts` (`packages/web/src/areas/studio/draft/view-flags.ts`). The
engine cannot import it, because `packages/web` reaches the engine and never the
reverse.

`compile.ts` already carries seven structural write-path checks, run together
in `structuralIssues`. `checkTechnicalFields` is the closest sibling in shape.
It walks the steps, reads each `view.fields[]` entry, and returns a
`CompileIssue[]`.

## Goals / Non-Goals

**Goals:**

- Reject the unsatisfiable shape at publish, so no immutable version carries it.
- Keep the engine's reading of "written" equal to the studio's.
- Leave every legal shape publishing: the CEL case, the writer case, the hidden
  case, the defaulted case.

**Non-Goals:**

- No change to the studio. Its gating and its finding already exist, and
  `studio-form-editor` specifies them. The checks rail renders engine
  structural issues generically: `validation.ts` groups every compile-pass
  issue under the "structural" source. The new check therefore appears in
  the rail with zero studio changes. A Publish on the violating draft
  fails with a compile-validation 422 naming the step and field.
- The studio comment in `packages/web/src/areas/studio/draft/validation.ts`
  (line ~56) still reads "the seven structural checks" and stays stale by
  the no-studio-touch non-goal. A later studio change can refresh it. The
  checks-rail comment in `packages/web/src/areas/studio/draft/checksRail.ts`
  (line ~38, "the six structural checks") is already stale by one. It
  stays stale the same way.
- The same wording in the live capability spec
  `openspec/specs/studio-checks-rail/spec.md` (lines ~137 and ~186, "the six
  structural checks") is already stale by one too. It stays stale the same
  way. The `issues.ts` comment (line ~18, "the seven
  harden-publish-validation write-path checks") stays stale the same way.
  A companion studio change refreshes all three.
- No promotion of the studio's `checkViewFlags` finding into a publish blocker.
- No change to `definition.ts`, so no read-path behavior moves.

## Decisions

### Duplicate the writer-set rule, with two documented divergences

The engine gets its own writer-set helper in `compile.ts`. It does not import or
share the studio's.

The engine's copy diverges from the studio's in two ways, both deliberate:

**Post-gate exclusion.** `writtenFieldCounts` counts an action output in all
five positions. Three of them sit on the entry's own step: `onExit`,
`onPath`, `onCancel`. All three fire only after the submission gate.
`submitAndTransition` raises `required-missing` (`validateSubmissionData`)
before the commit, and the outbox dispatches actions after it. Counting such
an output would publish a shape that strands an instance exactly the way the
change exists to stop.

The same holds for a `columnMapping` target whose mapping field is editable
only on the entry's own step. The write-back (`applyColumnMapping`) runs
after the submission gate, so nothing writes the target before the
check. A mapping field editable on another step counts: a submission there
writes the target before this step's gate. That count shares the
editable-entry blind spot. A mapping field editable only on steps that carry
no manual path never receives a pick. So the write-back never fires before
this step's gate: the same accepted presence-not-reachability class.

The engine also excludes a target whose mapping field appears in no editable
view entry at all. The studio counts every target regardless of placement.
A creation seed of the mapping field's pick can still satisfy the excluded
case. Rejecting it is the same accepted presence-not-reachability
approximation. The engine's writer set therefore excludes it: a static
position test, no reachability analysis.

**Literal default.** `applyFieldDefaults` seeds a field's catalog `default`
into `instance.data` at instance creation. A literal default always lands.
A CEL default may raise and leave the field unwritten. Only a literal
counts, under the same Expression/object test the flags use. The studio
counts no default, which is why its warning fires on this satisfiable shape
today.

A default counts as literal iff it is not an object carrying `lang: "cel"`.
That mirrors `applyFieldDefaults`' `asExpression`, so an opaque object-shaped
literal default counts as a writer too.

The landing happens only at top-level direct creation. A subprocess spawn
seeds from the parent's `inputMapping` instead. A `process.start` chain
seeds from the caller's mapping (docs/authoring-guide.md, "Default value").

A default-counted pair in a subprocess or chain-target body can still
strand a spawned instance. The parent left the field open. That is the
same presence-not-reachability approximation. Risks names it too, for
`contract.inputFields`.

Two reasons back the duplication. The dependency direction forbids the
import outright. The two functions also read different types: the studio
walks a `Draft`, whose every key is optional. The engine walks a
`ProcessBody`.

Alternative considered: move the rule into the engine and export it through
the exports map, the way `./schema/strip-compiled` ships. Rejected. The
studio would then need casts at every call, because a draft is not a valid
body. A new export entry and a type-compatibility layer cost more than 25
duplicated lines.

### Read presence, not counts

The studio's version counts, and separates a finite count from an infinite
one. `gatedKeys` needs that separation. It asks whether some source other
than one named entry writes the field.

The engine asks a simpler question instead: does any source write this
field at all. A `Set<string>` per checked step answers that question. The
post-gate exclusion and the columnMapping limb (tasks 1.2 and 1.4) are
relative to the entry's own step. So the helper collects the written set
for the step under check. The other four sources are body-wide. The entry
under check declares `readonly: true`, so it never counts itself as a
writer.

### Place the check beside `checkTechnicalFields`

The new check joins `structuralIssues`. That runs once, before the
idempotent early return for a `publishedProcessBody`-valid body.
`compileProcessBody` calls it ahead of the branch split. So an
already-compiled body passes the check too.

The placement means a published body carrying the shape on a manual-path
step cannot re-publish unchanged. On an all-automatic or terminal step the
pair re-publishes. A test (tasks, 3.14) pins the placement, and 3.13 pins
the read path. No body carries it today. The four example definitions hold
44 `readonly` view entries, and none of them also declares `required`.

### Test the literal `true` alone

Both flags are `boolean | Expression`. An `Expression` is an object, and every
object is truthy. A truthiness test would reject the legal CEL case.
`checkTechnicalFields` carries the same warning, inside `checkTechnicalFields`
itself. The writer set's literal-default source applies the same test to
`FieldDef.default`.

### Skip a group field and a technical field

A group container carries no value, so no writer can supply one. The studio skips
a group entry for the same reason.

A technical field's view entry may declare neither flag, and
`checkTechnicalFields` already rejects one that does. Such an entry cannot reach
this rule, so the new check reports nothing for it. Two findings for one entry
would read as two defects.

A CEL `visible` reads as visible. Nobody can read an expression's value
without an instance, so an unwritten pair under a CEL-visible entry rejects.
The studio's `checkViewFlags` applies the same literal `visible === false`
test.

### Scope the check to manual-path steps

The rule applies only to entries on steps that carry a manual path. The
required check runs only inside `submitAndTransition`
(`validateSubmissionData`). Instance creation passes `checkRequired: false`.
Automatic transitions never validate required either.

On an all-automatic step or a terminal step a required+readonly pair never
strands: the requirement is never enforced there. Rejecting it there would
be a false positive on an inert shape. A step's paths are all-manual or
all-automatic, never mixed. So the scope is a static property, like every
other part of this check.

### Coordination note: `allow-schema-refinement-tightening`

That change archived on 2026-08-23 (commit e6fa427). It withdrew the read-path
veto as a justification for write-path placement, and it did not move this
check. The unbypassable-check criterion it introduced independently supports
the same placement beside `checkTechnicalFields` in `compile.ts`. A
hand-written body could satisfy `publishedProcessBody` while still carrying
the unsatisfiable pair.

That change did not touch the duplicated writer-set helper. It stays for the
package-boundary and type-mismatch reasons stated above, reasons independent
of that change.

Its two-criterion placement rule is already live in
`openspec/specs/definition-contract/spec.md`. Authoring reworded this
delta's placement paragraph to that framing. At archive it merges beside
the already-live requirement.

## Risks / Trade-offs

**The two copies drift, and no test can cross the package boundary.**
The dependency direction forbids the import. So the delta spec's
SHALL-match clause is documentary. The engine tests enforce the engine's
six sources.
The helper's comment naming `writtenFieldCounts`, plus the named
divergences, are the drift guard. A source added on one side and missed on
the other is a deliberate review item, not a red test.

**Presence, not reachability.**
A writer anywhere in the body satisfies the check. It need not be a writer
that can run before the requiring step. Examples follow. An
output on a step that cannot precede it, or a `contract.inputFields` entry
only a subprocess parent fills at spawn.

A literal default only a top-level creation applies is the same class,
since spawns seed from mappings instead. ROADMAP stage 44
(technical-field-marker) explicitly defers step-order/reachability-aware
validation. This check deliberately shares that approximation with the
studio's `writtenFieldCounts`.

A `process.start` action's `inputMapping` on another process also writes
fields at spawn, but the target body cannot name it. The mapping lives in
the caller's body. It resolves against the target's field catalog, never
through a contract the target declares. So a chain-seeded required+readonly
pair fails although satisfiable. The studio's `writtenFieldCounts` shares
this blind spot.

A migration plan's `transforms` targets also write `instance.data` before
a later gate, and the target body cannot name the plan either. The
studio's `writtenFieldCounts` shares this blind spot too. A creation seed
of the mapping field's pick can still satisfy the same-step-excluded case.
Rejecting it is the same accepted approximation.

An `onEntry` output on the initial step still counts as a writer. Creation
enqueues no onEntry actions there: only timer arming and a subprocess
spawn. A migration relocation onto the initial step can fire it, which the
target body cannot name. An editable view entry on a step that carries no
manual path likewise never receives participant data. That is the same
static property that scopes the check, and both sides count it as a writer.

An `onFire` output on the entry's own step's targetPath timer counts as a
writer, although it can never satisfy the gate. The timer's
forced exit runs no required check. So the park stays bounded, not
permanent, the same accepted class. A reminder timer (no `targetPath`)
fires its `onFire` actions while the instance parks on the step. The
participant resubmits after the write-back, so its output satisfies the
gate outright.

A mapping field editable only on steps carrying no manual path never
receives a pick. So its target is never written before the gate, the same
accepted class as the editable-entry blind spot.

**A stored body cannot re-publish.** This holds for a pair on a manual-path
step. An all-automatic or terminal step's pair re-publishes. Measured
against the four example definitions: none violates the rule. A body a
customer holds cannot exist, because nothing runs in production.

**A hand-authored body loses a shape it could express.**

The shape strands an instance, which is the reason for the change. An
author who wants the display without the guard drops `required`. The
defaulted pair keeps
publishing: a literal `default` is a writer source. The rule rejects the
post-gate-writer pair on purpose, since it reproduces the stranded shape
the change exists to stop.

## Migration Plan

No data migration. No stored body changes, and `definitionHash` stays
reproducible for every existing version. Rollback removes the check function and
its call sites.

## Open Questions

Whether the studio's `checkViewFlags` finding should block a publish,
rather than warn. This change makes the engine reject the shape regardless.
The finding's severity then decides only where the author reads the
message first. A companion studio change can settle it. The answer changes
neither these specs nor this approach.

Whether the studio's `checkViewFlags` and `writtenFieldCounts` should adopt
the engine's two refinements: the post-gate exclusion, and the
literal-default source. Until they do, the studio warns on a defaulted pair
the engine publishes. It stays silent on a post-gate-only pair the engine
rejects. It also warns on a required+readonly pair on a step carrying no
manual path, which the engine publishes. The manual-path scope is a third
alignment item for the companion studio change to fix.

The studio's `checkUnwrittenTechnicalFields` comment (`view-flags.ts` ~273)
asserts the engine never applies `FieldDef.default`. That is stale:
`applyFieldDefaults` seeds a literal default at creation. The companion
studio change should correct that comment too.
