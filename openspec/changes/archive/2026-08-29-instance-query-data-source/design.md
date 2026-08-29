## Context

See proposal.md for motivation. A decision on 2026-08-25 settled the design.
The entry in `docs/decisions.md` records it under "Aggregated data source: a
field's options read from other instances". This document records how that
design lands on the code as it stands today. It also records the three points
where the code turned out not to fit it.

Four facts of the current code shape the work.

`DataSourceContext` (`src/engine/registry.ts:293`) carries `config`, `db` and
`heldValues`. No handler can see whose form is resolving.

`queryInstances` (`src/runtime/api.ts:1513`) takes
`(filter: InstanceQueryFilter, page: { limit? }, db)` and returns
`{ items: InstanceDataItem[], truncated: boolean }`. Each item carries
`instanceId`, `version`, `data` and an optional `redactedAt`. Its own
docstring already names this change as its intended first consumer.

`InstanceQueryFilter` (`src/runtime/api.ts:256`) carries `currentStepId?:
StepId`, a single id. `status` beside it is already an array.

`publishBody` (`src/engine/definitions.ts:276`) returns
`Promise<ProcessVersion>`. Publish validation throws or it succeeds. It has no
channel for a finding that blocks nothing.

## Goals / Non-Goals

**Goals:**

- Land `instance.query` as a leaf handler that composes nothing and issues no
  SQL of its own.
- Keep every existing data source type's behavior byte-identical.
- Keep runtime resolution actor-free. A timer, an outbox delivery, an
  automatic transition, a migration and an open form then resolve one list.

**Non-Goals:**

- The transition action. See proposal.md's Out of scope. The option list will
  not shrink on its own until it exists, and this change ships without it.
- Any change to how `columnMapping` writes an option's attributes into the
  reading instance's catalog. That path shipped in stage 29 and needs nothing.
- Any widening of the CEL context.

## Decisions

### The handler calls `queryInstances` rather than reading `instances`

`instance.query`'s `resolve` builds an `InstanceQueryFilter` and calls
`queryInstances` with the context's own `db` handle. It writes no SQL.

The read already carries every filter axis the design names. It already bounds
its result, reports truncation, and rejects a non-scalar compared field at the
row level. Reimplementing any of that would produce a second predicate builder
that drifts from `buildInstanceWhere`.

The one axis the read does not carry is a comparison right side naming a field
of the reading instance. That substitution happens in the handler, before the
call, which is why the handler needs the reading instance at all.

*Alternative rejected:* a dedicated SQL read for the option-list path. The
argument for it: project only the label and attribute fields rather than the
whole `data` payload. The projection saves little, since `data` is one jsonb
column that Postgres reads whole regardless. It also costs a second predicate
builder.

<!-- Heading text stays as written; rewording it would break the section's cross-references. -->
<!-- antislop: allow passive-voice -->
### `DataSourceContext.instance` is required, not optional

The context gains `instance: { id, processId, data, baseLocale }`.

Required rather than optional, for the same reason the context requires `db`.
A handler
needing the reader has no sane fallback without it, and every resolution runs
for exactly one instance. An optional member would push a null check into a
handler that cannot proceed past it.

`processId` sits beside `id` so the handler can decide the self-exclusion rule
without a definition-store lookup. Comparing the config's `processId` against
the reader's own is the whole test.

`baseLocale` sits beside them for the same reason. The function
`resolveFields` already holds the whole `body: ProcessBody` in scope, at its
one call site. So `body.baseLocale` costs nothing to thread through. This
type, `instance.query`, is the first one that needs it. See "A resolved
label is a single-locale `LocalizedText`" below.

*Alternative rejected:* passing the whole `Instance`. It carries assignment
state, timers and history-adjacent fields no data source has any business
reading. It would also make the context a much wider seam than the four keys
the design needs.

**The sibling context carries a different set of keys, deliberately.**
`AssignmentContext.instance` (`src/engine/registry.ts`) is
`{ id, startedBy, data }`. This one is `{ id, processId, data, baseLocale }`.
The two overlap in `id` and `data` and diverge in the rest.

Each carries what its own dimension needs. An assignment strategy resolves
`org.manager-of-starter`, which reads `startedBy`. A data source decides
self-exclusion, which reads `processId`, and labels a resolved option, which
reads `baseLocale`. Neither needs the other's members.

A shared type carrying the union would hand each dimension a key it has no use
for. It would widen two seams to spare one paragraph. Do not unify them until
a third consumer wants the same set.

`docs/decisions.md` describes the sibling as `{ id, data }`, which is one
member short of what the code carries. Task 7.4 corrects that line.

<!-- Heading text stays as written; rewording it would break the section's cross-references. -->
<!-- antislop: allow passive-voice -->
### A resolved label is a single-locale `LocalizedText`

`FieldOption.label` is `LocalizedText` (`Record<LocaleCode, string>`), never a
plain string. `instance.data[labelFieldId]` and the id fallback are both plain
values: a `Literal` and an `InstanceId`. The handler SHALL wrap whichever one
it resolves to as `{ [ctx.instance.baseLocale]: String(value) }`. That is a
one-entry object, keyed by the reading process's own base locale.

That is the whole fix. Its own spec settles where `form-ui` stops: it "SHALL
NOT accept a separate base-locale prop." A consumer wanting a fallback locale
resolves it before calling `form-ui`. That component itself "takes locale as
a prop and holds no locale state." This handler is that consumer, so
resolving happens here, not by widening `FieldForm`.

*Consequence, accepted and named in Risks below:* a locale mismatch degrades
the label. A viewer whose active locale differs from the reading process's
`baseLocale` sees `FieldForm`'s existing id-fallback instead of the resolved
label. This happens on every `instance.query`-sourced option, not only an
occasionally-untranslated one.

This matches the degradation any partially-translated static or `db.list`
label already exhibits for a locale it carries no entry for. It just cannot
carry more than one entry, because the source value was never translated to
begin with. A serial number is not a word.

*Alternative rejected:* threading the viewer's actual locale into
`resolveFields`/`DataSourceContext` so the handler could pick the right key
per viewer. This directly contradicts this design's own Goal of actor-free
resolution. A timer, an outbox delivery and a migration have no viewer to
localize for. It would not even help open-form rendering either, since
`getInstanceView` resolves once per call, not once per possible locale.

*Alternative rejected:* widening `form-ui`'s `FieldForm`/`FieldInput` with a
`baseLocale` prop so `resolveText` gets a real fallback. Its own spec states
it by name: "a consumer that wants a fallback locale resolves it before it
calls form-ui." That is the whole contract. Widening it here would let every
other consumer assume form-ui does locale fallback, which it deliberately
does not. The `packages/form-ui` package stays untouched by this change.

### `instance.data` is the instance's committed data

`resolveFields` (`src/runtime/api.ts:545`) already takes the whole `Instance`.
That makes `id`, `processId` and `data` free. Threading them into
`resolveDataSourceOptions` (`api.ts:518`) is the only change, and that function
has one caller.

The handler resolves against the committed data, not against a submission's
merged payload.

The renderer resolved the option list against committed data when it drew the
form. The participant has submitted nothing yet at that point. Checking
membership at submit against a merged payload would therefore check the wrong
list. The right one is what the participant chose from. Committed data on both
sides keeps the two lists identical, which is the property that matters.

The code agrees. `validateSubmissionData` calls `resolveFields` at
`api.ts:812`, and builds `mergedData` at `api.ts:820`, eight lines later.
Resolving against the merged payload means hoisting that merge above the
resolve call and passing it in.

*Alternative rejected:* that hoist. It changes what `resolveFields` sees for
every caller, not only this one. The engine derives `heldValues` there too.
Deriving it from merged data would put the value the participant just
submitted into the held set. A held value resolves whatever the filters say,
so membership validation would accept any submitted value. That is a
correctness hole, and it is a large blast radius for a convenience.

*Consequence, an authoring constraint for the guide:* a `valueFromField`
comparison reads the value the field held at step entry.
An author who wants the picker to react to a field must put that
field on an earlier step. A same-step dependency reads the pre-submit value,
silently. The contract already reasons this way about dominance for a
`required` and `readonly` view entry, so the shape is familiar.

*Not built here:* a publish check enforcing that dominance. It would reuse the
`checkUnsatisfiableRequiredReadonly` machinery, and no case demands it yet.
Document the constraint, and add the check when an author trips over it.

### `InstanceQueryFilter.currentStepId` widens to accept a set

The settled design names "a set of step ids". The filter carries one.

`currentStepId` becomes `StepId | StepId[]`, and `buildInstanceWhere` compiles
an array to `= ANY(...)`. This is symmetric with `status`, which is already an
array on the same filter.

`listInstances` shares `buildInstanceWhere` and keeps its own single-id member.
It gains the capability for free and passes an array at no site. So this
touches one predicate branch, not two read paths.

<!-- "parameter type" names buildInstanceWhere's own TS argument type, a different concept from a FieldOption; not a synonym for "option". -->
<!-- antislop: allow synonym-rotation -->
`InstanceWhereFilter` (`src/runtime/api.ts:1295`), `buildInstanceWhere`'s own
parameter type, is `Omit<InstanceListFilter, "includeDegraded" | "dataWhere">`
today, derived from `InstanceListFilter`, not from `InstanceQueryFilter`.
Widening `InstanceQueryFilter.currentStepId` alone, with `InstanceWhereFilter`
left as that plain `Omit`, does not type-check. The function `queryInstances`
passes its own `filter: InstanceQueryFilter` straight into
`buildInstanceWhere`. There, `StepId | StepId[]` is not assignable to the
`StepId`-only `currentStepId` `InstanceWhereFilter` would still declare. The
type that needs to widen is `InstanceWhereFilter` itself:
```
type InstanceWhereFilter = Omit<InstanceListFilter, "includeDegraded" | "dataWhere" | "currentStepId"> & {
  currentStepId?: StepId | StepId[];
  instanceIds?: InstanceId[];
};
```
`InstanceListFilter.currentStepId` itself stays untouched, and `listInstances`
does keep its single-id member. That new field, `instanceIds`, lands only on
`InstanceWhereFilter`/`InstanceQueryFilter`, never on `InstanceListFilter`,
since no list-read caller needs it.

*Alternatives rejected:* one read per step id, merged in the handler. That
costs N round trips and makes the bound and the truncation flag meaningless
per call. And narrowing the config to a single step. That contradicts the
settled design and fails the obvious "available or reserved" case.

*Consequence:* this needs a delta against `instance-data-query`, a capability
archived on 2026-08-27. The change is additive and no published body or stored
instance depends on the narrower type.

### An empty `stepIds` omits the filter rather than passing an empty array

The config's `stepIds` is optional, and "absent or empty" means "apply no
step filter" (the settled design's own words). `instance-data-query`'s
`currentStepId` filter takes the opposite reading of an empty list: a caller
error. This is the same rule `instanceIds` and a membership comparison's
right side already carry. An empty list matches nothing, and answering the
whole read with an empty result is never what "no filter" means.

The handler SHALL therefore omit `currentStepId` from the `InstanceQueryFilter`
it builds, passing `undefined`, never `[]`, whenever `config.stepIds` is
absent or empty. This is a translation at the config-to-filter boundary, not
a change to either rule. The config layer's "empty means unrestricted" and
the read layer's "empty means reject" both hold. The handler never lets an
empty array reach the read.

Task 3.7 already takes the equivalent care for `instanceIds`, skipping the
held-reference read entirely when `heldValues` is empty rather than passing
an empty `instanceIds`. This decision names the same care for `stepIds`.

### Held references resolve through a second read by id

`resolve` issues two reads. The first applies the configured filters. The
second names the ids in `ctx.heldValues`, with no step, status or comparison
filter.

That second read needs a filter the shared read does not have. The
`InstanceQueryFilter` type carries `excludeInstanceId`, which removes one
instance, and nothing that selects an explicit set. So this change adds
`instanceIds?: InstanceId[]` beside it, and `instance-data-query` carries the
delta.

Reading the instance table directly for the held half was the alternative, and
it contradicts this design's own first decision. A handler that runs no SQL
for the filtered half cannot run SQL for the held half.

A device issued to a participant leaves the shelf step. The step filter stops
selecting it. The instance already holding that reference must still resolve
it. Otherwise submission validation rejects a value nobody changed. This is
the treatment `db.list` already gives a retired value.

The handler skips the second read when `heldValues` is empty, which is every
fresh form render. So the common path stays one read.

Held ids do not count against the bound. The `db-data-source-type` change
settled that question for the same reason. The reasoning carries over
unchanged. A holder must keep resolving even when the offered list sits
exactly on the bound.

<!-- Heading text stays as written; rewording it would break the section's cross-references. -->
<!-- antislop: allow passive-voice -->
### A redacted source instance is dropped from the offered list and kept for a holder

Redaction clears a source instance's field values, so its label field is gone.
The filtered read drops an item carrying `redactedAt`. Offering a reference
whose data no longer exists would put an unlabeled row in a picker.

A held redacted instance still resolves, with the instance id as its label, by
the general label fallback. The holder's submission then still validates and
the reference stays visible as an id rather than vanishing.

*Alternative rejected:* dropping a redacted instance unconditionally, held or
not. It would silently invalidate a stored reference and fail a submission the
participant never touched.

### The handler raises on truncation rather than returning a short list

`queryInstances` reports `truncated`. The handler throws a plain `Error`
naming the `processId` when it sees that flag, or when the match count exceeds
`MAX_INSTANCE_QUERY_OPTIONS`.

A truncated option list renders as a complete picker. The missing rows look
like instances that do not exist, and an author has no signal at all. An error
is loud and points at the config that needs a narrower filter.

`db.list` already raises rather than truncating, and this matches it.

### Publish reports a stale reference and returns it to the caller

`publishBody` returns its published version with a findings list beside it.
This section settles the exact shape further down. Confirmed with the owner
on 2026-08-29, over a studio-only checks-rail group and over doing both.

The engine stays the authority. A publish over the HTTP API, or of a
hand-authored body, reports the same finding the studio would render. A
studio-only check would report nothing on those paths.

A finding names the data source, the reference, and the versions carrying it.
It also names the count of live instances on versions that do not.

The reference check reports because the population it reads keeps moving. The
engine's `createProcessInstance` accepts an explicit version, and migration
moves instances between versions. A rejection would therefore rest on a fact
that expires between the check and the next hour.

The return type is `PublishResult = ProcessVersion & { findings:
PublishFinding[] }`, an intersection rather than a wrapper. A wrapper
(`{ version, findings }`) reads slightly cleaner. It would rewrite roughly
twenty-five test files plus three call sites, every one of them mechanically.
The intersection adds a key to an object callers already hold, so a caller
ignoring findings compiles unchanged.

*Consequence:* the publish route's response body gains a key, and the studio
renders findings after a publish. No existing caller changes.

*Alternative rejected:* checking the target's latest version alone, the way
`validateProcessChaining` does for `process.start`. That is right there,
because the action creates an instance at the latest version. It is wrong
here, because this source reads instances across many versions at once.

### The publish entry point takes the actor as an optional argument

The read-grant check needs the acting actor. Today `publishBody`
(`src/engine/definitions.ts:276`) takes none, and that is not an oversight.
The comment in `src/http/routes.ts` states the placement: an actor lacking the
permission never reaches `publishBody`. So no registry or CEL check runs, and
the engine consumes no version. Every authorization gate sits at the route.

The route cannot run this one. It gates on the process the author is
publishing. This check gates on a process only the body names. The route holds
the raw body, not the compiled one, and the data sources resolve after it
hands off.

So `publishBody` gains a trailing optional `actor?: Actor`. It runs the check
when a caller supplies that actor. It skips the check when a caller omits it.

Optional, not required, for the reason the return type is an intersection.
Roughly twenty-five test files call this function, and none of them has an
actor to give. Requiring it rewrites every one of them.

*The cost, stated plainly:* a caller omitting the actor skips an
authorization gate. That is a real hole, and it is the reason both HTTP
publish routes must pass the actor. A task covers each.

*Alternative rejected:* walking `body.dataSources` at the route to find the
target processes, then gating there. It puts knowledge of one plugin type's
config shape into the HTTP layer. It also reads the authored body rather than
the compiled one.

*Alternative rejected:* requiring the actor. It is the honest signature. It
costs a mechanical change to twenty-five test files, for a gate those tests do
not exercise. Revisit if a second publish-time check ever needs an actor.

### A compared field's declared type rejects, while its existence reports

Two publish checks over the same reference, with two different verdicts.

Whether a version carries a field is a fact about a moving population, so it
reports. Whether a resolved field's declared type admits a JSON-level
comparison is a fact about the catalog. That fact is wrong in every version
declaring the field, so this check rejects.

`instance-data-query`'s spec hands this check here by name. Its own row-level
check reads values rather than declared types. That check passes while no
selected instance has written the field. That check is the backstop and this
one is the gate.

A reference the union does not carry produces the reference finding and no
type verdict. There is no declared type to judge.

### The config rules live in the handler's configSchema

The comparison right side is exclusive: an entry carries `value` or
`valueFromField`, never both and never neither. That is a new authoring rule,
so it needs a placement argument.

It goes in the handler's own `configSchema`, as a Zod refinement, beside the
other two data source config schemas in `src/engine/host.ts`. It goes in
neither `definition.ts` nor `src/schema/compile.ts`.

`authoring-invariants.md` asks that question of a definition-contract
invariant. This is not one. A data source is a `{ type, config }` envelope,
and the core validates the envelope while each plugin validates its own
config. The registry check already runs that schema at publish and reports a
violation with its location.

Putting it in `compile.ts` would teach the shared compile pass one plugin
type's config shape. That is the coupling the envelope exists to prevent.

<!-- Heading text stays as written; rewording it would break the section's cross-references. -->
<!-- antislop: allow passive-voice -->
### The column key is authored, not taken from the source field's key

`attributes` maps an authored column key onto a target field id.

A `key` is a mutable slug that references nothing. Deriving the column key
from the source field's `key` would break a `columnMapping` naming it. It
would break the moment an author renames that field in the target process,
with no error anywhere. The authored key is stable by construction.

`columnMapping` itself needs no change. The definition contract already binds
it to any data source, not to `db.list`. It already anticipates this
case in prose: a mapping "might copy in an attribute from another process's
instance".

<!-- Heading text stays as written; the spec's matching Requirement header must stay byte-identical for the archive step. -->
<!-- antislop: allow passive-voice -->
### A non-scalar attribute value is skipped, the same as an unfilled one

`FieldOption.attributes` is `Record<string, OptionAttribute>`. That type is
`string | number | boolean`, never an array or an object. A configured
`attributes` entry can name a target field whose current value is a
`multiselect`'s array or a `group`'s object. No publish check constrains an
`attributes` field's declared type the way the compared-field check
constrains `where`. That check covers `where` alone. See "A compared field's
declared type rejects, while its existence reports".

The handler SHALL treat a non-scalar attribute value the same as an unfilled
one: no entry for that column key. It raises no thrown error and coerces
nothing. This is the same choice the label rule already makes for a
non-scalar `labelFieldId` value, applied to the narrower `attributes` case.

*Alternative rejected:* a publish-time scalar-type check on every `attributes`
field, mirroring the `where`-side check. It is not wrong, only unnecessary.
That field is optional decoration on an option, so a silently-dropped entry
costs a picker nothing. A silently-wrong `where` comparison, by contrast,
would silently narrow or widen the whole option list. Add the check if an
author trips over the silent drop in practice.

### A `valueFromField` reference resolves to a scalar field of the reading process

`where`'s `valueFromField` names a field of the process the author is
publishing, not the target's. The type-level check above resolves against the
TARGET process's live-instance catalog, through the definition store. That is
a cross-process, DB-resolving check, which is why it lives in
`cross-process-validation`. This one needs no such lookup: it resolves
against the body's own field catalog, in-process. That is the same shape
`checkGroupReference` and `checkIdResolution` already check in `compile.ts`,
for a different reference kind each.

Publishing SHALL reject a `valueFromField` that resolves to no field of the
reading process. It also rejects one that resolves to a field whose declared
type holds a non-scalar value. Left unchecked, a `multiselect`- or
`group`-typed `valueFromField` substitutes an array or an object as the
read's comparison right side. Then `queryInstances`'s own `isDataScalar`
guard (`assertNoNonScalarComparedField`'s sibling, `validateDataComparisons`)
throws a plain `RequestShapeError` at runtime. That happens on every
`getInstanceView` or `submitAndTransition` call that reaches the step, not
once at publish where an author could fix it.

This check is `instance.query`-specific validation, the same category as the
`value`/`valueFromField` XOR check. It does not live in `compile.ts`, though,
and it is not colocated with the XOR check either. The XOR check is a bare
`configSchema` refinement in `src/engine/instance-query-source.ts`, since it
needs only the `config` object.

This check cannot be: `configSchema.parse()`
sees only `config`, not the surrounding `ProcessBody` its field ids resolve
against. So it runs as a second, body-aware pass. The function
`checkInstanceQueryValueFromField`, in `src/engine/definitions.ts`, implements
it, beside `publishBody`'s other in-process checks. That is the same placement as the
other in-process data-source checks, before the cross-process, DB-resolving
checks, per `publishBody`'s existing ordering. The reasoning for keeping it
out of `compile.ts` matches "The config rules live in the handler's
configSchema" above. Teaching the shared compile pass one plugin type's
config shape is the coupling the envelope exists to prevent.

### The studio gets a hand-written form

`config-descriptor.ts` generates a form over a flat property subset. A list of
comparison objects nests one level deeper, so the generator falls back to the
raw JSON textarea.

`instance.query` gets a purpose-built form instead of an extension to the
generator. The generator exists to keep one description of a plugin's config,
in its schema. Teaching it nested arrays for one consumer buys a second
description in exchange, and no other shipped type needs it.

The panel already works this way. The `DataSourcesPanel.tsx` module carves
`db.list`'s `listKey` out of the generated form and renders a dedicated
control for it. A free-text list key is worse to author against than a picker.
So this is the established pattern in the file the work lands in, not a
departure from it.

`config-descriptor.ts` is an engine module, and the studio reads its output
over `GET /registry`. Extending the generator would therefore be an engine
change in service of one browser form. That is the wrong shape as well as
the wrong size.

The raw JSON path stays reachable for this type, the way it does for a
schema-backed one.

*Revisit when* a second plugin type needs a nested config. Two consumers is
the point at which the generator extension is cheaper than two hand-written
forms.

## Risks / Trade-offs

**The option list never shrinks without the transition action.** → Accepted and
named in proposal.md's Out of scope. The reading half is useful on its own for
a process whose steps move by other means. The follow-up change is already
identified.

**Two participants pick the same source instance.** → Submission validation
re-resolves the option list under the reading instance's row lock. That
narrows the window without closing it, since nothing locks the source
instance. Once the transition action exists, the collision surfaces there
instead. It surfaces as a delivery arriving at an instance no longer on the
step its path departs from. That is a better error than a silent duplicate,
and still a post-commit one. Do not add a source-instance lock in this change.

**An actor granted read on the target sees every instance's values.**
→ Accepted on 2026-08-25 and restated in proposal.md. Per-instance visibility
is a larger cross-cutting decision. Adding it later only narrows a result set,
so it invalidates no published definition.

**Per-instance visibility is a one-way door.**
→ This design walks through it. The Goals above keep runtime resolution
actor-free, and the publish check is what buys that. The file
`docs/decisions.md` records the consequence in sharper terms than "narrows a
result set". The actor-free property rests on authorization settling at
publish, and it *ends* the day per-instance visibility lands.

Two things would then need answering, neither of which this design answers.
Submission validation has to choose between the viewer's list and the full
one. And the actor-free execution paths need an answer for whose view they
resolve. Those are a timer, an outbox delivery, an automatic transition and a
migration. Recorded here rather than solved: solving it now would design a
permission model against no requirement. A later change owns it, and it will
have to revisit this decision rather than extend it.

**Attaching findings to the version record blurs two things.** → The returned
object is the persisted version plus the publish report. A reader could
mistake `findings` for stored state. Nothing persists it, and the name
`PublishResult` says which half is which. Accepted in exchange for
leaving twenty-five test files and three call sites untouched.

**A hot resolution path now issues a database read.** → The `resolve` call
runs on every form render and submission. It also runs on every timer fire and
every automatic transition. The read `queryInstances` filters on `processId`,
`status` and `currentStepId`. The `instances_selection_idx` and
`instances_current_step_idx` indexes cover those. The comparison predicates read
`body->'data'` with no index, which `docs/decisions.md` already records as an
open question for the report builder. Do not add an index in this change;
measure first.

**Publish now reads the target process's live instance population.** → One
extra query per `instance.query` data source, at publish only. Publish is not
a hot path.

**A resolved label degrades to the instance id outside the base locale.** →
Accepted, as discussed above. Every `instance.query`-sourced option renders
correctly for a viewer in the reading process's `baseLocale`. It falls back
to the raw instance id for any other active locale. That is the same
fallback the spec already defines for an unset or non-scalar `labelFieldId`
value, just guaranteed rather than occasional.

Fixing it fully would mean resolving per-viewer, which contradicts this
design's actor-free Goal. Or it would mean widening `form-ui` past a
boundary its own spec states on purpose. Neither is this change's to spend.

## Migration Plan

No data migration. No published body carries an `instance.query` data source,
because the type does not exist yet, so no stored definition changes meaning.

`DataSourceContext` gains a required member, which is a source-level break for
any out-of-tree handler. None exists.

Rollback is a revert. An instance whose body names `instance.query` would then
fail resolution with the registry canary error. That is the correct behavior
for a type the registry no longer holds.

## Open Questions

- Which `MAX_INSTANCE_QUERY_OPTIONS` value to pick. It bounds a picker's row
  count. It therefore answers to what a form can usefully render rather than
  to a database limit. The constant `MAX_DATA_LIST_VALUES` sits at 500 in
  `src/engine/host.ts`, and is the precedent to read first. This changes
  neither the specs, the approach nor the tasks.
- Whether the purpose-built form's field pickers read the union of live
  versions' catalogs from a new endpoint. The alternative is data the studio
  already fetches. The requirement states what the pickers offer; the fetch path is a
  studio-internal choice that changes no engine behavior.
