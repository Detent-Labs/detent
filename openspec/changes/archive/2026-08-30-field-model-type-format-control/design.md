## Context

See `proposal.md` for motivation, and `docs/field-model-redesign.md` for the
brainstorming record whose decisions D1 to D25 this change implements. This
document records the technical choices that record left to the implementation.

Three constraints shape every choice below.

`src/schema/definition.ts` is both the contract and the deserializer for stored
bodies. A Zod refinement therefore runs on READ. A tightened refinement makes
an already-published body throw when the store resolves it.
`.claude/rules/authoring-invariants.md` states the placement rule. An invariant
a hand-written body must not bypass belongs on the write path, in
`src/schema/compile.ts`.

`typeMatches` is the one type rule that submission validation
(`src/runtime/api.ts`) and outbox writeback (`src/engine/outbox.ts`) share. A
format check anywhere else would split the two. A handler's writeback would get
one verdict, a participant's submission another, for the same value.

The engine package's `exports` map carries `celType`. The studio's condition
builder, its rule builder and its migration-plan form all call it from the
browser. A signature change there reaches `packages/web`.

## Goals / Non-Goals

**Goals:**

- One key per job: `type` for the value form, `format` for the semantics,
  `control` for the input form.
- Six types, each with exactly one CEL type and one JS type.
- A publish-time verdict for every `format` and `control` a body declares, from
  one table.
- Every body written today keeps its rendering, since none of them carries the
  new keys.

**Non-Goals:**

- A format or control member beyond the seven named in D20 and D21.
- A per-step `control` override (D8).
- An `items` key on a `list` (D3). A `list` holds strings in this round.
- A publish-time rule tying `control: "radio"` to the presence of `options`.
  The renderer falls back instead, per Decision 6 below.

## Decisions

### Decision 1: `format` and `control` are optional keys on `FieldDef`

`fieldDef` gains `format: fieldFormat.optional()` and
`control: fieldControl.optional()`. Each enum admits a fixed member set:
`fieldFormat = ["date", "datetime", "integer", "email"]` and
`fieldControl = ["multiline", "radio", "checkboxes"]`.

Optional is what keeps every existing body valid. An omitted `format` means the
type's own value domain. An omitted `control` means the type's default control.

Alternative considered: a discriminated union per type, so the schema itself
admits only the legal pairs. Rejected. Zod would then reject a stored body on
READ once a pair moves. That is the error the placement rule exists to prevent.
It also hands the studio a shape its flat draft editors do not write.

### Decision 2: one table of allowed pairs, read by the compile pass

The table is a `Record<BaseFieldType, {formats: FieldFormat[]; controls:
FieldControl[]}>` declared in `src/schema/definition.ts` beside `JS_TYPE`. It
follows the same exhaustive-record pattern, so a future type member missing
from it is a compile error.

| `type` | allowed `format` | allowed `control` |
|---|---|---|
| `string` | `date`, `datetime`, `email` | `multiline`, `radio` |
| `number` | `integer` | none |
| `boolean` | none | `radio` |
| `list` | none | `checkboxes` |
| `file` | none | none |
| `group` | none | none |

`multiline` belongs to `string` alone, per D7. A multiline string is a string,
and nothing validates it differently. `radio` reaches `string` and `boolean`.
Those are the two one-value cases D16 and D21 name. `checkboxes` reaches `list`
alone.
That is D17's "one question with several answers". A `number` gets no control.
Nobody has asked for one, and `slider` waits (D21).

The table holds no row for a plugin envelope. A lookup miss rejects any
`format` or `control` such a field declares. That is D6's rule stated the other
way round. A field type no closed member covers uses the plugin envelope, whose
own semantics live in its config.

The check goes into `checkFieldTree` in `src/schema/compile.ts`, beside
`checkFieldKeyFormat`, per D22. That is the write path, so a hand-written body
cannot bypass it.

### Decision 3: the format check joins `typeMatches`, and `typeMatches` takes the field

`typeMatches(fieldType, value)` becomes `typeMatches(field, value)`, where
`field` is a `Pick<FieldDef, "type" | "format">`. It runs the JS-shape check
first, then the format's own value check. All four call sites already hold the
`FieldDef`, so none of them gains a lookup.

D19 is the reason. Without a value check no reader outside the renderer would
touch `date`, `datetime` or `email`. Those three would then be controls, and
the `format` axis would collapse into `control`.

The four value checks:

- `date`: `/^\d{4}-\d{2}-\d{2}$/`, then a calendar round trip, so `2026-02-30`
  fails.
- `datetime`: an ISO-8601 date and time, with an optional seconds part, an
  optional fractional part, and an optional zone offset. That covers what
  `<input type="datetime-local">` produces, plus the offsets a handler writes
  back.
- `integer`: `Number.isInteger(value)`.
- `email`: the WHATWG email-input regex, verbatim. The native control enforces
  exactly that. The studio's preview and the engine then agree on which values
  a participant can enter.

Alternative considered for `email`: a hand-written regex. Rejected. Take a
value the native control accepts and the engine refuses. The participant then
holds a form they can neither submit nor fix.

### Decision 4: a format mismatch reports the existing `type-mismatch` kind

`expectedTypeLabel` returns the format name when the field declares one, and
the JS-shape label otherwise. No new `SubmissionIssue` kind appears.

A new kind would reach `form-ui`'s issue-message catalog, the HTTP layer and
every consumer that switches on the discriminator. The existing kind already
carries an `expected` string that `issue-messages.ts` interpolates. So
`expected: "date"` produces a usable message, with no new branch anywhere.

### Decision 5: `celType` takes the field, and `format: "integer"` reports `int`

`celType(t: BaseFieldType | object)` becomes
`celType(field: Pick<FieldDef, "type" | "format">)`. The mapping:

| `type` | CEL type |
|---|---|
| `string` | `string` |
| `number` | `double`, or `int` when `format` is `"integer"` |
| `boolean` | `bool` |
| `list` | `list<string>` |
| `file` | `dyn` |
| `group` | `dyn` |

This resolves the `ponytail:` comment at `src/cel/check.ts:53-56`, which names
this exact fix. D24 measured the blast radius. The format is opt-in, no field
carries it today, and published bodies are frozen.

Two consequences reach the author, and `docs/authoring-guide.md` states both.
Division between two integers truncates, so `7 / 2` is `3`. An expression
mixing an integer field with a decimal field finds no overload and fails the
check.

The studio's `celLiteral` (`conditionLogic.ts`) writes the `double` form for a
number operand today. It gains an `int` arm that writes a bare integer.
`data.anzahl > 3.0` does not type-check against an `int` field.

### Decision 6: an inapplicable control falls back to the type default

`control: "radio"` on a `string` field carrying no `options` has nothing to
draw. The renderer falls back to that type's default control rather than
rendering an empty group.

Alternative considered: a publish-time rule requiring `options` or `dataSource`
alongside `control: "radio"` and `control: "checkboxes"`. Rejected for this
round. D22 states the check reads one table of allowed pairs. A second
condition inside it makes the check depend on a sibling key. A
`dataSource`-bound field resolves its options at runtime. The check cannot see
them, so it would have to exempt that case.

The fallback keeps the form usable in every case the check admits. The studio's
own preview shows the fallback, so an author sees it before publishing.

### Decision 7: the renderer picks its widget from all three keys

`FieldForm`'s switch reads four things in order. First the resolved `options`,
then `control`, then `format`, then `type`.

- A field with resolved options renders a picker. `control: "radio"` makes it a
  radio group, and `control: "checkboxes"` a checkbox group. An omitted
  `control` keeps the `<select>` (single for `string`, `multiple` for `list`).
- A `boolean` renders a checkbox, or a Yes/No radio pair under
  `control: "radio"`. The two labels come from a locale record inside
  `form-ui`, following the `CONSTRAINT_LABEL` pattern `issue-messages.ts`
  already uses. D16 keeps them out of the body. An author wanting other
  wording declares a two-option `string` field.
- A `string` renders `<textarea>` under `control: "multiline"`. Otherwise it
  renders `<input>`, with `type` taken from the format: `date`,
  `datetime-local`, `email`, or `text`.
- A `number` renders `<input type="number">`, with `step="1"` under
  `format: "integer"`.
- A `file`, a `group`'s container and a plugin envelope keep what they render
  today.

### Decision 8: removed members map onto the new model with no behavior change

| old `type` | new declaration |
|---|---|
| `select` | `{type: "string"}` |
| `multiselect` | `{type: "list"}` |
| `date` | `{type: "string", format: "date"}` |
| `datetime` | `{type: "string", format: "datetime"}` |
| `reference` | `{type: "string"}` |

The `date` and `datetime` rows tighten one thing on purpose. A body that
declared `date` accepted any string. After the rewrite it accepts an ISO-8601
date alone. That tightening is the point of D19, and the four bodies under
`examples/` carry one such field between them.

`reference` loses `defaultValueLogic.ts:25`'s refusal of a default value, which
is the one line that separated it from a `string` (D25). No definition under
`examples/` declares one.

### Decision 9: the compile pass checks a literal `default` against the format

The same compile-pass check validates a literal `FieldDef.default` on a field
declaring a `format`. An author writes that value, so D19's reasoning applies
to it directly. An ISO-8601 reporting column is trustworthy only while every
stored value is ISO-8601, and a default is a stored value.

This check skips an `Expression` default. The CEL layer types that one, and
that layer reads no format.

### Decision 10: the hash moves for a rewritten body, and nothing pins the old one

Rewriting a field from `type: "select"` to `type: "string"` changes that body's
JCS hash. `definitionHash` therefore moves for every body the rewrite touches.
Adding `format` and `control` moves no hash on its own, since a body declaring
neither key serializes unchanged.

That movement strands a pinned instance in general. It strands none here. No
deployment runs this engine. No environment holds a published body carrying a
removed type value. The `examples/` directory holds seed data, and the tasks
rewrite it.

The three later changes extend this model rather than undo it. Change 2 adds
`person` to the `format` enum, and to the `string` and `list` rows of the
allowed-pairs table. Change 4 adds an `items` key to a `list`, per D3. Change 3
touches the `view` and never reads a field's type. Each addition is a new row
or a new member, so none of them needs Decision 1 or Decision 2 reversed.

## Risks / Trade-offs

**A stored draft or published body carrying a removed type value stops
reading.** → No deployment runs this engine. No stored instance pins such a
body, and no definition under `examples/` survives the rewrite unchanged. A
developer repairs their own database with a reseed, which the tasks name.

**`celType`'s signature change reaches `packages/web` through the exports
map.** → Three call sites, all named in the tasks. TypeScript reports each one.
The parameter type moves from a union to an object.

**An `int` field and a `double` field in one expression fail the check.** → D24
accepted this. The format is opt-in, and the studio reports the error at
publish time. An author meets it while authoring rather than at runtime.

**The `date` tightening rejects a value a body accepted before.** → This
reaches only a body an author rewrites onto `format: "date"`. It reaches only
values that were never dates. The alternative, a format that validates nothing,
collapses the `format` axis into `control`.

**The allowed-pairs table is a second place naming every type member.** → It
is an exhaustive `Record<BaseFieldType, ...>`, like `JS_TYPE`. A missing member
is a compile error rather than a silent omission.

**`format: "email"` duplicates what `validation.pattern` already expresses.** →
D20 named this and shipped it anyway. The pattern key states a regex an author
writes and maintains. The format states a value domain the engine owns, and it
reaches `<input type="email">`. Both stay available, and an author may declare
either or both.

**A recorded decision reverses.** → Today `docs/decisions.md` says the contract
has no multiline string variant. It gates a future one on rendered behavior
that a `string` field cannot already express. `control: "multiline"` is that
behavior. The tasks rewrite the entry rather than leave it standing.

## Migration Plan

No runtime migration exists to write. Published versions are immutable, and no
published body carries a removed type value in any environment.

Order of work:

1. The schema, the table and the two checks land first. The suite stays red
   until the rest follows. `examples/` and the test bodies still declare
   removed members at that point.
2. `celType`, `typeMatches` and their callers follow, engine side.
3. `examples/` gets rewritten per Decision 8's table, then the engine suites.
4. `packages/form-ui` and `packages/web` follow, then the web suites.
5. `docs/authoring-guide.md` states the three keys, the D17 rule for a
   checkbox list, and D24's two integer consequences. `docs/current-state.md`
   and `docs/decisions.md` follow.

Rollback is `git revert` of the whole change. Nothing outside the repository
holds state that the revert would leave behind.

## Open Questions

None. `docs/field-model-redesign.md` closed the six questions its own record
held, and Decisions 1 to 9 above settle what it left to implementation.
