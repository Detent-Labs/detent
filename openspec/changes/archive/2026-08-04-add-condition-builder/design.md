<!-- antislop: allow-file synonym-rotation -->
<!-- Why: "change" and "edit" name two different things here. A change is an
     OpenSpec artifact under openspec/changes/; an edit is the keystroke an
     author makes in a panel. The rule reads them as one concept and reports a
     false positive on every paragraph that names both. -->

## Context

See `proposal.md` for motivation. See
`docs/superpowers/specs/2026-08-04-condition-builder-design.md` for the full
approved design this artifact condenses.

Three facts of the current code shape the approach.

First, the root `package.json` pins `@marcbachmann/cel-js` at exactly `8.0.0`.
`src/cel/check.ts` already imports `parse` from it. `packages/web` declares no
dependency on it. It reaches CEL over the exports map entry `./cel/check`, which
`draft/validation.ts` and `ToolsScreen.tsx` already use.

Second, `parse(src).ast` returns a typed, discriminated tree. Each node carries
`op`, `args`, the source `input` and a `range: { start, end }`. Verified against
the pinned copy:

```
data.amount > 1000.0      {op:">",  args:[{op:".", args:[{op:"id",args:"data"},"amount"]}, {op:"value",args:1000}]}
"manager" in actor.roles  {op:"in", args:[{op:"value",args:"manager"}, {op:".",args:[{op:"id",args:"actor"},"roles"]}]}
a && b && c               {op:"&&", args:[{op:"&&",args:[a,b]}, c]}    (left-associative)
a && b || c               {op:"||", args:[{op:"&&",args:[a,b]}, c]}
```

Third, four studio files import `ExpressionInput`, and only two of them host a
condition. The path guard lives in `PathsPanel.tsx`. The three view overrides
that `ViewEditor.tsx` renders live in `BooleanOrExpressionInput.tsx`.

The other two come close and stay out. An `Action.output` expression over
`result` lives in `FieldExpressionMapEditor.tsx`. A deadline lives in
`TimersPanel.tsx`, and `check.ts` requires it to yield a string. Neither is a
condition, and neither changes.

Fourth, `panels/shared/` already reads the draft from context.
`IssueList.tsx:6` and `LocalizedTextInput.tsx:16` call `useDraft()` rather than
taking the draft as a prop. `ConditionInput` follows them.

## Goals / Non-Goals

**Goals:**

- Read a hand-written guard back into the builder, so the two surfaces stay one
  artifact.
- Keep the builder model out of the persisted artifact. A later grouping level
  then costs a reader and a writer, and no migration.
- Keep one version pin of the CEL library across the workspace.

**Non-Goals:**

- Grouping or nesting. One flat row list, one joiner.
- `field.validation.rule`. `FieldCatalogPanel.tsx` offers no surface for it to
  extend, so building that surface is its own change.
- Field-against-field comparison, negation as a row operator, and ordering
  comparisons on `date` or `datetime`.
- Resolving a `dataSource`-bound field's options for the value picker. No studio
  route resolves them.

## Decisions

### Read-back by parse, not by a sidecar

The alternative is a record beside the condition holding how an author built it.
Such a record cannot live in `ProcessBody`, because it would move
`definitionHash`. Beside the draft it dies at publish, which leaves a published
version uneditable in the builder. Parsing is the honest option, and the library
already parses.

The `range` field carries partial read-back. A fragment the builder cannot
represent slices out of the original source and opens as a raw row. One macro
therefore does not lock a whole guard out of the builder.

### No lock-in, protected by two rules

The stored artifact stays the CEL text in `{ lang: "cel", src }`. The row model
lives in the browser between `parse()` and the next keystroke. Nothing writes,
hashes or versions it.

A later grouping level then touches the reader and the writer alone. Every
condition the flat builder emits is a subset of what a grouping builder reads.
No migration follows, and no published version becomes unreadable.

Two rules keep that open. Both are load-bearing:

1. No sidecar, as above.
2. The builder writes `src` only on a real authoring action. Without that rule,
   opening a panel would flatten `data.a && (data.b || data.c)`. The database
   would then fill with flattened conditions.

### The model

```ts
interface Operand { path: string; label: string; type: string; options?: { value: string; label: string }[] }

type Row =
  | { kind: "cmp"; operand: string; op: "==" | "!=" | "<" | "<=" | ">" | ">=" | "in"; value: string | number | boolean }
  | { kind: "raw"; src: string }

interface Condition { joiner: "&&" | "||"; rows: Row[] }
```

`fromCel(src, operands)` runs in three steps. First, a null parse means no
builder. The site then opens in CEL mode, with the toggle disabled and the parse
message as the hint. Second, a top-level `&&` or `||` becomes the joiner, and
the left-associative chain of that same operator flattens. A child carrying the
other operator survives whole as a raw row. Third, each conjunct goes through
`readRow`:

- `{op: ==|!=|<|<=|>|>=, args: [known operand path, {op:"value"}]}` gives a
  comparison row.
- `{op:"in", args: [{op:"value"}, known operand path]}` gives a comparison row
  with `in`. This is the one form whose CEL text mirrors the row.
- a known operand path of type `bool` alone gives a comparison row `== true`.
- anything else gives `{kind:"raw", src: src.slice(node.range.start, node.range.end)}`.

`toCel` reverses that and needs no serializer. A comparison row builds
`path op literal`, and a raw row carries its own source substring.

### Operands: the context minus a deny-list

The picker walks the draft catalog with `flattenDraftFields` from
`draft/fields.ts`, then drops every `group` node. That helper is the
draft-shaped counterpart of the contract's `collectFieldsDeep`. Its own comment
records why. `collectFieldsDeep` types against a fully-required `FieldDef[]`,
not a mid-edit draft's partial catalog. Both helpers push the group node itself,
so the drop is not optional.

Beyond the catalog the picker reads `INSTANCE_SCHEMA` and `ACTOR_SCHEMA` from
`src/cel/check.ts` mechanically. It hides four entries. `INSTANCE_SCHEMA` is
already exported. `ACTOR_SCHEMA` is not, so this change exports it. Reading both
is what makes the deny-list argument below hold. Hardcoding `actor.roles`
instead would need a second edit whenever the context widens.

`instance.currentStepId` is a constant here by construction. A guard hangs on a
path, and a path leaves exactly one step. `instance.id` names one instance. The
guard lives in the frozen body all instances share. Such a comparison holds for
one instance and is dead code for the rest. `instance.transitionSeq` is the OCC
token. A guard on it is a loop counter someone reaches for when the process
model is wrong. `actor.id` costs the most. A fixed person id in a frozen body is
what stage 25 removed across three OpenSpec changes.

A deny-list beats an allow-list. A later widening of the expression context
reaches the picker on its own. There is no second place to maintain.

### `child.outcome` from the loaded child

This is where the builder creates the most value. Today it is the one place an
author must read another file's contract to type a guard correctly. The draft
store already holds the resolved child body as `loadedChildren[stepId]`
(`draft/store.tsx:20`), and `checkSubprocessChildRefs` types against that same
source.

`child.data.<key>` covers the child contract's `outputFields` alone, not every
field the child declares. `check.ts:316` builds the schema as
`contractFieldSchema(childBody.fields, childBody.contract?.outputFields)`. A key
outside that set is a publish error. A picker offering one would author a
guaranteed failure.

Both condition sites on a subprocess step carry these operands.
`validateProcessBody` pushes the step's path guards with a `child` flag. It
pushes the three view overrides with that same flag, `s.type === "subprocess"`
(`check.ts:198`, `check.ts:222-224`).

An unresolved child falls back to free text, and omits `child.data.<key>`
because it knows no keys.

### Literals follow the operand's declared type

`check.ts:38` records that a `number` field types as CEL `double`. So
`data.count == 5` fails and needs `== 5.0`. The author types `1000` and the
builder writes `1000.0`. The papercut goes away for everyone who authors in the
builder, and the type system stays untouched.

### The two additions to `src/`

```ts
/** Parse to AST for the studio's condition builder. Null when the source does not parse. */
export function parseAst(src: string): ASTNode | null
```

`ACTOR_SCHEMA` (`check.ts:27`) gains an `export` beside it. That is one keyword.
`INSTANCE_SCHEMA` already carries one, for the reason its own comment gives. It
is the single source of truth, so a second field list cannot drift from it. The
picker needs the same guarantee for `actor`.

`parseAst` is four lines around the `parse` already imported. `parse` throws a
`ParseError` on invalid source. `parseExpression` (`check.ts:407`) already
handles that, so the null arm is a `try`/`catch`. A dependency entry in
`packages/web` would be a second pin. A second pin can drift. `CLAUDE.md`
requires a CEL upgrade to be a deliberate commit. That commit re-runs
`test/cel.test.ts`. The exports map needs no new entry, since `./cel/check`
exists.

### Wiring: context for the catalog, one prop for the step

`ConditionInput` reads the draft and `loadedChildren` from `useDraft()`, the way
`IssueList` and `LocalizedTextInput` in the same folder already do. The catalog
therefore needs no prop, and neither does the child body.

The step id does need one. `PathsPanel` receives `paths`, `steps` and `fields`.
It knows nothing about which step owns the paths it renders. `ViewEditor` is the
same. Both gain a `stepId` prop. `StepsPanel` passes `step.id` at both call
sites (`StepsPanel.tsx:218` and `:254`), and `BooleanOrExpressionInput` threads
that id through to `ConditionInput`. Without the id there is no
`loadedChildren[stepId]` lookup, so no `child.outcome` operand.

The alternative drills the whole operand list down from `StepsPanel`. This
design rejects it. `BooleanOrExpressionInput`'s three props stay a readable
surface, and the folder already has the context pattern.

### Surface

The builder is the default view. Below it sit a read-only CEL line and an
`Edit as CEL` toggle. That read-only line is the one place an analyst learns
what the builder writes.

`BooleanOrExpressionInput` already carries a `boolean`/`CEL` select of its own.
That select stays the outer mode and keeps its two names. `ConditionInput`
replaces only what its `CEL` arm renders. The builder's own toggle therefore
sits inside that arm, and a view override never shows two controls for one
choice.

The shape follows the two shipped siblings. Stage 27a's plugin config form keeps
a manual JSON escape hatch beside a generated form.
Stage 27c's migration-plan screen carries a Mapping/JSON toggle.

### State and the incomplete row

`ConditionInput` holds the `Condition`, and `ConditionBuilder` renders it. It
re-reads that state when either half of what it read FROM changes. Those halves
are the source text and the operand set that decides how the text reads.

The source arm is the obvious one. It ignores the builder's own writes, so a
half-filled row does not vanish on the first re-render.

The operand arm is not obvious, and browser testing found it. A child process
resolving mid-session leaves every guard's text untouched. It also turns
`child.outcome == "approved"` from a raw row into a comparison row. Keying on
the text alone left it raw for the rest of the session. `operandSignature`
covers path and CEL type only. A label moves no row, so a label edit must not
discard one.

The mode is state for the same reason. `celMode` seeds from whether the source
parsed at mount. A guard that opens unreadable therefore keeps the CEL input
while the author repairs it. The alternative derives the surface from "does it
parse right now". That swaps the field out on the keystroke that first makes it
parse.

`BooleanOrExpressionInput` remembers its chosen arm rather than reading it off
the value (`overrideMode`). That is a third instance of the same shape. The
builder writes `undefined` while its only row is incomplete. Reading that as
"not an expression" collapsed the override to its checkbox on the first click.
A value present still wins, so a JSON-surface edit shows.

An incomplete row stays visible and marked, and `toCel` skips it. The draft
saves continuously and `validateProcessBody` runs live. Emitting
`data.amount > ` would therefore put a parse error in the `IssueList` on every
keystroke. The cost is that a row the author never finishes is gone after
navigating away.

## Risks / Trade-offs

- Normalisation surprises an author reading the versions diff. A guard reads
  `data.booking_status == 'failed'` today. After any builder edit on that path
  it becomes `== "failed"`. → Accepted. One canonical literal form is worth more
  than the quote style. The write-only-on-edit rule keeps it from happening by
  accident.
- A raw row holds a text field. An analyst who meets one is back to CEL there.
  → Accepted, and better than the alternative. That alternative loses the whole
  guard to the text input over one macro.
- A flat list cannot express `a && (b || c)`. Such a guard opens as one raw row
  beside the rest. An analyst can read it. An analyst cannot restructure it. →
  Revisit when a real process needs it. The read-back path keeps that upgrade
  cheap.
- The three example processes use single quotes. Their text moves on the first
  builder edit. → The round-trip test names both normalisations. A third one
  therefore cannot slip in unnoticed.

## Migration Plan

Nothing to migrate. The change writes no schema, no table, no column and no
event kind. It writes `Expression.src` at two sites that already hold one.
`definitionHash` therefore moves for no existing body. No published version
changes, and no pinned instance rehydrates differently.

An existing draft opens in the builder on the next load. Read-back is by parse,
and it needs nothing the draft does not already carry. A draft holding a
condition the builder cannot represent opens as a raw row. That is the designed
path, not a migration case.

Deployment is one build of `packages/web` plus the engine's two added exports.
Both exports are additive, so an older `packages/web` bundle runs against the
new engine unchanged.

Rollback is reverting the two call sites to `ExpressionInput`, which this change
leaves untouched for that reason. A condition a builder wrote is ordinary CEL,
so it keeps working in the text input. The only trace a rollback leaves is the
quote style of any literal the builder normalised, and that parses identically.

## Open Questions

- Grouping, either one level or a full tree. Deferred with no lock-in.
- Ordering comparisons on `date` and `datetime`. They are correct as ISO-string
  comparisons. But CEL has no `now()`. Only a comparison against a fixed
  calendar date remains. One row in the operator table when a process asks.
- A studio route resolving a `dataSource`-bound field's options. It would turn
  that value editor from free text into a picker.
- The role question stage 27a raised stays open. The studio area sits behind
  `system:developer`, which also reaches migration planning. A business analyst
  authoring a condition is the actor that role was not shaped for.
