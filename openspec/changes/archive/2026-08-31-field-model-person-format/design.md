## Context

See `proposal.md` for motivation. See `docs/field-model-redesign.md` for the
brainstorming record whose decisions D10-D15, D20, D22 and D23 this change
implements. This document records the technical choices that record left to
implementation. It also states where investigation during this proposal
changed what looked at first like the shape of the work.

Change 1 sits archived at
`openspec/changes/archive/2026-08-30-field-model-type-format-control/`. It
built three things this change extends rather than reopens. First,
`ALLOWED_BY_TYPE`, one exhaustive table of legal `format`/`control` members
per `type` (`src/schema/definition.ts:421-427`). Second, the
`formatMatches`/`typeMatches`/`expectedTypeLabel` trio (`:454-496`), the one
value-validation path submission and outbox writeback share. Third,
`checkFieldFormatControl` (`src/schema/compile.ts:591`), the publish-time
check reading that table.

This change's own scan of the current code turned up two places where the
Change-1 shape does not extend cleanly. It also turned up one place where the
work this proposal's brief expected already exists.

## Goals / Non-Goals

**Goals:**

- A person field an author declares once, storing one bare id per D11. Both a
  participant-facing picker and an assignment strategy reuse it.
- An assignment strategy that reads that field with no `AssignmentContext`
  change.
- A people list that fails closed with no group declared, per D15's
  boundary on `/admin/users`.

**Non-Goals (D20, S1-S5, D8):**

- `richtext`, `image` and `signature`. Each waits for its own change.
- A per-step `control` override.
- A people directory wider than the body's own `allowedGroups`. The
  `/admin/users` route stays behind `ADMIN_ROLE` (D15). No branch this change
  adds reads every account in the system.

**Explicitly in scope, and stated here because an earlier draft denied it.**

A bare person field IS closed-list bound to its resolved candidates. Decision 5
makes `resolveFields` populate `options` for one. And `optionValuesValid`
(`src/runtime/api.ts:914`) already validates every submitted value against
whatever `resolveFields` produced, unconditionally. So a submitted id outside
the `allowedGroups` expansion draws `invalid-option`. That bound is the point.
It stops a participant routing a step to an account the process never offered.

<!-- antislop: allow passive-voice -->
<!-- The flagged phrase sits inside a verbatim quotation of a base-spec requirement title. -->
One `data-source-resolution` requirement already covers this branch:
"Submission validation enforces membership against resolved options". It reads
this change's branch the same way it reads the `dataSource`-bound one. This
change's delta carries that requirement as MODIFIED to say so.

<!-- antislop: allow synonym-rotation -->
<!-- "option" is the schema key `FieldOption`/`options`; "parameter" is the TypeScript function parameter, and both are load-bearing terms in this document. -->
Two consequences follow, both handled in Decision 5 rather than left implicit.
A `group_`-prefixed value needs its own resolved option, or nobody could ever
submit it. And a held value whose account has left the group must stay
submittable.

## Decisions

### Decision 1: `person` joins `fieldFormat`, on the `string` and `list` rows alone

In `ALLOWED_BY_TYPE`, the `string` row's `formats` gains `person` beside
`date`, `datetime` and `email`. The `list` row's `formats` gains `person` as
its first-ever non-empty entry. D10's single/multi split is exactly the
`string`/`list` split Change 1 already built the table around. No other row
changes: `person` names an id kind, not a `number` or `boolean` concept.

The `celType` function (`src/cel/check.ts:55`) needs no `person` case. D24
ties `format` to the CEL type, so a reader expects one. But the only format
`celType` reads is `integer`, and it reads it to pick between `int` and
`double` inside the `number` arm. A person id is a string. So a `{type:
"string", format: "person"}` field is `string`, and a `{type: "list", format:
"person"}` field is `list<string>`. Both are already correct from the `type`
arm alone.

### Decision 2: `formatMatches` forks on the field's own type, not on the value's shape

Today `typeMatches` (`:478-488`) calls `formatMatches(format: FieldFormat,
value: Literal)` with the *raw* value. That means a scalar for a `string`
field, and the whole array for a `list` field. Every format `person` joins
today applies to `string` alone, so `formatMatches` only ever received a
scalar. The fork never had to exist.

The `person` format is the first one `ALLOWED_BY_TYPE` admits on `list`. So a
`list`-typed person field is the first case where `formatMatches` receives an
array. It therefore needs the field's `type` alongside its `format`, not the
format alone. Only then can it tell one candidate id from an array of them:

```ts
export function formatMatches(field: Pick<FieldDef, "type"> & { format: FieldFormat }, value: Literal): boolean {
  switch (field.format) {
    // ...existing cases unchanged, called with `field.format` where they
    // read it today...
    case "person": {
      const isPrincipalId = (v: unknown) => typeof v === "string" && (v.startsWith("user_") || v.startsWith("group_"));
      return field.type === "list" ? Array.isArray(value) && value.every(isPrincipalId) : isPrincipalId(value);
    }
  }
}
```

The parameter is `Pick<FieldDef, "type"> & { format: FieldFormat }`, not
`Pick<FieldDef, "type" | "format">`. The reason is that `FieldDef.format` is
optional. The second shape leaves `undefined` uncovered by the `switch`, so
the declared `: boolean` return fails TS2366 under `strict`.

Both call sites already stand inside a present-format guard. Neither narrowing
propagates from `field.format` to `field` itself, so each passes an explicit
pair. In `typeMatches` that reads `formatMatches({ type: field.type, format:
field.format }, value)`. At `compile.ts:601` it is the same two keys off `f`.

This widens `formatMatches`'s own signature from `(format, value)` to
`(field, value)`. That is one parameter object rather than two positional
ones, and both callers already hold the field. The `typeMatches` signature
(`field: Pick<FieldDef, "type" | "format">, value: Literal`) stays unchanged.
It already takes the whole field, for exactly the reason D19 states in Change
1's own design.md.

**The test rewrite the widened parameter forces, and the helper it cannot
use.**

The suite `test/field-format-control.test.ts` calls `formatMatches`
positionally 16 times (`:92-155`), each passing a bare format string. The
file's existing `fld` helper (`:32`) does not fix them. It carries the type
`(over: any) => FieldDef`, and `FieldDef.format` is optional.

So `fld({type: "string", format: "date"})` has type `FieldFormat | undefined`
where the widened parameter needs `FieldFormat`. Passing it draws TS2345. The
`fld` helper stays as it is for the body-shaped tests that need a whole
`FieldDef`.

The rewrite adds one line beside it, returning the pair the parameter names:

```ts
/** The pair `formatMatches` takes: `format` required, unlike `FieldDef`'s. */
const ff = (type: BaseFieldType, format: FieldFormat) => ({ type, format });
```

Each assertion then reads `formatMatches(ff("string", "date"),
"2026-02-28")`, with `"number"` for the `integer` block. The file imports the
Zod schemas `baseFieldType` and `fieldFormat` today, not the TypeScript types.
So its `import` from `../src/schema/definition.js` gains `type BaseFieldType`
and `type FieldFormat`, beside the existing `type FieldDef`. The return type
is `{ type: BaseFieldType; format: FieldFormat }`. It is assignable to
`Pick<FieldDef, "type"> & { format: FieldFormat }`, since `FieldDef.type` is
`BaseFieldType` or a plugin envelope, and a `BaseFieldType` widens into it.

An inline object literal at each of the 16 sites typechecks equally. The
reading is the only reason to reject it: 16 repetitions of the same two keys
bury what each assertion varies.

**Alternative considered:** give `person` its own array-handling branch
inside `typeMatches`, ahead of the `formatMatches` call. That would leave
`formatMatches`'s two-argument signature untouched. Rejected: it splits one
format's value rule across two functions. The next format admitted on `list`
would face the same fork. Widening `formatMatches`'s parameter is the
one-time fix. A per-format special case in the caller is not.

The prefix check is deliberately shallow: `user_` or `group_`, nothing about
UUID shape. The two minting sites are `src/auth/users.ts:66` and
`src/auth/groups.ts:51`. Neither module exposes a stricter shape check
publicly. A stored id carrying the right prefix may still resolve to no live
account. That is the resolver's business, not the schema's. D13's
`org.actor-from-field` owns it, as `org.group-members` already does for its
equivalent shipped case.

### Decision 3: `org.actor-from-field` lives in `assignment-strategies.ts`, beside the other two org-aware strategies

The `group_`-prefixed branch of `org.actor-from-field` calls `getGroupMembers`
(`src/auth/groups.ts`). That same database-reaching import put
`org.group-members` in `assignment-strategies.ts` rather than in leaf
`registry.ts`, during Change 1's predecessor work (module doc comment,
`assignment-strategies.ts:1-17`). The new strategy inherits that constraint
directly, so it becomes a third entry in the same file:

```ts
export const ACTOR_FROM_FIELD_STRATEGY_TYPE = "org.actor-from-field";

export const actorFromFieldConfigSchema = z.object({ fieldId: z.string() }).strict();

export const actorFromFieldStrategyDef: AssignmentStrategyDef = {
  configSchema: actorFromFieldConfigSchema,
  resolve: async (ctx) => {
    const { fieldId } = ctx.config as { fieldId: string };
    const value = ctx.instance.data[fieldId];
    if (typeof value !== "string") return [];
    if (value.startsWith("group_")) return getGroupMembers(value, ctx.db);
    if (value.startsWith("user_")) return [value];
    return [];
  },
};
```

Resolution is total, per the `assignment-strategy-registry` capability. Three
inputs resolve to `[]`: an unwritten field, a non-string value, and a string
carrying neither prefix. The function `resolveStepAssignment` already
classifies that as `no-candidates` and records it as `assignment.unresolved`.
No new reason code follows. The existing `no-candidates` reason fits every one
of these causes, and D13 asks for none of its own.

One line joins `createDefaultAssignmentRegistry`
(`assignment-strategies.ts:91-96`): `reg.set(ACTOR_FROM_FIELD_STRATEGY_TYPE,
actorFromFieldStrategyDef)`.

**Disabled-account filtering, checked against precedent:** the `group_`
branch inherits `getGroupMembers`'s existing exclusion of a disabled account.
That matches `org.group-members`. The `user_` passthrough branch filters
nothing, matching `static`'s own literal-candidate resolver
(`registry.ts:180-183`), which also skips `isActiveUser`. A disabled account
cannot authenticate to claim a step, whichever strategy named it as a
candidate. So this change extends existing behavior consistently, rather than
opening a gap.

### Decision 4: the publish-time check is `checkActorFromFieldReference`, a direct sibling of `checkGroupReference`

Modeled line-for-line on `checkGroupReference` (`compile.ts:472-491`):

```ts
function checkActorFromFieldReference(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  const fieldsById = new Map(collectFieldsDeep((body.fields ?? []) as any).map((f: any) => [String(f.id), f]));

  body.workflow.steps.forEach((s, si) => {
    const strategy = s.assignment?.strategy;
    if (strategy?.type !== "org.actor-from-field") return;
    const fieldId = (strategy.config as { fieldId?: unknown })?.fieldId;
    if (typeof fieldId !== "string") return; // left to the registry config-schema check
    const field = fieldsById.get(fieldId);
    if (!field || field.format !== "person") {
      issues.push({
        loc: `workflow.steps[${si}].assignment.strategy.config.fieldId`,
        value: String(fieldId),
        message: `step '${s.key}' references field '${fieldId}' via org.actor-from-field, but it does not declare format: "person"`,
      });
    }
  });

  return issues;
}
```

The call sits at the same site as `checkGroupReference` (`compile.ts:1104`),
so it runs at the same write-path placement. The placement rule in
`.claude/rules/authoring-invariants.md` applies for the same reason it does to
`checkGroupReference`. A hand-written body could satisfy
`publishedProcessBody` while pointing the strategy at a field with no
`format: "person"`. The author would then meet the mistake only as an empty
candidate list at runtime. D14 states that as its own reason for the check to
exist.

Unlike `checkGroupReference`, this check resolves against the FIELD tree
(`collectFieldsDeep`), not a body-level list like `allowedGroups`. It reports
a missing field the same way as a wrongly-formatted one, in one message. Both
mean "this strategy has nothing valid to read".

**Considered and not taken: folding it into `checkIdResolution`.** That pass
(`compile.ts:430`) already builds an `allFields` map for its own
step-reference resolution. So a sixth independent `collectFieldsDeep` walk is
avoidable in principle. The `field-tree-check-consolidation` capability binds
the per-field checks alone, so a separate walk stays within the rules.
Modelling this check line-for-line on its `checkGroupReference` sibling keeps
the two assignment reference checks readable side by side. The consolidation
direction stays open for a change taking all six walks at once, rather than
one leaving five.

### Decision 5: the people list's first layer is a new branch in `resolveFields`, owned by `data-source-resolution`

<!-- antislop: allow passive-voice -->
<!-- The flagged phrase sits inside a verbatim quotation of a base-spec requirement title. -->
D23's first layer has no existing runtime path. In that layer, a person field
declaring neither `options` nor `dataSource` reads `body.allowedGroups`. It is
not a `DataSourceRegistry` resolution, since D23 is explicit that `dataSource`
is the *second*, orthogonal layer. So it does not belong behind a registry
`type`. It becomes new logic in `resolveFields`
(`src/runtime/api.ts:579-612`), which already owns the `options` resolution
`ResolvedViewField` carries. The `data-source-resolution` requirement "A
data-source-bound view field's options are resolved at runtime" gives that
same reason for the `dataSource` branch beside it:

```ts
let options: FieldOption[] | undefined = field.options;
if (field.dataSource) {
  // ...existing dataSource branch, unchanged...
} else if (field.format === "person" && field.options === undefined) {
  options = await resolvePersonOptions(body.allowedGroups ?? [], held, body.baseLocale, db);
}
```

<!-- antislop: allow passive-voice -->
<!-- The flagged phrase sits inside a verbatim quotation of a base-spec scenario title. -->
The `else if` carries the `options` half of its own gate. Without it the
branch overwrites a person field's static `options`. That contradicts the
delta spec's "neither `options` nor `dataSource`". It also contradicts the
base scenario "A static-options field's resolved options are unchanged".

The gate reads `=== undefined`, not an emptiness test. The schema types
`options` as `z.array(fieldOption).optional()` with no minimum, so `options:
[]` is a legal declaration. An emptiness test would overwrite that declared
list, and the delta spec's own wording is "declaring neither".

The helper `resolvePersonOptions` returns one `FieldOption` per candidate,
drawn from three layers. Two of them read `allowedGroups`:

- **One entry per `allowedGroups` id**, `value` the group id and `label` the
  group's own `name`. Without it, no `group_`-prefixed value can reach a bare
  person field. The member expansion holds user ids alone, and the membership
  bound stated under Goals / Non-Goals would reject a group id. That would
  leave D12's `group_` prefix and the strategy's own `group_` branch with no
  no-code authoring path.

  The name comes from a new `groupNamesForIds(groupIds: string[], db):
  Promise<Map<string, string>>` in `src/auth/groups.ts`. It is one batched
  query mirroring the shape `getGroupScopes` (`groups.ts:141`) already takes
  over the same id set. An id the store no longer holds keeps the id itself as
  its label. A stale `allowedGroups` entry therefore stays visible rather than
  silently narrowing the list.
- **One entry per member account**, `value` the user id. They come from every
  `allowedGroups` entry expanded through `getGroupMembers`, deduplicated
  across groups.

The `FieldOption.label` key is `localizedText` (`definition.ts:253-257`), a
`Record<localeCode, string>`, not a plain string. So this branch keys every
label it builds by the body's own `baseLocale`:

```ts
{ value: userId, label: { [body.baseLocale]: name } }
```

In `form-ui`, `resolveFieldsLocale(fields, locale, baseLocale)` falls back to
the base locale. One base-locale key
therefore renders for a viewer in any locale. Neither an account nor a group
carries a per-locale name to key any other way.

A member's name comes from a new `displayNamesForUserIds(userIds: string[],
db): Promise<Map<string, string>>` in `src/auth/users.ts`. It is one batched
query over the deduped id set, applying the module's existing private
`resolveDisplayName`. A `NULL` `display_name` therefore falls back to the
email, exactly as `listUsers` does. The module documents that private function
as "the one resolution of a user's displayable name". This helper exists to
avoid a second resolution beside it.

It differs from `emailsForUserIds` in one way: it does NOT filter `disabled`.
The held value below needs a name for an account taken out of service. An id matching no row keeps
the id as its own label. That is the same fallback the group layer takes.

**The third layer: a held value stays submittable.** The helper also takes the
values the instance already holds. It then
appends an entry for any held id the two layers above did not already return.
Without it, a member leaving the group strands the value the instance holds,
as does a disabled account. The membership bound would reject a resubmission
of a field the participant never touched.

The `data-source-resolution` capability carries "A retired value the instance
holds stays submittable" for exactly this case on the `dataSource` side. This
branch takes the same treatment rather than a narrower one.

**A held value is one the instance COMMITTED.** That is the layer's purpose
made precise. It never covers one the same call is seeding. The values come
from the instance's committed data. `resolveFields` takes that as its own
`committedData` parameter, which defaults to `instance.data`.

Exactly one caller passes something else. At `createProcessInstance` the
instance commits nothing yet. The stub's `data` IS the seed payload
(`api.ts:1064`). Then `applyFieldDefaults` mutates that same object in place
(`:1075`), ahead of `validateSubmissionData` (`:1077`). So reading it back
returns what this same call seeded microseconds earlier. That caller therefore
passes `{}`.

Reading the stub instead would let a seeded value appear in its own resolved
options and validate itself. A catalog `default` naming an account outside
every allowed group would then pass creation. It would pass every later
submission too, since by then it sits in committed data. That makes
`allowedGroups` advisory for any value arriving through a default. It also lets
`org.actor-from-field` route a step to an account outside every allowed group.

The `dataSource` branch reads the same `committedData`, so it gains the
identical property. That closes the same hole on that side, where no test
exercised it. The existing seed-data case passes only because its static
handler ignores `heldValues` altogether.

**The order the three layers land in, decided rather than left to the
implementation.**

<!-- antislop: allow synonym-rotation -->
<!-- "render", "display", "show", "surface" and "present" each carry a distinct meaning here, fixed by the UI glossary and by the code they name. -->
A `FieldOption[]` is an ordered array. Both `<select>` and `<select multiple>`
render it in array order. So this is a participant-facing choice, not an
internal detail.

The helper returns the group entries first, in `allowedGroups`'s own declared
order. Then come the member entries, in the order `getGroupMembers` returns
them per group. The helper walks groups in that same declared order, with the
first occurrence winning a dedup. Last come the held values the first two
layers did not return.

Groups lead because a group is the coarser routing choice, and there are few
of them. The specific people therefore do not push it off the visible end of a
long list. The held-value tail is last because it is a survival entry, not an
offer. It exists so a resubmission passes, and a participant picking fresh
should not meet a departed account first. The delta spec states the order, and
task 4.1's test asserts it.

An empty `allowedGroups` (absent or `[]`), with no held value, resolves to
`[]`. That states D23's "fails closed" requirement directly. It matches
`definition-contract`'s own existing `?? []` treatment of the field. What that
empty list does NOT do is bind the submission. The check `optionValuesValid`
reads `[]` and `undefined` alike, and returns `true`. The Risks section states
that consequence.

<!-- antislop: allow passive-voice -->
<!-- Both flagged phrases sit inside verbatim quotations of base-spec requirement and scenario titles. -->
**Where the rule lives, and the three `runtime-api` passages that name it.**
The behavioral contract for what `ResolvedViewField.options` resolves to lives
in `data-source-resolution`. Its requirement is "A data-source-bound view
field's options are resolved at runtime". Its scenario is "A field with
neither options nor dataSource has no resolved options". That is exactly the
rule this change carves an exception out of. That is where the branch lands.

The `runtime-api` capability gets a delta all the same. An earlier draft
argued it did not, on the ground that its passages delegate by
cross-reference. Re-reading them refutes that. Each one cross-references *and
then enumerates beside the reference*, so a third source leaves the
enumeration incomplete.

<!-- antislop: allow passive-voice sentence-length -->
<!-- The three bullets quote base-spec passages verbatim, so their wording and length are not this document's to change. -->
- `spec.md:375-378`, the `getInstanceView` `fields` paragraph: "`options`
  (per the `data-source-resolution` capability: populated from static
  `FieldDef.options` unchanged, or resolved at runtime for a
  `dataSource`-bound field)". MODIFIED, gaining the person source.
- `spec.md:988-990`, step 2 of the submission validation order: "populated
  from static `FieldDef.options`, or from a `dataSource`-bound field's
  runtime-resolved options, per the `data-source-resolution` capability".
  MODIFIED, gaining the person source.
- `spec.md:649`, inside `submitAndTransition`: "using the required
  `registry: DataSourceRegistry` parameter to resolve `dataSource`-bound
  fields' options". NOT modified. It states what the `registry` parameter is
  for. The person branch never reaches the registry: it reads
  `body.allowedGroups` and `db` directly, which is Decision 5's whole point.
  That sentence stays true word for word.

A fourth passage, `spec.md:118-129` in the creation requirement, also stays.
It governs a defaulted field ABSENT from the initial step's resolved view.
There `validateSubmissionData` takes its off-view arm
(`src/runtime/api.ts:885`) and reads `field.options`, the raw catalog entry,
rather than a `ResolvedViewField`. A bare person field declares no static
`options`. So it falls into the "field carrying an empty options list"
treatment that passage already names.

The rule stands as it is. The delta records both halves of the asymmetry as
scenarios, since neither is obvious from either requirement alone.

**Alternative considered:** register a `type: "org.allowed-groups"` (or
similar) entry in `DataSourceRegistry`, and bind a bare person field to it
implicitly. Rejected. D23 states the two layers with `dataSource` orthogonal
to `format`. It does not state one format implying a hidden data source that a
`dataSource`-bound field could shadow or conflict with. A registry entry would
also need a fabricated `DataSourceDef` with no `id` an author ever declared.
That breaks the "referenced by id" rule `process-contract.md` states for every
data source.

### Decision 6: no `packages/form-ui` change

Investigation found that `form-ui`'s existing widget switch already covers
this. It renders any field carrying resolved `options` as a picker, "whatever
its type". The source is `openspec/specs/form-ui/spec.md`, Requirement: Field
rendering covers every `BaseFieldType`. The `<select>`/`<select multiple>`
mechanism lives in Requirement: Select and multiselect share one option-list
rendering.

That rule is format-agnostic by construction. It dispatches on the *presence*
of resolved options, not on what format produced them. That property already
lets a `dataSource`-bound field of any type reach the same picker as a
static-`options` field.

Once Decision 5 makes `resolveFields` populate a person field's `options`, the
existing renderer path takes it with zero code change. A `{type: "string",
format: "person"}` field renders the existing `<select>`. A `{type: "list",
format: "person"}` field renders the existing `<select multiple>`. Each
option's label is already the resolved display name Decision 5's
`FieldOption[]` carries.

This mirrors Change 1's own task 3.6. That task confirmed three deltas needed
no code. It read the named function first, rather than assuming the brief's
scope list mapped one-to-one onto code changes.

**What the empty-list case draws, decided rather than inherited.** With no
`allowedGroups`, the two types render differently. Reading `FieldForm` rather
than assuming is what turned that up. A `{type: "list"}` field takes the
`def.type === "list"` branch (`FieldForm.tsx:266`), which `hasOptions` does
not gate. So it draws an empty `<select multiple>`.

A `{type: "string"}` field fails the `hasOptions` gate at `:278` and falls
through to the final `else` (`:289-302`). There `NATIVE_INPUT_TYPE` has no
`person` entry, so the input reads `type="text"`. That is a free-text box a
participant could type a raw principal id into.

Both stay as they are, and this change adds no `form-ui` code. The free-text
box submits nothing corrupting, since `formatMatches` rejects an unprefixed
value at submit. A body reaching that state has declared a person field while
declaring no group to fill it from. That is an authoring mistake the studio's
own Values tab already names (Decision 8).

Closing the box would mean a `person` entry in `NATIVE_INPUT_TYPE`, or a fifth
branch in the widget switch. The case only exists in a misconfigured body, and
the `list` twin would need its own gate on top. That is a `form-ui` change
worth making against a real complaint, not ahead of one.

### Decision 7: no `fieldValidationLogic.ts` change

The `studio-field-validation-form` capability states that a `format` "SHALL
NOT narrow the offered [validation key] set". A `format: "date"` field is a
`string` field to every branch that reads `type`. The `person` format adds no
validation key of its own. It brings no min/max and no pattern domain beyond
the format check itself.

So `offeredKeys` needs no `person` case. The existing type-keyed behavior,
meaning `string` or `list`'s own offered set, already applies unchanged. No
delta spec follows for this capability.

### Decision 8: the Default value zone and preview keep their "no resolved rows" treatment for a bare person field

The Default value zone's literal control already offers no option list for a
`dataSource`-bound field. The spec's reason: "since the draft carries no
resolved rows for one". The source is the `studio-app` spec, in the Values
tab's Default value zone paragraph. The preview carries the identical carve-out one paragraph later,
for the same reason.

A person field declaring neither `options` nor `dataSource` sits in exactly
the same position. Decision 5's `allowedGroups` expansion needs a live
database read. The studio's draft editor runs in the browser against an
unpublished draft, and has no such read.

Both existing carve-outs extend to name `format: "person"` beside
`dataSource`-bound. Neither gains a new, third disabled state. The reasoning
("the draft resolves no rows") is identical rather than merely similar. The CEL toggle still works in both places, as it already does for
`dataSource`-bound.

The function `literalControlKind` (`defaultValueLogic.ts:43`) returns
`"options-multi"` for ANY `list` field declaring no `dataSource`. So the case
that changes is `{type: "list", format: "person"}`, which today would draw a
checkbox group over zero options. The `string` case merely loses a text input.
Both arms take the carve-out, and the `studio-app` delta carries a scenario
for each.

**Two edits the preview needs, which the "no rows" reasoning alone hides.**

The table `FORMAT_SAMPLE` (`field-preview.ts:20-24`) carries the type
`Record<FieldFormat, unknown>`. It is exhaustive over the enum for the reason
`JS_TYPE` is. So adding `person` to `fieldFormat` stops the existing table
typechecking until it gains a `person` entry.

And `sampleValue` (`:35`) returns `FORMAT_SAMPLE[format]` BEFORE its type
switch, since "the format wins over the type where the field declares one".
Every format admitted before this change is `string`-only, so that early
return was always right. The `person` format is the first one
`ALLOWED_BY_TYPE` admits on `list`. So it is the identical scalar/array fork
Decision 2 handles in `formatMatches`.

Unforked, a `{type: "list", format: "person"}` field previews a bare string.
`FieldForm` then reads `checked = Array.isArray(value) ? value : []`
(`FieldForm.tsx:179`) and draws nothing selected. So `sampleValue` wraps the
format sample in an array for `type: "list"`, and returns the scalar
otherwise.

The note row itself is not in `field-preview.ts`. Its gate is
`field.dataSource !== undefined` at `FieldCatalogPanel.tsx:675`. The string it
renders (`fieldCatalog.previewResolvesAtRuntime`) names a data source by hand:
"This field's choices come from a data source."

The Default value zone's own note repeats it. At
`DefaultValueEditor.tsx:131` the code renders
`t("defaultValue.dataSourceNoOptions")` for `kind === "none"`, which a bare
person field now also reaches. Both strings gain a person-specific sibling in
`packages/web/src/i18n/catalogs/studio.ts`, rather than a reworded shared one.
An author may read "come from a data source" on a field declaring none. That
teaches the wrong thing about their own draft. The `studioCatalog` export carries `en`
alone (`catalogs/studio.ts:445`), so that is one locale to write.

A literal person default therefore stays authorable through the JSON view
alone. Task 1.4 covers the publish-time check for one, while this decision
removes the studio's literal input for it. That is coherent with the repo's
low-code-stays-first-class rule, rather than an oversight. The JSON view is
the escape hatch for what no builder expresses. This paragraph writes it down
so a later reader does not "fix" one half against the other.

**What that JSON-authored default now costs.** C2's closed list made this
real. The publish-time check verdicts a person default on its
`user_`/`group_` prefix alone. Membership is a runtime rule, and the closed
list the user accepted in C2 binds it.

So a body publishing with `default: "user_z"` fails at
`createProcessInstance`, on a person field the initial step's view SHOWS.
There `resolveFields` populates that field's options from the `allowedGroups`
expansion. Then `validateSubmissionData` seeds the default into the same check
every submitted value faces (`src/runtime/api.ts:914`). The value `user_z`
sits outside the expansion, so the creation throws
`SubmissionValidationError` with an `invalid-option` issue. This is not a
publish rejection, and not a silently dropped default. Every instance creation
for that process fails until the author fixes the default or `allowedGroups`.

The third layer does not rescue it. The instance commits nothing at creation,
so Decision 5 hands that caller an empty `committedData`.

The same default succeeds on a person field the initial step's view does NOT
show. That path is `validateSubmissionData`'s off-view arm (`api.ts:885`). It
reads the catalog entry's raw `field.options`, absent on a bare person field,
so no membership check runs at all.

The asymmetry is the existing off-view rule, not something this change
introduces. But a person field is the first case where it decides whether a
body can start an instance at all. This design states both halves, so an
author reading a green publish does not read it as a green creation.

**The Player is where an author sees the real list.** Decision 8's carve-outs
say the DRAFT resolves no rows. That reads as "an author can never see their
people list". They can. The `draft-test-instances` capability starts a real
instance of the current draft body, nothing simulated.

So the studio's Player renders a bare person field's live
`allowedGroups`-resolved picker, exactly as a participant gets it. The preview
and the Default value zone are the two surfaces with no instance behind them.
The Player has one. Task 7.5's browser check runs there.

**The form editor's palette gains no `person` entry.** The list
`PALETTE_FIELD_KINDS` (`draft/mintField.ts:9-11`) carries five kinds. Among
them `date` is the standing precedent for a palette entry that mints a
`format` the type alone does not carry (`baseTypeForPaletteKind`, `:18-30`).

The `person` format fits that precedent and still gets no entry. The format
picker on the Field tab is the authoring path this change ships. One entry
there is the whole no-code surface. A sixth palette kind is a form-editor
change, belonging to `studio-form-editor`'s capability rather than this one's.
It is worth making against an author asking for the drag, not ahead of one.
Task 6.6 records the read, so a later change does not mistake the omission for
an oversight.

### Decision 9: `assignment-registry-validation` gets no delta

That capability's config-schema check resolves `type` against the injected
registry, then parses `config` against the resolved entry's schema. It is
already fully generic over any registered `AssignmentStrategyDef`. That
includes one declaring a `configSchema`, as Decision 3's
`actorFromFieldConfigSchema` does. Registering a new entry exercises the
existing requirement, and does not change it.

The "static config missing candidates" style scenario that capability already
carries needs no `org.actor-from-field` sibling to prove the mechanism. The
`actor-from-field-assignment` delta spec carries that strategy's own
config-schema scenarios instead. That is the same division
`group-based-assignment` and `assignment-registry-validation` already keep
today.

## Risks / Trade-offs

**`formatMatches`'s signature widens from `(format, value)` to `(field,
value)`.** → Two production call sites take it, each already holding the
field. They are `typeMatches`, and `checkFieldFormatControl`'s
literal-`default` arm at `compile.ts:601`. So do 16 assertions in
`test/field-format-control.test.ts:92-155`, each moving onto the field-taking
signature. The one-line `ff` helper Decision 2 spells out carries them, not
the file's existing `fld` helper. That one returns `FieldDef`, whose `format`
is optional, and the widened parameter needs a present one.

Task 1.3 carries that rewrite. Every table the enum breaks lands in the same
group, so group 1 leaves `bun run typecheck` green.

**`resolvePersonOptions` reads the database on every `resolveFields` call for
a bare person field.**

→ The `dataSource`-bound branch beside it does the same. This matches
`org.group-members`'s own accepted trade-off. Live resolution is
the point, per D13's "reads live" framing carried over from its group-members
precedent. It is not a new cost this change introduces.

A step with several bare person fields triggers one `getGroupMembers` call per
field. That is the same one-call-per-field shape `data-source-resolution`
already accepts for `dataSource`-bound fields. Its requirement is "Two fields
sharing one data source each resolve it independently".

**A bare person field's submitted value answers to the resolved candidate
list, not to id shape alone.**

→ That is the point, per Goals above. The cost
is that enlarging a picker means enlarging `allowedGroups`. W3's
`definition-contract` delta states that key's second reader.

One case carries no bound at all. The check `optionValuesValid` returns `true`
for an empty `options` array as much as for an absent one. So a body declaring
no `allowedGroups` gets the shape check alone. That is the fail-closed case
D15 asks for on the picker side, where the body offers no people list. It
leaves the submission surface exactly where it stands today for a
`static`-strategy assignee. Decision 6 states what the renderer draws there.

**The Default value zone's carve-out stops an author hardcoding a specific
person as a catalog-level default.**

→ For a bare person field, that is consistent with the identical
`dataSource`-bound carve-out. The two share one underlying reason: no
resolved rows in the draft. An author
needing a fixed default can still write a CEL default carrying the literal id.
The CEL toggle stays available, unaffected by this carve-out.

## Migration Plan

Additive only. No existing `examples/` body declares `format: "person"` or
`org.actor-from-field`. So this change needs no rewrite table, the way Change
1 needed Decision 8's removed-member mapping. And `definitionHash` moves for
no existing body. A new enum member and a new registry entry move nothing
until an author opts in.

Order of work. The rule is that each numbered group leaves `bun run typecheck`
green. That run spans `packages/*`, so the enum's own forced repairs travel
with the enum rather than waiting for the studio group:

1. `fieldFormat`, `ALLOWED_BY_TYPE` and `formatMatches` land first
   (Decisions 1-2), with the array/scalar fork's own test. In the same group
   land every table the widened enum breaks. Three break, all exhaustive over
   `FieldFormat` by construction. First, `formatMatches`'s own `switch` in
   `src/schema/definition.ts`, declared `: boolean` with no `default`, so a
   missing arm is TS2366. Second and third, `FIELD_FORMAT_LABELS`
   (`packages/web/src/areas/studio/draft/field-type-labels.ts:30`) and
   `FORMAT_SAMPLE`
   (`packages/web/src/areas/studio/draft/field-preview.ts:20-24`), both
   `Record<FieldFormat, …>` and therefore TS2741 until each carries a
   `person` key.

   No other exhaustive `Record<FieldFormat, …>` type exists in the
   repository. `NATIVE_INPUT_TYPE` (`form-ui`) is `Record<string, …>`,
   `LiteralControlKind` is a string-literal union, `celType` switches on
   `type`, and `offeredKeys` keys on `BaseFieldType`. The rest of the
   studio work is behavior, not exhaustiveness. That covers `sampleValue`'s
   array fork, `literalControlKind`'s carve-out, the two note strings and the
   note row's gate. It stays in group 6, and no group between goes red.
2. `assignment-strategies.ts`'s new entry (Decision 3), its config-schema
   tests and its resolver tests, including the `group_`/`user_`/empty
   branches.
3. `checkActorFromFieldReference` (Decision 4) and its rejecting test land
   beside `checkGroupReference`.
4. `displayNamesForUserIds` and `groupNamesForIds` (Decision 5), each with
   its own test. Then comes `resolveFields`'s new branch reading both. Its
   tests cover four cases: two body shapes and two values. The body shapes
   are an `allowedGroups`-declaring body and a bare-`allowedGroups` body. One
   value is a held value no longer in the expansion. The other is a stored
   value asserted to be the bare id.
5. The worked `examples/` body, then `docs/authoring-guide.md`,
   `docs/current-state.md` and `docs/decisions.md`, which teach against it.
6. The studio surfaces: the field catalog panel note row, the preview fork
   and the Default value zone carve-out. Decisions 6-8 make this a smaller
   surface than the proposal's initial scope estimate. Group 1 already took
   the two entries the enum forced.
7. Full verification per the project's four-check gate.

Rollback is `git revert` of the whole change. Nothing outside the repository
holds state the revert would leave behind.

## Open Questions

None. D10-D15, D20, D22 and D23 answer every question this change's own
scope raises. Decisions 6, 7 and 9 above are this proposal's own findings.
Each is a "no code" verdict reached by reading the named code and spec first.
None is an open question left for implementation to resolve.
