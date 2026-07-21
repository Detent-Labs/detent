## Context

`src/schema/definition.ts`'s process-level `superRefine` builds `fieldIds` (a
`Set` over `collectFieldsDeep(b.fields)`, so nested `group` fields count) and
uses it for several resolution checks: `view.fields[].ref`, and — the one this
change extends — `Action.output` target keys. The existing output-target check
(just below `allActionIds`) is:

```ts
[...(s.onEntry ?? []), ...(s.onExit ?? []), ...(s.onCancel ?? [])].forEach((a) => {
  Object.keys(a.output ?? {}).forEach((fid) => {
    if (!fieldIds.has(fid as FieldId)) add(`action output targets unknown field: ${fid}`, ["workflow", "steps", i]);
  });
});
```

Three lines above it, `allActionIds` (feeding the *duplicate action id* check)
walks all five action positions:

```ts
allActionIds.push(...(s.onEntry ?? []).map((a) => a.id));
allActionIds.push(...(s.onExit ?? []).map((a) => a.id));
allActionIds.push(...(s.onCancel ?? []).map((a) => a.id));
(s.paths ?? []).forEach((p) => allActionIds.push(...(p.onPath ?? []).map((a) => a.id)));
(s.timers ?? []).forEach((t) => allActionIds.push(...(t.onFire.actions ?? []).map((a) => a.id)));
```

Confirmed empirically (probe script against `processBody.safeParse`): a body
with an `onPath` action or a timer `onFire` action whose `output` targets a
nonexistent field id currently parses successfully. No test anywhere exercises
this invariant, in any of the five positions.

## Goals / Non-Goals

**Goals:**
- Every `Action.output` target field id, from all five action positions,
  resolves against `fieldIds` (the same recursive set `view.fields[].ref`
  already resolves against).
- Match the existing check's placement, granularity, and error message shape
  exactly — this closes a coverage gap in one invariant, it does not introduce
  a new validation mechanism.

**Non-Goals:**
- Changing *where* this invariant lives (Zod `superRefine` in `definition.ts`
  vs. a write-path check like `compile.ts`/`check.ts`). See Decisions below —
  this stays where the three already-covered positions already put it.
- Locating the error more precisely than the existing check does (e.g. naming
  which path or timer). The existing three positions locate only to
  `["workflow", "steps", i]`; the two new positions match that granularity
  rather than gold-plating only the new cases.
- Any change to the CEL-level Action.output checks in `src/cel/check.ts`
  (`collect()`'s `outputs()` helper already walks all five positions for CEL
  parse/type-checking — that part was never asymmetric; only the field-*id*-
  resolution check in `definition.ts` was).

## Decisions

**Extend the existing Zod refinement in place; do not move the invariant to
the write path.** CLAUDE.md documents a real rule: "validation that may
tighten over time belongs on the write path... a tightened refinement would
make an already-published definition throw on READ and its pinned instances
unrehydratable" — this is why duration bounds and CEL type-checking live in
`compile.ts`/`check.ts`, not `definition.ts`. That rule applies to checks whose
*strictness itself* is expected to evolve (a CEL library upgrade, a duration
bound revision) independent of any single body. It does not describe this
invariant: "an output target must name a real field" is a day-one structural
rule already enforced as a Zod refinement for three of five positions, exactly
like id uniqueness and `view.fields[].ref` resolution — none of which live on
the write path either. Extending its coverage to the other two positions is
fixing an enforcement bug in an existing day-one rule, not introducing a new
kind of tightenable validation. Moving the *whole* invariant (all five
positions) to the write path would be a larger, separate, and inconsistent
change — the three already-Zod-refinement positions have never been flagged as
misplaced.

**Reuse `allActionIds`'s iteration shape, not a shared helper.** The two
collectors (`allActionIds` for id-uniqueness, this one for output-target
resolution) walk the same five positions but do different things with each
action (`.id` vs. `Object.keys(a.output ?? {})`). Introducing an abstraction to
unify "walk every action in the body" for two call sites, each doing something
different with the result, is more machinery than the four extra lines it
would save. (ponytail: revisit only if a third walker of all five positions
appears.)

## Risks / Trade-offs

- [An already-stored body in this project's dev/test Postgres that happens to
  have an `onPath` or timer `onFire` action targeting a bogus field id would
  fail to re-parse on its next read after this ships, since `definition.ts` is
  also the deserializer for stored bodies] → Accepted: this is pre-production
  tooling (devcontainer-only Postgres, test fixtures), the bug this closes
  means such a body could only exist by accident (an authoring typo), and the
  three already-enforced positions carry the identical risk today for
  `onEntry`/`onExit`/`onCancel` — this change does not introduce a new class of
  risk, it extends an accepted one to two more positions. Not a concern for a
  system with real published data; flagged here so the tradeoff is a decision,
  not an oversight, matching how the project already documents the duration
  and CEL placement rule.
- [Someone copies this change's placement (Zod refinement) as a template for a
  genuinely evolving check] → Mitigated by the Decisions section spelling out
  *why* this one is different from duration/CEL: the rule itself is not
  expected to get stricter over time, only its enforcement coverage was
  incomplete.

## Migration Plan

Pure schema-validation change; no runtime/engine code touched, no data
migration. Rollback is reverting the two added forEach blocks.
